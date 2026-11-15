"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const launch=require('./helpers/chrome.cjs');
const {fixture,seeded,scenarios}=require('./helpers/bot-fixtures.cjs');

test('Chrome R4 Solo — Worker, fairness, lifecycle and UI', {timeout:120000}, async t=>{
 const b=await launch({suite:'r4-solo',basePath:'/banqi/'});t.after(()=>b.close());
 const {send,evaluate:e}=b;const E=await import('../js/engine.mjs');
 const click=s=>e(`document.querySelector(${JSON.stringify(s)}).click()`);
 const text=s=>e(`document.querySelector(${JSON.stringify(s)}).textContent`);
 const settle=()=>e(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
 const wait=condition=>e(`new Promise((resolve,reject)=>{const start=performance.now();function poll(){if(${condition})resolve(true);else if(performance.now()-start>6000)reject(Error('UI wait: '+${JSON.stringify(condition)}));else setTimeout(poll,10);}poll();})`);
 const viewport=async(w,h)=>{await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<1000});await settle();};
 const mode=value=>e(`document.querySelector('#game-mode').value='${value}';document.querySelector('#game-mode').dispatchEvent(new Event('change'))`);
 const view=()=>e(`({board:[...document.querySelectorAll('.cell')].map(c=>c.getAttribute('aria-label')),status:document.querySelector('#game-status').textContent,colors:document.querySelector('#player-colors').textContent})`);
 let injection=null;
 async function fake(enabled=true){
  if(injection){await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection});injection=null;}
  const code=enabled?`window.workers=[];window.Worker=class{constructor(url,options){this.url=String(url);this.options=options;window.workers.push(this);}postMessage(data){this.data=structuredClone(data);}terminate(){this.terminated=true;}};`:`window.workers=[];const NativeWorker=Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);window.workers.push(this);}};`;
  injection=(await send('Page.addScriptToEvaluateOnNewDocument',{source:code+`window.audioPlays=[];const NativeAudio=Audio;window.Audio=class extends NativeAudio{play(){window.audioPlays.push(this.src);return super.play();}};`})).identifier;
 }
 async function load(state,options={}){b.useGame(state,{starts:2,...options});await b.navigate();await settle();}
 const reply=(action,index=-1,extra={})=>e(`(()=>{const w=window.workers.at(${index}),d=w.data;w.onmessage({data:{type:'result',requestId:d.requestId,session:d.session,position:d.position,action:${JSON.stringify(action)},...${JSON.stringify(extra)}}});})()`);
 const botWin=()=>fixture({a1:['black','cannon'],d1:['black','pawn'],h1:['red','general']},1);
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await fake(false);
 await t.test('Default local mode creates no Worker and remains default after reload',async()=>{
  await load(E.createGame({firstPlayer:0,random:seeded(2)}));assert.equal(await e(`document.querySelector('#game-mode').value`),'local');assert.equal(await e('window.workers.length'),0);
  await mode('solo');await b.navigate();assert.equal(await e(`document.querySelector('#game-mode').value`),'local');
 });
 for(const color of ['red','black'])await t.test('Human first '+color+': real Worker replies once, colors/names/public DOM/SFX correct',async()=>{
  const initial=E.createGame({firstPlayer:0,random:seeded(23)}),i=initial.board.findIndex(p=>p.color===color);[initial.board[0],initial.board[i]]=[initial.board[i],initial.board[0]];
  await load(initial);await mode('solo');assert.match(await text('#game-status'),/^Lượt Bạn/);assert.equal(await e('window.workers.length'),0);
  await click('#cell-0');await wait(`document.querySelector('#game-status').textContent.startsWith('Lượt Bạn')`);
  assert.equal(await e(`document.querySelectorAll('#board img:not([src="./assets/pieces/back.svg"])').length`),2);
  assert.match(await text('#player-colors'),new RegExp(color==='red'?'Bạn: Đỏ · Bot: Đen':'Bạn: Đen · Bot: Đỏ'));
  assert.equal(await e('window.workers.length'),1);assert.equal(await e('window.audioPlays.length'),2);
  assert.equal(await e(`['privateState','publicState','publicHistory','botSeed'].some(key=>key in window)`),false);
  assert.equal(await e(`[...document.querySelectorAll('.cell')].filter(c=>c.getAttribute('aria-label').startsWith('Quân úp')).some(c=>/red|black|general|pawn|visibleId/.test(c.outerHTML))`),false);
 });
 await t.test('Bot starts randomly as Player 2; no forced color, input blocked until actual reply',async()=>{
  await load(E.createGame({firstPlayer:1,random:seeded(9)}));await mode('solo');await wait(`document.querySelector('#game-status').textContent.startsWith('Lượt Bạn')`);
  assert.equal(await e(`document.querySelectorAll('#board img:not([src="./assets/pieces/back.svg"])').length`),1);
  assert.match(await text('#player-colors'),/Bạn: (Đỏ|Đen) · Bot: (Đỏ|Đen)/);
 });
 await fake();
 await t.test('While thinking: clicks blocked; layout/theme/rules/sound remain active; payload public only',async()=>{
  await load(E.createGame({firstPlayer:1,random:seeded(8)}));await mode('solo');const before=await view();
  for(let i=0;i<20;i++)await click('#cell-'+i);
  await click('[data-theme=dark]');await click('[data-orientation=vertical]');await click('#sound-toggle');await viewport(390,844);await click('#rules-toggle');
  assert.deepEqual(await view(),before);assert.equal(await e(`document.querySelector('#rules-panel').matches(':popover-open')`),true);
  await click('#rules-panel .close-panel');
  const payload=await e('window.workers[0].data');assert.equal(payload.type,'choose');assert.equal(payload.input.snapshot.turn,1);
  for(const p of payload.input.snapshot.board)assert.deepEqual(p,{occupied:true,faceDown:true});
  assert.deepEqual(Object.keys(payload.input).sort(),['history','legal','seed','snapshot']);assert.equal(payload.input.history.events.length,0);
  assert.equal(await e(`document.querySelectorAll('.cell[aria-disabled=true]').length`),32);
  await reply(payload.input.legal[0]);await wait(`document.querySelector('#game-status').textContent.startsWith('Lượt Bạn')`);
  assert.equal(await e(`document.querySelectorAll('.cell[aria-disabled=true]').length`),0);
 });
 await t.test('Cancel/accept mode change midgame, stale reply cannot cross modes',async()=>{
  await load(E.createGame({firstPlayer:0,random:seeded(3)}));await mode('solo');await click('#cell-0');const before=await view();
  let opened=b.waitForEvent('Page.javascriptDialogOpening'),changed=mode('local');await opened;await send('Page.handleJavaScriptDialog',{accept:false});await changed;
  assert.equal(await e(`document.querySelector('#game-mode').value`),'solo');assert.deepEqual(await view(),before);
  opened=b.waitForEvent('Page.javascriptDialogOpening');changed=mode('local');await opened;await send('Page.handleJavaScriptDialog',{accept:true});await changed;
  const reset=await view();await reply({type:'flip',at:'b1'});await settle();assert.deepEqual(await view(),reset);
  assert.equal(await e(`document.querySelector('#game-mode').value`),'local');assert.equal(await e('window.workers[0].terminated'),true);
 });
 await t.test('New game cancels pending Bot; 30 stale replies never apply a move',async()=>{
  await load(E.createGame({firstPlayer:1,random:seeded(8)}),{starts:40});await mode('solo');
  for(let i=0;i<30;i++){await click('#new-game');const before=await view();await reply({type:'flip',at:'a1'},i);assert.deepEqual(await view(),before);assert.equal(await e(`window.workers[${i}].terminated`),true);}
 });
 await t.test('Actual 2.8 s watchdog: responsive UI, safe fallback wins, no deadlock',async()=>{
  await viewport(1366,768);await load(botWin());await e(`window.frames=0;function frame(){window.frames++;requestAnimationFrame(frame)}requestAnimationFrame(frame)`);
  const start=performance.now();await mode('solo');await wait(`document.querySelector('#result-dialog').open`);const elapsed=performance.now()-start;
  assert.ok(elapsed>=2700&&elapsed<3300,String(elapsed));assert.ok(await e('window.frames')>20);assert.match(await text('#result-message'),/^Bot thắng/);assert.equal(await e('window.workers[0].terminated'),true);
  t.diagnostic('Real watchdog wall ms: '+Math.round(elapsed));
 });
 await t.test('Engine rejects Bot action: recoverable retry, one later valid move, no reset',async()=>{
  await load(botWin(),{reject:1});await mode('solo');const before=await view();await reply({type:'move',from:'a1',to:'h1'});
  await wait(`!document.querySelector('#bot-retry').hidden`);assert.deepEqual(await view(),before);assert.match(await text('#bot-status'),/Thử lại/);
  await click('#bot-retry');await reply({type:'move',from:'a1',to:'h1'});await wait(`document.querySelector('#result-dialog').open`);assert.match(await text('#result-message'),/^Bot thắng/);
  assert.equal(await e('window.workers.length'),2);
 });
 await t.test('Results use Bạn/Bot, no extra Bot turn after human win or chase loss',async()=>{
  await load(fixture({a1:['red','cannon'],d1:['red','pawn'],h1:['black','general']}));await mode('solo');await click('#cell-0');await click('#cell-7');assert.match(await text('#result-message'),/^Bạn thắng/);assert.equal(await e('window.workers.length'),0);
  const chase=(await scenarios()).find(s=>s.name==='chase-26');await load(chase.state);await mode('solo');await click('#cell-10');assert.match(await text('#chase-status'),/Bạn \(Đỏ\)/);await click('#cell-9');assert.match(await text('#result-message'),/^Bot \(Đen\) thắng — Bạn \(Đỏ\) thua/);assert.equal(await e('window.workers.length'),0);
  const draw=fixture({a1:['red','pawn'],e1:['black','pawn']},1);draw.noProgressPly=59;
  await load(draw);await mode('solo');await reply({type:'move',from:'e1',to:'f1'});await wait(`document.querySelector('#result-dialog').open`);
  assert.match(await text('#result-message'),/^Hòa — 60/);assert.equal(await e('window.workers.length'),1);
 });
 await t.test('Worker unavailable: fast legal fallback keeps Solo usable',async()=>{
  await load(botWin());await e(`window.Worker=class{constructor(){throw new Error('Unsupported module Worker')}}`);await mode('solo');
  await wait(`document.querySelector('#result-dialog').open`);assert.match(await text('#result-message'),/^Bot thắng/);
  assert.equal(await e(`document.querySelector('#game-mode').value`),'solo');
 });
 for(const [w,h] of [[1366,768],[320,568],[390,844],[844,390]])await t.test(`Solo layout ${w}×${h}: two themes, Auto/manual, no horizontal overflow`,async()=>{
  await viewport(w,h);await load(E.createGame({firstPlayer:0,random:seeded(8)}));await mode('solo');
  for(const theme of ['light','dark'])for(const direction of ['auto','horizontal','vertical']){
   await click(`[data-theme=${theme}]`);await click(`[data-orientation=${direction}]`);await settle();
   const metrics=await e(`({overflow:document.documentElement.scrollWidth>innerWidth,bottom:document.querySelector('#board-shell').getBoundingClientRect().bottom,header:document.querySelector('.app-header').getBoundingClientRect().bottom})`);
   assert.equal(metrics.overflow,false,JSON.stringify(metrics));if(direction==='auto'&&(w>=1000||w>h))assert.ok(metrics.bottom<=h,JSON.stringify(metrics));
  }
  await click('[data-orientation=auto]');if(w===1366||w===390)await b.screenshot('solo-'+w);
 });
 await fake(false);
 await t.test('Real Bot avoids second chase foul, preserving existing faults',async()=>{
  let initial=fixture({b2:['red','general'],c3:['black','advisor'],h1:['red','rook'],f4:['black','pawn']},1);initial.playerColors=['black','red'];
  const loop=[['b2','c2'],['c3','b3'],['c2','b2'],['b3','c3']];
  for(let i=0;i<26;i++){const [from,to]=loop[i%4];initial=E.applyAction(initial,initial.turn,{type:'move',from,to}).state;}
  assert.deepEqual(initial.chaseFaults,[0,1]);await load(initial);await mode('solo');await wait(`document.querySelector('#game-status').textContent.startsWith('Lượt Bạn')`);
  assert.match(await text('#chase-status'),/Bot \(Đỏ\): lỗi trường tróc 1\/2/);assert.equal(await e(`document.querySelector('#result-dialog').open`),false);
 });
 await t.test('Fast real Bot reply during SVG animation cancels safely without extra move/SFX',async()=>{
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await viewport(1366,768);
  await load(E.createGame({firstPlayer:0,random:seeded(20)}));await mode('solo');
  if(await e(`document.querySelector('#sound-toggle').getAttribute('aria-pressed')`)==='false')await click('#sound-toggle');
  await click('#cell-0');await wait(`document.querySelector('#game-status').textContent.startsWith('Lượt Bạn') && !document.querySelector('#board').dataset.animating`);
  assert.equal(await e(`document.querySelectorAll('.motion-back').length+document.getAnimations().length`),0);
  assert.equal(await e('window.audioPlays.length'),2);assert.equal(await e(`document.querySelectorAll('#board .piece-pending').length`),0);
 });
 await t.test('No unexpected browser errors',()=>assert.deepEqual(b.errors,[]));
 fs.writeFileSync(path.join(b.output,'solo-report.json'),JSON.stringify({errors:b.errors,browser:(await send('Browser.getVersion')).product},null,2));t.diagnostic('Evidence: '+b.output);
});
