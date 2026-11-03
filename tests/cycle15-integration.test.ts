import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { documentHash } from '../src/domain/release/preview';
import { verifyLedger } from '../src/domain/release/types';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import {
  beginScheduleWorkOrderContinuity,
  prepareScheduleWorkOrderInstructions,
  closeScheduleWorkOrderContinuity,
} from '../src/lib/workflows/schedule-work-order-continuity';
import { reviewWorkOrderRevision } from '../src/lib/workflows/work-order-revisions';
import {
  readFieldTaskEvidence,
  assertFieldTaskEvidenceNow,
  reconcileFieldTaskEvidence,
  returnFieldTaskReview,
} from '../src/lib/workflows/field-task-continuity';
import {
  readFinanceReviewPath,
  openFinanceReviewPath,
  inspectFinanceReviewEvidence,
  assertFinanceReviewPathCurrent,
  returnFinanceReviewPath,
  navigateFinanceReviewPath,
} from '../src/lib/workflows/finance-review-path';
import {
  readServiceReviewRequests,
  selectServiceReviewContext,
  openServiceReviewPath,
  assertServiceReviewPathCurrent,
  openServiceReviewReport,
  openServiceReviewFinding,
  returnServiceReviewRequest,
} from '../src/lib/workflows/service-review-path';
import {
  readMaintenancePlanningContinuity,
  selectMaintenancePlanningSource,
  prepareMaintenancePlanningContinuity,
  closeMaintenancePlanningContinuity,
} from '../src/lib/workflows/maintenance-planning-continuity';
import type { FollowUpReadinessInput } from '../src/lib/workflows/follow-up-readiness';
import {
  readMaintenanceReviewRequirements,
  assertMaintenanceReviewRequirementsNow,
  reconcileMaintenanceReviewRequirements,
  returnMaintenancePlanningReview,
} from '../src/lib/workflows/maintenance-review-path';
import {
  readExplainableTaskLinks,
  openExplainableTaskLink,
  assertExplainableTaskLinkCurrent,
  inspectExplainableDestination,
  returnExplainableTaskLink,
  navigateExplainableTaskLink,
} from '../src/lib/workflows/explainable-task-links';
import {
  readAddonTaskContinuity,
  assertAddonTaskContinuityCurrent,
  openAddonTaskControls,
  resumeAddonTaskControls,
  returnAddonTaskContext,
  reconcileAddonTaskContinuity,
} from '../src/lib/workflows/addon-task-continuity';
import {
  readSourceBoundAddons,
  reviewSourceBoundAddons,
  inspectSourceBoundAddons,
} from '../src/lib/workflows/source-bound-addons';
import { FieldTaskContinuity } from '../src/components/workflows/FieldTaskContinuity';
import { FinanceReviewPath } from '../src/components/workflows/FinanceReviewPath';
import { ServiceReviewPath } from '../src/components/workflows/ServiceReviewPath';
import { MaintenanceReviewPath } from '../src/components/workflows/MaintenanceReviewPath';
import { ExplainableTaskLinks } from '../src/components/workflows/ExplainableTaskLinks';
import { AddonTaskContinuity } from '../src/components/workflows/AddonTaskContinuity';
import { cycle14ContinuityGroups } from '../src/components/workflows/OperatingCenterCycleFourteen';
import { taskReviewGroups } from '../src/components/workflows/task-review-paths';

