-- PENDING OWNER REVIEW. Forward-only LOCAL validation; no hosted approval.
begin;
-- A direct database workload can SET request.jwt.claims, so provider audit must
-- never attribute a human actor through auth.uid(). The capability ID records the
-- real session_user identity separately from content-free entity-change events.
create function private.provider_audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare d jsonb;
begin
 if tg_op='DELETE' then d:=to_jsonb(old); else d:=to_jsonb(new); end if;
 insert into public.activity_events(organization_id,actor_id,action,entity_type,entity_id)
  values((d->>'organization_id')::uuid,null,'provider.'||lower(tg_op),tg_table_name,(d->>'id')::uuid);
 if tg_op='DELETE' then return old; end if;return new;
end $$;
revoke all on function private.provider_audit_change() from public,anon,authenticated;
create unique index sandbox_merchant_tenant_id on private.merchant_configurations(organization_id,id);
create table private.sandbox_gateway_authorizations (
 organization_id uuid not null references public.organizations(id),
 id uuid not null, merchant_id uuid not null, customer_id uuid not null,
 invoice_id uuid not null, provider text not null check(provider in ('authorize_net','nmi')),
 kind text not null check(kind in ('capture','refund')), amount_minor bigint not null check(amount_minor between 1 and 9000000000000),
 currency text not null check(currency='USD'), request_digest text not null check(request_digest ~ '^[a-f0-9]{64}$'),
 evidence_reference text not null check(length(evidence_reference) between 8 and 200),
 expires_at timestamptz not null, revoked_at timestamptz,
 primary key(organization_id,id),
 foreign key(organization_id,merchant_id) references private.merchant_configurations(organization_id,id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id)
);
create index sandbox_authorization_customer on private.sandbox_gateway_authorizations(organization_id,customer_id);
create index sandbox_authorization_merchant on private.sandbox_gateway_authorizations(organization_id,merchant_id);
create table private.sandbox_gateway_attempts (
 id uuid not null default gen_random_uuid(),
 organization_id uuid not null, idempotency_key uuid not null, authorization_id uuid not null,
 merchant_id uuid not null, invoice_id uuid not null,
 kind text not null check(kind in ('capture','refund')), capture_key uuid,
 amount_minor bigint not null check(amount_minor between 1 and 9000000000000),
 request_digest text not null check(request_digest ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','succeeded','declined','unknown')),
 result jsonb, created_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,idempotency_key), unique(organization_id,authorization_id),
 foreign key(organization_id,authorization_id) references private.sandbox_gateway_authorizations(organization_id,id),
 foreign key(organization_id,merchant_id) references private.merchant_configurations(organization_id,id),
 foreign key(organization_id,capture_key) references private.sandbox_gateway_attempts(organization_id,idempotency_key),
 check((kind='capture' and capture_key is null) or (kind='refund' and capture_key is not null)),
 constraint sandbox_status_result check((status='pending' and result is null) or
  (status<>'pending' and result is not null and coalesce(jsonb_typeof(result)='object',false)))
);
create index sandbox_attempt_merchant on private.sandbox_gateway_attempts(organization_id,merchant_id);
create index sandbox_attempt_capture on private.sandbox_gateway_attempts(organization_id,capture_key);
create table private.sandbox_gateway_settlements (
 id uuid not null default gen_random_uuid(),
 organization_id uuid not null, capture_key uuid not null, evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(), primary key(organization_id,capture_key),
 foreign key(organization_id,capture_key) references private.sandbox_gateway_attempts(organization_id,idempotency_key)
);
create function private.protect_sandbox_attempt() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Immutable gateway attempt'; end if;
 if old.status<>'pending' or new.status='pending' or
 (to_jsonb(new)-'status'-'result') is distinct from (to_jsonb(old)-'status'-'result') then
  raise exception 'Immutable gateway attempt';
 end if;
 return new;
