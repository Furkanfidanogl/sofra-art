# Canlıya çıkış kontrolleri · Production go-live

Bu belge güncel kabul kapsamını özetler; geliştirme günlüğü veya eksiksiz güvenlik sertifikası değildir. / This is a concise acceptance record, not a development diary or universal security certification.

Canlı adres / Live site: **https://sofra-art.netlify.app**

## Teknik kontroller

| Alan | Doğrulama |
| --- | --- |
| Kaynak ve derleme | Node 22 sözdizimi, birim/kontrol testleri, Vite build ve statik asset bütçesi |
| Entegrasyon | İzole Auth/Firestore/Storage emülatörlerinde kimlik, yetki, transaction, tekrar ve yarış kontrolleri |
| Yayın içeriği | İzinli belge envanteri, özel dosya/rapor/arşiv engeli, kaynak/derleme/geçmiş sır deseni taraması |
| Bağımlılıklar | Ön yüz ve backend için ayrı `npm audit` |
| Erişim | Doğrudan Firestore/Storage reddi, App Check, revoked-token doğrulama, yönetici ve kullanıcı sahipliği |
| Görsel ve bağlantı | 20 MiB sınırı, sahte MIME/bozuk dosya/piksel kontrolleri, WebP dönüşümü, yalnız Spotify track |
| Moderasyon | Takma ad + yorum, bağlamsal değerlendirme, katı üçlü karar, teknik hatada manuel kuyruk |
| Gizlilik | Kullanıcıya bağlı export/silme, yakın tarihli doğrulama, geç model yanıtının silinen veriyi oluşturmaması |
| Canlı HTTP | HTTPS, güvenlik başlıkları, origin kısıtlaması, asset hash eşleşmesi, bilgi sayfası ve gerçek 404 |

Son yerel doğrulamada **86 kontrol/birim testi** ve **24 emülatör entegrasyon testi** geçti. Güncel commit’in otomatik sonucu [GitHub Actions](https://github.com/Furkanfidanogl/sofra-art/actions/workflows/quality.yml) üzerinden izlenir; tarihsel ham raporlar public repoda tutulmaz.

## Operasyon ve kabul sınırları

Günlük Firestore yedeği, 7 günlük saklama, silme koruması ve yalnız geçici kayıtlarda TTL yapılandırıldı. Ayrı scratch veritabanına gerçek geri yükleme denemesinde kalıcı belge hash/sayıları eşleşti; anonim erişim reddedildi ve test kopyası kaldırıldı. Bu deneme Auth/Storage kurtarmasını veya scratch indeks eşitliğini doğrulamaz.

Kesinti ve sunucu hata alarmları yapılandırıldı. Bildirim teslimatı için test gönderilmedi. Gerçek yönetici hesabında panel, büyük görsel yükleme, eser yayını ve günlük planlama kullanıcı kabulü bekliyor.

Domain ve Apple ile giriş ayrı kurulum olarak kalır. Mevcut `noindex`/robots engeli domain ve indeksleme kararı verilene kadar korunur. Tüm fiziksel cihaz/tarayıcı kombinasyonları, ekran okuyucular ve saha p75 Core Web Vitals doğrulanmış sayılmaz.

## English acceptance summary

The automated gate covers source checks, isolated emulator integration, build, asset budgets, dependency audits and public-file/secret-pattern checks. Live HTTP and backend access checks are separate release steps. Firestore backup recovery was exercised in an isolated scratch database; Auth and Storage recovery remain separate concerns. Real administrator acceptance and alert delivery testing are not claimed. Domain setup, search-indexing approval and Apple sign-in are independent release decisions.
