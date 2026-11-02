import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { calculateEstimate } from '../src/domain/estimating/calculation';
import { documentHash } from '../src/domain/release/preview';
import { prepareLocalJourney } from '../src/lib/workflows/journey-runtime';
import {
  readJobReview,
  inspectJobReview,
  type JobReviewSelection,
} from '../src/lib/workflows/job-review';
import { JobReview } from '../src/components/workflows/JobReview';
import { prototypeFixture } from './program/prototype-fixture';

afterEach(() => vi.restoreAllMocks());
async function fixture(knownLabor = false, catalogBinding = false) {
  const f = await prototypeFixture();
  let bundle = f.bundle;
  const line = bundle.version.payload.lines.find((l) =>
    ['material', 'product'].includes(l.kind),
  )!;
  if (catalogBinding) {
    const catalog = (await f.repo.catalog(f.company.id)).find(
      (c) => c.kind === line.kind && c.unit === line.unit,
    )!;
    bundle = await f.repo.save(f.company.id, bundle, {
      ...bundle.version.payload,
      lines: bundle.version.payload.lines.map((l) =>
        l.id === line.id ? { ...l, catalog_item_id: catalog.id } : l,
      ),
    });
  }
  bundle = await f.repo.issue(f.company.id, bundle);
  const jobId = await f.repo.approveJob(f.company.id, bundle);
  if (knownLabor)
    await f.repo.payroll(
      f.company.id,
      '2026-01-01T00:00:00Z',
      '2026-01-02T00:00:00Z',
      {},
      true,
    );
  const worker = (await f.repo.workforce(f.company.id)).workers.find(
    (w) => w.user_id === `${f.company.id}-field`,
  )!;
  await f.repo.assignJob(f.company.id, jobId, worker.user_id!, true, {
    reviewer: f.target.actor_id,
    job_revision: f.repo.syntheticJob(f.company.id, jobId)!.lock_revision,
    issued_version_id: bundle.version.id,
    expected_active: null,
    assertCurrent: () => {},
  });
  const target = { ...f.target, version_id: bundle.version.id, job_id: jobId };
  const selectedLine = bundle.version.payload.lines.find(
    (l) => l.id === line.id,
  )!;
  const input: JobReviewSelection = {
    finance: {
      job_revision: f.repo.syntheticJob(f.company.id, jobId)!.lock_revision,
      currency: bundle.version.calculation.currency,
      release: null,
      accounting_aliases: null,
      procurement: null,
    },
    time: {
      workerId: worker.id,
      startedAt: '2026-12-08T09:00:00-06:00',
      endedAt: '2026-12-08T10:00:00-06:00',
      task: 'Human-entered unsaved review',
      allocation: 'job',
      overheadCenter: null,
    },
    material: {
      line_id: selectedLine.id,
      quantity_milli: 1250,
      unit_cost_minor: 1001,
      catalog_item_id: selectedLine.catalog_item_id,
    },
    input_revision: 1,
  };
  return {
    ...f,
    bundle,
    target,
    worker,
    jobId,
    selectedLine,
    input,
    read: () => readJobReview(f.repo, target, input, f.gate),
  };
}
describe('Cycle 7 existing-source job review', () => {
  it.each([0, 1, 2])(
    'reviews the actual prepared journey of company %i without writers or invented invoice',
    async (index) => {
      const gate = { enabled: true, confirmed: true },
        j = await prepareLocalJourney(sampleCompanies[index], gate);
      const original = j.estimates.readSyntheticPrototypeSources(j.target);
      const line = original.bundle.version.payload.lines.find(
        (l) =>
          ['material', 'product'].includes(l.kind) &&
          original.bundle.version.calculation.lines.some(
            (c) => c.id === l.id && c.included,
          ),
      )!;
      const before = JSON.stringify(original),
        releaseBefore = j.release.read('staff');
      const writers = [
        vi.spyOn(j.estimates, 'recordTime'),
        vi.spyOn(j.estimates, 'submitExpense'),
        vi.spyOn(j.estimates, 'payroll'),
        vi.spyOn(j.estimates, 'projection'),
        vi.spyOn(j.estimates, 'issue'),
        vi.spyOn(j.release, 'command'),
      ];
      const result = await readJobReview(
        j.estimates,
        j.target,
        {
          finance: {
            job_revision: original.job!.lock_revision,
            currency: original.bundle.version.calculation.currency,
            release: {
              preview: j.release,
              offer_id: j.offer_id,
              decision_id: j.receipt_id,
              contract_id: null,
              signature_id: null,
              invoice_id: null,
              as_of: new Date().toISOString(),
            },
            accounting_aliases: null,
            procurement: null,
          },
          material: {
            line_id: line.id,
            quantity_milli: 2500,
            unit_cost_minor: 1234,
            catalog_item_id: line.catalog_item_id,
          },
          time: {
            workerId: j.worker_id,
            startedAt: '2026-12-08T09:00:00-06:00',
            endedAt: '2026-12-08T10:00:00-06:00',
            task: 'Owner-selected synthetic inspection time',
            allocation: 'job',
            overheadCenter: null,
          },
          input_revision: 4,
        },
        gate,
      );
      expect(result.target).toEqual(j.target);
      expect(result.recorded.costReview.status).toBe('UNKNOWN');
      expect(result.proposed.time).toMatchObject({
        validation: 'VALID_AGAINST_CAPTURED_ENTRIES',
        monetaryAllocation: null,
        currentWorkerAndTimeCoverage: 'UNKNOWN',
        posting: 'UNSAVED_NOT_POSTED',
      });
      expect(result.proposed.material?.proposedCostMinor).toBe(3085);
      expect(result.invoiceRequirements.scope.totals.total_minor).toBe(
        j.issued.version.calculation.total_minor,
      );
      expect(result.invoiceRequirements.reference.decision_id).toBe(
        j.receipt_id,
      );
      expect(result.invoiceRequirements.reference.invoice_id).toBeNull();
      expect(result.financialExport.status).toBe('UNKNOWN');
      expect(Object.values(result.authority).every((v) => v === false)).toBe(
        true,
      );
      expect(
        JSON.stringify(j.estimates.readSyntheticPrototypeSources(j.target)),
      ).toBe(before);
      expect(j.release.read('staff')).toEqual(releaseBefore);
      writers.forEach((writer) => expect(writer).not.toHaveBeenCalled());
      expect(await inspectJobReview(result)).toEqual({
        status: 'CURRENT_LOCAL_SOURCE',
        replacement: null,
      });
    },
  );
  it('uses canonical integer rounding without changing customer totals or projected margin', async () => {
    const f = await fixture(true),
      before = structuredClone(f.bundle);
    const result = await f.read();
    const payload = structuredClone(f.bundle.version.payload);
    payload.lines = payload.lines.map((l) =>
      l.id === f.selectedLine.id
        ? {
            ...l,
            quantity_milli: 1250,
            unit_cost_minor: 1001,
            unit_price_minor: f.bundle.version.calculation.lines.find(
              (c) => c.id === l.id,
            )!.unit_price_minor,
          }
        : l,
    );
    expect(result.proposed.material?.proposedCostMinor).toBe(
      calculateEstimate(
        payload,
        f.bundle.version.tax_policy_snapshot?.rate_bps,
      ).lines.find((l) => l.id === f.selectedLine.id)!.cost_minor,
    );
    expect(result.proposed.material?.proposedCostMinor).toBe(1251);
    expect(result.invoiceRequirements.scope.totals.total_minor).toBe(
      before.version.calculation.total_minor,
    );
    expect(result.recorded.costReview.completion.totals?.projectedMinor).toBe(
      result.report.snapshot.recorded.totals?.projectedMinor,
    );
    expect(
      await f.repo.history(f.company.id, f.target.estimate_id),
    ).toContainEqual(before.version);
  });
  it('keeps missing catalog provenance UNKNOWN and does not guess by description', async () => {
    const f = await fixture(),
      r = await f.read();
    expect(r.proposed.material?.catalogAssociation).toBe(
      'UNKNOWN_NO_RECORDED_SCOPE_CATALOG_ASSOCIATION',
    );
    expect(r.proposed.material?.procurementReview).toBeNull();
  });
  it('composes actual exact catalog procurement review without ordering', async () => {
    const f = await fixture(false, true),
      r = await f.read();
    expect(r.proposed.material?.catalogAssociation).toBe('RECORDED_EXACT');
    expect(
      r.proposed.material?.procurementReview?.snapshot.selections[0]
        .catalog_item_id,
    ).toBe(f.selectedLine.catalog_item_id);
    expect(
      r.proposed.material?.procurementReview?.snapshot.authority.order,
    ).toBe(false);
  });
  it('permits source-only review and empty proposals without treating absence as zero', async () => {
    const f = await fixture();
    f.input.material = null;
    f.input.time = null;
    const r = await f.read();
    expect(r.proposed).toEqual({ time: null, material: null });
    expect(r.recorded.costReview.completion.totals).toBeNull();
    expect(r.invoiceRequirements.overall).toBe('NO_GO');
  });
  it('separates overhead proposal from approved policy and monetary allocation', async () => {
    const f = await fixture();
    f.input.time!.allocation = 'overhead';
    f.input.time!.overheadCenter = 'Human proposed unapproved training';
    expect((await f.read()).proposed.time).toMatchObject({
      jobId: null,
      approvedOverheadCenter: 'UNVERIFIED',
      monetaryAllocation: null,
    });
  });
  it('rejects object allocation without invoking caller coercion or inventing an overhead review', async () => {
    const f = await fixture(),
      coercion = vi.fn(() => 'job');
    Object.assign(f.input.time!, {
      allocation: { toString: coercion },
      overheadCenter: 'synthetic-overhead',
    });
    const read = vi.spyOn(f.repo, 'readSyntheticPrototypeSources');
    await expect(f.read()).rejects.toThrow();
    expect(coercion).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
  it.each([
    'organization_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ] as const)('denies incorrect %s identity', async (key) => {
    const f = await fixture();
    f.target[key] = crypto.randomUUID();
    await expect(f.read()).rejects.toThrow();
  });
  it.each(['foreign', 'inactive', 'staff'] as const)(
    'denies %s reviewer',
    async (kind) => {
      const f = await fixture();
      if (kind === 'foreign')
        f.target.actor_id = `${sampleCompanies[1].id}-owner`;
      else if (kind === 'staff') f.target.actor_id = `${f.company.id}-field`;
      else {
        f.target.actor_id = `${f.company.id}-estimator`;
        await f.ops.manageMember(
          f.company.id,
          f.target.actor_id,
          false,
          'admin',
          'office_manager',
        );
      }
      await expect(f.read()).rejects.toThrow();
    },
  );
  it.each(['off', 'unconfirmed', 'accessor'] as const)(
    'denies %s admission before reads',
    async (kind) => {
      const f = await fixture(),
        read = vi.spyOn(f.repo, 'readSyntheticPrototypeSources');
      const gate =
        kind === 'accessor'
          ? {
              enabled: true,
              get confirmed(): boolean {
                throw Error('Getter executed');
              },
            }
          : { enabled: kind !== 'off', confirmed: kind !== 'unconfirmed' };
      await expect(
        readJobReview(f.repo, f.target, f.input, gate),
      ).rejects.toThrow();
      expect(read).not.toHaveBeenCalled();
    },
  );
  it.each([
    'currency',
    'revision',
    'foreign_worker',
    'unassigned',
    'wrong_line',
    'catalog',
    'zero_quantity',
    'fractional_cost',
    'no_offset',
    'overlong',
  ] as const)('blocks invalid %s input', async (kind) => {
    const f = await fixture();
    if (kind === 'currency') f.input.finance.currency = 'JPY';
    if (kind === 'revision') f.input.finance.job_revision++;
    if (kind === 'foreign_worker') f.input.time!.workerId = crypto.randomUUID();
    if (kind === 'unassigned') {
      await f.repo.assignJob(f.company.id, f.jobId, f.worker.user_id!, false, {
        reviewer: f.target.actor_id,
        job_revision: f.repo.syntheticJob(f.company.id, f.jobId)!.lock_revision,
        issued_version_id: f.bundle.version.id,
        expected_active: true,
        assertCurrent: () => {},
      });
      f.input.finance.job_revision = f.repo.syntheticJob(
        f.company.id,
        f.jobId,
      )!.lock_revision;
    }
    if (kind === 'wrong_line') f.input.material!.line_id = crypto.randomUUID();
    if (kind === 'catalog')
      f.input.material!.catalog_item_id = (
        await f.repo.catalog(f.company.id)
      )[0].id;
    if (kind === 'zero_quantity') f.input.material!.quantity_milli = 0;
    if (kind === 'fractional_cost') f.input.material!.unit_cost_minor = 1.1;
    if (kind === 'no_offset') f.input.time!.startedAt = '2026-12-08T09:00:00';
    if (kind === 'overlong')
      f.input.time!.endedAt = '2026-12-09T10:00:00-06:00';
    await expect(f.read()).rejects.toThrow();
  });
  it('uses all actual worker time for overlap checks, including another job allocation', async () => {
    const f = await fixture();
    await f.repo.recordTime(f.company.id, f.worker.id, {
      job_id: null,
      overhead_center: 'Training',
      task: 'Actual source test entry',
      kind: 'work',
      started_at: '2026-12-08T08:30:00-06:00',
      ended_at: '2026-12-08T09:30:00-06:00',
      billable: false,
      corrects_id: null,
    });
    await expect(f.read()).rejects.toThrow('Overlapping time entries');
  });
  it('rejects live input edits during a real hash wait and retains the source unchanged', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const out = await digest(...args);
      if (!changed) {
        changed = true;
        f.input.material!.unit_cost_minor++;
      }
      return out;
    });
    await expect(f.read()).rejects.toThrow();
  });
  it('rejects original target edits during an await instead of binding a copied target', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const out = await digest(...args);
      if (!changed) {
        changed = true;
        f.target.location_id = crypto.randomUUID();
      }
      return out;
    });
    await expect(f.read()).rejects.toThrow();
  });
  it('rejects confirmation withdrawal across an actual workforce await', async () => {
    const f = await fixture(),
      workforce = f.repo.workforce.bind(f.repo);
    vi.spyOn(f.repo, 'workforce').mockImplementation(async (org) => {
      const rows = await workforce(org);
      f.gate.confirmed = false;
      return rows;
    });
    await expect(f.read()).rejects.toThrow();
  });
  it('denies actual administrator revocation during the final digest rather than returning amounts', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    f.target.actor_id = `${f.company.id}-estimator`;
    await f.ops.manageMember(
      f.company.id,
      f.target.actor_id,
      true,
      'admin',
      'office_manager',
    );
    const r = await f.read();
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args);
      await f.ops.manageMember(
        f.company.id,
        f.target.actor_id,
        false,
        'admin',
        'office_manager',
      );
      return value;
    });
    expect(await inspectJobReview(r)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
  });
  it('freezes allowlisted reference JSON; customer-safe scope excludes every private proposal', async () => {
    const f = await fixture(),
      r = await f.read();
    expect(Object.isFrozen(r.report.snapshot)).toBe(true);
    expect(await documentHash(r.report.snapshot)).toBe(r.report.sha256);
    expect(JSON.parse(r.report.jsonPreview)).toEqual(r.report.snapshot);
    expect(JSON.stringify(r.invoiceRequirements.scope)).not.toMatch(
      /unit_cost|internal_note|PRIVATE|workerId|payroll|rate_minor/,
    );
    expect(r.report.jsonPreview).not.toMatch(
      /PRIVATE|supplier|internal_note|rates|deductions|Human-entered/,
    );
    expect(r.report.snapshot.authority.ledger).toBe(false);
    const serializer = vi.fn();
    Object.assign(f.input.finance, { currency: { toJSON: serializer } });
    await expect(f.read()).rejects.toThrow();
    expect(serializer).not.toHaveBeenCalled();
  });
  it('reconciles only exact retained evidence, with copied and withdrawn input UNKNOWN', async () => {
    const f = await fixture(),
      r = await f.read();
    expect(await inspectJobReview(structuredClone(r))).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    f.input.input_revision++;
    expect(await inspectJobReview(r)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(r.proposed.material?.proposedCostMinor).toBe(1251);
  });
  it('marks actual subsequent job edits STALE without changing the frozen packet', async () => {
    const f = await fixture(),
      r = await f.read(),
      hash = r.report.sha256;
    await f.repo.submitExpense(f.company.id, f.jobId, {
      purchase_key: crypto.randomUUID(),
      supplier: 'Private subsequent source',
      reference: 'source-edit',
      category: 'materials',
      kind: 'commitment',
      amount_minor: 100,
      description: 'Subsequent explicit fixture',
      estimate_line_id: null,
      quantity_milli: null,
      unit: null,
      unit_cost_minor: null,
      document_ids: [],
      material_approval_id: null,
    });
    expect(await inspectJobReview(r)).toEqual({
      status: 'STALE',
      replacement: null,
    });
    expect(r.report.sha256).toBe(hash);
  });
  it('does not return drift evidence after verification-time access withdrawal', async () => {
    const f = await fixture(),
      r = await f.read(),
      workforce = f.repo.workforce.bind(f.repo);
    vi.spyOn(f.repo, 'workforce').mockImplementation(async (org) => {
      const rows = await workforce(org);
      f.gate.confirmed = false;
      rows.entries = [];
      return rows;
    });
    expect(await inspectJobReview(r)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
  });
  it('defaults the actual panel OFF and renders explicit accessible unsaved controls when admitted', async () => {
    const j = await prepareLocalJourney(sampleCompanies[0], {
      enabled: true,
      confirmed: true,
    });
    const off = renderToStaticMarkup(createElement(JobReview, { sources: j }));
    expect(off).not.toContain('Unsaved staff proposals');
    expect(off).not.toContain('<form');
    const on = renderToStaticMarkup(
      createElement(JobReview, { sources: j, enabled: true }),
    );
    expect(on).toContain('aria-label="Unsaved staff proposals"');
    expect(on).toContain('Material cost proposal');
    expect(on).toContain('Time capture proposal');
    expect(on).toContain('No review prepared');
    expect(on).toContain('Review recorded vs proposed');
    expect(on).not.toMatch(/PRIVATE|supplier|rates|deductions/);
  });
});
