"use strict";
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const {Worker}=require('node:worker_threads');
const path=require('node:path');
const {scenarios}=require('./helpers/bot-fixtures.cjs');
let createBotRunner,scene;
before(async()=>{({createBotRunner}=await import('../js/bot-runner.mjs'));scene=(await scenarios()).find(s=>s.name==='cannon-win');});
class FakeWorker{
 terminated=false;
 postMessage(data){this.sent=structuredClone(data);}
 terminate(){this.terminated=true;}
 reply(type,action=this.sent.input.legal[0],token={}){this.onmessage({data:{type,requestId:this.sent.requestId,session:this.sent.session,position:this.sent.position,action,...token}});}
}
const token={session:1,position:4};
test('Runner accepts one matching legal result and terminates Worker',async()=>{
 const w=new FakeWorker(),r=createBotRunner({makeWorker:()=>w});
 const p=r.request(scene.input(1),token);w.reply('result');const result=await p;
 assert.equal(result.status,'ok');assert.equal(result.source,'worker');assert.equal(w.terminated,true);
 w.reply('result');r.cancel();
});
test('Runner payload is a new public allowlist, no private references or hidden IDs',async()=>{
 const w=new FakeWorker(),r=createBotRunner({makeWorker:()=>w}),input=scene.input(1);
 input.secret='not public';input.snapshot.extra='not public';input.history.events.push();
 const p=r.request(input,token);assert.equal('secret' in w.sent.input,false);assert.equal('extra' in w.sent.input.snapshot,false);
 assert.notStrictEqual(w.sent.input.snapshot,input.snapshot);r.cancel();assert.equal((await p).status,'cancelled');
});
test('Late request/session/position messages cannot finish a new request',async()=>{
 const workers=[],r=createBotRunner({makeWorker:()=>{const w=new FakeWorker();workers.push(w);return w;}});
 const old=r.request(scene.input(1),token),fresh=r.request(scene.input(2),{session:2,position:0});
 assert.equal((await old).status,'cancelled');workers[0].reply('result');
 let finished=false;fresh.then(()=>finished=true);
 workers[1].reply('result',undefined,{requestId:-1});workers[1].reply('result',undefined,{session:1});workers[1].reply('result',undefined,{position:9});
 await new Promise(r=>setTimeout(r,10));assert.equal(finished,false);
 workers[1].reply('result');assert.equal((await fresh).status,'ok');r.cancel();
});
test('30 cancel/new requests discard every stale response',async()=>{
 const workers=[],r=createBotRunner({makeWorker:()=>{const w=new FakeWorker();workers.push(w);return w;}});
 for(let i=0;i<30;i++){const p=r.request(scene.input(i),{session:i,position:0});r.cancel();workers[i].reply('result');assert.equal((await p).status,'cancelled');assert.equal(workers[i].terminated,true);}
});
test('Real watchdog timeout uses already safety-ranked fallback',async()=>{
 const w=new FakeWorker(),r=createBotRunner({makeWorker:()=>w,timeoutMs:40,fallback:()=>{throw Error('Should use cached safety');}});
 const start=performance.now(),p=r.request(scene.input(1),token);w.reply('fallback',{type:'move',from:'a1',to:'h1'});
 const result=await p;assert.equal(result.source,'fallback');assert.equal(result.reason,'timeout');assert.equal(result.action.to,'h1');assert.ok(performance.now()-start>=30);assert.equal(w.terminated,true);
});
test('Hung Worker with no completed safe fallback returns recoverable error',async()=>{
 const w=new FakeWorker(),r=createBotRunner({makeWorker:()=>w,timeoutMs:30,fallback:()=>null});
 assert.deepEqual(await r.request(scene.input(1),token),{status:'error',reason:'timeout'});assert.equal(w.terminated,true);
});
for(const type of ['exception','messageerror','reported','invalid'])test('Worker '+type+' cannot apply unchecked data',async()=>{
 const w=new FakeWorker(),r=createBotRunner({makeWorker:()=>w});const p=r.request(scene.input(1),token);
 if(type==='exception')w.onerror({preventDefault(){}});else if(type==='messageerror')w.onmessageerror();else if(type==='reported')w.reply('error');else w.reply('result',{type:'move',from:'a1',to:'h4',secret:1});
 const result=await p;assert.equal(result.source,'fallback');assert.deepEqual(result.action,{type:'move',from:'a1',to:'h1'});assert.equal(w.terminated,true);
});
test('Worker unsupported plus fallback exception is recoverable without retry loop',async()=>{
 let attempts=0;const r=createBotRunner({makeWorker:()=>{attempts++;throw Error('Unsupported');},fallback:()=>{throw Error('budget');}});
 assert.deepEqual(await r.request(scene.input(1),token),{status:'error',reason:'unavailable'});assert.equal(attempts,1);
});
test('Actual Worker module returns correlated legal action, generic error contains no stack/state',async t=>{
 const w=new Worker(path.join(__dirname,'helpers/bot-node-worker.mjs'));t.after(()=>w.terminate());
 const messages=[];w.on('message',m=>messages.push(m));
 function receive(type){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Worker timeout')),2000);const listener=m=>{if(m.type===type){clearTimeout(timer);w.off('message',listener);resolve(m);}};w.on('message',listener);});}
 let response=receive('result');w.postMessage({type:'choose',requestId:9,...token,input:scene.input(1)});const good=await response;
 assert.equal(good.requestId,9);assert.equal(good.session,1);assert.deepEqual(good.action,{type:'move',from:'a1',to:'h1'});
 response=receive('error');w.postMessage({type:'choose',requestId:10,...token,input:null});assert.deepEqual(await response,{type:'error',requestId:10,...token});
 assert.ok(messages.some(m=>m.type==='fallback'));
});
