const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const flush=()=>new Promise(r=>setImmediate(r));
const room=()=>({roomId:randomUUID(),code:'004215',role:'host',seats:[true,false],lobbyStatus:'waiting',revision:0,expiresAt:new Date(Date.now()+1200000).toISOString()});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function setup(options={}){
  const {createLobbyController}=await import('../../js/online-rooms.mjs');
  const calls=[],timers=new Map(),storage=new Map();let nextId=0,clock=0;
  const auth={ensureIdentity:async()=>({id:'11111111-1111-4111-8111-111111111111'}),roomAction:async(body,opts)=>{
    calls.push({body:structuredClone(body),signal:opts.signal});return {ok:true,room:null};},...options.auth};
  const changes=[];
  const c=createLobbyController({auth,onChange:s=>changes.push(s),storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    schedule:(fn,ms)=>{const id=++nextId;timers.set(id,{fn,ms});return id;},cancel:id=>timers.delete(id),now:()=>clock,random:()=>0.5,...options,auth});
  return {c,auth,calls,timers,storage,changes,advance:n=>{clock+=n;}};
}
test('No Auth until start; one poll every three seconds; stop cleans timers',async()=>{
  const x=await setup();assert.equal(x.calls.length,0);await x.c.start();assert.equal(x.calls.length,1);
  assert.deepEqual([...x.timers.values()].map(x=>x.ms),[3000]);x.c.stop();assert.equal(x.timers.size,0);
});
test('Mutation is single-flight and returns allowlisted public data',async()=>{
  const x=await setup();await x.c.start();const d=deferred(),r=room();x.auth.roomAction=()=>d.promise;
  assert.equal(x.c.act('create'),true);assert.equal(x.c.act('create'),false);d.resolve({ok:true,room:{...r,secret:'do not render'}});await flush();
  assert.deepEqual(x.c.snapshot().room,r);assert.equal(x.storage.size,0);x.c.stop();
});
test('Timeout retains request ID; retry is identical; later old response ignored',async()=>{
  const x=await setup();await x.c.start();const old=deferred(),first=room(),latest=room();const bodies=[];
  x.auth.roomAction=body=>{bodies.push(body);return old.promise;};x.c.act('create');
  [...x.timers.values()].find(t=>t.ms===8000).fn();await flush();assert.equal(x.c.snapshot().error,'TIMEOUT');assert.equal(x.storage.size,1);
  x.auth.roomAction=async body=>{bodies.push(body);return {ok:true,room:latest};};await x.c.retry();
  assert.deepEqual(bodies[0],bodies[1]);old.resolve({ok:true,room:first});await flush();assert.deepEqual(x.c.snapshot().room,latest);x.c.stop();
});
test('Close/background cancels transport and ignores late results; foreground resumes',async()=>{
  const x=await setup();await x.c.start();const d=deferred();let signal;
  x.auth.roomAction=(_b,o)=>{signal=o.signal;return d.promise;};x.c.retry();x.c.setVisible(false);assert.equal(signal.aborted,true);
  d.resolve({ok:true,room:room()});await flush();assert.equal(x.c.snapshot().room,null);assert.equal(x.timers.size,0);
  x.auth.roomAction=async()=>({ok:true,room:null});await x.c.setVisible(true);assert.equal(x.c.snapshot().phase,'ready');x.c.stop();
});
test('Late Auth result from closed generation never starts a room request',async()=>{
  const d=deferred(),x=await setup({auth:{ensureIdentity:()=>d.promise}});const opening=x.c.start();x.c.stop();
  d.resolve({id:randomUUID()});await opening;assert.equal(x.calls.length,0);assert.equal(x.c.snapshot().phase,'closed');
});
test('Offline stops polling; online resumes without creating a new identity',async()=>{
  const x=await setup();await x.c.start();x.c.setOnline(false);assert.equal(x.c.snapshot().phase,'offline');assert.equal(x.timers.size,0);
  assert.equal(x.c.act('create'),false);await x.c.setOnline(true);assert.equal(x.c.snapshot().phase,'ready');assert.equal(x.calls.length,2);x.c.stop();
});
test('429 honors server cooldown; manual retry cannot bypass it',async()=>{
  const x=await setup();await x.c.start();let calls=0;x.auth.roomAction=async()=>{calls++;throw Object.assign(Error(),{code:'RATE_LIMIT',retryAfter:60});};
  await x.c.retry();assert.equal(x.c.snapshot().retryAfter,60);await x.c.retry();assert.equal(calls,1);
  assert.ok([...x.timers.values()].every(t=>t.ms>=60000));x.advance(60001);await x.c.retry();assert.equal(calls,2);x.c.stop();
});
test('Definitive errors clear pending intent; stale-room refresh preserves safety',async()=>{
  const x=await setup();await x.c.start();x.auth.roomAction=async()=>{throw Object.assign(Error(),{code:'ROOM_FULL'});};
  x.c.act('join','004215');await flush();assert.equal(x.c.snapshot().error,'ROOM_FULL');assert.equal(x.c.snapshot().pending,false);x.c.stop();
});
test('Unknown outcome persists across reload and is bound to the same identity',async()=>{
  const x=await setup();await x.c.start();const d=deferred();x.auth.roomAction=()=>d.promise;x.c.act('create');
  const persisted=[...x.storage.values()][0];x.c.stop();d.resolve({ok:true,room:null});await flush();
  const map=new Map([['banqi-lobby-pending-v1',persisted]]),calls=[];
  const y=await setup({storage:{getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},auth:{
    ensureIdentity:async()=>({id:'11111111-1111-4111-8111-111111111111'}),roomAction:async body=>{calls.push(body);return {ok:true,room:null};}}});
  await y.c.start();assert.equal(calls[0].action,'create');assert.equal(calls[0].requestId,JSON.parse(persisted).body.requestId);y.c.stop();
  const z=await setup({storage:{getItem:()=>persisted,removeItem:()=>{}},auth:{ensureIdentity:async()=>({id:randomUUID()})}});
  await z.c.start();assert.equal(z.calls[0].body.action,'getMine');z.c.stop();
});
test('Session stale fails closed and never silently sends unauthenticated room actions',async()=>{
  const x=await setup({auth:{ensureIdentity:async()=>{throw Error('STALE_SESSION');}}});await x.c.start();
  assert.equal(x.calls.length,0);assert.equal(x.c.snapshot().phase,'error');x.c.stop();
});
test('Malformed projection is rejected before rendering',async()=>{
  const {readRoom}=await import('../../js/online-rooms.mjs');assert.throws(()=>readRoom({...room(),seats:[true,true,true]}));
  assert.throws(()=>readRoom({...room(),code:4215}));assert.throws(()=>readRoom({...room(),role:'admin'}));
});
