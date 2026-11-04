import { MAX_SCENE, MIN_SCENE } from '../model/geometry';
import type { StandDesign } from '../model/types';

/** Üzerine yazmadan önce onay istenmesi gereken bir içerik var mı? */
export function designHasContent(d: StandDesign): boolean {
  return d.floor.cells.length > 0 || d.walls.length > 0 || d.elements.length > 0 || d.accessories.length > 0;
}

/** Metin girişini MIN_SCENE–MAX_SCENE aralığında tam sayıya çevirir; geçersizse fallback. */
export function clampSceneInput(raw: string, fallback: number): number {
  const n = Math.round(Number(raw));
  if (raw.trim() === '' || !Number.isFinite(n)) return fallback;
  return Math.min(MAX_SCENE, Math.max(MIN_SCENE, n));
}

/**
 * Üzerine yazmadan önce uyarılmalı mı (FR-11.4): son kayıt/açılıştan sonra değişiklik var VE tasarımda içerik var.
 * Boş tasarım ya da kaydedildiği gibi duran tasarım sessizce değiştirilebilir.
 */
export function hasUnsavedWork(s: { design: StandDesign; savedDesign: StandDesign | null }): boolean {
  return s.design !== s.savedDesign && designHasContent(s.design);
}
