import test from 'node:test';
import assert from 'node:assert/strict';
import { firstName, accountPresentation } from '../src/account-presentation.js';

test('automatic names use the first name with Turkish capitalization', () => {
  assert.equal(firstName('  FURKAN FİDANOĞLU  '), 'Furkan');
  assert.equal(firstName('İSMAİL YILMAZ'), 'İsmail');
  assert.equal(firstName('ipek deniz'), 'İpek');
  assert.equal(firstName('IŞIK ÖZTÜRK'), 'Işık');
  assert.equal(firstName(null, 'Hesabım'), 'Hesabım');
});

test('restoring a session never displays a guest invitation before identity is known', () => {
  assert.deepEqual(accountPresentation({user:null,loading:true}),{label:'',loading:true});
  assert.deepEqual(accountPresentation({user:{displayName:'FURKAN FİDANOĞLU'},loading:true}),{label:'Furkan',loading:false});
  assert.deepEqual(accountPresentation({user:null,loading:false}),{label:'İçeri buyur',loading:false});
});
