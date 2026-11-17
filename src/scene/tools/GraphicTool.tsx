import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import {
  CARPET_THICKNESS,
  POST_SIZE,
  cellKey,
  edgeCenter,
  edgeKey,
  edgeRotation,
  graphicHeight,
  innerSide,
  sceneBounds,
} from '../../model/geometry';
import type { Edge, StandDesign, WallPanel } from '../../model/types';
import { edgeInScene, useEditor } from '../../state/store';

/** Grid köşesi (tam sayı x, z). */
type Vertex = { x: number; z: number };
/** Yerel +z tarafı (1) ya da tersi (-1); edgeRotation sonrası. */
type Side = 1 | -1;
/** Duvar yüzeyine isabet: panelin kenarı + vurulan yüz. */
type SurfaceHit = { edge: Edge; side: Side };
/**
 * Basılı işlem.
 * - surface: panel/çerçeve yüzeyine basıldı. Sürükleme imleci basılan duvar doğrusuna izdüşürür;
 *   dizi anchor ile current arasındaki tüm birim kenarlardır. Yüz basışta seçilir, sabit kalır.
 * - floor (yedek): zemine basıldı. start köşesinden başka köşeye geçilince dizi sürüklemesi olur
 *   (dragging, geri dönmez); aksi halde bırakınca basılan kenar hâlâ imlecin altındaysa tek panellik çerçeve.
 */
type Press =
  | { kind: 'surface'; anchor: Edge; current: Edge; side: Side }
  | { kind: 'floor'; start: Vertex; current: Vertex; edge: Edge | null; edgeNow: Edge | null; dragging: boolean };
/** Basılı değilken imlecin altındaki hedef. */
type Hover = { kind: 'surface'; edge: Edge; side: Side } | { kind: 'floor'; vertex: Vertex | null; edge: Edge | null };
type Check =
  | { ok: true; panelIds: string[]; face: 'inner' | 'outer' }
  | { ok: false; reason: string };
type Bounds = ReturnType<typeof sceneBounds>;

const OVERLAY_Y = CARPET_THICKNESS + 0.003;
/** Çerçeve hayaleti duvar ekseninden bu kadar dışarıda: çerçeve gibi dikmelerin önünde + küçük pay. */
const FACE_OFFSET = POST_SIZE / 2 + 0.004;
/** Sınır çizgisindeki köşe/kenarlar dışarıdan da yakalanabilsin diye zemin seçimi biraz taşar. */
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

/** Aynı duvar doğrusundaki iki kenar arasındaki (ikisi dahil) birim kenarlar, artan sırada. */
function lineRun(a: Edge, b: Edge): Edge[] {
  const edges: Edge[] = [];
  if (a.axis === 'x') {
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) edges.push({ x, z: a.z, axis: 'x' });
  } else {
    for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z); z++) edges.push({ x: a.x, z, axis: 'z' });
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
const sameOptEdge = (a: Edge | null, b: Edge | null) => (!a && !b) || sameEdge(a, b);
function sameHover(a: Hover | null, b: Hover | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind === 'surface' && b.kind === 'surface') return a.side === b.side && sameEdge(a.edge, b.edge);
  if (a.kind === 'floor' && b.kind === 'floor')
    return sameOptEdge(a.edge, b.edge) && (a.vertex === b.vertex || sameVertex(a.vertex, b.vertex));
  return false;
}

/** Bir noktanın (kamera / ışın başlangıcı) bulunduğu taraf. axis x (z=c): dünya +z = yerel +z; axis z (x=c): yerel +z = dünya -x. */
function cameraSide(edge: Edge, cam: THREE.Vector3): Side {
  if (edge.axis === 'x') return cam.z >= edge.z ? 1 : -1;
  return cam.x <= edge.x ? 1 : -1;
}

/** Basılı/üzerinde olunan durumun hedef kenarları (yoksa boş). */
function targetEdges(press: Press | null, hover: Hover | null): Edge[] {
  if (press?.kind === 'surface') return lineRun(press.anchor, press.current);
  if (press?.kind === 'floor') {
    if (press.dragging) return runEdges(press.start, press.current);
    return press.edge && sameEdge(press.edge, press.edgeNow) ? [press.edge] : [];
  }
  return hover?.edge ? [hover.edge] : [];
}

