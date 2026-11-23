"use strict";
const {fixture}=require('./bot-fixtures.cjs');

// Inventories are conserved by fixture(): absent pieces are public captures.
// Expectations describe tactical consequences, not a particular evaluation.
async function strategyScenarios(){
 const E=await import('../../js/engine.mjs'),P=await import('../../js/bot-protocol.mjs');
 const cases=[];
 function add(name,entries,expect,reason){
  const state=fixture(entries),snapshot=E.getPublicState(state),legal=E.getLegalActions(snapshot,0);
  cases.push({name,state,snapshot,legal,expect,reason,input:seed=>P.createBotInput(snapshot,legal,null,seed)});
 }
 const counter={a1:['red','rook'],b2:['red','pawn'],a2:['black','cannon'],c2:['black','horse'],h4:['black','general']};
 add('last-pawn-revealed-general',counter,{from:'b2'},'Taking a2 loses the only remaining counter to the general to c2-b2.');
 add('last-pawn-hidden-general',{...counter,h4:['black','general',true]},{from:'b2'},'The uncaptured general is still possible; its hidden square must not be read.');
 const gone={...counter};delete gone.h4;
 add('general-captured-pawn-expendable',gone,{required:'m:a1:a2'},'Without the general, taking the cannon compensates for losing a pawn.');
 add('three-pawns-counter-redundancy',{...counter,f1:['red','pawn'],g1:['red','pawn']},{required:'m:a1:a2'},'Two other pawns retain the ability to take the general.');
 add('five-pawns-counter-redundancy',{...counter,e1:['red','pawn'],f1:['red','pawn'],g1:['red','pawn'],h1:['red','pawn']},{required:'m:a1:a2'},'Do not hoard every pawn while a free cannon is available.');
 add('general-equal-capture',{b2:['red','general'],c2:['black','general'],h4:['black','rook']},{required:'m:b2:c2'},'An unprotected opposing general can be captured by a general.');
 add('general-pawn-threat',{b2:['red','general'],c2:['black','pawn'],h4:['black','advisor'],a1:['red','rook']},{from:'b2'},'A pawn can take the general despite its low static rank.');
 add('general-cannon-no-screen',{a1:['red','general'],a4:['black','cannon'],d1:['red','rook'],e1:['black','pawn']},{required:'m:d1:e1'},'No screen: the cannon does not attack a1.');
 add('general-cannon-one-screen',{a1:['red','general'],a2:['red','pawn',true],a4:['black','cannon'],d1:['red','rook'],e1:['black','pawn']},{required:'m:a1:b1'},'One screen: save the general before taking the pawn.');
 add('moving-screen-exposes-general',{a1:['red','general'],a2:['red','pawn'],a3:['black','pawn'],a4:['black','cannon'],h4:['black','horse']},{forbidden:['m:a2:b2','m:a2:a3']},'Moving or capturing one of two screens exposes the general; escaping only risks a pawn.');
 add('advisor-still-vulnerable-to-cannon',{a1:['red','advisor'],a2:['red','pawn',true],a4:['black','cannon'],d1:['red','rook'],e1:['black','pawn']},{required:'m:a1:b1'},'No opposing general/advisor remains, but the cannon still defeats the advisor.');
 add('terminal-capture-over-material',{a1:['red','pawn'],a2:['black','general']},{required:'m:a1:a2'},'Capturing the final opposing piece is a proven terminal win.');
 add('last-piece-must-escape',{b2:['red','general'],c2:['black','pawn'],h4:['black','rook']},{from:'b2',noImmediateLoss:true},'Do not allow an immediate loss of the final piece.');
 add('sacrifice-to-force-last-cannon',{a1:['black','cannon'],a2:['red','pawn'],b1:['red','pawn'],d1:['red','rook'],c2:['red','general']},{winIn:3},'Offer a piece on c1: the corner cannon must capture it and then be recaptured, ending the game.');
 add('sacrifice-last-counter-for-proven-win',{a1:['black','cannon'],c1:['black','general'],a2:['red','rook'],b1:['red','advisor'],d1:['red','rook'],c2:['red','pawn']},{winIn:3},'The last pawn takes the general c2-c1, is captured by the trapped cannon, then d1-c1 wins.');
 add('coordinate-dominant-hunters',{a1:['black','horse'],c1:['red','rook'],b3:['red','advisor']},{winIn:3},'Advisor b3-a3 and rook c1 cover both exits from a1; finish in three plies.');
 return cases;
}
// Independent, exhaustive bounded proof using only the unchanged rules engine.
// No Bot values or move ordering determine the expected result.
function forcedWin(E,state,player,depth){
 if(state.result)return state.result.outcome!=='draw'&&state.result.winner===player;
 if(!depth)return false;
 const view=E.getPublicState(state),legal=E.getLegalActions(view,view.turn);
 const prove=a=>forcedWin(E,E.applyAction(state,view.turn,a).state,player,depth-1);
 return view.turn===player?legal.some(prove):legal.every(prove);
}
async function progressScenarios(){
 const E=await import('../../js/engine.mjs'),P=await import('../../js/bot-protocol.mjs');
 const result=[];
 function add(name,initial,actions,expect,reason){
  let state=initial;const history={initial:E.getPublicState(initial),events:[]};
  for(const action of actions){const next=E.applyAction(state,state.turn,action);if(!next.ok)throw Error(name+' illegal history');state=next.state;history.events.push(P.copyEvent(next.event));}
  const snapshot=E.getPublicState(state),legal=E.getLegalActions(snapshot,snapshot.turn);
  result.push({name,state,snapshot,legal,expect,reason,input:seed=>P.createBotInput(snapshot,legal,history,seed)});
 }
 // Minimized from pair 10 / role 0. The final hidden advisor is identified by
 // public inventory alone. Two rounds preserve the observed advisor/horse loop.
 const chase=fixture({b1:['black','horse'],f1:['red','elephant'],g1:['black','pawn'],h1:['black','general'],a2:['red','advisor'],c2:['red','elephant'],g2:['black','elephant'],h3:['red','pawn'],c4:['black','pawn'],e4:['red','advisor',true]});
 const loop=[['a2','b2'],['b1','a1'],['b2','a2'],['a1','b1']].map(([from,to])=>({type:'move',from,to}));
 add('safe-reveal-breaks-advisor-horse-loop',chase,[...loop,...loop],{required:'f:e4'},'A safely revealed second advisor develops a hunter instead of repeating the same chase.');
 const quiet=fixture({a1:['red','rook'],h4:['black','horse'],e4:['red','advisor',true]});quiet.noProgressPly=57;
 add('future-flip-is-not-a-free-pass',quiet,[],{required:'f:e4'},'A hypothetical future flip cannot erase the real 60-ply clock; reveal safely now.');
 // Pair 12, before plies 185 and 203. Concealed labels below are only a
 // conserving sample; decisions must integrate the entire public inventory.
 const develop=fixture({a1:['red','elephant',true],b1:['red','pawn'],c1:['black','cannon'],d1:['red','pawn'],e1:['red','rook',true],f1:['black','pawn'],c2:['black','advisor',true],e2:['black','pawn'],a3:['red','general'],b3:['red','advisor'],d3:['black','pawn',true],c4:['black','elephant'],e4:['black','advisor']});
 develop.playerColors=['black','red'];develop.noProgressPly=1;
 add('consider-safe-reveal-among-many-quiet-moves',develop,[],{required:'f:d3'},'The safe d3 reveal was ranked tenth and never searched; develop information over a near-equal quiet shuffle.');
 const cannon=fixture({b1:['red','pawn'],c1:['black','cannon'],d1:['red','pawn'],e1:['red','elephant',true],f1:['black','pawn'],b2:['red','rook'],c2:['black','elephant'],d2:['black','advisor'],e2:['black','pawn'],a3:['red','general'],b3:['red','advisor'],d3:['black','pawn'],e4:['black','advisor']});
 cannon.playerColors=['black','red'];cannon.noProgressPly=15;
 add('search-safe-reveal-for-cannon-plan',cannon,[],{required:'f:e1'},'The publicly known elephant on e1 is a safe cannon target; the reveal must reach tactical search despite its root rank.');
 add('defend-before-dangerous-reveal',fixture({a1:['black','advisor'],b1:['red','pawn'],h1:['black','elephant'],g2:['black','rook'],f3:['red','elephant'],h3:['black','advisor'],h4:['black','elephant'],f2:['red','rook',true],h2:['red','horse',true],g3:['red','cannon',true]}),[],{from:'b1'},'Pair 5 defense: all reveals allow material loss; save the threatened pawn.');
 const losing=fixture({a1:['red','pawn'],h4:['black','rook']});losing.noProgressPly=59;
 add('take-legitimate-draw-when-behind',losing,[],{draw:true},'Do not reject a real engine draw to satisfy a progress metric.');
 return result;
}
module.exports={strategyScenarios,progressScenarios,forcedWin};
