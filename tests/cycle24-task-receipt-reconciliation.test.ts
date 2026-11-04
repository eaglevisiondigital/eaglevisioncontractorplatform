import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readTaskCorrectionReview,
  saveTaskCorrectionReview,
} from '../src/lib/workflows/task-correction-review';
import {
  readSavedSourceExercise,
  reconcileSavedTaskReceipt,
  reconcileSavedSourceCorrection,
  inspectSavedSourceExercise,
  readSavedRequestAction,
  executeSavedRequestAction,
  reconcileSavedRequestAction,
  type SavedRequestActionInput,
} from '../src/lib/workflows/saved-revision-exercise';
import {
  readTaskReceiptReconciliation,
  inspectTaskReceiptReconciliation,
} from '../src/lib/workflows/task-receipt-reconciliation';
import { TaskReceiptActions } from '../src/components/workflows/TaskReceiptActions';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[0],
    sources = { ...all, entries: [entry] },
    org = sources.company.id,
    job = entry.target.job_id!;
  const id = await sources.estimates.recordTime(org, entry.worker_id, {
    job_id: job,
    overhead_center: null,
    task: 'Original closed task',
    kind: 'work',
    started_at: '2026-10-01T08:00:00Z',
    ended_at: '2026-10-01T09:00:00Z',
    billable: false,
    corrects_id: null,
  });
  if (typeof id !== 'string') throw Error('Native exact ID required');
  await sources.estimates.submitTime(org, id);
  await sources.estimates.reviewTime(
    org,
    id,
    'approved',
    'PRIVATE review reason',
  );
  const review = await readTaskCorrectionReview(sources, job, gate, id),
    input = {
      source_entry_id: id,
      task: 'Explicit corrected task',
      started_at: review.source.started_at,
      ended_at: review.source.ended_at,
      billable: true,
    };
  return { gate, all, sources, entry, org, job, id, review, input };
}
type F = Awaited<ReturnType<typeof fixture>>;
const raw = (f: F) =>
  f.sources.estimates.readSyntheticPrototypeSources(f.entry.target).workforce;
