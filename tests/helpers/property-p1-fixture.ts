import type { P1Evidence, P1Actor } from '../../server/property/p1-readiness';
export const p1Now = Date.UTC(2026, 9, 17, 16);
export function p1Evidence(): P1Evidence {
  const roles = [
    'owner',
    'estimator',
    'assigned-field',
    'unassigned-field',
    'revoked-staff',
    'customer',
  ];
  const bindings = Array.from({ length: 3 }, (_, i) => ({
    organization_id: crypto.randomUUID(),
    customer_id: crypto.randomUUID(),
    location_id: crypto.randomUUID(),
    job_id: crypto.randomUUID(),
    estimate_version_id: crypto.randomUUID(),
    material_line_id: crypto.randomUUID(),
    expense_id: null,
    job_revision: i === 0 ? 7 : 2,
    existing_material_reviews: 0,
    net_approved_cost_minor: 10001,
    currency: 'USD',
    quoted_at: '2026-10-16T12:00:00Z',
    quote_expires_at: '2026-11-16T12:00:00Z',
    baseline_fingerprints: { original: 'a'.repeat(32) },
  }));
  return {
    capturedAt: new Date(p1Now).toISOString(),
    historyCount: 13,
    identities: 22,
    verifiedTotp: 4,
    sessions: 0,
    featureRows: 0,
    mappings: 0,
    reportLeases: 0,
    activePlatformGrants: 0,
    releaseGrants: 0,
    providerWorkloads: 0,
    bindings,
    resources: bindings.map((b, i) => ({
      ...b,
      company: [
        'Straight Edge Property Services',
        'Cunningham Construction',
        'Sample Roofing Contractor',
      ][i],
      original_revenue_minor: '306280',
      original_baseline_digest: 'a'.repeat(32),
      estimate_version_digest: 'b'.repeat(32),
      version_status: 'issued',
      line: {
        id: b.material_line_id,
        kind: 'material',
        quantity_milli: 12000,
        unit: 'each',
      },
      duplicate_run_expenses: 0,
    })),
    actors: bindings.flatMap((b, i) =>
      roles.map(
        (role) =>
          ({
            alias: `pilot-${i + 1}-${role}`,
            user_id: crypto.randomUUID(),
            organization_id: b.organization_id,
            role:
              role === 'owner' ? 'owner' : role === 'customer' ? null : 'staff',
            staff_type:
              role === 'owner'
                ? 'office_manager'
                : role === 'customer'
                  ? null
                  : role.includes('field')
                    ? 'field_staff'
                    : 'estimator',
            active_membership: !['customer', 'revoked-staff'].includes(role),
            assigned_job: role === 'assigned-field',
            active_customer_mapping: false,
          }) satisfies P1Actor,
      ),
    ),
    originalRows: bindings.map((b) => ({
      table_name: 'public.jobs',
      row_key: b.job_id,
      stable_digest: 'a'.repeat(32),
      full_digest: 'b'.repeat(32),
      original_revision: b.job_revision,
    })),
  };
}
