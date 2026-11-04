# Faz 3 — Görünüm (alın panosu, renk, grafik)

> Tarih: 04.11.2026 · Çalıştırma: `npm run dev` → http://localhost:5173

## Ne yapıldı
| Alan | Dosyalar | RFP |
|---|---|---|
| Depo: `addFascia`/`removeFascia`/`autoFascia`, `setCompanyName`, `setPanelColor`, `addGraphic`/`setGraphicFit`/`removeGraphic`, `openPerimeterEdges`, `validateGraphicPanels`; duvar konan kenardan pano kalkar | `src/state/store.ts` | FR-5.x, 6.x |
| Görsel işleme: PNG/JPG/SVG, uzun kenar ≤ 4096 px, SVG raster'a çevrilir | `src/model/image.ts` | FR-5.3, §11 |
| Pano aracı (`P`): kenara tıkla ekle/kaldır, kenar boyunca sürükle; duvarlı kenar engelli | `src/scene/tools/FasciaTool.tsx` | FR-6.1–6.3 |
| Özellikler: firma adı (Enter/odak kaybında kaydedilir), otomatik pano, panoları kaldır; panel rengi (iç/dış/her ikisi, 10 renk + özel HEX); grafik yükleme, alan ve önerilen piksel bilgisi, doldur/sığdır, kaldır, oran uyarısı; kapıya çevirmede grafik onayı | `src/ui/PropertiesPanel.tsx` | FR-5.1–5.8, 6.4 |

Geliştirme ajanlarla paralel: pano aracı ve arayüz ayrı ajanlarda; depo sözleşmesi, görsel işleme ve entegrasyon ana oturumda.

## Tarayıcıda doğrulananlar
Test, kullanıcının mevcut tasarımı üzerinde yalnızca ekleme yapılarak yürütüldü ve sonunda 6 adım geri alınarak tasarım eski haline döndürüldü.
- Firma adı "ACME Fuarcılık" → iki cephede, Türkçe "ı" doğru.
- Otomatik pano → ön + sağ açık kenarlar (5 kenar), köşe dikmeleri oluştu.
- Shift ile 2 panel seçimi → "Grafik alanı: 2 m × 2 m · Önerilen 2000 × 2000 px".
- 3:2 PNG yükleme → iki panele yayıldı, dikmeler önde; oran uyarısı gösterildi.
- Sığdır + 2.5 m → grafik 2.3 m alana boşluklu yerleşti.
- Panel rengi kırmızı → uygulandı.
- Export → `acme-fuarcilik_2026-11-04.png`, vurgu yok, tüm öğeler görselde.

## Doğrulanmayanlar / notlar
- Pano aracıyla elle tıklama/sürükleme tarayıcıda denenmedi (otomatik pano denendi; aynı depo işlemlerini kullanıyor).
- Özel renk seçici yalnızca seçici kapanınca uygular (geri alma geçmişi temiz kalsın diye); sürüklerken 3B görünüm canlı güncellenmez.
- Kapı aracıyla (sahnede) grafikli paneli kapıya çevirince onay sorulmaz; grafik o panelden sessizce çıkar (özellikler panelinden çevirmede onay var).
- Dosya seçme penceresi otomasyonla açılamadığı için yükleme, sayfada üretilen bir PNG dosya alanına verilerek test edildi.
