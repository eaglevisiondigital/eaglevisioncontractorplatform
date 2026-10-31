import { loadP1Package, requireFrozen, type FrozenP1 } from './package.ts';
import type { CleanupObservation, CleanupPorts } from './safety.ts';
/** Independent control-plane channel: only frozen controls and a fixed aggregate SELECT. Not an application RPC client. */
export function managementCleanup(
  frozen: FrozenP1,
  token: string,
  signOutAll: () => Promise<void>,
  transport: typeof fetch = fetch,
): CleanupPorts {
  requireFrozen(frozen);
  if (!/^sbp_(oauth_|v0_)?[a-f0-9]{40}$/.test(token))
    throw Error('Approved management custody required');
  const orgs = frozen.plan.companies
    .map((c) => "'" + c.organization_id + "'::uuid")
    .join(',');
  const read = `select (select count(*) from private.property_features where enabled and organization_id in (${orgs})) as "approvedActiveFeatures",(select count(*) from private.property_features where enabled and organization_id not in (${orgs})) as "unexpectedActiveFeatures",(select count(*) from auth.sessions) as sessions,(select count(*) from public.portal_identities) as "customerMappings",(select count(*) from private.property_report_access) as "reportLeases",(select count(*) from private.platform_admins where active) as "activePlatformGrants",(select count(*) from private.release_test_users) as "releaseGrants",(select count(*) from private.provider_workloads) as "providerWorkloads"`;
  const query = async (sql: string) => {
    const r = await transport(
      `https://api.supabase.com/v1/projects/${frozen.target}/database/query`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!r.ok) throw Error('Independent control request unconfirmed');
    return r.json();
  };
  return {
    deactivate: async () => {
      await query(frozen.cleanupSql);
    },
    signOutAll,
    observe: async () => {
      const rows = await query(read);
      const keys = [
        'approvedActiveFeatures',
        'unexpectedActiveFeatures',
        'sessions',
        'customerMappings',
        'reportLeases',
        'activePlatformGrants',
        'releaseGrants',
        'providerWorkloads',
      ];
      if (
        !Array.isArray(rows) ||
        rows.length !== 1 ||
        keys.some(
          (k) =>
            !Number.isSafeInteger(Number(rows[0][k])) ||
            Number(rows[0][k]) < 0 ||
            rows[0][k] === null,
        )
      )
        throw Error('Independent control observation invalid');
      return Object.fromEntries(
        keys.map((k) => [k, Number(rows[0][k])]),
      ) as unknown as CleanupObservation;
    },
  };
}
export { loadP1Package };
