import type { DragEvent, ReactNode } from 'react';
import { ITEM_LABELS, type ItemKind } from '../model/placement';
import { beginItemDrag } from '../scene/tools/PlacementTool';
import { useEditor, type Tool } from '../state/store';
import { ImageLibrary } from './ImageLibrary';

const Icon = ({ children }: { children: ReactNode }) => (
  <svg
    className="tool-icon"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const ICONS = {
  select: (
    <Icon>
      <path d="M5 3l14 8-6.2 1.6L10 19z" />
    </Icon>
  ),
  floor: (
    <Icon>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M3.5 12h17M12 3.5v17" />
    </Icon>
  ),
  erase: (
    <Icon>
      <path d="M8.5 19.5L3.8 14.8a1.5 1.5 0 010-2.1l8.9-8.9a1.5 1.5 0 012.1 0l5.4 5.4a1.5 1.5 0 010 2.1l-8.6 8.2z" />
      <path d="M8.5 19.5H20M9 9.5l5.5 5.5" />
    </Icon>
  ),
  wall: (
    <Icon>
      <rect x="9" y="3" width="6" height="18" rx="1" />
    </Icon>
  ),
  door: (
    <Icon>
      <path d="M5 21h14M7 21V3h10v18" />
      <circle cx="14" cy="12.5" r="0.6" fill="currentColor" />
    </Icon>
  ),
  fascia: (
    <Icon>
      <rect x="3" y="8" width="18" height="6" rx="1" />
      <path d="M6 14v6M18 14v6" />
    </Icon>
  ),
  graphic: (
    <Icon>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <circle cx="9" cy="9.5" r="1.6" />
      <path d="M3.5 17.5l5-4.5 3.5 3 3-2.5 5.5 4.5" />
    </Icon>
  ),
};

const TOOLS: { id: Tool; label: string; key: string; icon: ReactNode }[] = [
  { id: 'select', label: 'Seç', key: 'V', icon: ICONS.select },
  { id: 'floor', label: 'Zemin', key: 'F', icon: ICONS.floor },
  { id: 'erase', label: 'Silgi', key: 'E', icon: ICONS.erase },
  { id: 'wall', label: 'Duvar', key: 'W', icon: ICONS.wall },
  { id: 'door', label: 'Kapı', key: 'D', icon: ICONS.door },
  { id: 'fascia', label: 'Pano', key: 'P', icon: ICONS.fascia },
  { id: 'graphic', label: 'Giydirme', key: 'K', icon: ICONS.graphic },
];

const ITEM_ICONS: Record<ItemKind, ReactNode> = {
  spot: (
    <Icon>
      <path d="M4 4h16M12 4v3" />
      <path d="M8.5 7h7l-1.8 5h-3.4z" />
      <path d="M9 15.5l-1 3M12 15v4M15 15.5l1 3" />
    </Icon>
  ),
  bin: (
    <Icon>
      <path d="M6.5 7.5h11l-1 12.5h-9z" />
      <path d="M5 7.5h14M10 4.5h4" />
    </Icon>
  ),
  'power-strip': (
    <Icon>
      <rect x="2.5" y="9" width="17" height="6" rx="1.5" />
      <path d="M19.5 12h2" />
      <circle cx="6.5" cy="12" r="1" fill="currentColor" />
      <circle cx="11" cy="12" r="1" fill="currentColor" />
      <circle cx="15.5" cy="12" r="1" fill="currentColor" />
    </Icon>
  ),
  'table-set': (
    <Icon>
      <circle cx="12" cy="12.5" r="4" />
      <circle cx="12" cy="4.5" r="1.8" />
      <circle cx="5" cy="17" r="1.8" />
      <circle cx="19" cy="17" r="1.8" />
    </Icon>
  ),
  'brochure-stand': (
    <Icon>
      <path d="M7.5 21l1-18h7l1 18" />
      <path d="M8.7 8h6.6M8.4 13h7.2" />
    </Icon>
  ),
  lightbox: (
    <Icon>
      <rect x="6.5" y="3" width="11" height="15" rx="1" />
      <path d="M9 21h6M12 18v3" />
      <path d="M3 7l1.5.8M21 7l-1.5.8M3 14l1.5-.8M21 14l-1.5-.8" />
    </Icon>
  ),
  desk: (
    <Icon>
      <rect x="3" y="6" width="18" height="14" rx="1" />
      <path d="M3 9.5h18" />
    </Icon>
  ),
};

const ITEM_ORDER: ItemKind[] = ['spot', 'bin', 'power-strip', 'table-set', 'brochure-stand', 'lightbox', 'desk'];

function Library() {
  const placing = useEditor((s) => s.placing);
  const setPlacing = useEditor((s) => s.setPlacing);

  // Veri türleri ve effectAllowed yerleştirme aracının yardımcısıyla ayarlanır (sahne dragover'da hayalet gösterir).
  const onDragStart = (kind: ItemKind) => (e: DragEvent<HTMLButtonElement>) => beginItemDrag(e.dataTransfer, kind);

  return (
    <div className="library" role="group" aria-label="Ekipmanlar">
      <h2 className="panel-title">Ekipmanlar</h2>
      {ITEM_ORDER.map((kind) => (
        <button
          key={kind}
          type="button"
          className={`library-item${placing === kind ? ' active' : ''}`}
          aria-pressed={placing === kind}
          title={`${ITEM_LABELS[kind]} — tıkla ve yerleştir ya da sürükle`}
          draggable
          onDragStart={onDragStart(kind)}
          onClick={() => setPlacing(placing === kind ? null : kind)}
        >
          {ITEM_ICONS[kind]}
          <span className="tool-label">{ITEM_LABELS[kind]}</span>
        </button>
      ))}
      <p className="library-hint">Tıkla ve sahneye yerleştir ya da sürükle-bırak. R: döndür, Esc: iptal</p>
    </div>
  );
}

export function ToolPanel() {
  const tool = useEditor((s) => s.tool);
  const placing = useEditor((s) => s.placing);
  const setTool = useEditor((s) => s.setTool);

  return (
    <aside className="tool-panel" aria-label="Araçlar">
      <h2 className="panel-title">Araçlar</h2>
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tool-button${tool === t.id && !placing ? ' active' : ''}`}
          aria-pressed={tool === t.id && !placing}
          title={`${t.label} (${t.key})`}
          onClick={() => setTool(t.id)}
        >
          {t.icon}
          <span className="tool-label">{t.label}</span>
          <kbd>{t.key}</kbd>
        </button>
      ))}
      <hr className="tool-sep" />
      <Library />
      <hr className="tool-sep" />
      <ImageLibrary />
    </aside>
  );
}
