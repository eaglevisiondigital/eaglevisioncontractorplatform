import { it, expect } from 'vitest';
import { PropertyRepository } from '../src/lib/property';
import { Operations } from '../src/lib/operations';
import { sampleCompanies } from '../src/domain/platform';
import {
  occurrence,
  publishVisit,
  validateVisit,
} from '../src/domain/property/inspections';
import {
  compareSuppliers,
  convertQuantity,
  draftCostLines,
  requirementsFromLines,
  quoteExtension,
  type SupplierQuote,
} from '../src/domain/property/comparison';
import {
  unbilledRows,
  prepareMaterialDecision,
} from '../src/domain/property/unbilled';
import { jobFinancials } from '../src/domain/jobs/financials';
import {
  mediaPolicy,
  validateMediaManifest,
  ingestPropertyMedia,
  issuePropertyPlayback,
  type MediaManifest,
} from '../server/property/media';
const company = sampleCompanies[0],
  org = company.id;
async function fixture() {
  const r = new PropertyRepository(new Operations(true));
  await r.initialize(company);
  return r;
}
function quote(
  lines: ReturnType<typeof requirementsFromLines>,
  patch: Partial<SupplierQuote> = {},
): SupplierQuote {
  return {
    id: crypto.randomUUID(),
    name: 'Synthetic supplier',
    store: 'Synthetic store',
    account_price_note: 'Manual reviewed quote',
    source_reference: 'Synthetic file reference',
    quoted_at: '2020-01-01T00:00:00Z',
    expires_at: '2099-01-01T00:00:00Z',
    currency: 'USD',
    shipping_minor: 0,
    pickup_minor: 0,
    tax_bps: 0,
    lines: lines.map((r) => ({
      line_id: r.line_id,
      sku: r.sku,
      specification: r.specification,
      unit: r.unit,
      pack_quantity_milli: 1000,
      pack_price_minor: 100,
      available_packs: 100000,
      equivalent_approved: false,
    })),
    ...patch,
  };
}
it('recurrence stays anchored across month ends and DST without shifting local visit dates', () => {
  const p = {
    starts_on: '2026-01-31',
    cadence: 'monthly' as const,
    interval_days: 14,
    timezone: 'America/Chicago',
  };
  expect(occurrence(p, 1)).toBe('2026-02-28');
  expect(occurrence(p, 2)).toBe('2026-03-31');
  expect(
    occurrence({ ...p, starts_on: '2026-03-07', cadence: 'weekly' }, 1),
  ).toBe('2026-03-14');
  expect(occurrence({ ...p, cadence: 'once' }, 1)).toBeNull();
  expect(() => occurrence({ ...p, timezone: 'invalid' }, 1)).toThrow();
});
it('immutable report versions exclude internal findings, notes and arbitrary properties', async () => {
  const r = await fixture(),
    s = r.read(org),
    v = s.visits[0];
  r.saveVisit(org, v, {
    ...v.content,
    checklist: v.content.checklist.map((x) => ({ ...x, completed: true })),
  });
  r.submit(org, r.read(org).visits[0]);
  const report = r.publish(org, r.read(org).visits[0]);
  expect(JSON.stringify(report)).not.toContain('INTERNAL');
  report.summary = 'Forged';
  expect(r.read(org).reports[0].summary).not.toBe('Forged');
  r.revise(org, r.read(org).visits[0]);
  r.saveVisit(org, r.read(org).visits[0], {
    ...v.content,
    summary: 'Revised visit',
  });
  expect(r.read(org).reports[0].summary).not.toBe('Revised visit');
});
it('cross-company visits, stale versions, incomplete checklists and duplicate dates fail', async () => {
  const r = await fixture();
  await r.initialize(sampleCompanies[1]);
  const a = r.read(org),
    b = r.read(sampleCompanies[1].id);
  expect(() =>
    r.saveVisit(sampleCompanies[1].id, a.visits[0], a.visits[0].content),
  ).toThrow();
  expect(() => publishVisit(b.plans[0], a.visits[0], 1)).toThrow();
  r.submit(org, a.visits[0]);
  expect(() => r.publish(org, r.read(org).visits[0])).toThrow();
  expect(() => r.saveVisit(org, a.visits[0], a.visits[0].content)).toThrow();
  expect(() =>
    r.addVisit(org, a.plans[0].id, a.visits[0].visited_on),
  ).toThrow();
  expect(() => r.addVisit(org, a.plans[0].id, '2026-02-31')).toThrow();
});
it('inspection validation rejects duplicate identifiers and malformed boolean/severity values', async () => {
  const r = await fixture(),
    c = r.read(org).visits[0].content;
  expect(() =>
    validateVisit({ ...c, findings: [c.findings[0], c.findings[0]] }),
  ).toThrow();
  expect(() =>
    validateVisit({
      ...c,
      checklist: [{ ...c.checklist[0], completed: undefined! }],
    }),
  ).toThrow();
  expect(() => validateVisit({ ...c, summary: '' })).toThrow();
});
it.each([
  [1000, 'roofing_square', 'sq_ft', 100000],
  [12000, 'inch', 'linear_ft', 1000],
  [1000, 'each', 'each', 1000],
] as const)('converts %s %s to %s exactly', (q, a, b, want) =>
  expect(convertQuantity(q, a, b)).toBe(want),
);
it('refuses unsupported or precision-losing conversions rather than guessing equivalence', () => {
  expect(() => convertQuantity(1000, 'bundle', 'each')).toThrow();
  expect(() => convertQuantity(1000, 'inch', 'linear_ft')).toThrow();
  expect(() => convertQuantity(NaN, 'each', 'each')).toThrow();
});
it('complete baskets and mixed baskets include each used vendor fee exactly once', async () => {
  const r = await fixture(),
    req = requirementsFromLines(r.read(org).bundle.version.payload.lines).slice(
      0,
      2,
    );
  expect(req.length).toBeGreaterThan(0);
  const a = quote(req, { shipping_minor: 100000 }),
    b = quote(req, { shipping_minor: 1 });
  a.lines.forEach((l) => (l.pack_price_minor = 1));
  b.lines.forEach((l) => (l.pack_price_minor = 2));
  const result = compareSuppliers(req, [a, b], 'USD');
  expect(result.mixed?.total_minor).toBe(result.vendors[1].total_minor);
  expect(new Set(result.mixed!.assignments.map((a) => a.quote_id))).toEqual(
    new Set([b.id]),
  );
});
it('pack overbuy, line tax rounding and stock checks use exact integer arithmetic', () => {
  const req = [
      {
        line_id: 'line',
        description: 'Panel',
        specification: 'Panel',
        sku: 'X',
        quantity_milli: 2500,
        unit: 'each',
      },
    ],
    q = quote(req, { tax_bps: 825, shipping_minor: 900 });
  q.lines[0].pack_quantity_milli = 2000;
  q.lines[0].pack_price_minor = 101;
  const e = quoteExtension(req[0], q);
  expect(e.packs).toBe(2);
  expect(e.overbuy_milli).toBe(1500);
  expect(e.goods_minor).toBe(202);
  expect(e.tax_minor).toBe(17);
  expect(compareSuppliers(req, [q], 'USD').mixed?.total_minor).toBe(1119);
  q.lines[0].available_packs = 1;
  expect(quoteExtension(req[0], q).reason).toBe('Unavailable quantity');
});
it('unknown costs, unavailable quantities, expired quotes and substitutions cannot win a comparison', () => {
  const req = [
      {
        line_id: 'x',
        description: 'Panel',
        specification: 'Panel',
        sku: 'A',
        quantity_milli: 1000,
        unit: 'each',
      },
    ],
    q = quote(req);
  for (const patch of [
    { shipping_minor: null },
    { tax_bps: null },
    { expires_at: '2020-01-01T00:00:00Z' },
  ])
    expect(compareSuppliers(req, [{ ...q, ...patch }], 'USD').mixed).toBeNull();
  q.lines[0].specification = 'Different grade';
  expect(quoteExtension(req[0], q).reason).toContain('Substitution');
  q.lines[0].equivalent_approved = true;
  expect(quoteExtension(req[0], q).reason).toBeNull();
  q.lines[0].available_packs = null;
  expect(quoteExtension(req[0], q).reason).toBe('Availability unknown');
});
it('rejects fifth suppliers, currency conflicts and duplicate supplier or line identities', async () => {
  const r = await fixture(),
    req = requirementsFromLines(r.read(org).bundle.version.payload.lines),
    q = quote(req);
  expect(() =>
    compareSuppliers(
      req,
      Array.from({ length: 5 }, () => quote(req)),
      'USD',
    ),
  ).toThrow();
  expect(() => compareSuppliers(req, [q, q], 'USD')).toThrow();
  expect(() =>
    compareSuppliers(req, [{ ...q, currency: 'EUR' }], 'USD'),
  ).toThrow();
  expect(() =>
    compareSuppliers(req, [{ ...q, lines: [q.lines[0], q.lines[0]] }], 'USD'),
  ).toThrow();
});
it('procurement costs only update a reviewed draft and preserve the issued original', async () => {
  const r = await fixture(),
    s = r.read(org),
    req = requirementsFromLines(s.bundle.version.payload.lines),
    q = quote(req),
    original = structuredClone(s.bundle);
  await r.applyCosts(
    org,
    [q],
    req.map((x) => ({ line_id: x.line_id, quote_id: q.id })),
  );
  expect(
    (await r.estimates.get(org, s.bundle.estimate.id, s.bundle.version.id))
      .version,
  ).toEqual(original.version);
  expect(
    (await r.estimates.get(org, s.bundle.estimate.id)).version.status,
  ).toBe('draft');
  expect(() =>
    draftCostLines(
      s.bundle.version.payload.lines,
      req,
      [q],
      [{ line_id: req[0].line_id, quote_id: 'foreign' }],
    ),
  ).toThrow();
});
it('purchase flags distinguish unplanned, quantity variance, price increases, credits and duplicates', async () => {
  const r = await fixture(),
    j = (await r.estimates.jobs(org))[0],
    e = j.expenses.find((e) => e.kind === 'payment')!;
  e.estimate_line_id = j.baseline.lines[0].id;
  e.unit = j.baseline.lines[0].unit;
  e.quantity_milli = j.baseline.lines[0].quantity_milli + 1000;
  e.unit_cost_minor = j.baseline.lines[0].unit_cost_minor + 1;
  expect(unbilledRows(j)[0].flags).toEqual(
    expect.arrayContaining([
      'Cumulative quantity exceeds original scope',
      'Supplier price increase',
    ]),
  );
  const duplicate = {
    ...e,
    id: crypto.randomUUID(),
    reference: 'Other receipt',
  };
  j.expenses.push(duplicate);
  j.events.push({
    ...j.events[0],
    id: crypto.randomUUID(),
    submission_id: duplicate.id,
  });
  expect(unbilledRows(j)[0].overlap).toBe(true);
  expect(() =>
    prepareMaterialDecision(j, e.id, {
      disposition: 'proposed',
      reason: 'Review',
      scope_line_id: null,
      pricing: { mode: 'fixed', value: 100 },
      presentation: 'itemized',
      description: 'Additional',
    }),
  ).toThrow();
});
it('linked credit lowers supplemental price; unapproved expenses and unauthorized scope are excluded', async () => {
  const r = await fixture(),
    j = (await r.estimates.jobs(org))[0],
    e = j.expenses.find((e) => e.kind === 'payment')!;
  const c = {
    ...e,
    id: crypto.randomUUID(),
    kind: 'credit' as const,
    amount_minor: 1000,
    adjusts_expense_id: e.id,
  };
  j.expenses.push(c);
  j.events.push({
    ...j.events[0],
    id: crypto.randomUUID(),
    submission_id: c.id,
  });
  const input = {
    disposition: 'proposed' as const,
    reason: 'Review approved scope and returns',
    scope_line_id: null,
    pricing: { mode: 'fixed' as const, value: 100 },
    presentation: 'package' as const,
    description: 'Reviewed extra materials',
  };
  expect(prepareMaterialDecision(j, e.id, input).selling_minor).toBe(
    e.amount_minor - 900,
  );
  expect(() =>
    prepareMaterialDecision(j, e.id, {
      ...input,
      disposition: 'included',
      scope_line_id: 'foreign',
    }),
  ).toThrow();
  j.events = [];
  expect(unbilledRows(j)).toEqual([]);
});
it('concurrent material decisions create one proposed change, without increasing authorized revenue', async () => {
  const r = await fixture(),
    j = (await r.estimates.jobs(org))[0],
    e = j.expenses.find((e) => e.kind === 'payment')!,
    before = jobFinancials(j);
  const input = {
    disposition: 'proposed' as const,
    reason: 'Review original scope and approved purchases',
    scope_line_id: null,
    pricing: { mode: 'percent' as const, value: 2000 },
    presentation: 'package' as const,
    description: 'Supplemental scope subject to consent',
  };
  const result = await Promise.allSettled([
    r.decide(org, j.id, e.id, 0, input),
    r.decide(org, j.id, e.id, 0, input),
  ]);
  expect(result.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(result.filter((x) => x.status === 'rejected')).toHaveLength(1);
  const after = (await r.estimates.jobs(org))[0];
  expect(after.changes.length).toBe(j.changes.length + 1);
  expect(jobFinancials(after).revised_revenue_minor).toBe(
    before.revised_revenue_minor,
  );
  expect(jobFinancials(after).categories.map((x) => x.paid_minor)).toEqual(
    before.categories.map((x) => x.paid_minor),
  );
});
it('customer projection is empty until explicitly published and never returns drafts or private costs', async () => {
  const r = await fixture(),
    s = r.read(org),
    customer = s.plans[0].customer_id;
  expect(r.portal(org, customer).estimates).toEqual([]);
  await r.demonstrateFinancials(org);
  const p = r.portal(org, customer);
  expect(p.invoices).toHaveLength(1);
  for (const key of [
    'unit_cost_minor',
    'internal_note',
    'markup_bps',
    'SECRET',
  ])
    expect(JSON.stringify(p)).not.toContain(key);
  expect(() => r.portal(org, 'another customer')).toThrow();
  expect(() => r.portal('another company', customer)).toThrow();
  await expect(
    new PropertyRepository(new Operations(false)).initialize(company),
  ).rejects.toThrow('disabled');
});
const media: MediaManifest = {
  organizationId: org,
  visitId: 'visit',
  filename: 'drone.mp4',
  mime: 'video/mp4',
  bytes: 1000,
  sha256: 'a'.repeat(64),
  kind: 'drone_video',
  phase: 'after',
  visibility: 'customer',
};
it('customer media intent confers no read or playback permission; all ingestion remains disabled', async () => {
  expect(validateMediaManifest(media, { daily: 0, stored: 0 })).toMatchObject({
    status: 'quarantined',
    staffAccess: false,
    customerAccess: false,
  });
  await expect(ingestPropertyMedia()).rejects.toThrow('503');
  await expect(issuePropertyPlayback()).rejects.toThrow('503');
  expect(mediaPolicy.ingestionEnabled).toBe(false);
});
it.each([
  { filename: '../file.mp4' },
  { mime: 'image/jpeg' },
  { bytes: mediaPolicy.videoBytes + 1 },
  { sha256: 'not a hash' },
  { filename: 'bad\nfile.mp4' },
])('media metadata rejects corrupt or conflicting manifest %j', (patch) => {
  expect(() =>
    validateMediaManifest({ ...media, ...patch }, { daily: 0, stored: 0 }),
  ).toThrow();
});
it('media quotas and image limits fail closed without uploading bytes', () => {
  expect(() =>
    validateMediaManifest(media, { daily: mediaPolicy.dailyBytes, stored: 0 }),
  ).toThrow('quota');
  expect(() =>
    validateMediaManifest(media, { daily: 0, stored: mediaPolicy.storedBytes }),
  ).toThrow('quota');
  expect(() =>
    validateMediaManifest(
      {
        ...media,
        kind: 'photo',
        mime: 'image/png',
        bytes: mediaPolicy.imageBytes + 1,
      },
      { daily: 0, stored: 0 },
    ),
  ).toThrow();
});
it('inspection plan creation uses actual CRM locations and preserves tenant context and CAS', async () => {
  const r = await fixture(),
    c = (await r.operations.listCustomers(org)).rows[0];
  await r.operations.saveLocation(org, c.id, {
    address_line1: '200 Synthetic Second Property',
    address_line2: '',
    city: 'Example City',
    region: 'FL',
    postal_code: '00000',
    country_code: 'US',
  });
  await r.refreshContexts(org);
  const s = r.read(org),
    ctx = s.contexts.find(
      (x) => x.location_label === '200 Synthetic Second Property',
    )!;
  expect(ctx).toBeDefined();
  const p = r.createPlan(org, ctx, 'Initial damage survey');
  const v = r.addVisit(org, p.id, '2026-11-01');
  expect(v.plan_id).toBe(p.id);
  expect(v.organization_id).toBe(org);
  r.savePlan(org, { ...p, cadence: 'weekly' });
  expect(() => r.savePlan(org, p)).toThrow();
  expect(() =>
    r.createPlan(org, { ...ctx, customer_id: 'foreign' }, 'Forged'),
  ).toThrow();
});
it('parallel preview initialization produces exactly one plan and one original visit', async () => {
  const r = new PropertyRepository(new Operations(true));
  await Promise.all([r.initialize(company), r.initialize(company)]);
  expect(r.read(org).plans).toHaveLength(1);
  expect(r.read(org).visits).toHaveLength(1);
});
it('NMI is preferred without activating either provider or changing independent token custody', async () => {
  const { sandboxReadinessPlan } =
    await import('../server/providers/activation-plan');
  const { supplierConnectors } =
    await import('../server/property/supplier-connectors');
  const p = sandboxReadinessPlan();
  expect(p.preferredGateway).toBe('nmi');
  expect(p.optionalGateways).toEqual(['authorize_net']);
  expect(p.providerCalls).toBe(0);
  expect(p.hostedWrites).toBe(0);
  for (const c of supplierConnectors) {
    expect(c.enabled).toBe(false);
    await expect(c.fetchApprovedQuote()).rejects.toThrow('503');
  }
});
it('repair recommendation creates one existing draft scope line without mutating its issued source', async () => {
  const r = await fixture(),
    s = r.read(org),
    v = s.visits[0],
    f = v.content.findings[0];
  const b = await r.findingEstimate(org, v.id, f.id);
  expect(
    b.version.payload.lines.some((l) => l.internal_note.includes(f.id)),
  ).toBe(true);
  expect(b.version.status).toBe('draft');
  await expect(r.findingEstimate(org, v.id, f.id)).rejects.toThrow(
    'already drafted',
  );
  expect(
    (await r.estimates.get(org, s.bundle.estimate.id, s.bundle.version.id))
      .version,
  ).toEqual(s.bundle.version);
});
it('repository cost writes reject foreign currencies and unknown assignments before changing any draft', async () => {
  const r = await fixture(),
    s = r.read(org),
    req = requirementsFromLines(s.bundle.version.payload.lines),
    q = quote(req),
    before = await r.estimates.get(org, s.bundle.estimate.id);
  expect(() => r.saveQuotes(org, [{ ...q, currency: 'EUR' }])).toThrow(
    'currency',
  );
  await expect(
    r.applyCosts(
      org,
      [{ ...q, currency: 'EUR' }],
      [{ line_id: req[0].line_id, quote_id: q.id }],
    ),
  ).rejects.toThrow('currency');
  await expect(
    r.applyCosts(
      org,
      [q],
      [{ line_id: 'another property material', quote_id: q.id }],
    ),
  ).rejects.toThrow('Unknown');
  expect(await r.estimates.get(org, s.bundle.estimate.id)).toEqual(before);
  expect(r.read(org).quotes).toHaveLength(0);
});
