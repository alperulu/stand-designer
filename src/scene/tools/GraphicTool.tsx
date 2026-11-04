import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  CARPET_THICKNESS,
  PANEL_THICKNESS,
  POST_SIZE,
  cellKey,
  edgeKey,
  edgeRotation,
  graphicHeight,
  innerSide,
  sceneBounds,
} from '../../model/geometry';
import type { Edge, WallPanel } from '../../model/types';
import { edgeInScene, useEditor } from '../../state/store';

/** Grid köşesi (tam sayı x, z). */
type Vertex = { x: number; z: number };
/**
 * Basılı işlem. start köşesinden başka bir köşeye geçilince dizi sürüklemesi olur (dragging, geri dönmez);
 * aksi halde bırakınca basılan kenar hâlâ imlecin altındaysa tek panellik çerçeve.
 */
type Press = { start: Vertex; current: Vertex; edge: Edge | null; edgeNow: Edge | null; dragging: boolean };
/** Yerel +z tarafı (1) ya da tersi (-1); edgeRotation sonrası. */
type Side = 1 | -1;
type Check =
  | { ok: true; panelIds: string[]; face: 'inner' | 'outer' }
  | { ok: false; reason: string };

const OVERLAY_Y = CARPET_THICKNESS + 0.003;
/** Çerçeve hayaleti duvar ekseninden bu kadar dışarıda: panel yüzü + küçük pay. */
const FACE_OFFSET = PANEL_THICKNESS / 2 + 0.004;
/** Sınır çizgisindeki köşe/kenarlar dışarıdan da yakalanabilsin diye seçim düzlemi biraz taşar. */
const PICK_MARGIN = 0.5;
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const VALID_COLOR = '#22c55e';
const INVALID_COLOR = '#ef4444';
const GHOST_OPACITY = 0.3;
const GHOST_ORDER = 12;

// Hayalet düzlem tek geometriyi paylaşır; boyut scale ile verilir.
const ghostGeometry = new THREE.PlaneGeometry(1, 1);
const ghostMaterials = new Map<string, THREE.MeshBasicMaterial>();
function ghostMaterial(color: string): THREE.MeshBasicMaterial {
  let m = ghostMaterials.get(color);
  if (!m) {
    // polygonOffset: mevcut çerçeve görselinin üstünde titreşmesin
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: GHOST_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
    });
    ghostMaterials.set(color, m);
  }
  return m;
}

/** Baskın eksene kilitlenmiş bitiş köşesi. */
function lockedEnd(a: Vertex, b: Vertex): Vertex {
  return Math.abs(b.x - a.x) >= Math.abs(b.z - a.z) ? { x: b.x, z: a.z } : { x: a.x, z: b.z };
}

/** Başlangıç ile (kilitli) bitiş arasındaki birim kenarlar, artan sırada; sıfır uzunlukta boş. */
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

const sameVertex = (a: Vertex | null, b: Vertex | null) => !!a && !!b && a.x === b.x && a.z === b.z;
const sameEdge = (a: Edge | null, b: Edge | null) => !!a && !!b && edgeKey(a) === edgeKey(b);

/** Kameranın bulunduğu taraf. axis x (z=c): dünya +z = yerel +z; axis z (x=c): yerel +z = dünya -x. */
function cameraSide(edge: Edge, cam: THREE.Vector3): Side {
  if (edge.axis === 'x') return cam.z >= edge.z ? 1 : -1;
  return cam.x <= edge.x ? 1 : -1;
}

/** Basılı/üzerinde olunan durumun hedef kenarları: sürüklemede dizi, aksi halde tek kenar (yoksa boş). */
function targetEdges(press: Press | null, hover: Edge | null): Edge[] {
  if (press?.dragging) return runEdges(press.start, press.current);
  const edge = press ? (sameEdge(press.edge, press.edgeNow) ? press.edge : null) : hover;
  return edge ? [edge] : [];
}

