import { useCallback, useEffect, useRef } from 'react';
import { Edges } from '@react-three/drei';
import { useEditor } from '../state/store';

export const SELECTION_COLOR = '#1f6feb';

/** Kamera sürüklemesini tıklamadan ayıran eşik (piksel). */
export const CLICK_TOLERANCE = 5;

const noRaycast = () => null;

/**
 * Boşluğa tıklayınca seçimi temizler (FR-8.1). Yalnızca seçim aracında, sol tuşta,
 * Shift'siz ve sürükleme değilse çalışır.
 * Bağlantı: Canvas'ı render eden bileşende `const onMiss = useClearSelectionOnMiss();`
 * → `<Canvas onPointerMissed={onMiss}>`.
 */
export function useClearSelectionOnMiss(): (e: MouseEvent) => void {
  const down = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) down.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);

  return useCallback((e: MouseEvent) => {
    const { tool, selection, clearSelection } = useEditor.getState();
    if (tool !== 'select' || e.button !== 0 || e.shiftKey || !selection.length) return;
    const d = down.current;
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) >= CLICK_TOLERANCE) return;
    clearSelection();
  }, []);
}

/**
 * Panel grubunun yerel koordinatlarında (panel yerel +x boyunca, y=0 tabanda) seçim/üzerine gelme katmanı.
 * Işın almaz, gölge atmaz, derinlik yazmaz.
 */
export function PanelHighlight({
  length,
  height,
  thickness,
  mode,
}: {
  length: number;
  height: number;
  thickness: number;
  mode: 'selected' | 'hover';
}) {
  const selected = mode === 'selected';
  return (
    <mesh position={[0, height / 2, 0]} raycast={noRaycast} renderOrder={5}>
      <boxGeometry args={[length, height, thickness]} />
      <meshBasicMaterial
        color={SELECTION_COLOR}
        transparent
        opacity={selected ? 0.16 : 0.07}
        depthWrite={false}
      />
      {selected && (
        <Edges color={SELECTION_COLOR} lineWidth={1.5} threshold={15} raycast={noRaycast} renderOrder={6} />
      )}
    </mesh>
  );
}
