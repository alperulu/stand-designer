# Stand Designer — RFP (Teklif Talebi / Gereksinim Dokümanı)

> Sürüm: 1.6 · Tarih: 04.11.2026 · Durum: MVP geliştirildi (Faz 0–5) — bkz. §14

---

## 1. Özet

Stand Designer, **yalnızca fuar stand alanı tasarımı** için kullanılan, sade ve hızlı bir **web tabanlı 3D** tasarım uygulamasıdır. Kullanıcı 1×1 m'lik kareli bir zeminde stand alanını seçer, zemine halı döşer, modüler stand duvarlarını (düz / kapılı) yerleştirir, alın panosuna firma adını yazar, aksesuar ekler ve tasarımı istediği kamera açısından **görsel (PNG/JPG) olarak dışa aktarır**.

Hedef çıktı: Referans görseldeki gibi (`docs/referans.jpg`) — beyaz modüler panel duvarlar, köşe dikmeleri, koyu renk halı zemin, kapılı depo odası, alın panosu üzerinde firma adı, spot lambalar, çöp kovası ve grup priz — temiz, sunuma hazır bir 3D render. Kullanıcı kendi **giydirme grafik tasarımını** yükleyip arka duvara ve grafikli stand elemanlarına (lightbox, desk) yerleştirebilir; gerçek kurulum örneği: `docs/referans-2.jpg`.

## 2. Amaç ve Başarı Kriterleri

| Amaç | Ölçüt |
|---|---|
| CAD bilgisi olmayan biri hızlıca stand tasarlayabilmeli | 3×3 m'lik standart bir stand < 2 dakikada tasarlanabilmeli |
| Ölçüler gerçekçi ve standart modüllere uygun olmalı | Tüm elemanlar 1 m grid'e oturur; serbest/hatalı ölçü oluşmaz |
| Sunuma hazır görsel üretilebilmeli | Tek tıkla, ekranda görülen açıdan yüksek çözünürlüklü görsel |

## 3. Hedef Kullanıcılar

**Firma içi kullanım.** Uygulamayı kendi ekibimiz (satış / proje / tasarım) kullanır; müşteriye önerilen standı hızlıca görselleştirmek ve sunmak için. Kullanıcı hesabı, giriş veya çoklu kiracı (multi-tenant) yapısı **yoktur**.

## 4. Kapsam

### 4.1 Kapsam İçi (MVP)
1. 1×1 m kareli 3D zemin (sahne)
2. Kare seçerek stand zemin alanı belirleme + antrasit halı döşeme
3. Duvar çizme aracı: 1 m genişlik, **2 m veya 2.5 m** yükseklik modüler panel
4. Kapılı duvar paneli
5. Duvar rengi seçimi ve panele grafik/logo giydirme
6. Alın panosu (fascia) + firma adı
7. Aksesuarlar: spot lamba, çöp kovası, grup priz (+ temel mobilya, bkz. §5.7)
8. Grafikli stand elemanları: 0.7×1 m lightbox ve 1×1 m desk; ön yüze grafik giydirme, ışıklı/ışıksız (bkz. §5.12)
9. 3D kamera kontrolü (döndür, kaydır, yakınlaştır) ve hazır görünümler
10. Görünen açıdan görsel dışa aktarma (export)
11. Proje kaydetme / yükleme
12. Seçme / silme / geri al–yinele

### 4.2 Kapsam Dışı
- Serbest form modelleme, eğri duvarlar, özel ölçülü panel
- Fotogerçekçi (ray-tracing) render
- Kullanıcı hesabı, giriş, sunucu tarafı depolama
- Çok kullanıcılı eşzamanlı düzenleme
- Maliyet/teklif hesaplama `[İLERİ FAZ ADAYI]`
- Masaüstü kurulum paketi (web uygulaması ileride Electron/Tauri ile paketlenebilir)

## 5. Fonksiyonel Gereksinimler

