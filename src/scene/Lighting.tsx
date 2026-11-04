import { Environment, Lightformer, SoftShadows } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Stüdyo ışığı: yumuşak tavan ışıkları (yansıma/dolgu) + gölge veren tek ana ışık.
 * Ana ışık ve hedefi standla birlikte taşınır; gölge kamerası stand boyutuna göre büyür.
 */
export function Lighting({ target, extent }: { target: [number, number, number]; extent: number }) {
  const [tx, , tz] = target;
  const lightTarget = useMemo(() => new THREE.Object3D(), []);
  const half = Math.max(8, extent / 2 + 3);
  // Gölge haritası çözünürlüğü kapsamla birlikte artar (büyük standlarda bulanıklaşmasın)
  const mapSize = half > 16 ? 4096 : 2048;
  return (
    <>
      <SoftShadows size={18} samples={12} focus={0.6} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#ffffff', '#c9ccd0', 1.05]} />
      <group position={[tx, 0, tz]}>
        <primitive object={lightTarget} />
        <directionalLight
          key={mapSize}
          target={lightTarget}
          position={[0.6, 14, 1.2]}
          intensity={1.7}
          castShadow
          shadow-mapSize={[mapSize, mapSize]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
          shadow-camera-left={-half}
          shadow-camera-right={half}
          shadow-camera-top={half}
          shadow-camera-bottom={-half}
          shadow-camera-near={1}
          shadow-camera-far={30}
        />
      </group>
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-9, 4, 4]} rotation-y={Math.PI / 2} scale={[12, 4, 1]} />
        <Lightformer form="rect" intensity={1.0} position={[9, 4, 4]} rotation-y={-Math.PI / 2} scale={[12, 4, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[0, 3, 10]} scale={[16, 4, 1]} />
      </Environment>
    </>
  );
}
