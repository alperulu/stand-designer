# Faz 6 — İki adımlı giydirme (çerçeve + görsel kütüphanesi)

> Tarih: 04.11.2026 · RFP v1.4, kararlar K19–K22

## Akış
1. **Çerçeve çiz:** "Giydirme" aracı (`K`) → duvar **yüzeyinde** panelden panele sürükle (tek panel için panele tıkla); duvarın dibinde köşeden köşeye sürüklemek de çalışır. Yan yana çerçeveler Shift ile seçilip **"Çerçeveleri birleştir"** ile tek çerçeve yapılabilir; mevcut çerçevelerin üstünden çizmek de birleştirir (görsel korunur). Çerçeve tıklanan yüze (iç/dış) yerleşir; zeminden çizilirse kameranın baktığı yüze. Kapılı panel, duvarsız kenar veya iç/dış yüzü karışan dizi kırmızı görünür ve oluşturulmaz. Alternatif: panelleri seçip sağ panelde "Seçili panellere çerçeve oluştur".
2. **Görsel yükle:** Sol paneldeki **Görseller** kütüphanesine JPG/PNG yükle (çoklu; dosyaları bu alana sürükleyip bırakmak da olur).
3. **Yerleştir:** Küçük resmi sahnedeki çerçeveye (veya lightbox/desk ön yüzüne) sürükle-bırak. Alternatif: çerçeveyi seç → küçük resme tıkla ya da çerçeve panelinden "Görsel yükle…".

Boş çerçeve editörde kesikli çizgi + "3 m × 2.3 m · 3000 × 2300 px / Görseli buraya sürükleyin" etiketiyle görünür, export'ta görünmez. Bir görsel birden çok çerçevede kullanılabilir; kütüphaneden silinince çerçeveler boş kalır.

## Veri modeli v2
- `design.images: ImageAsset[]` (id, name, src, width, height)
- `Graphic` = çerçeve: `{ id, panelIds, face, fit, imageId? }`
- `StandElement.front = { imageId?, fit }`
- v1 dosyalar ve tarayıcıdaki v1 otomatik kayıt açılışta v2'ye dönüştürülür (aynı görseller tek kütüphane öğesine birleşir; PNG/JPEG ölçüsü dosya başlığından okunur). Otomatik kayıt geçersiz çıkarsa ham hali `autosave-invalid-<zaman>` anahtarına yedeklenir.

## Dosyalar
| Alan | Dosya | Kim |
|---|---|---|
| Model, depo (`addImages`, `removeImage`, `addFrame`, `setFrameImage`, `setElementImage`), örnekler | `src/model/types.ts`, `src/state/store.ts`, `src/model/demo.ts` | ana oturum |
| Giydirme aracı | `src/scene/tools/GraphicTool.tsx` | ajan |
| Çerçeve görünümü/seçimi, sürükle-bırak hedefleme | `src/scene/Walls.tsx`, `src/scene/Elements.tsx`, `src/scene/ImageDrop.tsx` | ajan |
| Görsel kütüphanesi, çerçeve/eleman paneli, `K` kısayolu | `src/ui/ImageLibrary.tsx`, `src/ui/PropertiesPanel.tsx`, `src/ui/ToolPanel.tsx` | ajan |
| Dosya formatı v2 + v1 dönüşümü (öz kontrol 31/31) | `src/model/projectFile.ts`, `src/state/autosave.ts` | ajan |

## Tarayıcıda doğrulananlar
Kullanıcının otomatik kaydı önce `user-backup-giydirme` anahtarına yedeklendi; test 4 adım geri alınarak bitirildi.
- Tarayıcıdaki v1 otomatik kayıt v2'ye dönüştürülüp kayıpsız açıldı (6 m², 7 panel).
- `K` → arka duvarın iki paneli boyunca sürükleme → iç yüzde 2 m × 2 m çerçeve, etiket ve seçim.
- Kütüphaneye JPG yükleme → küçük resim, "2000×2000 px".
- Küçük resmi **gerçek fare sürüklemesiyle** çerçeveye bırakma → görsel iki panele yayıldı, kullanım rozeti 1.
- Görsel kaldırılınca boş çerçeve export'ta görünmedi.

## Doğrulanmayanlar / notlar
- Lightbox/desk ön yüzüne sürükle-bırak tarayıcıda denenmedi (aynı bırakma katmanı).
- Çerçeve panelinden "Görsel yükle…" iki geri alma adımı oluşturur (kütüphaneye ekle + ata).
- Birden çok çerçevede "Doldur/Sığdır" değişikliği çerçeve başına bir geri alma adımıdır.
- Tarayıcıda test yedekleri duruyor: `user-backup-faz5` (eski), `user-backup-giydirme` (v1, bu testten önce); zararsız.

## Güncelleme — çok panelli çerçeve ve birleştirme (K24)
- Kullanıcı geri bildirimi: araç yalnızca 1 panellik çerçeve oluşturabiliyordu — araç imleci zemine indiriyordu; panel yüzeyine basınca duvarın arkasındaki zemin hedefleniyordu.
- Giydirme aracı artık önce duvar yüzeyini hedefliyor; sürüklerken çerçeve duvar hizası boyunca panel panel uzuyor, yüz tıklanan taraftan belirleniyor. Zemin yöntemi yedek olarak duruyor.
- `mergeFrames`: aynı yüz + aynı hiza + aradaki paneller düz ve kesintisiz; ilk görsel/yerleşim korunur; tek geri alma adımı. `addFrame` üzerine çizilen çerçevelerin görselini devralıyor.
- Hata düzeltmesi: çerçeve ve ölçü etiketleri (drei `Html`) tıklamaları yutuyordu — drei `pointerEvents`'i yalnızca transform modunda uyguluyor; etiketlere `style.pointerEvents = 'none'` eklendi.
- Doğrulama: birleştirme mantığı 8/8 test; tarayıcıda yüzeyde sürükleme → 2 m çerçeve, iki tek çerçeve → Shift seçim → birleştir → 2 m çerçeve, etiket üstüne tıklama → seçim. Test adımları geri alındı.
