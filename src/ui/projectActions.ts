// Kaydet / Aç (FR-11.2, 11.3) — araç çubuğu ve klavye kısayolları aynı işlevleri kullanır.
import { create } from 'zustand';
import { PROJECT_EXTENSION, parseProject, projectFileName, serializeProject } from '../model/projectFile';
import type { StandDesign } from '../model/types';
import { useEditor } from '../state/store';
import { hasUnsavedWork } from './helpers';

/** Araç çubuğunda gösterilen son dosya hatası (kapatılabilir). */
export const useProjectStatus = create<{ error: string | null; dismiss: () => void }>()((set) => ({
  error: null,
  dismiss: () => set({ error: null }),
}));
const setError = (error: string | null) => useProjectStatus.setState({ error });

export const UNSAVED_CONFIRM = 'Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?';

/** Odaktaki metin alanı değerini bulanıklaştırmada işliyorsa (ör. firma adı) önce onu işlet. */
function commitFocusedInput() {
  const el = document.activeElement;
  if (el instanceof HTMLElement && el !== document.body) el.blur();
}

/** Tasarımı `.stand` dosyası olarak indirir ve kaydedilmiş say. */
export function saveProject() {
  commitFocusedInput();
  const { design, markSaved } = useEditor.getState();
  try {
    const url = URL.createObjectURL(serializeProject(design));
    const a = document.createElement('a');
    a.href = url;
    a.download = projectFileName(design, new Date());
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // İndirme başlasın diye URL kısa bir süre canlı tutulur.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    markSaved();
    setError(null);
  } catch (err) {
    console.error('Proje kaydedilemedi', err);
    setError('Proje kaydedilemedi.');
  }
}

/** Seçilen dosyayı okuyup yükler; kaydedilmemiş değişiklik varsa onay ister. */
export async function loadProjectFile(file: File) {
  let text: string;
  try {
    text = await file.text();
  } catch {
    setError('Dosya okunamadı.');
    return;
  }
  let design: StandDesign;
  try {
    design = parseProject(text);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Proje dosyası açılamadı.');
    return;
  }
  const state = useEditor.getState();
  if (hasUnsavedWork(state) && !window.confirm(UNSAVED_CONFIRM)) return;
  state.loadDesign(design);
  state.markSaved();
  state.requestView('focus');
  setError(null);
}

/** Dosya seçme penceresini açar. Gizli <input type=file> her çağrıda yeniden oluşturulur. */
export function openProject() {
  commitFocusedInput();
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = `${PROJECT_EXTENSION},application/json`;
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (file) void loadProjectFile(file);
  });
  input.addEventListener('cancel', () => input.remove());
  document.body.appendChild(input);
  input.click();
}
