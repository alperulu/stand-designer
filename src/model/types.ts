// Veri modeli — docs/RFP.md §8.1. Tüm yapı elemanları tam sayı grid koordinatlarında.

/** 1×1 m kare; [x, x+1] × [z, z+1] alanını kaplar. */
export type Cell = { x: number; z: number };

/**
 * Grid kenarı = panel yeri.
 * axis 'x': (x,z) → (x+1,z) ; axis 'z': (x,z) → (x,z+1)
 */
export type Edge = { x: number; z: number; axis: 'x' | 'z' };

export type WallHeight = 2 | 2.5;

export type Face = { color: string };

export type WallPanel = {
  id: string;
  edge: Edge;
  type: 'solid' | 'door';
  door?: { hinge: 'left' | 'right'; swing: 'in' | 'out' };
  faces: { inner: Face; outer: Face };
};

export type GraphicFit = 'cover' | 'contain';

/** Görsel kütüphanesindeki yüklenmiş görsel (PNG/JPG, data URL). Birden çok çerçevede kullanılabilir. */
export type ImageAsset = {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
};

/**
 * Giydirme çerçevesi: aynı hizadaki bitişik düz panellerin bir yüzünde grafik alanı.
 * Görsel atanmamışsa editörde boş çerçeve (yer tutucu) olarak görünür, export'ta gizlenir.
 */
export type Graphic = {
  id: string;
  panelIds: string[];
  face: 'inner' | 'outer';
  fit: GraphicFit;
  imageId?: string;
};

export type AccessoryKind = 'spot' | 'bin' | 'power-strip' | 'table-set' | 'brochure-stand';

export type Accessory = {
  id: string;
  kind: AccessoryKind;
  /** metre, 0.1 m adım */
  position: { x: number; z: number };
  rotationDeg: number;
};

export type StandElementKind = 'lightbox' | 'desk';

/** Ön yüzüne grafik giydirilen serbest eleman (RFP §5.12). Ön yüz yerel +z yönüne bakar. */
export type StandElement = {
  id: string;
  kind: StandElementKind;
  position: { x: number; z: number };
  rotationDeg: number;
  /** Ön yüz de bir giydirme çerçevesidir; görsel kütüphaneden atanır. */
  front: { imageId?: string; fit: GraphicFit };
  illuminated: boolean;
};

/** Tasarım veri sürümü. v2: giydirme çerçeveleri + görsel kütüphanesi (v1'de görsel doğrudan grafikteydi). */
export const DESIGN_VERSION = 2;

export type StandDesign = {
  version: 2;
  scene: { width: number; depth: number };
  wallHeight: WallHeight;
  floor: { cells: Cell[] };
  walls: WallPanel[];
  fascia: { edges: Edge[]; companyName: string };
  accessories: Accessory[];
  elements: StandElement[];
  graphics: Graphic[];
  images: ImageAsset[];
};
