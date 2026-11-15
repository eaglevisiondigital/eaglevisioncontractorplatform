-- UNAPPLIED successor to the unchanged #471 proposal, not an installer/migration.
-- Owner APPROVED business display INV-YYYY-NNNNNN independently per contractor.
-- UTC calendar year, annual reset and regression denial are qualification choices;
-- operational technical/accounting acceptance, source admission and SQL remain HELD.
-- Apply only after exact original issuance + exact #471 numbering in disposable DB.
begin;
alter table private.commercial_invoice_drafts
 add column number_year integer,
 drop constraint commercial_number_ordinal,
 add constraint commercial_number_ordinal unique(organization_id,number_namespace,number_year,number_ordinal),
 drop constraint commercial_issue_complete,
 add constraint commercial_issue_complete check(
  (issued_revision is null and invoice_number is null and issue_command_id is null and issued_actor_id is null and issued_at is null and issue_request_hash is null and number_namespace is null and number_ordinal is null and number_year is null)
  or (issued_revision is not null and issued_revision=current_revision and invoice_number is not null and issue_command_id is not null and issued_actor_id is not null and issued_at is not null and issue_request_hash is not null and issue_request_hash~'^[a-f0-9]{64}$' and amount_minor>0 and
   ((number_namespace is null and number_ordinal is null and number_year is null and invoice_number='INV-'||replace(id::text,'-','')) or
    (number_namespace is not null and number_namespace~'^[A-Z][A-Z0-9]{1,11}$' and number_ordinal is not null and
     ((number_year is null and number_ordinal between 1 and 99999999 and invoice_number=number_namespace||'-'||lpad(number_ordinal::text,8,'0')) or
      (number_year is not null and number_year between 1 and 9999 and number_year=extract(year from issued_at at time zone 'UTC')::integer and number_ordinal between 1 and 999999 and invoice_number='INV-'||lpad(number_year::text,4,'0')||'-'||lpad(number_ordinal::text,6,'0')))))));
create or replace function private.commercial_invoice_issue(p_org uuid,p_invoice uuid,p_command uuid,p_revision integer,p_customer uuid,p_location uuid,p_version uuid,p_source_hash text) returns jsonb
 language plpgsql security definer set search_path='' set lock_timeout='1500ms' as $$
