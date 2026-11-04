import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { GraphicFit } from '../model/types';

/** İğne keçe halı dokusu: antrasit zemin üzerinde açık/koyu lifler. Kenarlardan sarmalanır → dikişsiz döşenir. */
export function createCarpetTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3a3b3d';
  ctx.fillRect(0, 0, size, size);

  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < size * size * 0.35; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const v = rand();
    const shade = v < 0.5 ? 30 + v * 40 : 70 + v * 70;
    ctx.fillStyle = `rgb(${shade},${shade},${shade + 2})`;
    const len = 1 + rand() * 2.5;
    const ang = rand() * Math.PI;
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      ctx.save();
      ctx.translate(x + ox, y + oy);
      ctx.rotate(ang);
      ctx.fillRect(-len / 2, -0.5, len, 1);
      ctx.restore();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const PX_PER_M = 900;
const MAX_PX = 4096;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Görseli grafik alanının oranına göre (doldur/sığdır) beyaz zeminli bir tuvale yerleştirir. */
function composeGraphic(img: HTMLImageElement, widthM: number, heightM: number, fit: GraphicFit) {
  const scale = Math.min(PX_PER_M, MAX_PX / Math.max(widthM, heightM));
  const cw = Math.round(widthM * scale);
  const ch = Math.round(heightM * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);
  const k = fit === 'cover'
    ? Math.max(cw / img.width, ch / img.height)
    : Math.min(cw / img.width, ch / img.height);
  const dw = img.width * k;
  const dh = img.height * k;
  ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  return canvas;
}

export function useGraphicTexture(
  src: string | undefined,
  widthM: number,
  heightM: number,
  fit: GraphicFit,
): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!src) {
      setTexture(null);
      return;
    }
    let cancelled = false;
    let created: THREE.Texture | null = null;
    loadImage(src).then((img) => {
      if (cancelled) return;
      created = new THREE.CanvasTexture(composeGraphic(img, widthM, heightM, fit));
      created.colorSpace = THREE.SRGBColorSpace;
      created.anisotropy = 8;
      setTexture(created);
    });
    return () => {
      cancelled = true;
      created?.dispose();
    };
  }, [src, widthM, heightM, fit]);

  return texture;
}

export function useCarpetTexture() {
  return useMemo(() => createCarpetTexture(), []);
}
