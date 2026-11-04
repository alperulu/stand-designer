import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { type ComponentRef, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Cell } from '../model/types';
import { useEditor, type ViewPreset } from '../state/store';

type Vec3 = [number, number, number];

/** Kadraja alınacak kutu (metre). Zemin y = 0'dan `height`'e kadar. */
export type FocusBox = { minX: number; maxX: number; minZ: number; maxZ: number; height: number };

export type CameraView = { eye: Vec3; target: Vec3 };

const MARGIN = 1.15;
const ANIM_SECONDS = 0.6;
/** Kamera zemin altına inmesin (FR-9.4); ön/yan görünüm de bu sınırın içinde kalmalı. */
const MAX_POLAR = Math.PI / 2 - 0.04;
const HORIZONTAL_TILT = 0.05;

/** Halı karelerinin sınırlayıcı kutusu; halı yoksa sahne merkezinde 3×3 m. */
export function focusBox(cells: Cell[], wallHeight: number): FocusBox {
  if (!cells.length) return { minX: -1.5, maxX: 1.5, minZ: -1.5, maxZ: 1.5, height: wallHeight };
  const xs = cells.map((c) => c.x);
  const zs = cells.map((c) => c.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs) + 1,
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs) + 1,
    height: wallHeight,
  };
}

/**
 * Hedeften `dir` yönünde, kutunun 8 köşesi dikey ve yatay görüş açısına sığacak en kısa mesafe.
 * Köşe kamera uzayında: yatay x, dikey y, derinlik D + q·f (f = −dir).
 */
function fitDistance(box: FocusBox, target: THREE.Vector3, dir: THREE.Vector3, fov: number, aspect: number) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov) / 2) / MARGIN;
  const tanH = tanV * aspect;
  const f = dir.clone().negate();
  const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
  const u = new THREE.Vector3().crossVectors(r, f);
  const q = new THREE.Vector3();
  let d = 0;
  for (const x of [box.minX, box.maxX])
    for (const y of [0, box.height])
      for (const z of [box.minZ, box.maxZ]) {
        q.set(x, y, z).sub(target);
        const depth = q.dot(f);
        d = Math.max(d, Math.abs(q.dot(r)) / tanH - depth, Math.abs(q.dot(u)) / tanV - depth);
      }
  return d;
}

/** Hazır görünüm için göz ve hedef noktası (saf fonksiyon). */
export function viewFor(preset: ViewPreset, box: FocusBox, fov: number, aspect: number): CameraView {
  const cx = (box.minX + box.maxX) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  const s = Math.sin(HORIZONTAL_TILT);
  const c = Math.cos(HORIZONTAL_TILT);

  let target: THREE.Vector3;
  let dir: THREE.Vector3;
  switch (preset) {
    case 'top':
      // Tam tepeden bakışta OrbitControls bozulur → çok küçük z sapması
      target = new THREE.Vector3(cx, 0, cz);
      dir = new THREE.Vector3(0, 1, 0.001);
      break;
    case 'front':
      // Yatay bakış; polar sınırını aşmamak için hafif yukarıdan
      target = new THREE.Vector3(cx, box.height / 2, cz);
      dir = new THREE.Vector3(0, s, c);
      break;
    case 'side':
      target = new THREE.Vector3(cx, box.height / 2, cz);
      dir = new THREE.Vector3(c, s, 0);
      break;
    default:
      // Perspektif / odaklan: sağ-önden çapraz üst açı
      target = new THREE.Vector3(cx, Math.min(0.9, box.height / 2), cz);
      dir = new THREE.Vector3(0.55, 0.5, 0.78);
  }
  dir.normalize();
  const eye = target.clone().addScaledVector(dir, fitDistance(box, target, dir, fov, aspect));
  return { eye: eye.toArray(), target: target.toArray() };
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

type Anim = { fromOffset: THREE.Vector3; toOffset: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; t: number };

export function CameraRig() {
  const tool = useEditor((s) => s.tool);
  const scene = useEditor((s) => s.design.scene);
  const nonce = useEditor((s) => s.viewRequest.nonce);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const anim = useRef<Anim | null>(null);
  const handledNonce = useRef(nonce);

  const maxDistance = 1.2 * Math.max(scene.width, scene.depth) + 10;

  // Seçim aracında sol tuş döndürür; çizim araçlarında sol tuş araca kalır
  // (LEFT verilmez → OrbitControls o tuşu yok sayar), orta kaydırır, sağ döndürür.
  const mouseButtons = useMemo(
    () =>
      tool === 'select'
        ? { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
        : { MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE },
    [tool],
  );

  /** Mevcut tasarım için istenen görünümü hesaplar; mesafe kontrol sınırlarına kırpılır. */
  const compute = (preset: ViewPreset) => {
    const { design } = useEditor.getState();
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 35;
    // Henüz dikey eleman yoksa yalnızca halı kadraja alınır
    const hasVertical = design.walls.length > 0 || design.fascia.edges.length > 0 || design.elements.length > 0;
    const box = focusBox(design.floor.cells, hasVertical ? design.wallHeight : 0.3);
    const view = viewFor(preset, box, fov, size.width / size.height);
    const target = new THREE.Vector3(...view.target);
    const offset = new THREE.Vector3(...view.eye).sub(target);
    offset.setLength(THREE.MathUtils.clamp(offset.length(), 1.5, maxDistance));
    return { target, offset };
  };

  // İlk karede doğrudan perspektif görünüme atla
  useLayoutEffect(() => {
    const c = controls.current;
    if (!c) return;
    const { target, offset } = compute('perspective');
    c.target.copy(target);
    camera.position.copy(target).add(offset);
    c.update();
  }, []);

  // Görünüm isteği → yumuşak geçiş
  useEffect(() => {
    const c = controls.current;
    if (!c || nonce === handledNonce.current) return;
    handledNonce.current = nonce;
    const { preset } = useEditor.getState().viewRequest;
    const { target, offset } = compute(preset);
    anim.current = {
      fromOffset: camera.position.clone().sub(c.target),
      toOffset: offset,
      fromTarget: c.target.clone(),
      toTarget: target,
      t: 0,
    };
  }, [nonce]);

  // Kullanıcı kamerayı tutarsa geçiş iptal
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const cancel = () => (anim.current = null);
    c.addEventListener('start', cancel);
    return () => c.removeEventListener('start', cancel);
  }, []);

  useFrame((_, delta) => {
    const a = anim.current;
    const c = controls.current;
    if (!a || !c) return;
    a.t = Math.min(1, a.t + delta / ANIM_SECONDS);
    const e = easeInOut(a.t);
    // Yön ve uzunluk ayrı enterpolasyon → kamera hedefe yaklaşıp sapmaz
    const len = THREE.MathUtils.lerp(a.fromOffset.length(), a.toOffset.length(), e);
    const dir = a.fromOffset.clone().normalize().lerp(a.toOffset.clone().normalize(), e).normalize();
    c.target.lerpVectors(a.fromTarget, a.toTarget, e);
    camera.position.copy(c.target).addScaledVector(dir, len);
    c.update();
    if (a.t >= 1) anim.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      maxPolarAngle={MAX_POLAR}
      minDistance={1.5}
      maxDistance={maxDistance}
      mouseButtons={mouseButtons}
    />
  );
}
