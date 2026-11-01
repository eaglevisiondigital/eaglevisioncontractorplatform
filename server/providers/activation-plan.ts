import { exactKeys, sha256, uuid } from './safety.ts';

/** Offline review only. No connection, secret reader, provider client or executor. */
export const activationStages = Object.freeze([
  {
    id: 'identity_probe',
    providerCalls: 0,
    tablesWritten: ['private.provider_workloads'],
    function: 'private.require_provider_workload(uuid,uuid,text)',
    requires: [
      'exact owner operation approval',
      'supervised credential lifecycle',
    ],
  },
  {
    id: 'authorize_net',
    providerCalls: 'separate bounded approval',
    requires: [
      'approved sandbox merchant',
      'hosted Accept UI ceremony and one-use token vault',
      'checked invoice/customer authorization provenance',
      'separate payment command role and merchant binding',
      'approved webhook receiver and independent reporting',
    ],
  },
  {
    id: 'nmi',
    providerCalls: 'separate bounded approval',
    requires: [
      'provider-issued sandbox account',
      'Payment Component token contract verified with REST v5',
      'independent NMI token vault and authorization',
      'approved payment webhook and reporting contract',
    ],
  },
  {
    id: 'docusign',
    providerCalls: 'separate demo read/ceremony approval',
    requires: [
      'demo OAuth/account and immutable envelope binding',
      'genuine current AAL2 signer and exact consent',
      'isolated PDF signature trust validator and private evidence store',
      'approved Connect receiver; legal execution remains false',
    ],
  },
  {
    id: 'email',
    providerCalls: 'separate account/domain read approval',
    requires: [
      'tenant account and exact approved DNS records',
      'reviewed sender/profile binding',
      'trusted DNS resolver and signed event receiver',
      'disabled-only outbox; sending requires separate implementation/review',
    ],
  },
] as const);

export function sandboxReadinessPlan() {
  return {
    status: 'REVIEW_ONLY_NOT_AUTHORIZED',
    hostedWrites: 0,
    providerCalls: 0,
    credentialsRead: 0,
    releaseReady: false,
    preferredGateway: 'nmi',
    optionalGateways: ['authorize_net'],
    stages: structuredClone(activationStages),
  };
}

export interface WorkloadProbeProposal {
  organizationId: string;
  scopeId: string;
  capabilityId: string;
  role: string;
  ttlSeconds: 900;
}

export function compileWorkloadProbe(input: WorkloadProbeProposal) {
  const p = Object.freeze({ ...input });
  exactKeys(p, [
    'organizationId',
    'scopeId',
    'capabilityId',
    'role',
    'ttlSeconds',
  ]);
  if (
    ![p.organizationId, p.scopeId, p.capabilityId].every((v) => uuid.test(v)) ||
    new Set([p.organizationId, p.scopeId, p.capabilityId]).size !== 3 ||
    !/^propel_provider_anet_probe_[a-z0-9]{1,12}$/.test(p.role) ||
    p.ttlSeconds !== 900
  )
    throw new Error('Invalid narrowly scoped probe proposal');
  const scopeDigest = sha256(
    JSON.stringify([
      'identity_probe_v1',
      p.organizationId,
      p.scopeId,
      p.capabilityId,
      p.role,
      p.ttlSeconds,
    ]),
  );
  // This digest binds scope, NOT owner authorization. Exact file hashes and the
  // owner approval record must be reviewed externally before any execution.
  const grant = `-- PROPOSAL ONLY. Separate exact owner approval required.
-- Creates one NOLOGIN role and one diagnostic lease; no merchant or provider call.
-- scope SHA256: ${scopeDigest}
begin;
set local lock_timeout='2s';
set local statement_timeout='5s';
do $probe$
declare activated timestamptz := clock_timestamp();
begin
 if not exists(select 1 from public.organizations where id='${p.organizationId}'::uuid and status='active')
 or exists(select 1 from pg_catalog.pg_roles where rolname='${p.role}')
 or exists(select 1 from private.provider_workloads)
 or exists(select 1 from private.merchant_configurations)
 or exists(select 1 from private.platform_admins where active)
 then raise exception 'Probe baseline mismatch'; end if;
 create role ${p.role} nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 1;
 execute format('alter role ${p.role} valid until %L',activated+interval '900 seconds');
 alter role ${p.role} set statement_timeout='5s';
 alter role ${p.role} set lock_timeout='2s';
 alter role ${p.role} set idle_in_transaction_session_timeout='5s';
 grant usage on schema private to ${p.role};
 grant execute on function private.require_provider_workload(uuid,uuid,text) to ${p.role};
 insert into private.provider_workloads(organization_id,id,db_role,service,scope_id,created_at,expires_at,approval_sha256)
 values('${p.organizationId}','${p.capabilityId}','${p.role}','payment','${p.scopeId}',activated,activated+interval '900 seconds','${scopeDigest}');
end $probe$;
commit;
-- Role remains NOLOGIN/password NULL. Credential installation + LOGIN is a
-- separate reviewed in-memory operation, NOT provided or authorized by this file.
`;
  // Emergency closure deliberately precedes the row lock: existing transactions
  // may hold that row. Commit NOLOGIN/ACL removal before terminating exact-role
  // sessions, then mark the immutable capability revoked. Never delete evidence.
  const revoke = `-- PROPOSAL ONLY. Exact-role containment must be supervised.
begin;
set local lock_timeout='2s';
set local statement_timeout='5s';
alter role ${p.role} nologin password null;
revoke execute on function private.require_provider_workload(uuid,uuid,text) from ${p.role};
revoke usage on schema private from ${p.role};
commit;
select pg_catalog.pg_terminate_backend(pid) from pg_catalog.pg_stat_activity
 where usename='${p.role}' and pid<>pg_catalog.pg_backend_pid();
begin;
set local lock_timeout='2s';
set local statement_timeout='5s';
update private.provider_workloads set revoked_at=clock_timestamp()
 where organization_id='${p.organizationId}' and id='${p.capabilityId}'
 and db_role='${p.role}' and service='payment' and scope_id='${p.scopeId}' and revoked_at is null;
commit;
-- Verify NOLOGIN, NULL password through a boolean-only privileged query,
-- zero sessions/ACLs, exactly one revoked lease; retry connection/guard must deny.
-- Do not DROP OWNED, DELETE, TRUNCATE, un-revoke or extend the lease.
`;
  return Object.freeze({
    purpose: 'identity_probe_only' as const,
    providerCallsAllowed: 0 as const,
    scopeDigest,
    grant,
    revoke,
    grantSha256: sha256(grant),
    revokeSha256: sha256(revoke),
  });
}
