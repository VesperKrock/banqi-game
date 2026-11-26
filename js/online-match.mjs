import { onlineAuth } from './online-auth.mjs';
import { getLegalActions } from './engine.mjs';

const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const player = v => v === 0 || v === 1;
const count = v => Number.isSafeInteger(v) && v >= 0;
const coord = v => typeof v === 'string' && /^[a-h][1-4]$/.test(v);
const color = v => v === 'red' || v === 'black';
const kind = v => ['general','advisor','elephant','rook','horse','cannon','pawn'].includes(v);
const piece = v => exact(v,['color','type']) && color(v.color) && kind(v.type);
const list = (v, check, max=256) => Array.isArray(v) && v.length<=max && v.every(check);
const visibleId = v => typeof v === 'string' && /^v[0-9]{1,3}$/.test(v);
const pair = v => v && visibleId(v.attackerId) && visibleId(v.targetId) && coord(v.attackerAt) && coord(v.targetAt);
const pairKeys = ['attackerId','targetId','attackerAt','targetAt'];
export const readAction = a => exact(a,['type','at']) && a.type==='flip' && coord(a.at) ? {type:'flip',at:a.at} :
  exact(a,['type','from','to']) && a.type==='move' && coord(a.from) && coord(a.to) ? {type:'move',from:a.from,to:a.to} : null;
const winReasons = ['all_pieces_captured','no_legal_actions','chase_technical_fouls'];
const drawReasons = ['threefold_repetition','no_progress_60'];
const result = v => v===null || exact(v,['outcome','winner','reason']) &&
  (v.outcome==='win' && player(v.winner) && winReasons.includes(v.reason) || v.outcome==='draw' && v.winner===null && drawReasons.includes(v.reason));
const eventOK = v => v===null || player(v?.player) && piece(v.piece) &&
  (v.type==='flip' && exact(v,['type','player','at','piece']) && coord(v.at) ||
    v.type==='move' && exact(v,['type','player','from','to','piece','captured']) && coord(v.from) && coord(v.to) && (v.captured===null || piece(v.captured)));
// Postgres JSONB receipts and Edge projections use different key orders.
// Canonicalize only after the entire response has passed the deep allowlist.
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v==='object'
  ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v;

// Reject extra fields rather than spreading a response into UI/storage. In
// particular a hidden square can never carry color/type/ID from any source.
export function readMatch(v) {
  if(v===null)return null;
  const s=v?.snapshot,c=s?.chase;
  if(!exact(v,['roomId','player','version','snapshot','event']) || !uuid(v.roomId) || !player(v.player) || !count(v.version) || !eventOK(v.event) ||
    !exact(s,['board','turn','playerColors','captured','status','result','noProgressPly','repetitionCount','drawRepetitionCount','chase']) ||
    !Array.isArray(s.board) || s.board.length!==32 || !s.board.every(p=>p===null || p?.occupied===true &&
      (p.faceDown===true && exact(p,['occupied','faceDown']) || p.faceDown===false && exact(p,['occupied','faceDown','color','type','visibleId']) && color(p.color)&&kind(p.type)&&visibleId(p.visibleId))) ||
    !player(s.turn) || !Array.isArray(s.playerColors) || s.playerColors.length!==2 ||
    !(s.playerColors.every(x=>x===null) || s.playerColors.every(color)&&s.playerColors[0]!==s.playerColors[1]) ||
    !list(s.captured,piece,32) || s.board.filter(Boolean).length+s.captured.length!==32 ||
    !['playing','finished'].includes(s.status) || !result(s.result) || (s.status==='finished')!==(s.result!==null) ||
    ![s.noProgressPly,s.repetitionCount,s.drawRepetitionCount].every(count) ||
    !exact(c,['faults','runs','drawDeferred','warnings']) || !list(c.faults,n=>count(n)&&n<=2,2) || c.faults.length!==2 ||
    !list(c.runs,r=>list(r,p=>exact(p,[...pairKeys,'count'])&&pair(p)&&count(p.count)),2) || c.runs.length!==2 ||
    !list(c.drawDeferred,d=>exact(d,['reason','player','pairs'])&&drawReasons.includes(d.reason)&&player(d.player)&&list(d.pairs,p=>exact(p,pairKeys)&&pair(p)),2) ||
    !list(c.warnings,w=>exact(w,['action','player','pairs','nextFault','losesGame'])&&readAction(w.action)?.type==='move'&&player(w.player)&&
      list(w.pairs,p=>exact(p,pairKeys)&&pair(p))&&[1,2].includes(w.nextFault)&&w.losesGame===(w.nextFault===2),128)) throw Error('INVALID_RESPONSE');
  return canonical(v);
}

