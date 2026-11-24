const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('./deps.cjs')('@electric-sql/pglite');
const migration = readFileSync('supabase/migrations/20261124000100_r5_00_foundation.sql', 'utf8');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    insert into auth.users values ('${A}'), ('${B}');`);
  return db;
}

test('Actual PostgreSQL migration: private schema, constraints, grants and default-deny RLS', async t => {
  const db = await database(); t.after(() => db.close()); await db.exec(migration);
  const room = (await db.query(`insert into banqi_private.rooms(code,host_uid,expires_at)
    values ('012345','${A}',now()+interval '1 hour') returning id`)).rows[0].id;
  await db.query(`insert into banqi_private.game_state(room_id,state) values ($1,$2)`, [room, { hidden: 'test fixture, not real game data' }]);
  await t.test('Both tables have FORCE RLS, no client policies and no publication', async () => {
    const rows = (await db.query(`select relrowsecurity,relforcerowsecurity from pg_class c
      join pg_namespace n on n.oid=c.relnamespace where n.nspname='banqi_private' and relkind='r'`)).rows;
    assert.equal(rows.length, 2); assert.ok(rows.every(r => r.relrowsecurity && r.relforcerowsecurity));
    assert.equal((await db.query(`select * from pg_policies where schemaname='banqi_private'`)).rows.length, 0);
    assert.equal((await db.query(`select * from pg_publication_tables where schemaname='banqi_private'`)).rows.length, 0);
  });
  for (const role of ['anon', 'authenticated']) for (const uid of [A, B]) {
    await t.test(`${role}/${uid === A ? 'A' : 'B'} cannot access schema or mutate either table`, async () => {
      await db.exec(`set role ${role}; set request.jwt.claim.sub='${uid}';`);
      try {
        for (const table of ['rooms', 'game_state']) for (const query of [
          `select * from banqi_private.${table}`, `insert into banqi_private.${table} default values`,
          `update banqi_private.${table} set ${table === 'rooms' ? 'status=status' : 'version=version'}`,
          `delete from banqi_private.${table}`,
        ]) await assert.rejects(db.query(query), /permission denied/);
      } finally { await db.exec('reset role'); }
    });
  }
  await t.test('RLS still denies both users if table privileges are accidentally granted', async () => {
    // This grant exists only in the disposable test database.
    await db.exec('grant usage on schema banqi_private to authenticated; grant all on all tables in schema banqi_private to authenticated');
    for (const uid of [A, B]) {
      await db.exec(`set role authenticated; set request.jwt.claim.sub='${uid}'`);
      try {
        for (const table of ['rooms', 'game_state']) {
          assert.equal((await db.query(`select * from banqi_private.${table}`)).rows.length, 0);
          assert.equal((await db.query(`delete from banqi_private.${table} returning *`)).rows.length, 0);
          assert.equal((await db.query(`update banqi_private.${table} set ${table === 'rooms' ? 'status=status' : 'version=version'} returning *`)).rows.length, 0);
        }
        await assert.rejects(db.query(`insert into banqi_private.rooms(code,host_uid,expires_at)
          values ('654321','${uid}',now()+interval '1 hour')`), /row-level security/);
        await assert.rejects(db.query(`insert into banqi_private.game_state values ('${A}',0,'{}',now())`), /row-level security/);
      } finally { await db.exec('reset role'); }
    }
  });
  await t.test('Server role can access authoritative data', async () => {
    await db.exec('set role service_role');
    try { assert.equal((await db.query('select * from banqi_private.game_state')).rows.length, 1); }
    finally { await db.exec('reset role'); }
  });
  for (const [name, sql] of [
    ['invalid code', `insert into banqi_private.rooms(code,host_uid,expires_at) values ('12345','${A}',now()+interval '1 hour')`],
    ['duplicate code', `insert into banqi_private.rooms(code,host_uid,expires_at) values ('012345','${B}',now()+interval '1 hour')`],
    ['expired invitation', `insert into banqi_private.rooms(code,host_uid,expires_at) values ('123456','${A}',now()-interval '1 hour')`],
    ['same UID in both seats', `update banqi_private.rooms set guest_uid=host_uid`],
    ['active without guest', `update banqi_private.rooms set status='active'`],
    ['third seat', `update banqi_private.rooms set third_uid='${B}'`],
    ['negative version', `update banqi_private.game_state set version=-1`],
    ['non-object state', `update banqi_private.game_state set state='[]'`],
  ]) await t.test(`Constraint rejects ${name}`, () => assert.rejects(db.query(sql)));
  await t.test('Repeat migration stops safely and preserves data', async () => {
    await assert.rejects(db.exec(migration), /already exists/); await db.exec('rollback');
    assert.equal((await db.query('select * from banqi_private.rooms')).rows.length, 1);
    assert.equal((await db.query('select * from auth.users')).rows.length, 2);
  });
});

test('Pre-existing foreign schema is never overwritten', async t => {
  const db = await database(); t.after(() => db.close());
  await db.exec('create schema banqi_private; create table banqi_private.keep_me(id int); insert into banqi_private.keep_me values(7)');
  await assert.rejects(db.exec(migration), /already exists/); await db.exec('rollback');
  assert.deepEqual((await db.query('select * from banqi_private.keep_me')).rows, [{ id: 7 }]);
});
