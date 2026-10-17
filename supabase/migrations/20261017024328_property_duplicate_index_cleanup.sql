-- P0 cleanup proposal only. Keep all eleven installed migrations unchanged.
-- Bounded development maintenance operation, never CASCADE or an automatic retry.
begin;
set local lock_timeout='2s';
set local statement_timeout='10s';
do $$declare keep regclass:=to_regclass('public.location_customer_unique'); redundant regclass:=to_regclass('public.property_location_customer');begin
 if keep is null or redundant is null then raise exception 'Reviewed index pair missing';end if;
 if not exists(select 1 from pg_index a join pg_index b on b.indrelid=a.indrelid where a.indexrelid=keep and b.indexrelid=redundant and a.indisunique and b.indisunique and a.indisvalid and b.indisvalid and a.indisready and b.indisready and a.indkey=b.indkey and a.indclass=b.indclass and a.indcollation=b.indcollation and a.indoption=b.indoption and a.indexprs is null and b.indexprs is null and a.indpred is null and b.indpred is null) then raise exception 'Index definition drift';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.service_locations'::regclass and conname='location_customer_unique' and contype='u' and conindid=keep and convalidated) then raise exception 'Required unique constraint missing';end if;
 if exists(select 1 from pg_depend where refclassid='pg_class'::regclass and refobjid=redundant) or exists(select 1 from pg_constraint where conindid=redundant) then raise exception 'Redundant index has dependencies; separate review required';end if;
end$$;
drop index public.property_location_customer;
commit;