const index = at => (Number(at[1])-1)*8+'abcdefgh'.indexOf(at[0]);
const samePiece = (a,b) => !!a && !a.faceDown && a.color===b?.color && a.type===b?.type;
// Presentation only. Gaps/reloads render final state without replaying history.
export function follows(before, after) {
  if(!before || after.roomId!==before.roomId || after.version!==before.version+1 || !after.event || after.event.player!==before.snapshot.turn)return false;
  const e=after.event,a=before.snapshot.board,b=after.snapshot.board;
  const changed=e.type==='flip'?[index(e.at)]:[index(e.from),index(e.to)];
  if(a.some((p,i)=>!changed.includes(i)&&JSON.stringify(p)!==JSON.stringify(b[i])))return false;
  if(e.type==='flip')return a[index(e.at)]?.faceDown===true&&samePiece(b[index(e.at)],e.piece);
  return samePiece(a[index(e.from)],e.piece)&&b[index(e.from)]===null&&samePiece(b[index(e.to)],e.piece)&&
    (e.captured===null ? a[index(e.to)]===null : samePiece(a[index(e.to)],e.captured));
}

const KEY='banqi-match-pending-v1';
const definitive=new Set(['INVALID_INPUT','NOT_FOUND','NOT_READY','REQUEST_CONFLICT','STALE_VERSION','NOT_YOUR_TURN','GAME_OVER','ILLEGAL_ACTION','ACTIVE_MATCH_EXISTS','RECEIPT_LIMIT']);
function pendingOK(b) {
  return uuid(b?.roomId)&&uuid(b.requestId)&&(b.op==='start'&&exact(b,['op','roomId','requestId']) ||
    b.op==='act'&&exact(b,['op','roomId','requestId','baseVersion','action'])&&count(b.baseVersion)&&!!readAction(b.action));
}
export function createMatchController({auth=onlineAuth,storage,onChange=()=>{},schedule=setTimeout,cancel=clearTimeout,now=Date.now,timeoutMs=8000}={}) {
  let active=false,visible=true,online=true,generation=0,timer,aborter,identity,pending=null,failures=0,cooldown=0;
  let state={match:null,phase:'closed',ready:false,busy:false,pending:false,error:null,retryAfter:0};
  const emit=patch=>{state={...state,...patch,pending:!!pending};onChange(structuredClone(state));};
  const clear=()=>{cancel(timer);timer=undefined;};
  const halt=()=>{clear();generation++;aborter?.abort();aborter=null;};
  const save=()=>{try{if(pending)storage?.setItem(KEY,JSON.stringify({uid:identity.id,body:pending}));else storage?.removeItem(KEY);}catch{/* In-memory retry is still exact. */}};
  function restore(){try{const value=JSON.parse(storage?.getItem(KEY)??'null');pending=value?.uid===identity.id&&pendingOK(value.body)?value.body:null;}catch{pending=null;}save();}
  function next(){clear();if(active&&visible&&online)timer=schedule(run,Math.max(cooldown-now(),failures?Math.min(30000,3000*2**Math.min(failures,4)):3000));}
  function accept(match){
    if(!match){if(state.match)throw Error('INVALID_RESPONSE');return;}
    if(state.match && (match.roomId!==state.match.roomId||match.player!==state.match.player))throw Error('INVALID_RESPONSE');
    if(state.match && match.version<state.match.version)return;
    if(state.match && match.version===state.match.version && JSON.stringify(match.snapshot)!==JSON.stringify(state.match.snapshot))throw Error('INVALID_RESPONSE');
    emit({match});
  }
  async function run(){
    clear();if(!active||!visible||!online||state.busy)return;
    if(now()<cooldown){next();return;}
    const gen=++generation;aborter=new AbortController();const requestAbort=aborter,signal=requestAbort.signal;
    emit({busy:true,phase:state.ready?'ready':'syncing',error:null,retryAfter:0});
    let timeout;
    const current=()=>{if(gen!==generation||signal.aborted)throw Object.assign(Error('CANCELLED'),{code:'CANCELLED'});};
    try{
      await Promise.race([(async()=>{
        if(!identity){const id=await auth.ensureIdentity();current();identity=id;restore();}
        if(pending){
          const command=structuredClone(pending),reply=await auth.matchAction(command,{signal});current();
          if(reply?.ok!==true)throw Error('INVALID_RESPONSE');const match=readMatch(reply.match);
          if(!match||match.roomId!==command.roomId||command.op==='act'&&match.version!==command.baseVersion+1)throw Error('INVALID_RESPONSE');
          accept(match);pending=null;save();
        }
        const reply=await auth.matchAction(state.match?{op:'snapshot',roomId:state.match.roomId}:{op:'getMine'},{signal});current();
        if(reply?.ok!==true)throw Error('INVALID_RESPONSE');accept(readMatch(reply.match));
      })(),new Promise((_,reject)=>{timeout=schedule(()=>{requestAbort.abort();reject(Object.assign(Error('TIMEOUT'),{code:'TIMEOUT'}));},timeoutMs);})]);
      if(gen!==generation)return;failures=0;cooldown=0;emit({phase:'ready',ready:true,busy:false,error:null});
    }catch(error){
      if(gen!==generation)return;
      const code=error.code??'INVALID_RESPONSE';
      if(definitive.has(code)){pending=null;save();}
      if(code==='AUTH_REQUIRED')identity=null;
      failures++;if(code==='RATE_LIMIT')cooldown=now()+Math.max(1,error.retryAfter||60)*1000;
      emit({phase:'error',ready:false,busy:false,error:code,retryAfter:Math.max(0,Math.ceil((cooldown-now())/1000))});
    }finally{cancel(timeout);if(gen===generation){aborter=null;next();}}
  }
  function begin(command){
    if(!active||!online||!visible||!state.ready||pending||now()<cooldown)return false;
    halt();pending={...command,requestId:crypto.randomUUID()};save();emit({ready:false,busy:false});run();return true;
  }
  return {
    start(){if(active)return;active=true;identity=null;emit({ready:false,busy:false});return run();},
    stop(){active=false;halt();emit({phase:'closed',ready:false,busy:false});},
    setVisible(value){visible=value;halt();emit({phase:'paused',ready:false,busy:false});if(value)return run();},
    setOnline(value){online=value;halt();emit({phase:value?'syncing':'offline',ready:false,busy:false,error:value?null:'OFFLINE'});if(value)return run();},
    startGame(room){return room?.role==='host'&&room.lobbyStatus==='full'&&room.seats?.every(Boolean)&&uuid(room.roomId)&&!state.match ? begin({op:'start',roomId:room.roomId}) : false;},
    act(input){const m=state.match,a=readAction(input);if(!m||!a||m.snapshot.status!=='playing'||m.snapshot.turn!==m.player||!getLegalActions(m.snapshot,m.player).some(x=>JSON.stringify(x)===JSON.stringify(a)))return false;
      return begin({op:'act',roomId:m.roomId,baseVersion:m.version,action:a});},
    retry:run,snapshot:()=>structuredClone(state),
  };
}
