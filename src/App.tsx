import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { BACKGROUND_LABELS, CaptureBridge, EXPORT_SIZES, exportFileName, type CaptureFn } from './export/capture';
import './export/export.css';
import { useClearSelectionOnMiss } from './scene/SelectionLayer';
import { StandScene } from './scene/StandScene';
import { readAutosave, startAutosave } from './state/autosave';
import { useEditor, type ExportFormat } from './state/store';
import { EditorShell } from './ui/EditorShell';
import { ExportFrame } from './ui/ExportFrame';
import { LoadingOverlay } from './ui/LoadingOverlay';

const SCREEN_DPR: [number, number] = [1, 2];

export function App() {
  const design = useEditor((s) => s.design);
  const showGrid = useEditor((s) => s.showGrid);
  // Canvas her yeniden çizimde dpr prop'unu yeniden uygular; yakalama sırasında 1'de kalmalı (yoksa retina
  // ekranda tuval hedefin 2 katına çıkar).
  const capturing = useEditor((s) => s.capture !== null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    url: string;
    name: string;
    label: string;
    format: ExportFormat;
    transparent: boolean;
  } | null>(null);
  const captureRef = useRef<CaptureFn | null>(null);
  const registerCapture = useCallback((fn: CaptureFn) => (captureRef.current = fn), []);
  const clearSelectionOnMiss = useClearSelectionOnMiss();

  // Açılışta son otomatik kaydı yükle, sonra değişiklikleri kaydetmeye başla (FR-11.1).
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    readAutosave().then((saved) => {
      if (cancelled) return;
      if (saved) useEditor.getState().loadDesign(saved);
      stop = startAutosave();
      setReady(true);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  const takeImage = async () => {
    if (!captureRef.current) return;
    const { exportSizeIndex, exportFormat: format, exportBackground: background } = useEditor.getState();
    const size = EXPORT_SIZES[exportSizeIndex] ?? EXPORT_SIZES[0];
    setBusy(true);
    try {
      const blob = await captureRef.current({ width: size.width, height: size.height, format, background });
      if (result) URL.revokeObjectURL(result.url);
      setResult({
        url: URL.createObjectURL(blob),
        name: exportFileName(design.fascia.companyName, format),
        label: `${format.toUpperCase()} · ${size.width} × ${size.height} · ${BACKGROUND_LABELS[background]}`,
        format,
        transparent: background === 'transparent',
      });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Görsel oluşturulamadı');
    } finally {
      setBusy(false);
    }
  };

  const viewport = ready ? (
    <>
      <Canvas
        onPointerMissed={clearSelectionOnMiss}
        shadows
        dpr={capturing ? 1 : SCREEN_DPR}
        camera={{ fov: 35, near: 0.1, far: 300, position: [6, 5, 8] }}
        // alpha: şeffaf PNG export'u için (FR-10.5); ekranda arka plan rengi opak olduğundan görünüm değişmez
        gl={{ alpha: true, preserveDrawingBuffer: true, antialias: false, toneMapping: THREE.NoToneMapping }}
      >
        <StandScene design={design} showGrid={showGrid} />
        <CaptureBridge onReady={registerCapture} />
      </Canvas>
      <ExportFrame />
      {busy && <div className="overlay">Görsel hazırlanıyor…</div>}
    </>
  ) : (
    <LoadingOverlay text="Proje yükleniyor…" />
  );

  return (
    <>
      <EditorShell viewport={viewport} onExport={takeImage} exporting={busy} />

      {result && (
        <div className="modal" onClick={() => setResult(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <img
              src={result.url}
              alt="Dışa aktarılan stand görseli"
              className={result.transparent ? 'export-preview-checker' : undefined}
            />
            <div className="modal-actions">
              <span>{result.name} · {result.label}</span>
              <div className="spacer" />
              <button onClick={() => setResult(null)}>Kapat</button>
              <a className="primary button" href={result.url} download={result.name}>
                İndir ({result.format.toUpperCase()})
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
