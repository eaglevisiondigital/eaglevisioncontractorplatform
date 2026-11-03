import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { CustomerPortalPreviewModel } from '../src/lib/customer-preview';
import { Phase3Repository } from '../src/lib/phase3';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import { ServiceSourceContinuity } from '../src/components/workflows/ServiceSourceContinuity';
import {
  readServiceSourceContinuity,
  openServiceSourceReport,
  openServiceSourceFinding,
  selectServiceSourceJob,
  assertServiceSourceContinuityCurrentNow,
  inspectServiceSourceContinuity,
  type ServiceSourceInput,
} from '../src/lib/workflows/service-source-continuity';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture(index = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[index], gate),
    input = { job_id: sources.entries[0].target.job_id! };
  return { sources, gate, input };
}
async function inspected(index = 0) {
  const f = await fixture(index),
    read = await readServiceSourceContinuity(f.sources, f.input, f.gate);
  return { ...f, read };
}
function digestChange(mode: string, change: () => void | Promise<void>) {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let fired = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args),
      body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (!fired && body.mode === mode) {
      fired = true;
      await change();
    }
    return value;
  });
  return () => expect(fired).toBe(true);
}
it.each([0, 1, 2])(
  'brand %i preserves actual request → issued job → original report/version → exact Passport finding without effects',
  async (index) => {
    const { sources, gate, input } = await fixture(index),
      before = sources.property.read(sources.company.id),
      releases = sources.entries.map((e) => e.release.read('staff')),
      writers = [
        vi.spyOn(sources.estimates, 'create'),
        vi.spyOn(sources.estimates, 'save'),
        vi.spyOn(sources.estimates, 'issue'),
        vi.spyOn(sources.estimates, 'approveJob'),
        vi.spyOn(sources.property, 'saveVisit'),
        vi.spyOn(sources.property, 'publish'),
        ...sources.entries.map((e) => vi.spyOn(e.release, 'command')),
      ],
      ids = vi.spyOn(crypto, 'randomUUID'),
      read = await readServiceSourceContinuity(sources, input, gate),
      e = sources.entries[0];
    expect(read.staff_request.id).toBe(e.intake_request_id);
    expect(read.customer_safe.scope).toMatchObject({
      job_id: e.target.job_id,
      issued_version_id: e.target.version_id,
    });
    expect(read.customer_safe.property.customer_id).toBe(e.target.customer_id);
    expect(read.request_scope_relationship).toBe(
      'EXPLICIT_STAFF_SELECTION_NOT_RECORDED_REQUEST_ESTIMATE_FK',
    );
    for (const doc of read.customer_safe.documentation) {
      const report = await openServiceSourceReport(read, doc.report.reference);
      expect(report).toEqual(doc.report);
      for (const observation of report.observations) {
        const finding = await openServiceSourceFinding(
          read,
          observation.reference,
        );
        expect(finding.finding).toEqual(observation);
        expect(finding.report_reference).toEqual(report.reference);
      }
    }
    expect(selectServiceSourceJob(read)).toBe(input.job_id);
    expect(inspectServiceSourceContinuity(read).status).toBe(
      'CURRENT_EXACT_READ_ONLY',
    );
    expect(read.customer_safe).toMatchObject({
      physical_completion: 'UNKNOWN',
      customer_acceptance: 'UNKNOWN',
      warranty: 'UNKNOWN',
      history_completeness: 'UNKNOWN',
    });
    expect(Object.isFrozen(read.customer_safe.documentation)).toBe(true);
    expect(sources.property.read(sources.company.id)).toEqual(before);
    expect(sources.entries.map((e) => e.release.read('staff'))).toEqual(
      releases,
    );
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
    expect(ids).not.toHaveBeenCalled();
  },
);
it('same-property sibling jobs stay distinct and sibling report links remain UNKNOWN', async () => {
  const { sources, gate, input, read } = await inspected(),
    sibling = sources.entries.find(
      (e) =>
        e.target.location_id === sources.entries[0].target.location_id &&
        e.target.job_id !== input.job_id,
    )!,
    other = await readServiceSourceContinuity(
      sources,
      { job_id: sibling.target.job_id! },
      gate,
    );
  expect(other.customer_safe.property.location_id).toBe(
    read.customer_safe.property.location_id,
  );
  expect(other.customer_safe.scope.issued_version_id).not.toBe(
    read.customer_safe.scope.issued_version_id,
  );
  expect(
    read.customer_safe.documentation
      .map((d) => d.selected_job_association)
      .sort(),
  ).toEqual(['EXACT_RECORDED_JOB_LINK', 'UNKNOWN']);
  expect(selectServiceSourceJob(other)).toBe(sibling.target.job_id);
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'report_id',
  'published_version',
  'kind',
] as const)(
  'denies wrong exact report %s without current/latest fallback',
  async (key) => {
    const { read } = await inspected(),
      ref = { ...read.customer_safe.documentation[0].report.reference };
    Object.assign(ref, { [key]: key === 'published_version' ? 99 : 'foreign' });
    await expect(openServiceSourceReport(read, ref)).rejects.toThrow();
  },
);
it.each(['finding_id', 'source_index', 'published_version'] as const)(
  'denies wrong exact finding %s',
  async (key) => {
    const { read } = await inspected(),
      ref = {
        ...read.customer_safe.documentation[0].report.observations[0].reference,
      };
    Object.assign(ref, {
      [key]:
        key === 'source_index' || key === 'published_version' ? 99 : 'foreign',
    });
    await expect(openServiceSourceFinding(read, ref)).rejects.toThrow();
  },
);
it('foreign job and reconstructed reads confer no authority', async () => {
  const { sources, gate, input, read } = await inspected();
  await expect(
    readServiceSourceContinuity(sources, { job_id: 'foreign' }, gate),
  ).rejects.toThrow();
  const copy = JSON.parse(JSON.stringify(read));
  await expect(
    openServiceSourceReport(
      copy,
      read.customer_safe.documentation[0].report.reference,
    ),
  ).rejects.toThrow(/retained/);
  expect(() => selectServiceSourceJob(copy)).toThrow(/retained/);
  expect(input.job_id).toBe(read.customer_safe.scope.job_id);
});
it.each(['input', 'gate', 'root', 'model', 'source', 'member'] as const)(
  'last continuity hash checks %s',
  async (kind) => {
    const f = await fixture(),
      reached = digestChange('LOCAL_SERVICE_SOURCE_CONTINUITY', async () => {
        if (kind === 'input') f.input.job_id = 'foreign';
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'root') f.sources.entries = [...f.sources.entries];
        if (kind === 'model') f.sources.entries[0].customerModel.logout();
        if (kind === 'source')
          await f.sources.estimates.revise(
            f.sources.company.id,
            f.sources.entries[0].issued,
          );
        if (kind === 'member') {
          await f.sources.operations.configure(
            f.sources.company.id,
            'active',
            'starter',
            {},
            f.sources.company.id + '-backup-owner',
          );
          await f.sources.operations.revokeOwner(
            f.sources.company.id,
            f.sources.entries[0].target.actor_id,
          );
        }
      });
    await expect(
      readServiceSourceContinuity(f.sources, f.input, f.gate),
    ).rejects.toThrow();
    reached();
  },
);
it('report reference changed at final await stays UNKNOWN after restoration', async () => {
  const { read } = await inspected(),
    ref = { ...read.customer_safe.documentation[0].report.reference },
    original = ref.published_version,
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let fired = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args);
    fired = true;
    ref.published_version = 99;
    return value;
  });
  await expect(openServiceSourceReport(read, ref)).rejects.toThrow();
  expect(fired).toBe(true);
  ref.published_version = original;
  expect(inspectServiceSourceContinuity(read).status).toBe('UNKNOWN');
  expect(() => selectServiceSourceJob(read)).toThrow(/UNKNOWN/);
});
it('lost read ACK offers no replay or replacement', async () => {
  const { read } = await inspected();
  vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(
    Error('lost read ACK'),
  );
  await expect(
    openServiceSourceReport(
      read,
      read.customer_safe.documentation[0].report.reference,
    ),
  ).rejects.toThrow();
  expect(inspectServiceSourceContinuity(read)).toEqual({
    status: 'UNKNOWN',
    replay: false,
    replacement: null,
  });
});
it.each(['model', 'repository', 'logout', 'gate'] as const)(
  'render/navigation withdraws %s changes and cannot restore the retained read',
  async (kind) => {
    const f = await inspected(),
      e = f.sources.entries[0];
    if (kind === 'model') {
      const model = new CustomerPortalPreviewModel(
        f.sources.company,
        f.sources.property,
      );
      model.admitLocalJourney(e.target, f.gate);
      e.customerModel = model;
    }
    if (kind === 'repository')
      f.sources.estimates = new Phase3Repository(f.sources.operations);
    if (kind === 'logout') e.customerModel.logout();
    if (kind === 'gate') f.gate.enabled = false;
    expect(() => assertServiceSourceContinuityCurrentNow(f.read)).toThrow();
    f.gate.enabled = true;
    expect(inspectServiceSourceContinuity(f.read).status).toBe('UNKNOWN');
    expect(() => selectServiceSourceJob(f.read)).toThrow();
  },
);
it('later empty after documentation never rewrites history or verifies physical completion', async () => {
  const { sources, gate, input, read } = await inspected(),
    original = JSON.stringify(read),
    e = sources.entries[0];
  let visit = sources.property.addVisit(
    sources.company.id,
    e.plan_id,
    '2026-12-21',
    'after',
  );
  sources.property.saveVisit(sources.company.id, visit, {
    summary: 'No new findings recorded.',
    internal_notes: 'PRIVATE',
    checklist: [],
    findings: [],
  });
  visit = sources.property
    .read(sources.company.id)
    .visits.find((v) => v.id === visit.id)!;
  sources.property.submit(sources.company.id, visit);
  visit = sources.property
    .read(sources.company.id)
    .visits.find((v) => v.id === visit.id)!;
  sources.property.publish(sources.company.id, visit);
  expect(inspectServiceSourceContinuity(read).status).toBe('UNKNOWN');
  expect(JSON.stringify(read)).toBe(original);
  const newer = await readServiceSourceContinuity(sources, input, gate);
  expect(newer.customer_safe.documentation.length).toBeGreaterThan(
    read.customer_safe.documentation.length,
  );
  expect(newer.customer_safe).toMatchObject({
    physical_completion: 'UNKNOWN',
    customer_acceptance: 'UNKNOWN',
    warranty: 'UNKNOWN',
  });
});
it('customer-safe projection excludes private staff/cost/rate/supplier/receipt and other customers', async () => {
  const { sources, read } = await inspected(),
    text = JSON.stringify(read.customer_safe);
  for (const term of [
    'PRIVATE',
    'unit_cost_minor',
    'internal_notes',
    'supplier_cost',
    'hourly_rate_minor',
    'worker_id',
    'actor_id',
    'payroll',
    sources.entries[0].receipt_id,
    sources.entries[0].offer_id,
    sources.entries[1].target.customer_id,
    sources.entries[1].report_id,
  ])
    expect(text).not.toContain(term);
});
it.each(['input', 'source', 'report', 'finding', 'coercion'] as const)(
  'rejects %s getters/coercion without execution',
  async (kind) => {
    const f = await inspected(),
      called = vi.fn(() => '');
    if (kind === 'input')
      await expect(
        readServiceSourceContinuity(
          f.sources,
          Object.defineProperty({ ...f.input }, 'job_id', {
            enumerable: true,
            get: called,
          }),
          f.gate,
        ),
      ).rejects.toThrow();
    if (kind === 'source')
      await expect(
        readServiceSourceContinuity(
          Object.defineProperty({ ...f.sources }, 'company', {
            enumerable: true,
            get: called,
          }),
          f.input,
          f.gate,
        ),
      ).rejects.toThrow();
    if (kind === 'report')
      await expect(
        openServiceSourceReport(
          f.read,
          Object.defineProperty(
            { ...f.read.customer_safe.documentation[0].report.reference },
            'published_version',
            { enumerable: true, get: called },
          ),
        ),
      ).rejects.toThrow();
    if (kind === 'finding')
      await expect(
        openServiceSourceFinding(
          f.read,
          Object.defineProperty(
            {
              ...f.read.customer_safe.documentation[0].report.observations[0]
                .reference,
            },
            'finding_id',
            { enumerable: true, get: called },
          ),
        ),
      ).rejects.toThrow();
    if (kind === 'coercion')
      await expect(
        readServiceSourceContinuity(
          f.sources,
          { job_id: { toString: called } } as unknown as ServiceSourceInput,
          f.gate,
        ),
      ).rejects.toThrow();
    expect(called).not.toHaveBeenCalled();
  },
);
it('default OFF rejects before source/input getters or serializers', async () => {
  const getter = vi.fn(() => {
      throw Error('must not run');
    }),
    sources = Object.defineProperty({}, 'company', {
      get: getter,
    }) as OperatingSources,
    input = Object.defineProperty({}, 'job_id', {
      get: getter,
    }) as ServiceSourceInput;
  await expect(readServiceSourceContinuity(sources, input)).rejects.toThrow(
    /OFF/,
  );
  expect(
    renderToStaticMarkup(createElement(ServiceSourceContinuity, { sources })),
  ).toContain('Service source continuity is off');
  expect(getter).not.toHaveBeenCalled();
});
it.each(['production', 'https', 'remote', 'disabled'] as const)(
  'UI %s gate denies before source access',
  (kind) => {
    vi.stubGlobal('window', {
      location: {
        hostname: kind === 'remote' ? 'example.invalid' : '127.0.0.1',
        protocol: kind === 'https' ? 'https:' : 'http:',
      },
    });
    if (kind === 'production') vi.stubEnv('DEV', false);
    const getter = vi.fn(() => {
        throw Error('must not run');
      }),
      sources = Object.defineProperty({}, 'company', {
        get: getter,
      }) as OperatingSources;
    expect(
      renderToStaticMarkup(
        createElement(ServiceSourceContinuity, {
          sources,
          enabled: kind !== 'disabled',
        }),
      ),
    ).toContain('Service source continuity is off');
    expect(getter).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %i prefills the exact existing job without automatically opening report or creating source state',
  async (index) => {
    const { sources } = await fixture(index);
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', protocol: 'http:' },
    });
    const job = sources.entries[3].target.job_id!,
      html = renderToStaticMarkup(
        createElement(ServiceSourceContinuity, {
          sources,
          enabled: true,
          selectedJobId: job,
        }),
      );
    expect(html).toContain(`value="${job}" selected`);
    expect(html).toContain('Continuity source job');
    expect(html).toContain('Inspect selected service source');
    expect(html).not.toContain('Exact published report');
    expect(html).not.toContain(sources.entries[0].receipt_id);
  },
);
