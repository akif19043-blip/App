# Sinyal — meme coin trade uygulaması: Plan

> Çalışma adı **Sinyal**; istediğin zaman değişir. Referans: fomo / pump.fun
> tarzı, sosyal katmanlı meme coin alım‑satım uygulaması (ekran görüntüleri
> 7 Ekim 2026). Bu belge kod yazılmadan önce **her şeyin nasıl yapılacağını**
> anlatır. Onaylayınca Faz 0'dan başlıyorum.

---

## 1. Tek paragrafta ne yapıyoruz

Solana üzerindeki meme coin'leri **gerçek fiyatlarla** listeleyen, arama /
izleme listesi / trend / en çok tutulan filtreleri olan, kullanıcının alım
satım yaptığı, her işlemin otomatik olarak bir **sosyal akışa** düştüğü,
**lider tablosu**, **klanlar**, **takip etme**, **profil + PnL grafiği** ve
paylaşılabilir **kart görselleri** (Portföy / Top Holdings / Top Trade /
Top Fumble) üreten, Türkçe + İngilizce bir Android (ve PWA) uygulaması.

İki trade modu, iki fazda:

| Mod | Ne zaman | Ne |
|---|---|---|
| **Kâğıt (paper) trade** | MVP, Faz 1‑4 | Gerçek fiyat, sanal bakiye. Cüzdan yok, lisans yok, para riski yok. Sosyal katmanın tamamı bunun üstünde çalışır. |
| **Gerçek trade** | Faz 6, ayrı karar | Gömülü cüzdan (Privy) + Jupiter swap. Kullanıcının anahtarı kullanıcıda; biz saklamıyoruz. Hukuki not §12. |

Önce paper'ı bitirmemizin sebebi: sosyal/lider tablosu/kart/profil
özelliklerinin **%90'ı trade'in gerçek ya da sanal olmasından bağımsız**.
Gerçek para en riskli ve en çok dış bağımlılığı olan parça; en sona
bırakıp izole ediyoruz.

---

## 2. Referans uygulamanın ekran ekran analizi

Gönderdiğin 9 ekran görüntüsünden çıkardığım özellik envanteri. Her satır
bir iş kalemi.

### 2.1 Ana sayfa (Home)
- Üstte portföy değeri (`$0.43`), 24s değişim (`-$0.25 24h`), **Deposit** düğmesi.
- **Weekly Top Trades**: yatay kaydırılan kartlar — trader avatarı/adı, token
  logosu, kazanç (`+$341,137.41`).
