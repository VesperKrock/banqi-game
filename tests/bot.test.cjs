"use strict";
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,scenarios,seeded,move}=require('./helpers/bot-fixtures.cjs');
let B,P,E,cases;
before(async()=>{B=await import('../js/bot.mjs');P=await import('../js/bot-protocol.mjs');E=await import('../js/engine.mjs');cases=await scenarios();});
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
for(const name of ['opening','revealed-4','revealed-12','revealed-20','pawn-takes-general','save-general-from-pawn','cannon-recapture-trap','escape-cannon-screen','free-capture','save-rook','forced-loss','chase-12','chase-26','winning-avoid-threefold','capture-before-60','last-hidden','cannon-win','two-screens','pawn-fork','full-revealed'])test('Bot legal/safety: '+name,()=>{
 const s=cases.find(s=>s.name===name);
 for(const seed of [7,42,991]){
  const input=freeze(s.input(seed)),original=JSON.stringify(input);
  const result=B.chooseBot(input);assert.ok(result.action,name+' '+JSON.stringify(result));
  assert.ok(P.matchLegal(result.action,s.legal));assert.equal(JSON.stringify(input),original);
  const key=P.actionKey(result.action),expect=s.expect;
  if(expect.required)assert.equal(key,expect.required,JSON.stringify(result));
  if(expect.from)assert.equal(result.action.from,expect.from,JSON.stringify(result));
  if(expect.forbidden)assert.ok(!expect.forbidden.includes(key),JSON.stringify(result));
  if(expect.avoidWarning)assert.ok(!s.snapshot.chase.warnings.some(w=>P.actionKey(w.action)===key),JSON.stringify(result));
  const applied=E.applyAction(s.state,s.state.turn,result.action);assert.equal(applied.ok,true);
  if(expect.noDraw)assert.notEqual(applied.state.result?.outcome,'draw',JSON.stringify(result));
  if(expect.forcedLoss){const replies=E.getLegalActions(E.getPublicState(applied.state),applied.state.turn);assert.ok(replies.some(a=>E.applyAction(applied.state,applied.state.turn,a).state?.result?.winner===1));}
 }
});
test('Belief exact, conserved, conditional probabilities and sampling without replacement',()=>{
 for(const s of cases){const belief=B.remainingPieces(s.snapshot),hidden=s.snapshot.board.filter(p=>p?.faceDown).length;
  assert.equal(belief.reduce((n,p)=>n+p.count,0),hidden);
  if(hidden)assert.ok(Math.abs(belief.reduce((n,p)=>n+p.probability,0)-1)<1e-12);
  const sample=B.sampleHidden(s.snapshot,42);assert.equal(sample.length,hidden);
  for(const p of belief)assert.equal(sample.filter(q=>q.type===p.type&&q.color===p.color).length,p.count);
  assert.deepEqual(sample,B.sampleHidden(s.snapshot,42));
 }
 const bad=structuredClone(cases[0].snapshot);bad.captured.push({color:'red',type:'general'});assert.throws(()=>B.remainingPieces(bad));
});
test('Public-only: hidden identity permutation preserves decision and complete public trace',()=>{
 const a=E.createGame({firstPlayer:1,random:seeded(99)});
 const first=E.applyAction(a,1,{type:'flip',at:'a1'}).state;
 const second=structuredClone(first);const hidden=second.board.filter(p=>p?.faceDown).reverse();
 second.board=second.board.map(p=>p?.faceDown?hidden.shift():p);
 assert.notDeepEqual(first.board,second.board);
 const va=E.getPublicState(first),vb=E.getPublicState(second);assert.deepEqual(va,vb);
 for(const seed of [1,23,981]){
  const ia=P.createBotInput(va,E.getLegalActions(va,va.turn),null,seed),ib=P.createBotInput(vb,E.getLegalActions(vb,vb.turn),null,seed);
  assert.deepEqual(B.chooseBot(ia,{budgetMs:5000,maxNodes:100}),B.chooseBot(ib,{budgetMs:5000,maxNodes:100}));
 }
});
test('Poison getters: never read hidden color/type/ID/extra fields at payload or algorithm boundary',()=>{
 const s=cases.find(s=>s.name==='revealed-12'),view=structuredClone(s.snapshot);
 for(const piece of view.board)if(piece?.faceDown)for(const key of ['color','type','id','visibleId','secret'])Object.defineProperty(piece,key,{enumerable:true,get(){throw Error('Hidden leak '+key);}});
 Object.defineProperty(view,'privateState',{enumerable:true,get(){throw Error('Private leak');}});
 const input=P.createBotInput(view,s.legal,null,1);assert.ok(B.chooseBot(input).action);
 assert.ok(B.chooseBot({...input,snapshot:view}).action);
 for(const p of input.snapshot.board)if(p?.faceDown)assert.deepEqual(Object.keys(p).sort(),['faceDown','occupied']);
 assert.equal('privateState' in input.snapshot,false);
});
test('Public replay preserves exact current chase, fault and draw-hold adjudication',()=>{
 for(const name of ['chase-12','chase-26','winning-avoid-threefold','revealed-20']){
  const s=cases.find(s=>s.name===name),model=B.hypotheticalState(s.input(23));
  assert.deepEqual(E.getPublicState(model),s.snapshot,name);
  for(const action of s.legal.filter(a=>a.type==='move'))assert.deepEqual(E.getPublicState(E.applyAction(model,model.turn,action).state),E.getPublicState(E.applyAction(s.state,s.state.turn,action).state));
 }
});
test('No extra action after outcome or on wrong supplied turn',()=>{
 const s=cases.find(s=>s.name==='cannon-win'),done=E.applyAction(s.state,0,move('a1','h1')).state,v=E.getPublicState(done);
 assert.equal(B.chooseBot(P.createBotInput(v,[],null,1)).action,null);
 assert.equal(B.chooseBot(P.createBotInput(s.snapshot,[],null,1)).action,null);
});
test('Fallback is safety-ranked and stays legal on tactical fixtures',()=>{
 for(const s of cases.filter(s=>s.expect.required||s.expect.avoidWarning||s.expect.from)){
  const action=B.chooseFallback(s.snapshot,s.legal,{budgetMs:2000});assert.ok(P.matchLegal(action,s.legal),s.name);
  if(s.expect.required)assert.equal(P.actionKey(action),s.expect.required,s.name);
  if(s.expect.from)assert.equal(action.from,s.expect.from,s.name);
  if(s.expect.avoidWarning)assert.ok(!s.snapshot.chase.warnings.some(w=>P.actionKey(w.action)===P.actionKey(action)),s.name);
 }
});
test('Tiny search budget returns completed safety choice or recoverable null, never unchecked random',()=>{
 const s=cases.find(s=>s.name==='revealed-12');let tick=0;
 const result=B.chooseBot(s.input(1),{budgetMs:1,clock:()=>tick++});assert.equal(result.action,null);
 assert.equal(B.chooseFallback(s.snapshot,s.legal,{budgetMs:0}),null);
});

