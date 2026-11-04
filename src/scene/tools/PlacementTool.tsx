import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { CARPET_THICKNESS } from '../../model/geometry';
import {
  FOOTPRINTS,
  placementValid,
  snapSpot,
  snapStep,
  snapToWall,
  type ItemKind,
  type Vec2,
} from '../../model/placement';
import type { StandDesign } from '../../model/types';
import { useEditor } from '../../state/store';
import { CLICK_TOLERANCE } from '../SelectionLayer';

/** Kütüphaneden sürükle-bırak veri tipi (FR-7.1). Veri: ItemKind dizgesi. */
export const ITEM_DRAG_MIME = 'application/x-stand-item';

const VALID_COLOR = '#22c55e';
const INVALID_COLOR = '#ef4444';
const SPOT_COLOR = '#1f2328';
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const noRaycast = () => null;

const HEIGHTS: Record<ItemKind, number> = {
  spot: 0.12,
  bin: 0.32,
  'power-strip': 0.05,
  'table-set': 0.75,
  'brochure-stand': 1.4,
  lightbox: 1,
  desk: 1,
};

/** Ekipmanın yaklaşık yüksekliği (m) — hayalet kutu ve benzeri göstergeler için. */
export function itemHeight(kind: ItemKind): number {
  return HEIGHTS[kind];
}

const isItemKind = (s: string): s is ItemKind => Object.prototype.hasOwnProperty.call(FOOTPRINTS, s);

// dragover sırasında getData okunamaz (yalnızca tipler) → sürüklenen tür burada tutulur.
let draggedKind: ItemKind | null = null;

/**
 * Kütüphane öğesinin onDragStart'ında çağrılır: veriyi yazar ve dragover'da hayalet
 * gösterilebilsin diye türü hatırlar. Ek tip (`…-<kind>`) aynı bilgiyi sekmeler arası da taşır.
 */
export function beginItemDrag(dt: DataTransfer, kind: ItemKind) {
  dt.setData(ITEM_DRAG_MIME, kind);
  dt.setData(`${ITEM_DRAG_MIME}-${kind}`, kind);
  dt.effectAllowed = 'copy';
  draggedKind = kind;
}

/** Sürüklemedeki türü tiplerden (veya beginItemDrag'den) çıkarır. */
function kindFromTypes(dt: DataTransfer): ItemKind | null {
  const prefix = `${ITEM_DRAG_MIME}-`;
  for (const t of Array.from(dt.types)) {
    if (!t.startsWith(prefix)) continue;
    const k = t.slice(prefix.length);
    if (isItemKind(k)) return k;
  }
  return draggedKind;
}

type Pose = { position: Vec2; rotationDeg: number; valid: boolean };

/** Ham zemin noktasından yerleşim: zemin ekipmanı ızgara + duvara yaslama, spot kenara yapışma. */
function poseFor(design: StandDesign, kind: ItemKind, raw: Vec2, rotationDeg: number): Pose | null {
  if (kind === 'spot') {
    const s = snapSpot(design, raw);
    return s ? { ...s, valid: true } : null;
  }
  const snapped = { x: snapStep(raw.x), z: snapStep(raw.z) };
  const position = snapToWall(design, kind, snapped, rotationDeg);
  return { position, rotationDeg, valid: placementValid(design, kind, position, rotationDeg) };
}

type Ghost = { kind: ItemKind; point: Vec2; rotationDeg: number };

const sameGhost = (a: Ghost | null, b: Ghost | null) =>
  a === b ||
  (!!a && !!b && a.kind === b.kind && a.rotationDeg === b.rotationDeg && a.point.x === b.point.x && a.point.z === b.point.z);

