import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import {
  BEAM_HEIGHT,
  DOOR_HEIGHT,
  DOOR_WIDTH,
  PANEL_THICKNESS,
  POST_SIZE,
  cellKey,
  derivePosts,
  edgeCenter,
  edgeRotation,
  graphicHeight,
  innerSide,
} from '../model/geometry';
import type { Graphic, StandDesign, WallPanel } from '../model/types';
import { imageById, useEditor } from '../state/store';
import { useImageDropTarget } from './ImageDrop';
import { aluminium, doorKnob, doorLeaf, panelMaterial } from './materials';
import { CLICK_TOLERANCE, PanelHighlight, SELECTION_COLOR } from './SelectionLayer';
import { useGraphicTexture } from './textures';

const PANEL_LENGTH = 1 - POST_SIZE;
/** Menteşe pimleri: kapalı kapı görünümünü bozmayacak kadar ince, alüminyumdan bir ton koyu. */
const hingeMetal = new THREE.MeshStandardMaterial({ color: '#b4b7bc', metalness: 0.55, roughness: 0.35 });
const HINGE_HEIGHTS = [0.24, DOOR_HEIGHT - 0.3];

/** BoxGeometry yüz sırası: +x, -x, +y, -y, +z, -z. Yerel +z tarafı `side` = +1. */
function faceMaterials(panel: WallPanel, side: 1 | -1) {
  const inner = panelMaterial(panel.faces.inner.color);
  const outer = panelMaterial(panel.faces.outer.color);
  const plusZ = side === 1 ? inner : outer;
  const minusZ = side === 1 ? outer : inner;
  return [inner, inner, inner, inner, plusZ, minusZ];
}

function SolidPanel({ panel, side, height }: { panel: WallPanel; side: 1 | -1; height: number }) {
  const materials = useMemo(() => faceMaterials(panel, side), [panel, side]);
  return (
    <mesh position={[0, height / 2, 0]} material={materials} castShadow receiveShadow>
      <boxGeometry args={[PANEL_LENGTH, height, PANEL_THICKNESS]} />
    </mesh>
  );
}

function DoorPanel({ panel, side, height }: { panel: WallPanel; side: 1 | -1; height: number }) {
  const materials = useMemo(() => faceMaterials(panel, side), [panel, side]);
  const strip = (PANEL_LENGTH - DOOR_WIDTH) / 2;
  const topH = height - DOOR_HEIGHT;
  const knobX = (panel.door?.hinge === 'right' ? -1 : 1) * (DOOR_WIDTH / 2 - 0.08);
  const trim = 0.018;
  // Menteşe, kolun karşı kenarında; kanadın açıldığı yüzde görünür ('in' = stand içi, FR-4.3)
  const hingeX = (panel.door?.hinge === 'right' ? 1 : -1) * (DOOR_WIDTH / 2 - trim);
  const swingSide = panel.door?.swing === 'out' ? -side : side;
  const hingeZ = swingSide * ((PANEL_THICKNESS + 0.012) / 2 + 0.004);
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * (DOOR_WIDTH / 2 + strip / 2), height / 2, 0]}
          material={materials}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[strip, height, PANEL_THICKNESS]} />
        </mesh>
      ))}
      <mesh position={[0, DOOR_HEIGHT + topH / 2, 0]} material={materials} castShadow receiveShadow>
        <boxGeometry args={[DOOR_WIDTH, topH, PANEL_THICKNESS]} />
      </mesh>
      {/* Kasa */}
      {[-1, 1].map((s) => (
        <mesh key={`t${s}`} position={[s * (DOOR_WIDTH / 2 - trim / 2), DOOR_HEIGHT / 2, 0]} material={aluminium}>
          <boxGeometry args={[trim, DOOR_HEIGHT, PANEL_THICKNESS + 0.012]} />
        </mesh>
      ))}
      <mesh position={[0, DOOR_HEIGHT - trim / 2, 0]} material={aluminium}>
        <boxGeometry args={[DOOR_WIDTH, trim, PANEL_THICKNESS + 0.012]} />
      </mesh>
      {/* Kanat */}
      <mesh position={[0, (DOOR_HEIGHT - trim) / 2, 0]} material={doorLeaf} castShadow receiveShadow>
        <boxGeometry args={[DOOR_WIDTH - trim * 2 - 0.006, DOOR_HEIGHT - trim - 0.006, PANEL_THICKNESS + 0.004]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`k${s}`} position={[knobX, 1.0, s * 0.035]} material={doorKnob} castShadow>
          <sphereGeometry args={[0.028, 20, 14]} />
        </mesh>
      ))}
      {HINGE_HEIGHTS.map((y) => (
        <mesh key={`h${y}`} position={[hingeX, y, hingeZ]} material={hingeMetal}>
          <cylinderGeometry args={[0.0055, 0.0055, 0.08, 12]} />
        </mesh>
      ))}
    </group>
  );
}

