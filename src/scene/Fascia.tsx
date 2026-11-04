import { useMemo } from 'react';
import * as THREE from 'three';
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
}: {
  run: EdgeRun;
  cells: Set<string>;
  height: number;
  name: string;
}) {
  const x = (run.start[0] + run.end[0]) / 2;
  const z = (run.start[1] + run.end[1]) / 2;
  const first = run.edges[0];
  // Dış taraf = iç tarafın tersi; yazı yalnızca dış cepheye basılır.
  const outer = -innerSide(first, cells) as 1 | -1;
  const y = height - FASCIA_HEIGHT / 2;

  return (
    <group position={[x, y, z]} rotation={[0, edgeRotation(first), 0]}>
      <mesh material={boardMaterial} castShadow receiveShadow>
        <boxGeometry args={[run.length - POST_SIZE, FASCIA_HEIGHT, BOARD_THICKNESS]} />
      </mesh>
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

  return (
    <group>
      {runs.map((run) => (
        <FasciaBoard
          key={`${run.axis}:${run.start[0]},${run.start[1]}`}
          run={run}
          cells={cells}
          height={design.wallHeight}
          name={name}
        />
      ))}
    </group>
  );
}
