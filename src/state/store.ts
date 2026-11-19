import { create } from 'zustand';
import { MAX_SCENE, MIN_SCENE, cellInScene, cellKey, designFitsScene, edgeEnds, edgeKey, sceneBounds } from '../model/geometry';
import { isElementKind, normDeg, placementValid, type ItemKind, type Vec2 } from '../model/placement';
import type { Accessory, Cell, Edge, Graphic, GraphicFit, ImageAsset, StandDesign, StandElement, WallHeight, WallPanel } from '../model/types';

export type Tool = 'select' | 'floor' | 'erase' | 'wall' | 'door' | 'fascia' | 'graphic';
export type ViewPreset = 'perspective' | 'top' | 'front' | 'side' | 'focus';
export type ExportFormat = 'png' | 'jpg';
/** Export arka planı (FR-10.5): salon zemini, düz beyaz ya da şeffaf (yalnızca PNG). */
export type ExportBackground = 'hall' | 'white' | 'transparent';
/** Yakalama sırasında sahneye uygulanan geçici ayarlar; yakalama yoksa null. */
export type CaptureOverrides = { background: ExportBackground; showGrid: boolean };

const HISTORY_LIMIT = 50;

export function emptyDesign(width = 30, depth = 30): StandDesign {
  return {
    version: 2,
    scene: { width, depth },
    wallHeight: 2.5,
    floor: { cells: [] },
    walls: [],
    fascia: { edges: [], companyName: '' },
    accessories: [],
    elements: [],
    graphics: [],
    images: [],
  };
}

export const imageById = (design: StandDesign, id: string | undefined): ImageAsset | undefined =>
  id ? design.images.find((i) => i.id === id) : undefined;

const clampScene = (n: number) => Math.min(MAX_SCENE, Math.max(MIN_SCENE, Math.round(n)));

