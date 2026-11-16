import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { MAX_SCENE, MIN_SCENE, graphicHeight } from '../model/geometry';
import { ITEM_LABELS, normDeg, placementValid } from '../model/placement';
import type { Graphic, GraphicFit, ImageAsset, StandElement, StandElementKind, WallHeight, WallPanel } from '../model/types';
import { fasciaId, imageById, useEditor, validateGraphicPanels, type DoorProps, type FaceTarget, type Tool } from '../state/store';
import { clampSceneInput } from './helpers';
import { UploadButton, UploadErrors, useImageUpload } from './ImageLibrary';
import { FRONT_AREAS, isElement, isFloorItem, itemsByIds, rotationUpdates, spotDirection, type Item, type SpotDirection } from './items';
import { SceneOutline } from './SceneOutline';
import { MOD } from './useShortcuts';

const OUTSIDE_ERROR = 'Mevcut elemanlar yeni alanın dışında kalıyor.';
const BLOCKED_ERROR = 'Bu konumda başka bir eleman veya duvar var.';

const CAMERA_LINES = ['Sağ tık sürükle: kamerayı döndür.', 'Orta tık: kaydır.'];

const TOOL_HELP: Record<Tool, { title: string; lines: string[] }> = {
  select: {
    title: 'Seç',
    lines: [
      'Sol tık sürükle: döndür, sağ tık: kaydır, tekerlek: yakınlaştır.',
      'Ekipmanı sürükle: taşı. Halkayı sürükle: döndür (15°).',
    ],
  },
  floor: {
    title: 'Zemin',
    lines: [
      'Kareye tıkla: halı ekle/kaldır.',
      'Sürükle: dikdörtgen alan.',
      'Sağ tık sürükle: kamerayı döndür.',
      'Orta tık: kaydır.',
    ],
  },
  erase: {
    title: 'Silgi',
    lines: [
      'Kareye tıkla: halıyı kaldır.',
      'Sürükle: dikdörtgen alanı temizle.',
      ...CAMERA_LINES,
    ],
  },
  wall: {
    title: 'Duvar',
    lines: [
      'Kenar çizgisinde sürükle: duvar çiz (1 m paneller).',
      'Dolu kenarlar kırmızı görünür, atlanır.',
      ...CAMERA_LINES,
    ],
  },
  door: {
    title: 'Kapı',
    lines: [
      'Kenara tıkla: kapılı panel ekle.',
      'Düz duvara tıkla: kapılıya çevir; kapılıya tıkla: düze çevir.',
      ...CAMERA_LINES,
    ],
  },
  fascia: {
    title: 'Pano',
    lines: [
      'Kenara tıkla: alın panosu ekle/kaldır.',
      'Kenar çizgisinde sürükle: birden çok kenar.',
      'Duvarlı kenarlara pano konmaz.',
      ...CAMERA_LINES,
    ],
  },
  graphic: {
    title: 'Giydirme',
    lines: [
      'Duvar yüzeyinde panelden panele sürükle: çok panelli çerçeve.',
      'Tek panele tıkla: 1 panellik çerçeve. Tıkladığın yüze yerleşir.',
      'Mevcut çerçevelerin üstünden çiz ya da Shift ile seçip birleştir: görsel korunur.',
      'Görseli kütüphaneden çerçeveye sürükle.',
      ...CAMERA_LINES,
    ],
  },
};

type SegOption<T> = { value: T; label: string };

/** Tek seçimli düğme grubu; value null ise (karışık seçim) hiçbiri etkin görünmez. */
function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SegOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented block" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={value === o.value ? 'active' : undefined}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Tüm öğelerde aynıysa o değer, değilse (veya liste boşsa) null. */
function common<T>(items: T[]): T | null {
  if (!items.length) return null;
  return items.every((v) => v === items[0]) ? items[0] : null;
}

