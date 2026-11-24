-- Read-only audit. Never returns rows from authoritative state or auth.users.
select n.nspname as schema_name, c.relname as table_name,
  c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
  has_schema_privilege('anon',n.oid,'usage') as anon_schema_usage,
  has_schema_privilege('authenticated',n.oid,'usage') as authenticated_schema_usage,
  has_table_privilege('anon',c.oid,'select,insert,update,delete') as anon_table_access,
  has_table_privilege('authenticated',c.oid,'select,insert,update,delete') as authenticated_table_access,
  (select count(*) from pg_policy p where p.polrelid=c.oid) as policies,
  (select count(*) from pg_publication_tables p where p.schemaname=n.nspname and p.tablename=c.relname) as publications,
  exists(select 1 from supabase_migrations.schema_migrations where version='20261124000100') as migration_recorded
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='banqi_private' and c.relkind='r'
order by c.relname;
