const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const deps = require('./deps.cjs');

function fakeSdk({ session = null, sessionError = false, signError = false, userError = false } = {}) {
  const calls = { loads: 0, signs: 0, gets: 0, invokes: 0 };
  const user = { id: '11111111-1111-4111-8111-111111111111', is_anonymous: true };
  const sdk = { createClient(url, key, options) {
    calls.url = url; calls.key = key; calls.options = options;
    return { auth: {
      async getSession() { return { data: { session }, error: sessionError }; },
      async signInAnonymously() { calls.signs++; session = { access_token: 'test-only' }; return { data: { session }, error: signError }; },
      async getUser() { calls.gets++; return { data: { user }, error: userError }; },
    }, functions: { async invoke(name, options) {
      calls.invokes++; calls.invoke = { name, options };
      return { data: calls.response ?? { checkpoint: 'R5-00', user: { id: user.id, isAnonymous: true },
        capabilities: { preflight: true, rooms: false, gameplay: false }, privateState: 'must not escape' } };
    } } };
  } };
  return { calls, loadSdk: async () => { calls.loads++; return sdk; } };
}

test('Auth is lazy, deduplicates concurrent sign-ins and returns identity only', async () => {
  const { createOnlineAuth } = await import('../../js/online-auth.mjs');
  const mock = fakeSdk(); const auth = createOnlineAuth(mock);
  assert.equal(mock.calls.loads, 0);
  const users = await Promise.all(Array.from({ length: 10 }, () => auth.ensureIdentity()));
  assert.equal(mock.calls.loads, 1); assert.equal(mock.calls.signs, 1);
  assert.deepEqual(Object.keys(users[0]).sort(), ['id', 'isAnonymous']);
  assert.equal(mock.calls.options.auth.detectSessionInUrl, false);
  assert.equal(mock.calls.options.auth.persistSession, true);
  assert.equal(mock.calls.options.auth.autoRefreshToken, true);
  assert.equal(mock.calls.options.auth.storageKey, 'banqi-online-auth-v1');
  assert.ok(mock.calls.key.startsWith('sb_publishable_'));
});

test('Existing session is verified and reused, never replaced by a fresh identity', async () => {
  const { createOnlineAuth } = await import('../../js/online-auth.mjs');
  const mock = fakeSdk({ session: { access_token: 'existing' } });
  await createOnlineAuth(mock).ensureIdentity();
  assert.equal(mock.calls.signs, 0); assert.equal(mock.calls.gets, 1);
});

for (const [option, expected] of [['sessionError', 'SESSION_UNAVAILABLE'], ['signError', 'ANONYMOUS_SIGN_IN_FAILED'], ['userError', 'IDENTITY_INVALID']]) {
  test(`Auth fails closed: ${option}`, async () => {
    const { createOnlineAuth } = await import('../../js/online-auth.mjs');
    const mock = fakeSdk({ [option]: true });
    await assert.rejects(createOnlineAuth(mock).ensureIdentity(), new RegExp(expected));
    assert.equal(mock.calls.invokes, 0);
  });
}

test('Lazy SDK load may recover after network failure', async () => {
  const { createOnlineAuth } = await import('../../js/online-auth.mjs');
  const mock = fakeSdk(); let attempts = 0;
  const auth = createOnlineAuth({ loadSdk: () => { if (++attempts === 1) throw Error('network'); return mock.loadSdk(); } });
  await assert.rejects(auth.ensureIdentity(), /SDK_UNAVAILABLE/);
  await auth.ensureIdentity(); assert.equal(attempts, 2);
});

test('Preflight uses SDK GET, checks caller and allowlists fields', async () => {
  const { createOnlineAuth } = await import('../../js/online-auth.mjs');
  const mock = fakeSdk(); const auth = createOnlineAuth(mock);
  const result = await auth.preflight();
  assert.deepEqual(mock.calls.invoke, { name: 'banqi-preflight', options: { method: 'GET' } });
  assert.equal('privateState' in result, false);
  mock.calls.response = { ...result, user: { ...result.user, id: 'somebody-else' } };
  await assert.rejects(auth.preflight(), /PREFLIGHT_INVALID/);
});

