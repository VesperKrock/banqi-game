"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const launchChrome = require('./helpers/chrome.cjs');
const at = s => (Number(s[1]) - 1) * 8 + 'abcdefgh'.indexOf(s[0]);
const move = (from, to) => ({type:'move', from, to});
function fixture(entries) {
  const board = Array(32).fill(null), captured = [];
  for (const [s, [color, type, faceDown = false]] of Object.entries(entries)) board[at(s)] = {color,type,faceDown};
  for (const color of ['red','black']) for (const [type, count] of Object.entries({general:1,advisor:2,elephant:2,rook:2,horse:2,cannon:2,pawn:5})) {
    for (let n = board.filter(p => p?.color === color && p.type === type).length; n < count; n++) captured.push({color,type});
  }
  return {board,captured,turn:0,playerColors:['red','black'],status:'playing',result:null,noProgressPly:0,positionCounts:{}};
}

test('Chrome R3-UI01 — app shell, Auto/Manual, tra cứu và popup', {timeout:120000}, async t => {
  const b = await launchChrome({suite:'r3-ui01',basePath:'/banqi/'});
  t.after(() => b.close());
  const {evaluate:e,send} = b;
  const click = s => e(`document.querySelector(${JSON.stringify(s)}).click()`);
  const text = s => e(`document.querySelector(${JSON.stringify(s)}).textContent`);
  const settle = () => e(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  const viewport = async (width,height) => { await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1000}); await settle(); };
  const load = async (state=null) => { b.useGame(state); await b.navigate(); await settle(); };
  const orientation = () => e(`document.querySelector('#board').dataset.orientation`);
  const key = async (key,code,n,text) => {
    await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:n,...(text?{text,unmodifiedText:text}:{})});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:n});
  };
  const stateView = () => e(`({cells:[...document.querySelectorAll('.cell')].map(c=>({id:c.id,label:c.getAttribute('aria-label'),selected:c.getAttribute('aria-pressed'),disabled:c.getAttribute('aria-disabled'),src:c.querySelector('img')?.getAttribute('src')})),turn:document.querySelector('#game-status').textContent,players:document.querySelector('#player-colors').textContent,chase:document.querySelector('#chase-status').textContent,result:document.querySelector('#result-message').textContent,sound:document.querySelector('#sound-toggle').getAttribute('aria-pressed')})`);
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const layouts=[];
  for (const [w,h,direction] of [[1366,768,'horizontal'],[1920,1080,'horizontal'],[1280,800,'horizontal'],[700,900,'vertical'],[320,568,'vertical'],[390,844,'vertical'],[844,390,'horizontal'],[915,412,'horizontal']]) {
    for (const theme of ['light','dark']) await t.test(`${w}×${h} ${theme}: Auto, kích thước và không tràn`,async()=>{
      await viewport(w,h); await load(); await click(`[data-theme=${theme}]`);
      assert.equal(await orientation(),direction);
      assert.equal(await e(`document.querySelector('[data-orientation=auto]').getAttribute('aria-pressed')`),'true');
      const metrics=await e(`(()=>{
        const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
        return {viewport:[innerWidth,innerHeight],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board:rect('#board-shell'),cell:rect('.cell'),rail:getComputedStyle(document.querySelector('.piece-reference')).display,rules:getComputedStyle(document.querySelector('#rules-toggle')).display,header:rect('.app-header')};
      })()`);
      assert.ok(metrics.scroll[0]<=w,JSON.stringify(metrics));
      assert.ok(metrics.cell.width >= (direction==='vertical'?48:32)-1,JSON.stringify(metrics));
      if(w>=1100 || direction==='horizontal') {
        assert.ok(metrics.scroll[1]<=h,JSON.stringify(metrics));
        assert.ok(metrics.board.bottom<=h && metrics.header.bottom<metrics.board.top,JSON.stringify(metrics));
      }
      assert.equal(metrics.rail==='none',w<1100);
      assert.equal(metrics.rules==='none',w>=1100);
      layouts.push({w,h,theme,...metrics});
      if(theme==='light' && [1366,390,844].includes(w)) await b.screenshot(`after-${w}-${h}`);
    });
  }
  await t.test('50 resize/override giữ lựa chọn, màu, lượt, SFX; Auto reload và hysteresis',async()=>{
    await viewport(1366,768);
    await load(fixture({a1:['red','rook'],b1:['black','pawn'],h4:['black','rook'],g4:['red','pawn',true]}));
    await click('#cell-0'); await click('#sound-toggle');
    const before=await stateView();
    await e(`document.querySelector('#cell-0').focus();window.turnWrites=0;new MutationObserver(()=>window.turnWrites++).observe(document.querySelector('#turn-toast'),{childList:true})`);
    for(let i=0;i<50;i++) {
      const manual=i%5===0;
      await click(`[data-orientation=${manual?'horizontal':'auto'}]`);
      await viewport(700,900); assert.equal(await orientation(),manual?'horizontal':'vertical');
      await viewport(1366,768); assert.equal(await orientation(),'horizontal');
      assert.deepEqual(await stateView(),before);
      assert.equal(await e(`document.activeElement.id`),'cell-0');
      assert.equal(await e(`[...document.querySelectorAll('.cell')].every((c,i)=>c===window.originalCells[i])`),true);
    }
    assert.equal(await e('window.turnWrites'),0);
    await click('[data-orientation=vertical]'); await viewport(1920,1080); assert.equal(await orientation(),'vertical');
    await load(); assert.equal(await orientation(),'horizontal');
    await viewport(700,900); assert.equal(await orientation(),'vertical');
    for(const w of [980,1000,1010,1000]) {await viewport(w,900);assert.equal(await orientation(),'vertical');}
    await viewport(1100,900); assert.equal(await orientation(),'horizontal');
    for(const w of [990,980,970,960]) {await viewport(w,900);assert.equal(await orientation(),'horizontal');}
  });
  await t.test('Hai cột đúng thứ tự/SVG, Enter/Space, Escape, click ngoài và panel mobile',async()=>{
    await viewport(1366,768); await load();
    const expected=['general','advisor','elephant','rook','horse','cannon','pawn'];
    for(const color of ['red','black']) {
      assert.deepEqual(await e(`Array.from(document.querySelectorAll('#reference-${color} button'),b=>b.dataset.piece)`),expected);
      for(const type of expected) {
        const selector=`#reference-${color} [data-piece=${type}]`;
        assert.equal(await e(`document.querySelector('${selector} img').getAttribute('src')`),`./assets/pieces/${color}/${type}.svg`);
        await e(`document.querySelector('${selector}').focus()`);
        await key(type==='pawn'?' ':'Enter',type==='pawn'?'Space':'Enter',type==='pawn'?32:13,type==='pawn'?' ':'\r');
        assert.equal(await e(`document.querySelector('#piece-popover').matches(':popover-open')`),true);
        assert.ok((await text('#piece-rule')).includes('Đi một ô ngang/dọc'));
        if(type==='general') assert.match(await text('#piece-rule'),/không ăn được Tốt/);
        if(type==='pawn') assert.match(await text('#piece-rule'),/Tốt hoặc Tướng/);
        if(type==='cannon') assert.match(await text('#piece-rule'),/đúng một ngòi.*Không ăn liền kề/);
        await key('Escape','Escape',27);
        assert.equal(await e(`document.querySelector('#piece-popover').matches(':popover-open')`),false);
        assert.equal(await e(`document.activeElement.dataset.piece`),type);
      }
    }
    await click('#reference-red [data-piece=general]');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:4,y:4,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:4,y:4,button:'left',clickCount:1});
    assert.equal(await e(`document.querySelector('#piece-popover').matches(':popover-open')`),false);
    await viewport(390,844); await e(`document.querySelector('#rules-toggle').focus()`); await key(' ','Space',32,' ');
    assert.equal(await e(`document.querySelector('#rules-panel').matches(':popover-open')`),true);
    assert.equal(await e(`document.querySelectorAll('#compact-rules .rule-entry').length`),7);
    const tree=await send('Accessibility.getFullAXTree');
    assert.ok(tree.nodes.some(n=>n.name?.value.includes('Pháo ·')));
    await key('Escape','Escape',27); assert.equal(await e(`document.activeElement.id`),'rules-toggle');
  });
  await t.test('Toast đúng một lần khi đổi lượt, tự ẩn sau 2 giây, không lặp do render',async()=>{
    await viewport(1366,768); await load();
    await e(`window.toastWrites=0;new MutationObserver(()=>window.toastWrites++).observe(document.querySelector('#turn-toast'),{childList:true})`);
    await click('#cell-0'); assert.equal(await e(`document.querySelector('#turn-toast').hidden`),false);
    const after=await text('#turn-toast');
    await click('[data-theme=light]');await click('[data-orientation=vertical]');await viewport(700,900);await click('#cell-0');
    assert.equal(await text('#turn-toast'),after); assert.equal(await e('window.toastWrites'),1);
    await e(`new Promise(r=>setTimeout(r,2100))`);assert.equal(await e(`document.querySelector('#turn-toast').hidden`),true);
  });
  await t.test('C1 ply 8/13/27, warning bền trước nước lỗi và kết quả đóng/mở lại',async()=>{
    const {applyAction}=await import('../js/engine.mjs');
    const loop=[move('b2','c2'),move('c3','b3'),move('c2','b2'),move('b3','c3')];
    let state=fixture({b2:['red','general'],c3:['black','advisor']});
    await viewport(1366,768);await load(state);
    for(let ply=1;ply<=27;ply++) {
      const action=loop[(ply-1)%4];
      await click(`#cell-${at(action.from)}`);
      if(ply===13 || ply===27) {
        await e(`new Promise(r=>setTimeout(r,2300))`);
        await click('#chase-toggle');
        assert.equal(await e(`document.querySelector('#chase-panel').hidden`),false);
        assert.match(await text('#chase-status'),new RegExp(`lỗi ${ply===13?1:2}/2`));
        const prior=await stateView();await viewport(700,900);await viewport(1366,768);assert.deepEqual(await stateView(),prior);
        const geom=await e(`(()=>{const a=document.querySelector('#chase-panel').getBoundingClientRect(),b=document.querySelector('#board').getBoundingClientRect();return {after:a.top>=b.bottom,fit:document.documentElement.scrollHeight<=innerHeight}})()`);
        assert.deepEqual(geom,{after:true,fit:true});
        assert.equal(await e(`document.querySelector('#cell-${at(action.to)}').getAttribute('aria-describedby')`),'chase-status');
        if(ply===27) {
          await b.screenshot('after-warning');
          await viewport(844,390);
          const short=await e(`(()=>{const a=document.querySelector('#chase-panel').getBoundingClientRect(),b=document.querySelector('#board').getBoundingClientRect();return {outside:a.left>=b.right,fit:document.documentElement.scrollHeight<=innerHeight,visible:!document.querySelector('#chase-panel').hidden}})()`);
          assert.deepEqual(short,{outside:true,fit:true,visible:true});
          await b.screenshot('after-warning-landscape');
          await viewport(1366,768);
        }
      }
      const result=applyAction(state,state.turn,action);assert.equal(result.ok,true);state=result.state;
      await click(`#cell-${at(action.to)}`);
      if(ply===8) {assert.equal(state.result,null);assert.match(await text('#chase-status'),/Chưa hòa lặp/);}
      if(ply===9) assert.match(await text('#chase-status'),/5\/6/);
      if(ply===11) assert.match(await text('#chase-status'),/6\/6/);
      if(ply===13) {assert.match(await text('#chase-status'),/lỗi trường tróc 1\/2/);await click('#chase-toggle');await click('#chase-toggle');assert.equal(await e(`document.querySelector('#chase-panel').hidden`),false);}
    }
    assert.equal(state.result.reason,'chase_technical_fouls');
    assert.equal(await e(`document.querySelector('#result-dialog').open`),true);
    assert.match(await text('#result-message'),/Người 2.*thắng.*hai lỗi trường tróc/);
    assert.equal(await text('#game-status'),'Ván đã kết thúc');
    await b.screenshot('after-result');
    await key('Escape','Escape',27);assert.equal(await e(`document.querySelector('#result-dialog').open`),false);
    assert.equal(await e('document.activeElement.id'),'result-toggle');
    const finished=await stateView();await viewport(390,844);await click('#cell-0');assert.deepEqual(await stateView(),finished);
    await click('#result-toggle');assert.equal(await e(`document.querySelector('#result-dialog').open`),true);
    await click('#result-close');await click('#result-toggle');await click('#result-new-game');
    assert.equal(await text('#board'),'?'.repeat(32));assert.equal(await e(`document.querySelector('#result-dialog').open`),false);
    assert.equal(await e(`document.querySelector('#chase-toggle').hidden`),true);
  });
  await t.test('Auto resize khi animation đang chạy: hủy sạch, giữ đúng hành động',async()=>{
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    await viewport(1366,768);await load();await click('#cell-0');
    const before=await stateView();await viewport(390,844);
    assert.deepEqual(await stateView(),before);
    assert.equal(await e(`document.querySelectorAll('.motion-back').length+document.getAnimations().length`),0);
    assert.equal(await e(`document.querySelector('#board').dataset.animating`),undefined);
    assert.equal(await e(`getComputedStyle(document.querySelector('#cell-0 .piece')).visibility`),'visible');
  });
  await t.test('Không lỗi JS hoặc tài nguyên',()=>assert.deepEqual(b.errors,[]));
  fs.writeFileSync(path.join(b.output,'layout-report.json'),JSON.stringify(layouts,null,2));
  t.diagnostic(`Evidence: ${b.output}`);
});
