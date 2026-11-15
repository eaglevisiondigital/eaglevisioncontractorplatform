-- UNAPPLIED SECURITY MAPPING PROPOSAL. No business ledger, public RPC, runtime
-- principal, installation or financial execution. Canonical14 remains unchanged.
begin;
create role propel_customer_payment_owner nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant usage,create on schema private to propel_customer_payment_owner;
grant usage on schema public,auth to propel_customer_payment_owner;
grant execute on function auth.uid(),auth.jwt(),private.customer_portal_guard(uuid,uuid,uuid),private.customer_publisher_guard(uuid),private.require_provider_workload(uuid,uuid,text),private.commercial_invoice_payment_receipt(uuid,uuid,text,uuid,uuid,uuid,text,integer,uuid,uuid,uuid,text,text,uuid) to propel_customer_payment_owner;
create function private.customer_payment_publication_enabled() returns boolean language sql volatile security definer set search_path='' as $$select false$$;
alter function private.customer_payment_publication_enabled() owner to propel_customer_payment_owner;
revoke all on function private.customer_payment_publication_enabled() from public,anon,authenticated,service_role;
create function private.customer_payment_identity() returns void language plpgsql security definer set search_path='' as $$declare claimed uuid;begin
 if jsonb_typeof(auth.jwt()->'sub') is distinct from 'string' or auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Current consistent AAL2 identity required' using errcode='42501';end if;
 begin claimed:=(auth.jwt()->>'sub')::uuid;exception when invalid_text_representation then raise exception 'Current consistent identity required' using errcode='42501';end;
 if claimed is null or claimed is distinct from auth.uid() then raise exception 'Current consistent identity required' using errcode='42501';end if;
