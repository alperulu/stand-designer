import { useState } from 'react';
import { referenceOne, referenceTwo } from '../model/demo';
import type { StandDesign } from '../model/types';
import { useEditor } from '../state/store';
import { ExportControls } from './ExportControls';
import { hasUnsavedWork } from './helpers';
import { NewProjectDialog } from './NewProjectDialog';
import { openProject, saveProject, UNSAVED_CONFIRM, useProjectStatus } from './projectActions';
import { OPEN_HINT, REDO_HINT, SAVE_HINT, UNDO_HINT } from './useShortcuts';

const EXAMPLES: { id: string; label: string; build: () => StandDesign }[] = [
  { id: 'ref1', label: 'Referans 1 — beyaz panel', build: referenceOne },
  { id: 'ref2', label: 'Referans 2 — giydirme + desk', build: referenceTwo },
];

const UndoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 010 11H11" />
  </svg>
);
const RedoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 000 11H13" />
  </svg>
);

export function Toolbar({ onExport, exporting }: { onExport: () => void; exporting: boolean }) {
  const [newOpen, setNewOpen] = useState(false);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const showGrid = useEditor((s) => s.showGrid);
  const setShowGrid = useEditor((s) => s.setShowGrid);
  const showFrame = useEditor((s) => s.showExportFrame);
  const setShowFrame = useEditor((s) => s.setShowExportFrame);
  const unsaved = useEditor(hasUnsavedWork);
  const fileError = useProjectStatus((s) => s.error);
  const dismissError = useProjectStatus((s) => s.dismiss);

  const loadExample = (id: string) => {
    const example = EXAMPLES.find((x) => x.id === id);
    if (!example) return;
    const state = useEditor.getState();
    if (hasUnsavedWork(state) && !window.confirm(UNSAVED_CONFIRM)) return;
    state.loadDesign(example.build());
    state.requestView('focus');
  };

  return (
    <header className="toolbar">
      <strong className="brand">
        Stand Designer
        {unsaved && (
          <span className="unsaved-dot" role="status" title="Kaydedilmemiş değişiklikler" aria-label="Kaydedilmemiş değişiklikler" />
        )}
      </strong>
      <div className="toolbar-group">
        <button type="button" onClick={() => setNewOpen(true)} title="Yeni proje">
          Yeni
        </button>
        <button type="button" onClick={openProject} title={`Proje dosyası aç (${OPEN_HINT})`}>
          Aç…
        </button>
        <button type="button" onClick={saveProject} title={`Proje dosyasını kaydet (${SAVE_HINT})`}>
          Kaydet
        </button>
        <select
          value=""
          aria-label="Örnek tasarımlar"
          onChange={(e) => {
            loadExample(e.target.value);
            e.target.blur();
          }}
        >
          <option value="" disabled>
            Örnekler
          </option>
          {EXAMPLES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </div>
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        <button type="button" onClick={undo} disabled={!canUndo} title={`Geri al (${UNDO_HINT})`}>
          <UndoIcon />
          Geri al
        </button>
        <button type="button" onClick={redo} disabled={!canRedo} title={`Yinele (${REDO_HINT})`}>
          <RedoIcon />
          Yinele
        </button>
      </div>
      <div className="spacer" />
      <label className="check" title="Grid (G)">
        <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
        Grid
      </label>
      <label className="check" title="16:9 export alanını göster">
        <input type="checkbox" checked={showFrame} onChange={(e) => setShowFrame(e.target.checked)} />
        Kadraj
      </label>
      <ExportControls />
      <button type="button" className="primary" onClick={onExport} disabled={exporting} aria-busy={exporting}>
        {exporting ? 'Hazırlanıyor…' : 'Görsel Al'}
      </button>
      {newOpen && <NewProjectDialog onClose={() => setNewOpen(false)} />}
      {fileError && (
        <div className="toolbar-toast" role="alert">
          <span>{fileError}</span>
          <button type="button" className="ghost toast-close" onClick={dismissError} aria-label="Kapat" title="Kapat">
            ×
          </button>
        </div>
      )}
    </header>
  );
}
