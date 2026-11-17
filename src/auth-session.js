// This state controls the interface only. Server authorization uses verified tokens.
export const guestSession = () => ({ user: null, admin: false, providerId: null, loading: true, error: null });

export const AUTHORIZED_ADMIN_EMAIL = 'fatihfidanogl@gmail.com';

export function isAuthorizedGoogleAdmin({ email, emailVerified, adminClaim, signInProvider, providerData }) {
  if (adminClaim !== true || emailVerified !== true) return false;
  const normalized = typeof email === 'string' ? email.toLowerCase().trim() : '';
  if (!normalized || normalized !== AUTHORIZED_ADMIN_EMAIL) return false;
  if (signInProvider !== 'google.com') return false;
  return Array.isArray(providerData) && providerData.some(p => p?.providerId === 'google.com');
}

export function createSessionObserver({ subscribe, tokenResult, onChange, onError = () => {} }) {
  let revision = 0;
  let active = true;
  const stop = subscribe(async user => {
    if (!active) return;
    const current = ++revision;
    // Drop the previous account's privileges before waiting for the new token.
    onChange({ user, admin: false, providerId: null, loading: Boolean(user), error: null });
    if (!user) return;
    try {
      const result = await tokenResult(user);
      const claims = result?.claims || {};
      const signInProvider = result?.signInProvider || claims?.firebase?.sign_in_provider || null;
      const providerId = signInProvider || user.providerData?.find(p => p?.providerId)?.providerId || null;
      const isAuthorizedAdmin = isAuthorizedGoogleAdmin({
        email: user.email,
        emailVerified: user.emailVerified,
        adminClaim: claims.admin,
        signInProvider,
        providerData: user.providerData,
      });
      if (active && current === revision) {
        onChange({ user, admin: isAuthorizedAdmin, providerId, loading: false, error: null });
      }
    } catch (error) {
      if (active && current === revision) {
        onChange({ user, admin: false, providerId: null, loading: false, error: 'TOKEN_UNAVAILABLE' });
        onError(typeof error?.code === 'string' && /^auth\/[a-z-]+$/.test(error.code) ? error.code : 'auth/unavailable');
      }
    }
  });
  return () => { active = false; revision++; stop(); };
}

export function authErrorMessage(error) {
  return ({
    'auth/unauthorized-domain': 'Bu adres için giriş sağlayıcısı henüz açılmamış. Misafir olarak gezebilirsin.',
    'auth/popup-blocked': 'Tarayıcı giriş penceresini engelledi. Açılır pencerelere izin verip yeniden dene; uygulama içi tarayıcıdaysan sayfayı tarayıcında aç.',
    'auth/popup-closed-by-user': 'Giriş penceresi kapandı. İstersen yeniden deneyebilirsin.',
    'auth/cancelled-popup-request': 'Önceki giriş penceresi kapandı. Son açılan pencereyle devam et.',
    'auth/network-request-failed': 'Bağlantı kurulamadı. İnternetini kontrol edip yeniden dene.',
    'auth/operation-not-allowed': 'Bu giriş yöntemi şu an kullanılamıyor. Diğer yöntemi deneyebilir veya misafir olarak devam edebilirsin.',
    'auth/account-exists-with-different-credential': 'Bu e-posta adresi Sofra’da başka bir giriş yöntemiyle kayıtlı. Önceki giriş yönteminle devam edebilirsin.',
    'auth/credential-already-in-use': 'Bu hesap bilgisi başka bir Sofra hesabına bağlı.',
    'auth/user-mismatch': 'Seçtiğin hesap şu an açık olan Sofra hesabınla eşleşmiyor. Doğrulamayı aynı hesapla yap.',
    'auth/requires-recent-login': 'Güvenlik için hesabını yeniden doğrulaman gerekiyor.',
    'auth/user-token-expired': 'Oturumunun süresi dolmuş. Yeniden giriş yapıp dene.',
    'auth/invalid-credential': 'Kimlik doğrulama yanıtı tamamlanamadı. İstersen yeniden dene.',
    'auth/missing-or-invalid-nonce': 'Giriş isteği zaman aşımına uğradı. İstersen yeniden deneyebilirsin.',
    'auth/apple-revocation-failed': 'Apple bağlantı izni doğrulanamadı veya kaldırılamadı. Aynı hesapla yeniden deneyebilirsin.',
    'auth/user-disabled': 'Bu hesabın Sofra oturumu kapatılmış. Siteyi misafir olarak gezebilirsin.',
    'auth/invalid-api-key': 'Giriş yapılandırması tamamlanamadı. Birazdan yeniden dene.',
    'auth/web-storage-unsupported': 'Tarayıcı oturum kaydına izin vermiyor. Normal bir sekmede yeniden dene.',
  })[error?.code] || 'İşlem tamamlanamadı. Yeniden deneyebilir veya misafir olarak devam edebilirsin.';
}
