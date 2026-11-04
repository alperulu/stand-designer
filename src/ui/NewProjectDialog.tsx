import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_SCENE, MIN_SCENE } from '../model/geometry';
import { useEditor } from '../state/store';
import { clampSceneInput, hasUnsavedWork } from './helpers';

const DEFAULT_SIZE = 30;

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const [width, setWidth] = useState(String(DEFAULT_SIZE));
  const [depth, setDepth] = useState(String(DEFAULT_SIZE));
  const dirty = useEditor(hasUnsavedWork);
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstInput.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const { newProject, requestView } = useEditor.getState();
    newProject(clampSceneInput(width, DEFAULT_SIZE), clampSceneInput(depth, DEFAULT_SIZE));
    requestView('perspective');
    onClose();
  };

  return (
    <div className="modal" onMouseDown={onClose}>
      <form
        className="modal-card dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="new-project-title" className="dialog-title">Yeni proje</h2>
        <p className="dialog-text">Sahne (salon) ölçüsü, {MIN_SCENE}–{MAX_SCENE} m.</p>
        <div className="field-row">
          <label className="field">
            <span>Genişlik (m)</span>
            <input
              ref={firstInput}
              type="number"
              min={MIN_SCENE}
              max={MAX_SCENE}
              step={1}
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              onBlur={() => setWidth(String(clampSceneInput(width, DEFAULT_SIZE)))}
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
              onChange={(e) => setDepth(e.target.value)}
              onBlur={() => setDepth(String(clampSceneInput(depth, DEFAULT_SIZE)))}
            />
          </label>
        </div>
        {dirty && <p className="warning">Kaydedilmemiş değişiklikler silinecek.</p>}
        <div className="modal-actions">
          <div className="spacer" />
          <button type="button" onClick={onClose}>İptal</button>
          <button type="submit" className="primary">Oluştur</button>
        </div>
      </form>
    </div>
  );
}
