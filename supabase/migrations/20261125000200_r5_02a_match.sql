-- Backend only. New objects are private or executable only by service_role.
begin;
select pg_advisory_xact_lock(5020001);
alter table banqi_private.game_state add column public_snapshot jsonb;
alter table banqi_private.game_state add column public_event jsonb;
create table banqi_private.match_members (
  uid uuid primary key references auth.users(id),
  room_id uuid not null references banqi_private.rooms(id),
  active boolean not null default true
);
create table banqi_private.match_receipts (
  uid uuid not null references auth.users(id),
  room_id uuid not null references banqi_private.rooms(id),
  request_id uuid not null,
  command jsonb not null,
  response jsonb not null,
  primary key(uid, room_id, request_id)
);
alter table banqi_private.match_members enable row level security;
alter table banqi_private.match_members force row level security;
alter table banqi_private.match_receipts enable row level security;
alter table banqi_private.match_receipts force row level security;

-- Existing lobby RPC is unchanged. Its per-UID advisory lock is also held by
-- match start. This guard protects seats and excludes new lobbies while active.
create function banqi_private.guard_match_seats() returns trigger
language plpgsql security definer set search_path='' as $fn$
begin
  if tg_op='UPDATE' and old.status in ('active','finished') and
    (new.host_uid is distinct from old.host_uid or new.guest_uid is distinct from old.guest_uid
      or new.status not in ('active','finished')) then
    raise exception 'MATCH_SEATS_LOCKED';
  end if;
  if new.status in ('waiting','active') and exists(select 1 from banqi_private.match_members
    where active and uid in (new.host_uid,new.guest_uid) and room_id<>new.id) then
    raise exception 'ACTIVE_MATCH_EXISTS';
  end if;
  return new;
end
$fn$;
create trigger guard_match_seats before insert or update on banqi_private.rooms
for each row execute function banqi_private.guard_match_seats();

