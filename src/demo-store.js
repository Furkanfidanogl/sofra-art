export const STORAGE_KEY = 'sofra-art-demo-v1';
export const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function readDemo(storage) {
  const empty = { saved: [], comments: [], daily: {} };
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY));
    if (!value || typeof value !== 'object') return empty;
    const comments = Array.isArray(value.comments) ? value.comments.filter(c =>
      c && typeof c.id === 'string' && typeof c.artId === 'string' &&
      typeof c.name === 'string' && c.name.length <= 32 &&
      typeof c.text === 'string' && c.text.length <= 500 &&
      ['pending', 'approved', 'rejected'].includes(c.status)
    ).slice(-40) : [];
    return {
      saved: Array.isArray(value.saved) ? value.saved.filter(v => typeof v === 'string').slice(0, 20) : [],
      comments,
      daily: value.daily && typeof value.daily === 'object' ? {
        quote: typeof value.daily.quote === 'string' ? value.daily.quote.slice(0, 180) : undefined,
        artwork: typeof value.daily.artwork === 'string' ? value.daily.artwork.slice(0, 24) : undefined,
        songTitle: typeof value.daily.songTitle === 'string' ? value.daily.songTitle.slice(0, 70) : undefined,
        question: typeof value.daily.question === 'string' ? value.daily.question.slice(0, 160) : undefined,
      } : {},
    };
  } catch { return empty; }
}

export function saveDemo(storage, data) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }
  catch { return false; }
}

// Demo UX only. Production enforcement MUST be in Functions, keyed to verified identity.
export function checkComment({ text, name, artId, previous = [], lastSubmitted = 0, now = Date.now() }) {
  const clean = text.trim();
  if (clean.length < 1 || clean.length > 500 || name.trim().length < 2 || name.trim().length > 32 || !clean.replace(/[\p{White_Space}\p{Cf}\p{M}]/gu,'')) return 'invalid';
  const normalized = clean.toLocaleLowerCase('tr').replace(/\s+/g, ' ');
  const repeated = previous.some(c => c.artId === artId && c.text.toLocaleLowerCase('tr').replace(/\s+/g, ' ') === normalized);
  if (repeated) return 'duplicate';
  if (lastSubmitted && now - lastSubmitted < 20000) return 'rate-limit';
  return 'ok';
}
