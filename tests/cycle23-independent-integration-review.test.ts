import { readFileSync } from 'node:fs';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import type { OperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readTaskRevisionConsistency,
  inspectTaskRevisionConsistency,
  selectTaskRevisionLineage,
  taskRevisionDestination,
  analyzeTaskRevisionGraph,
} from '../src/lib/workflows/task-revision-consistency';
import {
  readRecordedCostRequirements,
  assertRecordedCostRequirementsCurrent,
  inspectRecordedCostCategory,
  inspectRecordedCostSource,
  continueRecordedCostSource,
} from '../src/lib/workflows/recorded-cost-requirements';
import {
  readServiceSourceReview,
  assertServiceSourceReview,
  readServiceSourceLineage,
  inspectServiceSourceReport,
  reconcileServiceSourceReview,
} from '../src/lib/workflows/service-source-review';
import {
  readMaintenanceRevisionRequirements,
  inspectMaintenanceRevisionRequirements,
  selectMaintenanceRevisionRequirements,
  compareMaintenanceOccurrenceContinuity,
} from '../src/lib/workflows/maintenance-revision-requirements';
import {
  readVerifiedOwnerBriefing,
  assertVerifiedOwnerBriefingCurrent,
  compareVerifiedOwnerBriefing,
  inspectVerifiedOwnerDifference,
  inspectVerifiedOwnerPriority,
  continueVerifiedOwnerPriority,
} from '../src/lib/workflows/verified-owner-briefing';
import {
  readTaskCorrectionReview,
  saveTaskCorrectionReview,
} from '../src/lib/workflows/task-correction-review';
import {
  readMaintenancePlanCorrectionReview,
  saveMaintenancePlanCorrectionReview,
} from '../src/lib/workflows/maintenance-plan-correction';
import { confirmCostCorrectionReview } from '../src/lib/workflows/cost-correction-review';
import {
  readSavedSourceExercise,
  executeSavedSourceExercise,
} from '../src/lib/workflows/saved-revision-exercise';
import { recordedOwnerActionCards } from '../src/lib/workflows/recorded-owner-actions';
import { TaskRevisionConsistency } from '../src/components/workflows/TaskRevisionConsistency';
import { RecordedCostRequirements } from '../src/components/workflows/RecordedCostRequirements';
import { ServiceSourceReview } from '../src/components/workflows/ServiceSourceReview';
import { MaintenanceRevisionRequirements } from '../src/components/workflows/MaintenanceRevisionRequirements';
import { VerifiedOwnerBriefing } from '../src/components/workflows/VerifiedOwnerBriefing';
import { cycle23ConsistencyGroups } from '../src/components/workflows/OperatingCenterCycleTwentyThree';
import { cycle22RequirementGroups } from '../src/components/workflows/OperatingCenterCycleTwentyTwo';
import { OperatingCenterCycleFifteen } from '../src/components/workflows/OperatingCenterCycleFifteen';
import {
  SavedRevisionWorkbench,
  type SavedWorkbenchPanels,
} from '../src/components/workflows/SavedRevisionWorkbench';

