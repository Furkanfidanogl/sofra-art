// This state controls the interface only. Server authorization uses verified tokens.
export const guestSession = () => ({ user: null, admin: false, loading: true, error: null });

export const AUTHORIZED_ADMIN_EMAIL = 'fatihfidanogl@gmail.com';

export function createSessionObserver({ subscribe, tokenResult, onChange, onError = () => {} }) {
  let revision = 0;
  let active = true;
  const stop = subscribe(async user => {
    if (!active) return;
    const current = ++revision;
    // Drop the previous account's privileges before waiting for the new token.
    onChange({ user, admin: false, loading: Boolean(user), error: null });
    if (!user) return;
    try {
      const { claims } = await tokenResult(user);
      const email = (user.email || '').toLowerCase().trim();
      const isAuthorizedAdmin = claims.admin === true && (!email || email === AUTHORIZED_ADMIN_EMAIL);
      if (active && current === revision) {
        onChange({ user, admin: isAuthorizedAdmin, loading: false, error: null });
      }
    } catch(error) {
      if (active && current === revision) {
        onChange({ user, admin: false, loading: false, error: 'TOKEN_UNAVAILABLE' });
        onError(typeof error?.code==='string' && /^auth\/[a-z-]+$/.test(error.code)?error.code:'auth/unavailable');
      }
    }
  });
  return () => { active = false; revision++; stop(); };
}

export function authErrorMessage(error) {
  return ({
    'auth/unauthorized-domain': 'Bu adres için Google girişi henüz açılmamış. Misafir olarak gezebilirsin.',
    'auth/popup-blocked': 'Tarayıcı giriş penceresini engelledi. Açılır pencerelere izin verip yeniden dene.',
    'auth/popup-closed-by-user': 'Giriş penceresi kapandı. İstersen yeniden deneyebilirsin.',
    'auth/cancelled-popup-request': 'Önceki giriş penceresi kapandı. Son açılan pencereyle devam et.',
    'auth/network-request-failed': 'Bağlantı kurulamadı. İnternetini kontrol edip yeniden dene.',
    'auth/operation-not-allowed': 'Google sağlayıcısı şu an kullanılamıyor. Misafir olarak devam edebilirsin.',
    'auth/user-disabled': 'Bu hesabın Sofra oturumu kapatılmış. Siteyi misafir olarak gezebilirsin.',
    'auth/invalid-api-key': 'Giriş yapılandırması tamamlanamadı. Birazdan yeniden dene.',
    'auth/web-storage-unsupported': 'Tarayıcı oturum kaydına izin vermiyor. Normal bir sekmede yeniden dene.',
  })[error?.code] || 'İşlem tamamlanamadı. Yeniden deneyebilir veya misafir olarak devam edebilirsin.';
}
