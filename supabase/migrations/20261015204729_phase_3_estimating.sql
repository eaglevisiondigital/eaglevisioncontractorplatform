-- Professional estimating; local/disposable validation only. No delivery/acceptance/payment execution.
begin;
create or replace function private.can(org uuid, capability text) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(org) and exists(select 1 from public.memberships m where m.organization_id=org and m.user_id=auth.uid()
 and (m.role in ('owner','admin') or (capability in ('crm','intake','documents','estimates') and m.staff_type in ('estimator','office_manager'))))
 and exists(select 1 from public.company_modules cm where cm.organization_id=org and cm.module=capability and cm.enabled)
$$;
create or replace function private.initialize_company() returns trigger language plpgsql security definer set search_path='' as $$
 begin
  insert into public.company_settings(organization_id) values(new.id);
  insert into public.company_modules(organization_id,module,enabled) select new.id,m,m in ('crm','intake','team','settings','documents','estimates') from unnest(array['crm','intake','team','settings','documents','estimates','contracts','invoices','payments']) m;
  return new;
 end
$$;
-- Existing module choices are preserved. Operators can enable estimates through checked configuration.
create table public.catalog_items(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 name text not null check(length(trim(name)) between 1 and 160),description text not null default '' check(length(description)<=500),
 category text not null default 'General' check(length(category) between 1 and 80),kind text not null check(kind in ('material','product','labor','service','allowance')),
 unit text not null check(unit in ('each','sq_ft','linear_ft','roofing_square','bundle','cubic_yard','hour','day','lump_sum')),
 unit_cost_minor bigint not null check(unit_cost_minor between 0 and 1000000000),unit_price_minor bigint check(unit_price_minor between 0 and 1000000000),
 markup_bps integer not null default 0 check(markup_bps between 0 and 100000),vendor text not null default '' check(length(vendor)<=200),active boolean not null default true,
 created_at timestamptz not null default now(),unique(organization_id,id)
);
create index catalog_tenant_kind on public.catalog_items(organization_id,active,kind);
create table public.estimate_tax_policies(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 name text not null check(length(trim(name)) between 1 and 120),reference text not null check(length(trim(reference)) between 1 and 200),
 jurisdiction text not null check(length(trim(jurisdiction)) between 1 and 200),contract_type text not null check(length(trim(contract_type)) between 1 and 120),
 rate_bps integer not null check(rate_bps between 0 and 10000),status text not null default 'draft' check(status in ('draft','reviewed')),
 active boolean not null default true,policy_version integer not null default 1,created_at timestamptz not null default now(),unique(organization_id,id)
);
create index tax_policies_tenant on public.estimate_tax_policies(organization_id,active);
create function private.tax_policy_revision() returns trigger language plpgsql set search_path='' as $$ begin new.policy_version:=old.policy_version+1;return new;end $$;
revoke all on function private.tax_policy_revision() from public,anon,authenticated;
create trigger policy_revision before update on public.estimate_tax_policies for each row execute function private.tax_policy_revision();
create table public.estimate_templates(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),name text not null check(length(trim(name)) between 1 and 160),
 content jsonb not null,active boolean not null default true,created_at timestamptz not null default now(),unique(organization_id,id)
);
create index templates_tenant on public.estimate_templates(organization_id,active);
create table public.estimates(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),estimate_number text not null,
 project_name text not null,customer_id uuid not null,current_version_id uuid,
 status text not null default 'draft' check(status in ('draft','issued','archived')),
 total_minor bigint not null default 0 check(total_minor between 0 and 9000000000000),currency text not null check(currency ~ '^[A-Z]{3}$'),
 creation_key uuid not null,creation_hash bytea not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,estimate_number),unique(organization_id,creation_key),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id)
);
create index estimates_tenant_status on public.estimates(organization_id,status,updated_at desc,id);
create index estimates_customer on public.estimates(organization_id,customer_id);
create table public.estimate_versions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),estimate_id uuid not null,
 version_number integer not null check(version_number>0),lock_revision integer not null default 1 check(lock_revision>0),
 status text not null default 'draft' check(status in ('draft','issued')),
 customer_id uuid not null,location_id uuid,tax_policy_id uuid,
 payload jsonb not null,calculation jsonb not null,company_snapshot jsonb not null,customer_snapshot jsonb not null,location_snapshot jsonb,tax_policy_snapshot jsonb,
 attachment_snapshots jsonb not null default '[]',supersedes_version_id uuid,
 created_by uuid not null default auth.uid(),created_at timestamptz not null default now(),issued_by uuid,issued_at timestamptz,
 unique(organization_id,id),unique(organization_id,estimate_id,id),unique(organization_id,estimate_id,version_number),
 foreign key(organization_id,estimate_id) references public.estimates(organization_id,id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id),
 foreign key(organization_id,location_id,customer_id) references public.service_locations(organization_id,id,customer_id),
 foreign key(organization_id,tax_policy_id) references public.estimate_tax_policies(organization_id,id),
 foreign key(organization_id,estimate_id,supersedes_version_id) references public.estimate_versions(organization_id,estimate_id,id),
 check((status='draft' and issued_at is null and issued_by is null) or (status='issued' and issued_at is not null and issued_by is not null))
);
create unique index one_estimate_draft on public.estimate_versions(organization_id,estimate_id) where status='draft';
create index version_customer on public.estimate_versions(organization_id,customer_id);
create index version_location on public.estimate_versions(organization_id,location_id,customer_id);
create index version_tax on public.estimate_versions(organization_id,tax_policy_id);
create index version_supersedes on public.estimate_versions(organization_id,estimate_id,supersedes_version_id);
alter table public.estimates add constraint current_estimate_version foreign key(organization_id,id,current_version_id) references public.estimate_versions(organization_id,estimate_id,id);
create table public.estimate_options(
 organization_id uuid not null,version_id uuid not null,id uuid not null,position integer not null,content jsonb not null,
 primary key(organization_id,version_id,id),foreign key(organization_id,version_id) references public.estimate_versions(organization_id,id)
);
create table public.estimate_lines(
 organization_id uuid not null,version_id uuid not null,id uuid not null,position integer not null,catalog_item_id uuid,option_id uuid,content jsonb not null,calculation jsonb not null,
 primary key(organization_id,version_id,id),foreign key(organization_id,version_id) references public.estimate_versions(organization_id,id),
 foreign key(organization_id,catalog_item_id) references public.catalog_items(organization_id,id),
 foreign key(organization_id,version_id,option_id) references public.estimate_options(organization_id,version_id,id)
);
create index estimate_line_catalog on public.estimate_lines(organization_id,catalog_item_id);
create index estimate_line_option on public.estimate_lines(organization_id,version_id,option_id);
create table public.estimate_schedule_proposals(
 organization_id uuid not null,version_id uuid not null,id uuid not null,position integer not null,content jsonb not null,
 primary key(organization_id,version_id,id),foreign key(organization_id,version_id) references public.estimate_versions(organization_id,id)
);
create table public.estimate_attachments(
 organization_id uuid not null,version_id uuid not null,document_id uuid not null,customer_visible boolean not null,
 primary key(organization_id,version_id,document_id),foreign key(organization_id,version_id) references public.estimate_versions(organization_id,id),
 foreign key(organization_id,document_id) references public.documents(organization_id,id)
);
create index estimate_attachment_document on public.estimate_attachments(organization_id,document_id);

