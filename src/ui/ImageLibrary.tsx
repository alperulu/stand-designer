import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { processImageFile, type ProcessedImage } from '../model/image';
import type { ImageAsset, StandDesign } from '../model/types';
import { beginImageDrag } from '../scene/ImageDrop';
import { useEditor } from '../state/store';

/** Yükleme seçicisinde gösterilen türler (RFP K: JPG/PNG). */
export const UPLOAD_ACCEPT = 'image/png,image/jpeg';

/** Her görselin kaç çerçeve/elemanda kullanıldığı. */
export function imageUsage(design: Pick<StandDesign, 'graphics' | 'elements'>): Map<string, number> {
  const usage = new Map<string, number>();
  const bump = (id: string | undefined) => {
    if (id) usage.set(id, (usage.get(id) ?? 0) + 1);
  };
  for (const g of design.graphics) bump(g.imageId);
  for (const e of design.elements) bump(e.front.imageId);
  return usage;
}

/**
 * Dosyaları işleyip görsel kütüphanesine tek adımda ekler. Hatalı dosyalar atlanır, hataları dosya adıyla
 * `errors` içinde tutulur. Eklenen görsellerin id'lerini döner.
 */
export function useImageUpload() {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const upload = async (files: File[]): Promise<string[]> => {
    if (!files.length) return [];
    setBusy(true);
    setErrors([]);
    try {
      const results = await Promise.allSettled(files.map((f) => processImageFile(f)));
      const ok: ProcessedImage[] = [];
      const errs: string[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') ok.push(r.value);
        else errs.push(`${files[i].name}: ${r.reason instanceof Error ? r.reason.message : 'Görsel yüklenemedi.'}`);
      });
      setErrors(errs);
      if (!ok.length) return [];
      return useEditor
        .getState()
        .addImages(ok.map(({ name, src, width, height }) => ({ name, src, width, height })));
    } finally {
      setBusy(false);
    }
  };

  return { busy, errors, upload, clearErrors: () => setErrors([]) };
}

