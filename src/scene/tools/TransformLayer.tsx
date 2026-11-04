// Ekipman seçme, taşıma ve döndürme (RFP FR-8.1a–c, FR-12.2–12.3). Yalnızca seçim aracında etkin.
//
// Bağlantı: <TransformLayer /> Canvas içine bir kez konur. Accessories/Elements modelleri
// `useItemHandlers` ile olay bağlar ve `useTransformUi(s => s.preview)` ile sürükleme önizlemesini çizer.
// Önizleme yereldir; mağazaya bırakınca tek seferde (tek geri alma adımı) `setTransforms` ile yazılır.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { create } from 'zustand';
import { Edges } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { CARPET_THICKNESS } from '../../model/geometry';
import {
  FOOTPRINTS,
  normDeg,
  placementValid,
  snapSpot,
  snapStep,
  snapToWall,
  type ItemKind,
  type Vec2,
} from '../../model/placement';
import type { StandDesign } from '../../model/types';
import { useEditor } from '../../state/store';
import { CLICK_TOLERANCE, SELECTION_COLOR } from '../SelectionLayer';

const INVALID_COLOR = '#ef4444';
const ROTATE_STEP = 15;
const FLOOR_Y = CARPET_THICKNESS + 0.003;
const RING_Y = CARPET_THICKNESS + 0.004;
const RING_BAND = 0.03;
/** Görünmez tutma bandı — görünen halkadan geniş, kolay yakalansın. */
const RING_HIT_BAND = 0.1;

const noRaycast = () => null;
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const deg = THREE.MathUtils.radToDeg;

// ---------------------------------------------------------------------------------------------
// Geçici (kaydedilmeyen) etkileşim durumu

export type PreviewEntry = { position: Vec2; rotationDeg: number; valid: boolean };
export type PreviewMap = Readonly<Record<string, PreviewEntry>>;

type DragRequest = {
  mode: 'move' | 'rotate';
  id: string;
  ray: THREE.Ray;
  pointerId: number;
  clientX: number;
  clientY: number;
};

type TransformUiState = {
  /** Sürüklenen ekipmanların önizleme konumları; sürükleme yokken null. */
  preview: PreviewMap | null;
  hovered: string | null;
  /** Eşik aşılıp sürükleme başladığında dolar. */
  dragMode: 'move' | 'rotate' | null;
  /** TransformLayer bağlıyken sürüklemeyi başlatır. */
  beginDrag: ((req: DragRequest) => void) | null;
};

export const useTransformUi = create<TransformUiState>()(() => ({
  preview: null,
  hovered: null,
  dragMode: null,
  beginDrag: null,
}));

/** Önizleme varsa onu, yoksa kayıtlı dönüşümü verir. */
export function displayTransform(
  item: { id: string; position: Vec2; rotationDeg: number },
  preview: PreviewMap | null,
): { position: Vec2; rotationDeg: number } {
  const p = preview?.[item.id];
  return p ? { position: p.position, rotationDeg: p.rotationDeg } : { position: item.position, rotationDeg: item.rotationDeg };
}

// İmleç: yalnızca kendi koyduğumuzu temizleriz (Walls kendi bayrağını tutar).
let cursorOwned = false;
function setCursor(c: string | null) {
  if (c) {
    document.body.style.cursor = c;
    cursorOwned = true;
  } else if (cursorOwned) {
    document.body.style.cursor = '';
    cursorOwned = false;
  }
}

// ---------------------------------------------------------------------------------------------
// Ölçüler

/** Ekipman yüksekliği (vurgu kutusu ve tutma kutusu). */
const ITEM_HEIGHTS: Record<Exclude<ItemKind, 'spot'>, number> = {
  bin: 0.34,
  'power-strip': 0.06,
  'table-set': 0.9,
  'brochure-stand': 1.42,
  lightbox: 1.0,
  desk: 1.0,
};

