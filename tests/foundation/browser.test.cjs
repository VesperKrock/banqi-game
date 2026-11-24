const test = require('node:test');
const assert = require('node:assert/strict');
const launch = require('../helpers/chrome.cjs');

test('Chrome: Offline/Solo remain usable without any Supabase connection', { timeout: 30000 }, async t => {
  const b = await launch({ suite: 'r5-foundation' }); t.after(() => b.close());
  await b.send('Network.setBlockedURLs', { urls: ['*supabase*', '*esm.sh*'] });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.qaReplies=0;
    const RealWorker=Worker;window.Worker=class extends RealWorker{constructor(...args){super(...args);
    this.addEventListener('message',()=>window.qaReplies++);}};` });
  await b.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await b.navigate();
  await t.test('32 cells, no scroll and no Online controls', async () => {
    const state = await b.evaluate(`({cells:document.querySelectorAll('.cell').length,
      fits:document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight,
      modes:[...document.querySelector('#game-mode').options].map(x=>x.value)})`);
    assert.equal(state.cells, 32); assert.equal(state.fits, true); assert.deepEqual(state.modes, ['local', 'solo']);
  });
  await t.test('Offline flip still works', async () => {
    await b.evaluate(`document.querySelector('#cell-0').click()`);
    await b.evaluate(`new Promise(r=>setTimeout(r,450))`);
    assert.equal(await b.evaluate(`document.querySelectorAll('#board img:not([src="./assets/pieces/back.svg"])').length`), 1);
  });
  // Reload resets Offline state, so switching modes does not need a confirm dialog.
  await b.navigate();
  await t.test('Real Solo Worker makes a move', async () => {
    await b.evaluate(`document.querySelector('#game-mode').value='solo';document.querySelector('#game-mode').dispatchEvent(new Event('change'))`);
    await b.evaluate(`new Promise((resolve,reject)=>{const start=performance.now();function poll(){
      if(window.qaReplies>0) return resolve();
      if(document.querySelector('#game-status').textContent.startsWith('Lượt Bạn'))document.querySelector('#cell-0').click();
      if(performance.now()-start>7000)return reject(Error('Worker timeout'));setTimeout(poll,25);}poll();})`);
    assert.ok(await b.evaluate('window.qaReplies>0'));
  });
  await t.test('Explicitly importing Auth still makes no SDK/network request', async () => {
    assert.equal(await b.evaluate(`import('./js/online-auth.mjs').then(m=>typeof m.onlineAuth.preflight)`), 'function');
    assert.equal(await b.evaluate(`performance.getEntriesByType('resource').filter(e=>/supabase|esm\.sh/.test(e.name)).length`), 0);
    assert.deepEqual(b.errors, []);
  });
  await b.send('Network.setBlockedURLs', { urls: [] });
  await t.test('Pinned browser SDK loads only on explicit demand', async () => {
    assert.equal(await b.evaluate(`import('./js/online-config.mjs').then(c=>import(c.SUPABASE_SDK_URL)).then(m=>typeof m.createClient)`), 'function');
    assert.deepEqual(b.errors, []);
  });
});
