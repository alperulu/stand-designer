import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { CARPET_THICKNESS } from '../model/geometry';
import type { Accessory } from '../model/types';
import { ItemHitBox, displayTransform, useItemHandlers, useTransformUi } from './tools/TransformLayer';

// Paylaşılan malzemeler.
const darkMetal = new THREE.MeshStandardMaterial({ color: '#1f2022', metalness: 0.4, roughness: 0.45 });
const lens = new THREE.MeshStandardMaterial({
  color: '#fffaf0',
  emissive: '#fff4e0',
  emissiveIntensity: 1.2,
  roughness: 0.3,
});
const binMaterial = new THREE.MeshStandardMaterial({
  color: '#6b6f73',
  roughness: 0.55,
  side: THREE.DoubleSide,
});
const whitePlastic = new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.45 });
const socket = new THREE.MeshStandardMaterial({ color: '#2a2b2d', roughness: 0.6 });
const switchRed = new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.4 });
const chairMaterial = new THREE.MeshStandardMaterial({ color: '#2b2c2f', roughness: 0.55 });
const chromeLeg = new THREE.MeshStandardMaterial({ color: '#b8babd', metalness: 0.7, roughness: 0.3 });
const brochureGrey = new THREE.MeshStandardMaterial({ color: '#55585c', metalness: 0.2, roughness: 0.5 });

// Spot ölçüleri: kol içeri doğru uzanır, kafa aşağı eğik.
const ARM_LENGTH = 0.38;
const ARM_Y = 0.05;
const HEAD_TILT = -Math.PI / 6; // ön kenar yukarı → alt yüz (ışık) içeri-aşağı bakar

/** Kol tipi LED projektör: pano üst kenarında kıskaç, yatay kol, eğik siyah kafa + gerçek SpotLight. */
function Spot({ wallHeight }: { wallHeight: number }) {
  const light = useRef<THREE.SpotLight>(null);
  const target = useRef<THREE.Object3D>(null);

  useLayoutEffect(() => {
    if (light.current && target.current) light.current.target = target.current;
  }, []);

  return (
    <group>
      <group position={[0, wallHeight, 0]}>
        {/* Kıskaç */}
        <mesh position={[0, 0.02, 0]} material={darkMetal} castShadow>
          <boxGeometry args={[0.05, 0.06, 0.06]} />
        </mesh>
        {/* Kol */}
        <mesh position={[0, ARM_Y, ARM_LENGTH / 2]} material={darkMetal} castShadow>
          <boxGeometry args={[0.016, 0.016, ARM_LENGTH]} />
        </mesh>
        {/* Kafa */}
        <group position={[0, ARM_Y, ARM_LENGTH]} rotation={[HEAD_TILT, 0, 0]}>
          <mesh material={darkMetal} castShadow>
            <boxGeometry args={[0.2, 0.04, 0.14]} />
          </mesh>
          <mesh position={[0, -0.0205, 0]} rotation={[Math.PI / 2, 0, 0]} material={lens}>
            <planeGeometry args={[0.17, 0.11]} />
          </mesh>
          <spotLight
            ref={light}
            position={[0, -0.03, 0]}
            color="#fff4e0"
            intensity={10}
            angle={0.75}
            penumbra={0.8}
            decay={2}
            distance={6}
            castShadow={false}
          />
        </group>
      </group>
      {/* Hedef: zeminden ~0.9 m yükseklikte, içeri 1.8 m */}
      <object3D ref={target} position={[0, 0.9, 1.8]} />
    </group>
  );
}

/** Konik açık çöp kovası + taban. */
function Bin() {
  const h = 0.32;
  return (
    <group position={[0, CARPET_THICKNESS, 0]}>
      <mesh position={[0, h / 2, 0]} material={binMaterial} castShadow receiveShadow>
        <cylinderGeometry args={[0.13, 0.11, h, 40, 1, true]} />
      </mesh>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} material={binMaterial} receiveShadow>
        <circleGeometry args={[0.11, 40]} />
      </mesh>
    </group>
  );
}

/** Üçlü grup priz. */
function PowerStrip() {
  const [w, h, d] = [0.32, 0.04, 0.055];
  return (
    <group position={[0, CARPET_THICKNESS, 0]}>
      <mesh position={[0, h / 2, 0]} material={whitePlastic} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      {[-0.1, -0.02, 0.06].map((x) => (
        <mesh key={x} position={[x, h + 0.0005, 0]} rotation={[-Math.PI / 2, 0, 0]} material={socket}>
          <circleGeometry args={[0.018, 24]} />
        </mesh>
      ))}
      <mesh position={[0.125, h + 0.004, 0]} material={switchRed}>
        <boxGeometry args={[0.025, 0.008, 0.018]} />
      </mesh>
    </group>
  );
}

