import { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { create } from 'zustand';
import { imageById, useEditor } from '../state/store';

/** Görsel kütüphanesinden sürükle-bırak veri tipi. Veri: ImageAsset id'si. */
export const IMAGE_DRAG_MIME = 'application/x-stand-image';

// dragover sırasında getData okunamaz (yalnızca tipler) → sürüklenen görsel burada tutulur.
let draggedImageId: string | null = null;

/** Kütüphane küçük resminin onDragStart'ında çağrılır. */
export function beginImageDrag(dt: DataTransfer, imageId: string) {
  dt.setData(IMAGE_DRAG_MIME, imageId);
  dt.effectAllowed = 'copy';
  draggedImageId = imageId;
}

/** Görselin bırakılabileceği hedef: duvar giydirme çerçevesi ya da elemanın (lightbox/tezgâh) ön yüzü. */
export type ImageDropTarget = { kind: 'frame'; id: string } | { kind: 'element'; id: string };

/** Sürükleme sırasında imlecin altındaki geçici hedef (Walls/Elements vurgusu için). */
export const useImageDropTarget = create<{ target: ImageDropTarget | null }>()(() => ({ target: null }));

const sameTarget = (a: ImageDropTarget | null, b: ImageDropTarget | null) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);

function setTarget(target: ImageDropTarget | null) {
  if (!sameTarget(useImageDropTarget.getState().target, target)) useImageDropTarget.setState({ target });
}

/** Nesnede ya da atalarında userData.frameId / userData.elementId arar. */
function targetOf(obj: THREE.Object3D): ImageDropTarget | null {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
    const { frameId, elementId } = o.userData as { frameId?: unknown; elementId?: unknown };
    if (typeof frameId === 'string') return { kind: 'frame', id: frameId };
    if (typeof elementId === 'string') return { kind: 'element', id: elementId };
  }
  return null;
}

/** Ekranda görünen, ışını kapatan bir yüzey mi (gizli yardımcı düzlemler, çizgiler, saydamlar hariç). */
function occludes(obj: THREE.Object3D): boolean {
  const flags = obj as THREE.Object3D & { isLine?: boolean; isPoints?: boolean; isLineSegments2?: boolean; isSprite?: boolean };
  if (flags.isLine || flags.isPoints || flags.isLineSegments2 || flags.isSprite) return false;
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (!o.visible) return false;
  if (obj instanceof THREE.Mesh) {
    const mats: THREE.Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
    if (mats.every((m) => !m.visible || (m.transparent && m.opacity < 0.3))) return false;
  }
  return true;
}

const raycaster = new THREE.Raycaster();
raycaster.params.Line = { threshold: 0.01 };
raycaster.params.Points = { threshold: 0.01 };
const ndc = new THREE.Vector2();

const hasImageType = (dt: DataTransfer | null): dt is DataTransfer => !!dt && Array.from(dt.types).includes(IMAGE_DRAG_MIME);

/**
 * Kütüphaneden sürüklenen görseli 3B görünümde çerçeveye ya da eleman ön yüzüne bırakma.
 * Hedef, güncel kamerayla sahneye ışın atılarak bulunur; ilk görünür yüzey hedef değilse bırakılamaz.
 */
export function ImageDrop() {
  const get = useThree((s) => s.get);

  useEffect(() => {
    const { gl } = get();
    const canvas = gl.domElement;
    const host = canvas.parentElement ?? canvas;

    const pick = (clientX: number, clientY: number): ImageDropTarget | null => {
      const { camera, scene } = get();
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      for (const hit of raycaster.intersectObject(scene, true)) {
        const t = targetOf(hit.object);
        if (t) return t;
        if (occludes(hit.object)) return null;
      }
      return null;
    };

    const onDragOver = (e: DragEvent) => {
      const dt = e.dataTransfer;
      if (!hasImageType(dt)) return;
      e.preventDefault();
      const t = pick(e.clientX, e.clientY);
      setTarget(t);
      dt.dropEffect = t ? 'copy' : 'none';
    };
    const onDragLeave = (e: DragEvent) => {
      const to = e.relatedTarget;
      if (to instanceof Node && host.contains(to)) return;
      setTarget(null);
    };
    const onDrop = (e: DragEvent) => {
      const dt = e.dataTransfer;
      if (!hasImageType(dt)) return;
      e.preventDefault();
      setTarget(null);
      const imageId = dt.getData(IMAGE_DRAG_MIME) || draggedImageId;
      draggedImageId = null;
      const t = pick(e.clientX, e.clientY);
      const state = useEditor.getState();
      if (!t || !imageId || !imageById(state.design, imageId)) return;
      if (t.kind === 'frame') {
        if (!state.design.graphics.some((g) => g.id === t.id)) return;
        state.setFrameImage([t.id], imageId);
      } else {
        if (!state.design.elements.some((el) => el.id === t.id)) return;
        state.setElementImage([t.id], imageId);
      }
      useEditor.getState().select([t.id]);
    };
    const onDragEnd = () => {
      draggedImageId = null;
      setTarget(null);
    };

    host.addEventListener('dragover', onDragOver);
    host.addEventListener('dragleave', onDragLeave);
    host.addEventListener('drop', onDrop);
    window.addEventListener('dragend', onDragEnd);
    return () => {
      host.removeEventListener('dragover', onDragOver);
      host.removeEventListener('dragleave', onDragLeave);
      host.removeEventListener('drop', onDrop);
      window.removeEventListener('dragend', onDragEnd);
      setTarget(null);
    };
  }, [get]);

  return null;
}
