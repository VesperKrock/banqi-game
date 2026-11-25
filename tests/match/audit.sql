-- Read-only deployment gate. No user IDs, hidden boards, seeds or credentials.
select jsonb_build_object(
  'migration_applied', exists(select 1 from supabase_migrations.schema_migrations where version='20261125000200'),
  'private_rls', (select count(*)=6 and bool_and(c.relrowsecurity and c.relforcerowsecurity)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='banqi_private' and c.relkind='r'),
  'no_client_policies', not exists(select 1 from pg_policies where schemaname='banqi_private'),
  'no_private_publication', not exists(select 1 from pg_publication_tables where schemaname='banqi_private')
    and not exists(select 1 from pg_publication where puballtables),
  'no_client_schema_usage', not has_schema_privilege('anon','banqi_private','usage')
    and not has_schema_privilege('authenticated','banqi_private','usage'),
  'no_client_table_privileges', not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='banqi_private' and c.relkind='r' and
      (has_table_privilege('anon',c.oid,'select,insert,update,delete') or has_table_privilege('authenticated',c.oid,'select,insert,update,delete'))),
  'rpc_acl', (select count(*)=2 and bool_and(p.prosecdef and p.proconfig=array['search_path=""']
    and has_function_privilege('service_role',p.oid,'execute')
    and not has_function_privilege('anon',p.oid,'execute') and not has_function_privilege('authenticated',p.oid,'execute'))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('banqi_match_read','banqi_match_commit')),
  'seat_guard_enabled', exists(select 1 from pg_trigger where tgrelid='banqi_private.rooms'::regclass and tgname='guard_match_seats' and tgenabled='O')
) as gate;