const PANEL_WHITE = '#f5f5f2';
let idCounter = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(idCounter++).toString(36)}`;

/** Kenarın iki ucu sahne sınırları içinde mi (uçlar kenar çizgisinin üstünde olabilir). */
export function edgeInScene(e: Edge, scene: { width: number; depth: number }): boolean {
  const b = sceneBounds(scene);
  return edgeEnds(e).every(([x, z]) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);
}

export type DoorProps = NonNullable<WallPanel['door']>;
export type FaceTarget = 'inner' | 'outer' | 'both';

/** Halının dış çevresinde duvarı olmayan kenarlar — alın panosunun gideceği açık cepheler (FR-6.1). */
export function openPerimeterEdges(design: StandDesign): Edge[] {
  const cells = new Set(design.floor.cells.map(cellKey));
  const walls = new Set(design.walls.map((w) => edgeKey(w.edge)));
  const out: Edge[] = [];
  for (const { x, z } of design.floor.cells) {
    const sides: [Edge, Cell][] = [
      [{ x, z, axis: 'x' }, { x, z: z - 1 }],
      [{ x, z: z + 1, axis: 'x' }, { x, z: z + 1 }],
      [{ x, z, axis: 'z' }, { x: x - 1, z }],
      [{ x: x + 1, z, axis: 'z' }, { x: x + 1, z }],
    ];
    for (const [edge, neighbour] of sides)
      if (!cells.has(cellKey(neighbour)) && !walls.has(edgeKey(edge))) out.push(edge);
  }
  return out;
}

/**
 * Grafik uygulanabilir mi (FR-5.4, 5.7): hepsi düz panel, aynı doğru üzerinde ve kesintisiz.
 * Geçerliyse panelleri sırayla döner, değilse kullanıcıya gösterilecek nedeni.
 */
export function validateGraphicPanels(
  design: StandDesign,
  ids: string[],
): { ok: true; panelIds: string[] } | { ok: false; reason: string } {
  const panels = ids.map((id) => design.walls.find((w) => w.id === id)).filter((w): w is WallPanel => !!w);
  if (!panels.length) return { ok: false, reason: 'Önce grafik uygulanacak panelleri seçin.' };
  if (panels.some((p) => p.type === 'door')) return { ok: false, reason: 'Kapılı panellere grafik uygulanamaz.' };
  const { axis } = panels[0].edge;
  const line = (p: WallPanel) => (axis === 'x' ? p.edge.z : p.edge.x);
  const along = (p: WallPanel) => (axis === 'x' ? p.edge.x : p.edge.z);
  if (panels.some((p) => p.edge.axis !== axis || line(p) !== line(panels[0])))
    return { ok: false, reason: 'Paneller aynı duvar hizasında olmalı.' };
  const sorted = [...panels].sort((a, b) => along(a) - along(b));
  for (let i = 1; i < sorted.length; i++)
    if (along(sorted[i]) !== along(sorted[i - 1]) + 1)
      return { ok: false, reason: 'Paneller arasında boşluk veya kapılı panel var; kesintisiz bir dizi seçin.' };
  return { ok: true, panelIds: sorted.map((p) => p.id) };
}
const DEFAULT_DOOR: DoorProps = { hinge: 'left', swing: 'in' };

type EditorState = {
  design: StandDesign;
  past: StandDesign[];
  future: StandDesign[];
  tool: Tool;
  showGrid: boolean;
  exportSizeIndex: number;
  exportFormat: ExportFormat;
  exportBackground: ExportBackground;
  /** Görünümde 16:9 export kadraj çerçevesi. */
  showExportFrame: boolean;
  capture: CaptureOverrides | null;
  /** Son kaydedilen/açılan tasarım; design !== savedDesign ise kaydedilmemiş değişiklik var (FR-11.4). */
  savedDesign: StandDesign | null;
  /** Kameraya iletilen istek; nonce aynı görünüm tekrar istendiğinde de tetiklenmesini sağlar. */
  viewRequest: { preset: ViewPreset; nonce: number };
  /** Seçili eleman id'leri: duvar panelleri, aksesuarlar ve grafikli elemanlar. */
  selection: string[];
  /** Kütüphaneden seçilmiş, sahneye yerleştirilmeyi bekleyen ekipman (yerleştirme modu). */
  placing: ItemKind | null;

  setTool: (tool: Tool) => void;
  setShowGrid: (show: boolean) => void;
  setExportSizeIndex: (i: number) => void;
  setExportFormat: (f: ExportFormat) => void;
  setExportBackground: (b: ExportBackground) => void;
  setShowExportFrame: (show: boolean) => void;
  setCapture: (c: CaptureOverrides | null) => void;
  markSaved: () => void;
  requestView: (preset: ViewPreset) => void;

  /** Halı ekle; sahne dışı ve zaten var olan kareler atlanır. */
  addCells: (cells: Cell[]) => void;
  removeCells: (cells: Cell[]) => void;
  /** false: mevcut elemanlar yeni sahnenin dışında kalacağı için reddedildi. */
  setSceneSize: (width: number, depth: number) => boolean;
  newProject: (width: number, depth: number) => void;
  /** Geçmişi sıfırlayarak bir tasarım yükler (otomatik kayıt, dosya, örnek). */
  loadDesign: (design: StandDesign) => void;

  /** Boş ve sahne içindeki kenarlara panel ekler; dolu kenarlar atlanır. Eklenen sayıyı döner. */
  addWalls: (edges: Edge[], type: WallPanel['type']) => number;
  /** Seçili/verilen panelleri düz ↔ kapılı çevirir. */
  setWallType: (ids: string[], type: WallPanel['type']) => void;
  setDoor: (ids: string[], door: Partial<DoorProps>) => void;
  setWallHeight: (h: WallHeight) => void;
  /** Panel yüz rengi (FR-5.1, 5.2, 5.6). */
  setPanelColor: (ids: string[], face: FaceTarget, color: string) => void;
  /** Görsel kütüphanesine ekler (tek geri alma adımı); yeni id'leri döner. */
  addImages: (images: Omit<ImageAsset, 'id'>[]) => string[];
  /** Kütüphaneden siler; bu görseli kullanan çerçeve ve elemanlar boş kalır. */
  removeImage: (id: string) => void;
  /**
   * Giydirme çerçevesi oluşturur (boş). Aynı yüzde çakışan eski çerçeveler kaldırılır; yeni çerçeve seçilir.
   * Paneller validateGraphicPanels kuralına uymalı.
   */
  addFrame: (panelIds: string[], face: 'inner' | 'outer') => { ok: true; id: string } | { ok: false; reason: string };
  /**
   * Yan yana çerçeveleri tek çerçevede birleştirir (aynı yüz, aynı duvar hizası, aradaki paneller düz ve kesintisiz).
   * Görsel ve yerleşim ilk görselli çerçeveden (verilen sırayla) alınır. Birleşik çerçeve seçilir.
   */
  mergeFrames: (frameIds: string[]) => { ok: true; id: string } | { ok: false; reason: string };
  /** Çerçeve(ler)e kütüphaneden görsel atar; undefined → görseli kaldırır (çerçeve kalır). */
  setFrameImage: (frameIds: string[], imageId: string | undefined) => void;
  setGraphicFit: (id: string, fit: GraphicFit) => void;
  /** Çerçeveyi siler. */
  removeGraphic: (id: string) => void;
  /** Alın panosu kenarlarını ekler/çıkarır; duvarlı ve sahne dışı kenarlar atlanır. */
  addFascia: (edges: Edge[]) => void;
  removeFascia: (edges: Edge[]) => void;
  /** Tüm açık dış kenarlara alın panosu koyar (FR-6.3). */
  autoFascia: () => void;
  setCompanyName: (name: string) => void;

  setPlacing: (kind: ItemKind | null) => void;
  /** Ekipman ekler, seçer ve id'sini döner (FR-7.1, 12.2). */
  addItem: (kind: ItemKind, position: Vec2, rotationDeg: number) => string;
  /** Taşıma/döndürme sonucu — tek geri alma adımı (FR-8.1a, b). */
  setTransforms: (updates: { id: string; position?: Vec2; rotationDeg?: number }[]) => void;
  /** Seçili ekipmanları kopyalar, yanına koyar ve kopyaları seçer (FR-8.1d). Panel kopyalanmaz. */
  duplicateItems: (ids: string[]) => void;
  /** Lightbox/desk ön yüzüne kütüphaneden görsel atar; undefined → kaldırır. */
  setElementImage: (ids: string[], imageId: string | undefined) => void;
  setElementFit: (ids: string[], fit: GraphicFit) => void;
  setElementIlluminated: (ids: string[], illuminated: boolean) => void;
  /** Verilen id'lerdeki duvar/aksesuar/elemanları ve onlara bağlı grafikleri siler. */
  removeEntities: (ids: string[]) => void;
  /** additive: Shift ile seçime ekle/çıkar. */
  select: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;

  undo: () => void;
  redo: () => void;
};

/**
 * Alın panosu kenarlarının kalıcı id'si yok; seçimde kenar anahtarından türetilen id kullanılır.
 * Sahnede ve eleman listesinde bir pano dizisi seçilince dizideki tüm kenarların id'si seçilir.
 */
export const fasciaId = (e: Edge) => `fascia:${edgeKey(e)}`;

/** Geri al/yinele sonrası artık var olmayan elemanları seçimden çıkarır. */
function keepExisting(selection: string[], design: StandDesign): string[] {
  const ids = new Set([
    ...[...design.walls, ...design.accessories, ...design.elements, ...design.graphics].map((e) => e.id),
    ...design.fascia.edges.map(fasciaId),
  ]);
  return selection.filter((id) => ids.has(id));
}

export const useEditor = create<EditorState>()((set, get) => {
  /** Tüm tasarım değişiklikleri buradan geçer → geri al/yinele kendiliğinden çalışır. */
  const commit = (next: StandDesign) => {
    const { design, past } = get();
    if (next === design) return;
    set({ design: next, past: [...past, design].slice(-HISTORY_LIMIT), future: [] });
  };

  return {
    design: emptyDesign(),
    past: [],
    future: [],
    tool: 'select',
    showGrid: true,
    exportSizeIndex: 0,
    exportFormat: 'png',
    exportBackground: 'hall',
    showExportFrame: false,
    capture: null,
    savedDesign: null,
    viewRequest: { preset: 'perspective', nonce: 0 },
    selection: [],
    placing: null,

    setTool: (tool) => set({ tool, placing: null }),
    setShowGrid: (showGrid) => set({ showGrid }),
    setExportSizeIndex: (exportSizeIndex) => set({ exportSizeIndex }),
    // Şeffaf arka plan yalnızca PNG'de mümkün
    setExportFormat: (exportFormat) =>
      set((s) => ({
        exportFormat,
        exportBackground: exportFormat === 'jpg' && s.exportBackground === 'transparent' ? 'hall' : s.exportBackground,
      })),
    setExportBackground: (exportBackground) =>
      set((s) => ({ exportBackground, exportFormat: exportBackground === 'transparent' ? 'png' : s.exportFormat })),
    setShowExportFrame: (showExportFrame) => set({ showExportFrame }),
    setCapture: (capture) => set({ capture }),
    markSaved: () => set((s) => ({ savedDesign: s.design })),
    requestView: (preset) => set((s) => ({ viewRequest: { preset, nonce: s.viewRequest.nonce + 1 } })),

    addCells: (cells) => {
      const { design } = get();
      const existing = new Set(design.floor.cells.map(cellKey));
      const added = cells.filter((c) => {
        const k = cellKey(c);
        if (existing.has(k) || !cellInScene(c, design.scene)) return false;
        existing.add(k);
        return true;
      });
      if (!added.length) return;
      commit({ ...design, floor: { cells: [...design.floor.cells, ...added] } });
    },

    removeCells: (cells) => {
      const { design } = get();
      const drop = new Set(cells.map(cellKey));
      const kept = design.floor.cells.filter((c) => !drop.has(cellKey(c)));
      if (kept.length === design.floor.cells.length) return;
      commit({ ...design, floor: { cells: kept } });
    },

    setSceneSize: (width, depth) => {
      const { design } = get();
      const scene = { width: clampScene(width), depth: clampScene(depth) };
      if (scene.width === design.scene.width && scene.depth === design.scene.depth) return true;
      if (!designFitsScene(design, scene)) return false;
      commit({ ...design, scene });
      return true;
    },

    newProject: (width, depth) => {
      const design = emptyDesign(clampScene(width), clampScene(depth));
      set({ design, savedDesign: design, past: [], future: [], selection: [], placing: null });
    },

    loadDesign: (design) => set({ design, past: [], future: [], selection: [], placing: null }),

    addWalls: (edges, type) => {
      const { design } = get();
      const taken = new Set(design.walls.map((w) => edgeKey(w.edge)));
      const added: WallPanel[] = [];
      for (const edge of edges) {
        const k = edgeKey(edge);
        if (taken.has(k) || !edgeInScene(edge, design.scene)) continue;
        taken.add(k);
        added.push({
          id: newId('w'),
          edge,
          type,
          door: type === 'door' ? { ...DEFAULT_DOOR } : undefined,
          faces: { inner: { color: PANEL_WHITE }, outer: { color: PANEL_WHITE } },
        });
      }
      if (!added.length) return 0;
      // Duvar konan kenardaki alın panosu kalkar
      const walled = new Set(added.map((w) => edgeKey(w.edge)));
      const fascia = { ...design.fascia, edges: design.fascia.edges.filter((e) => !walled.has(edgeKey(e))) };
      commit({ ...design, walls: [...design.walls, ...added], fascia });
      return added.length;
    },

    setWallType: (ids, type) => {
      const { design } = get();
      const target = new Set(ids);
      let changed = false;
      const walls = design.walls.map((w) => {
        if (!target.has(w.id) || w.type === type) return w;
        changed = true;
        return { ...w, type, door: type === 'door' ? w.door ?? { ...DEFAULT_DOOR } : undefined };
      });
      if (!changed) return;
      // Kapılı panele grafik uygulanamaz (FR-5.7/5.8): kapıya dönen panel grafiklerden çıkarılır
      const graphics =
        type === 'door'
          ? design.graphics
              .map((g) => ({ ...g, panelIds: g.panelIds.filter((id) => !target.has(id)) }))
              .filter((g) => g.panelIds.length > 0)
          : design.graphics;
      commit({ ...design, walls, graphics });
    },

    setDoor: (ids, door) => {
      const { design } = get();
      const target = new Set(ids);
      let changed = false;
      const walls = design.walls.map((w) => {
        if (!target.has(w.id) || w.type !== 'door') return w;
        changed = true;
        return { ...w, door: { ...(w.door ?? DEFAULT_DOOR), ...door } };
      });
      if (changed) commit({ ...design, walls });
    },

    setWallHeight: (wallHeight) => {
      const { design } = get();
      if (design.wallHeight !== wallHeight) commit({ ...design, wallHeight });
    },

    setPanelColor: (ids, face, color) => {
      const { design } = get();
      const target = new Set(ids);
      let changed = false;
      const walls = design.walls.map((w) => {
        if (!target.has(w.id)) return w;
        const inner = face !== 'outer' ? { color } : w.faces.inner;
        const outer = face !== 'inner' ? { color } : w.faces.outer;
        if (inner.color === w.faces.inner.color && outer.color === w.faces.outer.color) return w;
        changed = true;
        return { ...w, faces: { inner, outer } };
      });
      if (changed) commit({ ...design, walls });
    },

    addImages: (images) => {
      const { design } = get();
      if (!images.length) return [];
      const added = images.map((img) => ({ ...img, id: newId('img') }));
      commit({ ...design, images: [...design.images, ...added] });
      return added.map((i) => i.id);
    },

    removeImage: (id) => {
      const { design } = get();
      if (!design.images.some((i) => i.id === id)) return;
      commit({
        ...design,
        images: design.images.filter((i) => i.id !== id),
        graphics: design.graphics.map((g) => (g.imageId === id ? { ...g, imageId: undefined } : g)),
        elements: design.elements.map((e) =>
          e.front.imageId === id ? { ...e, front: { ...e.front, imageId: undefined } } : e,
        ),
      });
    },

    addFrame: (ids, face) => {
      const { design } = get();
      const check = validateGraphicPanels(design, ids);
      if (!check.ok) return check;
      const taken = new Set(check.panelIds);
      const overlaps = (g: Graphic) => g.face === face && g.panelIds.some((id) => taken.has(id));
      // Üzerine çizilen çerçevelerin görseli kaybolmasın: ilk görselli olanınkini devral
      const inherited = design.graphics.find((g) => overlaps(g) && g.imageId);
      const frame: Graphic = {
        id: newId('g'),
        panelIds: check.panelIds,
        face,
        fit: inherited?.fit ?? 'cover',
        imageId: inherited?.imageId,
      };
      commit({ ...design, graphics: [...design.graphics.filter((g) => !overlaps(g)), frame] });
      set({ selection: [frame.id] });
      return { ok: true, id: frame.id };
    },

    mergeFrames: (frameIds) => {
      const { design } = get();
      const frames = frameIds
        .map((id) => design.graphics.find((g) => g.id === id))
        .filter((g): g is Graphic => !!g);
      if (frames.length < 2) return { ok: false, reason: 'Birleştirmek için en az iki çerçeve seçin.' };
      const face = frames[0].face;
      if (frames.some((f) => f.face !== face))
        return { ok: false, reason: 'Çerçeveler aynı yüzde (iç ya da dış) olmalı.' };
      // Çerçeveler arasında kalan düz paneller de birleşik çerçeveye girer; kapı/boşluk varsa reddedilir
      const panels = frames.flatMap((f) => f.panelIds).map((id) => design.walls.find((w) => w.id === id)).filter((w): w is WallPanel => !!w);
      if (!panels.length) return { ok: false, reason: 'Çerçevelerin panelleri bulunamadı.' };
      const { axis } = panels[0].edge;
      const line = (w: WallPanel) => (axis === 'x' ? w.edge.z : w.edge.x);
      const along = (w: WallPanel) => (axis === 'x' ? w.edge.x : w.edge.z);
      if (panels.some((w) => w.edge.axis !== axis || line(w) !== line(panels[0])))
        return { ok: false, reason: 'Çerçeveler aynı duvar hizasında olmalı.' };
      const from = Math.min(...panels.map(along));
      const to = Math.max(...panels.map(along));
      const span = design.walls.filter(
        (w) => w.edge.axis === axis && line(w) === line(panels[0]) && along(w) >= from && along(w) <= to,
      );
      const check = validateGraphicPanels(design, span.map((w) => w.id));
      if (!check.ok) return check;
      if (check.panelIds.length !== to - from + 1)
        return { ok: false, reason: 'Çerçeveler arasında duvarsız kenar var; birleştirilemez.' };
      const withImage = frames.find((f) => f.imageId);
      const merged: Graphic = {
        id: newId('g'),
        panelIds: check.panelIds,
        face,
        fit: (withImage ?? frames[0]).fit,
        imageId: withImage?.imageId,
      };
      const taken = new Set(check.panelIds);
      const drop = new Set(frames.map((f) => f.id));
      const graphics = design.graphics.filter(
        (g) => !drop.has(g.id) && !(g.face === face && g.panelIds.some((id) => taken.has(id))),
      );
      commit({ ...design, graphics: [...graphics, merged] });
      set({ selection: [merged.id] });
      return { ok: true, id: merged.id };
    },

    setFrameImage: (frameIds, imageId) => {
      const { design } = get();
      const target = new Set(frameIds);
      if (!design.graphics.some((g) => target.has(g.id) && g.imageId !== imageId)) return;
      commit({ ...design, graphics: design.graphics.map((g) => (target.has(g.id) ? { ...g, imageId } : g)) });
    },

    setGraphicFit: (id, fit) => {
      const { design } = get();
      if (!design.graphics.some((g) => g.id === id && g.fit !== fit)) return;
      commit({ ...design, graphics: design.graphics.map((g) => (g.id === id ? { ...g, fit } : g)) });
    },

    removeGraphic: (id) => {
      const { design } = get();
      const graphics = design.graphics.filter((g) => g.id !== id);
      if (graphics.length !== design.graphics.length) commit({ ...design, graphics });
    },

    addFascia: (edges) => {
      const { design } = get();
      const taken = new Set([...design.fascia.edges, ...design.walls.map((w) => w.edge)].map(edgeKey));
      const added = edges.filter((e) => {
        const k = edgeKey(e);
        if (taken.has(k) || !edgeInScene(e, design.scene)) return false;
        taken.add(k);
        return true;
      });
      if (added.length) commit({ ...design, fascia: { ...design.fascia, edges: [...design.fascia.edges, ...added] } });
    },

    removeFascia: (edges) => {
      const { design } = get();
      const drop = new Set(edges.map(edgeKey));
      const kept = design.fascia.edges.filter((e) => !drop.has(edgeKey(e)));
      if (kept.length === design.fascia.edges.length) return;
      commit({ ...design, fascia: { ...design.fascia, edges: kept } });
      set({ selection: keepExisting(get().selection, get().design) });
    },

    autoFascia: () => {
      const { design } = get();
      const edges = openPerimeterEdges(design);
      const same =
        edges.length === design.fascia.edges.length &&
        edges.every((e) => design.fascia.edges.some((f) => edgeKey(f) === edgeKey(e)));
      if (!same) commit({ ...design, fascia: { ...design.fascia, edges } });
    },

    setCompanyName: (companyName) => {
      const { design } = get();
      if (design.fascia.companyName !== companyName) commit({ ...design, fascia: { ...design.fascia, companyName } });
    },

    setPlacing: (placing) => set(placing ? { placing, tool: 'select', selection: [] } : { placing: null }),

    addItem: (kind, position, rotationDeg) => {
      const { design } = get();
      const id = newId(isElementKind(kind) ? 'e' : 'a');
      const rot = normDeg(rotationDeg);
      if (isElementKind(kind)) {
        const element: StandElement = {
          id,
          kind,
          position,
          rotationDeg: rot,
          front: { fit: 'cover' },
          illuminated: kind === 'lightbox',
        };
        commit({ ...design, elements: [...design.elements, element] });
      } else {
        const accessory: Accessory = { id, kind, position, rotationDeg: rot };
        commit({ ...design, accessories: [...design.accessories, accessory] });
      }
      set({ selection: [id] });
      return id;
    },

    setTransforms: (updates) => {
      const { design } = get();
      const byId = new Map(updates.map((u) => [u.id, u]));
      let changed = false;
      const apply = <T extends { id: string; position: Vec2; rotationDeg: number }>(item: T): T => {
        const u = byId.get(item.id);
        if (!u) return item;
        const position = u.position ?? item.position;
        const rotationDeg = u.rotationDeg === undefined ? item.rotationDeg : normDeg(u.rotationDeg);
        if (position.x === item.position.x && position.z === item.position.z && rotationDeg === item.rotationDeg)
          return item;
        changed = true;
        return { ...item, position, rotationDeg };
      };
      const accessories = design.accessories.map(apply);
      const elements = design.elements.map(apply);
      if (changed) commit({ ...design, accessories, elements });
    },

    duplicateItems: (ids) => {
      const { design } = get();
      const target = new Set(ids);
      // Kopya, sırayla denenen ofsetlerden çakışmayan ilkine konur; yer yoksa kopyalanmaz
      const OFFSETS = [[0.5, 0.5], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [0, 2]];
      const round = (v: number) => Math.round(v * 10) / 10;
      let working = design;
      const newIds: string[] = [];
      for (const item of [...design.accessories, ...design.elements]) {
        if (!target.has(item.id)) continue;
        let position = item.position;
        if (item.kind !== 'spot') {
          const free = OFFSETS.map(([dx, dz]) => ({ x: round(item.position.x + dx), z: round(item.position.z + dz) })).find(
            (p) => placementValid(working, item.kind, p, item.rotationDeg),
          );
          if (!free) continue;
          position = free;
        }
        if (isElementKind(item.kind)) {
          const src = item as StandElement;
          const copy: StandElement = { ...src, id: newId('e'), front: { ...src.front }, position };
          working = { ...working, elements: [...working.elements, copy] };
          newIds.push(copy.id);
        } else {
          const copy: Accessory = { ...(item as Accessory), id: newId('a'), position };
          working = { ...working, accessories: [...working.accessories, copy] };
          newIds.push(copy.id);
        }
      }
      if (!newIds.length) return;
      commit(working);
      set({ selection: newIds });
    },

    setElementImage: (ids, imageId) => {
      const { design } = get();
      const target = new Set(ids);
      if (!design.elements.some((e) => target.has(e.id) && e.front.imageId !== imageId)) return;
      commit({
        ...design,
        elements: design.elements.map((e) => (target.has(e.id) ? { ...e, front: { ...e.front, imageId } } : e)),
      });
    },

    setElementFit: (ids, fit) => {
      const { design } = get();
      const target = new Set(ids);
      if (!design.elements.some((e) => target.has(e.id) && e.front.fit !== fit)) return;
      commit({
        ...design,
        elements: design.elements.map((e) => (target.has(e.id) ? { ...e, front: { ...e.front, fit } } : e)),
      });
    },

    setElementIlluminated: (ids, illuminated) => {
      const { design } = get();
      const target = new Set(ids);
      if (!design.elements.some((e) => target.has(e.id) && e.illuminated !== illuminated)) return;
      commit({
        ...design,
        elements: design.elements.map((e) => (target.has(e.id) ? { ...e, illuminated } : e)),
      });
    },

    removeEntities: (ids) => {
      const { design, selection } = get();
      const drop = new Set(ids);
      const walls = design.walls.filter((w) => !drop.has(w.id));
      const accessories = design.accessories.filter((a) => !drop.has(a.id));
      const elements = design.elements.filter((e) => !drop.has(e.id));
      // Çerçeveler: doğrudan silinenler + paneli kalmayanlar
      const graphics = design.graphics
        .filter((g) => !drop.has(g.id))
        .map((g) => ({ ...g, panelIds: g.panelIds.filter((id) => !drop.has(id)) }))
        .filter((g) => g.panelIds.length > 0);
      const fasciaEdges = design.fascia.edges.filter((e) => !drop.has(fasciaId(e)));
      const removed =
        design.walls.length - walls.length +
        design.accessories.length - accessories.length +
        design.elements.length - elements.length +
        design.graphics.length - graphics.length +
        design.fascia.edges.length - fasciaEdges.length;
      if (!removed) return;
      const fascia = fasciaEdges.length === design.fascia.edges.length ? design.fascia : { ...design.fascia, edges: fasciaEdges };
      commit({ ...design, walls, accessories, elements, graphics, fascia });
      set({ selection: selection.filter((id) => !drop.has(id)) });
    },

    select: (ids, additive = false) =>
      set((s) => {
        if (!additive) return { selection: ids };
        const next = new Set(s.selection);
        for (const id of ids) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
        return { selection: [...next] };
      }),

    clearSelection: () => set({ selection: [] }),

    undo: () => {
      const { past, design, future } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      set({ design: prev, past: past.slice(0, -1), future: [design, ...future], selection: keepExisting(get().selection, prev) });
    },

    redo: () => {
      const { past, design, future } = get();
      if (!future.length) return;
      set({ design: future[0], past: [...past, design], future: future.slice(1), selection: keepExisting(get().selection, future[0]) });
    },
  };
});
