import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import {
  CARPET_THICKNESS,
  PANEL_THICKNESS,
  POST_SIZE,
  edgeCenter,
  edgeKey,
  edgeRotation,
  sceneBounds,
} from '../../model/geometry';
import type { Edge, WallPanel } from '../../model/types';
import { edgeInScene, useEditor } from '../../state/store';

/** Grid köşesi (tam sayı x, z). */
type Vertex = { x: number; z: number };
type Drag = { start: Vertex; current: Vertex };

const PANEL_LENGTH = 1 - POST_SIZE;
const OVERLAY_Y = CARPET_THICKNESS + 0.003;
/** Sınır çizgisindeki köşe/kenarlar dışarıdan da yakalanabilsin diye seçim düzlemi biraz taşar. */
const PICK_MARGIN = 0.5;
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const VALID_COLOR = '#bfdbfe';
const INVALID_COLOR = '#ef4444';
const DOOR_COLOR = '#f59e0b';
const SOLID_COLOR = '#60a5fa';
const MARKER_COLOR = '#3b82f6';
const GHOST_OPACITY = 0.45;
const GHOST_ORDER = 12;

// Tüm hayalet paneller tek geometriyi paylaşır; yükseklik scale ile verilir.
const ghostGeometry = new THREE.BoxGeometry(PANEL_LENGTH, 1, PANEL_THICKNESS);
const ghostMaterials = new Map<string, THREE.MeshBasicMaterial>();
function ghostMaterial(color: string): THREE.MeshBasicMaterial {
  let m = ghostMaterials.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: GHOST_OPACITY, depthWrite: false });
    ghostMaterials.set(color, m);
  }
  return m;
}

/** Baskın eksene kilitlenmiş bitiş köşesi. */
function lockedEnd(a: Vertex, b: Vertex): Vertex {
  return Math.abs(b.x - a.x) >= Math.abs(b.z - a.z) ? { x: b.x, z: a.z } : { x: a.x, z: b.z };
}

/** Başlangıç ile (kilitli) bitiş arasındaki birim kenarlar; sıfır uzunlukta boş. */
function runEdges(a: Vertex, b: Vertex): Edge[] {
  const end = lockedEnd(a, b);
  const edges: Edge[] = [];
  if (end.z === a.z) {
    for (let x = Math.min(a.x, end.x); x < Math.max(a.x, end.x); x++) edges.push({ x, z: a.z, axis: 'x' });
  } else {
    for (let z = Math.min(a.z, end.z); z < Math.max(a.z, end.z); z++) edges.push({ x: a.x, z, axis: 'z' });
  }
  return edges;
}

/** İmlece en yakın tek kenar: yatay ve dikey adaydan çizgisi daha yakın olan. */
function nearestEdge(px: number, pz: number): Edge {
  const h: Edge = { x: Math.floor(px), z: Math.round(pz), axis: 'x' };
  const v: Edge = { x: Math.round(px), z: Math.floor(pz), axis: 'z' };
  return Math.abs(pz - h.z) <= Math.abs(px - v.x) ? h : v;
}

/**
 * Yarı saydam panel hayaleti. wrap: mevcut panelin üstüne biner → z-fighting olmasın diye biraz büyük.
 * Işın almaz, derinlik yazmaz; seçimi asla engellemez.
 */
function GhostPanel({ edge, height, color, wrap }: { edge: Edge; height: number; color: string; wrap?: boolean }) {
  const [x, z] = edgeCenter(edge);
  const h = wrap ? height + 0.03 : height;
  return (
    <mesh
      geometry={ghostGeometry}
      material={ghostMaterial(color)}
      position={[x, h / 2, z]}
      rotation={[0, edgeRotation(edge), 0]}
      scale={wrap ? [1.03, h, 2.5] : [1, h, 1]}
      renderOrder={GHOST_ORDER}
      raycast={() => null}
    />
  );
}