it.each([0, 1, 2])(
  'brand %i exact native receipt retains original version and unchanged authority',
  async (brand) => {
    const f = await fixture(brand);
    await saveTaskCorrectionReview(f.review, f.input, true);
    const writer = vi.spyOn(f.sources.estimates, 'recordTime'),
      fetcher = vi.spyOn(globalThis, 'fetch'),
      review = await readTaskReceiptReconciliation(f.sources, f.job, f.gate),
      d = inspectTaskReceiptReconciliation(review);
    expect(d.identity).toEqual(f.entry.target);
    expect(d.plan_id).toBe(f.entry.plan_id);
    expect(d.visit_id).toBe(f.entry.scheduled_visit_id);
    expect(d.state).toBe('KNOWN_SAVED');
    expect(d.classification).toBe('EXACT_NATIVE_RESULT');
    expect(d.native_stage).toBe('APPROVED');
    expect(d.counts).toEqual({
      source_rows: 1,
      source_reviews: 1,
      result_rows: 1,
      expected_match_rows: 1,
      successor_rows: 1,
      result_reviews: 1,
      approved_reviews: 1,
    });
    expect(d.original?.task).toBe('Original closed task');
    expect(d.observed_result?.corrects_id).toBe(f.id);
    expect(d.expected?.task).toBe(f.input.task);
    expect(d.replay).toBe('FORBIDDEN');
    expect(d.payroll).toBe(false);
    expect(d.financial).toBe(false);
    expect(writer).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(JSON.stringify(d)).not.toMatch(
      /PRIVATE|cash_hour|burden|supplier|salary|unit_cost|deduction/,
    );
  },
);
it.each([
  'record-before',
  'record-after',
  'submit-before',
  'submit-after',
  'review-before',
  'review-after',
] as const)(
  'partial native acknowledgment case %# classifies %s without replay',
  async (mode) => {
    const f = await fixture(),
      method = mode.startsWith('record')
        ? 'recordTime'
        : mode.startsWith('submit')
          ? 'submitTime'
          : 'reviewTime';
    if (method === 'recordTime') {
      const native = f.sources.estimates.recordTime.bind(f.sources.estimates);
      vi.spyOn(f.sources.estimates, 'recordTime').mockImplementation(
        async (...args) => {
          if (mode === 'record-after') await native(...args);
          throw Error('Lost record ACK');
        },
      );
    } else if (method === 'submitTime') {
      const native = f.sources.estimates.submitTime.bind(f.sources.estimates);
      vi.spyOn(f.sources.estimates, 'submitTime').mockImplementation(
        async (...args) => {
          if (mode === 'submit-after') await native(...args);
          throw Error('Lost submit ACK');
        },
      );
    } else {
      const native = f.sources.estimates.reviewTime.bind(f.sources.estimates);
      vi.spyOn(f.sources.estimates, 'reviewTime').mockImplementation(
        async (...args) => {
          if (mode === 'review-after') await native(...args);
          throw Error('Lost review ACK');
        },
      );
    }
    await expect(
      saveTaskCorrectionReview(f.review, f.input, true),
    ).rejects.toThrow();
    vi.restoreAllMocks();
    const before = JSON.stringify(raw(f)),
      writer = vi.spyOn(f.sources.estimates, 'recordTime'),
      fresh = await readSavedSourceExercise(f.sources, f.job, f.gate),
      d = await reconcileSavedTaskReceipt(fresh);
    expect(d.state).toBe('UNKNOWN');
    expect(d.replay).toBe('FORBIDDEN');
    if (mode === 'record-before') {
      expect(d.classification).toBe('NO_ACKNOWLEDGED_RESULT');
      expect(d.counts.successor_rows).toBe(0);
    }
    if (mode === 'record-after') {
      expect(d.classification).toBe('UNACKNOWLEDGED_SUCCESSOR');
      expect(d.result_id).toBeNull();
      expect(d.native_stage).toBe('UNATTRIBUTED_SUCCESSOR');
    }
    if (mode === 'submit-before') {
      expect(d.classification).toBe('PARTIAL_NATIVE_RESULT');
      expect(d.native_stage).toBe('RECORDED_UNSUBMITTED');
    }
    if (mode === 'submit-after' || mode === 'review-before') {
      expect(d.native_stage).toBe('SUBMITTED_UNREVIEWED');
      expect(d.classification).toBe('PARTIAL_NATIVE_RESULT');
    }
    if (mode === 'review-after') {
      expect(d.native_stage).toBe('APPROVED');
      expect(d.classification).toBe('EXACT_NATIVE_RESULT');
    }
    expect((await reconcileSavedTaskReceipt(fresh)).state).toBe('UNKNOWN');
    await expect(
      saveTaskCorrectionReview(f.review, f.input, true),
    ).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
    expect(JSON.stringify(raw(f))).toBe(before);
  },
);
it('no original claim never attributes an independent native correction', async () => {
  const f = await fixture(),
    id = await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
      job_id: f.job,
      overhead_center: null,
      task: f.input.task,
      kind: 'work',
      started_at: f.input.started_at,
      ended_at: f.input.ended_at,
      billable: true,
      corrects_id: f.id,
    });
  expect(typeof id).toBe('string');
  const d = inspectTaskReceiptReconciliation(
    await readTaskReceiptReconciliation(f.sources, f.job, f.gate),
  );
  expect(d.classification).toBe('NO_ORIGINAL_CLAIM');
  expect(d.source_id).toBeNull();
  expect(d.result_id).toBeNull();
});
it('actual competing successor is a conflict even with one exact acknowledged approved result', async () => {
  const f = await fixture();
  await saveTaskCorrectionReview(f.review, f.input, true);
  await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
    job_id: f.job,
    overhead_center: null,
    task: 'Separate native correction',
    kind: 'work',
    started_at: '2026-10-02T08:00:00Z',
    ended_at: '2026-10-02T09:00:00Z',
    billable: false,
    corrects_id: f.id,
  });
  const d = inspectTaskReceiptReconciliation(
    await readTaskReceiptReconciliation(f.sources, f.job, f.gate),
  );
  expect(d.classification).toBe('CONFLICT_REVIEW_REQUIRED');
  expect(d.counts.successor_rows).toBe(2);
  expect(d.conflicts).toContain('COMPETING_CORRECTIONS');
});
it.each([
  'source-duplicate',
  'result-duplicate',
  'review-duplicate',
  'result-task',
  'result-kind',
  'source-task',
  'foreign-result-job',
  'foreign-result-worker',
  'review-rejected',
  'source-review-duplicate',
  'source-review-rejected',
] as const)(
  'exact canonical ambiguity case %# rejects %s as a successful receipt',
  async (mode) => {
    const f = await fixture();
    await saveTaskCorrectionReview(f.review, f.input, true);
    const native = f.sources.estimates.readSyntheticPrototypeSources.bind(
        f.sources.estimates,
      ),
      foreign = crypto.randomUUID();
    vi.spyOn(
      f.sources.estimates,
      'readSyntheticPrototypeSources',
    ).mockImplementation((t) => {
      const r = native(t),
        source = r.workforce.entries.find((e) => e.id === f.id)!,
        result = r.workforce.entries.find((e) => e.corrects_id === f.id)!;
      if (mode === 'source-duplicate') r.workforce.entries.push({ ...source });
      if (mode === 'result-duplicate') r.workforce.entries.push({ ...result });
      if (mode === 'review-duplicate')
        r.workforce.reviews.push({
          ...r.workforce.reviews.find((e) => e.entry_id === result.id)!,
        });
      if (mode === 'source-review-duplicate')
        r.workforce.reviews.push({
          ...r.workforce.reviews.find((e) => e.entry_id === source.id)!,
        });
      if (mode === 'source-review-rejected')
        r.workforce.reviews.find((e) => e.entry_id === source.id)!.decision =
          'rejected';
      if (mode === 'result-task') result.task = 'Unexpected changed task';
      if (mode === 'result-kind') result.kind = 'break_paid';
      if (mode === 'source-task') source.task = 'Unexpected changed source';
      if (mode === 'foreign-result-job')
        result.job_id = f.all.entries[1].target.job_id;
      if (mode === 'foreign-result-worker') result.worker_id = foreign;
      if (mode === 'review-rejected')
        r.workforce.reviews.find((e) => e.entry_id === result.id)!.decision =
          'rejected';
      return r;
    });
    const d = inspectTaskReceiptReconciliation(
      await readTaskReceiptReconciliation(f.sources, f.job, f.gate),
    );
    expect(d.classification).toBe('CONFLICT_REVIEW_REQUIRED');
    expect(d.conflicts.length).toBeGreaterThan(0);
    if (mode.startsWith('foreign-result')) expect(d.observed_result).toBeNull();
  },
);
it('two concurrent original writers produce one result and independent exact reads never mutate custody', async () => {
  const f = await fixture(),
    write = vi.spyOn(f.sources.estimates, 'recordTime'),
    results = await Promise.allSettled([
      saveTaskCorrectionReview(f.review, f.input, true),
      saveTaskCorrectionReview(f.review, f.input, true),
    ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(write).toHaveBeenCalledTimes(1);
  const view = await readSavedSourceExercise(f.sources, f.job, f.gate),
    before = inspectSavedSourceExercise(view),
    [a, b] = await Promise.all([
      reconcileSavedTaskReceipt(view),
      reconcileSavedTaskReceipt(view),
    ]);
  expect(a).toEqual(b);
  expect(inspectSavedSourceExercise(view)).toEqual(before);
});
it.each(['customer_id', 'location_id', 'version_id', 'job_id'] as const)(
  'foreign selector %s cannot reconcile an original receipt',
  async (key) => {
    const f = await fixture();
    await saveTaskCorrectionReview(f.review, f.input, true);
    const review = await readTaskReceiptReconciliation(
      f.sources,
      f.job,
      f.gate,
    );
    f.entry.target[key] = crypto.randomUUID();
    expect(() => inspectTaskReceiptReconciliation(review)).toThrow();
    await expect(
      readTaskReceiptReconciliation(f.sources, f.job, f.gate),
    ).rejects.toThrow();
  },
);
it.each(['inactive', 'demoted'] as const)(
  'current %s member cannot retain receipt evidence',
  async (mode) => {
    const f = await fixture(),
      actor = f.org + '-estimator';
    await f.sources.operations.manageMember(
      f.org,
      actor,
      true,
      'admin',
      'office_manager',
    );
    f.entry.target.actor_id = actor;
    const review = await readTaskReceiptReconciliation(
      f.sources,
      f.job,
      f.gate,
    );
    await f.sources.operations.manageMember(
      f.org,
      actor,
      mode !== 'inactive',
      mode === 'inactive' ? 'admin' : 'staff',
      'estimator',
    );
    expect(() => inspectTaskReceiptReconciliation(review)).toThrow();
  },
);
it('native plan revision stales a previous receipt display without clearing the original hold', async () => {
  const f = await fixture();
  await saveTaskCorrectionReview(f.review, f.input, true);
  const review = await readTaskReceiptReconciliation(f.sources, f.job, f.gate),
    p = f.sources.property
      .read(f.org)
      .plans.find((p) => p.id === f.entry.plan_id)!;
  f.sources.property.savePlan(f.org, {
    ...p,
    name: 'Actual concurrent plan revision',
  });
  expect(() => inspectTaskReceiptReconciliation(review)).toThrow();
  expect(
    (await readTaskReceiptReconciliation(f.sources, f.job, f.gate)).receipt
      .state,
  ).toBe('KNOWN_SAVED');
});
it('old generic reconciler retains its exact original six-field contract', async () => {
  const f = await fixture();
  await saveTaskCorrectionReview(f.review, f.input, true);
  const view = await readSavedSourceExercise(f.sources, f.job, f.gate),
    d = await reconcileSavedSourceCorrection(view, 'time-correction');
  expect(Object.keys(d)).toEqual([
    'kind',
    'state',
    'source_id',
    'result_id',
    'observed',
    'replay',
  ]);
});
it('OFF rejects before executable source descriptors and action markup', async () => {
  const getter = vi.fn(),
    sources = Object.create(null);
  Object.defineProperty(sources, 'entries', { get: getter });
  await expect(
    readTaskReceiptReconciliation(sources, 'untrusted'),
  ).rejects.toThrow();
  expect(
    renderToStaticMarkup(
      createElement(TaskReceiptActions, {
        sources,
        enabled: false,
        selectedJobId: 'untrusted',
      }),
    ),
  ).toBe('');
  expect(getter).not.toHaveBeenCalled();
});
it.each([0, 1, 2])(
  'brand %i action uses exact read-only receipt labels without duplicating the writer',
  async (brand) => {
    const f = await fixture(brand),
      html = renderToStaticMarkup(
        createElement(TaskReceiptActions, {
          sources: f.sources,
          enabled: true,
          selectedJobId: f.job,
        }),
      );
    expect(html).toContain('Reconcile original task receipt');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('Submit reviewed task correction');
  },
);

it.each(['gate', 'property', 'plan'] as const)(
  'receipt read final hash case %# rejects live %s change',
  async (mode) => {
    const f = await fixture(),
      native = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const out = await native(...args);
      if (
        !changed &&
        new TextDecoder().decode(args[1]).includes('"job_revision"')
      ) {
        changed = true;
        if (mode === 'gate') f.gate.enabled = false;
        if (mode === 'property')
          f.entry.target.location_id = crypto.randomUUID();
        if (mode === 'plan') {
          const plan = f.sources.property
            .read(f.org)
            .plans.find((p) => p.id === f.entry.plan_id)!;
          f.sources.property.savePlan(f.org, {
            ...plan,
            name: 'Concurrent source plan revision',
          });
        }
      }
      return out;
    });
    await expect(
      readTaskReceiptReconciliation(f.sources, f.job, f.gate),
    ).rejects.toThrow();
    expect(changed).toBe(true);
  },
);
it('executable receipt review fields are rejected without reading caller getters', () => {
  const getter = vi.fn(),
    review = Object.create(null);
  Object.defineProperty(review, 'view', { enumerable: true, get: getter });
  review.receipt = {};
  expect(() => inspectTaskReceiptReconciliation(review)).toThrow();
  expect(getter).not.toHaveBeenCalled();
});

