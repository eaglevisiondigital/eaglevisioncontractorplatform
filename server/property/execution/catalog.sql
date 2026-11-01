with settings as materialized(select pg_catalog.set_config('search_path','',true)), objects as (
 select 'table' kind,n.nspname||'.'||c.relname name,
 jsonb_build_object('rls',c.relrowsecurity,'force',c.relforcerowsecurity,'replica_identity',c.relreplident,
 'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',x.conname,'definition',pg_catalog.pg_get_constraintdef(x.oid,false),'validated',x.convalidated,'deferrable',x.condeferrable,'deferred',x.condeferred) order by x.conname),'[]') from pg_catalog.pg_constraint x where x.conrelid=c.oid),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('definition',pg_catalog.pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready) order by pg_catalog.pg_get_indexdef(i.indexrelid)),'[]') from pg_catalog.pg_index i where i.indrelid=c.oid),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(select jsonb_agg(case when r=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(r)::text end order by r) from unnest(p.polroles) r),'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid),'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname),'[]') from pg_catalog.pg_policy p where p.polrelid=c.oid),
 'triggers',(select coalesce(jsonb_agg(pg_catalog.pg_get_triggerdef(t.oid,false) order by t.tgname),'[]') from pg_catalog.pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)
 ) definition
 from settings,pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p')
 union all select 'function',n.nspname||'.'||p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||')',jsonb_build_object('definition',pg_catalog.pg_get_functiondef(p.oid))
 from settings,pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' and not exists(select 1 from pg_catalog.pg_depend d where d.classid='pg_catalog.pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
 union all select 'enum',n.nspname||'.'||t.typname,(select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_catalog.pg_enum e where e.enumtypid=t.oid)
 from settings,pg_catalog.pg_type t join pg_catalog.pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','private') and t.typtype='e'
), privileges as (
 select 'table_acl' kind,n.nspname||'.'||c.relname name,
 jsonb_agg(jsonb_build_object('grantee',case when a.grantee=c.relowner then '$owner' when a.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee)::text end,'privilege',a.privilege_type,'grantable',a.is_grantable) order by case when a.grantee=c.relowner then '$owner' when a.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee)::text end,a.privilege_type) definition
 from settings,pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
 where n.nspname in ('public','private') and c.relkind in ('r','p') group by n.nspname,c.relname
 union all select 'function_acl',n.nspname||'.'||p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||')',
 jsonb_agg(jsonb_build_object('grantee',case when a.grantee=p.proowner then '$owner' when a.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee)::text end,'privilege',a.privilege_type,'grantable',a.is_grantable) order by case when a.grantee=p.proowner then '$owner' when a.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee)::text end,a.privilege_type)
 from settings,pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
 where n.nspname in ('public','private') and p.prokind='f' and not exists(select 1 from pg_catalog.pg_depend d where d.classid='pg_catalog.pg_proc'::regclass and d.objid=p.oid and d.deptype='e') group by n.nspname,p.proname,p.oid
) select kind,name,md5(definition::text) fingerprint,definition from (select * from objects union all select * from privileges) all_objects order by kind,name;
