// Proje dosyası (.stand) — RFP §5.11 FR-11.2, 11.3, 11.5.
// İçerik JSON'dur; yüklenen grafikler data URL olarak gömülüdür. Dosya bir biçim işareti ve sürüm taşır;
// eski sürümler `migrate` ile güncel modele taşınır, eksik isteğe bağlı alanlar varsayılanla doldurulur.
// v2: görseller `images` kütüphanesinde tutulur; giydirme çerçeveleri ve eleman ön yüzleri onlara `imageId` ile bağlanır.

import { designFitsScene } from './geometry';
import {
  DESIGN_VERSION,
  type Accessory,
  type AccessoryKind,
  type Cell,
  type Edge,
  type Face,
  type Graphic,
  type GraphicFit,
  type ImageAsset,
  type StandDesign,
  type StandElement,
  type StandElementKind,
  type WallHeight,
  type WallPanel,
} from './types';

export const PROJECT_FORMAT = 'stand-designer';
/** Dosya sürümü = tasarım veri sürümü (types.DESIGN_VERSION). */
export const PROJECT_VERSION = DESIGN_VERSION;
export const PROJECT_EXTENSION = '.stand';

export type ProjectFile = {
  format: typeof PROJECT_FORMAT;
  version: StandDesign['version'];
  savedAt: string;
  design: StandDesign;
};

// Model sınırları — store/geometry ile aynı (geometry.MIN_SCENE/MAX_SCENE).
const MIN_SCENE = 10;
const MAX_SCENE = 100;
const PANEL_WHITE = '#f5f5f2';
const ACCESSORY_KINDS: readonly AccessoryKind[] = ['spot', 'bin', 'power-strip', 'table-set', 'brochure-stand'];
const ELEMENT_KINDS: readonly StandElementKind[] = ['lightbox', 'desk'];

/* ---------- Kaydet ---------- */

