-- Additive lobby-only checkpoint. R5-00 storage remains private and unexposed.
begin;
select pg_advisory_xact_lock(5020001);
do $guard$
begin
  if to_regclass('banqi_private.rooms') is null
    or to_regclass('banqi_private.lobby_limits') is not null
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='banqi_room_action') then
    raise exception 'R5-01 baseline/conflict: inspect migration history before proceeding';
  end if;
  if exists(select 1 from pg_publication where puballtables) then
    raise exception 'Private storage cannot use a FOR ALL TABLES publication';
  end if;
end
$guard$;

alter table banqi_private.rooms add column lobby_revision integer not null default 0 check(lobby_revision >= 0);
create index rooms_waiting_host on banqi_private.rooms(host_uid, expires_at) where status='waiting';
create index rooms_waiting_guest on banqi_private.rooms(guest_uid, expires_at) where status='waiting';

create table banqi_private.lobby_limits (
  bucket text not null,
  seconds integer not null check(seconds in (60,3600)),
  started_at timestamptz not null,
  used integer not null check(used > 0),
  primary key(bucket, seconds)
);
create table banqi_private.lobby_requests (
  uid uuid not null references auth.users(id),
  request_id uuid not null,
  input jsonb not null,
  error_code text,
  created_at timestamptz not null default now(),
  primary key(uid, request_id)
);
alter table banqi_private.lobby_limits enable row level security;
alter table banqi_private.lobby_limits force row level security;
alter table banqi_private.lobby_requests enable row level security;
alter table banqi_private.lobby_requests force row level security;
revoke all on banqi_private.lobby_limits, banqi_private.lobby_requests from public, anon, authenticated;
grant select, insert, update on banqi_private.lobby_limits, banqi_private.lobby_requests to service_role;

-- Fixed windows start on first use, counters persist across Edge instances/reloads.
-- Return errors as JSON (not SQL exceptions) so consumed limits COMMIT on failure.
create function banqi_private.lobby_limit(p_bucket text, p_seconds integer, p_max integer)
returns integer language plpgsql set search_path='' as $fn$
declare v_row banqi_private.lobby_limits; v_now timestamptz := clock_timestamp();
begin
  insert into banqi_private.lobby_limits as l(bucket,seconds,started_at,used)
  values(p_bucket,p_seconds,v_now,1)
  on conflict(bucket,seconds) do update set
    started_at=case when l.started_at + make_interval(secs=>p_seconds) <= v_now then v_now else l.started_at end,
    used=case when l.started_at + make_interval(secs=>p_seconds) <= v_now then 1 else least(l.used+1,p_max+1) end
  returning * into v_row;
  if v_row.used > p_max then
    return greatest(1,ceil(extract(epoch from v_row.started_at + make_interval(secs=>p_seconds)-v_now))::integer);
  end if;
  return 0;
end
$fn$;

