import { executeMatch } from './service.mjs';
const ORIGINS = new Set(['https://vesperkrock.github.io','http://localhost:5500','http://127.0.0.1:5500','http://localhost:8080','http://127.0.0.1:8080']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS = { INVALID_INPUT:400, NOT_FOUND:404, NOT_READY:409, REQUEST_CONFLICT:409,
  STALE_VERSION:409, NOT_YOUR_TURN:409, GAME_OVER:409, INVALID_ACTION:400, ILLEGAL_ACTION:409,
  ACTIVE_MATCH_EXISTS:409, RECEIPT_LIMIT:429, RATE_LIMIT:429, UNAVAILABLE:503 };
const fail = (status,error) => Response.json({ok:false,error},{status});
async function readBody(request) {
  if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json') return null;
  const reader=request.body?.getReader();if(!reader)return null;
  let size=0;const chunks=[];
  try{
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;
      if(size>1024){await reader.cancel();return null;}chunks.push(value);}
    const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }catch{return null;}finally{reader.releaseLock();}
}
export function createMatchHandler(withSupabase,{url,env}={}) {
  if(!url)throw Error('Supabase URL required');
  const authenticated=withSupabase({auth:'user',audience:'authenticated',issuer:url.replace(/\/$/,'')+'/auth/v1',
    cors:'disabled',errors:{detailed:false},...(env?{env}:{})},async(request,ctx)=>{
    if(ctx.authMode!=='user'||ctx.userClaims?.role!=='authenticated'||!UUID.test(ctx.userClaims?.id??''))return fail(401,'UNAUTHENTICATED');
    const body=await readBody(request);if(!body)return fail(400,'INVALID_INPUT');
    const result=await executeMatch(ctx.supabaseAdmin,ctx.userClaims.id,body);
    if(result?.ok!==true){
      const code=Object.hasOwn(STATUS,result?.error??'')?result.error:'UNAVAILABLE';
      return Response.json({ok:false,error:code,...(code==='RATE_LIMIT'?{retryAfter:Math.min(60,Math.max(1,Number(result.retryAfter)||60))}:{})},{status:STATUS[code]});
    }
    // The only successful service shape contains a public projection, never read context.
    return Response.json({ok:true,match:result.match});
  });
  return async request=>{
    const origin=request.headers.get('origin'),headers={'Cache-Control':'no-store',Vary:'Origin'};
    if(origin&&!ORIGINS.has(origin))return new Response(null,{status:403,headers});
    if(origin)headers['Access-Control-Allow-Origin']=origin;
    let response;
    if(request.method==='OPTIONS'){
      const requested=(request.headers.get('access-control-request-headers')??'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
      if(request.headers.get('access-control-request-method')!=='POST'||requested.some(x=>!['authorization','apikey','content-type','x-client-info'].includes(x)))response=fail(403,'CORS_DENIED');
      else{headers['Access-Control-Allow-Methods']='POST, OPTIONS';headers['Access-Control-Allow-Headers']='authorization, apikey, content-type, x-client-info';response=new Response(null,{status:204});}
    }else if(request.method!=='POST'){headers.Allow='POST, OPTIONS';response=fail(405,'METHOD_NOT_ALLOWED');}
    else if(new URL(request.url).search)response=fail(400,'INVALID_INPUT');
    else{try{response=await authenticated(request);}catch{response=fail(503,'UNAVAILABLE');}}
    const outgoing=new Response(response.body,response);for(const [key,value]of Object.entries(headers))outgoing.headers.set(key,value);
    return outgoing;
  };
}
