import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { collinearRuns } from '../model/geometry';
import type { ItemKind } from '../model/placement';
import type { StandDesign } from '../model/types';
import { fasciaId, imageById, useEditor } from '../state/store';

/** Listedeki tek satır; bir satır birden çok seçim id'sine karşılık gelebilir (pano dizisi). */
type Row = { key: string; ids: string[]; label: string; meta: string };
type Group = { key: string; title: string; rows: Row[] };

const ITEM_NAMES: Record<ItemKind, string> = {
  lightbox: 'Lightbox',
  desk: 'Desk',
  'table-set': 'Masa takımı',
  'brochure-stand': 'Broşürlük',
  spot: 'Spot',
  bin: 'Çöp kovası',
  'power-strip': 'Grup priz',
};
const ITEM_ORDER = Object.keys(ITEM_NAMES) as ItemKind[];

const fmt = (n: number) => String(Math.round(n * 10) / 10);
const axisLabel = (axis: 'x' | 'z') => (axis === 'x' ? 'Yatay' : 'Dikey');

/** Tasarımdaki elemanları türlerine göre gruplar; boş gruplar listelenmez. */
function buildGroups(design: StandDesign): Group[] {
  const groups: Group[] = [];
  const push = (key: string, title: string, rows: Row[]) => {
    if (rows.length) groups.push({ key, title, rows });
  };

  for (const type of ['solid', 'door'] as const) {
    const walls = design.walls.filter((w) => w.type === type);
    const name = type === 'solid' ? 'Panel' : 'Kapılı panel';
    push(
      `wall-${type}`,
      type === 'solid' ? 'Duvar panelleri' : 'Kapılı paneller',
      walls.map((w, i) => ({
        key: w.id,
        ids: [w.id],
        label: `${name} ${i + 1}`,
        meta: `${axisLabel(w.edge.axis)} · ${w.edge.x}, ${w.edge.z}`,
      })),
    );
  }

  push(
    'graphic',
    'Giydirme çerçeveleri',
    design.graphics.map((g, i) => ({
      key: g.id,
      ids: [g.id],
      label: `Çerçeve ${i + 1} · ${g.panelIds.length} m`,
      meta: `${g.face === 'inner' ? 'İç yüz' : 'Dış yüz'} · ${imageById(design, g.imageId)?.name ?? 'Boş'}`,
    })),
  );

  push(
    'fascia',
    'Alın panoları',
    collinearRuns(design.fascia.edges).map((run, i) => ({
      key: `fascia-${run.axis}:${run.start[0]},${run.start[1]}`,
      ids: run.edges.map(fasciaId),
      label: `Pano ${i + 1} · ${run.length} m`,
      meta: `${axisLabel(run.axis)} · ${run.start[0]}, ${run.start[1]}`,
    })),
  );

  const items = [...design.elements, ...design.accessories];
  for (const kind of ITEM_ORDER) {
    push(
      kind,
      ITEM_NAMES[kind],
      items
        .filter((it) => it.kind === kind)
        .map((it, i) => ({
          key: it.id,
          ids: [it.id],
          label: `${ITEM_NAMES[kind]} ${i + 1}`,
          meta: `${fmt(it.position.x)}, ${fmt(it.position.z)} · ${it.rotationDeg}°`,
        })),
    );
  }
  return groups;
}

/**
 * Sahnedeki elemanların türe göre gruplanmış, açılır-kapanır listesi. Satır seçimi sahne seçimiyle aynıdır:
 * listeden seçilen sahnede, sahnede seçilen listede seçili görünür. Shift ya da ⌘/Ctrl ile çoklu seçim.
 */
export function SceneOutline() {
  const design = useEditor((s) => s.design);
  const selection = useEditor((s) => s.selection);
  const select = useEditor((s) => s.select);
  const groups = useMemo(() => buildGroups(design), [design]);
  const selected = useMemo(() => new Set(selection), [selection]);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const listRef = useRef<HTMLDivElement>(null);

  // Sahnede seçilen elemanın grubu açılır ve satırı görünür alana kaydırılır.
  const selectionKey = selection.join(',');
  useEffect(() => {
    if (!selection.length) return;
    const toOpen = groups.filter((g) => !open.has(g.key) && g.rows.some((r) => r.ids.some((id) => selected.has(id))));
    if (toOpen.length) setOpen((cur) => new Set([...cur, ...toOpen.map((g) => g.key)]));
    requestAnimationFrame(() => {
      listRef.current?.querySelector('.outline-row.selected')?.scrollIntoView({ block: 'nearest' });
    });
    // Yalnızca seçim değişince; kullanıcı grubu elle kapatınca yeniden açılmasın.
  }, [selectionKey]);

  const toggle = (key: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const onRowClick = (row: Row) => (e: MouseEvent) => {
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (!additive) return select(row.ids);
    // Satırın tamamı seçiliyse çıkar, değilse eksik id'leri ekle (pano dizisinde kısmi seçim ters dönmesin).
    const all = row.ids.every((id) => selected.has(id));
    select(all ? row.ids : row.ids.filter((id) => !selected.has(id)), true);
  };

  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <section className="panel-section outline-section">
      <h3 className="section-title">Sahne elemanları · {total}</h3>
      {groups.length === 0 ? (
        <p className="field-hint first">Henüz eleman yok.</p>
      ) : (
        <div className="outline" ref={listRef}>
          {groups.map((g) => {
            const isOpen = open.has(g.key);
            const groupIds = g.rows.flatMap((r) => r.ids);
            const selCount = g.rows.filter((r) => r.ids.some((id) => selected.has(id))).length;
            const allSelected = groupIds.every((id) => selected.has(id));
            return (
              <div key={g.key} className="outline-group">
                <div className="outline-head">
                  <button
                    type="button"
                    className="outline-toggle"
                    aria-expanded={isOpen}
                    onClick={() => toggle(g.key)}
                  >
                    <svg className={`outline-chevron${isOpen ? ' open' : ''}`} viewBox="0 0 10 10" aria-hidden="true">
                      <path d="M3.5 1.5 7 5l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="outline-title">{g.title}</span>
                    <span className={`outline-count${selCount ? ' active' : ''}`}>
                      {selCount ? `${selCount}/${g.rows.length}` : g.rows.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`outline-all${allSelected ? ' active' : ''}`}
                    title="Bu gruptaki tüm elemanları seç"
                    onClick={() => select(groupIds)}
                  >
                    Tümü
                  </button>
                </div>
                {isOpen && (
                  <div className="outline-rows" role="list">
                    {g.rows.map((r) => {
                      const isSel = r.ids.every((id) => selected.has(id));
                      return (
                        <button
                          key={r.key}
                          type="button"
                          role="listitem"
                          className={`outline-row${isSel ? ' selected' : ''}`}
                          aria-pressed={isSel}
                          onClick={onRowClick(r)}
                        >
                          <span className="outline-label">{r.label}</span>
                          <span className="outline-meta">{r.meta}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {total > 0 && <p className="field-hint">Shift ile çoklu seçim · Del ile sil.</p>}
    </section>
  );
}
