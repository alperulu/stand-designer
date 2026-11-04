// Ekipman yerleşimi: ölçüler, çarpışma, duvara yaslama, spot yapışması (RFP FR-7.3, 7.4, 8.1a–c, 12.2–12.3).
import { ELEMENT_SIZES, POST_SIZE, cellKey, derivePosts, edgeEnds, innerSide, sceneBounds } from './geometry';
import type { AccessoryKind, Edge, StandDesign, StandElementKind } from './types';

export type ItemKind = AccessoryKind | StandElementKind;
export type Vec2 = { x: number; z: number };
export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };

export const GRID_STEP = 0.1;
const EPS = 0.004;

/**
 * Zemin izi (genişlik × derinlik, yerel x × z). Spot zeminde değildir → null.
 * round: iz w çaplı dairedir — döndürmek kapladığı alanı değiştirmez, çarpışma daire olarak hesaplanır.
 */
export type Footprint = { w: number; d: number; round?: boolean };
export const FOOTPRINTS: Record<ItemKind, Footprint | null> = {
  spot: null,
  bin: { w: 0.28, d: 0.28 },
  'power-strip': { w: 0.34, d: 0.07 },
  // Ø60 bistro masa + masaya yanaşık 3 sandalye: sandalye sırtlıkları dahil toplam Ø1.2 m
  'table-set': { w: 1.2, d: 1.2, round: true },
  'brochure-stand': { w: 0.32, d: 0.36 },
  lightbox: { w: ELEMENT_SIZES.lightbox.width, d: 0.32 },
  desk: { w: ELEMENT_SIZES.desk.width + 0.02, d: ELEMENT_SIZES.desk.depth + 0.02 },
};

export const ITEM_LABELS: Record<ItemKind, string> = {
  spot: 'Spot lamba',
  bin: 'Çöp kovası',
  'power-strip': 'Grup priz',
  'table-set': 'Masa + 3 sandalye',
  'brochure-stand': 'Broşürlük',
  lightbox: 'Lightbox 0.7×1 m',
  desk: 'Desk 1×1 m',
};

export const isElementKind = (k: ItemKind): k is StandElementKind => k === 'lightbox' || k === 'desk';

export const snapStep = (v: number) => Math.round(v / GRID_STEP) * GRID_STEP;
export const normDeg = (d: number) => ((Math.round(d) % 360) + 360) % 360;

