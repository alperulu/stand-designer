# Faz 4 — Aksesuarlar ve grafikli elemanlar

> Tarih: 04.11.2026 · Çalıştırma: `npm run dev` → http://localhost:5173

## Ne yapıldı
| Alan | Dosyalar | RFP |
|---|---|---|
| Yerleşim kuralları: ekipman izleri, çarpışma (duvar, dikme, diğer ekipman, sahne sınırı), duvara yaslama, spotun duvar/pano üst kenarına yapışması | `src/model/placement.ts` | FR-7.3, 7.4, 8.1a, 8.1c, 12.3 |
| Depo: `addItem`, `setTransforms` (tek geri alma adımı), `duplicateItems` (çakışmayan konum arar), lightbox/desk grafik, sığdırma ve ışık | `src/state/store.ts` | FR-7.1, 8.1d, 12.4–12.7 |
| Yerleştirme modu (kütüphaneden tıkla → yeşil/kırmızı önizleme, tıkla yerleştir, Shift+tık devam, `R` döndür, Esc/sağ tık iptal) ve sürükle-bırak | `src/scene/tools/PlacementTool.tsx` | FR-7.1 |
| Sahnede seçme, sürükleyerek taşıma (0.1 m, çoklu), döndürme halkası (15°), spotun kenar boyunca kayması | `src/scene/tools/TransformLayer.tsx`, `Accessories.tsx`, `Elements.tsx` | FR-8.1a–c |
| Arayüz: Ekipmanlar kütüphanesi, seçim özellikleri (X/Z/açı, ±90°, spot yönü, çoğalt, sil, ön yüz grafiği, ışıklı/ışıksız), `R`/`Shift+R`/`⌘D` | `src/ui/*` | §6, FR-12.x |
| Gölge veren ışık standla birlikte taşınır, kapsamı stand boyutuna göre büyür; ortam ışığı biraz artırıldı | `src/scene/Lighting.tsx` | Faz 1/2 notları |

Geliştirme ajanlarla paralel: sahnede taşıma/döndürme, yerleştirme modu ve arayüz ayrı ajanlarda; yerleşim kuralları, depo, ışık ve entegrasyon ana oturumda.

## Tarayıcıda doğrulananlar
Test, kullanıcının mevcut tasarımı üzerinde yalnızca ekleme yapılarak yürütüldü; sonunda 7 adım geri alınarak tasarım eski haline döndürüldü.
- Kütüphaneden Desk → yeşil önizleme + ön yön oku → tıkla, yerleşti ve seçildi; döndürme halkası çıktı.
- Desk sürüklenerek taşındı (X −0.1 → 0.8), `R` ile 90° döndü.
- Spot → arka duvar üst kenarına yapıştı, yön "İçe".
- Desk "Işıklı" yapıldı; `⌘D` ile çoğaltıldı (Ekipman: 3).
- Döndürme halkası sürüklenince 90° → 75°; çakışacak bir açıya çevrilince eski açıda kaldı.
- Export'ta seçim vurgusu ve halka yok.

## Testte bulunup düzeltilenler
- Spot yerleştirme: imleç duvarın üstündeyken ışın zemine indiriliyor ve duvarın arkasında bir nokta bulunuyordu → spot için kesişim duvar yüksekliğindeki düzlemde yapılıyor.
- Çoğaltma kopyayı sabit +0.5 m'ye koyuyor, çakışmaya bakmıyordu → sırayla 11 konum denenip çakışmayan ilkine konuyor (bu düzeltme tarayıcıda ayrıca denenmedi; tip kontrolü ve build temiz).

## Doğrulanmayanlar / notlar
- Kütüphaneden sürükle-bırak (HTML drag) tarayıcıda denenmedi; tıkla-yerleştir yolu denendi.
- Ekipman ön yüz grafiği yükleme denenmedi (duvar grafiğiyle aynı görsel işleme yolunu kullanıyor).
- Arka duvardaki spot zemini aydınlatıyor; ışık lekesi uzaktan zor seçiliyor. Spot şiddeti Faz 5'te export kalitesiyle birlikte ayarlanabilir.
- Duvar silinince üzerindeki spot havada kalır (otomatik silinmez).
