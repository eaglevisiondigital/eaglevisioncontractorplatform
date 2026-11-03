import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import { ServicePassportPath } from '../src/components/workflows/ServicePassportPath';
import {
  readServicePassportPath,
  assertServicePassportSelectionCurrent,
  selectServicePassportContext,
  filterServicePassportPaths,
  openServicePassportContext,
  assertServicePassportContextCurrent,
  openServicePassportDocumentation,
  openServicePassportFinding,
  servicePassportBreadcrumbs,
  openServicePassportOriginalReview,
  returnServicePassportSelection,
  navigateServicePassportJob,
  type ServicePassportLiveCallback,
} from '../src/lib/workflows/service-passport-path';
import {
  readCompletionReview,
  prepareCompletionReview,
  reconcileCompletionReview,
} from '../src/lib/workflows/completion-review';
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
async function fixture(brand = 0, entryIndex = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[entryIndex],
    view = await readServicePassportPath(sources, gate),
    selected = selectServicePassportContext(view, entry.target.job_id!)!,
    input = { ...selected, staff_context_confirmed: true };
  return { gate, sources, entry, view, input };
}
async function opened(brand = 0, entryIndex = 0) {
  const f = await fixture(brand, entryIndex),
    path = await openServicePassportContext(f.view, f.input),
    reference = path.customer_safe.documentation.find(
      (d) => d.report.reference.report_id === f.entry.report_id,
    )!.report.reference,
    report = await openServicePassportDocumentation(path, reference);
  return { ...f, path, reference, report };
}
function during(change: () => void | Promise<void>, mode?: string) {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let reached = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args),
      body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (!reached && (!mode || body.mode === mode)) {
      reached = true;
      await change();
    }
    return result;
  });
  return () => expect(reached).toBe(true);
}
it.each([0, 1, 2])(
  'brand %i retains exact request/property/job/report/finding/Passport breadcrumbs and original controls without effects',
  async (brand) => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.sources.company.id),
      writers = [
        vi.spyOn(f.sources.estimates, 'create'),
        vi.spyOn(f.sources.estimates, 'issue'),
        vi.spyOn(f.sources.estimates, 'approveJob'),
        vi.spyOn(f.sources.property, 'publish'),
        ...f.sources.entries.map((e) => vi.spyOn(e.release, 'command')),
      ],
      ids = vi.spyOn(crypto, 'randomUUID'),
      path = await openServicePassportContext(f.view, f.input),
      doc = path.customer_safe.documentation.find(
        (d) => d.report.reference.report_id === f.entry.report_id,
      )!,
      report = await openServicePassportDocumentation(
        path,
        doc.report.reference,
      ),
      finding = await openServicePassportFinding(
        path,
        report.observations[0].reference,
      ),
      crumbs = servicePassportBreadcrumbs(path, report, finding),
      controls = openServicePassportOriginalReview(path, report);
    expect(crumbs.map((c) => c.kind)).toEqual([
      'request',
      'property',
      'job',
      'report',
      'finding',
      'passport',
    ]);
    expect(crumbs.map((c) => c.id)).toContain(f.entry.target.location_id);
    expect(crumbs.find((c) => c.kind === 'report')!.label).toContain(
      `version ${f.entry.published_version}`,
    );
    expect(report).toEqual(doc.report);
    expect(finding.finding).toEqual(report.observations[0]);
    expect(path.context.recorded_request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    expect(path.customer_safe.physical_completion).toBe('UNKNOWN');
    expect(controls.sources).toBe(f.entry);
    expect(openServicePassportOriginalReview(path, report)).toBe(controls);
    expect(Object.isFrozen(controls)).toBe(true);
    expect(Object.isFrozen(crumbs)).toBe(true);
    expect(returnServicePassportSelection(path)).toEqual({
      view: f.view,
      selection: { request_id: f.input.request_id, job_id: f.input.job_id },
    });
    expect(returnServicePassportSelection(path).view).toBe(f.view);
    expect(f.sources.property.read(f.sources.company.id)).toEqual(before);
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
    expect(ids).not.toHaveBeenCalled();
  },
);
it('the unchanged original completion engine works after direct control selection and does not verify physical completion', async () => {
  const f = await opened(),
    controls = openServicePassportOriginalReview(f.path, f.report),
    view = await readCompletionReview(
      controls.sources,
      {
        report_id: f.report.reference.report_id,
        published_version: f.report.reference.published_version,
      },
      f.gate,
    ),
    packet = await prepareCompletionReview(view, {
      confirmed: true,
      checks: { scope: true, documentation: true, limitations: true },
    });
  expect(packet.review.report).toEqual(f.report);
  expect(packet.physical_completion).toBe('UNVERIFIED');
  expect(packet.customer_acceptance).toBe('UNVERIFIED');
  expect(packet.warranty).toBe('UNVERIFIED');
  expect((await reconcileCompletionReview(packet)).status).toBe(
    'CURRENT_REVIEW_ONLY',
  );
  expect(openServicePassportOriginalReview(f.path, f.report)).toBe(controls);
});
it('lost original completion ACK cannot be reset through breadcrumbs or a fresh original source read', async () => {
  const f = await opened(),
    controls = openServicePassportOriginalReview(f.path, f.report),
    selection = {
      report_id: f.entry.report_id,
      published_version: f.entry.published_version,
    },
    view = await readCompletionReview(controls.sources, selection, f.gate),
    reached = during(() => {
      throw Error('lost completion ACK');
    }, 'IMMUTABLE_COMPLETION_DOCUMENTATION_REVIEW');
  await expect(
    prepareCompletionReview(view, {
      confirmed: true,
      checks: { scope: true, documentation: true, limitations: true },
    }),
  ).rejects.toThrow();
  reached();
  vi.restoreAllMocks();
  expect(
    servicePassportBreadcrumbs(f.path, f.report).some(
      (c) => c.kind === 'report',
    ),
  ).toBe(true);
  expect(openServicePassportOriginalReview(f.path, f.report)).toBe(controls);
  const fresh = await readCompletionReview(controls.sources, selection, f.gate);
  await expect(
    prepareCompletionReview(fresh, {
      confirmed: true,
      checks: { scope: true, documentation: true, limitations: true },
    }),
  ).rejects.toThrow(/already attempted|replay/);
});
it('same-property jobs stay distinct and sibling documentation cannot rebind the original completion control', async () => {
  const f = await opened(0, 3),
    group = f.view.requests.find((r) => r.jobs.length === 2)!;
  expect(new Set(group.jobs.map((j) => j.job_id)).size).toBe(2);
  expect(new Set(group.jobs.map((j) => j.issued_version_id)).size).toBe(2);
  const other = f.path.customer_safe.documentation.find(
      (d) => d.report.reference.report_id !== f.entry.report_id,
    )!,
    report = await openServicePassportDocumentation(
      f.path,
      other.report.reference,
    );
  expect(other.selected_job_association).toBe('UNKNOWN');
  expect(report).toEqual(other.report);
  expect(() => openServicePassportOriginalReview(f.path, report)).toThrow(
    /UNKNOWN/,
  );
  expect(
    servicePassportBreadcrumbs(f.path, report).find((c) => c.kind === 'job')!
      .id,
  ).toBe(f.entry.target.job_id);
});
it.each([0, 1, 2])(
  'brand %i literal search uses actual request/job sources and preserves retained selection',
  async (brand) => {
    const f = await fixture(brand),
      filters = {
        query: f.entry.target.job_id!,
        customer_id: f.entry.target.customer_id,
        location_id: f.entry.target.location_id,
        request_state: '',
      };
    expect(
      filterServicePassportPaths(f.view, filters).map((r) => r.job.job_id),
    ).toEqual([f.entry.target.job_id]);
    expect(
      filterServicePassportPaths(f.view, { ...filters, query: '.*' }),
    ).toEqual([]);
    expect(f.view.available_requests).toBe(3);
    expect(f.view.available_job_contexts).toBe(4);
  },
);
it.each([0, 1, 2])(
  'brand %i host navigation uses exact completion destination after final source inspection',
  async (brand) => {
    const f = await opened(brand),
      callback = vi.fn(),
      live = { current: callback, generation: 0 };
    expect(
      await navigateServicePassportJob(f.path, f.report, callback, live),
    ).toBe(f.input.job_id);
    expect(callback).toHaveBeenCalledExactlyOnceWith(
      f.input.job_id,
      'completion',
    );
  },
);
it.each(['throw', 'reject'] as const)(
  'callback %s after dispatch leaves immutable source bodies and a terminal UNKNOWN selection across fresh same-job reads',
  async (kind) => {
    const f = await opened(),
      snapshot = JSON.stringify([f.path, f.report]),
      dispatched: string[] = [],
      callback = vi.fn((job: string) => {
        dispatched.push(job);
        if (kind === 'throw') throw Error('host result lost after dispatch');
        return Promise.reject(Error('host result lost after dispatch'));
      }),
      live = { current: callback, generation: 0 };
    await expect(
      navigateServicePassportJob(f.path, f.report, callback, live),
    ).rejects.toThrow(/lost after dispatch/);
    expect(dispatched).toEqual([f.input.job_id]);
    expect(JSON.stringify([f.path, f.report])).toBe(snapshot);
    await expect(
      navigateServicePassportJob(f.path, f.report, callback, live),
    ).rejects.toThrow(/UNKNOWN/);
    expect(() => selectServicePassportContext(f.view, f.input.job_id)).toThrow(
      /UNKNOWN/,
    );
    await expect(openServicePassportContext(f.view, f.input)).rejects.toThrow(
      /UNKNOWN/,
    );
    const fresh = await readServicePassportPath(f.sources, f.gate);
    expect(() => selectServicePassportContext(fresh, f.input.job_id)).toThrow(
      /UNKNOWN/,
    );
    await expect(
      openServicePassportContext(fresh, { ...f.input }),
    ).rejects.toThrow(/UNKNOWN/);
    expect(callback).toHaveBeenCalledTimes(1);
  },
);
it.each(['removed', 'replaced', 'restored'] as const)(
  'callback %s during source inspection never runs an obsolete or replacement callback',
  async (kind) => {
    const f = await opened(),
      callback = vi.fn(),
      replacement = vi.fn(),
      live: ServicePassportLiveCallback = { current: callback, generation: 0 },
      reached = during(() => {
        live.current = kind === 'replaced' ? replacement : undefined;
        live.generation++;
        if (kind === 'restored') {
          live.current = callback;
          live.generation++;
        }
      });
    await expect(
      navigateServicePassportJob(f.path, f.report, callback, live),
    ).rejects.toThrow(/withdrawn|replaced/);
    reached();
    expect(callback).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    expect(openServicePassportOriginalReview(f.path, f.report).sources).toBe(
      f.entry,
    );
  },
);
it('two concurrent source navigation requests produce only one callback without another business attempt', async () => {
  const f = await opened(),
    callback = vi.fn(),
    live = { current: callback, generation: 0 },
    results = await Promise.allSettled([
      navigateServicePassportJob(f.path, f.report, callback, live),
      navigateServicePassportJob(f.path, f.report, callback, live),
    ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  expect(callback).toHaveBeenCalledExactlyOnceWith(
    f.input.job_id,
    'completion',
  );
});
it.each(['gate', 'input', 'root', 'member'] as const)(
  'navigation rechecks %s after the final source await',
  async (kind) => {
    const f = await opened(),
      callback = vi.fn(),
      reached = during(async () => {
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'input') f.input.staff_context_confirmed = false;
        if (kind === 'root') f.sources.entries = [...f.sources.entries];
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
            f.entry.target.actor_id,
          );
        }
      });
    await expect(
      navigateServicePassportJob(f.path, f.report, callback, {
        current: callback,
        generation: 0,
      }),
    ).rejects.toThrow();
    reached();
    expect(callback).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %i foreign tenant report cannot enter its retained path or original controls',
  async (brand) => {
    const f = await opened(brand);
    await expect(
      openServicePassportDocumentation(f.path, {
        ...f.reference,
        organization_id: sampleCompanies[(brand + 1) % 3].id,
      }),
    ).rejects.toThrow();
    expect(() => openServicePassportOriginalReview(f.path, f.report)).toThrow();
  },
);
it.each([0, 1, 2])(
  'brand %i wrong same-company property cannot use a report with matching labels',
  async (brand) => {
    const f = await opened(brand);
    await expect(
      openServicePassportDocumentation(f.path, {
        ...f.reference,
        location_id: f.sources.entries[1].target.location_id,
      }),
    ).rejects.toThrow();
  },
);
it.each([0, 1, 2])(
  'brand %i current member withdrawal hides breadcrumb/control/return access',
  async (brand) => {
    const f = await opened(brand);
    await f.sources.operations.configure(
      f.sources.company.id,
      'active',
      'starter',
      {},
      f.sources.company.id + '-backup-owner',
    );
    await f.sources.operations.revokeOwner(
      f.sources.company.id,
      f.entry.target.actor_id,
    );
    expect(() => servicePassportBreadcrumbs(f.path, f.report)).toThrow();
    expect(() => openServicePassportOriginalReview(f.path, f.report)).toThrow();
    expect(() => returnServicePassportSelection(f.path)).toThrow();
  },
);
it.each(['model', 'version', 'company', 'confirmation'] as const)(
  'changed %s cannot revive retained evidence after restoration',
  async (kind) => {
    const f = await opened();
    if (kind === 'model') f.entry.customerModel.logout();
    if (kind === 'version') f.entry.published_version++;
    if (kind === 'company')
      await f.sources.operations.configure(
        f.sources.company.id,
        'suspended',
        'starter',
        {},
        f.entry.target.actor_id,
      );
    if (kind === 'confirmation') f.input.staff_context_confirmed = false;
    expect(() => assertServicePassportContextCurrent(f.path)).toThrow();
    f.input.staff_context_confirmed = true;
    expect(() => servicePassportBreadcrumbs(f.path, f.report)).toThrow();
  },
);
it.each(['job', 'confirmation', 'gate'] as const)(
  'final original context hash rechecks %s before exposing the retained path',
  async (kind) => {
    const f = await fixture(),
      reached = during(() => {
        if (kind === 'job') f.input.job_id = 'foreign';
        if (kind === 'confirmation') f.input.staff_context_confirmed = false;
        if (kind === 'gate') f.gate.confirmed = false;
      }, 'LOCAL_EXACT_SERVICE_REVIEW_PATH');
    await expect(openServicePassportContext(f.view, f.input)).rejects.toThrow();
    reached();
  },
);
it('lost published-report ACK is terminal and cannot be reset by breadcrumb navigation', async () => {
  const f = await opened();
  vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(
    Error('lost exact read ACK'),
  );
  await expect(
    openServicePassportDocumentation(f.path, f.reference),
  ).rejects.toThrow();
  expect(() => servicePassportBreadcrumbs(f.path, f.report)).toThrow();
  expect(() => returnServicePassportSelection(f.path)).toThrow();
});
it.each(['foreign', 'empty', 'coercion', 'copy'] as const)(
  'selected job hint %s has no fallback or authority',
  async (kind) => {
    const f = await fixture(),
      called = vi.fn(() => f.input.job_id);
    if (kind === 'foreign')
      expect(() => selectServicePassportContext(f.view, 'foreign')).toThrow();
    if (kind === 'empty')
      expect(() => selectServicePassportContext(f.view, '')).toThrow();
    if (kind === 'coercion')
      expect(() =>
        selectServicePassportContext(f.view, {
          toString: called,
        } as unknown as string),
      ).toThrow();
    if (kind === 'copy')
      expect(() =>
        selectServicePassportContext(
          JSON.parse(JSON.stringify(f.view)),
          f.input.job_id,
        ),
      ).toThrow();
    expect(called).not.toHaveBeenCalled();
  },
);
it('copied report/finding objects cannot create breadcrumbs or open original controls', async () => {
  const f = await opened(),
    finding = await openServicePassportFinding(
      f.path,
      f.report.observations[0].reference,
    );
  expect(() =>
    servicePassportBreadcrumbs(f.path, JSON.parse(JSON.stringify(f.report))),
  ).toThrow();
  expect(() =>
    openServicePassportOriginalReview(
      f.path,
      JSON.parse(JSON.stringify(f.report)),
    ),
  ).toThrow();
  expect(() =>
    servicePassportBreadcrumbs(
      f.path,
      f.report,
      JSON.parse(JSON.stringify(finding)),
    ),
  ).toThrow();
});
it.each([0, 1, 2])(
  'brand %i safe report/Passport output excludes private staff/cost/rate and other customer evidence',
  async (brand) => {
    const f = await opened(brand),
      text = JSON.stringify({
        report: f.report,
        safe: f.path.customer_safe,
        crumbs: servicePassportBreadcrumbs(f.path, f.report),
      });
    for (const term of [
      'PRIVATE',
      'unit_cost_minor',
      'hourly_rate_minor',
      'supplier_cost',
      'internal_notes',
      'worker_id',
      'payroll',
      f.entry.receipt_id,
      f.sources.entries[1].target.customer_id,
      f.sources.entries[1].report_id,
    ])
      expect(text).not.toContain(term);
  },
);
it('source/context/report/callback getters reject without invocation', async () => {
  const f = await opened(),
    called = vi.fn(() => ''),
    callback = vi.fn();
  await expect(
    readServicePassportPath(
      Object.defineProperty({ ...f.sources }, 'company', {
        enumerable: true,
        get: called,
      }),
      f.gate,
    ),
  ).rejects.toThrow();
  await expect(
    openServicePassportContext(
      f.view,
      Object.defineProperty({ ...f.input }, 'staff_context_confirmed', {
        enumerable: true,
        get: called,
      }),
    ),
  ).rejects.toThrow();
  await expect(
    openServicePassportDocumentation(
      f.path,
      Object.defineProperty({ ...f.reference }, 'published_version', {
        enumerable: true,
        get: called,
      }),
    ),
  ).rejects.toThrow();
  expect(called).not.toHaveBeenCalled();
  const next = await opened();
  await expect(
    navigateServicePassportJob(
      next.path,
      next.report,
      callback,
      Object.defineProperty({ generation: 0 }, 'current', {
        enumerable: true,
        get: called,
      }) as unknown as ServicePassportLiveCallback,
    ),
  ).rejects.toThrow();
  expect(called).not.toHaveBeenCalled();
  expect(callback).not.toHaveBeenCalled();
});
it.each([
  'default',
  'production',
  'https',
  'foreign-host',
  'unconfirmed',
] as const)(
  '%s OFF precedes source getters in domain and React',
  async (kind) => {
    const called = vi.fn(() => {
        throw Error('must not run');
      }),
      sources = Object.defineProperty({}, 'company', {
        get: called,
      }) as OperatingSources;
    if (kind === 'production') vi.stubEnv('DEV', false);
    if (kind === 'https')
      vi.stubGlobal('window', {
        location: { hostname: '127.0.0.1', protocol: 'https:' },
      });
    if (kind === 'foreign-host')
      vi.stubGlobal('window', {
        location: { hostname: 'localhost.example.invalid', protocol: 'http:' },
      });
    await expect(
      readServicePassportPath(sources, {
        enabled: kind !== 'default',
        confirmed: kind !== 'unconfirmed' && kind !== 'default',
      }),
    ).rejects.toThrow(/OFF/);
    if (kind !== 'unconfirmed')
      expect(
        renderToStaticMarkup(
          createElement(ServicePassportPath, {
            sources,
            enabled: kind !== 'default',
          }),
        ),
      ).toContain('Service Passport path is off');
    expect(called).not.toHaveBeenCalled();
  },
);
it('a stale original view cannot be used after replacing its source root', async () => {
  const f = await fixture();
  f.sources.entries = [...f.sources.entries];
  expect(() => assertServicePassportSelectionCurrent(f.view)).toThrow();
});
it('published report/version content remains immutable after an unpublished later visit', async () => {
  const f = await opened(),
    before = JSON.stringify(f.report),
    visit = f.sources.property.addVisit(
      f.sources.company.id,
      f.entry.plan_id,
      '2027-01-11',
      'after',
    );
  f.sources.property.saveVisit(f.sources.company.id, visit, {
    summary: 'Unpublished changed report',
    internal_notes: 'PRIVATE',
    checklist: [],
    findings: [],
  });
  expect(() => servicePassportBreadcrumbs(f.path, f.report)).toThrow();
  expect(JSON.stringify(f.report)).toBe(before);
});
