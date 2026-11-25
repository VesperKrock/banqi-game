// Explicit, bounded live gate: three Anonymous identities, tokens only in memory.
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID,createHash}=require('node:crypto');
const {createClient}=require('../foundation/deps.cjs')('@supabase/supabase-js');
(async()=>{
  assert.ok(process.argv.includes('--live'),'Explicit --live required');
  const {SUPABASE_URL:url,SUPABASE_PUBLISHABLE_KEY:key}=await import('../../js/online-config.mjs');
  const {getLegalActions}=await import('../../js/engine.mjs');
  const report={phase:'R5-02A',checks:[],accountsCreated:0,actions:{flip:0,move:0,capture:0},sourceHashes:{}},clients=[],tokens=[];
  for(const file of ['js/engine.mjs',...fs.readdirSync('supabase/functions/banqi-match').map(f=>'supabase/functions/banqi-match/'+f),'supabase/migrations/20261125000200_r5_02a_match.sql'])
    report.sourceHashes[file]=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const check=(name,ok)=>{assert.ok(ok,name);report.checks.push(name);};
  const req=async(token,body,{endpoint='banqi-match',...options}={})=>{
    const response=await fetch(url+'/functions/v1/'+endpoint,{method:'POST',body:JSON.stringify(body),...options,
      headers:{apikey:key,'content-type':'application/json',origin:'https://vesperkrock.github.io',...(token?{authorization:'Bearer '+token}:{}),...options.headers}});
    return {status:response.status,body:await response.json().catch(()=>null),cache:response.headers.get('cache-control')};
  };
  const call=(i,body,opts)=>req(tokens[i],body,opts);
  const lobby=(i,action,extra={})=>call(i,{action,...(action==='getMine'?{}:{requestId:randomUUID()}),...extra},{endpoint:'banqi-rooms'});
  const snapshot=(i,roomId)=>call(i,{op:'snapshot',roomId});
  const same=(a,b)=>assert.deepEqual(a,b);
  const idx=c=>(Number(c[1])-1)*8+'abcdefgh'.indexOf(c[0]);
  const privacy=match=>{
    assert.deepEqual(Object.keys(match).sort(),['event','player','roomId','snapshot','version']);
    const s=match.snapshot;assert.equal(s.board.length,32);
    for(const p of s.board)if(p?.faceDown)same(p,{occupied:true,faceDown:true});
    assert.ok(!/"(?:state|candidateState|seed|positionCounts|host_uid|guest_uid|uid)"\s*:/.test(JSON.stringify(match)));
  };
  let roomId,last,firstReceipt,firstCommand,firstActor;
  try{
    for(let i=0;i<3;i++){
      const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});clients.push(client);
      const {data,error}=await client.auth.signInAnonymously();if(error||!data.session)throw Error('LIVE_AUTH_FAILED');
      tokens.push(data.session.access_token);report.accountsCreated++;
    }
    const created=await lobby(0,'create');check('Host creates waiting lobby',created.status===200);roomId=created.body.room.roomId;
    check('Cannot start without second seat',(await call(0,{op:'start',roomId,requestId:randomUUID()})).body.error==='NOT_READY');
    check('Guest joins existing R5-01 lobby',(await lobby(1,'join',{code:created.body.room.code})).status===200);
    const startA={op:'start',roomId,requestId:randomUUID()},startB={...startA,requestId:randomUUID()};
    const started=await Promise.all([call(0,startA),call(1,startB)]);
    check('Concurrent two-seat start accepted once',started.every(r=>r.status===200&&r.body.match.version===0));
    same(started[0].body.match.snapshot,started[1].body.match.snapshot);
    check('Host/guest remain player 0/1',started[0].body.match.player===0&&started[1].body.match.player===1);
    for(const r of started){privacy(r.body.match);check('32 hidden identities omitted, response no-store',r.body.match.snapshot.board.every(p=>p.faceDown)&&r.cache==='no-store');}
    same((await call(0,startA)).body,started[0].body);check('Start receipt retries exactly',true);
    last=started[0].body.match;
    for(const op of ['snapshot','start','act']){
      const cmd={op,roomId,...(op==='snapshot'?{}:{requestId:randomUUID()}),...(op==='act'?{baseVersion:0,action:{type:'flip',at:'a1'}}:{})};
      const r=await call(2,cmd);check('Outsider '+op+' reveals no match',r.status===404&&!r.body.match&&r.body.error==='NOT_FOUND');
    }
    check('Outsider getMine empty',(await call(2,{op:'getMine'})).body.match===null);
    for(const [name,token] of [['missing',null],['malformed','bad'],['publishable',key]])check(name+' JWT denied',(await req(token,{op:'getMine'})).status===401);
    const forged=tokens[0].split('.'),claims=JSON.parse(Buffer.from(forged[1],'base64url'));claims.sub=randomUUID();forged[1]=Buffer.from(JSON.stringify(claims)).toString('base64url');
    check('Forged signature denied',(await req(forged.join('.'),{op:'getMine'})).status===401);
    check('Client identity/state fields denied',(await call(0,{op:'getMine',uid:randomUUID(),state:{}})).status===400);
    check('Oversized body denied',(await call(0,{op:'getMine',padding:'x'.repeat(2000)})).status===400);
    check('Untrusted Origin denied',(await call(0,{op:'getMine'},{headers:{origin:'https://evil.example'}})).status===403);
    check('Wrong turn denied',(await call(1-last.snapshot.turn,{op:'act',roomId,requestId:randomUUID(),baseVersion:0,action:{type:'flip',at:'h4'}})).body.error==='NOT_YOUR_TURN');
    check('Illegal move cannot change state',(await call(last.snapshot.turn,{op:'act',roomId,requestId:randomUUID(),baseVersion:0,action:{type:'move',from:'a1',to:'b1'}})).body.error==='ILLEGAL_ACTION');
    const actor=last.snapshot.turn,commands=['a1','b1'].map(at=>({op:'act',roomId,requestId:randomUUID(),baseVersion:0,action:{type:'flip',at}}));
    const race=await Promise.all(commands.map(c=>call(actor,c)));
    check('Live CAS: one accepted, one stale',race.filter(r=>r.status===200).length===1&&race.filter(r=>r.body.error==='STALE_VERSION').length===1);
    const winner=race.findIndex(r=>r.status===200);last=race[winner].body.match;firstReceipt=race[winner].body;firstCommand=commands[winner];firstActor=actor;report.actions.flip++;
    privacy(last);check('First flip maps colors, version exactly one',last.version===1&&last.snapshot.playerColors.every(Boolean));
    same((await call(actor,firstCommand)).body,firstReceipt);
    check('Changed payload with same receipt rejected',(await call(actor,{...firstCommand,action:{type:'flip',at:'h4'}})).body.error==='REQUEST_CONFLICT');
    check('Stale baseVersion rejected',(await call(last.snapshot.turn,{...firstCommand,requestId:randomUUID()})).body.error==='STALE_VERSION');
    const doubleActor=last.snapshot.turn,at='abcdefgh'.split('').map(c=>c+'4').find(c=>last.snapshot.board[idx(c)]?.faceDown);
    const duplicate={op:'act',roomId,requestId:randomUUID(),baseVersion:last.version,action:{type:'flip',at}};
    const doubled=await Promise.all([call(doubleActor,duplicate),call(doubleActor,duplicate)]);same(doubled[0].body,doubled[1].body);
    check('Double-submit same request returns one committed version',doubled.every(r=>r.status===200&&r.body.match.version===2));last=doubled[0].body.match;report.actions.flip++;
    const resumed=await call(0,{op:'getMine'});same(resumed.body.match.snapshot,last.snapshot);check('Independent reload/getMine restores version',resumed.body.match.version===2);
    const room=(await lobby(0,'getMine')).body.room;check('Active game leaves waiting-only lobby projection',room===null);
    check('Existing leave cannot free active guest',(await lobby(1,'leave',{roomId,revision:1})).body.error==='ROOM_UNAVAILABLE');
    check('Existing cancel cannot close active match',(await lobby(0,'cancel',{roomId,revision:1})).body.error==='ROOM_UNAVAILABLE');
    check('Active member cannot create another room',(await lobby(0,'create')).status!==200);
    for(const [name,token] of [['anon',null],['host',tokens[0]],['guest',tokens[1]],['outsider',tokens[2]]]){
      const headers={apikey:key,'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})};
      for(const [fn,body]of [['banqi_match_read',{p_uid:claims.sub,p_command:{op:'snapshot',roomId}}],['banqi_match_commit',{p_uid:claims.sub,p_command:firstCommand,p_revision:1,p_state:{},p_snapshot:{},p_event:{}}]]){
        const r=await fetch(url+'/rest/v1/rpc/'+fn,{method:'POST',headers,body:JSON.stringify(body)});check(name+' direct '+fn+' denied',[401,403].includes(r.status));await r.arrayBuffer();
      }
      for(const table of ['game_state','match_members','match_receipts']){
        const r=await fetch(url+'/rest/v1/'+table+'?limit=1',{headers:{...headers,'Accept-Profile':'banqi_private'}});check(name+' private REST '+table+' denied',[403,404,406].includes(r.status));await r.arrayBuffer();
      }
    }
    // Only public legal actions; no Bot code, private fixtures, seeds or SQL state writes.
    for(let ply=0;ply<220&&last.snapshot.status==='playing';ply++){
      const legal=getLegalActions(last.snapshot,last.snapshot.turn),moves=legal.filter(a=>a.type==='move');
      const captures=moves.filter(a=>last.snapshot.board[idx(a.to)]!==null),flips=legal.filter(a=>a.type==='flip');
      const action=(report.actions.move===0&&moves.find(a=>!last.snapshot.board[idx(a.to)]))||captures[0]||flips[0]||moves[0];assert.ok(action,'public legal action exists');
      const cmd={op:'act',roomId,requestId:randomUUID(),baseVersion:last.version,action};
      let r=await call(last.snapshot.turn,cmd);
      if(r.status===429&&r.body.error==='RATE_LIMIT'){await new Promise(resolve=>setTimeout(resolve,(Math.min(60,r.body.retryAfter)+1)*1000));r=await call(last.snapshot.turn,cmd);}
      assert.equal(r.status,200,'legal public action accepted');assert.equal(r.body.match.version,last.version+1);privacy(r.body.match);
      if(action.type==='flip')report.actions.flip++;else if(r.body.match.event.captured)report.actions.capture++;else report.actions.move++;
      last=r.body.match;
      if(ply%25===0)console.log(JSON.stringify({progressVersion:last.version,actions:report.actions,status:last.snapshot.status}));
    }
    check('Live flip/move/capture exercised',Object.values(report.actions).every(n=>n>0));
    const pair=await Promise.all([snapshot(0,roomId),snapshot(1,roomId)]);same(pair[0].body.match.snapshot,pair[1].body.match.snapshot);same(pair[0].body.match.snapshot,last.snapshot);
    check('Both seats converge after all accepted actions',pair.every(r=>r.body.match.version===last.version));
    same((await call(firstActor,firstCommand)).body,firstReceipt);check('Original receipt still exact after later moves',true);
    check('Game ends by engine, no forced state writes',last.snapshot.status==='finished'&&last.snapshot.result!==null);
    report.resultByEngine=last.snapshot.result;report.finalVersion=last.version;
    check('New move after finish denied',(await call(last.snapshot.turn,{op:'act',roomId,requestId:randomUUID(),baseVersion:last.version,action:{type:'flip',at:'h4'}})).body.error==='GAME_OVER');
    check('Start cannot reset finished match',(await call(1,{op:'start',roomId,requestId:randomUUID()})).body.match.version===last.version);
    await clients[2].realtime.setAuth(tokens[2]);
    const channel=clients[2].channel('banqi-r5-02a-private-audit',{config:{private:true}}).on('broadcast',{event:'test'},()=>{});
    const status=await new Promise(resolve=>{const timer=setTimeout(()=>resolve('TIMEOUT'),10000);channel.subscribe((s,e)=>{if(s==='SUBSCRIBED'||s==='CHANNEL_ERROR'){clearTimeout(timer);resolve(s==='CHANNEL_ERROR'&&e?'DENIED':s);}});});
    await clients[2].removeChannel(channel);check('Private Realtime remains denied',status==='DENIED');
    report.result='PASS';
  }catch(error){report.result='PARTIAL';report.failedCheck=error.code==='ERR_ASSERTION'?error.message.split('\n')[0]:'Live request failed';process.exitCode=1;}
  finally{
    report.finalStatus=last?.snapshot.status??null;
    for(const client of clients){await client.removeAllChannels();await client.auth.stopAutoRefresh();}
    const file='.local-qa/r5-02a/live-gameplay-'+Date.now()+'.json';fs.writeFileSync(file,JSON.stringify(report,null,2));
    console.log(JSON.stringify({result:report.result,checks:report.checks.length,accountsCreated:report.accountsCreated,actions:report.actions,finalStatus:report.finalStatus,failedCheck:report.failedCheck,evidence:file}));
  }
})().catch(()=>{console.error('Live gate initialization failed');process.exitCode=1;});
