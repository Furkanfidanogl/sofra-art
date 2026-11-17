# Kurulum ve operasyon · Setup and operations

## Geliştirme

README’deki kurulum, üretim hesabı gerektirmeyen cihaz içi demo ile başlar. Node sürümü `.nvmrc` içinde sabittir. Emülatör testleri Java 21 ve yalnızca `demo-sofra` hedefini kullanır. Portlar doluysa başka süreçleri kapatmak yerine `SOFRA_EMULATOR_CONFIG` ile ayrı loopback portları seç.

## Üretim yapılandırması

Bu kaynak mevcut Sofra dağıtımına bağlıdır. Başka bir Firebase projesinde kullanmak için app ID, project/bucket/runtime hesabı, public görsel URL’si, yetkili yönetici ve CORS/CSP kaynakları birlikte gözden geçirilmelidir.

1. Firebase’de Google sağlayıcısını ve izin verilen web domainini yapılandır. Doğru web uygulaması için App Check/reCAPTCHA Enterprise kaydet.
2. `.env.example` temelinde yalnızca public web yapılandırmasını Netlify production ortamına ekle. `VITE_*` içine sunucu anahtarı koyma.
3. Model anahtarını `GEMINI_API_KEY` adıyla server Secret Manager’da tut. Model `gemini-3.5-flash-lite` olarak kalır.
4. Firestore/Storage deny-all kurallarını ve Firestore indekslerini dağıt. Runtime için gerekli veri/Auth okuma ve ilgili bucket yetkilerini sınırla; public bucket açma.
5. Functions’ı dağıt, App Check ve yetki negatif kontrollerini doğrula; sonra production backend bayrağını aç.
6. Yönetici yetkisini güvenilir operatör kimliğiyle `functions/scripts/set-admin.cjs --uid EXACT_FIREBASE_UID` üzerinden önce incele. Hedef kimliği doğruladıktan sonra `--apply` kullan. Tarayıcıdan rol verme.

Mevcut operatör yardımcıları `SOFRA_FIREBASE_PROJECT_ID`, `SOFRA_OPERATOR_EMAIL` ve `FIREBASE_CLI_PACKAGE_PATH` üzerinden mevcut, doğrulanmış Firebase CLI oturumunu kullanır. Kimlik bilgilerini Git’e veya rapora kopyalamaz. ADC kullanan yönetici aracı ayrı bir kimlik yolu kullanır. Yerel operatör ortamını repoya ekleme.

## Yayın

```sh
npm run check
npm run check:emulators
npm run build
node scripts/check-assets.cjs
node scripts/check-secrets.cjs --history
git diff --check
```

Netlify `dist/` dizinini yayımlar; `netlify.toml` başlıkları, cache ve gerçek 404 davranışını tanımlar. `functions/` Firebase’e aittir, Netlify Functions olarak dağıtılmaz. Firebase Hosting yapılandırması Netlify başlıklarının eşdeğeri değildir.

Backend operatör yardımcısı `scripts/deploy-backend.cjs` yalnız Functions ve indeksleri dağıtır; kurallar ayrı dağıtım adımıdır. Frontend değişiminde build sonrası Netlify production deploy yap; `scripts/check-live.cjs` ile canlı JS/CSS hash, başlık ve rotaları doğrula. `scripts/release-check.cjs` operatör oturumuyla indeksleri ve yetkisiz erişimin reddini kontrol eder.

GitHub Actions kalite kapısı üretim sırrı kullanmaz. GitHub’a push, Netlify’a otomatik yayın kurulduğu anlamına gelmez; mevcut hosting bağlantısını ayrıca doğrula. Ham raporlar `reports/` altında yereldir ve Git tarafından yok sayılır.

## Yorum moderasyonu

Kelime listesiyle otomatik ret veya güvenli kelimeyle otomatik onay yoktur. Takma ad, yorum ve soru `gemini-3.5-flash-lite` modeline birlikte gider. Açık küfür kullanımı (hedef göstermese veya takma adda olsa da), taciz, tehdit, dolandırıcılık ve ticari spam ihlaldir; masum yazım farkı, kısa tepki, saygılı eleştiri ve ihlali bildiren alıntı bağlamıyla ayrılır.