// Independent compound probes use the real shared repositories and unchanged engines.
// Only explicit setup invokes existing synthetic commands; consumer reads never do.
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
const kinds = [
  'field',
  'finance',
  'customer',
  'growth',
  'intelligence',
  'advanced',
] as const;
type Kind = (typeof kinds)[number];
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[2];
  return { gate, sources, entry };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function fieldInput(f: Fixture) {
  const e = f.entry,
    original = {
      week_start: e.day,
      timezone: e.timezone,
      proposal: {
        job_id: e.target.job_id!,
        day: e.day,
        source_visit_id: e.scheduled_visit_id,
        worker_id: e.worker_id,
        start: e.day + 'T09:00',
        end: e.day + 'T11:00',
        hours_start: e.day + 'T08:00',
        hours_end: e.day + 'T16:00',
      },
    };
  return {
    original,
    proposed: {
      ...original,
      proposal: {
        ...original.proposal,
        start: e.day + 'T12:00',
        end: e.day + 'T14:00',
      },
    },
    expected_revision: 0,
    expires_at: Date.now() + 30 * 60_000,
  };
}
async function fieldOriginal(f: Fixture) {
  const input = fieldInput(f),
    review = await beginScheduleWorkOrderContinuity(f.sources, input, f.gate),
    note = {
      instructions:
        'Independent review: retain the original access and approved-scope evidence.',
    },
    packet = await prepareScheduleWorkOrderInstructions(review, note, f.gate);
  return { input, note, packet };
}
async function growthOriginal(f: Fixture) {
  const input: FollowUpReadinessInput = {
    window: {
      from: '2026-12-28',
      through: '2027-01-25',
      as_of: '2026-12-28T12:00:00.000Z',
      channel: 'email',
    },
    lead_days: 14,
    overdue_days: 7,
    query: '',
    kind: 'all',
    readiness: 'all',
    job_id: f.entry.target.job_id!,
    customer_id: '',
    location_id: '',
    purpose: 'recurring_maintenance',
    channel_state: 'all',
  };
  const view = await readMaintenancePlanningContinuity(
      f.sources,
      input,
      f.gate,
    ),
    row = view.rows.find((r) => r.context.job_id === f.entry.target.job_id)!;
  expect(row).toBeDefined();
  const selected = await selectMaintenancePlanningSource(view, row.key, f.gate),
    proposed = {
      proposed_on: selected.occurrence.recorded_due_on,
      plan_kind: 'follow_up' as const,
    },
    review = await prepareMaintenancePlanningContinuity(
      selected,
      proposed,
      f.gate,
    );
  return { input, selected, proposed, review };
}
function snapshot(f: Fixture) {
  return JSON.stringify({
    property: f.sources.property.read(f.sources.company.id),
    entries: f.sources.entries.map((entry) => ({
      target: entry.target,
      canonical: f.sources.estimates.readSyntheticPrototypeSources(
        entry.target,
      ),
      release: entry.release.read('staff'),
    })),
  });
}
interface Handle {
  value: object;
  current: () => void;
  back: () => unknown | Promise<unknown>;
  copied: () => void;
  verify: () => void | Promise<void>;
}
async function prepare(kind: Kind, f: Fixture): Promise<() => Promise<Handle>> {
  const job = f.entry.target.job_id!;
  switch (kind) {
    case 'field': {
      const original = await fieldOriginal(f);
      return async () => {
        const v = await readFieldTaskEvidence(
          f.sources,
          original.packet,
          f.gate,
        );
        return {
          value: v,
          current: () => assertFieldTaskEvidenceNow(v),
          back: () => returnFieldTaskReview(v),
          copied: () => assertFieldTaskEvidenceNow(structuredClone(v)),
          verify: async () => {
            expect(v.source).toMatchObject({
              job_id: job,
              customer_id: f.entry.target.customer_id,
              location_id: f.entry.target.location_id,
              issued_version_id: f.entry.target.version_id,
            });
            expect(v.predecessor).toEqual(original.packet.predecessor);
            expect(v.instructions.sha256).toBe(
              original.packet.order.integrity.sha256,
            );
            expect(v.technician_day.worker_id).toBe(f.entry.worker_id);
            expect(v.technician_day.actual_availability).toBe('UNKNOWN');
            expect(v.technician_day.time_worked).toBe('NOT_INFERRED');
            expect(v.physical_completion).toBe('UNVERIFIED');
            expect(await returnFieldTaskReview(v)).toBe(original.packet);
            expect((await reconcileFieldTaskEvidence(v)).status).toBe(
              'CURRENT_REVIEW_ONLY',
            );
          },
        };
      };
    }
    case 'finance': {
      const input = { as_of: new Date().toISOString(), input_revision: 1 };
      return async () => {
        const review = await readFinanceReviewPath(f.sources, input, f.gate),
          row = review.jobs.find((j) => j.target.job_id === job)!,
          v = openFinanceReviewPath(review, row.original_exception_ids[0], job);
        return {
          value: v,
          current: () => assertFinanceReviewPathCurrent(v),
          back: () => returnFinanceReviewPath(v),
          copied: () => assertFinanceReviewPathCurrent(structuredClone(v)),
          verify: () => {
            expect(v.anchor.target).toEqual(f.entry.target);
            expect(v.anchor.as_of).toBe(input.as_of);
            expect(v.coverage.costs).toBeNull();
            expect(v.invoice.overall).toBe('NO_GO');
            const detail = inspectFinanceReviewEvidence(v, {
              kind: 'requirement',
              id: 'CONTRACT',
            });
            expect(detail.selection.item?.status).toBe('UNKNOWN');
            expect(detail.invoice_source).toBeNull();
            expect(returnFinanceReviewPath(v)).toMatchObject({
              status: 'CURRENT_EXACT_CASE_RETURN',
              replacement: null,
            });
            expect(returnFinanceReviewPath(v)).toHaveProperty(
              'anchor',
              v.anchor,
            );
          },
        };
      };
    }
    case 'customer': {
      const view = await readServiceReviewRequests(f.sources, f.gate),
        selection = selectServiceReviewContext(view, job)!;
      expect(selection).not.toBeNull();
      return async () => {
        const v = await openServiceReviewPath(view, {
          ...selection,
          staff_context_confirmed: true,
        });
        return {
          value: v,
          current: () => assertServiceReviewPathCurrent(v),
          back: () => returnServiceReviewRequest(v),
          copied: () => assertServiceReviewPathCurrent(structuredClone(v)),
          verify: async () => {
            expect(v.return_context).toEqual(selection);
            expect(v.recorded_job_scope.job_id).toBe(job);
            expect(v.recorded_job_scope.issued_version_id).toBe(
              f.entry.target.version_id,
            );
            expect(v.context.recorded_request_job_link).toBe(
              'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
            );
            expect(v.customer_safe).toMatchObject({
              physical_completion: 'UNKNOWN',
              customer_acceptance: 'UNKNOWN',
              warranty: 'UNKNOWN',
              history_completeness: 'UNKNOWN',
            });
            const doc = v.customer_safe.documentation[0];
            expect(doc).toBeDefined();
            const report = await openServiceReviewReport(
                v,
                doc.report.reference,
              ),
              finding = await openServiceReviewFinding(
                v,
                report.observations[0].reference,
              );
            expect(report.reference).toEqual(doc.report.reference);
            expect(finding.finding).toEqual(report.observations[0]);
            expect(returnServiceReviewRequest(v).view).toBe(view);
            expect(returnServiceReviewRequest(v).selection).toBe(
              v.return_context,
            );
          },
        };
      };
    }
    case 'growth': {
      const original = await growthOriginal(f);
      return async () => {
        const v = await readMaintenanceReviewRequirements(
          original.review,
          f.gate,
        );
        return {
          value: v,
          current: () => assertMaintenanceReviewRequirementsNow(v),
          back: () => returnMaintenancePlanningReview(v),
          copied: () =>
            assertMaintenanceReviewRequirementsNow(structuredClone(v)),
          verify: async () => {
            expect(v.occurrence.context.job_id).toBe(job);
            expect(v.occurrence.plan_reference).toEqual(
              original.selected.occurrence.plan_reference,
            );
            expect(v.original_control).toBe(original.review.original_control);
            expect(v.requested_purpose).toBe(original.input.purpose);
            expect(v.channel).toBe(original.input.window.channel);
            expect(v.current_channel_authority).toBe('UNKNOWN');
            expect(v.purpose_consent).toBe('UNVERIFIED');
            expect(v.suppression).toBe('UNVERIFIED');
            expect(v.operational_authority).toBe('BLOCKED');
            expect(await returnMaintenancePlanningReview(v)).toBe(
              original.review,
            );
          },
        };
      };
    }
    case 'intelligence': {
      const review = await readExplainableTaskLinks(
          f.sources,
          {
            review_on: f.entry.day,
            timezone: f.entry.timezone,
            ordering: 'EVIDENCE_FIRST',
            input_revision: 1,
          },
          f.gate,
        ),
        task = review.tasks.find(
          (t) => t.job_id === job && t.source.kind === 'report',
        )!;
      expect(task).toBeDefined();
      return async () => {
        const v = await openExplainableTaskLink(review, task.key, job);
        return {
          value: v,
          current: () => assertExplainableTaskLinkCurrent(v, job),
          back: () => returnExplainableTaskLink(v, job),
          copied: () =>
            assertExplainableTaskLinkCurrent(structuredClone(v), job),
          verify: () => {
            expect(v.anchor.job_id).toBe(job);
            expect(v.anchor.target).toEqual(task.source.target);
            expect(v.anchor.source_id).toBe(task.source.id);
            expect(v.anchor.source_version).toBe(task.source.version);
            expect(v.original_rank).toBe(task.rank);
            expect(v.order_reasons).toEqual(task.order_reasons);
            const destination = inspectExplainableDestination(v, job),
              callback = vi.fn();
            expect(destination.anchor).toBe(v.anchor);
            expect(destination.expires_at).toBe(v.expires_at);
            expect(
              navigateExplainableTaskLink(destination, callback, job).status,
            ).toBe('ORIGINAL_TASK_REVIEW_REQUESTED');
            expect(callback).toHaveBeenCalledExactlyOnceWith(job, 'completion');
            expect(returnExplainableTaskLink(v, job)).toMatchObject({
              status: 'CURRENT_EXACT_SUGGESTION_RETURN',
              replacement: null,
            });
          },
        };
      };
    }
    case 'advanced': {
      const input = {
        job_id: job,
        kind: 'procurement' as const,
        edition: 'property_services' as const,
      };
      return async () => {
        const v = await readAddonTaskContinuity(f.sources, input, f.gate);
        return {
          value: v,
          current: () => assertAddonTaskContinuityCurrent(v),
          back: () => returnAddonTaskContext(v),
          copied: () => assertAddonTaskContinuityCurrent(structuredClone(v)),
          verify: () => {
            const controls = openAddonTaskControls(v);
            expect(controls.sources).toBe(f.sources);
            expect(controls.selection.reference).toBe(v.source);
            expect(v.source.job_id).toBe(job);
            expect(v.return_context.kind).toBe(input.kind);
            expect(v.return_context.edition).toBe(input.edition);
            expect(resumeAddonTaskControls(v)).toBe(controls);
            expect(returnAddonTaskContext(v)).toBe(v.return_context);
            expect(reconcileAddonTaskContinuity(v)).toMatchObject({
              status: 'CURRENT_SOURCE_CONTEXT_ONLY',
              original_review_status: 'OWNED_BY_RETAINED_ORIGINAL_CONTROL',
              replay: false,
              operational_ready: false,
            });
          },
        };
      };
    }
  }
}

