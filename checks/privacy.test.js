import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {imageSource,imageAttributes} from '../src/responsive-image.js';
import { exportMyComments, removeMyComments } from '../src/privacy-client.js';
import { readSpotifyPreference, saveSpotifyPreference } from '../src/spotify-track.js';
const require = createRequire(import.meta.url);
const { requireRecentDeletion, createPrivacyService } = require('../functions/privacy.cjs');

test('browser configuration evaluates without a Node process global', () => {
  const source=fs.readFileSync(new URL('../src/firebase.js',import.meta.url),'utf8');
  const prefix=source.slice(0,source.indexOf('async function loadAuth()')).replace(/^import .*;$/mg,'').replaceAll('import.meta.env','({})').replaceAll('export ','');
  assert.equal(vm.runInNewContext(`${prefix}\nauthConfigured()`,{}),false);
});

test('the real Spotify renderer creates no external iframe before opt-in or after revocation', () => {
  const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const renderer=source.slice(source.indexOf('function renderPlayer()'),source.indexOf('async function togglePlay()'));
  const root={dataset:{},innerHTML:''};
  const context={imageSource,imageAttributes,document:{querySelector:()=>root},getDaily:()=>({spotifyUrl:'https://open.spotify.com/track/6qqdFWe7C4LsBjWbXQdsHA',songTitle:'Seçilen şarkı'}),audio:{pause(){}},esc:s=>s,spotifyTrackUrl:s=>s,forcedOriginal:false,spotifyAllowed:false};
  vm.createContext(context);vm.runInContext(renderer+';renderPlayer()',context);
  assert.equal(root.innerHTML.includes('<iframe'),false);
  assert.match(root.innerHTML,/Spotify oynatıcısını yükle/);
  context.spotifyAllowed=true;vm.runInContext('renderPlayer()',context);assert.match(root.innerHTML,/<iframe/);
  context.spotifyAllowed=false;vm.runInContext('renderPlayer()',context);assert.equal(root.innerHTML.includes('<iframe'),false);
});

test('account erasure requires recent identity and cannot remove the administrator', () => {
  const now = 2000000;
  for (const token of [{}, {auth_time: 100}, {auth_time: 3000}, {admin: true, auth_time: 2000}]) {
    assert.throws(() => requireRecentDeletion(token, now), { code: 'failed-precondition' });
  }
  assert.doesNotThrow(() => requireRecentDeletion({auth_time: 1990}, now));
});

test('privacy operations reject a different account or forged fields before database access', async () => {
  const service = createPrivacyService({db: {}});
  await assert.rejects(service.manage('user-a', {operation:'delete', accountUid:'user-b'}, {}), {code:'aborted'});
  await assert.rejects(service.manage('user-a', {operation:'export', accountUid:'user-a', uid:'user-b'}, {}), {code:'invalid-argument'});
});

test('data export paginates completely and rejects repeated cursors or identity changes', async () => {
  const calls=[];
  const comments=await exportMyComments({uid:'owner',isCurrent:()=>true,request:async value=>{
    calls.push(value);return value.cursor?{comments:[{id:'two'}],nextCursor:null}:{comments:[{id:'one'}],nextCursor:'page-two'};
  }});
  assert.deepEqual(comments.map(c=>c.id),['one','two']);
  assert.equal(calls.every(c=>c.accountUid==='owner'),true);
  await assert.rejects(exportMyComments({uid:'owner',isCurrent:()=>true,request:async()=>({comments:[],nextCursor:'loop'})}),/INVALID_EXPORT_CURSOR/);
  let active=true;
  await assert.rejects(exportMyComments({uid:'owner',isCurrent:()=>active,request:async()=>{active=false;return {comments:[],nextCursor:null};}}),/ACCOUNT_CHANGED/);
});

test('deletion waits for every cleanup page and stops immediately after account switch', async () => {
  let calls=0;
  await removeMyComments({uid:'owner',isCurrent:()=>true,request:async value=>{
    assert.equal(value.accountUid,'owner');return {complete:++calls===2};
  }});
  assert.equal(calls,2);
  let active=true;
  await assert.rejects(removeMyComments({uid:'owner',isCurrent:()=>active,request:async()=>{active=false;return {complete:false};}}),/ACCOUNT_CHANGED/);
});

test('Spotify requires explicit opt-in and revocation survives a page reload', () => {
  const values=new Map();const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  assert.equal(readSpotifyPreference(storage),false);
  saveSpotifyPreference(storage,true);assert.equal(readSpotifyPreference(storage),true);
  saveSpotifyPreference(storage,false);assert.equal(readSpotifyPreference(storage),false);
  assert.equal(readSpotifyPreference({getItem(){throw Error('unavailable')}}),false);
});
