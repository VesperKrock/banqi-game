// Explicit live security gate. Tokens stay in memory; logs contain check names only.
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {createClient}=require('../foundation/deps.cjs')('@supabase/supabase-js');
(async()=>{
  assert.ok(process.argv.includes('--live'),'Explicit --live required');
  const {SUPABASE_URL:url,SUPABASE_PUBLISHABLE_KEY:key}=await import('../../js/online-config.mjs');
  const report={phase:'R5-01',checks:[],accountsCreated:0},clients=[],tokens=[];
  const check=(name,ok)=>{assert.ok(ok,name);report.checks.push(name);};
  const req=async(token,body,options={})=>{
    const response=await fetch(url+'/functions/v1/banqi-rooms',{method:'POST',body:JSON.stringify(body),...options,
      headers:{apikey:key,'content-type':'application/json',origin:'https://vesperkrock.github.io',
        ...(token?{authorization:'Bearer '+token}:{}),...options.headers}});
    return {status:response.status,body:await response.json().catch(()=>null)};
  };
  const call=(i,action,extra={})=>req(tokens[i],{action,...(action==='getMine'?{}:{requestId:randomUUID()}),...extra});
  const target=room=>({roomId:room.roomId,revision:room.revision});
  const projection=room=>room&&Object.keys(room).sort().join(',')==='code,expiresAt,lobbyStatus,revision,role,roomId,seats';
  const cleanupHosts=[];
  try{
    // A/B/C plus D host and seven additional racing guests = eleven independent identities.
    for(let i=0;i<11;i++){
      const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      clients.push(client);const {data,error}=await client.auth.signInAnonymously();
      if(error||!data.session)throw Error('LIVE_AUTH_FAILED');
      tokens.push(data.session.access_token);report.accountsCreated++;
    }
    const rid=randomUUID(),created=await call(0,'create',{requestId:rid});
    check('A creates six-digit room',created.status===200&&/^\d{6}$/.test(created.body?.room?.code));
    let room=created.body.room;cleanupHosts.push(0);
    check('20-minute TTL and host projection',projection(room)&&room.role==='host'&&Date.parse(room.expiresAt)>Date.now()+1180000);
    const retry=await call(0,'create',{requestId:rid});check('Create retry returns same room',retry.body.room.roomId===room.roomId);
    const joined=await call(1,'join',{code:room.code});check('B joins as guest',joined.status===200&&joined.body.room.role==='guest');
    let full=(await call(0,'getMine')).body.room;
    check('Both members see full lobby, no game state',projection(full)&&full.lobbyStatus==='full'&&joined.body.room.lobbyStatus==='full');
    const third=await call(2,'join',{code:room.code});check('C gets full error without room disclosure',third.status===409&&third.body.error==='ROOM_FULL'&&!third.body.room);
    check('C cannot get somebody else room',(await call(2,'getMine')).body.room===null);
    check('Guest cannot cancel host room',(await call(1,'cancel',target(full))).status===403);
    check('Host cannot use guest leave',(await call(0,'leave',target(full))).status===403);
    check('Outsider cannot cancel',(await call(2,'cancel',target(full))).status===404);
    check('Stale host action rejected',(await call(0,'cancel',target(room))).body.error==='STALE_ROOM');
    const leaveId=randomUUID();check('Guest leave accepted',(await call(1,'leave',{...target(full),requestId:leaveId})).status===200);
    check('Seat becomes vacant',(await call(0,'getMine')).body.room.seats[1]===false);
    check('Guest can rejoin',(await call(1,'join',{code:room.code})).status===200);
    check('Old leave replay never ejects rejoined guest',(await call(1,'leave',{...target(full),requestId:leaveId})).body.room?.role==='guest');
    check('Different old leave is stale',(await call(1,'leave',target(full))).body.error==='STALE_ROOM');
    for(const [name,token] of [['missing',null],['malformed','bad'],['publishable',key]]){
      check(name+' JWT rejected',(await req(token,{action:'getMine'})).status===401);
    }
    const forged=tokens[0].split('.');const claims=JSON.parse(Buffer.from(forged[1],'base64url'));claims.sub=randomUUID();
    forged[1]=Buffer.from(JSON.stringify(claims)).toString('base64url');
    check('Forged JWT rejected',(await req(forged.join('.'),{action:'getMine'})).status===401);
    check('Caller-supplied uid rejected',(await call(2,'create',{uid:randomUUID()})).status===400);
    check('Untrusted Origin rejected',(await req(tokens[0],{action:'getMine'},{headers:{origin:'https://evil.example'}})).status===403);
    check('Oversized input rejected',(await call(0,'getMine',{padding:'x'.repeat(2000)})).status===400);
    const rpcBody={p_uid:randomUUID(),p_action:'getMine'};
    for(const [name,token] of [['anon',null],['A',tokens[0]],['B',tokens[1]],['C',tokens[2]]]){
      const headers={apikey:key,'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})};
      const rpc=await fetch(url+'/rest/v1/rpc/banqi_room_action',{method:'POST',headers,body:JSON.stringify(rpcBody)});
      check('Direct privileged RPC denied '+name,[401,403].includes(rpc.status));await rpc.arrayBuffer();
      for(const table of ['rooms','game_state','lobby_limits','lobby_requests']){
        const denied=await fetch(url+'/rest/v1/'+table+'?limit=1',{headers:{...headers,'Accept-Profile':'banqi_private'}});
        check('Private REST '+table+' denied '+name,[403,404,406].includes(denied.status));await denied.arrayBuffer();
      }
    }
    const other=(await call(3,'create')).body.room;cleanupHosts.push(3);
    const actors=[2,4,5,6,7,8,9,10];
    const race=await Promise.all(actors.map(i=>call(i,'join',{code:other.code})));
    check('Eight concurrent joins: exactly one guest',race.filter(r=>r.status===200).length===1&&race.filter(r=>r.body.error==='ROOM_FULL').length===7);
    check('Race host sees exactly two seats',(await call(3,'getMine')).body.room.seats.every(Boolean));
    check('Cancel race room',(await call(3,'cancel',target((await call(3,'getMine')).body.room))).status===200);
    full=(await call(0,'getMine')).body.room;
    check('Host cancellation closes room',(await call(0,'cancel',target(full))).status===200);
    check('B observes cancellation',(await call(1,'getMine')).body.room===null);
    check('Old code unavailable',(await call(1,'join',{code:room.code})).body.error==='ROOM_UNAVAILABLE');
    check('Old create replay cannot resurrect room',(await call(0,'create',{requestId:rid})).body.room===null);
    let limited;
    for(let i=0;i<7;i++){limited=await call(2,'join',{code:'999999'});if(limited.status===429)break;}
    check('Server throttles repeated guesses',limited.status===429&&limited.body.retryAfter>0);
    check('Refresh/new request ID does not reset limit',(await call(2,'join',{code:'999998'})).status===429);
    await clients[0].realtime.setAuth(tokens[0]);
    const channel=clients[0].channel('banqi-r5-01-private-audit',{config:{private:true}}).on('broadcast',{event:'test'},()=>{});
    const status=await new Promise(resolve=>{const timer=setTimeout(()=>resolve('TIMEOUT'),10000);channel.subscribe((s,e)=>{
      if(s==='SUBSCRIBED'||s==='CHANNEL_ERROR'){clearTimeout(timer);resolve(s==='CHANNEL_ERROR'&&e?'DENIED':s);}
    });});
    await clients[0].removeChannel(channel);check('Private Realtime remains denied',status==='DENIED');
    report.result='PASS';
  }catch(error){report.result='PARTIAL';report.failedCheck=error.code==='ERR_ASSERTION'?error.message.split('\n')[0]:'Live request failed';process.exitCode=1;}
  finally{
    for(const i of cleanupHosts){try{const mine=(await call(i,'getMine')).body?.room;if(mine?.role==='host')await call(i,'cancel',target(mine));}catch{}}
    for(const client of clients){await client.removeAllChannels();await client.auth.stopAutoRefresh();}
    const file='.local-qa/r5-01/live-security-'+Date.now()+'.json';fs.writeFileSync(file,JSON.stringify(report,null,2));
    console.log(JSON.stringify({result:report.result,checks:report.checks.length,accountsCreated:report.accountsCreated,failedCheck:report.failedCheck,evidence:file}));
  }
})().catch(()=>{console.error('Live security initialization failed');process.exitCode=1;});
