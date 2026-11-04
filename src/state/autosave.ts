import { normalizeStoredDesign } from '../model/projectFile';
import type { StandDesign } from '../model/types';
import { useEditor } from './store';

// Tasarım tarayıcıda IndexedDB'de saklanır (FR-11.1). Grafikler data URL olduğu için localStorage sınırına takılmaz.
const DB_NAME = 'stand-designer';
const STORE = 'projects';
const KEY = 'autosave';
const DEBOUNCE_MS = 400;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function writeKey(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

const write = (design: StandDesign) => writeKey(KEY, design);

/**
 * Son otomatik kaydı okur. Eski sürümde (v1) saklanmış tasarımlar güncel modele taşınır ve doğrulanır;
 * kayıt yoksa ya da okunamıyorsa null döner.
 */
export async function readAutosave(): Promise<StandDesign | null> {
  let value: unknown;
  try {
    const db = await openDb();
    value = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch (err) {
    console.warn('Otomatik kayıt okunamadı', err);
    return null;
  }
  if (value === undefined || value === null) return null;
  try {
    return normalizeStoredDesign(value);
  } catch (err) {
    // Boş tasarım ilk değişiklikte bu kaydın üzerine yazacak → ham hali kaybolmasın diye ayrı anahtara kopyala
    console.warn('Otomatik kayıt geçersiz, yok sayıldı; ham kayıt yedeklendi', err);
    await writeKey(`autosave-invalid-${Date.now()}`, value).catch(() => undefined);
    return null;
  }
}

/** Tasarım her değiştiğinde kısa bir gecikmeyle kaydeder. Aboneliği bırakan fonksiyonu döner. */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = useEditor.subscribe((state, prev) => {
    if (state.design === prev.design) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      write(state.design).catch((err) => console.warn('Otomatik kayıt başarısız', err));
    }, DEBOUNCE_MS);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
