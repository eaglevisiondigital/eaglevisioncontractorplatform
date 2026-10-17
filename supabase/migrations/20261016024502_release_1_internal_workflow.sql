-- Internal synthetic workflow only. Default OFF; operator grants are not application-admin editable.
-- Does not enable production company_modules, delivery, provider calls or real payments.
begin;
create table private.release_environment (
 singleton boolean primary key default true check(singleton),
 mode text not null default 'disabled' check(mode in ('disabled','internal-development')),
 approval_reference text not null default '',
 check(mode='disabled' or length(trim(approval_reference))>=8)
);
insert into private.release_environment(singleton) values(true);
create table private.release_test_users (
 organization_id uuid not null references public.organizations(id), user_id uuid not null references auth.users(id),
 actor text not null check(actor in ('staff','customer')), expires_at timestamptz not null,
 primary key(organization_id,user_id)
);
create table private.release_counters(organization_id uuid primary key references public.organizations(id),next_invoice integer not null default 1 check(next_invoice>0));
do $$declare t text;begin foreach t in array array['release_environment','release_test_users','release_counters'] loop
 execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated',t);
end loop;end$$;
create table public.portal_identities(
 organization_id uuid not null,customer_id uuid not null,user_id uuid not null references auth.users(id),active boolean not null default true,
 primary key(organization_id,customer_id,user_id),foreign key(organization_id,customer_id) references public.customers(organization_id,id)
);
create index portal_user_lookup on public.portal_identities(user_id,organization_id,customer_id);
create function private.release_test(p_org uuid,p_actor text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.release_environment where singleton and mode='internal-development')
 and exists(select 1 from private.release_test_users g join public.organizations o on o.id=g.organization_id join auth.users u on u.id=g.user_id
 where g.organization_id=p_org and g.user_id=auth.uid() and g.actor=p_actor and g.expires_at>now() and o.status='active' and u.email_confirmed_at is not null)
 and exists(select 1 from public.company_modules where organization_id=p_org and module='estimates' and enabled)
