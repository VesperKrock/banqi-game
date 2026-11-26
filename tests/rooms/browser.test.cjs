const test=require('node:test'),assert=require('node:assert/strict');
const launch=require('../helpers/chrome.cjs');
test('Preview-only lobby: keyboard, mobile, lifecycle and existing Offline state', {timeout:60000},async t=>{
  const b=await launch({suite:'r5-rooms-ui'});t.after(()=>b.close());const e=b.evaluate;
  const wait=condition=>e(`new Promise((resolve,reject)=>{const start=performance.now();function poll(){if(${condition})return resolve();if(performance.now()-start>10000)return reject(Error('UI wait'));setTimeout(poll,20);}poll();})`);
  await b.navigate();const base=await e('location.href');
  await t.test('Default page has no lobby, module or SDK requests',async()=>{
    assert.equal(await e(`document.querySelector('#online-lobby')`),null);
    assert.equal(await e(`performance.getEntriesByType('resource').some(r=>/online-|supabase|esm.sh/.test(r.name))`),false);
  });
  // Only the QA browser intercepts Auth. Production has no mock/test endpoint.
  await b.send('Fetch.enable',{patterns:[{urlPattern:'*js/online-auth.mjs',requestStage:'Request'}]});
  const paused=b.waitForEvent('Fetch.requestPaused'),loaded=b.waitForEvent('Page.loadEventFired');
  await b.send('Page.navigate',{url:base+'?onlinePreview=1'});await loaded;
  const interception=await paused;
  const mock=`let room=null;window.qaRoomRequests=[];export const onlineAuth={ensureIdentity:async()=>({id:'11111111-1111-4111-8111-111111111111'}),
    roomAction:async(body)=>{window.qaRoomRequests.push(structuredClone(body));
    if(body.action==='create')room={roomId:'22222222-2222-4222-8222-222222222222',code:'004215',role:'host',seats:[true,false],lobbyStatus:'waiting',revision:0,expiresAt:new Date(Date.now()+1200000).toISOString()};
    if(body.action==='cancel')room=null;return {ok:true,room};},matchAction:async()=>({ok:true,match:null})};`;
  await b.send('Fetch.fulfillRequest',{requestId:interception.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(mock).toString('base64')});
  await b.send('Fetch.disable');await wait(`document.querySelector('#online-create')&&!document.querySelector('#online-create').disabled`);
  await t.test('Preview label, focus and Escape close restore game controls',async()=>{
    assert.match(await e(`document.querySelector('#online-lobby').textContent`),/Chơi Online thử nghiệm/);
    assert.equal(await e(`document.querySelector('#online-lobby').contains(document.activeElement)`),true);
    await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await wait(`!document.querySelector('#online-lobby').open`);
    assert.equal(await e(`document.activeElement.getAttribute('popovertarget')`),'help-panel');
  });
  const signature=()=>e(`JSON.stringify([...document.querySelectorAll('.cell')].map(c=>c.getAttribute('aria-label')))`);
  await e(`document.querySelector('#cell-0').click()`);await e('new Promise(r=>setTimeout(r,450))');const before=await signature();
  await e(`document.querySelector('#help-panel .online-preview-open').click()`);await wait(`!document.querySelector('#online-create').disabled`);
  await t.test('Create/copy button and six-digit code keep leading zero',async()=>{
    await e(`document.querySelector('#online-create').click()`);await wait(`!document.querySelector('#online-room').hidden`);
    assert.equal(await e(`document.querySelector('#online-code').textContent`),'004215');
    assert.equal(await e(`document.querySelector('#online-copy').disabled`),false);
    assert.equal(await e(`document.querySelector('#online-leave').textContent`),'Hủy phòng');
  });
  for(const [width,height] of [[390,844],[800,360],[1366,768]])await t.test(`Lobby viewport ${width}x${height} and board state`,async()=>{
    await b.send('Emulation.setTouchEmulationEnabled',{enabled:width<1000});
    await b.send('Emulation.setDeviceMetricsOverride',{width,height,mobile:width<1000,deviceScaleFactor:1});
    await e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    assert.ok(await e(`(()=>{const d=document.querySelector('#online-lobby'),r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&d.scrollWidth<=d.clientWidth+1})()`));
    assert.equal(await signature(),before);
  });
  await t.test('Close stops polling and leaves all 32 cells usable without scroll',async()=>{
    await e(`document.querySelector('#online-close').click()`);const n=await e('qaRoomRequests.length');
    await e('new Promise(r=>setTimeout(r,3400))');assert.equal(await e('qaRoomRequests.length'),n);
    await b.send('Emulation.setTouchEmulationEnabled',{enabled:true});
    await b.send('Emulation.setDeviceMetricsOverride',{width:800,height:360,mobile:true,deviceScaleFactor:1});
    await e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    assert.equal(await signature(),before);assert.equal(await e(`document.querySelectorAll('.cell').length`),32);
    const dimensions=await e(`({h:innerHeight,w:innerWidth,sh:document.documentElement.scrollHeight,sw:document.documentElement.scrollWidth,compact:document.documentElement.dataset.compact})`);
    assert.ok(dimensions.sh<=dimensions.h&&dimensions.sw<=dimensions.w,JSON.stringify(dimensions));
  });
  assert.deepEqual(b.errors,[]);
});
