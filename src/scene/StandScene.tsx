import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing';
import { useThree } from '@react-three/fiber';
import { ToneMappingMode } from 'postprocessing';
import { Suspense, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { floorStats } from '../model/geometry';
import type { StandDesign } from '../model/types';
import { useEditor } from '../state/store';
import { Accessories } from './Accessories';
import { CameraRig } from './CameraRig';
import { Carpet } from './Carpet';
import { Elements } from './Elements';
import { Fascia } from './Fascia';
import { HALL_COLOR, Hall } from './Hall';
import { Lighting } from './Lighting';
import { FasciaTool } from './tools/FasciaTool';
import { FloorTool } from './tools/FloorTool';
import { GraphicTool } from './tools/GraphicTool';
import { ImageDrop } from './ImageDrop';
import { PlacementTool } from './tools/PlacementTool';
import { TransformLayer } from './tools/TransformLayer';
import { WallTool } from './tools/WallTool';
import { Walls } from './Walls';

export function standCenter(design: StandDesign): [number, number, number] {
  const xs = design.floor.cells.map((c) => c.x);
  const zs = design.floor.cells.map((c) => c.z);
  if (!xs.length) return [0, 0, 0];
  return [(Math.min(...xs) + Math.max(...xs) + 1) / 2, 0, (Math.min(...zs) + Math.max(...zs) + 1) / 2];
}

/**
 * Şeffaf (ve beyaz) export'ta alfa EffectComposer'dan sağ çıkıyor mu — node_modules incelemesi (postprocessing 6.39,
 * n8ao 2.0, @react-three/postprocessing 3.2):
 * - RenderPass/ClearPass renderer'ın clear alfasıyla temizler (setClearAlpha(0) geçerli); hedefler RGBA HalfFloat.
 * - N8AOPostPass birleştirici: vec4(mix(rgb, rgb·aoColor, …), sceneTexel.a) → alfa aynen, rgb yalnızca koyulaşır
 *   (ön-çarpımlı renk geçerli kalır; şeffaf pikselde rgb = 0 kalır). Malzemesi transparent değil → karışım yok.
 * - SMAA komşu karışımı rgba'yı birlikte harmanlar; ToneMapping vec4(toneMapping(rgb), inputColor.a);
 *   EffectPass main: color0.a = clamp(a) → gl_FragColor (ekrana NoBlending tam ekran üçgen).
 * Sonuç: alfa korunur → efektler (AO, SMAA, ton eşleme) şeffaf export'ta da açık kalır, renkler ekranla aynı.
 * Sınır: kenar piksellerinde ton eşleme/sRGB ön-çarpımlı renge uygulanır → yarı saydam kenarlarda çok hafif ton farkı.
 * Tarayıcıda doğrulama bunu yalanlarsa (opak/halo çıktı) false yapın: şeffaf yakalamada EffectComposer kaldırılır,
 * sahne düz çizilir (renderer'ın NeutralToneMapping'i ile renkler yakın; AO ve SMAA kaybolur, kenar yumuşatmayı
 * yalnızca süper örnekleme sağlar).
 */
const POSTFX_KEEPS_ALPHA = true;

const HALL_BACKGROUND = new THREE.Color(HALL_COLOR);
const HALL_FOG = new THREE.Fog(HALL_COLOR, 28, 70);

/**
 * Arka plan + sis. Ekranda salon rengi (eskiden <color>/<fog attach> ile verilenin aynısı);
 * export 'white'/'transparent' iken arka plan yok, sis yok, clear alfa 0 → şeffaf çizim
 * (beyaz, capture.tsx'te 2B tuvalde saf beyaz üstüne bindirilir).
 */
function Backdrop({ clear, plain }: { clear: boolean; plain: boolean }) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  useLayoutEffect(() => {
    scene.background = clear ? null : HALL_BACKGROUND;
    scene.fog = clear ? null : HALL_FOG;
    const prevAlpha = gl.getClearAlpha();
    if (clear) gl.setClearAlpha(0);
    return () => {
      gl.setClearAlpha(prevAlpha);
    };
  }, [scene, gl, clear]);
  useLayoutEffect(() => {
    if (!plain) return;
    const prev = gl.toneMapping;
    gl.toneMapping = THREE.NeutralToneMapping;
    return () => {
      gl.toneMapping = prev;
    };
  }, [gl, plain]);
  return null;
}

export function StandScene({ design, showGrid }: { design: StandDesign; showGrid: boolean }) {
  const center = useMemo(() => standCenter(design), [design]);
  const stats = useMemo(() => floorStats(design.floor.cells), [design.floor.cells]);
  // Export sırasında geçici ayarlar (FR-10.4–10.6); null → ekran görünümü
  const capture = useEditor((s) => s.capture);
  const backdrop = capture?.background ?? 'hall';
  const clear = backdrop !== 'hall';
  const plain = clear && !POSTFX_KEEPS_ALPHA;
  return (
    <>
      <Backdrop clear={clear} plain={plain} />
      <Lighting target={center} extent={stats.width && Math.max(stats.width, stats.depth)} />

      <Hall
        showGrid={capture ? capture.showGrid : showGrid}
        backdrop={backdrop}
        width={design.scene.width}
        depth={design.scene.depth}
      />
      <Carpet cells={design.floor.cells} />
      <Walls design={design} />
      {/* Font yüklenirken sahnenin geri kalanı beklemesin */}
      <Suspense fallback={null}>
        <Fascia design={design} />
      </Suspense>
      <Accessories accessories={design.accessories} wallHeight={design.wallHeight} />
      <Elements elements={design.elements} />

      <FloorTool />
      <WallTool />
      <FasciaTool />
      <GraphicTool />
      <PlacementTool />
      <ImageDrop />
      <TransformLayer />
      <CameraRig />

      {!plain && (
        <EffectComposer multisampling={0}>
          {/* Export'ta daha yüksek AO kalitesi (FR-10.6): 64 örnek + 16 gürültü giderme örneği */}
          <N8AO aoRadius={0.45} distanceFalloff={0.6} intensity={2.2} quality="high" />
          <SMAA />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
      )}
    </>
  );
}
