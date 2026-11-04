import { useMemo } from 'react';
import { floorStats } from '../model/geometry';
import { useEditor, type ViewPreset } from '../state/store';

const VIEWS: { preset: ViewPreset; label: string }[] = [
  { preset: 'perspective', label: 'Perspektif' },
  { preset: 'top', label: 'Üst' },
  { preset: 'front', label: 'Ön' },
  { preset: 'side', label: 'Yan' },
];

export function StatusBar() {
  const requestView = useEditor((s) => s.requestView);
  const cells = useEditor((s) => s.design.floor.cells);
  const scene = useEditor((s) => s.design.scene);
  const wallCount = useEditor((s) => s.design.walls.length);
  const itemCount = useEditor((s) => s.design.accessories.length + s.design.elements.length);
  const stats = useMemo(() => floorStats(cells), [cells]);

  return (
    <footer className="statusbar">
      <span className="status-label">Görünüm</span>
      <div className="segmented" role="group" aria-label="Kamera görünümü">
        {VIEWS.map((v) => (
          <button key={v.preset} type="button" onClick={() => requestView(v.preset)}>
            {v.label}
          </button>
        ))}
      </div>
      <button type="button" className="ghost" onClick={() => requestView('focus')}>
        Standa odaklan
      </button>
      <div className="spacer" />
      <span className="status-item">
        Stand alanı:{' '}
        <strong>{stats.area ? `${stats.area} m² — ${stats.width}×${stats.depth} m` : '—'}</strong>
      </span>
      <span className="status-sep" aria-hidden="true" />
      <span className="status-item">
        Duvar: <strong>{wallCount ? `${wallCount} panel` : '—'}</strong>
      </span>
      <span className="status-sep" aria-hidden="true" />
      <span className="status-item">
        Ekipman: <strong>{itemCount || '—'}</strong>
      </span>
      <span className="status-sep" aria-hidden="true" />
      <span className="status-item">
        Sahne: <strong>{scene.width}×{scene.depth} m</strong>
      </span>
    </footer>
  );
}
