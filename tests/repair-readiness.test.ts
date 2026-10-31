import { it, expect, vi } from 'vitest';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import { sampleCompanies } from '../src/domain/platform';
import { prepareMaintenanceExamples } from '../src/lib/maintenance-examples';
import { blankLine } from '../src/domain/estimating/calculation';
import {
  repairReviewSections,
  type RepairReadinessInput,
  type RepairReadinessRequest,
  type RepairReviewSection,
} from '../src/domain/property/repair-readiness';
import type { TaxPolicy } from '../src/domain/estimating/types';

async function fixture(index = 0, complete = true) {
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
  if (complete)
    bundle = await repo.estimates.save(org, bundle, {
      ...bundle.version.payload,
      project: {
        ...bundle.version.payload.project,
        description:
          'Replace the joint seal within the measured exterior scope; exclude concealed damage.',
      },
      terms:
        'Synthetic contractor terms: review concealed conditions before any work.',
      tax_policy_id: policy.id,
      lines: bundle.version.payload.lines.map((l) => ({
        ...l,
        description: 'Remove and replace the measured exterior joint seal',
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
  const request = (
    section: RepairReviewSection,
    extra: Partial<RepairReadinessInput> = {},
  ): RepairReadinessRequest => {
    const s = state();
    return {
      request_id: crypto.randomUUID(),
      draft_version_id: bundle.version.id,
      lock_revision: s.lock_revision,
      expected_sequence: s.sequence,
      snapshot: s.snapshot,
      section,
      input: {
        decision: 'confirmed',
        attested: true,
        note: 'Synthetic staff reviewed exact scope, assumptions and applicability.',
        measurements:
          section === 'measurements'
            ? s.lines.map((l) => ({
                line_id: l.id,
                quantity_milli: l.quantity_milli,
                unit: l.unit,
                basis: 'measured',
                reference:
                  'Synthetic tape record M-008 · staff measured eight feet',
              }))
            : [],
        ...extra,
      },
    };
  };
  const confirmAll = () => {
    for (const section of repairReviewSections)
      repo.estimates.confirmRepairReadiness(
        org,
        actor,
        bundle.estimate.id,
        request(section.id),
      );
  };
  return {
    repo,
    company,
    org,
    actor,
    row,
    bundle,
    policy,
    state,
    request,
    confirmAll,
  };
}
it.each([0, 1, 2])(
  'company %s completes six internal reviews, preserves source/baseline/triage and never enables issuance',
  async (index) => {
    const f = await fixture(index),
      { repo, org, actor, row, bundle } = f;
    const property = repo.read(org),
      baseline = await repo.estimates.history(org, property.bundle.estimate.id),
      jobs = await repo.estimates.jobs(org);
    f.confirmAll();
    const ready = f.state();
    expect(ready.ready).toBe(true);
    expect(ready.confirmed).toBe(6);
    expect(ready.history).toHaveLength(6);
    expect(
      ready.history.every(
        (r) =>
          r.request.lock_revision === bundle.version.lock_revision &&
          r.policy_version === 1,
      ),
    ).toBe(true);
    expect(ready.calculation).toEqual(bundle.version.calculation);
    expect(ready.evidence.finding.description).toBe(row.finding.description);
    expect(ready.lines[0].description).not.toBe(row.finding.description);
    expect(repo.read(org)).toEqual(property);
    expect(
      await repo.estimates.history(org, property.bundle.estimate.id),
    ).toEqual(baseline);
    expect(await repo.estimates.jobs(org)).toEqual(jobs);
    expect(repo.maintenance(org, actor).items[0].record).toEqual(row.record);
    await expect(repo.estimates.issue(org, bundle)).rejects.toThrow(
      'issuance is disabled',
    );
    await expect(repo.estimates.duplicate(f.company, bundle)).rejects.toThrow(
      'separate exact-source',
    );
    const portal = JSON.stringify(repo.portal(org, row.source.customer_id));
    expect(portal).not.toContain('Synthetic staff reviewed');
    expect(portal).not.toContain('M-008');
    ready.history[0].request.input.note = 'forged';
    expect(f.state().history[0].request.input.note).not.toBe('forged');
  },
);
it('fresh repair placeholders remain incomplete: missing scope, measurements, costs, prices, tax and terms', async () => {
  const f = await fixture(0, false),
    s = f.state();
  expect(s.ready).toBe(false);
  expect(s.confirmed).toBe(0);
  for (const section of repairReviewSections)
    expect(
      s.sections.find((v) => v.id === section.id)?.blockers.length,
    ).toBeGreaterThan(0);
  expect(s.validPolicy).toBe(false);
  for (const id of ['scope', 'resources', 'pricing', 'tax', 'terms'] as const)
    expect(() =>
      f.repo.estimates.confirmRepairReadiness(
        f.org,
        f.actor,
        f.bundle.estimate.id,
        f.request(id),
      ),
    ).toThrow('outstanding');
  expect(f.state().history).toHaveLength(0);
});
it.each([
  'placeholder',
  'missing',
  'quantity',
  'unit',
  'duplicate',
  'reference',
  'foreign line',
])(
  'rejects %s measurement evidence without recording a confirmation',
  async (kind) => {
    const f = await fixture(),
      r = f.request('measurements');
    if (kind === 'placeholder') r.input.measurements[0].basis = 'placeholder';
    if (kind === 'missing') r.input.measurements = [];
    if (kind === 'quantity') r.input.measurements[0].quantity_milli++;
    if (kind === 'unit') r.input.measurements[0].unit = 'hour';
    if (kind === 'duplicate')
      r.input.measurements.push(r.input.measurements[0]);
    if (kind === 'reference') r.input.measurements[0].reference = '';
    if (kind === 'foreign line')
      r.input.measurements[0].line_id = crypto.randomUUID();
    expect(() =>
      f.repo.estimates.confirmRepairReadiness(
        f.org,
        f.actor,
        f.bundle.estimate.id,
        r,
      ),
    ).toThrow();
    expect(
      f.state().sections.find((s) => s.id === 'measurements')?.confirmed,
    ).toBe(false);
    expect(f.state().history).toHaveLength(0);
  },
);
it.each([
  'quantity',
  'unit',
  'cost',
  'price',
  'markup',
  'material',
  'labor',
  'scope',
  'tax treatment',
  'terms',
  'extra line',
  'discount',
])(
  'saved %s changes invalidate prior review while preserving historical evidence',
  async (kind) => {
    const f = await fixture();
    f.confirmAll();
    const old = f.state(),
      p = structuredClone(f.bundle.version.payload);
    if (kind === 'quantity') p.lines[0].quantity_milli++;
    if (kind === 'unit') p.lines[0].unit = 'sq_ft';
    if (kind === 'cost') p.lines[0].unit_cost_minor++;
    if (kind === 'price') p.lines[0].unit_price_minor!++;
    if (kind === 'markup') p.lines[0].markup_bps++;
    if (kind === 'material') p.lines[0].kind = 'material';
    if (kind === 'labor') p.lines[0].kind = 'labor';
    if (kind === 'scope')
      p.lines[0].description += ' with additional surface preparation';
    if (kind === 'tax treatment') p.lines[0].taxable = true;
    if (kind === 'terms') p.terms += ' Updated scope limit.';
    if (kind === 'extra line')
      p.lines.push({
        ...blankLine('labor'),
        description: 'Measured preparation labor',
        quantity_milli: 2000,
        unit_cost_minor: 5000,
        unit_price_minor: 7000,
      });
    if (kind === 'discount') p.discount = { kind: 'percent', value: 100 };
    await f.repo.estimates.save(f.org, f.bundle, p);
    const changed = f.state();
    expect(changed.ready).toBe(false);
    expect(changed.confirmed).toBe(0);
    expect(changed.sections.every((s) => s.stale)).toBe(true);
    expect(changed.history).toEqual(old.history);
    const r = {
      ...f.request('scope'),
      lock_revision: old.lock_revision,
      snapshot: old.snapshot,
    };
    expect(() =>
      f.repo.estimates.confirmRepairReadiness(
        f.org,
        f.actor,
        f.bundle.estimate.id,
        r,
      ),
    ).toThrow('changed');
  },
);
it.each(['version', 'rate', 'status', 'inactive', 'reference'])(
  'current tax policy %s drift invalidates review without a draft write',
  async (kind) => {
    const f = await fixture();
    f.confirmAll();
    // Disposable internal fixture simulates a policy update; no hosted schema or configuration.
    const state = (
      f.repo.estimates as unknown as {
        states: Map<string, { taxes: TaxPolicy[] }>;
      }
    ).states.get(f.org)!;
    const policy = state.taxes.find((t) => t.id === f.policy.id)!;
    if (kind === 'version') policy.policy_version++;
    if (kind === 'rate') policy.rate_bps = 700;
    if (kind === 'status') policy.status = 'draft';
    if (kind === 'inactive') policy.active = false;
    if (kind === 'reference') policy.reference += ' Revised applicability';
    const s = f.state();
    expect(s.confirmed).toBe(0);
    expect(s.ready).toBe(false);
    expect(s.lock_revision).toBe(f.bundle.version.lock_revision);
    expect(
      s.sections.find((s) => s.id === 'tax')?.blockers.length,
    ).toBeGreaterThan(0);
    expect(() =>
      f.repo.estimates.confirmRepairReadiness(
        f.org,
        f.actor,
        f.bundle.estimate.id,
        f.request('tax'),
      ),
    ).toThrow('outstanding');
  },
);
it('catalog overrides require explicit staff review; later referenced catalog changes invalidate confirmations', async () => {
  const f = await fixture(),
    item = (await f.repo.estimates.catalog(f.org))[0];
  f.bundle = await f.repo.estimates.save(f.org, f.bundle, {
    ...f.bundle.version.payload,
    lines: f.bundle.version.payload.lines.map((l) => ({
      ...l,
      catalog_item_id: item.id,
    })),
  });
  expect(
    f
      .state()
      .sections.find((s) => s.id === 'resources')
      ?.warnings.join(' '),
  ).toContain('substitution');
  f.confirmAll();
  expect(f.state().ready).toBe(true);
  await f.repo.estimates.saveCatalog(
    f.org,
    { ...item, unit_cost_minor: item.unit_cost_minor + 1 },
    item.id,
  );
  expect(f.state().confirmed).toBe(0);
  expect(f.state().history).toHaveLength(6);
});
it('idempotent duplicate key returns the original receipt; different evidence and stale review sequences reject', async () => {
  const f = await fixture(),
    r = f.request('scope');
  const saved = f.repo.estimates.confirmRepairReadiness(
    f.org,
    f.actor,
    f.bundle.estimate.id,
    r,
  );
  expect(
    f.repo.estimates.confirmRepairReadiness(
      f.org,
      f.actor,
      f.bundle.estimate.id,
      r,
    ),
  ).toEqual({ ...saved, duplicate: true });
  expect(f.state().history).toHaveLength(1);
  expect(() =>
    f.repo.estimates.confirmRepairReadiness(
      f.org,
      f.actor,
      f.bundle.estimate.id,
      { ...r, input: { ...r.input, note: 'Different evidence' } },
    ),
  ).toThrow('key reused');
  expect(() =>
    f.repo.estimates.confirmRepairReadiness(
      f.org,
      f.actor,
      f.bundle.estimate.id,
      { ...f.request('pricing'), expected_sequence: 0 },
    ),
  ).toThrow('review changed');
  expect(() =>
    f.repo.estimates.confirmRepairReadiness(
      f.org,
      f.actor,
      f.bundle.estimate.id,
      f.request('scope'),
    ),
  ).toThrow('already confirmed');
});
it('explicit outstanding questions supersede a confirmation and cannot silently remain ready', async () => {
  const f = await fixture();
  f.confirmAll();
  f.repo.estimates.confirmRepairReadiness(
    f.org,
    f.actor,
    f.bundle.estimate.id,
    f.request('scope', {
      decision: 'needs_review',
      attested: false,
      note: 'Outstanding: confirm concealed damage scope before further review.',
    }),
  );
  expect(f.state().ready).toBe(false);
  expect(f.state().confirmed).toBe(5);
  expect(
    f.state().sections.find((s) => s.id === 'scope')?.last?.request.input.note,
  ).toContain('concealed');
  expect(f.state().history).toHaveLength(7);
});
it('contradictory attestation and confirmation decision cannot create review evidence', async () => {
  const f = await fixture();
  for (const input of [
    { decision: 'confirmed' as const, attested: false },
    { decision: 'needs_review' as const, attested: true },
  ])
    expect(() =>
      f.repo.estimates.confirmRepairReadiness(
        f.org,
        f.actor,
        f.bundle.estimate.id,
        f.request('scope', input),
      ),
    ).toThrow('consistent');
  expect(f.state().history).toHaveLength(0);
});
it('scope identity and current membership remain required; closed connected use never queries adapters', async () => {
  const f = await fixture();
  await f.repo.initialize(sampleCompanies[1]);
  expect(() =>
    f.repo.estimates.repairReadiness(
      sampleCompanies[1].id,
      sampleCompanies[1].id + '-owner',
      f.bundle.estimate.id,
      f.bundle.version.id,
    ),
  ).toThrow('source unavailable');
  expect(() =>
    f.repo.estimates.repairReadiness(
      f.org,
      f.org + '-field',
      f.bundle.estimate.id,
      f.bundle.version.id,
    ),
  ).toThrow('reviewer');
  expect(() =>
    f.repo.estimates.repairReadiness(
      f.org,
      f.actor,
      f.bundle.estimate.id,
      crypto.randomUUID(),
    ),
  ).toThrow('source unavailable');
  const request = f.request('scope');
  vi.spyOn(f.repo.operations, 'syntheticMemberships').mockReturnValue([]);
  expect(() =>
    f.repo.estimates.confirmRepairReadiness(
      f.org,
      f.actor,
      f.bundle.estimate.id,
      request,
    ),
  ).toThrow('reviewer');
  const connected = new PropertyRepository(new Operations(false));
  expect(() =>
    connected.estimates.repairReadiness(
      f.org,
      f.actor,
      f.bundle.estimate.id,
      f.bundle.version.id,
    ),
  ).toThrow('unavailable');
});
it('uncertain repair preparation cannot enter readiness before explicit exact-target reconciliation', async () => {
  const company = sampleCompanies[0],
    org = company.id,
    actor = org + '-owner';
  const repo = new PropertyRepository(new Operations(true));
  await repo.initialize(company);
  await prepareMaintenanceExamples(repo, org, actor);
  const row = repo.maintenance(org, actor).items[0],
    review = await repo.reviewRepair(company, actor, row.source, 0);
  const create = repo.estimates.createSyntheticRepair.bind(repo.estimates);
  vi.spyOn(repo.estimates, 'createSyntheticRepair').mockImplementationOnce(
    async (...args) => {
      await create(...args);
      throw Error('Lost response');
    },
  );
  await expect(
    repo.findingEstimate(company, actor, row.source, review.id),
  ).rejects.toThrow('Reconcile');
  const p = repo.repairAttempt(org, actor, row.source)!.provenance!;
  expect(() =>
    repo.estimates.repairReadiness(
      org,
      actor,
      p.estimate_id,
      p.draft_version_id,
    ),
  ).toThrow('uncertain');
  await repo.openRepair(org, actor, row.source, true);
  expect(
    repo.estimates.repairReadiness(
      org,
      actor,
      p.estimate_id,
      p.draft_version_id,
    ).ready,
  ).toBe(false);
});

it('maintenance queue derives current readiness and hides cached confirmations after a save or unavailable draft', async () => {
  const f = await fixture();
  f.confirmAll();
  expect(f.repo.maintenance(f.org, f.actor).items[0].repair?.readiness).toEqual(
    { confirmed: 6, revision: f.bundle.version.lock_revision },
  );
  await f.repo.estimates.save(f.org, f.bundle, {
    ...f.bundle.version.payload,
    terms: 'Changed synthetic terms require fresh review.',
  });
  expect(f.repo.maintenance(f.org, f.actor).items[0].repair?.readiness).toEqual(
    { confirmed: 0, revision: f.bundle.version.lock_revision + 1 },
  );
  await f.repo.estimates.archive(f.org, f.bundle.estimate.id, true);
  expect(
    f.repo.maintenance(f.org, f.actor).items[0].repair?.readiness,
  ).toBeNull();
});
it('saved policy snapshots and immutable baseline policy evidence do not alias the editable policy fixture', async () => {
  const f = await fixture(),
    before = structuredClone(f.bundle.version.tax_policy_snapshot);
  const baseline = f.repo.read(f.org).bundle.version;
  const state = (
    f.repo.estimates as unknown as {
      states: Map<string, { taxes: TaxPolicy[] }>;
    }
  ).states.get(f.org)!;
  state.taxes[0].policy_version++;
  const current = await f.repo.estimates.get(f.org, f.bundle.estimate.id);
  expect(current.version.tax_policy_snapshot).toEqual(before);
  expect(
    (await f.repo.estimates.get(f.org, baseline.estimate_id, baseline.id))
      .version,
  ).toEqual(baseline);
});
it('review receipts retain exact calculated totals and measurement requests require a nonempty staff rationale', async () => {
  const f = await fixture(),
    request = f.request('pricing');
  const result = f.repo.estimates.confirmRepairReadiness(
    f.org,
    f.actor,
    f.bundle.estimate.id,
    request,
  );
  expect(result.review.calculation).toMatchObject({
    total_minor: f.bundle.version.calculation.total_minor,
    cost_minor: f.bundle.version.calculation.cost_minor,
    engine_version: 1,
  });
  expect(() =>
    f.repo.estimates.confirmRepairReadiness(
      f.org,
      f.actor,
      f.bundle.estimate.id,
      f.request('measurements', { note: '' }),
    ),
  ).toThrow('supporting note');
});