/** Döndürülmüş izin eksen hizalı sınır kutusu (yuvarlak izde dönüşten bağımsız). */
export function footprintRect(kind: ItemKind, pos: Vec2, rotationDeg: number): Rect | null {
  const f = FOOTPRINTS[kind];
  if (!f) return null;
  if (f.round) {
    const r = f.w / 2;
    return { minX: pos.x - r, maxX: pos.x + r, minZ: pos.z - r, maxZ: pos.z + r };
  }
  const a = (rotationDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const hw = (f.w * c + f.d * s) / 2;
  const hd = (f.w * s + f.d * c) / 2;
  return { minX: pos.x - hw, maxX: pos.x + hw, minZ: pos.z - hd, maxZ: pos.z + hd };
}

/** Çarpışma şekli: dikdörtgen (eksen hizalı) ya da daire (yuvarlak iz). */
export type Shape = { rect: Rect } | { circle: { x: number; z: number; r: number } };

const rectsOverlap = (a: Rect, b: Rect) =>
  a.minX < b.maxX - EPS && a.maxX > b.minX + EPS && a.minZ < b.maxZ - EPS && a.maxZ > b.minZ + EPS;

/** Daire ile dikdörtgen: dikdörtgendeki en yakın noktanın merkeze uzaklığı yarıçaptan küçükse çakışır. */
function circleRectOverlap(c: { x: number; z: number; r: number }, b: Rect) {
  const nx = Math.min(Math.max(c.x, b.minX), b.maxX);
  const nz = Math.min(Math.max(c.z, b.minZ), b.maxZ);
  return Math.hypot(c.x - nx, c.z - nz) < c.r - EPS;
}

function shapesOverlap(a: Shape, b: Shape): boolean {
  if ('rect' in a) return 'rect' in b ? rectsOverlap(a.rect, b.rect) : circleRectOverlap(b.circle, a.rect);
  if ('rect' in b) return circleRectOverlap(a.circle, b.rect);
  return Math.hypot(a.circle.x - b.circle.x, a.circle.z - b.circle.z) < a.circle.r + b.circle.r - EPS;
}

/** Ekipmanın çarpışma şekli: yuvarlak izde daire, diğerlerinde döndürülmüş izin sınır kutusu. */
export function footprintShape(kind: ItemKind, pos: Vec2, rotationDeg: number): Shape | null {
  const f = FOOTPRINTS[kind];
  if (!f) return null;
  if (f.round) return { circle: { x: pos.x, z: pos.z, r: f.w / 2 } };
  const rect = footprintRect(kind, pos, rotationDeg);
  return rect ? { rect } : null;
}

function edgeRect(e: Edge, halfThickness: number): Rect {
  const [[x0, z0], [x1, z1]] = edgeEnds(e);
  return {
    minX: Math.min(x0, x1) - halfThickness,
    maxX: Math.max(x0, x1) + halfThickness,
    minZ: Math.min(z0, z1) - halfThickness,
    maxZ: Math.max(z0, z1) + halfThickness,
  };
}

/** Duvarlar, dikmeler ve (hariç tutulanlar dışındaki) zemin ekipmanları. */
export function obstacleShapes(design: StandDesign, excludeIds: Set<string>): Shape[] {
  const shapes: Shape[] = design.walls.map((w) => ({ rect: edgeRect(w.edge, POST_SIZE / 2) }));
  for (const [x, z] of derivePosts(design))
    shapes.push({ rect: { minX: x - POST_SIZE / 2, maxX: x + POST_SIZE / 2, minZ: z - POST_SIZE / 2, maxZ: z + POST_SIZE / 2 } });
  for (const item of [...design.accessories, ...design.elements]) {
    if (excludeIds.has(item.id)) continue;
    const shape = footprintShape(item.kind, item.position, item.rotationDeg);
    if (shape) shapes.push(shape);
  }
  return shapes;
}

/** Zemin ekipmanı bu konumda durabilir mi: sahne içinde ve hiçbir engelle çakışmıyor. */
export function placementValid(
  design: StandDesign,
  kind: ItemKind,
  pos: Vec2,
  rotationDeg: number,
  excludeIds: Set<string> = new Set(),
): boolean {
  const r = footprintRect(kind, pos, rotationDeg);
  const shape = footprintShape(kind, pos, rotationDeg);
  if (!r || !shape) return true;
  const b = sceneBounds(design.scene);
  if (r.minX < b.minX || r.maxX > b.maxX || r.minZ < b.minZ || r.maxZ > b.maxZ) return false;
  return !obstacleShapes(design, excludeIds).some((o) => shapesOverlap(shape, o));
}

/**
 * Arkası duvara yakınsa (≤ threshold) ekipmanı duvar yüzeyine yaslar (FR-12.3). Yalnızca 90°'nin katlarında.
 * Arka = yerel −z yönü.
 */
export function snapToWall(design: StandDesign, kind: ItemKind, pos: Vec2, rotationDeg: number, threshold = 0.15): Vec2 {
  const f = FOOTPRINTS[kind];
  const rot = normDeg(rotationDeg);
  if (!f || rot % 90 !== 0) return pos;
  const a = (rot * Math.PI) / 180;
  const back = { x: -Math.round(Math.sin(a)), z: -Math.round(Math.cos(a)) };
  const halfW = f.w / 2;
  const halfD = f.d / 2;
  const face = POST_SIZE / 2;
  let best: Vec2 | null = null;
  let bestDist = threshold;
  for (const w of design.walls) {
    const [[x0, z0], [x1, z1]] = edgeEnds(w.edge);
    if (back.z !== 0 && w.edge.axis === 'x') {
      // Arka ±z yönünde, duvar z = z0 çizgisinde
      if (pos.x + halfW <= Math.min(x0, x1) || pos.x - halfW >= Math.max(x0, x1)) continue;
      const backZ = pos.z + back.z * halfD;
      const target = z0 - back.z * face;
      const dist = (target - backZ) * back.z;
      if (dist >= -EPS && dist < bestDist) {
        bestDist = dist;
        best = { x: pos.x, z: target - back.z * halfD };
      }
    } else if (back.x !== 0 && w.edge.axis === 'z') {
      if (pos.z + halfW <= Math.min(z0, z1) || pos.z - halfW >= Math.max(z0, z1)) continue;
      const backX = pos.x + back.x * halfD;
      const target = x0 - back.x * face;
      const dist = (target - backX) * back.x;
      if (dist >= -EPS && dist < bestDist) {
        bestDist = dist;
        best = { x: target - back.x * halfD, z: pos.z };
      }
    }
  }
  return best ?? pos;
}

/**
 * Spot: en yakın duvar/alın panosu üst kenarına yapışır (FR-7.4, 8.1c). Yön içeri (halı tarafı) bakar.
 * Konum kenar çizgisi üzerinde, uçlardan 0.1 m içeride. Yakında kenar yoksa null.
 */
export function snapSpot(design: StandDesign, point: Vec2, maxDistance = 0.8): { position: Vec2; rotationDeg: number } | null {
  const cells = new Set(design.floor.cells.map(cellKey));
  const edges = [...design.walls.map((w) => w.edge), ...design.fascia.edges];
  let best: { position: Vec2; rotationDeg: number } | null = null;
  let bestDist = maxDistance;
  for (const e of edges) {
    const [[x0, z0], [x1, z1]] = edgeEnds(e);
    const along = e.axis === 'x'
      ? Math.min(Math.max(point.x, x0 + 0.1), x1 - 0.1)
      : Math.min(Math.max(point.z, z0 + 0.1), z1 - 0.1);
    const p = e.axis === 'x' ? { x: along, z: z0 } : { x: x0, z: along };
    const d = Math.hypot(point.x - p.x, point.z - p.z);
    if (d >= bestDist) continue;
    bestDist = d;
    const side = innerSide(e, cells);
    // Yerel +z dünya yönü: (sin θ, cos θ). axis x → içeri (0, side); axis z → içeri (−side, 0)
    const rotationDeg = e.axis === 'x' ? (side === 1 ? 0 : 180) : side === 1 ? 270 : 90;
    // Kenar çizgisi tam sayıda olduğundan 0.1 m adıma yuvarlamak çizgiden kaydırmaz
    best = { position: { x: snapStep(p.x), z: snapStep(p.z) }, rotationDeg };
  }
  return best;
}
