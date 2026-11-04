import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { useEditor, type ExportBackground, type ExportFormat } from '../state/store';

export type CaptureRequest = {
  width: number;
  height: number;
  format: ExportFormat;
  background: ExportBackground;
};
export type CaptureFn = (req: CaptureRequest) => Promise<Blob>;

/** Tümü 16:9 (FR-10.3). Kadraj kılavuzu ve yakalama bu oranı kullanır. */
export const EXPORT_SIZES = [
  { label: '1920 × 1080', short: '1080p', width: 1920, height: 1080 },
  { label: '2560 × 1440', short: '1440p', width: 2560, height: 1440 },
  { label: '3840 × 2160 (4K)', short: '4K', width: 3840, height: 2160 },
] as const;

export const BACKGROUND_LABELS: Record<ExportBackground, string> = {
  hall: 'Salon zemini',
  white: 'Beyaz',
  transparent: 'Şeffaf (PNG)',
};

/**
 * Süper örnekleme (FR-10.6): 1080p 2×, 1440p 1.5× büyüklükte çizilip küçültülür; 4K 1×.
 * Her boyutta GPU'nun çizdiği alan 4K'yı aşmaz → süre ve bellek tüm boyutlarda aynı kalır.
 */
const MAX_RENDER_WIDTH = 3840;
/** Boyut/arka plan değişince: React commit + shader derleme + gölge/AO oturması için beklenen kare sayısı. */
const SETTLE_FRAMES = 6;
const JPG_QUALITY = 0.92;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Hedef 16:9 kadrajı, görünümün içine sığan en büyük ortalanmış 16:9 dikdörtgenle aynı olacak şekilde dikey FOV.
 *
 * Birim uzaklıkta yarı genişlik = tan(fov/2)·en-boy oranı.
 * - Görünüm oranı A < hedef T (görünüm daha dar/uzun): kadraj görünümün tam genişliğini, daha az yüksekliğini
 *   kapsar. Export'un yarı genişliği görünümünkine eşit olmalı:
 *     tan(fov'/2)·T = tan(fov/2)·A  ⇒  fov' = 2·atan(tan(fov/2)·A/T)   (A/T < 1 ⇒ fov' < fov)
 *   Kontrol: dikey yarı yükseklik tan(fov'/2) = tan(fov/2)·A/T → ekranda yüksekliğin A/T'si = w/T px,
 *   yani tam olarak ExportFrame'in çizdiği (w × w/T) dikdörtgen.
 * - A ≥ T: kadraj görünümün tam yüksekliğini kaplar (h·T × h); aynı dikey FOV zaten bunu verir → fov değişmez.
 */
export function frameFov(fovDeg: number, viewAspect: number, targetAspect: number): number {
  if (viewAspect >= targetAspect) return fovDeg;
  const half = THREE.MathUtils.degToRad(fovDeg) / 2;
  return THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(half) * viewAspect) / targetAspect));
}

/**
 * Canvas içinde çalışır; görünen kameradan, ekrandaki 16:9 kadrajın içini istenen çözünürlükte alır (FR-10).
 * Tuvali geçici olarak hedef (süper örneklemeli) boyuta getirir, store.capture ile sahneye export ayarlarını
 * (arka plan, grid, AO kalitesi) uygular, birkaç kare bekler, 2B tuvale küçültüp kodlar, sonra her şeyi geri alır.
 */
export function CaptureBridge({ onReady }: { onReady: (fn: CaptureFn) => void }) {
  const get = useThree((s) => s.get);

  useEffect(() => {
    onReady(async ({ width, height, format, background }) => {
      const state = get();
      const { gl, camera } = state;
      const prev = { ...state.size, dpr: state.viewport.dpr };
      const editor = useEditor.getState();
      const prevSelection = editor.selection;
      const prevTool = editor.tool;
      const persp = camera instanceof THREE.PerspectiveCamera ? camera : null;
      const prevFov = persp?.fov;

      const glc = gl.getContext();
      const maxSize: number = Math.min(glc.getParameter(glc.MAX_TEXTURE_SIZE), glc.getParameter(glc.MAX_RENDERBUFFER_SIZE));
      let scale = Math.max(1, MAX_RENDER_WIDTH / width);
      if (Math.max(width, height) * scale > maxSize) scale = 1;
      const rw = Math.round(width * scale);
      const rh = Math.round(height * scale);

      const out = document.createElement('canvas');
      out.width = width;
      out.height = height;
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('Görsel oluşturulamadı');

      try {
        // Seçim vurgusu ve araç önizlemeleri görsele girmesin (FR-10.4)
        editor.clearSelection();
        editor.setTool('select');
        document.body.style.cursor = '';
        editor.setCapture({ background, showGrid: editor.showGrid });
        state.setDpr(1);
        state.setSize(rw, rh, prev.top, prev.left);
        if (persp && prevFov !== undefined) {
          persp.fov = frameFov(prevFov, prev.width / prev.height, width / height);
          persp.aspect = rw / rh;
          persp.updateProjectionMatrix();
        }
        for (let i = 0; i < SETTLE_FRAMES; i++) {
          await nextFrame();
          // Canvas'ın yeniden yapılandırması dpr'yi geri almışsa tekrar 1 (App de yakalamada dpr=1 verir)
          if (get().viewport.dpr !== 1) state.setDpr(1);
        }

        // Beyaz: şeffaf çizim saf beyaz üstüne bindirilir → arka plan tam #ffffff (ton eşleme beyazı griye çekmez)
        // (Salon zemini zaten opak; dolgu yalnızca JPG'de olası kenar alfa piksellerini beyaza oturtur.)
        if (background !== 'transparent') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(gl.domElement, 0, 0, width, height);
      } finally {
        if (persp && prevFov !== undefined) persp.fov = prevFov;
        state.setSize(prev.width, prev.height, prev.top, prev.left);
        state.setDpr(prev.dpr);
        if (persp) {
          persp.aspect = prev.width / prev.height;
          persp.updateProjectionMatrix();
        }
        editor.setCapture(null);
        editor.setTool(prevTool);
        editor.select(prevSelection);
      }

      const blob = await new Promise<Blob | null>((r) =>
        out.toBlob(r, format === 'jpg' ? 'image/jpeg' : 'image/png', format === 'jpg' ? JPG_QUALITY : undefined),
      );
      if (!blob) throw new Error('Görsel oluşturulamadı');
      return blob;
    });
  }, [get, onReady]);

  return null;
}

/** `<firma-adı-slug|stand>_<YYYY-MM-DD>.<png|jpg>` (FR-10.7). */
export function exportFileName(companyName: string, format: ExportFormat = 'png', date = new Date()): string {
  const slug = companyName
    .toLocaleLowerCase('tr')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'stand';
  const d = date.toISOString().slice(0, 10);
  return `${slug}_${d}.${format}`;
}
