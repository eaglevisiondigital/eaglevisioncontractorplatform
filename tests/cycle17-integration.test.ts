import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHash } from 'node:crypto';
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  unlinkSync,
  readdirSync,
  rmSync,
  lstatSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createCycle17VisualReview,
  readCycle17Png,
  writeCycle17VisualOutput,
} from '../scripts/cycle17-visual-review.mjs';
import { sampleCompanies } from '../src/domain/platform';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import {
  readFieldWorkspace,
  navigateFieldWorkspace,
  assertFieldWorkspaceNow,
  reconcileFieldWorkspace,
  openFieldWorkspaceSection,
  openFieldWorkspaceReport,
} from '../src/lib/workflows/field-workspace';
import {
  readFinanceCaseDesk,
  openFinanceCaseDesk,
  navigateFinanceCaseDesk,
  assertFinanceCaseDeskCurrent,
  returnFinanceCaseDesk,
  inspectFinanceCaseDeskSource,
} from '../src/lib/workflows/finance-case-desk';
import {
  readServicePassportPath,
  selectServicePassportContext,
  openServicePassportContext,
  openServicePassportDocumentation,
  navigateServicePassportJob,
  assertServicePassportContextCurrent,
  returnServicePassportSelection,
  openServicePassportOriginalReview,
  servicePassportBreadcrumbs,
} from '../src/lib/workflows/service-passport-path';
import {
  readRetainedMaintenanceDesk,
  selectRetainedMaintenanceCase,
  navigateRetainedMaintenanceCase,
  assertRetainedMaintenanceCaseNow,
  openRetainedMaintenanceSection,
} from '../src/lib/workflows/retained-maintenance-desk';
import type { FollowUpReadinessInput } from '../src/lib/workflows/follow-up-readiness';
import {
  readOwnerActionDesk,
  openOwnerActionDeskTask,
  navigateOwnerActionDeskTask,
  assertOwnerActionDeskTaskCurrent,
  returnOwnerActionDeskTask,
} from '../src/lib/workflows/owner-action-desk';
import {
  readAddonTaskDesk,
  openAddonTaskDeskControls,
  inspectAddonTaskDeskReference,
  navigateAddonTaskDeskJob,
  assertAddonTaskDeskCurrent,
  returnAddonTaskDeskContext,
  addonTaskDeskBreadcrumbs,
} from '../src/lib/workflows/addon-task-desk';
import { FieldWorkspace } from '../src/components/workflows/FieldWorkspace';
import { FinanceCaseDesk } from '../src/components/workflows/FinanceCaseDesk';
import { ServicePassportPath } from '../src/components/workflows/ServicePassportPath';
import { RetainedMaintenanceDesk } from '../src/components/workflows/RetainedMaintenanceDesk';
import { OwnerActionDesk } from '../src/components/workflows/OwnerActionDesk';
import { AddonTaskDesk } from '../src/components/workflows/AddonTaskDesk';
import { cycle17WorkspaceGroups } from '../src/components/workflows/OperatingCenterCycleSeventeen';
import { cycle14ContinuityGroups } from '../src/components/workflows/OperatingCenterCycleFourteen';
const sourceLineage: {
  admitCycle33V1Published: (
    file: { path: string; sha256: string },
    current: Buffer,
    publishedCommit: string,
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const fieldSourceLineage: {
  admitNextFieldPublished: (
    file: { path: string; sha256: string },
    current: Buffer,
    publishedCommit: string,
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/v1-next-native-source.mjs', import.meta.url).href
);

const fieldPublishedLineage: {
  validateFieldPublishedSource: (
    file: { path: string; sha256: string },
    current: Buffer,
    pkg: Record<string, unknown>,
  ) => unknown;
} = await import(
  new URL('../scripts/v1-field-source-admission.mjs', import.meta.url).href
);

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
    records: f.sources.entries.map((entry) => ({
      source: f.sources.estimates.readSyntheticPrototypeSources(entry.target),
      release: entry.release.read('staff'),
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
function noPrivateProjection(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(
    /unit_cost_minor|internal_notes|cash_minor|burden_minor|PRIVATE staff|@example|5550100100|Synthetic planning supplier/,
  );
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
const kinds = [
  'field',
  'finance',
  'customer',
  'growth',
  'intelligence',
  'advanced',
] as const;
type Kind = (typeof kinds)[number];
type Callback = (jobId: string, section?: string) => void;
async function navigation(kind: Kind, f: Fixture) {
  switch (kind) {
    case 'field': {
      const v = await readFieldWorkspace(
        f.sources,
        { job_id: f.entry.target.job_id!, worker_id: '' },
        f.gate,
      );
      return {
        value: v,
        run: (callback: Callback) => navigateFieldWorkspace(v, callback),
        current: () => assertFieldWorkspaceNow(v),
        back: () => reconcileFieldWorkspace(v),
      };
    }
    case 'finance': {
      const review = await readFinanceCaseDesk(
          f.sources,
          { as_of: new Date().toISOString(), input_revision: 1 },
          f.gate,
        ),
        v = openFinanceCaseDesk(review, f.entry.target.job_id!);
      return {
        value: v,
        run: (callback: Callback) => navigateFinanceCaseDesk(v, callback),
        current: () => assertFinanceCaseDeskCurrent(v),
        back: () => returnFinanceCaseDesk(v),
      };
    }
    case 'customer': {
      const review = await readServicePassportPath(f.sources, f.gate),
        selected = selectServicePassportContext(
          review,
          f.entry.target.job_id!,
        )!,
        v = await openServicePassportContext(review, {
          ...selected,
          staff_context_confirmed: true,
        }),
        reference = v.customer_safe.documentation.find(
          (d) => d.report.reference.report_id === f.entry.report_id,
        )!.report.reference,
        report = await openServicePassportDocumentation(v, reference);
      return {
        value: v,
        run: (callback: Callback) =>
          navigateServicePassportJob(v, report, callback, {
            current: callback,
            generation: 0,
          }),
        current: () => assertServicePassportContextCurrent(v),
        back: () => returnServicePassportSelection(v),
      };
    }
    case 'growth': {
      const desk = await readRetainedMaintenanceDesk(
          f.sources,
          maintenance(f),
          f.gate,
        ),
        v = await selectRetainedMaintenanceCase(desk, desk.rows[0].key);
      return {
        value: v,
        run: (callback: Callback) =>
          navigateRetainedMaintenanceCase(v, callback),
        current: () => assertRetainedMaintenanceCaseNow(v),
        back: () => openRetainedMaintenanceSection(v, 'queue'),
      };
    }
    case 'intelligence': {
      const review = await readOwnerActionDesk(
          f.sources,
          {
            review_on: f.entry.day,
            timezone: f.entry.timezone,
            ordering: 'EVIDENCE_FIRST',
            input_revision: 1,
          },
          f.gate,
        ),
        task = review.tasks.find((t) => t.source.kind === 'report')!,
        v = await openOwnerActionDeskTask(review, task.key, task.job_id!);
      return {
        value: v,
        run: (callback: Callback) => navigateOwnerActionDeskTask(v, callback),
        current: () => assertOwnerActionDeskTaskCurrent(v),
        back: () => returnOwnerActionDeskTask(v),
      };
    }
    case 'advanced': {
      const v = await readAddonTaskDesk(
          f.sources,
          {
            job_id: f.entry.target.job_id!,
            kind: 'offline',
            edition: 'property_services',
          },
          f.gate,
        ),
        props = openAddonTaskDeskControls(v),
        report = props.selection.references.find((r) => r.kind === 'report')!,
        record = await inspectAddonTaskDeskReference(v, report);
      return {
        value: v,
        run: (callback: Callback) =>
          navigateAddonTaskDeskJob(v, record, callback, {
            current: callback,
            generation: 0,
          }),
        current: () => assertAddonTaskDeskCurrent(v),
        back: () => returnAddonTaskDeskContext(v),
      };
    }
  }
}
it.each(kinds)(
  '%s ambiguous navigation cannot replay through a fresh same canonical wrapper',
  async (kind) => {
    const f = await fixture(0, true),
      nav = await navigation(kind, f),
      originalBytes = JSON.stringify(nav.value),
      first = vi.fn(() => {
        throw Error('Host navigated; acknowledgment lost');
      }),
      second = vi.fn();
    try {
      await nav.run(first);
    } catch {
      // Throwing and explicit UNKNOWN returns are both fail-closed API forms.
    }
    expect(first).toHaveBeenCalledTimes(1);
    expect(nav.current).toThrow();
    let reconciliation: unknown;
    try {
      reconciliation = await nav.back();
    } catch {
      reconciliation = { status: 'UNKNOWN' };
    }
    expect(reconciliation).toMatchObject({ status: 'UNKNOWN' });
    const rebound = {
      ...f,
      sources: { ...f.sources, entries: [...f.sources.entries] },
    };
    expect(rebound.sources.operations).toBe(f.sources.operations);
    expect(rebound.sources.estimates).toBe(f.sources.estimates);
    expect(rebound.sources.property).toBe(f.sources.property);
    try {
      const retry = await navigation(kind, rebound);
      await retry.run(second);
    } catch {
      // A new wrapper cannot erase the original uncertain source/job outcome.
    }
    expect(second).not.toHaveBeenCalled();
    expect(JSON.stringify(nav.value)).toBe(originalBytes);
  },
);
it.each(['customer', 'advanced'] as const)(
  '%s clean pre-dispatch callback withdrawal permits a later explicit navigation without relabeling UNKNOWN',
  async (kind) => {
    const f = await fixture(0, true),
      unchanged = noCommands(f),
      callback = vi.fn(),
      live: { current: Callback | undefined; generation: number } = {
        current: callback,
        generation: 0,
      };
    let request: () => Promise<string>, current: () => void;
    if (kind === 'customer') {
      const selection = await readServicePassportPath(f.sources, f.gate),
        path = await openServicePassportContext(selection, {
          ...selectServicePassportContext(selection, f.entry.target.job_id!)!,
          staff_context_confirmed: true,
        }),
        report = await openServicePassportDocumentation(
          path,
          path.customer_safe.documentation.find(
            (d) => d.report.reference.report_id === f.entry.report_id,
          )!.report.reference,
        );
      current = () => assertServicePassportContextCurrent(path);
      request = () => navigateServicePassportJob(path, report, callback, live);
    } else {
      const task = await readAddonTaskDesk(
          f.sources,
          {
            job_id: f.entry.target.job_id!,
            kind: 'offline',
            edition: 'property_services',
          },
          f.gate,
        ),
        controls = openAddonTaskDeskControls(task),
        record = await inspectAddonTaskDeskReference(
          task,
          controls.selection.references.find((r) => r.kind === 'report')!,
        );
      current = () => assertAddonTaskDeskCurrent(task);
      request = () => navigateAddonTaskDeskJob(task, record, callback, live);
    }
    const pending = request();
    live.current = undefined;
    live.generation++;
    await expect(pending).rejects.toThrow(/withdrawn or replaced/);
    expect(callback).not.toHaveBeenCalled();
    current();
    live.current = callback;
    live.generation++;
    expect(await request()).toBe(f.entry.target.job_id);
    expect(callback).toHaveBeenCalledTimes(1);
    unchanged();
  },
);

it.each([0, 1, 2])(
  'brand %i Field and Customer retain one exact job/report/version and original control source without business writes',
  async (brand) => {
    const f = await fixture(brand),
      unchanged = noCommands(f),
      [field, selection] = await Promise.all([
        readFieldWorkspace(
          f.sources,
          { job_id: f.entry.target.job_id!, worker_id: f.entry.worker_id },
          f.gate,
        ),
        readServicePassportPath(f.sources, f.gate),
      ]),
      selected = selectServicePassportContext(selection, field.source.job_id)!,
      path = await openServicePassportContext(selection, {
        ...selected,
        staff_context_confirmed: true,
      }),
      reference = path.customer_safe.documentation.find(
        (d) => d.report.reference.report_id === f.entry.report_id,
      )!.report.reference,
      [staff, report] = await Promise.all([
        openFieldWorkspaceReport(
          field,
          reference.report_id,
          reference.published_version,
        ),
        openServicePassportDocumentation(path, reference),
      ]),
      originalControls = openServicePassportOriginalReview(path, report),
      breadcrumbs = servicePassportBreadcrumbs(path, report),
      fieldControls = await openFieldWorkspaceSection(field, 'controls'),
      sourceView = await openFieldWorkspaceSection(field, 'sources');
    expect(originalControls.sources).toBe(f.entry);
    expect(fieldControls.view).toBe(field);
    expect(sourceView.view).toBe(field);
    expect(path.context.job_id).toBe(field.source.job_id);
    expect(path.recorded_job_scope.issued_version_id).toBe(
      field.source.issued_version_id,
    );
    expect(path.customer_safe.property).toMatchObject({
      organization_id: field.source.organization_id,
      customer_id: field.source.customer_id,
      location_id: field.source.location_id,
    });
    expect(report.reference).toMatchObject({
      report_id: staff.report.report_id,
      published_version: staff.report.published_version,
      customer_id: field.source.customer_id,
      location_id: field.source.location_id,
    });
    expect(breadcrumbs.find((b) => b.kind === 'property')?.id).toBe(
      field.breadcrumbs.find((b) => b.kind === 'property')!.id,
    );
    expect(breadcrumbs.find((b) => b.kind === 'job')?.id).toBe(
      field.breadcrumbs.find((b) => b.kind === 'job')!.id,
    );
    expect(field.operational_ready).toBe(false);
    expect(field.physical_completion).toBe('UNVERIFIED');
    expect(path.context.recorded_request_job_link).toContain('UNKNOWN');
    expect(
      path.customer_safe.required_proof.every((p) => p.status === 'UNKNOWN'),
    ).toBe(true);
    expect(() => assertFieldWorkspaceNow(structuredClone(field))).toThrow();
    expect(() =>
      assertServicePassportContextCurrent(structuredClone(path)),
    ).toThrow();
    noPrivateProjection({ field, customer: path.customer_safe });
    unchanged();
  },
);

it.each([0, 1, 2])(
  'brand %i financial case evidence and owner priority resolve the same canonical portfolio job without new calculation or authority',
  async (brand) => {
    const f = await fixture(brand),
      unchanged = noCommands(f),
      sources = {
        ...f.sources,
        entries: [f.sources.entries[0], f.entry],
      },
      [finance, owner] = await Promise.all([
        readFinanceCaseDesk(
          sources,
          { as_of: new Date().toISOString(), input_revision: 1 },
          f.gate,
        ),
        readOwnerActionDesk(
          sources,
          {
            review_on: f.entry.day,
            timezone: f.entry.timezone,
            ordering: 'EVIDENCE_FIRST',
            input_revision: 1,
          },
          f.gate,
        ),
      ]),
      desk = openFinanceCaseDesk(finance, f.entry.target.job_id!),
      row = owner.tasks.find(
        (t) =>
          t.source.kind === 'finance' && t.job_id === desk.anchor.target.job_id,
      )!,
      task = await openOwnerActionDeskTask(owner, row.key, row.job_id!),
      requirement = desk.sources.find((s) => s.kind === 'requirement')!,
      evidence = inspectFinanceCaseDeskSource(desk, {
        kind: requirement.kind,
        id: requirement.id,
      });
    expect(finance.jobs).toHaveLength(2);
    expect(new Set(finance.jobs.map((j) => j.target.job_id)).size).toBe(2);
    expect(task.anchor.target).toEqual(desk.anchor.target);
    expect(evidence.selection.target).toEqual(desk.anchor.target);
    expect(task.original_rank).toBe(row.rank);
    expect(task.next_review).toBe(row.suggested_human_review);
    expect(task.expires_at).toBeTruthy();
    expect(returnOwnerActionDeskTask(task).status).toBe(
      'CURRENT_EXACT_OWNER_TASK_RETURN',
    );
    expect(returnFinanceCaseDesk(desk).status).toBe(
      'CURRENT_EXACT_DESK_RETURN',
    );
    expect(desk.job.facts.costs).toBeNull();
    expect(desk.job.invoice.overall).toBe('NO_GO');
    expect(desk.accounting.status).toBe(
      'BLOCKED_NO_OPERATIONAL_ACCOUNTING_AUTHORITY',
    );
    expect(Object.values(owner.authority).every((v) => v === false)).toBe(true);
    expect(() => assertFinanceCaseDeskCurrent(structuredClone(desk))).toThrow();
    expect(() =>
      assertOwnerActionDeskTaskCurrent(structuredClone(task)),
    ).toThrow();
    noPrivateProjection(task);
    unchanged();
  },
);

it.each([0, 1, 2])(
  'brand %i maintenance and add-on direct controls retain canonical property/job/source with no consent or provider execution',
  async (brand) => {
    const f = await fixture(brand),
      unchanged = noCommands(f),
      [desk, addon] = await Promise.all([
        readRetainedMaintenanceDesk(f.sources, maintenance(f), f.gate),
        readAddonTaskDesk(
          f.sources,
          {
            job_id: f.entry.target.job_id!,
            kind: 'offline',
            edition: 'property_services',
          },
          f.gate,
        ),
      ]),
      row = desk.rows.find((r) => r.context.job_id === addon.source.job_id)!,
      selected = await selectRetainedMaintenanceCase(desk, row.key),
      controls = openAddonTaskDeskControls(addon),
      reference = controls.selection.references.find(
        (r) => r.kind === 'report',
      )!,
      record = await inspectAddonTaskDeskReference(addon, reference),
      crumb = addonTaskDeskBreadcrumbs(addon, record),
      originalMaintenance = await openRetainedMaintenanceSection(
        selected,
        'controls',
      ),
      returned = await openRetainedMaintenanceSection(selected, 'queue');
    expect(row.context).toMatchObject({
      organization_id: addon.source.organization_id,
      customer_id: addon.source.customer_id,
      location_id: addon.source.location_id,
      job_id: addon.source.job_id,
      issued_version_id: addon.source.issued_version_id,
    });
    expect(controls.sources).toBe(f.sources);
    expect(controls.selection.reference).toBe(addon.source);
    expect(originalMaintenance.view).toBe(selected);
    expect(returned.view).toBe(selected);
    expect(returned.desk).toBe(desk);
    expect(record.reference.id).toBe(f.entry.report_id);
    expect(record.reference.version).toBe(f.entry.published_version);
    expect(crumb.find((c) => c.kind === 'job')?.id).toBe(
      selected.breadcrumbs.find((c) => c.kind === 'job')!.id,
    );
    expect(selected.send).toBe(false);
    expect(selected.purpose_consent).toBe('UNVERIFIED');
    expect(selected.suppression).toBe('UNVERIFIED');
    expect(controls.selection.missing_evidence.provider).toBe('UNKNOWN');
    expect(controls.selection.operational_ready).toBe(false);
    expect(returnAddonTaskDeskContext(addon).job_id).toBe(row.context.job_id);
    expect(() =>
      assertRetainedMaintenanceCaseNow(structuredClone(selected)),
    ).toThrow();
    expect(() => assertAddonTaskDeskCurrent(structuredClone(addon))).toThrow();
    noPrivateProjection({ desk, addon });
    unchanged();
  },
);

it.each(kinds)(
  '%s retained currentness and callback withdraw after staff revocation even if membership is restored',
  async (kind) => {
    const f = await fixture(0, true),
      h = await navigation(kind, f),
      bytes = JSON.stringify(h.value),
      membership = vi
        .spyOn(f.sources.operations, 'syntheticMemberships')
        .mockReturnValue([]),
      callback = vi.fn();
    expect(h.current).toThrow();
    membership.mockRestore();
    expect(h.current).toThrow();
    try {
      await h.run(callback);
    } catch {
      // Both API error forms deny the callback without retry or replacement.
    }
    expect(callback).not.toHaveBeenCalled();
    expect(JSON.stringify(h.value)).toBe(bytes);
  },
);
it.each(kinds)(
  '%s same-company wrong-property source substitution is terminal after source restoration',
  async (kind) => {
    const f = await fixture(1, true),
      h = await navigation(kind, f),
      original = f.entry.target.location_id,
      other = f.sources.property
        .read(f.sources.company.id)
        .plans.find((p) => p.location_id !== original)!.location_id;
    expect(other).not.toBe(original);
    f.entry.target.location_id = other;
    expect(h.current).toThrow();
    f.entry.target.location_id = original;
    expect(h.current).toThrow();
  },
);
it.each(kinds)(
  '%s foreign approved company cannot borrow the retained property/job/source by restoring labels',
  async (kind) => {
    const f = await fixture(2, true),
      h = await navigation(kind, f),
      company = f.sources.company;
    f.sources.company = sampleCompanies[0];
    expect(h.current).toThrow();
    f.sources.company = company;
    expect(h.current).toThrow();
  },
);
const components: Record<
  Kind,
  ComponentType<{ sources: OperatingSources; enabled?: boolean }>
> = {
  field: FieldWorkspace,
  finance: FinanceCaseDesk,
  customer: ServicePassportPath,
  growth: RetainedMaintenanceDesk,
  intelligence: OwnerActionDesk,
  advanced: AddonTaskDesk,
};
it.each(kinds)(
  '%s stays OFF before getters in production or outside explicit HTTP loopback',
  (kind) => {
    const getter = vi.fn(() => {
        throw Error('Unadmitted source getter');
      }),
      sources = Object.defineProperty({}, 'company', {
        enumerable: true,
        get: getter,
      }) as OperatingSources;
    for (const environment of [
      { enabled: false, dev: true, host: '127.0.0.1', protocol: 'http:' },
      { enabled: true, dev: false, host: '127.0.0.1', protocol: 'http:' },
      {
        enabled: true,
        dev: true,
        host: 'localhost.evil.invalid',
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
    expect(getter).not.toHaveBeenCalled();
  },
);
it('six workspaces reuse the exact original navigation identities and render without source preparation while OFF', () => {
  const metadata = (groups: typeof cycle17WorkspaceGroups) =>
    groups.map((g) => ({
      ...g,
      panels: g.panels.map(({ render, ...panel }) => {
        expect(typeof render).toBe('function');
        return panel;
      }),
    }));
  expect(metadata(cycle17WorkspaceGroups)).toEqual(
    metadata(cycle14ContinuityGroups),
  );
  const getter = vi.fn(() => {
      throw Error('No hidden source read');
    }),
    sources = Object.defineProperty({}, 'company', {
      enumerable: true,
      get: getter,
    }) as OperatingSources,
    panels = cycle17WorkspaceGroups.flatMap((g) => g.panels);
  expect(new Set(panels.map((p) => p.id)).size).toBe(6);
  for (const p of panels) {
    const html = renderToStaticMarkup(
      p.render({ sources, enabled: false, onSelectJob: vi.fn() }),
    );
    expect(html).toContain('Shared record search is off');
  }
  expect(getter).not.toHaveBeenCalled();
});
it('the combined admission retains all thirty exact reviewed source/test blobs without overlapping ownership', () => {
  const index = JSON.parse(
      readFileSync('docs/program/CYCLE17_DELIVERY_INDEX.json', 'utf8'),
    ) as {
      packages: {
        head_commit: string;
        owned_files: { path: string; sha256: string }[];
      }[];
    },
    seen = new Set<string>();
  expect(index.packages).toHaveLength(6);
  for (const p of index.packages) {
    expect(p.head_commit).toMatch(/^[a-f0-9]{40}$/);
    expect(p.owned_files).toHaveLength(5);
    for (const f of p.owned_files) {
      expect(seen.has(f.path)).toBe(false);
      const current = readFileSync(f.path),
        sha256 = createHash('sha256').update(current).digest('hex');
      if (f.path === 'src/lib/workflows/field-workspace.ts') {
        expect(f.sha256).toBe(
          '682306378cd16d8cde94ab153633b1621f44d3696d6f7b2743e57d33116f97f8',
        );
        expect(p.head_commit).toBe('23829f2995b113eb5426b0a5328e12624efd3be5');
      }
      if (
        f.path === 'src/lib/workflows/field-workspace.ts' &&
        sha256 !== f.sha256
      )
        expect(
          fieldSourceLineage.admitNextFieldPublished(f, current, p.head_commit),
        ).toEqual({
          path: 'src/lib/workflows/field-workspace.ts',
          source_commit: '94556e2a213bb513264432aa48e97bd3a94184d2',
          module: 'field-navigation-ack',
          authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
          business_authority: false,
          restore_adapter: false,
        });
      else expect(sha256).toBe(f.sha256);
      seen.add(f.path);
    }
  }
  expect(seen.size).toBe(30);
});
it('Cycle16 closeout preserves child cancellations separately from actual successful combined-source coverage', () => {
  const closeout = JSON.parse(
    readFileSync(
      'docs/program/CYCLE16_CLOSEOUT_CI_RECONCILIATION.json',
      'utf8',
    ),
  ) as {
    main_check_inventory: {
      success: number;
      workflow_runs: number;
      cancelled: number;
    };
    manual_reruns: number;
    features: {
      pr: number;
      own_successful_verify: string[];
      cancelled_verify: { outcome: string; cause: string }[];
      owned_files: { path: string; sha256: string }[];
      foundation_workflow_sha256: string;
    }[];
  };
  expect(closeout.main_check_inventory).toMatchObject({
    success: 30,
    workflow_runs: 28,
    cancelled: 0,
  });
  expect(closeout.manual_reruns).toBe(0);
  expect(closeout.features.flatMap((f) => f.cancelled_verify)).toHaveLength(7);
  for (const feature of closeout.features) {
    if ([114, 115, 117].includes(feature.pr))
      expect(feature.own_successful_verify).toEqual([]);
    for (const check of feature.cancelled_verify) {
      expect(check.outcome).toBe('CANCELLED');
      expect(check.cause).toContain('45-minute');
    }
    expect(feature.owned_files).toHaveLength(5);
    for (const file of feature.owned_files) {
      if (
        feature.pr === 112 &&
        file.path === 'src/lib/workflows/daily-field-guide.ts'
      ) {
        const reference = { path: file.path, sha256: file.sha256 };
        expect(reference).toEqual({
          path: 'src/lib/workflows/daily-field-guide.ts',
          sha256:
            '6fcaea74f19b422424e0b562d91fb94e1d9654b0598b20c6551d3ba405c5410d',
        });
        const originalPackage = (
          JSON.parse(
            readFileSync('docs/program/CYCLE16_DELIVERY_INDEX.json', 'utf8'),
          ) as { packages: Record<string, unknown>[] }
        ).packages.find((pkg) => pkg.draft_pr === 112);
        expect(originalPackage).toBeDefined();
        const current = readFileSync(file.path);
        expect(() =>
          fieldPublishedLineage.validateFieldPublishedSource(
            reference,
            current,
            originalPackage!,
          ),
        ).not.toThrow();
        expect(() =>
          fieldPublishedLineage.validateFieldPublishedSource(
            reference,
            Buffer.concat([current, Buffer.from('\n// unknown edit\n')]),
            originalPackage!,
          ),
        ).toThrow();
      } else if (
        feature.pr === 117 &&
        file.path === 'src/lib/workflows/addon-readiness-guide.ts'
      ) {
        expect({
          pr: feature.pr,
          path: file.path,
          sha256: file.sha256,
        }).toEqual({
          pr: 117,
          path: 'src/lib/workflows/addon-readiness-guide.ts',
          sha256:
            'b3c6d6f20aa38d00f88a9987b30117f945c341cda5c591d16d5b8f671a5b60cf',
        });
        expect(
          sourceLineage.admitCycle33V1Published(
            file,
            readFileSync(file.path),
            'fecfcf104e7f3988a53c85a77353824edfa6f85b',
          ),
        ).toEqual({
          module: 'addon-job-filter-currentness',
          source_commit: '99e112a7cf669dfde03fdd69dbdbce2e74ef2fd4',
          path: file.path,
          authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
          business_authority: false,
          restore_adapter: false,
        });
      } else
        expect(
          createHash('sha256').update(readFileSync(file.path)).digest('hex'),
        ).toBe(file.sha256);
    }
    expect(
      createHash('sha256')
        .update(readFileSync('.github/workflows/ci.yml'))
        .digest('hex'),
    ).toBe(feature.foundation_workflow_sha256);
  }
});
it('the local visual review cannot read remote/private image paths or replace a linked output, and valid writes leave only the exact atomic output', () => {
  const reader = vi.fn(() => Buffer.alloc(0)),
    manifest = {
      schema: 'propel-cycle17-owner-visual-v1',
      visual_approval: 'PENDING',
      screenshots: Array.from({ length: 36 }, () => ({
        scope: 'operating-panels',
        brand: 'straight-edge',
        viewport: 'desktop',
        side: 'reference',
        approval: 'PENDING',
        source: 'a'.repeat(40),
        path: 'https://example.invalid/private-capture.png',
      })),
    };
  expect(() => createCycle17VisualReview(manifest, reader)).toThrow();
  expect(reader).not.toHaveBeenCalled();
  const root = mkdtempSync(join(tmpdir(), 'propel-c17-independent-visual-'));
  try {
    mkdirSync(join(root, 'artifacts/cycle17'), { recursive: true });
    const sentinel = join(root, 'sentinel'),
      output = join(root, 'artifacts/cycle17/visual-manifest.json');
    writeFileSync(sentinel, 'unchanged private sentinel');
    symlinkSync(sentinel, output);
    expect(() =>
      writeCycle17VisualOutput(
        root,
        'artifacts/cycle17/visual-manifest.json',
        'must not overwrite sentinel',
      ),
    ).toThrow();
    expect(readFileSync(sentinel, 'utf8')).toBe('unchanged private sentinel');
    expect(() => readCycle17Png(root, '../sentinel')).toThrow();
    expect(() =>
      readCycle17Png(root, 'file:///private/tmp/sentinel.png'),
    ).toThrow();
    unlinkSync(output);
    const exact = '{"visual_approval":"PENDING"}\n';
    writeCycle17VisualOutput(
      root,
      'artifacts/cycle17/visual-manifest.json',
      exact,
    );
    expect(readFileSync(output, 'utf8')).toBe(exact);
    expect(lstatSync(output).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(root, 'artifacts/cycle17'))).toEqual([
      'visual-manifest.json',
    ]);
    expect(readFileSync(sentinel, 'utf8')).toBe('unchanged private sentinel');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