it.each([0, 1, 2])(
  'brand %i composes all six paths over one actual company/property/job source set, exact returns and no business effects',
  async (brand) => {
    const f = await fixture(brand),
      opens = await Promise.all(kinds.map((kind) => prepare(kind, f))),
      before = snapshot(f),
      writers = [
        vi.spyOn(f.sources.estimates, 'create'),
        vi.spyOn(f.sources.estimates, 'save'),
        vi.spyOn(f.sources.estimates, 'issue'),
        vi.spyOn(f.sources.estimates, 'approveJob'),
        vi.spyOn(f.sources.estimates, 'assignJob'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.estimates, 'submitExpense'),
        vi.spyOn(f.sources.property, 'savePlan'),
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.property, 'publish'),
        vi.spyOn(f.sources.operations, 'recordConsent'),
        ...f.sources.entries.map((e) => vi.spyOn(e.release, 'command')),
      ],
      network = vi.spyOn(globalThis, 'fetch');
    const handles = await Promise.all(opens.map((open) => open()));
    for (const h of handles) {
      h.current();
      await h.verify();
      expect(Object.isFrozen(h.value)).toBe(true);
      expect(JSON.stringify(h.value)).not.toMatch(
        /unit_cost_minor|internal_notes|cash_minor|burden_minor|@example|5550100100|PRIVATE staff/,
      );
    }
    expect(snapshot(f)).toBe(before);
    writers.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    expect(network).not.toHaveBeenCalled();
  },
  90_000,
); // Finite budget only for these genuine six-workflow integration cases.

