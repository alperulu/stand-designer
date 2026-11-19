import { useEffect, useRef, useState } from 'react';
import { BACKGROUND_LABELS, EXPORT_SIZES } from '../export/capture';
import { useEditor, type ExportBackground, type ExportFormat } from '../state/store';
import '../export/export.css';

const FORMATS: ExportFormat[] = ['png', 'jpg'];
const BACKGROUNDS: ExportBackground[] = ['hall', 'white', 'transparent'];

/**
 * Export ayarları (FR-10.2–10.5): boyut, biçim, arka plan. (Kadraj kılavuzu araç çubuğunda, Grid'in yanında.)
 * Araç çubuğunda yer kaplamasın diye özet gösteren tek düğme + açılır panel.
 */
export function ExportControls() {
  const sizeIndex = useEditor((s) => s.exportSizeIndex);
  const format = useEditor((s) => s.exportFormat);
  const background = useEditor((s) => s.exportBackground);
  const setSizeIndex = useEditor((s) => s.setExportSizeIndex);
  const setFormat = useEditor((s) => s.setExportFormat);
  const setBackground = useEditor((s) => s.setExportBackground);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const size = EXPORT_SIZES[sizeIndex] ?? EXPORT_SIZES[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && e.target instanceof Node && !root.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const summary = `${size.short} · ${format.toUpperCase()}${background === 'hall' ? '' : ` · ${background === 'white' ? 'Beyaz' : 'Şeffaf'}`}`;

  return (
    <div className="export-controls" ref={root}>
      <button
        type="button"
        className="export-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Export ayarları"
        onClick={() => setOpen((o) => !o)}
      >
        {summary}
        <span className="export-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="export-popover" role="dialog" aria-label="Export ayarları">
          <label className="export-row">
            <span className="export-row-label">Boyut</span>
            <select value={sizeIndex} onChange={(e) => setSizeIndex(Number(e.target.value))}>
              {EXPORT_SIZES.map((s, i) => (
                <option key={s.label} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="export-row">
            <span className="export-row-label">Biçim</span>
            <div className="segmented block" role="group" aria-label="Biçim">
              {FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={f === format ? 'active' : undefined}
                  aria-pressed={f === format}
                  onClick={() => setFormat(f)}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <label className="export-row">
            <span className="export-row-label">Arka plan</span>
            <select
              value={background}
              onChange={(e) => {
                const b = BACKGROUNDS.find((x) => x === e.target.value);
                if (b) setBackground(b);
              }}
            >
              {BACKGROUNDS.map((b) => (
                <option key={b} value={b}>
                  {BACKGROUND_LABELS[b]}
                </option>
              ))}
            </select>
          </label>
          {format === 'jpg' && <p className="export-hint">Şeffaf arka plan yalnızca PNG'de.</p>}
        </div>
      )}
    </div>
  );
}
