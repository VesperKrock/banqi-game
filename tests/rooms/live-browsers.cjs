// Three independent real Chrome profiles, real SDK/Auth/Edge/Postgres. No mocks.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const launch=require('../helpers/chrome.cjs');
(async()=>{
  assert.ok(process.argv.includes('--live'),'Explicit --live required');
  const browsers=[],report={phase:'R5-01 browsers',checks:[],viewports:[]};
  const check=(name,ok)=>{assert.ok(ok,name);report.checks.push(name);};
  const wait=(b,condition)=>b.evaluate(`new Promise((resolve,reject)=>{const start=performance.now();function poll(){if(document.querySelector('#online-lobby')&&(${condition}))return resolve();if(performance.now()-start>8500)return reject(Error('Browser condition timeout'));setTimeout(poll,30);}poll();})`);
  const click=(b,id)=>b.evaluate(`document.querySelector(${JSON.stringify('#online-'+id)}).click()`);
  const text=(b,id)=>b.evaluate(`document.querySelector(${JSON.stringify('#online-'+id)}).textContent`);
  const navigate=async(b,url)=>{const loaded=b.waitForEvent('Page.loadEventFired');await b.send('Page.navigate',{url});await loaded;};
  const confirm=async b=>{const opened=b.waitForEvent('Page.javascriptDialogOpening'),clicked=click(b,'leave');await opened;await b.send('Page.handleJavaScriptDialog',{accept:true});await clicked;};
  const join=async(b,code)=>{await b.evaluate(`document.querySelector('#online-code-input').value=${JSON.stringify(code)};document.querySelector('#online-code-input').dispatchEvent(new Event('input'));document.querySelector('#online-join-form').requestSubmit();`);};
  try{
    const A=await launch({suite:'r5-live-a',port:8080});browsers.push(A);
    const B=await launch({suite:'r5-live-b'});browsers.push(B);
    const C=await launch({suite:'r5-live-c'});browsers.push(C);
    const url='http://127.0.0.1:8080/?onlinePreview=1';
    for(const b of browsers){await navigate(b,url);await wait(b,`document.querySelector('#online-create')&&!document.querySelector('#online-create').disabled`);}
    const ids=await Promise.all(browsers.map(b=>b.evaluate(`import('./js/online-auth.mjs').then(m=>m.onlineAuth.ensureIdentity()).then(u=>u.id)`)));
    check('Three real independent anonymous browser identities',new Set(ids).size===3);
    await click(A,'create');await wait(A,`!document.querySelector('#online-room').hidden`);
    const code=await text(A,'code');check('Host sees six digits and cancel action',/^\d{6}$/.test(code)&&(await text(A,'leave'))==='Hủy phòng');
    await join(B,code.slice(0,3)+' '+code.slice(3));
    await wait(B,`document.querySelector('#online-room-state').textContent.includes('Đã đủ 2 người')`);
    await wait(A,`document.querySelector('#online-room-state').textContent.includes('Đã đủ 2 người')`);
    check('A and B see both seats after polling',(await text(B,'leave'))==='Rời phòng'&&(await text(A,'seat-1')).includes('(Bạn)')&&(await text(B,'seat-2')).includes('(Bạn)'));
    await join(C,code);await wait(C,`document.querySelector('#online-status').textContent.includes('Phòng đã đủ người')`);
    check('Third browser cannot enter or see room',await C.evaluate(`document.querySelector('#online-room').hidden`));
    await navigate(B,url);await wait(B,`!document.querySelector('#online-room').hidden`);
    check('Guest reload restores same UID and seat',await B.evaluate(`import('./js/online-auth.mjs').then(m=>m.onlineAuth.ensureIdentity()).then(u=>u.id===${JSON.stringify(ids[1])})`));
    check('Reload shows original code',(await text(B,'code'))===code);
    await B.evaluate(`dispatchEvent(new Event('offline'))`);
    await B.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    check('Offline state is visible and mutations disabled',(await text(B,'status')).includes('Mất mạng')&&await B.evaluate(`document.querySelector('#online-leave').disabled`));
    await B.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await B.evaluate(`dispatchEvent(new Event('online'))`);await wait(B,`!document.querySelector('#online-leave').disabled`);
    check('Reconnect preserves guest seat',(await text(B,'code'))===code&&(await text(B,'seat-2')).includes('(Bạn)'));
    await confirm(B);await wait(B,`document.querySelector('#online-room').hidden`);
    await wait(A,`document.querySelector('#online-seat-2').textContent.includes('Đang chờ')`);
    check('Guest leave frees seat for host',true);
    await join(B,code);await wait(B,`!document.querySelector('#online-room').hidden`);await wait(A,`document.querySelector('#online-room-state').textContent.includes('Đã đủ 2 người')`);
    for(const [width,height] of [[390,844],[800,360],[1366,768]]){
      await A.send('Emulation.setTouchEmulationEnabled',{enabled:width<1000});
      await A.send('Emulation.setDeviceMetricsOverride',{width,height,mobile:width<1000,deviceScaleFactor:1});
      await A.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      check(`Lobby fits ${width}x${height}`,await A.evaluate(`(()=>{const d=document.querySelector('#online-lobby'),r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&d.scrollWidth<=d.clientWidth+1})()`));
      await A.screenshot(`lobby-${width}x${height}`);report.viewports.push(`${width}x${height}`);
    }
    await click(A,'close');await A.evaluate(`document.querySelector('#cell-0').click()`);await A.evaluate('new Promise(r=>setTimeout(r,450))');
    const signature=await A.evaluate(`JSON.stringify([...document.querySelectorAll('.cell')].map(c=>c.getAttribute('aria-label')))`);
    await A.evaluate(`document.querySelector('#help-panel .online-preview-open').click()`);await wait(A,`!document.querySelector('#online-leave').disabled`);
    await confirm(A);await wait(A,`document.querySelector('#online-room').hidden`);await wait(B,`document.querySelector('#online-room').hidden`);
    check('Host cancellation reaches both browsers',true);
    await wait(C,`!document.querySelector('#online-join').disabled`);await join(C,code);
    await wait(C,`document.querySelector('#online-status').textContent.includes('Mã không hợp lệ')`);
    check('Cancelled code cannot be reused',true);
    await click(A,'close');check('Offline position survives lobby open/close/cancel',await A.evaluate(`JSON.stringify([...document.querySelectorAll('.cell')].map(c=>c.getAttribute('aria-label')))===${JSON.stringify(signature)}`));
    const jsErrors=browsers.flatMap(b=>b.errors).filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled');
    check('No JavaScript exceptions',jsErrors.length===0);
    report.expectedHttpErrors=[404,409];report.result='PASS';report.profiles=browsers.map(b=>b.output);
  }catch(error){
    report.result='PARTIAL';report.failedCheck=error.message.split('\n')[0];process.exitCode=1;
    report.diagnostics=[];
    for(const b of browsers){report.diagnostics.push(await b.evaluate(`({status:document.querySelector('#online-status')?.textContent,
      roomHidden:document.querySelector('#online-room')?.hidden,open:document.querySelector('#online-lobby')?.open,
      visible:document.visibilityState,sessionStored:!!localStorage.getItem('banqi-online-auth-v1')})`).catch(()=>({unavailable:true})));}
  }
  finally{
    report.profiles=browsers.map(b=>b.output);
    for(const b of browsers)await b.close();
    const file=path.resolve(`.local-qa/r5-01/live-browsers-${Date.now()}.json`);fs.writeFileSync(file,JSON.stringify(report,null,2));
    console.log(JSON.stringify({result:report.result,checks:report.checks.length,failedCheck:report.failedCheck,evidence:file}));
  }
})().catch(()=>{console.error('Browser gate initialization failed');process.exitCode=1;});