$$;
create function private.release_staff(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.release_test(p_org,'staff') and private.can(p_org,'estimates') and private.has_role(p_org,array['owner','admin']::public.staff_role[])
$$;
create function private.release_customer(p_org uuid,p_customer uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.release_test(p_org,'customer') and exists(select 1 from public.portal_identities where organization_id=p_org and customer_id=p_customer and user_id=auth.uid() and active)
$$;
create function private.release_access(p_org uuid,p_customer uuid) returns boolean language sql stable security definer set search_path='' as $$select private.release_staff(p_org) or private.release_customer(p_org,p_customer)$$;

create table public.release_offers(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,customer_id uuid not null,version_id uuid not null,
 snapshot jsonb not null,expires_at timestamptz not null,created_at timestamptz not null default now(),created_by uuid not null default auth.uid(),
 unique(organization_id,id),unique(organization_id,version_id),unique(organization_id,id,customer_id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id),foreign key(organization_id,version_id) references public.estimate_versions(organization_id,id)
);
create table public.release_decisions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,customer_id uuid not null,offer_id uuid not null,
 decision text not null check(decision in ('accepted','declined','changes_requested')),note text not null check(length(note)<=2000),
 consent_version text not null check(consent_version='internal-test-v1'),actor_id uuid not null default auth.uid(),created_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,offer_id),
 foreign key(organization_id,offer_id,customer_id) references public.release_offers(organization_id,id,customer_id)
);
create table public.release_contracts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,customer_id uuid not null,offer_id uuid not null,
 legal_reference text not null check(length(trim(legal_reference)) between 8 and 1000),terms text not null check(length(trim(terms)) between 20 and 20000),
 document jsonb not null,document_hash text not null check(document_hash ~ '^[a-f0-9]{64}$'),created_at timestamptz not null default now(),created_by uuid not null default auth.uid(),
 unique(organization_id,id),unique(organization_id,offer_id),unique(organization_id,id,customer_id),
 foreign key(organization_id,offer_id,customer_id) references public.release_offers(organization_id,id,customer_id)
);
create table public.release_signatures(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,customer_id uuid not null,contract_id uuid not null,
 typed_name text not null check(length(trim(typed_name)) between 2 and 160),document_hash text not null check(document_hash ~ '^[a-f0-9]{64}$'),
 consent_version text not null check(consent_version='internal-test-v1'),actor_id uuid not null default auth.uid(),signed_at timestamptz not null default now(),created_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,contract_id),foreign key(organization_id,contract_id,customer_id) references public.release_contracts(organization_id,id,customer_id)
);
create table public.release_invoices(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,customer_id uuid not null,contract_id uuid not null,
 invoice_number text not null,currency text not null check(currency ~ '^[A-Z]{3}$'),total_minor bigint not null check(total_minor between 1 and 9000000000000),
 snapshot jsonb not null,created_at timestamptz not null default now(),created_by uuid not null default auth.uid(),
 unique(organization_id,id),unique(organization_id,contract_id),unique(organization_id,invoice_number),unique(organization_id,id,customer_id),
 foreign key(organization_id,contract_id,customer_id) references public.release_contracts(organization_id,id,customer_id)
);
create table public.release_authorizations(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,customer_id uuid not null,invoice_id uuid not null,
 amount_minor bigint not null check(amount_minor between 1 and 9000000000000),currency text not null check(currency ~ '^[A-Z]{3}$'),
 scope text not null check(scope='one-time-synthetic-payment'),expires_at timestamptz not null,created_at timestamptz not null default now(),actor_id uuid not null default auth.uid(),
 unique(organization_id,id),foreign key(organization_id,invoice_id,customer_id) references public.release_invoices(organization_id,id,customer_id)
);
create table public.release_payment_events(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,customer_id uuid not null,invoice_id uuid not null,authorization_id uuid not null,
 amount_minor bigint not null check(amount_minor between 1 and 9000000000000),currency text not null check(currency ~ '^[A-Z]{3}$'),
 kind text not null check(kind in ('synthetic_capture','synthetic_refund')),adjusts_event_id uuid,
 idempotency_key uuid not null,provider text not null default 'synthetic' check(provider='synthetic'),created_at timestamptz not null default now(),actor_id uuid not null default auth.uid(),
 unique(organization_id,id),unique(organization_id,idempotency_key),
 foreign key(organization_id,invoice_id,customer_id) references public.release_invoices(organization_id,id,customer_id),
 foreign key(organization_id,authorization_id) references public.release_authorizations(organization_id,id),foreign key(organization_id,adjusts_event_id) references public.release_payment_events(organization_id,id),
 check((kind='synthetic_capture' and adjusts_event_id is null) or (kind='synthetic_refund' and adjusts_event_id is not null))
);
create table public.release_ledger_entries(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,customer_id uuid not null,invoice_id uuid not null,event_id uuid,
 currency text not null check(currency ~ '^[A-Z]{3}$'),debit_account text not null check(debit_account in ('receivable','sandbox_clearing')),credit_account text not null check(credit_account in ('receivable','sales','tax_payable','sandbox_clearing')),
 amount_minor bigint not null check(amount_minor between 1 and 9000000000000),created_at timestamptz not null default now(),
 check(debit_account<>credit_account),unique(organization_id,id),unique(organization_id,event_id),
 foreign key(organization_id,invoice_id,customer_id) references public.release_invoices(organization_id,id,customer_id),foreign key(organization_id,event_id) references public.release_payment_events(organization_id,id)
);
create unique index release_invoice_posting_once on public.release_ledger_entries(organization_id,invoice_id,credit_account) where event_id is null;
create table public.release_messages(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,customer_id uuid not null,offer_id uuid not null,
 channel text not null default 'internal_sink' check(channel='internal_sink'),subject text not null check(length(subject)<=200),body text not null check(length(body)<=20000),
 created_at timestamptz not null default now(),created_by uuid not null default auth.uid(),unique(organization_id,id),unique(organization_id,offer_id),
 foreign key(organization_id,offer_id,customer_id) references public.release_offers(organization_id,id,customer_id)
);
create table public.company_email_profiles(
 organization_id uuid primary key references public.organizations(id),sender_name text not null check(length(trim(sender_name)) between 1 and 160),
 sender_email text not null check(sender_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 domain text not null check(domain ~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$'),
 status text not null default 'unverified' check(status in ('unverified','verified')),verification_reference text,
 check(status<>'verified' or length(trim(verification_reference))>=8)
);

create function private.release_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Release records are immutable; append an authorized adjustment';end$$;
create function private.release_email_audit() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.activity_events(organization_id,actor_id,action,entity_type,entity_id) values(new.organization_id,auth.uid(),'email.profile_changed','company_email_profiles',new.organization_id);return new;
 end$$;
do $$declare t text;begin
 foreach t in array array['portal_identities','release_offers','release_decisions','release_contracts','release_signatures','release_invoices','release_authorizations','release_payment_events','release_ledger_entries','release_messages','company_email_profiles'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);
 execute format('create index %I on public.%I(organization_id)',t||'_org',t);
 execute format('create trigger immutable_tenant before update on public.%I for each row execute function private.prevent_tenant_move()',t);
 if t in ('portal_identities','company_email_profiles') then
 execute format('create policy internal_read on public.%I for select to authenticated using(private.release_staff(organization_id))',t);
 else
 execute format('create policy internal_read on public.%I for select to authenticated using(private.release_access(organization_id,customer_id))',t);
 execute format('create trigger immutable_record before update or delete on public.%I for each row execute function private.release_immutable()',t);
 end if;
 if t='company_email_profiles' then execute format('create trigger audit_change after insert or update on public.%I for each row execute function private.release_email_audit()',t);
 else execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit_change()',t);end if;
 end loop;
end$$;
create index release_offer_customer on public.release_offers(organization_id,customer_id,created_at);
create index release_event_invoice on public.release_payment_events(organization_id,invoice_id);
create index release_auth_invoice on public.release_authorizations(organization_id,invoice_id);

create function private.release_snapshot(p_org uuid,p_version uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare v public.estimate_versions;s jsonb;
 begin
 if not private.release_staff(p_org) then raise exception 'Internal staff access denied' using errcode='42501';end if;
 select * into v from public.estimate_versions where organization_id=p_org and id=p_version and status='issued';if v.id is null then raise exception 'Issued version unavailable';end if;
 select jsonb_build_object('internal_test',true,'company',v.company_snapshot,'customer',v.customer_snapshot,'location',v.location_snapshot,'project',v.payload->'project','currency',v.payload->>'currency','expires_on',v.payload->>'expires_on','notes',v.payload->>'customer_notes','terms',v.payload->>'terms',
 'lines',coalesce((select jsonb_agg(jsonb_build_object('description',l->>'description','quantity_milli',l->'quantity_milli','unit',l->>'unit','amount_minor',c->'subtotal_minor') order by n) from jsonb_array_elements(v.payload->'lines') with ordinality x(l,n) join lateral jsonb_array_elements(v.calculation->'lines') y(c) on c->>'id'=l->>'id' where (c->>'included')::boolean),'[]'::jsonb),
 'subtotal_minor',v.calculation->'subtotal_minor','discount_minor',v.calculation->'discount_minor','tax_minor',v.calculation->'tax_minor','total_minor',v.calculation->'total_minor',
 'schedule',coalesce((select jsonb_agg(jsonb_build_object('label',x->>'label','amount_minor',x->'amount_minor','due_on',x->'due_on')) from jsonb_array_elements(v.calculation->'payment_schedule') x),'[]'::jsonb)) into s;
 return s;
 end$$;
create function private.release_lock_actor(p_org uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform 1 from private.release_environment where singleton and mode='internal-development' for share;if not found then raise exception 'Internal release disabled' using errcode='42501';end if;
 perform 1 from private.release_test_users where organization_id=p_org and user_id=auth.uid() and expires_at>now() for share;if not found then raise exception 'Internal test grant required' using errcode='42501';end if;
 perform 1 from public.organizations where id=p_org and status='active' for share;if not found then raise exception 'Organization unavailable' using errcode='42501';end if;
 perform 1 from public.company_modules where organization_id=p_org and module='estimates' and enabled for share;if not found then raise exception 'Module unavailable' using errcode='42501';end if;
 perform 1 from public.memberships where organization_id=p_org and user_id=auth.uid() for share;
 end$$;
create function private.release_command(p_org uuid,p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare offer public.release_offers;contract public.release_contracts;invoice public.release_invoices;authz public.release_authorizations;ev public.release_payment_events;prior public.release_payment_events;
 v public.estimate_versions;result uuid;doc jsonb;amount bigint;paid bigint;num integer;is_staff boolean;is_customer boolean;cust uuid;target uuid;
 begin
 perform private.release_lock_actor(p_org);is_staff:=private.release_staff(p_org);is_customer:=private.release_test(p_org,'customer');
 if not is_staff and not is_customer then raise exception 'Internal release access denied' using errcode='42501';end if;
 if p_action='link_customer' then
 if not is_staff then raise exception 'Denied' using errcode='42501';end if;perform private.est_object(p_input,array['customer_id','user_id','active']);
 cust:=private.est_id(p_input->'customer_id');target:=private.est_id(p_input->'user_id');
 if not exists(select 1 from private.release_test_users g join auth.users u on u.id=g.user_id where g.organization_id=p_org and g.user_id=target and g.actor='customer' and g.expires_at>now() and u.email_confirmed_at is not null) then raise exception 'Approved internal customer identity required';end if;
 if jsonb_typeof(p_input->'active')<>'boolean' then raise exception 'Explicit active state required';end if;
 insert into public.portal_identities values(p_org,cust,target,(p_input->>'active')::boolean) on conflict(organization_id,customer_id,user_id) do update set active=excluded.active;return 'null'::jsonb;
 elsif p_action='publish_offer' then
 if not is_staff then raise exception 'Denied' using errcode='42501';end if;perform private.est_object(p_input,array['version_id']);
 select * into v from public.estimate_versions where organization_id=p_org and id=private.est_id(p_input->'version_id') and status='issued';
 if v.id is null then raise exception 'Current issued version required';end if;
 perform 1 from public.estimates where organization_id=p_org and id=v.estimate_id and current_version_id=v.id and status<>'archived' for update;if not found then raise exception 'Current issued version required';end if;
 if exists(select 1 from public.release_decisions d join public.release_offers o on o.organization_id=d.organization_id and o.id=d.offer_id join public.estimate_versions accepted on accepted.organization_id=o.organization_id and accepted.id=o.version_id where d.organization_id=p_org and d.decision='accepted' and accepted.estimate_id=v.estimate_id) then raise exception 'Accepted scope requires an authorized change order, not duplicate full-contract billing';end if;
 if (v.payload->>'expires_on')::date<current_date then raise exception 'Estimate expired';end if;
 insert into public.release_offers(organization_id,customer_id,version_id,snapshot,expires_at) values(p_org,v.customer_id,v.id,private.release_snapshot(p_org,v.id),least(now()+interval '7 days',((v.payload->>'expires_on')::date+1)::timestamp at time zone 'UTC')) returning id into result;
 insert into public.release_messages(organization_id,customer_id,offer_id,subject,body) values(p_org,v.customer_id,result,'Internal estimate preview · '||(v.company_snapshot->>'name'),'Synthetic delivery to internal sink only. Sign in through the protected customer portal to review the exact issued estimate. No email was sent.');return to_jsonb(result);
 elsif p_action='decide_offer' then
 perform private.est_object(p_input,array['offer_id','decision','note','consent']);
 select * into offer from public.release_offers where organization_id=p_org and id=private.est_id(p_input->'offer_id') for update;
 perform 1 from public.portal_identities where organization_id=p_org and customer_id=offer.customer_id and user_id=auth.uid() and active for share;
 if offer.id is null or not private.release_customer(p_org,offer.customer_id) then raise exception 'Customer access denied' using errcode='42501';end if;
 perform 1 from public.estimate_versions issued join public.estimates e on e.organization_id=issued.organization_id and e.id=issued.estimate_id where issued.organization_id=p_org and issued.id=offer.version_id and e.current_version_id=issued.id and e.status<>'archived' for update of e;
 if not found or offer.expires_at<=now() then raise exception 'Offer expired or superseded';end if;
 if p_input->'consent' is distinct from 'true'::jsonb then raise exception 'Explicit internal test consent required';end if;
 insert into public.release_decisions(organization_id,customer_id,offer_id,decision,note,consent_version) values(p_org,offer.customer_id,offer.id,p_input->>'decision',private.est_text(p_input->'note',0,2000),'internal-test-v1') returning id into result;return to_jsonb(result);
 elsif p_action='create_contract' then
 if not is_staff then raise exception 'Denied' using errcode='42501';end if;perform private.est_object(p_input,array['offer_id','terms','legal_reference']);
 select * into offer from public.release_offers where organization_id=p_org and id=private.est_id(p_input->'offer_id') for update;
 if offer.id is null or not exists(select 1 from public.release_decisions where organization_id=p_org and offer_id=offer.id and decision='accepted') then raise exception 'Accepted estimate required';end if;
 doc:=jsonb_build_object('internal_test',true,'scope',offer.snapshot,'terms',private.est_text(p_input->'terms',20,20000),'legal_reference',private.est_text(p_input->'legal_reference',8,1000));
 insert into public.release_contracts(organization_id,customer_id,offer_id,terms,legal_reference,document,document_hash) values(p_org,offer.customer_id,offer.id,doc->>'terms',doc->>'legal_reference',doc,encode(sha256(convert_to(doc::text,'UTF8')),'hex')) returning id into result;return to_jsonb(result);
 elsif p_action='sign_contract' then
 perform private.est_object(p_input,array['contract_id','typed_name','document_hash','consent']);
 select * into contract from public.release_contracts where organization_id=p_org and id=private.est_id(p_input->'contract_id') for update;
 perform 1 from public.portal_identities where organization_id=p_org and customer_id=contract.customer_id and user_id=auth.uid() and active for share;
 if contract.id is null or not private.release_customer(p_org,contract.customer_id) then raise exception 'Customer access denied' using errcode='42501';end if;
 if p_input->'consent' is distinct from 'true'::jsonb or p_input->>'document_hash' is distinct from contract.document_hash then raise exception 'Exact document and explicit consent required';end if;
 insert into public.release_signatures(organization_id,customer_id,contract_id,typed_name,document_hash,consent_version) values(p_org,contract.customer_id,contract.id,private.est_text(p_input->'typed_name',2,160),contract.document_hash,'internal-test-v1') returning id into result;return to_jsonb(result);
 elsif p_action='create_invoice' then
 if not is_staff then raise exception 'Denied' using errcode='42501';end if;perform private.est_object(p_input,array['contract_id']);
 select * into contract from public.release_contracts where organization_id=p_org and id=private.est_id(p_input->'contract_id') for update;
 if contract.id is null or not exists(select 1 from public.release_signatures where organization_id=p_org and contract_id=contract.id) then raise exception 'Signed internal contract required';end if;
 insert into private.release_counters(organization_id,next_invoice) values(p_org,2) on conflict(organization_id) do update set next_invoice=private.release_counters.next_invoice+1 returning next_invoice-1 into num;
 doc:=contract.document->'scope';amount:=private.est_int(doc->'total_minor',1,9000000000000);
 insert into public.release_invoices(organization_id,customer_id,contract_id,invoice_number,currency,total_minor,snapshot) values(p_org,contract.customer_id,contract.id,'TEST-INV-'||lpad(num::text,6,'0'),doc->>'currency',amount,doc) returning id into result;
 if amount-(doc->>'tax_minor')::bigint>0 then insert into public.release_ledger_entries(organization_id,customer_id,invoice_id,currency,debit_account,credit_account,amount_minor) values(p_org,contract.customer_id,result,doc->>'currency','receivable','sales',amount-(doc->>'tax_minor')::bigint);end if;
 if (doc->>'tax_minor')::bigint>0 then insert into public.release_ledger_entries(organization_id,customer_id,invoice_id,currency,debit_account,credit_account,amount_minor) values(p_org,contract.customer_id,result,doc->>'currency','receivable','tax_payable',(doc->>'tax_minor')::bigint);end if;return to_jsonb(result);
 elsif p_action='authorize_payment' then
 perform private.est_object(p_input,array['invoice_id','amount_minor','consent']);
 select * into invoice from public.release_invoices where organization_id=p_org and id=private.est_id(p_input->'invoice_id') for update;
 perform 1 from public.portal_identities where organization_id=p_org and customer_id=invoice.customer_id and user_id=auth.uid() and active for share;
 if invoice.id is null or not private.release_customer(p_org,invoice.customer_id) then raise exception 'Customer access denied' using errcode='42501';end if;
 if p_input->'consent' is distinct from 'true'::jsonb then raise exception 'Explicit authorization required';end if;
 select coalesce(sum(case when kind='synthetic_capture' then amount_minor else -amount_minor end),0) into paid from public.release_payment_events where organization_id=p_org and invoice_id=invoice.id;
 amount:=private.est_int(p_input->'amount_minor',1,invoice.total_minor-paid);
 insert into public.release_authorizations(organization_id,customer_id,invoice_id,amount_minor,currency,scope,expires_at) values(p_org,invoice.customer_id,invoice.id,amount,invoice.currency,'one-time-synthetic-payment',now()+interval '30 minutes') returning id into result;return to_jsonb(result);
 elsif p_action in ('synthetic_capture','synthetic_refund') then
 if not is_staff then raise exception 'Denied' using errcode='42501';end if;perform private.est_object(p_input,array['invoice_id','authorization_id','amount_minor','idempotency_key','adjusts_event_id']);
 select * into invoice from public.release_invoices where organization_id=p_org and id=private.est_id(p_input->'invoice_id') for update;
 if invoice.id is null then raise exception 'Invoice unavailable';end if;
 amount:=private.est_int(p_input->'amount_minor',1,9000000000000);
 select * into prior from public.release_payment_events where organization_id=p_org and idempotency_key=private.est_id(p_input->'idempotency_key');
 if prior.id is not null then
 if prior.invoice_id<>invoice.id or prior.kind<>p_action or prior.amount_minor<>amount or prior.authorization_id<>private.est_id(p_input->'authorization_id') or prior.adjusts_event_id is distinct from private.est_id(p_input->'adjusts_event_id',true) then raise exception 'Idempotency conflict';end if;return to_jsonb(prior.id);end if;
 select * into authz from public.release_authorizations where organization_id=p_org and id=private.est_id(p_input->'authorization_id') and invoice_id=invoice.id;
 if authz.id is null or authz.currency<>invoice.currency then raise exception 'Matching authorization required';end if;
 if p_action='synthetic_capture' then
 select coalesce(sum(case when kind='synthetic_capture' then amount_minor else -amount_minor end),0) into paid from public.release_payment_events where organization_id=p_org and invoice_id=invoice.id;
 if authz.expires_at<=now() or amount<>authz.amount_minor or amount>invoice.total_minor-paid or exists(select 1 from public.release_payment_events where organization_id=p_org and authorization_id=authz.id and kind='synthetic_capture') then raise exception 'Authorization expired, consumed or exceeds balance';end if;
 else
 select * into ev from public.release_payment_events where organization_id=p_org and id=private.est_id(p_input->'adjusts_event_id') and invoice_id=invoice.id and authorization_id=authz.id and kind='synthetic_capture';
 select coalesce(sum(amount_minor),0) into paid from public.release_payment_events where organization_id=p_org and adjusts_event_id=ev.id and kind='synthetic_refund';
 if ev.id is null or amount>ev.amount_minor-paid then raise exception 'Refund exceeds matching capture';end if;
 end if;
 insert into public.release_payment_events(organization_id,customer_id,invoice_id,authorization_id,amount_minor,currency,kind,adjusts_event_id,idempotency_key) values(p_org,invoice.customer_id,invoice.id,authz.id,amount,invoice.currency,p_action,private.est_id(p_input->'adjusts_event_id',true),private.est_id(p_input->'idempotency_key')) returning id into result;
 insert into public.release_ledger_entries(organization_id,customer_id,invoice_id,event_id,currency,debit_account,credit_account,amount_minor) values(p_org,invoice.customer_id,invoice.id,result,invoice.currency,case when p_action='synthetic_capture' then 'sandbox_clearing' else 'receivable' end,case when p_action='synthetic_capture' then 'receivable' else 'sandbox_clearing' end,amount);return to_jsonb(result);
 elsif p_action='configure_email' then
 if not is_staff then raise exception 'Denied' using errcode='42501';end if;perform private.est_object(p_input,array['sender_name','sender_email','domain']);
 if lower(split_part(p_input->>'sender_email','@',2)) is distinct from lower(p_input->>'domain') then raise exception 'Sender must match configured domain';end if;
 insert into public.company_email_profiles(organization_id,sender_name,sender_email,domain) values(p_org,private.est_text(p_input->'sender_name',1,160),lower(private.est_text(p_input->'sender_email',3,254)),lower(private.est_text(p_input->'domain',3,253))) on conflict(organization_id) do update set sender_name=excluded.sender_name,sender_email=excluded.sender_email,domain=excluded.domain,status='unverified',verification_reference=null;
 return 'null'::jsonb;
 else raise exception 'Unsupported internal release action';end if;
 end$$;
create function public.release_command(p_org uuid,p_action text,p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.release_command(p_org,p_action,p_input)$$;
create function private.release_contexts() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'actor',g.actor) order by o.name),'[]'::jsonb) from private.release_test_users g join public.organizations o on o.id=g.organization_id where g.user_id=auth.uid() and (private.release_staff(o.id) or (private.release_test(o.id,'customer') and exists(select 1 from public.portal_identities i where i.organization_id=o.id and i.user_id=auth.uid() and i.active)))
$$;
create function public.release_contexts() returns jsonb language sql security invoker set search_path='' as $$select private.release_contexts()$$;
create function private.release_workspace(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare cust uuid;staff boolean:=private.release_staff(p_org);result jsonb:='{}';t text;rows jsonb;
 begin
 if not staff and not private.release_test(p_org,'customer') then raise exception 'Internal release access denied' using errcode='42501';end if;
 foreach t in array array['release_offers','release_decisions','release_contracts','release_signatures','release_invoices','release_authorizations','release_payment_events','release_ledger_entries','release_messages'] loop
 -- Explicit fixed relation allowlist, live customer predicate, bounded lists. No raw estimate/workforce access.
 execute format('select coalesce(jsonb_agg(x),''[]''::jsonb) from (select * from public.%I where organization_id=$1 and ($2 or private.release_customer($1,customer_id)) order by created_at desc limit 200) x',t) into rows using p_org,staff;
 result:=result||jsonb_build_object(t,rows);
 end loop;
 if staff then result:=result||jsonb_build_object('email_profile',(select to_jsonb(x) from public.company_email_profiles x where organization_id=p_org));end if;
 return result||jsonb_build_object('internal_test',true,'actor',case when staff then 'staff' else 'customer' end);
 end$$;
create function public.release_workspace(p_org uuid) returns jsonb language sql security invoker set search_path='' as $$select private.release_workspace(p_org)$$;
-- Restrict every newly created function, including default PUBLIC EXECUTE under hosted defaults.
do $$declare f record;begin for f in select p.oid::regprocedure sig,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and (p.proname like 'release_%') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 if f.proname in ('release_command','release_workspace','release_contexts','release_staff','release_customer','release_access') then execute format('grant execute on function %s to authenticated',f.sig);end if;
end loop;end$$;
commit;
