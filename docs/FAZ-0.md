# Faz 0 — Stil Prototipi Notları

> Tarih: 04.11.2026 · Çalıştırma: `npm install` → `npm run dev` → http://localhost:5173

## Ne yapıldı
- Proje iskeleti: Vite + React 19 + TypeScript + three r187 + React Three Fiber 9 + drei 10 + postprocessing (N8AO, SMAA, Neutral tone mapping).
- Veri modeli RFP §8.1'e göre `src/model/types.ts`; iki demo tasarım `src/model/demo.ts`:
  - **Referans 1** (`docs/referans.jpg`): beyaz paneller, kapılı depo odası, alın panosu + firma adı, spotlar, çöp kovası, priz.
  - **Referans 2** (`docs/referans-2.jpg`): 3 panele yayılan giydirme (2.3 m + üstte 20 cm boşluk), ışıksız lightbox, ışıklı desk.
- Dikmeler veriden türetiliyor (panel uçları + alın panosu dizisi uçları); duvar iç/dış yüzü halıya göre bulunuyor.
- Görsel Al: görünen kamera açısından 1080p / 1440p / 4K PNG, önizleme + indirme, dosya adı `<firma>_<tarih>.png`.

## Kararlar / bulgular
| Konu | Karar |
|---|---|
| Alın panosu fontu | Inter Bold tam glif TTF (`@expo-google-fonts/inter`). Fontsource alt kümeli dosyaları drei `<Text>` ile birlikte verilemedi; TTF Türkçe karakterleri tek dosyada kapsıyor. |
| Grid | drei `<Grid>` yerine zemin dokusuna çizilen 1 m karo. Export çözünürlüğüyle ölçeklenir, sahne alanı (width × depth, merkez orijin) ile sınırlı. |
| Işık | Neredeyse dik ana ışık (gölgeler zemine), Lightformer stüdyo ortamı, PCSS yumuşak gölge, N8AO. Açılı ana ışık panellerde çapraz gölge bantları yapıyordu. |
| Panel yüzeyi | Mat (roughness 0.92); daha parlak yüzey ortam ışıklarını çapraz bant olarak yansıtıyordu. |

## Sonraki fazlara notlar
- **Export kadrajı:** Görüntü alanı 16:9 değilse export kadrajı ekrandakinden geniş olur (açı aynı). Faz 5'te ekrana 16:9 kadraj kılavuzu eklenmeli.
- **Tek sayılı sahne boyutu:** Grid merkezden çizildiği için tek sayılı genişlik/derinlikte karolar yarım metre kayar; Faz 1'de sahne kenarı tam sayıya hizalanmalı.
- **İlk yükleme:** Font + ortam haritası ilk açılışta birkaç saniye sürüyor; Faz 1'de yükleniyor göstergesi.
- **Bundle boyutu:** ~1.7 MB (gzip ~545 KB); ileride code-splitting.