### 5.1 Sahne ve Grid
- **FR-1.1** Uygulama açıldığında boş, açık gri bir zemin üzerinde **1×1 m karelerden oluşan grid** görünür.
- **FR-1.2** Sahne boyutu **ayarlanabilir**: yeni projede genişlik × derinlik girilir (varsayılan 30×30 m, 10–100 m arası). Proje sırasında da değiştirilebilir; mevcut elemanları dışarıda bırakacak küçültmeye izin verilmez.
- **FR-1.3** Grid çizgileri ince ve belirgin olmalı; export'ta görünür/gizli seçilebilir.

### 5.2 Zemin Alanı Seçimi ve Halı
- **FR-2.1** "Zemin" aracı seçiliyken kullanıcı kareye tıklayarak tek tek veya **sürükleyerek dikdörtgen alan** halinde seçim yapar.
- **FR-2.2** Seçili karelere **düz desen halı** yerleştirilir; bu kareler standın zemin alanını oluşturur.
- **FR-2.3** Halı tek parça görünür (kare kare dikiş izi olmaz), hafif kalınlığa (~1 cm) ve ince keçe dokusuna sahiptir.
- **FR-2.4** Halı rengi **sabit antrasittir**; renk seçeneği yoktur.
- **FR-2.5** Silgi modu veya tekrar tıklama ile halı karesi kaldırılabilir.
- **FR-2.6** Arayüz toplam alanı ve dış ölçüyü gösterir (ör. "Stand alanı: 6 m² — 3×2 m").
- **FR-2.7** Alan L, U gibi dikdörtgen olmayan şekillerde olabilir.

### 5.3 Duvar Aracı
- **FR-3.1** "Duvar" aracı seçiliyken kullanıcı grid çizgileri üzerinde **bir noktadan diğerine sürükleyerek** duvar çizer; duvar otomatik olarak 1 m'lik panellere bölünür.
- **FR-3.2** Panel ölçüsü: **1 m genişlik × 2 m veya 2.5 m yükseklik**, ~4 cm kalınlık, varsayılan beyaz.
- **FR-3.3** Yükseklik **proje genelinde** seçilir (2 m / 2.5 m); değiştirildiğinde tüm paneller, dikmeler ve alın panosu buna göre güncellenir. Panel bazında farklı yükseklik yoktur.
- **FR-3.4** Duvarlar **yalnızca grid çizgilerine** (kare kenarlarına) yerleşir; yalnızca X veya Z ekseni yönünde.
- **FR-3.5** Panel birleşimlerine ve uçlarına **otomatik dikme (alüminyum profil)** eklenir — referans görseldeki gibi.
- **FR-3.6** Duvarlar standın dış kenarına ve iç alana (bölme / depo odası) konulabilir.
- **FR-3.7** Aynı kenara ikinci duvar yerleştirilemez (çakışma engeli).
- **FR-3.8** Yerleştirme sırasında yarı saydam "hayalet" önizleme gösterilir; geçersiz konumda kırmızı olur.

### 5.4 Kapılı Duvar
- **FR-4.1** "Kapılı duvar" aracı ile 1 m'lik panel, içinde kapı bulunan panel olarak yerleştirilir.
- **FR-4.2** Mevcut düz bir panel, seçilip kapılı panele dönüştürülebilir (ve tersi).
- **FR-4.3** Kapı menteşe tarafı (sağ/sol) ve açılış yönü (iç/dış) değiştirilebilir.
- **FR-4.4** Kapı ölçüsü: ~0.8 m × 1.9 m, yuvarlak kapı kolu (referans görsel). 2.5 m panelde kapı üstünde dolu panel kalır.

### 5.5 Duvar Rengi ve Grafik Giydirme
- **FR-5.1** Seçili panel(ler)in rengi değiştirilebilir: hazır palet + serbest renk seçici (HEX).
- **FR-5.2** Panelin **iç veya dış yüzüne** ayrı ayrı renk/grafik uygulanabilir.
- **FR-5.3** **Giydirme iki adımda yapılır** (v1.4):
  1. **Çerçeve:** "Giydirme" aracıyla (`K`) duvar **yüzeyinde panelden panele sürüklenerek** boş bir **giydirme çerçevesi** çizilir (tek panel için tıklanır); çerçeve tıklanan yüze (iç/dış) yerleşir. Alternatif: panelleri seçip "Seçili panellere çerçeve oluştur".
  2. **Görsel:** JPG/PNG görseller **görsel kütüphanesine** (toplu) yüklenir; kütüphaneden küçük resim sahnedeki çerçeveye **sürükle-bırak** ile yerleştirilir (ya da çerçeve seçiliyken küçük resme tıklanır / çerçeve panelinden doğrudan yüklenir).