const components: Record<
  Kind,
  ComponentType<{ sources: OperatingSources; enabled?: boolean }>
> = {
  field: FieldTaskContinuity,
  finance: FinanceReviewPath,
  customer: ServiceReviewPath,
  growth: MaintenanceReviewPath,
  intelligence: ExplainableTaskLinks,
  advanced: AddonTaskContinuity,
};
it.each(kinds)(
  '%s default-OFF consumer never touches source getters',
  (kind) => {
    const getter = vi.fn(() => {
        throw Error('Source must remain unread');
      }),
      source = Object.defineProperty({}, 'company', {
        enumerable: true,
        get: getter,
      }) as OperatingSources;
    const html = renderToStaticMarkup(
      createElement(components[kind], { sources: source }),
    );
    expect(html.toLowerCase()).toContain('off');
    expect(getter).not.toHaveBeenCalled();
  },
);
it.each(kinds)(
  '%s copied output cannot confer retained selection or return authority',
  async (kind) => {
    const f = await fixture(),
      open = await prepare(kind, f),
      h = await open();
    expect(h.copied).toThrow();
    h.current();
    expect(await h.back()).toBeDefined();
  },
);
it.each(kinds)(
  '%s current membership withdrawal is terminal for the retained output even if the membership later reappears',
  async (kind) => {
    const f = await fixture(),
      open = await prepare(kind, f),
      h = await open(),
      bytes = JSON.stringify(h.value),
      membership = vi
        .spyOn(f.sources.operations, 'syntheticMemberships')
        .mockReturnValue([]);
    expect(h.current).toThrow();
    membership.mockRestore();
    expect(h.current).toThrow();
    expect(JSON.stringify(h.value)).toBe(bytes);
  },
);
it.each(kinds)(
  '%s final hashing await cannot return evidence after gate withdrawal',
  async (kind) => {
    const f = await fixture(),
      open = await prepare(kind, f),
      real = crypto.subtle.digest.bind(crypto.subtle);
    let reached = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await real(...args);
      if (!reached) {
        reached = true;
        f.gate.confirmed = false;
      }
      return result;
    });
    await expect(open()).rejects.toThrow();
    expect(reached).toBe(true);
  },
);
it.each(kinds)(
  '%s rejects foreign company context and never repairs the retained output by reverting the source',
  async (kind) => {
    const f = await fixture(),
      open = await prepare(kind, f),
      h = await open(),
      original = f.sources.company;
    f.sources.company = sampleCompanies[1];
    expect(h.current).toThrow();
    f.sources.company = original;
    expect(h.current).toThrow();
  },
);

