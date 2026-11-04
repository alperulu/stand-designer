import { ELEMENT_SIZES } from '../model/geometry';
import { FOOTPRINTS, isElementKind, normDeg, placementValid, snapSpot } from '../model/placement';
import type { Accessory, StandDesign, StandElement, StandElementKind } from '../model/types';

export type Item = Accessory | StandElement;
export type SpotDirection = 'in' | 'out';

/** Seçim id'lerine karşılık gelen ekipmanlar (aksesuar + eleman). */
export function itemsByIds(design: StandDesign, ids: readonly string[]): Item[] {
  const set = new Set(ids);
  return [...design.accessories, ...design.elements].filter((i) => set.has(i.id));
}

/** Zeminde izi olan ekipman (spot hariç her şey). */
export const isFloorItem = (i: Item) => FOOTPRINTS[i.kind] !== null;

export const isElement = (i: Item): i is StandElement => isElementKind(i.kind);

/**
 * Zemin ekipmanlarını delta derece döndüren güncellemeler. Döndürülmüş hâli geçersiz olanlar (duvar/başka
 * ekipmanla çakışma, sahne dışı) atlanır; kalanlar birbirlerinin yeni izine göre de denetlenir.
 */
export function rotationUpdates(design: StandDesign, items: Item[], delta: number): { id: string; rotationDeg: number }[] {
  let moving = items.filter(isFloorItem);
  for (;;) {
    const next = new Map(moving.map((i) => [i.id, normDeg(i.rotationDeg + delta)]));
    const rotate = <T extends Item>(i: T): T => {
      const r = next.get(i.id);
      return r === undefined ? i : { ...i, rotationDeg: r };
    };
    const trial: StandDesign = {
      ...design,
      accessories: design.accessories.map(rotate),
      elements: design.elements.map(rotate),
    };
    const ok = moving.filter((i) => placementValid(trial, i.kind, i.position, next.get(i.id) ?? i.rotationDeg, new Set([i.id])));
    if (ok.length === moving.length) return moving.map((i) => ({ id: i.id, rotationDeg: next.get(i.id) ?? i.rotationDeg }));
    moving = ok;
  }
}

/** Spotun içe mi dışa mı baktığı: en yakın kenarın iç yönüne göre. Kenar bulunamazsa null. */
export function spotDirection(design: StandDesign, spot: Item): SpotDirection | null {
  const snap = snapSpot(design, spot.position, 0.3);
  if (!snap) return null;
  const rot = normDeg(spot.rotationDeg);
  if (rot === normDeg(snap.rotationDeg)) return 'in';
  if (rot === normDeg(snap.rotationDeg + 180)) return 'out';
  return null;
}

/** Lightbox/desk ön yüz grafik alanı (m). Desk ön yüzü üst tabladan dolayı 2 cm kısa. */
export const FRONT_AREAS: Record<StandElementKind, { w: number; h: number }> = {
  lightbox: { w: ELEMENT_SIZES.lightbox.width, h: ELEMENT_SIZES.lightbox.height },
  desk: { w: ELEMENT_SIZES.desk.width, h: 0.98 },
};