/** Gizli dosya girişi + "Görsel yükle" düğmesi. */
export function UploadButton({
  label,
  busy,
  multiple = false,
  className = 'upload-button',
  onFiles,
}: {
  label: string;
  busy: boolean;
  multiple?: boolean;
  className?: string;
  onFiles: (files: File[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // aynı dosya tekrar seçilebilsin
    if (files.length) onFiles(files);
  };
  return (
    <>
      <input ref={fileRef} type="file" accept={UPLOAD_ACCEPT} multiple={multiple} hidden onChange={onChange} />
      <button
        type="button"
        className={className}
        disabled={busy}
        aria-busy={busy}
        title="JPG veya PNG"
        onClick={() => fileRef.current?.click()}
      >
        {busy ? (
          <>
            <span className="spinner small" aria-hidden="true" />
            İşleniyor…
          </>
        ) : (
          label
        )}
      </button>
    </>
  );
}

export function UploadErrors({ errors, onClose }: { errors: string[]; onClose?: () => void }) {
  if (!errors.length) return null;
  return (
    <div className="field-error upload-errors" role="alert">
      <ul>
        {errors.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
      {onClose && (
        <button type="button" className="toast-close" aria-label="Kapat" onClick={onClose}>
          ×
        </button>
      )}
    </div>
  );
}

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

function ImageCard({
  image,
  uses,
  targetCount,
  assigned,
  onAssign,
  onDelete,
}: {
  image: ImageAsset;
  uses: number;
  /** Tıklamayla görselin atanacağı seçili çerçeve/eleman sayısı. */
  targetCount: number;
  /** Seçili hedeflerin hepsinde bu görsel var. */
  assigned: boolean;
  onAssign: () => void;
  onDelete: () => void;
}) {
  const title =
    targetCount > 0
      ? `${image.name} — tıkla: seçili ${targetCount} alana uygula, ya da sahnedeki çerçeveye sürükle`
      : `${image.name} — sahnedeki çerçeveye sürükle`;
  return (
    <div className={`image-card${assigned ? ' active' : ''}${targetCount > 0 ? ' assignable' : ''}`}>
      <button
        type="button"
        className="image-thumb"
        title={title}
        aria-label={title}
        aria-pressed={targetCount > 0 ? assigned : undefined}
        draggable
        onDragStart={(e) => beginImageDrag(e.dataTransfer, image.id)}
        onClick={() => {
          if (targetCount > 0) onAssign();
        }}
      >
        <img src={image.src} alt="" draggable={false} />
        {uses > 0 && (
          <span className="usage-badge" title={`${uses} alanda kullanılıyor`}>
            {uses}
          </span>
        )}
      </button>
      <button type="button" className="image-delete" title="Görseli kütüphaneden sil" aria-label={`${image.name} sil`} onClick={onDelete}>
        ×
      </button>
      <span className="image-name" title={image.name}>
        {image.name}
      </span>
      <span className="image-size">
        {image.width}×{image.height} px
      </span>
    </div>
  );
}

/** Görsel kütüphanesi: yükle, küçük resimler, sürükle → çerçeve; tıkla → seçili çerçeve/elemanlara uygula. */
export function ImageLibrary() {
  const images = useEditor((s) => s.design.images);
  const graphics = useEditor((s) => s.design.graphics);
  const elements = useEditor((s) => s.design.elements);
  const selection = useEditor((s) => s.selection);
  const { busy, errors, upload, clearErrors } = useImageUpload();
  const [dropping, setDropping] = useState(false);

  const usage = useMemo(() => imageUsage({ graphics, elements }), [graphics, elements]);

  const sel = new Set(selection);
  const frameTargets = graphics.filter((g) => sel.has(g.id));
  const elementTargets = elements.filter((e) => sel.has(e.id));
  const targetCount = frameTargets.length + elementTargets.length;
  const targetImages = [...frameTargets.map((g) => g.imageId), ...elementTargets.map((e) => e.front.imageId)];

  const assign = (imageId: string) => {
    const s = useEditor.getState();
    if (frameTargets.length) s.setFrameImage(frameTargets.map((g) => g.id), imageId);
    if (elementTargets.length) s.setElementImage(elementTargets.map((e) => e.id), imageId);
  };

  const remove = (image: ImageAsset) => {
    const n = usage.get(image.id) ?? 0;
    if (n > 0 && !window.confirm(`Bu görsel ${n} alanda kullanılıyor. Silinsin mi?`)) return;
    useEditor.getState().removeImage(image.id);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropping(true);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    setDropping(false);
    if (!hasFiles(e)) return;
    e.preventDefault();
    void upload(Array.from(e.dataTransfer.files));
  };

  return (
    <div
      className={`image-library${dropping ? ' dropping' : ''}`}
      role="group"
      aria-label="Görseller"
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={onDrop}
    >
      <div className="image-library-head">
        <h2 className="panel-title">Görseller</h2>
        {images.length > 0 && <span className="image-count">{images.length}</span>}
      </div>
      <UploadButton label="Görsel yükle" busy={busy} multiple onFiles={(files) => void upload(files)} />
      <UploadErrors errors={errors} onClose={clearErrors} />
      {images.length === 0 ? (
        <p className="library-hint">JPG/PNG yükleyin, sonra sahnedeki çerçeveye sürükleyin.</p>
      ) : (
        <>
          <div className="image-grid">
            {images.map((img) => (
              <ImageCard
                key={img.id}
                image={img}
                uses={usage.get(img.id) ?? 0}
                targetCount={targetCount}
                assigned={targetCount > 0 && targetImages.every((id) => id === img.id)}
                onAssign={() => assign(img.id)}
                onDelete={() => remove(img)}
              />
            ))}
          </div>
          <p className="library-hint">
            {targetCount > 0
              ? `Görsele tıkla: seçili ${targetCount} alana uygula.`
              : 'Görseli sahnedeki çerçeveye ya da lightbox/desk ön yüzüne sürükleyin.'}
          </p>
        </>
      )}
    </div>
  );
}
