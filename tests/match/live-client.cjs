// Real browser UI + deployed APIs; no mocked transport or private DB access.
// Optional hold carries the same two QA sessions to Pages in memory, no tokens in reports.
const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const launch=require('../helpers/chrome.cjs');
(async()=>{
  assert.ok(process.argv.includes('--live'),'Explicit --live required');
  const resumeArg=process.argv.find(a=>a.startsWith('--resume='));
  const resume=resumeArg?JSON.parse(fs.readFileSync(resumeArg.slice(9),'utf8')):null;
  const browsers=[],report={phase:'R5-02B',checks:[],profiles:[],actions:[{flip:0,move:0,capture:0},{flip:0,move:0,capture:0}],public:null,sourceHashes:{}};
  for(const f of ['js/offline.mjs','js/effects.mjs','js/online-auth.mjs','js/online-lobby.mjs','js/online-match.mjs'])report.sourceHashes[f]=createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const file='.local-qa/r5-02b/live-client-'+Date.now()+'.json';
  const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));
  const check=(name,ok)=>{assert.ok(ok,name);report.checks.push(name);};
  const wait=(b,c)=>b.evaluate(`new Promise((resolve,reject)=>{const start=performance.now();function poll(){if(${c})return resolve();if(performance.now()-start>8800)return reject(Error('Live browser wait: '+${JSON.stringify(c)}));setTimeout(poll,60);}poll();})`);
  const click=(b,s)=>b.evaluate(`document.querySelector(${JSON.stringify(s)}).click()`);
  const navigate=async(b,url)=>{const load=b.waitForEvent('Page.loadEventFired');await b.send('Page.navigate',{url});await load;};
  const snapshot=b=>b.evaluate('window.__qaMatch');
  const observing=`window.__qaMatch=null;window.__qaApi={match:0,room:0,mutations:0};const originalFetch=window.fetch;window.fetch=async(...args)=>{
    const url=String(args[0]?.url??args[0]);if(url.includes('/functions/v1/banqi-match')){__qaApi.match++;try{let b=JSON.parse(args[1]?.body);if(b.op==='act'||b.op==='start')__qaApi.mutations++;}catch{}}
    if(url.includes('/functions/v1/banqi-rooms'))__qaApi.room++;
    const response=await originalFetch(...args);if(url.includes('/functions/v1/banqi-match'))response.clone().json().then(r=>{if(r.ok&&r.match&&(!__qaMatch||r.match.version>=__qaMatch.version))__qaMatch=r.match;}).catch(()=>{});return response;};`;
  let last;
  try{
    for(let i=0;i<2;i++){
      const old=resume?.profilePaths?.[i]??(resume?.profiles?.[i]&&require('node:path').join(resume.profiles[i],fs.readdirSync(resume.profiles[i]).find(p=>p.startsWith('profile-'))));
      browsers.push(await launch({suite:'r5-02b-live-'+i,port:i===0?8080:0,profilePath:old}));
    }
    report.profilePaths=browsers.map(b=>b.profile);report.resumed=!!resume;
    const [A,B]=browsers,local='http://127.0.0.1:8080/?onlinePreview=1';
    for(const b of browsers){await b.send('Page.addScriptToEvaluateOnNewDocument',{source:observing});await navigate(b,local);await wait(b,`document.querySelector('#board').dataset.owner==='online'||document.querySelector('#online-create')&&!document.querySelector('#online-create').disabled`);}
    const ids=await Promise.all(browsers.map(b=>b.evaluate(`import('./js/online-auth.mjs').then(m=>m.onlineAuth.ensureIdentity()).then(u=>u.id)`)));
    check('Two independent Anonymous profiles',new Set(ids).size===2);
    if(await A.evaluate(`document.querySelector('#board').dataset.owner!=='online'`)){
    if(await A.evaluate(`document.querySelector('#online-room').hidden`))await click(A,'#online-create');await wait(A,`!document.querySelector('#online-room').hidden`);
    const code=await A.evaluate(`document.querySelector('#online-code').textContent`);check('Six-digit invitation',/^[0-9]{6}$/.test(code));
    await B.evaluate(`document.querySelector('#online-code-input').value=${JSON.stringify(code)};document.querySelector('#online-join-form').requestSubmit()`);
    await wait(A,`!document.querySelector('#online-start').disabled`);await wait(B,`!document.querySelector('#online-room').hidden`);
    check('Guest has no Start control',await B.evaluate(`document.querySelector('#online-start').hidden`));
    await click(A,'#online-start');}
    for(const b of browsers)await wait(b,`document.querySelector('#board').dataset.owner==='online'&&__qaMatch?.version>=0&&!document.querySelector('#online-lobby').open`);
    const initial=await Promise.all(browsers.map(snapshot));assert.deepEqual(initial[0].snapshot,initial[1].snapshot);last=initial[0];
    check('Host/guest seats and same initial board',initial[0].player===0&&initial[1].player===1);
    const wrong=browsers[1-last.snapshot.turn],n=await wrong.evaluate('__qaApi.mutations');await click(wrong,'#cell-0');check('Wrong-turn click sends no mutation',await wrong.evaluate('__qaApi.mutations')===n);
    const {getLegalActions}=await import('../../js/engine.mjs');const idx=a=>(Number(a[1])-1)*8+'abcdefgh'.indexOf(a[0]);
    // Stop after both players have used flip/move/capture. This is a client gate,
    // not a repeat of the 97-action backend endurance/security gate.
    for(let ply=0;ply<70&&last.snapshot.status==='playing'&&!report.actions.every(a=>Object.values(a).every(Boolean));ply++){
      const actor=last.snapshot.turn,b=browsers[actor];
      await wait(b,`__qaMatch?.version===${last.version}&&!document.querySelector('#board').dataset.animating&&document.querySelector('#cell-0').getAttribute('aria-disabled')==='false'`);
      const legal=getLegalActions(last.snapshot,actor),moves=legal.filter(a=>a.type==='move'),flips=legal.filter(a=>a.type==='flip'),captures=moves.filter(a=>last.snapshot.board[idx(a.to)]!==null);
      const action=(!report.actions[actor].move&&moves.find(a=>last.snapshot.board[idx(a.to)]===null))||captures[0]||flips[0]||moves[0];assert.ok(action,'Legal public action');
      if(action.type==='move'){await click(b,'#cell-'+idx(action.from));await click(b,'#cell-'+idx(action.to));}
      else {await click(b,'#cell-'+idx(action.at));await click(b,'#cell-'+idx(action.at));}
      const version=last.version+1;for(const peer of browsers)await wait(peer,`__qaMatch?.version===${version}`);
      const pair=await Promise.all(browsers.map(snapshot));assert.deepEqual(pair[0].snapshot,pair[1].snapshot);assert.equal(pair[0].version,version);
      const event=pair[0].event;report.actions[actor][event.type==='flip'?'flip':event.captured?'capture':'move']++;last=pair[0];
      if(ply===1){
        await navigate(B,local);await wait(B,`document.querySelector('#board').dataset.owner==='online'&&__qaMatch?.version===${version}`);
        check('Guest reload restores identity, seat and exact version',(await B.evaluate(`import('./js/online-auth.mjs').then(m=>m.onlineAuth.ensureIdentity()).then(u=>u.id)`))===ids[1]);
      }
      if(ply===3){
        await B.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await B.evaluate(`window.dispatchEvent(new Event('offline'))`);
        const before=await B.evaluate('__qaApi.mutations');await click(B,'#cell-0');check('Offline input cannot submit',await B.evaluate('__qaApi.mutations')===before);
        await B.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await B.evaluate(`window.dispatchEvent(new Event('online'))`);
        await wait(B,`!document.querySelector('#bot-status').textContent.includes('đồng bộ')`);check('Reconnect preserves same server board',JSON.stringify((await snapshot(B)).snapshot)===JSON.stringify(last.snapshot));
      }
      if(ply%5===0){save();console.log(JSON.stringify({version:last.version,actions:report.actions}));}
    }
    check('Each seat flips, moves and captures through board UI',report.actions.every(a=>Object.values(a).every(Boolean)));
    for(const b of browsers){await navigate(b,local);await wait(b,`document.querySelector('#board').dataset.owner==='online'&&__qaMatch?.version===${last.version}`);}
    check('Both profiles reload same committed version',true);
    for(const [width,height]of [[390,844],[800,360],[844,390],[1366,768]]){
      await A.send('Emulation.setTouchEmulationEnabled',{enabled:width<1000});await A.send('Emulation.setDeviceMetricsOverride',{width,height,mobile:width<1000,deviceScaleFactor:1});await A.evaluate('new Promise(r=>setTimeout(r,250))');
      check('Live board fits '+width+'x'+height,await A.evaluate(`document.querySelectorAll('.cell').length===32&&document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('.cell')].every(c=>{let r=c.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;})`));
    }
    report.browserErrors=browsers.map(b=>b.errors.map(e=>({method:e.method,consoleType:e.params?.type,text:e.params?.entry?.text,exception:e.params?.exceptionDetails?.text})));
    check('No JavaScript exceptions or resource 404',browsers.every(b=>!b.errors.some(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'||/status of 404/.test(e.params?.entry?.text??''))));
    report.finalVersion=last.version;report.finalStatus=last.snapshot.status;report.resultByEngine=last.snapshot.result;
    report.apiCalls=await Promise.all(browsers.map(b=>b.evaluate('__qaApi')));report.profiles=browsers.map(b=>b.output);report.result='PASS';save();
    console.log(JSON.stringify({result:report.result,checks:report.checks.length,version:last.version,status:last.snapshot.status,evidence:file}));
    if(process.argv.includes('--hold-public')){
      // Stop polling while waiting for a reviewed, successful Pages build.
      for(const b of browsers)await b.evaluate(`window.dispatchEvent(new Event('pagehide'))`);
      console.log('Waiting for .local-qa/r5-02b/release-ready.json');
      let release;const end=Date.now()+900000;
      while(Date.now()<end){if(fs.existsSync('.local-qa/r5-02b/release-ready.json')){release=JSON.parse(fs.readFileSync('.local-qa/r5-02b/release-ready.json','utf8'));break;}await new Promise(r=>setTimeout(r,1000));}
      assert.ok(release?.commit,'Public verification release marker');const base='https://vesperkrock.github.io/banqi-game/';
      for(const b of browsers){
        // QA identity stays in RAM and browser storage, never in stdout/report/files.
        const session=await b.evaluate(`localStorage.getItem('banqi-online-auth-v1')`);
        const script=await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`if(location.origin==='https://vesperkrock.github.io')localStorage.setItem('banqi-online-auth-v1',${JSON.stringify(session)});`});
        await navigate(b,base);check('Public normal URL has no Online module/API',await b.evaluate(`!document.querySelector('#online-lobby')&&!performance.getEntriesByType('resource').some(r=>/online-|supabase|esm.sh/.test(r.name))`));
        await navigate(b,base+'?onlinePreview=1');await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:script.identifier});
        await wait(b,`document.querySelector('#board').dataset.owner==='online'&&__qaMatch?.version===${last.version}`);
      }
      const pair=await Promise.all(browsers.map(snapshot));assert.deepEqual(pair[0].snapshot,pair[1].snapshot);assert.deepEqual(pair[0].snapshot,last.snapshot);
      const {execFileSync}=require('node:child_process');
      for(const f of ['js/offline.mjs','js/effects.mjs','js/online-auth.mjs','js/online-lobby.mjs','js/online-match.mjs']){
        const r=await fetch(base+f+'?v='+release.commit);assert.equal(r.status,200);assert.equal(createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),createHash('sha256').update(execFileSync('git',['show',release.commit+':'+f])).digest('hex'));
      }
      check('Pages preview restores both real seats and committed board',true);report.public={result:'PASS',commit:release.commit,url:base,assets:5};save();console.log(JSON.stringify({public:report.public,evidence:file}));
    }
  }catch(e){report.result='PARTIAL';report.failedCheck=e.message.split('\n')[0];report.profiles=browsers.map(b=>b.output);
    report.diagnostics=[];for(const b of browsers)report.diagnostics.push(await b.evaluate(`({owner:document.querySelector('#board')?.dataset.owner,status:document.querySelector('#online-status')?.textContent,matchStatus:document.querySelector('#online-match-status')?.textContent,version:window.__qaMatch?.version,api:window.__qaApi})`).catch(()=>({unavailable:true})));
    save();console.log(JSON.stringify({result:'PARTIAL',failedCheck:report.failedCheck,diagnostics:report.diagnostics,evidence:file}));process.exitCode=1;}
  finally{for(const b of browsers)await b.close();}
})().catch(()=>{console.error('Live client initialization failed');process.exitCode=1;});
