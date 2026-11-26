const test=require('node:test'),assert=require('node:assert/strict');
const launch=require('../helpers/chrome.cjs'),{fixture}=require('../helpers/bot-fixtures.cjs');
const ROOM='22222222-2222-4222-8222-222222222222';
test('Online board lease: real DOM/input, committed effects, restore and viewports',{timeout:120000},async t=>{
  const E=await import('../../js/engine.mjs'),{publicSnapshot}=await import('../../supabase/functions/banqi-match/engine-adapter.mjs');
  const initial=fixture({b2:['red','rook'],c2:['black','pawn'],h4:['black','rook'],d3:['red','pawn',true]});
  const result=E.applyAction(initial,0,{type:'move',from:'b2',to:'c2'});
  const m=(state,version=0,event=null)=>({roomId:ROOM,player:0,version,snapshot:publicSnapshot(state),event});
  const b=await launch({suite:'r5-02b-client-ui'}),e=b.evaluate;t.after(()=>b.close());
  b.useGame(initial,{observe:true,starts:10});
  const wait=condition=>e(`new Promise((resolve,reject)=>{const start=performance.now();function poll(){if(${condition})return resolve();if(performance.now()-start>9000)return reject(Error('UI wait: '+${JSON.stringify(condition)}));setTimeout(poll,20);}poll();})`);
  const click=s=>e(`document.querySelector(${JSON.stringify(s)}).click()`);
  const settle=()=>e('new Promise(r=>setTimeout(r,450))');
  await b.navigate();const base=await e('location.href');
  await t.test('Normal URL loads no Online module/Auth; Offline move baseline',async()=>{
    assert.equal(await e(`performance.getEntriesByType('resource').some(r=>/online-|supabase|esm.sh/.test(r.name))`),false);
    await click('#cell-9');await click('#cell-17');assert.equal(await e('__qaActions.length'),1);
  });
  await b.send('Fetch.enable',{patterns:[{urlPattern:'*js/online-auth.mjs',requestStage:'Request'}]});
  const paused=b.waitForEvent('Fetch.requestPaused'),loaded=b.waitForEvent('Page.loadEventFired');
  await b.send('Page.navigate',{url:base+'?onlinePreview=1'});await loaded;const interception=await paused;
  const mock=`window.qaMatch=null;window.qaCalls=[];window.qaRole='host';window.qaNext=${JSON.stringify(m(initial))};
    export const onlineAuth={ensureIdentity:async()=>({id:'11111111-1111-4111-8111-111111111111'}),
    roomAction:async()=>({ok:true,room:{roomId:'${ROOM}',code:'004215',role:qaRole,seats:[true,true],lobbyStatus:'full',revision:1,expiresAt:new Date(Date.now()+1200000).toISOString()}}),
    matchAction:async body=>{qaCalls.push(structuredClone(body));if(body.op==='start')qaMatch=structuredClone(qaNext);
      if(body.op==='act')return new Promise(resolve=>{window.qaAccept=()=>{qaMatch=structuredClone(qaNext);resolve({ok:true,match:structuredClone(qaMatch)});};});
      return {ok:true,match:structuredClone(qaMatch)};}};`;
  await b.send('Fetch.fulfillRequest',{requestId:interception.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(mock).toString('base64')});await b.send('Fetch.disable');
  await wait(`document.querySelector('#online-start')&&!document.querySelector('#online-start').disabled`);
  await t.test('Guest cannot start; host full lobby can; keyboard/Escape leave lobby intact',async()=>{
    await e(`qaRole='guest';document.querySelector('#online-retry').click()`);await wait(`document.querySelector('#online-start').hidden`);
    assert.match(await e(`document.querySelector('#online-room-state').textContent`),/chủ phòng/);
    await e(`qaRole='host';document.querySelector('#online-retry').click()`);await wait(`!document.querySelector('#online-start').disabled`);
    await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await wait(`!document.querySelector('#online-lobby').open`);
  });
  await click('#cell-9');await click('#cell-17');await settle();
  const offline=await e('JSON.stringify(__qaState)'),labels=await e(`JSON.stringify([...document.querySelectorAll('.cell')].map(c=>c.title))`);
  await click('#help-panel .online-preview-open');await wait(`!document.querySelector('#online-start').disabled`);await click('#online-start');
  await wait(`document.querySelector('#board').dataset.owner==='online'&&!document.querySelector('#online-lobby').open`);
  await t.test('Online lease isolates local engine, locks New game/mode; hidden cell contains no identity',async()=>{
    assert.equal(await e('JSON.stringify(__qaState)'),offline);assert.equal(await e(`document.querySelector('#new-game').disabled&&document.querySelector('#game-mode').disabled`),true);
    assert.equal(await e(`document.querySelector('#cell-19').title`),'Quân úp tại d3');
    assert.ok(!/red|black|pawn|cannon|horse/.test(await e(`document.querySelector('#cell-19').outerHTML`)));
    await click('#new-game');await e(`document.querySelector('#game-mode').value='solo';document.querySelector('#game-mode').dispatchEvent(new Event('change'))`);
    assert.equal(await e('JSON.stringify(__qaState)'),offline);
  });
  await t.test('Keyboard selection and ARIA use the same Online input boundary',async()=>{
    await wait(`document.querySelector('#cell-9').getAttribute('aria-disabled')==='false'`);
    await e(`document.querySelector('#cell-9').focus()`);
    assert.equal(await e('document.activeElement.id'),'cell-9');
    for(const pressed of ['true','false']){
      await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
      await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      assert.equal(await e(`document.querySelector('#cell-9').getAttribute('aria-pressed')`),pressed);
    }
    assert.equal(await e(`qaCalls.filter(c=>c.op==='act').length`),0);
  });
  for(const [width,height]of [[390,844],[800,360],[844,390],[1366,768]])await t.test(`Online viewport ${width}x${height}: all cells, axes and no scroll`,async()=>{
    await b.send('Emulation.setTouchEmulationEnabled',{enabled:width<1000});await b.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1000});await settle();
    assert.equal(await e(`document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('.cell')].every(c=>{const r=c.getBoundingClientRect();return r.top>=0&&r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1})`),true);
    assert.equal(await e(`document.querySelectorAll('#axis-bottom>*').length+document.querySelectorAll('#axis-left>*').length`),12);
  });
  const point=at=>e(`(()=>{const r=document.querySelector('#cell-${(Number(at[1])-1)*8+'abcdefgh'.indexOf(at[0])}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await t.test('Touch Drag queues exactly one request, never optimistic; capture animates only after commit',async()=>{
    await b.send('Emulation.setTouchEmulationEnabled',{enabled:true});await b.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,mobile:true,deviceScaleFactor:1});await settle();
    await e(`qaNext=${JSON.stringify(m(result.state,1,result.event))}`);const a=await point('b2'),z=await point('c2');
    await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
    await b.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:(a.x+z.x)/2,y:a.y,id:1}]});
    await b.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...z,id:1}]});
    await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(`qaCalls.some(c=>c.op==='act')`);
    await click('#cell-10');assert.equal(await e(`qaCalls.filter(c=>c.op==='act').length`),1);assert.match(await e(`document.querySelector('#cell-10').title`),/Tốt Đen/);
    assert.equal(await e(`document.querySelectorAll('.motion-soul').length`),0);
    await e('qaAccept()');await wait(`document.querySelector('#board').dataset.animating==='capture'`);
    assert.equal(await e(`document.querySelectorAll('.motion-soul').length`),1);assert.equal(await e('JSON.stringify(__qaState)'),offline);
    await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,mobile:true,deviceScaleFactor:1});await settle();
    assert.equal(await e(`document.querySelectorAll('.motion-soul,.drag-ghost').length`),0);assert.match(await e(`document.querySelector('#cell-10').title`),/Xe Đỏ/);
  });
  await t.test('Wrong turn, offline and late responses never mutate; resume renders fresh server board',async()=>{
    const n=await e('qaCalls.length');await click('#cell-19');assert.equal(await e('qaCalls.length'),n);
    await e(`window.dispatchEvent(new Event('offline'))`);assert.match(await e(`document.querySelector('#bot-status').textContent`),/Mất mạng/);
    assert.match(await e(`document.querySelector('#game-status').textContent`),/Mất mạng/);
    await click('#cell-19');assert.equal(await e('qaCalls.length'),n);await e(`window.dispatchEvent(new Event('online'))`);await settle();
    assert.equal(await e('JSON.stringify(__qaState)'),offline);
  });
  await t.test('Return Offline restores exact local game; polls stop; returning Online restores match',async()=>{
    const opened=b.waitForEvent('Page.javascriptDialogOpening'),clicked=click('#online-return');await opened;await b.send('Page.handleJavaScriptDialog',{accept:true});await clicked;
    assert.equal(await e('JSON.stringify(__qaState)'),offline);assert.equal(await e(`JSON.stringify([...document.querySelectorAll('.cell')].map(c=>c.title))`),labels);
    assert.equal(await e(`document.querySelector('#board').dataset.owner`),undefined);const n=await e('qaCalls.length');await e('new Promise(r=>setTimeout(r,3200))');assert.equal(await e('qaCalls.length'),n);
    await click('#help-panel .online-preview-open');await wait(`document.querySelector('#board').dataset.owner==='online'`);assert.match(await e(`document.querySelector('#cell-10').title`),/Xe Đỏ/);
  });
  await t.test('Final capture waits for Soul Fade; reduced motion and repeated snapshot never replay',async()=>{
    // A public fixture delivered by mock transport, no production setup API.
    const finalInitial=fixture({a1:['red','pawn'],b1:['black','general']});const final=E.applyAction(finalInitial,0,{type:'move',from:'a1',to:'b1'});
    await e(`qaMatch=${JSON.stringify(m(finalInitial,5))};document.querySelector('#help-panel .online-preview-open').click()`);await wait(`document.querySelector('#cell-0').title.includes('Tốt Đỏ')`);await settle();
    await e(`qaNext=${JSON.stringify(m(final.state,6,final.event))}`);await click('#cell-0');await click('#cell-1');await wait(`typeof qaAccept==='function'`);await e('qaAccept()');
    await wait(`document.querySelector('#board').dataset.animating==='capture'`);assert.equal(await e(`document.querySelector('#result-dialog').open`),false);
    await wait(`document.querySelector('#result-dialog').open`);assert.match(await e(`document.querySelector('#result-message').textContent`),/thắng/);
    await click('#result-close');await e(`document.querySelector('#help-panel .online-preview-open').click()`);await settle();assert.equal(await e(`document.querySelector('#result-dialog').open`),false);
    await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await e(`qaMatch=${JSON.stringify(m(finalInitial,9))};document.querySelector('#help-panel .online-preview-open').click()`);await wait(`document.querySelector('#cell-0').title.includes('Tốt Đỏ')`);
    await e(`qaNext=${JSON.stringify(m(final.state,10,final.event))}`);await click('#cell-0');await click('#cell-1');await e('qaAccept()');await e('new Promise(r=>setTimeout(r,160))');assert.equal(await e(`document.querySelectorAll('.motion-soul').length`),0);
  });
  await t.test('Server chase warning stays visible and layout/theme controls submit no moves',async()=>{
    const scenarios=await require('../helpers/bot-fixtures.cjs').scenarios();
    const chase=scenarios.find(s=>s.name==='chase-26');assert.ok(chase.snapshot.chase.warnings.length);
    await click('#result-close');await e(`qaMatch=${JSON.stringify(m(chase.state,15))};document.querySelector('#help-panel .online-preview-open').click()`);
    await wait(`document.querySelector('#chase-status').textContent.includes('Cảnh báo')`);
    const a=chase.snapshot.chase.warnings[0].action,at=(Number(a.from[1])-1)*8+'abcdefgh'.indexOf(a.from[0]);
    await click('#cell-'+at);assert.ok(await e(`document.querySelectorAll('.chase-marker').length>0`));
    const n=await e(`qaCalls.filter(c=>c.op==='act').length`);
    await click('[data-theme=dark]');await click('[data-orientation=vertical]');await settle();
    assert.equal(await e(`qaCalls.filter(c=>c.op==='act').length`),n);assert.match(await e(`document.querySelector('#chase-status').textContent`),/Cảnh báo/);
  });
  assert.deepEqual(b.errors,[]);
});
