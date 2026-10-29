import { it, expect } from 'vitest';
import {
  validateMaintenanceCommand,
  type MaintenanceCommand,
} from '../server/property/maintenance-persistence';
import {
  encodeRepairEvidence,
  restoreRepairEvidence,
} from '../server/property/repair-evidence-archive';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import { prepareMaintenanceExamples } from '../src/lib/maintenance-examples';
import { sampleCompanies } from '../src/domain/platform';
import {
  repairReviewSections,
  type RepairReadinessContext,
} from '../src/domain/property/repair-readiness';
const uid = () => crypto.randomUUID();
const command = (): MaintenanceCommand => ({
  request_id: uid(),
  source: {
    organization_id: uid(),
    customer_id: uid(),
    location_id: uid(),
    report_id: uid(),
    report_version: 1,
    finding_id: 'exact published identity',
  },
  expected_revision: 0,
  action: 'edit',
  input: {
    priority: 'normal',
    review: 'pending',
    assignee_id: null,
    follow_up_on: '',
    note: '',
  },
});
it('defines only exact-source manual edits and explicit follow-up requests', () => {
  const c = command();
  expect(() => validateMaintenanceCommand(c)).not.toThrow();
  expect(() =>
    validateMaintenanceCommand({
      ...c,
      action: 'follow_up',
      input: { plan_id: uid(), plan_revision: 1, visited_on: '2026-11-20' },
    }),
  ).not.toThrow();
});
it.each([
  [
    'null revision',
    (c: MaintenanceCommand) => ({ ...c, expected_revision: null }),
  ],
  [
    'negative revision',
    (c: MaintenanceCommand) => ({ ...c, expected_revision: -1 }),
  ],
  [
    'overflow revision',
    (c: MaintenanceCommand) => ({ ...c, expected_revision: 2147483647 }),
  ],
  [
    'missing report version',
    (c: MaintenanceCommand) => ({
      ...c,
      source: { ...c.source, report_version: undefined },
    }),
  ],
  [
    'foreign extra field',
    (c: MaintenanceCommand) => ({
      ...c,
      source: { ...c.source, private_price: 20 },
    }),
  ],
  [
    'coerced review',
    (c: MaintenanceCommand) => ({
      ...c,
      input: { ...c.input, review: ['pending'] },
    }),
  ],
  [
    'completion',
    (c: MaintenanceCommand) => ({
      ...c,
      input: { ...c.input, review: 'resolved' },
    }),
  ],
  [
    'invalid day',
    (c: MaintenanceCommand) => ({
      ...c,
      input: { ...c.input, follow_up_on: '2026-02-30' },
    }),
  ],
  [
    'private financial execution',
    (c: MaintenanceCommand) => ({ ...c, action: 'issue_estimate' }),
  ],
  ['caller authority', (c: MaintenanceCommand) => ({ ...c, actor_id: uid() })],
  [
    'invalid assignment',
    (c: MaintenanceCommand) => ({
      ...c,
      input: { ...c.input, assignee_id: 'selected-user' },
    }),
  ],
  ['missing input', (c: MaintenanceCommand) => ({ ...c, input: null })],
])('rejects %s without a persistence call', (_, change) =>
  expect(() => validateMaintenanceCommand(change(command()))).toThrow(),
);

