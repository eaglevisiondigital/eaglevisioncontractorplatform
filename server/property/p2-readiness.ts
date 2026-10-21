import { reportUuid } from '../../src/domain/property/report-page';
import cases from '../../docs/PROPERTY_CONNECTED_TEST_CASES.json';
export interface P2CompanyBinding {
  organization_id: string;
  customer_id: string;
  location_id: string;
  user_id: string;
  reports: { id: string; sha256: string }[];
}
/** Offline review inventory only. No SQL compiler, credential reader, session creation or executor. */
export function prepareP2Readiness(
  bindings: P2CompanyBinding[],
  staffUserIds: string[],
) {
  if (
    bindings.length !== 3 ||
    staffUserIds.length !== 15 ||
    new Set(staffUserIds).size !== 15 ||
    !staffUserIds.every(reportUuid)
  )
    throw Error('Existing three-company/staff review required');
  for (const field of [
    'organization_id',
    'customer_id',
    'location_id',
    'user_id',
  ] as const)
    if (
      new Set(bindings.map((b) => b[field])).size !== 3 ||
      !bindings.every((b) => reportUuid(b[field]))
    )
      throw Error('Unique exact report bindings required');
  const reportIds = new Set<string>();
  for (const b of bindings) {
    if (staffUserIds.includes(b.user_id) || b.reports.length !== 4)
      throw Error('Existing customer and four published P1 reports required');
    for (const r of b.reports) {
      if (
        !reportUuid(r.id) ||
        !/^[a-f0-9]{64}$/.test(r.sha256) ||
        reportIds.has(r.id)
      )
        throw Error('Unique immutable report evidence required');
      reportIds.add(r.id);
    }
  }
  return {
    status: 'LOCAL_PROPOSAL_NOT_AUTHORIZED' as const,
    hostedExecutor: false,
    mappingRowsProposed: 3,
    reportOnlyLeasesProposed: 3,
    leaseSeconds: 900,
    renewalAllowed: false,
    featureReactivationsProposed: 3,
    cases: bindings.flatMap((b, i) =>
      cases.cases
        .filter((c) => c.stage === 'P2')
        .map((c) => ({
          id: c.id,
          company: cases.companies[i],
          boundary: structuredClone(b),
          status: 'BLOCKED' as const,
          expected: c.expected,
          foreignOrganizations: bindings
            .filter((x) => x.organization_id !== b.organization_id)
            .map((x) => x.organization_id),
          requirements: [
            'Actual post-P1 report snapshots/ownership and original713-record evidence',
            'Current genuine customer Auth UID/session and exact active mapping',
            'Dedicated unexpired report-only lease; release environment and financial grants stay off',
            'Exact separately reviewed activation/lease/mapping/session cleanup authorization',
          ],
        })),
    ),
    cleanup: {
      createdLeaseIdsOnly: true,
      deactivateOnlyCreatedMappings: true,
      exactTenantFeaturesOnly: true,
      sessionLocalLogout: true,
      preserveAuditAndReports: true,
    },
    customerDebtDeltaMinor: 0,
    financialOrMediaAuthority: false,
    writesPerformed: 0,
  };
}
