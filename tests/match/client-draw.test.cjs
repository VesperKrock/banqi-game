const test=require('node:test'),assert=require('node:assert/strict'),launch=require('../helpers/chrome.cjs');
test('Server draw projection shows draw result and releases unchanged Offline game',async t=>{
  const E=await import('../../js/engine.mjs'),{publicSnapshot}=await import('../../supabase/functions/banqi-match/engine-adapter.mjs');
  const state=require('../helpers/bot-fixtures.cjs').fixture({a1:['red','rook'],h4:['black','rook']});state.noProgressPly=59;
  const next=E.applyAction(state,0,{type:'move',from:'a1',to:'a2'});assert.equal(next.state.result.outcome,'draw');
  const match={roomId:'22222222-2222-4222-8222-222222222222',player:0,version:60,snapshot:publicSnapshot(next.state),event:next.event};
  const b=await launch({suite:'r5-02b-draw'});t.after(()=>b.close());await b.navigate();
  const before=await b.evaluate(`JSON.stringify([...document.querySelectorAll('.cell')].map(c=>c.title))`);
  await b.evaluate(`import('./js/offline.mjs').then(m=>m.boardReady).then(view=>{window.qaLease=view.take({player:0,submit:()=>{throw Error('No action after draw');}});qaLease.show(${JSON.stringify(match)},{interactive:false});})`);
  assert.equal(await b.evaluate(`document.querySelector('#result-dialog').open`),true);
  assert.match(await b.evaluate(`document.querySelector('#result-message').textContent`),/Hòa.*60/);
  assert.equal(await b.evaluate(`document.querySelector('#result-new-game').disabled`),true);
  await b.evaluate('qaLease.release()');assert.equal(await b.evaluate(`JSON.stringify([...document.querySelectorAll('.cell')].map(c=>c.title))`),before);
  assert.deepEqual(b.errors,[]);
});
