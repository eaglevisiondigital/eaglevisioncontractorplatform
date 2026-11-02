import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { documentHash } from '../src/domain/release/preview';
import { prepareLocalJourney } from '../src/lib/workflows/journey-runtime';
import {
  prepareIntelligenceWorkflow,
  readIntelligenceWorkflowAttempt,
} from '../src/lib/workflows/intelligence-workflow';
import {
  readDailyOperations,
  filterDailyOperations,
  inspectDailyOperations,
  openDailyOperationsSource,
  type DailyOperationsInput,
} from '../src/lib/workflows/daily-operations';
import { DailyOperations } from '../src/components/workflows/DailyOperations';

afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const gate = { enabled: true, confirmed: true },
    j = await prepareLocalJourney(sampleCompanies[index], gate);
  const input: DailyOperationsInput = {
    review_on: j.day,
    timezone: j.timezone,
    input_revision: 1,
  };
  return { j, gate, input, read: () => readDailyOperations(j, input, gate) };
}
describe('Cycle 8 selected-job daily operating priorities', () => {
  it.each([0, 1, 2])(
    'composes actual company %i evidence without writers, generated AI or consuming Copilot claims',
    async (index) => {
      const f = await fixture(index),
        { j } = f;
      const original = JSON.stringify(
          j.estimates.readSyntheticPrototypeSources(j.target),
        ),
        property = j.property.read(j.company.id),
        release = j.release.read('staff');
      const prior = readIntelligenceWorkflowAttempt(
        j.estimates,
        j.target,
        f.gate,
      );
      const writers = [
        vi.spyOn(j.estimates, 'recordTime'),
        vi.spyOn(j.estimates, 'submitExpense'),
        vi.spyOn(j.estimates, 'projection'),
        vi.spyOn(j.estimates, 'payroll'),
        vi.spyOn(j.release, 'command'),
        vi.spyOn(j.property, 'saveVisit'),
        vi.spyOn(j.property, 'submit'),
      ];
      const review = await f.read();
      expect(review.target).toEqual(j.target);
      expect(review.review_on).toBe(j.day);
      expect(review.finance.coverage).toBe('UNKNOWN');
      expect(review.finance.invoice_readiness).toBe('NO_GO');
      expect(review.field).toMatchObject({
        actual_availability: 'UNKNOWN',
        capacity: 'UNKNOWN',
        physical_completion: 'UNVERIFIED',
      });
      expect(
        review.cards.some(
          (c) => c.area === 'finance' && c.level === 'evidence',
        ),
      ).toBe(true);
      expect(
        review.cards.some(
          (c) =>
            c.source.kind === 'visit' && c.source.id === j.scheduled_visit_id,
        ),
      ).toBe(true);
      expect(
        review.cards.some(
          (c) =>
            c.source.kind === 'report' &&
            c.source.id === j.report_id &&
            c.source.version === j.published_version,
        ),
      ).toBe(true);
      expect(review.model).toBe('NONE');
      expect(Object.values(review.authority).every((v) => v === false)).toBe(
        true,
      );
      expect(
        readIntelligenceWorkflowAttempt(j.estimates, j.target, f.gate),
      ).toEqual(prior);
      expect(
        JSON.stringify(j.estimates.readSyntheticPrototypeSources(j.target)),
      ).toBe(original);
      expect(j.property.read(j.company.id)).toEqual(property);
      expect(j.release.read('staff')).toEqual(release);
      writers.forEach((writer) => expect(writer).not.toHaveBeenCalled());
      expect(await inspectDailyOperations(review)).toEqual({
        status: 'CURRENT_LOCAL_SOURCE',
        replacement: null,
      });
    },
  );
  it.each([0, 1, 2])(
    'filters company %i combined areas/types/literal text with exact available counts',
    async (index) => {
      const f = await fixture(index),
        r = await f.read();
      const cards = filterDailyOperations(r, {
        area: 'field',
        level: 'evidence',
        query: f.j.scheduled_visit_id,
      });
      expect(cards.matching).toBe(1);
      expect(cards.available).toBe(r.cards.length);
      expect(cards.cards[0].source.id).toBe(f.j.scheduled_visit_id);
      const none = filterDailyOperations(r, {
        area: 'all',
        level: 'all',
        query: '[.*]not-a-regex',
      });
      expect(none.matching).toBe(0);
      expect(
        filterDailyOperations(r, { area: 'all', level: 'all', query: '' })
          .matching,
      ).toBe(r.cards.length);
    },
  );
  it('preserves exact deterministic evidence/date/source ordering without severity or deadline invention', async () => {
    const f = await fixture(),
      r = await f.read();
    const firstReview = r.cards.findIndex((c) => c.level === 'review');
    expect(r.cards.slice(firstReview).every((c) => c.level === 'review')).toBe(
      true,
    );
    expect(r.order_meaning).toContain('not reported physical severity');
    expect(r.date_meaning).toContain('no deadline');
    expect(r.coverage).toBe(
      'AVAILABLE_EXACT_SELECTED_JOB_SOURCES_ONLY_NOT_WHOLE_COMPANY',
    );
  });
  it('keeps alternate-day Field emptiness separate from Finance/scope and historical documentation coverage', async () => {
    const f = await fixture();
    f.input.review_on = '2027-04-20';
    const r = await f.read();
    expect(
      filterDailyOperations(r, { area: 'field', level: 'all', query: '' })
        .matching,
    ).toBe(0);
    expect(r.cards.some((c) => c.area === 'scope')).toBe(true);
    expect(r.cards.some((c) => c.area === 'documentation')).toBe(true);
    expect(r.date_meaning).toContain('Field activity only');
  });
  it('opens exact published report/version and immutable issued scope through existing readers only', async () => {
    const f = await fixture(),
      r = await f.read();
    const report = r.cards.find((c) => c.source.kind === 'report')!,
      issued = r.cards.find((c) => c.source.kind === 'issued')!;
    const opened = await openDailyOperationsSource(r, report.id);
    expect(opened.authority).toBe('NAVIGATION_ONLY');
    expect(opened.target).toEqual(f.j.target);
    expect(opened.detail).toMatchObject({
      report: {
        report_id: f.j.report_id,
        published_version: f.j.published_version,
      },
      handoff: {
        job_id: f.j.target.job_id,
        location_id: f.j.target.location_id,
      },
    });
    const scope = await openDailyOperationsSource(r, issued.id);
    expect(scope.detail).toMatchObject({
      issued: { version_id: f.j.target.version_id },
      scope: {
        totals: { total_minor: f.j.issued.version.calculation.total_minor },
      },
    });
    expect(JSON.stringify(scope.detail)).not.toMatch(
      /unit_cost|internal_note|supplier|payroll|rates|deductions/,
    );
    await expect(
      openDailyOperationsSource(r, 'report:wrong:v999'),
    ).rejects.toThrow();
  });
  it('reads existing prepared Copilot metadata without replaying existing Voice/trade preparation', async () => {
    const f = await fixture();
    const review = await prepareIntelligenceWorkflow(
      f.j.estimates,
      f.j.target,
      {
        review_on: f.j.day,
        advanced: {
          transcript: 'literal unmatched human source',
          edition: 'property_services',
          catalog_item_ids: [],
          procurement: null,
        },
      },
      f.gate,
    );
    expect(review.advanced?.voice.snapshot).toBeDefined();
    const before = readIntelligenceWorkflowAttempt(
      f.j.estimates,
      f.j.target,
      f.gate,
    );
    const daily = await f.read();
    expect(daily.existing_intelligence.status).toBe('PREPARED');
    expect(
      readIntelligenceWorkflowAttempt(f.j.estimates, f.j.target, f.gate),
    ).toEqual(before);
    expect(daily.existing_intelligence.retry).toBe(false);
  });
  it('denies a changed supported Copilot status during final Daily hashing without consuming a dashboard claim', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const bytes = new TextDecoder().decode(args[1]),
        result = await digest(...args);
      if (
        !changed &&
        bytes.includes('LOCAL_SYNTHETIC_DAILY_OPERATING_REVIEW')
      ) {
        changed = true;
        await prepareIntelligenceWorkflow(
          f.j.estimates,
          f.j.target,
          { review_on: f.j.day, advanced: null },
          f.gate,
        );
      }
      return result;
    });
    await expect(f.read()).rejects.toThrow();
    expect(changed).toBe(true);
    expect(
      readIntelligenceWorkflowAttempt(f.j.estimates, f.j.target, f.gate).status,
    ).toBe('PREPARED');
  });
  it.each([
    'organization_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ] as const)('denies incorrect %s ownership', async (key) => {
    const f = await fixture();
    f.j.target[key] = crypto.randomUUID();
    await expect(f.read()).rejects.toThrow();
  });
  it.each(['foreign', 'field', 'inactive'] as const)(
    'denies %s staff',
    async (kind) => {
      const f = await fixture();
      if (kind === 'foreign')
        f.j.target.actor_id = `${sampleCompanies[1].id}-owner`;
      else if (kind === 'field')
        f.j.target.actor_id = `${f.j.company.id}-field`;
      else {
        f.j.target.actor_id = `${f.j.company.id}-estimator`;
        await f.j.operations.manageMember(
          f.j.company.id,
          f.j.target.actor_id,
          false,
          'admin',
          'office_manager',
        );
      }
      await expect(f.read()).rejects.toThrow();
    },
  );
  it('rejects OFF/unconfirmed/accessor admission before reading sources', async () => {
    const f = await fixture(),
      read = vi.spyOn(f.j.estimates, 'readSyntheticPrototypeSources');
    for (const gate of [
      { enabled: false, confirmed: true },
      { enabled: true, confirmed: false },
      {
        enabled: true,
        get confirmed(): boolean {
          throw Error('Getter executed');
        },
      },
    ])
      await expect(readDailyOperations(f.j, f.input, gate)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
  it.each(['date', 'timezone', 'coercion', 'revision'] as const)(
    'rejects malformed %s without coercion',
    async (kind) => {
      const f = await fixture(),
        coercion = vi.fn(() => f.j.day);
      if (kind === 'date') f.input.review_on = '2026-02-30';
      if (kind === 'timezone') f.input.timezone = 'not/a-zone';
      if (kind === 'coercion')
        Object.assign(f.input, { review_on: { toString: coercion } });
      if (kind === 'revision') f.input.input_revision = 1.5;
      await expect(f.read()).rejects.toThrow();
      expect(coercion).not.toHaveBeenCalled();
    },
  );
  it('rejects forged filter values and imported snapshots without executing serializers', async () => {
    const f = await fixture(),
      r = await f.read(),
      coercion = vi.fn(() => 'finance');
    expect(() =>
      filterDailyOperations(r, {
        area: { toString: coercion } as unknown as 'finance',
        level: 'all',
        query: '',
      }),
    ).toThrow();
    expect(coercion).not.toHaveBeenCalled();
    expect(() =>
      filterDailyOperations(structuredClone(r), {
        area: 'all',
        level: 'all',
        query: '',
      }),
    ).toThrow();
    expect(await inspectDailyOperations(structuredClone(r))).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
  });
  it.each(['offer_id', 'receipt_id'] as const)(
    'rejects original %s mutation at the final Daily digest',
    async (selector) => {
      const f = await fixture(),
        digest = crypto.subtle.digest.bind(crypto.subtle);
      let changed = false;
      vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
        const bytes = new TextDecoder().decode(args[1]);
        const result = await digest(...args);
        if (
          !changed &&
          bytes.includes('LOCAL_SYNTHETIC_DAILY_OPERATING_REVIEW')
        ) {
          changed = true;
          f.j[selector] = crypto.randomUUID();
        }
        return result;
      });
      await expect(f.read()).rejects.toThrow();
      expect(changed).toBe(true);
    },
  );
  it('rejects original day selection changing across an actual source hash await', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args);
      if (!changed) {
        changed = true;
        f.input.review_on = '2027-01-01';
      }
      return value;
    });
    await expect(f.read()).rejects.toThrow();
  });
  it('rejects replacing the original journey admission during final hashing', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const bytes = new TextDecoder().decode(args[1]);
      const value = await digest(...args);
      if (
        !changed &&
        bytes.includes('LOCAL_SYNTHETIC_DAILY_OPERATING_REVIEW')
      ) {
        changed = true;
        f.j.gate = { enabled: true, confirmed: true };
      }
      return value;
    });
    await expect(f.read()).rejects.toThrow();
    expect(changed).toBe(true);
  });
  it('withholds data on actual verification-time administrator revocation', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    f.j.target.actor_id = `${f.j.company.id}-estimator`;
    await f.j.operations.manageMember(
      f.j.company.id,
      f.j.target.actor_id,
      true,
      'admin',
      'office_manager',
    );
    const r = await f.read();
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args);
      await f.j.operations.manageMember(
        f.j.company.id,
        f.j.target.actor_id,
        false,
        'admin',
        'office_manager',
      );
      return value;
    });
    expect(await inspectDailyOperations(r)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(() =>
      filterDailyOperations(r, { area: 'all', level: 'all', query: '' }),
    ).toThrow();
  });
  it('retains immutable content and STALE/UNKNOWN evidence on subsequent actual visit edits or withdrawal', async () => {
    const f = await fixture(),
      r = await f.read(),
      hash = r.sha256;
    const { sha256, ...body } = r;
    expect(await documentHash(body)).toBe(sha256);
    expect(Object.isFrozen(r.cards)).toBe(true);
    const visit = f.j.property
      .read(f.j.company.id)
      .visits.find((v) => v.id === f.j.scheduled_visit_id)!;
    f.j.property.saveVisit(f.j.company.id, visit, {
      ...visit.content,
      summary: 'Separately edited actual draft visit source',
    });
    expect(await inspectDailyOperations(r)).toEqual({
      status: 'STALE',
      replacement: null,
    });
    expect(r.sha256).toBe(hash);
    await expect(openDailyOperationsSource(r, r.cards[0].id)).rejects.toThrow();
    f.gate.confirmed = false;
    expect(await inspectDailyOperations(r)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
  });
  it('defaults presentation OFF and provides actual accessible day controls without duplicate Voice forms or inherited header', async () => {
    const f = await fixture(),
      off = renderToStaticMarkup(
        createElement(DailyOperations, { sources: f.j }),
      );
    expect(off).not.toContain('<form');
    const on = renderToStaticMarkup(
      createElement(DailyOperations, { sources: f.j, enabled: true }),
    );
    expect(on).toContain('aria-label="Daily operating priorities"');
    expect(on).toContain('aria-label="Daily review context"');
    expect(on).toContain('Review daily priorities');
    expect(on).not.toContain('<header');
    expect(on).not.toContain('transcript');
    expect(on).not.toMatch(/unit_cost|payroll|supplier|rates|deductions/);
  });
});