/** Önerilen baskı çözünürlüğü (FR: çerçeve etiketi). */
const PX_PER_M = 1000;
const fmtM = (m: number) => String(Math.round(m * 100) / 100);
const noRaycast = () => null;
/**
 * Giydirme yüzünün panel merkezinden uzaklığı: dikmelerin (POST_SIZE) önünde durur ki birden çok panele yayılan
 * baskı, aradaki dikmelerle bölünmeden tek parça görünsün (gerdirme kumaş / kasalı baskı gibi).
 */
const FRAME_FACE = POST_SIZE / 2 + 0.002;
const FRAME_DEPTH = FRAME_FACE - PANEL_THICKNESS / 2;
const frameEdge = new THREE.MeshStandardMaterial({ color: '#f2f2f0', roughness: 0.8 });

type FrameLayout = {
  cx: number;
  cz: number;
  rotation: number;
  side: 1 | -1;
  width: number;
  height: number;
};

/** Çerçevenin sahnedeki yerleşimi: bitişik düz panellerin ortası, panel yönü ve giydirilen yüz. */
function frameLayout(graphic: Graphic, design: StandDesign, cells: Set<string>): FrameLayout | null {
  const panels = graphic.panelIds
    .map((id) => design.walls.find((w) => w.id === id))
    .filter((w): w is WallPanel => !!w && w.type === 'solid');
  if (!panels.length) return null;
  const first = panels[0].edge;
  const centers = panels.map((p) => edgeCenter(p.edge));
  const inner = innerSide(first, cells);
  return {
    cx: centers.reduce((s, c) => s + c[0], 0) / centers.length,
    cz: centers.reduce((s, c) => s + c[1], 0) / centers.length,
    rotation: edgeRotation(first),
    side: graphic.face === 'inner' ? inner : (-inner as 1 | -1),
    width: panels.length,
    height: graphicHeight(design.wallHeight),
  };
}

const labelPos = new THREE.Vector3();
const labelNormal = new THREE.Vector3();
const labelToCam = new THREE.Vector3();

/** Boş çerçeve etiketi: ölçü + önerilen piksel. Yalnızca çerçevenin yüzü kameraya dönükken görünür. */
function FrameLabel({ width, height }: { width: number; height: number }) {
  const anchor = useRef<THREE.Group>(null);
  const box = useRef<HTMLDivElement>(null);
  useFrame(({ camera }) => {
    const g = anchor.current;
    const d = box.current;
    if (!g || !d) return;
    g.getWorldPosition(labelPos);
    labelNormal.set(0, 0, 1).transformDirection(g.matrixWorld);
    const display = labelNormal.dot(labelToCam.copy(camera.position).sub(labelPos)) > 0 ? '' : 'none';
    if (d.style.display !== display) d.style.display = display;
  });
  return (
    <group ref={anchor} position={[0, height / 2, 0.012]}>
      {/* drei pointerEvents'i yalnızca transform modunda uygular → style ile de kapatılır, etiket tıklamayı yutmasın */}
      <Html center distanceFactor={8} pointerEvents="none" style={{ pointerEvents: 'none' }} zIndexRange={[1, 0]}>
        <div
          ref={box}
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            textAlign: 'center',
            font: '500 12px/1.35 system-ui, -apple-system, sans-serif',
            color: SELECTION_COLOR,
            background: 'rgba(255, 255, 255, 0.82)',
            border: `1px solid ${SELECTION_COLOR}33`,
            borderRadius: 6,
            padding: '4px 8px',
          }}
        >
          <div>
            {fmtM(width)} m × {fmtM(height)} m · {Math.round(width * PX_PER_M)} × {Math.round(height * PX_PER_M)} px
          </div>
          <div style={{ opacity: 0.75, fontWeight: 400 }}>Görseli buraya sürükleyin</div>
        </div>
      </Html>
    </group>
  );
}