const SEAT_H = 0.45;
const SEAT = 0.42;

/** Basit sandalye; yerel +z oturan kişinin baktığı yön. */
function Chair() {
  const legX = SEAT / 2 - 0.03;
  return (
    <group>
      <mesh position={[0, SEAT_H, 0]} material={chairMaterial} castShadow receiveShadow>
        <boxGeometry args={[SEAT, 0.03, SEAT]} />
      </mesh>
      <mesh position={[0, SEAT_H + 0.22, -SEAT / 2 + 0.0125]} material={chairMaterial} castShadow receiveShadow>
        <boxGeometry args={[SEAT, 0.4, 0.025]} />
      </mesh>
      {[
        [-legX, -legX],
        [legX, -legX],
        [-legX, legX],
        [legX, legX],
      ].map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, SEAT_H / 2, z]} material={chromeLeg} castShadow>
          <cylinderGeometry args={[0.011, 0.011, SEAT_H, 10]} />
        </mesh>
      ))}
    </group>
  );
}

/** Yuvarlak masa (r 0.4, h 0.75) + çevresinde masaya dönük 3 sandalye. */
function TableSet() {
  const r = 0.4;
  const h = 0.75;
  const top = 0.025;
  const chairR = 0.68;
  return (
    <group position={[0, CARPET_THICKNESS, 0]}>
      <mesh position={[0, h - top / 2, 0]} material={whitePlastic} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, top, 48]} />
      </mesh>
      <mesh position={[0, (h - top) / 2, 0]} material={chromeLeg} castShadow>
        <cylinderGeometry args={[0.03, 0.03, h - top, 16]} />
      </mesh>
      <mesh position={[0, 0.01, 0]} material={chromeLeg} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.26, 0.02, 32]} />
      </mesh>
      {[0, 1, 2].map((i) => {
        const a = (i * 2 * Math.PI) / 3;
        return (
          <group key={i} position={[Math.sin(a) * chairR, 0, Math.cos(a) * chairR]} rotation={[0, a + Math.PI, 0]}>
            <Chair />
          </group>
        );
      })}
    </group>
  );
}

/** İnce broşürlük: arka pano, taban plakası, 3 eğik cep. Ön yüz yerel +z. */
function BrochureStand() {
  const w = 0.3;
  const h = 1.4;
  const shelfW = w - 0.02;
  return (
    <group position={[0, CARPET_THICKNESS, 0]}>
      <mesh position={[0, 0.01, 0.04]} material={brochureGrey} castShadow receiveShadow>
        <boxGeometry args={[w + 0.02, 0.02, 0.3]} />
      </mesh>
      <mesh position={[0, h / 2, 0]} material={brochureGrey} castShadow receiveShadow>
        <boxGeometry args={[w, h, 0.02]} />
      </mesh>
      {[0.55, 0.9, 1.25].map((y) => (
        <group key={y} position={[0, y, 0.01]} rotation={[-Math.PI / 12, 0, 0]}>
          <mesh position={[0, 0, 0.055]} material={brochureGrey} castShadow receiveShadow>
            <boxGeometry args={[shelfW, 0.008, 0.11]} />
          </mesh>
          <mesh position={[0, 0.03, 0.11]} material={brochureGrey} castShadow receiveShadow>
            <boxGeometry args={[shelfW, 0.06, 0.008]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function AccessoryModel({ accessory, wallHeight }: { accessory: Accessory; wallHeight: number }) {
  switch (accessory.kind) {
    case 'spot':
      return <Spot wallHeight={wallHeight} />;
    case 'bin':
      return <Bin />;
    case 'power-strip':
      return <PowerStrip />;
    case 'table-set':
      return <TableSet />;
    case 'brochure-stand':
      return <BrochureStand />;
  }
}

export function Accessories({ accessories, wallHeight }: { accessories: Accessory[]; wallHeight: number }) {
  // Sürükleme sırasında geçici önizleme konumu; seçim aracında olay bağlayıcıları (FR-8.1a–c)
  const preview = useTransformUi((s) => s.preview);
  const bind = useItemHandlers();
  return (
    <group>
      {accessories.map((a) => {
        const { position, rotationDeg } = displayTransform(a, preview);
        const handlers = bind(a.id);
        return (
          <group
            key={a.id}
            position={[position.x, 0, position.z]}
            rotation={[0, THREE.MathUtils.degToRad(rotationDeg), 0]}
            {...handlers}
          >
            <AccessoryModel accessory={a} wallHeight={wallHeight} />
            {handlers && <ItemHitBox kind={a.kind} wallHeight={wallHeight} />}
          </group>
        );
      })}
    </group>
  );
}
