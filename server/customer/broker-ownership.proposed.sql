-- SEPARATE LOCAL OWNERSHIP/GRANT REVIEW. Not an installer or activation permit.
-- The reviewed operator must provision these roles independently; no role/password
-- creation or capability switch occurs here. Existing privileged helpers remain TCB.
begin;
do $$declare r text;begin
 foreach r in array array['customer4b_core','customer4b_admission_owner','customer4b_reader_owner','customer4b_registrar','customer4b_reader'] loop
  if not exists(select 1 from pg_roles where rolname=r and not rolsuper and not rolcreatedb and not rolcreaterole and not rolbypassrls and not rolinherit and rolcanlogin=(r in('customer4b_registrar','customer4b_reader'))) then raise exception 'Reviewed independent restricted roles required';end if;
  if exists(select 1 from pg_auth_members m join pg_roles a on a.oid=m.member where a.rolname=r) then raise exception 'Unexpected inherited or SET ROLE authority';end if;
 end loop;
end$$;
grant usage on schema private,public,auth to customer4b_core,customer4b_admission_owner,customer4b_reader_owner;
grant create on schema private to customer4b_core;
-- Needed by frozen claim SQL to inspect the independent consumer's exact backend.
-- Cluster statistics visibility is an explicit remaining operational review item.
grant pg_read_all_stats to customer4b_core with inherit true,set false;

do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname=any(array[
 'customer_request_body','customer_request_roles_ok','customer_request_principal_integrity','customer_request_principal','customer_request_reference','customer_request_claim','customer_request_exact','customer_decision_integrity','customer_request_receipt_row','customer_record_review_request','customer_record_decision','customer_review_request_receipt','customer_review_request_status','customer_broker_endpoint','customer_broker_runtime_role','customer_broker_role_review','customer_broker_transaction','customer_broker_claim_integrity']) loop
 execute format('alter function %s owner to customer4b_core',f.signature);
 end loop;
end$$;
alter function private.customer_broker_admit(jsonb,jsonb,name,name,jsonb) owner to customer4b_admission_owner;
alter function private.customer_broker_identity(jsonb) owner to customer4b_reader_owner;
alter function private.customer_broker_receipt(jsonb,uuid,uuid) owner to customer4b_reader_owner;
alter function private.customer_broker_staff_read(jsonb,uuid) owner to customer4b_reader_owner;

grant select on private.customer_request_principals,private.customer_request_intents,private.customer_request_outcomes,private.customer_review_decisions,private.customer_estimate_access,private.customer_broker_admissions to customer4b_core;
grant select(id,organization_id,estimate_id,version_number) on public.estimate_versions to customer4b_core;
grant select(id,user_id,not_after) on auth.sessions to customer4b_core;
grant insert on private.customer_request_intents,private.customer_request_outcomes,private.customer_review_decisions to customer4b_core;
grant update on private.customer_request_principals,private.customer_request_intents,private.customer_estimate_access to customer4b_core;
grant select on private.customer_estimate_access,private.customer_broker_admissions,private.customer_review_decisions to customer4b_admission_owner;
grant insert on private.customer_request_principals,private.customer_broker_admissions to customer4b_admission_owner;
grant update on private.customer_estimate_access to customer4b_admission_owner;
grant select on private.customer_broker_admissions to customer4b_reader_owner;
grant select(id,email_confirmed_at,deleted_at,is_anonymous,banned_until) on auth.users to customer4b_reader_owner;
-- Definer roles can read bounded projection sources. Runtime LOGINs get no table access.
create policy broker_core_versions on public.estimate_versions for select to customer4b_core using(true);
do $$declare t text;begin
 foreach t in array array['customer_request_principals','customer_request_intents','customer_request_outcomes','customer_review_decisions','customer_estimate_access','customer_broker_admissions'] loop
 execute format('create policy broker_core_read on private.%I for select to customer4b_core using(true)',t);
 end loop;
 foreach t in array array['customer_request_intents','customer_request_outcomes','customer_review_decisions'] loop
 execute format('create policy broker_core_insert on private.%I for insert to customer4b_core with check(true)',t);
 end loop;
 foreach t in array array['customer_request_principals','customer_request_intents','customer_estimate_access'] loop
 execute format('create policy broker_core_lock on private.%I for update to customer4b_core using(true) with check(false)',t);
 end loop;
 foreach t in array array['customer_estimate_access','customer_broker_admissions','customer_review_decisions'] loop
 execute format('create policy broker_admission_read on private.%I for select to customer4b_admission_owner using(true)',t);
 end loop;
end$$;
create policy broker_register_principal on private.customer_request_principals for insert to customer4b_admission_owner with check(true);
create policy broker_admit on private.customer_broker_admissions for insert to customer4b_admission_owner with check(true);
create policy broker_admission_lock on private.customer_estimate_access for update to customer4b_admission_owner using(true) with check(false);
create policy broker_reader_admissions on private.customer_broker_admissions for select to customer4b_reader_owner using(true);
-- Helpers are exact existing reviewed contracts. Their original privileged owners
-- remain explicit transitive dependencies; this does not certify the whole TCB.
grant execute on function auth.uid(),auth.jwt(),private.est_object(jsonb,text[]),private.customer_runtime_guard(text),private.property_connected_session(),private.customer_portal_guard(uuid,uuid,uuid),private.customer_issued_review(uuid,uuid,uuid,uuid,uuid,text,uuid),private.customer_estimate_review(uuid,uuid,uuid,uuid) to customer4b_core;
grant execute on function auth.uid(),auth.jwt(),private.est_object(jsonb,text[]),private.customer_broker_endpoint(text),private.customer_broker_identity(jsonb),private.customer_runtime_guard(text),private.customer_portal_guard(uuid,uuid,uuid),private.customer_issued_review(uuid,uuid,uuid,uuid,uuid,text,uuid),private.customer_request_body(jsonb),private.customer_broker_runtime_role(name,text),private.customer_broker_transaction(name,jsonb) to customer4b_admission_owner;
grant execute on function auth.uid(),auth.jwt(),private.est_object(jsonb,text[]),private.customer_broker_endpoint(text),private.property_connected_session(),private.customer_review_request_receipt(uuid,jsonb),private.customer_change_request_queue(uuid) to customer4b_reader_owner;
grant usage on schema private to customer4b_registrar,customer4b_reader;
grant execute on function private.customer_broker_admit(jsonb,jsonb,name,name,jsonb),private.customer_broker_role_review(name,text) to customer4b_registrar;
grant execute on function private.customer_broker_receipt(jsonb,uuid,uuid),private.customer_broker_staff_read(jsonb,uuid) to customer4b_reader;
-- Issuer/executor role pairs are finite pre-provisioned one-use LOGINs. Grant only
-- customer_request_claim to issuer, customer_record_review_request to executor.
-- No public/anon/authenticated/service_role grant; no DDL or arbitrary SQL gateway.
commit;
