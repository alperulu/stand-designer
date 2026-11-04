import { useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { ELEMENT_SIZES } from '../model/geometry';
import type { StandElement } from '../model/types';
import { useEditor } from '../state/store';
import { useImageDropTarget } from './ImageDrop';
import { SELECTION_COLOR } from './SelectionLayer';
import { useGraphicTexture } from './textures';
import { ItemHitBox, displayTransform, useItemHandlers, useTransformUi } from './tools/TransformLayer';

// Gövde malzemeleri — ışıklı elemanda gövde de hafifçe parlar.
const bodyPlain = new THREE.MeshStandardMaterial({ color: '#f7f7f5', roughness: 0.5 });
const bodyLit = new THREE.MeshStandardMaterial({
  color: '#f7f7f5',
  roughness: 0.5,
  emissive: '#ffffff',
  emissiveIntensity: 0.2,
});
const noRaycast = () => null;

/** Ön yüz grafiği; ışıklıda aynı doku emissiveMap olarak da verilir → arkadan aydınlatılmış görünüm. */
function FrontGraphic({
  element,
  src,
  width,
  height,
  centerY,
  depth,
}: {
  element: StandElement;
  src: string | undefined;
  width: number;
  height: number;
  centerY: number;
  depth: number;
}) {
  const texture = useGraphicTexture(src, width, height, element.front.fit);
  const userData = useMemo(() => ({ elementId: element.id }), [element.id]);
  if (!texture) return null;
  const lit = element.illuminated;
  return (
    <mesh position={[0, centerY, depth / 2 + 0.0015]} receiveShadow={!lit} userData={userData}>
      <planeGeometry args={[width, height]} />
      {/* key: emissiveMap eklenip çıkarıldığında shader yeniden derlensin */}
      {lit ? (
        <meshStandardMaterial
          key="lit"
          map={texture}
          emissiveMap={texture}
          emissive="#ffffff"
          emissiveIntensity={0.85}
          roughness={0.4}
        />
      ) : (
        <meshStandardMaterial key="plain" map={texture} roughness={0.6} />
      )}
    </mesh>
  );
}

/** Işıklı elemanın önünde halıya hafif ışık düşüren küçük nokta ışık. */
function Glow({ depth }: { depth: number }) {
  return <pointLight position={[0, 0.4, depth / 2 + 0.15]} intensity={0.8} distance={1.3} color="#ffffff" />;
}

/** Görsel bırakma hedefi vurgusu: elemanı saran kutu + ön yüz şeridi (export'ta gizli). */
function DropHighlight({ element }: { element: StandElement }) {
  const { width, height, depth } = ELEMENT_SIZES[element.kind];
  const pad = 0.03;
  return (
    <group>
      <mesh position={[0, height / 2, 0]} raycast={noRaycast} renderOrder={5}>
        <boxGeometry args={[width + pad, height + pad, depth + pad]} />
        <meshBasicMaterial color={SELECTION_COLOR} transparent opacity={0.12} depthWrite={false} />
        <Edges color={SELECTION_COLOR} lineWidth={4} threshold={15} raycast={noRaycast} renderOrder={6} />
      </mesh>
      <mesh position={[0, height / 2, depth / 2 + pad / 2 + 0.002]} raycast={noRaycast} renderOrder={6}>
        <planeGeometry args={[width + pad, height + pad]} />
        <meshBasicMaterial color={SELECTION_COLOR} transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Lightbox({ element, src }: { element: StandElement; src: string | undefined }) {
  const { width, height, depth } = ELEMENT_SIZES.lightbox;
  const body = element.illuminated ? bodyLit : bodyPlain;
  return (
    <group>
      <mesh position={[0, height / 2, 0]} material={body} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
      </mesh>
      {/* Ayaklar: öne ve arkaya taşan iki kızak */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.25, 0.015, 0]} material={bodyPlain} castShadow receiveShadow>
          <boxGeometry args={[0.06, 0.03, 0.32]} />
        </mesh>
      ))}
      <FrontGraphic element={element} src={src} width={width} height={height} centerY={height / 2} depth={depth} />
      {element.illuminated && <Glow depth={depth} />}
    </group>
  );
}

const DESK_TOP = 0.02;

function Desk({ element, src }: { element: StandElement; src: string | undefined }) {
  const { width, height, depth } = ELEMENT_SIZES.desk;
  const bodyH = height - DESK_TOP;
  const body = element.illuminated ? bodyLit : bodyPlain;
  return (
    <group>
      <mesh position={[0, bodyH / 2, 0]} material={body} castShadow receiveShadow>
        <boxGeometry args={[width, bodyH, depth]} />
      </mesh>
      {/* Tezgâh üstü: her yönden 1 cm taşar */}
      <mesh position={[0, height - DESK_TOP / 2, 0]} material={bodyPlain} castShadow receiveShadow>
        <boxGeometry args={[width + 0.02, DESK_TOP, depth + 0.02]} />
      </mesh>
      <FrontGraphic element={element} src={src} width={width} height={bodyH} centerY={bodyH / 2} depth={depth} />
      {element.illuminated && <Glow depth={depth} />}
    </group>
  );
}

export function Elements({ elements }: { elements: StandElement[] }) {
  // Sürükleme sırasında geçici önizleme konumu; seçim aracında olay bağlayıcıları (FR-8.1a–b)
  const preview = useTransformUi((s) => s.preview);
  const bind = useItemHandlers();
  // Ön yüz görselleri kütüphaneden çözülür (imageById ile aynı arama; yalnızca images'a abone olunur)
  const images = useEditor((s) => s.design.images);
  const capturing = useEditor((s) => s.capture !== null);
  const dropTarget = useImageDropTarget((s) => s.target);
  return (
    <group>
      {elements.map((el) => {
        const { position, rotationDeg } = displayTransform(el, preview);
        const handlers = bind(el.id);
        const src = el.front.imageId ? images.find((i) => i.id === el.front.imageId)?.src : undefined;
        const isDrop = !capturing && dropTarget?.kind === 'element' && dropTarget.id === el.id;
        return (
          <group
            key={el.id}
            // ImageDrop ışın hedefi: elemanın herhangi bir parçası (tutma kutusu dahil) bu id'ye çözülür
            userData={{ elementId: el.id }}
            position={[position.x, 0, position.z]}
            rotation={[0, THREE.MathUtils.degToRad(rotationDeg), 0]}
            {...handlers}
          >
            {el.kind === 'lightbox' ? <Lightbox element={el} src={src} /> : <Desk element={el} src={src} />}
            {handlers && <ItemHitBox kind={el.kind} />}
            {isDrop && <DropHighlight element={el} />}
          </group>
        );
      })}
    </group>
  );
}