Normal onay/inceleme tek istek kullanır. İlk `false` için ikinci bir ret doğrulaması yapılır; yalnız iki `false` otomatik ret olur, anlaşmazlık `unclear` kalır. Aynı modelin iki değerlendirmesi bağımsız güvenlik kanıtı değildir. İki çağrı toplam 8 saniyelik süreyi ve saatte 120 sağlayıcı isteği bütçesini paylaşır. İkinci çağrının kotası da Firestore transaction ile ayrılır; kota/servis/şema hatası manuel kuyruğa gider. Yönetici kararı ve hesap silme, gecikmiş model yanıtından üstün kalır.

`node --env-file=.env.admin.local scripts/eval-gemini-live.cjs` sentetik Türkçe/karma dil, masum ifade–ihlal karşıtları ve saldırı örnekleriyle canlı model kalitesini ölçer; üretim yorumlarına yazmaz. Bu işlem sağlayıcı API kullanımına tabidir. Mock testleri model kalitesini değil akış ve hata davranışını doğrular. Politika değişiminde gerçek model ölçümünü yenile, yanlış ret/kaçak/inceleme oranını birlikte değerlendir; anahtar veya yorum içeriğini loglama. Sonuçlar `reports/` altında özel kalır.

## İzleme, yedek ve geri dönüş

- `scripts/monitoring.cjs --inspect` alarm durumunu okur. Test bildirimi yalnız ayrıca kararlaştırıldığında gönderilir.
- `scripts/production-safeguards.cjs --inspect` günlük yedek, silme koruması ve TTL durumunu okur. Günlük Firestore yedeği 7 gün saklanır.
- TTL yalnız `commentFingerprints`, `requestLimits`, `editorialDrafts`, `accountDeletions` içindeki `expiresAt` alanlarına uygulanır. Yorum/eser/görseller süreli silmeye dahil değildir.
- Hata incelemesinde işlem adı ve `requestId` kullan; yorum, token veya API anahtarı loglama. Son sağlıklı kaynak üzerinden düzeltme ve doğrulanmış yeni deploy hazırla.
- Gemini kesintisinde yorumları inceleme kuyruğunda bırak; editoryal alanları elle doldur. Otomatik onayla kesintiyi gizleme.
- Restore önce ayrı, uygulamaya bağlanmayan bir veritabanında denenir. `scripts/restore-check.cjs --inspect` ile başla; yazan aşamalar açık `SOFRA_RESTORE_CHECK=true` gerektirir. Araç yalnız benzersiz scratch hedefini siler.
- Firestore yedeği Auth/Storage yedeği değildir. Gerçek kurtarmada indeks/IAM/TTL ve yedek sonrası silme taleplerini ayrıca uygula; veri bütünlüğünü doğrula.

## Domain geçişi

README ve GitHub About URL’siyle birlikte Firebase yetkili domain, App Check, Functions CORS, CSP, canonical/OG/sitemap, HTTPS yönlendirmeleri ve uptime hedefini güncelle. Arama indeksleme engelini yalnız yayın kararıyla kaldır. Apple sağlayıcısı ayrı kurulum ve kabul gerektirir: Apple Developer Program üyeliğinde primary App ID ve web için Services ID oluştur; domain olarak `sofra-512816.firebaseapp.com`, return URL olarak `https://sofra-512816.firebaseapp.com/__/auth/handler` tanımla; `.p8` private key, Key ID, Team ID ve Services ID bilgilerini yalnızca Firebase Authentication `apple.com` sağlayıcı ayarına kaydet (asla Git’e veya `VITE_*` değişkenlerine koyma). Canlı OAuth akışı doğrulandıktan sonra Netlify production ortamında `VITE_APPLE_SIGNIN_ENABLED=true` ayarla.

## English operational summary

Start locally with the backend disabled; CI uses isolated emulators without production credentials. Production requires verified Firebase configuration, App Check, server-held model secrets, deployed deny-all rules/indexes, restricted runtime IAM and explicit administrator assignment. Deploy the frontend to Netlify and backend Functions separately, then verify the live assets and access boundaries. GitHub publication alone does not enable continuous deployment.

Keep reports, credentials and recovery state private. Inspect monitoring and backup settings before changing them; restore only to a separate scratch database and verify data integrity, TTL, IAM and deletion requests before any real recovery. Update all authentication, origin and metadata settings together when moving domains.
