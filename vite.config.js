import {defineConfig,loadEnv} from 'vite';
import {pageTemplate} from './src/page-template.js';
import {daily,artworks} from './src/content.js';

export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'VITE_');
  return {plugins:[{
    name:'sofra-public-shell',
    transformIndexHtml(html){
      // Static, public defaults only: never read Auth, Firestore, cookies or local storage.
      // Runtime uses the same template and replaces this shell with the current daily data.
      const shell=pageTemplate({d:daily,art:artworks[0],account:{loading:true,label:''},dateLabel:'BİRAZ DUR.',backend:(process.env.VITE_SOFRA_BACKEND_ENABLED??env.VITE_SOFRA_BACKEND_ENABLED)==='true'});
      // Anchors work immediately; application actions become available after JS initializes.
      const loadingShell=shell.replace(/<button(?![^>]*\bdisabled\b)([^>]*)>/g,'<button disabled$1>');
      return html.replace('<div id="app"></div>',`<div id="app">${loadingShell}</div>`);
    }
  }]};
});
