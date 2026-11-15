"use strict";
// Reproducible, real wall-clock benchmark. No fake timers; results stay local.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict');
const {scenarios}=require('./helpers/bot-fixtures.cjs');
const launch=require('./helpers/chrome.cjs');
function stats(rows){const times=rows.map(r=>r.ms).sort((a,b)=>a-b);return {count:rows.length,median:times[Math.floor(times.length*.5)],p95:times[Math.ceil(times.length*.95)-1],max:times.at(-1),under1500:rows.filter(r=>r.ms<=1500).length,fallbacks:rows.filter(r=>r.source==='fallback').length};}
(async()=>{
 const B=await import('../js/bot.mjs'),P=await import('../js/bot-protocol.mjs'),E=await import('../js/engine.mjs');
 const cases=await scenarios(),seeds=[7,42,991,2026,65537],rows=[];
 function check(s,result){
  assert.ok(P.matchLegal(result.action,s.legal),s.name+' illegal/null');const key=P.actionKey(result.action),ex=s.expect;
  if(ex.required)assert.equal(key,ex.required,s.name);if(ex.from)assert.equal(result.action.from,ex.from,s.name);
  if(ex.forbidden)assert.ok(!ex.forbidden.includes(key),s.name+' forbidden '+key);
  if(ex.avoidWarning)assert.ok(!s.snapshot.chase.warnings.some(w=>P.actionKey(w.action)===key),s.name+' chase');
  if(ex.noDraw)assert.notEqual(E.applyAction(s.state,s.state.turn,result.action).state.result?.outcome,'draw',s.name);
 }
 for(const s of cases)for(const seed of seeds){const input=s.input(seed),start=performance.now(),result=B.chooseBot(input),ms=performance.now()-start;check(s,result);rows.push({name:s.name,seed,ms,source:result.trace.source,depth:result.trace.depth,nodes:result.trace.nodes});}
 const report={environment:{node:process.version,platform:process.platform,cpu:os.cpus()[0].model,logicalCPUs:os.cpus().length},positions:cases.length,seeds,node:{summary:stats(rows),rows},tacticalFixtures:cases.filter(s=>Object.keys(s.expect).length).map(s=>({name:s.name,criteria:s.expect})),tacticalFailures:0};
 const b=await launch({suite:'r4-benchmark'});
 try{
  await b.navigate();report.environment.chrome=(await b.send('Browser.getVersion')).product;
  const workload=cases.flatMap((s,index)=>seeds.map(seed=>({index,seed,input:s.input(seed)})));
  await b.evaluate(`window.benchWorkload=${JSON.stringify(workload)}`);
  for(const [name,rate,width,height] of [['chromeDesktop',1,1366,768],['chromeMobile6x',6,390,844]]){
   await b.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:rate>1});
   await b.send('Emulation.setCPUThrottlingRate',{rate});
   // Each batch stays below CDP's 10-second RPC limit.
   const timings=[];
   for(let offset=0;offset<workload.length;offset+=5){
    const batch=await b.evaluate(`(async()=>{const {createBotRunner}=await import('./js/bot-runner.mjs');const runner=createBotRunner(),rows=[];for(const item of window.benchWorkload.slice(${offset},${offset+5})){const start=performance.now();const result=await runner.request(item.input,{session:1,position:${offset}+rows.length});rows.push({index:item.index,seed:item.seed,ms:performance.now()-start,...result});}runner.cancel();return rows;})()`);
    for(const row of batch){check(cases[row.index],row);assert.equal(row.status,'ok');timings.push({name:cases[row.index].name,...row});}
   }
   report[name]={summary:stats(timings),rows:timings};
  }
  await b.send('Emulation.setCPUThrottlingRate',{rate:1});
  // CDP explicitly rejects CPU throttling on Worker targets in this Chrome.
  // Measure the SAME pure decision function on the throttled page separately;
  // do not mislabel the page-only mobile Worker run as a slow Worker CPU.
  report.environment.mobileThrottleScope='Page main thread only; Worker CDP reports Operation is only supported for pages, not workers';
  await b.send('Emulation.setCPUThrottlingRate',{rate:6});
  const slow=[];
  for(let offset=0;offset<workload.length;offset+=5){
   const batch=await b.evaluate(`(async()=>{const {chooseBot}=await import('./js/bot.mjs');return window.benchWorkload.slice(${offset},${offset+5}).map(item=>{const start=performance.now(),result=chooseBot(item.input);return {index:item.index,seed:item.seed,ms:performance.now()-start,action:result.action,source:result.trace.source,depth:result.trace.depth};});})()`);
   for(const row of batch){check(cases[row.index],row);slow.push({name:cases[row.index].name,...row});}
  }
  report.chromeCpu6xAlgorithm={summary:stats(slow),rows:slow};
  await b.send('Emulation.setCPUThrottlingRate',{rate:1});
  assert.deepEqual(b.errors,[]);report.errors=b.errors;
  const dir=path.resolve('.local-qa/r4-bot');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'benchmark-'+Date.now()+'.json');fs.writeFileSync(file,JSON.stringify(report,null,2));
  const summary=Object.fromEntries(['node','chromeDesktop','chromeMobile6x','chromeCpu6xAlgorithm'].map(k=>[k,report[k].summary]));
  console.log(JSON.stringify({environment:report.environment,positions:cases.length,seeds:seeds.length,summary,tacticalFailures:0,report:file},null,2));
  for(const group of Object.values(summary)){assert.ok(group.p95<=3000,'p95 performance gate');assert.ok(group.under1500>=group.count*.9,'90% within 1.5 s target');}
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
