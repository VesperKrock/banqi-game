-- Read-only metadata audit; no room codes, user rows, credentials or game state.
select jsonb_build_object(
  'tables',(select jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
    'anon',has_table_privilege('anon',c.oid,'select,insert,update,delete'),
    'authenticated',has_table_privilege('authenticated',c.oid,'select,insert,update,delete')) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='banqi_private' and c.relkind='r'),
  'rpc',(select jsonb_build_object('securityDefiner',prosecdef,'config',proconfig,
    'anon',has_function_privilege('anon',oid,'execute'),'authenticated',has_function_privilege('authenticated',oid,'execute'),
    'serviceRole',has_function_privilege('service_role',oid,'execute'))
    from pg_proc where oid='public.banqi_room_action(uuid,text,uuid,text,uuid,integer)'::regprocedure),
  'clientSchemaUsage',has_schema_privilege('anon','banqi_private','usage') or has_schema_privilege('authenticated','banqi_private','usage'),
  'policies',(select count(*) from pg_policies where schemaname='banqi_private'),
  'publications',(select count(*) from pg_publication_tables where schemaname='banqi_private'),
  'clientHelperExecute',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='banqi_private'
    and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))),
  'gameStates',(select count(*) from banqi_private.game_state),
  'migration',exists(select 1 from supabase_migrations.schema_migrations where version='20261125000100')
) as audit;
