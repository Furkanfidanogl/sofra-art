import manifest from './image-manifest.json' with {type:'json'};
export const HERO_SIZES='(max-width: 380px) calc(100vw - 30px), (max-width: 760px) calc(100vw - 40px), (max-width: 1100px) calc(100vw - 64px), (max-width: 1376px) calc(100vw - 96px), 1280px';
export const GALLERY_SIZES='(max-width: 380px) calc((100vw - 45px) / 2), (max-width: 760px) calc((100vw - 55px) / 2), (max-width: 1100px) calc((100vw - 116px) / 3), (max-width: 1376px) calc((100vw - 148px) / 3), 410px';
export function imageSource(src){return Object.hasOwn(manifest,src)?manifest[src].sources.at(-1).src:src;}
// Only trusted, committed local assets receive srcset. Published upload gateways are unchanged.
export function imageAttributes(src,sizes='(max-width: 880px) calc(100vw - 32px), 850px'){
  const image=Object.hasOwn(manifest,src)?manifest[src]:null;
  return image?`srcset="${image.sources.map(s=>`${s.src} ${s.width}w`).join(', ')}" sizes="${sizes}"`:'';
}