declare actor uuid;h private.commercial_invoice_drafts;a private.commercial_issue_authorities;request_hash text;result jsonb;next_ordinal integer;allocation_year integer;issued_now timestamptz;begin
 actor:=private.commercial_draft_actor(p_org);
 if p_invoice is null or p_command is null or p_revision is null or p_revision<1 or p_customer is null or p_version is null or p_source_hash is null or p_source_hash!~'^[a-f0-9]{64}$' then raise exception 'Exact issuance identity required' using errcode='22023';end if;
 -- Number allocation precedes original command/invoice locks. One organization at a time.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('commercial-numbering/'||p_org::text,0));
 -- Same command/invoice lock namespace and order as the original draft writer.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text||'/'||p_command::text,0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text||'/'||p_invoice::text,0));
 actor:=private.commercial_draft_actor(p_org);
 request_hash:=encode(sha256(convert_to(jsonb_build_array('issue-v1',p_org,p_invoice,p_command,p_revision,p_customer,p_location,p_version,p_source_hash,actor)::text,'UTF8')),'hex');
 select * into a from private.commercial_issue_authorities where organization_id=p_org and invoice_id=p_invoice and actor_id=actor for share;
 if not found or a.revision<>p_revision or a.source_hash<>p_source_hash or a.revoked_at is not null or a.expires_at<=clock_timestamp() then raise exception 'Exact separately reviewed issuance authority required' using errcode='42501';end if;
 select * into h from private.commercial_invoice_drafts where organization_id=p_org and id=p_invoice;
 if not found then raise exception 'Exact draft required' using errcode='42501';end if;
 if h.issued_revision is not null then
  if h.issue_command_id<>p_command or h.issued_actor_id<>actor or h.issue_request_hash<>request_hash then raise exception 'Original issuance identity required; do not replace' using errcode='40001';end if;
  result:=private.commercial_issue_projection(p_org,p_invoice);
  perform private.commercial_draft_actor(p_org);
  if a.expires_at<=clock_timestamp() then raise exception 'Issuance authority expired after wait' using errcode='42501';end if;
  return result;
 end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Number allocation requires READ COMMITTED' using errcode='25001';end if;
 if a.number_namespace is null then raise exception 'Separately reviewed number namespace required' using errcode='42501';end if;
 -- Retain original writer's source lock ordering and final source check.
 perform 1 from public.estimates e join public.estimate_versions v on v.organization_id=e.organization_id and v.estimate_id=e.id
  where v.organization_id=p_org and v.id=p_version for share of e;
 perform 1 from public.estimate_versions where organization_id=p_org and id=p_version for share;
 perform 1 from public.customers where organization_id=p_org and id=p_customer for share;
 if p_location is not null then perform 1 from public.service_locations where organization_id=p_org and id=p_location and customer_id=p_customer for share;end if;
 select * into h from private.commercial_invoice_drafts where organization_id=p_org and id=p_invoice for update;
 if h.issued_revision is not null or h.current_revision<>p_revision or h.customer_id<>p_customer or h.location_id is distinct from p_location or h.source_version_id<>p_version or h.source_hash<>p_source_hash or h.amount_minor<=0
  or (private.commercial_draft_projection(p_org,p_invoice,null)->>'sourceCurrent')::boolean is distinct from true then raise exception 'Current exact draft revision and issued source required' using errcode='40001';end if;
 if exists(select 1 from private.commercial_invoice_draft_receipts where organization_id=p_org and command_id=p_command) then raise exception 'Draft command cannot become issue command' using errcode='40001';end if;
 select * into a from private.commercial_issue_authorities where organization_id=p_org and invoice_id=p_invoice and actor_id=actor for share;
 if not found or a.revision<>p_revision or a.source_hash<>p_source_hash or a.revoked_at is not null or a.expires_at<=clock_timestamp() then raise exception 'Exact separately reviewed issuance authority required' using errcode='42501';end if;
 -- UTC calendar year and annual restart are explicit fixture-only technical choices.
 -- Capture after all resource waits; use the SAME instant for year and issued_at.
 issued_now:=pg_catalog.clock_timestamp();
 allocation_year:=extract(year from issued_now at time zone 'UTC')::integer;
 if allocation_year not between 1 and 9999 then raise exception 'Invoice numbering year unavailable' using errcode='22003';end if;
 if exists(select 1 from private.commercial_invoice_drafts where organization_id=p_org and number_year>allocation_year) then raise exception 'Invoice numbering year regressed' using errcode='40001';end if;
 select coalesce(max(number_ordinal),0)+1 into next_ordinal from private.commercial_invoice_drafts where organization_id=p_org and number_namespace=a.number_namespace and number_year=allocation_year;
 if next_ordinal>999999 then raise exception 'Invoice numbering year exhausted' using errcode='22003';end if;
 update private.commercial_invoice_drafts set issued_revision=p_revision,number_namespace=a.number_namespace,number_year=allocation_year,number_ordinal=next_ordinal,invoice_number='INV-'||lpad(allocation_year::text,4,'0')||'-'||lpad(next_ordinal::text,6,'0'),issue_command_id=p_command,issued_actor_id=actor,issued_at=issued_now,issue_request_hash=request_hash where organization_id=p_org and id=p_invoice;
 result:=private.commercial_issue_projection(p_org,p_invoice);
 perform private.commercial_draft_actor(p_org);
 if a.expires_at<=clock_timestamp() then raise exception 'Issuance authority expired after wait' using errcode='42501';end if;
 return result;
end$$;
alter function private.commercial_invoice_issue(uuid,uuid,uuid,integer,uuid,uuid,uuid,text) owner to propel_commercial_draft_owner;
revoke all on function private.commercial_invoice_issue(uuid,uuid,uuid,integer,uuid,uuid,uuid,text) from public,anon,authenticated,service_role,propel_commercial_draft_runtime;
grant execute on function private.commercial_invoice_issue(uuid,uuid,uuid,integer,uuid,uuid,uuid,text) to propel_commercial_issue_runtime;

commit;
