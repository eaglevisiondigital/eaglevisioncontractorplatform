import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { documentHash } from '../src/domain/release/preview';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { readDailyActionCenter } from '../src/lib/workflows/daily-action-center';
import {
  prepareIntelligenceWorkflow,
  readIntelligenceWorkflowAttempt,
} from '../src/lib/workflows/intelligence-workflow';
import {
  readVerifiedOperatingSuggestions,
  filterVerifiedOperatingSuggestions,
  openVerifiedSuggestionSource,
  openVerifiedSuggestionJob,
  inspectVerifiedOperatingSuggestions,
  assertVerifiedSuggestionsCurrent,
  verifiedSuggestionsEnabled,
  suggestionSourceKinds,
  type VerifiedSuggestionsInput,
  type VerifiedSuggestionsFilter,
} from '../src/lib/workflows/verified-operating-suggestions';
import {
  VerifiedOperatingSuggestions,
  VerifiedSuggestionSourceButton,
} from '../src/components/workflows/VerifiedOperatingSuggestions';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: 'localhost', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const clear: VerifiedSuggestionsFilter = {
  area: 'all',
  level: 'all',
  job_id: null,
  query: '',
  band: 'all',
  source_kind: 'all',
  verification: 'all',
};
async function fixture(index = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[index], gate),
    input: VerifiedSuggestionsInput = {
      review_on: sources.entries[0].day,
      timezone: sources.entries[0].timezone,
      input_revision: 1,
      ordering: 'EVIDENCE_FIRST',
    };
  return {
    sources,
    gate,
    input,
    read: () => readVerifiedOperatingSuggestions(sources, input, gate),
  };
}
const snapshot = (f: Awaited<ReturnType<typeof fixture>>) =>
  JSON.stringify({
    property: f.sources.property.read(f.sources.company.id),
    jobs: f.sources.entries.map((e) => ({
      source: f.sources.estimates.readSyntheticPrototypeSources(e.target),
      release: e.release.read('staff'),
    })),
  });
function digestChange(marker: string, change: () => void | Promise<void>) {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let fired = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (
      !fired &&
      new TextDecoder().decode(args[1] as ArrayBuffer).includes(marker)
    ) {
      fired = true;
      await change();
    }
    return result;
  });
  return () => fired;
}
const readMode = '"mode":"LOCAL_VERIFIED_OPERATING_SUGGESTIONS"';

