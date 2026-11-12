const paths = {
  arrow: '<path d="M5 19 19 5M5 5h14v14"/>', down: '<path d="M12 4v16m-6-6 6 6 6-6"/>',
  right: '<path d="M4 12h16m-6-6 6 6-6 6"/>', back: '<path d="m14 5-7 7 7 7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>', moon: '<path d="M20 13a8 8 0 0 1-9-9 8 8 0 1 0 9 9Z"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4V4Z"/>', user: '<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  play: '<path d="m9 5 11 7-11 7V5Z" fill="currentColor" stroke="none"/>', pause: '<path d="M8 5v14m8-14v14" stroke-width="3"/>',
  prev: '<path d="M6 5v14m12-14L8 12l10 7V5Z"/>', next: '<path d="M18 5v14M6 5l10 7-10 7V5Z"/>',
  sound: '<path d="m11 4-5 5H2v6h4l5 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-5 5H2v6h4l5 5V4Zm5 5 6 6m0-6-6 6"/>',
  star: '<path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19"/>',
  send: '<path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15"/>',
  leaf: '<path d="M20 3c1 12-4 19-12 16C0 16 5 4 20 3ZM6 20 16 9"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', check: '<path d="m5 12 4 4L19 6"/>',
  share: '<path d="M12 15V3m-4 4 4-4 4 4M5 12v8h14v-8"/>',
  chat: '<path d="M21 11a8 8 0 0 1-8 8H6l-4 3 1-7a8 8 0 1 1 18-4Z"/>',
};
export const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.star}</svg>`;
export const brand = `<span class="brand-word">sofra</span><span class="brand-star" aria-hidden="true">✳</span><span class="brand-art">ART</span>`;
