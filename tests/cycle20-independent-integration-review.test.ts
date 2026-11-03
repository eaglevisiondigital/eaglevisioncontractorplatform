import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { documentHash } from '../src/domain/release/preview';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  prepareSavedEvidence,
  openSavedEvidence,
  reconcileSavedEvidence,
  assertSavedEvidenceAccess,
  decodeSavedEvidence,
  type EvidenceRecipe,
} from '../src/lib/workflows/saved-evidence-runtime';
import { workOrderEvidenceRecipe } from '../src/lib/workflows/work-order-evidence-continuity';
import {
  recordedCostRecipe,
  previewOrganizationLabor,
  confirmOrganizationLabor,
  reconcileOrganizationLabor,
} from '../src/lib/workflows/recorded-cost-continuity';
import { publishedServiceEvidenceRecipe } from '../src/lib/workflows/published-service-continuity';
import { maintenanceRenewalEvidenceRecipe } from '../src/lib/workflows/maintenance-renewal-evidence';
import {
  recordedPriorityRecipe,
  readRecordedPriorityNavigation,
  inspectRecordedPrioritySource,
  continueRecordedPrioritySource,
} from '../src/lib/workflows/recorded-priority-navigation';
import {
  executeSavedDraftEdit,
  readSavedDraftEdit,
  readSavedSourceExercise,
} from '../src/lib/workflows/saved-revision-exercise';
import {
  readSavedEvidenceFile,
  writeSavedEvidenceFile,
} from '../server/field-lab/saved-evidence-files';
import { SavedRevisionWorkbench } from '../src/components/workflows/SavedRevisionWorkbench';
import { SavedEvidenceControls } from '../src/components/workflows/SavedEvidenceControls';