/** Dizi çerçeveye uygun mu: her kenarda düz panel, tüm panellerde iç/dış aynı tarafta. */
function checkRun(edges: Edge[], wallsByEdge: Map<string, WallPanel>, cells: Set<string>, side: Side): Check {
  if (!edges.length) return { ok: false, reason: 'Duvar yok' };
  const panels: WallPanel[] = [];
  for (const e of edges) {
    const w = wallsByEdge.get(edgeKey(e));
    if (!w) return { ok: false, reason: 'Duvar yok' };
    if (w.type === 'door') return { ok: false, reason: 'Kapılı panel' };
    panels.push(w);
  }
  const inner = innerSide(edges[0], cells);
  if (edges.some((e) => innerSide(e, cells) !== inner)) return { ok: false, reason: 'İç/dış yüz karışık' };
  return { ok: true, panelIds: panels.map((p) => p.id), face: side === inner ? 'inner' : 'outer' };
}

/** Çerçeve hayaleti: seçilen yüzde ince yarı saydam düzlem + kesikli kontur. Işın almaz, derinlik yazmaz. */
function GhostFrame({ edges, side, height, color }: { edges: Edge[]; side: Side; height: number; color: string }) {
  const first = edges[0];
  const n = edges.length;
  // Dizinin ortası; yerel +x dizi boyunca uzanır.
  const cx = first.axis === 'x' ? first.x + n / 2 : first.x;
  const cz = first.axis === 'x' ? first.z : first.z + n / 2;
  // Uçlardaki dikmelerin içine taşmasın
  const width = n - POST_SIZE;
  const zOff = side * FACE_OFFSET;
  const lz = side * (FACE_OFFSET + 0.001);
  const hw = width / 2;
  const outline: [number, number, number][] = [
    [-hw, 0.01, lz],
    [hw, 0.01, lz],
    [hw, height, lz],
    [-hw, height, lz],
    [-hw, 0.01, lz],
  ];
  return (
    <group position={[cx, 0, cz]} rotation={[0, edgeRotation(first), 0]}>
      <mesh
        geometry={ghostGeometry}
        material={ghostMaterial(color)}
        position={[0, height / 2, zOff]}
        scale={[width, height, 1]}
        renderOrder={GHOST_ORDER}
        raycast={() => null}
      />
      <Line
        points={outline}
        color={color}
        lineWidth={2}
        dashed
        dashSize={0.12}
        gapSize={0.08}
        depthWrite={false}
        renderOrder={GHOST_ORDER + 1}
        raycast={() => null}
      />
    </group>
  );
}