test('Offline/Solo entrypoints never import or initialize Supabase', () => {
  for (const file of ['index.html', 'js/app.js', 'js/offline.mjs', 'js/bot-worker.mjs']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /supabase|online-auth|online-config|banqi-preflight/i);
  }
  assert.match(readFileSync('supabase/config.toml', 'utf8'), /verify_jwt\s*=\s*true/);
  assert.doesNotMatch(readFileSync('supabase/config.toml', 'utf8'), /schemas\s*=.*banqi_private/);
});

test('Preflight authenticates signed JWTs, restricts CORS and exposes no state', async t => {
  const { withSupabase } = deps('@supabase/server');
  const { generateKeyPair, exportJWK, SignJWT } = deps('jose');
  const { createPreflightHandler } = await import('../../supabase/functions/banqi-preflight/handler.mjs');
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = { ...await exportJWK(publicKey), kid: 'unit-key' };
  const url = 'https://unit.supabase.co';
  const handler = createPreflightHandler(withSupabase, { url, env: {
    url, publishableKeys: { default: 'sb_publishable_test' }, secretKeys: {}, jwks: { keys: [jwk] },
  } });
  const sign = (id, extra = {}) => new SignJWT({ role: 'authenticated', is_anonymous: true, ...extra })
    .setSubject(id).setAudience('authenticated').setIssuer(`${url}/auth/v1`)
    .setProtectedHeader({ alg: 'ES256', kid: 'unit-key' }).setIssuedAt().setExpirationTime('2m').sign(privateKey);
  const uidA = '11111111-1111-4111-8111-111111111111', uidB = '22222222-2222-4222-8222-222222222222';
  const jwtA = await sign(uidA), jwtB = await sign(uidB);
  const req = (jwt, headers = {}, method = 'GET', search = '') => new Request(`${url}/preflight${search}`, {
    method, headers: { origin: 'https://vesperkrock.github.io', apikey: 'sb_publishable_test',
      ...(jwt ? { authorization: `Bearer ${jwt}` } : {}), ...headers },
  });
  await t.test('Two independent signed users see only their own identity', async () => {
    for (const [jwt, id] of [[jwtA, uidA], [jwtB, uidB]]) {
      const response = await handler(req(jwt)); assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { checkpoint: 'R5-00', user: { id, isAnonymous: true },
        capabilities: { preflight: true, rooms: false, gameplay: false } });
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  });
  for (const [name, jwt] of [['missing JWT', null], ['malformed JWT', 'bad'], ['publishable key as JWT', 'sb_publishable_test']]) {
    await t.test(name, async () => { assert.equal((await handler(req(jwt))).status, 401); });
  }
  await t.test('Tampered and expired tokens rejected', async () => {
    const tampered = jwtA.split('.'); tampered[1] = Buffer.from(JSON.stringify({ sub: uidB })).toString('base64url');
    assert.equal((await handler(req(tampered.join('.')))).status, 401);
    const expired = await new SignJWT({ role: 'authenticated' }).setSubject(uidA).setAudience('authenticated')
      .setIssuer(`${url}/auth/v1`).setProtectedHeader({ alg: 'ES256', kid: 'unit-key' }).setExpirationTime(1).sign(privateKey);
    assert.equal((await handler(req(expired))).status, 401);
  });
  await t.test('Wrong role and caller-supplied identity rejected', async () => {
    assert.equal((await handler(req(await sign(uidA, { role: 'service_role' })))).status, 401);
    assert.equal((await handler(req(jwtA, {}, 'GET', `?user_id=${uidB}`))).status, 400);
    assert.equal((await handler(req(jwtA, {}, 'POST'))).status, 405);
  });
  await t.test('CORS allowlist and OPTIONS never substitute for auth', async () => {
    assert.equal((await handler(req(jwtA, { origin: 'https://evil.example' }))).status, 403);
    assert.equal((await handler(req(jwtA, { origin: 'https://vesperkrock.github.io.evil.example' }))).status, 403);
    const allowed = await handler(req(null, { 'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization, apikey, x-client-info' }, 'OPTIONS'));
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://vesperkrock.github.io');
    assert.equal((await handler(req(null, { origin: 'http://localhost:8080' }))).status, 401);
    assert.equal((await handler(req(null, { 'access-control-request-method': 'DELETE' }, 'OPTIONS'))).status, 403);
  });
});
