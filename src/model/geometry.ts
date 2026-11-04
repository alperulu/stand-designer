import type { Cell, Edge, StandDesign, WallHeight } from './types';

// Ölçüler metre cinsinden.
export const POST_SIZE = 0.05;
export const PANEL_THICKNESS = 0.02;
export const BEAM_HEIGHT = 0.04;
export const FASCIA_HEIGHT = 0.3;
export const CARPET_THICKNESS = 0.012;
export const DOOR_WIDTH = 0.8;
export const DOOR_HEIGHT = 1.9;
/** 2.5 m duvarda grafiğin üstünde spotlar için bırakılan boşluk (RFP FR-5.4a). */
export const SPOT_GAP = 0.2;

export const ELEMENT_SIZES = {
  lightbox: { width: 0.7, height: 1, depth: 0.15 },
  desk: { width: 1, height: 1, depth: 0.3 },
} as const;

export function graphicHeight(wallHeight: WallHeight): number {
  return wallHeight === 2.5 ? wallHeight - SPOT_GAP : wallHeight;
}

export const MIN_SCENE = 10;
export const MAX_SCENE = 100;

/** Sahne alanı orijin merkezli, kenarları tam sayı: x ∈ [minX, maxX), z ∈ [minZ, maxZ). */
export function sceneBounds(scene: { width: number; depth: number }) {
  const minX = -Math.floor(scene.width / 2);
  const minZ = -Math.floor(scene.depth / 2);
  return { minX, minZ, maxX: minX + scene.width, maxZ: minZ + scene.depth };
}

export function cellInScene(c: Cell, scene: { width: number; depth: number }): boolean {
  const b = sceneBounds(scene);
  return c.x >= b.minX && c.x < b.maxX && c.z >= b.minZ && c.z < b.maxZ;
}

/** Durum çubuğu için: alan (m²) ve dış ölçü (sınırlayıcı kutu). */
export function floorStats(cells: Cell[]) {
  if (!cells.length) return { area: 0, width: 0, depth: 0 };
  const xs = cells.map((c) => c.x);
  const zs = cells.map((c) => c.z);
  return {
    area: cells.length,
    width: Math.max(...xs) - Math.min(...xs) + 1,
    depth: Math.max(...zs) - Math.min(...zs) + 1,
  };
}

/** Tasarımdaki her şeyin sahne içinde kalıp kalmadığı (sahne küçültme kontrolü, FR-1.2). */
export function designFitsScene(design: StandDesign, scene: { width: number; depth: number }): boolean {
  const b = sceneBounds(scene);
  const inX = (x: number) => x >= b.minX && x <= b.maxX;
  const inZ = (z: number) => z >= b.minZ && z <= b.maxZ;
  return (
    design.floor.cells.every((c) => cellInScene(c, scene)) &&
    design.walls.every((w) => edgeEnds(w.edge).every(([x, z]) => inX(x) && inZ(z))) &&
    design.fascia.edges.every((e) => edgeEnds(e).every(([x, z]) => inX(x) && inZ(z))) &&
    [...design.accessories, ...design.elements].every((a) => inX(a.position.x) && inZ(a.position.z))
  );
}

export const cellKey = (c: Cell) => `${c.x},${c.z}`;
export const edgeKey = (e: Edge) => `${e.axis}:${e.x},${e.z}`;
const vertexKey = (x: number, z: number) => `${x},${z}`;

export function edgeEnds(e: Edge): [[number, number], [number, number]] {
  return e.axis === 'x'
    ? [[e.x, e.z], [e.x + 1, e.z]]
    : [[e.x, e.z], [e.x, e.z + 1]];
}

export function edgeCenter(e: Edge): [number, number] {
  return e.axis === 'x' ? [e.x + 0.5, e.z] : [e.x, e.z + 0.5];
}

/** Paneli yerel +x boyunca uzanan bir kutu olarak düşünürsek dünyaya çeviren Y dönüşü. */
export function edgeRotation(e: Edge): number {
  return e.axis === 'x' ? 0 : -Math.PI / 2;
}

/**
 * Kenarın hangi tarafı standın içi? edgeRotation sonrası yerel +z: axis x → dünya +z, axis z → dünya -x.
 * +1: yerel +z tarafı, -1: tersi. Halı olan taraf içtir; iki tarafta da halı varsa (iç bölme) +1.
 */
export function innerSide(e: Edge, cells: Set<string>): 1 | -1 {
  const plus = e.axis === 'x' ? { x: e.x, z: e.z } : { x: e.x - 1, z: e.z };
  const minus = e.axis === 'x' ? { x: e.x, z: e.z - 1 } : { x: e.x, z: e.z };
  if (cells.has(cellKey(plus))) return 1;
  if (cells.has(cellKey(minus))) return -1;
  return 1;
}

/** Duvar panellerinin her ucunda, alın panosu dizilerinin yalnızca uçlarında dikme. */
export function derivePosts(design: StandDesign): [number, number][] {
  const seen = new Map<string, [number, number]>();
  const add = (x: number, z: number) => seen.set(vertexKey(x, z), [x, z]);
  for (const w of design.walls) for (const [x, z] of edgeEnds(w.edge)) add(x, z);
  for (const run of collinearRuns(design.fascia.edges)) {
    add(run.start[0], run.start[1]);
    add(run.end[0], run.end[1]);
  }
  return [...seen.values()];
}

export type EdgeRun = {
  axis: 'x' | 'z';
  edges: Edge[];
  start: [number, number];
  end: [number, number];
  length: number;
};

/** Aynı doğru üzerindeki bitişik kenarları tek dizi halinde gruplar. */
export function collinearRuns(edges: Edge[]): EdgeRun[] {
  const lines = new Map<string, Edge[]>();
  for (const e of edges) {
    const key = e.axis === 'x' ? `x@${e.z}` : `z@${e.x}`;
    lines.set(key, [...(lines.get(key) ?? []), e]);
  }
  const runs: EdgeRun[] = [];
  for (const list of lines.values()) {
    const along = (e: Edge) => (e.axis === 'x' ? e.x : e.z);
    list.sort((a, b) => along(a) - along(b));
    let current: Edge[] = [];
    const flush = () => {
      if (!current.length) return;
      const first = current[0];
      const last = current[current.length - 1];
      runs.push({
        axis: first.axis,
        edges: current,
        start: edgeEnds(first)[0],
        end: edgeEnds(last)[1],
        length: current.length,
      });
      current = [];
    };
    for (const e of list) {
      if (current.length && along(e) !== along(current[current.length - 1]) + 1) flush();
      current.push(e);
    }
    flush();
  }
  return runs;
}
