const test=require('node:test'),assert=require('node:assert/strict');
async function client({session=true,result={data:{ok:true,room:null}}}={}){
  const {createOnlineAuth}=await import('../../js/online-auth.mjs');let calls=0,options;
  const auth=createOnlineAuth({loadSdk:async()=>({createClient:()=>({auth:{getSession:async()=>({data:{session:session?{access_token:'test-only'}:null}})},
    functions:{invoke:async(name,opts)=>{assert.equal(name,'banqi-rooms');calls++;options=opts;return result;}}})})});
  return {auth,calls:()=>calls,options:()=>options};
}
test('Room transport uses SDK POST and abort signal with an existing session',async()=>{
  const x=await client(),signal=new AbortController().signal,body={action:'getMine'};
  assert.deepEqual(await x.auth.roomAction(body,{signal}),{ok:true,room:null});
  assert.deepEqual(x.options(),{method:'POST',body,signal});
});
test('No session means no room request and no new anonymous identity',async()=>{
  const x=await client({session:false});await assert.rejects(x.auth.roomAction({action:'getMine'}),{code:'AUTH_REQUIRED'});assert.equal(x.calls(),0);
});
test('Known server error retains safe code and bounded retry time',async()=>{
  const x=await client({result:{error:{context:Response.json({error:'RATE_LIMIT',retryAfter:61},{status:429})}}});
  await assert.rejects(x.auth.roomAction({action:'getMine'}),{code:'RATE_LIMIT',retryAfter:61});
});
test('Unknown SQL/error text never reaches the UI',async()=>{
  const x=await client({result:{error:{context:Response.json({error:'raw database credentials'},{status:500})}}});
  await assert.rejects(x.auth.roomAction({action:'getMine'}),{code:'UNAVAILABLE',message:'UNAVAILABLE'});
});
test('Expired JWT returns auth error, never retries without authentication',async()=>{
  const x=await client({result:{error:{context:Response.json({error:'expired'},{status:401})}}});
  await assert.rejects(x.auth.roomAction({action:'getMine'}),{code:'AUTH_REQUIRED'});assert.equal(x.calls(),1);
});