it('same-property jobs keep different issued identities; explicit service context does not fabricate a request-job FK', async () => {
  const f = await fixture(),
    view = await readServiceReviewRequests(f.sources, f.gate),
    group = view.requests.find((r) => r.jobs.length === 2)!;
  const paths = await Promise.all(
    group.jobs.map((job) =>
      openServiceReviewPath(view, {
        request_id: group.request.id,
        job_id: job.job_id,
        staff_context_confirmed: true,
      }),
    ),
  );
  expect(paths).toHaveLength(2);
  expect(paths[0].customer_safe.property.location_id).toBe(
    paths[1].customer_safe.property.location_id,
  );
  expect(paths[0].recorded_job_scope.issued_version_id).not.toBe(
    paths[1].recorded_job_scope.issued_version_id,
  );
  for (const p of paths) {
    expect(p.context.recorded_request_job_link).toMatch(/UNKNOWN/);
    expect(returnServiceReviewRequest(p).view).toBe(view);
    expect(returnServiceReviewRequest(p).selection).toBe(p.return_context);
  }
});
it('exact report navigation rejects a different published version instead of substituting the currently selected job', async () => {
  const f = await fixture(),
    view = await readServiceReviewRequests(f.sources, f.gate),
    selection = selectServiceReviewContext(view, f.entry.target.job_id!)!,
    path = await openServiceReviewPath(view, {
      ...selection,
      staff_context_confirmed: true,
    }),
    reference = path.customer_safe.documentation[0].report.reference;
  await expect(
    openServiceReviewReport(path, { ...reference, published_version: 999 }),
  ).rejects.toThrow();
  expect(path.customer_safe.physical_completion).toBe('UNKNOWN');
});
it('Finance detail uses actual canonical immutable event/posting IDs, snapshot and ledger verifier; no event version or inferred permission', async () => {
  const f = await fixture(),
    e = f.entry,
    release = e.release;
  await release.command('staff', 'create_contract', {
    offer_id: e.offer_id,
    terms: 'Explicit synthetic setup only',
    legal_reference: 'No genuine authorization',
  });
  const contract = release.read('staff').release_contracts[0];
  await release.command('customer', 'sign_contract', {
    contract_id: contract.id,
    document_hash: contract.document_hash,
    typed_name: 'Synthetic fixture',
    consent: true,
  });
  await release.command('staff', 'create_invoice', {
    contract_id: contract.id,
  });
  const invoice = release.read('staff').release_invoices[0],
    amount = invoice.snapshot.schedule[0].amount_minor;
  await release.command('customer', 'authorize_payment', {
    invoice_id: invoice.id,
    amount_minor: amount,
    consent: true,
  });
  const authorization = release.read('staff').release_authorizations[0];
  await release.command('staff', 'synthetic_capture', {
    invoice_id: invoice.id,
    authorization_id: authorization.id,
    amount_minor: amount,
    idempotency_key: crypto.randomUUID(),
    adjusts_event_id: null,
  });
  const before = snapshot(f),
    writer = vi.spyOn(release, 'command'),
    review = await readFinanceReviewPath(
      f.sources,
      { as_of: new Date().toISOString(), input_revision: 1 },
      f.gate,
    ),
    row = review.jobs.find((j) => j.target.job_id === e.target.job_id)!,
    path = openFinanceReviewPath(review, row.original_exception_ids[0]),
    workspace = release.read('staff'),
    event = workspace.release_payment_events[0],
    posting = workspace.release_ledger_entries.find(
      (p) => p.event_id === event.id,
    )!,
    eventDetail = inspectFinanceReviewEvidence(path, {
      kind: 'event',
      id: event.id,
    }),
    postingDetail = inspectFinanceReviewEvidence(path, {
      kind: 'posting',
      id: posting.id,
    });
  expect(eventDetail.event?.id).toBe(event.id);
  expect(postingDetail.posting?.event_id).toBe(event.id);
  expect(eventDetail.event).not.toHaveProperty('version');
  expect(postingDetail.posting).not.toHaveProperty('version');
  expect(eventDetail.invoice_source?.snapshot_sha256).toBe(
    await documentHash(invoice.snapshot),
  );
  expect(eventDetail.invoice_source?.summary?.balance_minor).toBe(
    String(
      verifyLedger(
        invoice,
        workspace.release_ledger_entries,
        workspace.release_payment_events,
      ),
    ),
  );
  expect(path.invoice.overall).toBe('NO_GO');
  expect(snapshot(f)).toBe(before);
  expect(writer).not.toHaveBeenCalled();
});
it('an exact financial exception cannot be opened under another admitted job hint', async () => {
  const f = await fixture(),
    review = await readFinanceReviewPath(
      f.sources,
      { as_of: new Date().toISOString(), input_revision: 1 },
      f.gate,
    ),
    row = review.jobs.find((j) => j.target.job_id === f.entry.target.job_id)!;
  expect(() =>
    openFinanceReviewPath(
      review,
      row.original_exception_ids[0],
      f.sources.entries[0].target.job_id!,
    ),
  ).toThrow();
  const callback = vi.fn(),
    path = openFinanceReviewPath(review, row.original_exception_ids[0]);
  f.gate.confirmed = false;
  expect(navigateFinanceReviewPath(path, callback).status).toBe('UNKNOWN');
  expect(callback).not.toHaveBeenCalled();
});
it('a competing original work-order successor makes old task evidence UNKNOWN without choosing newest instructions', async () => {
  const f = await fixture(),
    original = await fieldOriginal(f),
    evidence = await readFieldTaskEvidence(f.sources, original.packet, f.gate);
  await reviewWorkOrderRevision(
    f.sources,
    {
      schedule: { ...structuredClone(original.input), expected_revision: 2 },
      instructions: 'Distinct manually confirmed successor',
    },
    f.gate,
  );
  expect(() => assertFieldTaskEvidenceNow(evidence)).toThrow();
  expect((await reconcileFieldTaskEvidence(evidence)).status).toBe('UNKNOWN');
  await expect(returnFieldTaskReview(evidence)).rejects.toThrow();
});
it('known field cancellation does not mask current source withdrawal', async () => {
  const f = await fixture(),
    original = await fieldOriginal(f),
    evidence = await readFieldTaskEvidence(f.sources, original.packet, f.gate);
  closeScheduleWorkOrderContinuity(original.packet, 'CANCEL');
  expect((await reconcileFieldTaskEvidence(evidence)).status).toBe('CANCELLED');
  f.sources.entries = [...f.sources.entries];
  expect((await reconcileFieldTaskEvidence(evidence)).status).toBe('UNKNOWN');
  await expect(returnFieldTaskReview(evidence)).rejects.toThrow();
});
it('known maintenance revocation does not become permission or mask withdrawn membership', async () => {
  const f = await fixture(),
    original = await growthOriginal(f),
    evidence = await readMaintenanceReviewRequirements(original.review, f.gate);
  closeMaintenancePlanningContinuity(original.review, 'REVOKE');
  expect((await reconcileMaintenanceReviewRequirements(evidence)).status).toBe(
    'REVOKED_LOCAL_REVIEW',
  );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockReturnValue([]);
  expect((await reconcileMaintenanceReviewRequirements(evidence)).status).toBe(
    'UNKNOWN',
  );
  await expect(returnMaintenancePlanningReview(evidence)).rejects.toThrow();
});
it.each(['field', 'growth'] as const)(
  '%s lost evidence ACK cannot replay preparation after restoring transport',
  async (kind) => {
    const f = await fixture(),
      open = await prepare(kind, f),
      digest = vi
        .spyOn(crypto.subtle, 'digest')
        .mockRejectedValueOnce(Error('Independent lost acknowledgement'));
    await expect(open()).rejects.toThrow();
    digest.mockRestore();
    const again = vi.spyOn(crypto.subtle, 'digest');
    await expect(open()).rejects.toThrow();
    expect(again).not.toHaveBeenCalled();
  },
);
it('a rejected Intelligence host callback leaves original handoff terminal UNKNOWN across destination and return', async () => {
  const f = await fixture(),
    review = await readExplainableTaskLinks(
      f.sources,
      {
        review_on: f.entry.day,
        timezone: f.entry.timezone,
        ordering: 'EVIDENCE_FIRST',
        input_revision: 1,
      },
      f.gate,
    ),
    task = review.tasks.find(
      (t) => t.job_id === f.entry.target.job_id && t.source.kind === 'report',
    )!,
    link = await openExplainableTaskLink(review, task.key),
    destination = inspectExplainableDestination(link),
    callback = vi.fn(() => {
      throw Error('Host target withdrawn');
    });
  expect(navigateExplainableTaskLink(destination, callback).status).toBe(
    'UNKNOWN',
  );
  expect(callback).toHaveBeenCalledOnce();
  expect(returnExplainableTaskLink(link).status).toBe('UNKNOWN');
  expect(() => inspectExplainableDestination(link)).toThrow();
  expect(navigateExplainableTaskLink(destination, vi.fn()).status).toBe(
    'UNKNOWN',
  );
  await expect(openExplainableTaskLink(review, task.key)).rejects.toThrow();
});
it('Intelligence explanation/destination return cannot renew an expired original finite window', async () => {
  const f = await fixture(),
    review = await readExplainableTaskLinks(
      f.sources,
      {
        review_on: f.entry.day,
        timezone: f.entry.timezone,
        ordering: 'EVIDENCE_FIRST',
        input_revision: 1,
      },
      f.gate,
    ),
    task = review.tasks.find(
      (t) => t.job_id === f.entry.target.job_id && t.source.kind === 'report',
    )!,
    link = await openExplainableTaskLink(review, task.key),
    bytes = JSON.stringify(link);
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(link.expires_at));
  expect(returnExplainableTaskLink(link).status).toBe('UNKNOWN');
  expect(() => inspectExplainableDestination(link)).toThrow();
  expect(JSON.stringify(link)).toBe(bytes);
});
it('Advanced return keeps the same original engine UNKNOWN, while source-context metadata cannot claim review success', async () => {
  const f = await fixture(),
    input = {
      job_id: f.entry.target.job_id!,
      kind: 'procurement' as const,
      edition: 'property_services' as const,
    },
    task = await readAddonTaskContinuity(f.sources, input, f.gate),
    controls = openAddonTaskControls(task),
    original = await readSourceBoundAddons(
      controls.sources,
      controls.selection,
      f.gate,
    ),
    real = crypto.subtle.digest.bind(crypto.subtle);
  let lost = false;
  const digest = vi
    .spyOn(crypto.subtle, 'digest')
    .mockImplementation(async (...args) => {
      const bytes = await real(...args),
        body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
      if (!lost && body.mode === 'LOCAL_EXTERNAL_PROPOSAL_LIFECYCLE') {
        lost = true;
        throw Error('Lost original comparison acknowledgement');
      }
      return bytes;
    });
  const confirmation = {
    confirmed: true,
    reviewed_source_sha256: original.integrity.sha256,
    external_reference: 'independent-retained-source',
    review_expires_at_ms: 2000,
  };
  await expect(
    reviewSourceBoundAddons(original, confirmation, { now_ms: 1000 }),
  ).rejects.toThrow();
  expect(lost).toBe(true);
  digest.mockRestore();
  expect(resumeAddonTaskControls(task)).toBe(controls);
  expect(returnAddonTaskContext(task)).toBe(task.return_context);
  expect((await inspectSourceBoundAddons(original)).status).toBe('UNKNOWN');
  expect(reconcileAddonTaskContinuity(task)).toMatchObject({
    status: 'CURRENT_SOURCE_CONTEXT_ONLY',
    original_review_status: 'OWNED_BY_RETAINED_ORIGINAL_CONTROL',
    operational_ready: false,
  });
  const freshTask = await readAddonTaskContinuity(
      f.sources,
      { ...input },
      f.gate,
    ),
    freshControls = openAddonTaskControls(freshTask),
    freshRead = await readSourceBoundAddons(
      freshControls.sources,
      freshControls.selection,
      f.gate,
    );
  await expect(
    reviewSourceBoundAddons(
      freshRead,
      {
        ...confirmation,
        reviewed_source_sha256: freshRead.integrity.sha256,
        external_reference: 'relabelled',
      },
      { now_ms: 1000 },
    ),
  ).rejects.toThrow(/Existing lifecycle/);
});
it('Main guided composition changes only renderers of the original six finite destinations and rejects missing/extra slots', () => {
  const panels = cycle14ContinuityGroups.flatMap((g) => g.panels),
    render = () => null,
    replacements = Object.fromEntries(panels.map((p) => [p.id, render])),
    composed = taskReviewGroups(replacements);
  expect(panels).toHaveLength(6);
  expect(
    composed.map((g) => ({
      ...g,
      panels: g.panels.map(({ render: omitted, ...p }) => {
        expect(omitted).toBe(render);
        return p;
      }),
    })),
  ).toEqual(
    cycle14ContinuityGroups.map((g) => ({
      ...g,
      panels: g.panels.map(({ render: omitted, ...p }) => {
        expect(typeof omitted).toBe('function');
        return p;
      }),
    })),
  );
  expect(() => taskReviewGroups({ ...replacements, extra: render })).toThrow();
  const missing = { ...replacements };
  delete missing[panels[0].id];
  expect(() => taskReviewGroups(missing)).toThrow();
});
