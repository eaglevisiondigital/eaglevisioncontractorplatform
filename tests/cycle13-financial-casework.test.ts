import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { verifyLedger } from '../src/domain/release/types';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  financialCaseworkEnabled,
  readFinancialCasework,
  filterFinancialCasework,
  openFinancialCaseworkJob,
  assertFinancialCaseworkCurrent,
  compareFinancialCaseworkReview,
  type FinancialCaseworkFilter,
} from '../src/lib/workflows/financial-casework';
import {
  prepareFinancialEvidenceReview,
  reconcileFinancialEvidenceReview,
} from '../src/lib/workflows/financial-evidence-review';
import {
  readFinancialCorrectionSources,
  openFinancialCorrectionException,
  prepareFinancialCorrection,
} from '../src/lib/workflows/financial-correction-review';
import { FinancialCasework } from '../src/components/workflows/FinancialCasework';

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
const clear: FinancialCaseworkFilter = { query: '', kind: 'all', job_id: null };
async function fixture(index = 0, financial = false, known = false) {
  const gate = { enabled: true, confirmed: true };
  const sources = await prepareOperatingSources(sampleCompanies[index], gate);
  const entry = sources.entries[0],
    preview = entry.release;
  if (known)
    await sources.estimates.payroll(
      sources.company.id,
      '2026-01-01T00:00:00Z',
      '2026-01-02T00:00:00Z',
      {},
      true,
    );
  // Actual existing-engine commands only in explicitly selected TEST fixtures.
  // The browser fixture and the casework reader never create financial events.
  if (financial) {
    await preview.command('staff', 'create_contract', {
      offer_id: entry.offer_id,
      terms: 'Explicit synthetic TEST fixture',
      legal_reference: 'No genuine legal approval',
    });
    const contract = preview.read('staff').release_contracts[0];
    await preview.command('customer', 'sign_contract', {
      contract_id: contract.id,
      document_hash: contract.document_hash,
      typed_name: 'Synthetic Fixture',
      consent: true,
    });
    await preview.command('staff', 'create_invoice', {
      contract_id: contract.id,
    });
    const invoice = preview.read('staff').release_invoices[0],
      amount = invoice.snapshot.schedule[0].amount_minor;
    await preview.command('customer', 'authorize_payment', {
      invoice_id: invoice.id,
      amount_minor: amount,
      consent: true,
    });
    const authorization = preview.read('staff').release_authorizations[0];
    await preview.command('staff', 'synthetic_capture', {
      invoice_id: invoice.id,
      authorization_id: authorization.id,
      amount_minor: amount,
      idempotency_key: crypto.randomUUID(),
      adjusts_event_id: null,
    });
    const event = preview.read('staff').release_payment_events[0];
    await preview.command('staff', 'synthetic_refund', {
      invoice_id: invoice.id,
      authorization_id: authorization.id,
      amount_minor: Math.max(1, Math.floor(amount / 2)),
      idempotency_key: crypto.randomUUID(),
      adjusts_event_id: event.id,
    });
  }
  const input = { as_of: new Date().toISOString(), input_revision: 1 };
  return {
    sources,
    gate,
    entry,
    preview,
    input,
    read: () => readFinancialCasework(sources, input, gate),
  };
}
async function loaded(index = 0, financial = false, known = false) {
  const f = await fixture(index, financial, known),
    review = await f.read(),
    detail = openFinancialCaseworkJob(review, f.entry.target.job_id!);
  const proposal = {
    remaining: {
      ...detail.evidence.correction.before.remaining,
      other: detail.evidence.correction.before.remaining.other + 1200,
    },
    reason: 'Review the exact saved forecast and its missing evidence.',
    confirmed: true as const,
    excludes_unpaid_commitments: true as const,
    source_sha256: detail.evidence.correction.source_sha256,
    input_revision: 2,
  };
  return {
    ...f,
    review,
    detail,
    proposal,
    prepare: () => prepareFinancialEvidenceReview(detail.evidence, proposal),
  };
}
function snapshot(s: Awaited<ReturnType<typeof fixture>>['sources']) {
  return JSON.stringify(
    s.entries.map((e) => ({
      source: s.estimates.readSyntheticPrototypeSources(e.target),
      release: e.release.read('staff'),
    })),
  );
}
function atHash(marker: string, change: () => void | Promise<void>) {
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
async function saveSource(f: Awaited<ReturnType<typeof fixture>>) {
  const raw = f.sources.estimates.readSyntheticPrototypeSources(
    f.entry.target,
  ).job!;
  await f.sources.estimates.projection(f.sources.company.id, raw, {
    ...raw.projection,
    remaining: {
      ...raw.projection.remaining,
      other: raw.projection.remaining.other + 1,
    },
  });
}

describe('Cycle13 financial casework: canonical composition, no financial authority', () => {
  it.each([0, 1, 2])(
    'company %i groups the genuinely empty canonical source into useful unresolved job cases',
    async (index) => {
      const f = await fixture(index),
        before = snapshot(f.sources);
      const writers = [
        vi.spyOn(f.sources.estimates, 'projection'),
        vi.spyOn(f.sources.estimates, 'submitExpense'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.estimates, 'payroll'),
        ...f.sources.entries.map((e) => vi.spyOn(e.release, 'command')),
      ];
      const review = await f.read(),
        detail = openFinancialCaseworkJob(review, f.entry.target.job_id!);
      expect(review.jobs).toHaveLength(4);
      expect(
        review.jobs.every((j) => j.requirements[0].kind === 'coverage'),
      ).toBe(true);
      expect(detail.job.financial.invoices).toEqual([]);
      expect(detail.job.financial.coverage).toBe('UNVERIFIED');
      expect(detail.job.facts.costs).toBeNull();
      expect(detail.job.facts.margin).toBeNull();
      expect(detail.job.invoice.overall).toBe('NO_GO');
      expect(
        detail.job.invoice.requirements.find((r) => r.id === 'CONTRACT')
          ?.status,
      ).toBe('UNKNOWN');
      expect(detail.job.requirements.map((r) => r.kind)).toEqual([
        'coverage',
        'canonical_evidence',
        'invoice_readiness',
      ]);
      expect(
        detail.job.requirements.every((r) => r.suggested_review.length > 20),
      ).toBe(true);
      expect(detail.job.source.expense_ids).toEqual(
        f.sources.estimates
          .readSyntheticPrototypeSources(f.entry.target)
          .job!.expenses.map((e) => e.id),
      );
      expect(detail.job.source.cost_review_event_ids).toEqual(
        f.sources.estimates
          .readSyntheticPrototypeSources(f.entry.target)
          .job!.events.map((e) => e.id),
      );
      expect(compareFinancialCaseworkReview(detail)).toEqual({
        status: 'CURRENT_REVIEWED_SOURCE',
        requires_current_read: false,
        changes: [],
        replacement: null,
      });
      expect(Object.values(review.authority).every((v) => v === false)).toBe(
        true,
      );
      expect(JSON.stringify(detail)).not.toMatch(
        /unit_cost_minor|internal_notes|cash_minor|burden_minor|Synthetic planning supplier|5550100100|@example|PRIVATE staff/,
      );
      expect(Object.isFrozen(detail.job.requirements)).toBe(true);
      expect(snapshot(f.sources)).toBe(before);
      writers.forEach((w) => expect(w).not.toHaveBeenCalled());
    },
  );

  it.each([0, 1, 2])(
    'company %i retains canonical known costs and actual event/ledger/issued/job proof without making invoices ready',
    async (index) => {
      const f = await loaded(index, true, true),
        before = snapshot(f.sources),
        j = f.detail.job,
        workspace = f.preview.read('staff'),
        invoice = workspace.release_invoices[0],
        evidence = j.financial.invoices[0];
      expect(j.facts.costs?.unpaidCommitmentMinor).toBe(12500);
      expect(j.facts.costs).toEqual(f.detail.evidence.correction.before.costs);
      expect(evidence.linkage).toBe('LINKED');
      expect(evidence.verification).toBe('RECONCILED_SYNTHETIC_ONLY');
      expect(evidence.summary?.balance_minor).toBe(
        String(
          verifyLedger(
            invoice,
            workspace.release_ledger_entries,
            workspace.release_payment_events,
          ),
        ),
      );
      expect(evidence.events.map((e) => e.id).sort()).toEqual(
        workspace.release_payment_events.map((e) => e.id).sort(),
      );
      expect(evidence.ledger.map((e) => e.id).sort()).toEqual(
        workspace.release_ledger_entries.map((e) => e.id).sort(),
      );
      expect(evidence.offer_id).toBe(f.entry.offer_id);
      expect(evidence.issued_version_id).toBe(f.entry.target.version_id);
      expect(j.source.original_receipt_id).toBe(f.entry.receipt_id);
      expect(j.invoice.overall).toBe('NO_GO');
      // The original readiness workflow intentionally lacks a selected invoice. This
      // canonical evidence panel cannot silently promote it from source resemblance.
      expect(j.invoice.reference.invoice_id).toBeNull();
      expect(j.financial.provider).toEqual({
        genuine_authentication: 'UNVERIFIED',
        void: 'UNKNOWN',
        settlement: 'UNKNOWN',
      });
      const sameProperty = f.review.jobs.find(
        (r) => r.target.job_id === f.sources.entries[3].target.job_id,
      )!;
      expect(sameProperty.target.location_id).toBe(j.target.location_id);
      expect(sameProperty.financial.invoices).toEqual([]);
      expect(snapshot(f.sources)).toBe(before);
    },
  );

  it('filters literal text, exact cost/event/posting identities and requirement kind with truthful job counts', async () => {
    const f = await loaded(0, true),
      jobId = f.entry.target.job_id!;
    expect(filterFinancialCasework(f.review, clear)).toMatchObject({
      matching: 4,
      available: 4,
    });
    for (const query of [
      jobId,
      f.entry.target.version_id,
      f.detail.job.source.expense_ids[0],
      f.detail.job.source.cost_review_event_ids[0],
      f.detail.job.financial.invoices[0].events[0].id,
      f.detail.job.financial.invoices[0].ledger[0].id,
    ]) {
      expect(
        filterFinancialCasework(f.review, { ...clear, query }).jobs.map(
          (j) => j.target.job_id,
        ),
      ).toEqual([jobId]);
    }
    expect(
      filterFinancialCasework(f.review, { ...clear, query: ' [.*] ' }),
    ).toMatchObject({ matching: 0, available: 4 });
    expect(
      filterFinancialCasework(f.review, {
        ...clear,
        kind: 'canonical_evidence',
      }).matching,
    ).toBe(3);
    expect(
      filterFinancialCasework(f.review, {
        ...clear,
        kind: 'invoice_readiness',
        job_id: jobId,
      }).matching,
    ).toBe(1);
    expect(
      filterFinancialCasework(f.review, { ...clear, kind: 'margin' }).matching,
    ).toBe(0);
  });

  it.each(['job', 'kind', 'query', 'accessor'] as const)(
    'rejects malformed or unauthorized %s filters before coercion',
    async (kind) => {
      const f = await loaded(),
        getter = vi.fn(() => 'coverage'),
        filter = { ...clear };
      if (kind === 'job') filter.job_id = crypto.randomUUID();
      if (kind === 'kind')
        filter.kind = 'unknown' as FinancialCaseworkFilter['kind'];
      if (kind === 'query') filter.query = 'x'.repeat(201);
      if (kind === 'accessor')
        Object.defineProperty(filter, 'kind', { get: getter });
      expect(() => filterFinancialCasework(f.review, filter)).toThrow();
      expect(getter).not.toHaveBeenCalled();
    },
  );

  it('rejects copied reviews/details and unknown jobs without a fallback or replacement', async () => {
    const f = await loaded();
    expect(() =>
      openFinancialCaseworkJob(
        structuredClone(f.review),
        f.entry.target.job_id!,
      ),
    ).toThrow();
    expect(() =>
      assertFinancialCaseworkCurrent(structuredClone(f.detail)),
    ).toThrow();
    expect(
      compareFinancialCaseworkReview(structuredClone(f.detail)),
    ).toMatchObject({ status: 'UNKNOWN', replacement: null });
    expect(() =>
      openFinancialCaseworkJob(f.review, crypto.randomUUID()),
    ).toThrow();
  });

  it('flags a later saved revision, preserves prior review bytes and requires an explicit new current read', async () => {
    const f = await loaded(),
      frozen = JSON.stringify(f.detail);
    await saveSource(f);
    expect(compareFinancialCaseworkReview(f.detail)).toMatchObject({
      status: 'UNKNOWN',
      requires_current_read: true,
      replacement: null,
    });
    expect(() => filterFinancialCasework(f.review, clear)).toThrow();
    const fresh = await f.read(),
      compared = compareFinancialCaseworkReview(f.detail, fresh);
    expect(compared.status).toBe('SOURCE_CHANGED');
    expect(compared.changes).toContain('source');
    expect(compared.changes).toContain('facts');
    expect(compared.replacement).toBeNull();
    expect(compared.requires_current_read).toBe(false);
    const current = openFinancialCaseworkJob(fresh, f.entry.target.job_id!);
    expect(current.job.source.job_revision).toBe(
      f.detail.job.source.job_revision + 1,
    );
    expect(compareFinancialCaseworkReview(current).status).toBe(
      'CURRENT_REVIEWED_SOURCE',
    );
    expect(() => assertFinancialCaseworkCurrent(f.detail)).toThrow();
    expect(JSON.stringify(f.detail)).toBe(frozen);
  });

  it('a fresh equal read does not restore a permanently UNKNOWN retained review or confer correction authority', async () => {
    const f = await loaded();
    f.gate.confirmed = false;
    expect(compareFinancialCaseworkReview(f.detail).status).toBe('UNKNOWN');
    f.gate.confirmed = true;
    const fresh = await f.read();
    expect(compareFinancialCaseworkReview(f.detail, fresh)).toMatchObject({
      status: 'UNKNOWN',
      requires_current_read: true,
      changes: [],
      replacement: null,
    });
    expect(() => assertFinancialCaseworkCurrent(f.review)).toThrow();
  });

  it.each(['missing-contract', 'missing-property', 'unlinked-offer'] as const)(
    'keeps %s source UNLINKED/UNKNOWN and searchable without a guessed invoice-job foreign key',
    async (kind) => {
      const f = await fixture(0, true),
        bad = f.preview.read('staff');
      if (kind === 'missing-contract') bad.release_contracts = [];
      if (kind === 'missing-property') {
        bad.release_invoices[0].snapshot = structuredClone(
          bad.release_invoices[0].snapshot,
        );
        bad.release_invoices[0].snapshot.location = null;
      }
      if (kind === 'unlinked-offer')
        bad.release_contracts[0].offer_id = crypto.randomUUID();
      vi.spyOn(f.preview, 'read').mockImplementation((actor) => ({
        ...structuredClone(bad),
        actor,
      }));
      const review = await f.read(),
        job = openFinancialCaseworkJob(review, f.entry.target.job_id!).job;
      expect(job.financial.invoices[0].linkage).toBe('UNLINKED');
      expect(job.financial.invoices[0].summary).toBeNull();
      expect(job.financial.unlinked_events).toHaveLength(2);
      expect(job.financial.coverage).toBe('UNVERIFIED');
      expect(
        filterFinancialCasework(review, {
          ...clear,
          query: job.financial.unlinked_events[0].id,
        }).matching,
      ).toBe(1);
    },
  );

  it.each(['event-org', 'ledger-customer', 'invoice-property'] as const)(
    'denies foreign %s evidence',
    async (kind) => {
      const f = await fixture(0, true),
        bad = f.preview.read('staff');
      if (kind === 'event-org')
        bad.release_payment_events[0].organization_id = sampleCompanies[1].id;
      if (kind === 'ledger-customer')
        bad.release_ledger_entries[0].customer_id = crypto.randomUUID();
      if (kind === 'invoice-property')
        bad.release_invoices[0].snapshot.location!.id =
          f.sources.entries[1].target.location_id;
      vi.spyOn(f.preview, 'read').mockImplementation((actor) => ({
        ...structuredClone(bad),
        actor,
      }));
      await expect(f.read()).rejects.toThrow();
    },
  );

  it.each(['gate', 'input', 'root', 'model', 'role', 'source'] as const)(
    'fences %s drift across the last canonical evidence await',
    async (kind) => {
      const f = await fixture();
      const fired = atHash(
        '"mode":"LOCAL_CANONICAL_FINANCIAL_EVIDENCE"',
        async () => {
          if (kind === 'gate') f.gate.confirmed = false;
          if (kind === 'input') f.input.input_revision++;
          if (kind === 'root') f.sources.entries = [...f.sources.entries];
          if (kind === 'model') f.entry.release = f.sources.entries[1].release;
          if (kind === 'source') await saveSource(f);
          if (kind === 'role') {
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
        },
      );
      await expect(f.read()).rejects.toThrow();
      expect(fired()).toBe(true);
    },
  );

  it('current role revocation withholds filters, source detail, comparison and navigation evidence during render', async () => {
    const f = await loaded(),
      members = f.sources.operations.syntheticMemberships.bind(
        f.sources.operations,
      );
    vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
      (org) => members(org).map((m) => ({ ...m, active: false })),
    );
    expect(() => assertFinancialCaseworkCurrent(f.detail)).toThrow();
    expect(() => filterFinancialCasework(f.review, clear)).toThrow();
    expect(() =>
      openFinancialCaseworkJob(f.review, f.entry.target.job_id!),
    ).toThrow();
    expect(compareFinancialCaseworkReview(f.detail).status).toBe('UNKNOWN');
    const markup = renderToStaticMarkup(
      createElement(FinancialCasework, { sources: f.sources, enabled: true }),
    );
    expect(markup).toContain('unavailable');
    expect(markup).not.toContain('<input');
  });

  it('uses the original C12/C11 hold for concurrent and alternate-view correction attempts', async () => {
    const f = await loaded(),
      results = await Promise.allSettled([f.prepare(), f.prepare()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const fresh = await f.read(),
      other = openFinancialCaseworkJob(fresh, f.entry.target.job_id!);
    await expect(
      prepareFinancialEvidenceReview(other.evidence, {
        ...f.proposal,
        reason: 'An alternate casework note',
        source_sha256: other.evidence.correction.source_sha256,
      }),
    ).rejects.toThrow('already held');
    const original = await readFinancialCorrectionSources(
        f.sources,
        f.input,
        f.gate,
      ),
      direct = openFinancialCorrectionException(
        original,
        other.job.original_exception_ids[0],
      );
    await expect(
      prepareFinancialCorrection(direct, {
        ...f.proposal,
        source_sha256: direct.source_sha256,
      }),
    ).rejects.toThrow('already held');
  });

  it('lost correction acknowledgment remains held after a new casework source read; no replay or replacement', async () => {
    const f = await loaded(),
      fired = atHash('"mode":"IMMUTABLE_CANONICAL_FINANCIAL_REVIEW"', () => {
        f.proposal.remaining.other++;
      });
    await expect(f.prepare()).rejects.toThrow();
    expect(fired()).toBe(true);
    vi.restoreAllMocks();
    f.proposal.remaining.other--;
    const fresh = await f.read(),
      detail = openFinancialCaseworkJob(fresh, f.entry.target.job_id!);
    await expect(
      prepareFinancialEvidenceReview(detail.evidence, {
        ...f.proposal,
        source_sha256: detail.evidence.correction.source_sha256,
      }),
    ).rejects.toThrow('already held');
  });

  it('exact existing C12 packet reconciliation stays read-only and permanently UNKNOWN after saved-source CAS drift', async () => {
    const f = await loaded(),
      before = snapshot(f.sources),
      packet = await f.prepare();
    expect(snapshot(f.sources)).toBe(before);
    expect(await reconcileFinancialEvidenceReview(packet)).toMatchObject({
      status: 'CURRENT_UNSAVED_REVIEW_ONLY',
      replacement: null,
    });
    await saveSource(f);
    expect(await reconcileFinancialEvidenceReview(packet)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(
      await reconcileFinancialEvidenceReview(structuredClone(packet)),
    ).toEqual({ status: 'UNKNOWN', replacement: null });
    expect(packet.canonical_before).toEqual(packet.canonical_after);
    expect(Object.values(packet.authority).every((v) => v === false)).toBe(
      true,
    );
  });

  it.each(['off', 'production', 'remote', 'https'] as const)(
    '%s admission precedes source/input getters and toJSON in reader and UI',
    async (mode) => {
      const getter = vi.fn(() => {
          throw Error('Must not read');
        }),
        poison = {};
      Object.defineProperties(poison, {
        company: { get: getter, enumerable: true },
        toJSON: { value: getter, enumerable: true },
      });
      const source = poison as Parameters<typeof readFinancialCasework>[0],
        input = poison as Parameters<typeof readFinancialCasework>[1];
      if (mode === 'production') vi.stubEnv('DEV', false);
      if (mode === 'remote')
        vi.stubGlobal('window', {
          location: { hostname: 'example.com', protocol: 'http:' },
        });
      if (mode === 'https')
        vi.stubGlobal('window', {
          location: { hostname: 'localhost', protocol: 'https:' },
        });
      await expect(
        mode === 'off'
          ? readFinancialCasework(source, input)
          : readFinancialCasework(source, input, {
              enabled: true,
              confirmed: true,
            }),
      ).rejects.toThrow();
      const markup = renderToStaticMarkup(
        createElement(FinancialCasework, {
          sources: source,
          enabled: mode !== 'off',
        }),
      );
      expect(markup).not.toContain('<input');
      expect(getter).not.toHaveBeenCalled();
      expect(financialCaseworkEnabled(mode !== 'off')).toBe(false);
    },
  );

  it.each([0, 1, 2])(
    'company %i initial UI names the source review and stays empty until explicit staff selection',
    async (index) => {
      const f = await fixture(index),
        markup = renderToStaticMarkup(
          createElement(FinancialCasework, {
            sources: f.sources,
            enabled: true,
          }),
        );
      expect(markup).toContain('Financial casework desk');
      expect(markup).toContain(sampleCompanies[index].name);
      expect(markup).toContain('Load financial casework');
      expect(markup).toContain('disabled=""');
      expect(markup).not.toContain('Canonical financial evidence review');
      expect(markup).not.toContain('Open exact source job');
      expect(markup).not.toMatch(/unit_cost_minor|PRIVATE staff|@example/);
    },
  );
});
