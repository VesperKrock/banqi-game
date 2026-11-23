const test = require('node:test');
const assert = require('node:assert/strict');
const launch = require('./helpers/chrome.cjs');
const at = s => (Number(s[1])-1)*8+'abcdefgh'.indexOf(s[0]);
const move = (from,to) => ({type:'move',from,to});
function fixture(entries={b2:['red','rook'],c2:['black','pawn'],h4:['black','rook'],d3:['red','pawn',true]}) {
  const board=Array(32).fill(null),captured=[];
  for(const [s,[color,type,faceDown=false]] of Object.entries(entries)) board[at(s)]={color,type,faceDown};
  for(const color of ['red','black'])for(const [type,count] of Object.entries({general:1,advisor:2,elephant:2,rook:2,horse:2,cannon:2,pawn:5}))
    for(let n=board.filter(p=>p?.color===color&&p.type===type).length;n<count;n++)captured.push({color,type});
  return {board,captured,turn:0,playerColors:['red','black'],status:'playing',result:null,noProgressPly:0,positionCounts:{}};
}
test('Pointer drag: real mouse/touch, engine actions, cancellation and accessibility', {timeout:120000}, async t=>{
  const b=await launch({suite:'r4-drag'});t.after(()=>b.close());const {evaluate:e,send}=b;
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.pointerTrace=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture','gotpointercapture','scroll','blur'])window.addEventListener(type,e=>window.pointerTrace.push([type,e.pointerId,e.target.id,document.querySelectorAll('.drag-ghost').length]),true)`});
  const settle=()=>e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const click=s=>e(`document.querySelector(${JSON.stringify(s)}).click()`);
  const view=()=>e('({state:window.__qaState,actions:window.__qaActions})');
  let touch=false;
  const viewport=async(w,h)=>{touch=w<1000;await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:touch});await send('Emulation.setTouchEmulationEnabled',{enabled:touch});await settle();};
  const load=async(state=fixture())=>{b.useGame(state,{observe:true,starts:2});await b.navigate();await settle();};
  const point=s=>e(`(()=>{const r=document.querySelector('#cell-${at(s)}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  const input=async(type,p)=>touch?send('Input.dispatchTouchEvent',{type:{down:'touchStart',move:'touchMove',up:'touchEnd',cancel:'touchCancel'}[type],touchPoints:['up','cancel'].includes(type)?[]:[{...p,id:1}]}):send('Input.dispatchMouseEvent',{type:{down:'mousePressed',move:'mouseMoved',up:'mouseReleased'}[type],...p,button:'left',buttons:type==='up'?0:1,clickCount:type==='move'?0:1});
  const begin=async(from,to)=>{const a=await point(from),z=typeof to==='string'?await point(to):to;await input('down',a);await input('move',{x:(a.x+z.x)/2,y:(a.y+z.y)/2});await input('move',z);return z;};
  const drop=async(from,to)=>{const p=await begin(from,to);await input('up',p);await settle();};
  const clean=async()=>assert.equal(await e("document.querySelectorAll('.drag-ghost,.drag-source,.drag-over,.drag-legal,.drag-invalid,.drag-risk').length"),0);
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const [w,h] of [[1366,768],[390,844],[844,390]]) {
    await t.test(`${w}x${h}: tap, select, move/capture once, invalid and hidden/enemy gestures`,async()=>{
      await viewport(w,h);await load();
      const p=await point('d3');await input('down',p);await input('up',p);await settle();
      assert.deepEqual((await view()).actions,[{type:'flip',at:'d3'}]);
      await load();const a=await point('b2');await input('down',a);await input('move',{x:a.x+2,y:a.y});await input('up',{x:a.x+2,y:a.y});
      assert.equal((await view()).actions.length,0);assert.equal(await e("document.querySelector('#cell-9').getAttribute('aria-pressed')"),'true');
      const z=await point('b3');await input('down',z);await input('up',z);await settle();assert.deepEqual((await view()).actions,[move('b2','b3')]);
      for(const target of ['b3','c2']) {await load();await drop('b2',target);assert.deepEqual((await view()).actions,[move('b2',target)],JSON.stringify(await e('window.pointerTrace')));await clean();}
      for(const [from,to] of [['b2','b2'],['b2','e2'],['b2',{x:2,y:2}],['d3','d2'],['c2','c1'],['a1','a2']]) {
        await load();const before=await view();if(from===to){const z=await begin(from,'b3');await input('move',await point(from));await input('up',await point(from));}else await drop(from,to);
        assert.deepEqual(await view(),before);await clean();
      }
      assert.equal(await e("getComputedStyle(document.querySelector('#cell-9')).touchAction"),'none');
      assert.notEqual(await e("getComputedStyle(document.querySelector('#cell-19')).touchAction"),'none');
    });
  }
  await t.test('Cancellation keeps complete public engine state, warning and selection',async()=>{
    await viewport(1366,768);
    for(const reason of ['escape','blur','visibility','theme','manual','auto-resize','lost-capture','new-game','mode']) {
      await load();await click('#cell-9');const before=await view();const z=await begin('b2','b3');
      assert.equal(await e("document.querySelectorAll('.drag-ghost').length"),1);
      if(reason==='escape') await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      if(reason==='blur') await e("window.dispatchEvent(new Event('blur'))");
      if(reason==='visibility') await e("document.dispatchEvent(new Event('visibilitychange'))");
      if(reason==='theme') await click('button[data-theme=dark]');
      if(reason==='manual') await click('[data-orientation=vertical]');
      if(reason==='auto-resize') {await send('Emulation.setDeviceMetricsOverride',{width:700,height:900,deviceScaleFactor:1,mobile:false});await settle();}
      if(reason==='lost-capture') await e("document.querySelector('#cell-9').releasePointerCapture(1)");
      if(reason==='new-game') await click('#new-game');
      if(reason==='mode') await e("document.querySelector('#game-mode').value='solo';document.querySelector('#game-mode').dispatchEvent(new Event('change'))");
      await input('up',z);await settle();await clean();assert.deepEqual(await view(),reason==='new-game'||reason==='mode'?{...before,actions:[]}:before,reason);
      await viewport(1366,768);
    }
  });
  await t.test('Touch cancel, second finger and off-piece page scrolling',async()=>{
    await viewport(390,844);await load();const before=await view();await begin('b2','b3');await input('cancel');await clean();assert.deepEqual(await view(),before);
    const z=await begin('b2','b3');await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...z,id:1},{x:z.x+50,y:z.y,id:2}]});await input('up');await settle();await clean();assert.deepEqual(await view(),before);
    await viewport(320,568);await e('window.scrollTo(0,0)');await input('down',{x:3,y:500});await input('move',{x:3,y:300});await input('move',{x:3,y:100});await input('up');await settle();assert.ok(await e('scrollY>0'));assert.deepEqual(await view(),before);
  });
  await t.test('Cancel before threshold cannot become a stale tap; rules still come from engine',async()=>{
    await viewport(1366,768);await load();const p=await point('d3');const before=await view();await input('down',p);await click('button[data-orientation=vertical]');await input('up',p);await settle();assert.deepEqual(await view(),before);
    for(const [entries,from,to,accepted] of [
      [{a1:['red','cannon'],b1:['red','pawn',true],d1:['black','rook'],h4:['black','pawn']},'a1','d1',true],
      [{a1:['red','cannon'],b1:['black','rook'],h4:['black','pawn']},'a1','b1',false],
      [{a1:['red','pawn'],b1:['black','general']},'a1','b1',true],
      [{a1:['red','general'],b1:['black','pawn']},'a1','b1',false]]) {
      await load(fixture(entries));const before=await view();await drop(from,to);if(accepted)assert.deepEqual((await view()).actions,[move(from,to)]);else assert.deepEqual(await view(),before);await clean();
    }
  });
  await t.test('Keyboard, normal animation lock and one SFX per accepted drop',async()=>{
    await viewport(1366,768);await load();await e("document.querySelector('#cell-9').focus()");
    for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:type==='keyDown'?'\r':undefined});
    assert.equal(await e("document.querySelector('#cell-9').getAttribute('aria-pressed')"),'true');
    await e("window.audioPlays=0;HTMLMediaElement.prototype.play=function(){window.audioPlays++;return Promise.resolve()};if(document.querySelector('#sound-toggle').getAttribute('aria-pressed')==='false')document.querySelector('#sound-toggle').click()");await drop('b2','c2');assert.equal(await e('window.audioPlays'),1);
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await load();await drop('b2','b3');const before=await view();await drop('h4','h3');assert.deepEqual(await view(),before);await clean();
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  });
  await t.test('Chase warning before release, technical loss dialog and finished lock',async()=>{
    const {applyAction}=await import('../js/engine.mjs');let state=fixture({b2:['red','general'],c3:['black','advisor']});
    const loop=[move('b2','c2'),move('c3','b3'),move('c2','b2'),move('b3','c3')];for(let p=0;p<26;p++)state=applyAction(state,state.turn,loop[p%4]).state;
    await load(state);const before=await view();const z=await begin('c2','b2');assert.match(await e("document.querySelector('#drag-notice').textContent"),/lỗi 2\/2 và xử thua/);assert.deepEqual(await view(),before);
    const rect=await e("(()=>{const a=document.querySelector('#drag-notice').getBoundingClientRect(),b=document.querySelector('#board').getBoundingClientRect();return a.bottom<=b.top})()");assert.equal(rect,true);
    await input('up',z);await settle();assert.equal((await view()).state.result.reason,'chase_technical_fouls');assert.equal(await e("document.querySelector('#result-dialog').open"),true);await click('#result-close');const finished=await view();await drop('b2','c2');assert.deepEqual(await view(),finished);await clean();
  });
  await t.test('Solo Bot turn cannot start drag or tap',async()=>{
    await load();await e("document.querySelector('#game-mode').value='solo';document.querySelector('#game-mode').dispatchEvent(new Event('change'))");
    await send('Emulation.setCPUThrottlingRate',{rate:6});await drop('b2','b3');assert.equal(await e("document.querySelector('#cell-31').classList.contains('drag-ready')"),false);
    const z=await begin('h4','h3');assert.equal(await e("document.querySelectorAll('.drag-ghost').length"),0);await input('up',z);await send('Emulation.setCPUThrottlingRate',{rate:1});
    await e("new Promise((resolve,reject)=>{let n=0;const poll=()=>window.__qaActions.length>=2?resolve():n++>400?reject(Error('bot timeout')):setTimeout(poll,10);poll()})");assert.equal((await view()).actions.length,2);await clean();
  });
  await t.test('No browser errors',()=>assert.deepEqual(b.errors,[]));
});
