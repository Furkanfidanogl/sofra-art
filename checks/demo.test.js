import test from 'node:test';
import assert from 'node:assert/strict';
import { readDemo, saveDemo, STORAGE_KEY, escapeHTML, checkComment } from '../src/demo-store.js';

test('untrusted comments remain escaped text rather than executable markup', () => {
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escapeHTML("A&B's"), 'A&amp;B&#39;s');
});
test('local corruption cannot break startup or create arbitrary moderation states', () => {
  const storage = { getItem: () => '{broken' };
  assert.deepEqual(readDemo(storage), { saved: [], comments: [], daily: {} });
  storage.getItem = () => JSON.stringify({ comments: [{ id:'x', artId:'moon', name:'Ada', text:'Bir yorum', status:'admin' }], saved:[{}, 'moon'], daily:{ question:'Bugün nasılsın?' } });
  const data=readDemo(storage);
  assert.equal(data.comments.length,0);
  assert.deepEqual(data.saved,['moon']);
  assert.equal(data.daily.question,'Bugün nasılsın?');
});
test('demo rejects oversized data, duplicates and rapid submissions without classifying harmless links or expression as spam', () => {
  const base={name:'Ada',text:'Bugün biraz durmak iyi geldi.',now:100000};
  assert.equal(checkComment(base),'ok');
  assert.equal(checkComment({...base,text:'x'.repeat(501)}),'invalid');
  assert.equal(checkComment({...base,previous:[{text:base.text.toLocaleUpperCase('tr')}]}),'duplicate');
  assert.equal(checkComment({...base,lastSubmitted:90000}),'rate-limit');
  assert.equal(checkComment({...base,text:'https://example.com adresine git'}),'ok');
  assert.equal(checkComment({...base,text:'Çooooooook güzel!!!!!!!!'}),'ok');
  assert.equal(checkComment({...base,lastSubmitted:70000}),'ok');
});
test('unavailable browser storage fails gracefully without a server fallback', () => {
  assert.equal(saveDemo({setItem(){throw new Error('quota');}},{}),false);
  const map=new Map();
  assert.equal(saveDemo({setItem:(k,v)=>map.set(k,v)},{saved:['moon']}),true);
  assert.equal(JSON.parse(map.get(STORAGE_KEY)).saved[0],'moon');
});