/** Yüzeyden seçimde yüz sabittir; zemin yedeğinde kameranın baktığı yüz kullanılır. */
function targetSide(press: Press | null, hover: Hover | null, camSide: Side): Side {
  if (press) return press.kind === 'surface' ? press.side : camSide;
  return hover?.kind === 'surface' ? hover.side : camSide;
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

/** Nesnede ya da atalarında userData.panelId / userData.frameId arar. */
function wallTargetOf(obj: THREE.Object3D): { panelId: string } | { frameId: string } | null {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
    const { panelId, frameId } = o.userData as { panelId?: unknown; frameId?: unknown };
    if (typeof frameId === 'string') return { frameId };
    if (typeof panelId === 'string') return { panelId };
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

/** Işın isabetinden duvar kenarı: panel doğrudan; çerçevede isabet noktasına en yakın paneli. */
function edgeFromTarget(
  target: { panelId: string } | { frameId: string },
  point: THREE.Vector3,
  design: StandDesign,
): Edge | null {
  if ('panelId' in target) return design.walls.find((w) => w.id === target.panelId)?.edge ?? null;
  const frame = design.graphics.find((g) => g.id === target.frameId);
  if (!frame) return null;
  let best: Edge | null = null;
  let bestDist = Infinity;
  for (const id of frame.panelIds) {
    const w = design.walls.find((p) => p.id === id);
    if (!w) continue;
    const [cx, cz] = edgeCenter(w.edge);
    const d = w.edge.axis === 'x' ? Math.abs(point.x - cx) : Math.abs(point.z - cz);
    if (d < bestDist) {
      bestDist = d;
      best = w.edge;
    }
  }
  return best;
}

const linePlane = new THREE.Plane();
const lineNormal = new THREE.Vector3();
const projected = new THREE.Vector3();
const segA = new THREE.Vector3();
const segB = new THREE.Vector3();

/**
 * İmleç ışınını anchor'ın duvar doğrusuna izdüşürür: doğrunun düşey düzlemiyle kesişim
 * (imleç panellerden çıksa da çalışır); kesişim yoksa doğruya en yakın nokta. Sahneye kırpılır.
 */
function projectOnLine(ray: THREE.Ray, anchor: Edge, bounds: Bounds, y: number): Edge {
  const c = anchor.axis === 'x' ? anchor.z : anchor.x;
  lineNormal.set(anchor.axis === 'x' ? 0 : 1, 0, anchor.axis === 'x' ? 1 : 0);
  linePlane.set(lineNormal, -c);
  let p = ray.intersectPlane(linePlane, projected);
  if (!p) {
    if (anchor.axis === 'x') {
      segA.set(bounds.minX, y, c);
      segB.set(bounds.maxX, y, c);
    } else {
      segA.set(c, y, bounds.minZ);
      segB.set(c, y, bounds.maxZ);
    }
    ray.distanceSqToSegment(segA, segB, undefined, projected);
    p = projected;
  }
  const along = anchor.axis === 'x' ? p.x : p.z;
  const lo = anchor.axis === 'x' ? bounds.minX : bounds.minZ;
  const hi = (anchor.axis === 'x' ? bounds.maxX : bounds.maxZ) - 1;
  const idx = Math.min(hi, Math.max(lo, Math.floor(along)));
  return anchor.axis === 'x' ? { x: idx, z: anchor.z, axis: 'x' } : { x: anchor.x, z: idx, axis: 'z' };
}

/** Çerçeve hayaleti: seçilen yüzde ince yarı saydam düzlem + kesikli kontur. Işın almaz, derinlik yazmaz. */
function GhostFrame({ edges, side, height, color }: { edges: Edge[]; side: Side; height: number; color: string }) {
  const first = edges[0];
  const n = edges.length;
  // Dizinin ortası; yerel +x dizi boyunca uzanır.
  const cx = first.axis === 'x' ? first.x + n / 2 : first.x;
  const cz = first.axis === 'x' ? first.z : first.z + n / 2;
  // Çerçeve dikmelerin önünde durduğu için hayalet de tam uzunlukta
  const width = n;
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

const raycaster = new THREE.Raycaster();
raycaster.params.Line = { threshold: 0.01 };
raycaster.params.Points = { threshold: 0.01 };
const ndc = new THREE.Vector2();
const groundPoint = new THREE.Vector3();

/**
 * Giydirme çerçevesi aracı: panel yüzeyine bas, duvar boyunca sürükle (ya da tek panele tıkla)
 * → basılan yüze boş çerçeve. Duvara değil zemine basılırsa köşeden köşeye sürükleme yedeği çalışır.
 * Görsel sonra kütüphaneden sürüklenir.
 */
export function GraphicTool() {
  const tool = useEditor((s) => s.tool);
  const walls = useEditor((s) => s.design.walls);
  const floorCells = useEditor((s) => s.design.floor.cells);
  const wallHeight = useEditor((s) => s.design.wallHeight);
  const addFrame = useEditor((s) => s.addFrame);
  const camera = useThree((s) => s.camera);
  const get = useThree((s) => s.get);

  const active = tool === 'graphic';
  const wallsByEdge = useMemo(() => new Map<string, WallPanel>(walls.map((w) => [edgeKey(w.edge), w])), [walls]);
  const cells = useMemo(() => new Set(floorCells.map(cellKey)), [floorCells]);
  const gHeight = graphicHeight(wallHeight);

  const [hover, setHoverState] = useState<Hover | null>(null);
  const [press, setPressState] = useState<Press | null>(null);
  const [camSide, setCamSideState] = useState<Side>(1);
  // Pencere dinleyicileri ve useFrame en güncel durumu ref'ten okur.
  const pressRef = useRef<Press | null>(null);
  const hoverRef = useRef<Hover | null>(null);
  const camSideRef = useRef<Side>(1);
  const setPress = useCallback((p: Press | null) => {
    pressRef.current = p;
    setPressState(p);
  }, []);
  const setHover = useCallback((h: Hover | null) => {
    if (sameHover(hoverRef.current, h)) return;
    hoverRef.current = h;
    setHoverState(h);
  }, []);

  // Zemin yedeğinde hayalet kamera döndükçe doğru yüze geçsin: taraf değişince yeniden çiz.
  useFrame(() => {
    const edges = targetEdges(pressRef.current, hoverRef.current);
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
    const side = p.kind === 'surface' ? p.side : cameraSide(edges[0], camera.position);
    const check = checkRun(edges, byEdge, floor, side);
    // Geçersizse hayalet zaten kırmızıydı; ek uyarı yok.
    if (check.ok) addFrame(check.panelIds, check.face);
  }, [addFrame, camera, setPress]);

  // İşaretçi olayları doğrudan tuval üzerinde: sahneye ışın atılır, ilk görünür yüzey duvar/çerçeve mi bakılır.
  useEffect(() => {
    if (!active) return;
    const canvas = get().gl.domElement;

    /** Tuval koordinatından ışın; raycaster güncel kamerayla kurulur. */
    const aim = (clientX: number, clientY: number): THREE.Ray | null => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, get().camera);
      return raycaster.ray;
    };

    /** İlk görünür yüzey bir panel ya da çerçeveyse onun kenarı ve vurulan yüz. */
    const surfaceHit = (ray: THREE.Ray, design: StandDesign): SurfaceHit | null => {
      for (const hit of raycaster.intersectObject(get().scene, true)) {
        const target = wallTargetOf(hit.object);
        if (target) {
          const edge = edgeFromTarget(target, hit.point, design);
          if (edge) return { edge, side: cameraSide(edge, ray.origin) };
          continue;
        }
        if (occludes(hit.object)) return null;
      }
      return null;
    };

    /** Zemin noktası; sahne (+ pay) dışındaysa yok. */
    const floorPoint = (ray: THREE.Ray, b: Bounds): THREE.Vector3 | null => {
      const p = ray.intersectPlane(GROUND, groundPoint);
      if (!p) return null;
      const inside =
        p.x >= b.minX - PICK_MARGIN && p.x <= b.maxX + PICK_MARGIN && p.z >= b.minZ - PICK_MARGIN && p.z <= b.maxZ + PICK_MARGIN;
      return inside ? p : null;
    };

    /** En yakın köşe; sınır çizgisi dahil sahneye yapıştırılır. */
    const vertexAt = (p: THREE.Vector3 | null, b: Bounds): Vertex | null =>
      p
        ? {
            x: Math.min(b.maxX, Math.max(b.minX, Math.round(p.x))),
            z: Math.min(b.maxZ, Math.max(b.minZ, Math.round(p.z))),
          }
        : null;

    const edgeAt = (p: THREE.Vector3 | null, design: StandDesign): Edge | null => {
      if (!p) return null;
      const e = nearestEdge(p.x, p.z);
      return edgeInScene(e, design.scene) ? e : null;
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const ray = aim(e.clientX, e.clientY);
      if (!ray) return;
      const { design } = useEditor.getState();
      const hit = surfaceHit(ray, design);
      let next: Press | null = null;
      if (hit) {
        next = { kind: 'surface', anchor: hit.edge, current: hit.edge, side: hit.side };
      } else {
        const b = sceneBounds(design.scene);
        const p = floorPoint(ray, b);
        const v = vertexAt(p, b);
        if (v) {
          const edge = edgeAt(p, design);
          next = { kind: 'floor', start: v, current: v, edge, edgeNow: edge, dragging: false };
        }
      }
      if (!next) return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // etkin olmayan işaretçi: yakalama olmadan da pencere pointerup bitirir
      }
      setPress(next);
    };

    const onMove = (e: PointerEvent) => {
      document.body.style.cursor = 'crosshair';
      const ray = aim(e.clientX, e.clientY);
      if (!ray) return;
      const { design } = useEditor.getState();
      const b = sceneBounds(design.scene);
      const p = pressRef.current;
      if (p?.kind === 'surface') {
        const current = projectOnLine(ray, p.anchor, b, graphicHeight(design.wallHeight) / 2);
        if (!sameEdge(current, p.current)) setPress({ ...p, current });
        return;
      }
      if (p?.kind === 'floor') {
        const fp = floorPoint(ray, b);
        const v = vertexAt(fp, b);
        if (p.dragging) {
          if (v && !sameVertex(v, p.current)) setPress({ ...p, current: v });
          return;
        }
        // Başka köşeye geçildiyse dizi sürüklemesine dön; yoksa imlecin altındaki kenarı izle.
        if (v && !sameVertex(v, p.start)) {
          setPress({ ...p, current: v, dragging: true });
          return;
        }
        const edge = edgeAt(fp, design);
        if (!sameOptEdge(edge, p.edgeNow)) setPress({ ...p, edgeNow: edge });
        return;
      }
      const hit = surfaceHit(ray, design);
      if (hit) {
        setHover({ kind: 'surface', edge: hit.edge, side: hit.side });
        return;
      }
      const fp = floorPoint(ray, b);
      setHover(fp ? { kind: 'floor', vertex: vertexAt(fp, b), edge: edgeAt(fp, design) } : null);
    };

    const onLeave = () => {
      if (pressRef.current) return;
      document.body.style.cursor = '';
      setHover(null);
    };

    // Bırakma her yerde biter; Escape / pointercancel iptal eder.
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      release();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', onKey);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', onKey);
    };
  }, [active, get, release, cancel, setPress, setHover]);

  // Araç değişince yarım işlemi ve imleci temizle.
  useEffect(() => {
    cancel();
    setHover(null);
  }, [tool, cancel, setHover]);
  useEffect(() => () => void (document.body.style.cursor = ''), []);
  useEffect(() => {
    if (!active) document.body.style.cursor = '';
  }, [active]);

  if (!active) return null;

  const edges = targetEdges(press, hover);
  const side = targetSide(press, hover, camSide);
  // Boş kenar üzerinde gezinirken kırmızı hayalet gösterme; yalnızca basılıyken uyar.
  const showGhost = edges.length > 0 && (!!press || wallsByEdge.has(edgeKey(edges[0])));
  const check = showGhost ? checkRun(edges, wallsByEdge, cells, side) : null;

  let markers: Vertex[] = [];
  if (press?.kind === 'floor') {
    const end = press.dragging ? lockedEnd(press.start, press.current) : null;
    markers = end && !sameVertex(end, press.start) ? [press.start, end] : [press.start];
  } else if (!press && hover?.kind === 'floor' && hover.vertex) {
    markers = [hover.vertex];
  }

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
        <GhostFrame edges={edges} side={side} height={gHeight} color={check.ok ? VALID_COLOR : INVALID_COLOR} />
        {/* drei pointerEvents'i yalnızca transform modunda uygular → style ile de kapatılır */}
        <Html
          position={[cx, wallHeight + 0.25, cz]}
          center
          pointerEvents="none"
          style={{ pointerEvents: 'none' }}
          zIndexRange={[20, 0]}
        >
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
      {ghost}
      {markers.map((v) => (
        <VertexMarker key={`${v.x},${v.z}`} v={v} />
      ))}
    </group>
  );
}
