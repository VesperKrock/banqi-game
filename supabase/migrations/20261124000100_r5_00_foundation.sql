-- R5-00: private storage only. No gameplay RPC, public view, or Realtime stream.
-- Supabase migration history prevents duplicate application. A namespace conflict
-- (including a manual repeat) deliberately aborts without altering existing data.
begin;
select pg_advisory_xact_lock(5020001);
do $guard$
begin
  if exists (select 1 from pg_namespace where nspname = 'banqi_private') then
    raise exception 'banqi_private already exists; inspect migration history/schema before proceeding';
  end if;
  if exists (select 1 from pg_publication where puballtables) then
    raise exception 'FOR ALL TABLES publication exists; private storage cannot be provisioned safely';
  end if;
end
$guard$;

create schema banqi_private;
comment on schema banqi_private is 'Banqi R5-00 server-only authoritative storage';
revoke all on schema banqi_private from public, anon, authenticated;
grant usage on schema banqi_private to service_role;

create table banqi_private.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{6}$'),
  host_uid uuid not null references auth.users(id),
  guest_uid uuid references auth.users(id),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at),
  check (guest_uid is null or guest_uid <> host_uid),
  check (status <> 'active' or guest_uid is not null)
);
comment on table banqi_private.rooms is 'Two fixed seats maximum; code never grants ownership. No client access.';

create table banqi_private.game_state (
  room_id uuid primary key references banqi_private.rooms(id),
  version bigint not null default 0 check (version >= 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);
comment on table banqi_private.game_state is 'PRIVATE: true board, hidden faces and server RNG stay here; never expose or publish.';

alter table banqi_private.rooms enable row level security;
alter table banqi_private.rooms force row level security;
alter table banqi_private.game_state enable row level security;
alter table banqi_private.game_state force row level security;
-- No anon/authenticated policies: default deny even if a grant is added by mistake.
revoke all on all tables in schema banqi_private from public, anon, authenticated;
revoke all on all sequences in schema banqi_private from public, anon, authenticated;
revoke all on all functions in schema banqi_private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema banqi_private to service_role;
alter default privileges in schema banqi_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema banqi_private revoke all on sequences from public, anon, authenticated;
alter default privileges in schema banqi_private revoke execute on functions from public, anon, authenticated;

-- Nothing is added to supabase_realtime. banqi_private must NOT be in API schemas.
commit;
