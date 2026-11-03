import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MaintenanceRenewalEvidence } from '../src/components/workflows/MaintenanceRenewalEvidence';
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  prepareSavedEvidence,
  decodeSavedEvidence,
  openSavedEvidence,
  reconcileSavedEvidence,
} from '../src/lib/workflows/saved-evidence-runtime';
import {
  maintenanceRenewalEvidenceRecipe,
  readMaintenanceRenewalEvidence,
  projectMaintenanceRenewalEvidence,
  parseMaintenanceRenewalEvidence,
  assertMaintenanceRenewalEvidenceSource,
} from '../src/lib/workflows/maintenance-renewal-evidence';
import { documentHash } from '../src/domain/release/preview';
import * as planner from '../src/lib/maintenance-renewal-planning';
const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true }));
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[2],
    sources = { ...all, entries: [entry] },
    job = entry.target.job_id!;
  return { all, sources, entry, job, gate, org: sources.company.id };
}
const prepare = (f: Awaited<ReturnType<typeof fixture>>) =>
  prepareSavedEvidence(
    f.sources,
    f.job,
    maintenanceRenewalEvidenceRecipe,
    f.gate,
  );
function savePlan(f: Awaited<ReturnType<typeof fixture>>) {
  const p = f.sources.property
    .read(f.org)
    .plans.find((p) => p.id === f.entry.plan_id)!;
  f.sources.property.savePlan(f.org, {
    ...p,
    cadence: p.cadence === 'weekly' ? 'monthly' : 'weekly',
  });
  return p;
}
async function rewrite(
  text: string,
  change: (raw: Record<string, unknown>) => void,
) {
  const raw = JSON.parse(text);
  change(raw);
  const body = {
    schema: raw.schema,
    kind: raw.kind,
    identity: raw.identity,
    payload: raw.payload,
  };
  return JSON.stringify({ ...body, sha256: await documentHash(body) });
}
it.each([0, 1, 2])(
  'brand %i persists full actual maintenance and original renewal planner evidence then reopens bytes without renewal authority',
  async (brand) => {
    const f = await fixture(brand),
      calls = vi.spyOn(planner, 'readMaintenanceRenewalPlanning'),
      before = JSON.stringify(f.sources.property.read(f.org)),
      network = vi.spyOn(globalThis, 'fetch'),
      writers = [
        vi.spyOn(f.sources.property, 'savePlan'),
        vi.spyOn(f.sources.property, 'saveMaintenance'),
        vi.spyOn(f.sources.operations, 'recordConsent'),
      ],
      file = await prepare(f);
    expect(calls).toHaveBeenCalled();
    const p = file.envelope.payload;
    expect(p.saved.plans.every((x) => x.id === f.entry.plan_id)).toBe(true);
    expect(p.renewal.length).toBe(p.saved.occurrences.length);
    expect(
      p.renewal.every(
        (r) =>
          r.message_authority === 'BLOCKED' &&
          r.scheduling_authority === 'BLOCKED' &&
          r.billing_authority === 'BLOCKED',
      ),
    ).toBe(true);
    expect(Object.values(p.saved.authority).every((x) => x === false)).toBe(
      true,
    );
    expect(p.saved).toMatchObject({
      purpose_consent: 'UNVERIFIED',
      suppression: 'UNVERIFIED',
      enrollment: 'UNVERIFIED',
      renewal_terms: 'UNKNOWN',
      recipient: null,
      provider_request: null,
    });
    const dir = mkdtempSync(join(tmpdir(), 'propel-maintenance-evidence-'));
    roots.push(dir);
    const path = join(dir, 'maintenance.json');
    writeFileSync(path, file.text, { mode: 0o600 });
    const text = readFileSync(path, 'utf8');
    expect(text).toBe(file.text);
    expect(
      (await decodeSavedEvidence(text, maintenanceRenewalEvidenceRecipe))
        .payload,
    ).toEqual(p);
    const reopened = await openSavedEvidence(
      f.sources,
      f.job,
      maintenanceRenewalEvidenceRecipe,
      text,
      f.gate,
    );
    expect((await reconcileSavedEvidence(reopened)).status).toBe(
      'CURRENT_MATCH',
    );
    expect(reopened.canonical_restore).toBe(false);
    expect(reopened.authority).toBe(false);
    expect(JSON.stringify(f.sources.property.read(f.org))).toBe(before);
    expect(network).not.toHaveBeenCalled();
    expect(writers.every((w) => w.mock.calls.length === 0)).toBe(true);
    expect(text).not.toMatch(
      /@example|555010|private_notes|supplier|unit_cost|payroll|INTERNAL|PRIVATE/,
    );
  },
);
it.each([0, 1, 2])(
  'brand %i actual plan revision stales the old file and changes anchored occurrence identities without replacing records',
  async (brand) => {
    const f = await fixture(brand),
      file = await prepare(f),
      before = file.text,
      oldPlan = savePlan(f),
      next = await prepare(f);
    expect(
      next.envelope.payload.saved.plans.find((p) => p.id === oldPlan.id)
        ?.revision,
    ).toBe(oldPlan.revision + 1);
    const oldIds = new Set(
      file.envelope.payload.saved.occurrences.map((o) => o.id),
    );
    expect(
      next.envelope.payload.saved.occurrences.every((o) => !oldIds.has(o.id)),
    ).toBe(true);
    const reopened = await openSavedEvidence(
      f.sources,
      f.job,
      maintenanceRenewalEvidenceRecipe,
      file.text,
      f.gate,
    );
    expect((await reconcileSavedEvidence(reopened)).status).toBe(
      'STALE_SAVED_EVIDENCE',
    );
    expect(file.text).toBe(before);
    expect(file.envelope.payload.saved.physical_completion).toBe('UNVERIFIED');
  },
);
it('actual private follow-up edit remains separate and file contains no staff note', async () => {
  const f = await fixture(),
    file = await prepare(f),
    item = f.sources.property
      .maintenance(f.org, f.entry.target.actor_id)
      .items.find((i) => i.job_id === f.job)!;
  await f.sources.property.saveMaintenance(
    f.org,
    f.entry.target.actor_id,
    item.source,
    item.record.revision,
    {
      priority: 'high',
      assignee_id: null,
      follow_up_on: f.entry.day,
      review: 'pending',
      note: 'PRIVATE do not serialize this internal note',
    },
  );
  const next = await prepare(f);
  expect(
    next.envelope.payload.saved.followups.find((x) => x.id === item.key)
      ?.revision,
  ).toBe(item.record.revision + 1);
  expect(next.text).not.toContain('PRIVATE');
  expect(
    (
      await reconcileSavedEvidence(
        await openSavedEvidence(
          f.sources,
          f.job,
          maintenanceRenewalEvidenceRecipe,
          file.text,
          f.gate,
        ),
      )
    ).status,
  ).toBe('STALE_SAVED_EVIDENCE');
});
it('actual contact withdrawal updates historical reference and never permits messages or enrollment', async () => {
  const f = await fixture();
  await f.sources.operations.recordConsent(
    f.org,
    f.entry.target.customer_id,
    true,
    true,
  );
  const file = await prepare(f);
  await new Promise((resolve) => setTimeout(resolve, 2));
  await f.sources.operations.recordConsent(
    f.org,
    f.entry.target.customer_id,
    false,
    false,
  );
  const next = await prepare(f);
  expect(next.envelope.payload.saved.recorded_channel.state).toBe(
    'RECORDED_DENIED',
  );
  expect(
    next.envelope.payload.renewal.every(
      (r) => r.message_authority === 'BLOCKED',
    ),
  ).toBe(true);
  const reopened = await openSavedEvidence(
    f.sources,
    f.job,
    maintenanceRenewalEvidenceRecipe,
    file.text,
    f.gate,
  );
  expect((await reconcileSavedEvidence(reopened)).status).toBe(
    'STALE_SAVED_EVIDENCE',
  );
});
it('same-property different-job plans cannot enter the archived payload', async () => {
  const f = await fixture(),
    entry = f.all.entries[0],
    sources = { ...f.all, entries: [entry] },
    file = await prepareSavedEvidence(
      sources,
      entry.target.job_id!,
      maintenanceRenewalEvidenceRecipe,
      f.gate,
    ),
    sibling = f.all.entries[3];
  expect(sibling.target.location_id).toBe(entry.target.location_id);
  expect(
    file.envelope.payload.saved.plans.some((p) => p.id === sibling.plan_id),
  ).toBe(false);
  expect(
    file.envelope.payload.renewal.some(
      (r) => r.selection.source.plan_id === sibling.plan_id,
    ),
  ).toBe(false);
});
it.each(['source-org', 'source-customer', 'source-property'] as const)(
  'rehashing cannot change %s on a published follow-up',
  async (kind) => {
    const f = await fixture(),
      file = await prepare(f),
      text = await rewrite(file.text, (r) => {
        const p = r.payload as {
          saved: { followups: { source: Record<string, unknown> }[] };
        };
        const k =
          kind === 'source-org'
            ? 'organization_id'
            : kind === 'source-customer'
              ? 'customer_id'
              : 'location_id';
        p.saved.followups[0].source[k] = 'foreign';
      });
    await expect(
      decodeSavedEvidence(text, maintenanceRenewalEvidenceRecipe),
    ).rejects.toThrow();
  },
);
it.each([
  'purpose_consent',
  'suppression',
  'enrollment',
  'renewal_terms',
  'physical_completion',
] as const)('file cannot promote %s into authority', async (key) => {
  const f = await fixture(),
    file = await prepare(f),
    text = await rewrite(file.text, (r) => {
      const p = r.payload as { saved: Record<string, unknown> };
      p.saved[key] = 'APPROVED';
    });
  await expect(
    decodeSavedEvidence(text, maintenanceRenewalEvidenceRecipe),
  ).rejects.toThrow();
});
it.each(['recipient', 'provider_request', 'private_notes', 'internal_cost'])(
  'private or execution field %s rejects even with valid new hash',
  async (key) => {
    const f = await fixture(),
      file = await prepare(f),
      text = await rewrite(file.text, (r) => {
        const p = r.payload as { saved: Record<string, unknown> };
        p.saved[key] = 'PRIVATE';
      });
    await expect(
      decodeSavedEvidence(text, maintenanceRenewalEvidenceRecipe),
    ).rejects.toThrow();
  },
);
it.each([
  'duplicate-plan',
  'missing-plan',
  'future-revision',
  'bad-date',
  'bad-occurrence',
  'bad-contact',
  'renewal-authority',
  'missing-renewal',
] as const)('strict complete parser rejects %s', async (kind) => {
  const f = await fixture(),
    snapshot = await readMaintenanceRenewalEvidence(f.sources, f.job, f.gate),
    p = structuredClone(projectMaintenanceRenewalEvidence(snapshot));
  const q = p as unknown as {
    saved: {
      plans: Record<string, unknown>[];
      occurrences: Record<string, unknown>[];
      recorded_channel: Record<string, unknown>;
    };
    renewal: Record<string, unknown>[];
  };
  if (kind === 'duplicate-plan') q.saved.plans.push(q.saved.plans[0]);
  if (kind === 'missing-plan') q.saved.plans = [];
  if (kind === 'future-revision') q.saved.plans[0].revision = 999;
  if (kind === 'bad-date') q.saved.plans[0].starts_on = '2026-02-30';
  if (kind === 'bad-occurrence')
    q.saved.occurrences[0].id = 'fuzzy invented match';
  if (kind === 'bad-contact') q.saved.recorded_channel.channel = 'phone';
  if (kind === 'renewal-authority') q.renewal[0].message_authority = 'ALLOWED';
  if (kind === 'missing-renewal') q.renewal = [];
  expect(() => parseMaintenanceRenewalEvidence(p, snapshot.identity)).toThrow();
});
it('wrong tenant or property cannot reopen original file and missing current job is UNKNOWN', async () => {
  const f = await fixture(),
    g = await fixture(1),
    file = await prepare(f);
  await expect(
    openSavedEvidence(
      g.sources,
      g.job,
      maintenanceRenewalEvidenceRecipe,
      file.text,
      g.gate,
    ),
  ).rejects.toThrow();
  await expect(
    openSavedEvidence(
      f.all,
      f.all.entries[1].target.job_id!,
      maintenanceRenewalEvidenceRecipe,
      file.text,
      f.gate,
    ),
  ).rejects.toThrow();
  const original = f.sources.property.read.bind(f.sources.property);
  vi.spyOn(f.sources.property, 'read').mockImplementation((org) => ({
    ...original(org),
    plans: [],
  }));
  await expect(
    openSavedEvidence(
      f.sources,
      f.job,
      maintenanceRenewalEvidenceRecipe,
      file.text,
      f.gate,
    ),
  ).rejects.toThrow();
});
it('a fabricated archived source row is never restored or admitted by self-hash', async () => {
  const f = await fixture(),
    current = await readMaintenanceRenewalEvidence(f.sources, f.job, f.gate),
    payload = projectMaintenanceRenewalEvidence(current),
    p = structuredClone(payload);
  (p.saved.plans[0] as { id: string }).id = 'missing-original-plan';
  expect(() => assertMaintenanceRenewalEvidenceSource(p, current)).toThrow();
});
it('revoked current synthetic staff cannot reopen prior evidence', async () => {
  const f = await fixture(),
    actor = f.org + '-estimator';
  await f.sources.operations.manageMember(
    f.org,
    actor,
    true,
    'admin',
    'office_manager',
  );
  f.sources.entries.forEach((e) => (e.target.actor_id = actor));
  const file = await prepare(f);
  await f.sources.operations.manageMember(
    f.org,
    actor,
    false,
    'admin',
    'office_manager',
  );
  await expect(
    openSavedEvidence(
      f.sources,
      f.job,
      maintenanceRenewalEvidenceRecipe,
      file.text,
      f.gate,
    ),
  ).rejects.toThrow();
});
it.each(['plan', 'contact', 'gate', 'container'] as const)(
  'final file hashing catches original live %s changes',
  async (kind) => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const r = await digest(...args);
      if (
        !changed &&
        new TextDecoder()
          .decode(args[1] as ArrayBuffer)
          .includes('propel-local-saved-evidence-v1')
      ) {
        changed = true;
        if (kind === 'plan') savePlan(f);
        if (kind === 'contact')
          await f.sources.operations.recordConsent(
            f.org,
            f.entry.target.customer_id,
            false,
            false,
          );
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'container') f.sources.entries = [...f.sources.entries];
      }
      return r;
    });
    await expect(prepare(f)).rejects.toThrow();
    expect(changed).toBe(true);
  },
);
it('OFF precedes source getters; strict parser rejects executables without invoking them', async () => {
  const hook = vi.fn(),
    source = Object.create(null);
  Object.defineProperty(source, 'entries', { get: hook });
  await expect(
    prepareSavedEvidence(source, 'job', maintenanceRenewalEvidenceRecipe, {
      enabled: false,
      confirmed: true,
    }),
  ).rejects.toThrow('OFF');
  const f = await fixture(),
    current = await readMaintenanceRenewalEvidence(f.sources, f.job, f.gate),
    payload = projectMaintenanceRenewalEvidence(current);
  Object.defineProperty(payload, 'saved', { get: hook });
  expect(() =>
    parseMaintenanceRenewalEvidence(payload, current.identity),
  ).toThrow();
  expect(hook).not.toHaveBeenCalled();
});

it('disabled maintenance composition accesses no source getters or renewal reader', () => {
  const hook = vi.fn(),
    sources = Object.create(null);
  Object.defineProperty(sources, 'entries', { get: hook });
  const html = renderToStaticMarkup(
    createElement(MaintenanceRenewalEvidence, {
      sources,
      enabled: false,
      selectedJobId: 'untrusted',
    }),
  );
  expect(html).toContain('off');
  expect(hook).not.toHaveBeenCalled();
});
