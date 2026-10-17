import { expect, it } from 'vitest';
import {
  preparePropertyAcceptance,
  type PropertyFixtureBinding,
} from '../server/property/acceptance-plan';
function binding(): PropertyFixtureBinding {
  return {
    organization_id: crypto.randomUUID(),
    customer_id: crypto.randomUUID(),
    location_id: crypto.randomUUID(),
    job_id: crypto.randomUUID(),
    estimate_version_id: crypto.randomUUID(),
    material_line_id: crypto.randomUUID(),
    expense_id: crypto.randomUUID(),
    job_revision: 7,
    existing_material_reviews: 0,
    net_approved_cost_minor: 10001,
    currency: 'USD',
    quoted_at: '2026-10-16T12:00:00Z',
    quote_expires_at: '2026-11-16T12:00:00Z',
    baseline_fingerprints: {
      customers: 'a'.repeat(32),
      workforce: 'b'.repeat(32),
    },
  };
}
it('prepares all72 cases without enabling an executor or modifying existing customer/expense/workforce records', () => {
  const p = preparePropertyAcceptance(
    [binding(), binding(), binding()],
    'review-2026',
  );
  expect(p.plannedCases).toBe(72);
  expect(p.companies.flatMap((c) => c.cases)).toHaveLength(72);
  expect(p.companies.every((c) => c.steps.length === 23)).toBe(true);
  expect(p.hostedExecution).toBe(false);
  expect(p.activation.featureRows).toBe(0);
  expect(p.companies[0].dates.monthly).toEqual(['2026-10-31', '2026-11-30']);
  expect(p.companies[0].expected.supplemental_selling_minor).toBe(11251);
  expect(p.companies[0].expected.customer_receivable_delta_minor).toBe(0);
  expect(
    p.companies.every((c) =>
      c.cases.every(
        (t) => t.status === 'NOT RUN' && t.allForeignOrganizations.length === 2,
      ),
    ),
  ).toBe(true);
});
it('rejects duplicate tenant bindings instead of reusing one company across three cases', () => {
  const b = binding();
  expect(() => preparePropertyAcceptance([b, b, b], 'review-2026')).toThrow(
    'distinct',
  );
});
it('requires an approved immutable purchase baseline with no existing material review conflict', () => {
  const b = binding();
  b.existing_material_reviews = 1;
  expect(() =>
    preparePropertyAcceptance([b, binding(), binding()], 'review-2026'),
  ).toThrow('baseline');
});
it('rejects missing baseline evidence and unsafe currency/cost quantities', () => {
  const b = binding();
  b.baseline_fingerprints = {};
  expect(() =>
    preparePropertyAcceptance([b, binding(), binding()], 'review-2026'),
  ).toThrow('baseline');
  b.baseline_fingerprints = { customer: 'a'.repeat(32) };
  b.net_approved_cost_minor = 1.25;
  expect(() =>
    preparePropertyAcceptance([b, binding(), binding()], 'review-2026'),
  ).toThrow('baseline');
});
it('compiles only caller-scoped property commands and explicit result references', () => {
  const p = preparePropertyAcceptance(
    [binding(), binding(), binding()],
    'review-2026',
  );
  for (const c of p.companies) {
    expect(
      c.steps.every(
        (s) =>
          s.rpc === 'property_command' && s.args.p_org === c.organization_id,
      ),
    ).toBe(true);
    expect(new Set(c.steps.map((s) => s.actor))).toEqual(
      new Set(['owner', 'assigned-field', 'estimator']),
    );
    expect(c.expected).toMatchObject({
      inspection_plans: 2,
      inspection_visits: 4,
      inspection_reports: 4,
      unbilled_decisions: 4,
      job_revision_delta: 4,
      material_cost_postings: 0,
    });
    expect(
      c.steps.some((s) => JSON.stringify(s).includes('approve_job_change')),
    ).toBe(false);
  }
});

it('rejects shared customer/project resources across company fixtures', () => {
  const a = binding(),
    b = binding();
  b.customer_id = a.customer_id;
  expect(() =>
    preparePropertyAcceptance([a, b, binding()], 'review-2026'),
  ).toThrow('tenant boundaries');
});

it('prepares an explicit append-only unmatched expense fixture when no existing candidate is available', () => {
  const b = binding();
  b.expense_id = null;
  const p = preparePropertyAcceptance([b, binding(), binding()], 'review-2026');
  expect(p.companies[0].steps).toHaveLength(25);
  expect(p.companies[0].expected).toMatchObject({
    job_expenses: 1,
    job_expense_reviews: 1,
    job_revision_delta: 5,
    synthetic_actual_cost_delta_minor: 10001,
    customer_receivable_delta_minor: 0,
    material_cost_postings: 1,
  });
  expect(p.companies[0].steps[0].rpc).toBe('submit_job_expense');
  expect(p.companies[0].steps[1].rpc).toBe('review_job_expense');
});
