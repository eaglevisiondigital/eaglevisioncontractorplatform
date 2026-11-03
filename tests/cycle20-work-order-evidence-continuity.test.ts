import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkOrderEvidenceContinuity } from '../src/components/workflows/WorkOrderEvidenceContinuity';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readSavedSourceExercise,
  executeSavedSourceExercise,
  readSavedDraftEdit,
  executeSavedDraftEdit,
} from '../src/lib/workflows/saved-revision-exercise';
import {
  prepareSavedEvidence,
  decodeSavedEvidence,
  openSavedEvidence,
  reconcileSavedEvidence,
  type EvidenceIdentity,
} from '../src/lib/workflows/saved-evidence-runtime';
import {
  workOrderEvidenceRecipe,
  parseWorkOrderEvidence,
} from '../src/lib/workflows/work-order-evidence-continuity';
import { documentHash } from '../src/domain/release/preview';
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
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[0],
    sources = { ...all, entries: [entry] },
    job = entry.target.job_id!;
  return { sources, all, entry, job, gate };
}
const prepared = (f: Awaited<ReturnType<typeof fixture>>) =>
  prepareSavedEvidence(f.sources, f.job, workOrderEvidenceRecipe, f.gate);
async function changed(
  f: Awaited<ReturnType<typeof fixture>>,
  kind: 'visit-draft' | 'time-record' | 'time-correction' = 'visit-draft',
) {
  const v = await readSavedSourceExercise(f.sources, f.job, f.gate);
  return executeSavedSourceExercise(v, kind, true);
}
async function rewrite(
  text: string,
  mutate: (v: Record<string, unknown>) => void,
) {
  const raw = JSON.parse(text);
  mutate(raw);
  const body = {
    schema: raw.schema,
    kind: raw.kind,
    identity: raw.identity,
    payload: raw.payload,
  };
  return JSON.stringify({ ...body, sha256: await documentHash(body) });
}
it.each([0, 1, 2])(
  'brand %i saves complete real field evidence bytes and reopens exact authorized source without restoration',
  async (brand) => {
    const f = await fixture(brand);
    await changed(f);
    await changed(f, 'time-record');
    const file = await prepared(f),
      before = JSON.stringify(file.envelope),
      dir = mkdtempSync(join(tmpdir(), 'propel-field-evidence-'));
    roots.push(dir);
    const path = join(dir, 'field.json');
    writeFileSync(path, file.text, { mode: 0o600 });
    const bytes = readFileSync(path, 'utf8');
    expect(bytes).toBe(file.text);
    const decoded = await decodeSavedEvidence(bytes, workOrderEvidenceRecipe);
    expect(
      decoded.payload.visits.some(
        (v) =>
          v.id === f.entry.scheduled_visit_id &&
          v.summary.includes('Synthetic saved draft'),
      ),
    ).toBe(true);
    expect(decoded.payload.tasks.at(-1)).toMatchObject({
      submitted: true,
      review: 'approved',
      worker_id: f.entry.worker_id,
    });
    expect(decoded.payload.source.job_id).toBe(f.job);
    expect(decoded.payload.customer.id).toBe(f.entry.target.customer_id);
    expect(decoded.payload.property?.id).toBe(f.entry.target.location_id);
    const writers = [
      vi.spyOn(f.sources.property, 'saveVisit'),
      vi.spyOn(f.sources.estimates, 'recordTime'),
      vi.spyOn(f.sources.property, 'savePlan'),
    ];
    const reopened = await openSavedEvidence(
      f.sources,
      f.job,
      workOrderEvidenceRecipe,
      bytes,
      f.gate,
    );
    expect((await reconcileSavedEvidence(reopened)).status).toBe(
      'CURRENT_MATCH',
    );
    expect(reopened.canonical_restore).toBe(false);
    expect(reopened.authority).toBe(false);
    expect(JSON.stringify(reopened.envelope)).toBe(before);
    expect(writers.every((w) => w.mock.calls.length === 0)).toBe(true);
    expect(bytes).not.toMatch(
      /internal_notes|supplier|payroll|unit_cost|review_reason|PRIVATE/,
    );
  },
);
it('actual visit edits stale saved file while historical content and statuses stay immutable', async () => {
  const f = await fixture(),
    file = await prepared(f),
    before = file.text;
  await changed(f);
  const opened = await openSavedEvidence(
    f.sources,
    f.job,
    workOrderEvidenceRecipe,
    file.text,
    f.gate,
  );
  expect((await reconcileSavedEvidence(opened)).status).toBe(
    'STALE_SAVED_EVIDENCE',
  );
  expect(file.text).toBe(before);
  expect(
    file.envelope.payload.visits.find(
      (v) => v.id === f.entry.scheduled_visit_id,
    )?.status,
  ).toBe('draft');
  expect(file.envelope.payload.physical_completion).toBe('UNVERIFIED');
});
it('actual task correction persists exact old and new IDs without inferred task matching', async () => {
  const f = await fixture();
  await changed(f, 'time-record');
  const original = await prepared(f);
  await changed(f, 'time-correction');
  const next = await prepared(f);
  const old = original.envelope.payload.tasks.at(-1)!,
    current = next.envelope.payload.tasks.at(-1)!;
  expect(current.id).not.toBe(old.id);
  expect(current.corrects_id).toBe(old.id);
  expect(current.worker_id).toBe(old.worker_id);
  expect(next.envelope.payload.tasks.some((t) => t.id === old.id)).toBe(true);
  expect(
    (
      await reconcileSavedEvidence(
        await openSavedEvidence(
          f.sources,
          f.job,
          workOrderEvidenceRecipe,
          original.text,
          f.gate,
        ),
      )
    ).status,
  ).toBe('STALE_SAVED_EVIDENCE');
});
it('existing one-use UNKNOWN cannot be reset by preparing or reopening evidence', async () => {
  const f = await fixture(),
    view = await readSavedSourceExercise(f.sources, f.job, f.gate),
    original = f.sources.property.saveVisit.bind(f.sources.property);
  vi.spyOn(f.sources.property, 'saveVisit').mockImplementation((...args) => {
    original(...args);
    throw Error('lost acknowledgment');
  });
  await expect(
    executeSavedSourceExercise(view, 'visit-draft', true),
  ).rejects.toThrow();
  vi.restoreAllMocks();
  const file = await prepared(f);
  await openSavedEvidence(
    f.sources,
    f.job,
    workOrderEvidenceRecipe,
    file.text,
    f.gate,
  );
  const fresh = await readSavedSourceExercise(f.sources, f.job, f.gate);
  await expect(
    executeSavedSourceExercise(fresh, 'visit-draft', true),
  ).rejects.toThrow(/UNKNOWN|replay|attempted/);
});
it('cross-tenant and another exact job cannot open the file', async () => {
  const f = await fixture(),
    g = await fixture(1),
    file = await prepared(f);
  await expect(
    openSavedEvidence(
      g.sources,
      g.job,
      workOrderEvidenceRecipe,
      file.text,
      g.gate,
    ),
  ).rejects.toThrow();
  const second = f.all.entries[1];
  await expect(
    openSavedEvidence(
      f.all,
      second.target.job_id!,
      workOrderEvidenceRecipe,
      file.text,
      f.gate,
    ),
  ).rejects.toThrow();
});
it.each([
  'organization_id',
  'job_id',
  'estimate_id',
  'issued_version_id',
] as const)('rehash cannot substitute inner field source %s', async (key) => {
  const f = await fixture(),
    file = await prepared(f);
  const text = await rewrite(file.text, (raw) => {
    const p = raw.payload as { source: Record<string, unknown> };
    p.source[key] = 'foreign-source';
  });
  const raw = JSON.parse(text);
  expect(() =>
    parseWorkOrderEvidence(raw.payload, raw.identity as EvidenceIdentity),
  ).toThrow('authorized');
});
it.each(['customer', 'property'] as const)(
  'rehash cannot substitute %s ownership',
  async (key) => {
    const f = await fixture(),
      file = await prepared(f);
    const raw = JSON.parse(file.text);
    raw.payload[key].id = 'foreign-source';
    expect(() => parseWorkOrderEvidence(raw.payload, raw.identity)).toThrow(
      'authorized',
    );
  },
);
it.each([
  'internal_notes',
  'supplier_cost',
  'payroll',
  'resolved',
  'provider_request',
])(
  'unknown/private field %s is rejected even with new valid self-hash',
  async (key) => {
    const f = await fixture(),
      file = await prepared(f),
      text = await rewrite(file.text, (r) => {
        (r.payload as Record<string, unknown>)[key] = 'PRIVATE';
      });
    await expect(
      decodeSavedEvidence(text, workOrderEvidenceRecipe),
    ).rejects.toThrow();
  },
);
it.each([
  'duplicate-visit',
  'missing-plan',
  'bad-status',
  'bad-revision',
  'authority',
  'malformed-date',
  'duplicate-task',
  'bad-correction',
] as const)('strict complete parser rejects %s', async (kind) => {
  const f = await fixture();
  await changed(f, 'time-record');
  const file = await prepared(f),
    raw = JSON.parse(file.text),
    p = raw.payload;
  if (kind === 'duplicate-visit') p.visits.push(p.visits[0]);
  if (kind === 'missing-plan') p.visits[0].plan_id = 'missing-plan';
  if (kind === 'bad-status') p.visits[0].status = 'completed';
  if (kind === 'bad-revision') p.visits[0].revision = 0;
  if (kind === 'authority') p.authority.dispatch = true;
  if (kind === 'malformed-date') p.visits[0].visited_on = '2026-02-30';
  if (kind === 'duplicate-task') p.tasks.push(p.tasks[0]);
  if (kind === 'bad-correction') p.tasks[0].corrects_id = p.tasks[0].id;
  expect(() => parseWorkOrderEvidence(p, raw.identity)).toThrow();
});
it('getter inputs are never invoked and disabled preparation precedes source reads', async () => {
  const f = await fixture(),
    file = await prepared(f),
    p = structuredClone(file.envelope.payload),
    hook = vi.fn();
  Object.defineProperty(p, 'tasks', { get: hook });
  expect(() => parseWorkOrderEvidence(p)).toThrow();
  const source = Object.create(null);
  Object.defineProperty(source, 'entries', { get: hook });
  await expect(
    prepareSavedEvidence(source, f.job, workOrderEvidenceRecipe, {
      enabled: false,
      confirmed: true,
    }),
  ).rejects.toThrow('OFF');
  expect(hook).not.toHaveBeenCalled();
});
it('revoked current reviewer cannot reopen historical evidence', async () => {
  const f = await fixture(),
    actor = f.sources.company.id + '-estimator';
  await f.sources.operations.manageMember(
    f.sources.company.id,
    actor,
    true,
    'admin',
    'office_manager',
  );
  f.sources.entries.forEach((e) => (e.target.actor_id = actor));
  const file = await prepared(f);
  await f.sources.operations.manageMember(
    f.sources.company.id,
    actor,
    false,
    'admin',
    'office_manager',
  );
  await expect(
    openSavedEvidence(
      f.sources,
      f.job,
      workOrderEvidenceRecipe,
      file.text,
      f.gate,
    ),
  ).rejects.toThrow();
});
it.each(['source', 'gate', 'container'] as const)(
  'last file hash checks original live %s',
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
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'container') f.sources.entries = [...f.sources.entries];
        if (kind === 'source') {
          const s = f.sources.property.read(f.sources.company.id),
            v = s.visits.find((v) => v.id === f.entry.scheduled_visit_id)!;
          f.sources.property.saveVisit(f.sources.company.id, v, {
            ...v.content,
            summary: 'Actual final-await changed source',
          });
        }
      }
      return r;
    });
    await expect(prepared(f)).rejects.toThrow();
    expect(changed).toBe(true);
  },
);
it('file integrity and canonical formatting are exact, not approximate', async () => {
  const f = await fixture(),
    file = await prepared(f);
  await expect(
    decodeSavedEvidence(file.text + '\n', workOrderEvidenceRecipe),
  ).rejects.toThrow();
  const raw = JSON.parse(file.text);
  raw.sha256 = 'a'.repeat(64);
  await expect(
    decodeSavedEvidence(JSON.stringify(raw), workOrderEvidenceRecipe),
  ).rejects.toThrow('integrity');
});

