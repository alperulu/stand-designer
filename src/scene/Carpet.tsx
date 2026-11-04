import { useMemo } from 'react';
import * as THREE from 'three';
import { CARPET_THICKNESS, cellKey } from '../model/geometry';
import type { Cell } from '../model/types';
import { useCarpetTexture } from './textures';

/** Seçili karelerden tek parça halı: üst yüzey + yalnızca dış sınırlarda yan yüzler. UV'ler dünya metresi. */
function buildCarpetGeometry(cells: Cell[]): THREE.BufferGeometry {
  const t = CARPET_THICKNESS;
  const set = new Set(cells.map(cellKey));
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];

  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    n: [number, number, number],
    uvs: [number, number][],
  ) => {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(...[a, b, c, d][i]);
      nor.push(...n);
      uv.push(...uvs[i]);
    }
  };

  for (const { x, z } of cells) {
    quad([x, t, z], [x, t, z + 1], [x + 1, t, z + 1], [x + 1, t, z], [0, 1, 0],
      [[x, -z], [x, -z - 1], [x + 1, -z - 1], [x + 1, -z]]);

    if (!set.has(cellKey({ x, z: z - 1 })))
      quad([x + 1, 0, z], [x, 0, z], [x, t, z], [x + 1, t, z], [0, 0, -1],
        [[x + 1, 0], [x, 0], [x, t], [x + 1, t]]);
    if (!set.has(cellKey({ x, z: z + 1 })))
      quad([x, 0, z + 1], [x + 1, 0, z + 1], [x + 1, t, z + 1], [x, t, z + 1], [0, 0, 1],
        [[x, 0], [x + 1, 0], [x + 1, t], [x, t]]);
    if (!set.has(cellKey({ x: x - 1, z })))
      quad([x, 0, z], [x, 0, z + 1], [x, t, z + 1], [x, t, z], [-1, 0, 0],
        [[z, 0], [z + 1, 0], [z + 1, t], [z, t]]);
    if (!set.has(cellKey({ x: x + 1, z })))
      quad([x + 1, 0, z + 1], [x + 1, 0, z], [x + 1, t, z], [x + 1, t, z + 1], [1, 0, 0],
        [[z + 1, 0], [z, 0], [z, t], [z + 1, t]]);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function Carpet({ cells }: { cells: Cell[] }) {
  const texture = useCarpetTexture();
  const geometry = useMemo(() => buildCarpetGeometry(cells), [cells]);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial map={texture} roughness={0.95} metalness={0} />
    </mesh>
  );
}