describe('Cycle12 exact-source/workflow checked operating suggestions', () => {
  it.each([0, 1, 2])(
    'brand %i retains actual C11 facts/ranks/criteria, checks recorded state and never grants action authority or mutates sources',
    async (index) => {
      const f = await fixture(index),
        before = snapshot(f),
        attempts = f.sources.entries.map((e) =>
          readIntelligenceWorkflowAttempt(
            f.sources.estimates,
            e.target,
            f.gate,
          ),
        ),
        writers = [
          vi.spyOn(f.sources.estimates, 'projection'),
          vi.spyOn(f.sources.estimates, 'submitExpense'),
          vi.spyOn(f.sources.estimates, 'recordTime'),
          vi.spyOn(f.sources.estimates, 'payroll'),
          vi.spyOn(f.sources.property, 'saveVisit'),
          vi.spyOn(f.sources.property, 'savePlan'),
          ...f.sources.entries.map((e) => vi.spyOn(e.release, 'command')),
        ],
        canonical = await readDailyActionCenter(f.sources, f.input, f.gate),
        review = await f.read();
      expect(review.cards.map((c) => c.key)).toEqual(
        canonical.cards.map((c) => c.key),
      );
      for (const c of review.cards) {
        const original = canonical.cards.find((x) => x.key === c.key)!;
        expect(c.rank).toBe(original.rank);
        expect(c.source).toEqual(original.source);
        expect(c.recorded_fact).toBe(original.recorded_fact);
        expect(c.suggested_human_review).toBe(original.suggested_human_review);
        expect(c.verification.action_authority).toBe(
          'BLOCKED_SEPARATE_AUTHORITY_UNVERIFIED',
        );
        expect(
          c.verification.facts.find((v) => v.code === 'JOB_COMPLETION_STATE'),
        ).toMatchObject({ status: 'UNKNOWN', value: null });
        expect(
          c.verification.gaps.some(
            (v) => v.code === 'GENUINE_AUTH' && v.status === 'UNVERIFIED',
          ),
        ).toBe(true);
        expect(c.verification.manual_next_review).toBe(
          c.suggested_human_review,
        );
      }
      expect(review.verification_counts.matched_recorded_state).toBeGreaterThan(
        0,
      );
      expect(review.verification_counts.unknown).toBeGreaterThan(0);
      expect(
        review.verification_counts.matched_recorded_state +
          review.verification_counts.unknown,
      ).toBe(review.cards.length);
      const finance = review.cards.find((c) => c.source.kind === 'finance')!;
      expect(finance.verification.status).toBe('UNKNOWN');
      expect(
        finance.verification.facts.find((v) => v.code === 'INVOICE_READINESS')!
          .value,
      ).toBe('NO_GO');
      expect(
        finance.verification.gaps.some(
          (v) => v.code === 'PROVIDER_OUTCOME' && v.status === 'UNKNOWN',
        ),
      ).toBe(true);
      expect(review.selected_criteria).toEqual(canonical.selected_criteria);
      expect(review.model).toBe('NONE');
      expect(Object.values(review.authority).every((v) => v === false)).toBe(
        true,
      );
      expect(JSON.stringify(review)).not.toMatch(
        /PRIVATE staff|internal_notes|unit_cost_minor|cash_minor|burden_minor|Synthetic planning supplier|5550100100|@example/,
      );
      expect(snapshot(f)).toBe(before);
      writers.forEach((w) => expect(w).not.toHaveBeenCalled());
      expect(
        f.sources.entries.map((e) =>
          readIntelligenceWorkflowAttempt(
            f.sources.estimates,
            e.target,
            f.gate,
          ),
        ),
      ).toEqual(attempts);
      const { sha256, ...body } = review;
      expect(await documentHash(body)).toBe(sha256);
      expect(
        Object.isFrozen(review.cards[0].verification.required_checks),
      ).toBe(true);
      expect(await inspectVerifiedOperatingSuggestions(review)).toEqual({
        status: 'CURRENT_READ_ONLY_SUGGESTIONS',
        replacement: null,
      });
    },
  );
  it.each([0, 1, 2])(
    'brand %i inspects exact original source before separately navigating its job',
    async (index) => {
      const f = await fixture(index),
        r = await f.read();
      for (const kind of suggestionSourceKinds) {
        const c = r.cards.find((x) => x.source.kind === kind);
        if (!c) continue;
        const d = await openVerifiedSuggestionSource(r, c.key);
        expect(d.card).toEqual(c);
        expect(d.target).toEqual(c.source.target);
        expect(d.source.id).toBe(c.source.id);
        expect(d.source.version).toBe(c.source.version);
        expect(d.source.revision).toBe(c.source.revision);
        expect(openVerifiedSuggestionJob(d).target).toEqual(c.source.target);
        expect(JSON.stringify(d)).not.toMatch(
          /internal_notes|unit_cost_minor|cash_minor|burden_minor|PRIVATE staff|5550100100|@example/,
        );
        expect(() => openVerifiedSuggestionJob(structuredClone(d))).toThrow();
        expect(() =>
          openVerifiedSuggestionJob(r as unknown as typeof d),
        ).toThrow();
      }
      expect(r.cards.some((c) => c.source.kind === 'report')).toBe(true);
      expect(r.cards.some((c) => c.source.kind === 'issued')).toBe(true);
    },
  );
  it('combines original filters with exact source kind, recorded-state and literal fact search, preserving useful empty/count states', async () => {
    const f = await fixture(),
      r = await f.read(),
      c = r.cards.find((x) => x.source.kind === 'report')!;
    const one = filterVerifiedOperatingSuggestions(r, {
      ...clear,
      job_id: c.job_id,
      area: c.area,
      level: c.level,
      band: c.review_band,
      source_kind: 'report',
      verification: c.verification.status,
      query: c.source.id,
    });
    expect(one.cards.map((x) => x.key)).toEqual([c.key]);
    expect(one.matching).toBe(1);
    expect(one.available).toBe(r.cards.length);
    expect(one.matched_recorded_state + one.unknown).toBe(one.matching);
    expect(
      filterVerifiedOperatingSuggestions(r, {
        ...clear,
        query: '<script>.*[literal]',
      }).matching,
    ).toBe(0);
    expect(
      filterVerifiedOperatingSuggestions(r, {
        ...clear,
        query: 'Verified physical job completion',
      }).matching,
    ).toBe(r.cards.length);
    expect(
      filterVerifiedOperatingSuggestions(r, {
        ...clear,
        verification: 'UNKNOWN',
      }).matching,
    ).toBe(r.verification_counts.unknown);
    for (const kind of suggestionSourceKinds)
      expect(
        filterVerifiedOperatingSuggestions(r, { ...clear, source_kind: kind })
          .matching,
      ).toBe(r.cards.filter((x) => x.source.kind === kind).length);
  });
  it('keeps two jobs at one property separate and retains source-specific missing authority', async () => {
    const f = await fixture(),
      r = await f.read(),
      a = f.sources.entries[0],
      b = f.sources.entries[3];
    expect(a.target.location_id).toBe(b.target.location_id);
    for (const e of [a, b])
      expect(
        filterVerifiedOperatingSuggestions(r, {
          ...clear,
          job_id: e.target.job_id!,
        }).cards.every(
          (c) => c.source.target.version_id === e.target.version_id,
        ),
      ).toBe(true);
    const report = r.cards.find((c) => c.source.kind === 'report')!,
      issued = r.cards.find((c) => c.source.kind === 'issued')!,
      visit = r.cards.find((c) => c.source.kind === 'visit')!;
    expect(
      report.verification.gaps.some((g) => g.code === 'PHYSICAL_ACCEPTANCE'),
    ).toBe(true);
    expect(
      issued.verification.gaps.some((g) => g.code === 'CONTRACT_AUTHORITY'),
    ).toBe(true);
    expect(
      visit.verification.gaps.some((g) => g.code === 'TIMED_AVAILABILITY'),
    ).toBe(true);
    expect(
      visit.verification.facts.find((v) => v.code === 'VISIT_STATUS')!.value,
    ).toMatch(/draft|submitted|published/);
    expect(
      visit.verification.gaps.find((g) => g.code === 'PLAN_ACTIVATION')!.status,
    ).toBe('UNKNOWN');
  });
  it('an unrecognized recorded visit phase remains UNKNOWN rather than completion or availability', async () => {
    const f = await fixture(),
      original = f.sources.property.read.bind(f.sources.property),
      bad = original(f.sources.company.id),
      visit = bad.visits.find(
        (v) => v.id === f.sources.entries[0].scheduled_visit_id,
      )!;
    visit.phase = 'unrecognized' as typeof visit.phase;
    vi.spyOn(f.sources.property, 'read').mockImplementation(() =>
      structuredClone(bad),
    );
    const r = await f.read(),
      c = r.cards.find(
        (c) => c.source.kind === 'visit' && c.source.id === visit.id,
      )!;
    expect(c.verification.status).toBe('UNKNOWN');
    expect(
      c.verification.facts.find((v) => v.code === 'VISIT_PHASE')!.value,
    ).toBeNull();
    expect(c.verification.action_authority).toContain('BLOCKED');
  });
  it('reserves finite read custody before await and blocks concurrency, fresh containers, subset views and changed criteria', async () => {
    const f = await fixture(),
      results = await Promise.allSettled([f.read(), f.read()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expect(
      readVerifiedOperatingSuggestions(
        { ...f.sources },
        { ...f.input, ordering: 'RECORDED_DAY_FIRST' },
        f.gate,
      ),
    ).rejects.toThrow('already held');
    await expect(
      readVerifiedOperatingSuggestions(
        { ...f.sources, entries: [f.sources.entries[0]] },
        { ...f.input },
        f.gate,
      ),
    ).rejects.toThrow('already held');
  });
  it('lost read acknowledgment holds original source jobs without retry or replacement', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      if (new TextDecoder().decode(args[1] as ArrayBuffer).includes(readMode))
        throw Error('Lost acknowledgment');
      return digest(...args);
    });
    await expect(f.read()).rejects.toThrow('Lost acknowledgment');
    vi.restoreAllMocks();
    await expect(
      readVerifiedOperatingSuggestions(
        { ...f.sources },
        { ...f.input, input_revision: 2 },
        f.gate,
      ),
    ).rejects.toThrow('already held');
  });
  it('copied reviews/filters/details confer no authority and malformed filter input never invokes getters', async () => {
    const f = await fixture(),
      r = await f.read(),
      getter = vi.fn(() => 'all'),
      bad = { ...clear };
    expect(() =>
      filterVerifiedOperatingSuggestions(structuredClone(r), clear),
    ).toThrow();
    expect(
      (await inspectVerifiedOperatingSuggestions(structuredClone(r))).status,
    ).toBe('UNKNOWN');
    await expect(
      openVerifiedSuggestionSource(structuredClone(r), r.cards[0].key),
    ).rejects.toThrow();
    Object.defineProperty(bad, 'source_kind', {
      get: getter,
      enumerable: true,
    });
    expect(() => filterVerifiedOperatingSuggestions(r, bad)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      filterVerifiedOperatingSuggestions(r, {
        ...clear,
        job_id: crypto.randomUUID(),
      }),
    ).toThrow();
    await expect(openVerifiedSuggestionSource(r, 'unknown')).rejects.toThrow();
  });
  it('a failed synchronous render check permanently withholds retained evidence after confirmation restoration', async () => {
    const f = await fixture(),
      r = await f.read(),
      bytes = JSON.stringify(r);
    f.gate.confirmed = false;
    expect(() => assertVerifiedSuggestionsCurrent(r)).toThrow();
    f.gate.confirmed = true;
    expect((await inspectVerifiedOperatingSuggestions(r)).status).toBe(
      'UNKNOWN',
    );
    expect(() => filterVerifiedOperatingSuggestions(r, clear)).toThrow();
    expect(JSON.stringify(r)).toBe(bytes);
    await expect(
      readVerifiedOperatingSuggestions(
        { ...f.sources },
        { ...f.input },
        f.gate,
      ),
    ).rejects.toThrow('already held');
  });
  it.each(['job', 'visit', 'plan', 'report', 'attempt'] as const)(
    'actual %s workflow/source drift invalidates the retained immutable view',
    async (kind) => {
      const f = await fixture(),
        r = await f.read(),
        bytes = JSON.stringify(r),
        e = f.sources.entries[0],
        state = f.sources.property.read(f.sources.company.id);
      if (kind === 'job') {
        const job = f.sources.estimates.syntheticJob(
          f.sources.company.id,
          e.target.job_id!,
        )!;
        await f.sources.estimates.projection(f.sources.company.id, job, {
          ...job.projection,
          remaining: { ...job.projection.remaining, other: 1234 },
        });
      }
      if (kind === 'visit') {
        const visit = state.visits.find((v) => v.id === e.scheduled_visit_id)!;
        f.sources.property.submit(f.sources.company.id, visit);
      }
      if (kind === 'plan') {
        const plan = state.plans.find((p) => p.id === e.plan_id)!;
        f.sources.property.savePlan(f.sources.company.id, {
          ...plan,
          name: 'Changed canonical plan',
        });
      }
      if (kind === 'report') {
        state.reports.find((p) => p.id === e.report_id)!.version++;
        vi.spyOn(f.sources.property, 'read').mockImplementation(() =>
          structuredClone(state),
        );
      }
      if (kind === 'attempt')
        await prepareIntelligenceWorkflow(
          e.estimates,
          e.target,
          { review_on: e.day, advanced: null },
          f.gate,
        );
      expect((await inspectVerifiedOperatingSuggestions(r)).status).toBe(
        'UNKNOWN',
      );
      await expect(
        openVerifiedSuggestionSource(r, r.cards[0].key),
      ).rejects.toThrow();
      expect(JSON.stringify(r)).toBe(bytes);
    },
  );
  it.each(['company', 'repository'] as const)(
    'denies foreign %s roots without merging job identities',
    async (kind) => {
      const f = await fixture(),
        foreign = await fixture(1);
      const sources =
        kind === 'company'
          ? { ...f.sources, entries: [foreign.sources.entries[0]] }
          : { ...f.sources, estimates: foreign.sources.estimates };
      await expect(
        readVerifiedOperatingSuggestions(sources, f.input, f.gate),
      ).rejects.toThrow();
    },
  );
  it.each(['staff', 'inactive'] as const)(
    'denies %s membership',
    async (kind) => {
      const f = await fixture(),
        original = f.sources.operations.syntheticMemberships.bind(
          f.sources.operations,
        );
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
        (org) =>
          original(org).map((m) => ({
            ...m,
            role: kind === 'staff' ? 'staff' : m.role,
            active: kind !== 'inactive',
          })),
      );
      await expect(f.read()).rejects.toThrow();
    },
  );
  it.each([
    'criteria',
    'root',
    'model',
    'gate',
    'membership',
    'published-version',
  ] as const)(
    'rejects %s drift after the final suggestion hash',
    async (kind) => {
      const f = await fixture(),
        fired = digestChange(readMode, () => {
          if (kind === 'criteria') f.input.ordering = 'RECORDED_DAY_FIRST';
          if (kind === 'root') f.sources.entries = [...f.sources.entries];
          if (kind === 'model')
            f.sources.entries[0].release = f.sources.entries[1].release;
          if (kind === 'gate') f.gate.confirmed = false;
          if (kind === 'published-version')
            f.sources.entries[0].published_version++;
          if (kind === 'membership') {
            const original = f.sources.operations.syntheticMemberships.bind(
              f.sources.operations,
            );
            vi.spyOn(
              f.sources.operations,
              'syntheticMemberships',
            ).mockImplementation((org) =>
              original(org).map((m) => ({ ...m, active: false })),
            );
          }
        });
      await expect(f.read()).rejects.toThrow();
      expect(fired()).toBe(true);
    },
  );
  it('revalidates exact live state after the final source-detail await and never navigates a late result', async () => {
    const f = await fixture(),
      r = await f.read(),
      key = r.cards.find((c) => c.source.kind === 'report')!.key,
      fired = digestChange(
        'EXACT_READ_ONLY_SOURCE_INSPECTION_NOT_ACTION_AUTHORITY',
        () => {
          f.gate.confirmed = false;
        },
      );
    await expect(openVerifiedSuggestionSource(r, key)).rejects.toThrow();
    expect(fired()).toBe(true);
    f.gate.confirmed = true;
    expect((await inspectVerifiedOperatingSuggestions(r)).status).toBe(
      'UNKNOWN',
    );
  });
  it.each(['off', 'production', 'remote', 'https'] as const)(
    '%s gate precedes source getters/serializers in domain and rendering',
    async (kind) => {
      const getter = vi.fn(() => {
          throw Error('Do not execute');
        }),
        poison = {};
      Object.defineProperty(poison, 'company', {
        get: getter,
        enumerable: true,
      });
      Object.defineProperty(poison, 'toJSON', {
        value: getter,
        enumerable: true,
      });
      if (kind === 'production') vi.stubEnv('DEV', false);
      if (kind === 'remote')
        vi.stubGlobal('window', {
          location: { hostname: 'example.com', protocol: 'http:' },
        });
      if (kind === 'https')
        vi.stubGlobal('window', {
          location: { hostname: 'localhost', protocol: 'https:' },
        });
      const sources = poison as Parameters<
          typeof readVerifiedOperatingSuggestions
        >[0],
        input = {
          review_on: '',
          timezone: '',
          input_revision: 0,
          ordering: 'EVIDENCE_FIRST' as const,
        };
      await expect(
        kind === 'off'
          ? readVerifiedOperatingSuggestions(sources, input)
          : readVerifiedOperatingSuggestions(sources, input, {
              enabled: true,
              confirmed: true,
            }),
      ).rejects.toThrow();
      const markup = renderToStaticMarkup(
        createElement(VerifiedOperatingSuggestions, {
          sources,
          enabled: kind !== 'off',
        }),
      );
      expect(markup).not.toContain('<input');
      expect(getter).not.toHaveBeenCalled();
      expect(verifiedSuggestionsEnabled(kind !== 'off')).toBe(false);
    },
  );
  it('enabled source/input accessors and serializers are rejected before invocation', async () => {
    const f = await fixture(),
      getter = vi.fn(() => f.sources.estimates),
      poison = { ...f.sources };
    Object.defineProperty(poison, 'estimates', {
      get: getter,
      enumerable: true,
    });
    await expect(
      readVerifiedOperatingSuggestions(poison, f.input, f.gate),
    ).rejects.toThrow();
    await expect(
      readVerifiedOperatingSuggestions(
        f.sources,
        { ...f.input, toJSON: getter } as VerifiedSuggestionsInput,
        f.gate,
      ),
    ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2])(
    'brand %i renders accessible explicit criteria without loading source cards or consuming preparation',
    async (index) => {
      const f = await fixture(index),
        markup = renderToStaticMarkup(
          createElement(VerifiedOperatingSuggestions, {
            sources: f.sources,
            enabled: true,
          }),
        );
      expect(markup).toContain(
        'aria-label="Source-checked operating suggestions"',
      );
      expect(markup).toContain('Review source-checked suggestions');
      expect(markup).toContain('Staff-selected review order');
      expect(markup).not.toContain('Original suggestion source evidence');
      expect(
        f.sources.entries.every(
          (e) =>
            readIntelligenceWorkflowAttempt(
              f.sources.estimates,
              e.target,
              f.gate,
            ).status === 'NOT_STARTED',
        ),
      ).toBe(true);
    },
  );
  it('source-button accessible name includes the exact visible phrase and escapes source context', () => {
    const m = renderToStaticMarkup(
      createElement(VerifiedSuggestionSourceButton, {
        kind: 'report',
        job: '<exact job>',
        disabled: false,
        onOpen: () => {},
      }),
    );
    expect(m).toContain('>Open exact source</button>');
    expect(m).toContain(
      'aria-label="Open exact source: report for &lt;exact job&gt;"',
    );
    expect(m).not.toContain('<exact job>');
  });
});