test('Player/color symmetry: tactics work when the Bot is Player 2 and either color',()=>{
 for(const name of ['pawn-takes-general','escape-cannon-screen','cannon-win'])for(const swapColors of [false,true]){
  const original=cases.find(s=>s.name===name),state=structuredClone(original.state);state.turn=1;state.playerColors=['black','red'];
  if(swapColors){for(const p of [...state.board,...state.captured])if(p)p.color=p.color==='red'?'black':'red';state.playerColors=['red','black'];}
  const view=E.getPublicState(state),legal=E.getLegalActions(view,1),result=B.chooseBot(P.createBotInput(view,legal,null,11));assert.equal(P.actionKey(result.action),original.expect.required);
 }
});
test('Two reproducible game continuations: every decision legal, public history stays exact',()=>{
 for(const seed of [17,63]){
  let state=E.createGame({firstPlayer:seed%2,random:seeded(seed)}),history={initial:E.getPublicState(state),events:[]},plies=0;
  while(state.status==='playing'&&plies<120){
   const view=E.getPublicState(state),legal=E.getLegalActions(view,view.turn),input=P.createBotInput(view,legal,history,seed^plies);
   const decision=B.chooseBot(input);assert.ok(P.matchLegal(decision.action,legal),`seed ${seed}, ply ${plies}`);
   const next=E.applyAction(state,state.turn,decision.action);assert.equal(next.ok,true);history.events.push(P.copyEvent(next.event));state=next.state;plies++;
  }
  assert.ok(plies>10);assert.deepEqual(E.getPublicState(B.hypotheticalState(P.createBotInput(E.getPublicState(state),[],history,seed))),E.getPublicState(state));
 }
});
