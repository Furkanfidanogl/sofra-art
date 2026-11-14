import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createEditorialController, validateEditorialContext, applyEditorialDraft } from '../src/editorial-client.js';
import { adminHTML } from '../src/admin-panel.js';

const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

function actualAdmin(){
  const events={};let resolve;
  const result=new Promise(r=>resolve=r);
  const dialog={id:'admin-dialog',open:true,dataset:{},innerHTML:'',hasAttribute(){return this.open},contains(){return false},querySelector(){return null},showModal(){this.open=true},close(){this.open=false}};
  const sandbox={createEditorialController,validateEditorialContext,applyEditorialDraft,adminHTML,crypto,
    document:{querySelector(s){if(s==='#admin-dialog'||s==='#admin-dialog[open]'&&dialog.open)return dialog;return null;},querySelectorAll(){return[]},addEventListener(k,fn){events[k]=fn},body:{append(){},classList:{add(){}}}},
    imageLoading:{refresh(){}},closeButton:()=>'',dialogFocus:{remember(){},restore(){}},esc:s=>s,toast:()=>{},backendErrorMessage:e=>e.message,
    backendEnabled:()=>true,isAdmin:()=>true,showAccount:()=>{},getDaily:()=>({quote:'Söz',question:'Soru?',songTitle:'Şarkı',artwork:'moon'}),rememberEditor:()=>{},generateEditorial:()=>result,
    getAdminDashboard:async()=>({serverDate:'2026-11-11',packages:[],artworks:[]})};
  vm.createContext(sandbox);
  vm.runInContext(`let user={uid:'owner'},viewRevision=10,dashboardRequest=0,currentAdminTab='daily',adminDate='2026-11-12',artworkId=null,adminSnapshot={},adminEditor={date:'2026-11-12',daily:{quote:'Elle söz',question:'Elle soru?',songTitle:'Şarkı'},version:0},artworkEditor=null,selectedAsset=null,commentStatus='pending',uploadBusy=false,lastDeletedAsset=null,aiBusy=null,aiBusyContext=null,aiDraft=null,aiTicket=0;const defaultQuestion='Soru?';`+
    section('function labelDialog(', 'function openDialog(')+
    section('function openDialog(', "document.querySelectorAll('dialog').forEach")+
    section('function sameView(', 'async function refreshOpenAdmin(')+
    section('const editorialCtrl =', "document.addEventListener('click',async")+
    section("document.addEventListener('click',async", "document.addEventListener('click',e=>")+
    source.slice(source.indexOf(" document.addEventListener('change'")),sandbox);
  return {dialog,events,resolve,run:code=>vm.runInContext(code,sandbox),start:()=>vm.runInContext("editorialCtrl.onDraftClick({type:'note',target:'quote'})",sandbox)};
}

test('production controller, rendering and actual date/tab event handlers reject stale AI and clear visible loading',async()=>{
  for(const navigation of ['normal','date-roundtrip','tab-roundtrip','close']){
    const h=actualAdmin();const pending=h.start();assert.match(h.dialog.innerHTML,/Öneri hazırlanıyor/);
    if(navigation==='date-roundtrip'){
      for(const value of ['2026-11-13','2026-11-12']){h.events.change({target:{dataset:{control:'package-date'},value}});await Promise.resolve();await Promise.resolve();}
      assert.equal(h.run('viewRevision'),12);
    }
    if(navigation==='tab-roundtrip')for(const id of ['gallery','daily'])await h.events.click({target:{closest:()=>({dataset:{action:'admin-tab',id}})}});
    if(navigation==='close')h.run("closeDialog(document.querySelector('#admin-dialog'))");
    h.resolve({draft:'Gerçek bağlantıdan gelen öneri.'});await pending;
    assert.equal(h.run('aiBusy'),null);
    if(navigation==='normal'){assert.equal(h.run('aiDraft.text'),'Gerçek bağlantıdan gelen öneri.');assert.match(h.dialog.innerHTML,/Editoryal Taslak Önerisi/);}
    else assert.equal(h.run('aiDraft'),null);
    if(navigation==='close')assert.equal(h.dialog.open,false);
    else assert.equal(h.dialog.innerHTML.includes('Öneri hazırlanıyor'),false);
  }
});

test('in-place dialog rendering preserves the shared live feedback element',()=>{
  const feedback={parent:'dialog',exists:true};
  const dialog={dataset:{},hasAttribute:()=>true,contains:el=>el===feedback};
  Object.defineProperty(dialog,'innerHTML',{set(){if(feedback.parent==='dialog')feedback.exists=false;}});
  const context={document:{activeElement:null,querySelector:s=>s==='#toast'?(feedback.exists?feedback:null):dialog,body:{append(el){el.parent='body';}}},imageLoading:{refresh(){}},closeButton:()=>'',labelDialog:()=>{},viewRevision:7};
  vm.runInNewContext(section('function renderDialog(',"document.querySelectorAll('dialog').forEach")+";renderDialog('#admin-dialog','new','',true)",context);
  assert.equal(feedback.exists,true);assert.equal(feedback.parent,'body');assert.equal(context.viewRevision,7);
});

test('artwork hash navigation closes the modal on Back and invalidates an in-flight open',()=>{
  const dialog={open:true};let shown=null,closed=0;
  const sandbox={location:{hash:'#art-moon'},currentArtId:'moon',viewRevision:1,showArt:id=>shown=id,document:{querySelector:()=>dialog},closeDialog:()=>{closed++;dialog.open=false;}};
  vm.createContext(sandbox);vm.runInContext(section('function handleHash()',"window.addEventListener('hashchange'")+ ';handleHash()',sandbox);
  assert.equal(shown,'moon');assert.equal(closed,0);
  sandbox.location.hash='#library';vm.runInContext('handleHash()',sandbox);
  assert.equal(closed,1);assert.equal(dialog.open,false);assert.equal(sandbox.viewRevision,2);
});
