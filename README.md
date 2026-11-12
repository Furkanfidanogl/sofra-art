<div align="center">

# Sofra Art

**Sanat. Müzik. Biraz da kendin.**

Günün eserini, bir soruyu ve bir şarkıyı buluşturan sakin bir dijital alan.

[**Sofra’ya uğra ↗**](https://sofra-art.netlify.app) · [**Pinterest ↗**](https://tr.pinterest.com/sofravibes/) · [English](#english)

[![Quality checks](https://github.com/Furkanfidanogl/sofra-art/actions/workflows/quality.yml/badge.svg?branch=main)](https://github.com/Furkanfidanogl/sofra-art/actions/workflows/quality.yml)

</div>

![Sofra Art ana sayfası: ay terası, günün sözü, şarkısı ve eseri](docs/screenshots/home.png)

## Türkçe

Sofra Art, biraz durmak isteyenler için tasarlandı. Görsel odalarda ruh hâline göre gezinebilir, günün sorusuna bir not bırakabilir, kısa okumalar keşfedebilir veya müzik eşliğinde kendine zaman ayırabilirsin.

Ziyaretçi deneyiminin arkasında, içeriklerin taslak olarak hazırlandığı ve editör kararıyla yayımlandığı bir yönetim masası bulunur. Arayüz Türkçedir.

- **Günün sofrası:** eser, söz, soru ve müzik; Türkiye saatine göre tarihli yayın planlama.
- **Görsel odalar:** ruh hâli filtreleri, keşif testi, rastgele eser ve cihazda saklanan ayraçlar.
- **Kesintisiz gezinme:** sayfada kalıcı müzik oynatıcısı ve açık tercihle yüklenen tek şarkılık Spotify bağlantıları.
- **Özenli sohbet:** Google ile giriş, takma ad ve yorumu birlikte değerlendiren moderasyon, tekrar ve hız kontrolleri.
- **Editoryal yönetim:** özel görsel yükleme, önizleme, eser yayını ve yöneticiye yardımcı AI taslakları. Öneriler kendiliğinden yayımlanmaz.
- **Veri kontrolü:** yorumlarını indirme, yeniden kimlik doğrulamasıyla hesabını ve yorumlarını silme.

### Görsel odalar

![Ruh hâli filtreleri ve altı eser kartıyla Sofra Art galerisi](docs/screenshots/gallery.png)

### Hesabım

![Oturum açıldıktan sonra profil penceresi: yorumları indirme ve hesap silme seçenekleri](docs/screenshots/account.png)

## Teknoloji altyapısı · Tech stack

| Katman / Layer | Teknoloji / Technology |
| --- | --- |
| Arayüz / Interface | JavaScript ES modules, Vite, CSS, native HTML dialogs |
| Kimlik / Identity | Firebase Authentication, Google sign-in, App Check, reCAPTCHA Enterprise |
| Sunucu / Server | Node.js 22, Firebase Cloud Functions v2 |
| Veri / Data | Cloud Firestore, transactions, indexes, private Cloud Storage |
| Yapay zekâ / AI | Google Gemini **`gemini-3.5-flash-lite`** |
| Yayın / Delivery | Netlify, responsive WebP images, self-hosted WOFF2 fonts |
| Kalite / Quality | Node.js test runner, Firebase Emulator Suite, GitHub Actions, dependency audits, publication and asset checks |

## Mimari

```mermaid
flowchart LR
    U[Ziyaretçi] --> W[Netlify · Web arayüzü]
    W --> A[Firebase Auth ve App Check]
    A --> F[Cloud Functions · doğrulama ve yetki]
    F --> D[(Özel Firestore)]
    F --> S[(Özel Storage)]
    F --> G[Gemini · moderasyon ve taslak]
    W --> P[Yayınlanmış görsel geçidi]
    P --> S
```

İlk ekran, yalnızca herkese açık varsayılan içerikle derleme sırasında hazırlanır; tarayıcı güncel günlük içeriği sunucudan alır. Firebase modülleri ihtiyaç duyulduğunda yüklenir. Görsellerin farklı ekran boyutlarına uygun sürümleri kullanılır, müzik kullanıcı başlatmadan çalmaz.

Tarayıcı Firestore veya Storage’a doğrudan erişmez. Sunucu, App Check’i ve işlem için gereken kimliği/yetkiyi doğrular. Yönetici yüklemeleri **20 MiB** ile sınırlıdır; gerçek dosya türü, piksel ve boyut kontrollerinden sonra WebP olarak yeniden kodlanır. Yalnızca yayındaki esere bağlı temizlenmiş görsel, ayrı bir geçitten sunulur.

Yorum ve takma ad birlikte değerlendirilir: `true` onay, `false` ret, `unclear` yönetici incelemesi anlamına gelir. Geçersiz model yanıtı, kota veya servis hatası da inceleme kuyruğuna düşer. Kısa tepkiler, emoji ve saygılı olumsuz eleştiri bağlamıyla değerlendirilir; moderasyon kusursuzluk garantisi taşımaz.

## English

**Art. Music. A little room for yourself.**

Sofra Art is a quiet place for daily discoveries. Explore visual rooms, follow your mood, respond to a thoughtful question, read something short, or let the music accompany your visit.

The public experience is backed by an editorial workspace. Content starts privately as a draft and becomes visible through an explicit publishing decision. The interface is in Turkish; the shared technology stack is listed above.

- **A daily table:** an artwork, reflection, question and song, with publication scheduled in the Istanbul time zone.
- **Unhurried discovery:** mood filters, a short discovery quiz, random artwork and device-local bookmarks.
- **Music while you browse:** a persistent player and optional, consent-based Spotify embeds restricted to individual tracks.
- **Thoughtful conversation:** Google sign-in, nickname-aware moderation, duplicate detection and rate controls.
- **Editorial tools:** private image uploads, previews, artwork publishing and AI writing suggestions that remain drafts until reviewed.
- **Personal data controls:** comment export and account/comment deletion following recent authentication.

## Architecture

```mermaid
flowchart LR
    U[Visitor] --> W[Netlify · Web interface]
    W --> A[Firebase Auth and App Check]
    A --> F[Cloud Functions · validation and authorization]
    F --> D[(Private Firestore)]
    F --> S[(Private Storage)]
    F --> G[Gemini · moderation and drafts]
    W --> P[Published image gateway]
    P --> S
```

The build renders the initial screen from public defaults; the browser then loads the current daily content. Firebase modules load on demand, responsive image variants reduce transfer size, and audio starts only after user interaction.

The browser has no direct database or storage access. Functions enforce App Check, verified identities and operation-specific authorization. Administrator uploads are capped at **20 MiB**, checked for file signature and image dimensions, and re-encoded to WebP. A separate gateway exposes only sanitized images attached to currently published artwork.

Moderation evaluates both nickname and comment. The exact string decisions are `true` for approval, `false` for rejection and `unclear` for human review. Invalid output, provider failures and exhausted quotas also enter the review queue. Respectful criticism, short reactions and emoji are assessed in context; automated moderation cannot guarantee perfect decisions.

## Yerelde çalıştır · Run locally

Use the Node version in [`.nvmrc`](.nvmrc). / [`.nvmrc`](.nvmrc) içindeki Node sürümünü kullan.

```sh
git clone https://github.com/Furkanfidanogl/sofra-art.git
cd sofra-art
npm ci
npm --prefix functions ci
cp .env.example .env.local
npm run dev
```

`VITE_SOFRA_BACKEND_ENABLED=false` starts a device-local demo. Production credentials are unnecessary for development or CI. / Bu ayar cihaz içi demoyu açar; geliştirme ve CI için üretim kimlik bilgileri gerekmez.

```sh
npm run check
npm run check:emulators
npm run build
node scripts/check-assets.cjs
node scripts/check-secrets.cjs --history
```

Emulator tests use the isolated `demo-sofra` project and require Java 21. / Emülatör testleri izole `demo-sofra` projesini kullanır ve Java 21 gerektirir.

## Proje belgeleri · Project documentation

[Kurulum ve operasyon / Setup and operations](docs/OPERATIONS.md) · [Canlıya çıkış kontrolleri / Go-live checks](docs/PRODUCTION_GO_LIVE.md) · [Güvenlik / Security](SECURITY.md) · [İçerik kaynakları / Asset credits](docs/ASSETS.md)

Ekran görüntüleri mevcut ürün arayüzünü gösterir. Görsel, ses ve font dosyalarının kullanım koşulları kaynaklarına bağlıdır. / Screenshots show the product interface. Artwork, audio and fonts retain their respective attribution and usage conditions.
