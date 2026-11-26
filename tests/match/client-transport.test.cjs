const test=require('node:test'),assert=require('node:assert/strict');
test('Match and lobby reuse one SDK/session; no second Auth client or anonymous sign-in',async()=>{
  const {createOnlineAuth}=await import('../../js/online-auth.mjs');let clients=0;const calls=[];
  const auth=createOnlineAuth({loadSdk:async()=>({createClient:()=>{clients++;return {auth:{getSession:async()=>({data:{session:{}}})},functions:{invoke:async(name,opts)=>{calls.push({name,...opts});return {data:{ok:true,match:null}};}}};}})});
  const signal=new AbortController().signal,body={op:'getMine'};
  await auth.matchAction(body,{signal});await auth.roomAction({action:'getMine'});
  assert.equal(clients,1);assert.deepEqual(calls[0],{name:'banqi-match',method:'POST',body,signal});assert.equal(calls[1].name,'banqi-rooms');
});
test('Match errors retain only stable codes, never raw server data',async()=>{
  const {createOnlineAuth}=await import('../../js/online-auth.mjs');
  for(const code of ['STALE_VERSION','NOT_YOUR_TURN','ILLEGAL_ACTION','GAME_OVER','NOT_FOUND','REQUEST_CONFLICT','raw private error']){
    const auth=createOnlineAuth({loadSdk:async()=>({createClient:()=>({auth:{getSession:async()=>({data:{session:{}}})},functions:{invoke:async()=>({error:{context:Response.json({error:code},{status:409})}})}})})});
    await assert.rejects(auth.matchAction({op:'getMine'}),{code:code.startsWith('raw')?'UNAVAILABLE':code});
  }
});
