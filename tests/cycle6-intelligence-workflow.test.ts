import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prototypeFixture } from './program/prototype-fixture';
import {
  prepareIntelligenceWorkflow,
  inspectIntelligenceWorkflow,
  readIntelligenceWorkflowAttempt,
  type IntelligenceWorkflowInput,
} from '../src/lib/workflows/intelligence-workflow';
import { IntelligenceWorkflow } from '../src/components/workflows/IntelligenceWorkflow';
import { Phase3Repository } from '../src/lib/phase3';
import { Operations } from '../src/lib/operations';

afterEach(() => vi.restoreAllMocks());
async function fixture(
  index = 0,
  advanced = false,
  catalogBinding = false,
  issued = true,
) {
  const f = await prototypeFixture(sampleCompanies[index]);
  let bundle = f.bundle;
  const catalog = await f.repo.catalog(f.company.id);
  const line = bundle.version.payload.lines.find((line) =>
    ['material', 'product'].includes(line.kind),
  )!;
  const item = catalog.find(
    (item) => item.kind === line.kind && item.unit === line.unit,
  )!;
  if (catalogBinding)
    bundle = await f.repo.save(f.company.id, bundle, {
      ...bundle.version.payload,
      lines: bundle.version.payload.lines.map((row) =>
        row.id === line.id ? { ...row, catalog_item_id: item.id } : row,
      ),
    });
  let jobId: string | null = null;
  if (issued) {
    bundle = await f.repo.issue(f.company.id, bundle);
    jobId = await f.repo.approveJob(f.company.id, bundle);
  }
  const target = { ...f.target, version_id: bundle.version.id, job_id: jobId };
  const input: IntelligenceWorkflowInput = {
    review_on: '2026-12-07',
    advanced: advanced
      ? {
          transcript: `2 ${item.unit} ${item.name}`,
          edition:
            f.company.industry === 'construction'
              ? 'remodeling'
              : f.company.industry,
          catalog_item_ids: [item.id],
          procurement: null,
        }
      : null,
  };
  return {
    ...f,
    bundle,
    target,
    input,
    item,
    line,
    prepare: () => prepareIntelligenceWorkflow(f.repo, target, input, f.gate),
    status: () => readIntelligenceWorkflowAttempt(f.repo, target, f.gate),
  };
}
function finalHash(value: ArrayBuffer | ArrayBufferView<ArrayBuffer>) {
  return (
    JSON.parse(new TextDecoder().decode(value as ArrayBuffer)).mode ===
    'LOCAL_SYNTHETIC_INTELLIGENCE_WORKFLOW'
  );
}