- Sekmeler: **Watchlist / Tokens / Perps (New)**.
- Filtre çipleri: filtre ikonu, **Crypto / Trending / Most held / Gr…**
  (muhtemelen *Graduated* — pump.fun'dan "mezun olan" tokenlar).
- Bilgi şeridi: "Lowest fees on blue chip tokens".
- Token listesi: logo + doğrulama rozeti, sembol, market cap, fiyat, 24s %.
  ETH satırında "2+" ile **bu tokeni tutan takip ettiğin kişiler** avatarları.
- Alt sekme çubuğu: Home, Ara, Akış, Sosyal, Profil.

### 2.2 Arama
- Kategori çipleri: **All / Tokens / Perps / Traders / Clans**.
- **Recents** (son bakılanlar): trader kartları (avatar, isim, takipçi sayısı,
  PnL, **Follow / Following** düğmesi) ve token satırları (× ile sil).
- Her token satırında zincir rozeti (ETH simgesi, Solana "≡" simgesi).
- Altta sabit arama kutusu + **Paste** (adres yapıştırma: contract address ile
  arama).

### 2.3 Akış (Feed)
- Sekmeler: **Global / Friends**, filtre.
- **Pinned** sistem gönderisi: "Recap: October 6th, 2026" — günün özeti
  (`$BTC` linkli), beğeni sayısı.
- Gönderi türleri (etiket rengiyle): **Thesis** (kullanıcı yazısı + token
  kartı: logo, sembol, fiyat/MC, %), **Sell** (otomatik: `AUTON $6.6K at
  $3.23M MC`), **Buy**.
- Kalp/beğeni, zaman damgası (`5s`, `30s`, `1m`).

### 2.4 Sosyal / Lider tablosu
- Sekmeler **Friends / Leaderboard**.
- **Clans (New)**: yatay kartlar — logo, ad, üye avatarları + sayısı, toplam
  kazanç; **View all**.
- Filtre: **All ▾** (muhtemelen token/zincir filtresi) ve dönem **24h / 7d /
  30d / All**.
- **Your rank** kartı: sıra `#136,096`, dönem PnL, paylaş ikonu.
- Sıralı liste: madalya (1‑2‑3 çelenk), avatar, isim + @kullanıcı, PnL, en
  çok işlem yaptığı tokenların logoları (`114+`).

### 2.5 Profil
- Üst araç çubuğu: paylaş, geçmiş (saat ikonu), ayarlar.
- Avatar (kalemle düzenleme), **Rewards** düğmesi, isim, @kullanıcı,
  **Add a bio**.
- **21 Following / 0 Followers**.
- İstatistik şeridi: **34m avg. hold / 49 trades / Joined Tem 2026**
  (ay adı cihaz diline göre: "Tem" = Temmuz → i18n var).
- Portföy değeri + değişim; dönem seçici **24h / 7d / 30d / All**; PnL alan
  grafiği (kırmızı/yeşil).
- **Total cash $0** satırı, **+** (para yatır) ve **…** menü.
- **Positions (3)** — **Open / Closed** anahtarı, alt filtre **All / Tokens /
  Perps**.

### 2.6 Paylaşım kartları (Share sheet)
Dört kart tipi, üstte sekme olarak:
- **Portfolio**: avatar, isim, `#rank 24h`, değer, değişim, alan grafiği,
  eksende tarih etiketleri (`Oct 6, 11 PM`), marka şeridi (`fomo` + "10% off
  fees with code Akfy").
- **Top Holdings**: en büyük pozisyonlar ("No holdings yet" boş durumu).
- **Top Trade**: tarih, **Profit** rozeti, fiyat çizgisi üstünde alış (+) /
  satış (−) işaretçileri, token, `+$15.87 (▲48.28%)`, **Invested / Avg. entry
  / Avg. exit** (MC cinsinden), **Replay trade** düğmesi.
- **Top Fumble**: turuncu tema, **Fumble** rozeti, "erken sattın" kartı:
  `Sold at $7.79M MC / Current MC $57.3M MC`, kaçırılan kazanç `$14.37
  (▲635.24%)`.
- Alt kontroller: dönem (24h/7d/30d), birim (**$ / %**), gizlilik anahtarları
  (**PnL ($) / Buy‑Sell / Ref code** göz ikonlu), **Share / Copy link / Copy
  image**.

### 2.7 Görsel dil
Siyah‑lacivert zemin (`#0b0b14` civarı), mor‑mavi vurgu (`#5b6cff`), yeşil
kazanç `#1fd36a`, turuncu‑kırmızı kayıp `#ff5a3c`, pembe profil rengi, büyük
yuvarlatılmış kartlar, kalın sans‑serif rakamlar, tabular rakam hizası.
Tema: koyu varsayılan, açık tema sonradan.

---

## 3. Kapsam kararları

### MVP'ye giren (Faz 1‑4)
- Token listesi: Crypto (blue chip) / Trending / Most held / Graduated,
  Watchlist, arama (isim, sembol, contract adresi yapıştırma).
- Token detay: fiyat grafiği (1s/1g/1h/1a), MC, hacim, likidite, holder
  sayısı, Buy/Sell paneli.
- **Paper trade** motoru: sanal USD bakiyesi, anlık fiyattan dolum, slippage
  ve ücret simülasyonu, pozisyonlar, ortalama giriş/çıkış, gerçekleşen ve
  gerçekleşmemiş PnL, ortalama tutma süresi.
- Hesap: e‑posta/Google ile giriş, kullanıcı adı, avatar, bio.
- Akış: Buy/Sell otomatik gönderileri, Thesis yazısı, beğeni, Global/Friends.
- Takip et / takipçi; "takip ettiklerinden bu tokeni tutanlar" rozeti.
- Lider tablosu 24h/7d/30d/All, kullanıcının sırası.
- Klan: kur, katıl, klan toplam PnL, klan lider tablosu.
- Profil: istatistikler, PnL grafiği, açık/kapalı pozisyonlar.
- Paylaşım kartları (4 tip), PNG üretimi, sistem paylaşım menüsü, link.
- Günlük **Recap** sabit gönderisi (başta elle/şablon; sonra LLM ile
  otomatik özet — ayrı karar).
- TR/EN, koyu tema, Android (Capacitor) + PWA.

### MVP dışı, sonraya
- **Perps** (kaldıraçlı vadeli) — ayrı ürün, ayrı risk; sekme yerinde durur,
  "Yakında" rozeti.
- Gerçek trade / para yatırma / çekme (Faz 6).
- Rewards / referans kodu indirimi (gerçek ücret olmadan anlamı yok; kart
  üzerinde kod yazısı MVP'de dekoratif).
- Replay trade animasyonu (Faz 5 cila).
- iOS (Capacitor ile aynı kod; Mac + Apple hesabı gerekir).
- Bildirimler (fiyat alarmı, takip edilen aldı/sattı) — Faz 5.

### Varsayımlar (itiraz edersen değişir)
- **Zincir: Solana.** Meme coin hacminin ve pump.fun'ın olduğu yer; tek
  zincirle başlamak veri katmanını yarıya indirir. ETH/BSC adaptörleri
  arayüzü hazır, sonra eklenir.
- **Para birimi gösterimi USD**, i18n ile TL görünümü opsiyon.
- Sanal başlangıç bakiyesi **$1.000**, haftalık sıfırlama yok (lider tablosu
  dönem PnL'e göre, bakiyeye göre değil — büyük bakiye avantajı olmasın).

---

## 4. Mimari

```
┌───────────────────────────── Telefon ──────────────────────────────┐
│  Capacitor (Android WebView)  /  tarayıcıda PWA                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  React + TypeScript (Vite)                                   │  │
│  │  ekranlar ── bileşenler ── durum (Zustand) ── sorgu (TanStack)│  │
│  │  market-data adaptörü   trade motoru   kart render (canvas)  │  │
│  └───────┬───────────────────────────┬───────────────────────────┘  │
└──────────┼───────────────────────────┼──────────────────────────────┘
           │ HTTPS/WS                  │ HTTPS/WS
   ┌───────▼────────┐          ┌───────▼───────────────────────────┐
   │  Market verisi │          │  Backend: Supabase                 │
   │  DexScreener   │          │  Postgres + RLS, Auth, Realtime,   │
   │  Jupiter Price │          │  Storage (avatar, kart PNG),       │
   │  pump.fun API  │          │  Edge Functions (fiyat önbelleği,  │
   │  Helius RPC    │          │  trade dolumu, lider tablosu,      │
   └────────────────┘          │  günlük recap, cron)               │
                               └───────────────────────────────────┘
```

**Neden fiyatlar istemciden değil Edge Function'dan geçiyor?** Üç sebep:
(1) paper trade dolum fiyatını **sunucu** belirlemeli, yoksa istemci istediği
fiyattan "alır" ve lider tablosu anlamsızlaşır; (2) dış API'lerin oran
limitleri uygulamanın tüm kullanıcıları için tek bir önbellekten paylaşılır;
(3) API anahtarları telefona inmez.

Akış: istemci token listesini ister → Edge Function önbellekten (Postgres
`token_snapshot`, 5‑15 sn tazelik) döner; eskiyse DexScreener'dan çeker,
yazar, döner. Fiyat **"tick"leri** için Supabase Realtime kanalı: sunucu
tarafı bir cron (her 5 sn) izlenen tokenlerin fiyatını günceller, abone
istemciler anında alır.

---

## 5. Teknoloji seçimleri ve gerekçeleri

| Katman | Seçim | Neden | Alternatif |
|---|---|---|---|
| UI | **React 19 + TypeScript + Vite** | Liste/grafik/akış ağırlıklı, durum yoğun bir uygulama; Dörtyol'daki vanilla yaklaşım burada çok maliyetli olur. Vite derlemesi Capacitor `webDir`'e doğrudan gider. | Vue, Svelte |
| Stil | **Tailwind CSS v4** + CSS değişkenleri (tema tokenları) | Hızlı, tutarlı; tema değişimi tek dosya. | Vanilla CSS modülleri |
| Yönlendirme | TanStack Router | Tip güvenli parametreler (token adresi, kullanıcı adı). | React Router |
| Sunucu durumu | **TanStack Query** | Önbellek, yeniden deneme, arka planda tazeleme — fiyat listeleri için biçilmiş kaftan. | SWR |
| İstemci durumu | Zustand | Küçük; sepet/filtre/tema. | Redux |
| Grafik | **Lightweight Charts** (TradingView, Apache‑2) token mumları için; **kendi SVG/Canvas** mini çizgi ve PnL alan grafikleri için | Lightweight Charts finans grafiğinde endüstri standardı ve 45 KB. Kart PNG'lerinde canvas kontrolü bize lazım. | Recharts, uPlot |
| Kart → PNG | `html-to-image` (DOM → canvas) veya saf Canvas 2D | Kart tasarımı DOM'da yapılır, aynı DOM PNG'ye alınır; tek kaynak. | Sunucu tarafı render (Satori) |
| Paylaşım | Capacitor **Share** + **Filesystem**, web'de Web Share API / clipboard | Sistem paylaşım menüsü, "Copy image". | — |
| Backend | **Supabase** (Postgres, Auth, Realtime, Storage, Edge Functions, cron) | Tek serviste her şey; RLS ile satır bazlı güvenlik; ücretsiz katman MVP'ye yeter; sonradan kendi Postgres'ine taşınabilir. | Firebase; kendi Node/Fastify + Postgres |
| Kimlik | Supabase Auth: e‑posta OTP + Google | Şifresiz; Android'de Google tek dokunuş. | Privy (Faz 6'da cüzdan için zaten gelecek) |
| Market verisi | **DexScreener API** (anahtar yok, 300 istek/dk), **Jupiter Price/Token API**, **pump.fun** public uçları (graduated/trending), **Helius** RPC (holder sayısı, Faz 6'da bakiye) | Ücretsiz katmanlarla MVP tamamen çıkar. | Birdeye (ücretli), Bitquery |
| Gerçek trade (Faz 6) | **Privy** gömülü cüzdan + **Jupiter Swap API** | Kullanıcı seed görmez ama anahtar onun; biz custody yapmıyoruz. | Phantom deep‑link (kullanıcıyı uygulamadan çıkarır) |
| Mobil kabuk | **Capacitor 6** (Android) | Depoda hazır boru hattı ve `docs/RELEASE.md` var. | Expo/React Native (sıfırdan) |
| Test | **Vitest** (motor, formatlayıcılar), **Playwright** (ekranlar, depodaki altyapıyla aynı), Supabase lokal (`supabase start`) ile DB testleri | Trade motoru matematiği birim testle kilitlenmeli. | — |
| i18n | `i18next` + `react-i18next`, TR/EN JSON | Depodaki `i18n.js` yaklaşımının React karşılığı. | — |

---

## 6. Veri modeli (Postgres)

```
profiles          id (auth.uid), username*, display_name, avatar_url, bio,
                  created_at, ref_code*, settings jsonb
follows           follower_id, followee_id, created_at        (PK ikisi)
clans             id, name*, slug*, logo_url, owner_id, created_at
clan_members      clan_id, user_id, role, joined_at
tokens            address* (mint), chain, symbol, name, logo_url, verified,
                  decimals, pump_fun bool, graduated_at, created_at
token_snapshot    token_address, ts, price_usd, mc_usd, vol24_usd,
                  liq_usd, change_1h, change_24h, holders
                  (zaman serisi; 1 dk → 1 saat → 1 gün rollup)
watchlist         user_id, token_address, created_at
accounts          user_id, mode ('paper'|'live'), cash_usd, created_at
positions         id, account_id, token_address, qty, avg_entry_price,
                  avg_entry_mc, cost_usd, opened_at, closed_at,
                  realized_pnl_usd, status
trades            id, account_id, position_id, side ('buy'|'sell'),
                  qty, price_usd, mc_usd, usd_amount, fee_usd, slippage_bps,
                  ts, post_id
posts             id, author_id, kind ('buy'|'sell'|'thesis'|'recap'),
                  token_address, body, trade_id, pinned, created_at
post_likes        post_id, user_id
pnl_daily         user_id, day, pnl_usd, equity_usd     (lider tablosu kaynağı)
leaderboard_cache period, rank, user_id, pnl_usd, top_tokens jsonb, computed_at
recents           user_id, kind, ref_id, ts                 (arama geçmişi)
share_cards       id, user_id, kind, period, png_url, payload jsonb, created_at
```

Kurallar:
- `*` benzersiz. Her tabloda RLS: kullanıcı kendi `accounts/positions/trades/
  watchlist/recents` satırlarını okur‑yazar; `profiles/posts/trades(public
  görünüm)` herkese okunur, sadece sahibine yazılır.
- `trades` **yalnızca Edge Function** yazar (service role). İstemci doğrudan
  INSERT yapamaz → dolum fiyatı güvenilir.
- **Top Trade** = `positions.status='closed'` içinde en yüksek
  `realized_pnl_usd`; **Top Fumble** = kapanmış pozisyonlardan
  `(mevcut_mc / avg_exit_mc − 1) × çıkış_tutarı` en yüksek olan.
- **Avg. hold** = kapanmış pozisyonlarda `closed_at − opened_at` ortalaması.

---

## 7. Ekranlar ve bileşen envanteri

```
/                     Home          PortfolioHeader, WeeklyTopTrades, TabBar
                                    (Watchlist|Tokens|Perps), FilterChips,
                                    InfoBanner, TokenRow[]
/search               Search        CategoryChips, RecentTraderCard[],
                                    RecentTokenRow[], SearchBar(+Paste)
/feed                 Feed          Tabs(Global|Friends), PinnedRecap,
                                    PostCard{Thesis|Buy|Sell}, LikeButton
/social               Social        Tabs(Friends|Leaderboard), ClanCarousel,
                                    PeriodChips, YourRankCard, LeaderRow[]
/social/clans         Clans         ClanList, CreateClan, ClanDetail
/me, /u/:username     Profile       ProfileHeader, StatsStrip, PnlChart +
                                    PeriodChips, CashRow, Positions(Open|Closed)
/t/:address           TokenDetail   PriceChart(mum/çizgi), StatGrid,
                                    HoldersFromFollowing, TradePanel(Buy|Sell),
                                    TokenFeed
/trade/:address       TradeSheet    Miktar girişi ($ ya da %), hızlı tuşlar
                                    (25/50/75/100%), ücret/slippage önizleme,
                                    onay, sonuç
/share                ShareSheet    CardTabs(Portfolio|Holdings|TopTrade|
                                    TopFumble), CardCanvas, PeriodChips,
                                    UnitToggle($|%), PrivacyToggles,
                                    Actions(Share|CopyLink|CopyImage)
/settings             Settings      dil, tema, bildirim, hesap, çıkış
/auth                 Auth          e-posta OTP, Google
/onboarding           Onboarding    kullanıcı adı, avatar, sanal bakiye açıklaması
```

Ortak: `Money` (tabular rakam, `$0.43` → küçük kuruş rengi), `Pct` (▲▼ renk),
`TokenLogo` (rozetli), `Avatar`, `AvatarStack` ("2+"), `Chip`, `Sheet`
(alttan açılan), `Skeleton`, `EmptyState`.

---

## 8. Market verisi katmanı

Tek arayüz, çok adaptör — **bu ortamdan dış API'lere erişim yok** (§16), bu
yüzden ilk adaptör **mock** olmak zorunda ve her zaman kalacak (testler onu
kullanır).

```ts
interface MarketSource {
  listTokens(filter: 'crypto'|'trending'|'mostHeld'|'graduated'): Promise<TokenSummary[]>
  getToken(address: string): Promise<TokenDetail>
  getCandles(address: string, tf: '1m'|'5m'|'1h'|'1d', limit: number): Promise<Candle[]>
  getPrices(addresses: string[]): Promise<Record<string, PriceTick>>
  search(q: string): Promise<TokenSummary[]>
}
```

| Adaptör | Kaynak | Kullanım |
|---|---|---|
| `MockSource` | `fixtures/*.json` + rastgele yürüyüş üreteci | Geliştirme, testler, demo modu |
| `DexScreenerSource` | `/latest/dex/tokens/{addr}`, `/token-profiles`, `/token-boosts` (trend) | Liste, detay, arama |
| `JupiterSource` | Price API v2, Token API (verified listesi, logo) | Fiyat tick'leri, "verified" rozeti |
| `PumpFunSource` | public `coins` uçları | Graduated / yeni çıkanlar |
| `HeliusSource` | RPC `getTokenLargestAccounts`, DAS | Holder sayısı; Faz 6'da bakiye |

Sunucu tarafında (Edge Function) bu adaptörler çalışır, `token_snapshot`'a
yazar; istemci yalnızca Supabase'e konuşur. "Most held" bizim verimizden
çıkar: `positions` tablosunda en çok açık pozisyonu olan tokenlar.

Fiyat tazeliği: liste 10 sn, detay sayfası 3 sn, portföy toplamı 5 sn.
İstemci görünür tokenlerin Realtime kanalına abone olur, sayfadan çıkınca
ayrılır.

---

## 9. Paper trade motoru

Saf TypeScript modülü, hem Edge Function'da hem istemci önizlemesinde aynı
kod (`packages/engine`). Birim testle kilitlenir.

- **Dolum fiyatı**: sunucunun o andaki `price_usd` + likiditeye göre
  slippage simülasyonu: `bps = clamp(usd_amount / liq_usd × 10_000, 10, 500)`.
  Ücret: sabit **%1** (fomo'nun "lowest fees" iddiasının karşılığı; sanal).
- **Buy**: `qty = (usd − fee) / fill_price`; pozisyon varsa ağırlıklı ortalama
  giriş güncellenir; `cash −= usd`.
- **Sell**: `qty` oranı (25/50/75/100 %), `usd = qty × fill_price − fee`,
  gerçekleşen PnL `= usd − qty × avg_entry`; qty sıfırlanırsa pozisyon
  `closed`, `avg_exit_mc` kaydedilir.
- **Unrealized PnL** = `qty × (price − avg_entry)`; portföy değeri
  `= cash + Σ qty × price`.
- Her trade bir **post** üretir (`kind=buy|sell`, metin: `AUTON $6.6K at
  $3.23M MC`).
- Günlük `pnl_daily` cron: gün sonu `equity` ve `pnl` yazar; lider tablosu
  buradan 24h/7d/30d/All hesaplanır, `leaderboard_cache`'e dakikada bir.
- Koruma: minimum işlem $1, maksimum tek seferde bakiyenin %100'ü, aynı
  tokende saniyede 1 işlem (spam/hile).

---

## 10. Sosyal katman

- **Takip**: `follows` + `profiles` sayaçları (trigger). Friends akışı =
  takip ettiklerinin postları. "ETH 2+" rozeti = takip ettiklerinde o tokende
  açık pozisyonu olanlar (view).
- **Thesis**: 280 karakter + bir token referansı; token kartı anlık fiyatla
  render edilir.
- **Beğeni**: `post_likes`, sayaç trigger.
- **Recap** (pinned): günlük cron, `recap` türünde sistem postu. İlk sürümde
  şablon ("Bugün en çok kazanan: …, en çok işlem gören: …"); sonra istenirse
  LLM ile metin.
- **Klan**: kur (isim, logo), davet linki, max 50 üye; klan PnL = üyelerin
  dönem PnL toplamı; klan lider tablosu.
- **Lider tablosu**: dönem PnL'e göre; `top_tokens` = o dönem en çok işlem
  yapılan 3 token logosu + "114+" sayacı. Kullanıcının sırası ayrı sorgu
  (`rank() over`).
- **Weekly Top Trades** (Home): son 7 günde kapanmış en kârlı 10 pozisyon
  (herkese açık).

---

## 11. Paylaşım kartları

- Kart bir React bileşeni; `/share` içinde 3:4 oranında, sabit 1080×1350 px
  mantıksal boyutta çizilir, ekrana ölçeklenir.
- **Copy image / Share**: `html-to-image` ile PNG, Android'de `Filesystem`
  cache'e yaz → `Share.share({files})`; web'de `navigator.share` ya da
  clipboard.
- **Copy link**: kartın `payload` + PNG'si `share_cards` + Storage'a yazılır,
  `https://<domain>/c/<id>` sayfası Open Graph etiketleriyle (Edge Function)
  o PNG'yi gösterir → sosyal medyada önizleme.
- Gizlilik anahtarları (`PnL ($) / Buy‑Sell / Ref code`) sadece render'ı
  etkiler.
- Portföy grafiği eksen etiketleri cihaz saat dilimine göre (`Oct 6, 11 PM`).

---

## 12. Güvenlik ve uyum

- **Hiçbir özel anahtar / API anahtarı istemcide yok.** Supabase anon key
  RLS ile sınırlı; dış API'ler Edge Function'dan.
- **Trade yazımı yalnızca sunucuda**; istemci sadece niyet gönderir.
- Oran limiti: kullanıcı başına dakikada 30 trade isteği, 10 post.
- Kullanıcı adı: 3‑20 karakter, küçük harf, benzersiz; küfür listesi.
- Avatar yükleme: 2 MB, yalnızca image/*; sunucuda yeniden boyutlandırma.
- **Hukuki not (ben avukat değilim, bunu bir uzmana sordur):** Türkiye'de
  kripto varlık hizmet sağlayıcıları 2024'ten beri **SPK iznine** tabi.
  Paper trade ve sosyal uygulama bu kapsamda değil. Faz 6'daki non‑custodial
  (anahtar kullanıcıda) swap arayüzü gri alan; custody ya da fiat
  yatırma/çekme kesinlikle lisans ister. Faz 6 kararını buna göre vereceğiz.
  Ayrıca Google Play'in kripto politikaları: borsa/cüzdan uygulamaları
  lisans beyanı ister; paper trade uygulaması "finans simülasyonu" olarak
  geçer.
- Uygulama içinde yatırım tavsiyesi değildir uyarısı, 18+ beyanı.

---

## 13. Repo düzeni

Dörtyol'a dokunmadan, aynı depoda ayrı bir klasör. (Ayrı repo istersen aynı
yapı taşınır.)

```
sinyal/
  package.json                pnpm/npm workspace
  apps/
    mobile/                   Vite + React + Capacitor
      src/
        app/                  router, providers, tema
        screens/              §7'deki ekranlar
        components/           ortak bileşenler
        features/             market/, trade/, feed/, social/, share/, profile/
        lib/                  format (para, %, zaman), i18n, supabase istemcisi
        fixtures/             mock veri
      android/                Capacitor Android (Dörtyol'dakinden türetilir)
      capacitor.config.ts
      tests/                  Playwright ekran testleri
  packages/
    engine/                   paper trade motoru (saf TS, Vitest)
    market/                   MarketSource arayüzü + adaptörler
    shared/                   tipler, sabitler, zod şemaları
  supabase/
    migrations/               SQL, RLS politikaları, trigger'lar
    functions/                prices/, trade/, leaderboard/, recap/, og-card/
    seed.sql                  demo kullanıcılar + tokenlar
  docs/
    PLAN.md (bu belge taşınır), ARCHITECTURE.md, RELEASE.md
```

---

## 14. Yol haritası

Her faz **çalışan ve test edilen** bir şey teslim eder; önceki fazı bozmaz.
Süre tahminleri benim oturum sayım değil, sıralama ve bağımlılık içindir.

### Faz 0 — İskelet
- Workspace, Vite+React+TS, Tailwind, Router, Query, Zustand, i18n (TR/EN),
  tema tokenları, alt sekme çubuğu, 5 boş ekran, Capacitor Android projesi,
  ESLint/Prettier, Vitest, Playwright, `npm test`.
- **Kabul**: `npm run dev` ile telefonda açılır; 5 sekme gezilir; dil değişir;
  Playwright "layout" testi 6 ekran boyutunda geçer.

### Faz 1 — Market verisi + Home + Arama + Token detay (mock)
- `packages/market`: arayüz, `MockSource` (gerçekçi 60 tokenlik fixture +
  rastgele yürüyüş), `DexScreener/Jupiter/PumpFun` adaptörleri (kodu yazılır,
  **senin telefonunda** doğrulanır — buradan erişilemiyor).
- Home: portföy başlığı (statik), Weekly Top Trades (mock), sekmeler, filtre
  çipleri, token satırları, iskelet yükleme.
- Arama: kategoriler, recents, adres yapıştırma.
- Token detay: Lightweight Charts mum grafiği, istatistik ızgarası.
- **Kabul**: 60 token listelenir, filtreler çalışır, arama 100 ms altında,
  grafik 1m/1h/1d; birim testler `format*` ve adaptör şemaları.

### Faz 2 — Backend + kimlik + paper trade
- Supabase projesi (senin hesabın ya da benim kurduğum → sana devir),
  migrations, RLS, seed.
- Auth (e‑posta OTP, Google), onboarding (kullanıcı adı, avatar).
- `packages/engine` + `functions/trade`: Buy/Sell sheet, pozisyonlar,
  cash, PnL; `functions/prices` önbelleği ve Realtime tick.
- Profil: istatistik şeridi, PnL grafiği (günlük rollup), Open/Closed.
- **Kabul**: motor birim testleri (ortalama giriş, kısmi satış, ücret,
  slippage, PnL) %100 geçer; iki cihazda aynı kullanıcı aynı portföyü görür;
  istemciden doğrudan `trades` INSERT **reddedilir** (RLS testi).

### Faz 3 — Sosyal
- Akış (Global/Friends), Buy/Sell otomatik postlar, Thesis, beğeni,
  pinned Recap (şablon).
- Takip/takipçi, "2+" rozeti, Weekly Top Trades gerçek veriden.
- Lider tablosu (cron + cache), Your rank, Klanlar.
- **Kabul**: trade → 1 sn içinde akışta görünür (Realtime); lider tablosu
  dönem değişince 300 ms altında; klan PnL toplamı üyelerle tutarlı (test).

### Faz 4 — Paylaşım kartları + Watchlist + Ayarlar
- 4 kart, PNG, Share/Copy link/Copy image, OG sayfası.
- Watchlist, recents, ayarlar (dil, tema, hesap silme — Play zorunluluğu).
- **Kabul**: PNG 1080×1350, 300 KB altı; Android'de paylaşım menüsü açılır;
  link önizlemesi WhatsApp/X'te görünür.

### Faz 5 — Cila + Play'e hazırlık
- Replay trade animasyonu, bildirimler (takip edilen trade yaptı, fiyat
  alarmı — Capacitor Push + Supabase cron), boş durumlar, hata durumları,
  erişilebilirlik, performans (liste sanallaştırma), açık tema.
- `store/` benzeri mağaza paketi: ikon, görseller, TR/EN metin, gizlilik
  politikası, Veri Güvenliği (bu kez ağ var, cevaplar değişir), `RELEASE.md`.
- **Kabul**: Lighthouse PWA ≥ 90; 2 GB RAM'li telefonda liste 60 fps;
  Play ön kontrol listesi tamam.

### Faz 6 — Gerçek trade (ayrı onayla)
- Privy gömülü cüzdan, SOL/USDC yatırma (adres gösterme), Jupiter quote +
  swap imzalama, gerçek pozisyon takibi (Helius), mode anahtarı
  `paper | live`, hukuki metinler.
- **Kabul**: devnet'te uçtan uca swap; mainnet'te $1'lık test; ücret/slippage
  gerçek quote ile birebir.

---

## 15. Test stratejisi

| Seviye | Araç | Ne |
|---|---|---|
| Birim | Vitest | motor matematiği, para/yüzde/zaman formatlayıcıları, adaptör şema doğrulama (zod), lider tablosu sıralaması |
| Bileşen | Vitest + Testing Library | `Money`, `Pct`, `TokenRow`, `PostCard` render durumları |
| DB | Supabase lokal + pgTAP | RLS: başkasının pozisyonunu okuyamama, trades'e istemci yazamama; trigger sayaçları |
| Uçtan uca | Playwright (depodaki `tests/run.mjs` deseni) | giriş → al → akışta gör → sat → profil PnL → kart PNG; 6 ekran boyutu layout |
| Sözleşme | kaydedilmiş gerçek API cevapları (`fixtures/live/*.json`) | adaptörlerin gerçek şemayla uyumu — kayıtları sen telefonundan/bilgisayarından bir komutla alırsın (`npm run market:record`) |

CI: GitHub Actions, her push'ta birim + bileşen + DB; uçtan uca gecelik.

---

## 16. Bu ortamın kısıtları (dürüst not)

Bu oturumun çalıştığı sandbox'ta doğruladım:

| Erişim | Durum |
|---|---|
| npm registry | ✅ paket kurulur |
| DexScreener, Jupiter, pump.fun, CoinGecko, Helius | ❌ erişilemiyor |
| Supabase API | ❌ erişilemiyor |
| Android SDK (`dl.google.com`) | ❌ (Dörtyol'da da aynıydı) |
| Chromium (Playwright) | ✅ var |

Sonuçları:
1. Market adaptörlerini ve Supabase fonksiyonlarını **yazarım ama canlıya
   karşı burada çalıştıramam**. Mock + fixture ile geliştirir, Supabase'i
   lokal CLI ile (Docker gerekir; o da yoksa SQL'i pgTAP yerine düz Postgres
   ile) test ederim. Canlı doğrulama adımlarını her fazın sonunda sana
   "telefonunda şunu çalıştır" listesi olarak veririm.
2. APK/AAB derlenmez; Dörtyol'daki gibi hazır Capacitor projesi + `RELEASE.md`
   teslim edilir, derlemeyi sen (Android Studio) ya da GitHub Actions yapar.
   **Öneri:** Faz 0'da bir GitHub Actions iş akışı ekleyeyim; her push'ta
   debug APK üretip artifact olarak bıraksın. Böylece ben derleyemesem de
   sen her fazda APK indirip dener.
3. Supabase projesini sen açarsan (ücretsiz) URL + anon key'i repo
   secret'ına koyarız; Edge Function'ları `supabase db push` ile sen ya da
   Actions dağıtır.

---

## 17. Senden gereken kararlar

Varsayılanları işaretledim; "tamam" dersen onlarla başlarım.

1. **Mod**: önce paper trade, gerçek trade Faz 6'da ayrı karar — *varsayılan:
   evet*.
2. **Zincir**: yalnızca Solana ile başla — *varsayılan: evet*.
3. **Backend**: Supabase; projeyi sen mi açarsın, ben mi açıp devredeyim —
   *varsayılan: sen açarsın, ben SQL/fonksiyon yazarım*.
4. **Perps**: sekme dursun "Yakında" olsun — *varsayılan: evet*.
5. **İsim**: "Sinyal" çalışma adı kalsın mı?
6. **Repo**: aynı depoda `sinyal/` klasörü mü, yeni repo mu — *varsayılan:
   aynı depo*.
7. **GitHub Actions ile APK derleme** eklensin mi — *varsayılan: evet*.
8. **Recap** metni şablon mu, LLM mi (API anahtarı ve maliyet) — *varsayılan:
   şablon*.

Onay gelince **Faz 0**'dan başlıyorum; ilk teslim telefonunda açılan,
5 sekmeli, TR/EN, koyu temalı iskelet ve çalışan test altyapısı.
