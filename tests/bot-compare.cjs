"use strict";
// Manual acceptance harness, separate from the regression suite. Long game
// traces and reports remain ignored in .local-qa; no QA artifacts are published.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {scenarios,seeded}=require('./helpers/bot-fixtures.cjs');
const {strategyScenarios,progressScenarios,forcedWin}=require('./helpers/bot-strategy-fixtures.cjs');
const {loadBaseline,COMMIT,hash}=require('./helpers/bot-baseline.cjs');
const qa=path.resolve('.local-qa/r4-bot02');
fs.mkdirSync(qa,{recursive:true});
const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9);
const dir=output?path.resolve(output):fs.mkdtempSync(path.join(qa,'comparison-'));
if(!dir.startsWith(qa+path.sep))throw Error('Comparison output must be inside .local-qa/r4-bot02');
fs.mkdirSync(dir,{recursive:true});
function stats(rows){const a=rows.map(r=>r.ms).sort((a,b)=>a-b);return {count:a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1)};}
(async()=>{
 const baseline=await loadBaseline(),candidate=await import('../js/bot.mjs'),E=await import('../js/engine.mjs'),P=await import('../js/bot-protocol.mjs');
 const reportFile=path.join(dir,process.argv.includes('--fixtures-only')?'fixture-comparison.json':'comparison.json');
 const report=fs.existsSync(reportFile)?JSON.parse(fs.readFileSync(reportFile,'utf8')):{baseline:COMMIT,candidateHash:hash(fs.readFileSync('js/bot.mjs')),environment:{node:process.version,cpu:os.cpus()[0].model},
  gates:{fixtureImprovements:2,candidateFixtureFailures:0,minimumPairs:20,minimumFinishedFraction:.9,minimumCompletedScore:.5,illegalOrNull:0},fixtures:[],games:[]};
 if(report.baseline!==COMMIT||report.candidateHash!==hash(fs.readFileSync('js/bot.mjs')))throw Error('Cannot resume different Bot versions; use a new output directory');
 const save=()=>fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
 const fail=(s,a)=>{
  if(!P.matchLegal(a,s.legal))return 'illegal/null';const ex=s.expect,key=P.actionKey(a);
  if(ex.required&&key!==ex.required)return 'required';if(ex.from&&a.from!==ex.from)return 'save-piece';
  if(ex.forbidden?.includes(key))return 'forbidden';
  if(ex.avoidWarning&&s.snapshot.chase.warnings.some(w=>P.actionKey(w.action)===key))return 'chase-warning';
  const next=E.applyAction(s.state,s.state.turn,a).state;
  if(ex.winIn&&!forcedWin(E,next,s.state.turn,ex.winIn-1))return 'missed-forced-win';
  if(ex.noDraw&&next.result?.outcome==='draw')return 'draw';
  if(ex.draw&&next.result?.outcome!=='draw')return 'missed-draw';
  if(ex.noImmediateLoss&&E.getLegalActions(E.getPublicState(next),next.turn).some(r=>E.applyAction(next,next.turn,r).state?.result?.winner===1-s.state.turn))return 'immediate-loss';
  return null;
 };
 const all=[...await scenarios(),...await strategyScenarios(),...await progressScenarios()];
 for(const s of all)for(const seed of [7,42,991,2026,65537]){
  if(report.fixtures.some(r=>r.name===s.name&&r.seed===seed))continue;
  const row={name:s.name,seed};
  for(const [name,bot] of [['baseline',baseline],['candidate',candidate]]){const start=performance.now(),r=bot.chooseBot(s.input(seed));row[name]={action:r.action,trace:r.trace,ms:performance.now()-start,failure:fail(s,r.action)};}
  report.fixtures.push(row);
 }
 const improvements=[...new Set(report.fixtures.filter(r=>r.baseline.failure&&!r.candidate.failure).map(r=>r.name))];
 report.fixtureSummary={improvements,candidateFailures:report.fixtures.filter(r=>r.candidate.failure),baseline:stats(report.fixtures.map(r=>r.baseline)),candidate:stats(report.fixtures.map(r=>r.candidate))};
 save();console.log('fixtures',JSON.stringify(report.fixtureSummary));
 if(process.argv.includes('--fixtures-only'))return;
 for(let pair=0;pair<20;pair++)for(const candidatePlayer of [0,1]){
  if(report.games.some(g=>g.pair===pair&&g.candidatePlayer===candidatePlayer))continue;
  const seed=1001+pair;let state=E.createGame({firstPlayer:seed%2,random:seeded(seed)});
  const history={initial:E.getPublicState(state),events:[]},moves=[];
  const game={pair,seed,firstPlayer:seed%2,candidatePlayer,moves};
  while(state.status==='playing'&&moves.length<240){
   const view=E.getPublicState(state),legal=E.getLegalActions(view,view.turn),input=P.createBotInput(view,legal,history,seed^moves.length);
   const bot=view.turn===candidatePlayer?candidate:baseline,start=performance.now(),result=bot.chooseBot(input),ms=performance.now()-start;
   moves.push({player:view.turn,action:result.action,trace:result.trace,ms});
   if(!P.matchLegal(result.action,legal)){game.error='illegal/null';break;}
   const next=E.applyAction(state,state.turn,result.action);
   if(!next.ok){game.error='engine-rejected';break;}
   state=next.state;history.events.push(P.copyEvent(next.event));
  }
  game.result=state.result;game.outcome=game.error?'error':!state.result?'unfinished':state.result.outcome==='draw'?'draw':state.result.winner===candidatePlayer?'win':'loss';
  report.games.push(game);save();console.log(`pair ${pair+1}/20 player ${candidatePlayer}: ${game.outcome}, ${moves.length} plies`);
 }
 const tally=Object.fromEntries(['win','draw','loss','unfinished','error'].map(k=>[k,report.games.filter(g=>g.outcome===k).length]));
 const finished=tally.win+tally.draw+tally.loss,score=finished?(tally.win+.5*tally.draw)/finished:0;
 // Incomplete games have unknown points, never zero points disguised as a
 // strength interval. Only fully completed pairs enter the paired sign test.
 const pairScores=Array.from({length:20},(_,i)=>{const games=report.games.filter(g=>g.pair===i);return games.some(g=>!g.result)?null:games.reduce((sum,g)=>sum+(g.outcome==='win'?1:g.outcome==='draw'?.5:0),0)/2;});
 const positive=pairScores.filter(s=>s!==null&&s>.5).length,negative=pairScores.filter(s=>s!==null&&s<.5).length,n=positive+negative;
 let cumulative=1,term=1;for(let k=1;k<=Math.min(positive,negative);k++){term*= (n-k+1)/k;cumulative+=term;}
 report.matchSummary={...tally,finished,score,pairScores,completedPairSignTest:{positive,negative,twoSidedP:n?Math.min(1,2*cumulative/2**n):1},
  scoreBoundsWithUnfinished:[(tally.win+.5*tally.draw)/40,(tally.win+.5*tally.draw+tally.unfinished)/40],
  limitations:'20 fixed shuffle seeds; unfinished games remain unknown. Completion bounds are not confidence intervals. The sign test excludes incomplete pairs; it cannot remove that uncertainty.'};
 report.pass=improvements.length>=2&&!report.fixtureSummary.candidateFailures.length&&finished>=36&&score>=.5&&!tally.error;
 save();console.log(JSON.stringify({pass:report.pass,fixtures:report.fixtureSummary,match:report.matchSummary},null,2));
 if(!report.pass)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