describe('Cycle 6 actual-source Copilot workflow', () => {
  it.each([0, 1, 2])(
    'prepares explainable priorities for exact customer/property/job company %i with no source writes',
    async (index) => {
      const f = await fixture(index),
        before = {
          jobs: await f.repo.jobs(f.company.id),
          history: await f.repo.history(f.company.id, f.target.estimate_id),
        },
        writes = [
          vi.spyOn(f.repo, 'save'),
          vi.spyOn(f.repo, 'issue'),
          vi.spyOn(f.repo, 'submitExpense'),
          vi.spyOn(f.repo, 'recordTime'),
          vi.spyOn(f.repo, 'projection'),
        ];
      expect(f.status().status).toBe('NOT_STARTED');
      const review = await f.prepare();
      expect(review.target).toEqual(f.target);
      expect(review.copilot.snapshot.target).toEqual(f.target);
      expect(review.source_sha256).toBe(review.copilot.snapshot.source_sha256);
      expect(
        review.copilot.snapshot.cards.some(
          (card) => card.kind === 'job_cost_coverage',
        ),
      ).toBe(true);
      expect(
        review.copilot.snapshot.cards.every(
          (card) =>
            card.evidence.length && card.observation && card.suggested_review,
        ),
      ).toBe(true);
      expect(review.advanced).toBeNull();
      expect(review.model).toBe('NONE');
      expect(review.history_coverage).toBe('UNKNOWN');
      expect(
        Object.values(review.authority).every((value) => value === false),
      ).toBe(true);
      expect(f.status()).toEqual({
        status: 'PREPARED',
        phase: 'REVIEW_ONLY',
        retry: false,
        replacement: null,
      });
      expect(await inspectIntelligenceWorkflow(review)).toEqual({
        status: 'CURRENT_LOCAL_SOURCE',
        replacement: null,
      });
      expect({
        jobs: await f.repo.jobs(f.company.id),
        history: await f.repo.history(f.company.id, f.target.estimate_id),
      }).toEqual(before);
      writes.forEach((write) => expect(write).not.toHaveBeenCalled());
    },
  );
  it('retains explicit review-date meaning without inventing deadlines, bookings, AI decisions or physical completion', async () => {
    const f = await fixture(),
      review = await f.prepare();
    expect(review.copilot.snapshot.review_on).toBe(f.input.review_on);
    expect(review.review_date_meaning).toContain('not a deadline');
    expect(review.microphone).toBe('NOT_CAPTURED');
    expect(review.genuine_authentication).toBe('UNVERIFIED');
  });
  it('withholds private costs, contact information, supplier notes and workforce rates', async () => {
    const f = await fixture(),
      review = await f.prepare(),
      text = JSON.stringify(review);
    expect(text).not.toMatch(
      /PRIVATE|unit_cost|unit_price|markup_bps|gross_profit|cost_minor|cash_hour|deduction|"phone"\s*:|"email"\s*:|internal_note/,
    );
    expect(Object.isFrozen(review.copilot.snapshot.cards[0])).toBe(true);
  });
  it('atomically holds concurrent calls before the first await and never replays an existing preparation', async () => {
    const f = await fixture(),
      pending = f.prepare();
    expect(f.status().status).toBe('PENDING');
    await expect(f.prepare()).rejects.toThrow(/Existing|pending|UNKNOWN/);
    const review = await pending;
    await expect(f.prepare()).rejects.toThrow(/Existing|pending|UNKNOWN/);
    expect(await inspectIntelligenceWorkflow(review)).toMatchObject({
      status: 'CURRENT_LOCAL_SOURCE',
      replacement: null,
    });
  });
  it('retains UNKNOWN after hash acknowledgment loss and blocks retry even with changed input or job-null selection', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let calls = 0;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      if (++calls === 3) throw Error('Lost local hash acknowledgment');
      return digest(...args);
    });
    await expect(f.prepare()).rejects.toThrow('Lost');
    expect(f.status().status).toBe('UNKNOWN');
    vi.restoreAllMocks();
    f.input.review_on = '2026-12-08';
    await expect(f.prepare()).rejects.toThrow(/Existing|UNKNOWN/);
    await expect(
      prepareIntelligenceWorkflow(
        f.repo,
        { ...f.target, job_id: null },
        f.input,
        f.gate,
      ),
    ).rejects.toThrow(/Existing|UNKNOWN/);
    expect(f.status().status).toBe('UNKNOWN');
  });
  it('does not bypass an UNKNOWN hold with another saved draft lock revision', async () => {
    const f = await fixture(0, false, false, false),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let calls = 0;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      if (++calls === 3) throw Error('Lost preparation result');
      return digest(...args);
    });
    await expect(f.prepare()).rejects.toThrow();
    vi.restoreAllMocks();
    await f.repo.save(f.company.id, f.bundle, {
      ...f.bundle.version.payload,
      customer_notes: 'Explicit changed draft note',
    });
    await expect(f.prepare()).rejects.toThrow(/Existing|UNKNOWN/);
    expect(f.status().status).toBe('UNKNOWN');
  });
  it.each([
    {},
    { enabled: false, confirmed: true },
    { enabled: true, confirmed: false },
    { enabled: true, confirmed: 'true' },
    { enabled: true, confirmed: true, extra: 1 },
  ])(
    'rejects nonexact/default-off gate %j before source or attempt',
    async (gate) => {
      const f = await fixture(),
        read = vi.spyOn(f.repo, 'readSyntheticPrototypeSources');
      await expect(
        prepareIntelligenceWorkflow(f.repo, f.target, f.input, gate as never),
      ).rejects.toThrow();
      expect(read).not.toHaveBeenCalled();
      expect(f.status().status).toBe('NOT_STARTED');
    },
  );
  it.each([
    'job_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
  ] as const)(
    'rejects wrong actual %s before preparing evidence',
    async (key) => {
      const f = await fixture();
      await expect(
        prepareIntelligenceWorkflow(
          f.repo,
          { ...f.target, [key]: crypto.randomUUID() },
          f.input,
          f.gate,
        ),
      ).rejects.toThrow();
      expect(f.status().status).toBe('NOT_STARTED');
    },
  );
  it('denies foreign tenant, ineligible staff and connected sources without fetching credentials', async () => {
    const f = await fixture(),
      foreign = await fixture(1);
    await expect(
      prepareIntelligenceWorkflow(
        f.repo,
        {
          ...f.target,
          organization_id: foreign.company.id,
          actor_id: foreign.target.actor_id,
        },
        f.input,
        f.gate,
      ),
    ).rejects.toThrow();
    await expect(
      prepareIntelligenceWorkflow(
        f.repo,
        { ...f.target, actor_id: `${f.company.id}-field` },
        f.input,
        f.gate,
      ),
    ).rejects.toThrow();
    await expect(
      prepareIntelligenceWorkflow(
        new Phase3Repository(new Operations(false)),
        f.target,
        f.input,
        f.gate,
      ),
    ).rejects.toThrow();
  });
  it.each(['2026-02-30', '', '2026-12-7', '2026-12-07T00:00Z'])(
    'denies invalid human review date %s without consuming a source attempt',
    async (review_on) => {
      const f = await fixture();
      await expect(
        prepareIntelligenceWorkflow(
          f.repo,
          f.target,
          { ...f.input, review_on },
          f.gate,
        ),
      ).rejects.toThrow();
      expect(f.status().status).toBe('NOT_STARTED');
    },
  );
  it('rejects caller getters, symbols and serializers without executing them', async () => {
    const f = await fixture(),
      value = { ...f.input },
      getter = vi.fn(() => f.input.review_on);
    Object.defineProperty(value, 'review_on', { get: getter });
    await expect(
      prepareIntelligenceWorkflow(f.repo, f.target, value, f.gate),
    ).rejects.toThrow();
    await expect(
      prepareIntelligenceWorkflow(
        f.repo,
        f.target,
        {
          ...f.input,
          toJSON() {
            throw Error('executed');
          },
        } as never,
        f.gate,
      ),
    ).rejects.toThrow();
    await expect(
      prepareIntelligenceWorkflow(
        f.repo,
        f.target,
        { ...f.input, [Symbol()]: 1 },
        f.gate,
      ),
    ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('rejects an actual save at the last hash checkpoint and keeps the session hold UNKNOWN', async () => {
    const f = await fixture(0, false, false, false),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args);
      if (finalHash(args[1]))
        await f.repo.save(f.company.id, f.bundle, {
          ...f.bundle.version.payload,
          customer_notes: 'Actual edit at final checkpoint',
        });
      return value;
    });
    await expect(f.prepare()).rejects.toThrow();
    expect(f.status()).toMatchObject({ status: 'UNKNOWN', retry: false });
  });
  it.each(['confirmation', 'membership'] as const)(
    'checks %s immediately after the last hash',
    async (mode) => {
      const f = await fixture(),
        actor = `${f.company.id}-estimator`;
      await f.ops.manageMember(
        f.company.id,
        actor,
        true,
        'admin',
        'office_manager',
      );
      const target = { ...f.target, actor_id: actor },
        digest = crypto.subtle.digest.bind(crypto.subtle);
      vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
        const value = await digest(...args);
        if (finalHash(args[1])) {
          if (mode === 'confirmation') f.gate.confirmed = false;
          else
            await f.ops.manageMember(
              f.company.id,
              actor,
              false,
              'admin',
              'office_manager',
            );
        }
        return value;
      });
      await expect(
        prepareIntelligenceWorkflow(f.repo, target, f.input, f.gate),
      ).rejects.toThrow();
      vi.restoreAllMocks();
      f.gate.confirmed = true;
      expect(f.status().status).toBe('UNKNOWN');
    },
  );
  it('inspects frozen exact evidence as STALE after real source drift and UNKNOWN after revocation, never replacement', async () => {
    const f = await fixture(0, false, false, false),
      review = await f.prepare(),
      original = JSON.stringify(review);
    await f.repo.save(f.company.id, f.bundle, {
      ...f.bundle.version.payload,
      customer_notes: 'Actual later edit',
    });
    expect(await inspectIntelligenceWorkflow(review)).toEqual({
      status: 'STALE',
      replacement: null,
    });
    expect(JSON.stringify(review)).toBe(original);
    expect(await inspectIntelligenceWorkflow(structuredClone(review))).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    f.gate.confirmed = false;
    expect(await inspectIntelligenceWorkflow(review)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
  });
});

