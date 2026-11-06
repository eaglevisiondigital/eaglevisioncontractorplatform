import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sampleCompanies } from '../src/domain/platform';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import {
  readDailyFieldGuide,
  assertDailyFieldGuideNow,
  inspectDailyFieldReport,
  inspectDailyFieldStep,
  dailyFieldReportReference,
  navigateDailyFieldJob,
} from '../src/lib/workflows/daily-field-guide';
import {
  readDailyFinanceGuide,
  selectDailyFinanceReview,
  assertDailyFinanceReviewCurrent,
  navigateDailyFinanceReview,
} from '../src/lib/workflows/daily-finance-guide';
import {
  readServiceCompletionGuide,
  selectServiceCompletionContext,
  openServiceCompletionContext,
  assertServiceCompletionContextCurrent,
  openServiceCompletionReport,
  selectServiceCompletionJob,
} from '../src/lib/workflows/service-completion-guide';
import {
  readRetentionReviewGuide,
  inspectRetentionReviewItem,
  assertRetentionReviewItemNow,
  returnRetentionReviewGuide,
  navigateRetentionReviewJob,
} from '../src/lib/workflows/retention-review-guide';
import type { FollowUpReadinessInput } from '../src/lib/workflows/follow-up-readiness';
import {
  readOwnerBriefingGuide,
  openOwnerBriefingTask,
  assertOwnerBriefingTaskCurrent,
  inspectOwnerBriefingDestination,
  navigateOwnerBriefingTask,
  returnOwnerBriefingTask,
} from '../src/lib/workflows/owner-briefing-guide';
import {
  readAddonReadinessGuide,
  assertAddonReadinessCurrent,
  openAddonReadinessControls,
  inspectAddonReadinessReference,
  returnAddonReadinessContext,
  navigateAddonReadinessJob,
} from '../src/lib/workflows/addon-readiness-guide';
import { DailyFieldGuide } from '../src/components/workflows/DailyFieldGuide';
import { DailyFinanceGuide } from '../src/components/workflows/DailyFinanceGuide';
import { ServiceCompletionGuide } from '../src/components/workflows/ServiceCompletionGuide';
import { RetentionReviewGuide } from '../src/components/workflows/RetentionReviewGuide';
import { OwnerBriefingGuide } from '../src/components/workflows/OwnerBriefingGuide';
import { AddonReadinessGuide } from '../src/components/workflows/AddonReadinessGuide';
import { SharedRecordSearch } from '../src/components/workflows/SharedRecordSearch';
import { cycle14ContinuityGroups } from '../src/components/workflows/OperatingCenterCycleFourteen';
import { cycle16DailyGroups } from '../src/components/workflows/OperatingCenterCycleSixteen';
const sourceLineage: {
  admitCycle33V1Published: (
    file: { path: string; sha256: string },
    current: Buffer,
    publishedCommit: string,
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);

// Independent consumers compose actual retained readers. Setup alone creates the
// existing disposable fixtures; no mocked business records or parallel engines.
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
async function fixture(brand = 0, finite = false) {
  const gate = { enabled: true, confirmed: true },
    original = await prepareOperatingSources(sampleCompanies[brand], gate),
    sources = finite
      ? { ...original, entries: [original.entries[2]] }
      : original,
    entry = finite ? sources.entries[0] : sources.entries[2];
  return { gate, sources, entry };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function snapshot(f: Fixture) {
  return JSON.stringify({
    property: f.sources.property.read(f.sources.company.id),
    records: f.sources.entries.map((e) => ({
      canonical: f.sources.estimates.readSyntheticPrototypeSources(e.target),
      release: e.release.read('staff'),
    })),
  });
}
function noCommands(f: Fixture) {
  const before = snapshot(f),
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
  return () => {
    expect(snapshot(f)).toBe(before);
    writers.forEach((writer) => expect(writer).not.toHaveBeenCalled());
    expect(network).not.toHaveBeenCalled();
  };
}
function maintenance(f: Fixture): FollowUpReadinessInput {
  return {
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
}
function briefing(f: Fixture) {
  return {
    review_on: f.entry.day,
    timezone: f.entry.timezone,
    ordering: 'EVIDENCE_FIRST' as const,
    input_revision: 1,
  };
}
function financeInput() {
  return { as_of: new Date().toISOString(), input_revision: 1 };
}
function privateFields(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(
    /unit_cost_minor|internal_notes|cash_minor|burden_minor|PRIVATE staff|@example|5550100100|Synthetic planning supplier/,
  );
}

it.each([0, 1, 2])(
  'brand %i Field and Customer independently converge on the same immutable job/report/version without completion or business effects',
  async (brand) => {
    const f = await fixture(brand),
      unchanged = noCommands(f),
      [field, requests] = await Promise.all([
        readDailyFieldGuide(
          f.sources,
          { job_id: f.entry.target.job_id!, worker_id: f.entry.worker_id },
          f.gate,
        ),
        readServiceCompletionGuide(f.sources, f.gate),
      ]),
      selected = selectServiceCompletionContext(requests, field.source.job_id)!,
      path = await openServiceCompletionContext(requests, {
        ...selected,
        staff_context_confirmed: true,
      }),
      doc = path.customer_safe.documentation.find(
        (d) => d.report.reference.report_id === f.entry.report_id,
      )!,
      reportStep = await inspectDailyFieldStep(field, 'reports'),
      displayed = reportStep.reports.find(
        (r) => r.report_id === doc.report.reference.report_id,
      )!,
      [staff, customer] = await Promise.all([
        inspectDailyFieldReport(field, {
          ...dailyFieldReportReference(displayed),
        }),
        openServiceCompletionReport(path, doc.report.reference),
      ]),
      callback = vi.fn();
    expect(path.context.job_id).toBe(field.source.job_id);
    expect(path.customer_safe.property).toMatchObject({
      organization_id: field.source.organization_id,
      customer_id: field.source.customer_id,
      location_id: field.source.location_id,
    });
    expect(path.recorded_job_scope.issued_version_id).toBe(
      field.source.issued_version_id,
    );
    expect(customer.report.reference).toMatchObject({
      report_id: staff.report.report_id,
      published_version: staff.report.published_version,
      customer_id: field.source.customer_id,
      location_id: field.source.location_id,
    });
    expect(customer.completion?.job.reference.job_id).toBe(field.source.job_id);
    expect(field.physical_completion).toBe('UNVERIFIED');
    expect(
      path.customer_safe.required_proof.every((p) => p.status === 'UNKNOWN'),
    ).toBe(true);
    expect(path.context.recorded_request_job_link).toContain('UNKNOWN');
    await navigateDailyFieldJob(field, callback);
    expect(callback).toHaveBeenCalledExactlyOnceWith(
      selectServiceCompletionJob(path),
      'field',
    );
    privateFields({ field, customer: path.customer_safe });
    expect(() => assertDailyFieldGuideNow(structuredClone(field))).toThrow();
    expect(() =>
      assertServiceCompletionContextCurrent(structuredClone(path)),
    ).toThrow();
    // The UI mapper adapts its full row; the historical strict reader stays strict.
    await expect(inspectDailyFieldReport(field, displayed)).rejects.toThrow();
    unchanged();
  },
);

it.each([0, 1, 2])(
  'brand %i Finance and owner briefing retain exact portfolio job/issued source and original financial navigation without financial effects',
  async (brand) => {
    const f = await fixture(brand),
      unchanged = noCommands(f),
      // Two real handles from one existing repository set, not cloned jobs.
      sources = {
        ...f.sources,
        entries: [f.sources.entries[0], f.entry],
      },
      [finance, owner] = await Promise.all([
        readDailyFinanceGuide(sources, financeInput(), f.gate),
        readOwnerBriefingGuide(sources, briefing(f), f.gate),
      ]),
      job = finance.jobs.find(
        (j) => j.target.job_id === f.entry.target.job_id,
      )!,
      path = selectDailyFinanceReview(finance, {
        job_id: job.target.job_id!,
        exception_id: job.original_exception_ids[0],
      }),
      task = owner.tasks.find(
        (t) => t.job_id === job.target.job_id && t.source.kind === 'finance',
      )!,
      link = await openOwnerBriefingTask(owner, task.key, job.target.job_id!),
      destination = inspectOwnerBriefingDestination(link, job.target.job_id!),
      callback = vi.fn();
    expect(finance.jobs).toHaveLength(2);
    expect(new Set(finance.jobs.map((j) => j.target.job_id)).size).toBe(2);
    expect(link.anchor.target).toMatchObject(path.anchor.target);
    expect(link.anchor.job_id).toBe(path.anchor.target.job_id);
    expect(link.anchor.target.version_id).toBe(path.anchor.target.version_id);
    expect(link.original_rank).toBe(task.rank);
    expect(link.missing_evidence.some((e) => e.status === 'UNKNOWN')).toBe(
      true,
    );
    const returned = returnOwnerBriefingTask(link, job.target.job_id!);
    expect(returned.status).toBe('CURRENT_EXACT_SUGGESTION_RETURN');
    if (returned.status !== 'CURRENT_EXACT_SUGGESTION_RETURN')
      throw Error('Exact current suggestion return required');
    expect(returned.anchor).toBe(link.anchor);
    expect(navigateDailyFinanceReview(path, callback).status).not.toBe(
      'UNKNOWN',
    );
    expect(
      navigateOwnerBriefingTask(destination, callback, job.target.job_id!)
        .status,
    ).toBe('ORIGINAL_TASK_REVIEW_REQUESTED');
    expect(callback.mock.calls).toEqual([
      [job.target.job_id, 'finance'],
      [job.target.job_id, 'finance'],
    ]);
    expect(() =>
      assertDailyFinanceReviewCurrent(structuredClone(path)),
    ).toThrow();
    expect(() =>
      assertOwnerBriefingTaskCurrent(structuredClone(link)),
    ).toThrow();
    privateFields(link);
    unchanged();
  },
);

it.each([0, 1, 2])(
  'brand %i Retention and Advanced return the same exact property/job while retaining consent/provider UNKNOWN and original source evidence',
  async (brand) => {
    const f = await fixture(brand),
      unchanged = noCommands(f),
      [retention, addon] = await Promise.all([
        readRetentionReviewGuide(f.sources, maintenance(f), f.gate),
        readAddonReadinessGuide(
          f.sources,
          {
            job_id: f.entry.target.job_id!,
            kind: 'offline',
            edition: 'property_services',
          },
          f.gate,
        ),
      ]),
      row = retention.rows.find(
        (r) => r.context.job_id === addon.source.job_id,
      )!,
      detail = await inspectRetentionReviewItem(retention, row.key),
      controls = openAddonReadinessControls(addon),
      reference = controls.selection.references.find(
        (r) => r.kind === 'report',
      )!,
      record = await inspectAddonReadinessReference(addon, reference),
      callback = vi.fn();
    expect(row.context).toMatchObject({
      organization_id: addon.source.organization_id,
      customer_id: addon.source.customer_id,
      location_id: addon.source.location_id,
      job_id: addon.source.job_id,
      issued_version_id: addon.source.issued_version_id,
    });
    expect(record.reference.id).toBe(f.entry.report_id);
    expect(record.reference.version).toBe(f.entry.published_version);
    expect(controls.sources).toBe(f.sources);
    expect(detail.purpose_consent).toBe('UNVERIFIED');
    expect(detail.suppression).toBe('UNVERIFIED');
    expect(detail.send).toBe(false);
    expect(controls.selection.operational_ready).toBe(false);
    expect(controls.selection.missing_evidence.provider).toBe('UNKNOWN');
    expect(await returnRetentionReviewGuide(detail)).toBe(retention);
    expect(returnAddonReadinessContext(addon).job_id).toBe(row.context.job_id);
    await navigateRetentionReviewJob(detail, callback);
    await navigateAddonReadinessJob(addon, reference, callback, {
      current: callback,
      generation: 4,
    });
    expect(callback.mock.calls).toEqual([
      [row.context.job_id, 'maintenance'],
      [row.context.job_id],
    ]);
    privateFields({ retention, addon });
    expect(() =>
      assertRetentionReviewItemNow(structuredClone(detail)),
    ).toThrow();
    expect(() => assertAddonReadinessCurrent(structuredClone(addon))).toThrow();
    unchanged();
  },
);

const kinds = [
  'field',
  'finance',
  'customer',
  'growth',
  'intelligence',
  'advanced',
] as const;
type Kind = (typeof kinds)[number];
async function handle(kind: Kind, f: Fixture) {
  switch (kind) {
    case 'field': {
      const value = await readDailyFieldGuide(
        f.sources,
        { job_id: f.entry.target.job_id!, worker_id: '' },
        f.gate,
      );
      return { value, current: () => assertDailyFieldGuideNow(value) };
    }
    case 'finance': {
      const view = await readDailyFinanceGuide(
          f.sources,
          financeInput(),
          f.gate,
        ),
        value = selectDailyFinanceReview(view, {
          job_id: f.entry.target.job_id!,
          exception_id: view.jobs[0].original_exception_ids[0],
        });
      return { value, current: () => assertDailyFinanceReviewCurrent(value) };
    }
    case 'customer': {
      const view = await readServiceCompletionGuide(f.sources, f.gate),
        value = await openServiceCompletionContext(view, {
          ...selectServiceCompletionContext(view, f.entry.target.job_id!)!,
          staff_context_confirmed: true,
        });
      return {
        value,
        current: () => assertServiceCompletionContextCurrent(value),
      };
    }
    case 'growth': {
      const view = await readRetentionReviewGuide(
          f.sources,
          maintenance(f),
          f.gate,
        ),
        value = await inspectRetentionReviewItem(view, view.rows[0].key);
      return { value, current: () => assertRetentionReviewItemNow(value) };
    }
    case 'intelligence': {
      const view = await readOwnerBriefingGuide(f.sources, briefing(f), f.gate),
        task = view.tasks.find((t) => t.source.kind === 'report')!,
        value = await openOwnerBriefingTask(view, task.key, task.job_id!);
      return { value, current: () => assertOwnerBriefingTaskCurrent(value) };
    }
    case 'advanced': {
      const value = await readAddonReadinessGuide(
        f.sources,
        {
          job_id: f.entry.target.job_id!,
          kind: 'offline',
          edition: 'property_services',
        },
        f.gate,
      );
      return { value, current: () => assertAddonReadinessCurrent(value) };
    }
  }
}
it.each(kinds)(
  '%s retained source cannot resume after current staff is revoked then restored',
  async (kind) => {
    const f = await fixture(0, true),
      h = await handle(kind, f),
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
  '%s retained source rejects a foreign approved company even when the original company is restored',
  async (kind) => {
    const f = await fixture(1, true),
      h = await handle(kind, f),
      company = f.sources.company;
    f.sources.company = sampleCompanies[2];
    expect(h.current).toThrow();
    f.sources.company = company;
    expect(h.current).toThrow();
  },
);
it.each(kinds)(
  '%s rejects a same-company property substitution and cannot revive by restoring its presentation target',
  async (kind) => {
    const f = await fixture(2, true),
      h = await handle(kind, f),
      target = f.entry.target,
      original = target.location_id,
      other = f.sources.property
        .read(f.sources.company.id)
        .plans.find((p) => p.location_id !== original)!.location_id;
    expect(other).not.toBe(original);
    target.location_id = other;
    expect(h.current).toThrow();
    target.location_id = original;
    expect(h.current).toThrow();
  },
);
const components: Record<
  Kind | 'search',
  ComponentType<{ sources: OperatingSources; enabled?: boolean }>
> = {
  field: DailyFieldGuide,
  finance: DailyFinanceGuide,
  customer: ServiceCompletionGuide,
  growth: RetentionReviewGuide,
  intelligence: OwnerBriefingGuide,
  advanced: AddonReadinessGuide,
  search: SharedRecordSearch,
};
it.each([...kinds, 'search'] as const)(
  '%s production-OFF and nonloopback presentation never invokes source getters',
  (kind) => {
    const read = vi.fn(() => {
        throw Error('Unadmitted source getter');
      }),
      sources = Object.defineProperty({}, 'company', {
        enumerable: true,
        get: read,
      }) as OperatingSources;
    for (const environment of [
      { enabled: false, dev: true, host: '127.0.0.1', protocol: 'http:' },
      { enabled: true, dev: false, host: '127.0.0.1', protocol: 'http:' },
      {
        enabled: true,
        dev: true,
        host: 'localhost.example',
        protocol: 'http:',
      },
      { enabled: true, dev: true, host: 'localhost', protocol: 'https:' },
    ]) {
      vi.stubEnv('DEV', environment.dev);
      vi.stubGlobal('window', {
        location: {
          hostname: environment.host,
          protocol: environment.protocol,
        },
      });
      const html = renderToStaticMarkup(
        createElement(components[kind], {
          sources,
          enabled: environment.enabled,
        }),
      );
      expect(html.toLowerCase()).toMatch(/off|source unavailable/);
      expect(html).not.toContain('<button');
    }
    expect(read).not.toHaveBeenCalled();
  },
);
it('all six daily panels retain original navigation identity and independently default OFF over unread sources', () => {
  const metadata = (groups: typeof cycle16DailyGroups) =>
    groups.map((g) => ({
      ...g,
      panels: g.panels.map(({ render, ...panel }) => {
        expect(typeof render).toBe('function');
        return panel;
      }),
    }));
  expect(metadata(cycle16DailyGroups)).toEqual(
    metadata(cycle14ContinuityGroups),
  );
  const getter = vi.fn(() => {
      throw Error('No hidden source preparation');
    }),
    sources = Object.defineProperty({}, 'company', {
      enumerable: true,
      get: getter,
    }) as OperatingSources;
  const panels = cycle16DailyGroups.flatMap((g) => g.panels);
  expect(new Set(panels.map((p) => p.id)).size).toBe(6);
  for (const panel of panels) {
    const html = renderToStaticMarkup(
      panel.render({ sources, enabled: false, onSelectJob: vi.fn() }),
    );
    expect(html).toContain('Shared record search is off');
    expect(html.toLowerCase()).toContain('guide is off');
  }
  expect(getter).not.toHaveBeenCalled();
});
it('the combined candidate contains the exact thirty disjoint author blobs recorded at their final review heads', () => {
  const manifest = JSON.parse(
      readFileSync('docs/program/CYCLE16_DELIVERY_INDEX.json', 'utf8'),
    ) as {
      packages: {
        head_commit: string;
        owned_files: { path: string; sha256: string }[];
      }[];
    },
    paths = new Set<string>();
  expect(manifest.packages).toHaveLength(6);
  for (const p of manifest.packages) {
    expect(p.head_commit).toMatch(/^[a-f0-9]{40}$/);
    expect(p.owned_files).toHaveLength(5);
    for (const f of p.owned_files) {
      expect(paths.has(f.path)).toBe(false);
      const bytes = readFileSync(f.path),
        actual = createHash('sha256').update(bytes).digest('hex');
      if (actual === f.sha256) expect(actual).toBe(f.sha256);
      else {
        // Keep the original index and source proof; only this exact reviewed
        // successor may differ, with its original bytes and companions checked.
        expect({
          path: f.path,
          publishedCommit: p.head_commit,
          sha256: f.sha256,
        }).toEqual({
          path: 'src/lib/workflows/addon-readiness-guide.ts',
          publishedCommit: 'fecfcf104e7f3988a53c85a77353824edfa6f85b',
          sha256:
            'b3c6d6f20aa38d00f88a9987b30117f945c341cda5c591d16d5b8f671a5b60cf',
        });
        expect(
          sourceLineage.admitCycle33V1Published(f, bytes, p.head_commit),
        ).toEqual({
          module: 'addon-job-filter-currentness',
          source_commit: '99e112a7cf669dfde03fdd69dbdbce2e74ef2fd4',
          path: f.path,
          authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
          business_authority: false,
          restore_adapter: false,
        });
      }
      paths.add(f.path);
    }
  }
  expect(paths.size).toBe(30);
});
