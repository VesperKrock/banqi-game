// Read-only Pages smoke: no sign-in, room creation or hosted data mutation.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const launch = require('../helpers/chrome.cjs');

(async () => {
  const base = 'https://vesperkrock.github.io/banqi-game/';
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const files = ['index.html', 'style.css', ...['app.js', 'offline.mjs', 'engine.mjs', 'effects.mjs',
    'bot.mjs', 'bot-worker.mjs', 'bot-runner.mjs', 'bot-protocol.mjs', 'online-auth.mjs', 'online-config.mjs'].map(f => 'js/' + f),
    'assets/pieces/back.svg'];
  for (const color of ['red', 'black']) for (const kind of ['general', 'advisor', 'elephant', 'rook', 'horse', 'cannon', 'pawn']) {
    files.push(`assets/pieces/${color}/${kind}.svg`);
  }
  for (const sfx of ['flip', 'move', 'capture']) files.push(`assets/sfx/${sfx}.mp3`);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const file of files) {
    const response = await fetch(`${base}${file}?r5=${commit}`);
    assert.equal(response.status, 200, file);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(execFileSync('git', ['show', `${commit}:${file}`])), file);
  }
  const b = await launch({ suite: 'r5-public' });
  try {
    await b.send('Network.setBlockedURLs', { urls: ['*supabase*', '*esm.sh*'] });
    await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.qaReplies=0;
      const W=Worker;window.Worker=class extends W{constructor(...args){super(...args);this.addEventListener('message',()=>window.qaReplies++);}};` });
    for (const [width, height] of [[390, 844], [844, 390], [1366, 768]]) {
      await b.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 1000 });
      const loaded = b.waitForEvent('Page.loadEventFired'); await b.send('Page.navigate', { url: base }); await loaded;
      assert.equal(await b.evaluate(`document.querySelectorAll('.cell').length`), 32);
      if (width < 1000) assert.ok(await b.evaluate(`document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight`));
      await b.evaluate(`document.querySelector('#game-mode').value='solo';document.querySelector('#game-mode').dispatchEvent(new Event('change'))`);
      await b.evaluate(`new Promise((resolve,reject)=>{const start=performance.now();function poll(){
        if(window.qaReplies>0)return resolve();
        if(document.querySelector('#game-status').textContent.startsWith('Lượt Bạn'))document.querySelector('#cell-0').click();
        if(performance.now()-start>7000)return reject(Error('Solo timeout'));setTimeout(poll,25);}poll();})`);
      assert.equal(await b.evaluate(`performance.getEntriesByType('resource').filter(e=>/supabase|esm\.sh/.test(e.name)).length`), 0);
    }
    assert.equal(await b.evaluate(`import('./js/online-auth.mjs').then(m=>typeof m.onlineAuth.preflight)`), 'function');
    assert.deepEqual(b.errors, []);
    const report = { result: 'PASS', commit, assets: files.length, viewports: ['390x844', '844x390', '1366x768'],
      soloWorker: true, authIsLazy: true, errors: 0, evidence: b.output };
    fs.writeFileSync(path.join(b.output, 'public.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await b.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
