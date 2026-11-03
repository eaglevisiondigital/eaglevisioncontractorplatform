import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  beginScheduleWorkOrderContinuity,
  prepareScheduleWorkOrderInstructions,
  closeScheduleWorkOrderContinuity,
} from '../src/lib/workflows/schedule-work-order-continuity';
import { reviewWorkOrderRevision } from '../src/lib/workflows/work-order-revisions';
import {
  readFieldTaskEvidence as read,
  assertFieldTaskEvidenceNow as current,
  reconcileFieldTaskEvidence as reconcile,
  returnFieldTaskReview as back,
} from '../src/lib/workflows/field-task-continuity';
import { FieldTaskContinuity } from '../src/components/workflows/FieldTaskContinuity';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand = 0, index = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    e = sources.entries[index];
  const original = {
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
  const input = {
    original,
    proposed: {
      ...original,
      proposal: {
        ...original.proposal,
        start: e.day + 'T11:00',
        end: e.day + 'T13:00',
      },
    },
    expected_revision: 0,
    expires_at: Date.now() + 30 * 60_000,
  };
  const handoff = await beginScheduleWorkOrderContinuity(sources, input, gate),
    note = {
      instructions: 'Protect the access path; do not amend approved scope.',
    },
    packet = await prepareScheduleWorkOrderInstructions(handoff, note, gate);
  return { gate, sources, e, input, handoff, note, packet };
}
it.each([0, 1, 2])(
  'brand %s follows original predecessor/instructions to exact technician-day and back without canonical writes',
  async (brand) => {
    const f = await fixture(brand, 2),
      before = JSON.stringify(f.sources.property.read(f.sources.company.id)),
      jobs = await f.sources.estimates.jobs(f.sources.company.id);
    const writers = [
        vi.spyOn(f.sources.estimates, 'assignJob'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.property, 'saveVisit'),
      ],
      network = vi.spyOn(globalThis, 'fetch');
    const view = await read(f.sources, f.packet, f.gate);
    expect(view.source.job_id).toBe(f.e.target.job_id);
    expect(view.source.customer_id).toBe(f.e.target.customer_id);
    expect(view.source.location_id).toBe(f.e.target.location_id);
    expect(view.source.issued_version_id).toBe(f.e.target.version_id);
    expect(view.predecessor).toEqual(f.packet.predecessor);
    expect(view.instructions).toEqual({
      revision: f.packet.order.revision,
      text: f.note.instructions,
      sha256: f.packet.order.integrity.sha256,
    });
    expect(view.technician_day.worker_id).toBe(f.e.worker_id);
    expect(view.technician_day.day).toBe(f.e.day);
    expect(
      view.technician_day.events.every(
        (event) => event.job_id === f.e.target.job_id,
      ),
    ).toBe(true);
    expect(view.technician_day.actual_availability).toBe('UNKNOWN');
    expect(view.technician_day.time_worked).toBe('NOT_INFERRED');
    expect(view.physical_completion).toBe('UNVERIFIED');
    expect(
      Object.values(view.authority).every((value) => value === false),
    ).toBe(true);
    expect(Object.isFrozen(view.technician_day.events)).toBe(true);
    expect((await reconcile(view)).status).toBe('CURRENT_REVIEW_ONLY');
    expect(await back(view)).toBe(f.packet);
    expect(JSON.stringify(view)).not.toMatch(
      /unit_cost|supplier|payroll|PRIVATE|@example.invalid/,
    );
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      before,
    );
    expect(await f.sources.estimates.jobs(f.sources.company.id)).toEqual(jobs);
    expect(writers.every((writer) => writer.mock.calls.length === 0)).toBe(
      true,
    );
    expect(network).not.toHaveBeenCalled();
  },
);
it('OFF precedes both source and retained-view access', async () => {
  const getter = vi.fn(),
    source = Object.defineProperty({}, 'gate', { get: getter }) as Awaited<
      ReturnType<typeof fixture>
    >['sources'],
    view = Object.defineProperty({}, 'job_id', { get: getter }) as Awaited<
      ReturnType<typeof fixture>
    >['packet'];
  await expect(read(source, view)).rejects.toThrow();
  expect(
    renderToStaticMarkup(
      createElement(FieldTaskContinuity, { sources: source }),
    ),
  ).toContain('continuity is off');
  expect(getter).not.toHaveBeenCalled();
});
it('cloned evidence and copied original continuity do not confer reader authority', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.packet, f.gate),
    copy = structuredClone(v);
  expect(() => current(copy)).toThrow();
  expect((await reconcile(copy)).status).toBe('UNKNOWN');
  await expect(back(copy)).rejects.toThrow();
  await expect(
    read(f.sources, structuredClone(f.packet), f.gate),
  ).rejects.toThrow();
});
it.each([1, 2])(
  'brand %s cannot substitute another company source environment',
  async (brand) => {
    const f = await fixture(),
      foreign = await prepareOperatingSources(sampleCompanies[brand], {
        enabled: true,
        confirmed: true,
      });
    await expect(read(foreign, f.packet, f.gate)).rejects.toThrow();
  },
);
it.each(['CANCEL', 'REVOKE'] as const)(
  '%s withdraws the exact predecessor and prevents evidence navigation',
  async (action) => {
    const f = await fixture(),
      v = await read(f.sources, f.packet, f.gate);
    closeScheduleWorkOrderContinuity(f.packet, action);
    await expect(back(v)).rejects.toThrow();
    expect((await reconcile(v)).status).toBe('UNKNOWN');
    await expect(read(f.sources, f.packet, f.gate)).rejects.toThrow();
  },
);
it('expiration withholds evidence and cannot silently start a replacement lineage', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.packet, f.gate);
  vi.spyOn(Date, 'now').mockReturnValue(f.input.expires_at);
  expect(() => current(v)).toThrow();
  await expect(back(v)).rejects.toThrow();
  expect((await reconcile(v)).status).toBe('UNKNOWN');
});
it.each(['source', 'staff', 'gate', 'job', 'instructions', 'clock'] as const)(
  'post-return %s change retains UNKNOWN and immutable snapshot',
  async (kind) => {
    const f = await fixture(),
      v = await read(f.sources, f.packet, f.gate),
      saved = JSON.stringify(v);
    if (kind === 'source') f.sources.entries = [...f.sources.entries];
    if (kind === 'staff')
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockReturnValue(
        [],
      );
    if (kind === 'gate') f.gate.confirmed = false;
    if (kind === 'job')
      vi.spyOn(f.sources.estimates, 'syntheticJob').mockImplementation(
        () => null,
      );
    if (kind === 'instructions')
      f.note.instructions = 'Changed retained instruction';
    if (kind === 'clock') vi.spyOn(Date, 'now').mockReturnValue(0);
    expect(() => current(v)).toThrow();
    expect((await reconcile(v)).status).toBe('UNKNOWN');
    await expect(back(v)).rejects.toThrow();
    expect(JSON.stringify(v)).toBe(saved);
  },
);
it.each(['staff', 'source', 'input'] as const)(
  'late %s withdrawal during original evidence await withholds the result permanently',
  async (kind) => {
    const f = await fixture(),
      real = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const r = await real(...args);
      if (!changed) {
        changed = true;
        if (kind === 'staff')
          vi.spyOn(
            f.sources.operations,
            'syntheticMemberships',
          ).mockReturnValue([]);
        if (kind === 'source') f.sources.entries = [...f.sources.entries];
        if (kind === 'input')
          f.input.proposed.proposal.end = f.input.original.proposal.end;
      }
      return r;
    });
    await expect(read(f.sources, f.packet, f.gate)).rejects.toThrow();
    vi.restoreAllMocks();
    await expect(read(f.sources, f.packet, f.gate)).rejects.toThrow();
  },
);
it('competing original successor invalidates old task evidence instead of substituting newest instructions', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.packet, f.gate);
  await reviewWorkOrderRevision(
    f.sources,
    {
      schedule: { ...structuredClone(f.input), expected_revision: 2 },
      instructions: 'Separate explicit staff successor',
    },
    f.gate,
  );
  await expect(back(v)).rejects.toThrow();
  expect((await reconcile(v)).status).toBe('UNKNOWN');
});
it('lost evidence acknowledgement is held; exact read-only reconciliation never invokes review again', async () => {
  const f = await fixture(),
    real = crypto.subtle.digest.bind(crypto.subtle);
  let lost = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const r = await real(...args);
    if (!lost) {
      lost = true;
      throw Error('Lost acknowledgement');
    }
    return r;
  });
  await expect(read(f.sources, f.packet, f.gate)).rejects.toThrow();
  vi.restoreAllMocks();
  const digest = vi.spyOn(crypto.subtle, 'digest');
  await expect(read(f.sources, f.packet, f.gate)).rejects.toThrow();
  expect(digest).not.toHaveBeenCalled();
});
it.each(['https:', 'file:', 'data:'])(
  'protocol %s stays off without accessing sources',
  (protocol) => {
    vi.stubGlobal('window', { location: { hostname: 'localhost', protocol } });
    const getter = vi.fn(),
      sources = Object.defineProperty({}, 'gate', { get: getter }) as Awaited<
        ReturnType<typeof fixture>
      >['sources'];
    expect(
      renderToStaticMarkup(
        createElement(FieldTaskContinuity, { sources, enabled: true }),
      ),
    ).toContain('continuity is off');
    expect(getter).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %s carries an exact selected job into accessible controls without default substitution',
  async (brand) => {
    const f = await fixture(brand),
      selectedJobId = f.sources.entries[2].target.job_id!;
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', protocol: 'http:' },
    });
    const html = renderToStaticMarkup(
      createElement(FieldTaskContinuity, {
        sources: f.sources,
        enabled: true,
        selectedJobId,
      }),
    );
    expect(html).toContain('value="' + selectedJobId + '" selected');
    expect(html).toContain('Review field task schedule');
    expect(html).toContain('human proposals only');
    expect(html).not.toMatch(/PRIVATE|supplier|payroll/);
  },
);
it('foreign selected job hint does not select a fallback job', async () => {
  const f = await fixture();
  vi.stubGlobal('window', {
    location: { hostname: 'localhost', protocol: 'http:' },
  });
  const html = renderToStaticMarkup(
    createElement(FieldTaskContinuity, {
      sources: f.sources,
      enabled: true,
      selectedJobId: 'foreign-job',
    }),
  );
  expect(html).toContain(
    'No exact authorized job selected. No fallback selection.',
  );
  expect(html).toMatch(/<button disabled="">Review field task schedule/);
});