-- Calculation helpers use exact numeric arithmetic, never float types.
create function private.est_object(v jsonb,keys text[]) returns void language plpgsql immutable set search_path='' as $$
 begin if v is null or jsonb_typeof(v)<>'object' or exists(select 1 from jsonb_object_keys(v) k where not k=any(keys)) then raise exception 'Unexpected estimate fields';end if;end
$$;
create function private.est_int(v jsonb,lo numeric,hi numeric) returns numeric language plpgsql immutable set search_path='' as $$
 begin if v is null or jsonb_typeof(v)<>'number' or v::text !~ '^[0-9]+$' or v::numeric<lo or v::numeric>hi then raise exception 'Invalid estimate numeric value';end if;return v::numeric;end
$$;
create function private.est_text(v jsonb,lo integer,hi integer) returns text language plpgsql immutable set search_path='' as $$
 declare t text:=v#>>'{}';begin if v is null or jsonb_typeof(v)<>'string' or length(trim(t))<lo or length(t)>hi then raise exception 'Invalid estimate text';end if;return t;end
$$;
create function private.est_id(v jsonb,nullable boolean default false) returns uuid language plpgsql immutable set search_path='' as $$
 begin if nullable and v='null'::jsonb then return null;end if;return private.est_text(v,36,36)::uuid;end
$$;
create function private.est_date(v jsonb,nullable boolean default false) returns date language plpgsql immutable set search_path='' as $$
 declare t text;d date;begin if nullable and v='null'::jsonb then return null;end if;t:=private.est_text(v,10,10);if t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid estimate date';end if;d:=t::date;if d::text<>t then raise exception 'Invalid estimate date';end if;return d;end
$$;
create function private.est_money(v numeric) returns bigint language plpgsql immutable set search_path='' as $$
 begin if v<-9000000000000 or v>9000000000000 then raise exception 'Estimate exceeds supported money limits';end if;return v::bigint;end