// Independent integration cases use one original preparer and repository set per
// case. No replacement engine, fixture preparer, financial command or SQL exists.
beforeEach(() => {
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true };
  const all = await prepareCorrectionPreviewSources(
    sampleCompanies[brand],
    gate,
  );
  const entry = all.entries[2];
  // Select the one native job under review without copying any business record.
  // The two relationship-adversarial cases explicitly use the full four-job root.
  const sources: OperatingSources = { ...all, entries: [entry] };
  return {
    all,
    sources,
    gate,
    entry,
    org: sources.company.id,
    job: entry.target.job_id!,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const readers = {
  field: (f: Fixture) => readTaskRevisionConsistency(f.sources, f.job, f.gate),
  finance: (f: Fixture) =>
    readRecordedCostRequirements(f.sources, f.job, f.gate),
  customer: (f: Fixture) =>
    readServiceSourceReview(
      f.sources,
      { job_id: f.job, staff_context_confirmed: true },
      f.gate,
    ),
  growth: (f: Fixture) =>
    readMaintenanceRevisionRequirements(f.sources, f.job, f.gate),
  intelligence: (f: Fixture) =>
    readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
};
async function combined(f: Fixture) {
  const [field, finance, customer, growth, intelligence] = await Promise.all([
    readers.field(f),
    readers.finance(f),
    readers.customer(f),
    readers.growth(f),
    readers.intelligence(f),
  ]);
  return { field, finance, customer, growth, intelligence };
}
type Combined = Awaited<ReturnType<typeof combined>>;
function checks(c: Combined) {
  return [
    () => inspectTaskRevisionConsistency(c.field),
    () => assertRecordedCostRequirementsCurrent(c.finance),
    () => assertServiceSourceReview(c.customer),
    () => inspectMaintenanceRevisionRequirements(c.growth),
    () => assertVerifiedOwnerBriefingCurrent(c.intelligence),
  ];
}
function plainState(f: Fixture) {
  return JSON.stringify({
    business: f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    property: f.sources.property.read(f.org),
    release: f.entry.release.read('staff'),
  });
}
async function taskEdit(f: Fixture) {
  const review = await readTaskCorrectionReview(f.sources, f.job, f.gate);
  const input = {
    source_entry_id: review.source.source_entry_id!,
    task: 'Independent explicit native correction <untrusted text>',
    started_at: review.source.started_at!,
    ended_at: review.source.ended_at!,
    billable: !review.source.billable,
  };
  return { review, input };
}
async function planEdit(f: Fixture) {
  const review = await readMaintenancePlanCorrectionReview(
    f.sources,
    f.job,
    f.gate,
  );
  const input = {
    plan_id: review.source.plan_id,
    revision: review.source.revision,
    name: 'Independent current native plan',
    cadence: 'custom' as const,
    interval_days: 11,
  };
  return { review, input };
}
function safeProjection(value: unknown) {
  if (Array.isArray(value)) value.forEach(safeProjection);
  else if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) {
      expect(key).not.toMatch(
        /^(actor_id|user_id|worker_id|employee_id|assigned_to|internal_notes|private.*|cost.*|margin.*|rate.*|wage.*|payroll.*|deduction.*)$/i,
      );
      safeProjection(child);
    }
}

describe('Cycle23 independent frozen-runtime cross-module review', () => {
  it.each([0, 1, 2])(
    'I01 brand %i all five readers bind one original exact job without business writes',
    async (brand) => {
      const f = await fixture(brand);
      const before = plainState(f);
      const network = vi.spyOn(globalThis, 'fetch');
      const c = await combined(f);
      const lineage = readServiceSourceLineage(c.customer);
      for (const identity of [
        c.field.identity,
        c.finance.original.original.costs.identity,
        c.growth.identity,
        c.intelligence.original.original.snapshot.identity,
      ])
        expect(identity).toMatchObject({
          organization_id: f.org,
          customer_id: f.entry.target.customer_id,
          location_id: f.entry.target.location_id,
          job_id: f.job,
          version_id: f.entry.target.version_id,
        });
      expect(lineage.scope.job_id).toBe(f.job);
      expect(lineage.scope.issued_version_id).toBe(f.entry.target.version_id);
      expect(c.field.evidence.work_order.source.job_revision).toBe(
        c.finance.original.original.costs.evidence.job_revision,
      );
      expect(c.field.evidence.dispatch).toBe(false);
      expect(c.finance.operational_ready).toBe(false);
      expect(c.growth.evidence.send).toBe(false);
      expect(c.intelligence.operational_ready).toBe(false);
      expect(plainState(f)).toBe(before);
      expect(network).not.toHaveBeenCalled();
    },
  );

  it.each([0, 1, 2])(
    'I02 brand %i one original task correction appears in Field and Finance without inventing labor cost',
    async (brand) => {
      const f = await fixture(brand);
      const before = await combined(f);
      const edit = await taskEdit(f);
      await saveTaskCorrectionReview(edit.review, edit.input, true);
      const current = await combined(f);
      expect(() => inspectTaskRevisionConsistency(before.field)).toThrow();
      expect(() =>
        assertRecordedCostRequirementsCurrent(before.finance),
      ).toThrow();
      const result = current.field.evidence.receipt.result_id!;
      const graph = selectTaskRevisionLineage(current.field, result);
      const labor = current.finance.labor.find((r) => r.entry_id === result)!;
      expect(graph.receipt_link).toBe('EXACT_RECEIPT_RESULT');
      expect(graph.nodes.map((r) => r.id)).toContain(
        edit.input.source_entry_id,
      );
      expect(labor.corrects_id).toBe(edit.input.source_entry_id);
      expect(labor.requirement).toBe('UNPOSTED_OR_UNVERIFIED_NOT_ZERO_COST');
      expect(current.finance.locked_period_ids).toEqual([]);
      expect(current.finance.labor.every((r) => !('amount_minor' in r))).toBe(
        true,
      );
      expect(graph.selected_winner).toBeNull();
      expect(current.field.evidence.graph.physical_completion).toBe(
        'UNVERIFIED',
      );
    },
  );

  it.each([0, 1, 2])(
    'I03 brand %i original material review changes canonical totals and exact event provenance but leaves invoice gates closed',
    async (brand) => {
      const f = await fixture(brand);
      const before = await combined(f);
      const id = before.finance.original.original.material.expense_id!;
      await confirmCostCorrectionReview(
        before.finance.original.original,
        {
          expense_id: id,
          decision: 'approved',
          reason: 'Independent native review.',
        },
        true,
      );
      expect(() =>
        assertRecordedCostRequirementsCurrent(before.finance),
      ).toThrow();
      expect(() =>
        assertVerifiedOwnerBriefingCurrent(before.intelligence),
      ).toThrow();
      const current = await combined(f);
      const actual = f.sources.estimates.syntheticJob(f.org, f.job)!;
      const totals = jobFinancials(actual);
      expect(current.finance.original.original.canonical).toEqual(totals);
      expect(
        inspectRecordedCostCategory(current.finance, 'materials')
          .projected_minor,
      ).toBe(
        totals.categories.find((r) => r.category === 'materials')!
          .projected_minor,
      );
      const event = actual.events.find((r) => r.submission_id === id)!;
      expect(event).toBeTruthy();
      const row = inspectRecordedCostSource(current.finance, {
        kind: 'material_review',
        id: event.id,
      });
      expect(row.references).toContain(id);
      expect(row.status).toBe(event.decision);
      expect(current.finance.invoice_overall).toBe('NO_GO');
      expect(current.finance.coverage).not.toBe('DECLARED_COSTS_COMPLETE');
      const comparison = compareVerifiedOwnerBriefing(
        before.intelligence,
        current.intelligence,
      );
      expect(
        comparison.rows.some(
          (r) => r.source.kind === 'finance' && r.status === 'CHANGED',
        ),
      ).toBe(true);
      expect(current.finance.invoices).toEqual(
        current.finance.detail.job.financial.invoices,
      );
      expect(current.finance.unlinked_events).toEqual(
        current.finance.detail.job.financial.unlinked_events,
      );
      expect(f.entry.release.read('staff').release_payment_events).toEqual([]);
    },
  );

  it.each([0, 1, 2])(
    'I04 brand %i native plan revision stales Field and Growth and does not relocate selected occurrence',
    async (brand) => {
      const f = await fixture(brand);
      const before = await combined(f);
      const old = before.growth.evidence.occurrences[0].id;
      const edit = await planEdit(f);
      await saveMaintenancePlanCorrectionReview(edit.review, edit.input, true);
      expect(() => inspectTaskRevisionConsistency(before.field)).toThrow();
      expect(() =>
        selectMaintenanceRevisionRequirements(before.growth, old),
      ).toThrow();
      const current = await combined(f);
      const continuity = compareMaintenanceOccurrenceContinuity(
        before.growth,
        current.growth,
        old,
      );
      expect(continuity.continuity).toBe('NOT_IN_CURRENT_REVIEW');
      expect(continuity.source_replaced).toBe(false);
      expect(continuity.completion).toBe('UNVERIFIED');
      expect(() =>
        selectMaintenanceRevisionRequirements(current.growth, old),
      ).toThrow();
      expect(current.field.evidence.work_order.plans).toContainEqual({
        id: edit.input.plan_id,
        revision: edit.input.revision + 1,
      });
      expect(current.growth.evidence.receipt.observed).toBe(
        'EXACT_RESULT_OBSERVED',
      );
      expect(current.growth.evidence.send).toBe(false);
    },
  );

  it.each([0, 1, 2])(
    'I05 brand %i appended published version preserves old bytes and exact customer report lineage without completion',
    async (brand) => {
      const f = await fixture(brand);
      const before = await combined(f);
      const reports = f.sources.property.read(f.org).reports;
      const oldLineage = readServiceSourceLineage(before.customer);
      const exercise = await readSavedSourceExercise(f.sources, f.job, f.gate);
      await executeSavedSourceExercise(exercise, 'report-revision', true);
      const current = await combined(f);
      expect(
        f.sources.property.read(f.org).reports.slice(0, reports.length),
      ).toEqual(reports);
      const lineage = readServiceSourceLineage(current.customer);
      const added = lineage.reports.filter(
        (r) =>
          !oldLineage.reports.some(
            (o) => JSON.stringify(o.reference) === JSON.stringify(r.reference),
          ),
      );
      expect(added).toHaveLength(1);
      const detail = await inspectServiceSourceReport(
        current.customer,
        added[0].reference,
      );
      expect(detail.completion?.job.reference.job_id).toBe(f.job);
      expect(detail.completion?.interpretation.physical_completion).toBe(
        'UNVERIFIED',
      );
      expect(detail.completion?.interpretation.customer_acceptance).toBe(
        'UNVERIFIED',
      );
      const comparison = compareVerifiedOwnerBriefing(
        before.intelligence,
        current.intelligence,
      );
      expect(
        comparison.rows.some(
          (r) => r.source.kind === 'report' && r.status === 'ADDED',
        ),
      ).toBe(true);
      expect(lineage.history_completeness).toBe('UNKNOWN');
      safeProjection(lineage);
      safeProjection(detail);
    },
  );

  it.each([0, 1, 2])(
    'I06 brand %i actual channel withdrawal invalidates old Growth reference and never supplies suppression or sender authority',
    async (brand) => {
      const f = await fixture(brand);
      await f.sources.operations.recordConsent(
        f.org,
        f.entry.target.customer_id,
        true,
        true,
      );
      const before = await readers.growth(f);
      const id = before.evidence.occurrences[0].id;
      await f.sources.operations.recordConsent(
        f.org,
        f.entry.target.customer_id,
        false,
        false,
      );
      expect(() => selectMaintenanceRevisionRequirements(before, id)).toThrow();
      const current = await readers.growth(f);
      const selected = selectMaintenanceRevisionRequirements(current, id);
      expect(
        selected.checks.find(
          (r) => r.requirement === 'Recorded channel preference',
        )?.state,
      ).toBe('BLOCKED');
      for (const requirement of [
        'purpose_consent',
        'suppression',
        'enrollment',
        'renewal_terms',
        'sender_authority',
      ])
        expect(
          selected.checks.find((r) => r.requirement === requirement)?.state,
        ).toBe('UNKNOWN');
      expect(
        compareMaintenanceOccurrenceContinuity(before, current, id)
          .contact_reference_changed,
      ).toBe(true);
      expect(selected.authority).toBe('BLOCKED');
      expect(selected.recipient).toBeNull();
      expect(selected.send).toBe(false);
    },
  );

  it.each([0, 1, 2])(
    'I07 brand %i actual native membership demotion invalidates every retained module and every new read',
    async (brand) => {
      const f = await fixture(brand);
      const actor = `${f.org}-estimator`;
      await f.sources.operations.manageMember(
        f.org,
        actor,
        true,
        'admin',
        'office_manager',
      );
      for (const e of f.sources.entries) e.target.actor_id = actor;
      const c = await combined(f);
      await f.sources.operations.manageMember(
        f.org,
        actor,
        true,
        'staff',
        'estimator',
      );
      for (const check of checks(c)) expect(check).toThrow();
      const reads = await Promise.allSettled(
        Object.values(readers).map((read) => read(f)),
      );
      expect(reads.every((r) => r.status === 'rejected')).toBe(true);
      expect(reconcileServiceSourceReview(c.customer)).toEqual({
        status: 'UNKNOWN',
        replay: false,
        replacement: null,
      });
    },
  );

  it.each([
    'organization_id',
    'customer_id',
    'location_id',
    'version_id',
    'job_id',
  ] as const)(
    'I08 foreign %s substitution invalidates all combined sources rather than falling back',
    async (key) => {
      const f = await fixture();
      const c = await combined(f);
      f.entry.target[key] = crypto.randomUUID();
      for (const check of checks(c)) expect(check).toThrow();
      const outcomes = await Promise.allSettled(
        Object.values(readers).map((read) => read(f)),
      );
      expect(outcomes.every((r) => r.status === 'rejected')).toBe(true);
    },
  );

  it('I09 duplicate exact entry makes all five source admissions ambiguous', async () => {
    const f = await fixture();
    f.sources.entries = [...f.sources.entries, f.entry];
    const outcomes = await Promise.allSettled(
      Object.values(readers).map((read) => read(f)),
    );
    expect(outcomes.every((r) => r.status === 'rejected')).toBe(true);
  });

  it('I10 another property report and another job occurrence cannot replace the retained exact sources', async () => {
    const prepared = await fixture();
    const f = { ...prepared, sources: prepared.all };
    const c = await combined(f);
    const other = f.sources.entries.find(
      (e) => e.target.location_id !== f.entry.target.location_id,
    )!;
    expect(other).toBeTruthy();
    const foreign = { ...f, entry: other, job: other.target.job_id! };
    const otherCustomer = await readers.customer(foreign);
    const report = readServiceSourceLineage(otherCustomer).reports[0];
    await expect(
      inspectServiceSourceReport(c.customer, report.reference),
    ).rejects.toThrow();
    const growth = await readers.growth(foreign);
    expect(() =>
      selectMaintenanceRevisionRequirements(
        c.growth,
        growth.evidence.occurrences[0].id,
      ),
    ).toThrow();
    expect(() =>
      compareMaintenanceOccurrenceContinuity(
        c.growth,
        growth,
        c.growth.evidence.occurrences[0].id,
      ),
    ).toThrow();
    expect(() =>
      selectTaskRevisionLineage(c.field, 'same wording is not an ID'),
    ).toThrow();
  });

  it('I11 same-property report from a different exact job is rejected and missing request FK remains UNKNOWN', async () => {
    const prepared = await fixture();
    const entry = prepared.all.entries[0];
    const f = {
      ...prepared,
      sources: prepared.all,
      entry,
      job: entry.target.job_id!,
    };
    const view = await readers.customer(f);
    const sibling = f.sources.entries.find(
      (e) =>
        e.target.location_id === f.entry.target.location_id &&
        e.target.job_id !== f.job,
    )!;
    const other = await readers.customer({
      ...f,
      entry: sibling,
      job: sibling.target.job_id!,
    });
    const source = readServiceSourceLineage(other).reports[0];
    await expect(
      inspectServiceSourceReport(view, source.reference),
    ).rejects.toThrow();
    const lineage = readServiceSourceLineage(view);
    expect(lineage.request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    expect(lineage.request_context).toBe('EXPLICIT_STAFF_SELECTED_CONTEXT');
  });

  it.each(Object.keys(readers) as (keyof typeof readers)[])(
    'I12 %s reader rejects current source revocation across an actual asynchronous hash boundary',
    async (module) => {
      const f = await fixture();
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      let revoked = false;
      vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
        const result = await digest(...args);
        if (!revoked) {
          revoked = true;
          f.gate.confirmed = false;
        }
        return result;
      });
      await expect(readers[module](f)).rejects.toThrow();
      expect(revoked).toBe(true);
    },
  );

  it('I13 replacing the original repository handle with a wrapper invalidates all retained handles', async () => {
    const f = await fixture();
    const c = await combined(f);
    f.sources.entries = f.sources.entries.map((e) => ({ ...e }));
    for (const check of checks(c)) expect(check).toThrow();
  });

  it.each(['before-native', 'after-native', 'after-review'] as const)(
    'I14 %s missing task ACK stays UNKNOWN in graph and cannot replay through a fresh correction wrapper',
    async (mode) => {
      const f = await fixture();
      const edit = await taskEdit(f);
      const native = f.sources.estimates.recordTime.bind(f.sources.estimates);
      const review = f.sources.estimates.reviewTime.bind(f.sources.estimates);
      if (mode === 'after-review')
        vi.spyOn(f.sources.estimates, 'reviewTime').mockImplementation(
          async (...args) => {
            await review(...args);
            throw Error('Independent lost review ACK');
          },
        );
      else
        vi.spyOn(f.sources.estimates, 'recordTime').mockImplementation(
          async (...args) => {
            if (mode === 'after-native') await native(...args);
            throw Error('Independent lost record ACK');
          },
        );
      await expect(
        saveTaskCorrectionReview(edit.review, edit.input, true),
      ).rejects.toThrow();
      vi.restoreAllMocks();
      const writer = vi.spyOn(f.sources.estimates, 'recordTime');
      const field = await readers.field(f);
      const finance = await readers.finance(f);
      expect(field.evidence.receipt_consistency).toBe('HELD_UNKNOWN');
      expect(field.evidence.replay).toBe('FORBIDDEN');
      expect(finance.locked_period_ids).toEqual([]);
      await expect(
        (async () => {
          const fresh = await readTaskCorrectionReview(
            { ...f.sources },
            f.job,
            f.gate,
          );
          await saveTaskCorrectionReview(fresh, edit.input, true);
        })(),
      ).rejects.toThrow();
      expect(writer).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'I15 plan lost ACK with native write %s remains blocked even when current revision exists',
    async (didWrite) => {
      const f = await fixture();
      const edit = await planEdit(f);
      const native = f.sources.property.savePlan.bind(f.sources.property);
      const spy = vi
        .spyOn(f.sources.property, 'savePlan')
        .mockImplementation((...args) => {
          if (didWrite) native(...args);
          throw Error('Independent absent plan ACK');
        });
      await expect(
        saveMaintenancePlanCorrectionReview(edit.review, edit.input, true),
      ).rejects.toThrow();
      spy.mockRestore();
      const writer = vi.spyOn(f.sources.property, 'savePlan');
      const current = await readers.growth(f);
      const selected = selectMaintenanceRevisionRequirements(
        current,
        current.evidence.occurrences[0].id,
      );
      expect(current.evidence.receipt.state).toBe('UNKNOWN');
      expect(
        selected.checks.find(
          (r) => r.requirement === 'Original correction receipt',
        )?.state,
      ).toBe('BLOCKED');
      const fresh = await planEdit({ ...f, sources: { ...f.sources } });
      await expect(
        saveMaintenancePlanCorrectionReview(fresh.review, fresh.input, true),
      ).rejects.toThrow();
      expect(writer).not.toHaveBeenCalled();
      expect(selected.send).toBe(false);
    },
  );

  it('I16 original cost-navigation ambiguity survives a new wrapper and cannot duplicate the callback', async () => {
    const f = await fixture();
    const finance = await readers.finance(f);
    const row = inspectRecordedCostSource(finance, {
      kind: 'time',
      id: finance.labor[0].entry_id,
    });
    const callback = vi.fn(() => {
      throw Error('Independent callback ACK loss');
    });
    const outcome = await continueRecordedCostSource(finance, row, callback, {
      current: callback,
      generation: 0,
    });
    expect(outcome).toMatchObject({ status: 'UNKNOWN', replay: 'FORBIDDEN' });
    await expect(
      readers.finance({ ...f, sources: { ...f.sources } }),
    ).rejects.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('I17 original priority inspection is required and ambiguous navigation cannot be renewed', async () => {
    const f = await fixture();
    const owner = await readers.intelligence(f);
    const row = owner.rows.find(
      (r) => r.state !== 'UNKNOWN_SOURCE_UNAVAILABLE',
    )!;
    const callback = vi.fn(() => {
      throw Error('Independent priority ACK loss');
    });
    const lease = { current: callback, generation: 0 };
    expect(
      (
        await continueVerifiedOwnerPriority(
          owner,
          row as never,
          callback,
          lease,
        )
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
    const detail = await inspectVerifiedOwnerPriority(owner, row.key);
    expect(
      (await continueVerifiedOwnerPriority(owner, detail, callback, lease))
        .status,
    ).toBe('UNKNOWN');
    await expect(
      readers.intelligence({ ...f, sources: { ...f.sources } }),
    ).rejects.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('I18 original rank order survives native visit revision while disappeared key remains UNKNOWN rather than complete', async () => {
    const f = await fixture();
    const before = await readers.intelligence(f);
    const old = before.rows.find(
      (r) =>
        r.source.kind === 'visit' && r.source.id === f.entry.scheduled_visit_id,
    )!;
    const exercise = await readSavedSourceExercise(f.sources, f.job, f.gate);
    await executeSavedSourceExercise(exercise, 'visit-draft', true);
    const current = await readers.intelligence(f);
    const canonical = recordedOwnerActionCards(current.original.original);
    expect(current.rows.map((r) => [r.key, r.rank])).toEqual(
      canonical.map((r) => [r.key, r.rank]),
    );
    const comparison = compareVerifiedOwnerBriefing(before, current);
    const absent = comparison.rows.find((r) => r.key === old.key)!;
    expect(absent.recorded_state).toBe('NOT_PRESENT_IN_CURRENT_READ_UNKNOWN');
    expect(absent.can_inspect).toBe(false);
    expect(absent.current_fact).toBeNull();
    await expect(
      inspectVerifiedOwnerDifference(comparison, old.key),
    ).rejects.toThrow();
  });

  it.each(['default', 'production', 'remote-host'] as const)(
    'I19 %s admission denies all readers and components before hostile source getters',
    async (mode) => {
      const getter = vi.fn(() => {
        throw Error('Source getter must not run');
      });
      const sources = Object.defineProperty({}, 'entries', {
        get: getter,
      }) as OperatingSources;
      if (mode === 'production') vi.stubEnv('DEV', false);
      if (mode === 'remote-host')
        vi.stubGlobal('window', {
          location: { hostname: 'example.invalid', protocol: 'https:' },
        });
      const gate =
        mode === 'default' ? undefined : { enabled: true, confirmed: true };
      const results = await Promise.allSettled([
        readTaskRevisionConsistency(sources, 'untrusted', gate),
        readRecordedCostRequirements(sources, 'untrusted', gate),
        readServiceSourceReview(
          sources,
          { job_id: 'untrusted', staff_context_confirmed: true },
          gate,
        ),
        readMaintenanceRevisionRequirements(sources, 'untrusted', gate),
        readVerifiedOwnerBriefing(sources, 'untrusted', gate),
      ]);
      expect(results.every((r) => r.status === 'rejected')).toBe(true);
      for (const Component of [
        TaskRevisionConsistency,
        RecordedCostRequirements,
        ServiceSourceReview,
        MaintenanceRevisionRequirements,
        VerifiedOwnerBriefing,
      ]) {
        const html = renderToStaticMarkup(
          createElement(Component, {
            sources,
            enabled: mode !== 'default',
            selectedJobId: 'untrusted',
          }),
        );
        expect(html).not.toContain('<table');
        expect(html).not.toContain('untrusted');
      }
      expect(getter).not.toHaveBeenCalled();
    },
  );

  it('I20 executable or extra selectors cannot turn strict customer/cost/task projections into authority', async () => {
    const f = await fixture();
    const c = await combined(f);
    const getter = vi.fn(() => c.finance.labor[0].entry_id);
    expect(() =>
      inspectRecordedCostSource(
        c.finance,
        Object.defineProperty({ kind: 'time' }, 'id', { get: getter }) as never,
      ),
    ).toThrow();
    expect(() =>
      inspectRecordedCostSource(c.finance, {
        kind: 'time',
        id: c.finance.labor[0].entry_id,
        private_cost: 1,
      } as never),
    ).toThrow();
    await expect(
      readServiceSourceReview(
        f.sources,
        {
          job_id: f.job,
          staff_context_confirmed: true,
          customer_id: f.entry.target.customer_id,
        } as never,
        f.gate,
      ),
    ).rejects.toThrow();
    const graph = c.field.evidence.graph.nodes[0];
    expect(() => analyzeTaskRevisionGraph([graph])).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      inspectRecordedCostCategory({ ...c.finance }, 'labor'),
    ).toThrow();
    expect(() =>
      assertVerifiedOwnerBriefingCurrent({ ...c.intelligence }),
    ).toThrow();
    expect(() => taskRevisionDestination({ ...c.field }, graph.id)).toThrow();
  });

  it('I21 six exact C22 destinations render five C23 panels over the same original source object and existing workbench', () => {
    const prior = cycle22RequirementGroups.flatMap((g) => g.panels);
    const current = cycle23ConsistencyGroups.flatMap((g) => g.panels);
    expect(current.map((p) => p.id)).toEqual(prior.map((p) => p.id));
    expect(current).toHaveLength(6);
    const sources = {} as OperatingSources;
    const props = {
      sources,
      enabled: false,
      selectedJobId: 'opaque hint',
      onSelectJob: vi.fn(),
    };
    const workbench = current[0].render(props) as ReactElement<{
      sources: OperatingSources;
      reviewPanels: SavedWorkbenchPanels;
    }>;
    expect(workbench.type).toBe(SavedRevisionWorkbench);
    expect(workbench.props.sources).toBe(sources);
    expect(Object.values(workbench.props.reviewPanels)).toEqual([
      TaskRevisionConsistency,
      RecordedCostRequirements,
      ServiceSourceReview,
      MaintenanceRevisionRequirements,
      VerifiedOwnerBriefing,
    ]);
    for (const panel of current)
      expect(
        (panel.render(props) as ReactElement<{ sources: OperatingSources }>)
          .props.sources,
      ).toBe(sources);
    const host = readFileSync(
      new URL(
        '../src/components/workflows/OperatingCenterCycleFifteen.tsx',
        import.meta.url,
      ),
      'utf8',
    );
    expect(host).toContain('useState(false)');
    expect(host).toContain(">('requirements')");
    expect(host).toContain('disabled={!requirements}');
    expect(host).toContain("sourceReview === 'consistency'");
    expect(host).toContain(
      '? cycle23ConsistencyGroups\n              : cycle22RequirementGroups',
    );
    expect(host.match(/<OperatingCenterCycleThirteen/g)).toHaveLength(1);
  });

  it('I22 original default host leaves Requirements selected and current-source mode disabled without preparing sources', () => {
    const html = renderToStaticMarkup(
      createElement(OperatingCenterCycleFifteen),
    );
    expect(html).toContain('Current source review');
    expect(html).toContain('<select disabled="">');
    expect(html).toContain('<option value="requirements" selected="">');
    expect(html).not.toContain('checked=""');
    expect(html).not.toContain('Task revision graph');
  });

  it('I23 concurrent original task commands produce one native correction and one shared exact graph/cost result', async () => {
    const f = await fixture();
    const edit = await taskEdit(f);
    const writer = vi.spyOn(f.sources.estimates, 'recordTime');
    const results = await Promise.allSettled([
      saveTaskCorrectionReview(edit.review, edit.input, true),
      saveTaskCorrectionReview(edit.review, edit.input, true),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(writer).toHaveBeenCalledTimes(1);
    const [field, finance] = await Promise.all([
      readers.field(f),
      readers.finance(f),
    ]);
    expect(field.evidence.receipt_consistency).toBe('EXACT_RESULT_LINKED');
    const result = field.evidence.receipt.result_id;
    expect(finance.labor.filter((r) => r.entry_id === result)).toHaveLength(1);
    expect(
      field.evidence.graph.nodes.filter(
        (r) => r.corrects_id === edit.input.source_entry_id,
      ),
    ).toHaveLength(1);
    expect(
      finance.labor.find((r) => r.entry_id === result)?.locked_labor_reference,
    ).toBe(false);
  });
});
