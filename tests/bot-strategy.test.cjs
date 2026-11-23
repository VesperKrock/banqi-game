"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {strategyScenarios,progressScenarios,forcedWin}=require('./helpers/bot-strategy-fixtures.cjs');
const {scenarios,fixture,move}=require('./helpers/bot-fixtures.cjs');

test('Normal slow-clock safety pass retains the remaining budget; tiny budgets recover with null',async()=>{
 const B=await import('../js/bot.mjs'),P=await import('../js/bot-protocol.mjs');
 const s=(await scenarios()).find(s=>s.name==='revealed-4');
 // Reported CPU-6x case: a safety pass may take 500 ms, within the 700 ms
 // contract but beyond the old 65% reservation. All actions still get checked.
 let calls=0;
 const r=B.chooseBot(s.input(7),{maxNodes:0,clock:()=>++calls<5?0:500});
 assert.ok(P.matchLegal(r.action,s.legal));assert.equal(r.trace.source,'safety');
 let tick=0;assert.equal(B.chooseBot(s.input(7),{budgetMs:1,clock:()=>tick++}).action,null);
});

test('Partial safety fallback accepts only completed zero-risk actions without chase warnings',async()=>{
 const B=await import('../js/bot.mjs'),E=await import('../js/engine.mjs');
 const clock=()=>{let calls=0;return()=>++calls<=2?0:500;};
 const safe=E.getPublicState(fixture({a1:['red','rook'],h4:['black','pawn']}));
 assert.deepEqual(B.chooseFallback(safe,[move('a1','a2'),move('a1','b1')],{budgetMs:455,clock:clock()}),move('a1','a2'));
 const threatened=E.getPublicState(fixture({a1:['red','general'],a2:['black','pawn'],e4:['red','rook'],h4:['black','rook']}));
 assert.equal(B.chooseFallback(threatened,[move('e4','e3'),move('a1','b1')],{budgetMs:455,clock:clock()}),null);
 const chase=(await scenarios()).find(s=>s.name==='chase-12'),warning=chase.snapshot.chase.warnings[0];assert.ok(warning);
 assert.equal(B.chooseFallback(chase.snapshot,[warning.action,...chase.legal],{budgetMs:455,clock:clock()}),null);
});

test('Contextual material and tactical defense regressions',async t=>{
 const B=await import('../js/bot.mjs'),E=await import('../js/engine.mjs'),P=await import('../js/bot-protocol.mjs');
 for(const s of await strategyScenarios())await t.test(s.name,()=>{
  for(const seed of [7,42,991]){
   const result=B.chooseBot(s.input(seed)),key=P.actionKey(result.action),ex=s.expect;
   assert.ok(P.matchLegal(result.action,s.legal),s.name+' legal action');
   if(ex.required)assert.equal(key,ex.required,s.reason);
   if(ex.from)assert.equal(result.action.from,ex.from,s.reason);
   if(ex.forbidden)assert.ok(!ex.forbidden.includes(key),s.reason);
   if(ex.winIn)assert.ok(forcedWin(E,E.applyAction(s.state,0,result.action).state,0,ex.winIn-1),s.reason+' '+key);
   if(ex.noImmediateLoss){
    const next=E.applyAction(s.state,0,result.action).state,view=E.getPublicState(next);
    assert.ok(!E.getLegalActions(view,1).some(a=>E.applyAction(next,1,a).state?.result?.winner===1),s.reason);
   }
  }
 });
});

test('Progress follows public history without forcing unsafe reveals',async t=>{
 const B=await import('../js/bot.mjs'),E=await import('../js/engine.mjs'),P=await import('../js/bot-protocol.mjs');
 for(const s of await progressScenarios())await t.test(s.name,()=>{
  for(const seed of [7,42,991]){
   const r=B.chooseBot(s.input(seed)),ex=s.expect;
   assert.ok(P.matchLegal(r.action,s.legal),s.name);
   if(ex.required)assert.equal(P.actionKey(r.action),ex.required,s.reason);
   if(ex.from)assert.equal(r.action.from,ex.from,s.reason);
   if(ex.draw)assert.equal(E.applyAction(s.state,s.state.turn,r.action).state.result?.outcome,'draw',s.reason);
  }
 });
});

test('Safe development integrates public uncertainty, independent of concealed layout',async()=>{
 const B=await import('../js/bot.mjs'),E=await import('../js/engine.mjs'),P=await import('../js/bot-protocol.mjs');
 const s=(await progressScenarios()).find(s=>s.name==='consider-safe-reveal-among-many-quiet-moves');
 const permuted=structuredClone(s.state),hidden=permuted.board.filter(p=>p?.faceDown).reverse();
 permuted.board=permuted.board.map(p=>p?.faceDown?hidden.shift():p);
 assert.notDeepEqual(permuted.board,s.state.board);
 const view=E.getPublicState(permuted);assert.deepEqual(view,s.snapshot);
 for(const seed of [7,42])assert.deepEqual(B.chooseBot(s.input(seed),{budgetMs:5000,maxNodes:1400}),B.chooseBot(P.createBotInput(view,s.legal,null,seed),{budgetMs:5000,maxNodes:1400}));
});

test('Strategic decisions remain valid with colors and players exchanged',async()=>{
 const B=await import('../js/bot.mjs'),E=await import('../js/engine.mjs'),P=await import('../js/bot-protocol.mjs');
 for(const s of await strategyScenarios()){
  const state=structuredClone(s.state);state.turn=1;state.playerColors=['red','black'];
  for(const p of [...state.board,...state.captured])if(p)p.color=p.color==='red'?'black':'red';
  const view=E.getPublicState(state),legal=E.getLegalActions(view,1),r=B.chooseBot(P.createBotInput(view,legal,null,42)),key=P.actionKey(r.action),ex=s.expect;
  assert.ok(P.matchLegal(r.action,legal),s.name);
  if(ex.required)assert.equal(key,ex.required,s.name);
  if(ex.from)assert.equal(r.action.from,ex.from,s.name);
  if(ex.forbidden)assert.ok(!ex.forbidden.includes(key),s.name);
  const next=E.applyAction(state,1,r.action).state;
  if(ex.winIn)assert.ok(forcedWin(E,next,1,ex.winIn-1),s.name);
  if(ex.noImmediateLoss)assert.ok(!E.getLegalActions(E.getPublicState(next),0).some(a=>E.applyAction(next,0,a).state?.result?.winner===0),s.name);
 }
});