const recipes: readonly EvidenceRecipe<unknown>[] = [
  workOrderEvidenceRecipe,
  recordedCostRecipe,
  publishedServiceEvidenceRecipe,
  maintenanceRenewalEvidenceRecipe,
  recordedPriorityRecipe,
] as EvidenceRecipe<unknown>[];
const diskGate = { enabled: true, test_only: true };
const roots: string[] = [];
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  roots.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true }));
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[2];
  return {
    gate,
    sources,
    entry,
    job: entry.target.job_id!,
    org: sources.company.id,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function file<P>(f: Fixture, recipe: EvidenceRecipe<P>) {
  return prepareSavedEvidence(f.sources, f.job, recipe, f.gate);
}
async function rewrite(
  text: string,
  change: (raw: Record<string, unknown>) => void,
) {
  const raw = JSON.parse(text);
  change(raw);
  const { sha256: _, ...body } = raw;
  void _;
  return JSON.stringify({ ...body, sha256: await documentHash(body) });
}
function folder() {
  const dir = mkdtempSync(
    join(realpathSync(tmpdir()), 'propel-saved-evidence-review-'),
  );
  roots.push(dir);
  return dir;
}
function revoke(f: Fixture) {
  const original = f.sources.operations.syntheticMemberships.bind(
    f.sources.operations,
  );
  return vi
    .spyOn(f.sources.operations, 'syntheticMemberships')
    .mockImplementation((org) =>
      original(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
      ),
    );
}
async function editDraft(f: Fixture) {
  const view = await readSavedSourceExercise(f.sources, f.job, f.gate),
    draft = readSavedDraftEdit(view);
  const input = {
    summary: 'PRIVATE_DRAFT_REVIEW_SENTINEL',
    checklist: draft.checklist.map((c, i) => ({
      id: c.id,
      label: c.label,
      completed: i === 0 ? !c.completed : c.completed,
    })),
  };
  return { view, draft, input };
}
async function endedTime(f: Fixture, index: number) {
  const entry = f.sources.entries[index],
    id = await f.sources.estimates.recordTime(f.org, entry.worker_id, {
      job_id: entry.target.job_id!,
      overhead_center: null,
      task: 'PRIVATE_TIME_REVIEW_SENTINEL',
      kind: 'work',
      started_at: `2026-01-12T${String(9 + index).padStart(2, '0')}:00:00.000Z`,
      ended_at: `2026-01-12T${String(10 + index).padStart(2, '0')}:00:00.000Z`,
      billable: false,
      corrects_id: null,
    });
  if (typeof id !== 'string') throw Error('Original time ID required');
  await f.sources.estimates.submitTime(f.org, id);
  await f.sources.estimates.reviewTime(
    f.org,
    id,
    'approved',
    'PRIVATE_REVIEW_SENTINEL',
  );
  return id;
}
const period = {
  start: '2026-01-12T00:00:00.000Z',
  end: '2026-01-13T00:00:00.000Z',
};

describe('Independent combined Cycle20 source and evidence review', () => {
  for (const recipe of recipes) {
    it.each([0, 1, 2])(
      `brand %i ${recipe.kind}: full private file roundtrip preserves exact identities and invokes no writer`,
      async (brand) => {
        const f = await fixture(brand),
          original = await file(f, recipe),
          dir = folder();
        const before = JSON.stringify(f.sources.property.read(f.org)),
          jobs = JSON.stringify(await f.sources.estimates.jobs(f.org)),
          ids = vi.spyOn(crypto, 'randomUUID'),
          network = vi.spyOn(globalThis, 'fetch'),
          save = vi.spyOn(f.sources.property, 'saveVisit'),
          payroll = vi.spyOn(f.sources.estimates, 'payroll');
        const ack = writeSavedEvidenceFile(dir, original.text, diskGate);
        expect(ack).toMatchObject({
          durable_ack: true,
          canonical_restore: false,
          authority: false,
        });
        const bytes = readSavedEvidenceFile(
          dir,
          ack.id,
          ack.byte_sha256,
          diskGate,
        );
        expect(bytes.text).toBe(
          readFileSync(join(dir, ack.id + '.json'), 'utf8'),
        );
        const opened = await openSavedEvidence(
          f.sources,
          f.job,
          recipe,
          bytes.text,
          f.gate,
        );
        expect(opened.envelope.identity).toEqual({
          organization_id: f.org,
          customer_id: f.entry.target.customer_id,
          location_id: f.entry.target.location_id,
          estimate_id: f.entry.target.estimate_id,
          version_id: f.entry.target.version_id,
          job_id: f.job,
        });
        expect(await reconcileSavedEvidence(opened)).toMatchObject({
          status: 'CURRENT_MATCH',
          meaning: 'EXACT_READ_ONLY_RECONCILIATION',
          authority: false,
          canonical_restore: false,
        });
        expect(
          writeSavedEvidenceFile(dir, original.text, diskGate),
        ).toMatchObject({
          status: 'EXISTING_FILE_READ_ONLY',
          durable_ack: false,
        });
        expect(JSON.stringify(f.sources.property.read(f.org))).toBe(before);
        expect(JSON.stringify(await f.sources.estimates.jobs(f.org))).toBe(
          jobs,
        );
        [ids, network, save, payroll].forEach((s) =>
          expect(s).not.toHaveBeenCalled(),
        );
        expect(opened.text).toBe(original.text);
      },
    );
    it(`${recipe.kind}: self-rehashed foreign property, payload, private extras and fresh-root imports are rejected`, async () => {
      const f = await fixture(),
        foreign = await fixture(1),
        a = await file(f, recipe),
        b = await file(foreign, recipe);
      for (const text of [
        await rewrite(a.text, (r) => {
          (r.identity as Record<string, unknown>).location_id =
            foreign.entry.target.location_id;
        }),
        await rewrite(a.text, (r) => {
          r.payload = b.envelope.payload;
        }),
        await rewrite(a.text, (r) => {
          (r.payload as Record<string, unknown>).supplier_unit_cost = 887766;
        }),
      ])
        await expect(
          openSavedEvidence(f.sources, f.job, recipe, text, f.gate),
        ).rejects.toThrow();
      await expect(
        openSavedEvidence(
          foreign.sources,
          foreign.job,
          recipe,
          a.text,
          foreign.gate,
        ),
      ).rejects.toThrow();
      const fresh = await fixture();
      await expect(
        openSavedEvidence(fresh.sources, fresh.job, recipe, a.text, fresh.gate),
      ).rejects.toThrow();
    });
    it(`${recipe.kind}: actual staff revocation prevents historical inspection and fresh reconciliation`, async () => {
      const f = await fixture(),
        saved = await file(f, recipe);
      revoke(f);
      expect(() => assertSavedEvidenceAccess(saved)).toThrow();
      await expect(reconcileSavedEvidence(saved)).rejects.toThrow();
      await expect(
        openSavedEvidence(f.sources, f.job, recipe, saved.text, f.gate),
      ).rejects.toThrow();
    });
  }
  it.each([0, 1, 2])(
    'brand %i explicit draft edit has one original claim; customer published evidence remains identical',
    async (brand) => {
      const f = await fixture(brand),
        published = await file(f, publishedServiceEvidenceRecipe),
        field = await file(f, workOrderEvidenceRecipe),
        { view, draft, input } = await editDraft(f),
        save = vi.spyOn(f.sources.property, 'saveVisit');
      const results = await Promise.allSettled([
        executeSavedDraftEdit(view, input, true),
        executeSavedDraftEdit(view, input, true),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(save).toHaveBeenCalledTimes(1);
      const current = f.sources.property
        .read(f.org)
        .visits.find((v) => v.id === draft.visit_id)!;
      expect(current.revision).toBe(draft.revision + 1);
      expect(current.status).toBe('draft');
      expect(await reconcileSavedEvidence(field)).toMatchObject({
        status: 'STALE_SAVED_EVIDENCE',
      });
      expect(await reconcileSavedEvidence(published)).toMatchObject({
        status: 'CURRENT_MATCH',
      });
      expect((await file(f, publishedServiceEvidenceRecipe)).text).toBe(
        published.text,
      );
      expect(published.text).not.toMatch(
        /PRIVATE_|internal_notes|supplier|payroll|worker_id|actor_id|margin/,
      );
      expect(published.envelope.payload).toMatchObject({
        physical_completion: 'UNVERIFIED',
        customer_acceptance: 'UNVERIFIED',
        warranty: 'UNVERIFIED',
        delivery: 'NOT_SENT',
      });
    },
  );
  it('lost original draft ACK stays UNKNOWN after file open/reconcile and wrapper replacement', async () => {
    const f = await fixture(),
      { view, input } = await editDraft(f),
      original = f.sources.property.saveVisit.bind(f.sources.property);
    const spy = vi
      .spyOn(f.sources.property, 'saveVisit')
      .mockImplementation((...args) => {
        original(...args);
        throw Error('lost after canonical write');
      });
    await expect(executeSavedDraftEdit(view, input, true)).rejects.toThrow();
    const saved = await file(f, workOrderEvidenceRecipe);
    await reconcileSavedEvidence(
      await openSavedEvidence(
        f.sources,
        f.job,
        workOrderEvidenceRecipe,
        saved.text,
        f.gate,
      ),
    );
    const wrapper = { ...f.sources },
      next = await readSavedSourceExercise(wrapper, f.job, f.gate);
    await expect(executeSavedDraftEdit(next, input, true)).rejects.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it.each([0, 1, 2])(
    'brand %i ended organization preparation updates original job labor once, retains issued scope and never touches financial ledger',
    async (brand) => {
      const f = await fixture(brand),
        a = await endedTime(f, 0),
        b = await endedTime(f, 2),
        before = await f.sources.estimates.jobs(f.org),
        safe = await file(f, publishedServiceEvidenceRecipe),
        finance = await file(f, recordedCostRecipe),
        priorities = await file(f, recordedPriorityRecipe),
        view = await previewOrganizationLabor(f.sources, f.job, period, f.gate),
        lock = vi.spyOn(f.sources.estimates, 'payroll'),
        release = JSON.stringify(f.entry.release.read('staff'));
      expect(view.jobs).toHaveLength(before.length);
      expect(view.entries.map((e) => e.id)).toEqual(
        expect.arrayContaining([a, b]),
      );
      expect(view.jobs.filter((j) => j.loaded_cost_minor > 0)).toHaveLength(2);
      const out = await confirmOrganizationLabor(view, true);
      expect(out).toMatchObject({
        status: 'LOCKED_INTERNAL_PREPARATION',
        financial_execution: false,
        replay: 'FORBIDDEN',
      });
      const after = await f.sources.estimates.jobs(f.org);
      for (const old of before) {
        const current = after.find((j) => j.id === old.id)!;
        expect(current.lock_revision).toBe(old.lock_revision + 1);
        const { labor: oldLabor, lock_revision: oldRevision, ...oldRest } = old;
        const {
          labor: nextLabor,
          lock_revision: nextRevision,
          ...nextRest
        } = current;
        expect(nextRest).toEqual(oldRest);
        expect(nextRevision).toBe(oldRevision + 1);
        const cost = (value: typeof oldLabor) =>
          value
            ? value.cash_minor + value.burden_minor + value.imputed_minor
            : 0;
        expect(cost(nextLabor) - cost(oldLabor)).toBe(
          view.jobs.find((j) => j.id === old.id)!.loaded_cost_minor,
        );
      }
      expect(lock.mock.calls.filter((args) => args[4])).toHaveLength(1);
      expect((await reconcileOrganizationLabor(view)).status).toBe('LOCKED');
      expect((await reconcileSavedEvidence(finance)).status).toBe(
        'STALE_SAVED_EVIDENCE',
      );
      await expect(reconcileSavedEvidence(priorities)).rejects.toThrow(
        'Unrecorded priority source rejected',
      );
      expect(priorities.meaning).toBe('HISTORICAL_EVIDENCE_ONLY');
      expect((await reconcileSavedEvidence(safe)).status).toBe('CURRENT_MATCH');
      expect(JSON.stringify(f.entry.release.read('staff'))).toBe(release);
      expect(JSON.stringify(view)).not.toMatch(
        /PRIVATE_|cash_hour_minor|supplier|worker_id|rate_id|salary|burden_bps/,
      );
    },
  );
  it('organization preparation loses ACK without a second lock, even with exact period observable', async () => {
    const f = await fixture();
    await endedTime(f, 2);
    const one = await previewOrganizationLabor(
        f.sources,
        f.job,
        period,
        f.gate,
      ),
      two = await previewOrganizationLabor(
        { ...f.sources },
        f.job,
        period,
        f.gate,
      ),
      original = f.sources.estimates.payroll.bind(f.sources.estimates),
      lock = vi
        .spyOn(f.sources.estimates, 'payroll')
        .mockImplementation(async (...args) => {
          const r = await original(...args);
          if (args[4]) throw Error('lost ACK');
          return r;
        });
    expect((await confirmOrganizationLabor(one, true)).status).toBe('UNKNOWN');
    expect((await confirmOrganizationLabor(two, true)).status).toBe('UNKNOWN');
    expect(await reconcileOrganizationLabor(one)).toMatchObject({
      status: 'UNKNOWN',
      exact_period_observed: true,
      replay: 'FORBIDDEN',
    });
    expect(lock.mock.calls.filter((args) => args[4])).toHaveLength(1);
  });
  it('maintenance plan revision stales canonical planning evidence without granting consent or sending', async () => {
    const f = await fixture(),
      saved = await file(f, maintenanceRenewalEvidenceRecipe),
      plan = f.sources.property
        .read(f.org)
        .plans.find((p) => p.id === f.entry.plan_id)!,
      send = vi.spyOn(globalThis, 'fetch'),
      consent = vi.spyOn(f.sources.operations, 'recordConsent');
    f.sources.property.savePlan(f.org, {
      ...plan,
      cadence: plan.cadence === 'weekly' ? 'monthly' : 'weekly',
    });
    expect((await reconcileSavedEvidence(saved)).status).toBe(
      'STALE_SAVED_EVIDENCE',
    );
    const payload = (await file(f, maintenanceRenewalEvidenceRecipe)).envelope
      .payload;
    expect(payload.saved.purpose_consent).toBe('UNVERIFIED');
    expect(payload.saved.suppression).toBe('UNVERIFIED');
    expect(
      Object.values(payload.saved.authority).every((v) => v === false),
    ).toBe(true);
    expect(
      payload.renewal.every(
        (r) =>
          r.message_authority === 'BLOCKED' &&
          r.scheduling_authority === 'BLOCKED' &&
          r.billing_authority === 'BLOCKED',
      ),
    ).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(consent).not.toHaveBeenCalled();
  });
  it('navigation remove/restore generation race withholds callback; an invoked ambiguous callback cannot be replayed', async () => {
    const f = await fixture(),
      view = await readRecordedPriorityNavigation(f.sources, f.job, f.gate),
      source = await inspectRecordedPrioritySource(view, view.cards[0].key),
      callback = vi.fn(),
      live = { current: callback, generation: 0 },
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let seen = false;
    const hook = vi
      .spyOn(crypto.subtle, 'digest')
      .mockImplementation(async (...args) => {
        const out = await digest(...args);
        if (!seen) {
          seen = true;
          live.generation += 2;
        }
        return out;
      });
    expect(
      (await continueRecordedPrioritySource(view, source, callback, live))
        .status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(seen).toBe(true);
    expect(callback).not.toHaveBeenCalled();
    hook.mockRestore();
    const next = await readRecordedPriorityNavigation(f.sources, f.job, f.gate),
      exact = await inspectRecordedPrioritySource(next, next.cards[0].key),
      failing = vi.fn(async () => {
        throw Error('callback outcome uncertain');
      });
    expect(
      (
        await continueRecordedPrioritySource(next, exact, failing, {
          current: failing,
          generation: 1,
        })
      ).status,
    ).toBe('UNKNOWN');
    await expect(
      readRecordedPriorityNavigation({ ...f.sources }, f.job, f.gate),
    ).rejects.toThrow();
    expect(failing).toHaveBeenCalledTimes(1);
  });
  it('partial immutable file cannot be repaired by repetition; exact read is UNKNOWN and bytes retained', async () => {
    const f = await fixture(),
      saved = await file(f, workOrderEvidenceRecipe),
      dir = folder(),
      path = join(dir, saved.envelope.sha256 + '.json');
    writeFileSync(path, '{"partial":', { mode: 0o600 });
    await expect(
      Promise.resolve().then(() =>
        writeSavedEvidenceFile(dir, saved.text, diskGate),
      ),
    ).rejects.toThrow();
    expect(readFileSync(path, 'utf8')).toBe('{"partial":');
  });
  it('OFF shared workbench and file controls never inspect untrusted source getters or render retained records', () => {
    const hook = vi.fn(),
      sources = Object.create(null);
    Object.defineProperty(sources, 'entries', { get: hook });
    const html =
      renderToStaticMarkup(
        createElement(SavedRevisionWorkbench, {
          sources,
          enabled: false,
          selectedJobId: 'untrusted',
        }),
      ) +
      renderToStaticMarkup(
        createElement(SavedEvidenceControls, {
          sources,
          enabled: false,
          selectedJobId: 'untrusted',
          recipe: workOrderEvidenceRecipe as EvidenceRecipe<unknown>,
        }),
      );
    expect(html).toContain('off');
    expect(html).not.toContain('Opened historical evidence');
    expect(hook).not.toHaveBeenCalled();
  });
  it('pure decode does not grant ownership and private file adapter rejects corrupted digest bytes', async () => {
    const f = await fixture(),
      saved = await file(f, publishedServiceEvidenceRecipe),
      dir = folder(),
      ack = writeSavedEvidenceFile(dir, saved.text, diskGate);
    expect(
      (await decodeSavedEvidence(saved.text, publishedServiceEvidenceRecipe))
        .sha256,
    ).toBe(ack.id);
    const foreign = await fixture(2);
    await expect(
      openSavedEvidence(
        foreign.sources,
        foreign.job,
        publishedServiceEvidenceRecipe,
        saved.text,
        foreign.gate,
      ),
    ).rejects.toThrow();
    expect(() =>
      readSavedEvidenceFile(dir, ack.id, '0'.repeat(64), diskGate),
    ).toThrow();
  });
  it.each([0, 1, 2])(
    'brand %i immutable published content cannot be rewritten with a fresh self-hash',
    async (brand) => {
      const f = await fixture(brand),
        saved = await file(f, publishedServiceEvidenceRecipe);
      for (const kind of ['report', 'scope'] as const) {
        const text = await rewrite(saved.text, (r) => {
          const p = r.payload as {
            reports: {
              report_page: { reports: { snapshot: { summary: string } }[] };
            }[];
            scope: { description: string };
          };
          if (kind === 'report')
            p.reports[0].report_page.reports[0].snapshot.summary =
              'Invented published observation';
          else p.scope.description = 'Invented issued scope';
        });
        await expect(
          openSavedEvidence(
            f.sources,
            f.job,
            publishedServiceEvidenceRecipe,
            text,
            f.gate,
          ),
        ).rejects.toThrow();
      }
    },
  );
  it('self-hashed older mutable assertions are historical claims, never an authenticated old draft or restoration', async () => {
    const f = await fixture(),
      saved = await file(f, workOrderEvidenceRecipe),
      { view, input } = await editDraft(f);
    await executeSavedDraftEdit(view, input, true);
    const text = await rewrite(saved.text, (r) => {
      const p = r.payload as { visits: { id: string; summary: string }[] };
      p.visits.find((v) => v.id === f.entry.scheduled_visit_id)!.summary =
        'Locally owner-modified historical assertion';
    });
    const opened = await openSavedEvidence(
      f.sources,
      f.job,
      workOrderEvidenceRecipe,
      text,
      f.gate,
    );
    expect(opened).toMatchObject({
      meaning: 'HISTORICAL_EVIDENCE_ONLY',
      authority: false,
      canonical_restore: false,
    });
    expect((await reconcileSavedEvidence(opened)).status).toBe(
      'STALE_SAVED_EVIDENCE',
    );
    expect(
      f.sources.property
        .read(f.org)
        .visits.find((v) => v.id === f.entry.scheduled_visit_id)!.content
        .summary,
    ).toBe(input.summary);
  });
});
