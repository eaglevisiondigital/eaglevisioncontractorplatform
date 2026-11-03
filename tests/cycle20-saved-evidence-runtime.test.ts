import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { readSavedRevision } from '../src/lib/workflows/saved-revision-runtime';
import { documentHash } from '../src/domain/release/preview';
import {
  prepareSavedEvidence,
  decodeSavedEvidence,
  openSavedEvidence,
  reconcileSavedEvidence,
  assertSavedEvidenceAccess,
  evidenceFields,
  evidenceText,
  evidenceNumber,
  type EvidenceRecipe,
} from '../src/lib/workflows/saved-evidence-runtime';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[2],
    job = entry.target.job_id!;
  return { gate, sources, entry, job, org: sources.company.id };
}
type F = Awaited<ReturnType<typeof fixture>>;
type P = {
  job_id: string;
  visit_id: string;
  revision: number;
  summary: string;
};
const recipe: EvidenceRecipe<P> = {
  kind: 'field',
  title: 'Test work order',
  read: (s, j, g) =>
    readSavedRevision(s, j, 'field', g, (e) => {
      const v = s.property
        .read(s.company.id)
        .visits.find((v) => v.id === e.scheduled_visit_id)!;
      return {
        job_id: j,
        visit_id: v.id,
        revision: v.revision,
        summary: v.content.summary,
      };
    }),
  project: (s) => s.evidence as P,
  parse: (v, id) => {
    const f = evidenceFields(v, ['job_id', 'visit_id', 'revision', 'summary']);
    const p = {
      job_id: evidenceText(f.job_id, 200),
      visit_id: evidenceText(f.visit_id, 200),
      revision: evidenceNumber(f.revision, 1),
      summary: evidenceText(f.summary),
    };
    if (p.job_id !== id.job_id) throw Error('Payload ownership');
    return p;
  },
  assertSource: (p, s) => {
    const c = s.evidence as P;
    if (
      p.job_id !== s.identity.job_id ||
      p.visit_id !== c.visit_id ||
      p.revision > c.revision ||
      (p.revision === c.revision && p.summary !== c.summary)
    )
      throw Error('Actual canonical ownership/history');
  },
};
function save(f: F) {
  const v = f.sources.property
    .read(f.org)
    .visits.find((v) => v.id === f.entry.scheduled_visit_id)!;
  f.sources.property.saveVisit(f.org, v, {
    ...v.content,
    summary: 'Actual saved canonical revision',
  });
}
async function rehash(
  text: string,
  change: (r: Record<string, unknown>) => void,
) {
  const r = JSON.parse(text);
  change(r);
  const { sha256: _, ...body } = r;
  return JSON.stringify({ ...body, sha256: await documentHash(body) });
}
it.each([0, 1, 2])(
  'brand %s actual bytes reopen and exact read-only reconciliation retain immutable evidence',
  async (b) => {
    const f = await fixture(b),
      before = JSON.stringify(f.sources.property.read(f.org)),
      file = await prepareSavedEvidence(f.sources, f.job, recipe, f.gate),
      body = file.text;
    expect(file.authority).toBe(false);
    expect(file.canonical_restore).toBe(false);
    expect(Object.isFrozen(file.envelope.payload)).toBe(true);
    const reopened = await openSavedEvidence(
      f.sources,
      f.job,
      recipe,
      file.text,
      f.gate,
    );
    expect((await reconcileSavedEvidence(reopened)).status).toBe(
      'CURRENT_MATCH',
    );
    expect(JSON.stringify(f.sources.property.read(f.org))).toBe(before);
    save(f);
    expect(() => assertSavedEvidenceAccess(reopened)).toThrow();
    expect((await reconcileSavedEvidence(reopened)).status).toBe(
      'STALE_SAVED_EVIDENCE',
    );
    expect(() => assertSavedEvidenceAccess(reopened)).not.toThrow();
    expect(reopened.text).toBe(body);
    expect(reopened.envelope.payload.summary).not.toBe(
      'Actual saved canonical revision',
    );
  },
);
it('OFF precedes source, recipe and input getter access', async () => {
  let touched = 0;
  const bad = new Proxy(
    {},
    {
      get() {
        touched++;
        throw Error('getter');
      },
    },
  );
  await expect(
    prepareSavedEvidence(bad as never, '', bad as never, {
      enabled: false,
      confirmed: false,
    }),
  ).rejects.toThrow();
  await expect(
    openSavedEvidence(bad as never, '', bad as never, bad as never, {
      enabled: false,
      confirmed: false,
    }),
  ).rejects.toThrow();
  expect(touched).toBe(0);
});
it('wrong selected job returned by an otherwise genuine reader is denied before projection', async () => {
  const f = await fixture(),
    project = vi.fn(recipe.project),
    wrong = {
      ...recipe,
      read: (s: F['sources'], _: string, g: F['gate']) =>
        recipe.read(s, s.entries[0].target.job_id!, g),
      project,
    };
  await expect(
    prepareSavedEvidence(f.sources, f.job, wrong, f.gate),
  ).rejects.toThrow();
  expect(project).not.toHaveBeenCalled();
});
it('self-rehashed foreign outer and payload source cannot establish ownership', async () => {
  const f = await fixture(),
    file = await prepareSavedEvidence(f.sources, f.job, recipe, f.gate);
  const outer = await rehash(file.text, (r) => {
    const id = r.identity as Record<string, unknown>;
    id.customer_id = 'foreign';
  });
  await expect(
    openSavedEvidence(f.sources, f.job, recipe, outer, f.gate),
  ).rejects.toThrow();
  const payload = await rehash(file.text, (r) => {
    (r.payload as Record<string, unknown>).visit_id = f.entry.visit_id;
  });
  await expect(
    openSavedEvidence(f.sources, f.job, recipe, payload, f.gate),
  ).rejects.toThrow(/canonical/);
});
it('forged same-revision historical content and private extra fields are rejected', async () => {
  const f = await fixture(),
    file = await prepareSavedEvidence(f.sources, f.job, recipe, f.gate);
  for (const mutate of [
    (p: Record<string, unknown>) => {
      p.summary = 'forged';
    },
    (p: Record<string, unknown>) => {
      p.internal_notes = 'private';
    },
  ]) {
    const text = await rehash(file.text, (r) =>
      mutate(r.payload as Record<string, unknown>),
    );
    await expect(
      openSavedEvidence(f.sources, f.job, recipe, text, f.gate),
    ).rejects.toThrow();
  }
});
it('noncanonical/duplicate/oversize/malformed JSON cannot be opened', async () => {
  const f = await fixture(),
    file = await prepareSavedEvidence(f.sources, f.job, recipe, f.gate);
  for (const text of [
    ' ' + file.text,
    file.text.replace('{', '{"schema":"wrong",'),
    '{',
    ' '.repeat(1048577),
  ])
    await expect(
      openSavedEvidence(f.sources, f.job, recipe, text, f.gate),
    ).rejects.toThrow();
});
it('revoked reviewer cannot inspect or reconcile a formerly current file', async () => {
  const f = await fixture(),
    file = await prepareSavedEvidence(f.sources, f.job, recipe, f.gate);
  const old = f.sources.operations.syntheticMemberships.bind(
    f.sources.operations,
  );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) => old(org).map((m) => ({ ...m, active: false })),
  );
  expect(() => assertSavedEvidenceAccess(file)).toThrow();
  await expect(reconcileSavedEvidence(file)).rejects.toThrow();
});
it('wrong source handles cannot revive an opened file', async () => {
  const f = await fixture(),
    file = await prepareSavedEvidence(f.sources, f.job, recipe, f.gate);
  f.sources.entries = [...f.sources.entries];
  expect(() => assertSavedEvidenceAccess(file)).toThrow();
  await expect(reconcileSavedEvidence(file)).rejects.toThrow();
});
it('async canonical witness is observed and rejected without granting file authority', async () => {
  const f = await fixture(),
    broken = {
      ...recipe,
      assertSource: (() => Promise.reject(Error('not synchronous'))) as never,
    };
  await expect(
    prepareSavedEvidence(f.sources, f.job, broken, f.gate),
  ).rejects.toThrow(/Synchronous/);
  await Promise.resolve();
});
it('pending source read and final hash drift fail closed', async () => {
  const f = await fixture();
  const original = recipe.read;
  const bad = {
    ...recipe,
    read: async (s: F['sources'], j: string, g: F['gate']) => {
      const result = await original(s, j, g);
      save(f);
      return result;
    },
  };
  await expect(
    prepareSavedEvidence(f.sources, f.job, bad, f.gate),
  ).rejects.toThrow();
});
it('file open/reconcile never calls a business writer, network or identifier allocator', async () => {
  const f = await fixture(),
    file = await prepareSavedEvidence(f.sources, f.job, recipe, f.gate),
    writers = [
      vi.spyOn(f.sources.property, 'saveVisit'),
      vi.spyOn(f.sources.estimates, 'payroll'),
      vi.spyOn(f.sources.estimates, 'issue'),
      vi.spyOn(f.sources.operations, 'recordConsent'),
    ],
    ids = vi.spyOn(crypto, 'randomUUID'),
    network = vi.spyOn(globalThis, 'fetch');
  const opened = await openSavedEvidence(
    f.sources,
    f.job,
    recipe,
    file.text,
    f.gate,
  );
  await reconcileSavedEvidence(opened);
  writers.forEach((w) => expect(w).not.toHaveBeenCalled());
  expect(ids).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
  expect((await decodeSavedEvidence(file.text, recipe)).payload).toEqual(
    file.envelope.payload,
  );
});
