import { it, expect, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import { executionPackage } from './helpers/p1-execution';
import {
  assertP1Snapshot,
  type P1Snapshot,
  type P1Reference,
} from '../server/property/execution/verification';
const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});
function setup() {
  const p = executionPackage();
  roots.push(p.root);
  const reference: P1Reference = {
    identityRoster: [
      ...p.evidence.actors.map((a) => ({ id: a.user_id, confirmed: true })),
      ...Array.from({ length: 4 }, () => ({
        id: crypto.randomUUID(),
        confirmed: true,
      })),
    ],
    factorRoster: Array.from({ length: 4 }, () => ({
      id: crypto.randomUUID(),
      user_id: p.evidence.actors[0].user_id,
      factor_type: 'totp',
      status: 'verified',
    })),
    history: Array.from({ length: 13 }, (_, i) => ({ version: String(i) })),
    catalog: [],
    columnAcl: [],
    defaults: [],
    schema: [],
    tableCounts: [
      { table_name: 'public.jobs', row_count: 3 },
      ...[
        'public.activity_events',
        'public.job_expenses',
        'public.job_expense_reviews',
        'public.job_change_orders',
        'public.release_ledger_entries',
        'private.provider_workloads',
      ].map((table_name) => ({ table_name, row_count: 0 })),
    ],
    authSettingsHash: 'local-only',
    apiSettingsHash: 'local-only',
  };
  const domain = {
    'private.property_features': 3,
    'private.inspection_plans': 6,
    'private.inspection_visits': 12,
    'private.inspection_reports': 12,
    'private.supplier_comparisons': 3,
    'private.unbilled_decisions': 12,
    'private.supplemental_invoice_drafts': 3,
    'private.property_report_access': 0,
    'private.property_media': 0,
  };
  const snapshot: P1Snapshot = {
    ...structuredClone(reference),
    tableCounts: [
      ...structuredClone(reference.tableCounts),
      ...Object.keys(domain).map((table_name) => ({
        table_name,
        row_count: 0,
      })),
    ],
    originalRows: structuredClone(p.plan.originalRows),
    actors: structuredClone(p.evidence.actors),
    identities: 22,
    verifiedTotp: 4,
    expenses: [],
    changes: [],
    drafts: [],
    audits: [],
  };
  const receipts = new Map<string, Map<string, { id: string } | string>>();
  const after = () => {
    for (const c of p.plan.companies) {
      const ids = new Map(
        c.steps.map((s) => [
          s.id,
          s.rpc === 'property_command'
            ? { id: crypto.randomUUID() }
            : crypto.randomUUID(),
        ]),
      );
      receipts.set(c.organization_id, ids);
      const id = (step: string) => {
        const r = ids.get(step)!;
        return typeof r === 'string' ? r : r.id;
      };
      const change = crypto.randomUUID(),
        draft = crypto.randomUUID();
      snapshot.expenses.push({
        id: id('fixture-expense'),
        organization_id: c.organization_id,
        amount_minor: 10001,
        purchase_key: String(c.idempotency.purchaseKey),
        reference: String(c.idempotency.reference),
      });
      snapshot.changes.push({
        id: change,
        organization_id: c.organization_id,
        selling_minor: c.expected.supplemental_selling_minor,
        cost_minor: 0,
      });
      snapshot.drafts.push({
        id: draft,
        organization_id: c.organization_id,
        status: 'awaiting_customer_authorization',
        selling_minor: c.expected.supplemental_selling_minor,
        expense_id: id('fixture-expense'),
        decision_id: id('decision-proposed'),
        change_order_id: change,
      });
      const events: Record<string, string[]> = {
        property_features: [c.organization_id, c.organization_id],
        job_expenses: [id('fixture-expense')],
        job_expense_reviews: [id('fixture-review')],
        jobs: Array(5).fill(c.steps[0].args.p_job),
        job_change_orders: [change],
        inspection_plans: ['weekly', 'monthly'].map((x) => id(x + '-plan')),
        inspection_visits: ['weekly', 'monthly'].flatMap((x) =>
          [0, 1].flatMap((i) => Array(4).fill(id(x + '-' + i + '-visit'))),
        ),
        inspection_reports: ['weekly', 'monthly'].flatMap((x) =>
          [0, 1].map((i) => id(x + '-' + i + '-publish')),
        ),
        supplier_comparisons: [id('four-vendors')],
        unbilled_decisions: [
          'absorbed',
          'included',
          'deferred',
          'proposed',
        ].map((x) => id('decision-' + x)),
        supplemental_invoice_drafts: [draft],
      };
      for (const [entity_type, entities] of Object.entries(events))
        for (const entity_id of entities)
          snapshot.audits.push({
            organization_id: c.organization_id,
            actor_id:
              entity_type === 'property_features'
                ? null
                : entity_type === 'supplier_comparisons'
                  ? c.actorBindings.estimator.user_id
                  : c.actorBindings.owner.user_id,
            entity_type,
            entity_id,
            action: 'insert',
          });
      const row = snapshot.originalRows.find(
        (r) => r.row_key === c.steps[0].args.p_job,
      )!;
      row.original_revision = c.expectedJobRevision;
      row.full_digest = 'c'.repeat(32);
    }
    const deltas: Record<string, number> = {
      'public.activity_events': 114,
      'public.job_expenses': 3,
      'public.job_expense_reviews': 3,
      'public.job_change_orders': 3,
      ...domain,
    };
    for (const r of snapshot.tableCounts)
      r.row_count += deltas[r.table_name] ?? 0;
  };
  return { ...p, reference, snapshot, receipts, after };
}
it('requires unchanged original composite rows, preserved Auth/factors,57 additions,114 scoped audits and zero customer debt', () => {
  const s = setup();
  expect(() =>
    assertP1Snapshot(s.frozen, s.reference, s.snapshot, false),
  ).not.toThrow();
  s.after();
  expect(() =>
    assertP1Snapshot(s.frozen, s.reference, s.snapshot, true, s.receipts),
  ).not.toThrow();
});
it.each([
  'missing row',
  'duplicate key',
  'baseline mutation',
  'wrong revision',
  'identity replacement',
  'factor replacement',
  'settings drift',
  'new debt',
  'provider capability',
  'media activation',
  'wrong price',
  'payable draft',
  'foreign expense',
  'audit actor',
  'audit tenant',
  'audit deletion',
  'audit count',
  'audit wrong entity type',
  'audit duplicate entity',
])('rejects %s in independent post-cleanup evidence', (kind) => {
  const s = setup();
  s.after();
  const x = s.snapshot;
  if (kind === 'missing row') x.originalRows.pop();
  if (kind === 'duplicate key') x.originalRows.push({ ...x.originalRows[0] });
  if (kind === 'baseline mutation')
    x.originalRows[0].stable_digest = 'd'.repeat(32);
  if (kind === 'wrong revision') x.originalRows[0].original_revision!++;
  if (kind === 'identity replacement')
    x.identityRoster[0].id = crypto.randomUUID();
  if (kind === 'factor replacement') x.factorRoster[0].id = crypto.randomUUID();
  if (kind === 'settings drift') x.apiSettingsHash = 'changed';
  if (kind === 'new debt')
    x.tableCounts.find((r) => r.table_name === 'public.release_ledger_entries')!
      .row_count++;
  if (kind === 'provider capability')
    x.tableCounts.find((r) => r.table_name === 'private.provider_workloads')!
      .row_count++;
  if (kind === 'media activation')
    x.tableCounts.find((r) => r.table_name === 'private.property_media')!
      .row_count++;
  if (kind === 'wrong price') x.drafts[0].selling_minor++;
  if (kind === 'payable draft') x.drafts[0].status = 'issued';
  if (kind === 'foreign expense') x.drafts[0].expense_id = x.expenses[1].id;
  if (kind === 'audit actor')
    x.audits.find((a) => a.entity_type === 'jobs')!.actor_id =
      s.evidence.actors.find(
        (a) => a.alias === 'pilot-1-assigned-field',
      )!.user_id;
  if (kind === 'audit tenant')
    x.audits[0].organization_id = crypto.randomUUID();
  if (kind === 'audit deletion') x.audits[0].action = 'delete';
  if (kind === 'audit count') x.audits.pop();
  if (kind === 'audit wrong entity type')
    x.audits.find((a) => a.entity_type === 'inspection_reports')!.entity_id =
      x.audits.find((a) => a.entity_type === 'jobs')!.entity_id;
  if (kind === 'audit duplicate entity') {
    const reports = x.audits.filter(
      (a) => a.entity_type === 'inspection_reports',
    );
    reports[0].entity_id = reports[1].entity_id;
  }
  expect(() =>
    assertP1Snapshot(s.frozen, s.reference, x, true, s.receipts),
  ).toThrow();
});