-- gen_random_uuid uses the server CSPRNG. Rejection avoids modulo bias.
create function banqi_private.lobby_code() returns text language plpgsql set search_path='' as $fn$
declare v_bits bigint;
begin
  for i in 1..8 loop
    v_bits := ('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint;
    if v_bits < 4294000000 then return lpad((v_bits % 1000000)::text,6,'0'); end if;
  end loop;
  return null;
end
$fn$;

-- Public projection only. No peer UID, raw row, game state, seed or credentials.
create function banqi_private.lobby_mine(p_uid uuid) returns jsonb
language sql set search_path='' as $fn$
  select jsonb_build_object('roomId',id,'code',code,
    'role',case when host_uid=p_uid then 'host' else 'guest' end,
    'seats',jsonb_build_array(true,guest_uid is not null),
    'lobbyStatus',case when guest_uid is null then 'waiting' else 'full' end,
    'expiresAt',expires_at,'revision',lobby_revision)
  from banqi_private.rooms
  where status='waiting' and expires_at > clock_timestamp() and (host_uid=p_uid or guest_uid=p_uid)
  order by created_at desc limit 1
$fn$;

create function public.banqi_room_action(p_uid uuid, p_action text,
  p_request_id uuid default null, p_code text default null,
  p_room_id uuid default null, p_revision integer default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
  v_room banqi_private.rooms; v_mine jsonb; v_receipt banqi_private.lobby_requests;
  v_input jsonb; v_error text; v_wait integer; v_code text; v_created boolean := false;
begin
  if p_uid is null or p_action is null or p_action not in ('create','join','getMine','leave','cancel')
    or (p_action<>'getMine' and p_request_id is null)
    or (p_action='getMine' and p_request_id is not null)
    or (p_action='join' and (p_code is null or p_code !~ '^[0-9]{6}$'))
    or (p_action<>'join' and p_code is not null)
    or (p_action in ('leave','cancel') and (p_room_id is null or p_revision is null or p_revision<0))
    or (p_action not in ('leave','cancel') and (p_room_id is not null or p_revision is not null)) then
    return jsonb_build_object('ok',false,'error','INVALID_INPUT');
  end if;
  -- A UID can only acquire one live lobby, regardless of role or concurrent tabs.
  perform pg_advisory_xact_lock(hashtextextended(p_uid::text,5101));
  v_wait := banqi_private.lobby_limit('uid:'||p_uid::text||':all',60,60);
  if v_wait>0 then return jsonb_build_object('ok',false,'error','RATE_LIMIT','retryAfter',v_wait); end if;
  if p_action in ('create','join') then
    v_wait := banqi_private.lobby_limit('uid:'||p_uid::text||':'||p_action,60,case when p_action='join' then 6 else 3 end);
    if v_wait=0 then
      v_wait := banqi_private.lobby_limit('uid:'||p_uid::text||':'||p_action,3600,case when p_action='join' then 30 else 6 end);
    end if;
    if v_wait>0 then return jsonb_build_object('ok',false,'error','RATE_LIMIT','retryAfter',v_wait); end if;
    -- Global caps cannot be bypassed by new Anonymous identities or spoofed IPs.
    v_wait := banqi_private.lobby_limit('global:'||p_action,60,case when p_action='join' then 60 else 20 end);
    if v_wait=0 then
      v_wait := banqi_private.lobby_limit('global:'||p_action,3600,case when p_action='join' then 300 else 60 end);
    end if;
    if v_wait>0 then return jsonb_build_object('ok',false,'error','RATE_LIMIT','retryAfter',v_wait); end if;
  end if;
  v_mine := banqi_private.lobby_mine(p_uid);
  if p_action='getMine' then return jsonb_build_object('ok',true,'room',v_mine); end if;
  v_input := jsonb_build_object('action',p_action,'code',p_code,'roomId',p_room_id,'revision',p_revision);
  select * into v_receipt from banqi_private.lobby_requests where uid=p_uid and request_id=p_request_id;
  if found then
    if v_receipt.input<>v_input then return jsonb_build_object('ok',false,'error','INVALID_INPUT'); end if;
    if v_receipt.error_code is not null then return jsonb_build_object('ok',false,'error',v_receipt.error_code); end if;
    -- Replay never reopens a cancelled room or reclaims a seat after leave.
    return jsonb_build_object('ok',true,'room',v_mine);
  end if;

  if p_action='create' and v_mine is null then
    for i in 1..8 loop
      v_code := banqi_private.lobby_code();
      if v_code is null then exit; end if;
      begin
        insert into banqi_private.rooms(code,host_uid,expires_at)
          values(v_code,p_uid,clock_timestamp()+interval '20 minutes');
        v_created := true; exit;
      exception when unique_violation then null;
      end;
    end loop;
    if not v_created then v_error := 'CODE_UNAVAILABLE'; end if;
  elsif p_action='join' then
    if v_mine is not null then
      if v_mine->>'code'<>p_code then v_error := 'ALREADY_IN_ROOM'; end if;
    else
      select * into v_room from banqi_private.rooms where code=p_code for update;
      if not found or v_room.status<>'waiting' or v_room.expires_at<=clock_timestamp() then
        v_error := 'ROOM_UNAVAILABLE';
      elsif v_room.guest_uid is not null then v_error := 'ROOM_FULL';
      else
        update banqi_private.rooms set guest_uid=p_uid,lobby_revision=lobby_revision+1 where id=v_room.id;
      end if;
    end if;
  elsif p_action in ('leave','cancel') then
    select * into v_room from banqi_private.rooms where id=p_room_id for update;
    if not found or v_room.status<>'waiting' or v_room.expires_at<=clock_timestamp()
      or (v_room.host_uid<>p_uid and v_room.guest_uid is distinct from p_uid) then
      v_error := 'ROOM_UNAVAILABLE';
    elsif (p_action='cancel' and v_room.host_uid<>p_uid) or (p_action='leave' and v_room.guest_uid is distinct from p_uid) then
      v_error := 'FORBIDDEN';
    elsif p_revision<>v_room.lobby_revision then v_error := 'STALE_ROOM';
    elsif p_action='cancel' then
      update banqi_private.rooms set status='expired',lobby_revision=lobby_revision+1 where id=v_room.id;
    else
      update banqi_private.rooms set guest_uid=null,lobby_revision=lobby_revision+1 where id=v_room.id;
    end if;
  end if;
  insert into banqi_private.lobby_requests(uid,request_id,input,error_code) values(p_uid,p_request_id,v_input,v_error);
  if v_error is not null then return jsonb_build_object('ok',false,'error',v_error); end if;
  return jsonb_build_object('ok',true,'room',banqi_private.lobby_mine(p_uid));
end
$fn$;

revoke all on function public.banqi_room_action(uuid,text,uuid,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.banqi_room_action(uuid,text,uuid,text,uuid,integer) to service_role;
revoke all on all functions in schema banqi_private from public,anon,authenticated;
revoke all on all tables in schema banqi_private from public,anon,authenticated;
revoke all on all sequences in schema banqi_private from public,anon,authenticated;
revoke all on schema banqi_private from public,anon,authenticated;
-- No table publication, no client policy, no game_state insert, no gameplay.
commit;
