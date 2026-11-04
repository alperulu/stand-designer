import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { CARPET_THICKNESS, cellInScene, cellKey, sceneBounds } from '../../model/geometry';
import type { Cell } from '../../model/types';
import { useEditor } from '../../state/store';

type Mode = 'add' | 'remove';
type Drag = { start: Cell; current: Cell; mode: Mode };

const ADD_COLOR = '#22c55e';
const REMOVE_COLOR = '#ef4444';
const OVERLAY_Y = CARPET_THICKNESS + 0.003;
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** Başlangıç ve güncel kare arasındaki dikdörtgen (uçlar dahil). */
function rectOf(a: Cell, b: Cell) {
  return {
    minX: Math.min(a.x, b.x),
    maxX: Math.max(a.x, b.x),
    minZ: Math.min(a.z, b.z),
    maxZ: Math.max(a.z, b.z),
  };
}

function rectCells(a: Cell, b: Cell): Cell[] {
  const r = rectOf(a, b);
  const cells: Cell[] = [];
  for (let x = r.minX; x <= r.maxX; x++) for (let z = r.minZ; z <= r.maxZ; z++) cells.push({ x, z });
  return cells;
}

/** Tek düzlem, dikdörtgene ölçeklenmiş yarı saydam katman (100×100'de bile tek mesh). */
function Overlay({ a, b, color, opacity, outline }: { a: Cell; b: Cell; color: string; opacity: number; outline?: boolean }) {
  const r = rectOf(a, b);
  const w = r.maxX - r.minX + 1;
  const d = r.maxZ - r.minZ + 1;
  const points = useMemo<[number, number, number][]>(
    () => [
      [r.minX, OVERLAY_Y, r.minZ],
      [r.minX + w, OVERLAY_Y, r.minZ],
      [r.minX + w, OVERLAY_Y, r.minZ + d],
      [r.minX, OVERLAY_Y, r.minZ + d],
      [r.minX, OVERLAY_Y, r.minZ],
    ],
    [r.minX, r.minZ, w, d],
  );
  return (
    <group>
      <mesh
        position={[r.minX + w / 2, OVERLAY_Y, r.minZ + d / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[w, d, 1]}
        renderOrder={10}
        raycast={() => null}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {outline && <Line points={points} color={color} lineWidth={2} depthWrite={false} renderOrder={11} raycast={() => null} />}
    </group>
  );
}

/** Zemin / silgi aracı: tıkla veya sürükle → dikdörtgen halı ekle/kaldır (RFP FR-2.1, FR-2.5). */
export function FloorTool() {
  const tool = useEditor((s) => s.tool);
  const scene = useEditor((s) => s.design.scene);
  const floorCells = useEditor((s) => s.design.floor.cells);
  const addCells = useEditor((s) => s.addCells);
  const removeCells = useEditor((s) => s.removeCells);

  const active = tool === 'floor' || tool === 'erase';
  const bounds = sceneBounds(scene);
  const carpet = useMemo(() => new Set(floorCells.map(cellKey)), [floorCells]);

  const [hover, setHover] = useState<Cell | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  // Pencere dinleyicileri en güncel sürükleme durumunu ref'ten okur.
  const dragRef = useRef<Drag | null>(null);
  const setDrag = useCallback((d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  }, []);

  /** Işını y=0 düzlemiyle kesip kareye çevirir; clamp: sürükleme sahne dışına taşarsa kenara yapıştır. */
  const cellFromRay = (ray: THREE.Ray, clamp: boolean): Cell | null => {
    const p = ray.intersectPlane(GROUND, new THREE.Vector3());
    if (!p) return null;
    let c = { x: Math.floor(p.x), z: Math.floor(p.z) };
    if (clamp) {
      c = {
        x: Math.min(bounds.maxX - 1, Math.max(bounds.minX, c.x)),
        z: Math.min(bounds.maxZ - 1, Math.max(bounds.minZ, c.z)),
      };
    }
    return cellInScene(c, scene) ? c : null;
  };

  const commit = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    setDrag(null);
    const cells = rectCells(d.start, d.current);
    if (d.mode === 'add') addCells(cells);
    else removeCells(cells);
  }, [addCells, removeCells, setDrag]);

  // Bırakma her yerde biter; Escape / pointercancel iptal eder.
  useEffect(() => {
    if (!active) return;
    const onUp = (e: PointerEvent) => {
      if (e.button === 0) commit();
    };
    const onCancel = () => setDrag(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrag(null);
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    };
  }, [active, commit, setDrag]);

  // Araç değişince yarım sürüklemeyi ve imleci temizle.
  useEffect(() => {
    if (active) return;
    setDrag(null);
    setHover(null);
  }, [active, setDrag]);
  useEffect(() => () => void (document.body.style.cursor = ''), []);
  useEffect(() => {
    if (!active) document.body.style.cursor = '';
  }, [active]);

  if (!active) return null;

  const modeAt = (c: Cell): Mode => (tool === 'erase' || carpet.has(cellKey(c)) ? 'remove' : 'add');

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const c = cellFromRay(e.ray, false);
    if (!c) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ start: c, current: c, mode: modeAt(c) });
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const d = dragRef.current;
    if (d) {
      const c = cellFromRay(e.ray, true);
      if (c && (c.x !== d.current.x || c.z !== d.current.z)) setDrag({ ...d, current: c });
      return;
    }
    const c = cellFromRay(e.ray, false);
    setHover((h) => (c && h && h.x === c.x && h.z === c.z ? h : c));
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    commit();
  };

  const w = bounds.maxX - bounds.minX;
  const d = bounds.maxZ - bounds.minZ;

  return (
    <group>
      {/* Görünmez seçim düzlemi: renk yazmaz ama ışın alır */}
      <mesh
        position={[bounds.minX + w / 2, 0, bounds.minZ + d / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        onPointerOver={() => (document.body.style.cursor = 'crosshair')}
        onPointerOut={() => {
          document.body.style.cursor = '';
          setHover(null);
        }}
      >
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
      </mesh>

      {drag ? (
        <Overlay
          a={drag.start}
          b={drag.current}
          color={drag.mode === 'add' ? ADD_COLOR : REMOVE_COLOR}
          opacity={0.35}
          outline
        />
      ) : (
        hover && (
          <Overlay a={hover} b={hover} color={modeAt(hover) === 'add' ? ADD_COLOR : REMOVE_COLOR} opacity={0.25} />
        )
      )}
    </group>
  );
}
