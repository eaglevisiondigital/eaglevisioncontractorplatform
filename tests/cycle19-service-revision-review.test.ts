import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import type { PropertyState } from '../src/lib/property';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import { ServiceRevisionReview } from '../src/components/workflows/ServiceRevisionReview';
import {
  readServiceRevisionReview,
  readServiceRevisionUpdates,
  assertServiceRevisionAccess,
  inspectServiceRevisionReport,
  inspectServiceRevisionComparison,
  createServiceRevisionSelection,
  readServiceRevisionSelection,
  adoptServiceRevisionReview,
  filterServiceRevisionReports,
  type ServiceRevisionInspection,
} from '../src/lib/workflows/service-revision-review';
import { assertSavedRevisionCurrent } from '../src/lib/workflows/saved-revision-runtime';
import {
  readCompletionReview,
  prepareCompletionReview,
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
async function fixture(brand = 0, index = 0) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[index],
    sources = { ...all, entries: [entry] },
    job = entry.target.job_id!;
  return { gate, all, sources, entry, job };
}
async function opened(brand = 0) {
  const f = await fixture(brand),
    before = await readServiceRevisionReview(f.sources, f.job, f.gate),
    selection = createServiceRevisionSelection(before);
  return { ...f, before, selection };
}
function publishRevision(
  f: Awaited<ReturnType<typeof fixture>>,
  summary = 'Explicit revised published observation',
) {
  const repo = f.sources.property,
    org = f.sources.company.id;
  let visit = repo.read(org).visits.find((v) => v.id === f.entry.visit_id)!;
  repo.revise(org, visit);
  visit = repo.read(org).visits.find((v) => v.id === visit.id)!;
  repo.saveVisit(org, visit, {
    ...visit.content,
    summary,
    internal_notes: 'PRIVATE revised supplier and payroll note',
    findings: visit.content.findings.map((x) =>
      x.customer_visible
        ? {
            ...x,
            description: 'Revised visible condition observation',
            recommendation: 'A separate assessment is still required.',
          }
        : x,
    ),
  });
  visit = repo.read(org).visits.find((v) => v.id === visit.id)!;
  repo.submit(org, visit);
  visit = repo.read(org).visits.find((v) => v.id === visit.id)!;
  return repo.publish(org, visit);
}
function corrupt(
  f: Awaited<ReturnType<typeof fixture>>,
  change: (state: PropertyState) => void,
) {
  const repo = f.sources.property,
    read = repo.read.bind(repo),
    portal = repo.portal.bind(repo);
  const readSpy = vi.spyOn(repo, 'read').mockImplementation((org) => {
    const state = read(org);
    change(state);
    return state;
  });
  const portalSpy = vi
    .spyOn(repo, 'portal')
    .mockImplementation((org, customer) => {
      const original = portal(org, customer),
        state = read(org);
      change(state);
      return {
        ...original,
        reports: state.reports.filter((r) => r.customer_id === customer),
      };
    });
  return {
    mockRestore() {
      readSpy.mockRestore();
      portalSpy.mockRestore();
    },
  };
}
function during(change: () => void | Promise<void>, finalSavedHash = false) {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let seen = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (
      !seen &&
      (!finalSavedHash ||
        new TextDecoder()
          .decode(args[1] as Uint8Array)
          .includes('"kind":"customer"'))
    ) {
      seen = true;
      await change();
    }
    return result;
  });
  return () => expect(seen).toBe(true);
}
it.each([0, 1, 2])(
  'brand %i reads original safe Passport sources without business effects',
  async (brand) => {
    const f = await fixture(brand),
      writes = [
        vi.spyOn(f.sources.property, 'publish'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.estimates, 'recordPurchasedMaterials'),
        vi.spyOn(f.entry.release, 'command'),
      ],
      ids = vi.spyOn(crypto, 'randomUUID');
    const view = await readServiceRevisionReview(f.sources, f.job, f.gate);
    expect(view.identity.job_id).toBe(f.job);
    expect(view.identity.version_id).toBe(f.entry.target.version_id);
    expect(view.evidence.selected.reference.report_id).toBe(f.entry.report_id);
    expect(view.evidence.request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    expect(view.evidence.physical_completion).toBe('UNVERIFIED');
    expect(view.evidence.delivery).toBe('NOT_SENT');
    expect(JSON.stringify(view)).not.toMatch(
      /PRIVATE|worker_id|cash_minor|unit_cost_minor|supplier|internal_notes/,
    );
    expect(Object.isFrozen(view.evidence.selected.report)).toBe(true);
    writes.forEach((w) => expect(w).not.toHaveBeenCalled());
    expect(ids).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %i compares and explicitly adopts a real same-visit newly published UUID/version',
  async (brand) => {
    const f = await opened(brand),
      old = JSON.stringify(f.before),
      report = publishRevision(f),
      state = f.sources.property.read(f.sources.company.id),
      original = state.reports.find((r) => r.id === f.entry.report_id)!;
    expect(report.id).not.toBe(original.id);
    expect(report.version).toBe(original.version + 1);
    expect(report.visit_id).toBe(original.visit_id);
    expect(() => assertSavedRevisionCurrent(f.before)).toThrow();
    const next = await readServiceRevisionUpdates(f.before),
      inspection = inspectServiceRevisionComparison(f.before, next);
    expect(inspection.current.reference.report_id).toBe(report.id);
    expect(inspection.differences.same_date).toBe(true);
    expect(
      inspection.differences.findings.some((r) => r.differences?.observation),
    ).toBe(true);
    expect(JSON.stringify(inspection)).not.toMatch(
      /PRIVATE|repair_scopes|cost_minor|worker_id/,
    );
    expect(() =>
      adoptServiceRevisionReview(f.selection, inspection, 0, false),
    ).toThrow();
    expect(readServiceRevisionSelection(f.selection).generation).toBe(0);
    const publish = vi.spyOn(f.sources.property, 'publish'),
      ids = vi.spyOn(crypto, 'randomUUID');
    const adopted = adoptServiceRevisionReview(
      f.selection,
      inspection,
      0,
      true,
    );
    expect(adopted.generation).toBe(1);
    expect(adopted.snapshot).toBe(next);
    expect(
      inspectServiceRevisionReport(
        f.before,
        f.before.evidence.selected.reference,
      ).report.summary,
    ).toBe(original.summary);
    expect(
      inspectServiceRevisionReport(next, next.evidence.selected.reference)
        .report.summary,
    ).toBe(report.summary);
    expect(JSON.stringify(f.before)).toBe(old);
    expect(
      f.sources.property
        .read(f.sources.company.id)
        .reports.find((r) => r.id === original.id),
    ).toEqual(original);
    expect(() =>
      adoptServiceRevisionReview(f.selection, inspection, 1, true),
    ).toThrow(/duplicate|stale|confirmation/);
    expect(publish).not.toHaveBeenCalled();
    expect(ids).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %i denies a raced candidate and permits only a newly inspected current comparison',
  async (brand) => {
    const f = await opened(brand);
    publishRevision(f);
    const next = await readServiceRevisionUpdates(f.before),
      inspection = inspectServiceRevisionComparison(f.before, next);
    const third = publishRevision(f, 'Third explicit published observation');
    expect(() =>
      adoptServiceRevisionReview(f.selection, inspection, 0, true),
    ).toThrow();
    expect(readServiceRevisionSelection(f.selection).generation).toBe(0);
    const latest = await readServiceRevisionUpdates(f.before),
      fresh = inspectServiceRevisionComparison(f.before, latest);
    expect(latest.evidence.selected.reference.report_id).toBe(third.id);
    expect(
      adoptServiceRevisionReview(f.selection, fresh, 0, true).snapshot,
    ).toBe(latest);
    expect(next.evidence.selected.reference.published_version).toBe(2);
  },
);
it.each([0, 1, 2])(
  'brand %i source updates never clear an original completion UNKNOWN claim',
  async (brand) => {
    const f = await opened(brand),
      read = await readCompletionReview(
        f.entry,
        {
          report_id: f.entry.report_id,
          published_version: f.entry.published_version,
        },
        f.gate,
      ),
      input = {
        confirmed: true,
        checks: { scope: true, documentation: true, limitations: true },
      };
    const hit = during(() => {
      f.gate.enabled = false;
    });
    await expect(prepareCompletionReview(read, input)).rejects.toThrow();
    hit();
    vi.restoreAllMocks();
    f.gate.enabled = true;
    publishRevision(f);
    const next = await readServiceRevisionUpdates(f.before),
      inspection = inspectServiceRevisionComparison(f.before, next);
    expect(
      adoptServiceRevisionReview(f.selection, inspection, 0, true).snapshot
        .evidence.physical_completion,
    ).toBe('UNVERIFIED');
    const fresh = await readCompletionReview(
      f.entry,
      {
        report_id: next.evidence.selected.reference.report_id,
        published_version: next.evidence.selected.reference.published_version,
      },
      { enabled: true, confirmed: true },
    );
    await expect(prepareCompletionReview(fresh, input)).rejects.toThrow(
      /already attempted|UNKNOWN/,
    );
  },
);
it('competing inspected comparisons use one opaque selection generation', async () => {
  const f = await opened();
  publishRevision(f);
  const a = await readServiceRevisionUpdates(f.before),
    b = await readServiceRevisionUpdates(f.before),
    first = inspectServiceRevisionComparison(f.before, a),
    second = inspectServiceRevisionComparison(f.before, b);
  expect(
    adoptServiceRevisionReview(f.selection, first, 0, true).generation,
  ).toBe(1);
  expect(() =>
    adoptServiceRevisionReview(f.selection, second, 0, true),
  ).toThrow();
  expect(readServiceRevisionSelection(f.selection).snapshot).toBe(a);
});
it('requires inspected original comparison and same-source selection; copied objects cannot adopt', async () => {
  const f = await opened();
  publishRevision(f);
  const next = await readServiceRevisionUpdates(f.before),
    inspection = inspectServiceRevisionComparison(f.before, next);
  expect(() =>
    adoptServiceRevisionReview(
      f.selection,
      { ...inspection } as ServiceRevisionInspection,
      0,
      true,
    ),
  ).toThrow();
  expect(() =>
    adoptServiceRevisionReview({ ...f.selection }, inspection, 0, true),
  ).toThrow();
  expect(() =>
    inspectServiceRevisionReport(next, { ...next.evidence.selected.reference }),
  ).toThrow();
});
it('literal filters intersect phase and preserve exact original report references', async () => {
  const f = await opened();
  publishRevision(f);
  const next = await readServiceRevisionUpdates(f.before),
    r = next.evidence.selected;
  expect(
    filterServiceRevisionReports(next, r.reference.report_id, r.report.phase),
  ).toEqual([r]);
  expect(filterServiceRevisionReports(next, '.*')).toEqual([]);
  expect(
    filterServiceRevisionReports(next, r.reference.report_id, 'before'),
  ).toEqual([]);
  expect(() => filterServiceRevisionReports(next, 'x'.repeat(101))).toThrow();
  expect(() => filterServiceRevisionReports(next, '', 'latest')).toThrow();
});
it('no saved publication yields no invented new revision or adoption', async () => {
  const f = await opened(),
    next = await readServiceRevisionUpdates(f.before);
  expect(next.evidence.selected.sha256).toBe(f.before.evidence.selected.sha256);
  expect(() => inspectServiceRevisionComparison(f.before, next)).toThrow(
    /distinct newer/,
  );
});
it('two jobs at one property keep separate visit/report families and cannot compare', async () => {
  const f = await fixture(),
    other = f.all.entries[3],
    sources = { ...f.all, entries: [f.entry, other] },
    a = await readServiceRevisionReview(sources, f.job, f.gate),
    b = await readServiceRevisionReview(sources, other.target.job_id!, f.gate);
  expect(a.identity.location_id).toBe(b.identity.location_id);
  expect(a.identity.job_id).not.toBe(b.identity.job_id);
  expect(a.evidence.reports.map((r) => r.reference.report_id)).not.toContain(
    b.evidence.selected.reference.report_id,
  );
  expect(() => inspectServiceRevisionComparison(a, b)).toThrow();
});
it.each([
  'summary',
  'version',
  'missing',
  'duplicate',
  'visit',
  'plan',
] as const)(
  'historical %s corruption is terminal across restoration and fresh wrappers',
  async (kind) => {
    const f = await opened();
    publishRevision(f);
    const spy = corrupt(f, (state) => {
      const r = state.reports.find((r) => r.id === f.entry.report_id)!;
      if (kind === 'summary') r.summary = 'Rewritten historical source';
      if (kind === 'version') r.version++;
      if (kind === 'missing')
        state.reports = state.reports.filter((x) => x.id !== r.id);
      if (kind === 'duplicate') state.reports.push({ ...r });
      if (kind === 'visit') r.visit_id = f.entry.scheduled_visit_id;
      if (kind === 'plan')
        state.plans.find((p) => p.id === f.entry.plan_id)!.job_id =
          f.all.entries[3].target.job_id;
    });
    await expect(readServiceRevisionUpdates(f.before)).rejects.toThrow();
    spy.mockRestore();
    expect(() => assertServiceRevisionAccess(f.before)).toThrow(/UNKNOWN/);
    await expect(
      readServiceRevisionReview({ ...f.sources }, f.job, f.gate),
    ).rejects.toThrow(/UNKNOWN/);
  },
);
it.each(['missing', 'duplicate'] as const)(
  'new sibling history with %s version cannot identify latest',
  async (kind) => {
    const f = await opened();
    const second = publishRevision(f);
    publishRevision(f);
    const duplicateId = crypto.randomUUID();
    corrupt(f, (state) => {
      if (kind === 'missing')
        state.reports = state.reports.filter((r) => r.id !== second.id);
      else state.reports.push({ ...second, id: duplicateId });
    });
    await expect(readServiceRevisionUpdates(f.before)).rejects.toThrow(
      /missing|ambiguous|history|provenance/i,
    );
  },
);
it.each([0, 1, 2])(
  'brand %i observed revoked member cannot regain a retained or fresh review after restoration',
  async (brand) => {
    const f = await opened(brand),
      actual = f.sources.operations.syntheticMemberships.bind(
        f.sources.operations,
      ),
      spy = vi
        .spyOn(f.sources.operations, 'syntheticMemberships')
        .mockImplementation((org) =>
          actual(org).map((m) =>
            m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
          ),
        );
    expect(() => readServiceRevisionSelection(f.selection)).toThrow();
    spy.mockRestore();
    expect(() => readServiceRevisionSelection(f.selection)).toThrow(/UNKNOWN/);
    await expect(
      readServiceRevisionReview({ ...f.sources }, f.job, f.gate),
    ).rejects.toThrow(/UNKNOWN/);
  },
);
it.each(['property', 'customer', 'company', 'issued'] as const)(
  'wrong %s identity is rejected without fallback',
  async (kind) => {
    const f = await opened();
    if (kind === 'company') {
      await expect(
        readServiceRevisionReview(
          { ...f.sources, company: sampleCompanies[1] },
          f.job,
          f.gate,
        ),
      ).rejects.toThrow();
    } else {
      const key =
          kind === 'property'
            ? 'location_id'
            : kind === 'customer'
              ? 'customer_id'
              : 'version_id',
        old = f.entry.target[key];
      f.entry.target[key] =
        kind === 'issued' ? crypto.randomUUID() : f.all.entries[1].target[key];
      expect(() => assertServiceRevisionAccess(f.before)).toThrow();
      f.entry.target[key] = old;
      expect(() => assertServiceRevisionAccess(f.before)).toThrow(/UNKNOWN/);
    }
  },
);
it('different same-company property plan cannot become a sibling source', async () => {
  const f = await opened();
  corrupt(f, (state) => {
    state.plans.find((p) => p.id === f.entry.plan_id)!.location_id =
      f.all.entries[1].target.location_id;
  });
  await expect(readServiceRevisionUpdates(f.before)).rejects.toThrow();
});
it('a changed source during the final hash cannot return a mixed candidate', async () => {
  const f = await opened();
  publishRevision(f);
  const hit = during(() => {
    publishRevision(f, 'Saved while reading');
  }, true);
  await expect(readServiceRevisionUpdates(f.before)).rejects.toThrow();
  hit();
  expect(readServiceRevisionSelection(f.selection).generation).toBe(0);
});
it('membership withdrawal after final hash is denied', async () => {
  const f = await fixture(),
    actual = f.sources.operations.syntheticMemberships.bind(
      f.sources.operations,
    ),
    hit = during(() => {
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
        (org) =>
          actual(org).filter((m) => m.user_id !== f.entry.target.actor_id),
      );
    }, true);
  await expect(
    readServiceRevisionReview(f.sources, f.job, f.gate),
  ).rejects.toThrow();
  hit();
});
it('invalid selected hints never fall back to another available job', async () => {
  const f = await fixture();
  await expect(
    readServiceRevisionReview(f.sources, 'missing', f.gate),
  ).rejects.toThrow();
  expect(
    renderToStaticMarkup(
      createElement(ServiceRevisionReview, {
        sources: f.sources,
        enabled: true,
        selectedJobId: 'missing',
      }),
    ),
  ).toContain('UNKNOWN');
});
it.each(['off', 'https', 'host', 'production'] as const)(
  '%s denies before source getters and serializers',
  async (kind) => {
    if (kind === 'https')
      vi.stubGlobal('window', {
        location: { hostname: '127.0.0.1', protocol: 'https:' },
      });
    if (kind === 'host')
      vi.stubGlobal('window', {
        location: { hostname: 'example.invalid', protocol: 'http:' },
      });
    if (kind === 'production') vi.stubEnv('DEV', false);
    const getter = vi.fn(() => {
        throw Error('must not read');
      }),
      sources = Object.defineProperty({}, 'company', {
        get: getter,
      }) as OperatingSources;
    await expect(
      readServiceRevisionReview(sources, 'x', {
        enabled: kind !== 'off',
        confirmed: true,
      }),
    ).rejects.toThrow();
    expect(
      renderToStaticMarkup(
        createElement(ServiceRevisionReview, {
          sources,
          enabled: kind !== 'off',
        }),
      ),
    ).toContain('off');
    expect(getter).not.toHaveBeenCalled();
  },
);
it('admitted executable source descriptors reject without invoking getters/toJSON', async () => {
  const f = await fixture(),
    getter = vi.fn(() => f.sources.company),
    toJSON = vi.fn();
  await expect(
    readServiceRevisionReview(
      Object.defineProperty({ ...f.sources }, 'company', { get: getter }),
      f.job,
      f.gate,
    ),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
  await expect(
    readServiceRevisionReview(
      {
        ...f.sources,
        company: Object.assign({}, f.sources.company, { toJSON }),
      },
      f.job,
      f.gate,
    ),
  ).rejects.toThrow();
  expect(toJSON).not.toHaveBeenCalled();
});
it('default OFF static UI contains no source details or action controls', () => {
  const html = renderToStaticMarkup(
    createElement(ServiceRevisionReview, { sources: {} as OperatingSources }),
  );
  expect(html).toContain('off');
  expect(html).not.toContain('Read published service source');
});

it('a second adoption advances the same selection and retains every earlier exact version', async () => {
  const f = await opened();
  publishRevision(f);
  const second = await readServiceRevisionUpdates(f.before);
  adoptServiceRevisionReview(
    f.selection,
    inspectServiceRevisionComparison(f.before, second),
    0,
    true,
  );
  const old = JSON.stringify(second),
    third = publishRevision(f, 'Third saved revision after adoption');
  const next = await readServiceRevisionUpdates(
    readServiceRevisionSelection(f.selection).snapshot,
  );
  const result = adoptServiceRevisionReview(
    f.selection,
    inspectServiceRevisionComparison(second, next),
    1,
    true,
  );
  expect(result.generation).toBe(2);
  expect(result.snapshot.evidence.selected.reference.report_id).toBe(third.id);
  expect(
    result.snapshot.evidence.reports.map((r) => r.reference.published_version),
  ).toEqual([1, 2, 3]);
  expect(JSON.stringify(second)).toBe(old);
  expect(
    inspectServiceRevisionReport(second, second.evidence.selected.reference)
      .reference.published_version,
  ).toBe(2);
});
it.each(['rewritten', 'removed'] as const)(
  'an adopted non-anchor historical version cannot be %s and accepted as a newer revision',
  async (kind) => {
    const f = await opened();
    const second = publishRevision(f);
    const adopted = await readServiceRevisionUpdates(f.before);
    adoptServiceRevisionReview(
      f.selection,
      inspectServiceRevisionComparison(f.before, adopted),
      0,
      true,
    );
    publishRevision(f);
    const spy = corrupt(f, (state) => {
      if (kind === 'removed')
        state.reports = state.reports.filter((r) => r.id !== second.id);
      else
        state.reports.find((r) => r.id === second.id)!.summary =
          'Rewritten version two';
    });
    await expect(readServiceRevisionUpdates(adopted)).rejects.toThrow();
    spy.mockRestore();
    expect(() => readServiceRevisionSelection(f.selection)).toThrow(/UNKNOWN/);
  },
);
it('source change inside the original comparator cannot produce an adoptable inspection', async () => {
  const f = await opened();
  publishRevision(f);
  const next = await readServiceRevisionUpdates(f.before),
    original = f.entry.customerModel.compareReports.bind(f.entry.customerModel);
  vi.spyOn(f.entry.customerModel, 'compareReports').mockImplementation(
    (a, b) => {
      const result = original(a, b);
      publishRevision(f, 'Saved during original comparison');
      return result;
    },
  );
  expect(() => inspectServiceRevisionComparison(f.before, next)).toThrow();
  expect(readServiceRevisionSelection(f.selection).generation).toBe(0);
});

it('a newer publication on another actual visit is visible but never substitutes for the selected report family', async () => {
  const f = await opened(),
    repo = f.sources.property,
    org = f.sources.company.id;
  let visit = repo
    .read(org)
    .visits.find((v) => v.id === f.entry.scheduled_visit_id)!;
  repo.saveVisit(org, visit, {
    ...visit.content,
    summary: 'Different scheduled visit published later',
    checklist: visit.content.checklist.map((c) => ({ ...c, completed: true })),
  });
  visit = repo.read(org).visits.find((v) => v.id === visit.id)!;
  repo.submit(org, visit);
  visit = repo.read(org).visits.find((v) => v.id === visit.id)!;
  const other = repo.publish(org, visit);
  const next = await readServiceRevisionUpdates(f.before);
  expect(
    next.evidence.reports.some((r) => r.reference.report_id === other.id),
  ).toBe(true);
  expect(next.evidence.selected.reference.report_id).toBe(f.entry.report_id);
  expect(() => inspectServiceRevisionComparison(f.before, next)).toThrow(
    /distinct newer/,
  );
  expect(readServiceRevisionSelection(f.selection).generation).toBe(0);
});
