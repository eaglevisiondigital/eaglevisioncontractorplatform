import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { CustomerPortalPreviewModel } from '../src/lib/customer-preview';
import { Phase3Repository } from '../src/lib/phase3';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  assertServiceDeskCurrentNow,
  assertServiceDeskDetailCurrentNow,
  inspectServiceDeskPreparation,
  openServiceDeskJob,
  openServiceDeskReport,
  prepareServiceDeskReview,
  readServiceDesk,
  type ServiceDeskInput,
} from '../src/lib/workflows/service-desk';
import type { SalesDeskConfirmation } from '../src/lib/workflows/sales-desk';
afterEach(() => vi.restoreAllMocks());
const confirm = (): SalesDeskConfirmation => ({
  confirmed: true,
  association_confirmed: true,
  checks: { scope: true, preference: true, terms: true, boundaries: true },
});
async function fixture(index = 0) {
  const gate = { enabled: true, confirmed: true };
  return {
    sources: await prepareOperatingSources(sampleCompanies[index], gate),
    gate,
    input: { query: '', status: '', page: 0 },
  };
}
it.each([0, 1, 2])(
  'brand %s groups original requests, exact issued/receipt continuity, safe report and existing guarded preparation',
  async (i) => {
    const { sources, gate, input } = await fixture(i),
      before = sources.property.read(sources.company.id),
      versions = await Promise.all(
        sources.entries.map((e) =>
          sources.estimates.get(sources.company.id, e.target.estimate_id),
        ),
      ),
      release = sources.entries.map((e) => e.release.read('staff'));
    const writers = [
      vi.spyOn(sources.estimates, 'create'),
      vi.spyOn(sources.estimates, 'issue'),
      vi.spyOn(sources.estimates, 'approveJob'),
      vi.spyOn(sources.estimates, 'assignJob'),
      vi.spyOn(sources.property, 'publish'),
      vi.spyOn(sources.operations, 'assignIntake'),
      ...sources.entries.map((e) => vi.spyOn(e.release, 'command')),
    ];
    const view = await readServiceDesk(sources, input, gate);
    expect(view).toMatchObject({
      available_requests: 3,
      available_job_handles: 4,
      matching_requests: 3,
      matching_job_handles: 4,
      history_completeness: 'UNKNOWN',
      contract_execution: 'BLOCKED',
    });
    expect(view.requests).toHaveLength(2);
    const group = view.requests.find((g) => g.jobs.length === 2)!;
    expect(group.request.id).toBe(sources.entries[0].intake_request_id);
    const job = group.jobs[0],
      detail = await openServiceDeskJob(view, job.job_id);
    expect(detail.staff.request.id).toBe(group.request.id);
    expect(detail.staff.source.version_id).toBe(job.issued_version_id);
    expect(detail.staff.receipt.id).toBe(job.receipt.id);
    expect(detail.customer_safe.job.reference.job_id).toBe(job.job_id);
    expect(detail.customer_safe.report.reference.location_id).toBe(
      job.location_id,
    );
    expect(JSON.stringify(detail.customer_safe)).not.toMatch(
      /PRIVATE|unit_cost_minor|amount_minor|actor_id|worker_id|internal_notes|supplier|payroll|margin_bps/,
    );
    const report = await openServiceDeskReport(detail);
    expect(report.reference).toEqual(detail.customer_safe.report.reference);
    const packet = await prepareServiceDeskReview(detail, confirm());
    expect(packet.review.lead.id).toBe(group.request.id);
    expect(packet.review.source.version_id).toBe(job.issued_version_id);
    expect(packet.review.receipt.id).toBe(job.receipt.id);
    expect(Object.isFrozen(packet.review.source.scope.lines)).toBe(true);
    expect((await inspectServiceDeskPreparation(packet)).status).toBe(
      'CURRENT_REVIEW_ONLY',
    );
    expect(sources.property.read(sources.company.id)).toEqual(before);
    expect(
      await Promise.all(
        sources.entries.map((e) =>
          sources.estimates.get(sources.company.id, e.target.estimate_id),
        ),
      ),
    ).toEqual(versions);
    expect(sources.entries.map((e) => e.release.read('staff'))).toEqual(
      release,
    );
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
  },
);
it('paginates unique requests and filters by actual recorded status and literal source text', async () => {
  const { sources, gate, input } = await fixture();
  await sources.operations.assignIntake(
    sources.company.id,
    sources.entries[0].intake_request_id,
    null,
    'reviewed',
  );
  const first = await readServiceDesk(sources, input, gate),
    second = await readServiceDesk(sources, { ...input, page: 1 }, gate);
  expect(second.requests).toHaveLength(1);
  expect(
    new Set([...first.requests, ...second.requests].map((g) => g.request.id))
      .size,
  ).toBe(3);
  const filtered = await readServiceDesk(
    sources,
    { ...input, status: 'reviewed' },
    gate,
  );
  expect(filtered.matching_requests).toBe(1);
  expect(filtered.matching_job_handles).toBe(2);
  expect(filtered.requests[0].request.id).toBe(
    sources.entries[0].intake_request_id,
  );
  const exact = await readServiceDesk(
    sources,
    { ...input, query: sources.entries[0].target.version_id },
    gate,
  );
  expect(exact.matching_requests).toBe(1);
  expect(exact.matching_job_handles).toBe(1);
  for (const query of ['.*', '%', 'not-a-recorded-request']) {
    const empty = await readServiceDesk(sources, { ...input, query }, gate);
    expect(empty.requests).toEqual([]);
    expect(empty.available_requests).toBe(3);
  }
});
it('rejects off-page job selection and reconstructed views', async () => {
  const { sources, gate, input } = await fixture(),
    first = await readServiceDesk(sources, input, gate),
    second = await readServiceDesk(sources, { ...input, page: 1 }, gate);
  await expect(
    openServiceDeskJob(first, second.requests[0].jobs[0].job_id),
  ).rejects.toThrow(/visible/);
  await expect(
    openServiceDeskJob(
      JSON.parse(JSON.stringify(first)),
      first.requests[0].jobs[0].job_id,
    ),
  ).rejects.toThrow();
});
it('remains default OFF before private reads', async () => {
  const { sources, input } = await fixture(),
    reader = vi.spyOn(sources.estimates, 'readSyntheticPrototypeSources');
  await expect(readServiceDesk(sources, input)).rejects.toThrow();
  expect(reader).not.toHaveBeenCalled();
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'version_id',
  'job_id',
] as const)(
  'rejects foreign %s without choosing a different source',
  async (key) => {
    const { sources, gate, input } = await fixture();
    sources.entries[0].target[key] = 'foreign';
    await expect(readServiceDesk(sources, input, gate)).rejects.toThrow();
  },
);
it('rejects mismatched original request and receipt', async () => {
  const { sources, gate, input } = await fixture();
  sources.entries[0].receipt_id = sources.entries[1].receipt_id;
  await expect(readServiceDesk(sources, input, gate)).rejects.toThrow();
});
it('current staff revocation withholds both private preparation and safe evidence navigation', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceDesk(sources, input, gate),
    detail = await openServiceDeskJob(view, view.requests[0].jobs[0].job_id);
  await sources.operations.configure(
    sources.company.id,
    'active',
    'starter',
    {},
    sources.company.id + '-backup-owner',
  );
  await sources.operations.revokeOwner(
    sources.company.id,
    sources.entries[0].target.actor_id,
  );
  await expect(prepareServiceDeskReview(detail, confirm())).rejects.toThrow();
  await expect(openServiceDeskReport(detail)).rejects.toThrow();
});
it('does not treat an equal-context replacement customer model as the original source', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceDesk(sources, input, gate),
    row = view.requests[0].jobs[0],
    entry = sources.entries.find((e) => e.target.job_id === row.job_id)!,
    detail = await openServiceDeskJob(view, row.job_id),
    replacement = new CustomerPortalPreviewModel(
      sources.company,
      sources.property,
    );
  replacement.admitLocalJourney(entry.target, gate);
  entry.customerModel = replacement;
  await expect(openServiceDeskReport(detail)).rejects.toThrow();
  expect(() => assertServiceDeskDetailCurrentNow(detail)).toThrow();
});
it('does not inherit an old view after a repository replacement with unchanged target IDs', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceDesk(sources, input, gate);
  sources.estimates = new Phase3Repository(sources.operations);
  await expect(
    openServiceDeskJob(view, view.requests[0].jobs[0].job_id),
  ).rejects.toThrow();
});
it('rejects a later draft/current version rather than comparing the latest implicitly', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceDesk(sources, input, gate),
    row = view.requests[0].jobs[0],
    entry = sources.entries.find((e) => e.target.job_id === row.job_id)!;
  await sources.estimates.revise(sources.company.id, entry.issued);
  await expect(openServiceDeskJob(view, row.job_id)).rejects.toThrow();
});
it('retains immutable source/packet evidence when actual request status changes', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceDesk(sources, input, gate),
    detail = await openServiceDeskJob(view, view.requests[0].jobs[0].job_id),
    packet = await prepareServiceDeskReview(detail, confirm()),
    snapshot = JSON.stringify(packet);
  await sources.operations.assignIntake(
    sources.company.id,
    detail.staff.request.id,
    null,
    'reviewed',
  );
  expect((await inspectServiceDeskPreparation(packet)).status).toBe('UNKNOWN');
  expect((await inspectServiceDeskPreparation(packet)).status).toBe('UNKNOWN');
  expect(JSON.stringify(packet)).toBe(snapshot);
});
it('prevents concurrent and fresh-detail duplicate preparation without replay', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceDesk(sources, input, gate),
    detail = await openServiceDeskJob(view, view.requests[0].jobs[0].job_id),
    results = await Promise.allSettled([
      prepareServiceDeskReview(detail, confirm()),
      prepareServiceDeskReview(detail, confirm()),
    ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const fresh = await openServiceDeskJob(view, view.requests[0].jobs[0].job_id);
  expect(fresh.staff.preparation).toBe('READ_ONLY_PREVIOUS_ATTEMPT');
  await expect(prepareServiceDeskReview(fresh, confirm())).rejects.toThrow(
    /no replay/,
  );
});
it('lost preparation result leaves an exact read-only hold across a new detail', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceDesk(sources, input, gate),
    detail = await openServiceDeskJob(view, view.requests[0].jobs[0].job_id),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let reached = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (body.mode === 'LOCAL_BOOKING_TO_CONTRACT_PREPARATION') {
      reached = true;
      throw Error('Lost acknowledgment');
    }
    return digest(...args);
  });
  await expect(prepareServiceDeskReview(detail, confirm())).rejects.toThrow();
  expect(reached).toBe(true);
  vi.restoreAllMocks();
  const fresh = await openServiceDeskJob(view, view.requests[0].jobs[0].job_id);
  expect(fresh.staff.preparation).toBe('READ_ONLY_PREVIOUS_ATTEMPT');
  await expect(prepareServiceDeskReview(fresh, confirm())).rejects.toThrow(
    /no replay/,
  );
  expect((await openServiceDeskReport(detail)).reference).toEqual(
    detail.customer_safe.report.reference,
  );
});
it.each(['query', 'status', 'target', 'gate'] as const)(
  'rechecks original %s after final queue hash',
  async (change) => {
    const { sources, gate, input } = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let reached = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args),
        body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
      if (body.mode === 'LOCAL_SOURCE_SERVICE_REQUEST_DESK') {
        reached = true;
        if (change === 'query') input.query = 'changed';
        if (change === 'status') input.status = 'reviewed';
        if (change === 'target')
          sources.entries[0].target.location_id = 'foreign';
        if (change === 'gate') gate.confirmed = false;
      }
      return result;
    });
    await expect(readServiceDesk(sources, input, gate)).rejects.toThrow();
    expect(reached).toBe(true);
  },
);
it('rechecks all original inputs after the final combined staff/safe detail hash', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceDesk(sources, input, gate),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let reached = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args),
      body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (body.mode === 'LOCAL_SERVICE_REQUEST_SOURCE_REVIEW') {
      reached = true;
      input.query = 'different';
    }
    return result;
  });
  await expect(
    openServiceDeskJob(view, view.requests[0].jobs[0].job_id),
  ).rejects.toThrow();
  expect(reached).toBe(true);
  expect(() => assertServiceDeskCurrentNow(view)).toThrow();
});
it('requires all exact staff confirmations before consuming a preparation attempt', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceDesk(sources, input, gate),
    detail = await openServiceDeskJob(view, view.requests[0].jobs[0].job_id);
  for (const wrong of [
    { ...confirm(), confirmed: false },
    { ...confirm(), association_confirmed: false },
    { ...confirm(), checks: { ...confirm().checks, terms: false } },
  ])
    await expect(prepareServiceDeskReview(detail, wrong)).rejects.toThrow();
  expect(
    (await prepareServiceDeskReview(detail, confirm())).limits
      .contract_execution,
  ).toBe('BLOCKED');
});
it.each([
  { query: 'x'.repeat(101), status: '', page: 0 },
  { query: '', status: 'x'.repeat(101), page: 0 },
  { query: '', status: '', page: -1 },
  { query: '', status: '', page: 0.5 },
])('rejects invalid literal filter/page %j', async (bad) => {
  const { sources, gate } = await fixture();
  await expect(readServiceDesk(sources, bad, gate)).rejects.toThrow();
});
it('rejects getter/coercive input without invoking it', async () => {
  const { sources, gate, input } = await fixture();
  let invoked = false;
  const getter = Object.defineProperty({ ...input }, 'status', {
    enumerable: true,
    get() {
      invoked = true;
      return '';
    },
  });
  await expect(readServiceDesk(sources, getter, gate)).rejects.toThrow();
  await expect(
    readServiceDesk(
      sources,
      {
        ...input,
        query: {
          toString() {
            invoked = true;
            return '';
          },
        },
      } as unknown as ServiceDeskInput,
      gate,
    ),
  ).rejects.toThrow();
  expect(invoked).toBe(false);
});
it('withholds a prepared result when the original queue filter changes during the existing final packet hash', async () => {
  const { sources, gate, input } = await fixture(),
    view = await readServiceDesk(sources, input, gate),
    jobId = view.requests[0].jobs[0].job_id,
    detail = await openServiceDeskJob(view, jobId),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let reached = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args),
      body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (body.mode === 'LOCAL_BOOKING_TO_CONTRACT_PREPARATION') {
      reached = true;
      input.query = 'changed';
    }
    return result;
  });
  await expect(prepareServiceDeskReview(detail, confirm())).rejects.toThrow();
  expect(reached).toBe(true);
  vi.restoreAllMocks();
  input.query = '';
  const fresh = await readServiceDesk(sources, input, gate),
    readOnly = await openServiceDeskJob(fresh, jobId);
  expect(readOnly.staff.preparation).toBe('READ_ONLY_PREVIOUS_ATTEMPT');
  await expect(prepareServiceDeskReview(readOnly, confirm())).rejects.toThrow(
    /no replay/,
  );
});
