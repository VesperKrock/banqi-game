const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('../foundation/deps.cjs')('@electric-sql/pglite');
const uid = i => `00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
const baseline = fs.readFileSync('supabase/migrations/20261124000100_r5_00_foundation.sql','utf8');
const migration = fs.readFileSync('supabase/migrations/20261125000100_r5_01_lobbies.sql','utf8');
async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);`);
  for (let i=1;i<=30;i++) await db.query('insert into auth.users values($1)',[uid(i)]);
  await db.exec(baseline); await db.exec(migration);
  return db;
}
function api(db, who) {
  return async (action, args={}) => (await db.query('select public.banqi_room_action($1,$2,$3,$4,$5,$6) as result',
    [uid(who),action,action==='getMine'?null:(args.requestId??randomUUID()),args.code??null,args.roomId??null,args.revision??null])).rows[0].result;
}
const target = room => ({roomId:room.roomId,revision:room.revision});
const success = result => { assert.equal(result.ok,true,JSON.stringify(result)); return result.room; };

test('Postgres lobby transactions and privacy', async t => {
  const db=await setup(); t.after(()=>db.close());
  const A=api(db,1),B=api(db,2),C=api(db,3);
  let room, requestId=randomUUID();
  await t.test('Create generates six digits, 20-minute TTL; never creates game_state',async()=>{
    room=success(await A('create',{requestId})); assert.match(room.code,/^\d{6}$/); assert.equal(room.role,'host');
    assert.deepEqual(room.seats,[true,false]); assert.equal(room.lobbyStatus,'waiting');
    assert.ok(Date.parse(room.expiresAt)>Date.now()+1190000);
    assert.equal((await db.query('select count(*)::int as n from banqi_private.game_state')).rows[0].n,0);
  });
  await t.test('Create retry and concurrent calls reuse one membership',async()=>{
    const results=await Promise.all([A('create',{requestId}),A('create')]);
    assert.ok(results.every(r=>r.room.roomId===room.roomId));
    assert.equal((await db.query('select count(*)::int as n from banqi_private.rooms')).rows[0].n,1);
  });
  await t.test('Join preserves leading zeros and keeps database status waiting',async()=>{
    await db.query('update banqi_private.rooms set code=$1 where id=$2',['004215',room.roomId]);
    room=success(await A('getMine'));
    const joined=success(await B('join',{code:room.code})); assert.equal(joined.code,'004215');
    assert.equal(joined.role,'guest'); assert.deepEqual(joined.seats,[true,true]);
    assert.equal((await db.query('select status from banqi_private.rooms')).rows[0].status,'waiting');
    assert.equal(success(await A('getMine')).lobbyStatus,'full');
  });
  await t.test('Third user cannot view, seize, leave or cancel a full lobby',async()=>{
    assert.deepEqual(await C('join',{code:room.code}),{ok:false,error:'ROOM_FULL'});
    assert.equal(success(await C('getMine')),null);
    assert.equal((await C('cancel',target(room))).error,'ROOM_UNAVAILABLE');
    assert.equal((await C('leave',target(room))).error,'ROOM_UNAVAILABLE');
  });
  await t.test('Host/guest cannot act as each other; stale revisions are rejected',async()=>{
    const full=success(await A('getMine'));
    assert.equal((await A('leave',target(full))).error,'FORBIDDEN');
    assert.equal((await B('cancel',target(full))).error,'FORBIDDEN');
    assert.equal((await A('cancel',target(room))).error,'STALE_ROOM');
  });
  await t.test('Leave frees seat; delayed old leave never removes a new occupant',async()=>{
    const before=success(await B('getMine')), leaveId=randomUUID();
    success(await B('leave',{...target(before),requestId:leaveId}));
    assert.equal(success(await B('getMine')),null);
    const next=success(await C('join',{code:room.code})); assert.equal(next.role,'guest');
    success(await B('leave',{...target(before),requestId:leaveId}));
    assert.equal(success(await C('getMine')).role,'guest');
    assert.equal((await B('leave',target(before))).error,'ROOM_UNAVAILABLE');
  });
  await t.test('Cancel closes lobby; retry create cannot resurrect it; old code is generic unavailable',async()=>{
    const full=success(await A('getMine'));
    success(await A('cancel',target(full)));
    assert.equal(success(await C('getMine')),null);
    // Advance only the test rate window; receipts remain intact.
    await db.exec("update banqi_private.lobby_limits set started_at=now()-interval '2 hours'");
    assert.equal(success(await A('create',{requestId})),null);
    assert.equal((await B('join',{code:room.code})).error,'ROOM_UNAVAILABLE');
  });
  await t.test('Same request ID cannot change action/body',async()=>{
    assert.equal((await A('join',{requestId,code:room.code})).error,'INVALID_INPUT');
  });
  await t.test('Projection contains no IDs of peers, token, board or extra keys',async()=>{
    const created=success(await api(db,4)('create'));
    assert.deepEqual(Object.keys(created).sort(),['code','expiresAt','lobbyStatus','revision','role','roomId','seats'].sort());
    assert.ok(!JSON.stringify(created).includes(uid(4)));
  });
  await t.test('Expired code and unknown code return identical errors',async()=>{
    const host=api(db,5),guest=api(db,6), expired=success(await host('create'));
    await db.query("update banqi_private.rooms set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id=$1",[expired.roomId]);
    assert.equal(success(await host('getMine')),null);
    assert.deepEqual(await guest('join',{code:expired.code}),await guest('join',{code:'999999'}));
  });
  await t.test('Ten concurrent join requests allocate exactly one guest',async()=>{
    const r=success(await api(db,7)('create'));
    const results=await Promise.all(Array.from({length:10},(_,i)=>api(db,8+i)('join',{code:r.code})));
    assert.equal(results.filter(x=>x.ok).length,1); assert.equal(results.filter(x=>x.error==='ROOM_FULL').length,9);
  });
  await t.test('A guest cannot create a second room, nor occupy both seats',async()=>{
    const r=success(await api(db,7)('getMine'));
    const existing=success(await api(db,8)('create')); assert.equal(existing.roomId,r.roomId); assert.equal(existing.role,'guest');
    assert.equal(success(await api(db,7)('join',{code:r.code})).role,'host');
  });
  await t.test('Per-UID throttling persists after failed guesses and applies to new request IDs',async()=>{
    const attacker=api(db,18); let last;
    for(let i=0;i<7;i++) last=await attacker('join',{code:'999999'});
    assert.equal(last.error,'RATE_LIMIT'); assert.ok(last.retryAfter>0);
    assert.equal((await api(db,18)('join',{code:'999998'})).error,'RATE_LIMIT');
  });
  await t.test('Shared hourly cap cannot be bypassed by a new UID',async()=>{
    await db.query("insert into banqi_private.lobby_limits values('global:join',3600,now(),300) on conflict(bucket,seconds) do update set used=300,started_at=now()");
    assert.equal((await api(db,19)('join',{code:'999999'})).error,'RATE_LIMIT');
    assert.equal((await api(db,20)('join',{code:'999999'})).error,'RATE_LIMIT');
  });
  await t.test('Code collision retry is bounded and never overwrites',async()=>{
    const existing=(await db.query('select code from banqi_private.rooms limit 1')).rows[0].code;
    await db.exec(`create or replace function banqi_private.lobby_code() returns text language sql as 'select ''${existing}''::text'`);
    assert.equal((await api(db,21)('create')).error,'CODE_UNAVAILABLE');
    assert.equal(success(await api(db,21)('getMine')),null);
  });
  for(const role of ['anon','authenticated']) await t.test(`${role} cannot execute RPC/helpers or access private tables`,async()=>{
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(api(db,1)('getMine'),/permission denied/);
      for(const table of ['rooms','game_state','lobby_limits','lobby_requests']) for(const statement of [`select * from banqi_private.${table}`,`delete from banqi_private.${table}`]) {
        await assert.rejects(db.query(statement),/permission denied/);
      }
      await assert.rejects(db.query('select banqi_private.lobby_code()'),/permission denied/);
    } finally {await db.exec('reset role');}
  });
  await t.test('All private tables FORCE RLS, no policies/publications; RPC search_path fixed',async()=>{
    const tables=(await db.query("select relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='banqi_private' and c.relkind='r'")).rows;
    assert.equal(tables.length,4); assert.ok(tables.every(t=>t.relrowsecurity&&t.relforcerowsecurity));
    assert.equal((await db.query("select * from pg_policies where schemaname='banqi_private'")).rows.length,0);
    assert.equal((await db.query("select * from pg_publication_tables where schemaname='banqi_private'")).rows.length,0);
    const fn=(await db.query("select prosecdef,proconfig from pg_proc where oid='public.banqi_room_action(uuid,text,uuid,text,uuid,integer)'::regprocedure")).rows[0];
    assert.equal(fn.prosecdef,true); assert.deepEqual(fn.proconfig,['search_path=""']);
  });
});
