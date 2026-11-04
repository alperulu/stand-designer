import { useEffect } from 'react';
import { useEditor, type Tool } from '../state/store';
import { itemsByIds, rotationUpdates } from './items';
import { openProject, saveProject } from './projectActions';

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
/** Kısayol ipuçlarında gösterilecek değiştirici tuş adı. */
export const MOD = isMac ? '⌘' : 'Ctrl+';
export const UNDO_HINT = `${MOD}Z`;
export const REDO_HINT = isMac ? '⌘⇧Z' : 'Ctrl+Y';
export const SAVE_HINT = `${MOD}S`;
export const OPEN_HINT = `${MOD}O`;

const TOOL_KEYS: Record<string, Tool> = { v: 'select', f: 'floor', e: 'erase', w: 'wall', d: 'door', p: 'fascia', k: 'graphic' };

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}

/** Bir modal (dışa aktarma önizlemesi, yeni proje vb.) açıkken kısayollar devre dışı. */
function modalOpen(): boolean {
  return document.querySelector('.modal') !== null;
}

/** RFP §6 klavye kısayolları: V/F/E/W/D/P/K, Del, Esc, geri al/yinele, G, R / Shift+R döndür, ⌘D / Ctrl+D çoğalt, ⌘S kaydet, ⌘O aç. */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;

      // ⌘S / ⌘O: metin alanındayken de çalışır; tarayıcının sayfa kaydet/aç penceresi her durumda engellenir.
      const fileKey = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (fileKey === 's' || fileKey === 'o')) {
        e.preventDefault();
        if (modalOpen() || e.repeat) return;
        if (fileKey === 's') saveProject();
        else openProject();
        return;
      }

      if (isTypingTarget(e.target) || modalOpen()) return;

      const s = useEditor.getState();
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && !e.altKey) {
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          s.undo();
        } else if ((key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey)) {
          e.preventDefault();
          s.redo();
        } else if (key === 'd' && !e.shiftKey) {
          // Tarayıcının yer imi kısayolunu her durumda engelle.
          e.preventDefault();
          if (s.selection.length) s.duplicateItems(s.selection);
        }
        return;
      }

      // Yerleştirme sürerken R ve Esc sahnedeki yerleştirme aracına aittir.
      if (s.placing !== null && (key === 'r' || key === 'escape')) return;

      if (key === 'r' && !e.altKey && !e.repeat) {
        const items = itemsByIds(s.design, s.selection);
        if (!items.length) return;
        e.preventDefault();
        // R: 90°, Shift+R: 15° (FR-8.1b). Spotlar atlanır; geçersiz sonuç veren ekipman dönmez.
        const updates = rotationUpdates(s.design, items, e.shiftKey ? 15 : 90);
        if (updates.length) s.setTransforms(updates);
        return;
      }

      if (e.altKey || e.shiftKey || e.repeat) return;

      if (key === 'escape') {
        e.preventDefault();
        // Önce seçimi bırak; seçim yoksa Seç aracına dön.
        if (s.selection.length) s.clearSelection();
        else s.setTool('select');
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        if (!s.selection.length) return;
        e.preventDefault();
        s.removeEntities(s.selection);
        return;
      }
      const tool = TOOL_KEYS[key];
      if (tool) {
        e.preventDefault();
        s.setTool(tool);
        return;
      }
      if (key === 'g') {
        e.preventDefault();
        s.setShowGrid(!s.showGrid);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