const HEIGHT_OPTIONS: SegOption<WallHeight>[] = [
  { value: 2, label: '2 m' },
  { value: 2.5, label: '2.5 m' },
];
const TYPE_OPTIONS: SegOption<WallPanel['type']>[] = [
  { value: 'solid', label: 'Düz' },
  { value: 'door', label: 'Kapılı' },
];
const HINGE_OPTIONS: SegOption<DoorProps['hinge']>[] = [
  { value: 'left', label: 'Sol' },
  { value: 'right', label: 'Sağ' },
];
const SWING_OPTIONS: SegOption<DoorProps['swing']>[] = [
  { value: 'in', label: 'İçe' },
  { value: 'out', label: 'Dışa' },
];
const COLOR_TARGET_OPTIONS: SegOption<FaceTarget>[] = [
  { value: 'inner', label: 'İç' },
  { value: 'outer', label: 'Dış' },
  { value: 'both', label: 'Her ikisi' },
];
type GraphicFace = Graphic['face'];
const GRAPHIC_FACE_OPTIONS: SegOption<GraphicFace>[] = [
  { value: 'inner', label: 'İç yüz' },
  { value: 'outer', label: 'Dış yüz' },
];
const FIT_OPTIONS: SegOption<GraphicFit>[] = [
  { value: 'cover', label: 'Doldur' },
  { value: 'contain', label: 'Sığdır' },
];
const SPOT_DIR_OPTIONS: SegOption<SpotDirection>[] = [
  { value: 'in', label: 'İçe' },
  { value: 'out', label: 'Dışa' },
];
type LightState = 'on' | 'off';
const LIGHT_OPTIONS: SegOption<LightState>[] = [
  { value: 'on', label: 'Işıklı' },
  { value: 'off', label: 'Işıksız' },
];

/** Hazır fuar renkleri (FR-5.1); ilki varsayılan panel beyazı. */
const PALETTE: { hex: string; name: string }[] = [
  { hex: '#f5f5f2', name: 'Beyaz' },
  { hex: '#d3d5d7', name: 'Açık gri' },
  { hex: '#3a3d40', name: 'Antrasit' },
  { hex: '#1b1c1e', name: 'Siyah' },
  { hex: '#1f2d4d', name: 'Lacivert' },
  { hex: '#1e6bb8', name: 'Mavi' },
  { hex: '#c62a2f', name: 'Kırmızı' },
  { hex: '#e5762a', name: 'Turuncu' },
  { hex: '#2f8a57', name: 'Yeşil' },
  { hex: '#f1c232', name: 'Sarı' },
];

/** Önerilen baskı çözünürlüğü için basit kural: metre başına 1000 px. */
const PX_PER_M = 1000;
/** Görsel ve alan oranı bu kadardan fazla farklıysa kullanıcı uyarılır. */
const RATIO_TOLERANCE = 0.1;

const fmtM = (n: number) => String(Math.round(n * 100) / 100);
const FACE_NAMES: Record<GraphicFace, string> = { inner: 'iç yüz', outer: 'dış yüz' };
const FACE_LABELS: Record<GraphicFace, string> = { inner: 'İç yüz', outer: 'Dış yüz' };

/** Hedef yüz(ler)deki renkler, küçük harfe çevrilmiş. */
function faceColors(panels: WallPanel[], target: FaceTarget): string[] {
  return panels
    .flatMap((w) =>
      target === 'inner' ? [w.faces.inner.color] : target === 'outer' ? [w.faces.outer.color] : [w.faces.inner.color, w.faces.outer.color],
    )
    .map((c) => c.toLowerCase());
}

function PanelColorControls({ panels }: { panels: WallPanel[] }) {
  const setPanelColor = useEditor((s) => s.setPanelColor);
  const [target, setTarget] = useState<FaceTarget>('both');
  const ids = panels.map((w) => w.id);
  const idsKey = ids.join(',');
  const colors = faceColors(panels, target);
  const current = common(colors);
  const fallback = colors[0] ?? PALETTE[0].hex;
  const [draft, setDraft] = useState(current ?? fallback);
  const customRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(current ?? fallback), [current, fallback]);

  // Renk seçici sürüklenirken her adımda geçmişe kayıt düşmesin: yalnızca yerel `change` (seçici kapanınca) uygulanır.
  useEffect(() => {
    const el = customRef.current;
    if (!el) return;
    const onCommit = () => useEditor.getState().setPanelColor(idsKey.split(','), target, el.value);
    el.addEventListener('change', onCommit);
    return () => el.removeEventListener('change', onCommit);
  }, [idsKey, target]);

  return (
    <div className="subsection">
      <h4 className="subsection-title">Renk</h4>
      <Segmented label="Renk uygulanacak yüz" options={COLOR_TARGET_OPTIONS} value={target} onChange={setTarget} />
      <div className="swatch-grid" role="group" aria-label="Hazır renkler">
        {PALETTE.map((c) => (
          <button
            key={c.hex}
            type="button"
            className={`color-swatch${current === c.hex ? ' active' : ''}`}
            style={{ background: c.hex }}
            title={`${c.name} ${c.hex}`}
            aria-label={c.name}
            aria-pressed={current === c.hex}
            onClick={() => setPanelColor(ids, target, c.hex)}
          />
        ))}
      </div>
      <label className="color-custom">
        <input
          ref={customRef}
          type="color"
          value={draft}
          aria-label="Özel renk (HEX)"
          onChange={(e) => setDraft(e.target.value)}
        />
        <span>Özel renk</span>
        <code className="color-value">{current ?? 'Karışık'}</code>
      </label>
    </div>
  );
}