async function archiveFixture(index = 0) {
  const company = sampleCompanies[index],
    org = company.id,
    actor = org + '-owner';
  const repo = new PropertyRepository(new Operations(true));
  await repo.initialize(company);
  await prepareMaintenanceExamples(repo, org, actor);
  const row = repo.maintenance(org, actor).items[0];
  const review = await repo.reviewRepair(company, actor, row.source, 0);
  let bundle = await repo.findingEstimate(
    company,
    actor,
    row.source,
    review.id,
  );
  const policy = (await repo.estimates.taxes(org))[0];
  bundle = await repo.estimates.save(org, bundle, {
    ...bundle.version.payload,
    project: {
      ...bundle.version.payload.project,
      description:
        'Replace only the measured joint; concealed work is excluded.',
    },
    terms: 'Synthetic terms require separate authorization before any work.',
    tax_policy_id: policy.id,
    expires_on: '2099-01-01',
    lines: bundle.version.payload.lines.map((l) => ({
      ...l,
      description: 'Remove and replace measured exterior seal',
      unit: 'linear_ft',
      quantity_milli: 8000,
      unit_cost_minor: 1000,
      unit_price_minor: 2000,
    })),
  });
  const state = () =>
    repo.estimates.repairReadiness(
      org,
      actor,
      bundle.estimate.id,
      bundle.version.id,
    );
  for (const section of repairReviewSections) {
    const s = state();
    repo.estimates.confirmRepairReadiness(org, actor, bundle.estimate.id, {
      request_id: uid(),
      draft_version_id: bundle.version.id,
      lock_revision: s.lock_revision,
      expected_sequence: s.sequence,
      snapshot: s.snapshot,
      section: section.id,
      input: {
        decision: 'confirmed',
        attested: true,
        note: 'Synthetic explicit review with supporting record.',
        measurements:
          section.id === 'measurements'
            ? bundle.version.payload.lines.map((l) => ({
                line_id: l.id,
                quantity_milli: l.quantity_milli,
                unit: l.unit,
                basis: 'measured',
                reference:
                  'Synthetic tape measurement M-008, no physical claim.',
              }))
            : [],
      },
    });
  }
  const s = state();
  return {
    repo,
    bundle,
    context: JSON.parse(s.snapshot) as RepairReadinessContext,
    history: s.history,
  };
}
it.each([0, 1, 2])(
  'round-trips six-section receipts using the existing engine for company %s',
  async (index) => {
    const f = await archiveFixture(index);
    const text = encodeRepairEvidence(f.context, f.history);
    const r = restoreRepairEvidence(text, f.context);
    expect(r.current.confirmed).toBe(6);
    expect(r.current.history).toEqual(f.history);
    expect(
      r.current.sections[1].last?.request.input.measurements[0].reference,
    ).toContain('M-008');
    await expect(
      f.repo.estimates.issue(f.context.origin.source.organization_id, f.bundle),
    ).rejects.toThrow(/disabled/i);
    expect(
      JSON.stringify(
        f.repo.portal(
          f.context.origin.source.organization_id,
          f.context.origin.source.customer_id,
        ),
      ),
    ).not.toContain('M-008');
  },
);
it('retains immutable prior evidence while every saved/source/policy/catalog/day change becomes stale', async () => {
  const f = await archiveFixture();
  const text = encodeRepairEvidence(f.context, f.history);
  const variants: Array<(c: RepairReadinessContext) => void> = [
    (c) => c.bundle.version.lock_revision++,
    (c) => c.bundle.version.payload.lines[0].unit_price_minor!++,
    (c) => (c.evidence.finding.description += ' Changed observation.'),
    (c) => {
      c.policy!.policy_version++;
    },
    (c) => {
      c.catalog.push({
        ...c.catalog[0],
        id: uid(),
        organization_id: c.origin.source.organization_id,
      } as (typeof c.catalog)[number]);
    },
    (c) => {
      c.as_of = '2099-02-02';
    },
  ];
  for (const change of variants) {
    const c = structuredClone(f.context);
    change(c);
    const result = restoreRepairEvidence(text, c);
    expect(result.historical.confirmed).toBe(6);
    expect(result.current.confirmed).toBe(0);
    expect(result.current.sections.every((s) => s.stale)).toBe(true);
    expect(result.current.history).toEqual(f.history);
  }
  expect(encodeRepairEvidence(f.context, f.history)).toBe(text);
});
it('rejects substituted targets, tampered review calculations, broken sequences and oversize archives', async () => {
  const f = await archiveFixture();
  const text = encodeRepairEvidence(f.context, f.history);
  const wrong = structuredClone(f.context);
  wrong.origin.source.location_id = uid();
  expect(() => restoreRepairEvidence(text, wrong)).toThrow();
  const history = structuredClone(f.history);
  history[0].calculation.total_minor++;
  expect(() => encodeRepairEvidence(f.context, history)).toThrow();
  history[0] = structuredClone(f.history[0]);
  history[0].sequence = 2;
  expect(() => encodeRepairEvidence(f.context, history)).toThrow();
  expect(() => restoreRepairEvidence(' '.repeat(1048577), f.context)).toThrow();
});