end$$;
alter function private.customer_payment_identity() owner to propel_customer_payment_owner;
revoke all on function private.customer_payment_identity() from public,anon,authenticated,service_role;
create table private.commercial_payment_access(
 organization_id uuid not null,id uuid not null,customer_id uuid not null,location_id uuid not null,user_id uuid not null,
 invoice_id uuid not null,source_version_id uuid not null,source_hash text not null check(source_hash~'^[a-f0-9]{64}$'),revision integer not null check(revision>0),issue_command_id uuid not null,
 merchant_id uuid not null,attempt_key uuid not null,result_sha256 text not null check(result_sha256~'^[a-f0-9]{64}$'),
 purpose text not null check(purpose='original_payment_receipt'),published_by uuid not null references auth.users(id),request_hash text not null check(request_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,revoked_at timestamptz,
 primary key(organization_id,id),
 foreign key(organization_id,customer_id,user_id) references public.portal_identities(organization_id,customer_id,user_id),
 foreign key(organization_id,location_id,customer_id) references public.service_locations(organization_id,id,customer_id),
 foreign key(organization_id,invoice_id,revision) references private.commercial_invoice_draft_revisions(organization_id,invoice_id,revision),
 foreign key(organization_id,source_version_id) references public.estimate_versions(organization_id,id),
 foreign key(organization_id,merchant_id) references private.merchant_configurations(organization_id,id),
 foreign key(organization_id,attempt_key) references private.sandbox_gateway_attempts(organization_id,idempotency_key),
 check(isfinite(created_at) and isfinite(expires_at) and expires_at>created_at and expires_at<=created_at+interval '15 minutes'),
 check(revoked_at is null or (isfinite(revoked_at) and revoked_at>=created_at))
);
alter table private.commercial_payment_access owner to propel_customer_payment_owner;
alter table private.commercial_payment_access enable row level security;
alter table private.commercial_payment_access force row level security;
revoke all on private.commercial_payment_access from public,anon,authenticated,service_role;
create policy owner_only on private.commercial_payment_access for all to propel_customer_payment_owner using(true) with check(true);
create index commercial_payment_access_customer on private.commercial_payment_access(organization_id,customer_id,user_id,location_id);
create index commercial_payment_access_invoice on private.commercial_payment_access(organization_id,invoice_id,revision);
create index commercial_payment_access_attempt on private.commercial_payment_access(organization_id,attempt_key);
create index commercial_payment_access_merchant on private.commercial_payment_access(organization_id,merchant_id);
create index commercial_payment_access_source on private.commercial_payment_access(organization_id,source_version_id);
create index commercial_payment_access_actor on private.commercial_payment_access(published_by);
create function private.commercial_payment_access_immutable() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' or old.revoked_at is not null or new.revoked_at is null or (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') then raise exception 'Publication evidence revoke-only' using errcode='42501';end if;return new;
end$$;
alter function private.commercial_payment_access_immutable() owner to propel_customer_payment_owner;
revoke all on function private.commercial_payment_access_immutable() from public,anon,authenticated,service_role;
create trigger commercial_payment_access_immutable before update or delete on private.commercial_payment_access for each row execute function private.commercial_payment_access_immutable();
-- Finite existing-source reads and row locks only. No source DML is granted.
grant select(organization_id,id,customer_id,location_id,source_version_id,source_hash,currency,amount_minor,current_revision,issued_revision,issue_command_id) on private.commercial_invoice_drafts to propel_customer_payment_owner;
create policy customer_payment_header on private.commercial_invoice_drafts for select to propel_customer_payment_owner using(true);
grant select(organization_id,id,idempotency_key,authorization_id,merchant_id,invoice_id,kind,capture_key,amount_minor,request_digest,status,result,created_at) on private.sandbox_gateway_attempts to propel_customer_payment_owner;
create policy customer_payment_attempt on private.sandbox_gateway_attempts for select to propel_customer_payment_owner using(true);
grant select(organization_id,id,provider,status,environment),update(id) on private.merchant_configurations to propel_customer_payment_owner;
create policy customer_payment_merchant on private.merchant_configurations for select to propel_customer_payment_owner using(true);
create policy customer_payment_merchant_lock on private.merchant_configurations for update to propel_customer_payment_owner using(true) with check(false);
grant select(organization_id,id,estimate_id,status,customer_id,location_id,payload,calculation,tax_policy_snapshot,version_number),update(id) on public.estimate_versions to propel_customer_payment_owner;
grant select(organization_id,id,status,current_version_id),update(id) on public.estimates to propel_customer_payment_owner;
create policy customer_payment_version on public.estimate_versions for select to propel_customer_payment_owner using(true);
create policy customer_payment_version_lock on public.estimate_versions for update to propel_customer_payment_owner using(true) with check(false);
create policy customer_payment_estimate on public.estimates for select to propel_customer_payment_owner using(true);
create policy customer_payment_estimate_lock on public.estimates for update to propel_customer_payment_owner using(true) with check(false);
grant select(organization_id,customer_id,user_id,active),update(user_id) on public.portal_identities to propel_customer_payment_owner;
create policy customer_payment_mapping on public.portal_identities for select to propel_customer_payment_owner using(true);
create policy customer_payment_mapping_lock on public.portal_identities for update to propel_customer_payment_owner using(true) with check(false);
grant select(id,user_id,not_after) on auth.sessions to propel_customer_payment_owner;
create function private.customer_payment_source_lock(p_org uuid,p_invoice uuid) returns void language plpgsql security definer set search_path='' as $$declare h record;begin
 select organization_id,id,customer_id,location_id,source_version_id,source_hash,currency,amount_minor into h from private.commercial_invoice_drafts where organization_id=p_org and id=p_invoice;
 if not found then raise exception 'Current exact source required' using errcode='42501';end if;
 perform 1 from public.estimates e join public.estimate_versions v on v.organization_id=e.organization_id and v.estimate_id=e.id where v.organization_id=p_org and v.id=h.source_version_id for share of e;
 perform 1 from public.estimate_versions where organization_id=p_org and id=h.source_version_id for share;
 if (exists(select 1 from public.estimate_versions original where original.id=h.source_version_id and original.organization_id=h.organization_id and original.status='issued' and exists(select 1 from public.estimates parent where parent.organization_id=original.organization_id and parent.id=original.estimate_id and parent.status='issued' and parent.current_version_id=original.id) and original.customer_id=h.customer_id and original.location_id is not distinct from h.location_id and original.payload->>'currency'=h.currency and (original.calculation->>'total_minor')::numeric=h.amount_minor and encode(sha256(convert_to(jsonb_build_object('version',original.id,'customer',original.customer_id,'location',original.location_id,'payload',original.payload,'calculation',original.calculation,'tax_policy',original.tax_policy_snapshot)::text,'UTF8')),'hex')=h.source_hash and not exists(select 1 from public.estimate_versions newer where newer.organization_id=h.organization_id and newer.estimate_id=original.estimate_id and newer.status='issued' and newer.version_number>original.version_number))) is not true then raise exception 'Current exact source required' using errcode='42501';end if;
