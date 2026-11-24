const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const launch=require('./helpers/chrome.cjs');
const at=s=>(Number(s[1])-1)*8+'abcdefgh'.indexOf(s[0]);
const move=(from,to)=>({type:'move',from,to});
function fixture(entries={b2:['red','rook'],c2:['black','pawn'],h4:['black','rook'],d3:['red','pawn',true]}) {
 const board=Array(32).fill(null),captured=[];for(const [s,[color,type,faceDown=false]] of Object.entries(entries))board[at(s)]={color,type,faceDown};
 for(const color of ['red','black'])for(const [type,count] of Object.entries({general:1,advisor:2,elephant:2,rook:2,horse:2,cannon:2,pawn:5}))for(let n=board.filter(p=>p?.color===color&&p.type===type).length;n<count;n++)captured.push({color,type});
 return {board,captured,turn:0,playerColors:['red','black'],status:'playing',result:null,noProgressPly:0,positionCounts:{}};
}
test('Mobile Board First: viewport bounds, controls, warnings and preserved game', {timeout:120000},async t=>{
 const b=await launch({suite:'r4-mobile'});t.after(()=>b.close());const {evaluate:e,send}=b;const layouts=[];
 const settle=()=>e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const viewport=async(w,h,touch=w<1000)=>{await send('Emulation.setTouchEmulationEnabled',{enabled:touch});await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:touch});await settle();};
 const load=async(state=fixture())=>{b.useGame(state,{observe:true,starts:2});await b.navigate();await settle();};
 const click=s=>e(`document.querySelector(${JSON.stringify(s)}).click()`);
 const key=async(key,code,n)=>{for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:n,...(type==='keyDown'&&key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});};
 const view=()=>e('({state:window.__qaState,actions:window.__qaActions,selected:[...document.querySelectorAll(".is-selected")].map(c=>c.id)})');
 const geometry=()=>e(`(()=>{const v=visualViewport;const rect=e=>{const r=e.getBoundingClientRect();return {id:e.id||e.textContent,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return {compact:document.documentElement.dataset.compact,v:{x:v.offsetLeft,y:v.offsetTop,width:v.width,height:v.height,scale:v.scale},scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],orientation:document.querySelector('#board').dataset.orientation,small:document.documentElement.dataset.smallCells,cells:[...document.querySelectorAll('.cell')].map(rect),axes:[...document.querySelectorAll('.axis span')].map(rect),controls:[...document.querySelectorAll('.board-tools>button')].filter(e=>getComputedStyle(e).display!=='none').map(rect),overflow:getComputedStyle(document.documentElement).overflow,board:rect(document.querySelector('#board-shell')),notice:rect(document.querySelector('.message-dock'))}})()`);
 const fits=async(safe={top:0,left:0,right:0,bottom:0},scroll=true)=>{
   const g=await geometry();assert.equal(g.cells.length,32);assert.equal(g.controls.length,3);assert.equal(g.compact,'true');assert.notEqual(g.overflow,'hidden');
   for(const r of [...g.cells,...g.axes,...g.controls]){assert.ok(r.width>0&&r.height>0);assert.ok(r.x>=g.v.x+safe.left-1&&r.y>=g.v.y+safe.top-1&&r.right<=g.v.x+g.v.width-safe.right+1&&r.bottom<=g.v.y+g.v.height-safe.bottom+1,JSON.stringify({r,g}));}
   if(scroll){assert.ok(g.scroll[0]<=g.v.width+1,JSON.stringify(g));assert.ok(g.scroll[1]<=g.v.height+1,JSON.stringify(g));}
   assert.ok(g.board.bottom<=g.notice.y+1 || g.board.right<=g.notice.x+1,'stable notice area outside board');
   const notices=await e("[...document.querySelectorAll('.app-header h1,#game-status,#compact-notice,.message-dock>button:not([hidden])')].map(e=>{const r=e.getBoundingClientRect();return {text:e.textContent,x:r.x,y:r.y,right:r.right,bottom:r.bottom}})");
   for(const r of notices){assert.ok(r.x>=g.v.x+safe.left-1&&r.y>=g.v.y+safe.top-1&&r.right<=g.v.x+g.v.width-safe.right+1&&r.bottom<=g.v.y+g.v.height-safe.bottom+1,JSON.stringify(r));assert.ok(r.right<=g.board.x+1||r.x>=g.board.right-1||r.bottom<=g.board.y+1||r.y>=g.board.bottom-1,'status must not cover the board');}
   return g;
 };
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 for(const [w,h] of [[320,568],[360,640],[390,844],[440,956],[844,390],[956,440],[800,360],[1366,768],[1920,1080]])for(const theme of ['light','dark'])await t.test(`${w}x${h} ${theme}: real DOM bounds`,async()=>{
   await viewport(w,h);await load();await click(`button[data-theme=${theme}]`);await settle();
   if(w<1000){const g=await fits();assert.equal(g.orientation,w>h?'horizontal':'vertical');assert.ok(g.cells[0].width>=32);layouts.push({w,h,theme,...g});assert.equal(await e("document.querySelector('#game-mode').parentElement.id"),'settings-body');
     if(w>h){const oldCell={844:62.75,956:75.25,800:55.25}[w];assert.ok(g.cells[0].width>=oldCell*1.2,'at least 20% larger cells than UX02 landscape');}
   }
   else {assert.equal(await e('document.documentElement.dataset.compact'),'false');assert.equal(await e("document.querySelector('#game-mode').parentElement.className"),'app-header');assert.equal(await e("getComputedStyle(document.querySelector('.piece-reference')).display"),'block');assert.equal(await e("getComputedStyle(document.querySelector('#settings-toggle')).display"),'none');assert.ok(await e("document.querySelector('#board-shell').getBoundingClientRect().bottom<=innerHeight"));}
   if(theme==='light'&&[320,390,956,1366].includes(w))await b.screenshot(`board-first-${w}`);
 });
 await t.test('Initial unassigned turn and all 32 concealed pieces fit landscape',async()=>{
   for(const [w,h] of [[800,360],[844,390],[956,440]]){await viewport(w,h);await load(null);await fits();assert.match(await e("document.querySelector('#game-status').textContent"),/Lật quân đầu/);}
 });
 await t.test('Safe area, browser-height changes, zoom remains available',async()=>{
   // CDP env override: https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setSafeAreaInsetsOverride
   for(const [w,h,insets] of [[390,744,{top:47,bottom:34,left:0,right:0}],[956,340,{top:0,bottom:21,left:47,right:47}]]) {
     await viewport(w,h);await send('Emulation.setSafeAreaInsetsOverride',{insets});await load();await fits(insets);await click('#settings-toggle');
     const r=await e("(()=>{const r=document.querySelector('#settings-panel').getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}})()");assert.ok(r.top>=insets.top&&r.bottom<=h-insets.bottom&&r.left>=insets.left&&r.right<=w-insets.right);await key('Escape','Escape',27);
   }
   await send('Emulation.setSafeAreaInsetsOverride',{insets:{}});await viewport(390,844);await load();const before=await view();await send('Emulation.setPageScaleFactor',{pageScaleFactor:2});await settle();await fits(undefined,false);assert.deepEqual(await view(),before);assert.equal(await e('visualViewport.scale'),2);assert.equal(await e('document.documentElement.dataset.smallCells'),'true');assert.match(await e("getComputedStyle(document.querySelector('#board-status'),'::after').content"),/Ô nhỏ/);await send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await settle();
 });
 await t.test('Same controls, sheets, keyboard/focus, internal scroll; 60 orientation changes preserve state',async()=>{
   await viewport(390,844);await load();await click('#cell-9');const before=await view();
   await e("window.controls=[document.querySelector('#game-mode'),document.querySelector('#sound-toggle'),document.querySelector('#new-game')]");
   for(const [button,panel] of [['#settings-toggle','#settings-panel'],['#rules-toggle','#rules-panel'],['[popovertarget=help-panel]','#help-panel']]) {
     await e(`document.querySelector('${button}').focus()`);await key('Enter','Enter',13);assert.equal(await e(`document.querySelector('${panel}').matches(':popover-open')`),true);await key('Escape','Escape',27);assert.equal(await e(`document.activeElement===document.querySelector('${button}')`),true);assert.deepEqual(await view(),before);
   }
   await click('#rules-toggle');await e("document.querySelector('#rules-panel').scrollTop=500");assert.ok(await e("document.querySelector('#rules-panel').scrollTop>0"));await key('Escape','Escape',27);await fits();
   for(let i=0;i<30;i++){
     await viewport(390,844);await click('[data-orientation=auto]');await fits();
     await viewport(956,440);await fits();assert.deepEqual(await view(),before);assert.equal(await e("[...document.querySelectorAll('.cell')].every((c,i)=>c===window.originalCells[i])"),true);
   }
   for(const mode of ['vertical','horizontal','auto']){await click(`[data-orientation=${mode}]`);await settle();await fits();assert.deepEqual(await view(),before);}
   await viewport(1366,768,false);await viewport(390,844);await fits();assert.equal(await e("window.controls.every(el=>document.querySelector('#'+el.id)===el)&&new Set([...document.querySelectorAll('[id]')].map(e=>e.id)).size===document.querySelectorAll('[id]').length"),true);
   await viewport(956,440,false);assert.equal(await e('document.documentElement.dataset.compact'),'false','short desktop is not mobile');
 });
 await t.test('Warnings readable before click/drag, do not cover board, and result win/draw remain accessible',async()=>{
   const {applyAction}=await import('../js/engine.mjs');let state=fixture({b2:['red','general'],c3:['black','advisor']});const loop=[move('b2','c2'),move('c3','b3'),move('c2','b2'),move('b3','c3')];for(let p=0;p<26;p++)state=applyAction(state,state.turn,loop[p%4]).state;
   for(const [w,h] of [[320,568],[956,440]]){
     await viewport(w,h);await load(state);const g=await fits();await click('#cell-10');assert.match(await e("document.querySelector('#compact-notice').textContent"),/lỗi 2\/2 — xử thua/);assert.equal(await e("document.querySelector('#chase-panel').matches(':popover-open')"),false);assert.equal(await e("document.querySelector('#chase-toggle').getAttribute('aria-expanded')"),'false');assert.deepEqual((await geometry()).board,g.board);
     await click('#chase-toggle');assert.equal(await e("document.querySelector('#chase-panel').matches(':popover-open')"),true);await click('#chase-close');await settle();assert.equal(await e('document.activeElement.id'),'chase-toggle');
     const pt=idx=>e(`(()=>{const r=document.querySelector('#cell-${idx}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);const a=await pt(10),z=await pt(9);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[z]});assert.match(await e("document.querySelector('#drag-notice').textContent"),/lỗi 2\/2 và xử thua/);assert.ok(await e("(()=>{const a=document.querySelector('#drag-notice').getBoundingClientRect(),b=document.querySelector('#board-shell').getBoundingClientRect();return a.top>=b.bottom || a.left>=b.right})()"));await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();assert.equal((await view()).state.result.reason,'chase_technical_fouls');assert.equal(await e("document.querySelector('#result-dialog').open"),true);await click('#result-close');await fits();await click('#result-toggle');assert.equal(await e("document.querySelector('#result-dialog').open"),true);
   }
   const draw=fixture({a1:['red','pawn'],h4:['black','pawn']});draw.noProgressPly=59;await load(draw);await click('#cell-0');await click('#cell-1');assert.equal((await view()).state.result.outcome,'draw');assert.equal(await e("document.querySelector('#result-dialog').open"),true);
 });
 await t.test('Solo settings do not cancel Worker; new game/mode still require confirmation',async()=>{
   await viewport(390,844);await load();await click('#settings-toggle');await e("document.querySelector('#game-mode').value='solo';document.querySelector('#game-mode').dispatchEvent(new Event('change'))");await key('Escape','Escape',27);await click('#cell-9');await click('#cell-17');
   for(let i=0;i<3;i++){await click('#settings-toggle');await key('Escape','Escape',27);}
   await e("new Promise((resolve,reject)=>{let n=0;const poll=()=>window.__qaActions.length>=2?resolve():n++>400?reject(Error('bot timeout')):setTimeout(poll,10);poll()})");assert.equal((await view()).actions.length,2);await fits();const before=await view();await e('window.confirmCount=0;window.confirm=()=>{confirmCount++;return false}');await click('#settings-toggle');await click('#new-game');await e("document.querySelector('#game-mode').value='local';document.querySelector('#game-mode').dispatchEvent(new Event('change'))");assert.equal(await e('window.confirmCount'),2);assert.deepEqual(await view(),before);assert.equal(await e("document.querySelector('#game-mode').value"),'solo');await key('Escape','Escape',27);
 });
 await t.test('No browser errors',()=>assert.deepEqual(b.errors,[]));fs.writeFileSync(path.join(b.output,'layout-report.json'),JSON.stringify(layouts,null,2));t.diagnostic(b.output);
});
