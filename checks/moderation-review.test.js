import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createModerationService,REVIEW_INSTRUCTION}=createRequire(import.meta.url)('../functions/moderation.cjs');
const response=decision=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({decision})}]}}]})});

test('only confirmed rejections are rejected; disagreement never auto-approves',async()=>{
  for(const second of ['true','false','unclear']){
    const requests=[];let reserved=0;
    const service=createModerationService({apiKey:'mock-key',fetchFn:async(_,options)=>{requests.push(JSON.parse(options.body));return response(requests.length===1?'false':second);}});
    const input={name:'Takma ad',text:'Bağlamı tartışmalı bir ifade.',question:'Ne hissettin?'};
    const result=await service.evaluateComment({...input,reserveAdditionalCall:async()=>{reserved++;return true;}});
    assert.equal(result.decision,second==='false'?'false':'unclear');assert.equal(result.modelCalls,2);assert.equal(reserved,1);
    assert.equal(result.verification,second==='false'?'confirmed':'disputed');
    assert.equal(requests[1].contents[0].parts[0].text,requests[0].contents[0].parts[0].text);
    assert.ok(requests[1].systemInstruction.parts[0].text.endsWith(REVIEW_INSTRUCTION));
  }
});
test('approval/unclear take one request and do not reserve a rejection check',async()=>{
  for(const decision of ['true','unclear']){
    let calls=0;
    const service=createModerationService({apiKey:'mock-key',fetchFn:async()=>{calls++;return response(decision);}});
    const result=await service.evaluateComment({text:'Kısa tepki.',reserveAdditionalCall:()=>{throw new Error('Unexpected reservation')}});
    assert.equal(result.decision,decision);assert.equal(result.modelCalls,1);assert.equal(calls,1);
  }
});
test('exhausted confirmation quota and provider errors retain human review',async()=>{
  let calls=0;
  const limited=createModerationService({apiKey:'mock-key',fetchFn:async()=>{calls++;return response('false');}});
  const result=await limited.evaluateComment({text:'Ret adayı',reserveAdditionalCall:async()=>false});
  assert.equal(result.decision,'unclear');assert.equal(result.errorReason,'quota-limit');assert.equal(calls,1);
  for(const failure of [{ok:false,status:429},{ok:true,json:async()=>({candidates:[{finishReason:'MAX_TOKENS'}]})}]){
    let count=0;
    const service=createModerationService({apiKey:'mock-key',fetchFn:async()=>++count===1?response('false'):failure});
    const value=await service.evaluateComment({text:'Ret adayı'});assert.equal(value.decision,'unclear');assert.ok(value.errorReason);assert.equal(count,2);
  }
});
test('rejection confirmation shares the first request deadline and never retries indefinitely',async()=>{
  const signals=[];
  const service=createModerationService({apiKey:'mock-key',timeoutMs:25,fetchFn:async(_,options)=>{
    signals.push(options.signal);if(signals.length===1)return response('false');
    await new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true}));
  }});
  const result=await service.evaluateComment({text:'Ret adayı'});
  assert.equal(result.decision,'unclear');assert.equal(result.errorReason,'timeout');assert.equal(signals.length,2);assert.equal(signals[0],signals[1]);
});
test('split response parts parse together; thought parts never become a decision',async()=>{
  const service=createModerationService({apiKey:'mock-key',fetchFn:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'{"decision":"false"}'},{text:'{"decision":'},{text:'"true"}'}]}}]})})});
  assert.equal((await service.evaluateComment({text:'Merhaba'})).decision,'true');
});