end$$;
alter function private.customer_payment_source_lock(uuid,uuid) owner to propel_customer_payment_owner;
revoke all on function private.customer_payment_source_lock(uuid,uuid) from public,anon,authenticated,service_role;
create function private.customer_payment_publish(p_org uuid,p_id uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='1500ms' as $$
declare h record;x record;m record;g private.commercial_payment_access;proof jsonb;digest text;request text;actor uuid:=auth.uid();expiry timestamptz;begin
 if not private.customer_payment_publication_enabled() then raise exception 'Commercial customer publication disabled' using errcode='42501';end if;
 perform private.customer_payment_identity();perform private.customer_publisher_guard(p_org);
 if auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Current AAL2 publisher required' using errcode='42501';end if;
 if p_id is null or pg_column_size(p)>4096 or jsonb_typeof(p) is distinct from 'object' or not(p ?& array['customerId','locationId','userId','invoiceId','sourceVersionId','sourceHash','revision','issueCommandId','merchantConfigId','attemptKey','resultDigest','expiresAt']) or p-array['customerId','locationId','userId','invoiceId','sourceVersionId','sourceHash','revision','issueCommandId','merchantConfigId','attemptKey','resultDigest','expiresAt']<>'{}'::jsonb or exists(select 1 from jsonb_each(p) where value='null'::jsonb) then raise exception 'Exact publication request required' using errcode='42501';end if;
 if jsonb_typeof(p->'revision') is distinct from 'number' or p->>'revision'!~'^[1-9][0-9]{0,9}$' or exists(select 1 from jsonb_each(p) where key<>'revision' and jsonb_typeof(value)<>'string') then raise exception 'Typed exact publication request required' using errcode='42501';end if;
 perform private.require_provider_workload(p_org,(p->>'merchantConfigId')::uuid,'payment');
 expiry:=(p->>'expiresAt')::timestamptz;
 if not isfinite(expiry) or expiry<=clock_timestamp() or expiry>clock_timestamp()+interval '15 minutes' then raise exception 'Bounded publication required' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment-publication/'||p_org::text||'/'||p_id::text,0));
 perform private.customer_payment_source_lock(p_org,(p->>'invoiceId')::uuid);
 select organization_id,id,customer_id,location_id,source_version_id,source_hash,currency,amount_minor,current_revision,issued_revision,issue_command_id into h from private.commercial_invoice_drafts where organization_id=p_org and id=(p->>'invoiceId')::uuid;
 if not found or h.customer_id<>(p->>'customerId')::uuid or h.location_id is null or h.location_id<>(p->>'locationId')::uuid or h.source_version_id<>(p->>'sourceVersionId')::uuid or h.source_hash<>p->>'sourceHash' or h.current_revision<>(p->>'revision')::integer or h.issued_revision is distinct from h.current_revision or h.issue_command_id<>(p->>'issueCommandId')::uuid then raise exception 'Exact issued invoice required' using errcode='42501';end if;
 perform 1 from public.portal_identities where organization_id=p_org and customer_id=h.customer_id and user_id=(p->>'userId')::uuid and active for share;
 if not found then raise exception 'Current customer mapping required' using errcode='42501';end if;
 select * into x from private.sandbox_gateway_attempts where organization_id=p_org and idempotency_key=(p->>'attemptKey')::uuid and invoice_id=h.id and merchant_id=(p->>'merchantConfigId')::uuid;
 if not found or x.status<>'succeeded' then raise exception 'Original successful receipt required; UNKNOWN suppressed' using errcode='42501';end if;
 select provider into m from private.merchant_configurations where organization_id=p_org and id=x.merchant_id;
 proof:=private.commercial_invoice_payment_receipt(p_org,x.merchant_id,m.provider,h.id,h.customer_id,h.source_version_id,h.source_hash,h.current_revision,h.issue_command_id,x.idempotency_key,x.authorization_id,x.request_digest,x.kind,x.capture_key);
 if proof->>'outcome' is distinct from 'LINKED' or proof->>'status' is distinct from 'succeeded' then raise exception 'Exact original receipt required' using errcode='42501';end if;
 digest:=encode(sha256(convert_to(x.result::text,'UTF8')),'hex');
 if digest is distinct from p->>'resultDigest' then raise exception 'Original result digest required' using errcode='42501';end if;
 request:=encode(sha256(convert_to(jsonb_build_array('original_payment_receipt',p_org,p_id,actor,p)::text,'UTF8')),'hex');
 select * into g from private.commercial_payment_access where organization_id=p_org and id=p_id for update;
 if found then
  if g.request_hash<>request or g.published_by<>actor or g.revoked_at is not null then raise exception 'Original grant only; no rebind' using errcode='42501';end if;
 else
  insert into private.commercial_payment_access(organization_id,id,customer_id,location_id,user_id,invoice_id,source_version_id,source_hash,revision,issue_command_id,merchant_id,attempt_key,result_sha256,purpose,published_by,request_hash,expires_at)
  values(p_org,p_id,h.customer_id,h.location_id,(p->>'userId')::uuid,h.id,h.source_version_id,h.source_hash,h.current_revision,h.issue_command_id,x.merchant_id,x.idempotency_key,digest,'original_payment_receipt',actor,request,expiry);
 end if;
 perform private.customer_payment_identity();perform private.customer_publisher_guard(p_org);perform private.require_provider_workload(p_org,x.merchant_id,'payment');
 if expiry<=clock_timestamp() then raise exception 'Publication expired after wait' using errcode='42501';end if;
 return jsonb_build_object('publicationId',p_id,'financialEffect',false,'delivery','DISABLED');
end$$;
alter function private.customer_payment_publish(uuid,uuid,jsonb) owner to propel_customer_payment_owner;
revoke all on function private.customer_payment_publish(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function private.customer_payment_publication_receipt(p_org uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='1500ms' as $$declare g private.commercial_payment_access;merchant uuid;begin
 if not private.customer_payment_publication_enabled() then raise exception 'Commercial customer publication disabled' using errcode='42501';end if;
 perform private.customer_payment_identity();perform private.customer_publisher_guard(p_org);
 if auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Current AAL2 publisher required' using errcode='42501';end if;
 select merchant_id into merchant from private.commercial_payment_access where organization_id=p_org and id=p_id and published_by=auth.uid();
 if not found then raise exception 'Original publication receipt required' using errcode='42501';end if;
 perform private.require_provider_workload(p_org,merchant,'payment');
 select * into g from private.commercial_payment_access where organization_id=p_org and id=p_id and published_by=auth.uid() and merchant_id=merchant for share;
 if not found then raise exception 'Original publication receipt required' using errcode='42501';end if;
 perform private.require_provider_workload(p_org,g.merchant_id,'payment');perform private.customer_payment_identity();perform private.customer_publisher_guard(p_org);
 return jsonb_build_object('publicationId',p_id,'state',case when g.revoked_at is not null then 'REVOKED' when g.expires_at<=clock_timestamp() then 'EXPIRED' else 'RECORDED' end,'financialEffect',false,'delivery','DISABLED');
end$$;
alter function private.customer_payment_publication_receipt(uuid,uuid) owner to propel_customer_payment_owner;
revoke all on function private.customer_payment_publication_receipt(uuid,uuid) from public,anon,authenticated,service_role;
create function private.customer_payment_revoke(p_org uuid,p_id uuid) returns void language plpgsql security definer set search_path='' set lock_timeout='1500ms' as $$declare g private.commercial_payment_access;merchant uuid;begin
 if not private.customer_payment_publication_enabled() then raise exception 'Commercial customer publication disabled' using errcode='42501';end if;
 perform private.customer_payment_identity();perform private.customer_publisher_guard(p_org);
 if auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Current AAL2 publisher required' using errcode='42501';end if;
 select merchant_id into merchant from private.commercial_payment_access where organization_id=p_org and id=p_id;
 if not found then raise exception 'Exact publication required' using errcode='42501';end if;
 perform private.require_provider_workload(p_org,merchant,'payment');
 select * into g from private.commercial_payment_access where organization_id=p_org and id=p_id and merchant_id=merchant for update;
 if not found then raise exception 'Exact publication required' using errcode='42501';end if;
 perform private.require_provider_workload(p_org,g.merchant_id,'payment');
 if g.revoked_at is null then update private.commercial_payment_access set revoked_at=clock_timestamp() where organization_id=p_org and id=p_id;end if;
 perform private.customer_payment_identity();perform private.customer_publisher_guard(p_org);perform private.require_provider_workload(p_org,g.merchant_id,'payment');
end$$;
alter function private.customer_payment_revoke(uuid,uuid) owner to propel_customer_payment_owner;
revoke all on function private.customer_payment_revoke(uuid,uuid) from public,anon,authenticated,service_role;
create function private.customer_payment_receipt(p_org uuid,p_customer uuid,p_location uuid,p_invoice uuid,p_publication uuid) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='1500ms' as $$
declare g private.commercial_payment_access;h record;x record;m record;now_ms bigint;expiry_ms bigint;session_expiry timestamptz;begin
 if not private.customer_payment_publication_enabled() then raise exception 'Commercial customer publication disabled' using errcode='42501';end if;
 perform private.customer_payment_identity();perform private.customer_portal_guard(p_org,p_customer,p_location);
 if auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Current AAL2 customer required' using errcode='42501';end if;
 select * into g from private.commercial_payment_access where organization_id=p_org and id=p_publication and customer_id=p_customer and location_id=p_location and invoice_id=p_invoice and user_id=auth.uid() and purpose='original_payment_receipt' for share;
 if not found or g.revoked_at is not null or g.expires_at<=clock_timestamp() then raise exception 'Current exact commercial payment publication required' using errcode='42501';end if;
 perform private.customer_payment_source_lock(p_org,p_invoice);
 select organization_id,id,customer_id,location_id,source_version_id,source_hash,currency,amount_minor,current_revision,issued_revision,issue_command_id into h from private.commercial_invoice_drafts where organization_id=p_org and id=p_invoice and customer_id=p_customer and location_id=p_location and source_version_id=g.source_version_id and source_hash=g.source_hash and current_revision=g.revision and issued_revision=g.revision and issue_command_id=g.issue_command_id;
 if not found then raise exception 'Original issued invoice changed' using errcode='42501';end if;
 select organization_id,id,provider,status,environment into m from private.merchant_configurations where organization_id=p_org and id=g.merchant_id for share;
 if not found or m.status<>'approved' or m.environment<>'sandbox' then raise exception 'Current merchant unavailable' using errcode='42501';end if;
 select * into x from private.sandbox_gateway_attempts where organization_id=p_org and idempotency_key=g.attempt_key and merchant_id=g.merchant_id and invoice_id=p_invoice;
 if not found or x.status<>'succeeded' or x.result->>'provider' is distinct from m.provider or encode(sha256(convert_to(x.result::text,'UTF8')),'hex')<>g.result_sha256 then raise exception 'Original receipt unavailable; UNKNOWN suppressed' using errcode='42501';end if;
 perform private.customer_payment_identity();perform private.customer_portal_guard(p_org,p_customer,p_location);
 now_ms:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 select not_after into session_expiry from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=auth.uid();
 if not found then raise exception 'Current session required' using errcode='42501';end if;
 expiry_ms:=least(floor(extract(epoch from g.expires_at)*1000)::bigint,(auth.jwt()->>'exp')::bigint*1000,coalesce(floor(extract(epoch from session_expiry)*1000)::bigint,now_ms+30000),now_ms+30000);
 if expiry_ms<=now_ms then raise exception 'Publication expired after wait' using errcode='42501';end if;
 return jsonb_build_object('schema','customer-original-payment-receipt-v1','mode','sandbox-proposal','organizationId',p_org,'customerId',p_customer,'locationId',p_location,'invoiceId',p_invoice,'publicationId',p_publication,'receiptReference',x.id,'issuanceReceiptReference',g.issue_command_id,'kind',x.kind,'amountMinor',x.amount_minor,'invoiceAmountMinor',h.amount_minor,'currency','USD','attemptedAt',to_char(x.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'observedAt',now_ms,'expiresAt',expiry_ms,'balance','NOT_ESTABLISHED','settlement','UNVERIFIED','delivery','DISABLED','financialEffect',false,'holdRelease',false);
end$$;
alter function private.customer_payment_receipt(uuid,uuid,uuid,uuid,uuid) owner to propel_customer_payment_owner;
revoke all on function private.customer_payment_receipt(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke create on schema private from propel_customer_payment_owner;
-- All publisher/revoker/customer EXECUTE grants, capability activation and target
-- installation remain separate exact authorization. No runtime grant is installed.
commit;
