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
| Moderasyon | Takma ad + yorum + soru, bağlamsal değerlendirme, ikinci değerlendirmeyle doğrulanan ret, anlaşmazlık/hata/kotada manuel kuyruk |
| Gizlilik | Kullanıcıya bağlı export/silme, yakın tarihli doğrulama, geç model yanıtının silinen veriyi oluşturmaması |
| Canlı HTTP | HTTPS, güvenlik başlıkları, origin kısıtlaması, asset hash eşleşmesi, bilgi sayfası ve gerçek 404 |

Son yerel doğrulamada **101 kontrol/birim testi** ve **25 emülatör entegrasyon testi** geçti. Kapsam; ret doğrulamasında anlaşmazlık/zaman aşımı, ikinci çağrının eşzamanlı isteklerde gerçek kotadan sayılması, yönetici kararının korunması, Google oturumu ve hesap silmeden önce kimlik doğrulaması, yorum sonrası pencere davranışı, oturum değişimleri ve görsel yükleme/hata durumlarını da içerir. Güncel commit’in otomatik sonucu [GitHub Actions](https://github.com/Furkanfidanogl/sofra-art/actions/workflows/quality.yml) üzerinden izlenir; ham raporlar public repoda tutulmaz.

`gemini-3.5-flash-lite` ile 151 sentetik moderasyon örneği canlı API üzerinden değerlendirildi: 85 onay, 62 ret, 4 inceleme. 85 masum örneğin tamamı onaylandı; yanlış ret, zararlı örneğin onaylanması, masum yorumun gereksiz incelemeye alınması ve teknik hata görülmedi. 150/151 örnek beklenen etiketle birebir eşleşti; bir prompt injection örneği beklenen otomatik ret yerine iki değerlendirmenin uyuşmaması nedeniyle yayımlanmadan insan incelemesine ayrıldı. Bu fark ham raporda başarısız etiket eşleşmesi olarak korunur; tam etiket başarısı iddia edilmez. Kapsam; masum argo/harfsiz Türkçe, kısa cevap ve emoji, özel ad/alıntı, hedefli veya hedefsiz küfür, maskelenmiş ihlal, ticari spam, dolandırıcılık ve prompt injection karşıtlarını içerir. Toplam 214 sağlayıcı isteğinde medyan süre 1024 ms, p95 1637 ms ölçüldü; bunlar model değerlendirme süresidir, sayfa yüklenmesi veya saha performansı ölçümü değildir. Bu sınırlı sentetik ölçüm, gelecekteki tüm yorumlarda sıfır hata garantisi vermez ve gerçek kullanıcı dağılımını temsil ettiği iddia edilmez. Kelime listesiyle otomatik ret yoktur; ret doğrulaması uyuşmazsa veya servis hata verirse yorum manuel incelemeye kalır.

## Operasyon ve kabul sınırları

Günlük Firestore yedeği, 7 günlük saklama, silme koruması ve yalnız geçici kayıtlarda TTL yapılandırıldı. Ayrı scratch veritabanına gerçek geri yükleme denemesinde kalıcı belge hash/sayıları eşleşti; anonim erişim reddedildi ve test kopyası kaldırıldı. Bu deneme Auth/Storage kurtarmasını veya scratch indeks eşitliğini doğrulamaz.

Kesinti ve sunucu hata alarmları yapılandırıldı. Bildirim teslimatı için test gönderilmedi. Gerçek yönetici hesabında panel, büyük görsel yükleme, eser yayını ve günlük planlama kullanıcı kabulü bekliyor.

Domain geçişi ayrı karardır; mevcut `noindex`/robots engeli yayın ve indeksleme kararı verilene kadar korunur. Tüm fiziksel cihaz/tarayıcı kombinasyonları, ekran okuyucular ve saha p75 Core Web Vitals doğrulanmış sayılmaz.

## English acceptance summary

The automated gate covers source checks, isolated emulator integration, build, asset budgets, dependency audits and public-file/secret-pattern checks. Live HTTP and backend access checks are separate release steps. Firestore backup recovery was exercised in an isolated scratch database; Auth and Storage recovery remain separate concerns. Real administrator acceptance and alert delivery testing are not claimed. Domain setup and search-indexing approval are separate release decisions.