function VertexMarker({ v }: { v: Vertex }) {
  return (
    <mesh position={[v.x, OVERLAY_Y, v.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={GHOST_ORDER} raycast={() => null}>
      <ringGeometry args={[0.07, 0.12, 32]} />
      <meshBasicMaterial color={VALID_COLOR} transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/**
 * Giydirme çerçevesi aracı: düz panel dizisi üzerinde köşeden köşeye sürükle (ya da tek kenara tıkla)
 * → kameranın baktığı yüze boş çerçeve. Görsel sonra kütüphaneden sürüklenir.
 */
export function GraphicTool() {
  const tool = useEditor((s) => s.tool);
  const scene = useEditor((s) => s.design.scene);
  const walls = useEditor((s) => s.design.walls);
  const floorCells = useEditor((s) => s.design.floor.cells);
  const wallHeight = useEditor((s) => s.design.wallHeight);
  const addFrame = useEditor((s) => s.addFrame);
  const camera = useThree((s) => s.camera);

  const active = tool === 'graphic';
  const bounds = sceneBounds(scene);
  const wallsByEdge = useMemo(() => new Map<string, WallPanel>(walls.map((w) => [edgeKey(w.edge), w])), [walls]);
  const cells = useMemo(() => new Set(floorCells.map(cellKey)), [floorCells]);
  const gHeight = graphicHeight(wallHeight);

  const [hoverVertex, setHoverVertex] = useState<Vertex | null>(null);
  const [hoverEdge, setHoverEdgeState] = useState<Edge | null>(null);
  const [press, setPressState] = useState<Press | null>(null);
  const [camSide, setCamSideState] = useState<Side>(1);
  // Pencere dinleyicileri ve useFrame en güncel durumu ref'ten okur.
  const pressRef = useRef<Press | null>(null);
  const hoverEdgeRef = useRef<Edge | null>(null);
  const camSideRef = useRef<Side>(1);
  const setPress = useCallback((p: Press | null) => {
    pressRef.current = p;
    setPressState(p);
  }, []);
  const setHoverEdge = useCallback((e: Edge | null) => {
    if (sameEdge(hoverEdgeRef.current, e) || (!e && !hoverEdgeRef.current)) return;
    hoverEdgeRef.current = e;
    setHoverEdgeState(e);
  }, []);

  // Kamera döndükçe hayalet doğru yüze geçsin: taraf değişince yeniden çiz.
  useFrame(() => {
    const edges = targetEdges(pressRef.current, hoverEdgeRef.current);
    if (!edges.length) return;
    const s = cameraSide(edges[0], camera.position);
    if (s !== camSideRef.current) {
      camSideRef.current = s;
      setCamSideState(s);
    }
  });

  const cancel = useCallback(() => setPress(null), [setPress]);

  /** Bırakma: geçerliyse tek addFrame çağrısı → tek geri alma adımı; araçta kalınır. */
  const release = useCallback(() => {
    const p = pressRef.current;
    if (!p) return;
    setPress(null);
    const edges = targetEdges(p, null);
    if (!edges.length) return;
    const { design } = useEditor.getState();
    const byEdge = new Map<string, WallPanel>(design.walls.map((w) => [edgeKey(w.edge), w]));
    const floor = new Set(design.floor.cells.map(cellKey));
    const check = checkRun(edges, byEdge, floor, cameraSide(edges[0], camera.position));
    // Geçersizse hayalet zaten kırmızıydı; ek uyarı yok.
    if (check.ok) addFrame(check.panelIds, check.face);
  }, [addFrame, camera, setPress]);

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
  }, [tool, cancel, setHoverEdge]);
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
    setHoverEdge(edgeFromRay(e.ray));
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    release();
  };

  const w = bounds.maxX - bounds.minX + PICK_MARGIN * 2;
  const d = bounds.maxZ - bounds.minZ + PICK_MARGIN * 2;

  const edges = targetEdges(press, hoverEdge);
  // Boş kenar üzerinde gezinirken kırmızı hayalet gösterme; yalnızca basılıyken uyar.
  const showGhost = edges.length > 0 && (!!press || wallsByEdge.has(edgeKey(edges[0])));
  const check = showGhost ? checkRun(edges, wallsByEdge, cells, camSide) : null;
  const end = press?.dragging ? lockedEnd(press.start, press.current) : null;
  const markers: Vertex[] = press
    ? end && !sameVertex(end, press.start)
      ? [press.start, end]
      : [press.start]
    : hoverVertex
        ? [hoverVertex]
        : [];

  let ghost: ReactNode = null;
  if (check) {
    const first = edges[0];
    const n = edges.length;
    const cx = first.axis === 'x' ? first.x + n / 2 : first.x;
    const cz = first.axis === 'x' ? first.z : first.z + n / 2;
    const label = check.ok
      ? `${n} m × ${Number(gHeight.toFixed(2))} m · ${check.face === 'inner' ? 'iç' : 'dış'} yüz`
      : check.reason;
    ghost = (
      <group>
        <GhostFrame edges={edges} side={camSide} height={gHeight} color={check.ok ? VALID_COLOR : INVALID_COLOR} />
        <Html position={[cx, wallHeight + 0.25, cz]} center pointerEvents="none" zIndexRange={[20, 0]}>
          <div
            style={{
              background: check.ok ? 'rgba(15, 23, 42, 0.85)' : 'rgba(185, 28, 28, 0.9)',
              color: '#fff',
              font: '600 12px/1 system-ui, sans-serif',
              padding: '4px 7px',
              borderRadius: 4,
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            {label}
          </div>
        </Html>
      </group>
    );
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

      {ghost}
      {markers.map((v) => (
        <VertexMarker key={`${v.x},${v.z}`} v={v} />
      ))}
    </group>
  );
}
