# Stand Designer

Fuar stand alanı tasarımı için web tabanlı 3D uygulama: kareli zeminde halı alanı seç, modüler duvar ve kapı yerleştir, alın panosuna firma adını yaz, kendi giydirme grafiğini yükle, ekipman ekle, gördüğün açıdan görsel al.

## Çalıştırma
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ — statik olarak barındırılabilir
```

## Kısayollar
| Tuş | İşlev |
|---|---|
| `V` `F` `E` `W` `D` `P` `K` | Seç · Zemin · Silgi · Duvar · Kapı · Pano · Giydirme |
| `R` / `Shift+R` | Seçili ekipmanı 90° / 15° döndür |
| `⌘D` | Çoğalt |
| `Del` | Sil |
| `⌘Z` / `⌘⇧Z` | Geri al / Yinele |
| `⌘S` / `⌘O` | Projeyi kaydet (`.stand`) / aç |
| `G` | Grid aç/kapa |
| `Esc` | Seçimi bırak → aracı bırak |

## Dokümanlar
- [docs/RFP.md](docs/RFP.md) — gereksinimler ve kararlar
- [docs/FAZ-0.md](docs/FAZ-0.md) … [docs/FAZ-6.md](docs/FAZ-6.md) — faz notları, test sonuçları, açık konular
- Dokümanlarda geçen `docs/referans.jpg` ve `docs/referans-2.jpg` referans fotoğraflarıdır; telif/marka hakları nedeniyle depoya dahil edilmemiştir.

## Yapı
- `src/model/` — veri modeli, geometri, yerleşim kuralları, proje dosyası, görsel işleme
- `src/state/` — zustand deposu (geri al/yinele), otomatik kayıt (IndexedDB)
- `src/scene/` — Three.js / React Three Fiber sahnesi ve araçlar (`tools/`)
- `src/ui/` — editör kabuğu, paneller, kısayollar
- `src/export/` — görsel yakalama
