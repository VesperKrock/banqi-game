// Post-deploy smoke: exact public bytes, preview gate, one real temporary lobby.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const launch=require('../helpers/chrome.cjs');
(async()=>{
  const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),base='https://vesperkrock.github.io/banqi-game/';
  const files=['js/app.js','js/online-auth.mjs','js/online-config.mjs','js/online-rooms.mjs','js/online-lobby.mjs','online-lobby.css'];
  for(const file of files){const response=await fetch(base+file+'?v='+commit);assert.equal(response.status,200,file);
    const hash=b=>createHash('sha256').update(b).digest('hex');assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(execFileSync('git',['show',commit+':'+file])),file);}
  const b=await launch({suite:'r5-rooms-public'}),e=b.evaluate;
  const wait=condition=>e(`new Promise((resolve,reject)=>{const start=performance.now();function poll(){if(document.querySelector('#online-lobby')&&(${condition}))return resolve();if(performance.now()-start>8500)return reject(Error('Public wait'));setTimeout(poll,30);}poll();})`);
  const navigate=async url=>{const load=b.waitForEvent('Page.loadEventFired');await b.send('Page.navigate',{url});await load;};
  try{
    await navigate(base);assert.equal(await e(`!!document.querySelector('#online-lobby')`),false);
    assert.equal(await e(`performance.getEntriesByType('resource').some(r=>/online-|supabase|esm.sh/.test(r.name))`),false);
    await navigate(base+'?onlinePreview=1');await wait(`!document.querySelector('#online-create').disabled`);
    await e(`document.querySelector('#online-create').click()`);await wait(`!document.querySelector('#online-room').hidden`);
    assert.ok(await e(`/^\d{6}$/.test(document.querySelector('#online-code').textContent)`));
    const opened=b.waitForEvent('Page.javascriptDialogOpening'),clicked=e(`document.querySelector('#online-leave').click()`);
    await opened;await b.send('Page.handleJavaScriptDialog',{accept:true});await clicked;await wait(`document.querySelector('#online-room').hidden`);
    await e(`document.querySelector('#online-close').click();document.querySelector('#cell-0').click()`);
    await e('new Promise(r=>setTimeout(r,450))');
    assert.equal(await e(`document.querySelectorAll('#board img:not([src="./assets/pieces/back.svg"])').length`),1);
    assert.deepEqual(b.errors,[]);
    const report={result:'PASS',commit,assets:files.length,previewOnly:true,hostedCreateCancel:true,offlineFlip:true,errors:0,evidence:b.output};
    fs.writeFileSync(path.join(b.output,'public.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{await b.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
