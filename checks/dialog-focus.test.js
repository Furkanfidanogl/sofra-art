import test from 'node:test';
import assert from 'node:assert/strict';
import {createDialogFocus} from '../src/dialog-focus.js';
function button(label){return {dataset:{action:'art',id:'moon'},isConnected:false,getAttribute:name=>name==='aria-label'?label:null,focus(){this.focused=true}};}
test('closing a dialog restores its replacement gallery opener rather than a different button for the same artwork',()=>{
  const original=button('Eseri incele'),replacement=button('Eseri incele'),hero=button('Günün eserini incele'),dialog={};
  const focus=createDialogFocus({body:{},querySelectorAll:()=>[hero,replacement]});
  focus.remember(dialog,original,null);focus.restore(dialog);
  assert.equal(replacement.focused,true);assert.equal(hero.focused,undefined);
});
test('dialog navigation keeps the original opener and never focuses disabled replacement controls',()=>{
  const original=button('İncele'),first={},next={},active={};original.isConnected=true;
  const focus=createDialogFocus({body:{},querySelectorAll:()=>[]});
  focus.remember(first,original,null);focus.remember(next,active,{contains:()=>true});
  // A real transition refers to the previously remembered dialog object.
  first.contains=()=>true;focus.remember(next,active,first);focus.restore(next);assert.equal(original.focused,true);
  original.focused=false;original.disabled=true;focus.remember(first,original,null);focus.restore(first);assert.equal(original.focused,false);
});
