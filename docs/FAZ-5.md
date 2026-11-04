# Faz 5 — Çıktı (export kalitesi, kaydet/aç) ve MVP kabul testi

> Tarih: 04.11.2026 · Çalıştırma: `npm run dev` → http://localhost:5173

## Ne yapıldı
| Alan | Dosyalar | RFP |
|---|---|---|
| Export ayarları: 1080p / 1440p / 4K, PNG \| JPG, arka plan Salon zemini / Beyaz / Şeffaf (PNG), kadraj çerçevesi aç/kapa | `src/ui/ExportControls.tsx`, `src/state/store.ts` | FR-10.2, 10.3, 10.5 |
| 16:9 kadraj çerçevesi; export tam olarak çerçevenin içini alır (dar pencerede FOV düzeltmesi) | `src/ui/ExportFrame.tsx`, `src/export/capture.tsx` (`frameFov`) | FR-10.1 |
| Kalite: 1080p 2×, 1440p 1.5× süper örnekleme (GPU her boyutta 4K çizer), yüksek kaliteli küçültme | `src/export/capture.tsx` | FR-10.6 |
| Beyaz: şeffaf çizim saf beyaz üstüne → kusursuz #ffffff; Şeffaf: gölgeler yarı saydam kalır, efektler (AO, SMAA, ton eşleme) açık | `src/scene/StandScene.tsx`, `src/scene/Hall.tsx` | FR-10.5 |
| Retina ekranda yakalama sırasında dpr'nin 2'ye dönmesi düzeltildi (aksi halde görsel 2 kat büyük çiziliyordu) | `src/App.tsx` | FR-10.3 |
| Proje dosyası `.stand` (JSON, grafikler gömülü), sürüm alanı + göç (migration) altyapısı, ayrıntılı doğrulama, eksik alanlara varsayılan | `src/model/projectFile.ts` | FR-11.2, 11.3, 11.5 |
| Kaydet (⌘S) / Aç… (⌘O), kaydedilmemiş değişiklik noktası, Yeni/Aç/Örnekler'de uyarı | `src/ui/projectActions.ts`, `src/ui/Toolbar.tsx` | FR-11.4 |

Geliştirme ajanlarla paralel: export ve proje dosyası ayrı ajanlarda; depo sözleşmesi, entegrasyon ve kabul testi ana oturumda.

## MVP kabul testi (RFP §10)
Kullanıcının tasarımı önce tarayıcıda ayrı bir anahtara (`user-backup-faz5`) yedeklendi, test sonunda geri yüklendi.

| # | Kriter | Sonuç |
|---|---|---|
| 1 | 3×2 alan → "6 m² — 3×2 m" | ✅ (arayüzden Faz 1'de, uçtan uca testte depo üzerinden) |
| 2 | 2.5 m, arka 3 m + sol 2 m → 5 panel + dikmeler | ✅ |
| 3 | Bölme + kapılı panel → depo odası | ✅ |
| 4 | Otomatik pano, "ACME" iki cephede | ✅ |
| 5 | Arka duvar iç yüz grafiği 3 panele; 2.3 m + 20 cm boşluk; 2 m'de tam boy | ✅ (yükseklik değişimi Faz 3'te arayüzden) |
| 6 | 2 spot, kova, priz | ✅ |
| 7 | Panel sil → ⌘Z geri | ✅ (Faz 2'de arayüzden) |
| 8 | Kaydet → aç → birebir aynı (grafikler dahil) | ✅ içerik birebir (yalnızca JSON alan sırası farklı); dosya 424 KB |
| 9 | Lightbox + desk, ayrı grafikler, desk ışıklı | ✅ (döndürme/duvara yaslama Faz 4'te arayüzden) |
| 10 | Çapraz açıdan 1920×1080 PNG, arayüz öğesi yok | ✅ görsel çerçevenin içiyle aynı |

Ek: Beyaz + JPG → köşe pikseli (254,254,255); Şeffaf PNG → köşe alfa 0, halı opak, kenar halesi yok; daha yeni sürümlü dosya Türkçe hata ile reddedildi.

Uçtan uca testte stand, uygulamanın kendi depo işlemleri sayfa içinden çağrılarak kuruldu (araçların arayüzden kullanımı Faz 1–4'te ayrı ayrı denendi); export, kaydet/aç ve görsel kontroller uygulamanın arayüzü/işlevleriyle yapıldı.

## Doğrulanmayanlar / notlar
- **Export süresi (hedef 4K < 5 sn) ölçülemedi:** oturum penceresi açık olmadığından tarayıcı paneli arka planda kaldı ve kareleri saniyede 1'e düşürdü (her kare tam ~1 sn). Normal bir tarayıcı sekmesinde ölçülmeli. Yakalama sırasındaki "ultra" AO kalitesi süreyi kısaltmak için "high"a çekildi (süper örnekleme kaliteyi zaten artırıyor).
- Kaydet düğmesinin indirdiği dosya ve Aç düğmesinin dosya penceresi otomasyonla tetiklenmedi; aynı işlevler (`serializeProject`, `loadProjectFile`) doğrudan çağrılarak denendi.
- "Standa odaklan" görünümü ekrana sığdırıyor, 16:9 kadraja değil; dar pencerelerde stand kadrajın dışına taşabilir.
- Sayfa yenilendikten sonra tasarım dosyaya kaydedilmemişse kaydedilmemiş noktası görünür (otomatik kayıt dosya sayılmaz) — bilinçli.
- Tarayıcıda test yedeği (`user-backup-faz5` anahtarı) duruyor; zararsız, istenirse silinebilir.
