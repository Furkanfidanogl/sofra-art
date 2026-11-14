import {escapeHTML as esc} from './demo-store.js';
import {imageSource,imageAttributes} from './responsive-image.js';

export function framedImage(src,alt,{className='',sizes,loading='eager',priority='auto'}={}){
  return `<div class="sofra-image-frame" data-image-state="loading" aria-busy="true"><img data-sofra-image class="${esc(className)}" src="${esc(imageSource(src))}" ${imageAttributes(src,sizes)} alt="${esc(alt)}" loading="${loading}" fetchpriority="${priority}" decoding="async" /><span class="sofra-image-loading" aria-hidden="true"><span class="sofra-loader-mark">✳</span><span>Birazdan sofrada…</span></span><span class="sofra-image-error" role="status">Görsel şu an açılamadı.</span></div>`;
}

export function createImageLoading(document){
  function settle(img,state){
    const frame=img.closest?.('.sofra-image-frame');if(!frame)return;
    frame.dataset.imageState=state;frame.setAttribute('aria-busy',String(state==='loading'));
  }
  document.addEventListener('load',e=>{if(e.target.matches?.('img[data-sofra-image]'))settle(e.target,'ready');},true);
  document.addEventListener('error',e=>{if(e.target.matches?.('img[data-sofra-image]'))settle(e.target,'error');},true);
  function refresh(root=document){
    for(const img of root.querySelectorAll('img[data-sofra-image]'))if(img.complete)settle(img,img.naturalWidth>0?'ready':'error');
  }
  return {refresh};
}
