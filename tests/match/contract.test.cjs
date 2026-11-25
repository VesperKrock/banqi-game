const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const base={op:'act',roomId:randomUUID(),requestId:randomUUID(),baseVersion:0,action:{type:'flip',at:'a1'}};
test('Strict request contract preserves exact coordinates and canonical payload identity',async()=>{
  const {parseCommand,commandFingerprint}=await import('../../supabase/functions/banqi-match/contract.mjs');
  assert.deepEqual(parseCommand(base),base);
  assert.equal(commandFingerprint({...base}),commandFingerprint({action:{at:'a1',type:'flip'},baseVersion:0,requestId:base.requestId,roomId:base.roomId,op:'act'}));
  assert.notEqual(commandFingerprint(base),commandFingerprint({...base,baseVersion:1}));
  for(const body of [{op:'getMine'},{op:'snapshot',roomId:base.roomId},{op:'start',roomId:base.roomId,requestId:base.requestId}])assert.deepEqual(parseCommand(body),body);
});
test('Identity/state injection, malformed shape, invalid coordinates/version fail closed',async()=>{
  const {parseCommand}=await import('../../supabase/functions/banqi-match/contract.mjs');
  for(const field of ['uid','player','color','turn','event','privateState','result','seed'])assert.equal(parseCommand({...base,[field]:'forged'}),null);
  for(const value of [-1,1.5,'0',Number.MAX_SAFE_INTEGER+1])assert.equal(parseCommand({...base,baseVersion:value}),null);
  for(const at of ['i1','a5','A1','a10',' a1',1,null])assert.equal(parseCommand({...base,action:{type:'flip',at}}),null);
  for(const body of [null,[],{}, {...base,roomId:'bad'}, {...base,action:{...base.action,color:'red'}}, {op:'getMine',uid:base.roomId}])assert.equal(parseCommand(body),null);
});
