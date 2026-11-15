"use strict";
const assert=require('node:assert/strict');
const at=s=>(Number(s[1])-1)*8+'abcdefgh'.indexOf(s[0]);
const move=(from,to)=>({type:'move',from,to});
function fixture(entries,turn=0) {
 const board=Array(32).fill(null),captured=[];
 for(const [square,[color,type,faceDown=false]] of Object.entries(entries))board[at(square)]={color,type,faceDown};
 for(const color of ['red','black'])for(const [type,count] of Object.entries({general:1,advisor:2,elephant:2,rook:2,horse:2,cannon:2,pawn:5})){
  const live=board.filter(p=>p?.color===color&&p.type===type).length;assert.ok(live<=count);
  for(let i=live;i<count;i++)captured.push({color,type});
 }
 return {board,captured,turn,playerColors:['red','black'],status:'playing',result:null,noProgressPly:0,positionCounts:{}};
}
function seeded(seed){return()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);}
async function scenarios(){
 const E=await import('../../js/engine.mjs');const P=await import('../../js/bot-protocol.mjs');
 const result=[];
 function add(name,initial,actions=[],expect={}){
  let state=structuredClone(initial);const history={initial:E.getPublicState(state),events:[]};
  for(const action of actions){const next=E.applyAction(state,state.turn,action);assert.equal(next.ok,true,name);state=next.state;history.events.push(next.event);}
  const snapshot=E.getPublicState(state),legal=E.getLegalActions(snapshot,snapshot.turn);
  result.push({name,state,history,snapshot,legal,expect,input:seed=>P.createBotInput(snapshot,legal,history,seed)});
 }
 const initial=E.createGame({firstPlayer:1,random:seeded(44)});
 add('opening',initial);
 for(const count of [4,12,20])add('revealed-'+count,initial,Array.from({length:count},(_,i)=>({type:'flip',at:'abcdefgh'[i%8]+((i>>3)+1)})));
 add('pawn-takes-general',fixture({a1:['red','pawn'],a2:['black','general'],h4:['black','rook']}),[],{required:'m:a1:a2'});
 add('save-general-from-pawn',fixture({b2:['red','general'],c2:['black','pawn'],h4:['black','advisor'],a1:['red','rook']}),[],{from:'b2'});
 add('cannon-recapture-trap',fixture({b1:['red','rook'],c1:['black','pawn'],h1:['black','cannon'],e1:['red','pawn',true],a4:['red','general'],h4:['black','rook']}),[],{forbidden:['m:b1:c1']});
 add('escape-cannon-screen',fixture({a1:['red','general'],a2:['red','pawn',true],a4:['black','cannon'],h1:['red','rook'],h4:['black','pawn']}),[],{required:'m:a1:b1'});
 add('free-capture',fixture({a1:['red','rook'],a2:['black','pawn'],h4:['black','rook']}),[],{required:'m:a1:a2'});
 add('save-rook',fixture({b2:['red','rook'],c2:['black','advisor'],h1:['red','pawn'],h4:['black','rook']}),[],{from:'b2'});
 add('forced-loss',fixture({a1:['red','pawn'],b1:['black','rook'],a2:['black','elephant'],h4:['black','general',true]}),[],{required:'f:h4',forcedLoss:true});
 const chase=fixture({b2:['red','general'],c3:['black','advisor'],h1:['red','rook'],f4:['black','pawn']});
 const loop=[move('b2','c2'),move('c3','b3'),move('c2','b2'),move('b3','c3')];
 for(const ply of [12,26])add('chase-'+ply,chase,Array.from({length:ply},(_,i)=>loop[i%4]),{avoidWarning:true});
 const repetition=fixture({a1:['red','rook'],d2:['red','advisor'],h4:['black','rook']},1);
 const repeatLoop=[move('h4','g4'),move('a1','b1'),move('g4','h4'),move('b1','a1')];
 add('winning-avoid-threefold',repetition,Array.from({length:7},(_,i)=>repeatLoop[i%4]),{forbidden:['m:b1:a1'],noDraw:true});
 const quiet=fixture({d1:['red','rook'],e1:['black','pawn'],c4:['red','advisor']});quiet.noProgressPly=59;
 add('capture-before-60',quiet,[],{required:'m:d1:e1'});
 add('last-hidden',fixture({a1:['red','cannon'],b1:['red','pawn'],f4:['black','pawn'],h4:['black','general',true]}));
 add('cannon-win',fixture({a1:['red','cannon'],d1:['red','pawn'],h1:['black','general']}),[],{required:'m:a1:h1'});
 add('two-screens',fixture({a1:['red','cannon'],c1:['red','pawn'],e1:['black','pawn'],h1:['black','general'],h4:['red','general']}));
 add('pawn-fork',fixture({d2:['red','general'],e2:['black','pawn'],d4:['black','cannon'],b2:['red','advisor'],h1:['red','rook'],g4:['black','rook']}));
 add('full-revealed',initial,Array.from({length:32},(_,i)=>({type:'flip',at:'abcdefgh'[i%8]+((i>>3)+1)})));
 return result;
}
module.exports={fixture,seeded,scenarios,at,move};
