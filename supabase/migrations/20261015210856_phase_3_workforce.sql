begin;
create table public.workforce_policies(
 organization_id uuid primary key references public.organizations(id),currency text not null default 'USD' check(currency ~ '^[A-Z]{3}$'),timezone text not null default 'America/Chicago',week_start integer not null default 7 check(week_start between 1 and 7),
 overtime_after_seconds integer not null default 144000 check(overtime_after_seconds between 1 and 604800),overtime_multiplier_bps integer not null default 15000 check(overtime_multiplier_bps between 10000 and 30000),
 review_reference text not null default '' check(length(review_reference)<=1000),overhead_centers text[] not null default array['Estimating','Purchasing','Scheduling','Bookkeeping','Administration']
);
create table public.worker_profiles(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,user_id uuid not null,display_name text not null check(length(trim(display_name)) between 1 and 160),
 worker_type text not null check(worker_type in ('w2_hourly','salaried','contractor_1099','owner','other')),cost_source text not null check(cost_source in ('time','invoice','imputed')),active boolean not null default true,
 unique(organization_id,id),unique(organization_id,user_id),foreign key(organization_id,user_id) references public.memberships(organization_id,user_id),
 check(cost_source<>'invoice' or worker_type='contractor_1099')
);
alter table public.job_expenses add constraint expense_worker foreign key(organization_id,labor_worker_id) references public.worker_profiles(organization_id,id);
create index expense_worker on public.job_expenses(organization_id,labor_worker_id);
create table public.worker_supervisors(
 organization_id uuid not null,worker_id uuid not null,user_id uuid not null,primary key(organization_id,worker_id,user_id),
 foreign key(organization_id,worker_id) references public.worker_profiles(organization_id,id),foreign key(organization_id,user_id) references public.memberships(organization_id,user_id)
);
create index supervisor_member on public.worker_supervisors(organization_id,user_id);
create table public.labor_rates(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,worker_id uuid not null,effective_from timestamptz not null,
 cash_hour_minor bigint not null check(cash_hour_minor between 0 and 1000000000),salary_week_minor bigint not null default 0 check(salary_week_minor between 0 and 1000000000),
 burden_bps integer not null check(burden_bps between 0 and 100000),estimated_loaded_hour_minor bigint not null check(estimated_loaded_hour_minor between 0 and 1000000000),
 billing_hour_minor bigint not null check(billing_hour_minor between 0 and 1000000000),imputed_hour_minor bigint not null check(imputed_hour_minor between 0 and 1000000000),
 overtime_eligible boolean not null,classification_review_reference text not null check(length(trim(classification_review_reference)) between 1 and 1000),
 unique(organization_id,worker_id,effective_from),unique(organization_id,id),foreign key(organization_id,worker_id) references public.worker_profiles(organization_id,id)
);
create table public.time_entries(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,worker_id uuid not null,job_id uuid,overhead_center text,
 task text not null check(length(trim(task)) between 1 and 200),kind text not null check(kind in ('work','break_paid','break')),started_at timestamptz not null,ended_at timestamptz,
 submitted boolean not null default false,billable boolean not null default false,corrects_id uuid,created_by uuid not null default auth.uid(),created_at timestamptz not null default now(),
 unique(organization_id,id),foreign key(organization_id,worker_id) references public.worker_profiles(organization_id,id),foreign key(organization_id,job_id) references public.jobs(organization_id,id),
 foreign key(organization_id,corrects_id) references public.time_entries(organization_id,id),check((job_id is null)<>(overhead_center is null)),
 check(ended_at is null or (ended_at>started_at and ended_at<=started_at+interval '18 hours')),check(not submitted or ended_at is not null),check(date_trunc('second',started_at)=started_at and (ended_at is null or date_trunc('second',ended_at)=ended_at))
);
create unique index worker_open_clock on public.time_entries(organization_id,worker_id) where ended_at is null;
create index time_worker_dates on public.time_entries(organization_id,worker_id,started_at,ended_at);
create index time_job on public.time_entries(organization_id,job_id);
create index time_correction on public.time_entries(organization_id,corrects_id);
create table public.time_reviews(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,entry_id uuid not null,decision text not null check(decision in ('approved','rejected')),
 reason text not null check(length(trim(reason)) between 1 and 1000),reviewed_by uuid not null default auth.uid(),created_at timestamptz not null default now(),
 unique(organization_id,entry_id),foreign key(organization_id,entry_id) references public.time_entries(organization_id,id)
);
create table public.payroll_periods(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),starts_at timestamptz not null,ends_at timestamptz not null,
 status text not null default 'open' check(status in ('open','locked')),deductions jsonb not null default '{}',snapshot jsonb,locked_by uuid,locked_at timestamptz,
 unique(organization_id,id),unique(organization_id,starts_at,ends_at),check(ends_at>starts_at and ends_at<=starts_at+interval '43 days'),
 check((status='open' and snapshot is null and locked_at is null) or (status='locked' and snapshot is not null and locked_at is not null))
);
create index payroll_dates on public.payroll_periods(organization_id,starts_at,ends_at);
create function private.payroll_admin(org uuid) returns boolean language sql stable security definer set search_path='' as $$select private.has_role(org,array['owner','admin']::public.staff_role[]) and exists(select 1 from public.company_modules where organization_id=org and module='estimates' and enabled)$$;
create function private.worker_access(org uuid,worker uuid,review boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(org) and exists(select 1 from public.company_modules where organization_id=org and module='estimates' and enabled) and
 (private.payroll_admin(org) or exists(select 1 from public.worker_profiles w where w.organization_id=org and w.id=worker and w.active and ((not review and w.user_id=auth.uid()) or exists(select 1 from public.worker_supervisors s where s.organization_id=org and s.worker_id=w.id and s.user_id=auth.uid()))))
$$;
revoke all on function private.payroll_admin(uuid),private.worker_access(uuid,uuid,boolean) from public,anon;grant execute on function private.payroll_admin(uuid),private.worker_access(uuid,uuid,boolean) to authenticated;
do $$declare t text;begin foreach t in array array['workforce_policies','worker_profiles','worker_supervisors','labor_rates','time_entries','time_reviews','payroll_periods'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);
 if t='worker_profiles' then execute 'create policy workforce_read on public.worker_profiles for select to authenticated using(private.worker_access(organization_id,id))';
 elsif t='worker_supervisors' then execute 'create policy workforce_read on public.worker_supervisors for select to authenticated using(private.payroll_admin(organization_id) or (user_id=auth.uid() and private.has_role(organization_id)))';
 elsif t='time_entries' then execute 'create policy workforce_read on public.time_entries for select to authenticated using(private.worker_access(organization_id,worker_id))';
 elsif t='time_reviews' then execute 'create policy workforce_read on public.time_reviews for select to authenticated using(exists(select 1 from public.time_entries e where e.organization_id=time_reviews.organization_id and e.id=time_reviews.entry_id and private.worker_access(e.organization_id,e.worker_id)))';
 elsif t='workforce_policies' then execute 'create policy workforce_read on public.workforce_policies for select to authenticated using(private.has_role(organization_id))';
 else execute format('create policy workforce_read on public.%I for select to authenticated using(private.payroll_admin(organization_id))',t);end if;
 execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit_change()',t);
 execute format('create trigger tenant_immutable before update on public.%I for each row execute function private.prevent_tenant_move()',t);
 if t in ('labor_rates','time_reviews') then execute format('create trigger immutable_record before update or delete on public.%I for each row execute function private.reject_audit_mutation()',t);end if;
 end loop;end$$;
create function private.protect_time() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' or old.submitted or exists(select 1 from public.time_reviews where organization_id=old.organization_id and entry_id=old.id) then raise exception 'Submitted time is immutable; submit a correction';end if;return new;end$$;
create trigger protect_time before update or delete on public.time_entries for each row execute function private.protect_time();
create function private.protect_payroll() returns trigger language plpgsql set search_path='' as $$begin if old.status='locked' or tg_op='DELETE' then raise exception 'Locked payroll is immutable';end if;return new;end$$;
create trigger protect_payroll before update or delete on public.payroll_periods for each row execute function private.protect_payroll();
revoke all on function private.protect_time(),private.protect_payroll() from public,anon,authenticated;
create function private.configure_workforce(p_org uuid,p_policy jsonb) returns void language plpgsql security definer set search_path='' as $$begin
 if not private.payroll_admin(p_org) then raise exception 'Payroll configuration denied' using errcode='42501';end if;
 perform private.est_object(p_policy,array['timezone','week_start','overtime_after_seconds','overtime_multiplier_bps','review_reference','overhead_centers']);
 if not exists(select 1 from pg_timezone_names where name=p_policy->>'timezone') or jsonb_typeof(p_policy->'overhead_centers')<>'array' or jsonb_array_length(p_policy->'overhead_centers') not between 1 and 30 then raise exception 'Invalid timezone or overhead centers';end if;
 -- Policy cannot change after time exists. A future versioned policy migration must preserve employer week boundaries.
 if exists(select 1 from public.time_entries where organization_id=p_org) then raise exception 'Versioned policy change requires reviewed migration';end if;
 insert into public.workforce_policies(organization_id,currency,timezone,week_start,overtime_after_seconds,overtime_multiplier_bps,review_reference,overhead_centers)
 values(p_org,(select currency from public.company_settings where organization_id=p_org),p_policy->>'timezone',private.est_int(p_policy->'week_start',1,7),private.est_int(p_policy->'overtime_after_seconds',1,604800),private.est_int(p_policy->'overtime_multiplier_bps',10000,30000),private.est_text(p_policy->'review_reference',1,1000),array(select jsonb_array_elements_text(p_policy->'overhead_centers')))
 on conflict(organization_id) do update set currency=excluded.currency,timezone=excluded.timezone,week_start=excluded.week_start,overtime_after_seconds=excluded.overtime_after_seconds,overtime_multiplier_bps=excluded.overtime_multiplier_bps,review_reference=excluded.review_reference,overhead_centers=excluded.overhead_centers;end$$;
create function public.configure_workforce(p_org uuid,p_policy jsonb) returns void language sql security invoker set search_path='' as $$select private.configure_workforce(p_org,p_policy)$$;
create function private.save_worker(p_org uuid,p_worker jsonb,p_rate jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare worker_uuid uuid;begin
 if not private.payroll_admin(p_org) then raise exception 'Worker configuration denied' using errcode='42501';end if;
 perform 1 from public.workforce_policies where organization_id=p_org for update;
 perform private.est_object(p_worker,array['id','user_id','display_name','worker_type','cost_source','active']);perform private.est_object(p_rate,array['effective_from','cash_hour_minor','salary_week_minor','burden_bps','estimated_loaded_hour_minor','billing_hour_minor','imputed_hour_minor','overtime_eligible','classification_review_reference']);
 if p_rate->>'effective_from' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Explicit rate timezone required';end if;
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=(p_worker->>'user_id')::uuid and active) then raise exception 'Active company membership required';end if;
 if p_worker->>'id' is null then insert into public.worker_profiles(organization_id,user_id,display_name,worker_type,cost_source,active) values(p_org,(p_worker->>'user_id')::uuid,private.est_text(p_worker->'display_name',1,160),p_worker->>'worker_type',p_worker->>'cost_source',(p_worker->>'active')::boolean) returning worker_profiles.id into worker_uuid;
 else worker_uuid:=(p_worker->>'id')::uuid;perform 1 from public.worker_profiles where organization_id=p_org and worker_profiles.id=worker_uuid for update;if not found then raise exception 'Worker unavailable';end if;
 if exists(select 1 from public.time_entries where organization_id=p_org and worker_id=worker_uuid) and exists(select 1 from public.worker_profiles where organization_id=p_org and worker_profiles.id=worker_uuid and (worker_type<>p_worker->>'worker_type' or cost_source<>p_worker->>'cost_source' or user_id<>(p_worker->>'user_id')::uuid)) then raise exception 'Classification or cost-source change needs reviewed migration';end if;
 update public.worker_profiles set display_name=private.est_text(p_worker->'display_name',1,160),active=(p_worker->>'active')::boolean,worker_type=p_worker->>'worker_type',cost_source=p_worker->>'cost_source' where organization_id=p_org and worker_profiles.id=worker_uuid;end if;
 if exists(select 1 from public.payroll_periods where organization_id=p_org and status='locked' and ends_at>(p_rate->>'effective_from')::timestamptz) then raise exception 'Cannot backdate rate into locked payroll';end if;
 insert into public.labor_rates(organization_id,worker_id,effective_from,cash_hour_minor,salary_week_minor,burden_bps,estimated_loaded_hour_minor,billing_hour_minor,imputed_hour_minor,overtime_eligible,classification_review_reference)
 values(p_org,worker_uuid,(p_rate->>'effective_from')::timestamptz,private.est_int(p_rate->'cash_hour_minor',0,1000000000),private.est_int(p_rate->'salary_week_minor',0,1000000000),private.est_int(p_rate->'burden_bps',0,100000),private.est_int(p_rate->'estimated_loaded_hour_minor',0,1000000000),private.est_int(p_rate->'billing_hour_minor',0,1000000000),private.est_int(p_rate->'imputed_hour_minor',0,1000000000),(p_rate->>'overtime_eligible')::boolean,private.est_text(p_rate->'classification_review_reference',1,1000));return worker_uuid;end$$;
create function public.save_worker(p_org uuid,p_worker jsonb,p_rate jsonb) returns uuid language sql security invoker set search_path='' as $$select private.save_worker(p_org,p_worker,p_rate)$$;
create function private.assign_supervisor(p_org uuid,p_worker uuid,p_user uuid,p_active boolean) returns void language plpgsql security definer set search_path='' as $$begin
 if not private.payroll_admin(p_org) then raise exception 'Supervisor assignment denied' using errcode='42501';end if;
 if p_active then insert into public.worker_supervisors(organization_id,worker_id,user_id) values(p_org,p_worker,p_user) on conflict do nothing;else delete from public.worker_supervisors where organization_id=p_org and worker_id=p_worker and user_id=p_user;end if;end$$;
create function public.assign_supervisor(p_org uuid,p_worker uuid,p_user uuid,p_active boolean) returns void language sql security invoker set search_path='' as $$select private.assign_supervisor(p_org,p_worker,p_user,p_active)$$;
-- All clock/manual operations take the policy lock first, serializing them with payroll locking.
create function private.record_time(p_org uuid,p_worker uuid,p_entry jsonb) returns uuid language plpgsql security definer set search_path='' as $$
 declare policy public.workforce_policies;w public.worker_profiles;start_at timestamptz;end_at timestamptz;job uuid;overhead text;correction uuid;id uuid;begin
 if not private.worker_access(p_org,p_worker) then raise exception 'Time entry denied' using errcode='42501';end if;
 select * into policy from public.workforce_policies where organization_id=p_org for update;if policy.organization_id is null then raise exception 'Employer policy required';end if;
 select * into w from public.worker_profiles where organization_id=p_org and worker_profiles.id=p_worker and active for update;if w.id is null or not private.worker_access(p_org,p_worker) then raise exception 'Active worker access required';end if;
 perform private.est_object(p_entry,array['job_id','overhead_center','task','kind','started_at','ended_at','billable','corrects_id']);
 if p_entry->>'started_at' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or p_entry->>'ended_at' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Explicit timezone offset required';end if;
 start_at:=(p_entry->>'started_at')::timestamptz;end_at:=(p_entry->>'ended_at')::timestamptz;job:=(p_entry->>'job_id')::uuid;overhead:=p_entry->>'overhead_center';correction:=(p_entry->>'corrects_id')::uuid;
 if end_at is null and abs(extract(epoch from clock_timestamp()-start_at))>5 then raise exception 'Open clocks must start now; enter closed manual time';end if;
 if start_at>clock_timestamp() or end_at>clock_timestamp() then raise exception 'Future time not allowed';end if;
 if job is not null and not (exists(select 1 from public.jobs where organization_id=p_org and jobs.id=job and baseline->>'currency'=policy.currency) and (private.payroll_admin(p_org) or exists(select 1 from public.job_assignments where organization_id=p_org and job_id=job and user_id=w.user_id and active))) then raise exception 'Assigned job required';end if;
 if overhead is not null and not overhead=any(policy.overhead_centers) then raise exception 'Approved overhead center required';end if;
 if exists(select 1 from public.payroll_periods where organization_id=p_org and status='locked' and starts_at<coalesce(end_at,'infinity') and ends_at>start_at) then raise exception 'Payroll period locked';end if;
 if correction is not null and not exists(select 1 from public.time_entries e join public.time_reviews r on r.organization_id=e.organization_id and r.entry_id=e.id and r.decision='approved' where e.organization_id=p_org and e.worker_id=p_worker and e.id=correction and e.ended_at is not null and not exists(select 1 from public.time_entries x join public.time_reviews xr on xr.organization_id=x.organization_id and xr.entry_id=x.id and xr.decision='approved' where x.organization_id=p_org and x.corrects_id=e.id)) then raise exception 'Approved correction source required';end if;
 if correction is not null and exists(select 1 from public.time_entries e join public.payroll_periods p on p.organization_id=e.organization_id and p.status='locked' and p.starts_at<e.ended_at and p.ends_at>e.started_at where e.organization_id=p_org and e.id=correction) then raise exception 'Locked time requires a later payroll adjustment';end if;
 if exists(select 1 from public.time_entries e where e.organization_id=p_org and e.worker_id=p_worker and e.id is distinct from correction and e.started_at<coalesce(end_at,'infinity') and coalesce(e.ended_at,'infinity')>start_at and not exists(select 1 from public.time_reviews r where r.organization_id=p_org and r.entry_id=e.id and r.decision='rejected') and not exists(select 1 from public.time_entries x join public.time_reviews r on r.organization_id=x.organization_id and r.entry_id=x.id and r.decision='approved' where x.organization_id=p_org and x.corrects_id=e.id)) then raise exception 'Overlapping time entry';end if;
 insert into public.time_entries(organization_id,worker_id,job_id,overhead_center,task,kind,started_at,ended_at,billable,corrects_id) values(p_org,p_worker,job,overhead,private.est_text(p_entry->'task',1,200),p_entry->>'kind',start_at,end_at,(p_entry->>'billable')::boolean,correction) returning time_entries.id into id;return id;end$$;
create function public.record_time(p_org uuid,p_worker uuid,p_entry jsonb) returns uuid language sql security invoker set search_path='' as $$select private.record_time(p_org,p_worker,p_entry)$$;
create function private.time_clock(p_org uuid,p_worker uuid,p_action text,p_target jsonb) returns uuid language plpgsql security definer set search_path='' as $$
 declare current public.time_entries;ts timestamptz;entry jsonb;result uuid;begin
 if not private.worker_access(p_org,p_worker) then raise exception 'Clock denied' using errcode='42501';end if;
 perform 1 from public.workforce_policies where organization_id=p_org for update;perform 1 from public.worker_profiles where organization_id=p_org and id=p_worker for update;
 if not private.worker_access(p_org,p_worker) then raise exception 'Clock access revoked';end if;
 ts:=date_trunc('second',clock_timestamp());select * into current from public.time_entries where organization_id=p_org and worker_id=p_worker and ended_at is null for update;
 if p_action not in ('start','stop','break','break_paid','resume','switch') or (p_action='start' and current.id is not null) or (p_action<>'start' and current.id is null) then raise exception 'Clock changed; reload';end if;
 if current.id is not null then update public.time_entries set ended_at=ts where organization_id=p_org and id=current.id;end if;
 if p_action='stop' then return current.id;end if;
 entry:=case when p_action in ('break','break_paid','resume') then jsonb_build_object('job_id',current.job_id,'overhead_center',current.overhead_center,'task',current.task,'billable',current.billable) else p_target end;
 entry:=entry||jsonb_build_object('kind',case when p_action='break' then 'break' when p_action='break_paid' then 'break_paid' else 'work' end,'started_at',to_char(ts at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'ended_at',null,'corrects_id',null);
 if p_action in ('break','break_paid') then entry:=entry||jsonb_build_object('billable',false);end if;
 result:=private.record_time(p_org,p_worker,entry);return result;end$$;
create function public.time_clock(p_org uuid,p_worker uuid,p_action text,p_target jsonb) returns uuid language sql security invoker set search_path='' as $$select private.time_clock(p_org,p_worker,p_action,p_target)$$;
create function private.submit_time(p_org uuid,p_entry uuid) returns void language plpgsql security definer set search_path='' as $$declare e public.time_entries;begin
 select * into e from public.time_entries where organization_id=p_org and id=p_entry;if e.id is null or not private.worker_access(p_org,e.worker_id) then raise exception 'Timesheet submission denied' using errcode='42501';end if;
 perform 1 from public.workforce_policies where organization_id=p_org for update;perform 1 from public.worker_profiles where organization_id=p_org and id=e.worker_id for update;
 if not private.worker_access(p_org,e.worker_id) then raise exception 'Time access revoked';end if;
 if e.ended_at is null or exists(select 1 from public.payroll_periods where organization_id=p_org and status='locked' and starts_at<e.ended_at and ends_at>e.started_at) then raise exception 'Close clock or payroll locked';end if;
 update public.time_entries set submitted=true where organization_id=p_org and id=e.id and not submitted;if not found then raise exception 'Time already submitted';end if;end$$;
create function public.submit_time(p_org uuid,p_entry uuid) returns void language sql security invoker set search_path='' as $$select private.submit_time(p_org,p_entry)$$;
create function private.review_time(p_org uuid,p_entry uuid,p_decision text,p_reason text) returns void language plpgsql security definer set search_path='' as $$declare e public.time_entries;begin
 perform 1 from public.workforce_policies where organization_id=p_org for update;
 select * into e from public.time_entries where organization_id=p_org and id=p_entry and submitted;
 if e.id is null or not private.worker_access(p_org,e.worker_id,true) then raise exception 'Supervisor review denied' using errcode='42501';end if;
 if exists(select 1 from public.payroll_periods where organization_id=p_org and status='locked' and starts_at<e.ended_at and ends_at>e.started_at) then raise exception 'Payroll locked';end if;
 -- Self-approval is reserved for MFA-authenticated payroll administrators (e.g. owner time).
 if not private.payroll_admin(p_org) and exists(select 1 from public.worker_profiles where organization_id=p_org and id=e.worker_id and user_id=auth.uid()) then raise exception 'Independent supervisor review required';end if;
 if e.corrects_id is not null and p_decision='approved' and exists(select 1 from public.time_entries x join public.time_reviews r on r.organization_id=x.organization_id and r.entry_id=x.id and r.decision='approved' where x.organization_id=p_org and x.corrects_id=e.corrects_id) then raise exception 'Correction source already superseded';end if;
 insert into public.time_reviews(organization_id,entry_id,decision,reason) values(p_org,p_entry,p_decision,private.est_text(to_jsonb(p_reason),1,1000));end$$;
create function public.review_time(p_org uuid,p_entry uuid,p_decision text,p_reason text) returns void language sql security invoker set search_path='' as $$select private.review_time(p_org,p_entry,p_decision,p_reason)$$;
create function private.resolve_clock(p_org uuid,p_worker uuid,p_end text,p_reason text) returns void language plpgsql security definer set search_path='' as $$declare e public.time_entries;stop timestamptz;begin
 if not private.payroll_admin(p_org) then raise exception 'Clock correction denied' using errcode='42501';end if;
 perform 1 from public.workforce_policies where organization_id=p_org for update;perform 1 from public.worker_profiles where organization_id=p_org and id=p_worker for update;
 if not private.payroll_admin(p_org) then raise exception 'Clock correction access revoked';end if;
 select * into e from public.time_entries where organization_id=p_org and worker_id=p_worker and ended_at is null for update;
 if e.id is null or p_end !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Open clock and explicit end timezone required';end if;
 stop:=p_end::timestamptz;if stop>clock_timestamp() or exists(select 1 from public.payroll_periods where organization_id=p_org and status='locked' and starts_at<stop and ends_at>e.started_at) then raise exception 'Future end or locked payroll';end if;
 update public.time_entries set ended_at=stop,submitted=true where organization_id=p_org and id=e.id;
 insert into public.time_reviews(organization_id,entry_id,decision,reason) values(p_org,e.id,'approved','Clock correction: '||private.est_text(to_jsonb(p_reason),1,950));end$$;
create function public.resolve_clock(p_org uuid,p_worker uuid,p_end text,p_reason text) returns void language sql security invoker set search_path='' as $$select private.resolve_clock(p_org,p_worker,p_end,p_reason)$$;
create function private.payroll_rows(org uuid,start_at timestamptz,end_at timestamptz) returns jsonb language sql stable security definer set search_path='' as $$
 with policy as (select * from public.workforce_policies where organization_id=org),
 approved as (select e.*,w.worker_type,w.cost_source from public.time_entries e join public.worker_profiles w on w.organization_id=e.organization_id and w.id=e.worker_id
 join public.time_reviews r on r.organization_id=e.organization_id and r.entry_id=e.id and r.decision='approved'
 where e.organization_id=org and e.started_at>=start_at and e.ended_at<=end_at and e.kind<>'break' and not exists(select 1 from public.time_entries x join public.time_reviews xr on xr.organization_id=x.organization_id and xr.entry_id=x.id and xr.decision='approved' where x.organization_id=org and x.corrects_id=e.id)),
 pieces as (select e.*,p.overtime_after_seconds,p.overtime_multiplier_bps,g.week at time zone p.timezone week_start,
 greatest(e.started_at,g.week at time zone p.timezone) piece_start,extract(epoch from least(e.ended_at,(g.week+interval '7 days') at time zone p.timezone)-greatest(e.started_at,g.week at time zone p.timezone))::bigint seconds
 from approved e cross join policy p cross join lateral generate_series(
 date_trunc('week',(e.started_at at time zone p.timezone)-make_interval(days=>p.week_start-1))+make_interval(days=>p.week_start-1),
 e.ended_at at time zone p.timezone,interval '7 days') g(week)),
 rated as (select p.*,r.id rate_id,r.cash_hour_minor,r.salary_week_minor,r.burden_bps,r.estimated_loaded_hour_minor,r.billing_hour_minor,r.imputed_hour_minor,r.overtime_eligible,
 coalesce(sum(p.seconds) over(partition by p.worker_id,p.week_start order by p.piece_start,p.id rows between unbounded preceding and 1 preceding),0) elapsed,
 sum(p.seconds) over(partition by p.worker_id,p.week_start) week_seconds, row_number() over(partition by p.worker_id,p.week_start order by p.piece_start,p.id) piece_number,count(*) over(partition by p.worker_id,p.week_start) piece_count
 from pieces p join lateral(select * from public.labor_rates r where r.organization_id=org and r.worker_id=p.worker_id and r.effective_from<=p.piece_start order by effective_from desc limit 1) r on true where p.seconds>0),
 hours as (select r.*,case when overtime_eligible then greatest(0,least(seconds,overtime_after_seconds-elapsed)) else seconds end regular_seconds from rated r),
 cash as (select h.*,seconds-regular_seconds overtime_seconds,case when cost_source<>'time' then 0 when worker_type='salaried' then case when piece_number=piece_count then salary_week_minor-(select coalesce(sum(floor(h2.salary_week_minor::numeric*h2.seconds/h2.week_seconds)),0) from hours h2 where h2.worker_id=h.worker_id and h2.week_start=h.week_start and h2.piece_number<h.piece_number) else floor(salary_week_minor::numeric*seconds/week_seconds) end+case when overtime_eligible then round(salary_week_minor::numeric*(seconds-regular_seconds)*(overtime_multiplier_bps-10000)/(overtime_after_seconds::numeric*10000)) else 0 end
 else round(cash_hour_minor::numeric*(regular_seconds*10000+(seconds-regular_seconds)*overtime_multiplier_bps)/36000000) end cash_minor from hours h)
 select coalesce(jsonb_agg(jsonb_build_object('entry_id',id,'worker_id',worker_id,'job_id',job_id,'week',to_char(week_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'regular_seconds',regular_seconds,'overtime_seconds',overtime_seconds,'cash_minor',cash_minor,'burden_minor',round(cash_minor*burden_bps/10000),'imputed_minor',round(imputed_hour_minor::numeric*seconds/3600),'billing_minor',round(billing_hour_minor::numeric*seconds/3600),'estimated_loaded_minor',round(estimated_loaded_hour_minor::numeric*seconds/3600),'billable_seconds',case when billable then seconds else 0 end,'rate_id',rate_id) order by piece_start,id),'[]') from cash
$$;
create function private.prepare_payroll(p_org uuid,p_start timestamptz,p_end timestamptz,p_deductions jsonb,p_lock boolean) returns jsonb language plpgsql security definer set search_path='' as $$
 declare policy public.workforce_policies;rows jsonb;snapshot jsonb;id uuid;k text;v jsonb;begin
 if not private.payroll_admin(p_org) then raise exception 'Payroll preparation denied' using errcode='42501';end if;
 select * into policy from public.workforce_policies where organization_id=p_org for update;
 if not private.payroll_admin(p_org) then raise exception 'Payroll access revoked';end if;
 if policy.organization_id is null or length(trim(policy.review_reference))=0 then raise exception 'Reviewed employer policy required';end if;
 if p_start is null or p_end is null or p_end<=p_start or p_end>p_start+interval '43 days' or extract(isodow from p_start at time zone policy.timezone)<>policy.week_start or extract(isodow from p_end at time zone policy.timezone)<>policy.week_start or (p_start at time zone policy.timezone)::time<>'00:00:00' or (p_end at time zone policy.timezone)::time<>'00:00:00' then raise exception 'Pay period must cover complete employer workweeks';end if;
 if exists(select 1 from public.payroll_periods where organization_id=p_org and status='locked' and starts_at<p_end and ends_at>p_start) then raise exception 'Payroll period locked';end if;
 if p_end>clock_timestamp() then raise exception 'Pay period has not ended';end if;
 if exists(select 1 from public.time_entries e where e.organization_id=p_org and e.started_at<p_end and coalesce(e.ended_at,'infinity')>p_start and (e.started_at<p_start or e.ended_at is null or e.ended_at>p_end or not e.submitted or not exists(select 1 from public.time_reviews r where r.organization_id=p_org and r.entry_id=e.id))) then raise exception 'Close, submit and review every segment; split entries at pay-period boundaries';end if;
 if exists(select 1 from public.time_entries e join public.time_reviews r on r.organization_id=e.organization_id and r.entry_id=e.id and r.decision='approved' where e.organization_id=p_org and e.started_at>=p_start and e.ended_at<=p_end and e.kind<>'break' and (not exists(select 1 from public.labor_rates lr where lr.organization_id=p_org and lr.worker_id=e.worker_id and lr.effective_from<=e.started_at) or exists(select 1 from public.labor_rates lr where lr.organization_id=p_org and lr.worker_id=e.worker_id and lr.effective_from>e.started_at and lr.effective_from<e.ended_at))) then raise exception 'Reviewed effective rates required; split time at rate changes';end if;
 if jsonb_typeof(p_deductions)<>'object' then raise exception 'Invalid manual deductions';end if;
 for k,v in select * from jsonb_each(p_deductions) loop perform private.est_int(v,0,9000000000000);if not exists(select 1 from public.worker_profiles where organization_id=p_org and worker_profiles.id=k::uuid) then raise exception 'Deduction worker unavailable';end if;end loop;
 if exists(select 1 from public.time_entries e join public.worker_profiles w on w.organization_id=e.organization_id and w.id=e.worker_id and w.worker_type='salaried' join public.time_reviews tr on tr.organization_id=e.organization_id and tr.entry_id=e.id and tr.decision='approved' join lateral(select salary_week_minor from public.labor_rates lr where lr.organization_id=e.organization_id and lr.worker_id=e.worker_id and lr.effective_from<=e.started_at order by effective_from desc limit 1) lr on true where e.organization_id=p_org and e.started_at>=p_start and e.ended_at<=p_end group by e.worker_id,date_trunc('week',(e.started_at at time zone policy.timezone)-make_interval(days=>policy.week_start-1)) having min(lr.salary_week_minor)<>max(lr.salary_week_minor)) then raise exception 'Salary rate changes within a week require reviewed allocation';end if;
 rows:=private.payroll_rows(p_org,p_start,p_end);
 rows:=rows||coalesce((select jsonb_agg(jsonb_build_object('entry_id',a.entry_id,'worker_id',e.worker_id,'job_id',a.job_id,'week',a.effective_at,'regular_seconds',0,'overtime_seconds',0,'cash_minor',a.cash_minor,'burden_minor',a.burden_minor,'imputed_minor',a.imputed_minor,'billing_minor',0,'estimated_loaded_minor',0,'billable_seconds',0,'rate_id',null,'adjustment_id',a.id)) from public.payroll_adjustments a join public.time_entries e on e.organization_id=a.organization_id and e.id=a.entry_id where a.organization_id=p_org and a.effective_at>=p_start and a.effective_at<p_end),'[]');
 snapshot:=jsonb_build_object('schema_version',1,'rows',rows,'policy',to_jsonb(policy),'deductions',p_deductions,'prepared_at',clock_timestamp(),'execution_enabled',false);
 if p_lock then
 insert into public.payroll_periods(organization_id,starts_at,ends_at,status,deductions,snapshot,locked_by,locked_at) values(p_org,p_start,p_end,'locked',p_deductions,snapshot,auth.uid(),clock_timestamp()) returning payroll_periods.id into id;
 update public.jobs set lock_revision=lock_revision+1 where organization_id=p_org and jobs.id in (select (x->>'job_id')::uuid from jsonb_array_elements(rows) x where x->>'job_id' is not null);
 snapshot:=snapshot||jsonb_build_object('period_id',id);end if;return snapshot;end$$;
create function public.prepare_payroll(p_org uuid,p_start timestamptz,p_end timestamptz,p_deductions jsonb,p_lock boolean) returns jsonb language sql security invoker set search_path='' as $$select private.prepare_payroll(p_org,p_start,p_end,p_deductions,p_lock)$$;
-- Restricted financial corrections to a locked period: new append-only adjustments in a later period.
create table public.payroll_adjustments(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,source_period_id uuid not null,entry_id uuid not null,job_id uuid,
 effective_at timestamptz not null,cash_minor bigint not null check(abs(cash_minor)<=9000000000000),burden_minor bigint not null check(abs(burden_minor)<=9000000000000),imputed_minor bigint not null check(abs(imputed_minor)<=9000000000000),
 reason text not null check(length(trim(reason)) between 1 and 1000),created_by uuid not null default auth.uid(),created_at timestamptz not null default now(),
 foreign key(organization_id,source_period_id) references public.payroll_periods(organization_id,id),foreign key(organization_id,entry_id) references public.time_entries(organization_id,id),foreign key(organization_id,job_id) references public.jobs(organization_id,id)
);
create index adjustment_period on public.payroll_adjustments(organization_id,source_period_id);
create index adjustment_entry on public.payroll_adjustments(organization_id,entry_id);
create index adjustment_job on public.payroll_adjustments(organization_id,job_id);
alter table public.payroll_adjustments enable row level security;revoke all on public.payroll_adjustments from public,anon,authenticated;grant select on public.payroll_adjustments to authenticated;
create policy payroll_adjustment_read on public.payroll_adjustments for select to authenticated using(private.payroll_admin(organization_id));
create trigger immutable_adjustment before update or delete on public.payroll_adjustments for each row execute function private.reject_audit_mutation();
create trigger audit_change after insert or update or delete on public.payroll_adjustments for each row execute function private.audit_change();
create function private.adjust_payroll(p_org uuid,p_adjustment jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare e public.time_entries;p public.payroll_periods;id uuid;effective timestamptz;begin
 if not private.payroll_admin(p_org) then raise exception 'Payroll correction denied' using errcode='42501';end if;
 perform 1 from public.workforce_policies where organization_id=p_org for update;
 perform private.est_object(p_adjustment,array['source_period_id','entry_id','effective_at','cash_minor','burden_minor','imputed_minor','reason']);
 select * into p from public.payroll_periods where organization_id=p_org and payroll_periods.id=(p_adjustment->>'source_period_id')::uuid and status='locked';
 select * into e from public.time_entries where organization_id=p_org and time_entries.id=(p_adjustment->>'entry_id')::uuid and started_at>=p.starts_at and ended_at<=p.ends_at;
 effective:=(p_adjustment->>'effective_at')::timestamptz;if p.id is null or e.id is null or effective<p.ends_at or not exists(select 1 from jsonb_array_elements(p.snapshot->'rows') x where x->>'entry_id'=e.id::text and x->>'adjustment_id' is null) or exists(select 1 from public.payroll_periods where organization_id=p_org and status='locked' and starts_at<=effective and ends_at>effective) then raise exception 'Correction requires source locked period and later unlocked effective date';end if;
 if exists(select 1 from unnest(array['cash_minor','burden_minor','imputed_minor']) k where (select coalesce(sum((x->>k)::numeric),0) from jsonb_array_elements(p.snapshot->'rows') x where x->>'entry_id'=e.id::text)+(select coalesce(sum(case k when 'cash_minor' then a.cash_minor when 'burden_minor' then a.burden_minor else a.imputed_minor end),0) from public.payroll_adjustments a where a.organization_id=p_org and a.entry_id=e.id)+(p_adjustment->>k)::numeric<0) then raise exception 'Adjustment exceeds original labor cost';end if;
 insert into public.payroll_adjustments(organization_id,source_period_id,entry_id,job_id,effective_at,cash_minor,burden_minor,imputed_minor,reason) values(p_org,p.id,e.id,e.job_id,effective,(p_adjustment->>'cash_minor')::bigint,(p_adjustment->>'burden_minor')::bigint,(p_adjustment->>'imputed_minor')::bigint,private.est_text(p_adjustment->'reason',1,1000)) returning payroll_adjustments.id into id;return id;end$$;
create function public.adjust_payroll(p_org uuid,p_adjustment jsonb) returns uuid language sql security invoker set search_path='' as $$select private.adjust_payroll(p_org,p_adjustment)$$;
create function private.job_labor_summary(p_org uuid,p_job uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare rows jsonb;begin
 if not private.can(p_org,'estimates') or not exists(select 1 from public.jobs where organization_id=p_org and id=p_job) then raise exception 'Job labor reporting denied' using errcode='42501';end if;
 select coalesce(jsonb_agg(x),'[]') into rows from public.payroll_periods p cross join lateral jsonb_array_elements(p.snapshot->'rows') x where p.organization_id=p_org and p.status='locked' and x->>'job_id'=p_job::text;
 return jsonb_build_object('seconds',(select coalesce(sum((x->>'regular_seconds')::bigint+(x->>'overtime_seconds')::bigint),0) from jsonb_array_elements(rows) x),
 'billable_seconds',(select coalesce(sum((x->>'billable_seconds')::bigint),0) from jsonb_array_elements(rows) x),
 'cash_minor',(select coalesce(sum((x->>'cash_minor')::bigint),0) from jsonb_array_elements(rows) x),
 'burden_minor',(select coalesce(sum((x->>'burden_minor')::bigint),0) from jsonb_array_elements(rows) x),
 'imputed_minor',(select coalesce(sum((x->>'imputed_minor')::bigint),0) from jsonb_array_elements(rows) x),
 'billing_minor',(select coalesce(sum((x->>'billing_minor')::bigint),0) from jsonb_array_elements(rows) x));end$$;
create function public.job_labor_summary(p_org uuid,p_job uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.job_labor_summary(p_org,p_job)$$;
-- Assigned field workers receive job labels only, never original costs or margins.
create function private.time_period_labels(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.has_role(p_org) then raise exception 'Time access denied' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'starts_at',starts_at,'ends_at',ends_at,'status',status,'snapshot',null)) from public.payroll_periods where organization_id=p_org),'[]');end$$;
create function public.time_period_labels(p_org uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.time_period_labels(p_org)$$;
create function private.assigned_job_labels(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.has_role(p_org) then raise exception 'Company access denied' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'name',j.name)) from public.jobs j where j.organization_id=p_org and private.job_member(p_org,j.id)),'[]');end$$;
create function public.assigned_job_labels(p_org uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.assigned_job_labels(p_org)$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='payroll_rows' loop execute format('revoke all on function %s from public,anon,authenticated',f.sig);end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in ('resolve_clock','time_period_labels','configure_workforce','save_worker','assign_supervisor','record_time','time_clock','submit_time','review_time','prepare_payroll','adjust_payroll','job_labor_summary','assigned_job_labels') loop execute format('revoke all on function %s from public,anon',f.sig);execute format('grant execute on function %s to authenticated',f.sig);end loop;
end$$;
commit;