/** Atanmış görsel (ya da boş durum), yükle/değiştir, yerleşim, oran uyarısı, kaldır. Çerçeve ve eleman ön yüzü ortak. */
function ImageSlot({
  image,
  mixed,
  hasAny,
  emptyText,
  fit,
  areaRatio,
  removeLabel,
  onAssign,
  onFit,
  onRemove,
}: {
  /** Tüm hedeflerde ortak görsel; yoksa undefined. */
  image: ImageAsset | undefined;
  /** Hedeflerde farklı görseller var. */
  mixed: boolean;
  /** En az bir hedefte görsel var. */
  hasAny: boolean;
  emptyText: string;
  fit: GraphicFit | null;
  /** Alanın genişlik/yükseklik oranı; bilinmiyorsa (karışık seçim) null → oran denetimi yapılmaz. */
  areaRatio: number | null;
  removeLabel: string;
  onAssign: (imageId: string) => void;
  onFit: (fit: GraphicFit) => void;
  onRemove: () => void;
}) {
  const { busy, errors, upload, clearErrors } = useImageUpload();
  const imgRatio = image && image.height > 0 ? image.width / image.height : null;
  const mismatch = imgRatio !== null && areaRatio !== null && Math.abs(imgRatio / areaRatio - 1) > RATIO_TOLERANCE;
  const ratioText =
    imgRatio !== null && areaRatio !== null ? `Görsel oranı ${imgRatio.toFixed(2)}, alan oranı ${areaRatio.toFixed(2)}` : '';

  // Görsel kütüphaneye eklenir ve yükleme anındaki hedeflere atanır.
  const onFiles = async (files: File[]) => {
    const [id] = await upload(files.slice(0, 1));
    if (id) onAssign(id);
  };

  return (
    <div className="graphic-item">
      {image ? (
        <div className="graphic-head">
          <img className="graphic-thumb" src={image.src} alt="" />
          <span className="graphic-text">
            <span className="graphic-label" title={image.name}>
              {image.name}
            </span>
            <span className="graphic-meta">
              {image.width}×{image.height} px
            </span>
          </span>
        </div>
      ) : (
        <div className="slot-empty">{mixed ? 'Farklı görseller' : emptyText}</div>
      )}
      <UploadButton
        label={hasAny ? 'Görseli değiştir…' : 'Görsel yükle…'}
        busy={busy}
        onFiles={(files) => void onFiles(files)}
      />
      <UploadErrors errors={errors} onClose={clearErrors} />
      <div className="seg-field slot-fit">
        <span>Yerleşim</span>
        <Segmented label="Görsel yerleşimi" options={FIT_OPTIONS} value={fit} onChange={onFit} />
      </div>
      {ratioText &&
        (mismatch ? (
          <p className="field-note">{ratioText} — Doldur kırpar, Sığdır boşluk bırakır.</p>
        ) : (
          <p className="field-hint">{ratioText} — uyumlu.</p>
        ))}
      <button type="button" className="danger upload-button" disabled={!hasAny} onClick={onRemove}>
        {removeLabel}
      </button>
    </div>
  );
}

/** Seçimdeki ortak görsel id'si: hepsi aynıysa o (boşsa undefined), farklıysa null. */
function commonImage(images: ImageAsset[], ids: (string | undefined)[]) {
  const id = common(ids);
  return {
    image: id ? images.find((i) => i.id === id) : undefined,
    mixed: ids.length > 0 && id === null,
    hasAny: ids.some(Boolean),
  };
}