async function requestFixture(brand = 0) {
  const f = await fixture(brand),
    view = await readSavedSourceExercise(f.sources, f.job, f.gate),
    source = readSavedRequestAction(view);
  return {
    ...f,
    view,
    source,
    action: {
      request_id: source.request_id,
      status: 'reviewing' as SavedRequestActionInput['status'],
      assigned_to: source.eligible_assignees.find(
        (m) => m.user_id !== f.entry.target.actor_id,
      )!.user_id,
      expected_status: source.status,
      expected_assigned_to: source.assigned_to,
      expected_updated_at: source.updated_at,
    },
  };
}
it.each([0, 1, 2])(
  'brand %i native request action uses original registry without financial or physical authority',
  async (brand) => {
    const f = await requestFixture(brand),
      before = JSON.stringify(raw(f)),
      native = vi.spyOn(f.sources.operations, 'assignIntake'),
      network = vi.spyOn(globalThis, 'fetch');
    const result = await executeSavedRequestAction(f.view, f.action, true);
    expect(result).toEqual({
      status: 'SYNTHETIC_SOURCE_SAVED',
      kind: 'service-request',
      request_id: f.entry.intake_request_id,
    });
    const receipt = await reconcileSavedRequestAction(f.view);
    expect(receipt.state).toBe('KNOWN_SAVED');
    expect(receipt.observed).toBe('EXACT_CURRENT_ROW_OBSERVED');
    expect(receipt.native_cas).toBe(false);
    expect(receipt.durable_receipt).toBe(false);
    expect(receipt.attribution).toBe('CURRENT_ROW_OBSERVATION_ONLY');
    expect(native).toHaveBeenCalledTimes(1);
    expect(network).not.toHaveBeenCalled();
    expect(JSON.stringify(raw(f))).toBe(before);
    const fresh = await readSavedSourceExercise(f.sources, f.job, f.gate);
    expect(readSavedRequestAction(fresh).can_edit).toBe(false);
    await expect(
      executeSavedRequestAction(fresh, f.action, true),
    ).rejects.toThrow();
    expect(native).toHaveBeenCalledTimes(1);
  },
);
it.each(['before', 'after', 'wrong-ack'] as const)(
  'native request lost acknowledgment case %# retains %s uncertainty with exact current row only',
  async (mode) => {
    const f = await requestFixture(),
      original = f.sources.operations.assignIntake.bind(f.sources.operations);
    vi.spyOn(f.sources.operations, 'assignIntake').mockImplementation(
      async (...args) => {
        if (mode !== 'before') await original(...args);
        if (mode === 'wrong-ack') return 'not-void' as never;
        throw Error('Lost native ACK');
      },
    );
    await expect(
      executeSavedRequestAction(f.view, f.action, true),
    ).rejects.toThrow();
    vi.restoreAllMocks();
    const native = vi.spyOn(f.sources.operations, 'assignIntake'),
      r = await reconcileSavedRequestAction(f.view);
    expect(r.state).toBe('UNKNOWN');
    expect(r.observed).toBe(
      mode === 'before' ? 'UNAVAILABLE' : 'EXACT_CURRENT_ROW_OBSERVED',
    );
    expect(r.replay).toBe('FORBIDDEN');
    const fresh = await readSavedSourceExercise(f.sources, f.job, f.gate);
    await expect(
      executeSavedRequestAction(fresh, f.action, true),
    ).rejects.toThrow();
    expect(native).not.toHaveBeenCalled();
  },
);
it('native request concurrency across independent original views admits exactly one invocation', async () => {
  const f = await requestFixture(),
    other = await readSavedSourceExercise(f.sources, f.job, f.gate),
    write = vi.spyOn(f.sources.operations, 'assignIntake'),
    results = await Promise.allSettled([
      executeSavedRequestAction(f.view, f.action, true),
      executeSavedRequestAction(other, { ...f.action }, true),
    ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(write).toHaveBeenCalledTimes(1);
});
it.each(['status', 'assignee', 'updated_at', 'request'] as const)(
  'native request preflight mismatch case %# blocks %s without claiming an attempt',
  async (mode) => {
    const f = await requestFixture(),
      write = vi.spyOn(f.sources.operations, 'assignIntake'),
      input = { ...f.action };
    if (mode === 'status') input.expected_status = 'wrong';
    if (mode === 'assignee') input.assigned_to = 'foreign-member';
    if (mode === 'updated_at')
      input.expected_updated_at = '2000-01-01T00:00:00Z';
    if (mode === 'request') input.request_id = crypto.randomUUID();
    await expect(
      executeSavedRequestAction(f.view, input, true),
    ).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
    expect(readSavedRequestAction(f.view).state).toBe('NOT_ATTEMPTED');
  },
);
it.each(['input', 'gate', 'assignee'] as const)(
  'native request final hash fence case %# blocks %s change before the existing writer',
  async (mode) => {
    const f = await requestFixture(),
      native = crypto.subtle.digest.bind(crypto.subtle),
      write = vi.spyOn(f.sources.operations, 'assignIntake');
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const out = await native(...args);
      if (!changed) {
        changed = true;
        if (mode === 'input') f.action.status = 'closed';
        if (mode === 'gate') f.gate.enabled = false;
        if (mode === 'assignee')
          await f.sources.operations.manageMember(
            f.org,
            f.action.assigned_to,
            false,
            'staff',
            'field_worker',
          );
      }
      return out;
    });
    await expect(
      executeSavedRequestAction(f.view, f.action, true),
    ).rejects.toThrow();
    expect(changed).toBe(true);
    expect(write).not.toHaveBeenCalled();
  },
);
it('later independent request edit is unattributed and never silently replaces the original action', async () => {
  const f = await requestFixture();
  await executeSavedRequestAction(f.view, f.action, true);
  await f.sources.operations.assignIntake(
    f.org,
    f.action.request_id,
    null,
    'new',
  );
  const r = await reconcileSavedRequestAction(f.view);
  expect(r.state).toBe('KNOWN_SAVED');
  expect(r.observed).toBe('SOURCE_CHANGED_UNATTRIBUTED');
  expect(r.current?.status).toBe('new');
  expect(r.requested_status).toBe('reviewing');
  expect(r.durable_receipt).toBe(false);
});