- **FR-5.3a** Boş çerçeve editörde kesikli çizgi + ölçü etiketiyle ("3 m × 2.3 m · 3000 × 2300 px") görünür, **export'ta gizlenir**.
- **FR-5.3b** Aynı görsel birden çok çerçevede/elemanda kullanılabilir; kütüphaneden silinen görselin çerçeveleri boş kalır.
- **FR-5.3c** **Çerçeve birleştirme:** Aynı duvar hizasında ve aynı yüzdeki çerçeveler Shift ile seçilip "Çerçeveleri birleştir" ile tek çerçeve yapılır (aradaki düz paneller dahil; kapılı panel/boşluk varsa reddedilir). Mevcut çerçevelerin üstünden yeni çerçeve çizmek de onları birleştirir. Her iki durumda ilk görsel ve yerleşimi korunur.
- **FR-5.4** Bir çerçeve **birden fazla bitişik panele yayılabilir** (ör. 3 m'lik arka duvar boyunca tek büyük grafik); aynı hizadaki ve aynı yüzdeki paneller.
- **FR-5.4a** **Grafik alanı yüksekliği:**
  - **2.5 m duvar:** grafik **2.3 m** yüksekliğindedir, alttan başlar; **üstte 20 cm** panel renginde boş şerit kalır (aydınlatma spotlarının takıldığı bölge).
  - **2 m duvar:** grafik **tam yükseklik (2 m)** kaplar, boşluk bırakılmaz.
  - Proje yüksekliği değiştirildiğinde grafik alanları bu kurala göre otomatik güncellenir.
- **FR-5.4b** Grafik genişliği panel genişliği × panel sayısıdır; dikmeler grafiğin önünde görünür (gerçek kurulumdaki gibi).
- **FR-5.5** Grafik yerleşimi: doldur (kırp) / sığdır seçenekleri. Arayüz yüklenen görselin oranı ile grafik alanı oranını (ör. 3 m × 2.3 m) gösterir.
- **FR-5.6** Çoklu seçim (Shift+tık veya sürükleyerek) ile birden fazla panel aynı anda boyanabilir.
- **FR-5.7** **Kapılı panellere grafik uygulanamaz**; grafik seçimine dahil edilemez. Yayılan grafik yalnızca kesintisiz düz panel dizisine uygulanır (arada kapılı panel varsa seçim geçersizdir). Kapılı paneller yalnızca renklendirilebilir.
- **FR-5.8** Grafikli bir panel kapılı panele dönüştürülmek istenirse kullanıcı uyarılır; onaylanırsa grafik o panelin bulunduğu diziden kaldırılır.

### 5.6 Alın Panosu (Fascia) ve Firma Adı
- **FR-6.1** Standın **açık (duvarsız) dış kenarlarının** üstüne yatay alın panosu eklenir (yükseklik ~0.3 m, duvar yüksekliği hizasında).
- **FR-6.2** Alın panosu bulunan köşelerde ve açıklık uçlarında **taşıyıcı dikme** otomatik oluşur (referans görseldeki ön köşe dikmeleri).
- **FR-6.3** Alın panosu "Otomatik oluştur" butonuyla tüm açık kenarlara tek seferde eklenebilir; tek tek kaldırılabilir.
- **FR-6.4** Kullanıcı **firma adını** yazar; metin her alın panosu cephesinin ortasına basılır. Yazı **tek sabit font ve siyah renktedir** (referans görseldeki gibi); font/renk seçeneği yoktur.
- **FR-6.5** Metin cepheye sığmazsa otomatik küçülür.

### 5.7 Aksesuarlar
- **FR-7.1** Sağ panelde aksesuar kütüphanesi; sürükle-bırak ile sahneye eklenir.
- **FR-7.2** MVP aksesuar listesi:

  | Aksesuar | Yerleşim |
  |---|---|
  | Spot lamba (kol tipi) | Duvar üst kenarı / alın panosu üzerine takılır, ışık yayar |
  | Çöp kovası | Zemine (halı üstüne) |
  | Grup priz | Zemine, duvar dibine |
  | Masa + 3 sandalye | Zemine; Ø60 masa, sandalyeler masaya yanaşık, toplam Ø1.2 m yuvarlak iz (döndürmek alanı büyütmez) |
  | Broşürlük | Zemine |

- **FR-7.3** Zemin aksesuarları 0.1 m adımlarla serbest konumlanır ve 90° (Shift ile 15°) döndürülebilir.
- **FR-7.4** Spotlar en yakın duvar/pano üst kenarına yapışır ve gerçek ışık kaynağı olarak sahneyi aydınlatır (export'ta da).

### 5.8 Düzenleme
- **FR-8.1** Nesne seçme, çoklu seçim, silme (Delete tuşu ve buton).
- **FR-8.1a** **Taşıma:** Sahnedeki her ekipman (aksesuarlar §5.7, lightbox/desk §5.12) fareyle tutulup zemin üzerinde sürüklenerek taşınır; 0.1 m adımlara yapışır, duvar/dikme/diğer elemanların içine giremez. Çoklu seçimde seçili ekipmanlar birlikte taşınır.
- **FR-8.1b** **Döndürme:** Seçili ekipmanın çevresinde döndürme halkası görünür; halka sürüklenerek 15° adımlarla döndürülür. Kısayol: `R` 90°, `Shift+R` 15°.
- **FR-8.1c** **Spotlar** taşınırken yalnızca duvar/alın panosu üst kenarı boyunca kayar; kenardan kenara geçebilir, döndürme yerine iç/dış yön değiştirilir.
- **FR-8.1d** **Çoğaltma:** `Ctrl/Cmd+D` seçili ekipmanın kopyasını yanına koyar.
- **FR-8.2** Geri al / yinele (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z) — en az 50 adım.
- **FR-8.3** "Tümünü temizle" (onaylı).

### 5.9 Kamera ve Görünüm
- **FR-9.1** Fare ile döndürme (orbit), kaydırma (pan), tekerlek ile yakınlaştırma.
- **FR-9.2** Hazır görünümler: **Perspektif** (referans görseldeki çapraz üst açı), **Üstten (plan)**, **Ön**, **Yan**.
- **FR-9.3** "Standa odaklan" butonu: kamera stand alanını kadraja alır.
- **FR-9.4** Kamera zemin altına inemez.

### 5.10 Görsel Dışa Aktarma (Export)
- **FR-10.1** "Görsel Al" butonu, **kullanıcının o anda gördüğü kamera açısından** render alır.
- **FR-10.2** Formatlar: **PNG** (varsayılan) ve **JPG**.
- **FR-10.3** Yalnızca **yatay 16:9** format: 1920×1080, 2560×1440, 3840×2160 (4K). Kare/dikey format yoktur.
- **FR-10.4** Export'ta arayüz öğeleri (seçim çerçevesi, hayalet önizleme, ölçü etiketleri) görünmez.
- **FR-10.5** Seçenekler: grid çizgilerini göster/gizle; arka plan açık gri zemin / beyaz / şeffaf (PNG).
- **FR-10.6** Export kalitesi ekrandakinden yüksek: yumuşak gölgeler, ortam aydınlatması (ambient occlusion), kenar yumuşatma — referans görsele yakın stüdyo ışığı.
- **FR-10.7** Dosya adı: `<firma-adi>_<tarih>.png`.

### 5.11 Proje Kaydetme / Yükleme
- **FR-11.1** Tasarım tarayıcıda **otomatik saklanır** (sayfa yenilense de kaybolmaz).
- **FR-11.2** "Kaydet" → proje dosyası (`.stand` — içi JSON, yüklenen grafikler gömülü) bilgisayara indirilir.
- **FR-11.3** "Aç" → proje dosyası seçilip yüklenir.
- **FR-11.4** "Yeni proje" → boş sahne (kaydedilmemiş değişiklik varsa uyarı).
- **FR-11.5** Dosya formatı sürüm numarası taşır; eski sürüm dosyalar açılabilir.

### 5.12 Grafikli Stand Elemanları (Lightbox ve Desk)
Arka duvar grafiğine ek olarak, zemine serbestçe konulan ve ön yüzüne kullanıcının kendi grafik tasarımı giydirilen elemanlar (referans: `docs/referans-2.jpg`).

- **FR-12.1** Eleman kütüphanesi:

  | Eleman | Genişlik × Yükseklik × Derinlik | Grafik yüzü |
  |---|---|---|
  | Lightbox | 0.7 m × 1 m × 0.15 m | Ön yüz |
  | Desk | 1 m × 1 m × 0.3 m | Ön yüz |

- **FR-12.2** Elemanlar sürükle-bırak ile zemine konur; 0.1 m adımlarla konumlanır, 90° (Shift ile 15°) döndürülür.
- **FR-12.3** Elemanlar duvarların, dikmelerin ve birbirlerinin içine giremez; duvar dibine yanaştırıldığında yüzeye yapışır (snap).
- **FR-12.4** Lightbox/desk ön yüzü de bir giydirme çerçevesidir: görsel kütüphaneden **sürükle-bırak** ile ya da seçip yükleyerek yerleştirilir (PNG/JPG). Grafik ön yüzün tamamını kaplar (lightbox 0.7×1 m, desk 1×1 m); doldur (kırp) / sığdır seçilebilir. Diğer yüzler beyazdır.
- **FR-12.5** **Işıklı / ışıksız** seçimi eleman bazında yapılır:
  - Işıklı: ön yüz arkadan aydınlatılmış (backlit) görünür — grafik parlak ve doygun, kenarlarda hafif ışıma; çevresine hafif ışık yayar.
  - Işıksız: düz baskı görünümü.
  - Varsayılan: lightbox ışıklı, desk ışıksız.
- **FR-12.6** Işıklı görünüm export'ta da birebir yansır.
- **FR-12.7** Aynı grafik birden fazla elemana uygulanabilir (kopyala / yapıştır stil).

## 6. Kullanıcı Arayüzü

```
┌────────────────────────────────────────────────────────────────────┐
│ Stand Designer  [Yeni][Aç][Kaydet]  [↶][↷]   Yükseklik:[2m|2.5m]  [ Görsel Al ] │
├────────┬──────────────────────────────────────────┬────────────────┤
│ ARAÇLAR│                                          │ ÖZELLİKLER     │
│ ▢ Seç  │                                          │ (seçime göre)  │
│ ▦ Zemin│                                          │ Duvar rengi    │
│ ▮ Duvar│             3D SAHNE (grid)              │ Grafik yükle   │
│ ▯ Kapı │                                          │ Kapı yönü      │
│ ▭ Pano │                                          │ Firma adı      │
│ ⌫ Sil  │                                          │────────────────│
│        │                                          │ AKSESUARLAR    │
│        │                                          │ 💡 🗑 🔌 🪑 …  │
├────────┴──────────────────────────────────────────┴────────────────┤
│ Görünüm: [Perspektif][Üst][Ön][Yan] [Standa odaklan]  Alan: 6 m² — 3×2 m │
└────────────────────────────────────────────────────────────────────┘
```

- Arayüz dili: **Türkçe**.
- Klavye kısayolları: `V` seç, `F` zemin, `W` duvar, `D` kapı, `P` pano, `R` döndür, `Del` sil, `Esc` aracı bırak.

## 7. Fonksiyonel Olmayan Gereksinimler

| Konu | Gereksinim |
|---|---|
| Platform | Web tarayıcı (Chrome, Edge, Safari, Firefox güncel sürümler), masaüstü/dizüstü ekranlar öncelikli |
| Performans | 200 m² stand / 300 panel / 50 aksesuar ile ≥ 50 FPS (orta seviye dizüstü) |
| Export süresi | 4K görsel < 5 sn |
| Kurulum | Kurulum gerektirmez; statik site olarak barındırılır (sunucu/veritabanı yok) |
| Erişim | Açık erişim: hesap, giriş veya şifre yok; adresi bilen kullanır |
| Kurumsal kimlik | Uygulamada ve export görselinde firma logosu/filigranı yok |
| Gizlilik | Tüm veriler kullanıcının tarayıcısında / bilgisayarında kalır |

## 8. Önerilen Teknik Mimari

| Katman | Teknoloji | Gerekçe |
|---|---|---|
| Arayüz | React + TypeScript + Vite | Hızlı geliştirme, tip güvenliği |
| 3D motor | Three.js + React Three Fiber + drei | Web 3D standardı, olgun ekosistem |
| Durum yönetimi | Zustand (+ undo/redo geçmişi) | Basit, sahne verisiyle uyumlu |
| Render kalitesi | Gölge haritaları, SSAO/N8AO, tone mapping, ortam (HDRI) ışığı | Referans görseldeki stüdyo görünümü |
| Metin | troika-three-text (drei `<Text>`) | Alın panosunda net, ölçeklenebilir yazı |
| Export | Ayrı offscreen render hedefi (yüksek çözünürlük) → PNG/JPG | Ekran çözünürlüğünden bağımsız çıktı |
| Kayıt | IndexedDB (otomatik kayıt, grafikler dahil) + `.stand` dosyası | Sunucu gerektirmez; görseller localStorage sınırına takılmaz |
| Aksesuar modelleri | glTF/GLB, düşük poligon | Hafif, web uyumlu |
| Barındırma | Statik hosting (Vercel / Netlify / şirket sunucusu) | Basit dağıtım |

### 8.1 Veri Modeli (taslak)

```ts
type Cell = { x: number; z: number };               // 1×1 m kare, tam sayı koordinat

type Edge = {                                        // grid kenarı = panel yeri
  x: number; z: number;
  axis: 'x' | 'z';
};

type Face = { color: string };

type WallPanel = {
  id: string;
  edge: Edge;
  type: 'solid' | 'door';
  door?: { hinge: 'left' | 'right'; swing: 'in' | 'out' };
  faces: { inner: Face; outer: Face };
};

type ImageAsset = {                                  // görsel kütüphanesi (v2)
  id: string;
  name: string;
  src: string;                                       // data URL (≤ 4096 px)
  width: number;
  height: number;
};

type Graphic = {                                     // giydirme çerçevesi; birden çok panele yayılabilir
  id: string;
  panelIds: string[];                                // aynı hizada, bitişik düz paneller
  face: 'inner' | 'outer';
  fit: 'cover' | 'contain';
  imageId?: string;                                  // boşsa editörde yer tutucu, export'ta gizli
};                                                   // yükseklik türetilir: 2.5 m duvar → 2.3 m, 2 m duvar → 2 m

type StandElement = {                                // grafikli serbest eleman
  id: string;
  kind: 'lightbox' | 'desk';                         // lightbox 0.7×1×0.15 m, desk 1×1×0.3 m (G×Y×D)
  position: { x: number; z: number };                // metre, 0.1 m adım
  rotationDeg: number;
  front: { imageId?: string; fit: 'cover' | 'contain' };
  illuminated: boolean;
};

type Accessory = {
  id: string;
  kind: 'spot' | 'bin' | 'power-strip' | 'table-set' | 'brochure-stand';
  position: { x: number; z: number };                // metre, 0.1 m adım
  rotationDeg: number;
  attachedTo?: string;                               // spot için panel/pano id
};

type StandDesign = {
  version: 2;                                        // v1 dosyalar açılışta v2'ye dönüştürülür
  scene: { width: number; depth: number };          // metre, 10–100
  wallHeight: 2 | 2.5;
  floor: { cells: Cell[] };                         // halı sabit antrasit
  walls: WallPanel[];
  fascia: { edges: Edge[]; companyName: string }; // tek font, siyah
  accessories: Accessory[];
  elements: StandElement[];
  graphics: Graphic[];
  images: ImageAsset[];
};
```

Tüm yapı elemanları tam sayı grid koordinatlarında tutulur → ölçü hatası yapısal olarak imkânsız; dikmeler panel ve pano uçlarından otomatik türetilir.

## 9. Fazlar ve Teslimatlar

| Faz | İçerik | Çıktı |
|---|---|---|
| **Faz 0** | Bu RFP'nin onayı, ışık/malzeme stil prototipi | Onaylı RFP + referansa benzeyen tek kare render |
| **Faz 1 — Çekirdek** | Grid sahne, kamera, zemin seçimi + halı, otomatik kayıt | Halı döşenebilen 3D sahne |
| **Faz 2 — Duvarlar** | Duvar aracı, 2/2.5 m yükseklik, otomatik dikmeler, kapılı panel, seçim/silme, undo/redo | Duvarlı stand kurulabilir |
| **Faz 3 — Görünüm** | Alın panosu + firma adı, duvar rengi, grafik giydirme | Markalı stand |
| **Faz 4 — Aksesuar ve elemanlar** | Aksesuar kütüphanesi, spot ışıkları, lightbox ve desk (grafik + ışık) | Her iki referans görseldeki stand kurulabilir |
| **Faz 5 — Çıktı** | Yüksek kaliteli export, proje kaydet/yükle dosyası | **MVP tamam** |

## 10. Kabul Kriterleri (MVP)

1. Kullanıcı boş sahnede 3×2 m alanı sürükleyerek seçer → antrasit halı döşenir, "6 m² — 3×2 m" yazar.
2. Yükseklik 2.5 m seçilir; duvar aracıyla arka kenar (3 m) ve sol kenar (2 m) boyunca çizim yapılır → 5 panel + otomatik dikmeler oluşur.
3. İç alana 1 m'lik bölme ve kapılı panel eklenerek depo odası oluşturulur.
4. "Alın panosunu otomatik oluştur" → ön ve sağ açık kenarlara pano + köşe dikmeleri eklenir; "ACME" yazılınca her iki cephede görünür.
5. Arka duvarın iç yüzüne bir görsel yüklenir, 3 panel boyunca yayılır; grafik 2.3 m yüksekliğindedir ve üstte 20 cm boş şerit kalır. Yükseklik 2 m'ye alınınca grafik tam yüksekliğe (2 m) uzar.
6. İki spot, bir çöp kovası ve bir grup priz eklenir; spotlar duvarı aydınlatır.
7. Herhangi bir panel silinir, Ctrl+Z ile geri gelir.
8. Proje kaydedilir, sayfa kapatılıp açılır, dosya yüklenir → tasarım birebir geri gelir (grafikler dahil).
9. Standa bir 0.7×1 m lightbox ve bir 1×1 m desk eklenir; her birinin ön yüzüne ayrı grafik yüklenir; desk ışıklı yapılır → ön yüz arkadan aydınlatılmış gibi parlar, lightbox ışıksız düz baskı görünür. Desk 90° döndürülür ve duvarın dibine yanaştırılır; duvarın içine girmez.
10. Kamera referans görseldeki çapraz üst açıya getirilir, "Görsel Al" → 1920×1080 PNG iner; görselde arayüz öğesi yoktur, gölgeler yumuşaktır.

## 11. Riskler

| Risk | Önlem |
|---|---|
| Render kalitesi referans görselin gerisinde kalabilir | Faz 0'da stil prototipi yapıp onaylatmak |
| Duvar çiziminde kullanıcı kenar yerine kareye tıklayabilir | En yakın kenara yapışma (snap) + hayalet önizleme |
| Büyük grafik dosyaları proje dosyasını şişirir / performansı düşürür | Yüklemede en fazla 4096 px'e küçültme + sıkıştırma |
| Çok sayıda spot ışığı performansı düşürür | Ekranda basit ışık, export'ta tam kalite; spot sayısı uyarısı |
| Zayıf cihazlarda 4K export | Export'u ayrı aşamada, ilerleme göstergesiyle yapmak |

## 12. Kararlar Kaydı

| # | Karar | Tarih |
|---|---|---|
| K1 | Platform: web tarayıcı uygulaması | 04.11.2026 |
| K2 | MVP'ye dahil: alın panosu + firma adı, aksesuarlar, proje kaydet/yükle, duvar rengi/grafik | 04.11.2026 |
| K3 | Duvar yüksekliği 2 m / 2.5 m seçilebilir | 04.11.2026 |
| K4 | Firma içi kullanım; hesap/giriş yok | 04.11.2026 |
| K5 | Duvar yüksekliği proje geneli seçilir (panel bazında değil) | 04.11.2026 |
| K6 | Aksesuar listesi: spot, çöp kovası, grup priz, masa+3 sandalye, broşürlük | 04.11.2026 |
| K7 | Halı yalnızca antrasit; renk seçeneği yok | 04.11.2026 |
| K8 | Grafik birden çok panele yayılabilir; 2.5 m duvarda grafik 2.3 m (üstte 20 cm spot boşluğu), 2 m duvarda tam yükseklik | 04.11.2026 |
| K9 | Açık erişim; şifre koruması yok | 04.11.2026 |
| K10 | Uygulamada ve export'ta firma logosu yok | 04.11.2026 |
| K11 | Sahne boyutu ayarlanabilir (varsayılan 30×30 m) | 04.11.2026 |
| K12 | Kapılı panellere grafik uygulanamaz | 04.11.2026 |
| K13 | Alın panosu yazısı tek font, siyah | 04.11.2026 |
| K14 | Export yalnızca yatay 16:9 (1080p / 1440p / 4K) | 04.11.2026 |
| K15 | Grafikli stand elemanları: lightbox 0.7×1×0.15 m, desk 1×1×0.3 m (G×Y×D); 1×1 desk bilgi bankosunun yerini alır | 04.11.2026 |
| K16 | Elemanlarda grafik yalnızca ön yüze; ışıklı/ışıksız eleman bazında seçilir | 04.11.2026 |
| K17 | Alın panosunda stand numarası yok, sadece firma adı | 04.11.2026 |
| K18 | Ekipmanlar yerleştirildikten sonra tutulup taşınabilir ve döndürülebilir (FR-8.1a–d) | 04.11.2026 |
| K19 | Giydirme iki adımlı: önce "Giydirme" aracıyla duvara çerçeve çizilir, sonra görsel kütüphaneden çerçeveye sürüklenir | 04.11.2026 |
| K20 | Görseller (JPG/PNG) toplu yüklenen bir kütüphanede tutulur; bir görsel birden çok çerçevede kullanılabilir | 04.11.2026 |
| K21 | Boş çerçeve editörde görünür, export'ta gizlenir | 04.11.2026 |
| K22 | Lightbox/desk ön yüzü de aynı yöntemle (kütüphaneden sürükle-bırak) giydirilir | 04.11.2026 |
| K23 | Masa + 3 sandalye: Ø60 masa, toplam Ø1.2 m; çarpışma yuvarlak iz ile, sandalyeler duvara sıfır mesafe yanaşabilir | 04.11.2026 |
| K24 | Giydirme çerçevesi duvar yüzeyinde sürüklenerek çizilir; yan yana çerçeveler birleştirilebilir, görsel korunur | 04.11.2026 |

## 13. Açık Sorular

Açık soru kalmadı. Faz 0 (stil prototipi) sırasında çıkan yeni konular buraya eklenecek.

## 14. Uygulama Durumu

| Faz | Durum | Notlar |
|---|---|---|
| Faz 0 — Stil prototipi | ✅ | [FAZ-0.md](FAZ-0.md) |
| Faz 1 — Çekirdek (grid, zemin, kamera, otomatik kayıt; geri al/yinele öne alındı) | ✅ | [FAZ-1.md](FAZ-1.md) |
| Faz 2 — Duvarlar (duvar/kapı aracı, seçim, yükseklik) | ✅ | [FAZ-2.md](FAZ-2.md) |
| Faz 3 — Görünüm (alın panosu, renk, grafik) | ✅ | [FAZ-3.md](FAZ-3.md) |
| Faz 4 — Aksesuar ve elemanlar (yerleştirme, taşıma, döndürme) | ✅ | [FAZ-4.md](FAZ-4.md) |
| Faz 5 — Çıktı (export kalitesi, kaydet/aç) + kabul testi | ✅ | [FAZ-5.md](FAZ-5.md) |
| Faz 6 — İki adımlı giydirme (çerçeve + görsel kütüphanesi, K19–K22) | ✅ | [FAZ-6.md](FAZ-6.md) |

§10'daki 10 kabul kriterinin tamamı tarayıcıda karşılandı. Açık kalan doğrulamalar (ör. gerçek tarayıcı sekmesinde 4K export süresi) faz notlarındadır.

