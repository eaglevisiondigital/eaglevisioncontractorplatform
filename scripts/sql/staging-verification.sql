-- Read-only operator verification AFTER separately authorized staging migrations.
-- Do not run tests/database/bootstrap.sql on Supabase. Never grant private API exposure.
begin read only;
select version from supabase_migrations.schema_migrations order by version;
select c.relname as unsecured_public_table
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
select n.nspname,p.proname as unsafe_function from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.prosecdef)
   or (n.nspname='private' and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'],false));
select id,public,file_size_limit,allowed_mime_types from storage.buckets
where id in ('company-documents','material-quarantine','material-clean');
select policyname,cmd,roles from pg_policies
where schemaname='storage' and tablename='objects';
select count(*) as forbidden_enabled_modules from public.company_modules
where module in ('contracts','invoices','payments') and enabled;
commit;
