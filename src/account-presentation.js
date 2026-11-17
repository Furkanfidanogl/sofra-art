import { escapeHTML as esc } from './demo-store.js';

export function firstName(displayName, fallback = 'Misafir') {
  const name = String(displayName || '').trim().split(/\s+/u)[0];
  if (!name) return fallback;
  const [first, ...rest] = Array.from(name.toLocaleLowerCase('tr-TR'));
  return (first.toLocaleUpperCase('tr-TR') + rest.join('')).slice(0, 32);
}

export function accountPresentation({ user, loading }) {
  if (user) return { label: firstName(user.displayName, 'Hesabım'), loading: false };
  if (loading) return { label: '', loading: true };
  return { label: 'İçeri buyur', loading: false };
}

export function commentNickname(user) {
  return user?.displayName ? firstName(user.displayName, '') : '';
}

export function accountGreeting(user) {
  if (!user) return 'Görselleri keşfet, müziğini aç, biraz kendinle kal. Gezinmek için hesap açman gerekmiyor.';
  const name = firstName(user.displayName, '');
  return name ? `${name}, Sofra’ya hoş geldin.` : 'Sofra’ya hoş geldin.';
}

export function primaryAuthProvider(user, sessionProviderId = null) {
  if (sessionProviderId === 'apple.com' || sessionProviderId === 'google.com') return sessionProviderId;
  const ids = Array.isArray(user?.providerData) ? user.providerData.map(p => p?.providerId).filter(Boolean) : [];
  if (ids.includes('apple.com') && !ids.includes('google.com')) return 'apple.com';
  if (ids.includes('google.com')) return 'google.com';
  if (ids.includes('apple.com')) return 'apple.com';
  return null;
}

export function providerLabel(providerId) {
  if (providerId === 'apple.com') return 'Apple';
  if (providerId === 'google.com') return 'Google';
  return 'Hesabın';
}

export function accountIdentityNote(user, sessionProviderId = null) {
  if (!user) return '';
  const providerId = primaryAuthProvider(user, sessionProviderId);
  const label = providerLabel(providerId);
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  const isRelay = /@(?:privaterelay\.appleid\.com|private\.icloud\.com)$/i.test(email);
  if (providerId === 'apple.com') {
    if (isRelay) return 'Apple ile bağlı · Gizli e-posta aktarımı';
    return email ? `Apple ile bağlı · ${email}` : 'Apple ile bağlı';
  }
  if (providerId === 'google.com') {
    return email ? `Google ile bağlı · ${email}` : 'Google ile bağlı';
  }
  return email ? `${label} ile bağlı · ${email}` : 'Hesabın bağlı';
}

const APPLE_LOGO = '<svg class="apple-logo" viewBox="0 0 17 20" aria-hidden="true"><path d="M13.86 10.62c-.02-2.16 1.76-3.2 1.84-3.25-1-1.46-2.56-1.66-3.11-1.68-1.31-.13-2.58.78-3.25.78-.67 0-1.71-.76-2.82-.74-1.44.02-2.78.84-3.52 2.13-1.51 2.61-.39 6.47 1.08 8.59.72 1.04 1.57 2.2 2.69 2.16 1.08-.04 1.49-.7 2.79-.7 1.3 0 1.67.7 2.81.68 1.16-.02 1.9-1.05 2.61-2.09.82-1.2 1.16-2.36 1.18-2.42-.03-.01-2.27-.87-2.3-3.46zM11.73 4.3c.6-.73 1-1.73.89-2.74-.86.04-1.91.57-2.53 1.3-.55.63-1.03 1.66-.9 2.64.96.07 1.94-.48 2.54-1.2z"/></svg>';

export function accountButtonsHTML({ user, pending, authConfigured, appleConfigured, isAdmin, authProviderBusy = null }) {
  if (user) {
    return `${isAdmin ? '<button class="btn btn-primary" data-action="admin">Yönetim masasına geç</button>' : ''}<button class="btn" data-action="signout" ${pending ? 'disabled' : ''}>${pending ? 'Çıkış yapılıyor…' : 'Hesabımdan çık'}</button>`;
  }
  const googleText = authProviderBusy === 'google.com'
    ? 'Google penceresinde devam et…'
    : pending ? 'Birazdan buradayız…' : 'Google ile bağlan';
  const googleButton = `<button class="google-button" type="button" data-action="google" ${!authConfigured || pending ? 'disabled' : ''} aria-busy="${authProviderBusy === 'google.com'}"><span class="google-g" aria-hidden="true">G</span>${esc(googleText)}</button>`;
  if (!appleConfigured) return googleButton;
  const appleText = authProviderBusy === 'apple.com'
    ? 'Apple penceresinde devam et…'
    : pending ? 'Birazdan buradayız…' : 'Apple ile giriş yap';
  const appleButton = `<button class="apple-button" type="button" data-action="apple" ${!authConfigured || pending ? 'disabled' : ''} aria-busy="${authProviderBusy === 'apple.com'}">${APPLE_LOGO}<span>${esc(appleText)}</span></button>`;
  return `${googleButton}${appleButton}`;
}
