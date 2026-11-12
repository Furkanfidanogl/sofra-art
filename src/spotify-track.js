// Only one track is embeddable. Localized sharing links become canonical URLs.
export function spotifyTrackUrl(value) {
  try {
    if(typeof value!=='string' || value.length>2048)return null;
    const url=new URL(value.trim());
    const match=url.pathname.match(/^(?:\/intl-[a-zA-Z]{2}(?:-[a-zA-Z]{2})?)?\/track\/([A-Za-z0-9]{22})\/?$/);
    if(url.origin!=='https://open.spotify.com' || url.username || url.password || !match)return null;
    return `https://open.spotify.com/track/${match[1]}`;
  }catch{return null;}
}

export const SPOTIFY_PREFERENCE_KEY = 'sofra-spotify-embed-v1';
export function readSpotifyPreference(storage) {
  try { return storage?.getItem(SPOTIFY_PREFERENCE_KEY) === 'allowed'; }
  catch { return false; }
}
export function saveSpotifyPreference(storage, allowed) {
  try { storage?.setItem(SPOTIFY_PREFERENCE_KEY, allowed ? 'allowed' : 'denied'); }
  catch { /* The choice still works for this page when storage is blocked. */ }
}
