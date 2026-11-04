import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import type { OperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readRecordedCostRequirements,
  assertRecordedCostRequirementsCurrent,
} from '../src/lib/workflows/recorded-cost-requirements';
import {
  validateCostCoverageAction,
  continueCostCoverageAction,
  type CostCoverageActionInput,
} from '../src/lib/workflows/cost-coverage-actions';
import {
  readVerifiedOwnerBriefing,
  compareVerifiedOwnerBriefing,
} from '../src/lib/workflows/verified-owner-briefing';
import {
  checkOwnerActionRequirements,
  verifyOwnerActionRequirements,
  continueVerifiedOwnerAction,
  type OwnerActionSelection,
} from '../src/lib/workflows/owner-action-verification';
import { recordedOwnerActionCards } from '../src/lib/workflows/recorded-owner-actions';
import { confirmCostCorrectionReview } from '../src/lib/workflows/cost-correction-review';
import {
  readTaskCorrectionReview,
  saveTaskCorrectionReview,
} from '../src/lib/workflows/task-correction-review';
import { CostCoverageActions } from '../src/components/workflows/CostCoverageActions';
import { OwnerActionVerification } from '../src/components/workflows/OwnerActionVerification';
import { TaskReceiptActions } from '../src/components/workflows/TaskReceiptActions';
import { MaintenanceCancellationActions } from '../src/components/workflows/MaintenanceCancellationActions';
import {
  readSavedSourceExercise,
  readSavedRequestAction,
  executeSavedRequestAction,
  executeSavedSourceExercise,
  reconcileSavedRequestAction,
  type SavedRequestActionInput,
} from '../src/lib/workflows/saved-revision-exercise';
import {
  readTaskReceiptReconciliation,
  inspectTaskReceiptReconciliation,
} from '../src/lib/workflows/task-receipt-reconciliation';
import {
  readPlanCancellationReview,
  selectPlanCancellationOccurrence,
  preparePlanCancellationReview,
  reconcilePlanCancellationReview,
  closePlanCancellationReview,
  assertPlanCancellationCurrent,
} from '../src/lib/workflows/plan-cancellation-review';
import { assertVerifiedOwnerBriefingCurrent } from '../src/lib/workflows/verified-owner-briefing';
import {
  readServiceRequestActions,
  inspectServiceRequestActions,
  saveServiceRequestAction,
  parseServiceRequestAction,
} from '../src/lib/workflows/service-request-actions';
import {
  readServiceSourceReview,
  readServiceSourceLineage,
  inspectServiceSourceReport,
  assertServiceSourceReview,
} from '../src/lib/workflows/service-source-review';
import { ServiceRequestActions } from '../src/components/workflows/ServiceRequestActions';
import { readFieldWorkOrders } from '../src/lib/field-work-orders';
import { reviewOperationsExperiments } from '../src/lib/operations-experiments';
import {
  readSyncAdmissionSource,
  syncSourceReference,
  assertSyncAdmissionCurrentNow,
} from '../src/lib/workflows/sync-admission-review';
import {
  reviewOfflineSourceAdmission,
  parseOfflineSourceProtocol,
  type OfflineSourceProtocol,
} from '../src/lib/workflows/offline-source-admission';
import { cycle23ConsistencyGroups } from '../src/components/workflows/OperatingCenterCycleTwentyThree';
import { cycle22RequirementGroups } from '../src/components/workflows/OperatingCenterCycleTwentyTwo';
import {
  SavedRevisionWorkbench,
  type SavedWorkbenchPanels,
} from '../src/components/workflows/SavedRevisionWorkbench';
import { TaskRevisionConsistency } from '../src/components/workflows/TaskRevisionConsistency';
import { RecordedCostRequirements } from '../src/components/workflows/RecordedCostRequirements';
import { ServiceSourceReview } from '../src/components/workflows/ServiceSourceReview';
import { MaintenanceRevisionRequirements } from '../src/components/workflows/MaintenanceRevisionRequirements';
import { VerifiedOwnerBriefing } from '../src/components/workflows/VerifiedOwnerBriefing';
import type { SavedRevisionPanelProps } from '../src/lib/workflows/saved-revision-contract';
import { OperatingCenterCycleFifteen } from '../src/components/workflows/OperatingCenterCycleFifteen';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function fixture(brand = 0, index = 2) {
  const gate = { enabled: true, confirmed: true };
  const all = await prepareCorrectionPreviewSources(
    sampleCompanies[brand],
    gate,
  );
  const entry = all.entries[index];
  const sources: OperatingSources = { ...all, entries: [entry] };
  return {
    all,
    sources,
    gate,
    entry,
    org: all.company.id,
    job: entry.target.job_id!,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Costs = Awaited<ReturnType<typeof readRecordedCostRequirements>>;
type Briefing = Awaited<ReturnType<typeof readVerifiedOwnerBriefing>>;
function costInput(
  view: Costs,
  kind: CostCoverageActionInput['kind'],
  id?: string,
): CostCoverageActionInput {
  const row = view.original.rows.find(
    (r) => r.kind === kind && (id === undefined || r.id === id),
  );
  if (!row) throw Error('Original exact source required by independent case');
  return {
    kind,
    id: row.id,
    expected_job_revision: view.original.original.costs.evidence.job_revision,
    purpose:
      kind === 'invoice_requirement' ? 'invoice_preparation' : 'cost_review',
  };
}
function ownerInput(view: Briefing, kind?: string): OwnerActionSelection {
  const row = view.rows.find(
    (r) =>
      (kind === undefined || r.source.kind === kind) &&
      r.state !== 'UNKNOWN_SOURCE_UNAVAILABLE',
  );
  if (!row)
    throw Error('Original current priority required by independent case');
  return { key: row.key, ...row.source };
}
async function costs(f: Fixture) {
  return readRecordedCostRequirements(f.sources, f.job, f.gate);
}
async function priorities(f: Fixture) {
  return readVerifiedOwnerBriefing(f.sources, f.job, f.gate);
}
async function nativeTaskCorrection(f: Fixture) {
  const review = await readTaskCorrectionReview(f.sources, f.job, f.gate);
  const input = {
    source_entry_id: review.source.source_entry_id!,
    task: 'Independent Cycle24 native correction',
    started_at: review.source.started_at!,
    ended_at: review.source.ended_at!,
    billable: !review.source.billable,
  };
  return { review, input };
}
async function nativeRequest(f: Fixture) {
  const view = await readSavedSourceExercise(f.sources, f.job, f.gate);
  const current = readSavedRequestAction(view);
  const input: SavedRequestActionInput = {
    request_id: current.request_id,
    status: 'reviewing',
    assigned_to: current.eligible_assignees[0].user_id,
    expected_status: current.status,
    expected_assigned_to: current.assigned_to,
    expected_updated_at: current.updated_at,
  };
  return { view, current, input };
}
async function offline(f: Fixture) {
  const model = await readFieldWorkOrders(
    f.sources.property,
    f.org,
    f.entry.target.actor_id,
  );
  const order = model.orders.find((o) => o.source.job_id === f.job)!;
  const visit = order.visits.find((v) => v.id === f.entry.scheduled_visit_id)!;
  const experiment = await reviewOperationsExperiments(
    f.sources.property,
    f.org,
    f.entry.target.actor_id,
    {
      day: f.entry.day,
      timezone: f.entry.timezone,
      booking: {
        order,
        worker_id: f.entry.worker_id,
        visit_id: visit.id,
        start: null,
        end: null,
      },
      other_windows: [],
      proposed_hours: [],
      route: [{ order, visit_id: visit.id }],
      capture: {
        order,
        visit_id: visit.id,
        note: 'Independent untrusted synthetic source proposal.',
      },
    },
    f.gate,
  );
  const requirements = await readSyncAdmissionSource(
    f.sources,
    {
      job_id: f.job,
      kind: 'offline',
      edition: 'property_services',
      note: 'Independent source-only review',
      review_on: f.entry.day,
      manual_priority: 'normal',
    },
    f.gate,
  );
  const native = experiment.offline_capture.source;
  const input: OfflineSourceProtocol = {
    mode: 'OFFLINE_SOURCE_ADMISSION_V1',
    external_reference: 'independent-c24',
    source: syncSourceReference(
      requirements,
    ) as OfflineSourceProtocol['source'],
    visit: {
      visit_id: native.visit_id!,
      visit_revision: native.visit_revision!,
      plan_id: native.plan_id!,
      plan_revision: native.plan_revision!,
    },
  };
  return { experiment, requirements, input };
}

describe('Cycle24 independent exact native action integration', () => {
  it.each(['stable', 'replaced'] as const)(
    'Finance continuation after the exact task receipt with %s host callback preserves the original outcome fence',
    async (mode) => {
      const f = await fixture(),
        task = await nativeTaskCorrection(f);
      await saveTaskCorrectionReview(task.review, task.input, true);
      const receipt = inspectTaskReceiptReconciliation(
        await readTaskReceiptReconciliation(f.sources, f.job, f.gate),
      );
      expect(receipt.native_stage).toBe('APPROVED');
      const cost = await costs(f),
        input = costInput(cost, 'time');
      const live = { current: vi.fn(() => {}), generation: 0 };
      const callback = vi.fn(() => {
        if (mode === 'replaced') {
          live.current = vi.fn(() => {});
          live.generation++;
        }
      });
      live.current = callback;
      const outcome = await continueCostCoverageAction(
        cost,
        input,
        true,
        callback,
        live,
      );
      expect(callback).toHaveBeenCalledTimes(1);
      if (mode === 'stable') {
        expect(outcome.status).toBe('CURRENT_REVIEW_ONLY');
        expect((await priorities(f)).rows.length).toBeGreaterThan(0);
      } else {
        expect(outcome.status).toBe('UNKNOWN');
        await expect(priorities(f)).rejects.toThrow(
          /navigation outcome UNKNOWN|context UNKNOWN/,
        );
      }
    },
  );
  it('strict native action forms reject executable and extra authority fields without running caller code or a writer', async () => {
    const f = await fixture(),
      cost = await costs(f),
      owner = await priorities(f),
      request = await nativeRequest(f);
    const getter = vi.fn(),
      executable = Object.create(null);
    Object.defineProperty(executable, 'kind', {
      enumerable: true,
      get: getter,
    });
    expect(() => validateCostCoverageAction(cost, executable)).toThrow();
    expect(() => checkOwnerActionRequirements(owner, executable)).toThrow();
    expect(() => parseServiceRequestAction(request.view, executable)).toThrow();
    expect(() =>
      validateCostCoverageAction(cost, {
        ...costInput(cost, 'time'),
        financial_execution: true,
      } as CostCoverageActionInput),
    ).toThrow();
    expect(() =>
      checkOwnerActionRequirements(owner, {
        ...ownerInput(owner),
        completion: true,
      } as OwnerActionSelection),
    ).toThrow();
    const write = vi.spyOn(f.sources.operations, 'assignIntake');
    await expect(
      saveServiceRequestAction(
        request.view,
        { ...request.input, native_cas: true },
        true,
      ),
    ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(readSavedRequestAction(request.view).state).toBe('NOT_ATTEMPTED');
  });
  it('the original six destinations compose five original C23 panels and five additive native action slots over one source object', () => {
    const before = cycle22RequirementGroups.flatMap((g) => g.panels),
      current = cycle23ConsistencyGroups.flatMap((g) => g.panels);
    expect(current.map((p) => p.id)).toEqual(before.map((p) => p.id));
    expect(current).toHaveLength(6);
    const sources = {} as OperatingSources;
    const props = {
      sources,
      enabled: false,
      selectedJobId: 'opaque-hint',
      onSelectJob: vi.fn(),
    };
    const rendered = current[0].render(props) as ReactElement<{
      sources: OperatingSources;
      reviewPanels: SavedWorkbenchPanels;
      taskActions: SavedWorkbenchPanels;
    }>;
    expect(rendered.type).toBe(SavedRevisionWorkbench);
    expect(rendered.props.sources).toBe(sources);
    expect(Object.values(rendered.props.reviewPanels)).toEqual([
      TaskRevisionConsistency,
      RecordedCostRequirements,
      ServiceSourceReview,
      MaintenanceRevisionRequirements,
      VerifiedOwnerBriefing,
    ]);
    expect(Object.values(rendered.props.taskActions)).toEqual([
      TaskReceiptActions,
      CostCoverageActions,
      ServiceRequestActions,
      MaintenanceCancellationActions,
      OwnerActionVerification,
    ]);
    expect(
      (before[0].render(props) as ReactElement<{ taskActions?: unknown }>).props
        .taskActions,
    ).toBeUndefined();
    for (const destination of current)
      expect(
        (
          destination.render(props) as ReactElement<{
            sources: OperatingSources;
          }>
        ).props.sources,
      ).toBe(sources);
  });
  it('the existing workbench gives its original panel and additive actions the same retained job and callbacks without preparing sources', async () => {
    const f = await fixture();
    type Props = SavedRevisionPanelProps & { onSourcesSaved?: () => void };
    const panels: Props[] = [],
      actions: Props[] = [];
    const Panel = (props: Props) => {
      panels.push(props);
      return createElement('p', null, 'Independent original panel');
    };
    const Action = (props: Props) => {
      actions.push(props);
      return createElement('p', null, 'Independent native actions');
    };
    const mappings = Object.fromEntries(
      ['field', 'finance', 'customer', 'maintenance', 'priorities'].map(
        (key) => [key, Panel],
      ),
    ) as unknown as SavedWorkbenchPanels;
    const slots = Object.fromEntries(
      ['field', 'finance', 'customer', 'maintenance', 'priorities'].map(
        (key) => [key, Action],
      ),
    ) as unknown as SavedWorkbenchPanels;
    const writes = [
      vi.spyOn(f.sources.estimates, 'recordTime'),
      vi.spyOn(f.sources.property, 'savePlan'),
      vi.spyOn(f.sources.operations, 'assignIntake'),
    ];
    const html = renderToStaticMarkup(
      createElement(SavedRevisionWorkbench, {
        sources: f.sources,
        enabled: true,
        selectedJobId: f.job,
        reviewPanels: mappings,
        taskActions: slots,
      }),
    );
    expect(panels).toHaveLength(1);
    expect(actions).toHaveLength(1);
    for (const key of [
      'sources',
      'selectedJobId',
      'onSelectJob',
      'onSourcesSaved',
      'onContinue',
    ] as const)
      expect(actions[0][key]).toBe(panels[0][key]);
    expect(actions[0].sources).toBe(f.sources);
    expect(actions[0].selectedJobId).toBe(f.job);
    expect(html.indexOf('Independent original panel')).toBeLessThan(
      html.indexOf('Independent native actions'),
    );
    expect(html).toContain('Work-order revisions');
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  });
  it('the original host defaults to disabled Requirements mode with no new native controls or source preparation', () => {
    const html = renderToStaticMarkup(
      createElement(OperatingCenterCycleFifteen),
    );
    expect(html).toContain('<select disabled="">');
    expect(html).toContain('<option value="requirements" selected="">');
    expect(html).not.toContain('checked=""');
    expect(html).not.toContain('Load exact service request');
    expect(html).not.toContain('Reconcile original task receipt');
  });
  it.each(['record', 'review'] as const)(
    'lost native %s acknowledgement preserves UNKNOWN even when exact task evidence is visible',
    async (stage) => {
      const f = await fixture(),
        task = await nativeTaskCorrection(f);
      if (stage === 'record') {
        const native = f.sources.estimates.recordTime.bind(f.sources.estimates);
        vi.spyOn(f.sources.estimates, 'recordTime').mockImplementation(
          async (...args) => {
            await native(...args);
            throw Error('Independent native record ACK loss');
          },
        );
      } else {
        const native = f.sources.estimates.reviewTime.bind(f.sources.estimates);
        vi.spyOn(f.sources.estimates, 'reviewTime').mockImplementation(
          async (...args) => {
            await native(...args);
            throw Error('Independent native review ACK loss');
          },
        );
      }
      await expect(
        saveTaskCorrectionReview(task.review, task.input, true),
      ).rejects.toThrow();
      vi.restoreAllMocks();
      const receipt = inspectTaskReceiptReconciliation(
        await readTaskReceiptReconciliation(f.sources, f.job, f.gate),
      );
      expect(receipt.state).toBe('UNKNOWN');
      expect(receipt.native_stage).toBe(
        stage === 'record' ? 'UNATTRIBUTED_SUCCESSOR' : 'APPROVED',
      );
      expect(receipt.classification).toBe(
        stage === 'record' ? 'UNACKNOWLEDGED_SUCCESSOR' : 'EXACT_NATIVE_RESULT',
      );
      expect(receipt.counts.successor_rows).toBe(1);
      expect(receipt.replay).toBe('FORBIDDEN');
      const canonical = await costs(f);
      expect(canonical.labor.every((row) => !row.locked_labor_reference)).toBe(
        true,
      );
      const write = vi.spyOn(f.sources.estimates, 'recordTime');
      await expect(
        (async () => {
          const fresh = await nativeTaskCorrection({
            ...f,
            sources: { ...f.sources },
          });
          await saveTaskCorrectionReview(fresh.review, fresh.input, true);
        })(),
      ).rejects.toThrow();
      expect(write).not.toHaveBeenCalled();
    },
  );
  it.each(['inactive', 'demoted'] as const)(
    'current %s staff loses every native consumer and cannot update a request',
    async (mode) => {
      const f = await fixture();
      const actor = f.org + '-estimator';
      await f.sources.operations.manageMember(
        f.org,
        actor,
        true,
        'admin',
        'office_manager',
      );
      f.entry.target.actor_id = actor;
      const cost = await costs(f),
        owner = await priorities(f),
        request = await nativeRequest(f);
      const task = await readTaskReceiptReconciliation(
        f.sources,
        f.job,
        f.gate,
      );
      const growth = await readPlanCancellationReview(
        f.sources,
        f.job,
        'marketing',
        f.gate,
      );
      const service = await readServiceSourceReview(
        f.sources,
        { job_id: f.job, staff_context_confirmed: true },
        f.gate,
      );
      const write = vi.spyOn(f.sources.operations, 'assignIntake');
      await f.sources.operations.manageMember(
        f.org,
        actor,
        mode !== 'inactive',
        mode === 'inactive' ? 'admin' : 'staff',
        'estimator',
      );
      expect(() => assertRecordedCostRequirementsCurrent(cost)).toThrow();
      expect(() => assertVerifiedOwnerBriefingCurrent(owner)).toThrow();
      expect(() => inspectTaskReceiptReconciliation(task)).toThrow();
      expect(() => assertPlanCancellationCurrent(growth)).toThrow();
      expect(() => assertServiceSourceReview(service)).toThrow();
      await expect(
        executeSavedRequestAction(request.view, request.input, true),
      ).rejects.toThrow();
      expect(write).not.toHaveBeenCalled();
    },
  );
  it('appended published documentation retains the exact old report version and remains distinct from completion or a verified owner action', async () => {
    const f = await fixture();
    const before = await readServiceSourceReview(
      f.sources,
      { job_id: f.job, staff_context_confirmed: true },
      f.gate,
    );
    const old = readServiceSourceLineage(before),
      bytes = JSON.stringify(f.sources.property.read(f.org).reports);
    const exercise = await readSavedSourceExercise(f.sources, f.job, f.gate);
    await executeSavedSourceExercise(exercise, 'report-revision', true);
    expect(() => assertServiceSourceReview(before)).toThrow();
    const current = await readServiceSourceReview(
      f.sources,
      { job_id: f.job, staff_context_confirmed: true },
      f.gate,
    );
    const lineage = readServiceSourceLineage(current);
    for (const report of old.reports) {
      const retained = lineage.reports.find(
        (r) => JSON.stringify(r.reference) === JSON.stringify(report.reference),
      )!;
      expect(retained.sha256).toBe(report.sha256);
      expect(retained.version.status).toBe('OLDER_AVAILABLE_PUBLISHED_VERSION');
    }
    const added = lineage.reports.filter(
      (r) =>
        !old.reports.some(
          (o) => JSON.stringify(r.reference) === JSON.stringify(o.reference),
        ),
    );
    expect(added).toHaveLength(1);
    const opened = await inspectServiceSourceReport(
      current,
      added[0].reference,
    );
    expect(opened.completion?.job.reference.job_id).toBe(f.job);
    expect(opened.completion?.interpretation.physical_completion).toBe(
      'UNVERIFIED',
    );
    expect(opened.completion?.interpretation.customer_acceptance).toBe(
      'UNVERIFIED',
    );
    expect(
      JSON.stringify(
        f.sources.property
          .read(f.org)
          .reports.slice(0, JSON.parse(bytes).length),
      ),
    ).toBe(bytes);
    const owner = await priorities(f);
    const row = ownerInput(owner, 'report');
    expect(checkOwnerActionRequirements(owner, row).operational_authority).toBe(
      false,
    );
    expect(lineage.history_completeness).toBe('UNKNOWN');
  });
  it.each([0, 1, 2])(
    'brand %i offline protocol returns only the original source admission handle without native mutation',
    async (brand) => {
      const f = await fixture(brand),
        review = await offline(f);
      const before = JSON.stringify(f.sources.property.read(f.org));
      const writers = [
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.property, 'publish'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(globalThis, 'fetch'),
      ];
      const original = await reviewOfflineSourceAdmission(
        review.requirements,
        review.experiment,
        review.input,
        f.gate,
      );
      expect(original.mode).toBe('LOCAL_SYNC_REFERENCE_ADMISSION_REVIEW');
      expect(original.exact_reference).toBe(true);
      expect(original.operational_ready).toBe(false);
      expect(
        Object.values(original.authority).every((value) => value === false),
      ).toBe(true);
      expect(() => assertSyncAdmissionCurrentNow(original)).not.toThrow();
      expect(JSON.stringify(f.sources.property.read(f.org))).toBe(before);
      expect(JSON.stringify(original)).not.toMatch(
        /Independent untrusted|unit_cost|cash_hour|supplier|internal_notes/,
      );
      for (const write of writers) expect(write).not.toHaveBeenCalled();
    },
  );
  it.each([
    'organization_id',
    'customer_id',
    'location_id',
    'job_id',
    'estimate_id',
    'issued_version_id',
    'source_sha256',
    'saved_lock_revision',
    'visit_id',
    'visit_revision',
    'plan_id',
    'plan_revision',
  ] as const)(
    'external offline %s is compared to exact original native sources and cannot acquire restore authority',
    async (field) => {
      const f = await fixture(),
        review = await offline(f);
      const input = structuredClone(review.input);
      if (field === 'saved_lock_revision') input.source[field]++;
      else if (field === 'visit_revision' || field === 'plan_revision')
        input.visit[field]++;
      else if (field === 'visit_id' || field === 'plan_id')
        input.visit[field] = crypto.randomUUID();
      else
        input.source[field] =
          field === 'source_sha256' ? '0'.repeat(64) : 'foreign-native-source';
      await expect(
        reviewOfflineSourceAdmission(
          review.requirements,
          review.experiment,
          input,
          f.gate,
        ),
      ).rejects.toThrow();
      expect(
        (
          await reviewOfflineSourceAdmission(
            review.requirements,
            review.experiment,
            review.input,
            f.gate,
          )
        ).exact_reference,
      ).toBe(true);
    },
  );
  it('strict external offline parser rejects executable, extra, missing and null native fields before getter execution', () => {
    const getter = vi.fn(),
      executable = Object.create(null);
    Object.defineProperty(executable, 'mode', {
      enumerable: true,
      get: getter,
    });
    expect(() => parseOfflineSourceProtocol(executable)).toThrow();
    const source = {
      organization_id: 'sample',
      customer_id: 'customer',
      location_id: 'property',
      job_id: 'job',
      estimate_id: 'estimate',
      issued_version_id: 'version',
      source_sha256: 'a'.repeat(64),
      saved_lock_revision: 1,
    };
    const visit = {
      visit_id: 'visit',
      visit_revision: 1,
      plan_id: 'plan',
      plan_revision: 1,
    };
    const valid = {
      mode: 'OFFLINE_SOURCE_ADMISSION_V1',
      external_reference: 'untrusted-proposal',
      source,
      visit,
    };
    expect(() =>
      parseOfflineSourceProtocol({ ...valid, native_receipt: true }),
    ).toThrow();
    for (const field of Object.keys(source))
      expect(() =>
        parseOfflineSourceProtocol({
          ...valid,
          source: { ...source, [field]: null },
        }),
      ).toThrow();
    for (const field of Object.keys(visit))
      expect(() =>
        parseOfflineSourceProtocol({
          ...valid,
          visit: { ...visit, [field]: null },
        }),
      ).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('a maintenance selection from another requested purpose cannot substitute for the displayed review', async () => {
    const f = await fixture();
    const original = await readPlanCancellationReview(
      f.sources,
      f.job,
      'recurring_maintenance',
      f.gate,
    );
    const selected = await selectPlanCancellationOccurrence(
      original,
      original.desk.rows[0].key,
    );
    const displayed = await readPlanCancellationReview(
      f.sources,
      f.job,
      'marketing',
      f.gate,
    );
    const mixed = { review: displayed, selection: selected.selection };
    await expect(
      preparePlanCancellationReview(
        mixed,
        {
          proposed_on: original.desk.rows[0].recorded_due_on,
          plan_kind: 'follow_up',
        },
        true,
      ),
    ).rejects.toThrow();
    expect((await reconcilePlanCancellationReview(selected)).status).toBe(
      'READY_FOR_REQUIREMENTS',
    );
  });
  it.each(['close', 'reconcile'] as const)(
    'a crossed maintenance source cannot %s the original retained review',
    async (action) => {
      const f = await fixture();
      const original = await readPlanCancellationReview(
        f.sources,
        f.job,
        'recurring_maintenance',
        f.gate,
      );
      const selected = await selectPlanCancellationOccurrence(
        original,
        original.desk.rows[0].key,
      );
      const proposal = {
        proposed_on: original.desk.rows[0].recorded_due_on,
        plan_kind: 'follow_up' as const,
      };
      await preparePlanCancellationReview(selected, proposal, true);
      const displayed = await readPlanCancellationReview(
        f.sources,
        f.job,
        'marketing',
        f.gate,
      );
      const mixed = { review: displayed, selection: selected.selection };
      if (action === 'close')
        await expect(
          closePlanCancellationReview(mixed, 'CANCEL', true),
        ).rejects.toThrow();
      else
        expect((await reconcilePlanCancellationReview(mixed)).status).toBe(
          'UNKNOWN',
        );
      expect((await reconcilePlanCancellationReview(selected)).status).toBe(
        'BLOCKED_LOCAL_REVIEW',
      );
    },
  );
  it.each([0, 1, 2])(
    'brand %i native correction and material review remain the original cost and priority sources',
    async (brand) => {
      const f = await fixture(brand);
      const before = await costs(f);
      const oldOwner = await priorities(f);
      const task = await nativeTaskCorrection(f);
      await saveTaskCorrectionReview(task.review, task.input, true);
      const receipt = inspectTaskReceiptReconciliation(
        await readTaskReceiptReconciliation(f.sources, f.job, f.gate),
      );
      expect(receipt.state).toBe('KNOWN_SAVED');
      expect(receipt.classification).toBe('EXACT_NATIVE_RESULT');
      expect(receipt.native_stage).toBe('APPROVED');
      expect(receipt.counts).toEqual({
        source_rows: 1,
        source_reviews: 1,
        result_rows: 1,
        expected_match_rows: 1,
        successor_rows: 1,
        result_reviews: 1,
        approved_reviews: 1,
      });
      expect(receipt.identity.version_id).toBe(f.entry.target.version_id);
      expect(receipt.observed_result?.corrects_id).toBe(
        task.input.source_entry_id,
      );
      expect(receipt.financial).toBe(false);
      expect(JSON.stringify(receipt)).not.toMatch(
        /cash_hour|deduction|PRIVATE|supplier|unit_cost|salary/,
      );
      const current = await costs(f);
      const corrected = current.labor.find(
        (t) => t.corrects_id === task.input.source_entry_id,
      )!;
      const labor = validateCostCoverageAction(
        current,
        costInput(current, 'time', corrected.entry_id),
      );
      expect(labor.action).toBe('UNPOSTED_OR_UNVERIFIED_LABOR_REVIEW');
      expect(labor.labor?.locked_labor_reference).toBe(false);
      expect(labor.labor).not.toHaveProperty('amount_minor');
      expect(() => assertRecordedCostRequirementsCurrent(before)).toThrow();
      const material = current.original.original.material.expense_id!;
      expect(
        validateCostCoverageAction(
          current,
          costInput(current, 'material', material),
        ).action,
      ).toBe('EXISTING_PENDING_MATERIAL_REVIEW');
      await confirmCostCorrectionReview(
        current.original.original,
        {
          expense_id: material,
          decision: 'approved',
          reason: 'Independent explicit native material review.',
        },
        true,
      );
      const after = await costs(f);
      const actual = f.sources.estimates.syntheticJob(f.org, f.job)!;
      expect(after.original.original.canonical).toEqual(jobFinancials(actual));
      expect(
        validateCostCoverageAction(
          after,
          costInput(after, 'material', material),
        ).action,
      ).toBe('RECORDED_MATERIAL_INSPECT_ONLY');
      const event = actual.events.find((r) => r.submission_id === material)!;
      expect(
        validateCostCoverageAction(
          after,
          costInput(after, 'material_review', event.id),
        ).material_review_ids,
      ).toContain(event.id);
      const invoice = validateCostCoverageAction(
        after,
        costInput(after, 'invoice_requirement'),
      );
      expect(invoice.invoice_overall).toBe('NO_GO');
      expect(invoice.invoice_prepared).toBe(false);
      expect(invoice.financial_execution).toBe(false);
      const owner = await priorities(f);
      const verified = await verifyOwnerActionRequirements(
        owner,
        ownerInput(owner, 'finance'),
      );
      expect(verified.operational_authority).toBe(false);
      expect(verified.requirements).toEqual(verified.row!.missing_evidence);
      expect(owner.rows.map((r) => [r.key, r.rank])).toEqual(
        recordedOwnerActionCards(owner.original.original).map((r) => [
          r.key,
          r.rank,
        ]),
      );
      expect(
        compareVerifiedOwnerBriefing(oldOwner, owner).rows.some(
          (r) => r.source.kind === 'finance' && r.status === 'CHANGED',
        ),
      ).toBe(true);
      const serviceBefore = await readServiceSourceReview(
        f.sources,
        { job_id: f.job, staff_context_confirmed: true },
        f.gate,
      );
      const service = await readServiceRequestActions(f.sources, f.job, f.gate);
      const request = inspectServiceRequestActions(service);
      await saveServiceRequestAction(
        service,
        {
          request_id: request.request_id,
          status: 'closed',
          assigned_to: request.assigned_to,
          expected_status: request.status,
          expected_assigned_to: request.assigned_to,
          expected_updated_at: request.updated_at,
        },
        true,
      );
      expect(() => assertServiceSourceReview(serviceBefore)).toThrow();
      const lineage = readServiceSourceLineage(
        await readServiceSourceReview(
          f.sources,
          { job_id: f.job, staff_context_confirmed: true },
          f.gate,
        ),
      );
      expect(lineage.request.status).toBe('closed');
      expect(lineage.request_job_link).toBe(
        'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
      );
      expect(lineage.physical_completion).toBe('UNKNOWN');
      expect(lineage.customer_acceptance).toBe('UNKNOWN');
      const maintenance = await readPlanCancellationReview(
        f.sources,
        f.job,
        'service_follow_up',
        f.gate,
      );
      const selected = await selectPlanCancellationOccurrence(
        maintenance,
        maintenance.desk.rows[0].key,
      );
      const planned = await preparePlanCancellationReview(
        selected,
        {
          proposed_on: maintenance.desk.rows[0].recorded_due_on,
          plan_kind: 'follow_up',
        },
        true,
      );
      expect(planned.observed.purpose).toBe('UNVERIFIED');
      expect(planned.observed.suppression).toBe('UNVERIFIED');
      await closePlanCancellationReview(selected, 'CANCEL', true);
      const final = await priorities(f);
      const finalReview = checkOwnerActionRequirements(
        final,
        ownerInput(final, 'finance'),
      );
      expect(finalReview.operational_authority).toBe(false);
      expect(final.rows.map((r) => [r.key, r.rank])).toEqual(
        recordedOwnerActionCards(final.original.original).map((r) => [
          r.key,
          r.rank,
        ]),
      );
    },
  );

  it.each([
    'organization_id',
    'customer_id',
    'location_id',
    'version_id',
    'job_id',
  ] as const)(
    'foreign %s invalidates all native action consumers before continuation or a request write',
    async (field) => {
      const f = await fixture();
      const cost = await costs(f),
        owner = await priorities(f);
      const task = await readTaskReceiptReconciliation(
        f.sources,
        f.job,
        f.gate,
      );
      const request = await nativeRequest(f);
      const growth = await readPlanCancellationReview(
        f.sources,
        f.job,
        'marketing',
        f.gate,
      );
      const service = await readServiceSourceReview(
        f.sources,
        { job_id: f.job, staff_context_confirmed: true },
        f.gate,
      );
      const write = vi.spyOn(f.sources.operations, 'assignIntake');
      f.entry.target[field] =
        field === 'organization_id' ? 'foreign-tenant' : crypto.randomUUID();
      expect(() => assertRecordedCostRequirementsCurrent(cost)).toThrow();
      expect(() => assertVerifiedOwnerBriefingCurrent(owner)).toThrow();
      expect(() => inspectTaskReceiptReconciliation(task)).toThrow();
      expect(() => readSavedRequestAction(request.view)).toThrow();
      expect(() => assertPlanCancellationCurrent(growth)).toThrow();
      expect(() => assertServiceSourceReview(service)).toThrow();
      await expect(
        executeSavedRequestAction(request.view, request.input, true),
      ).rejects.toThrow();
      expect(write).not.toHaveBeenCalled();
    },
  );

  it('a report from another native property cannot substitute for current published service evidence', async () => {
    const f = await fixture();
    const current = await readServiceSourceReview(
      f.sources,
      { job_id: f.job, staff_context_confirmed: true },
      f.gate,
    );
    const sibling = f.all.entries.find(
      (e) => e.target.location_id !== f.entry.target.location_id,
    )!;
    const other = await readServiceSourceReview(
      { ...f.all, entries: [sibling] },
      { job_id: sibling.target.job_id!, staff_context_confirmed: true },
      f.gate,
    );
    const foreign = readServiceSourceLineage(other).reports[0].reference;
    await expect(
      inspectServiceSourceReport(current, foreign),
    ).rejects.toThrow();
    const exact = readServiceSourceLineage(current).reports[0];
    const opened = await inspectServiceSourceReport(current, exact.reference);
    expect(opened.selected_job_association).toBe('EXACT_RECORDED_JOB_LINK');
  });

  it.each(['before', 'after'] as const)(
    'native request %s lost ACK stays UNKNOWN with no receipt or replay across fresh source wrappers',
    async (mode) => {
      const f = await fixture();
      const action = await nativeRequest(f);
      const native = f.sources.operations.assignIntake.bind(
        f.sources.operations,
      );
      const write = vi
        .spyOn(f.sources.operations, 'assignIntake')
        .mockImplementation(async (...args) => {
          if (mode === 'after') await native(...args);
          throw Error('Independent native request ACK loss');
        });
      await expect(
        executeSavedRequestAction(action.view, action.input, true),
      ).rejects.toThrow();
      expect(write).toHaveBeenCalledTimes(1);
      write.mockRestore();
      const stable = JSON.stringify(
        f.sources.operations.syntheticIntakeRequest(
          f.org,
          f.entry.target.customer_id,
          f.entry.target.location_id,
          f.entry.intake_request_id,
        ),
      );
      const noWrite = vi.spyOn(f.sources.operations, 'assignIntake');
      const fresh = await readSavedSourceExercise(
        { ...f.sources },
        f.job,
        f.gate,
      );
      const observed = await reconcileSavedRequestAction(fresh);
      expect(observed.state).toBe('UNKNOWN');
      expect(observed.observed).toBe(
        mode === 'after' ? 'EXACT_CURRENT_ROW_OBSERVED' : 'UNAVAILABLE',
      );
      expect(observed.native_cas).toBe(false);
      expect(observed.durable_receipt).toBe(false);
      expect(observed.attribution).toBe('CURRENT_ROW_OBSERVATION_ONLY');
      expect(readSavedRequestAction(fresh).can_edit).toBe(false);
      await expect(
        executeSavedRequestAction(
          fresh,
          { ...action.input, status: 'closed' },
          true,
        ),
      ).rejects.toThrow();
      expect(noWrite).not.toHaveBeenCalled();
      expect(
        JSON.stringify(
          f.sources.operations.syntheticIntakeRequest(
            f.org,
            f.entry.target.customer_id,
            f.entry.target.location_id,
            f.entry.intake_request_id,
          ),
        ),
      ).toBe(stable);
    },
  );

  it('simultaneous native request consumers retain one original intent and one native invocation', async () => {
    const f = await fixture();
    const a = await nativeRequest(f);
    const b = await nativeRequest({ ...f, sources: { ...f.sources } });
    const write = vi.spyOn(f.sources.operations, 'assignIntake');
    const result = await Promise.allSettled([
      executeSavedRequestAction(a.view, a.input, true),
      executeSavedRequestAction(b.view, b.input, true),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(write).toHaveBeenCalledTimes(1);
    const fresh = await readSavedSourceExercise(f.sources, f.job, f.gate);
    expect((await reconcileSavedRequestAction(fresh)).state).toBe(
      'KNOWN_SAVED',
    );
    expect(readSavedRequestAction(fresh).can_edit).toBe(false);
  });

  it.each(['gate', 'assignee', 'property', 'input'] as const)(
    'native request final hash fence blocks live %s revocation before invocation',
    async (mode) => {
      const f = await fixture();
      const a = await nativeRequest(f);
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      const write = vi.spyOn(f.sources.operations, 'assignIntake');
      let changed = false;
      vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
        const hash = await digest(...args);
        if (!changed) {
          changed = true;
          if (mode === 'gate') f.gate.enabled = false;
          if (mode === 'property')
            f.entry.target.location_id = crypto.randomUUID();
          if (mode === 'input') a.input.status = 'closed';
          if (mode === 'assignee')
            await f.sources.operations.manageMember(
              f.org,
              a.input.assigned_to!,
              false,
              'staff',
              'field_worker',
            );
        }
        return hash;
      });
      await expect(
        executeSavedRequestAction(a.view, a.input, true),
      ).rejects.toThrow();
      expect(changed).toBe(true);
      expect(write).not.toHaveBeenCalled();
    },
  );

  it.each(['CANCEL', 'REVOKE'] as const)(
    'maintenance %s preserves plans, visits, consent and original NO_GO authority',
    async (action) => {
      const f = await fixture();
      const review = await readPlanCancellationReview(
        f.sources,
        f.job,
        'recurring_maintenance',
        f.gate,
      );
      const selected = await selectPlanCancellationOccurrence(
        review,
        review.desk.rows[0].key,
      );
      const native = JSON.stringify(f.sources.property.read(f.org));
      const write = vi.spyOn(f.sources.property, 'savePlan');
      const consent = vi.spyOn(f.sources.operations, 'recordConsent');
      const network = vi.spyOn(globalThis, 'fetch');
      const prepared = await preparePlanCancellationReview(
        selected,
        {
          proposed_on: review.desk.rows[0].recorded_due_on,
          plan_kind: 'follow_up',
        },
        true,
      );
      expect(prepared.observed.purpose).toBe('UNVERIFIED');
      expect(prepared.observed.suppression).toBe('UNVERIFIED');
      expect(prepared.operational_authority).toBe('BLOCKED');
      expect(
        (await closePlanCancellationReview(selected, action, true)).status,
      ).toBe(
        action === 'CANCEL' ? 'CANCELLED_LOCAL_REVIEW' : 'REVOKED_LOCAL_REVIEW',
      );
      const observed = await reconcilePlanCancellationReview(selected);
      expect(observed.plan_mutation_performed).toBe(false);
      expect(observed.native_plan_cancellation).toBe('UNSUPPORTED');
      expect(observed.enrollment_cancellation).toBe('UNSUPPORTED');
      expect(observed.consent_mutation).toBe(false);
      expect(observed.send).toBe(false);
      expect(JSON.stringify(f.sources.property.read(f.org))).toBe(native);
      for (const spy of [write, consent, network])
        expect(spy).not.toHaveBeenCalled();
    },
  );

  it.each(['cost', 'owner'] as const)(
    '%s original navigation loss remains UNKNOWN across wrappers without replay',
    async (kind) => {
      const f = await fixture();
      const callback = vi.fn(() => {
        throw Error('Independent callback ACK loss');
      });
      const live = { current: callback, generation: 0 };
      if (kind === 'cost') {
        const view = await costs(f);
        const input = costInput(view, 'time');
        expect(
          (await continueCostCoverageAction(view, input, true, callback, live))
            .status,
        ).toBe('UNKNOWN');
        await expect(
          costs({ ...f, sources: { ...f.sources } }),
        ).rejects.toThrow();
      } else {
        const view = await priorities(f);
        const input = ownerInput(view);
        const inspected = await verifyOwnerActionRequirements(view, input);
        expect(
          (
            await continueVerifiedOwnerAction(
              view,
              input,
              inspected.inspection!,
              true,
              callback,
              live,
            )
          ).status,
        ).toBe('UNKNOWN');
        await expect(
          priorities({ ...f, sources: { ...f.sources } }),
        ).rejects.toThrow();
      }
      expect(callback).toHaveBeenCalledTimes(1);
    },
  );

  it('an inspected owner handle cannot be replaced with a copied object or a missing source key', async () => {
    const f = await fixture();
    const view = await priorities(f);
    const input = ownerInput(view);
    const inspected = await verifyOwnerActionRequirements(view, input);
    const callback = vi.fn();
    expect(
      (
        await continueVerifiedOwnerAction(
          view,
          input,
          { ...inspected.inspection! },
          true,
          callback,
          { current: callback, generation: 0 },
        )
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    const absent = checkOwnerActionRequirements(view, {
      ...input,
      key: 'absent-original-key',
    });
    expect(absent.can_open_original).toBe(false);
    expect(absent.status).toBe('UNKNOWN_SOURCE_MISSING');
    expect(callback).not.toHaveBeenCalled();
  });

  it.each(['default', 'production', 'remote'] as const)(
    '%s admission withholds every optional action and offline proposal before source getters',
    async (mode) => {
      const getter = vi.fn(() => {
        throw Error('OFF source access');
      });
      const sources = Object.defineProperties(
        {},
        Object.fromEntries(
          ['entries', 'company', 'operations', 'property', 'estimates'].map(
            (key) => [key, { get: getter }],
          ),
        ),
      ) as OperatingSources;
      const gate = { enabled: mode !== 'default', confirmed: true };
      if (mode === 'production') vi.stubEnv('DEV', false);
      if (mode === 'remote')
        vi.stubGlobal('window', {
          location: { hostname: 'example.invalid', protocol: 'https:' },
        });
      for (const component of [
        CostCoverageActions,
        OwnerActionVerification,
        ServiceRequestActions,
      ]) {
        const html = renderToStaticMarkup(
          createElement(component, {
            sources,
            selectedJobId: 'foreign-private-id',
            enabled: mode !== 'default',
          }),
        );
        expect(html).toContain('OFF');
        expect(html).not.toContain('foreign-private-id');
        expect(html).not.toContain('<select');
      }
      for (const component of [
        TaskReceiptActions,
        MaintenanceCancellationActions,
      ]) {
        expect(
          renderToStaticMarkup(
            createElement(component, {
              sources,
              selectedJobId: 'foreign-private-id',
              enabled: mode !== 'default',
            }),
          ),
        ).toBe('');
      }
      await expect(
        readTaskReceiptReconciliation(sources, 'foreign-private-id', gate),
      ).rejects.toThrow();
      await expect(
        readServiceRequestActions(sources, 'foreign-private-id', gate),
      ).rejects.toThrow();
      await expect(
        readPlanCancellationReview(
          sources,
          'foreign-private-id',
          'marketing',
          gate,
        ),
      ).rejects.toThrow();
      await expect(
        readRecordedCostRequirements(sources, 'foreign-private-id', gate),
      ).rejects.toThrow();
      await expect(
        readVerifiedOwnerBriefing(sources, 'foreign-private-id', gate),
      ).rejects.toThrow();
      await expect(
        reviewOfflineSourceAdmission(
          undefined as never,
          undefined as never,
          sources,
          gate,
        ),
      ).rejects.toThrow();
      expect(getter).not.toHaveBeenCalled();
    },
  );
});
