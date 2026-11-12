import test from 'node:test';
import assert from 'node:assert/strict';
import {pageTemplate} from '../src/page-template.js';
import {daily,artworks} from '../src/content.js';
test('the shared public shell contains visible first-paint content and working anchor targets without private account state',()=>{
  const html=pageTemplate({d:daily,art:artworks[0],account:{loading:true,label:''},dateLabel:'BİRAZ DUR.'});
  assert.match(html,/<h1>Biraz dur\./);assert.match(html,/id="night"/);assert.match(html,/id="library"/);
  assert.match(html,/srcset=/);assert.equal((html.match(/<h1>/g)||[]).length,1);
  assert.doesNotMatch(html,/fatihfidanogl|Furkan|admin-dialog|Bearer /);
});
test('shared rendering escapes untrusted published metadata and account names',()=>{
  const payload='<img src=x onerror=alert(1)>';
  const html=pageTemplate({d:{...daily,quote:payload,question:payload,songTitle:payload},art:{...artworks[0],title:payload,alt:payload},account:{loading:false,label:payload},dateLabel:'Bugün'});
  assert.equal(html.includes(payload),false);assert.ok(html.includes('&lt;img'));
});
