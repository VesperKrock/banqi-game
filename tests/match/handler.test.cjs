const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const deps=require('../foundation/deps.cjs');
test('Match HTTP uses actual JWT verification, strict inputs and redacted failures',async t=>{
  const {withSupabase}=deps('@supabase/server'),{generateKeyPair,exportJWK,SignJWT}=deps('jose');
  const {createMatchHandler}=await import('../../supabase/functions/banqi-match/handler.mjs');
  const {publicKey,privateKey}=await generateKeyPair('ES256'),uid=randomUUID(),url='https://unit.supabase.co';let calls=0;
  let result={data:{ok:true,match:null}};
  const wrapper=(config,handler)=>withSupabase(config,(request,ctx)=>handler(request,{authMode:ctx.authMode,userClaims:ctx.userClaims,
    supabaseAdmin:{rpc:async(name,args)=>{calls++;assert.equal(args.p_uid,uid);assert.equal(name,'banqi_match_read');return result;}}}));
  const handler=createMatchHandler(wrapper,{url,env:{url,publishableKeys:{default:'sb_publishable_test'},secretKeys:{},jwks:{keys:[{...await exportJWK(publicKey),kid:'test'}]}}});
  const token=async(role='authenticated',expiry='2m')=>new SignJWT({role}).setSubject(uid).setIssuer(url+'/auth/v1').setAudience('authenticated')
    .setExpirationTime(expiry).setProtectedHeader({alg:'ES256',kid:'test'}).sign(privateKey);
  const jwt=await token();
  const invoke=(body={op:'getMine'},bearer=jwt,opts={})=>handler(new Request(url+'/match',{method:'POST',body:JSON.stringify(body),...opts,
    headers:{'content-type':'application/json',origin:'https://vesperkrock.github.io',apikey:'sb_publishable_test',...(bearer?{authorization:'Bearer '+bearer}:{}),...opts.headers}}));
  await t.test('Valid user identity only and no-store',async()=>{const response=await invoke();assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,match:null});assert.equal(response.headers.get('cache-control'),'no-store');});
  await t.test('Missing/malformed/key-only/expired/wrong-role JWT never reaches RPC',async()=>{
    const before=calls;for(const bearer of [null,'bad','sb_publishable_test',await token('service_role'),await token('authenticated',1)])assert.equal((await invoke(undefined,bearer)).status,401);
    assert.equal(calls,before);
  });
  await t.test('Forged claims fail signature validation',async()=>{
    const parts=jwt.split('.');parts[1]=Buffer.from(JSON.stringify({sub:randomUUID(),role:'authenticated'})).toString('base64url');
    assert.equal((await invoke(undefined,parts.join('.'))).status,401);
  });
  await t.test('Spoof fields and oversized body rejected before RPC',async()=>{
    const before=calls;for(const extra of [{uid},{player:0},{privateState:{}},{padding:'x'.repeat(1500)}])assert.equal((await invoke({op:'getMine',...extra})).status,400);
    assert.equal(calls,before);
  });
  await t.test('Untrusted Origin/method rejected, exact preflight permitted',async()=>{
    assert.equal((await invoke(undefined,jwt,{headers:{origin:'https://evil.example'}})).status,403);
    assert.equal((await handler(new Request(url+'/match'))).status,405);
    assert.equal((await handler(new Request(url+'/match',{method:'OPTIONS',headers:{origin:'https://vesperkrock.github.io','access-control-request-method':'POST','access-control-request-headers':'authorization,apikey,content-type'}}))).status,204);
  });
  await t.test('SQL errors redacted; rate limit forwarded safely',async()=>{
    result={error:{message:'raw private SQL'}};assert.deepEqual(await (await invoke()).json(),{ok:false,error:'UNAVAILABLE'});
    result={data:{ok:false,error:'RATE_LIMIT',retryAfter:50}};const response=await invoke();assert.equal(response.status,429);assert.equal((await response.json()).retryAfter,50);
  });
});