type FrameHandlers = {
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
};

/**
 * Giydirme çerçevesi. Görselli: dokulu düzlem. Görselsiz: yalnızca editörde açık mavi zemin + kesikli çerçeve + etiket.
 * Düzlem mesh'i userData.frameId taşır (ImageDrop ışın hedefi) ve seçim aracında olay alır.
 */
function WallFrame({
  graphic,
  layout,
  src,
  capturing,
  mode,
  handlers,
}: {
  graphic: Graphic;
  layout: FrameLayout;
  src: string | undefined;
  capturing: boolean;
  mode: 'drop' | 'selected' | 'hover' | null;
  handlers: FrameHandlers;
}) {
  const { width, height, side } = layout;
  const texture = useGraphicTexture(src, width, height, graphic.fit);
  const userData = useMemo(() => ({ frameId: graphic.id }), [graphic.id]);
  const empty = !src;

  // Çerçeve dikme/ray/kirişin önünde olduğundan çizgi baskının kenarını izler.
  const outline = useMemo((): [number, number, number][] => {
    const x = width / 2 - 0.004;
    const y0 = 0.004;
    const y1 = height - 0.004;
    const z = 0.009;
    return [[-x, y0, z], [x, y0, z], [x, y1, z], [-x, y1, z], [-x, y0, z]];
  }, [width, height]);

  if (capturing && !texture) return null;

  const tint = mode === 'drop' ? 0.22 : mode === 'selected' ? 0.12 : mode === 'hover' ? 0.07 : 0;
  return (
    <group position={[layout.cx, 0, layout.cz]} rotation={[0, layout.rotation, 0]}>
      {/* Yüz grubu: yerel +z giydirilen yüzden dışarı bakar */}
      <group position={[0, 0, side * FRAME_FACE]} rotation={[0, side === 1 ? 0 : Math.PI, 0]}>
        {texture && (
          // Baskının kalınlığı: panel yüzünden dikmelerin önüne kadar uzanan kasa, yandan boşluk görünmesin
          <mesh position={[0, height / 2, -FRAME_DEPTH / 2]} material={frameEdge} raycast={noRaycast} castShadow receiveShadow>
            <boxGeometry args={[width, height, FRAME_DEPTH]} />
          </mesh>
        )}
        <mesh position={[0, height / 2, 0.0015]} userData={userData} receiveShadow={!!texture} {...handlers}>
          <planeGeometry args={[width, height]} />
          {texture ? (
            <meshStandardMaterial key="image" map={texture} roughness={0.7} />
          ) : empty ? (
            <meshBasicMaterial key="empty" color={SELECTION_COLOR} transparent opacity={0.06} depthWrite={false} />
          ) : (
            // Görsel yükleniyor: görünmez ama tıklanabilir/bırakılabilir
            <meshBasicMaterial key="loading" visible={false} />
          )}
        </mesh>
        {!capturing && (
          <>
            {tint > 0 && (
              <mesh position={[0, height / 2, 0.004]} raycast={noRaycast} renderOrder={5}>
                <planeGeometry args={[width, height]} />
                <meshBasicMaterial color={SELECTION_COLOR} transparent opacity={tint} depthWrite={false} />
              </mesh>
            )}
            {mode === 'drop' || mode === 'selected' ? (
              <Line
                points={outline}
                color={SELECTION_COLOR}
                lineWidth={mode === 'drop' ? 5 : 3}
                raycast={noRaycast}
                renderOrder={6}
              />
            ) : (
              empty && (
                <Line
                  points={outline}
                  color={SELECTION_COLOR}
                  lineWidth={1.5}
                  dashed
                  dashSize={0.08}
                  gapSize={0.06}
                  raycast={noRaycast}
                  renderOrder={6}
                />
              )
            )}
            {empty && <FrameLabel width={width} height={height} />}
          </>
        )}
      </group>
    </group>
  );
}

