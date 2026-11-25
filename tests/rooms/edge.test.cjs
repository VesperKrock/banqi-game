const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
test('Real JWT verifier rejects missing, malformed, forged and wrong-role callers',async()=>{
  const deps=require('../foundation/deps.cjs');
  const {withSupabase}=deps('@supabase/server'),{generateKeyPair,exportJWK,SignJWT}=deps('jose');
  const {createRoomsHandler}=await import('../../supabase/functions/banqi-rooms/handler.mjs');
  const {publicKey,privateKey}=await generateKeyPair('ES256'); let calls=0;
  const url='https://unit.supabase.co';
  const wrapper=(config,handler)=>withSupabase(config,(req,ctx)=>handler(req,{
    authMode:ctx.authMode,userClaims:ctx.userClaims,
    supabaseAdmin:{rpc:async()=>{calls++;return {data:{ok:true,room:null}};}}
  }));
  const handle=createRoomsHandler(wrapper,{url,env:{url,publishableKeys:{default:'sb_publishable_test'},secretKeys:{},
    jwks:{keys:[{...await exportJWK(publicKey),kid:'test'}]}}});
  const token=async(role='authenticated',exp='2m')=>new SignJWT({role}).setSubject(randomUUID()).setIssuer(url+'/auth/v1')
    .setAudience('authenticated').setExpirationTime(exp).setProtectedHeader({alg:'ES256',kid:'test'}).sign(privateKey);
  const invoke=jwt=>handle(new Request(url+'/rooms',{method:'POST',headers:{'content-type':'application/json',apikey:'sb_publishable_test',
    ...(jwt?{authorization:'Bearer '+jwt}:{})},body:JSON.stringify({action:'getMine'})}));
  for(const jwt of [null,'bad','sb_publishable_test',await token('service_role'),await token('authenticated',1)]) {
    assert.equal((await invoke(jwt)).status,401);
  }
  const good=await token(), forged=good.split('.');forged[1]=Buffer.from(JSON.stringify({sub:randomUUID(),role:'authenticated'})).toString('base64url');
  assert.equal((await invoke(forged.join('.'))).status,401);assert.equal(calls,0);
  assert.equal((await invoke(good)).status,200);assert.equal(calls,1);
});
test('Rooms Edge auth boundary, input limits and projection',async t=>{
  const {createRoomsHandler}=await import('../../supabase/functions/banqi-rooms/handler.mjs');
  const id=randomUUID(); let rpcCalls=0, captured;
  const room={roomId:randomUUID(),code:'004215',role:'host',seats:[true,false],lobbyStatus:'waiting',revision:0,expiresAt:new Date(Date.now()+1200000).toISOString()};
  let result={data:{ok:true,room:{...room,host_uid:id,state:'hidden',token:'never-return'}}};
  // Auth verification itself is separately exercised with real signed JWTs/live gate.
  const wrap=(config,handler)=>{assert.equal(config.auth,'user');assert.equal(config.audience,'authenticated');return req=>handler(req,{
    authMode:'user',userClaims:{id,role:'authenticated'},supabaseAdmin:{rpc:async(name,args)=>{rpcCalls++;captured={name,args};return result;}}
  });};
  const handle=createRoomsHandler(wrap,{url:'https://unit.supabase.co'});
  const request=(body,options={})=>new Request('https://unit.supabase.co/rooms',{method:'POST',body:JSON.stringify(body),...options,
    headers:{origin:'https://vesperkrock.github.io','content-type':'application/json',...options.headers}});
  await t.test('Verified UID only, strict public projection, no-store',async()=>{
    const res=await handle(request({action:'create',requestId:randomUUID()})); assert.equal(res.status,200);
    assert.deepEqual(await res.json(),{ok:true,room});assert.equal(captured.args.p_uid,id);assert.equal(captured.name,'banqi_room_action');
    assert.equal(res.headers.get('cache-control'),'no-store');
  });
  for(const body of [{action:'create',requestId:randomUUID(),uid:randomUUID()},{action:'getMine',roomId:room.roomId},
    {action:'join',requestId:randomUUID(),code:4215},{action:'join',requestId:randomUUID(),code:'0042157'},
    {action:'leave',requestId:randomUUID(),roomId:room.roomId,revision:-1}, {action:'start'},[],null]) {
    await t.test('Reject malformed or spoofed input '+JSON.stringify(body),async()=>{
      const before=rpcCalls;assert.equal((await handle(request(body))).status,400);assert.equal(rpcCalls,before);
    });
  }
  await t.test('Oversized streamed body and wrong content type rejected',async()=>{
    assert.equal((await handle(request({action:'create',padding:'x'.repeat(2000)}))).status,400);
    assert.equal((await handle(request({action:'getMine'},{headers:{'content-type':'text/plain'}}))).status,400);
  });
  await t.test('CORS rejects bad origin, methods and headers',async()=>{
    assert.equal((await handle(request({action:'getMine'},{headers:{origin:'https://evil.example'}}))).status,403);
    assert.equal((await handle(new Request('https://unit.supabase.co/rooms'))).status,405);
    const options=new Request('https://unit.supabase.co/rooms',{method:'OPTIONS',headers:{origin:'https://vesperkrock.github.io',
      'access-control-request-method':'POST','access-control-request-headers':'authorization,apikey,content-type,x-client-info'}});
    assert.equal((await handle(options)).status,204);
  });
  await t.test('Database errors never expose raw SQL and throttling is explicit',async()=>{
    result={error:{message:'secret SQL data'}};const failed=await handle(request({action:'getMine'}));assert.equal(failed.status,503);
    assert.deepEqual(await failed.json(),{ok:false,error:'UNAVAILABLE'});
    result={data:{ok:false,error:'RATE_LIMIT',retryAfter:123}};
    const limited=await handle(request({action:'getMine'}));assert.equal(limited.status,429);assert.equal((await limited.json()).retryAfter,123);
  });
});
