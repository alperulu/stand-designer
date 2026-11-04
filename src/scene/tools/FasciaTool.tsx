import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import {
  CARPET_THICKNESS,
  FASCIA_HEIGHT,
  POST_SIZE,
  edgeCenter,
  edgeEnds,
  edgeKey,
  edgeRotation,
  sceneBounds,
} from '../../model/geometry';
import type { Edge } from '../../model/types';
import { edgeInScene, useEditor } from '../../state/store';

/** Grid köşesi (tam sayı x, z). */
type Vertex = { x: number; z: number };
/**
 * Basılı işlem. start köşesinden başka bir köşeye geçilince dizi sürüklemesi olur (dragging, geri dönmez);
 * aksi halde bırakınca basılan kenar hâlâ imlecin altındaysa kenar tıklaması sayılır.
 */
type Press = { start: Vertex; current: Vertex; edge: Edge | null; edgeNow: Edge | null; dragging: boolean };
type Action = 'add' | 'remove' | 'blocked';

const BOARD_LENGTH = 1 - POST_SIZE;
const GHOST_THICKNESS = 0.03;
const OVERLAY_Y = CARPET_THICKNESS + 0.003;
/** Sınır çizgisindeki köşe/kenarlar dışarıdan da yakalanabilsin diye seçim düzlemi biraz taşar. */
const PICK_MARGIN = 0.5;
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const ADD_COLOR = '#f59e0b';
const REMOVE_COLOR = '#ef4444';
const MARKER_COLOR = '#f59e0b';
const GHOST_OPACITY = 0.5;
const BLOCKED_OPACITY = 0.22;
const POST_OPACITY = 0.25;
const GHOST_ORDER = 12;

