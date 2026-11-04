import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { sceneBounds } from '../model/geometry';
import type { ExportBackground } from '../state/store';

export const HALL_COLOR = '#cfd1d4';
const FLOOR_COLOR = '#c3c6ca';
/** Beyaz export'ta derz çizgileri (zemin yok, yalnızca çizgiler beyaz üstünde). */
const LINE_ON_WHITE = '#c4c8cd';
/** Şeffaf/beyaz export'ta zemin yerine yalnızca gölgeyi taşıyan düzlemin koyuluğu. */
const SHADOW_OPACITY = 0.32;

/**
 * 1 m'lik karo dokusu; kenarlarında derz çizgisi. Doku zeminle birlikte ölçeklenir (4K export'ta da net).
 * base null → yalnızca çizgiler (arka planı şeffaf doku).
 */
function createGridTexture(base: string | null, line: string): THREE.CanvasTexture {
  const size = 256;
  const w = 3;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  if (base) {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.fillStyle = line;
  ctx.fillRect(0, 0, size, w / 2);
  ctx.fillRect(0, size - w / 2, size, w / 2);
  ctx.fillRect(0, 0, w / 2, size);
  ctx.fillRect(size - w / 2, 0, w / 2, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

/**
 * Fuar salonu zemini; sahne alanı 1×1 m grid ile. Kenarlar tam sayıda → karolar halı kareleriyle hizalı.
 *
 * backdrop (yalnızca export sırasında 'hall' dışı):
 * - 'white': salon zemini yerine gölge düzlemi; çizim şeffaf alınıp saf beyaz üstüne bindirilir (capture.tsx),
 *   yani zemin = kusursuz beyaz + gölgeler. Grid açıksa beyaz üstünde yalnızca derz çizgileri.
 * - 'transparent': yalnızca gölge düzlemi (PNG'de yarı saydam siyah gölge); grid gösterilmez.
 */
export function Hall({
  showGrid,
  width,
  depth,
  backdrop = 'hall',
}: {
  showGrid: boolean;
  width: number;
  depth: number;
  backdrop?: ExportBackground;
}) {
  const b = sceneBounds({ width, depth });
  const grid = useMemo(() => {
    const t = createGridTexture(FLOOR_COLOR, '#f3f4f5');
    t.repeat.set(width, depth);
    return t;
  }, [width, depth]);
  const lines = useMemo(() => {
    if (backdrop !== 'white') return null;
    const t = createGridTexture(null, LINE_ON_WHITE);
    t.repeat.set(width, depth);
    return t;
  }, [backdrop, width, depth]);
  useEffect(() => () => lines?.dispose(), [lines]);

  const gridPosition: [number, number, number] = [(b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2];

  if (backdrop !== 'hall') {
    return (
      <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
          <planeGeometry args={[400, 400]} />
          <shadowMaterial opacity={SHADOW_OPACITY} />
        </mesh>
        {backdrop === 'white' && showGrid && lines && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={gridPosition}>
            <planeGeometry args={[width, depth]} />
            <meshBasicMaterial map={lines} transparent depthWrite={false} />
          </mesh>
        )}
      </group>
    );
  }

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color={FLOOR_COLOR} roughness={0.95} />
      </mesh>
      {showGrid && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={gridPosition} receiveShadow>
          <planeGeometry args={[width, depth]} />
          <meshStandardMaterial map={grid} roughness={0.95} />
        </mesh>
      )}
    </group>
  );
}