export function serializeProject(design: StandDesign): Blob {
  const file: ProjectFile = {
    format: PROJECT_FORMAT,
    version: DESIGN_VERSION,
    savedAt: new Date().toISOString(),
    design,
  };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

/** `<firma-adı-slug|stand>_<YYYY-MM-DD>.stand` — Türkçe karakterler ASCII'ye indirgenir (export/capture ile aynı kural). */
export function projectFileName(design: StandDesign, date = new Date()): string {
  const slug =
    design.fascia.companyName
      .toLocaleLowerCase('tr')
      .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
      .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'stand';
  // Yerel tarih: kullanıcının gün dönümüne göre adlandırılır.
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${slug}_${d}${PROJECT_EXTENSION}`;
}

/* ---------- Aç ---------- */

const INVALID = 'Geçersiz proje dosyası';

class ProjectFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectFileError';
  }
}

/** Yapısal hata — kullanıcıya hangi alanın bozuk olduğu da söylenir. */
const bad = (path: string, what: string): never => {
  throw new ProjectFileError(`${INVALID}: ${path} ${what}.`);
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => isNum(v) && Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isOneOf = <T extends string>(v: unknown, options: readonly T[]): v is T =>
  typeof v === 'string' && (options as readonly string[]).includes(v);

function obj(v: unknown, path: string): Obj {
  return isObj(v) ? v : bad(path, 'bir nesne olmalı');
}

/** Eksikse boş dizi (eski sürümlerde bulunmayan koleksiyonlar); varsa dizi olmalı. */
function list(v: unknown, path: string): unknown[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : bad(path, 'bir liste olmalı');
}

function id(v: unknown, path: string): string {
  return isStr(v) && v.length > 0 ? v : bad(path, 'geçerli bir kimlik olmalı');
}

function vec(v: unknown, path: string): { x: number; z: number } {
  const o = obj(v, path);
  if (!isNum(o.x) || !isNum(o.z)) bad(path, 'x ve z sayıları içermeli');
  return { x: o.x as number, z: o.z as number };
}

function rotation(v: unknown, path: string): number {
  if (v === undefined) return 0;
  return isNum(v) ? v : bad(path, 'bir sayı olmalı');
}

function fit(v: unknown, path: string): GraphicFit {
  if (v === undefined) return 'cover';
  return isOneOf(v, ['cover', 'contain'] as const) ? v : bad(path, "'cover' ya da 'contain' olmalı");
}

/** Gömülü görsel: yalnızca data URL kabul edilir (dosya dışarıya istek yaptıramaz). */
function imageSrc(v: unknown, path: string): string {
  return isStr(v) && v.startsWith('data:image/') ? v : bad(path, 'gömülü bir görsel (data URL) olmalı');
}

function cell(v: unknown, path: string): Cell {
  const o = obj(v, path);
  if (!isInt(o.x) || !isInt(o.z)) bad(path, 'tam sayı x ve z içermeli');
  return { x: o.x as number, z: o.z as number };
}

function edge(v: unknown, path: string): Edge {
  const o = obj(v, path);
  if (!isInt(o.x) || !isInt(o.z)) bad(path, 'tam sayı x ve z içermeli');
  if (!isOneOf(o.axis, ['x', 'z'] as const)) bad(`${path}.axis`, "'x' ya da 'z' olmalı");
  return { x: o.x as number, z: o.z as number, axis: o.axis as Edge['axis'] };
}

function face(v: unknown, path: string): Face {
  if (v === undefined) return { color: PANEL_WHITE };
  const o = obj(v, path);
  if (o.color === undefined) return { color: PANEL_WHITE };
  return isStr(o.color) && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(o.color)
    ? { color: o.color }
    : bad(`${path}.color`, 'bir renk kodu (#rrggbb) olmalı');
}

function wall(v: unknown, path: string): WallPanel {
  const o = obj(v, path);
  const type = o.type === undefined ? 'solid' : o.type;
  if (!isOneOf(type, ['solid', 'door'] as const)) return bad(`${path}.type`, "'solid' ya da 'door' olmalı");
  const faces = o.faces === undefined ? {} : obj(o.faces, `${path}.faces`);
  const panel: WallPanel = {
    id: id(o.id, `${path}.id`),
    edge: edge(o.edge, `${path}.edge`),
    type,
    faces: { inner: face(faces.inner, `${path}.faces.inner`), outer: face(faces.outer, `${path}.faces.outer`) },
  };
  if (type === 'door') {
    const door = o.door === undefined ? {} : obj(o.door, `${path}.door`);
    const hinge = door.hinge === undefined ? 'left' : door.hinge;
    const swing = door.swing === undefined ? 'in' : door.swing;
    if (!isOneOf(hinge, ['left', 'right'] as const)) bad(`${path}.door.hinge`, "'left' ya da 'right' olmalı");
    if (!isOneOf(swing, ['in', 'out'] as const)) bad(`${path}.door.swing`, "'in' ya da 'out' olmalı");
    panel.door = { hinge: hinge as 'left' | 'right', swing: swing as 'in' | 'out' };
  }
  return panel;
}

function accessory(v: unknown, path: string): Accessory {
  const o = obj(v, path);
  if (!isOneOf(o.kind, ACCESSORY_KINDS)) return bad(`${path}.kind`, 'tanınmayan bir aksesuar türü');
  return {
    id: id(o.id, `${path}.id`),
    kind: o.kind,
    position: vec(o.position, `${path}.position`),
    rotationDeg: rotation(o.rotationDeg, `${path}.rotationDeg`),
  };
}

/** İsteğe bağlı görsel referansı: kütüphanede yoksa (ya da bozuksa) referans düşürülür, çerçeve korunur. */
function imageRef(v: unknown, images: ReadonlySet<string>): string | undefined {
  return isStr(v) && images.has(v) ? v : undefined;
}

function image(v: unknown, path: string): ImageAsset {
  const o = obj(v, path);
  const name = o.name === undefined || o.name === null ? 'gorsel' : o.name;
  if (!isStr(name)) bad(`${path}.name`, 'bir metin olmalı');
  const size = (n: unknown, k: string): number =>
    n === undefined ? 0 : isNum(n) && n >= 0 ? n : bad(`${path}.${k}`, 'sıfır ya da pozitif bir sayı olmalı');
  return {
    id: id(o.id, `${path}.id`),
    name: name as string,
    src: imageSrc(o.src, `${path}.src`),
    width: size(o.width, 'width'),
    height: size(o.height, 'height'),
  };
}

function element(v: unknown, path: string, images: ReadonlySet<string>): StandElement {
  const o = obj(v, path);
  if (!isOneOf(o.kind, ELEMENT_KINDS)) return bad(`${path}.kind`, 'tanınmayan bir eleman türü');
  const front = o.front === undefined ? {} : obj(o.front, `${path}.front`);
  const illuminated = o.illuminated === undefined ? o.kind === 'lightbox' : o.illuminated;
  if (typeof illuminated !== 'boolean') bad(`${path}.illuminated`, 'true ya da false olmalı');
  const el: StandElement = {
    id: id(o.id, `${path}.id`),
    kind: o.kind,
    position: vec(o.position, `${path}.position`),
    rotationDeg: rotation(o.rotationDeg, `${path}.rotationDeg`),
    front: { fit: fit(front.fit, `${path}.front.fit`) },
    illuminated: illuminated as boolean,
  };
  const ref = imageRef(front.imageId, images);
  if (ref) el.front.imageId = ref;
  return el;
}

function graphic(v: unknown, path: string, images: ReadonlySet<string>): Graphic {
  const o = obj(v, path);
  const panelIds = list(o.panelIds, `${path}.panelIds`).map((p, i) => id(p, `${path}.panelIds[${i}]`));
  const faceSide = o.face === undefined ? 'inner' : o.face;
  if (!isOneOf(faceSide, ['inner', 'outer'] as const)) return bad(`${path}.face`, "'inner' ya da 'outer' olmalı");
  const g: Graphic = {
    id: id(o.id, `${path}.id`),
    panelIds,
    face: faceSide,
    fit: fit(o.fit, `${path}.fit`),
  };
  const ref = imageRef(o.imageId, images);
  if (ref) g.imageId = ref;
  return g;
}

function uniqueIds(items: { id: string }[], path: string) {
  const seen = new Set<string>();
  for (const { id: x } of items) {
    if (seen.has(x)) bad(path, `içinde yinelenen kimlik var (${x})`);
    seen.add(x);
  }
}

/**
 * Güncel sürüm şemasındaki ham tasarımı doğrular ve StandDesign'a dönüştürür.
 * Zorunlu: sahne ölçüsü ve her elemanın kimliği/konumu/türü. İsteğe bağlı alanlar varsayılanla doldurulur.
 */
function normalizeDesign(raw: Obj): StandDesign {
  const scene = obj(raw.scene, 'scene');
  for (const k of ['width', 'depth'] as const) {
    const n = scene[k];
    if (!isInt(n) || n < MIN_SCENE || n > MAX_SCENE) bad(`scene.${k}`, `${MIN_SCENE}–${MAX_SCENE} arasında bir tam sayı olmalı`);
  }

  const wh = raw.wallHeight === undefined ? 2.5 : raw.wallHeight;
  if (wh !== 2 && wh !== 2.5) bad('wallHeight', '2 ya da 2.5 olmalı');

  const floor = raw.floor === undefined ? {} : obj(raw.floor, 'floor');
  const fascia = raw.fascia === undefined ? {} : obj(raw.fascia, 'fascia');
  const companyName = fascia.companyName === undefined ? '' : fascia.companyName;
  if (!isStr(companyName)) bad('fascia.companyName', 'bir metin olmalı');

  const images = list(raw.images, 'images').map((m, i) => image(m, `images[${i}]`));
  uniqueIds(images, 'images');
  const imageIds = new Set(images.map((m) => m.id));

  const walls = list(raw.walls, 'walls').map((w, i) => wall(w, `walls[${i}]`));
  const accessories = list(raw.accessories, 'accessories').map((a, i) => accessory(a, `accessories[${i}]`));
  const elements = list(raw.elements, 'elements').map((e, i) => element(e, `elements[${i}]`, imageIds));
  const graphics = list(raw.graphics, 'graphics').map((g, i) => graphic(g, `graphics[${i}]`, imageIds));
  uniqueIds([...walls, ...accessories, ...elements], 'tasarım');
  uniqueIds(graphics, 'graphics');

  // Var olmayan ya da kapılı panellere işaret eden çerçeve referansları temizlenir; panelsiz kalan çerçeve düşer (FR-5.7).
  const solid = new Set(walls.filter((w) => w.type === 'solid').map((w) => w.id));
  const cleanGraphics = graphics
    .map((g) => ({ ...g, panelIds: g.panelIds.filter((p) => solid.has(p)) }))
    .filter((g) => g.panelIds.length > 0);

  const design: StandDesign = {
    version: DESIGN_VERSION,
    scene: { width: scene.width as number, depth: scene.depth as number },
    wallHeight: wh as WallHeight,
    floor: { cells: list(floor.cells, 'floor.cells').map((c, i) => cell(c, `floor.cells[${i}]`)) },
    walls,
    fascia: {
      edges: list(fascia.edges, 'fascia.edges').map((e, i) => edge(e, `fascia.edges[${i}]`)),
      companyName: companyName as string,
    },
    accessories,
    elements,
    graphics: cleanGraphics,
    images,
  };
  if (!designFitsScene(design, design.scene))
    throw new ProjectFileError(`${INVALID}: bazı elemanlar sahne sınırlarının dışında.`);
  return design;
}

/* ---------- Görsel başlığından boyut (v1 → v2 göçü) ---------- */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX: Record<string, number> = Object.fromEntries([...B64].map((c, i) => [c, i]));

/**
 * Base64 data URL'in yükünü baştan çözmeden bayt bayt okur (yalnızca istenen 4 karakterlik gruplar çözülür).
 * Büyük görsellerde de yalnızca başlık baytlarına dokunulur. Base64 değilse ya da bozuksa null döner.
 */
function base64Reader(dataUrl: string): ((i: number) => number | undefined) | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0 || !/;base64$/i.test(dataUrl.slice(0, comma))) return null;
  const start = comma + 1;
  const length = Math.floor((dataUrl.length - start) / 4) * 3;
  return (i) => {
    if (!Number.isInteger(i) || i < 0 || i >= length) return undefined;
    const g = start + Math.floor(i / 3) * 4;
    const k = i % 3;
    const c0 = B64_INDEX[dataUrl[g]];
    const c1 = B64_INDEX[dataUrl[g + 1]];
    if (c0 === undefined || c1 === undefined) return undefined;
    if (k === 0) return ((c0 << 2) | (c1 >> 4)) & 0xff;
    const c2 = B64_INDEX[dataUrl[g + 2]];
    if (c2 === undefined) return undefined; // '=' dolgu
    if (k === 1) return ((c1 << 4) | (c2 >> 2)) & 0xff;
    const c3 = B64_INDEX[dataUrl[g + 3]];
    if (c3 === undefined) return undefined;
    return ((c2 << 6) | c3) & 0xff;
  };
}

type ByteAt = (i: number) => number | undefined;
type Size = { width: number; height: number };

function u16(at: ByteAt, i: number): number | undefined {
  const a = at(i);
  const b = at(i + 1);
  return a === undefined || b === undefined ? undefined : (a << 8) | b;
}

function u32(at: ByteAt, i: number): number | undefined {
  const hi = u16(at, i);
  const lo = u16(at, i + 2);
  return hi === undefined || lo === undefined ? undefined : hi * 0x10000 + lo;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** PNG: 8 bayt imza + IHDR parçası; genişlik/yükseklik 16–23. baytlarda (big-endian). */
function pngSize(at: ByteAt): Size | null {
  if (!PNG_SIGNATURE.every((b, i) => at(i) === b)) return null;
  // 12–15: 'IHDR'
  if (at(12) !== 0x49 || at(13) !== 0x48 || at(14) !== 0x44 || at(15) !== 0x52) return null;
  const width = u32(at, 16);
  const height = u32(at, 20);
  return width === undefined || height === undefined ? null : { width, height };
}

/** JPEG: segmentler atlanarak ilk SOFn (SOF0 taban, SOF2 progresif, diğer SOF'lar da) işaretçisi aranır. */
function jpegSize(at: ByteAt): Size | null {
  if (at(0) !== 0xff || at(1) !== 0xd8) return null;
  let i = 2;
  for (let guard = 0; guard < 10000; guard++) {
    // İşaretçiden önceki dolgu 0xFF baytları atlanır.
    if (at(i) !== 0xff) return null;
    let marker = at(i + 1);
    while (marker === 0xff) marker = at(++i + 1);
    if (marker === undefined) return null;
    i += 2;
    // Uzunluk alanı olmayan bağımsız işaretçiler: TEM, RSTn, SOI.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (marker === 0xd9 || marker === 0xda) return null; // EOI / SOS: boyut bulunamadı
    const len = u16(at, i);
    if (len === undefined || len < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      // [len(2)] [precision(1)] [height(2)] [width(2)]
      const height = u16(at, i + 3);
      const width = u16(at, i + 5);
      return width === undefined || height === undefined ? null : { width, height };
    }
    i += len;
  }
  return null;
}

/** Data URL başlığından piksel boyutu (PNG/JPEG); bilinmiyorsa 0×0. */
export function imageSizeFromDataUrl(src: string): Size {
  const at = base64Reader(src);
  if (!at) return { width: 0, height: 0 };
  return pngSize(at) ?? jpegSize(at) ?? { width: 0, height: 0 };
}

function extensionFor(src: string): string {
  const mime = /^data:image\/([a-z0-9.+-]+)/i.exec(src)?.[1]?.toLowerCase() ?? 'png';
  if (mime === 'jpeg' || mime === 'jpg' || mime === 'pjpeg') return 'jpg';
  if (mime === 'svg+xml') return 'svg';
  return /^[a-z0-9]+$/.test(mime) ? mime : 'png';
}

/* ---------- Sürüm göçleri ---------- */

/**
 * v1 → v2: grafiklerde ve eleman ön yüzlerinde doğrudan duran `src` görselleri `images` kütüphanesine taşınır.
 * Aynı `src` metni tek bir ImageAsset olur; grafik/ön yüz ona `imageId` ile bağlanır, `src` alanları kaldırılır.
 */
function migrateV1toV2(design: Obj): Obj {
  const existing = Array.isArray(design.images) ? design.images : [];
  const taken = new Set(existing.filter(isObj).map((m) => m.id).filter(isStr));
  const images: unknown[] = [...existing];
  const bySrc = new Map<string, string>();
  let n = 0;

  const register = (src: unknown, path: string): string | undefined => {
    if (src === undefined || src === null) return undefined;
    const valid = imageSrc(src, path);
    const known = bySrc.get(valid);
    if (known) return known;
    let imgId: string;
    do imgId = `img_${++n}`;
    while (taken.has(imgId));
    taken.add(imgId);
    bySrc.set(valid, imgId);
    const { width, height } = imageSizeFromDataUrl(valid);
    images.push({ id: imgId, name: `giydirme-${n}.${extensionFor(valid)}`, src: valid, width, height });
    return imgId;
  };

  const graphics = Array.isArray(design.graphics)
    ? design.graphics.map((g, i) => {
        if (!isObj(g)) return g;
        const { src, ...rest } = g;
        const imageId = register(src, `graphics[${i}].src`);
        return imageId ? { ...rest, imageId } : rest;
      })
    : design.graphics;

  const elements = Array.isArray(design.elements)
    ? design.elements.map((e, i) => {
        if (!isObj(e) || !isObj(e.front)) return e;
        const { src, ...front } = e.front;
        const imageId = register(src, `elements[${i}].front.src`);
        return { ...e, front: imageId ? { ...front, imageId } : front };
      })
    : design.elements;

  return { ...design, graphics, elements, images };
}

/**
 * Sürüm `fromVersion` şemasındaki ham tasarımı güncel sürüm şemasına taşır (FR-11.5).
 * `MIGRATIONS[v]`, v-1 sürümünden v sürümüne dönüştürür; yeni bir sürümde buraya bir adım eklenir.
 */
const MIGRATIONS: Record<number, (design: Obj) => Obj> = {
  2: migrateV1toV2,
};

export function migrate(raw: Obj, fromVersion: number): Obj {
  let design = raw;
  for (let v = fromVersion + 1; v <= PROJECT_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (step) design = step(design);
  }
  return { ...design, version: PROJECT_VERSION };
}

function readVersion(v: unknown): number {
  if (!isInt(v) || v < 1) throw new ProjectFileError(`${INVALID}: sürüm bilgisi okunamadı.`);
  if (v > PROJECT_VERSION) throw new ProjectFileError('Bu dosya daha yeni bir sürümle kaydedilmiş.');
  return v;
}

/**
 * `.stand` dosyasının metnini okur. Sarmalayıcılı (`{ format, version, savedAt, design }`) dosyaları ve
 * sarmalayıcısız çıplak StandDesign nesnelerini kabul eder. Hatalarda Türkçe mesajlı Error fırlatır.
 */
export function parseProject(text: string): StandDesign {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new ProjectFileError('Dosya okunamadı: geçerli bir proje dosyası (JSON) değil.');
  }
  if (!isObj(root)) throw new ProjectFileError(`${INVALID}.`);

  let design: unknown;
  let version: number;
  if ('format' in root) {
    if (root.format !== PROJECT_FORMAT) throw new ProjectFileError('Bu dosya bir Stand Designer proje dosyası değil.');
    version = readVersion(root.version);
    design = root.design;
  } else if ('scene' in root) {
    // Sarmalayıcısız tasarım (ör. elle dışa alınmış otomatik kayıt); sürüm yoksa 1 sayılır.
    version = readVersion(root.version === undefined ? 1 : root.version);
    design = root;
  } else {
    throw new ProjectFileError('Bu dosya bir Stand Designer proje dosyası değil.');
  }
  if (!isObj(design)) throw new ProjectFileError(`${INVALID}: tasarım verisi bulunamadı.`);
  return normalizeDesign(migrate(design, version));
}

/**
 * Tarayıcıda saklanmış çıplak tasarımı (otomatik kayıt) okur: v1 ya da v2 kabul edilir, güncel sürüme
 * taşınır ve doğrulanır. Geçersizse Türkçe mesajlı Error fırlatır.
 */
export function normalizeStoredDesign(raw: unknown): StandDesign {
  if (!isObj(raw)) throw new ProjectFileError(`${INVALID}: tasarım verisi bulunamadı.`);
  const version = readVersion(raw.version === undefined ? 1 : raw.version);
  return normalizeDesign(migrate(raw, version));
}
