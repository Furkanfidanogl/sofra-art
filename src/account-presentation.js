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
