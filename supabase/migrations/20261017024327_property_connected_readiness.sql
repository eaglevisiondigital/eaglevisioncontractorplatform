-- P0 proposal only: no feature rows, identities, grants to users or activation.
begin;
create table private.property_report_access (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 customer_id uuid not null, location_id uuid not null, user_id uuid not null,
 expires_at timestamptz not null, revoked_at timestamptz,
 approval_reference text not null check(length(trim(approval_reference)) between 8 and 200),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,location_id,customer_id) references public.service_locations(organization_id,id,customer_id),
 foreign key(organization_id,customer_id,user_id) references public.portal_identities(organization_id,customer_id,user_id),
 check(created_at<=clock_timestamp()),
 check(isfinite(expires_at) and expires_at>created_at and expires_at<=created_at+interval '1 hour'),
 check(revoked_at is null or revoked_at>=created_at)
);
alter table private.property_report_access enable row level security;
revoke all on private.property_report_access from public,anon,authenticated,service_role;
create unique index property_report_current on private.property_report_access(organization_id,customer_id,location_id,user_id) where revoked_at is null;
create index property_report_actor on private.property_report_access(user_id,organization_id,customer_id,location_id);
create index property_report_location on private.property_report_access(organization_id,location_id,customer_id);
create index property_report_mapping on private.property_report_access(organization_id,customer_id,user_id);
create trigger immutable_tenant before update on private.property_report_access for each row execute function private.prevent_tenant_move();
create trigger property_report_access_audit after insert or update or delete on private.property_report_access for each row execute function private.audit_change();
create function private.property_access_immutable() returns trigger language plpgsql security definer set search_path='' as $$begin
 if TG_OP='DELETE' then raise exception 'Preserve report access audit evidence';end if;
 if (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') or old.revoked_at is not null or new.revoked_at is null then raise exception 'Report access can only be revoked once';end if;
 return new;
end$$;
revoke all on function private.property_access_immutable() from public,anon,authenticated,service_role;
create trigger report_access_revoke_only before update or delete on private.property_report_access for each row execute function private.property_access_immutable();

create function private.property_connected_session() returns void language plpgsql security definer set search_path='' as $$declare sid uuid; session_expiry timestamptz;begin
 perform private.property_session_guard();
 begin sid:=(auth.jwt()->>'session_id')::uuid;exception when invalid_text_representation then raise exception 'Genuine session required' using errcode='42501';end;
 if sid is null then raise exception 'Genuine session required' using errcode='42501';end if;
 select not_after into session_expiry from auth.sessions where id=sid and user_id=auth.uid() for share;
 if not found or (session_expiry is not null and session_expiry<=clock_timestamp()) then raise exception 'Session revoked or expired' using errcode='42501';end if;
 perform private.property_session_guard();
end$$;
revoke all on function private.property_connected_session() from public,anon,authenticated,service_role;
-- Narrow invoker wrappers need this checked, data-free helper; it never trusts a caller-supplied UID.
grant execute on function private.property_connected_session() to authenticated;

create function public.property_command(p_org uuid,p_action text,p_id uuid,p_lock integer,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$declare result jsonb;begin
 perform private.property_connected_session();
 result:=private.property_command(p_org,p_action,p_id,p_lock,p);
 perform private.property_connected_session();return result;
end$$;
create function public.property_workspace(p_org uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$declare result jsonb;begin
 perform private.property_connected_session();result:=private.property_workspace(p_org);
 perform private.property_connected_session();return result;
end$$;

create function private.property_published_reports(p_org uuid,p_customer uuid,p_location uuid,p_before uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare access_id uuid; expiry timestamptz; cursor_time timestamptz; result jsonb;begin
 perform private.property_connected_session();
 perform 1 from public.organizations where id=p_org and status='active' for share;if not found then raise exception 'Report access denied' using errcode='42501';end if;
 perform 1 from private.property_features where organization_id=p_org and enabled for share;if not found then raise exception 'Property reports disabled' using errcode='42501';end if;
 perform 1 from public.company_modules where organization_id=p_org and module='estimates' and enabled for share;if not found then raise exception 'Property reports disabled' using errcode='42501';end if;
 perform 1 from auth.users where id=auth.uid() and email_confirmed_at is not null for share;if not found then raise exception 'Verified identity required' using errcode='42501';end if;
 perform 1 from public.memberships where organization_id=p_org and user_id=auth.uid() and active for share;
 if exists(select 1 from public.memberships where organization_id=p_org and user_id=auth.uid() and active and role in ('owner','admin')) and coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'MFA required' using errcode='42501';end if;
 perform 1 from public.portal_identities where organization_id=p_org and customer_id=p_customer and user_id=auth.uid() and active for share;if not found then raise exception 'Customer mapping denied' using errcode='42501';end if;
 select id,expires_at into access_id,expiry from private.property_report_access where organization_id=p_org and customer_id=p_customer and location_id=p_location and user_id=auth.uid() and revoked_at is null and expires_at>clock_timestamp() for share;
 if access_id is null then raise exception 'Report lease denied' using errcode='42501';end if;
 if p_before is not null then select published_at into cursor_time from private.inspection_reports where organization_id=p_org and customer_id=p_customer and location_id=p_location and id=p_before;if cursor_time is null then raise exception 'Report cursor denied' using errcode='42501';end if;end if;
 result:=jsonb_build_object('organization_id',p_org,'customer_id',p_customer,'location_id',p_location,'reports',(
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'version',r.version,'published_at',r.published_at,'snapshot',r.snapshot) order by r.published_at desc,r.id desc),'[]'::jsonb)
 from (select * from private.inspection_reports where organization_id=p_org and customer_id=p_customer and location_id=p_location and (p_before is null or (published_at,id)<(cursor_time,p_before)) order by published_at desc,id desc limit 50)r),
 'media','[]'::jsonb,'mode','internal-development','report_only',true);
 perform private.property_connected_session();
 if expiry<=clock_timestamp() then raise exception 'Report lease expired' using errcode='42501';end if;
 return result;
end$$;
revoke all on function private.property_published_reports(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.property_published_reports(uuid,uuid,uuid,uuid) to authenticated;
create function public.property_reports(p_org uuid,p_customer uuid,p_location uuid,p_before uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select private.property_published_reports(p_org,p_customer,p_location,p_before)$$;
revoke all on function public.property_command(uuid,text,uuid,integer,jsonb),public.property_workspace(uuid),public.property_reports(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.property_command(uuid,text,uuid,integer,jsonb),public.property_workspace(uuid),public.property_reports(uuid,uuid,uuid,uuid) to authenticated;
-- No INSERT into the feature/access/mapping tables, no release mode/grant, no media or Storage changes.
commit;
