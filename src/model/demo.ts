import { placeholderGraphic } from './placeholders';
import type { Cell, Edge, StandDesign, WallPanel } from './types';

const WHITE = '#f5f5f2';

function rect(x0: number, z0: number, w: number, d: number): Cell[] {
  const cells: Cell[] = [];
  for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + d; z++) cells.push({ x, z });
  return cells;
}

function panel(id: string, edge: Edge, type: WallPanel['type'] = 'solid'): WallPanel {
  return {
    id,
    edge,
    type,
    door: type === 'door' ? { hinge: 'left', swing: 'in' } : undefined,
    faces: { inner: { color: WHITE }, outer: { color: WHITE } },
  };
}

/** 3×2 m kenar stand: arka + sol duvar, ön ve sağ açık kenarlarda alın panosu. */
function baseStand(): Pick<StandDesign, 'version' | 'scene' | 'wallHeight' | 'floor' | 'walls' | 'fascia'> {
  return {
    version: 2,
    scene: { width: 30, depth: 30 },
    wallHeight: 2.5,
    floor: { cells: rect(0, 0, 3, 2) },
    walls: [
      panel('b0', { x: 0, z: 0, axis: 'x' }),
      panel('b1', { x: 1, z: 0, axis: 'x' }),
      panel('b2', { x: 2, z: 0, axis: 'x' }),
      panel('l0', { x: 0, z: 0, axis: 'z' }),
      panel('l1', { x: 0, z: 1, axis: 'z' }),
    ],
    fascia: {
      edges: [
        { x: 0, z: 2, axis: 'x' },
        { x: 1, z: 2, axis: 'x' },
        { x: 2, z: 2, axis: 'x' },
        { x: 3, z: 0, axis: 'z' },
        { x: 3, z: 1, axis: 'z' },
      ],
      companyName: 'COMPANY NAME',
    },
  };
}

/** docs/referans.jpg — beyaz paneller, depo odası, spotlar. */
export function referenceOne(): StandDesign {
  const base = baseStand();
  return {
    ...base,
    walls: [
      ...base.walls,
      panel('s0', { x: 1, z: 0, axis: 'z' }, 'door'),
      panel('s1', { x: 0, z: 1, axis: 'x' }),
    ],
    accessories: [
      { id: 'sp1', kind: 'spot', position: { x: 1.2, z: 2 }, rotationDeg: 180 },
      { id: 'sp2', kind: 'spot', position: { x: 3, z: 0.9 }, rotationDeg: -90 },
      { id: 'bin', kind: 'bin', position: { x: 2.55, z: 0.35 }, rotationDeg: 0 },
      { id: 'ps', kind: 'power-strip', position: { x: 2.35, z: 1.05 }, rotationDeg: -20 },
    ],
    elements: [],
    graphics: [],
    images: [],
  };
}

/** docs/referans-2.jpg — arka duvar giydirme, lightbox ve ışıklı desk. */
export function referenceTwo(): StandDesign {
  const base = baseStand();
  return {
    ...base,
    fascia: { ...base.fascia, companyName: 'MARKANIZ' },
    accessories: [
      { id: 'sp1', kind: 'spot', position: { x: 0.8, z: 2 }, rotationDeg: 180 },
      { id: 'sp2', kind: 'spot', position: { x: 2.2, z: 2 }, rotationDeg: 180 },
      { id: 'ps', kind: 'power-strip', position: { x: 2.7, z: 1.6 }, rotationDeg: 10 },
    ],
    elements: [
      {
        id: 'lb',
        kind: 'lightbox',
        position: { x: 0.55, z: 0.9 },
        rotationDeg: 15,
        front: { imageId: 'img-lightbox', fit: 'cover' },
        illuminated: false,
      },
      {
        id: 'desk',
        kind: 'desk',
        position: { x: 1.6, z: 1.35 },
        rotationDeg: 0,
        front: { imageId: 'img-desk', fit: 'cover' },
        illuminated: true,
      },
    ],
    graphics: [
      { id: 'g-back', panelIds: ['b0', 'b1', 'b2'], face: 'inner', fit: 'cover', imageId: 'img-back' },
    ],
    images: [
      { id: 'img-back', name: 'arka-duvar.png', src: placeholderGraphic('backwall'), width: 3000, height: 2300 },
      { id: 'img-lightbox', name: 'lightbox.png', src: placeholderGraphic('lightbox'), width: 700, height: 1000 },
      { id: 'img-desk', name: 'desk.png', src: placeholderGraphic('desk'), width: 1000, height: 1000 },
    ],
  };
}
