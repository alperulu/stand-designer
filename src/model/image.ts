// Yüklenen giydirme görselini proje içinde saklanabilir hale getirir (RFP §11: en fazla 4096 px).
const MAX_PX = 4096;
export const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/svg+xml';

export type ProcessedImage = { src: string; width: number; height: number; name: string };

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Görsel okunamadı'));
    img.src = src;
  });
}

/**
 * Dosyayı okur, uzun kenarı 4096 px'i aşıyorsa küçültür. SVG raster'a çevrilir (doku olarak kullanılacak).
 * Saydamlık varsa PNG, yoksa daha küçük olduğu için JPEG (kalite 0.9) saklanır.
 */
export async function processImageFile(file: File): Promise<ProcessedImage> {
  if (!ACCEPTED_IMAGE_TYPES.split(',').includes(file.type)) throw new Error('Yalnızca PNG, JPG veya SVG yüklenebilir.');
  const original = await readAsDataUrl(file);
  const img = await loadImage(original);
  const w0 = img.naturalWidth || 2048;
  const h0 = img.naturalHeight || 2048;
  const k = Math.min(1, MAX_PX / Math.max(w0, h0));
  const isSvg = file.type === 'image/svg+xml';
  if (k === 1 && !isSvg) return { src: original, width: w0, height: h0, name: file.name };

  // SVG'ler küçük doğal boyutlu olabilir; doku için uzun kenarı en az 2048 px'e büyütülür
  const scale = isSvg ? Math.max(k, Math.min(MAX_PX, 2048) / Math.max(w0, h0)) : k;
  const width = Math.round(w0 * scale);
  const height = Math.round(h0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, width, height);
  const keepAlpha = file.type !== 'image/jpeg';
  const src = keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
  return { src, width, height, name: file.name };
}
