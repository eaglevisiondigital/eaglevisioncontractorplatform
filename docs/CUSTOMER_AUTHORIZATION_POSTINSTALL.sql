-- PROPOSED READ-ONLY verification after separately authorized installation.
-- No credentials, target refs, caller claims, fixtures or mutations. NOT RUN hosted.
begin read only;
select version from supabase_migrations.schema_migrations order by version;
select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='private' and c.relname in ('customer_estimate_access','customer_review_decisions');
select schemaname,tablename,policyname from pg_policies
 where schemaname='private' and tablename in ('customer_estimate_access','customer_review_decisions');
select 'customer_estimate_access' as name,count(*) as rows from private.customer_estimate_access
 union all select 'customer_review_decisions',count(*) from private.customer_review_decisions;
select private.customer_runtime_status() as must_remain_all_false;
select p.oid::regprocedure as name,p.prosecdef,p.proconfig,p.proacl,pg_get_functiondef(p.oid)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('private','public') and
 (p.proname like 'customer_%' or (n.nspname='private' and p.proname='property_published_reports')) order by 1;
select r.role_name,p.oid::regprocedure as name,has_function_privilege(r.role_name,p.oid,'EXECUTE') as must_be_false
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 cross join (values ('anon'),('authenticated'),('service_role')) r(role_name)
 where n.nspname in ('private','public') and p.proname like 'customer_%';
select r.role_name,t.name,has_table_privilege(r.role_name,'private.'||t.name,'SELECT,INSERT,UPDATE,DELETE') as must_be_false
 from (values ('anon'),('authenticated'),('service_role')) r(role_name)
 cross join (values ('customer_estimate_access'),('customer_review_decisions')) t(name);
select conrelid::regclass,conname,convalidated,pg_get_constraintdef(oid)
 from pg_constraint where conrelid in ('private.customer_estimate_access'::regclass,'private.customer_review_decisions'::regclass) order by 1,2;
select tablename,indexname,indexdef from pg_indexes where schemaname='private'
 and tablename in ('customer_estimate_access','customer_review_decisions') order by 1,2;
select tgrelid::regclass,tgname,tgenabled,pg_get_triggerdef(oid)
 from pg_trigger where not tgisinternal and tgrelid in ('private.customer_estimate_access'::regclass,'private.customer_review_decisions'::regclass) order by 1,2;
commit;
-- Also compare all previous ACL/function/catalog/data hashes against the approved
-- fresh preflight, expected P1 deltas, saved Auth/API settings and provider off gates.
-- Run management security/performance advisors separately; never remediate via
-- automatic GRANT, DROP, repair, reset or feature activation.