$$;
create function private.calculate_estimate(p jsonb,rate integer) returns jsonb language plpgsql immutable set search_path='' as $$
 declare l jsonb;o jsonb;s jsonb;a jsonb;pr jsonb;disc jsonb;ln jsonb:='[]';op jsonb:='[]';schedule jsonb:='[]';
 subtotal numeric:=0;cost numeric:=0;taxable numeric:=0;discount numeric;td numeric;net numeric;tax numeric;total numeric;profit numeric;amount numeric;lc numeric;price numeric;included boolean;allocated numeric:=0;share_sum integer:=0;position integer:=0;part_amount numeric;os numeric;oc numeric;
 begin
  if p is null or octet_length(p::text)>524288 then raise exception 'Estimate exceeds payload limit';end if;
  perform private.est_object(p,array['schema_version','customer_id','location_id','currency','project','expires_on','internal_notes','customer_notes','terms','tax_policy_id','discount','lines','options','payment_schedule','attachments']);
  if p->'schema_version'<>'1'::jsonb or p->'schema_version' is null then raise exception 'Unsupported estimate schema';end if;
  perform private.est_id(p->'customer_id');perform private.est_id(p->'location_id',true);perform private.est_id(p->'tax_policy_id',true);
  if private.est_text(p->'currency',3,3) !~ '^[A-Z]{3}$' or rate is null or rate not between 0 and 10000 then raise exception 'Invalid currency or tax rate';end if;
  pr:=p->'project';perform private.est_object(pr,array['name','type','description','start_on','end_on']);perform private.est_text(pr->'name',1,200);perform private.est_text(pr->'type',1,80);perform private.est_text(pr->'description',0,5000);
  if private.est_date(pr->'end_on',true)<private.est_date(pr->'start_on',true) then raise exception 'Project end must follow start';end if;
  perform private.est_date(p->'expires_on');perform private.est_text(p->'internal_notes',0,5000);perform private.est_text(p->'customer_notes',0,5000);perform private.est_text(p->'terms',0,10000);
  disc:=p->'discount';perform private.est_object(disc,array['kind','value']);if coalesce(disc->>'kind','') not in ('none','fixed','percent') then raise exception 'Invalid discount';end if;
  perform private.est_int(disc->'value',0,case when disc->>'kind'='percent' then 10000 else 9000000000000 end);
  if disc->>'kind'='none' and disc->>'value'<>'0' then raise exception 'No-discount amount must be zero';end if;
  if coalesce(jsonb_typeof(p->'lines'),'')<>'array' or jsonb_array_length(p->'lines') not between 1 and 200
   or coalesce(jsonb_typeof(p->'options'),'')<>'array' or jsonb_array_length(p->'options')>30
   or coalesce(jsonb_typeof(p->'payment_schedule'),'')<>'array' or jsonb_array_length(p->'payment_schedule') not between 1 and 20
   or coalesce(jsonb_typeof(p->'attachments'),'')<>'array' or jsonb_array_length(p->'attachments')>20 then raise exception 'Invalid estimate item limits';end if;
  for o in select * from jsonb_array_elements(p->'options') loop
   perform private.est_object(o,array['id','label','kind','group','selected','description']);perform private.est_id(o->'id');perform private.est_text(o->'label',1,120);perform private.est_text(o->'description',0,1000);
   if coalesce(o->>'kind','') not in ('exclusive','addon') or coalesce(jsonb_typeof(o->'selected'),'')<>'boolean' then raise exception 'Invalid estimate option';end if;
   if o->>'kind'='exclusive' then perform private.est_text(o->'group',1,60);elsif o->'group' is distinct from 'null'::jsonb then raise exception 'Add-ons cannot be exclusive groups';end if;
   if not exists(select 1 from jsonb_array_elements(p->'lines') x where x->>'option_id'=o->>'id') then raise exception 'Each option needs a scope item';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p->'options') x group by x->>'id' having count(*)>1)
   or exists(select 1 from jsonb_array_elements(p->'lines') x group by x->>'id' having count(*)>1)
   or exists(select 1 from jsonb_array_elements(p->'payment_schedule') x group by x->>'id' having count(*)>1)
   or exists(select 1 from jsonb_array_elements(p->'attachments') x group by x->>'document_id' having count(*)>1) then raise exception 'Duplicate estimate identifiers';end if;
  if exists(select 1 from jsonb_array_elements(p->'options') x where x->>'kind'='exclusive' group by x->>'group' having count(*) filter(where (x->>'selected')::boolean)<>1) then raise exception 'Choose exactly one proposal per exclusive group';end if;
  for l in select * from jsonb_array_elements(p->'lines') loop
   perform private.est_object(l,array['id','kind','description','quantity_milli','unit','unit_cost_minor','unit_price_minor','markup_bps','taxable','option_id','catalog_item_id','internal_note','fixed_markup_minor','import_approval_id','material_import_line_ids']);
   perform private.est_id(l->'id');perform private.est_id(l->'catalog_item_id',true);perform private.est_id(l->'option_id',true);perform private.est_text(l->'description',1,500);perform private.est_text(l->'internal_note',0,1000);perform private.est_int(l->'fixed_markup_minor',0,9000000000000);perform private.est_id(l->'import_approval_id',true);
   if coalesce(jsonb_typeof(l->'material_import_line_ids'),'')<>'array' or jsonb_array_length(l->'material_import_line_ids')>200 then raise exception 'Invalid imported scope references';end if;
   for a in select * from jsonb_array_elements(l->'material_import_line_ids') loop perform private.est_id(a);end loop;
   if ((l->>'import_approval_id' is null)<>(jsonb_array_length(l->'material_import_line_ids')=0)) or exists(select 1 from jsonb_array_elements(l->'material_import_line_ids') x group by x having count(*)>1) then raise exception 'Invalid imported scope references';end if;
   perform private.est_int(l->'quantity_milli',1,1000000000);perform private.est_int(l->'unit_cost_minor',0,1000000000);perform private.est_int(l->'markup_bps',0,100000);
   if coalesce(l->>'kind','') not in ('material','product','labor','service','allowance') or coalesce(l->>'unit','') not in ('each','sq_ft','linear_ft','roofing_square','bundle','cubic_yard','hour','day','lump_sum') or coalesce(jsonb_typeof(l->'taxable'),'')<>'boolean' then raise exception 'Invalid estimate line';end if;
   if l->>'option_id' is not null and not exists(select 1 from jsonb_array_elements(p->'options') x where x->>'id'=l->>'option_id') then raise exception 'Missing estimate option';end if;
   if l->'unit_price_minor'='null'::jsonb then price:=round((l->>'unit_cost_minor')::numeric*(10000+(l->>'markup_bps')::numeric)/10000);else price:=private.est_int(l->'unit_price_minor',0,1000000000);end if;
   amount:=round((l->>'quantity_milli')::numeric*price/1000)+(l->>'fixed_markup_minor')::numeric;lc:=round((l->>'quantity_milli')::numeric*(l->>'unit_cost_minor')::numeric/1000);
   included:=(l->>'option_id' is null or exists(select 1 from jsonb_array_elements(p->'options') x where x->>'id'=l->>'option_id' and (x->>'selected')::boolean));
   if included then subtotal:=subtotal+amount;cost:=cost+lc;if (l->>'taxable')::boolean then taxable:=taxable+amount;end if;end if;
   ln:=ln||jsonb_build_array(jsonb_build_object('id',l->>'id','included',included,'unit_price_minor',private.est_money(price),'subtotal_minor',private.est_money(amount),'cost_minor',private.est_money(lc)));
  end loop;
  discount:=case disc->>'kind' when 'percent' then round(subtotal*(disc->>'value')::numeric/10000) when 'fixed' then (disc->>'value')::numeric else 0 end;
  if discount>subtotal then raise exception 'Discount exceeds selected subtotal';end if;
  td:=case when subtotal=0 then 0 else round(discount*taxable/subtotal) end;net:=subtotal-discount;tax:=round((taxable-td)*rate/10000);total:=net+tax;profit:=net-cost;
  for o in select * from jsonb_array_elements(p->'options') loop
   select coalesce(sum((c->>'subtotal_minor')::numeric),0),coalesce(sum((c->>'cost_minor')::numeric),0) into os,oc from jsonb_array_elements(ln) c join jsonb_array_elements(p->'lines') raw on raw->>'id'=c->>'id' where raw->>'option_id'=o->>'id';
   op:=op||jsonb_build_array(jsonb_build_object('id',o->>'id','selected',(o->>'selected')::boolean,'scope_subtotal_minor',private.est_money(os),'scope_cost_minor',private.est_money(oc)));
  end loop;
  for s in select * from jsonb_array_elements(p->'payment_schedule') loop
   perform private.est_object(s,array['id','label','kind','share_bps','due_on']);perform private.est_id(s->'id');perform private.est_text(s->'label',1,120);
   share_sum:=share_sum+private.est_int(s->'share_bps',1,10000)::integer;if coalesce(s->>'kind','') not in ('deposit','milestone','dated') then raise exception 'Invalid proposed schedule';end if;
   perform private.est_date(s->'due_on',s->>'kind'<>'dated');position:=position+1;
   part_amount:=case when position=jsonb_array_length(p->'payment_schedule') then total-allocated else floor(total*(s->>'share_bps')::numeric/10000) end;
   allocated:=allocated+part_amount;schedule:=schedule||jsonb_build_array(s||jsonb_build_object('amount_minor',private.est_money(part_amount)));
  end loop;
  if share_sum<>10000 then raise exception 'Proposed payment shares must equal 100 percent';end if;
  for a in select * from jsonb_array_elements(p->'attachments') loop
   perform private.est_object(a,array['document_id','customer_visible']);perform private.est_id(a->'document_id');if coalesce(jsonb_typeof(a->'customer_visible'),'')<>'boolean' then raise exception 'Invalid attachment visibility';end if;
  end loop;
  return jsonb_build_object('engine_version',1,'currency',p->>'currency','lines',ln,'subtotal_minor',private.est_money(subtotal),'discount_minor',private.est_money(discount),'net_minor',private.est_money(net),'taxable_subtotal_minor',private.est_money(taxable),'taxable_discount_minor',private.est_money(td),'taxable_net_minor',private.est_money(taxable-td),'tax_rate_bps',rate,'tax_minor',private.est_money(tax),'total_minor',private.est_money(total),'cost_minor',private.est_money(cost),'gross_profit_minor',private.est_money(profit),'profit_margin_bps',case when net=0 then 0 else private.est_money(round(profit*10000/net)) end,'options',op,'payment_schedule',schedule);
 end