// Tüm hayalet panolar ve dikme kılavuzları paylaşılan geometriyi kullanır.
const boardGeometry = new THREE.BoxGeometry(BOARD_LENGTH, FASCIA_HEIGHT, GHOST_THICKNESS);
const postGeometry = new THREE.BoxGeometry(POST_SIZE * 0.6, 1, POST_SIZE * 0.6);
const ghostMaterials = new Map<string, THREE.MeshBasicMaterial>();
function ghostMaterial(color: string, opacity: number): THREE.MeshBasicMaterial {
  const key = `${color}@${opacity}`;
  let m = ghostMaterials.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    ghostMaterials.set(key, m);
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

/** Dizinin başlangıç köşesine değen ilk kenarı (kip bununla belirlenir). */
function firstRunEdge(a: Vertex, b: Vertex): Edge | null {
  const run = runEdges(a, b);
  if (!run.length) return null;
  const end = lockedEnd(a, b);
  return end.x > a.x || end.z > a.z ? run[0] : run[run.length - 1];
}

/** İmlece en yakın tek kenar: yatay ve dikey adaydan çizgisi daha yakın olan. */
function nearestEdge(px: number, pz: number): Edge {
  const h: Edge = { x: Math.floor(px), z: Math.round(pz), axis: 'x' };
  const v: Edge = { x: Math.round(px), z: Math.floor(pz), axis: 'z' };
  return Math.abs(pz - h.z) <= Math.abs(px - v.x) ? h : v;
}

const sameVertex = (a: Vertex | null, b: Vertex | null) => !!a && !!b && a.x === b.x && a.z === b.z;
const sameEdge = (a: Edge | null, b: Edge | null) => !!a && !!b && edgeKey(a) === edgeKey(b);

/**
 * Pano biçimli hayalet; üstü duvar yüksekliğiyle hizalı. wrap: mevcut pano/duvarın üstüne biner →
 * z-fighting olmasın diye biraz büyük. Işın almaz, derinlik yazmaz.
 */
function GhostBoard({ edge, top, action }: { edge: Edge; top: number; action: Action }) {
  const [x, z] = edgeCenter(edge);
  const wrap = action !== 'add';
  const color = action === 'add' ? ADD_COLOR : REMOVE_COLOR;
  const opacity = action === 'blocked' ? BLOCKED_OPACITY : GHOST_OPACITY;
  return (
    <mesh
      geometry={boardGeometry}
      material={ghostMaterial(color, opacity)}
      position={[x, top - FASCIA_HEIGHT / 2, z]}
      rotation={[0, edgeRotation(edge), 0]}
      scale={wrap ? [1.02, 1.08, 1.6] : [1, 1, 1]}
      renderOrder={GHOST_ORDER}
      raycast={() => null}
    />
  );
}

/** Dikmenin çıkacağı yeri gösteren ince yarı saydam kılavuz. */
function PostGuide({ x, z, height }: { x: number; z: number; height: number }) {
  return (
    <mesh
      geometry={postGeometry}
      material={ghostMaterial(ADD_COLOR, POST_OPACITY)}
      position={[x, height / 2, z]}
      scale={[1, height, 1]}
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

/** Alın panosu aracı: kenar tıkla → ekle/kaldır; köşeden sürükle → düz dizi ekle/kaldır (FR-6.2). */
export function FasciaTool() {
  const tool = useEditor((s) => s.tool);
  const scene = useEditor((s) => s.design.scene);
  const walls = useEditor((s) => s.design.walls);
  const fasciaEdges = useEditor((s) => s.design.fascia.edges);
  const wallHeight = useEditor((s) => s.design.wallHeight);
  const addFascia = useEditor((s) => s.addFascia);
  const removeFascia = useEditor((s) => s.removeFascia);

  const active = tool === 'fascia';
  const bounds = sceneBounds(scene);
  const wallKeys = useMemo(() => new Set(walls.map((w) => edgeKey(w.edge))), [walls]);
  const fasciaKeys = useMemo(() => new Set(fasciaEdges.map(edgeKey)), [fasciaEdges]);

  const [hoverVertex, setHoverVertex] = useState<Vertex | null>(null);
  const [hoverEdge, setHoverEdge] = useState<Edge | null>(null);
  const [press, setPressState] = useState<Press | null>(null);
  // Pencere dinleyicileri en güncel basılı durumu ref'ten okur.
  const pressRef = useRef<Press | null>(null);
  const setPress = useCallback((p: Press | null) => {
    pressRef.current = p;
    setPressState(p);
  }, []);

  const cancel = useCallback(() => setPress(null), [setPress]);

  /** Bırakma: sürüklemede dizinin tamamı, tıklamada tek kenar; her durumda tek çağrı → tek geri alma adımı. */
  const release = useCallback(() => {
    const p = pressRef.current;
    if (!p) return;
    setPress(null);
    const { design } = useEditor.getState();
    const fascia = new Set(design.fascia.edges.map(edgeKey));
    const walled = new Set(design.walls.map((w) => edgeKey(w.edge)));
    if (p.dragging) {
      const first = firstRunEdge(p.start, p.current);
      if (!first) return;
      const run = runEdges(p.start, p.current);
      if (fascia.has(edgeKey(first))) {
        const drop = run.filter((e) => fascia.has(edgeKey(e)));
        if (drop.length) removeFascia(drop);
      } else {
        const add = run.filter((e) => !fascia.has(edgeKey(e)) && !walled.has(edgeKey(e)) && edgeInScene(e, design.scene));
        if (add.length) addFascia(add);
      }
      return;
    }
    const edge = p.edge;
    if (!edge || !sameEdge(edge, p.edgeNow)) return;
    const k = edgeKey(edge);
    if (fascia.has(k)) removeFascia([edge]);
    else if (!walled.has(k) && edgeInScene(edge, design.scene)) addFascia([edge]);
  }, [addFascia, removeFascia, setPress]);

  // Bırakma her yerde biter; Escape / pointercancel iptal eder.
  useEffect(() => {
    if (!active) return;
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      release();
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
  }, [active, release, cancel]);

  // Araç değişince yarım işlemi ve imleci temizle.
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

  /** Tek kenara tıklamanın sonucu: pano varsa kaldır, duvar varsa engelli, yoksa ekle. */
  const edgeAction = (edge: Edge): Action => {
    const k = edgeKey(edge);
    if (fasciaKeys.has(k)) return 'remove';
    if (wallKeys.has(k)) return 'blocked';
    return 'add';
  };

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const v = vertexFromRay(e.ray);
    if (!v) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const edge = edgeFromRay(e.ray);
    setPress({ start: v, current: v, edge, edgeNow: edge, dragging: false });
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const v = vertexFromRay(e.ray);
    const p = pressRef.current;
    if (p) {
      if (p.dragging) {
        if (v && !sameVertex(v, p.current)) setPress({ ...p, current: v });
        return;
      }
      // Başka köşeye geçildiyse dizi sürüklemesine dön; yoksa imlecin altındaki kenarı izle.
      if (v && !sameVertex(v, p.start)) {
        setPress({ ...p, current: v, dragging: true });
        return;
      }
      const edge = edgeFromRay(e.ray);
      const changed = edge ? !sameEdge(edge, p.edgeNow) : !!p.edgeNow;
      if (changed) setPress({ ...p, edgeNow: edge });
      return;
    }
    setHoverVertex((h) => (sameVertex(h, v) ? h : v));
    const edge = edgeFromRay(e.ray);
    setHoverEdge((h) => (sameEdge(h, edge) ? h : edge));
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    release();
  };

  const w = bounds.maxX - bounds.minX + PICK_MARGIN * 2;
  const d = bounds.maxZ - bounds.minZ + PICK_MARGIN * 2;

  let overlay: ReactNode = null;
  if (press?.dragging) {
    const run = runEdges(press.start, press.current);
    const end = lockedEnd(press.start, press.current);
    const first = firstRunEdge(press.start, press.current);
    const removing = !!first && fasciaKeys.has(edgeKey(first));
    // Ekleme: boş kenarlar sarı, duvarlılar soluk kırmızı; kaldırma: yalnızca panolu kenarlar kırmızı.
    const ghosts = run.flatMap((edge): { edge: Edge; action: Action }[] => {
      const a = edgeAction(edge);
      if (removing) return a === 'remove' ? [{ edge, action: a }] : [];
      return a === 'remove' ? [] : [{ edge, action: a }];
    });
    overlay = (
      <group>
        {ghosts.map(({ edge, action }) => (
          <GhostBoard key={edgeKey(edge)} edge={edge} top={wallHeight} action={action} />
        ))}
        {run.length > 0 && !removing && (
          <>
            <PostGuide x={press.start.x} z={press.start.z} height={wallHeight} />
            <PostGuide x={end.x} z={end.z} height={wallHeight} />
          </>
        )}
        <VertexMarker v={press.start} />
        <VertexMarker v={end} />
        {run.length > 0 && (
          <Html
            position={[(press.start.x + end.x) / 2, wallHeight + 0.25, (press.start.z + end.z) / 2]}
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
              {removing ? '−' : '+'} {run.length} m
            </div>
          </Html>
        )}
      </group>
    );
  } else {
    // Basılıyken basılan kenar, değilse imlecin altındaki kenar: tıklamanın ne yapacağı.
    const edge = press ? (sameEdge(press.edge, press.edgeNow) ? press.edge : null) : hoverEdge;
    const vertex = press ? press.start : hoverVertex;
    if (edge) {
      const action = edgeAction(edge);
      const ends = edgeEnds(edge);
      overlay = (
        <group>
          <GhostBoard edge={edge} top={wallHeight} action={action} />
          {action === 'add' && ends.map(([x, z]) => <PostGuide key={`${x},${z}`} x={x} z={z} height={wallHeight} />)}
          {vertex && <VertexMarker v={vertex} />}
        </group>
      );
    } else if (vertex) {
      overlay = <VertexMarker v={vertex} />;
    }
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