create function public.banqi_match_read(p_uid uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare r banqi_private.rooms; g banqi_private.game_state; receipt banqi_private.match_receipts;
  op text:=p_command->>'op'; rid uuid; wait integer;
begin
  if p_uid is null or op is null or op not in ('start','getMine','snapshot','act') then
    return jsonb_build_object('ok',false,'error','INVALID_INPUT'); end if;
  wait:=banqi_private.lobby_limit('match:'||p_uid::text,60,120);
  if wait>0 then return jsonb_build_object('ok',false,'error','RATE_LIMIT','retryAfter',wait); end if;
  if op='getMine' then
    select rooms.* into r from banqi_private.rooms rooms join banqi_private.game_state gs on gs.room_id=rooms.id
      where rooms.host_uid=p_uid or rooms.guest_uid=p_uid
      order by (rooms.status='active') desc,gs.updated_at desc limit 1;
    if not found then return jsonb_build_object('ok',true,'match',null); end if;
  else
    select * into r from banqi_private.rooms where id=(p_command->>'roomId')::uuid;
    if not found or (r.host_uid<>p_uid and r.guest_uid is distinct from p_uid) then
      return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  end if;
  if op in ('start','act') then
    rid:=(p_command->>'requestId')::uuid;
    select * into receipt from banqi_private.match_receipts where uid=p_uid and room_id=r.id and request_id=rid;
    if found then
      if receipt.command<>p_command then return jsonb_build_object('ok',false,'error','REQUEST_CONFLICT'); end if;
      return jsonb_build_object('ok',true,'replay',receipt.response);
    end if;
  end if;
  select * into g from banqi_private.game_state where room_id=r.id;
  if g.room_id is null and (op<>'start' or r.status<>'waiting' or r.expires_at<=clock_timestamp() or r.guest_uid is null) then
    return jsonb_build_object('ok',false,'error','NOT_READY'); end if;
  return jsonb_build_object('ok',true,'roomId',r.id,'player',case when r.host_uid=p_uid then 0 else 1 end,
    'revision',r.lobby_revision,'version',g.version,'state',g.state,'event',g.public_event);
end
$fn$;

create function public.banqi_match_commit(p_uid uuid,p_command jsonb,p_revision integer,
  p_state jsonb,p_snapshot jsonb,p_event jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare r banqi_private.rooms; g banqi_private.game_state; receipt banqi_private.match_receipts;
  response jsonb; member uuid; op text:=p_command->>'op'; rid uuid:=(p_command->>'requestId')::uuid;
  player integer;
begin
  if p_uid is null or rid is null or op is null or op not in ('start','act') then
    return jsonb_build_object('ok',false,'error','INVALID_INPUT'); end if;
  -- Discover membership, then lock actors in one order BEFORE locking the room.
  select * into r from banqi_private.rooms where id=(p_command->>'roomId')::uuid;
  if not found or (r.host_uid<>p_uid and r.guest_uid is distinct from p_uid) then
    return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  for member in select x from unnest(array[r.host_uid,r.guest_uid]) x where x is not null order by x loop
    perform pg_advisory_xact_lock(hashtextextended(member::text,5101));
  end loop;
  select * into r from banqi_private.rooms where id=r.id for update;
  if r.host_uid<>p_uid and r.guest_uid is distinct from p_uid then
    return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  player:=case when r.host_uid=p_uid then 0 else 1 end;
  select * into receipt from banqi_private.match_receipts where uid=p_uid and room_id=r.id and request_id=rid;
  if found then
    if receipt.command<>p_command then return jsonb_build_object('ok',false,'error','REQUEST_CONFLICT'); end if;
    return receipt.response;
  end if;
  -- Bound durable receipts; accepted receipts are never evicted, even at finish.
  if (select count(*) from banqi_private.match_receipts where room_id=r.id)>=16384 then
    return jsonb_build_object('ok',false,'error','RECEIPT_LIMIT'); end if;
  select * into g from banqi_private.game_state where room_id=r.id for update;
  if op='start' and g.room_id is null then
    if r.status<>'waiting' or r.guest_uid is null or r.expires_at<=clock_timestamp() or r.lobby_revision<>p_revision then
      return jsonb_build_object('ok',false,'error','NOT_READY'); end if;
    if exists(select 1 from banqi_private.match_members where active and uid in (r.host_uid,r.guest_uid) and room_id<>r.id) then
      return jsonb_build_object('ok',false,'error','ACTIVE_MATCH_EXISTS'); end if;
    if p_state->>'status' is distinct from 'playing' or p_snapshot is null then
      return jsonb_build_object('ok',false,'error','INVALID_CANDIDATE'); end if;
    insert into banqi_private.game_state(room_id,version,state,public_snapshot,public_event)
      values(r.id,0,p_state,p_snapshot,null) returning * into g;
    insert into banqi_private.match_members(uid,room_id,active) values(r.host_uid,r.id,true),(r.guest_uid,r.id,true)
      on conflict(uid) do update set room_id=excluded.room_id,active=true;
    update banqi_private.rooms set status='active' where id=r.id;
  elsif op='act' then
    if g.room_id is null or r.status<>'active' or g.state->>'status'<>'playing' then
      return jsonb_build_object('ok',false,'error','GAME_OVER'); end if;
    if g.version<>(p_command->>'baseVersion')::bigint then
      return jsonb_build_object('ok',false,'error','STALE_VERSION'); end if;
    if (g.state->>'turn')::integer<>player then return jsonb_build_object('ok',false,'error','NOT_YOUR_TURN'); end if;
    if p_state is null or p_snapshot is null or p_event is null then
      return jsonb_build_object('ok',false,'error','INVALID_CANDIDATE'); end if;
    update banqi_private.game_state set state=p_state,public_snapshot=p_snapshot,public_event=p_event,
      version=version+1,updated_at=clock_timestamp() where room_id=r.id returning * into g;
    if p_state->>'status'='finished' then
      update banqi_private.rooms set status='finished' where id=r.id;
      update banqi_private.match_members set active=false where room_id=r.id;
    end if;
  end if;
  response:=jsonb_build_object('ok',true,'match',jsonb_build_object('roomId',r.id,'player',player,
    'version',g.version,'snapshot',g.public_snapshot,'event',g.public_event));
  insert into banqi_private.match_receipts(uid,room_id,request_id,command,response) values(p_uid,r.id,rid,p_command,response);
  return response;
end
$fn$;
revoke all on all tables in schema banqi_private from public,anon,authenticated;
revoke all on all functions in schema banqi_private from public,anon,authenticated;
revoke all on function public.banqi_match_read(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.banqi_match_commit(uuid,jsonb,integer,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.banqi_match_read(uuid,jsonb) to service_role;
grant execute on function public.banqi_match_commit(uuid,jsonb,integer,jsonb,jsonb,jsonb) to service_role;
commit;
