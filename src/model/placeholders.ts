// Faz 0 için örnek giydirme grafikleri. Gerçek kullanımda kullanıcının yüklediği görsel gelir.

type Variant = 'backwall' | 'lightbox' | 'desk';

const SIZES: Record<Variant, [number, number]> = {
  backwall: [3000, 2300],
  lightbox: [700, 1000],
  desk: [1000, 1000],
};

export function placeholderGraphic(variant: Variant): string {
  const [w, h] = SIZES[variant];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // Çapraz renk blokları
  const s = Math.min(w, h);
  ctx.fillStyle = '#e9f5ee';
  ctx.beginPath();
  ctx.moveTo(w * 0.45, h);
  ctx.lineTo(w, h * 0.25);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1f9d55';
  ctx.fillRect(0, h * 0.86, w, h * 0.14);

  // Logo işareti
  const lx = variant === 'backwall' ? w * 0.18 : w / 2;
  const ly = variant === 'backwall' ? h * 0.2 : h * 0.32;
  const r = s * (variant === 'backwall' ? 0.08 : 0.16);
  ctx.fillStyle = '#f08a24';
  ctx.beginPath();
  ctx.arc(lx - r * 0.25, ly, r, Math.PI * 0.5, Math.PI * 1.5);
  ctx.fill();
  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.arc(lx + r * 0.25, ly, r, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.fill();

  ctx.fillStyle = '#1f2937';
  ctx.textAlign = variant === 'backwall' ? 'left' : 'center';
  ctx.textBaseline = 'middle';
  const tx = variant === 'backwall' ? lx + r * 1.6 : w / 2;
  ctx.font = `700 ${Math.round(s * (variant === 'backwall' ? 0.09 : 0.1))}px Inter, Arial, sans-serif`;
  ctx.fillText('MARKANIZ', tx, ly);

  if (variant === 'backwall') {
    ctx.fillStyle = '#f08a24';
    const bw = w * 0.62;
    const bh = h * 0.08;
    ctx.fillRect((w - bw) / 2, h * 0.38, bw, bh);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.round(bh * 0.5)}px Inter, Arial, sans-serif`;
    ctx.fillText('GİYDİRME GRAFİK ALANI — 3 m × 2.3 m', w / 2, h * 0.38 + bh / 2);
    ctx.fillStyle = '#1f9d55';
    for (let i = 0; i < 3; i++) {
      const cx = w * (0.32 + i * 0.18);
      ctx.beginPath();
      ctx.roundRect(cx - w * 0.07, h * 0.52, w * 0.14, h * 0.27, 24);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#1f2937';
    ctx.font = `600 ${Math.round(s * 0.055)}px Inter, Arial, sans-serif`;
    ctx.fillText('MARKA SLOGANINIZ', w / 2, h * 0.62);
  }

  return canvas.toDataURL('image/png');
}
