-- UNAPPLIED FORWARD PROPOSAL. Existing immutable reports only; no writer change,
-- new ledger, customer projection, installation or financial-execution authority.
begin;
create role propel_reconciliation_receipt_owner nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant usage,create on schema private to propel_reconciliation_receipt_owner;
grant execute on function private.require_provider_workload(uuid,uuid,text) to propel_reconciliation_receipt_owner;
grant select(organization_id,id,provider,environment,status),update(id) on private.merchant_configurations to propel_reconciliation_receipt_owner;
create policy reconciliation_receipt_merchant_read on private.merchant_configurations for select to propel_reconciliation_receipt_owner using(true);
create policy reconciliation_receipt_merchant_lock on private.merchant_configurations for update to propel_reconciliation_receipt_owner using(true) with check(false);
grant select(organization_id,merchant_id,report_id,evidence_sha256,snapshot_sha256,result,created_at) on private.sandbox_gateway_reconciliations to propel_reconciliation_receipt_owner;
create policy reconciliation_receipt_read on private.sandbox_gateway_reconciliations for select to propel_reconciliation_receipt_owner using(true);

create function private.sandbox_reconciliation_receipt(p_org uuid,p_merchant uuid,p_provider text,p_report uuid,p_digest text,p_snapshot text) returns jsonb
 language plpgsql security definer set search_path='' set lock_timeout='1500ms' as $$
declare m record;r record;answer jsonb;k text;valid boolean;
begin
 perform private.require_provider_workload(p_org,p_merchant,'payment');
 if p_org is null or p_merchant is null or p_report is null or p_provider is null or p_provider not in ('nmi','authorize_net') or p_digest is null or p_snapshot is null or p_digest!~'^[a-f0-9]{64}$' or p_snapshot!~'^[a-f0-9]{64}$' then raise exception 'Exact original reconciliation identity required' using errcode='42501';end if;
 select organization_id,id,provider,environment,status into m from private.merchant_configurations where organization_id=p_org and id=p_merchant for share;
 if not found or m.provider is distinct from p_provider or m.environment<>'sandbox' or m.status<>'approved' then raise exception 'Current exact sandbox merchant required' using errcode='42501';end if;
 -- No current attempt snapshot comparison: this is the original immutable
 -- report, not a reconstruction, re-submission or latest-report fallback.
 select report_id,evidence_sha256,snapshot_sha256,result,created_at into r from private.sandbox_gateway_reconciliations
  where organization_id=p_org and merchant_id=p_merchant and report_id=p_report and evidence_sha256=p_digest and snapshot_sha256=p_snapshot;
 answer:=jsonb_build_object('outcome','UNKNOWN');
 if found then
  valid:=false;
  if jsonb_typeof(r.result)='object' then
   valid:=coalesce(pg_column_size(r.result)<=1024 and r.created_at<=clock_timestamp() and r.result ?& array['missing','unexpected','conflicts','unresolved','expectedNetMinor','reportedNetMinor','balanced'] and r.result-array['missing','unexpected','conflicts','unresolved','expectedNetMinor','reportedNetMinor','balanced']='{}'::jsonb and jsonb_typeof(r.result->'balanced')='boolean',false);
  end if;
  foreach k in array array['missing','unexpected','conflicts','unresolved'] loop
   valid:=valid and coalesce(jsonb_typeof(r.result->k)='number' and r.result->>k~'^(0|[1-9][0-9]{0,3})$',false);
   if valid then valid:=(r.result->>k)::numeric<=1000;end if;
  end loop;
  foreach k in array array['expectedNetMinor','reportedNetMinor'] loop
   valid:=valid and coalesce(jsonb_typeof(r.result->k)='string' and r.result->>k~'^-?(0|[1-9][0-9]{0,15})$' and r.result->>k<>'-0',false);
   if valid then valid:=abs((r.result->>k)::numeric)<=9000000000000000;end if;
  end loop;
  if valid then
   valid:=(r.result->>'balanced')::boolean=((r.result->>'missing')::int=0 and (r.result->>'unexpected')::int=0 and (r.result->>'conflicts')::int=0 and (r.result->>'unresolved')::int=0);
  end if;
  if valid then
   answer:=jsonb_build_object('outcome','RECORDED','organizationId',p_org,'merchantConfigId',p_merchant,'provider',p_provider,'mode','sandbox','currency','USD','reportId',r.report_id,
    'evidenceDigest',r.evidence_sha256,'snapshotDigest',r.snapshot_sha256,'recordedAt',to_char(r.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'report',r.result);
  end if;
 end if;
 -- All outcomes, including absence, require current original role/scope custody
 -- after merchant and report reads. This function never records activity or data.
 perform private.require_provider_workload(p_org,p_merchant,'payment');
 return answer;
end$$;
alter function private.sandbox_reconciliation_receipt(uuid,uuid,text,uuid,text,text) owner to propel_reconciliation_receipt_owner;
revoke all on function private.sandbox_reconciliation_receipt(uuid,uuid,text,uuid,text,text) from public,anon,authenticated,service_role;
-- Exact dedicated LOGIN execute grants and workload rows remain a separate
-- owner-approved operation. No generic runtime role or provisioner is added.
revoke create on schema private from propel_reconciliation_receipt_owner;
commit;