describe('human-selected Voice, Trade and Procurement composition', () => {
  it.each([0, 1, 2])(
    'reviews literal catalog suggestions and explicit edition for actual company %i without source changes',
    async (index) => {
      const f = await fixture(index, true),
        before = {
          jobs: await f.repo.jobs(f.company.id),
          history: await f.repo.history(f.company.id, f.target.estimate_id),
          profile: structuredClone(f.company),
        };
      const review = await f.prepare(),
        advanced = review.advanced!;
      expect(advanced.voice.snapshot.source_sha256).toBe(review.source_sha256);
      expect(advanced.trade.snapshot.source_sha256).toBe(review.source_sha256);
      expect(advanced.voice.snapshot.target).toEqual(f.target);
      expect(advanced.trade.snapshot.target).toEqual(f.target);
      expect(advanced.voice.snapshot.clauses[0].suggestion).toMatchObject({
        catalog_item_id: f.item.id,
        quantity_milli: 2000,
        unit: f.item.unit,
      });
      expect(
        f.input.advanced!.transcript.slice(
          advanced.voice.snapshot.clauses[0].span.start,
          advanced.voice.snapshot.clauses[0].span.end,
        ),
      ).toBe(advanced.voice.snapshot.clauses[0].span.literal);
      expect(advanced.trade.snapshot.edition).toBe(f.input.advanced!.edition);
      expect(advanced.trade.snapshot.licensing).toBe('UNVERIFIED');
      expect(advanced.procurement.status).toBe('NOT_REQUESTED');
      expect(review.authority.save).toBe(false);
      expect(await inspectIntelligenceWorkflow(review)).toEqual({
        status: 'CURRENT_LOCAL_SOURCE',
        replacement: null,
      });
      expect({
        jobs: await f.repo.jobs(f.company.id),
        history: await f.repo.history(f.company.id, f.target.estimate_id),
        profile: f.company,
      }).toEqual(before);
    },
  );
  it('retains unmatched wording, ambiguous instructions and unit differences as review warnings without fuzzy inference', async () => {
    const f = await fixture(0, true);
    f.input.advanced!.transcript =
      'Please handle the outside; 1 day nonexistent material';
    const review = await f.prepare();
    expect(
      review.advanced!.voice.snapshot.clauses.every(
        (clause) => clause.suggestion === null && clause.warning,
      ),
    ).toBe(true);
    expect(review.advanced!.voice.snapshot.total).toBe('NOT_CALCULATED');
  });
  it('allows explicit review edition context while preserving approved contractor branding and industry', async () => {
    const f = await fixture(2, true);
    f.input.advanced!.edition = 'electrical';
    const review = await f.prepare();
    expect(review.advanced!.trade.snapshot.edition).toBe('electrical');
    expect(f.company.industry).toBe('roofing');
    expect(
      review.advanced!.trade.snapshot.authority.change_company_profile,
    ).toBe(false);
  });
  it('composes an exact recorded source-line/catalog procurement review without an order, price calculation or expense', async () => {
    const f = await fixture(0, true, true);
    f.input.advanced!.procurement = {
      kind: 'purchase-review',
      selections: [
        {
          line_id: f.line.id,
          catalog_item_id: f.item.id,
          quantity_milli: 1000,
          bid_minor: 15000,
        },
      ],
    };
    const before = await f.repo.jobs(f.company.id),
      review = await f.prepare(),
      procurement = review.advanced!.procurement;
    expect(procurement.status).toBe('PREPARED_LOCAL_REVIEW_ONLY');
    expect(procurement.review?.snapshot.target).toEqual(f.target);
    expect(procurement.review?.snapshot.source_sha256).toBe(
      review.source_sha256,
    );
    expect(procurement.review?.snapshot.approval).toBe('BLOCKED');
    expect(await f.repo.jobs(f.company.id)).toEqual(before);
    expect(review.authority.purchase_order).toBe(false);
  });
  it('shows missing recorded scope/catalog association as UNKNOWN instead of matching similar descriptions', async () => {
    const f = await fixture(0, true);
    f.input.advanced!.procurement = {
      kind: 'purchase-review',
      selections: [
        {
          line_id: f.line.id,
          catalog_item_id: f.item.id,
          quantity_milli: 1000,
          bid_minor: null,
        },
      ],
    };
    const review = await f.prepare();
    expect(review.advanced!.procurement).toEqual({
      status: 'UNKNOWN_NO_RECORDED_SCOPE_CATALOG_ASSOCIATION',
      review: null,
    });
  });
  it('rejects foreign actual catalog IDs rather than importing another company material', async () => {
    const f = await fixture(0, true),
      foreign = await fixture(1, true);
    f.input.advanced!.catalog_item_ids = [foreign.item.id];
    await expect(f.prepare()).rejects.toThrow();
    expect(f.status().status).toBe('UNKNOWN');
  });
  it('does not execute array accessors or serialize a caller-defined advanced payload', async () => {
    const f = await fixture(0, true),
      getter = vi.fn(() => f.item.id),
      ids = [f.item.id];
    Object.defineProperty(ids, '0', { get: getter });
    f.input.advanced!.catalog_item_ids = ids;
    await expect(f.prepare()).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(f.status().status).toBe('NOT_STARTED');
  });
  it('does not automatically enable advanced review after a prepared core review', async () => {
    const f = await fixture();
    const review = await f.prepare();
    f.input.advanced = {
      transcript: `1 ${f.item.unit} ${f.item.name}`,
      edition: 'property_services',
      catalog_item_ids: [],
      procurement: null,
    };
    await expect(f.prepare()).rejects.toThrow(/Existing/);
    expect(review.advanced).toBeNull();
  });
});

describe('default-OFF Intelligence staff panel', () => {
  it('withholds prior suggestions during disabled, pending, error and missing-result states', async () => {
    const f = await fixture(),
      review = await f.prepare();
    for (const props of [
      { review },
      { review, enabled: true, loading: true },
      { review, enabled: true, error: 'Source unavailable' },
      { review: null, enabled: true },
    ]) {
      const html = renderToStaticMarkup(
        createElement(IntelligenceWorkflow, props),
      );
      expect(html).not.toContain(review.target.version_id);
      expect(html).not.toContain('Suggested human review:');
    }
  });
  it('renders exact source evidence, explicit boundaries and escaped literal transcript text', async () => {
    const f = await fixture(0, true);
    f.input.advanced!.transcript = '<img src=x onerror=alert(1)>';
    const review = await f.prepare(),
      html = renderToStaticMarkup(
        createElement(IntelligenceWorkflow, { review, enabled: true }),
      );
    expect(html).toContain(review.target.version_id);
    expect(html).toContain('Model: NONE');
    expect(html).toContain('UNVERIFIED');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('PRIVATE');
  });
});