/** Yarı saydam hayalet: zemin ekipmanı için iz × yükseklik kutusu + ön (+z) oku. */
function FloorGhost({ kind, valid }: { kind: ItemKind; valid: boolean }) {
  const f = FOOTPRINTS[kind];
  if (!f) return null;
  const h = HEIGHTS[kind];
  const color = valid ? VALID_COLOR : INVALID_COLOR;
  const arrow = Math.min(0.22, Math.max(0.12, f.w * 0.35));
  return (
    <group position={[0, CARPET_THICKNESS, 0]}>
      <mesh position={[0, h / 2, 0]} renderOrder={10} raycast={noRaycast}>
        {f.round ? <cylinderGeometry args={[f.w / 2, f.w / 2, h, 48]} /> : <boxGeometry args={[f.w, h, f.d]} />}
        <meshBasicMaterial color={color} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      {/* Ön yüz şeridi */}
      <mesh position={[0, h / 2, f.d / 2 + 0.003]} renderOrder={11} raycast={noRaycast}>
        <planeGeometry args={[f.w, h]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* Zeminde öne bakan ok (koni +y → +z'ye yatırılır) */}
      <mesh
        position={[0, 0.004, f.d / 2 + 0.06 + arrow / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[1, 1, 0.05]}
        renderOrder={11}
        raycast={noRaycast}
      >
        <coneGeometry args={[arrow * 0.5, arrow, 3]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Spot hayaleti: duvar üstünde küçük gövde + içeri uzanan kol. */
function SpotGhost({ wallHeight, valid }: { wallHeight: number; valid: boolean }) {
  const color = valid ? SPOT_COLOR : INVALID_COLOR;
  return (
    <group position={[0, wallHeight, 0]}>
      <mesh position={[0, 0.03, 0]} renderOrder={10} raycast={noRaycast}>
        <boxGeometry args={[0.08, 0.06, 0.08]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.03, 0.15]} renderOrder={10} raycast={noRaycast}>
        <boxGeometry args={[0.025, 0.025, 0.3]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.01, 0.3]} renderOrder={10} raycast={noRaycast}>
        <boxGeometry args={[0.07, 0.06, 0.07]} />
        <meshBasicMaterial color={valid ? VALID_COLOR : INVALID_COLOR} transparent opacity={0.8} depthWrite={false} />
      </mesh>
    </group>
  );
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');

/**
 * Ekipman yerleştirme (FR-7.1, 12.2, 12.3): kütüphaneden seçilen öğe imleci izler (R: +90°, Shift+R: +15°);
 * tık yerleştirir ve moddan çıkar, Shift+tık yerleştirip modda kalır; Escape / sağ tık iptal.
 * Ayrıca kütüphaneden sürükle-bırak ile ekleme.
 */
export function PlacementTool() {
  const placing = useEditor((s) => s.placing);
  const design = useEditor((s) => s.design);
  const get = useThree((s) => s.get);

  const [ghost, setGhostState] = useState<Ghost | null>(null);
  const ghostRef = useRef<Ghost | null>(null);
  const setGhost = useCallback((g: Ghost | null) => {
    if (sameGhost(ghostRef.current, g)) return;
    ghostRef.current = g;
    setGhostState(g);
  }, []);

  const [rotation, setRotationState] = useState(0);
  const rotationRef = useRef(0);
  const setRotation = useCallback((r: number) => {
    rotationRef.current = r;
    setRotationState(r);
  }, []);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  /**
   * Ekran noktasını güncel kamerayla yatay düzleme indirir: zemin ekipmanı için y=0,
   * spot için duvar üst kenarı yüksekliği (imleç duvarın tepesindeyken doğru kenarı bulsun).
   */
  const pointAt = useCallback(
    (clientX: number, clientY: number, kind?: ItemKind): Vec2 | null => {
      const { camera, gl } = get();
      const r = gl.domElement.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const plane = kind === 'spot' ? new THREE.Plane(new THREE.Vector3(0, 1, 0), -useEditor.getState().design.wallHeight) : GROUND;
      const p = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      return p ? { x: p.x, z: p.z } : null;
    },
    [get, raycaster],
  );

  // Hayaleti 0.1 m adımlarla günceller (gereksiz render olmasın).
  const ghostAt = useCallback(
    (kind: ItemKind, clientX: number, clientY: number, rotationDeg: number) => {
      const p = pointAt(clientX, clientY, kind);
      setGhost(p ? { kind, point: { x: snapStep(p.x), z: snapStep(p.z) }, rotationDeg } : null);
    },
    [pointAt, setGhost],
  );

  const setCursor = useCallback(
    (c: string) => {
      get().gl.domElement.style.cursor = c;
    },
    [get],
  );

  // A) Yerleştirme modu: imleç takibi, tık, sağ tık, R / Escape.
  useEffect(() => {
    if (!placing) return;
    const canvas = get().gl.domElement;
    const host = canvas.parentElement ?? canvas;
    let down: { x: number; y: number } | null = null;
    let swallowClick = false;
    let last: { x: number; y: number } | null = null;

    const refresh = () => {
      if (!last) return;
      ghostAt(placing, last.x, last.y, rotationRef.current);
      const g = ghostRef.current;
      const pose = g && poseFor(useEditor.getState().design, g.kind, g.point, g.rotationDeg);
      setCursor(pose ? (pose.valid ? 'copy' : 'not-allowed') : '');
    };

    const onMove = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
      refresh();
    };
    const onLeave = () => {
      last = null;
      setGhost(null);
      setCursor('');
    };

    // Kanvastaki basışı kamera ve seçim dinleyicilerinden önce yakalar (yakalama evresi).
    const onDown = (e: PointerEvent) => {
      if (e.target !== canvas) return;
      if (e.button === 0) {
        e.stopPropagation();
        e.preventDefault();
        down = { x: e.clientX, y: e.clientY };
      } else if (e.button === 2) {
        e.stopPropagation();
        useEditor.getState().setPlacing(null);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0 || !down) return;
      const d = down;
      down = null;
      if (e.target !== canvas) return;
      e.stopPropagation();
      swallowClick = true;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) >= CLICK_TOLERANCE) return;
      const p = pointAt(e.clientX, e.clientY, placing);
      if (!p) return;
      const { design: current, addItem, setPlacing } = useEditor.getState();
      const pose = poseFor(current, placing, p, rotationRef.current);
      if (!pose?.valid) return;
      addItem(placing, pose.position, pose.rotationDeg);
      if (!e.shiftKey) setPlacing(null);
      else refresh();
    };
    const onClick = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
    };
    const onContextMenu = (e: MouseEvent) => {
      if (e.target === canvas) e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        useEditor.getState().setPlacing(null);
      } else if (e.code === 'KeyR') {
        e.stopPropagation();
        e.preventDefault();
        setRotation((rotationRef.current + (e.shiftKey ? 15 : 90)) % 360);
        refresh();
      }
    };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    host.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    host.addEventListener('click', onClick, true);
    host.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      host.removeEventListener('click', onClick, true);
      host.removeEventListener('contextmenu', onContextMenu, true);
      window.removeEventListener('keydown', onKey, true);
      setGhost(null);
      setCursor('');
    };
  }, [placing, get, ghostAt, pointAt, setGhost, setCursor, setRotation]);

  // Moddan çıkınca döndürmeyi sıfırla.
  useEffect(() => {
    if (!placing) setRotation(0);
  }, [placing, setRotation]);

  // B) Kütüphaneden HTML sürükle-bırak.
  useEffect(() => {
    const canvas = get().gl.domElement;
    const host = canvas.parentElement ?? canvas;

    const onDragOver = (e: DragEvent) => {
      const dt = e.dataTransfer;
      if (!dt || !Array.from(dt.types).includes(ITEM_DRAG_MIME)) return;
      e.preventDefault();
      dt.dropEffect = 'copy';
      const kind = kindFromTypes(dt);
      if (kind) ghostAt(kind, e.clientX, e.clientY, 0);
    };
    const onDragLeave = (e: DragEvent) => {
      const to = e.relatedTarget;
      if (to instanceof Node && host.contains(to)) return;
      setGhost(null);
    };
    const onDrop = (e: DragEvent) => {
      const dt = e.dataTransfer;
      if (!dt || !Array.from(dt.types).includes(ITEM_DRAG_MIME)) return;
      e.preventDefault();
      setGhost(null);
      draggedKind = null;
      const kind = dt.getData(ITEM_DRAG_MIME);
      if (!isItemKind(kind)) return;
      const p = pointAt(e.clientX, e.clientY, kind);
      if (!p) return;
      const { design: current, addItem } = useEditor.getState();
      const pose = poseFor(current, kind, p, 0);
      if (pose?.valid) addItem(kind, pose.position, pose.rotationDeg);
    };
    const onDragEnd = () => {
      draggedKind = null;
      setGhost(null);
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
    };
  }, [get, ghostAt, pointAt, setGhost]);

  // Döndürme değişince hayaleti yeni açıyla tazele (yalnızca yerleştirme modunda).
  const shown = useMemo(() => {
    if (!ghost) return null;
    const rot = placing && ghost.kind === placing ? rotation : ghost.rotationDeg;
    const pose = poseFor(design, ghost.kind, ghost.point, rot);
    return { kind: ghost.kind, pose, point: ghost.point };
  }, [ghost, placing, rotation, design]);

  if (!shown) return null;
  const { kind, pose, point } = shown;

  if (kind === 'spot') {
    // Yakında kenar yoksa imleç hizasında kırmızı gösterge
    const pos = pose?.position ?? point;
    const rot = pose?.rotationDeg ?? 0;
    return (
      <group position={[pos.x, 0, pos.z]} rotation={[0, THREE.MathUtils.degToRad(rot), 0]}>
        <SpotGhost wallHeight={design.wallHeight} valid={!!pose} />
      </group>
    );
  }
  if (!pose) return null;
  return (
    <group position={[pose.position.x, 0, pose.position.z]} rotation={[0, THREE.MathUtils.degToRad(pose.rotationDeg), 0]}>
      <FloorGhost kind={kind} valid={pose.valid} />
    </group>
  );
}
