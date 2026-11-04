# Faz 1 — Çekirdek

> Tarih: 04.11.2026 · Çalıştırma: `npm run dev` → http://localhost:5173

## Ne yapıldı
| Alan | Dosyalar | RFP |
|---|---|---|
| Durum deposu (zustand) — tüm tasarım değişiklikleri tek `commit` noktasından; **geri al / yinele (50 adım)** | `src/state/store.ts` | FR-8.2 (Faz 2'den öne alındı) |
| Otomatik kayıt (IndexedDB, 400 ms gecikmeli) ve açılışta geri yükleme | `src/state/autosave.ts`, `src/App.tsx` | FR-11.1 |
| Ayarlanabilir sahne (10–100 m), tam sayı kenarlı grid; elemanları dışarıda bırakan küçültme reddedilir | `src/model/geometry.ts`, `src/scene/Hall.tsx` | FR-1.1–1.3 |
| Zemin aracı: tıkla = kare ekle/kaldır, sürükle = dikdörtgen; Silgi aracı; hover ve önizleme | `src/scene/tools/FloorTool.tsx` | FR-2.1–2.7 |
| Kamera: Perspektif / Üst / Ön / Yan, Standa odaklan, yumuşak geçiş, zemin altına inmez; çizim araçlarında sol tuş araca, sağ tuş döndürmeye | `src/scene/CameraRig.tsx` | FR-9.1–9.4 |
| Arayüz kabuğu: araç paneli, özellikler, durum çubuğu (alan + ölçü), Yeni proje, Örnekler, kısayollar, yükleniyor göstergesi | `src/ui/*` | §6 |

Geliştirme ajanlarla paralel yürütüldü: zemin aracı, kamera ve arayüz kabuğu ayrı ajanlarda; sözleşme (depo, geometri) ve entegrasyon ana oturumda.

## Tarayıcıda doğrulananlar
- Üst görünümde sürükleyerek 3×2 alan → "6 m² — 3×2 m"; tek kareye tıklama kaldırdı; ⌘Z geri getirdi.
- L şekli (8 m² — 3×4 m); Standa odaklan halıyı ortaladı.
- Sayfa yenilendi → tasarım otomatik kayıttan geri geldi.
- Örnekler → Referans 2 yüklendi; Ön ve Yan görünümler doğru.
- Yeni proje 15×12 m → boş sahne, durum çubuğu "Sahne: 15×12 m".

## Doğrulanmayanlar / notlar
- Silgi aracıyla sürükleme ve sahne küçültmenin reddedilmesi tarayıcıda ayrıca denenmedi (aynı kod yolları test edildi).
- Gölge veren ışığın kapsamı ±8 m; çok büyük standlarda (> ~16 m) kenarlarda gölge kaybolur → ilerde ışık kapsamı stand boyutuna göre ayarlanmalı.
- Boş sahnede "Üst" görünüm 3×3 m'lik merkezi kadraja alıyor; tüm sahneyi göstermek daha kullanışlı olabilir.
