const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,seeded}=require('../helpers/bot-fixtures.cjs');
const load=()=>Promise.all([import('../../js/engine.mjs'),import('../../supabase/functions/banqi-match/engine-adapter.mjs')]);
test('Canonical engine import; server creates 32 hidden pieces, 16 per color',async()=>{
  const [E,A]=await load();
  for(let n=0;n<8;n++){
    const state=A.createServerGame();assert.equal(state.board.length,32);
    for(const color of ['red','black'])assert.equal(state.board.filter(p=>p.color===color).length,16);
    assert.ok([0,1].includes(state.turn));assert.deepEqual(state.playerColors,[null,null]);
    assert.deepEqual(A.publicSnapshot(state),E.getPublicState(state));
    for(const p of A.publicSnapshot(state).board)assert.deepEqual(p,{occupied:true,faceDown:true});
  }
});
test('Hidden permutations and injected private metadata are indistinguishable publicly',async()=>{
  const [E,A]=await load(),first=E.createGame({random:seeded(4)}),other=structuredClone(first);
  other.board.reverse();other.seed='private';other.board.forEach((p,i)=>{p.id=i;p.hidden='private';});
  assert.deepEqual(A.publicSnapshot(first),A.publicSnapshot(other));
});
test('Public snapshot and event are fresh deeply allowlisted objects',async()=>{
  const [E,A]=await load(),state=E.createGame({random:seeded(5)});
  const next=A.prepareAction(state,state.turn,{type:'flip',at:'a1'});
  const dirty={...next.event,token:'private',piece:{...next.event.piece,secret:'private'}};
  assert.deepEqual(A.publicEvent(dirty),next.event);
  next.snapshot.board[0].type='changed';assert.notEqual(next.candidateState.board[0].type,'changed');
  assert.deepEqual(state.playerColors,[null,null]);
});
test('Wrong turn, illegal action and finished state do not mutate private state',async()=>{
  const [E,A]=await load(),state=E.createGame({random:seeded(6)}),before=structuredClone(state);
  assert.equal(A.prepareAction(state,1-state.turn,{type:'flip',at:'a1'}).error,'NOT_YOUR_TURN');
  assert.equal(A.prepareAction(state,state.turn,{type:'move',from:'a1',to:'a2'}).ok,false);
  assert.deepEqual(state,before);
  const ended={...state,status:'finished',result:{outcome:'draw',winner:null,reason:'no_progress_60'}};
  assert.equal(A.prepareAction(ended,ended.turn,{type:'flip',at:'a1'}).error,'GAME_OVER');
});
for(const [name,entries,action,ok] of [
  ['cannon one screen',{a1:['red','cannon'],b1:['red','pawn',true],d1:['black','general']},{type:'move',from:'a1',to:'d1'},true],
  ['cannon no screen',{a1:['red','cannon'],d1:['black','general']},{type:'move',from:'a1',to:'d1'},false],
  ['pawn captures general',{a1:['red','pawn'],b1:['black','general']},{type:'move',from:'a1',to:'b1'},true],
  ['general cannot capture pawn',{a1:['red','general'],b1:['black','pawn']},{type:'move',from:'a1',to:'b1'},false],
])test(name+' parity',async()=>{
  const [E,A]=await load(),state=fixture(entries),expected=E.applyAction(state,state.turn,action),actual=A.prepareAction(state,state.turn,action);
  assert.equal(actual.ok,ok);assert.equal(actual.ok,expected.ok);
  if(ok){assert.deepEqual(actual.candidateState,expected.state);assert.deepEqual(actual.snapshot,E.getPublicState(expected.state));assert.deepEqual(actual.event,expected.event);}
});
test('Chase warnings, technical loss and final replay prohibition follow canonical engine',async()=>{
  const [E,A]=await load();let state=fixture({b2:['red','general'],c3:['black','advisor']});
  const moves=[['b2','c2'],['c3','b3'],['c2','b2'],['b3','c3']];let warnings=0;
  for(let i=0;i<28&&state.status!=='finished';i++){
    const [from,to]=moves[i%4],action={type:'move',from,to},expected=E.applyAction(state,state.turn,action);
    const actual=A.prepareAction(state,state.turn,action);assert.equal(actual.ok,true);
    assert.deepEqual(actual.candidateState,expected.state);assert.deepEqual(actual.snapshot,E.getPublicState(expected.state));
    warnings+=actual.snapshot.chase.warnings.length;state=actual.candidateState;
  }
  assert.ok(warnings>0);assert.equal(state.result.reason,'chase_technical_fouls');
  assert.equal(A.prepareAction(state,state.turn,{type:'flip',at:'a1'}).error,'GAME_OVER');
});
test('Four bounded legal trajectories preserve engine parity after every move',async()=>{
  const [E,A]=await load();
  for(let seed=1;seed<=4;seed++){
    const random=seeded(seed);let state=E.createGame({random});
    for(let ply=0;ply<160&&state.status!=='finished';ply++){
      const legal=E.getLegalActions(E.getPublicState(state),state.turn),action=legal[Math.floor(random()*legal.length)];
      const expected=E.applyAction(state,state.turn,action),actual=A.prepareAction(state,state.turn,action);
      assert.equal(actual.ok,true);assert.deepEqual(actual.candidateState,expected.state);
      assert.deepEqual(actual.snapshot,E.getPublicState(expected.state));assert.deepEqual(actual.event,expected.event);state=actual.candidateState;
    }
  }
});
test('No-progress 60 and threefold repetition keep canonical results',async()=>{
  const [E,A]=await load();
  const quiet=fixture({a1:['red','advisor'],h4:['black','advisor']});quiet.noProgressPly=59;
  const action={type:'move',from:'a1',to:'a2'},result=A.prepareAction(quiet,0,action);
  assert.equal(result.snapshot.result.reason,'no_progress_60');
  assert.deepEqual(result.snapshot,E.getPublicState(E.applyAction(quiet,0,action).state));
  let state=fixture({a1:['red','advisor'],h4:['black','advisor']});
  const loop=[['a1','a2'],['h4','h3'],['a2','a1'],['h3','h4']];
  for(let ply=0;ply<8;ply++){
    const [from,to]=loop[ply%4],move={type:'move',from,to};
    const actual=A.prepareAction(state,state.turn,move),expected=E.applyAction(state,state.turn,move);
    assert.equal(actual.ok,true);assert.deepEqual(actual.candidateState,expected.state);state=actual.candidateState;
  }
  assert.equal(state.result.reason,'threefold_repetition');
});
