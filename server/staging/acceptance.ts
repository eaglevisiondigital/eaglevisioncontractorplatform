// Deliberately opt-in, operator-supplied sessions. No login, email, admin key or seeding.
export const tenantTables = [
  'memberships',
  'company_modules',
  'company_settings',
  'customer_notes',
  'communication_consents',
  'lead_notifications',
  'customers',
  'service_locations',
  'intake_requests',
  'documents',
  'activity_events',
  'catalog_items',
  'estimate_tax_policies',
  'estimate_templates',
  'estimates',
  'estimate_versions',
  'estimate_options',
  'estimate_lines',
  'estimate_schedule_proposals',
  'estimate_attachments',
  'material_import_preferences',
  'material_import_batches',
  'material_import_sources',
  'material_import_approvals',
  'jobs',
  'job_assignments',
  'job_expenses',
  'job_expense_reviews',
  'job_change_orders',
  'job_change_approvals',
  'job_expense_material_lines',
  'workforce_policies',
  'worker_profiles',
  'worker_supervisors',
  'labor_rates',
  'time_entries',
  'time_reviews',
  'payroll_periods',
  'payroll_adjustments',
] as const;
export const pilotNames = [
  'Straight Edge Property Services',
  'Cunningham Construction',
  'Sample Roofing Contractor',
] as const;
export interface StagingManifest {
  environment: 'isolated-staging';
  approvalReference: string;
  expiresAt: string;
  supabaseUrl: string;
  forbiddenProjectRefs: string[];
  syntheticOnly: true;
  companies: { name: string; organizationId: string; ownerTokenEnv: string }[];
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateManifest(m: StagingManifest, now = Date.now()) {
  const url = new URL(m.supabaseUrl);
  const ref = url.hostname.split('.')[0];
  if (
    m.environment !== 'isolated-staging' ||
    m.syntheticOnly !== true ||
    typeof m.approvalReference !== 'string' ||
    m.approvalReference.trim().length < 8 ||
    !Number.isFinite(Date.parse(m.expiresAt)) ||
    Date.parse(m.expiresAt) <= now ||
    Date.parse(m.expiresAt) > now + 7 * 86400000 ||
    url.protocol !== 'https:' ||
    !/^[a-z]{20}\.supabase\.co$/.test(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    !m.forbiddenProjectRefs?.length ||
    m.forbiddenProjectRefs.some((x) => !/^[a-z]{20}$/.test(x)) ||
    m.forbiddenProjectRefs.includes(ref) ||
    m.companies?.length !== 3 ||
    new Set(m.companies.map((c) => c.organizationId)).size !== 3 ||
    new Set(m.companies.map((c) => c.ownerTokenEnv)).size !== 3 ||
    pilotNames.some((name) => !m.companies.some((c) => c.name === name)) ||
    m.companies.some(
      (c) =>
        !uuid.test(c.organizationId) ||
        !/^EV_STAGE_[A-Z_]+_JWT$/.test(c.ownerTokenEnv),
    )
  )
    throw new Error('Staging identity/approval manifest rejected');
  return m;
}
export interface AcceptanceReport {
  passed: number;
  checks: string[];
}
function ensure(condition: boolean, label: string) {
  if (!condition) throw new Error(`Acceptance failed: ${label}`);
}
// Every table must have a positive same-tenant control; missing fixtures fail, not skip.
export async function verifyConnectedIsolation(
  m: StagingManifest,
  key: string,
  env: Record<string, string | undefined>,
  transport: typeof fetch = fetch,
): Promise<AcceptanceReport> {
  validateManifest(m);
  ensure(key.startsWith('sb_publishable_'), 'publishable key required');
  const checks: string[] = [];
  const userIds = new Set<string>();
  const request = async (path: string, token?: string) => {
    const r = await transport(`${m.supabaseUrl.replace(/\/$/, '')}${path}`, {
      headers: {
        apikey: key,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    // Do not log responses: even a failing isolation check may return sensitive data.
    const body: unknown = await r.json();
    return { ok: r.ok, status: r.status, body };
  };
  for (const company of m.companies) {
    const token = env[company.ownerTokenEnv];
    ensure(
      !!token && token.split('.').length === 3,
      'real staff session required',
    );
    const auth = await request('/auth/v1/user', token);
    const user = auth.body as { id?: string; is_anonymous?: boolean };
    ensure(
      auth.ok && !!user.id && !user.is_anonymous && !userIds.has(user.id),
      'distinct verified Auth identities',
    );
    userIds.add(user.id!);
    // Auth verified the actual token; never accept caller-invented JWT claims.
    const claims = JSON.parse(
      Buffer.from(token!.split('.')[1], 'base64url').toString(),
    ) as { aal?: string; sub?: string; exp?: number };
    ensure(
      claims.aal === 'aal2' &&
        claims.sub === user.id &&
        Number(claims.exp) * 1000 > Date.now(),
      'real AAL2 session',
    );
    for (const table of tenantTables) {
      const own = await request(
        `/rest/v1/${table}?organization_id=eq.${company.organizationId}&select=organization_id&limit=1`,
        token,
      );
      ensure(
        own.ok &&
          Array.isArray(own.body) &&
          own.body.length === 1 &&
          own.body.every((r) => r.organization_id === company.organizationId),
        `${table} positive control`,
      );
      checks.push(`${table}:own`);
      for (const other of m.companies.filter((c) => c !== company)) {
        const foreign = await request(
          `/rest/v1/${table}?organization_id=eq.${other.organizationId}&select=organization_id&limit=1`,
          token,
        );
        ensure(
          foreign.ok &&
            Array.isArray(foreign.body) &&
            foreign.body.length === 0,
          `${table} cross-tenant denial`,
        );
        checks.push(`${table}:foreign`);
      }
    }
  }
  for (const table of tenantTables) {
    const r = await request(`/rest/v1/${table}?select=organization_id&limit=1`);
    ensure(
      [401, 403].includes(r.status) ||
        (r.ok && Array.isArray(r.body) && r.body.length === 0),
      `${table} anonymous denial`,
    );
    checks.push(`${table}:anonymous`);
  }
  return { passed: checks.length, checks };
}
