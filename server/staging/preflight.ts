import { tenantTables } from './acceptance.ts';
export interface ReadPreflightTarget {
  supabaseUrl: string;
  publishableKey: string;
  approvalReference: string;
  expiresAt: string;
}
export function validateReadTarget(t: ReadPreflightTarget, now = Date.now()) {
  const u = new URL(t.supabaseUrl);
  if (
    u.protocol !== 'https:' ||
    !/^[a-z]{20}\.supabase\.co$/.test(u.hostname) ||
    u.username ||
    u.password ||
    u.port ||
    u.pathname !== '/' ||
    u.search ||
    u.hash ||
    !t.publishableKey?.startsWith('sb_publishable_') ||
    t.approvalReference?.trim().length < 8 ||
    !t.approvalReference ||
    !Number.isFinite(Date.parse(t.expiresAt)) ||
    Date.parse(t.expiresAt) <= now ||
    Date.parse(t.expiresAt) > now + 86400000
  )
    throw new Error('Read-only preflight target rejected');
  return t;
}
// Only GETs with a publishable key: never Auth admin, login, SQL, fixtures or uploads.
// No response bodies, identifiers or key values enter the returned evidence.
export async function readConnectedPreflight(
  target: ReadPreflightTarget,
  transport: typeof fetch = fetch,
) {
  const t = Object.freeze({ ...validateReadTarget(target) });
  const checks: { name: string; status: number; passed: boolean }[] = [];
  const read = async (path: string, schema?: string) => {
    const r = await transport(`${t.supabaseUrl.replace(/\/$/, '')}${path}`, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        apikey: t.publishableKey,
        ...(schema ? { 'Accept-Profile': schema } : {}),
      },
    });
    // Treat non-JSON and transport failures as failures, never as permission denial.
    const body = (await r.json()) as Record<string, unknown>;
    return { status: r.status, body };
  };
  const auth = await read('/auth/v1/settings');
  checks.push({
    name: 'auth:signup-disabled',
    status: auth.status,
    passed: auth.status === 200 && auth.body.disable_signup === true,
  });
  checks.push({
    name: 'auth:email-enabled-phone-disabled',
    status: auth.status,
    passed:
      auth.status === 200 &&
      (auth.body.external as { email?: boolean; phone?: boolean })?.email ===
        true &&
      (auth.body.external as { phone?: boolean })?.phone === false,
  });
  for (const table of tenantTables) {
    const r = await read(`/rest/v1/${table}?select=organization_id&limit=1`);
    checks.push({
      name: `anonymous:${table}`,
      status: r.status,
      passed: [401, 403].includes(r.status) && r.body.code === '42501',
    });
  }
  for (const schema of ['private', 'graphql_public']) {
    const r = await read('/rest/v1/customers?select=id&limit=1', schema);
    checks.push({
      name: `schema:${schema}:excluded`,
      status: r.status,
      passed: r.status === 406 && r.body.code === 'PGRST106',
    });
  }
  const storage = await read('/storage/v1/bucket');
  checks.push({
    name: 'anonymous:storage-bucket-list-empty',
    status: storage.status,
    passed:
      storage.status === 200 &&
      Array.isArray(storage.body) &&
      storage.body.length === 0,
  });
  const rpc = await read('/rest/v1/rpc/release_contexts');
  checks.push({
    name: 'anonymous:internal-release-denied',
    status: rpc.status,
    passed: [401, 403].includes(rpc.status) && rpc.body.code === '42501',
  });
  return {
    scope: 'read-only anonymous boundary preflight; not tenant acceptance',
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    checks,
  };
}