end $$;
revoke all on function private.protect_sandbox_attempt() from public,anon,authenticated;
create trigger protect_sandbox_attempt before update or delete on private.sandbox_gateway_attempts
for each row execute function private.protect_sandbox_attempt();
create trigger protect_sandbox_settlement before update or delete on private.sandbox_gateway_settlements
for each row execute function private.release_immutable();
-- Only revocation is mutable. Re-approval is a new authorization, never un-revoke.
create function private.protect_gateway_authorization() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Immutable gateway authorization'; end if;
 if old.revoked_at is not null or new.revoked_at is null or
 (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') then
  raise exception 'Immutable gateway authorization';
 end if;
 return new;
end $$;
revoke all on function private.protect_gateway_authorization() from public,anon,authenticated;
create trigger protect_gateway_authorization before update or delete on private.sandbox_gateway_authorizations
for each row execute function private.protect_gateway_authorization();
do $$ declare t text; begin
 foreach t in array array['sandbox_gateway_authorizations','sandbox_gateway_attempts','sandbox_gateway_settlements'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated',t);
  execute format('create trigger audit_gateway after insert or update or delete on private.%I for each row execute function private.provider_audit_change()',t);
 end loop;
end $$;
create table private.sandbox_gateway_inbox (
 id uuid not null default gen_random_uuid(), organization_id uuid not null,
 merchant_id uuid not null, event_id text not null check(length(event_id) between 1 and 100),
 body_digest text not null check(body_digest ~ '^[a-f0-9]{64}$'), received_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,merchant_id,event_id),
 foreign key(organization_id,merchant_id) references private.merchant_configurations(organization_id,id)
);
alter table private.sandbox_gateway_inbox enable row level security;
revoke all on private.sandbox_gateway_inbox from public,anon,authenticated;
create trigger immutable_gateway_inbox before update or delete on private.sandbox_gateway_inbox for each row execute function private.release_immutable();
create trigger audit_gateway after insert on private.sandbox_gateway_inbox for each row execute function private.provider_audit_change();
-- Result projection is enforced in SQL too: no provider payload/PII may be stored.
alter table private.sandbox_gateway_attempts add constraint sandbox_result_projection check (
 result is null or coalesce(
  result ?& array['status','provider','transactionId','amountMinor','currency','mode'] and
  result-array['status','provider','transactionId','amountMinor','currency','mode']='{}'::jsonb and
  result->>'status'=status and result->>'provider' in ('authorize_net','nmi') and
  result->>'mode'='sandbox' and result->>'currency'='USD' and
  jsonb_typeof(result->'amountMinor')='number' and (result->>'amountMinor')::numeric=amount_minor and
  ((status='succeeded' and jsonb_typeof(result->'transactionId')='string' and
    result->>'transactionId' ~ '^[a-zA-Z0-9_-]{1,100}$' and result->>'transactionId'<>'0') or
   (status in ('unknown','declined') and result->'transactionId'='null'::jsonb)),false)
);

create unique index sandbox_transaction_once on private.sandbox_gateway_attempts(organization_id,merchant_id,(result->>'transactionId')) where status='succeeded';
-- Workload authorization is deliberately empty. No role, login, credential or grant
-- is created here. A later exact operation must approve each dedicated LOGIN identity.
-- session_user is database authenticated; SET ROLE/JWT/GUC/client org cannot replace it.
create table private.provider_workloads (
 organization_id uuid not null references public.organizations(id),
 id uuid not null default gen_random_uuid(), db_role name not null,
 service text not null check(service in ('payment','email','agreement')),
 scope_id uuid not null, created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null, revoked_at timestamptz,
 check(expires_at>created_at and expires_at<=created_at+interval '30 minutes'),
 approval_sha256 text not null check(approval_sha256 ~ '^[a-f0-9]{64}$'),
 primary key(organization_id,id), unique(db_role,organization_id,service,scope_id)
);
create index provider_workload_scope on private.provider_workloads(organization_id,service,scope_id);
create trigger immutable_workload before update or delete on private.provider_workloads for each row execute function private.protect_gateway_authorization();
create function private.require_provider_workload(p_org uuid,p_scope uuid,p_service text) returns uuid
language plpgsql security definer set search_path='' as $$
declare capability private.provider_workloads;
begin
 if session_user in ('anon','authenticated','service_role','authenticator','postgres','supabase_admin')
 or not exists(select 1 from pg_catalog.pg_roles where rolname=session_user and rolcanlogin and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolreplication)
 or exists(select 1 from pg_catalog.pg_auth_members where member=(select oid from pg_catalog.pg_roles where rolname=session_user))
 or not exists(select 1 from private.provider_workloads where db_role=session_user and organization_id=p_org and scope_id=p_scope and service=p_service and revoked_at is null and created_at<=clock_timestamp() and expires_at>clock_timestamp())
 then raise exception 'Provider workload denied' using errcode='42501'; end if;
 -- Identity selects the row; time is checked AFTER acquiring its lock. An
 -- unchanged tuple does not reevaluate a WHERE time predicate after waiting.
 select * into capability from private.provider_workloads where db_role=session_user and organization_id=p_org and scope_id=p_scope and service=p_service for update;
 if not found or capability.revoked_at is not null or capability.created_at>clock_timestamp() or capability.expires_at<=clock_timestamp() then
  raise exception 'Provider workload expired or revoked' using errcode='42501';
 end if;
 -- Pure checkpoint: callers audit once, and repeat this guard after their other
 -- locks and after DML. A late failure rolls back every effect of the command.
 return capability.id;
end $$;
revoke all on function private.require_provider_workload(uuid,uuid,text) from public,anon,authenticated;

-- Append-only provider observations. UNKNOWN resolution never edits the attempt
-- or releases held refund capacity automatically; it requires independent review.
create table private.sandbox_gateway_observations (
 id uuid not null default gen_random_uuid(), organization_id uuid not null,
 merchant_id uuid not null, observation_id uuid not null, attempt_key uuid not null,
 provider_transaction_id text not null check(provider_transaction_id ~ '^[a-zA-Z0-9_-]{1,100}$'),
 kind text not null check(kind in ('capture','refund')), amount_minor bigint not null check(amount_minor between 1 and 9000000000000),
 currency text not null check(currency='USD'), state text not null check(state in ('settled','pending','declined','not_found')),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'), observed_at timestamptz not null,
 primary key(organization_id,observation_id),
 foreign key(organization_id,merchant_id) references private.merchant_configurations(organization_id,id),
 foreign key(organization_id,attempt_key) references private.sandbox_gateway_attempts(organization_id,idempotency_key)
);
create index sandbox_observation_attempt on private.sandbox_gateway_observations(organization_id,attempt_key);
create index sandbox_observation_merchant on private.sandbox_gateway_observations(organization_id,merchant_id);

create table private.sandbox_gateway_reconciliations (
 id uuid not null default gen_random_uuid(), organization_id uuid not null,
 merchant_id uuid not null, report_id uuid not null,
 evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 snapshot_sha256 text not null check(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 result jsonb not null, created_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,report_id),
 foreign key(organization_id,merchant_id) references private.merchant_configurations(organization_id,id)
);
create index sandbox_reconciliation_merchant on private.sandbox_gateway_reconciliations(organization_id,merchant_id);
alter table private.sandbox_gateway_reconciliations enable row level security;
revoke all on private.sandbox_gateway_reconciliations from public,anon,authenticated;
create trigger immutable_reconciliation before update or delete on private.sandbox_gateway_reconciliations for each row execute function private.release_immutable();
create trigger audit_provider after insert on private.sandbox_gateway_reconciliations for each row execute function private.provider_audit_change();

-- Narrow command boundary, no arbitrary SQL, authorization creation or money ledger.
-- Execution remains REVOKED; no request-scoped API receives an owner/service key.
create function private.sandbox_gateway_control(p_org uuid,p_merchant uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 a private.sandbox_gateway_authorizations; r private.sandbox_gateway_attempts;
 c private.sandbox_gateway_attempts; m private.merchant_configurations;
 old_digest text; used numeric; outcome jsonb; k uuid; op_kind text; snapshot jsonb; snapshot_hash text; report jsonb;
 command_result jsonb; capability_id uuid;
begin
 capability_id:=private.require_provider_workload(p_org,p_merchant,'payment');
 insert into public.activity_events(organization_id,actor_id,action,entity_type,entity_id) values(p_org,null,'provider.payment.authorized','provider_workloads',capability_id);
 <<provider_command>>
 begin
 if coalesce(jsonb_typeof(p),'')<>'object' or pg_catalog.pg_column_size(p)>16384 or exists(select 1 from jsonb_each(p) where value='null'::jsonb) then raise exception 'Invalid command'; end if;
 select * into m from private.merchant_configurations where organization_id=p_org and id=p_merchant for update;
 if not found or m.environment<>'sandbox' then raise exception 'Sandbox merchant required'; end if;
 perform private.require_provider_workload(p_org,p_merchant,'payment');
 if p->>'provider' is distinct from m.provider then raise exception 'Provider merchant binding conflict'; end if;
 p:=p-'provider';
 -- finish can persist a returned outcome after merchant approval expires; new calls cannot.
 if p_action<>'finish' and m.status<>'approved' then raise exception 'Current sandbox approval required'; end if;
 if p_action='reserve' then
  if p-array['key','authorizationId','invoiceId','kind','amountMinor','digest','expiresAt','captureKey','transactionId']<>'{}'::jsonb or not(p ?& array['key','authorizationId','invoiceId','kind','amountMinor','digest','expiresAt']) then raise exception 'Invalid reservation'; end if;
  k:=(p->>'key')::uuid; op_kind:=p->>'kind';
  if op_kind not in ('capture','refund') or not((p->>'expiresAt')::timestamptz>clock_timestamp()) then raise exception 'Expired reservation'; end if;
  select * into a from private.sandbox_gateway_authorizations where organization_id=p_org and id=(p->>'authorizationId')::uuid and merchant_id=p_merchant and invoice_id=(p->>'invoiceId')::uuid and provider=m.provider and kind=p->>'kind' and amount_minor=(p->>'amountMinor')::bigint and request_digest=p->>'digest' and revoked_at is null and expires_at>clock_timestamp() for update;
  if not found or a.expires_at<=clock_timestamp() then raise exception 'Independent provider authorization required'; end if;
  perform private.require_provider_workload(p_org,p_merchant,'payment');
  select * into r from private.sandbox_gateway_attempts where organization_id=p_org and idempotency_key=k;
  if found then
   if r.request_digest<>p->>'digest' or r.authorization_id<>a.id or r.merchant_id<>p_merchant or r.kind<>op_kind then raise exception 'Idempotency conflict'; end if;
   if r.status in ('pending','unknown') then command_result:=jsonb_build_object('status','unknown'); exit provider_command; end if;
   command_result:=jsonb_build_object('status','existing','result',r.result); exit provider_command;
  end if;
  if op_kind='capture' and (p ? 'captureKey' or p ? 'transactionId') then raise exception 'Capture scope conflict'; end if;
  if op_kind='refund' then
   select x.* into c from private.sandbox_gateway_attempts x join private.sandbox_gateway_settlements s on s.organization_id=x.organization_id and s.capture_key=x.idempotency_key join private.sandbox_gateway_authorizations ca on ca.organization_id=x.organization_id and ca.id=x.authorization_id
    where x.organization_id=p_org and x.idempotency_key=(p->>'captureKey')::uuid and x.merchant_id=p_merchant and x.invoice_id=a.invoice_id and ca.customer_id=a.customer_id and x.kind='capture' and x.status='succeeded' and x.result->>'transactionId'=p->>'transactionId' for update of x;
   if not found then raise exception 'Settled matching capture required'; end if;
   select coalesce(sum(amount_minor),0) into used from private.sandbox_gateway_attempts where organization_id=p_org and capture_key=c.idempotency_key and status<>'declined';
   if used+a.amount_minor>c.amount_minor then raise exception 'Refund capacity exceeded'; end if;
  end if;
  -- Refund capture locks and any prior waits must not extend new-call authority.
  perform private.require_provider_workload(p_org,p_merchant,'payment');
  if a.expires_at<=clock_timestamp() or (p->>'expiresAt')::timestamptz<=clock_timestamp() then raise exception 'Expired reservation' using errcode='42501'; end if;
  insert into private.sandbox_gateway_attempts(organization_id,idempotency_key,authorization_id,merchant_id,invoice_id,kind,capture_key,amount_minor,request_digest)
   values(p_org,k,a.id,p_merchant,a.invoice_id,op_kind,c.idempotency_key,a.amount_minor,a.request_digest);
  command_result:=jsonb_build_object('status','reserved'); exit provider_command;
 elsif p_action='finish' then
  if p-array['key','authorizationId','invoiceId','kind','result']<>'{}'::jsonb or not(p ?& array['key','authorizationId','invoiceId','kind','result']) then raise exception 'Invalid completion'; end if;
  select * into r from private.sandbox_gateway_attempts where organization_id=p_org and merchant_id=p_merchant and idempotency_key=(p->>'key')::uuid for update;
  if not found or r.authorization_id<>(p->>'authorizationId')::uuid or r.invoice_id<>(p->>'invoiceId')::uuid or r.kind<>p->>'kind' or (p->'result'->>'provider') is distinct from m.provider then raise exception 'Unreserved outcome'; end if;
  outcome:=p->'result';
  if r.status<>'pending' then
   if r.result=outcome then command_result:=jsonb_build_object('status','duplicate'); exit provider_command; end if;
   raise exception 'Immutable outcome';
  end if;
  update private.sandbox_gateway_attempts set status=outcome->>'status',result=outcome where organization_id=p_org and idempotency_key=r.idempotency_key;
  command_result:=jsonb_build_object('status','recorded'); exit provider_command;
 elsif p_action='webhook' then
  if p-array['eventId','digest']<>'{}'::jsonb or not(p ?& array['eventId','digest']) then raise exception 'Invalid webhook'; end if;
  select body_digest into old_digest from private.sandbox_gateway_inbox where organization_id=p_org and merchant_id=p_merchant and event_id=p->>'eventId';
  if found then
   if old_digest<>p->>'digest' then raise exception 'Conflicting webhook replay'; end if;
   command_result:=jsonb_build_object('status','duplicate'); exit provider_command;
  end if;
  insert into private.sandbox_gateway_inbox(organization_id,merchant_id,event_id,body_digest) values(p_org,p_merchant,p->>'eventId',p->>'digest');
  command_result:=jsonb_build_object('status','recorded'); exit provider_command;
 elsif p_action in ('transactions','reconcile') then
  if (select count(*) from private.sandbox_gateway_attempts where organization_id=p_org and merchant_id=p_merchant)>1000 then raise exception 'Reconciliation page limit; reviewed pagination required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('key',idempotency_key,'status',status,'kind',kind,'amountMinor',amount_minor,'transactionId',result->>'transactionId') order by idempotency_key),'[]'::jsonb) into snapshot from private.sandbox_gateway_attempts where organization_id=p_org and merchant_id=p_merchant;
  snapshot_hash:=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex');
  if p_action='transactions' then
   if p<>'{}'::jsonb then raise exception 'Invalid transaction list'; end if;
   command_result:=jsonb_build_object('snapshot',snapshot_hash,'transactions',snapshot); exit provider_command;
  end if;
  if p-array['reportId','digest','snapshot','rows']<>'{}'::jsonb or not(p ?& array['reportId','digest','snapshot','rows']) or jsonb_typeof(p->'rows')<>'array' or jsonb_array_length(p->'rows')>1000 then raise exception 'Invalid reconciliation'; end if;
  if p->>'snapshot'<>snapshot_hash then raise exception 'Reconciliation snapshot changed'; end if;
  if exists(select 1 from jsonb_array_elements(p->'rows') x where jsonb_typeof(x)<>'object' or not(x ?& array['transactionId','kind','amountMinor','currency']) or x-array['transactionId','kind','amountMinor','currency']<>'{}'::jsonb or coalesce(x->>'transactionId','')!~'^[a-zA-Z0-9_-]{1,100}$' or x->>'transactionId'='0' or coalesce(x->>'kind','') not in ('capture','refund') or x->>'currency' is distinct from 'USD' or jsonb_typeof(x->'amountMinor') is distinct from 'number' or coalesce(x->>'amountMinor','')!~'^[1-9][0-9]{0,12}$' or (x->>'amountMinor')::numeric>9000000000000) then raise exception 'Invalid statement row'; end if;
  if exists(select x->>'transactionId' from jsonb_array_elements(p->'rows') x group by x->>'transactionId' having count(*)>1) then raise exception 'Duplicate statement transaction'; end if;
  with expected as (select x->>'transactionId' txn,x->>'kind' kind,(x->>'amountMinor')::bigint amount from jsonb_array_elements(snapshot) x where x->>'status'='succeeded'),
  reported as (select x->>'transactionId' txn,x->>'kind' kind,(x->>'amountMinor')::bigint amount from jsonb_array_elements(p->'rows') x),
  compared as (select ex.txn local_id,rp.txn remote_id,ex.kind local_kind,rp.kind remote_kind,ex.amount local_amount,rp.amount remote_amount from expected ex full join reported rp using(txn))
  select jsonb_build_object('missing',(select count(*) from compared where remote_id is null),'unexpected',(select count(*) from compared where local_id is null),'conflicts',(select count(*) from compared where local_id is not null and remote_id is not null and (local_kind<>remote_kind or local_amount<>remote_amount)),
    'unresolved',(select count(*) from jsonb_array_elements(snapshot) x where x->>'status' in ('pending','unknown')),
    'expectedNetMinor',coalesce((select sum(amount*case when kind='refund' then -1 else 1 end) from expected),0)::text,
    'reportedNetMinor',coalesce((select sum(amount*case when kind='refund' then -1 else 1 end) from reported),0)::text) into report;
  report:=report||jsonb_build_object('balanced',(report->>'missing')::int=0 and (report->>'unexpected')::int=0 and (report->>'conflicts')::int=0 and (report->>'unresolved')::int=0);
  select result into outcome from private.sandbox_gateway_reconciliations where organization_id=p_org and report_id=(p->>'reportId')::uuid;
  if found then
   if not exists(select 1 from private.sandbox_gateway_reconciliations where organization_id=p_org and report_id=(p->>'reportId')::uuid and merchant_id=p_merchant and evidence_sha256=p->>'digest' and snapshot_sha256=snapshot_hash and result=report) then raise exception 'Reconciliation replay conflict'; end if;
   command_result:=jsonb_build_object('status','duplicate','report',outcome); exit provider_command;
  end if;
  insert into private.sandbox_gateway_reconciliations(organization_id,merchant_id,report_id,evidence_sha256,snapshot_sha256,result) values(p_org,p_merchant,(p->>'reportId')::uuid,p->>'digest',snapshot_hash,report);
  command_result:=jsonb_build_object('status','recorded','report',report); exit provider_command;
 elsif p_action='observe' then
  if p-array['observationId','key','transactionId','kind','amountMinor','currency','state','digest','observedAt']<>'{}'::jsonb or not(p ?& array['observationId','key','transactionId','kind','amountMinor','currency','state','digest','observedAt']) then raise exception 'Invalid observation'; end if;
  select * into r from private.sandbox_gateway_attempts where organization_id=p_org and merchant_id=p_merchant and idempotency_key=(p->>'key')::uuid for update;
  if not found or r.kind<>p->>'kind' or r.amount_minor<>(p->>'amountMinor')::bigint or p->>'currency'<>'USD' or (p->>'observedAt')::timestamptz<r.created_at-interval '1 minute' or (p->>'observedAt')::timestamptz>clock_timestamp()+interval '1 minute' then raise exception 'Observation scope conflict'; end if;
  if r.status='succeeded' and r.result->>'transactionId'<>p->>'transactionId' then raise exception 'Transaction conflict'; end if;
  select evidence_sha256 into old_digest from private.sandbox_gateway_observations where organization_id=p_org and observation_id=(p->>'observationId')::uuid;
  if found then
   if not exists(select 1 from private.sandbox_gateway_observations where organization_id=p_org and merchant_id=p_merchant and observation_id=(p->>'observationId')::uuid and attempt_key=r.idempotency_key and provider_transaction_id=p->>'transactionId' and kind=r.kind and amount_minor=r.amount_minor and currency='USD' and state=p->>'state' and evidence_sha256=p->>'digest' and observed_at=(p->>'observedAt')::timestamptz) then raise exception 'Observation replay conflict'; end if;
   command_result:=jsonb_build_object('status','duplicate'); exit provider_command;
  end if;
  insert into private.sandbox_gateway_observations(organization_id,merchant_id,observation_id,attempt_key,provider_transaction_id,kind,amount_minor,currency,state,evidence_sha256,observed_at)
   values(p_org,p_merchant,(p->>'observationId')::uuid,r.idempotency_key,p->>'transactionId',r.kind,r.amount_minor,'USD',p->>'state',p->>'digest',(p->>'observedAt')::timestamptz);
  if p->>'state'='settled' and r.kind='capture' and r.status='succeeded' then
   insert into private.sandbox_gateway_settlements(organization_id,capture_key,evidence_sha256) values(p_org,r.idempotency_key,p->>'digest') on conflict do nothing;
  end if;
  command_result:=jsonb_build_object('status','recorded'); exit provider_command;
 end if;
 raise exception 'Unsupported gateway command';
 end provider_command;
 -- One exit checkpoint covers reads/replays and implicit DML/FK/audit waits.
 if p_action='reserve' and (a.revoked_at is not null or a.expires_at<=clock_timestamp() or (p->>'expiresAt')::timestamptz<=clock_timestamp()) then
  raise exception 'Expired reservation' using errcode='42501';
 end if;
 perform private.require_provider_workload(p_org,p_merchant,'payment');
 return command_result;
end $$;
revoke all on function private.sandbox_gateway_control(uuid,uuid,text,jsonb) from public,anon,authenticated;

-- Durable email preparation only: no sendable state, recipients/bodies/tokens in rows.
-- Independently reviewed sender bindings are not created by this migration or API.
-- Revocation locks serialize with preparation; the existing public email profile
-- is never promoted to verified by a synthetic fixture or this migration.
create table private.provider_email_sender_bindings (
 id uuid not null default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 configuration_id uuid not null,version integer not null check(version>0),
 profile_digest text not null check(profile_digest ~ '^[a-f0-9]{64}$'),
 provider_account_id text not null,domain_id uuid not null,expires_at timestamptz not null,revoked_at timestamptz,
 primary key(organization_id,configuration_id,version)
);
create trigger immutable_sender_binding before update or delete on private.provider_email_sender_bindings for each row execute function private.protect_gateway_authorization();
create table private.provider_email_domains (
 id uuid not null default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 configuration_id uuid not null, version integer not null check(version>0), profile_digest text not null check(profile_digest ~ '^[a-f0-9]{64}$'),
 provider_account_id text not null check(length(provider_account_id) between 1 and 100), domain_id uuid not null,
 checked_at timestamptz not null, expires_at timestamptz not null,
 evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 primary key(organization_id,id), unique(organization_id,id,configuration_id),
 foreign key(organization_id,configuration_id,version) references private.provider_email_sender_bindings(organization_id,configuration_id,version),
 check(expires_at>checked_at and expires_at<=checked_at+interval '15 minutes')
);
create index provider_domain_config on private.provider_email_domains(organization_id,configuration_id,version);
create table private.provider_email_outbox (
 id uuid not null default gen_random_uuid(), organization_id uuid not null,
 configuration_id uuid not null, domain_verification_id uuid not null,
 customer_id uuid not null, document_id uuid not null,
 purpose text not null check(purpose in ('estimate_ready','agreement_ready','invoice_ready')),
 idempotency_key text not null check(idempotency_key ~ '^[a-f0-9]{64}$'),
 content_digest text not null check(content_digest ~ '^[a-f0-9]{64}$'),
 delivery text not null default 'disabled' check(delivery='disabled'), created_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,id), unique(organization_id,idempotency_key),
 foreign key(organization_id,domain_verification_id,configuration_id) references private.provider_email_domains(organization_id,id,configuration_id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id)
);
create index provider_outbox_customer on private.provider_email_outbox(organization_id,customer_id);
create index provider_outbox_domain on private.provider_email_outbox(organization_id,domain_verification_id,configuration_id);
-- Only an independently approved future delivery integration can insert a binding.
-- This migration contains no command capable of doing so.
create table private.provider_email_bindings (
 id uuid not null default gen_random_uuid(),organization_id uuid not null,outbox_id uuid not null,
 provider_account_id text not null,provider_message_id uuid not null,
 primary key(organization_id,id),unique(organization_id,outbox_id),unique(provider_account_id,provider_message_id),
 foreign key(organization_id,outbox_id) references private.provider_email_outbox(organization_id,id)
);
create table private.provider_email_events (
 id uuid not null default gen_random_uuid(),organization_id uuid not null,binding_id uuid not null,event_id text not null check(length(event_id) between 1 and 200),
 body_digest text not null check(body_digest ~ '^[a-f0-9]{64}$'),type text not null check(type in ('email.sent','email.delivered','email.bounced','email.complained')),
 primary key(organization_id,id),unique(organization_id,binding_id,event_id),
 foreign key(organization_id,binding_id) references private.provider_email_bindings(organization_id,id)
);
create table private.provider_email_suppressions (
 id uuid not null default gen_random_uuid(),organization_id uuid not null,customer_id uuid not null,
 provider_account_id text not null,event_id uuid not null,
 primary key(organization_id,id),unique(organization_id,customer_id,provider_account_id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id),
 foreign key(organization_id,event_id) references private.provider_email_events(organization_id,id)
);
create index provider_suppression_event on private.provider_email_suppressions(organization_id,event_id);
-- All new tables are private, default-deny even under an accidental SELECT grant.
do $$declare t text;begin
 foreach t in array array['provider_workloads','sandbox_gateway_observations','provider_email_sender_bindings','provider_email_domains','provider_email_outbox','provider_email_bindings','provider_email_events','provider_email_suppressions'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated',t);
  execute format('create trigger audit_provider after insert or update or delete on private.%I for each row execute function private.provider_audit_change()',t);
  if t not in ('provider_workloads','provider_email_sender_bindings') then execute format('create trigger immutable_provider before update or delete on private.%I for each row execute function private.release_immutable()',t); end if;
 end loop;
end $$;

create function private.provider_email_control(p_org uuid,p_config uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.provider_email_domains; o private.provider_email_outbox;
 b private.provider_email_bindings; e private.provider_email_events; n uuid;
 command_result jsonb; capability_id uuid;
begin
 capability_id:=private.require_provider_workload(p_org,p_config,'email');
 insert into public.activity_events(organization_id,actor_id,action,entity_type,entity_id) values(p_org,null,'provider.email.authorized','provider_workloads',capability_id);
 <<provider_command>>
 begin
 if coalesce(jsonb_typeof(p),'')<>'object' or pg_catalog.pg_column_size(p)>8192 or exists(select 1 from jsonb_each(p) where value='null'::jsonb) then raise exception 'Invalid email command'; end if;
 -- Serialize across all workload identities for this sender, including suppression.
 perform 1 from private.provider_email_sender_bindings where organization_id=p_org and configuration_id=p_config order by version for update;
 -- Serialize preparation/events and domain changes for this tenant/configuration.
 perform 1 from private.provider_workloads where db_role=session_user and organization_id=p_org and scope_id=p_config and service='email' for update;
 perform private.require_provider_workload(p_org,p_config,'email');
 if p_action in ('domain','prepare') then
  perform 1 from private.provider_email_sender_bindings where organization_id=p_org and configuration_id=p_config and revoked_at is null and expires_at>clock_timestamp() for share;
  if not found then raise exception 'Current sender binding required'; end if;
 end if;
 if p_action='domain' then
  if p-array['id','version','profileDigest','accountId','domainId','checkedAt','expiresAt','digest']<>'{}'::jsonb or not(p ?& array['id','version','profileDigest','accountId','domainId','checkedAt','expiresAt','digest']) then raise exception 'Invalid domain evidence'; end if;
  if (p->>'checkedAt')::timestamptz>clock_timestamp()+interval '1 minute' or (p->>'checkedAt')::timestamptz<clock_timestamp()-interval '5 minutes' then raise exception 'Stale domain evidence'; end if;
  if not exists(select 1 from private.provider_email_sender_bindings where organization_id=p_org and configuration_id=p_config and version=(p->>'version')::integer and profile_digest=p->>'profileDigest' and provider_account_id=p->>'accountId' and domain_id=(p->>'domainId')::uuid and revoked_at is null and expires_at>clock_timestamp()) then raise exception 'Sender evidence binding conflict'; end if;
  select * into d from private.provider_email_domains where organization_id=p_org and id=(p->>'id')::uuid;
  if found then
   if d.configuration_id<>p_config or d.version<>(p->>'version')::integer or d.profile_digest<>p->>'profileDigest' or d.provider_account_id<>p->>'accountId' or d.domain_id<>(p->>'domainId')::uuid or d.evidence_sha256<>p->>'digest' or d.checked_at<>(p->>'checkedAt')::timestamptz or d.expires_at<>(p->>'expiresAt')::timestamptz then raise exception 'Domain replay conflict'; end if;
   command_result:=jsonb_build_object('status','duplicate'); exit provider_command;
  end if;
  insert into private.provider_email_domains(organization_id,id,configuration_id,version,profile_digest,provider_account_id,domain_id,checked_at,expires_at,evidence_sha256)
   values(p_org,(p->>'id')::uuid,p_config,(p->>'version')::integer,p->>'profileDigest',p->>'accountId',(p->>'domainId')::uuid,(p->>'checkedAt')::timestamptz,(p->>'expiresAt')::timestamptz,p->>'digest') returning * into d;
  command_result:=jsonb_build_object('status','recorded'); exit provider_command;
 elsif p_action='prepare' then
  if p-array['domainId','customerId','documentId','purpose','key','digest']<>'{}'::jsonb or not(p ?& array['domainId','customerId','documentId','purpose','key','digest']) then raise exception 'Invalid outbox preparation'; end if;
  select * into d from private.provider_email_domains where organization_id=p_org and configuration_id=p_config order by checked_at desc,id desc limit 1;
  if not found or d.id<>(p->>'domainId')::uuid or d.expires_at<=clock_timestamp() then raise exception 'Current domain verification required'; end if;
  if not exists(select 1 from private.provider_email_sender_bindings where organization_id=p_org and configuration_id=p_config and version=d.version and profile_digest=d.profile_digest and revoked_at is null and expires_at>clock_timestamp()) then raise exception 'Sender binding revoked'; end if;
  if exists(select 1 from private.provider_email_suppressions where organization_id=p_org and customer_id=(p->>'customerId')::uuid and provider_account_id=d.provider_account_id) then raise exception 'Recipient suppressed'; end if;
  select * into o from private.provider_email_outbox where organization_id=p_org and idempotency_key=p->>'key';
  if found then
   if o.configuration_id<>p_config or o.customer_id<>(p->>'customerId')::uuid or o.document_id<>(p->>'documentId')::uuid or o.purpose<>p->>'purpose' or o.content_digest<>p->>'digest' then raise exception 'Outbox replay conflict'; end if;
   command_result:=jsonb_build_object('status','duplicate','id',o.id); exit provider_command;
  end if;
  insert into private.provider_email_outbox(organization_id,configuration_id,domain_verification_id,customer_id,document_id,purpose,idempotency_key,content_digest)
   values(p_org,p_config,d.id,(p->>'customerId')::uuid,(p->>'documentId')::uuid,p->>'purpose',p->>'key',p->>'digest') returning id into n;
  command_result:=jsonb_build_object('status','recorded','id',n); exit provider_command;
 elsif p_action='event' then
  if p-array['accountId','messageId','eventId','digest','type']<>'{}'::jsonb or not(p ?& array['accountId','messageId','eventId','digest','type']) then raise exception 'Invalid email event'; end if;
  select x.* into b from private.provider_email_bindings x join private.provider_email_outbox y on y.organization_id=x.organization_id and y.id=x.outbox_id
   where x.organization_id=p_org and x.provider_account_id=p->>'accountId' and x.provider_message_id=(p->>'messageId')::uuid and y.configuration_id=p_config;
  if not found then raise exception 'Verified delivery binding required'; end if;
  select * into e from private.provider_email_events where organization_id=p_org and binding_id=b.id and event_id=p->>'eventId';
  if found then
   if e.body_digest<>p->>'digest' or e.type<>p->>'type' then raise exception 'Email event conflict'; end if;
   command_result:=jsonb_build_object('status','duplicate'); exit provider_command;
  end if;
  insert into private.provider_email_events(organization_id,binding_id,event_id,body_digest,type) values(p_org,b.id,p->>'eventId',p->>'digest',p->>'type') returning id into n;
  if p->>'type' in ('email.bounced','email.complained') then
   insert into private.provider_email_suppressions(organization_id,customer_id,provider_account_id,event_id)
    select p_org,customer_id,b.provider_account_id,n from private.provider_email_outbox where organization_id=p_org and id=b.outbox_id on conflict do nothing;
  end if;
  command_result:=jsonb_build_object('status','recorded'); exit provider_command;
 end if;
 raise exception 'Unsupported email command';
 end provider_command;
 -- One exit checkpoint covers reads/replays and implicit DML/FK/audit waits.
 if p_action in ('domain','prepare') then
  if d.expires_at<=clock_timestamp() or not exists(select 1 from private.provider_email_sender_bindings where organization_id=p_org and configuration_id=p_config and version=d.version and profile_digest=d.profile_digest and provider_account_id=d.provider_account_id and domain_id=d.domain_id and revoked_at is null and expires_at>clock_timestamp()) then
   raise exception 'Expired sender or domain authority' using errcode='42501';
  end if;
 end if;
 perform private.require_provider_workload(p_org,p_config,'email');
 return command_result;
end $$;
revoke all on function private.provider_email_control(uuid,uuid,text,jsonb) from public,anon,authenticated;

-- Immutable binding creation is intentionally NOT exposed. A separately reviewed
-- accepted-version/customer-consent workflow must populate it before sandbox use.
create table private.provider_agreement_bindings (
 id uuid not null default gen_random_uuid(),organization_id uuid not null,
 agreement_id uuid not null,customer_id uuid not null,estimate_version_id uuid not null,
 signer_user_id uuid not null references auth.users(id),binding jsonb not null,
 binding_digest text not null check(binding_digest ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,revoked_at timestamptz,
 primary key(organization_id,agreement_id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id),
 foreign key(organization_id,estimate_version_id) references public.estimate_versions(organization_id,id),
 check(coalesce(jsonb_typeof(binding)='object' and binding ?& array['mode','organizationId','agreementId','customerId','estimateVersionId','signerUserId','expiresAt','originalSha256','providerAccountId','envelopeId','acceptedDecisionId','signerEmail'] and (binding->>'expiresAt')::timestamptz=expires_at and binding->>'mode'='sandbox' and (binding->>'organizationId')::uuid=organization_id and (binding->>'agreementId')::uuid=agreement_id and (binding->>'customerId')::uuid=customer_id and (binding->>'estimateVersionId')::uuid=estimate_version_id and (binding->>'signerUserId')::uuid=signer_user_id,false))
);
create index provider_agreement_customer on private.provider_agreement_bindings(organization_id,customer_id);
create index provider_agreement_version on private.provider_agreement_bindings(organization_id,estimate_version_id);
create index provider_agreement_signer on private.provider_agreement_bindings(signer_user_id);
create trigger immutable_agreement_binding before update or delete on private.provider_agreement_bindings for each row execute function private.protect_gateway_authorization();
create table private.provider_agreement_evidence (
 id uuid not null default gen_random_uuid(),organization_id uuid not null,agreement_id uuid not null,
 binding_digest text not null check(binding_digest ~ '^[a-f0-9]{64}$'),
 signed_sha256 text not null check(signed_sha256 ~ '^[a-f0-9]{64}$'),certificate_sha256 text not null check(certificate_sha256 ~ '^[a-f0-9]{64}$'),
 record_digest text not null check(record_digest ~ '^[a-f0-9]{64}$'),
 mode text not null default 'sandbox' check(mode='sandbox'),legal_execution_enabled boolean not null default false check(not legal_execution_enabled),
 primary key(organization_id,agreement_id),
 foreign key(organization_id,agreement_id) references private.provider_agreement_bindings(organization_id,agreement_id)
);
create table private.provider_agreement_inbox (
 id uuid not null default gen_random_uuid(),organization_id uuid not null,agreement_id uuid not null,
 event_id text not null check(event_id ~ '^[a-f0-9]{64}$'),body_digest text not null check(body_digest ~ '^[a-f0-9]{64}$'),
 primary key(organization_id,agreement_id,event_id),
 foreign key(organization_id,agreement_id) references private.provider_agreement_bindings(organization_id,agreement_id)
);
do $$declare t text;begin
 foreach t in array array['provider_agreement_bindings','provider_agreement_evidence','provider_agreement_inbox'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated',t);
  execute format('create trigger audit_provider after insert or update or delete on private.%I for each row execute function private.provider_audit_change()',t);
  if t<>'provider_agreement_bindings' then execute format('create trigger immutable_provider before update or delete on private.%I for each row execute function private.release_immutable()',t); end if;
 end loop;
end $$;
create function private.provider_agreement_control(p_org uuid,p_agreement uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b private.provider_agreement_bindings;e private.provider_agreement_evidence;old_digest text;
 command_result jsonb; capability_id uuid;
begin
 capability_id:=private.require_provider_workload(p_org,p_agreement,'agreement');
 insert into public.activity_events(organization_id,actor_id,action,entity_type,entity_id) values(p_org,null,'provider.agreement.authorized','provider_workloads',capability_id);
 <<provider_command>>
 begin
 if coalesce(jsonb_typeof(p),'')<>'object' or pg_catalog.pg_column_size(p)>8192 or exists(select 1 from jsonb_each(p) where value='null'::jsonb) then raise exception 'Invalid agreement command'; end if;
 select * into b from private.provider_agreement_bindings where organization_id=p_org and agreement_id=p_agreement for update;
 if not found or b.revoked_at is not null or b.expires_at<=clock_timestamp() or not exists(select 1 from auth.users where id=b.signer_user_id and email_confirmed_at is not null and email=b.binding->>'signerEmail') or not exists(select 1 from public.estimate_versions where organization_id=p_org and id=b.estimate_version_id and customer_id=b.customer_id and status='issued') or not exists(select 1 from public.organizations where id=p_org and status='active') or not exists(select 1 from public.portal_identities where organization_id=p_org and customer_id=b.customer_id and user_id=b.signer_user_id and active) then raise exception 'Current agreement authority required'; end if;
 perform 1 from public.portal_identities where organization_id=p_org and customer_id=b.customer_id and user_id=b.signer_user_id and active for share;
 if not found then raise exception 'Current agreement authority required'; end if;
 perform 1 from auth.users where id=b.signer_user_id and email_confirmed_at is not null and email=b.binding->>'signerEmail' for share;
 if not found then raise exception 'Current signer required'; end if;
 perform 1 from public.organizations where id=p_org and status='active' for share;
 if not found then raise exception 'Current organization required'; end if;
 perform private.require_provider_workload(p_org,p_agreement,'agreement');
 if b.expires_at<=clock_timestamp() then raise exception 'Expired agreement authority' using errcode='42501'; end if;
 if p_action='load' then
  if p<>'{}'::jsonb then raise exception 'Invalid load'; end if;
  command_result:=jsonb_build_object('binding',b.binding,'digest',b.binding_digest); exit provider_command;
 end if;
 if p->>'bindingDigest' is distinct from b.binding_digest then raise exception 'Agreement binding changed'; end if;
 if p_action='checkpoint' then
  if p-array['bindingDigest']<>'{}'::jsonb then raise exception 'Invalid checkpoint'; end if;
  command_result:=jsonb_build_object('status','current'); exit provider_command;
 elsif p_action='complete' then
  if p-array['bindingDigest','signedSha256','certificateSha256','recordDigest']<>'{}'::jsonb or not(p ?& array['bindingDigest','signedSha256','certificateSha256','recordDigest']) then raise exception 'Invalid agreement evidence'; end if;
  if p->>'signedSha256'=b.binding->>'originalSha256' then raise exception 'Unchanged agreement'; end if;
  select * into e from private.provider_agreement_evidence where organization_id=p_org and agreement_id=p_agreement;
  if found then
   if e.binding_digest<>b.binding_digest or e.signed_sha256<>p->>'signedSha256' or e.certificate_sha256<>p->>'certificateSha256' or e.record_digest<>p->>'recordDigest' then raise exception 'Immutable agreement evidence'; end if;
   command_result:=jsonb_build_object('status','duplicate'); exit provider_command;
  end if;
  insert into private.provider_agreement_evidence(organization_id,agreement_id,binding_digest,signed_sha256,certificate_sha256,record_digest)
   values(p_org,p_agreement,b.binding_digest,p->>'signedSha256',p->>'certificateSha256',p->>'recordDigest');
  command_result:=jsonb_build_object('status','recorded'); exit provider_command;
 elsif p_action='event' then
  if p-array['bindingDigest','eventId','digest','accountId','envelopeId']<>'{}'::jsonb or not(p ?& array['bindingDigest','eventId','digest','accountId','envelopeId']) or p->>'accountId' is distinct from b.binding->>'providerAccountId' or p->>'envelopeId' is distinct from b.binding->>'envelopeId' then raise exception 'Connect binding conflict'; end if;
  select body_digest into old_digest from private.provider_agreement_inbox where organization_id=p_org and agreement_id=p_agreement and event_id=p->>'eventId';
  if found then
   if old_digest<>p->>'digest' then raise exception 'Connect replay conflict'; end if;
   command_result:=jsonb_build_object('status','duplicate'); exit provider_command;
  end if;
  insert into private.provider_agreement_inbox(organization_id,agreement_id,event_id,body_digest) values(p_org,p_agreement,p->>'eventId',p->>'digest');
  command_result:=jsonb_build_object('status','recorded'); exit provider_command;
 end if;
 raise exception 'Unsupported agreement command';
 end provider_command;
 -- One exit checkpoint covers reads/replays and implicit DML/FK/audit waits.
 if b.revoked_at is not null or b.expires_at<=clock_timestamp() then
  raise exception 'Expired agreement authority' using errcode='42501';
 end if;
 perform private.require_provider_workload(p_org,p_agreement,'agreement');
 return command_result;
end $$;
revoke all on function private.provider_agreement_control(uuid,uuid,text,jsonb) from public,anon,authenticated;
do $$declare t text;f text;begin
 if exists(select 1 from pg_catalog.pg_roles where rolname='service_role') then
  foreach t in array array['sandbox_gateway_authorizations','sandbox_gateway_attempts','sandbox_gateway_settlements','sandbox_gateway_inbox','sandbox_gateway_observations','sandbox_gateway_reconciliations','provider_workloads','provider_email_sender_bindings','provider_email_domains','provider_email_outbox','provider_email_bindings','provider_email_events','provider_email_suppressions','provider_agreement_bindings','provider_agreement_evidence','provider_agreement_inbox'] loop
   execute format('revoke all on private.%I from service_role',t);
  end loop;
  foreach f in array array['require_provider_workload(uuid,uuid,text)','sandbox_gateway_control(uuid,uuid,text,jsonb)','provider_email_control(uuid,uuid,text,jsonb)','provider_agreement_control(uuid,uuid,text,jsonb)','protect_sandbox_attempt()','protect_gateway_authorization()','provider_audit_change()'] loop
   execute 'revoke all on function private.'||f||' from service_role';
  end loop;
 end if;
end $$;
commit;
