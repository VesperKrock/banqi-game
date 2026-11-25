const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {PGlite}=require('../foundation/deps.cjs')('@electric-sql/pglite');
test('Real disposable Postgres: match membership, atomic writes and durable receipts',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  const users=Array.from({length:4},()=>randomUUID());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key)');
  for(const uid of users)await db.query('insert into auth.users values($1)',[uid]);
  for(const file of ['20261124000100_r5_00_foundation.sql','20261125000100_r5_01_lobbies.sql','20261125000200_r5_02a_match.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  const A=await import('../../supabase/functions/banqi-match/engine-adapter.mjs');
  const {executeMatch}=await import('../../supabase/functions/banqi-match/service.mjs');
  const admin={rpc:async(name,args)=>{
    const names=Object.keys(args);const result=await db.query(`select public.${name}(${names.map((n,i)=>n+'=> $'+(i+1)).join(',')}) as result`,Object.values(args));return {data:result.rows[0].result};
  }};
  const lobby=async(i,action,extra={})=>(await db.query('select public.banqi_room_action($1,$2,$3,$4,$5,$6) as r',[users[i],action,action==='getMine'?null:randomUUID(),extra.code??null,extra.roomId??null,extra.revision??null])).rows[0].r;
  const created=await lobby(0,'create'),roomId=created.room.roomId;
  const start=(i,requestId=randomUUID())=>executeMatch(admin,users[i],{op:'start',roomId,requestId});
  const snapshot=i=>executeMatch(admin,users[i],{op:'snapshot',roomId});
  await t.test('Missing seat and outsider cannot start/read',async()=>{
    assert.equal((await start(0)).error,'NOT_READY');assert.equal((await snapshot(2)).error,'NOT_FOUND');
    assert.equal((await start(2)).error,'NOT_FOUND');
  });
  await lobby(1,'join',{code:created.room.code});
  const cmd0={op:'start',roomId,requestId:randomUUID()},cmd1={...cmd0,requestId:randomUUID()};
  let initial;
  await t.test('Concurrent start candidates commit one game, same board, fixed player seats',async()=>{
    const result=await Promise.all([executeMatch(admin,users[0],cmd0),executeMatch(admin,users[1],cmd1)]);
    assert.ok(result.every(r=>r.ok));assert.equal(result[0].match.version,0);assert.equal(result[1].match.version,0);
    assert.equal(result[0].match.player,0);assert.equal(result[1].match.player,1);
    assert.deepEqual(result[0].match.snapshot,result[1].match.snapshot);initial=result[0];
    assert.equal((await db.query('select count(*)::int as n from banqi_private.game_state')).rows[0].n,1);
    result[0].match.snapshot.board.forEach(p=>assert.deepEqual(p,{occupied:true,faceDown:true}));
  });
  let accepted,command;
  await t.test('Two prepared writes at same version: one commit, one STALE_VERSION',async()=>{
    const player=initial.match.snapshot.turn;
    const raw=await admin.rpc('banqi_match_read',{p_uid:users[player],p_command:{op:'snapshot',roomId}});
    const cmds=['a1','b1'].map(at=>({op:'act',roomId,requestId:randomUUID(),baseVersion:0,action:{type:'flip',at}}));
    const prepared=cmds.map(c=>A.prepareAction(raw.data.state,player,c.action));
    const responses=await Promise.all(cmds.map((c,i)=>admin.rpc('banqi_match_commit',{p_uid:users[player],p_command:c,p_revision:raw.data.revision,
      p_state:prepared[i].candidateState,p_snapshot:prepared[i].snapshot,p_event:prepared[i].event})));
    assert.equal(responses.filter(r=>r.data.ok).length,1);assert.equal(responses.filter(r=>r.data.error==='STALE_VERSION').length,1);
    const winner=responses.findIndex(r=>r.data.ok);accepted=responses[winner].data;command=cmds[winner];
    assert.equal(accepted.match.version,1);
  });
  await t.test('Retry returns committed response exactly; payload mismatch rejected',async()=>{
    const uid=users[accepted.match.player];
    assert.deepEqual(await executeMatch(admin,uid,command),accepted);
    assert.equal((await executeMatch(admin,uid,{...command,action:{type:'flip',at:'h4'}})).error,'REQUEST_CONFLICT');
    assert.equal((await snapshot(0)).match.version,1);
    assert.deepEqual(await executeMatch(admin,users[0],cmd0),initial);
  });
  await t.test('Out of turn/forged inputs do not change state',async()=>{
    const prior=await snapshot(0),wrong=1-prior.match.snapshot.turn;
    assert.equal((await executeMatch(admin,users[wrong],{op:'act',roomId,requestId:randomUUID(),baseVersion:1,action:{type:'flip',at:'h4'}})).error,'NOT_YOUR_TURN');
    assert.equal((await executeMatch(admin,users[2],{...command,requestId:randomUUID()})).error,'NOT_FOUND');
    assert.equal((await executeMatch(admin,users[0],{...command,player:0})).error,'INVALID_INPUT');
    assert.deepEqual(await snapshot(0),prior);
  });
  await t.test('Invitation TTL cannot expire active match; seats/lobby creation protected',async()=>{
    await db.query("update banqi_private.rooms set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id=$1",[roomId]);
    assert.equal((await snapshot(0)).ok,true);
    assert.equal((await lobby(0,'cancel',{roomId,revision:1})).error,'ROOM_UNAVAILABLE');
    assert.equal((await lobby(1,'leave',{roomId,revision:1})).error,'ROOM_UNAVAILABLE');
    await assert.rejects(lobby(0,'create'),/ACTIVE_MATCH_EXISTS/);
    await assert.rejects(db.query('update banqi_private.rooms set guest_uid=$1 where id=$2',[users[2],roomId]),/MATCH_SEATS_LOCKED/);
  });
  await t.test('Finished result commits atomically, releases claims, receipt still replays',async()=>{
    const {fixture}=require('../helpers/bot-fixtures.cjs');
    // Controlled fixture in disposable DB only; never a production setup endpoint.
    const state=fixture({a1:['red','pawn'],b1:['black','general']});
    await db.query('update banqi_private.game_state set state=$1,public_snapshot=$2 where room_id=$3',[state,A.publicSnapshot(state),roomId]);
    const cmd={op:'act',roomId,requestId:randomUUID(),baseVersion:1,action:{type:'move',from:'a1',to:'b1'}};
    const result=await executeMatch(admin,users[0],cmd);assert.equal(result.match.snapshot.status,'finished');
    assert.equal(result.match.snapshot.result.reason,'all_pieces_captured');
    assert.deepEqual(await executeMatch(admin,users[0],cmd),result);
    assert.equal((await executeMatch(admin,users[1],{...cmd,requestId:randomUUID(),baseVersion:2})).error,'GAME_OVER');
    assert.equal((await start(1)).match.snapshot.status,'finished');
    assert.equal((await db.query('select count(*)::int as n from banqi_private.match_members where active')).rows[0].n,0);
    assert.equal((await lobby(0,'create')).ok,true);
  });
  await t.test('Existing waiting lobby create/join/leave/cancel still works',async()=>{
    const room=(await lobby(2,'create')).room;
    const joined=(await lobby(3,'join',{code:room.code})).room;assert.equal(joined.role,'guest');
    assert.equal((await lobby(3,'leave',{roomId:room.roomId,revision:joined.revision})).ok,true);
    const updated=(await lobby(2,'getMine')).room;
    assert.equal((await lobby(2,'cancel',{roomId:room.roomId,revision:updated.revision})).ok,true);
    assert.equal((await lobby(3,'join',{code:room.code})).error,'ROOM_UNAVAILABLE');
  });
  await t.test('Prepared start loses membership/revision: cannot start after guest leaves',async()=>{
    const room=(await lobby(2,'create')).room;
    const joined=(await lobby(3,'join',{code:room.code})).room;
    const command={op:'start',roomId:room.roomId,requestId:randomUUID()};
    const read=(await admin.rpc('banqi_match_read',{p_uid:users[3],p_command:command})).data;
    const state=A.createServerGame();
    assert.equal((await lobby(3,'leave',{roomId:room.roomId,revision:joined.revision})).ok,true);
    const args={p_command:command,p_revision:read.revision,p_state:state,p_snapshot:A.publicSnapshot(state),p_event:null};
    assert.equal((await admin.rpc('banqi_match_commit',{p_uid:users[3],...args})).data.error,'NOT_FOUND');
    assert.equal((await admin.rpc('banqi_match_commit',{p_uid:users[2],...args})).data.error,'NOT_READY');
    assert.equal((await db.query('select count(*)::int as n from banqi_private.game_state where room_id=$1',[room.roomId])).rows[0].n,0);
    const updated=(await lobby(2,'getMine')).room;
    await lobby(2,'cancel',{roomId:room.roomId,revision:updated.revision});
  });
  await t.test('Replay at commit ignores stale candidate; no second write or receipt',async()=>{
    const before=(await db.query('select count(*)::int as n from banqi_private.match_receipts')).rows[0].n;
    const args={p_uid:users[accepted.match.player],p_command:command,p_revision:-1,p_state:null,p_snapshot:null,p_event:null};
    for(const r of await Promise.all([admin.rpc('banqi_match_commit',args),admin.rpc('banqi_match_commit',args)]))assert.deepEqual(r.data,accepted);
    assert.equal((await db.query('select count(*)::int as n from banqi_private.match_receipts')).rows[0].n,before);
  });
  await t.test('Read throttling persists across new request IDs, before private state reads',async()=>{
    await db.query("insert into banqi_private.lobby_limits(bucket,seconds,started_at,used) values($1,60,clock_timestamp(),120) on conflict(bucket,seconds) do update set started_at=excluded.started_at,used=120",['match:'+users[2]]);
    for(let i=0;i<2;i++){
      const r=await executeMatch(admin,users[2],{op:'start',roomId,requestId:randomUUID()});
      assert.equal(r.error,'RATE_LIMIT');assert.ok(r.retryAfter>0&&r.retryAfter<=60);
    }
  });
  await t.test('New tables FORCE RLS; helpers/private rows unpublished; only service role executes RPCs',async()=>{
    const rows=(await db.query("select relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='banqi_private' and c.relname in ('match_members','match_receipts')")).rows;
    assert.equal(rows.length,2);assert.ok(rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
    assert.equal((await db.query("select * from pg_publication_tables where schemaname='banqi_private'")).rows.length,0);
    assert.equal((await db.query("select * from pg_policies where schemaname='banqi_private'")).rows.length,0);
    for(const fn of ['public.banqi_match_read(uuid,jsonb)','public.banqi_match_commit(uuid,jsonb,integer,jsonb,jsonb,jsonb)']){
      const meta=(await db.query("select prosecdef,proconfig,has_function_privilege('service_role',oid,'execute') as service from pg_proc where oid=$1::regprocedure",[fn])).rows[0];
      assert.equal(meta.prosecdef,true);assert.deepEqual(meta.proconfig,['search_path=""']);assert.equal(meta.service,true);
    }
  });
  for(const role of ['anon','authenticated'])await t.test(role+' cannot call private read/commit or read receipts',async()=>{
    await db.exec('set role '+role);
    try{await assert.rejects(snapshot(0),/permission denied/);await assert.rejects(db.query('select * from banqi_private.match_receipts'),/permission denied/);
      await assert.rejects(admin.rpc('banqi_match_commit',{p_uid:users[0],p_command:command,p_revision:1,p_state:{},p_snapshot:{},p_event:{}}),/permission denied/);
    }finally{await db.exec('reset role');}
  });
});
