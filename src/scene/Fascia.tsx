import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import interBold from '@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf?url';
import {
  FASCIA_HEIGHT,
  POST_SIZE,
  cellKey,
  collinearRuns,
  edgeRotation,
  innerSide,
  type EdgeRun,
} from '../model/geometry';
import type { StandDesign } from '../model/types';
import { fasciaId, useEditor } from '../state/store';
import { CLICK_TOLERANCE, PanelHighlight } from './SelectionLayer';

const BOARD_THICKNESS = 0.025;
/** Yazının pano yüzeyinden ayrılma payı (z-fighting önlemi). */
const TEXT_OFFSET = 0.002;
const MAX_FONT_SIZE = 0.14;

const boardMaterial = new THREE.MeshStandardMaterial({ color: '#f7f7f5', roughness: 0.55 });

// Tek sabit kalın font (RFP FR-6.4). Tam glif setli TTF: Türkçe ğ ı ş İ dahil, troika woff2 okuyamaz.
const FONT = interBold;

/** Yazı cepheye sığmazsa küçülür (FR-6.5). */
function fontSize(length: number, chars: number): number {
  if (chars === 0) return MAX_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, (length * 0.85) / (chars * 0.66));
}

function FasciaBoard({
  run,
  cells,
  height,
  name,
  highlight,
  handlers,
}: {
  run: EdgeRun;
  cells: Set<string>;
  height: number;
  name: string;
  highlight: 'selected' | 'hover' | null;
  handlers?: {
    onClick: (e: ThreeEvent<MouseEvent>) => void;
    onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
    onPointerOut: () => void;
  };
}) {
  const x = (run.start[0] + run.end[0]) / 2;
  const z = (run.start[1] + run.end[1]) / 2;
  const first = run.edges[0];
  // Dış taraf = iç tarafın tersi; yazı yalnızca dış cepheye basılır.
  const outer = -innerSide(first, cells) as 1 | -1;
  const y = height - FASCIA_HEIGHT / 2;

  return (
    <group position={[x, y, z]} rotation={[0, edgeRotation(first), 0]}>
      <mesh material={boardMaterial} castShadow receiveShadow {...handlers}>
        <boxGeometry args={[run.length - POST_SIZE, FASCIA_HEIGHT, BOARD_THICKNESS]} />
      </mesh>
      {highlight && (
        <group position={[0, -FASCIA_HEIGHT / 2, 0]}>
          <PanelHighlight
            length={run.length - POST_SIZE + 0.01}
            height={FASCIA_HEIGHT + 0.01}
            thickness={BOARD_THICKNESS + 0.01}
            mode={highlight}
          />
        </group>
      )}
      {name && (
        <Text
          position={[0, 0, outer * (BOARD_THICKNESS / 2 + TEXT_OFFSET)]}
          rotation={[0, outer === 1 ? 0 : Math.PI, 0]}
          font={FONT}
          fontSize={fontSize(run.length, name.length)}
          color="#111"
          anchorX="center"
          anchorY="middle"
          castShadow={false}
        >
          {name}
        </Text>
      )}
    </group>
  );
}

export function Fascia({ design }: { design: StandDesign }) {
  const cells = useMemo(() => new Set(design.floor.cells.map(cellKey)), [design.floor.cells]);
  const runs = useMemo(() => collinearRuns(design.fascia.edges), [design.fascia.edges]);
  const name = design.fascia.companyName.trim();

  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const select = useEditor((s) => s.select);
  const capturing = useEditor((s) => s.capture !== null);
  const selected = useMemo(() => new Set(selection), [selection]);
  const interactive = tool === 'select';

  // Seçim aracında panoya tıklamak tüm pano dizisini seçer (Walls.tsx'teki desenle aynı).
  const [hovered, setHovered] = useState<string | null>(null);
  const cursorSet = useRef(false);
  const setCursor = useCallback((on: boolean) => {
    if (on === cursorSet.current) return;
    cursorSet.current = on;
    document.body.style.cursor = on ? 'pointer' : '';
  }, []);
  const runKey = (run: EdgeRun) => `${run.axis}:${run.start[0]},${run.start[1]}`;
  const hoveredExists = hovered !== null && runs.some((r) => runKey(r) === hovered);
  useEffect(() => {
    if (interactive && (hovered === null || hoveredExists)) return;
    if (hovered !== null) setHovered(null);
    setCursor(false);
  }, [interactive, hovered, hoveredExists, setCursor]);
  useEffect(() => () => setCursor(false), [setCursor]);

  return (
    <group>
      {runs.map((run) => {
        const key = runKey(run);
        const ids = run.edges.map(fasciaId);
        const isSelected = ids.some((id) => selected.has(id));
        const highlight = capturing ? null : isSelected ? 'selected' : interactive && hovered === key ? 'hover' : null;
        return (
          <FasciaBoard
            key={key}
            run={run}
            cells={cells}
            height={design.wallHeight}
            name={name}
            highlight={highlight}
            handlers={
              interactive
                ? {
                    onClick: (e) => {
                      e.stopPropagation();
                      if (e.delta >= CLICK_TOLERANCE) return;
                      select(ids, e.shiftKey);
                    },
                    onPointerOver: (e) => {
                      e.stopPropagation();
                      setHovered(key);
                      setCursor(true);
                    },
                    onPointerOut: () => {
                      setHovered((cur) => (cur === key ? null : cur));
                      setCursor(false);
                    },
                  }
                : undefined
            }
          />
        );
      })}
    </group>
  );
}
