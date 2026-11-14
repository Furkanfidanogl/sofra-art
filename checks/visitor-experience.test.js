import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createFeedback,SOFRA_SHH} from '../src/feedback.js';
import {framedImage,createImageLoading} from '../src/image-loading.js';

test('Sofra feedback uses the top layer without stealing focus and follows the keyboard',()=>{
  let opened=false,shown=0,hidden=0,expires;const styles={};
  const body={append(){throw new Error('Already mounted feedback must not be reparented')}};
  const el={parentElement:body,style:{setProperty:(k,v)=>styles[k]=v},matches:()=>opened,showPopover(){opened=true;shown++},hidePopover(){opened=false;hidden++}};
  const listeners={};const viewport={height:350,offsetTop:0,addEventListener:(k,fn)=>listeners[k]=fn};
  const feedback=createFeedback({document:{body,querySelector:s=>s==='#toast'?el:null},viewport,window:{innerHeight:800},setTimer:fn=>{expires=fn;return 1},clearTimer(){}});
  feedback.show(SOFRA_SHH,'sofra-shh');assert.equal(shown,1);assert.equal(el.textContent,SOFRA_SHH);assert.equal(styles['--feedback-bottom'],'466px');
  feedback.show('Sözün ulaştı');assert.equal(shown,1);assert.equal(el.textContent,'Sözün ulaştı');
  viewport.height=800;listeners.resize();assert.equal(styles['--feedback-bottom'],'110px');
  expires();assert.equal(hidden,1);assert.equal(el.className,'');
});

test('top-layer feedback stays in the modal accessible subtree rather than the inert background',()=>{
  let opened=false;const body={};const dialog={append(el){el.parentElement=this;}};
  const el={parentElement:body,style:{setProperty(){}},matches:()=>opened,showPopover(){opened=true;}};
  const feedback=createFeedback({document:{body,querySelector:s=>s==='#toast'?el:dialog},window:{innerHeight:800},setTimer:()=>1,clearTimer(){}});
  feedback.show(SOFRA_SHH,'sofra-shh');assert.equal(el.parentElement,dialog);assert.equal(opened,true);
});

test('feedback fallback stays inside the active modal on browsers without popover',()=>{
  let parent;const dialog={append:()=>parent='dialog'},body={append:()=>parent='body'};
  const el={style:{setProperty(){}}};
  const feedback=createFeedback({document:{body,querySelector:s=>s==='#toast'?el:dialog},window:{innerHeight:800},setTimer:()=>1,clearTimer(){}});
  feedback.show(SOFRA_SHH,'sofra-shh');assert.equal(parent,'dialog');
});

test('image loading settles cached, deferred and failed images without a permanent spinner',()=>{
  const events={};const frames=Array.from({length:3},()=>({dataset:{imageState:'loading'},setAttribute(k,v){this[k]=v}}));
  const images=frames.map((f,i)=>({complete:i<2,naturalWidth:i===0?400:0,closest:()=>f,matches:()=>true}));
  const document={addEventListener:(k,fn,capture)=>{assert.equal(capture,true);events[k]=fn;},querySelectorAll:()=>images};
  const loader=createImageLoading(document);loader.refresh();
  assert.equal(frames[0].dataset.imageState,'ready');assert.equal(frames[1].dataset.imageState,'error');assert.equal(frames[2].dataset.imageState,'loading');
  events.load({target:images[2]});assert.equal(frames[2].dataset.imageState,'ready');assert.equal(frames[2]['aria-busy'],'false');
  events.error({target:images[2]});assert.equal(frames[2].dataset.imageState,'error');
  const html=framedImage('/images/moon-terrace.webp','<img onerror=bad>',{className:'dialog-art-image'});
  assert.match(html,/Birazdan sofrada/);assert.match(html,/srcset=/);assert.doesNotMatch(html,/<img onerror=bad>|<button/);assert.match(html,/&lt;img onerror=bad&gt;/);
});

function commentHarness({status='approved',artId='table',error=false,refreshFails=false}={}){
  const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const body=source.slice(source.indexOf("  if(form.dataset.form==='comment'){"),source.indexOf("  if(form.dataset.form==='upload'"));
  const calls=[];let resolve;const pending=new Promise(r=>resolve=r);
  const button={disabled:false,isConnected:true,setAttribute(){},removeAttribute(){}};
  const dialog={open:true};const form={dataset:{form:'comment',id:artId,tableKey:'today'},querySelector:()=>button};
  const data=new Map([['name','Mert'],['text','Bugun biraz sikildim.']]);
  const sandbox={form,data,crypto,SOFRA_SHH,backendEnabled:()=>true,user:{uid:'visitor'},viewRevision:3,remotePending:[],
    submitComment:async()=>{await pending;if(error)throw new Error('network');return{id:'one',status}},refreshPublic:async()=>{calls.push('refresh');if(refreshFails)throw new Error('read failed')},
    sameView:(r,uid)=>r===sandbox.viewRevision&&uid===sandbox.user?.uid,
    document:{querySelector:()=>dialog},closeDialog:()=>{dialog.open=false;calls.push('close')},
    showArt:()=>calls.push('art'),showTable:()=>calls.push('table'),showAccount:()=>calls.push('account'),
    toast:(text,type)=>calls.push({text,type}),backendErrorMessage:()=> 'Bağlantı kurulamadı.',icon:()=>'',};
  vm.createContext(sandbox);const run=vm.runInContext(`(async()=>{${body}})()`,sandbox);
  return{calls,button,dialog,form,sandbox,finish:async()=>{resolve();await run}};
}

test('approved Night Table comments close the modal; rejected comments keep the form and use Sofra feedback',async()=>{
  const approved=commentHarness();assert.equal(approved.button.disabled,true);await approved.finish();assert.equal(approved.dialog.open,false);assert.ok(approved.calls.includes('refresh'));assert.equal(approved.calls.includes('table'),false);
  const staleList=commentHarness({refreshFails:true});await staleList.finish();assert.equal(staleList.dialog.open,false);assert.equal(staleList.calls.filter(c=>typeof c==='object').length,1);
  const rejected=commentHarness({status:'rejected'});await rejected.finish();assert.equal(rejected.dialog.open,true);assert.equal(rejected.calls.includes('table'),false);assert.deepEqual(rejected.calls.at(-1),{text:SOFRA_SHH,type:'sofra-shh'});assert.equal(rejected.button.disabled,false);
  const artwork=commentHarness({artId:'moon',status:'rejected'});await artwork.finish();assert.deepEqual(artwork.calls.at(-1),{text:SOFRA_SHH,type:'sofra-shh'});
  const pending=commentHarness({status:'pending'});await pending.finish();assert.equal(pending.dialog.open,true);assert.equal(pending.sandbox.remotePending.length,1);
});

test('late comment results cannot close a new view or leak feedback after account change',async()=>{
  const nav=commentHarness();nav.sandbox.viewRevision++;await nav.finish();assert.equal(nav.dialog.open,true);assert.equal(nav.calls.some(c=>typeof c==='object'),false);
  const switched=commentHarness();switched.sandbox.user={uid:'other'};await switched.finish();assert.deepEqual(switched.calls,[]);
  const failed=commentHarness({error:true});await failed.finish();assert.equal(failed.button.disabled,false);assert.equal(failed.dialog.open,true);assert.equal(failed.calls.at(-1).text,'Bağlantı kurulamadı.');
});