/** Seçili giydirme çerçevesi/çerçeveleri. */
function FrameSection() {
  const selection = useEditor((s) => s.selection);
  const graphics = useEditor((s) => s.design.graphics);
  const images = useEditor((s) => s.design.images);
  const wallHeight = useEditor((s) => s.design.wallHeight);
  const setFrameImage = useEditor((s) => s.setFrameImage);
  const setGraphicFit = useEditor((s) => s.setGraphicFit);
  const select = useEditor((s) => s.select);
  const removeEntities = useEditor((s) => s.removeEntities);
  const mergeFrames = useEditor((s) => s.mergeFrames);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const selectionKey = selection.join(',');
  useEffect(() => setMergeError(null), [selectionKey]);

  const frames = useMemo(() => {
    const ids = new Set(selection);
    return graphics.filter((g) => ids.has(g.id));
  }, [selection, graphics]);

  if (!frames.length) return null;

  const ids = frames.map((g) => g.id);
  const h = graphicHeight(wallHeight);
  const width = common(frames.map((g) => g.panelIds.length));
  const face = common(frames.map((g) => g.face));
  const fit = common(frames.map((g) => g.fit));
  const { image, mixed, hasAny } = commonImage(
    images,
    frames.map((g) => g.imageId),
  );
  const single = frames.length === 1;
  const sizeText = width !== null ? `${width} m × ${fmtM(h)} m` : 'Farklı genişlikler';

  return (
    <section className="panel-section">
      <h3 className="section-title">Seçim · {single ? 'Giydirme çerçevesi' : `${frames.length} çerçeve`}</h3>
      <p className="field-hint first">
        <span className="hint-line frame-size">
          {sizeText}
          {face ? ` · ${FACE_NAMES[face]}` : ''}
        </span>
        {width !== null && (
          <span className="hint-line">
            Önerilen: {Math.round(width * PX_PER_M)} × {Math.round(h * PX_PER_M)} px
          </span>
        )}
      </p>
      <ImageSlot
        key={ids.join(',')}
        image={image}
        mixed={mixed}
        hasAny={hasAny}
        emptyText="Boş — kütüphaneden görsel sürükleyin"
        fit={fit}
        areaRatio={width !== null ? width / h : null}
        removeLabel="Görseli kaldır"
        onAssign={(id) => setFrameImage(ids, id)}
        onFit={(f) => frames.forEach((g) => setGraphicFit(g.id, f))}
        onRemove={() => setFrameImage(ids, undefined)}
      />
      <p className="field-hint">Boş çerçeve editörde görünür, dışa aktarımda gizlenir.</p>
      {!single && (
        <>
          <button
            type="button"
            className="block-button"
            title="Yan yana çerçeveleri tek çerçevede birleştir; ilk görsel korunur"
            onClick={() => {
              const r = mergeFrames(ids);
              if (!r.ok) setMergeError(r.reason);
            }}
          >
            <span>Çerçeveleri birleştir</span>
          </button>
          {mergeError && (
            <p className="field-error" role="alert">
              {mergeError}
            </p>
          )}
        </>
      )}
      <button
        type="button"
        className="block-button"
        title="Çerçevenin panellerini seç"
        onClick={() => select([...new Set(frames.flatMap((g) => g.panelIds))])}
      >
        <span>Panelleri seç</span>
      </button>
      <button
        type="button"
        className="danger block-button"
        title={`Seçili ${single ? 'çerçeveyi' : 'çerçeveleri'} sil (Del)`}
        onClick={() => removeEntities(ids)}
      >
        <span>{single ? 'Çerçeveyi sil' : 'Çerçeveleri sil'}</span>
        <kbd>Del</kbd>
      </button>
    </section>
  );
}