/** Ekipmanın yerel koordinatlarında sınır kutusu (orijin: ekipman konumu, y = 0 zemin). */
function itemBounds(kind: ItemKind, wallHeight: number): { size: [number, number, number]; center: [number, number, number] } {
  if (kind === 'spot') {
    // Kıskaç + kol + kafa: pano üst kenarından içeri ~0.46 m
    return { size: [0.24, 0.16, 0.5], center: [0, wallHeight + 0.05, 0.21] };
  }
  const f = FOOTPRINTS[kind] ?? { w: 0.3, d: 0.3 };
  const h = ITEM_HEIGHTS[kind];
  return { size: [f.w + 0.04, h + 0.02, f.d + 0.04], center: [0, (h + 0.02) / 2, 0] };
}

/** Görünmez tutma kutusu: ince/küçük modeller ve masa-sandalye arası boşluklar da yakalansın. */
export function ItemHitBox({ kind, wallHeight = 2.5 }: { kind: ItemKind; wallHeight?: number }) {
  const b = itemBounds(kind, wallHeight);
  return (
    <mesh position={b.center}>
      <boxGeometry args={b.size} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------------------------
// Ekipman olayları

type ItemHandlers = {
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
};

function handlersFor(id: string): ItemHandlers {
  return {
    onPointerDown: (e) => {
      if (e.button !== 0) return; // orta/sağ tuş kameraya kalır
      e.stopPropagation();
      if (e.shiftKey) return; // Shift: tıklamada seçime ekle/çıkar, taşıma yok
      const { selection, select } = useEditor.getState();
      if (!selection.includes(id)) select([id]);
      useTransformUi.getState().beginDrag?.({
        mode: 'move',
        id,
        ray: e.ray.clone(),
        pointerId: e.nativeEvent.pointerId,
        clientX: e.nativeEvent.clientX,
        clientY: e.nativeEvent.clientY,
      });
    },
    onClick: (e) => {
      e.stopPropagation();
      if (e.delta >= CLICK_TOLERANCE) return; // sürükleme (taşıma ya da kamera)
      useEditor.getState().select([id], e.shiftKey);
    },
    onPointerOver: (e) => {
      e.stopPropagation();
      useTransformUi.setState({ hovered: id });
      if (!useTransformUi.getState().dragMode) setCursor('move');
    },
    onPointerOut: () => {
      const ui = useTransformUi.getState();
      if (ui.hovered === id) useTransformUi.setState({ hovered: null });
      if (!ui.dragMode) setCursor(null);
    },
  };
}

/**
 * Ekipman grubuna yayılacak olay bağlayıcıları. Seçim aracı dışında (ve yerleştirme modunda)
 * undefined döner → hiçbir olay yutulmaz.
 */
export function useItemHandlers(): (id: string) => ItemHandlers | undefined {
  const tool = useEditor((s) => s.tool);
  const placing = useEditor((s) => s.placing);
  const active = tool === 'select' && !placing;
  return useCallback((id: string) => (active ? handlersFor(id) : undefined), [active]);
}

// ---------------------------------------------------------------------------------------------
// Sürükleme hesapları (saf)

type MovingItem = { id: string; kind: ItemKind; start: Vec2; rot: number };

type ActiveDrag = {
  mode: 'move' | 'rotate';
  pointerId: number;
  startClient: { x: number; y: number };
  started: boolean;
  design: StandDesign;
  plane: THREE.Plane;
  /** Tutma noktası (düzlem üzerinde). */
  grab: Vec2;
  /** İlk eleman tutulan ekipman. */
  items: MovingItem[];
  exclude: Set<string>;
  startAngle: number;
  current: PreviewMap;
  lastValid: PreviewMap;
  controlsWereEnabled: boolean;
  detach: () => void;
};

function startMap(items: MovingItem[]): PreviewMap {
  const out: Record<string, PreviewEntry> = {};
  for (const it of items) out[it.id] = { position: it.start, rotationDeg: it.rot, valid: true };
  return out;
}

function computeMove(d: ActiveDrag, p: Vec2): PreviewMap {
  const dx = p.x - d.grab.x;
  const dz = p.z - d.grab.z;
  const primary = d.items[0];
  // Tutulan zemin ekipmanı mutlak 0.1 m ızgaraya oturur; diğerleri göreli dizilimini korur.
  const shift =
    primary.kind === 'spot'
      ? { x: snapStep(dx), z: snapStep(dz) }
      : { x: snapStep(primary.start.x + dx) - primary.start.x, z: snapStep(primary.start.z + dz) - primary.start.z };
  const floorCount = d.items.filter((it) => it.kind !== 'spot').length;
  const out: Record<string, PreviewEntry> = {};
  for (const it of d.items) {
    if (it.kind === 'spot') {
      const s = snapSpot(d.design, { x: it.start.x + dx, z: it.start.z + dz });
      out[it.id] = s ? { position: s.position, rotationDeg: s.rotationDeg, valid: true } : d.current[it.id];
      continue;
    }
    let pos = { x: r4(it.start.x + shift.x), z: r4(it.start.z + shift.z) };
    if (floorCount === 1) {
      const w = snapToWall(d.design, it.kind, pos, it.rot);
      pos = { x: r4(w.x), z: r4(w.z) };
    }
    out[it.id] = { position: pos, rotationDeg: it.rot, valid: placementValid(d.design, it.kind, pos, it.rot, d.exclude) };
  }
  return out;
}

/** Merkezden işaretçiye açı; yerel +z dünya yönü (sin θ, cos θ) olduğundan atan2(dx, dz). */
const angleTo = (c: Vec2, p: Vec2) => deg(Math.atan2(p.x - c.x, p.z - c.z));

function computeRotate(d: ActiveDrag, p: Vec2): PreviewMap | null {
  const it = d.items[0];
  if (Math.hypot(p.x - it.start.x, p.z - it.start.z) < 0.05) return null;
  const raw = it.rot + (angleTo(it.start, p) - d.startAngle);
  const rot = normDeg(Math.round(raw / ROTATE_STEP) * ROTATE_STEP);
  return { [it.id]: { position: it.start, rotationDeg: rot, valid: placementValid(d.design, it.kind, it.start, rot, d.exclude) } };
}

function samePreview(a: PreviewMap, b: PreviewMap | null): boolean {
  if (!b) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => {
    const x = a[k];
    const y = b[k];
    return (
      !!y && x.valid === y.valid && x.rotationDeg === y.rotationDeg && x.position.x === y.position.x && x.position.z === y.position.z
    );
  });
}

function setControlsEnabled(controls: object | null, on: boolean): boolean {
  if (!controls || !('enabled' in controls)) return true;
  const c = controls as { enabled: boolean };
  const was = c.enabled;
  c.enabled = on;
  return was;
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

// ---------------------------------------------------------------------------------------------
// Vurgular ve döndürme halkası

function ItemHighlight({
  kind,
  position,
  rotationDeg,
  wallHeight,
  mode,
  invalid,
}: {
  kind: ItemKind;
  position: Vec2;
  rotationDeg: number;
  wallHeight: number;
  mode: 'selected' | 'hover';
  invalid: boolean;
}) {
  const b = itemBounds(kind, wallHeight);
  const fp = FOOTPRINTS[kind];
  const selected = mode === 'selected';
  const color = invalid ? INVALID_COLOR : SELECTION_COLOR;
  return (
    <group position={[position.x, 0, position.z]} rotation={[0, THREE.MathUtils.degToRad(rotationDeg), 0]}>
      <mesh position={b.center} raycast={noRaycast} renderOrder={5}>
        <boxGeometry args={b.size} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={invalid ? 0.3 : selected ? 0.14 : 0.07}
          depthWrite={false}
        />
        {selected && <Edges color={color} lineWidth={1.5} threshold={15} raycast={noRaycast} renderOrder={6} />}
      </mesh>
      {selected && fp && (
        <mesh position={[0, FLOOR_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={5}>
          {fp.round ? <circleGeometry args={[fp.w / 2, 48]} /> : <planeGeometry args={[fp.w, fp.d]} />}
          <meshBasicMaterial
            color={color}
            transparent
            opacity={invalid ? 0.4 : 0.22}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}

function RotationRing({ id, kind, position, rotationDeg }: { id: string; kind: ItemKind; position: Vec2; rotationDeg: number }) {
  const fp = FOOTPRINTS[kind];
  const radius = fp ? (fp.round ? fp.w / 2 : Math.hypot(fp.w, fp.d) / 2) + 0.15 : 0.5;
  const [hover, setHover] = useState(false);
  const dragMode = useTransformUi((s) => s.dragMode);
  const rotating = dragMode === 'rotate';
  useEffect(() => () => setCursor(null), []);

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    useTransformUi.getState().beginDrag?.({
      mode: 'rotate',
      id,
      ray: e.ray.clone(),
      pointerId: e.nativeEvent.pointerId,
      clientX: e.nativeEvent.clientX,
      clientY: e.nativeEvent.clientY,
    });
  };

  return (
    <group position={[position.x, RING_Y, position.z]} rotation={[0, THREE.MathUtils.degToRad(rotationDeg), 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={7}>
        <ringGeometry args={[radius - RING_BAND, radius + RING_BAND, 96]} />
        <meshBasicMaterial
          color={SELECTION_COLOR}
          transparent
          opacity={hover || rotating ? 0.95 : 0.7}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Ön yön tutamağı (yerel +z) */}
      <mesh position={[0, 0.001, radius]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={8}>
        <circleGeometry args={[0.07, 32]} />
        <meshBasicMaterial color={SELECTION_COLOR} transparent opacity={0.95} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={onPointerDown}
        onClick={(e) => e.stopPropagation()}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          if (!useTransformUi.getState().dragMode) setCursor('grab');
        }}
        onPointerOut={() => {
          setHover(false);
          if (!useTransformUi.getState().dragMode) setCursor(null);
        }}
      >
        <ringGeometry args={[radius - RING_HIT_BAND, radius + RING_HIT_BAND, 64]} />
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------

/** Seçim vurguları, döndürme halkası ve sürükleme denetimi. Canvas içine bir kez konur. */
export function TransformLayer() {
  const getThree = useThree((s) => s.get);
  const design = useEditor((s) => s.design);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const placing = useEditor((s) => s.placing);
  const preview = useTransformUi((s) => s.preview);
  const hovered = useTransformUi((s) => s.hovered);
  const dragMode = useTransformUi((s) => s.dragMode);
  const active = tool === 'select' && !placing;

  const drag = useRef<ActiveDrag | null>(null);

  const end = useCallback(
    (commit: boolean) => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      d.detach();
      setControlsEnabled(getThree().controls, d.controlsWereEnabled);
      if (commit && d.started) {
        const updates = d.items
          .map((it) => ({ it, v: d.lastValid[it.id] }))
          .filter(({ it, v }) => v.position.x !== it.start.x || v.position.z !== it.start.z || v.rotationDeg !== it.rot)
          .map(({ it, v }) => ({ id: it.id, position: v.position, rotationDeg: v.rotationDeg }));
        if (updates.length) useEditor.getState().setTransforms(updates);
      }
      useTransformUi.setState({ preview: null, dragMode: null });
      setCursor(useTransformUi.getState().hovered ? 'move' : null);
    },
    [drag, getThree],
  );

  const begin = useCallback(
    (req: DragRequest) => {
      if (drag.current) return;
      const { design: current, selection: sel } = useEditor.getState();
      const byId = new Map<string, MovingItem>();
      for (const item of [...current.accessories, ...current.elements])
        byId.set(item.id, { id: item.id, kind: item.kind, start: item.position, rot: item.rotationDeg });
      const primary = byId.get(req.id);
      if (!primary) return;
      // Duvar panelleri seçimde olsa da taşınmaz
      const items =
        req.mode === 'rotate'
          ? [primary]
          : [primary, ...sel.filter((id) => id !== req.id).flatMap((id) => byId.get(id) ?? [])];

      const planeY = req.mode === 'move' && primary.kind === 'spot' ? current.wallHeight : 0;
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
      const g = req.ray.intersectPlane(plane, new THREE.Vector3());
      const grab = g ? { x: g.x, z: g.z } : { ...primary.start };

      const onMove = (ev: PointerEvent) => {
        const d = drag.current;
        if (!d || ev.pointerId !== d.pointerId) return;
        if (!d.started) {
          if (Math.hypot(ev.clientX - d.startClient.x, ev.clientY - d.startClient.y) < CLICK_TOLERANCE) return;
          d.started = true;
          useTransformUi.setState({ dragMode: d.mode });
          setCursor('grabbing');
        }
        const { camera, gl } = getThree();
        const rect = gl.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        if (!raycaster.ray.intersectPlane(d.plane, hit)) return;
        const p = { x: hit.x, z: hit.z };
        const next = d.mode === 'move' ? computeMove(d, p) : computeRotate(d, p);
        if (!next) return;
        if (Object.values(next).every((v) => v.valid)) d.lastValid = next;
        if (samePreview(next, d.current)) return;
        d.current = next;
        useTransformUi.setState({ preview: next });
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId === drag.current?.pointerId) end(true);
      };
      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId === drag.current?.pointerId) end(false);
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') end(false);
      };
      const onBlur = () => end(false);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey);
      window.addEventListener('blur', onBlur);

      const start = startMap(items);
      drag.current = {
        mode: req.mode,
        pointerId: req.pointerId,
        startClient: { x: req.clientX, y: req.clientY },
        started: false,
        design: current,
        plane,
        grab,
        items,
        exclude: new Set(items.map((it) => it.id)),
        startAngle: angleTo(primary.start, grab),
        current: start,
        lastValid: start,
        // Seçim aracında sol tuş kamerayı döndürür; sürükleme boyunca kapat (R3F olayı OrbitControls'tan önce gelir)
        controlsWereEnabled: setControlsEnabled(getThree().controls, false),
        detach: () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onCancel);
          window.removeEventListener('keydown', onKey);
          window.removeEventListener('blur', onBlur);
        },
      };
    },
    [drag, end, getThree],
  );

  useEffect(() => {
    useTransformUi.setState({ beginDrag: begin });
    return () => {
      end(false);
      useTransformUi.setState({ beginDrag: null });
    };
  }, [begin, end]);

  const items = useMemo(() => {
    const m = new Map<string, { id: string; kind: ItemKind; position: Vec2; rotationDeg: number }>();
    for (const it of [...design.accessories, ...design.elements]) m.set(it.id, it);
    return m;
  }, [design.accessories, design.elements]);

  // Araç değişince sürükleme iptal; silinen/araç dışı hover ve imleç temizlenir (R3F silinen nesneye 'out' göndermez).
  const hoveredExists = hovered !== null && items.has(hovered);
  useEffect(() => {
    if (!active) end(false);
  }, [active, end]);
  useEffect(() => {
    if (active && (hovered === null || hoveredExists)) return;
    if (hovered !== null) useTransformUi.setState({ hovered: null });
    if (!useTransformUi.getState().dragMode) setCursor(null);
  }, [active, hovered, hoveredExists]);
  useEffect(() => () => setCursor(null), []);

  const selectedItems = selection.flatMap((id) => items.get(id) ?? []);
  const hoverItem =
    active && !dragMode && hovered !== null && !selection.includes(hovered) ? items.get(hovered) : undefined;
  const ringItem =
    active && dragMode !== 'move' && selectedItems.length === 1 && selectedItems[0].kind !== 'spot'
      ? selectedItems[0]
      : undefined;
  const wallHeight = design.wallHeight;

  return (
    <group>
      {selectedItems.map((it) => {
        const t = displayTransform(it, preview);
        return (
          <ItemHighlight
            key={it.id}
            kind={it.kind}
            position={t.position}
            rotationDeg={t.rotationDeg}
            wallHeight={wallHeight}
            mode="selected"
            invalid={preview?.[it.id]?.valid === false}
          />
        );
      })}
      {hoverItem && (
        <ItemHighlight
          kind={hoverItem.kind}
          position={hoverItem.position}
          rotationDeg={hoverItem.rotationDeg}
          wallHeight={wallHeight}
          mode="hover"
          invalid={false}
        />
      )}
      {ringItem && <RotationRing id={ringItem.id} kind={ringItem.kind} {...displayTransform(ringItem, preview)} />}
    </group>
  );
}
