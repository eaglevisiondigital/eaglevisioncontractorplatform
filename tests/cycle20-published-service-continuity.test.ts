import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { documentHash } from '../src/domain/release/preview';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import { PublishedServiceContinuity } from '../src/components/workflows/PublishedServiceContinuity';
import {
  publishedServiceEvidenceRecipe as recipe,
  parsePublishedServiceEvidence,
  validatePublishedServiceEvidence,
} from '../src/lib/workflows/published-service-continuity';
import {
  prepareSavedEvidence,
  decodeSavedEvidence,
  openSavedEvidence,
  reconcileSavedEvidence,
  type EvidenceEnvelope,
} from '../src/lib/workflows/saved-evidence-runtime';
import {
  readServiceRevisionReview,
  readServiceRevisionUpdates,
} from '../src/lib/workflows/service-revision-review';
import {
  readCompletionReview,
  prepareCompletionReview,
} from '../src/lib/workflows/completion-review';
import type { PropertyState } from '../src/lib/property';
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
  return { gate, all, entry, sources, job };
}
async function prepared(brand = 0) {
  const f = await fixture(brand);
  return {
    ...f,
    file: await prepareSavedEvidence(f.sources, f.job, recipe, f.gate),
  };
}
function publish(f: Awaited<ReturnType<typeof fixture>>) {
  const repo = f.sources.property,
    org = f.sources.company.id;
  let visit = repo.read(org).visits.find((v) => v.id === f.entry.visit_id)!;
  repo.revise(org, visit);
  visit = repo.read(org).visits.find((v) => v.id === visit.id)!;
  repo.saveVisit(org, visit, {
    ...visit.content,
    summary: 'Actual revised published customer-safe service documentation',
    internal_notes: 'PRIVATE revised payroll and supplier details',
  });
  visit = repo.read(org).visits.find((v) => v.id === visit.id)!;
  repo.submit(org, visit);
  visit = repo.read(org).visits.find((v) => v.id === visit.id)!;
  return repo.publish(org, visit);
}
async function reseal(value: EvidenceEnvelope<unknown>) {
  const body = {
    schema: value.schema,
    kind: value.kind,
    identity: value.identity,
    payload: value.payload,
  };
  return JSON.stringify({ ...body, sha256: await documentHash(body) });
}
function changed(
  f: Awaited<ReturnType<typeof fixture>>,
  change: (state: PropertyState) => void,
) {
  const repo = f.sources.property,
    read = repo.read.bind(repo),
    portal = repo.portal.bind(repo);
  vi.spyOn(repo, 'read').mockImplementation((org) => {
    const s = read(org);
    change(s);
    return s;
  });
  vi.spyOn(repo, 'portal').mockImplementation((org, customer) => {
    const original = portal(org, customer),
      s = read(org);
    change(s);
    return {
      ...original,
      reports: s.reports.filter((r) => r.customer_id === customer),
    };
  });
}
function during(
  change: () => void,
  match = (text: string) =>
    text.includes('"schema":"propel-local-saved-evidence-v1"'),
) {
  const original = crypto.subtle.digest.bind(crypto.subtle);
  let seen = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const r = await original(...args);
    if (!seen && match(new TextDecoder().decode(args[1] as Uint8Array))) {
      seen = true;
      change();
    }
    return r;
  });
  return () => expect(seen).toBe(true);
}
it.each([0, 1, 2])(
  'brand %i prepares full safe bytes, decodes and reopens exact current published records',
  async (brand) => {
    const f = await prepared(brand),
      decoded = await decodeSavedEvidence(f.file.text, recipe),
      copy = new TextDecoder().decode(new TextEncoder().encode(f.file.text)),
      opened = await openSavedEvidence(f.sources, f.job, recipe, copy, f.gate);
    expect(decoded.payload.source.job_id).toBe(f.job);
    expect(decoded.payload.source_anchor.report_id).toBe(f.entry.report_id);
    expect(decoded.payload.reports[0].visit_id).toBe(f.entry.visit_id);
    expect(decoded.payload.reports[0].plan_id).toBe(f.entry.plan_id);
    expect(
      decoded.payload.reports[0].report_page.reports[0].snapshot.findings
        .length,
    ).toBeGreaterThan(0);
    expect(opened.text).toBe(f.file.text);
    expect(opened.meaning).toBe('HISTORICAL_EVIDENCE_ONLY');
    expect(opened.canonical_restore).toBe(false);
    expect(opened.authority).toBe(false);
    expect((await reconcileSavedEvidence(opened)).status).toBe('CURRENT_MATCH');
    expect(f.file.text).not.toMatch(
      /actor_id|worker_id|unit_cost_minor|cash_minor|internal_notes|PRIVATE|supplier|repair_scopes/,
    );
    expect(f.file.text).not.toContain(f.entry.target.actor_id);
    expect(decoded.payload.physical_completion).toBe('UNVERIFIED');
    expect(decoded.payload.customer_acceptance).toBe('UNVERIFIED');
    expect(decoded.payload.delivery).toBe('NOT_SENT');
  },
);
it.each([0, 1, 2])(
  'brand %i actual newly published sibling makes saved evidence stale while the original report stays immutable',
  async (brand) => {
    const f = await prepared(brand),
      text = f.file.text,
      old = f.sources.property
        .read(f.sources.company.id)
        .reports.find((r) => r.id === f.entry.report_id)!,
      next = publish(f);
    expect(next.id).not.toBe(old.id);
    expect(next.version).toBe(old.version + 1);
    expect(next.visit_id).toBe(old.visit_id);
    const reopened = await openSavedEvidence(
      f.sources,
      f.job,
      recipe,
      text,
      f.gate,
    );
    expect((await reconcileSavedEvidence(reopened)).status).toBe(
      'STALE_SAVED_EVIDENCE',
    );
    expect(f.file.text).toBe(text);
    expect(
      f.sources.property
        .read(f.sources.company.id)
        .reports.find((r) => r.id === old.id),
    ).toEqual(old);
    expect(
      reopened.envelope.payload.reports.some(
        (r) => r.reference.report_id === next.id,
      ),
    ).toBe(false);
    const fresh = await prepareSavedEvidence(f.sources, f.job, recipe, f.gate);
    expect(
      fresh.envelope.payload.reports.some(
        (r) => r.reference.report_id === next.id,
      ),
    ).toBe(true);
  },
);
it.each([0, 1, 2])(
  'brand %i a fresh fixture cannot restore or substitute missing canonical records from file IDs',
  async (brand) => {
    const f = await prepared(brand),
      fresh = await fixture(brand);
    expect(fresh.job).not.toBe(f.job);
    await expect(
      openSavedEvidence(
        fresh.sources,
        fresh.job,
        recipe,
        f.file.text,
        fresh.gate,
      ),
    ).rejects.toThrow();
    await expect(
      openSavedEvidence(fresh.sources, f.job, recipe, f.file.text, fresh.gate),
    ).rejects.toThrow();
  },
);
it.each([0, 1, 2])(
  'brand %i file operations never execute publication, original completion or financial commands',
  async (brand) => {
    const f = await fixture(brand),
      state = f.sources.property.read(f.sources.company.id),
      jobs = await f.sources.estimates.jobs(f.sources.company.id),
      writes = [
        vi.spyOn(f.sources.property, 'publish'),
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.estimates, 'submitExpense'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.entry.release, 'command'),
      ],
      ids = vi.spyOn(crypto, 'randomUUID');
    const file = await prepareSavedEvidence(f.sources, f.job, recipe, f.gate),
      opened = await openSavedEvidence(
        f.sources,
        f.job,
        recipe,
        file.text,
        f.gate,
      );
    await reconcileSavedEvidence(opened);
    writes.forEach((w) => expect(w).not.toHaveBeenCalled());
    expect(ids).not.toHaveBeenCalled();
    expect(f.sources.property.read(f.sources.company.id)).toEqual(state);
    expect(await f.sources.estimates.jobs(f.sources.company.id)).toEqual(jobs);
  },
);
it('same-property different-job published reports cannot be grafted into an authorized source file', async () => {
  const f = await prepared(),
    other = f.all.entries[3],
    otherSources = { ...f.all, entries: [other] },
    second = await prepareSavedEvidence(
      otherSources,
      other.target.job_id!,
      recipe,
      f.gate,
    ),
    forged = JSON.parse(f.file.text);
  expect(second.envelope.identity.location_id).toBe(
    f.file.envelope.identity.location_id,
  );
  forged.payload.reports = structuredClone(second.envelope.payload.reports);
  forged.payload.source_anchor = structuredClone(
    second.envelope.payload.source_anchor,
  );
  const text = await reseal(forged);
  expect(
    (await decodeSavedEvidence(text, recipe)).payload.reports[0].reference
      .report_id,
  ).toBe(other.report_id);
  await expect(
    openSavedEvidence(f.sources, f.job, recipe, text, f.gate),
  ).rejects.toThrow(/source|report|provenance|ownership/i);
});
it('foreign payload cannot hide under an authorized envelope identity even with a recomputed self hash', async () => {
  const f = await prepared(),
    foreign = await prepared(1),
    forged = JSON.parse(f.file.text);
  forged.payload = structuredClone(foreign.file.envelope.payload);
  await expect(
    openSavedEvidence(f.sources, f.job, recipe, await reseal(forged), f.gate),
  ).rejects.toThrow(/ownership/);
});
it.each([
  'report',
  'version',
  'visit',
  'plan',
  'issued-hash',
  'issued-version',
  'scope',
  'request',
] as const)(
  'forged exact %s provenance is denied by current canonical source validation',
  async (kind) => {
    const f = await prepared(),
      forged = JSON.parse(f.file.text),
      p = forged.payload,
      r = p.reports[0];
    if (kind === 'report') {
      r.reference.report_id = crypto.randomUUID();
      r.report_page.reports[0].id = r.reference.report_id;
      p.source_anchor.report_id = r.reference.report_id;
    }
    if (kind === 'version') {
      r.reference.published_version = 2;
      r.report_page.reports[0].version = 2;
      p.source_anchor.published_version = 2;
    }
    if (kind === 'visit') r.visit_id = f.entry.scheduled_visit_id;
    if (kind === 'plan') r.plan_id = f.all.entries[3].plan_id;
    if (kind === 'issued-hash') p.issued_source_sha256 = '0'.repeat(64);
    if (kind === 'issued-version') p.source.version_id = crypto.randomUUID();
    if (kind === 'scope')
      p.scope.description = 'Forged safe-looking scope description';
    if (kind === 'request') p.request_id = crypto.randomUUID();
    await expect(
      openSavedEvidence(f.sources, f.job, recipe, await reseal(forged), f.gate),
    ).rejects.toThrow();
  },
);
it.each([
  'actor',
  'private-note',
  'cost',
  'workforce',
  'finding-private',
  'approved',
  'physical',
  'media',
  'unknown-key',
] as const)(
  'strict published parser excludes %s even in a self-hashed file',
  async (kind) => {
    const f = await prepared(),
      forged = JSON.parse(f.file.text),
      p = forged.payload,
      r = p.reports[0].report_page.reports[0];
    if (kind === 'actor') p.source.actor_id = f.entry.target.actor_id;
    if (kind === 'private-note') r.snapshot.internal_notes = 'PRIVATE note';
    if (kind === 'cost') p.scope.lines[0].unit_cost_minor = 999;
    if (kind === 'workforce') p.worker_id = f.entry.worker_id;
    if (kind === 'finding-private')
      r.snapshot.findings[0].customer_visible = false;
    if (kind === 'approved') p.customer_acceptance = 'APPROVED';
    if (kind === 'physical') p.physical_completion = 'PASS';
    if (kind === 'media')
      r.snapshot.media = [{ url: 'https://example.invalid/private' }];
    if (kind === 'unknown-key') p.extra = 'hidden';
    await expect(
      decodeSavedEvidence(await reseal(forged), recipe),
    ).rejects.toThrow();
  },
);
it.each(['summary', 'missing', 'duplicate'] as const)(
  'historical %s source corruption cannot reopen an archived published version',
  async (kind) => {
    const f = await prepared();
    changed(f, (state) => {
      const r = state.reports.find((r) => r.id === f.entry.report_id)!;
      if (kind === 'summary') r.summary = 'Rewritten old publication';
      if (kind === 'missing')
        state.reports = state.reports.filter((x) => x.id !== r.id);
      if (kind === 'duplicate') state.reports.push({ ...r });
    });
    await expect(
      openSavedEvidence(f.sources, f.job, recipe, f.file.text, f.gate),
    ).rejects.toThrow();
  },
);
it('an archived non-anchor later version must still exist in actual current history', async () => {
  const f = await fixture();
  const second = publish(f),
    file = await prepareSavedEvidence(f.sources, f.job, recipe, f.gate);
  changed(f, (state) => {
    state.reports = state.reports.filter((r) => r.id !== second.id);
  });
  await expect(
    openSavedEvidence(f.sources, f.job, recipe, file.text, f.gate),
  ).rejects.toThrow(/report|history|source/i);
});
it('old published evidence remains valid against an explicitly newer C19 selection', async () => {
  const f = await prepared(),
    before = await readServiceRevisionReview(f.sources, f.job, f.gate);
  publish(f);
  const latest = await readServiceRevisionUpdates(before);
  expect(latest.evidence.selected.reference.published_version).toBe(2);
  expect(() =>
    validatePublishedServiceEvidence(f.file.envelope.payload, latest),
  ).not.toThrow();
});
it('duplicate and concurrent preparation remains read only with identical bytes and no new business IDs', async () => {
  const f = await fixture(),
    ids = vi.spyOn(crypto, 'randomUUID'),
    [a, b] = await Promise.all([
      prepareSavedEvidence(f.sources, f.job, recipe, f.gate),
      prepareSavedEvidence(f.sources, f.job, recipe, f.gate),
    ]);
  expect(a.text).toBe(b.text);
  expect(a).not.toBe(b);
  expect(ids).not.toHaveBeenCalled();
  await expect(reconcileSavedEvidence({ ...a })).rejects.toThrow(/Original/);
});
it('actual publication during final envelope hashing rejects a stale file preparation', async () => {
  const f = await fixture(),
    hit = during(() => publish(f));
  await expect(
    prepareSavedEvidence(f.sources, f.job, recipe, f.gate),
  ).rejects.toThrow();
  hit();
});
it('revocation after file digest cannot expose reopened payload or reconcile source', async () => {
  const f = await prepared(),
    members = f.sources.operations.syntheticMemberships.bind(
      f.sources.operations,
    ),
    hit = during(() => {
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
        (org) =>
          members(org).filter((m) => m.user_id !== f.entry.target.actor_id),
      );
    });
  await expect(
    openSavedEvidence(f.sources, f.job, recipe, f.file.text, f.gate),
  ).rejects.toThrow();
  hit();
  await expect(reconcileSavedEvidence(f.file)).rejects.toThrow();
});
it.each([0, 1, 2])(
  'brand %i original completion UNKNOWN remains held after file prepare/reopen/reconciliation',
  async (brand) => {
    const f = await prepared(brand),
      view = await readCompletionReview(
        f.entry,
        {
          report_id: f.entry.report_id,
          published_version: f.entry.published_version,
        },
        f.gate,
      ),
      confirm = {
        confirmed: true,
        checks: { scope: true, documentation: true, limitations: true },
      },
      hit = during(
        () => {
          f.gate.enabled = false;
        },
        () => true,
      );
    await expect(prepareCompletionReview(view, confirm)).rejects.toThrow();
    hit();
    vi.restoreAllMocks();
    f.gate.enabled = true;
    const reopened = await openSavedEvidence(
      f.sources,
      f.job,
      recipe,
      f.file.text,
      f.gate,
    );
    expect((await reconcileSavedEvidence(reopened)).status).toBe(
      'CURRENT_MATCH',
    );
    const fresh = await readCompletionReview(
      f.entry,
      {
        report_id: f.entry.report_id,
        published_version: f.entry.published_version,
      },
      f.gate,
    );
    await expect(prepareCompletionReview(fresh, confirm)).rejects.toThrow(
      /attempted|UNKNOWN/,
    );
  },
);
it.each(['getter', 'phase-coercion', 'toJSON', 'sparse'] as const)(
  'unknown %s data cannot execute through published parser',
  async (kind) => {
    const f = await prepared(),
      p = JSON.parse(f.file.text).payload,
      called = vi.fn();
    if (kind === 'getter')
      Object.defineProperty(p.reports[0], 'visit_id', { get: called });
    if (kind === 'phase-coercion')
      p.reports[0].report_page.reports[0].snapshot.phase = { toString: called };
    if (kind === 'toJSON') p.toJSON = called;
    if (kind === 'sparse') p.reports = new Array(1);
    expect(() =>
      parsePublishedServiceEvidence(p, f.file.envelope.identity),
    ).toThrow();
    expect(called).not.toHaveBeenCalled();
  },
);
it('byte tampering, noncanonical JSON and oversized input never reopen by fallback', async () => {
  const f = await prepared();
  for (const text of [
    f.file.text + '\n',
    f.file.text.replace('Recorded synthetic', 'Altered synthetic'),
    'x'.repeat(1048577),
  ])
    await expect(decodeSavedEvidence(text, recipe)).rejects.toThrow();
});
it.each(['off', 'host', 'https', 'production'] as const)(
  '%s withholds source getters and file controls',
  async (kind) => {
    if (kind === 'host')
      vi.stubGlobal('window', {
        location: { hostname: 'example.invalid', protocol: 'http:' },
      });
    if (kind === 'https')
      vi.stubGlobal('window', {
        location: { hostname: '127.0.0.1', protocol: 'https:' },
      });
    if (kind === 'production') vi.stubEnv('DEV', false);
    const getter = vi.fn(),
      sources = Object.defineProperty({}, 'company', {
        get: getter,
      }) as OperatingSources;
    await expect(
      prepareSavedEvidence(sources, 'missing', recipe, {
        enabled: kind !== 'off',
        confirmed: true,
      }),
    ).rejects.toThrow();
    expect(
      renderToStaticMarkup(
        createElement(PublishedServiceContinuity, {
          sources,
          enabled: kind !== 'off',
        }),
      ),
    ).toContain('off');
    expect(getter).not.toHaveBeenCalled();
  },
);
it('component composes original service workspace and shared file controls with stable labels', async () => {
  const f = await fixture(),
    html = renderToStaticMarkup(
      createElement(PublishedServiceContinuity, {
        sources: f.sources,
        enabled: true,
        selectedJobId: f.job,
      }),
    );
  expect(html).toContain('Published service continuity');
  expect(html).toContain('Service revision review');
  expect(html).toContain('Download published service evidence');
  expect(html).toContain('Open published service evidence file');
  expect(html).toContain('Reconcile exact saved published service source');
  expect(html).toContain('Physical');
});
it('an actual saved internal draft revision never becomes published evidence or changes the saved safe file', async () => {
  const f = await prepared(),
    repo = f.sources.property,
    org = f.sources.company.id,
    draft = repo
      .read(org)
      .visits.find((v) => v.id === f.entry.scheduled_visit_id)!,
    reports = repo.read(org).reports;
  repo.saveVisit(org, draft, {
    ...draft.content,
    summary: 'STAFF_INTERNAL saved draft only',
    internal_notes: 'PRIVATE supplier workforce rates and margin',
  });
  const reopened = await openSavedEvidence(
    f.sources,
    f.job,
    recipe,
    f.file.text,
    f.gate,
  );
  expect((await reconcileSavedEvidence(reopened)).status).toBe('CURRENT_MATCH');
  const next = await prepareSavedEvidence(f.sources, f.job, recipe, f.gate);
  expect(next.text).toBe(f.file.text);
  expect(next.text).not.toContain('STAFF_INTERNAL');
  expect(next.text).not.toContain('PRIVATE');
  expect(repo.read(org).reports).toEqual(reports);
});
