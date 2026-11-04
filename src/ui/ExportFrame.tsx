import { useEffect, useRef, useState } from 'react';
import { EXPORT_SIZES } from '../export/capture';
import { useEditor } from '../state/store';
import '../export/export.css';

/**
 * Görünümün üstünde 16:9 export kadrajı (FAZ-0 notu, FR-10.1): görünüme sığan en büyük ortalanmış hedef-oranlı
 * dikdörtgen; dışı karartılır. CaptureBridge tam olarak bu dikdörtgenin içini alır (bkz. frameFov).
 */
export function ExportFrame() {
  const show = useEditor((s) => s.showExportFrame);
  const capturing = useEditor((s) => s.capture !== null);
  const size = EXPORT_SIZES[useEditor((s) => s.exportSizeIndex)] ?? EXPORT_SIZES[0];
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox((b) => (b.width === width && b.height === height ? b : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const target = size.width / size.height;
  const view = box.height > 0 ? box.width / box.height : target;
  const w = view >= target ? box.height * target : box.width;
  const h = view >= target ? box.height : box.width / target;
  const visible = show && !capturing && w > 0 && h > 0;

  return (
    <div ref={ref} className="export-frame-layer" aria-hidden="true">
      {visible && (
        <div
          className="export-frame"
          style={{ width: w, height: h, left: (box.width - w) / 2, top: (box.height - h) / 2 }}
        >
          <span className="export-frame-label">
            {size.width} × {size.height}
          </span>
        </div>
      )}
    </div>
  );
}