export function Walls({ design }: { design: StandDesign }) {
  const h = design.wallHeight;
  const cells = useMemo(() => new Set(design.floor.cells.map(cellKey)), [design.floor.cells]);
  const posts = useMemo(() => derivePosts(design), [design]);

  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const select = useEditor((s) => s.select);
  const capturing = useEditor((s) => s.capture !== null);
  const dropTarget = useImageDropTarget((s) => s.target);
  const selected = useMemo(() => new Set(selection), [selection]);
  const interactive = tool === 'select';

  const [hovered, setHovered] = useState<string | null>(null);
  const cursorSet = useRef(false);
  const setCursor = useCallback((on: boolean) => {
    if (on === cursorSet.current) return;
    cursorSet.current = on;
    document.body.style.cursor = on ? 'pointer' : '';
  }, []);

  // Araç değişince ya da üzerindeki panel/çerçeve silinince hover/imleç temizlenir (R3F silinen nesneye 'out' göndermez).
  const hoveredExists =
    hovered !== null && (design.walls.some((w) => w.id === hovered) || design.graphics.some((g) => g.id === hovered));
  useEffect(() => {
    if (interactive && (hovered === null || hoveredExists)) return;
    if (hovered !== null) setHovered(null);
    setCursor(false);
  }, [interactive, hovered, hoveredExists, setCursor]);
  useEffect(() => () => setCursor(false), [setCursor]);

  const onClick = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta >= CLICK_TOLERANCE) return; // aslında kamera sürüklemesi
    select([id], e.shiftKey);
  };
  const onOver = (id: string) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(id);
    setCursor(true);
  };
  const onOut = (id: string) => () => {
    setHovered((cur) => (cur === id ? null : cur));
    setCursor(false);
  };

  return (
    <group>
      {design.walls.map((panel) => {
        const [x, z] = edgeCenter(panel.edge);
        const side = innerSide(panel.edge, cells);
        const isSelected = selected.has(panel.id);
        const isHovered = interactive && hovered === panel.id;
        return (
          <group
            key={panel.id}
            position={[x, 0, z]}
            rotation={[0, edgeRotation(panel.edge), 0]}
            // Işın isabetini panele eşlemek için (giydirme aracı yüzey seçimi)
            userData={{ panelId: panel.id }}
            // Seçim aracı dışında olay bağlanmaz → çizim araçlarının seçim düzlemine ulaşır.
            onClick={interactive ? onClick(panel.id) : undefined}
            onPointerOver={interactive ? onOver(panel.id) : undefined}
            onPointerOut={interactive ? onOut(panel.id) : undefined}
          >
            {panel.type === 'door' ? (
              <DoorPanel panel={panel} side={side} height={h} />
            ) : (
              <SolidPanel panel={panel} side={side} height={h} />
            )}
            <mesh position={[0, h - BEAM_HEIGHT / 2, 0]} material={aluminium} castShadow>
              <boxGeometry args={[PANEL_LENGTH, BEAM_HEIGHT, PANEL_THICKNESS + 0.016]} />
            </mesh>
            <mesh position={[0, 0.015, 0]} material={aluminium}>
              <boxGeometry args={[PANEL_LENGTH, 0.03, PANEL_THICKNESS + 0.012]} />
            </mesh>
            {(isSelected || isHovered) && (
              <PanelHighlight
                length={PANEL_LENGTH + 0.012}
                height={h + 0.006}
                thickness={PANEL_THICKNESS + 0.036}
                mode={isSelected ? 'selected' : 'hover'}
              />
            )}
          </group>
        );
      })}

      {posts.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, h / 2, z]} material={aluminium} castShadow receiveShadow>
          <boxGeometry args={[POST_SIZE, h, POST_SIZE]} />
        </mesh>
      ))}

      {/* Çerçeveler panellerin önünde → seçimde alttaki panelden önce gelir */}
      {design.graphics.map((g) => {
        const layout = frameLayout(g, design, cells);
        if (!layout) return null;
        const mode =
          dropTarget?.kind === 'frame' && dropTarget.id === g.id
            ? 'drop'
            : selected.has(g.id)
              ? 'selected'
              : interactive && hovered === g.id
                ? 'hover'
                : null;
        return (
          <WallFrame
            key={g.id}
            graphic={g}
            layout={layout}
            src={imageById(design, g.imageId)?.src}
            capturing={capturing}
            mode={mode}
            handlers={
              interactive ? { onClick: onClick(g.id), onPointerOver: onOver(g.id), onPointerOut: onOut(g.id) } : {}
            }
          />
        );
      })}
    </group>
  );
}
