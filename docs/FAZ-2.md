# Faz 2 — Duvarlar

> Tarih: 04.11.2026 · Çalıştırma: `npm run dev` → http://localhost:5173

## Ne yapıldı
| Alan | Dosyalar | RFP |
|---|---|---|
| Depo: `addWalls`, `setWallType`, `setDoor`, `setWallHeight`, `removeEntities`, seçim; kapıya çevrilen panel grafiklerden çıkar | `src/state/store.ts` | FR-3.x, 4.x, 5.8, 8.1 |
| Duvar aracı (`W`): köşe noktasına yapışma, baskın eksene kilitli sürükleme, hayalet paneller (dolu/sahne dışı kenar kırmızı), uzunluk etiketi, tek geri alma adımı | `src/scene/tools/WallTool.tsx` | FR-3.1, 3.3, 3.7, 3.8 |
| Kapı aracı (`D`): en yakın kenara tıkla → boşsa kapılı panel, düzse kapılıya, kapılıysa düze | `src/scene/tools/WallTool.tsx` | FR-4.1, 4.2 |
| Seçim: tıkla, Shift ile çoklu, boşluğa tıkla = temizle; mavi vurgu + hover | `src/scene/Walls.tsx`, `src/scene/SelectionLayer.tsx` | FR-8.1 |
| Özellikler paneli: Düz/Kapılı, Menteşe Sol/Sağ, Açılış İçe/Dışa, Sil; proje geneli 2 m / 2.5 m | `src/ui/PropertiesPanel.tsx` | FR-3.2, 3.3, 4.3 |
| Kısayollar: `W`, `D`, `Del`/`Backspace`, `Esc` (önce seçimi, sonra aracı bırakır) | `src/ui/useShortcuts.ts` | §6 |
| Export sırasında seçim vurgusu ve araç önizlemeleri gizlenir, sonra geri gelir | `src/export/capture.tsx` | FR-10.4 |

Geliştirme ajanlarla paralel: duvar/kapı aracı, sahnede seçim ve arayüz ayrı ajanlarda; depo sözleşmesi, export ve entegrasyon ana oturumda.

## Tarayıcıda doğrulananlar
- 3×2 halı + arka 3 m + sol 2 m duvar + 1 m bölme + kapılı panel → "Duvar: 7 panel", dikmeler kendiliğinden oluştu.
- Panel seçimi → mavi vurgu, sağ panelde Seçim bölümü; Düz → Kapılı çevirme; Menteşe Sağ → kol sola geçti.
- `Del` → 6 panel, `⌘Z` → 7 panel.
- Yükseklik 2 m → tüm paneller, dikmeler ve kapı güncellendi.
- Panel seçiliyken export → görselde vurgu yok, seçim sonra geri geldi.

## Doğrulanmayanlar / notlar
- Dolu kenar üzerinde kırmızı hayalet ve uzunluk etiketi tarayıcıda görsel olarak kontrol edilmedi (sürükleme sırasında ekran görüntüsü alınamadı); duvar ekleme sonucu doğru.
- Shift ile çoklu seçim denenmedi.
- Menteşe pimleri (açılış yönü) çok ince; uzak açıdan neredeyse görünmüyor — kasıtlı olarak sade bırakıldı.
- Spot olmayan standlarda paneller referanstan biraz daha gri görünüyor; Faz 4'te spotlarla birlikte ışık dengesi tekrar ayarlanmalı.