it.each([0, 1, 2])(
  'brand %i explicit draft form API saves actual summary/checklist revision preserving all original private/immutable fields',
  async (brand) => {
    const f = await fixture(brand),
      view = await readSavedSourceExercise(f.sources, f.job, f.gate),
      draft = readSavedDraftEdit(view),
      original = f.sources.property
        .read(f.sources.company.id)
        .visits.find((v) => v.id === draft.visit_id)!,
      file = await prepared(f),
      input = {
        summary: 'Owner-entered exact synthetic draft observation',
        checklist: draft.checklist.map((c, i) => ({
          id: c.id,
          label: c.label,
          completed: i === 0 ? !c.completed : c.completed,
        })),
      };
    await executeSavedDraftEdit(view, input, true);
    const current = f.sources.property
      .read(f.sources.company.id)
      .visits.find((v) => v.id === draft.visit_id)!;
    expect(current.revision).toBe(draft.revision + 1);
    expect(current.status).toBe('draft');
    expect(current.content.summary).toBe(input.summary);
    expect(current.content.internal_notes).toBe(
      original.content.internal_notes,
    );
    expect(current.content.findings).toEqual(original.content.findings);
    expect(
      current.content.checklist.map((c) => ({
        id: c.id,
        required: c.required,
      })),
    ).toEqual(
      original.content.checklist.map((c) => ({
        id: c.id,
        required: c.required,
      })),
    );
    expect(current.content.checklist[0].completed).toBe(
      input.checklist[0].completed,
    );
    const opened = await openSavedEvidence(
      f.sources,
      f.job,
      workOrderEvidenceRecipe,
      file.text,
      f.gate,
    );
    expect((await reconcileSavedEvidence(opened)).status).toBe(
      'STALE_SAVED_EVIDENCE',
    );
    const fresh = await readSavedSourceExercise(f.sources, f.job, f.gate);
    expect(readSavedDraftEdit(fresh).can_edit).toBe(false);
    await expect(executeSavedDraftEdit(fresh, input, true)).rejects.toThrow();
  },
);
it('unconfirmed, altered identity, stale and concurrently repeated draft edits fail through original custody', async () => {
  const f = await fixture(),
    v = await readSavedSourceExercise(f.sources, f.job, f.gate),
    d = readSavedDraftEdit(v),
    input = {
      summary: 'Exact draft test',
      checklist: d.checklist.map((c) => ({
        id: c.id,
        label: c.label,
        completed: c.completed,
      })),
    };
  await expect(executeSavedDraftEdit(v, input, false)).rejects.toThrow();
  await expect(
    executeSavedDraftEdit(
      v,
      {
        ...input,
        checklist: input.checklist.map((c, i) =>
          i === 0 ? { ...c, id: 'foreign' } : c,
        ),
      },
      true,
    ),
  ).rejects.toThrow();
  const results = await Promise.allSettled([
    executeSavedDraftEdit(v, input, true),
    executeSavedDraftEdit(v, input, true),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
});
it('same-revision forged content and fabricated task IDs are rejected by actual source admission', async () => {
  const f = await fixture();
  await changed(f, 'time-record');
  const file = await prepared(f);
  for (const kind of ['visit', 'task']) {
    const text = await rewrite(file.text, (r) => {
      const p = r.payload as {
        visits: { summary: string }[];
        tasks: { id: string }[];
      };
      if (kind === 'visit')
        p.visits[0].summary = 'Fabricated unchanged-revision observation';
      else p.tasks[0].id = crypto.randomUUID();
    });
    await expect(
      openSavedEvidence(
        f.sources,
        f.job,
        workOrderEvidenceRecipe,
        text,
        f.gate,
      ),
    ).rejects.toThrow();
  }
});

it('disabled composed field workspace never invokes source getters or renders the draft editor', () => {
  const hook = vi.fn(),
    sources = Object.create(null);
  Object.defineProperty(sources, 'entries', { get: hook });
  const html = renderToStaticMarkup(
    createElement(WorkOrderEvidenceContinuity, {
      sources,
      enabled: false,
      selectedJobId: 'untrusted',
    }),
  );
  expect(html).toContain('off');
  expect(html).not.toContain('Local draft visit editor');
  expect(hook).not.toHaveBeenCalled();
});
it('actual unsubmitted task remains unreviewed instead of gaining review or completion authority', async () => {
  const f = await fixture(),
    id = await f.sources.estimates.recordTime(
      f.sources.company.id,
      f.entry.worker_id,
      {
        job_id: f.job,
        overhead_center: null,
        task: 'Explicit synthetic unreviewed field observation',
        kind: 'work',
        started_at: '2030-01-10T09:00:00.000Z',
        ended_at: '2030-01-10T10:00:00.000Z',
        billable: false,
        corrects_id: null,
      },
    );
  const file = await prepared(f);
  expect(file.envelope.payload.tasks.find((t) => t.id === id)).toMatchObject({
    submitted: false,
    review: 'unreviewed',
  });
  expect(file.envelope.payload.authority.approve_time).toBe(false);
});