/** Seçili duvar panellerine giydirme çerçevesi oluşturma + panelleri kapsayan mevcut çerçeveler. */
function PanelFrameControls({ panels }: { panels: WallPanel[] }) {
  const design = useEditor((s) => s.design);
  const addFrame = useEditor((s) => s.addFrame);
  const select = useEditor((s) => s.select);
  const [face, setFace] = useState<GraphicFace>('inner');
  const [error, setError] = useState<string | null>(null);
  const ids = panels.map((w) => w.id);
  const idsKey = ids.join(',');

  useEffect(() => setError(null), [idsKey, face]);

  const check = validateGraphicPanels(design, ids);
  const h = graphicHeight(design.wallHeight);
  const selected = new Set(ids);
  const covering = design.graphics.filter((g) => g.panelIds.some((id) => selected.has(id)));
  const replaces = covering.some((g) => g.face === face);

  const create = () => {
    const r = addFrame(ids, face);
    if (!r.ok) setError(r.reason);
  };

  return (
    <div className="subsection">
      <h4 className="subsection-title">Giydirme çerçevesi</h4>
      <Segmented label="Çerçeve yüzü" options={GRAPHIC_FACE_OPTIONS} value={face} onChange={setFace} />
      {check.ok ? (
        <p className="field-hint">
          Çerçeve: {check.panelIds.length} m × {fmtM(h)} m
          <br />
          Önerilen: {Math.round(check.panelIds.length * PX_PER_M)} × {Math.round(h * PX_PER_M)} px
        </p>
      ) : (
        <p className="field-note">{check.reason}</p>
      )}
      <button type="button" className="upload-button" disabled={!check.ok} onClick={create}>
        Seçili panellere çerçeve oluştur
      </button>
      {check.ok && replaces && (
        <p className="field-hint">Bu yüzdeki çakışan çerçeveler yenisiyle birleşir; görseli korunur.</p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {covering.length > 0 && (
        <div className="frame-rows" role="list" aria-label="Paneldeki çerçeveler">
          {covering.map((g) => {
            const img = imageById(design, g.imageId);
            return (
              <button
                key={g.id}
                type="button"
                role="listitem"
                className="frame-row"
                title="Çerçeveyi seç"
                onClick={() => select([g.id])}
              >
                {img ? (
                  <img className="graphic-thumb" src={img.src} alt="" />
                ) : (
                  <span className="graphic-thumb empty" aria-hidden="true" />
                )}
                <span className="graphic-text">
                  <span className="graphic-label">
                    {FACE_LABELS[g.face]} · {g.panelIds.length} m
                  </span>
                  <span className="graphic-meta" title={img?.name}>
                    {img ? img.name : 'Boş'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SelectionSection() {
  const selection = useEditor((s) => s.selection);
  const walls = useEditor((s) => s.design.walls);
  const graphics = useEditor((s) => s.design.graphics);
  const setWallType = useEditor((s) => s.setWallType);
  const setDoor = useEditor((s) => s.setDoor);
  const removeEntities = useEditor((s) => s.removeEntities);

  // Duvar panelleri; ekipmanlar ItemSection'da.
  const panels = useMemo(() => {
    const ids = new Set(selection);
    return walls.filter((w) => ids.has(w.id));
  }, [selection, walls]);

  if (!panels.length) return null;

  const ids = panels.map((w) => w.id);
  const type = common(panels.map((w) => w.type));
  const doors = type === 'door' ? panels.map((w) => w.door) : [];
  const hinge = common(doors.map((d) => d?.hinge ?? 'left'));
  const swing = common(doors.map((d) => d?.swing ?? 'in'));

  // FR-5.8: grafikli panel kapılıya çevrilmeden önce kullanıcı uyarılır.
  const changeType = (t: WallPanel['type']) => {
    if (t === 'door') {
      const sel = new Set(ids);
      const hasGraphic = graphics.some((g) => g.panelIds.some((id) => sel.has(id)));
      if (hasGraphic && !window.confirm('Seçili panellerde giydirme çerçevesi var. Kapılı panele giydirme uygulanamaz; çerçeve bu panellerden kaldırılacak. Devam edilsin mi?'))
        return;
    }
    setWallType(ids, t);
  };

  return (
    <section className="panel-section">
      <h3 className="section-title">Seçim · {panels.length} panel seçili</h3>
      <div className="seg-field">
        <span>Tür</span>
        <Segmented label="Panel türü" options={TYPE_OPTIONS} value={type} onChange={changeType} />
      </div>
      {type === 'door' && (
        <>
          <div className="seg-field">
            <span>Menteşe</span>
            <Segmented label="Menteşe" options={HINGE_OPTIONS} value={hinge} onChange={(h) => setDoor(ids, { hinge: h })} />
          </div>
          <div className="seg-field">
            <span>Açılış</span>
            <Segmented label="Açılış yönü" options={SWING_OPTIONS} value={swing} onChange={(v) => setDoor(ids, { swing: v })} />
          </div>
        </>
      )}
      <PanelColorControls panels={panels} />
      <PanelFrameControls panels={panels} />
      <button type="button" className="danger block-button" title="Seçili panelleri sil (Del)" onClick={() => removeEntities(ids)}>
        <span>Sil</span>
        <kbd>Del</kbd>
      </button>
    </section>
  );
}

/** Metin girişini sayıya çevirir; boş/geçersizse null. */
function parseNum(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Zemin ekipmanı konumu / açısı (FR-8.1a–b). Tek seçimde X/Z/açı girişleri, her durumda ±90° düğmeleri. */
function TransformControls({ items }: { items: Item[] }) {
  const setTransforms = useEditor((s) => s.setTransforms);
  const single = items.length === 1 ? items[0] : null;
  const [x, setX] = useState('');
  const [z, setZ] = useState('');
  const [rot, setRot] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sx = single?.position.x;
  const sz = single?.position.z;
  const sr = single?.rotationDeg;
  // Dış değişiklikler (sürükleme, geri al, R) girişlere yansısın.
  useEffect(() => {
    if (sx === undefined || sz === undefined || sr === undefined) return;
    setX(fmtM(sx));
    setZ(fmtM(sz));
    setRot(String(sr));
    setError(null);
  }, [sx, sz, sr]);

  const reset = () => {
    if (!single) return;
    setX(fmtM(single.position.x));
    setZ(fmtM(single.position.z));
    setRot(String(single.rotationDeg));
    setError(null);
  };

  const apply = () => {
    if (!single) return;
    const { design } = useEditor.getState();
    const cur = itemsByIds(design, [single.id])[0];
    if (!cur) return;
    // Değiştirilmemiş alan gösterimdeki yuvarlamadan etkilenmesin diye olduğu gibi kalır.
    const pick = (draft: string, value: number, fmt: (n: number) => string, conv: (n: number) => number) => {
      if (draft === fmt(value)) return value;
      const n = parseNum(draft);
      return n === null ? value : conv(n);
    };
    const position = {
      x: pick(x, cur.position.x, fmtM, round1),
      z: pick(z, cur.position.z, fmtM, round1),
    };
    const rotationDeg = pick(rot, cur.rotationDeg, String, normDeg);
    if (position.x === cur.position.x && position.z === cur.position.z && rotationDeg === cur.rotationDeg) {
      reset();
      return;
    }
    if (!placementValid(design, cur.kind, position, rotationDeg, new Set([cur.id]))) {
      setError(BLOCKED_ERROR);
      return;
    }
    setError(null);
    setTransforms([{ id: cur.id, position, rotationDeg }]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      apply();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      reset();
    }
  };

  const rotateBy = (delta: number) => {
    const { design } = useEditor.getState();
    const current = itemsByIds(design, items.map((i) => i.id));
    const updates = rotationUpdates(design, current, delta);
    if (updates.length) setTransforms(updates);
    setError(updates.length < current.length ? BLOCKED_ERROR : null);
  };

  const invalid = error !== null;
  return (
    <div className="item-transform">
      {single && (
        <div className="field-row">
          <label className="field">
            <span>X (m)</span>
            <input
              type="number"
              step={0.1}
              value={x}
              aria-invalid={invalid}
              onChange={(e) => setX(e.target.value)}
              onBlur={apply}
              onKeyDown={onKeyDown}
            />
          </label>
          <label className="field">
            <span>Z (m)</span>
            <input
              type="number"
              step={0.1}
              value={z}
              aria-invalid={invalid}
              onChange={(e) => setZ(e.target.value)}
              onBlur={apply}
              onKeyDown={onKeyDown}
            />
          </label>
        </div>
      )}
      <div className="field-row rotate-row">
        {single ? (
          <label className="field">
            <span>Açı (°)</span>
            <input
              type="number"
              step={15}
              value={rot}
              aria-invalid={invalid}
              onChange={(e) => setRot(e.target.value)}
              onBlur={apply}
              onKeyDown={onKeyDown}
            />
          </label>
        ) : (
          <span className="field-label">Döndür</span>
        )}
        <button type="button" title="90° sola döndür (R)" onClick={() => rotateBy(90)}>
          ↺ 90°
        </button>
        <button type="button" title="90° sağa döndür" onClick={() => rotateBy(-90)}>
          ↻ 90°
        </button>
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="field-hint">R: 90°, Shift+R: 15° döndür.</p>
      )}
    </div>
  );
}

function SpotDirectionField({ spots }: { spots: Item[] }) {
  const design = useEditor((s) => s.design);
  const setTransforms = useEditor((s) => s.setTransforms);
  const dirs = spots.map((sp) => spotDirection(design, sp));
  const value = dirs.includes(null) ? null : common(dirs);

  const change = (target: SpotDirection) => {
    const updates = spots
      .filter((_, i) => dirs[i] !== null && dirs[i] !== target)
      .map((sp) => ({ id: sp.id, rotationDeg: sp.rotationDeg + 180 }));
    if (updates.length) setTransforms(updates);
  };

  return (
    <div className="seg-field item-field">
      <span>Yön</span>
      <Segmented label="Spot yönü" options={SPOT_DIR_OPTIONS} value={value} onChange={change} />
      <p className="field-hint">Spot duvar/pano üst kenarında kayar.</p>
    </div>
  );
}

const SHORT_KIND: Record<StandElementKind, string> = { lightbox: 'Lightbox', desk: 'Desk' };

/** Lightbox/desk ön yüz görseli (kütüphaneden) ve ışık (FR-12.1–12.7). */
function ElementControls({ elements }: { elements: StandElement[] }) {
  const images = useEditor((s) => s.design.images);
  const setElementFit = useEditor((s) => s.setElementFit);
  const setElementImage = useEditor((s) => s.setElementImage);
  const setElementIlluminated = useEditor((s) => s.setElementIlluminated);
  const ids = elements.map((e) => e.id);

  const kinds = [...new Set(elements.map((e) => e.kind))];
  const kind = kinds.length === 1 ? kinds[0] : null;
  const fit = common(elements.map((e) => e.front.fit));
  const light = common(elements.map((e): LightState => (e.illuminated ? 'on' : 'off')));
  const area = kind ? FRONT_AREAS[kind] : null;
  const { image, mixed, hasAny } = commonImage(
    images,
    elements.map((e) => e.front.imageId),
  );

  return (
    <>
      <div className="subsection">
        <h4 className="subsection-title">Ön yüz görseli</h4>
        <p className="field-hint first">
          {kinds.map((k) => {
            const a = FRONT_AREAS[k];
            return (
              <span key={k} className="hint-line">
                {kinds.length > 1 ? `${SHORT_KIND[k]}: ` : 'Alan: '}
                {fmtM(a.w)} m × {fmtM(a.h)} m · Önerilen {Math.round(a.w * PX_PER_M)} × {Math.round(a.h * PX_PER_M)} px
              </span>
            );
          })}
        </p>
        <ImageSlot
          key={ids.join(',')}
          image={image}
          mixed={mixed}
          hasAny={hasAny}
          emptyText="Ön yüz boş"
          fit={fit}
          areaRatio={area ? area.w / area.h : null}
          removeLabel="Kaldır"
          onAssign={(id) => setElementImage(ids, id)}
          onFit={(f) => setElementFit(ids, f)}
          onRemove={() => setElementImage(ids, undefined)}
        />
        <p className="field-hint">Kütüphaneden görseli ön yüze sürükleyebilirsiniz.</p>
      </div>
      <div className="subsection">
        <h4 className="subsection-title">Işık</h4>
        <Segmented label="Işık" options={LIGHT_OPTIONS} value={light} onChange={(v) => setElementIlluminated(ids, v === 'on')} />
      </div>
    </>
  );
}

function ItemSection() {
  const selection = useEditor((s) => s.selection);
  const accessories = useEditor((s) => s.design.accessories);
  const elements = useEditor((s) => s.design.elements);
  const duplicateItems = useEditor((s) => s.duplicateItems);
  const removeEntities = useEditor((s) => s.removeEntities);

  const items = useMemo(() => {
    const ids = new Set(selection);
    return [...accessories, ...elements].filter((i) => ids.has(i.id));
  }, [selection, accessories, elements]);

  if (!items.length) return null;

  const ids = items.map((i) => i.id);
  const floorItems = items.filter(isFloorItem);
  const spots = items.filter((i) => i.kind === 'spot');
  const els = items.filter(isElement);
  const title = items.length === 1 ? ITEM_LABELS[items[0].kind] : `${items.length} ekipman seçili`;

  return (
    <section className="panel-section">
      <h3 className="section-title">Seçim · {title}</h3>
      {floorItems.length > 0 && <TransformControls key={floorItems.map((i) => i.id).join(',')} items={floorItems} />}
      {spots.length > 0 && <SpotDirectionField spots={spots} />}
      {els.length === items.length && <ElementControls elements={els} />}
      <button
        type="button"
        className="block-button"
        title={`Seçili ekipmanları çoğalt (${MOD}D)`}
        onClick={() => duplicateItems(ids)}
      >
        <span>Çoğalt</span>
        <kbd>{MOD}D</kbd>
      </button>
      <button type="button" className="danger block-button" title="Seçili ekipmanları sil (Del)" onClick={() => removeEntities(ids)}>
        <span>Sil</span>
        <kbd>Del</kbd>
      </button>
    </section>
  );
}

function SceneSizeSection() {
  const sceneW = useEditor((s) => s.design.scene.width);
  const sceneD = useEditor((s) => s.design.scene.depth);
  const [width, setWidth] = useState(String(sceneW));
  const [depth, setDepth] = useState(String(sceneD));
  const [error, setError] = useState<string | null>(null);

  // Dış değişiklikler (geri al, yeni proje, örnek yükleme) girişlere yansısın.
  useEffect(() => {
    setWidth(String(sceneW));
    setDepth(String(sceneD));
    setError(null);
  }, [sceneW, sceneD]);

  const apply = () => {
    const { design, setSceneSize } = useEditor.getState();
    const w = clampSceneInput(width, design.scene.width);
    const d = clampSceneInput(depth, design.scene.depth);
    const ok = setSceneSize(w, d);
    const scene = useEditor.getState().design.scene;
    setWidth(String(scene.width));
    setDepth(String(scene.depth));
    setError(ok ? null : OUTSIDE_ERROR);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      apply();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setWidth(String(sceneW));
      setDepth(String(sceneD));
      setError(null);
    }
  };

  return (
    <section className="panel-section">
      <h3 className="section-title">Sahne</h3>
      <div className="field-row">
        <label className="field">
          <span>Genişlik (m)</span>
          <input
            type="number"
            min={MIN_SCENE}
            max={MAX_SCENE}
            step={1}
            value={width}
            aria-invalid={error !== null}
            onChange={(e) => setWidth(e.target.value)}
            onBlur={apply}
            onKeyDown={onKeyDown}
          />
        </label>
        <span className="field-times">×</span>
        <label className="field">
          <span>Derinlik (m)</span>
          <input
            type="number"
            min={MIN_SCENE}
            max={MAX_SCENE}
            step={1}
            value={depth}
            aria-invalid={error !== null}
            onChange={(e) => setDepth(e.target.value)}
            onBlur={apply}
            onKeyDown={onKeyDown}
          />
        </label>
      </div>
      {error ? (
        <p className="field-error" role="alert">{error}</p>
      ) : (
        <p className="field-hint">{MIN_SCENE}–{MAX_SCENE} m arası.</p>
      )}
    </section>
  );
}

/** Sahnede ya da eleman listesinde seçilen alın panoları (seçim id'leri `fascia:` önekli). */
function FasciaSelectionSection() {
  const selection = useEditor((s) => s.selection);
  const edges = useEditor((s) => s.design.fascia.edges);
  const removeEntities = useEditor((s) => s.removeEntities);

  const ids = useMemo(() => {
    const sel = new Set(selection);
    return edges.map(fasciaId).filter((id) => sel.has(id));
  }, [selection, edges]);

  if (!ids.length) return null;

  return (
    <section className="panel-section">
      <h3 className="section-title">Seçim · {ids.length} m alın panosu</h3>
      <button type="button" className="danger block-button" title="Seçili alın panolarını sil (Del)" onClick={() => removeEntities(ids)}>
        <span>Sil</span>
        <kbd>Del</kbd>
      </button>
    </section>
  );
}

function FasciaSection() {
  const companyName = useEditor((s) => s.design.fascia.companyName);
  const edgeCount = useEditor((s) => s.design.fascia.edges.length);
  const hasCarpet = useEditor((s) => s.design.floor.cells.length > 0);
  const setCompanyName = useEditor((s) => s.setCompanyName);
  const autoFascia = useEditor((s) => s.autoFascia);
  const [draft, setDraft] = useState(companyName);

  // Dış değişiklikler (geri al, yeni proje, örnek yükleme) girişe yansısın.
  useEffect(() => setDraft(companyName), [companyName]);

  // Her tuşta değil, odak çıkınca / Enter'da uygulanır → geri al geçmişi temiz kalır.
  const commitName = () => {
    const name = draft.trim();
    setCompanyName(name);
    setDraft(name);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitName();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(companyName);
    }
  };

  return (
    <section className="panel-section">
      <h3 className="section-title">Alın panosu</h3>
      <label className="field">
        <span>Firma adı</span>
        <input
          type="text"
          value={draft}
          maxLength={60}
          placeholder="Firma adı"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={onKeyDown}
        />
      </label>
      <p className="field-hint">Tek font, siyah (K13).</p>
      <dl className="prop-list">
        <dt>Pano</dt>
        <dd>{edgeCount} kenar</dd>
      </dl>
      <div className="button-stack">
        <button
          type="button"
          disabled={!hasCarpet}
          title={hasCarpet ? 'Duvarsız tüm dış kenarlara alın panosu koy' : 'Önce zemine halı ekleyin'}
          onClick={autoFascia}
        >
          Açık kenarlara otomatik ekle
        </button>
        <button
          type="button"
          className="danger"
          disabled={edgeCount === 0}
          onClick={() => {
            const { design, removeFascia } = useEditor.getState();
            removeFascia(design.fascia.edges);
          }}
        >
          Panoları kaldır
        </button>
      </div>
    </section>
  );
}

export function PropertiesPanel() {
  const tool = useEditor((s) => s.tool);
  const wallHeight = useEditor((s) => s.design.wallHeight);
  const setWallHeight = useEditor((s) => s.setWallHeight);
  const help = TOOL_HELP[tool];

  return (
    <aside className="properties-panel" aria-label="Özellikler">
      <SceneOutline />
      <h2 className="panel-title">Özellikler</h2>
      <FrameSection />
      <SelectionSection />
      <ItemSection />
      <FasciaSelectionSection />
      <SceneSizeSection />

      <section className="panel-section">
        <h3 className="section-title">Stand</h3>
        <div className="seg-field">
          <span>Duvar yüksekliği</span>
          <Segmented label="Duvar yüksekliği" options={HEIGHT_OPTIONS} value={wallHeight} onChange={setWallHeight} />
        </div>
        <dl className="prop-list">
          <dt>Halı</dt>
          <dd>
            <span className="swatch" style={{ background: '#3a3d40' }} aria-hidden="true" />
            Antrasit
          </dd>
        </dl>
      </section>

      <FasciaSection />

      <section className="panel-section hint-section">
        <h3 className="section-title">İpucu · {help.title}</h3>
        <ul className="hint-list">
          {help.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
