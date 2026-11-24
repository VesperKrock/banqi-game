// Explicit opt-in: creates exactly two disposable Anonymous Auth users, not games.
// Never writes tokens, sessions, user IDs or private data to disk/stdout.
const assert = require('node:assert/strict');
const { createClient } = require('./deps.cjs')('@supabase/supabase-js');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  assert.ok(process.argv.includes('--live'), 'Pass --live explicitly to test the hosted project');
  const { createOnlineAuth } = await import('../../js/online-auth.mjs');
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key } = await import('../../js/online-config.mjs');
  const report = { checkpoint: 'R5-00', project: new URL(url).hostname.split('.')[0], checks: [], accountsCreated: 0 };
  const clients = [];
  const check = (name, ok) => { assert.equal(ok, true, name); report.checks.push(name); };
  const sdk = { createClient(project, publicKey, options) {
    const client = createClient(project, publicKey, options); clients.push(client); return client;
  } };
  const store = () => { const values = new Map(); return {
    getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k),
  }; };
  const request = (jwt, suffix = '', options = {}) => fetch(`${url}${suffix || '/functions/v1/banqi-preflight'}`, {
    ...options, headers: { apikey: key, origin: 'https://vesperkrock.github.io',
      ...(jwt ? { authorization: `Bearer ${jwt}` } : {}), ...options.headers },
  });
  const reject = async (name, response, allowed) => {
    check(name, allowed.includes(response.status)); await response.arrayBuffer();
  };
  try {
    const storageA = store(), storageB = store();
    const authA = createOnlineAuth({ loadSdk: async () => sdk, storage: storageA });
    const authB = createOnlineAuth({ loadSdk: async () => sdk, storage: storageB });
    const a = await authA.ensureIdentity(); report.accountsCreated++;
    const b = await authB.ensureIdentity(); report.accountsCreated++;
    check('Two real anonymous identities are distinct and verified by Auth', a.isAnonymous && b.isAnonymous && a.id !== b.id);
    const tokens = [];
    for (const client of clients) {
      const { data, error } = await client.auth.getSession();
      check(`Session ${tokens.length + 1} has a user JWT`, !error && data.session.access_token.split('.').length === 3);
      tokens.push(data.session.access_token);
    }
    const reload = createOnlineAuth({ loadSdk: async () => sdk, storage: storageA });
    check('Persisted identity is reused on reload', (await reload.ensureIdentity()).id === a.id);
    for (const [name, auth, id] of [['A', authA, a.id], ['B', authB, b.id]]) {
      const result = await auth.preflight();
      check(`Hosted preflight returns caller ${name} only`, result.user.id === id && result.user.isAnonymous &&
        result.capabilities.rooms === false && result.capabilities.gameplay === false);
    }
    await reject('No user JWT is rejected', await request(null), [401]);
    await reject('Malformed JWT is rejected', await request('not-a-jwt'), [401]);
    await reject('Publishable key is not a user JWT', await request(key), [401]);
    const forged = tokens[0].split('.');
    const claims = JSON.parse(Buffer.from(forged[1], 'base64url').toString()); claims.sub = b.id;
    forged[1] = Buffer.from(JSON.stringify(claims)).toString('base64url');
    await reject('Forged user ID with old signature is rejected', await request(forged.join('.')), [401]);
    await reject('Caller ID cannot be supplied in query', await request(tokens[0], '/functions/v1/banqi-preflight?user_id=' + b.id), [400]);
    await reject('Write method is rejected', await request(tokens[0], '', { method: 'POST', body: '{}' }), [405]);
    await reject('Untrusted browser origin is rejected', await request(tokens[0], '', { headers: { origin: 'https://evil.example' } }), [403]);
    const cors = await request(null, '', { method: 'OPTIONS', headers: {
      'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization,apikey,x-client-info' } });
    check('Hosted CORS allows the exact Pages origin', cors.status === 204 && cors.headers.get('access-control-allow-origin') === 'https://vesperkrock.github.io');
    await cors.arrayBuffer();
    for (const [name, jwt] of [['anon', null], ['A', tokens[0]], ['B', tokens[1]]]) {
      for (const table of ['rooms', 'game_state']) {
        for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
          await reject(`REST ${name} ${method} ${table} blocked`, await request(jwt, `/rest/v1/${table}?limit=1`, {
            method, headers: { 'Accept-Profile': 'banqi_private', 'Content-Profile': 'banqi_private', 'Content-Type': 'application/json' },
            ...(['POST', 'PATCH'].includes(method) ? { body: '{}' } : {}),
          }), [403, 404, 406]);
        }
      }
    }
    for (let i = 0; i < 2; i++) {
      const client = clients[i]; await client.realtime.setAuth(tokens[i]);
      const channel = client.channel(`banqi-preflight-check-${i}`, { config: { private: true } });
      channel.on('broadcast', { event: 'test' }, () => {});
      const outcome = await new Promise(resolve => {
        const timeout = setTimeout(() => resolve('TIMEOUT'), 10000);
        channel.subscribe((status, error) => { if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR') {
          clearTimeout(timeout); resolve(status === 'CHANNEL_ERROR' && error ? 'DENIED' : status);
        } });
      });
      await client.removeChannel(channel);
      check(`Realtime private channel denies user ${i + 1} without policies`, outcome === 'DENIED');
    }
    report.result = 'PASS';
  } catch (error) {
    report.result = 'PARTIAL';
    // Our errors contain fixed check names only; never dump SDK response objects.
    report.failedCheck = error.code === 'ERR_ASSERTION' ? String(error.message).split('\n')[0] : 'Live Auth/preflight request failed';
    process.exitCode = 1;
  } finally {
    for (const client of clients) { await client.removeAllChannels(); await client.auth.stopAutoRefresh(); }
    // Auth users are deliberately not deleted. In-memory credentials are discarded.
    const output = path.resolve('.local-qa/r5-00'); fs.mkdirSync(output, { recursive: true });
    const file = path.join(output, `live-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ result: report.result, checks: report.checks.length, accountsCreated: report.accountsCreated,
      ...(report.failedCheck ? { failedCheck: report.failedCheck } : {}), evidence: file }));
  }
}
main().catch(() => { console.error('Live check could not initialize'); process.exitCode = 1; });
