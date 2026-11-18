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

export function accountIdentityNote(user) {
  if (!user) return '';
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  return email ? `Google ile bağlı · ${email}` : 'Google ile bağlı';
}

export function accountButtonsHTML({ user, pending, authConfigured, isAdmin, googleBusy = false }) {
  if (user) {
    return `${isAdmin ? '<button class="btn btn-primary" data-action="admin">Yönetim masasına geç</button>' : ''}<button class="btn" data-action="signout" ${pending ? 'disabled' : ''}>${pending ? 'Çıkış yapılıyor…' : 'Hesabımdan çık'}</button>`;
  }
  const label = googleBusy ? 'Google penceresinde devam et…' : pending ? 'Birazdan buradayız…' : 'Google ile bağlan';
  return `<button class="google-button" type="button" data-action="google" ${!authConfigured || pending ? 'disabled' : ''} aria-busy="${googleBusy}"><span class="google-g" aria-hidden="true">G</span>${esc(label)}</button>`;
}
