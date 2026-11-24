const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const launch=require('./helpers/chrome.cjs');
const {fixture,move}=require('./helpers/bot-fixtures.cjs');
test('Soul fade capture: committed public state, real Worker, decoded SVG and cancellation', {timeout:120000},async t=>{
 const b=await launch({suite:'r4-capture'});t.after(()=>b.close());const {evaluate:e,send}=b,E=await import('../js/engine.mjs');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`
 window.soulFrames=[];window.captureTimes=[];window.audioPlays=[];window.workerTimes=[];
 const NativeWorker=Worker;window.Worker=class extends NativeWorker{constructor(...a){super(...a);this.addEventListener('message',()=>workerTimes.push({type:'result',at:performance.now()}))}postMessage(...a){workerTimes.push({type:'request',at:performance.now()});super.postMessage(...a)}};
 HTMLMediaElement.prototype.play=function(){audioPlays.push(this.src);return Promise.resolve()};
 document.addEventListener('DOMContentLoaded',()=>{new MutationObserver(()=>captureTimes.push({kind:document.querySelector('#board').dataset.animating??null,at:performance.now()})).observe(document.querySelector('#board'),{attributes:true,attributeFilter:['data-animating']});});
 function sample(){const s=document.querySelector('.motion-soul');if(s){const c=getComputedStyle(s),f=s.querySelector('.piece-fallback');soulFrames.push({at:performance.now(),opacity:Number(c.opacity),transform:c.transform,visible:c.visibility!=='hidden',unicode:c.visibility!=='hidden'&&f&&getComputedStyle(f).display!=='none',pending:s.classList.contains('piece-pending'),src:s.querySelector('img')?.getAttribute('src')});}requestAnimationFrame(sample)}requestAnimationFrame(sample);
 `});
 const wait=condition=>e(`new Promise((resolve,reject)=>{const start=performance.now();const poll=()=>${condition}?resolve():performance.now()-start>5000?reject(Error('capture wait timeout')):setTimeout(poll,5);poll()})`);
 const idle=()=>wait("!document.querySelector('#board').dataset.animating");
 const click=s=>e(`document.querySelector(${JSON.stringify(s)}).click()`);
 const state=()=>e('window.__qaState');
 const reduced=value=>send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value}]});
 const viewport=async(w,h)=>{await send('Emulation.setTouchEmulationEnabled',{enabled:w<1000});await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<1000});};
 const human=()=>fixture({a1:['red','rook'],b1:['black','pawn'],h4:['black','rook']});
 const load=async(s=human())=>{b.useGame(s,{observe:true,starts:2});await b.navigate();await wait("!document.querySelector('#board .piece-pending')");};
 const capture=()=>e("document.querySelector('#cell-0').click();document.querySelector('#cell-1').click()");
 const clean=async()=>assert.deepEqual(await e("({souls:document.querySelectorAll('.motion-soul,.motion-back').length,animations:document.getAnimations().length,busy:document.querySelector('#board').dataset.animating??null,hidden:[...document.querySelectorAll('#board .piece')].filter(p=>p.style.visibility).length})"),{souls:0,animations:0,busy:null,hidden:0});
 const samples=[];
 for(const [w,h] of [[1366,768],[390,844],[844,390]])await t.test(`${w}x${h}: human capture floats/fades, exact state now, one SFX`,async()=>{
   await viewport(w,h);await reduced('no-preference');const initial=human();await load(initial);await capture();
   await wait("document.querySelector('.motion-soul')?.style.visibility === ''");
   const shown=await e("(()=>{const s=document.querySelector('.motion-soul');return {src:s.querySelector('img').getAttribute('src'),hidden:s.getAttribute('aria-hidden'),hit:getComputedStyle(s).pointerEvents,parent:s.parentElement.tagName,duration:s.getAnimations()[0].effect.getTiming().duration,turn:document.querySelector('#game-status').textContent,feedback:document.querySelector('#compact-notice').textContent}})()");
   assert.equal(shown.src,'./assets/pieces/black/pawn.svg');assert.equal(shown.hidden,'true');assert.equal(shown.hit,'none');assert.equal(shown.parent,'BODY');assert.ok(shown.duration>=250&&shown.duration<=450);assert.match(shown.turn,/Người 2/);assert.match(shown.feedback,/ăn Tốt Đen/);
   const expected=E.getPublicState(E.applyAction(initial,0,move('a1','b1')).state);assert.deepEqual(await state(),expected);await click('#cell-31');assert.equal(await e('window.__qaActions.length'),1);
   await idle();await clean();assert.deepEqual(await state(),expected);assert.equal(await e('audioPlays.length'),1);
   const frames=await e('soulFrames');assert.ok(frames.filter(f=>f.visible).length>=5);assert.ok(frames.some(f=>f.visible&&f.opacity<.7));assert.ok(frames.every(f=>!f.unicode&&(!f.visible||!f.pending)));assert.ok(new Set(frames.filter(f=>f.visible).map(f=>f.transform)).size>2);samples.push({w,h,shown,frames});
 });
 await t.test('Real Bot capture is presented after immediate application; no fake thinking wait',async()=>{
   await viewport(844,390);const initial=fixture({a1:['black','rook'],b1:['red','pawn'],h4:['red','rook']},1);await load(initial);
   await e("document.querySelector('#game-mode').value='solo';document.querySelector('#game-mode').dispatchEvent(new Event('change'))");
   await wait("document.querySelector('#board').dataset.animating==='capture' && document.querySelector('.motion-soul')?.style.visibility === ''");
   assert.equal(await e("document.querySelector('.motion-soul img').getAttribute('src')"),'./assets/pieces/red/pawn.svg');assert.match(await e("document.querySelector('#action-feedback').textContent"),/Bot.*ăn Tốt Đỏ/);
   assert.deepEqual(await state(),E.getPublicState(E.applyAction(initial,1,move('a1','b1')).state));assert.equal(await e('window.__qaActions.length'),1);
   const timing=await e("({result:workerTimes.find(t=>t.type==='result').at,start:captureTimes.find(t=>t.kind==='capture').at})");assert.ok(timing.start-timing.result<100,'apply/presentation happens in the Worker result task');await idle();await clean();assert.equal(await e('audioPlays.length'),1);samples.push({bot:true,timing,frames:await e('soulFrames')});
 });
 await t.test('Reduced motion: minimal fade, no flight; non-capture still immediate',async()=>{
   await reduced('reduce');await load();await capture();await wait("document.querySelector('.motion-soul')?.style.visibility === ''");
   const animation=await e("(()=>{const a=document.querySelector('.motion-soul').getAnimations()[0];return {duration:a.effect.getTiming().duration,frames:a.effect.getKeyframes()}})()");assert.ok(animation.duration>0&&animation.duration<=90);assert.ok(animation.frames.every(f=>!f.transform.includes('18px')&&!f.transform.includes('scale')));assert.match(animation.frames.at(-1).transform,/0px/);await idle();await clean();
   const quiet=fixture({a1:['red','rook'],h4:['black','rook']});await load(quiet);await capture();await clean();assert.equal(await e('window.__qaActions.length'),1);
 });
 await t.test('Winning Bot capture is visible before the result dialog; cancel/reset cannot reopen stale results',async()=>{
   await viewport(800,360);await reduced('no-preference');
   for(const ending of ['finish','resize','new-game']) {
     const initial=fixture({a1:['black','cannon'],d1:['black','pawn'],h1:['red','general']},1);await load(initial);await e("document.querySelector('#game-mode').value='solo';document.querySelector('#game-mode').dispatchEvent(new Event('change'))");
     await wait("document.querySelector('#board').dataset.animating==='capture' && document.querySelector('.motion-soul')?.style.visibility === ''");assert.equal((await state()).status,'finished');assert.equal(await e("document.querySelector('#result-dialog').open"),false);assert.equal(await e("document.querySelector('.motion-soul img').getAttribute('src')"),'./assets/pieces/red/general.svg');
     if(ending==='resize')await viewport(390,844);
     if(ending==='new-game')await click('#new-game');
     await idle();await e('new Promise(r=>setTimeout(r,420))');await clean();
     assert.equal(await e("document.querySelector('#result-dialog').open"),ending!=='new-game');
     if(ending==='new-game')assert.equal(await e("document.querySelector('#board').textContent"),'?'.repeat(32));else assert.match(await e("document.querySelector('#result-message').textContent"),/^Bot thắng/);
   }
 });
 for(const reason of ['resize','rotate','theme','visibility','new-game','mode','reduced'])await t.test(`Cancel capture: ${reason}, no resurrected piece or stale callback`,async()=>{
   await viewport(1366,768);await reduced('no-preference');const initial=human();await load(initial);await capture();await wait("!!document.querySelector('.motion-soul')");
   if(reason==='resize')await viewport(844,390);
   if(reason==='rotate')await click('button[data-orientation=vertical]');
   if(reason==='theme')await click('button[data-theme=dark]');
   if(reason==='visibility')await e("document.dispatchEvent(new Event('visibilitychange'))");
   if(reason==='new-game')await e("window.confirm=()=>true;document.querySelector('#new-game').click()");
   if(reason==='mode')await e("window.confirm=()=>true;document.querySelector('#game-mode').value='solo';document.querySelector('#game-mode').dispatchEvent(new Event('change'))");
   if(reason==='reduced')await reduced('reduce');
   await e('new Promise(r=>setTimeout(r,420))');await clean();const expected=reason==='new-game'||reason==='mode'?initial:E.applyAction(initial,0,move('a1','b1')).state;assert.deepEqual(await state(),E.getPublicState(expected));
 });
 await t.test('Delayed victim SVG decode stays neutral; cancel prevents any late reappearance',async()=>{
   await reduced('no-preference');await load();await e("const decode=HTMLImageElement.prototype.decode;window.releaseSoul=null;HTMLImageElement.prototype.decode=function(){return this.closest('.motion-soul')?new Promise(resolve=>window.releaseSoul=()=>decode.call(this).then(resolve)):decode.call(this)}");await capture();assert.equal(await e("getComputedStyle(document.querySelector('.motion-soul')).visibility"),'hidden');await click('button[data-orientation=vertical]');await e('window.releaseSoul()');await e('new Promise(r=>setTimeout(r,420))');await clean();assert.deepEqual(await state(),E.getPublicState(E.applyAction(human(),0,move('a1','b1')).state));
 });
 await t.test('A new public event cancels the old capture without delaying the next Worker request',async()=>{
   // Hold only the test Worker's response so the exact transition is inspectable.
   const {identifier}=await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.fakeWorker=null;window.Worker=class{constructor(){fakeWorker=this}postMessage(data){this.data=data;this.requestedAt=performance.now()}terminate(){}}"});
   try{await load();await e("document.querySelector('#game-mode').value='solo';document.querySelector('#game-mode').dispatchEvent(new Event('change'))");await capture();assert.ok(await e("!!fakeWorker.data && document.querySelector('#board').dataset.animating==='capture'"));
     await e("const w=fakeWorker,d=w.data,a=d.input.legal.find(a=>a.type==='move');w.onmessage({data:{type:'result',requestId:d.requestId,session:d.session,position:d.position,action:a}})");assert.equal(await e('window.__qaActions.length'),2);assert.equal(await e("document.querySelectorAll('.motion-soul').length"),0);await idle();await clean();
   }finally{await send('Page.removeScriptToEvaluateOnNewDocument',{identifier});}
 });
 await t.test('No console/network errors',()=>assert.deepEqual(b.errors,[]));fs.writeFileSync(path.join(b.output,'capture-report.json'),JSON.stringify(samples,null,2));t.diagnostic(b.output);
});
