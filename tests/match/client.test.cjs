const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const UID=randomUUID(),ROOM=randomUUID();
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const tick=()=>new Promise(r=>setImmediate(r));
test('Online client projection, ownership and exact retries',async t=>{
  const {readMatch,follows,createMatchController}=await import('../../js/online-match.mjs');
  const E=await import('../../js/engine.mjs'),{publicSnapshot}=await import('../../supabase/functions/banqi-match/engine-adapter.mjs');
  const base=E.createGame({firstPlayer:0,random:()=>0.4});
  const match=(s=base,v=0,p=0,event=null)=>({roomId:ROOM,player:p,version:v,snapshot:publicSnapshot(s),event});
  const flipped=E.applyAction(base,0,{type:'flip',at:'a1'}),m0=match(),m1=match(flipped.state,1,0,flipped.event);
  function harness(action,options={}){
    const calls=[],states=[],timers=new Map();let id=0;
    const auth={ensureIdentity:async()=>({id:UID}),matchAction:async(b,o)=>{calls.push(structuredClone(b));return action(b,o);},...options.auth};
    const c=createMatchController({auth,storage:storage(),onChange:s=>states.push(s),schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,ms});return key;},cancel:k=>timers.delete(k),...options});
    t.after(()=>c.stop());return {c,calls,states,timers};
  }
  await t.test('Deep allowlist accepts engine public data; rejects hidden identity and malformed nested fields',()=>{
    assert.deepEqual(readMatch(m0),m0);assert.deepEqual(readMatch(m1),m1);
    for(const change of [m=>m.snapshot.board[0].color='red',m=>m.seed=1,m=>m.snapshot.board.pop(),m=>m.player=2,
      m=>m.version=-1,m=>m.snapshot.chase.warnings=[{private:true}],m=>m.snapshot.result={outcome:'win',winner:0,reason:'all_pieces_captured'},
      m=>m.event={type:'flip',player:0,at:'z9',piece:{color:'red',type:'pawn'}}]){
      const m=structuredClone(m0);change(m);assert.throws(()=>readMatch(m),/INVALID_RESPONSE/);
    }
    const copy=readMatch(m1);copy.snapshot.board[0].type='pawn';assert.notEqual(m1.snapshot.board[0].type,undefined);
  });
  await t.test('Animation only for consecutive compatible event, never replay/gap',()=>{
    assert.equal(follows(m0,m1),true);assert.equal(follows(m1,m1),false);assert.equal(follows(null,m1),false);
    assert.equal(follows(m0,{...m1,version:2}),false);assert.equal(follows(m0,{...m1,event:{...m1.event,player:1}}),false);
  });
  await t.test('JSONB receipt and Edge snapshot key order have identical state and presentation',async()=>{
    const reverse=v=>Array.isArray(v)?v.map(reverse):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reverse(x)])):v;
    let server=m0;const {c}=harness(async()=>({ok:true,match:server}));await c.start();server=reverse(m0);await c.retry();
    assert.equal(c.snapshot().ready,true);assert.equal(c.snapshot().error,null);
    assert.equal(follows(readMatch(reverse(m0)),readMatch(m1)),true);
    assert.deepEqual(readMatch(reverse(m1)),readMatch(m1));
  });
  await t.test('Host start requires full lobby; duplicate starts blocked; one pending body',async()=>{
    let current=null,resolve;const {c,calls}=harness(async b=>b.op==='start'?new Promise(r=>{resolve=()=>{current=m0;r({ok:true,match:m0});};}):({ok:true,match:current}));
    await c.start();const room={roomId:ROOM,role:'host',lobbyStatus:'full',seats:[true,true]};
    assert.equal(c.startGame({...room,role:'guest'}),false);assert.equal(c.startGame({...room,seats:[true,false]}),false);
    assert.equal(c.startGame(room),true);assert.equal(c.startGame(room),false);assert.equal(c.snapshot().match,null);
    resolve();await tick();assert.equal(c.snapshot().match.version,0);assert.equal(calls.filter(b=>b.op==='start').length,1);
  });
  await t.test('No optimistic action; duplicate/wrong-turn input rejected',async()=>{
    let current=m0,resolve;const {c,calls}=harness(async b=>b.op==='act'?new Promise(r=>{resolve=()=>{current=m1;r({ok:true,match:m1});};}):({ok:true,match:current}));
    await c.start();assert.equal(c.act({type:'flip',at:'a1'}),true);assert.equal(c.act({type:'flip',at:'a1'}),false);
    assert.equal(c.snapshot().match.version,0);resolve();await tick();assert.equal(c.snapshot().match.version,1);
    assert.equal(c.act({type:'flip',at:'b1'}),false);assert.equal(calls.filter(b=>b.op==='act').length,1);
  });
  await t.test('Unknown outcome persists exact command across reload, no JWT; late old response ignored',async()=>{
    const disk=storage();let resolve,server=m0;
    const first=harness(async b=>b.op==='act'?new Promise(r=>{resolve=r;}):({ok:true,match:server}),{storage:disk});
    await first.c.start();first.c.act({type:'flip',at:'a1'});const sent=first.calls.at(-1);
    const timeout=[...first.timers.values()].find(x=>x.ms===8000);timeout.fn();await tick();assert.equal(first.c.snapshot().error,'TIMEOUT');
    const saved=disk.getItem('banqi-match-pending-v1');assert.ok(saved.includes(sent.requestId));assert.ok(!/token|Bearer|snapshot/.test(saved));first.c.stop();server=m1;
    const second=harness(async b=>({ok:true,match:b.op==='act'?m1:server}),{storage:disk});await second.c.start();
    assert.deepEqual(second.calls[0],sent);assert.equal(second.c.snapshot().ready,true);assert.equal(disk.getItem('banqi-match-pending-v1'),null);
    resolve({ok:true,match:m1});await tick();assert.equal(first.c.snapshot().phase,'closed');
  });
  await t.test('STALE_VERSION clears old command, reconciles; never retries action at new version',async()=>{
    let server=m0;const {c,calls}=harness(async b=>{if(b.op==='act'){server=m1;throw Object.assign(Error(),{code:'STALE_VERSION'});}return {ok:true,match:server};});
    await c.start();c.act({type:'flip',at:'b1'});await tick();assert.equal(c.snapshot().ready,false);assert.equal(c.snapshot().pending,false);
    await c.retry();assert.equal(c.snapshot().match.version,1);assert.equal(calls.filter(b=>b.op==='act').length,1);
  });
  await t.test('Old version cannot overwrite; wrong room/player and inconsistent version fail closed',async()=>{
    let server=m1;const {c}=harness(async()=>({ok:true,match:server}));await c.start();server=m0;await c.retry();assert.equal(c.snapshot().match.version,1);
    for(const bad of [{...m1,roomId:randomUUID()},{...m1,player:1},{...m0,version:1}]){server=bad;await c.retry();assert.equal(c.snapshot().ready,false);assert.equal(c.snapshot().match.version,1);}
  });
  await t.test('Pause/offline/stop clear timers and lock inputs; foreground fetches before input',async()=>{
    const {c,calls,timers}=harness(async()=>({ok:true,match:m0}));await c.start();assert.equal([...timers.values()].filter(x=>x.ms===3000).length,1);
    c.setVisible(false);assert.equal(timers.size,0);assert.equal(c.act({type:'flip',at:'a1'}),false);const n=calls.length;
    await c.setVisible(true);assert.equal(calls.length,n+1);c.setOnline(false);assert.equal(c.snapshot().ready,false);assert.equal(timers.size,0);
    await c.setOnline(true);c.stop();assert.equal(timers.size,0);assert.equal(c.snapshot().phase,'closed');
  });
  await t.test('Pending command bound to verified UID; foreign identity never replays it',async()=>{
    const disk=storage();disk.setItem('banqi-match-pending-v1',JSON.stringify({uid:randomUUID(),body:{op:'start',roomId:ROOM,requestId:randomUUID()}}));
    const {c,calls}=harness(async()=>({ok:true,match:null}),{storage:disk});await c.start();assert.deepEqual(calls,[{op:'getMine'}]);assert.equal(disk.getItem('banqi-match-pending-v1'),null);
  });
  await t.test('Rate cooldown blocks extra attempts, preserves pending command',async()=>{
    let time=0;const {c,calls}=harness(async b=>{if(b.op==='act')throw Object.assign(Error(),{code:'RATE_LIMIT',retryAfter:60});return {ok:true,match:m0};},{now:()=>time});
    await c.start();c.act({type:'flip',at:'a1'});await tick();const sent=calls.at(-1);assert.equal(c.snapshot().pending,true);
    await c.retry();assert.equal(calls.length,2);time=60001;await c.retry();assert.deepEqual(calls.at(-1),sent);
  });
});