function VertexMarker({ v }: { v: Vertex }) {
  return (
    <mesh position={[v.x, OVERLAY_Y, v.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={GHOST_ORDER} raycast={() => null}>
      <ringGeometry args={[0.07, 0.12, 32]} />
      <meshBasicMaterial color={MARKER_COLOR} transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Duvar aracı: köşeden köşeye sürükle → düz panel dizisi (FR-3.1/3.3/3.7/3.8). Kapı aracı: tek kenar tıkla (FR-4.1/4.2). */
export function WallTool() {
  const tool = useEditor((s) => s.tool);
  const scene = useEditor((s) => s.design.scene);
  const walls = useEditor((s) => s.design.walls);
  const wallHeight = useEditor((s) => s.design.wallHeight);
  const addWalls = useEditor((s) => s.addWalls);
  const setWallType = useEditor((s) => s.setWallType);

  const active = tool === 'wall' || tool === 'door';
  const bounds = sceneBounds(scene);
  const wallsByEdge = useMemo(() => new Map<string, WallPanel>(walls.map((w) => [edgeKey(w.edge), w])), [walls]);

  const [hoverVertex, setHoverVertex] = useState<Vertex | null>(null);
  const [hoverEdge, setHoverEdge] = useState<Edge | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  // Pencere dinleyicileri en güncel sürükleme durumunu ref'ten okur.
  const dragRef = useRef<Drag | null>(null);
  const setDrag = useCallback((d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  }, []);
  /** Kapı aracında basılan kenarın anahtarı; aynı kenarda bırakılırsa tıklama sayılır. */
  const pressRef = useRef<string | null>(null);

  const cancel = useCallback(() => {
    setDrag(null);
    pressRef.current = null;
  }, [setDrag]);

  const commitDrag = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    setDrag(null);
    const { design } = useEditor.getState();
    const taken = new Set(design.walls.map((w) => edgeKey(w.edge)));
    const valid = runEdges(d.start, d.current).filter((e) => !taken.has(edgeKey(e)) && edgeInScene(e, design.scene));
    // Tek çağrı → tek geri alma adımı
    if (valid.length) addWalls(valid, 'solid');
  }, [addWalls, setDrag]);

  // Bırakma her yerde biter; Escape / pointercancel iptal eder.
  useEffect(() => {
    if (!active) return;
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      commitDrag();
      pressRef.current = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', onKey);
    };
  }, [active, commitDrag, cancel]);

  // Araç değişince (duvar ↔ kapı dahil) yarım işlemi ve imleci temizle.
  useEffect(() => {
    cancel();
    setHoverVertex(null);
    setHoverEdge(null);
  }, [tool, cancel]);
  useEffect(() => () => void (document.body.style.cursor = ''), []);
  useEffect(() => {
    if (!active) document.body.style.cursor = '';
  }, [active]);

  if (!active) return null;

  const pointFromRay = (ray: THREE.Ray) => ray.intersectPlane(GROUND, new THREE.Vector3());

  /** En yakın köşe; sınır çizgisi dahil sahneye yapıştırılır. */
  const vertexFromRay = (ray: THREE.Ray): Vertex | null => {
    const p = pointFromRay(ray);
    if (!p) return null;
    return {
      x: Math.min(bounds.maxX, Math.max(bounds.minX, Math.round(p.x))),
      z: Math.min(bounds.maxZ, Math.max(bounds.minZ, Math.round(p.z))),
    };
  };

  const edgeFromRay = (ray: THREE.Ray): Edge | null => {
    const p = pointFromRay(ray);
    if (!p) return null;
    const e = nearestEdge(p.x, p.z);
    return edgeInScene(e, scene) ? e : null;
  };

  const sameVertex = (a: Vertex | null, b: Vertex | null) => !!a && !!b && a.x === b.x && a.z === b.z;
  const sameEdge = (a: Edge | null, b: Edge | null) => !!a && !!b && edgeKey(a) === edgeKey(b);

  /** Boş → kapılı panel ekle; düz → kapıya çevir; kapı → düze çevir. */
  const applyDoor = (edge: Edge) => {
    const wall = wallsByEdge.get(edgeKey(edge));
    if (!wall) addWalls([edge], 'door');
    else setWallType([wall.id], wall.type === 'door' ? 'solid' : 'door');
  };

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    if (tool === 'wall') {
      const v = vertexFromRay(e.ray);
      if (!v) return;
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      setDrag({ start: v, current: v });
      return;
    }
    const edge = edgeFromRay(e.ray);
    if (!edge) return;
    e.stopPropagation();
    pressRef.current = edgeKey(edge);
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (tool === 'wall') {
      const v = vertexFromRay(e.ray);
      const d = dragRef.current;
      if (d) {
        if (v && !sameVertex(v, d.current)) setDrag({ ...d, current: v });
        return;
      }
      setHoverVertex((h) => (sameVertex(h, v) ? h : v));
      return;
    }
    const edge = edgeFromRay(e.ray);
    setHoverEdge((h) => (sameEdge(h, edge) ? h : edge));
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (tool === 'wall') {
      commitDrag();
      return;
    }
    const edge = edgeFromRay(e.ray);
    const pressed = pressRef.current;
    pressRef.current = null;
    if (edge && pressed === edgeKey(edge)) applyDoor(edge);
  };

  const w = bounds.maxX - bounds.minX + PICK_MARGIN * 2;
  const d = bounds.maxZ - bounds.minZ + PICK_MARGIN * 2;

  let overlay: ReactNode = null;
  if (tool === 'wall') {
    if (drag) {
      const run = runEdges(drag.start, drag.current);
      const end = lockedEnd(drag.start, drag.current);
      overlay = (
        <group>
          {run.map((edge) => {
            const occupied = wallsByEdge.has(edgeKey(edge));
            const valid = !occupied && edgeInScene(edge, scene);
            return (
              <GhostPanel
                key={edgeKey(edge)}
                edge={edge}
                height={wallHeight}
                color={valid ? VALID_COLOR : INVALID_COLOR}
                wrap={occupied}
              />
            );
          })}
          <VertexMarker v={drag.start} />
          <VertexMarker v={end} />
          {run.length > 0 && (
            <Html
              position={[(drag.start.x + end.x) / 2, wallHeight + 0.25, (drag.start.z + end.z) / 2]}
              center
              pointerEvents="none"
              zIndexRange={[20, 0]}
            >
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.85)',
                  color: '#fff',
                  font: '600 12px/1 system-ui, sans-serif',
                  padding: '4px 7px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                }}
              >
                {run.length} m
              </div>
            </Html>
          )}
        </group>
      );
    } else if (hoverVertex) {
      overlay = <VertexMarker v={hoverVertex} />;
    }
  } else if (hoverEdge) {
    const wall = wallsByEdge.get(edgeKey(hoverEdge));
    // Boş: kapılı panel ekle · düz: kapıya çevir · kapı: düze çevir
    const color = !wall || wall.type === 'solid' ? DOOR_COLOR : SOLID_COLOR;
    overlay = <GhostPanel edge={hoverEdge} height={wallHeight} color={color} wrap={!!wall} />;
  }

  return (
    <group>
      {/* Görünmez seçim düzlemi: renk yazmaz ama ışın alır */}
      <mesh
        position={[(bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancel}
        onPointerOver={() => (document.body.style.cursor = 'crosshair')}
        onPointerOut={() => {
          document.body.style.cursor = '';
          setHoverVertex(null);
          setHoverEdge(null);
        }}
      >
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
      </mesh>

      {overlay}
    </group>
  );
}