$$;
-- Pure helpers and the calculator are implementation details, not public RPCs.
do $$ declare f record;begin for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (p.proname like 'est\_%' escape '\' or p.proname='calculate_estimate') loop execute format('revoke all on function %s from public,anon,authenticated',f.sig);end loop;end $$;

create function private.estimate_context(org uuid,p jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare settings public.company_settings;c public.customers;loc public.service_locations;policy public.estimate_tax_policies;co public.organizations;doc public.documents;a jsonb;l jsonb;docs jsonb:='[]';calc jsonb;
 begin
  if not private.can(org,'estimates') then raise exception 'Estimating access denied' using errcode='42501';end if;
  select * into settings from public.company_settings where organization_id=org;
  if p->>'currency' is distinct from settings.currency then raise exception 'Estimate currency must match company configuration';end if;
  if p->>'tax_policy_id' is not null then select * into policy from public.estimate_tax_policies where organization_id=org and id=(p->>'tax_policy_id')::uuid and active;if policy.id is null then raise exception 'Tax policy unavailable';end if;end if;
  calc:=private.calculate_estimate(p,coalesce(policy.rate_bps,0));
  select * into c from public.customers where organization_id=org and id=(p->>'customer_id')::uuid;if c.id is null then raise exception 'Customer unavailable';end if;
  if p->>'location_id' is not null then select * into loc from public.service_locations where organization_id=org and id=(p->>'location_id')::uuid and customer_id=c.id;if loc.id is null then raise exception 'Job location unavailable';end if;end if;
  for l in select * from jsonb_array_elements(p->'lines') loop
   if l->>'catalog_item_id' is not null and not exists(select 1 from public.catalog_items where organization_id=org and id=(l->>'catalog_item_id')::uuid) then raise exception 'Catalog reference unavailable';end if;
  end loop;
  for a in select * from jsonb_array_elements(p->'attachments') loop
   if not private.can(org,'documents') then raise exception 'Document access denied' using errcode='42501';end if;
   select * into doc from public.documents where organization_id=org and id=(a->>'document_id')::uuid and scan_status='clean';
   if doc.id is null or ((a->>'customer_visible')::boolean and doc.visibility<>'customer') then raise exception 'Clean document or visibility unavailable';end if;
   docs:=docs||jsonb_build_array(jsonb_build_object('document_id',doc.id,'customer_visible',(a->>'customer_visible')::boolean,'display_name',doc.display_name,'content_type',doc.content_type));
  end loop;
  select * into co from public.organizations where id=org;
  return jsonb_build_object('calculation',calc,'company_snapshot',jsonb_build_object('name',co.name,'primary_color',co.primary_color,'accent_color',co.accent_color,'logo_document_id',co.logo_document_id,'business_address',settings.business_address,'contact_email',settings.contact_email,'contact_phone',settings.contact_phone,'website',settings.website),'customer_snapshot',jsonb_build_object('id',c.id,'display_name',c.display_name,'email',c.email,'phone',c.phone),'location_snapshot',case when loc.id is null then null else jsonb_build_object('id',loc.id,'address_line1',loc.address_line1,'city',loc.city,'region',loc.region,'postal_code',loc.postal_code,'country_code',loc.country_code) end,'tax_policy_snapshot',case when policy.id is null then null else to_jsonb(policy)-'created_at' end,'attachment_snapshots',docs);
 end
$$;
create function private.estimate_bundle(org uuid,estimate uuid,version uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare e public.estimates;v public.estimate_versions;
 begin
  if not private.can(org,'estimates') then raise exception 'Estimating access denied' using errcode='42501';end if;
  select * into e from public.estimates where organization_id=org and id=estimate;if e.id is null then raise exception 'Estimate unavailable';end if;
  select * into v from public.estimate_versions where organization_id=org and estimate_id=estimate and id=coalesce(version,e.current_version_id);
  if v.id is null then raise exception 'Version unavailable';end if;
  return jsonb_build_object('estimate',to_jsonb(e)-'creation_key'-'creation_hash','version',to_jsonb(v));
 end
$$;
create function private.replace_estimate_children(org uuid,version uuid,p jsonb,calc jsonb) returns void language plpgsql security definer set search_path='' as $$
 begin
  if not private.can(org,'estimates') then raise exception 'Estimating access denied' using errcode='42501';end if;
  delete from public.estimate_lines where organization_id=org and version_id=version;
  delete from public.estimate_options where organization_id=org and version_id=version;
  delete from public.estimate_schedule_proposals where organization_id=org and version_id=version;
  delete from public.estimate_attachments where organization_id=org and version_id=version;
  insert into public.estimate_options select org,version,(v->>'id')::uuid,ordinality::integer,v from jsonb_array_elements(p->'options') with ordinality x(v,ordinality);
  insert into public.estimate_lines select org,version,(v->>'id')::uuid,ordinality::integer,(v->>'catalog_item_id')::uuid,(v->>'option_id')::uuid,v,(select c from jsonb_array_elements(calc->'lines') c where c->>'id'=v->>'id') from jsonb_array_elements(p->'lines') with ordinality x(v,ordinality);
  insert into public.estimate_schedule_proposals select org,version,(v->>'id')::uuid,ordinality::integer,v from jsonb_array_elements(calc->'payment_schedule') with ordinality x(v,ordinality);
  insert into public.estimate_attachments select org,version,(v->>'document_id')::uuid,(v->>'customer_visible')::boolean from jsonb_array_elements(p->'attachments') v;
 end
$$;
create function private.create_estimate(p_org uuid,p_payload jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare settings public.company_settings;context jsonb;e public.estimates;v uuid;fingerprint bytea:=sha256(convert_to(p_payload::text,'UTF8'));
 begin
  if not private.can(p_org,'estimates') or p_key is null then raise exception 'Estimating access denied' using errcode='42501';end if;
  select * into settings from public.company_settings where organization_id=p_org for update;
  if not private.can(p_org,'estimates') then raise exception 'Estimating access denied' using errcode='42501';end if;
  select * into e from public.estimates where organization_id=p_org and creation_key=p_key;
  if e.id is not null then if e.creation_hash<>fingerprint then raise exception 'Idempotency key conflict';end if;return private.estimate_bundle(p_org,e.id);end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'lines') x where x->>'import_approval_id' is not null) then raise exception 'Create draft before importing materials';end if;
  context:=private.estimate_context(p_org,p_payload);
  insert into public.estimates(organization_id,estimate_number,project_name,customer_id,currency,creation_key,creation_hash)
   values(p_org,settings.estimate_prefix||'-'||lpad(settings.estimate_next_number::text,greatest(5,length(settings.estimate_next_number::text)),'0'),p_payload->'project'->>'name',(p_payload->>'customer_id')::uuid,p_payload->>'currency',p_key,fingerprint) returning * into e;
  update public.company_settings set estimate_next_number=estimate_next_number+1 where organization_id=p_org;
  insert into public.estimate_versions(organization_id,estimate_id,version_number,customer_id,location_id,tax_policy_id,payload,calculation,company_snapshot,customer_snapshot,location_snapshot,tax_policy_snapshot,attachment_snapshots)
   values(p_org,e.id,1,(p_payload->>'customer_id')::uuid,(p_payload->>'location_id')::uuid,(p_payload->>'tax_policy_id')::uuid,p_payload,context->'calculation',context->'company_snapshot',context->'customer_snapshot',context->'location_snapshot',context->'tax_policy_snapshot',context->'attachment_snapshots') returning id into v;
  perform private.replace_estimate_children(p_org,v,p_payload,context->'calculation');
  update public.estimates set current_version_id=v,total_minor=(context->'calculation'->>'total_minor')::bigint where id=e.id;
  return private.estimate_bundle(p_org,e.id);
 end
$$;
create function public.create_estimate(p_org uuid,p_payload jsonb,p_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.create_estimate(p_org,p_payload,p_key) $$;
create function private.save_estimate(p_org uuid,p_estimate uuid,p_version uuid,p_lock integer,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare e public.estimates;v public.estimate_versions;context jsonb;
 begin
  if not private.can(p_org,'estimates') then raise exception 'Estimating access denied' using errcode='42501';end if;
  select * into e from public.estimates where organization_id=p_org and id=p_estimate for update;
  select * into v from public.estimate_versions where organization_id=p_org and estimate_id=p_estimate and id=p_version for update;
  if not private.can(p_org,'estimates') then raise exception 'Estimating access denied' using errcode='42501';end if;
  if e.id is null or e.status='archived' or e.current_version_id<>p_version or v.id is null or v.status<>'draft' or v.lock_revision is distinct from p_lock then raise exception 'Draft changed or immutable; reload the estimate';end if;
  perform private.check_material_approvals(p_org,p_estimate,p_payload);
  context:=private.estimate_context(p_org,p_payload);
  update public.estimate_versions set customer_id=(p_payload->>'customer_id')::uuid,location_id=(p_payload->>'location_id')::uuid,tax_policy_id=(p_payload->>'tax_policy_id')::uuid,payload=p_payload,calculation=context->'calculation',company_snapshot=context->'company_snapshot',customer_snapshot=context->'customer_snapshot',location_snapshot=context->'location_snapshot',tax_policy_snapshot=context->'tax_policy_snapshot',attachment_snapshots=context->'attachment_snapshots',lock_revision=lock_revision+1 where id=v.id;
  perform private.replace_estimate_children(p_org,v.id,p_payload,context->'calculation');
  update public.estimates set project_name=p_payload->'project'->>'name',customer_id=(p_payload->>'customer_id')::uuid,currency=p_payload->>'currency',total_minor=(context->'calculation'->>'total_minor')::bigint,updated_at=clock_timestamp() where id=e.id;
  return private.estimate_bundle(p_org,e.id);
 end
$$;
create function public.save_estimate(p_org uuid,p_estimate uuid,p_version uuid,p_lock integer,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.save_estimate(p_org,p_estimate,p_version,p_lock,p_payload) $$;
create function private.issue_estimate(p_org uuid,p_estimate uuid,p_version uuid,p_lock integer) returns jsonb language plpgsql security definer set search_path='' as $$
 declare e public.estimates;v public.estimate_versions;context jsonb;
 begin
  if not private.can(p_org,'estimates') or not private.has_role(p_org,array['owner','admin']::public.staff_role[]) then raise exception 'Issuing requires a company administrator and MFA' using errcode='42501';end if;
  select * into e from public.estimates where organization_id=p_org and id=p_estimate for update;
  select * into v from public.estimate_versions where organization_id=p_org and estimate_id=p_estimate and id=p_version for update;
  if e.id is null or e.status='archived' or e.current_version_id<>p_version or v.id is null or v.status<>'draft' or v.lock_revision is distinct from p_lock then raise exception 'Draft changed or immutable; reload the estimate';end if;
  if (v.payload->>'expires_on')::date<current_date then raise exception 'Estimate has expired';end if;
  perform private.check_material_approvals(p_org,p_estimate,v.payload,true);
  context:=private.estimate_context(p_org,v.payload);
  if v.tax_policy_id is null or v.tax_policy_snapshot->>'status'<>'reviewed' then raise exception 'Choose a reviewed internal tax policy before issue';end if;
  if context->'tax_policy_snapshot' is distinct from v.tax_policy_snapshot or context->'calculation' is distinct from v.calculation or context->'attachment_snapshots' is distinct from v.attachment_snapshots then raise exception 'Policy or source changed; save and review the draft again';end if;
  update public.estimate_versions set status='issued',issued_at=clock_timestamp(),issued_by=auth.uid() where id=v.id;
  update public.estimates set status='issued',updated_at=clock_timestamp() where id=e.id;
  return private.estimate_bundle(p_org,e.id);
 end
$$;
create function public.issue_estimate(p_org uuid,p_estimate uuid,p_version uuid,p_lock integer) returns jsonb language sql security invoker set search_path='' as $$ select private.issue_estimate(p_org,p_estimate,p_version,p_lock) $$;
create function private.revise_estimate(p_org uuid,p_estimate uuid,p_source uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare e public.estimates;source public.estimate_versions;v uuid;context jsonb;next_revision integer;
 begin
  if not private.can(p_org,'estimates') then raise exception 'Estimating access denied' using errcode='42501';end if;
  select * into e from public.estimates where organization_id=p_org and id=p_estimate for update;
  select * into source from public.estimate_versions where organization_id=p_org and estimate_id=p_estimate and id=p_source;
  if e.id is null or e.status='archived' or source.id is null or source.status<>'issued' then raise exception 'Issued source unavailable';end if;
  if exists(select 1 from public.estimate_versions where organization_id=p_org and estimate_id=p_estimate and status='draft') then raise exception 'A draft revision already exists';end if;
  select max(version_number)+1 into next_revision from public.estimate_versions where organization_id=p_org and estimate_id=p_estimate;
  context:=private.estimate_context(p_org,source.payload);
  insert into public.estimate_versions(organization_id,estimate_id,version_number,customer_id,location_id,tax_policy_id,payload,calculation,company_snapshot,customer_snapshot,location_snapshot,tax_policy_snapshot,attachment_snapshots,supersedes_version_id)
   values(p_org,e.id,next_revision,source.customer_id,source.location_id,source.tax_policy_id,source.payload,context->'calculation',context->'company_snapshot',context->'customer_snapshot',context->'location_snapshot',context->'tax_policy_snapshot',context->'attachment_snapshots',source.id) returning id into v;
  perform private.replace_estimate_children(p_org,v,source.payload,context->'calculation');
  update public.estimates set current_version_id=v,status='draft',total_minor=(context->'calculation'->>'total_minor')::bigint,updated_at=clock_timestamp() where id=e.id;
  return private.estimate_bundle(p_org,e.id);
 end
$$;
create function public.revise_estimate(p_org uuid,p_estimate uuid,p_source uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.revise_estimate(p_org,p_estimate,p_source) $$;
create function private.duplicate_estimate(p_org uuid,p_source uuid,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare source public.estimate_versions;content jsonb;days integer;
 begin
  if not private.can(p_org,'estimates') then raise exception 'Estimating access denied' using errcode='42501';end if;
  select * into source from public.estimate_versions where organization_id=p_org and id=p_source;if source.id is null then raise exception 'Source unavailable';end if;
  select expiration_days into days from public.company_settings where organization_id=p_org;
  content:=jsonb_set(source.payload,'{project,name}',to_jsonb(left(source.payload->'project'->>'name',190)||' (copy)'));
  content:=jsonb_set(content,'{expires_on}',to_jsonb((current_date+days)::text));
  -- Imported approvals are estimate-bound: duplicates require explicit import review for the new estimate.
  if exists(select 1 from jsonb_array_elements(content->'lines') l where l->>'import_approval_id' is not null) then raise exception 'Duplicate imported scope through a fresh material review';end if;
  return private.create_estimate(p_org,content,p_key);
 end
$$;
create function public.duplicate_estimate(p_org uuid,p_source uuid,p_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.duplicate_estimate(p_org,p_source,p_key) $$;
create function private.archive_estimate(p_org uuid,p_estimate uuid,p_archived boolean) returns void language plpgsql security definer set search_path='' as $$
 declare e public.estimates;
 begin
  if not private.can(p_org,'estimates') or not private.has_role(p_org,array['owner','admin']::public.staff_role[]) then raise exception 'Administrator access required' using errcode='42501';end if;
  select * into e from public.estimates where organization_id=p_org and id=p_estimate for update;if e.id is null then raise exception 'Estimate unavailable';end if;
  update public.estimates set status=case when p_archived then 'archived' else (select status from public.estimate_versions where organization_id=p_org and id=e.current_version_id) end,updated_at=clock_timestamp() where id=e.id;
 end
$$;
create function public.archive_estimate(p_org uuid,p_estimate uuid,p_archived boolean) returns void language sql security invoker set search_path='' as $$ select private.archive_estimate(p_org,p_estimate,p_archived) $$;
create function private.estimate_defaults(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 begin
  if not private.can(p_org,'estimates') then raise exception 'Estimating access denied' using errcode='42501';end if;
  return (select jsonb_build_object('currency',currency,'default_terms',default_terms,'expiration_days',expiration_days,'material_markup_bps',material_markup_bps,'labor_rate_minor',labor_rate_minor,'estimate_prefix',estimate_prefix,'estimate_next_number',estimate_next_number) from public.company_settings where organization_id=p_org);
 end
$$;
create function public.estimate_defaults(p_org uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.estimate_defaults(p_org) $$;

-- Issued versions and all of their children are immutable even to ordinary owner SQL.
create function private.protect_issued_estimate() returns trigger language plpgsql set search_path='' as $$
 begin if old.status='issued' then raise exception 'Issued estimate versions are immutable';end if;if TG_OP='DELETE' then return old;end if;return new;end
$$;
revoke all on function private.protect_issued_estimate() from public,anon,authenticated;
create trigger immutable_issued before update or delete on public.estimate_versions for each row execute function private.protect_issued_estimate();
create function private.protect_issued_child() returns trigger language plpgsql security definer set search_path='' as $$
 declare org uuid;v uuid;
 begin
  if TG_OP='DELETE' then org:=old.organization_id;v:=old.version_id;else org:=new.organization_id;v:=new.version_id;end if;
  if exists(select 1 from public.estimate_versions where organization_id=org and id=v and status='issued') then raise exception 'Issued estimate scope is immutable';end if;
  if TG_OP='UPDATE' and (new.organization_id<>old.organization_id or new.version_id<>old.version_id) then raise exception 'Version ownership is immutable';end if;
  if TG_OP='DELETE' then return old;end if;return new;
 end
$$;
revoke all on function private.protect_issued_child() from public,anon,authenticated;
-- All snapshots/children are read-only to clients; writes pass checked, audited RPCs.
do $$ declare t text;begin
 foreach t in array array['catalog_items','estimate_tax_policies','estimate_templates','estimates','estimate_versions','estimate_options','estimate_lines','estimate_schedule_proposals','estimate_attachments'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy estimating_read on public.%I for select to authenticated using((select private.can(organization_id,''estimates'')))',t);
  execute format('create trigger immutable_tenant before update on public.%I for each row execute function private.prevent_tenant_move()',t);
  if t in ('estimates','estimate_versions','catalog_items','estimate_tax_policies','estimate_templates') then execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit_change()',t);end if;
  if t in ('estimate_lines','estimate_options','estimate_schedule_proposals','estimate_attachments') then execute format('create trigger issued_scope before insert or update or delete on public.%I for each row execute function private.protect_issued_child()',t);end if;
 end loop;
end $$;
grant insert(organization_id,name,description,category,kind,unit,unit_cost_minor,unit_price_minor,markup_bps,vendor,active),update(name,description,category,kind,unit,unit_cost_minor,unit_price_minor,markup_bps,vendor,active) on public.catalog_items to authenticated;
create policy catalog_insert on public.catalog_items for insert to authenticated with check(private.can(organization_id,'estimates'));
create policy catalog_update on public.catalog_items for update to authenticated using(private.can(organization_id,'estimates')) with check(private.can(organization_id,'estimates'));
grant insert(organization_id,name,reference,jurisdiction,contract_type,rate_bps,status,active),update(name,reference,jurisdiction,contract_type,rate_bps,status,active) on public.estimate_tax_policies to authenticated;
create policy tax_insert on public.estimate_tax_policies for insert to authenticated with check(private.can(organization_id,'estimates') and private.has_role(organization_id,array['owner','admin']::public.staff_role[]));
create policy tax_update on public.estimate_tax_policies for update to authenticated using(private.can(organization_id,'estimates') and private.has_role(organization_id,array['owner','admin']::public.staff_role[])) with check(private.can(organization_id,'estimates') and private.has_role(organization_id,array['owner','admin']::public.staff_role[]));
create function private.save_estimate_template(p_org uuid,p_name text,p_payload jsonb,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare result uuid;content jsonb;
 begin
  if not private.can(p_org,'estimates') then raise exception 'Estimating access denied' using errcode='42501';end if;
  perform private.estimate_context(p_org,p_payload);
  if exists(select 1 from jsonb_array_elements(p_payload->'lines') l where l->>'import_approval_id' is not null) then raise exception 'Source-bound imported costs cannot become generic templates';end if;
  content:=p_payload||jsonb_build_object('customer_id',null,'location_id',null,'tax_policy_id',null,'expires_on',null,'attachments','[]'::jsonb);
  if p_id is null then insert into public.estimate_templates(organization_id,name,content) values(p_org,p_name,content) returning id into result;
  else update public.estimate_templates set name=p_name,content=content where organization_id=p_org and id=p_id returning id into result;if result is null then raise exception 'Template unavailable';end if;end if;
  return result;
 end
$$;
create function public.save_estimate_template(p_org uuid,p_name text,p_payload jsonb,p_id uuid default null) returns uuid language sql security invoker set search_path='' as $$ select private.save_estimate_template(p_org,p_name,p_payload,p_id) $$;
-- Internal functions have no client grants except the checked RPC implementations.
do $$ declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('estimate_context','estimate_bundle','replace_estimate_children') loop execute format('revoke all on function %s from public,anon,authenticated',f.sig);end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.proname in ('create_estimate','save_estimate','issue_estimate','revise_estimate','duplicate_estimate','archive_estimate','estimate_defaults','save_estimate_template') loop
  execute format('revoke all on function %s from public,anon',f.sig);execute format('grant execute on function %s to authenticated',f.sig);
 end loop;
end $$;
commit;
