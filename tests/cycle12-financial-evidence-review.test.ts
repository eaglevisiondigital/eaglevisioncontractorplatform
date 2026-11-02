import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { documentHash } from '../src/domain/release/preview';
import { verifyLedger } from '../src/domain/release/types';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  openFinancialCorrectionException,
  prepareFinancialCorrection,
} from '../src/lib/workflows/financial-correction-review';
import {
  financialEvidenceEnabled,
  readFinancialEvidenceSources,
  openFinancialEvidenceSource,
  prepareFinancialEvidenceReview,
  reconcileFinancialEvidenceReview,
  assertFinancialEvidenceCurrent,
} from '../src/lib/workflows/financial-evidence-review';
import {
  FinancialEvidenceReview,
  FinancialEvidenceSourceButton,
} from '../src/components/workflows/FinancialEvidenceReview';

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
/** Actual existing canonical synthetic engine commands, never UI-generated financial states. */
async function fixture(index = 0, financial = false) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[index], gate),
    entry = sources.entries[0],
    preview = entry.release;
  if (financial) {
    await preview.command('staff', 'create_contract', {
      offer_id: entry.offer_id,
      terms: 'Explicit synthetic fixture only',
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
    const auth = preview.read('staff').release_authorizations[0];
    await preview.command('staff', 'synthetic_capture', {
      invoice_id: invoice.id,
      authorization_id: auth.id,
      amount_minor: amount,
      idempotency_key: crypto.randomUUID(),
      adjusts_event_id: null,
    });
    const event = preview.read('staff').release_payment_events[0];
    await preview.command('staff', 'synthetic_refund', {
      invoice_id: invoice.id,
      authorization_id: auth.id,
      amount_minor: Math.max(1, Math.floor(amount / 2)),
      idempotency_key: crypto.randomUUID(),
      adjusts_event_id: event.id,
    });
  }
  const input = { as_of: new Date().toISOString(), input_revision: 1 };
  return { sources, gate, entry, preview, input };
}
async function loaded(index = 0, financial = false) {
  const f = await fixture(index, financial),
    review = await readFinancialEvidenceSources(f.sources, f.input, f.gate),
    detail = openFinancialEvidenceSource(
      review,
      review.correction.baseline.queue.find(
        (q) => q.job_id === f.entry.target.job_id,
      )!.id,
    ),
    proposal = {
      remaining: {
        ...detail.correction.before.remaining,
        other: detail.correction.before.remaining.other + 1200,
      },
      reason: 'Explicit staff forecast review only',
      confirmed: true as const,
      excludes_unpaid_commitments: true as const,
      source_sha256: detail.correction.source_sha256,
      input_revision: 2,
    };
  return {
    ...f,
    review,
    detail,
    proposal,
    prepare: () => prepareFinancialEvidenceReview(detail, proposal),
  };
}
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
const snapshot = (f: Awaited<ReturnType<typeof fixture>>) =>
  JSON.stringify(
    f.sources.entries.map((e) => ({
      source: f.sources.estimates.readSyntheticPrototypeSources(e.target),
      release: e.release.read('staff'),
    })),
  );

describe('Cycle12 canonical financial evidence, exact-source read-only staff review', () => {
  it.each([0, 1, 2])(
    'company %i preserves genuinely empty evidence and missing money as UNKNOWN',
    async (index) => {
      const f = await loaded(index),
        before = snapshot(f);
      const packet = await f.prepare();
      expect(packet.canonical_before.invoices).toEqual([]);
      expect(packet.canonical_before.coverage).toBe('UNVERIFIED');
      expect(packet.canonical_before.provider.settlement).toBe('UNKNOWN');
      expect(packet.canonical_before.missing_evidence.join(' ')).toContain(
        'Absence is not zero',
      );
      expect(packet.correction.before.costs).toBeNull();
      expect(packet.correction.after.costs).toBeNull();
      expect(
        packet.correction.comparison.cost_to_complete_delta_minor,
      ).toBeNull();
      expect(packet.canonical_after).toEqual(packet.canonical_before);
      expect(Object.values(packet.authority).every((v) => v === false)).toBe(
        true,
      );
      expect(Object.isFrozen(packet.canonical_before.missing_evidence)).toBe(
        true,
      );
      const { id, sha256, ...body } = packet;
      expect(await documentHash(body)).toBe(sha256);
      expect(id).toBe(`financial-evidence:${sha256}`);
      expect(await reconcileFinancialEvidenceReview(packet)).toEqual({
        status: 'CURRENT_UNSAVED_REVIEW_ONLY',
        replacement: null,
      });
      expect(snapshot(f)).toBe(before);
    },
  );
  it.each([0, 1, 2])(
    'company %i verifies actual synthetic canonical event/posting/issued/job provenance without writes',
    async (index) => {
      const f = await loaded(index, true),
        before = snapshot(f),
        commands = f.sources.entries.map((e) => vi.spyOn(e.release, 'command')),
        writers = [
          vi.spyOn(f.sources.estimates, 'projection'),
          vi.spyOn(f.sources.estimates, 'submitExpense'),
          vi.spyOn(f.sources.estimates, 'payroll'),
          vi.spyOn(f.sources.estimates, 'recordTime'),
        ],
        workspace = f.preview.read('staff'),
        invoice = workspace.release_invoices[0],
        evidence = f.detail.evidence.invoices[0];
      expect(evidence.linkage).toBe('LINKED');
      expect(evidence.verification).toBe('RECONCILED_SYNTHETIC_ONLY');
      expect(evidence.issued_version_id).toBe(f.entry.target.version_id);
      expect(evidence.offer_id).toBe(f.entry.offer_id);
      expect(evidence.summary!.balance_minor).toBe(
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
      expect(evidence.events.map((e) => e.kind).sort()).toEqual([
        'synthetic_capture',
        'synthetic_refund',
      ]);
      const packet = await f.prepare();
      expect(packet.canonical_before).toEqual(packet.canonical_after);
      expect(packet.correction.after.invoice_status).toBe('NO_GO');
      expect(packet.canonical_after.provider).toEqual({
        genuine_authentication: 'UNVERIFIED',
        void: 'UNKNOWN',
        settlement: 'UNKNOWN',
      });
      expect(JSON.stringify(packet)).not.toMatch(
        /unit_cost_minor|internal_notes|cash_minor|burden_minor|Synthetic planning supplier|5550100100|@example/,
      );
      expect(snapshot(f)).toBe(before);
      [...commands, ...writers].forEach((w) =>
        expect(w).not.toHaveBeenCalled(),
      );
      const samePropertyJob = f.review.jobs.find(
        (j) => j.target.job_id === f.sources.entries[3].target.job_id,
      )!;
      expect(samePropertyJob.target.location_id).toBe(
        f.entry.target.location_id,
      );
      expect(samePropertyJob.invoices).toEqual([]);
    },
  );
  it.each([
    'event-reference',
    'amount',
    'missing-posting',
    'duplicate-event',
    'refund-provenance',
  ] as const)(
    'never reports numerically misleading %s as verified',
    async (kind) => {
      const f = await fixture(0, true),
        original = f.preview.read.bind(f.preview);
      vi.spyOn(f.preview, 'read').mockImplementation((actor) => {
        const w = original(actor);
        if (kind === 'event-reference')
          w.release_ledger_entries.find((r) => r.event_id)!.event_id =
            crypto.randomUUID();
        if (kind === 'amount')
          w.release_ledger_entries.find((r) => r.event_id)!.amount_minor++;
        if (kind === 'missing-posting')
          w.release_ledger_entries = w.release_ledger_entries.filter(
            (r) => !r.event_id,
          );
        if (kind === 'duplicate-event')
          w.release_payment_events.push(w.release_payment_events[0]);
        if (kind === 'refund-provenance')
          w.release_payment_events.find(
            (e) => e.kind === 'synthetic_refund',
          )!.adjusts_event_id = crypto.randomUUID();
        return w;
      });
      // Stable corrupted snapshots test verifier behavior, rather than source-drift rejection alone.
      if (kind === 'event-reference' || kind === 'refund-provenance') {
        const bad = f.preview.read('staff');
        vi.mocked(f.preview.read).mockImplementation((actor) => ({
          ...structuredClone(bad),
          actor,
        }));
      }
      if (kind === 'duplicate-event')
        await expect(
          readFinancialEvidenceSources(f.sources, f.input, f.gate),
        ).rejects.toThrow();
      else {
        const review = await readFinancialEvidenceSources(
            f.sources,
            f.input,
            f.gate,
          ),
          e = review.jobs[0].invoices[0];
        expect(e.verification).toBe('UNRECONCILED');
        expect(e.summary).toBeNull();
      }
    },
  );
  it.each([
    'missing-contract',
    'wrong-issued-version',
    'missing-offer',
    'missing-property',
  ] as const)(
    'retains %s as UNLINKED/UNKNOWN without a prose-based join',
    async (kind) => {
      const f = await fixture(0, true),
        original = f.preview.read.bind(f.preview),
        bad = original('staff');
      if (kind === 'missing-contract') bad.release_contracts = [];
      if (kind === 'wrong-issued-version')
        bad.release_offers[0].version_id =
          f.sources.entries[3].target.version_id;
      if (kind === 'missing-offer')
        bad.release_contracts[0].offer_id = crypto.randomUUID();
      if (kind === 'missing-property') {
        bad.release_invoices[0].snapshot = structuredClone(
          bad.release_invoices[0].snapshot,
        );
        bad.release_invoices[0].snapshot.location = null;
      }
      vi.spyOn(f.preview, 'read').mockImplementation((actor) => ({
        ...structuredClone(bad),
        actor,
      }));
      if (kind === 'wrong-issued-version')
        await expect(
          readFinancialEvidenceSources(f.sources, f.input, f.gate),
        ).rejects.toThrow();
      else {
        const review = await readFinancialEvidenceSources(
            f.sources,
            f.input,
            f.gate,
          ),
          e = review.jobs[0];
        expect(e.invoices[0].linkage).toBe('UNLINKED');
        expect(e.invoices[0].summary).toBeNull();
        expect(e.invoices[0].invoice).toBeNull();
        expect(e.unlinked_events).toHaveLength(2);
        expect(e.coverage).toBe('UNVERIFIED');
      }
    },
  );
  it('never infers zero payment or a balance from an invoice with absent event coverage', async () => {
    const f = await fixture(0, true),
      bad = f.preview.read('staff');
    bad.release_payment_events = [];
    bad.release_ledger_entries = bad.release_ledger_entries.filter(
      (e) => e.event_id === null,
    );
    vi.spyOn(f.preview, 'read').mockImplementation((actor) => ({
      ...structuredClone(bad),
      actor,
    }));
    const review = await readFinancialEvidenceSources(
        f.sources,
        f.input,
        f.gate,
      ),
      e = review.jobs[0].invoices[0];
    expect(e.linkage).toBe('LINKED');
    expect(e.verification).toBe('UNVERIFIED');
    expect(e.invoice).not.toBeNull();
    expect(e.summary).toBeNull();
    expect(e.missing_evidence.join(' ')).toContain('balance remain UNKNOWN');
  });
  it.each(['authorization', 'refund-kind'] as const)(
    'keeps absent %s coverage UNKNOWN instead of inventing payment states or zero amounts',
    async (kind) => {
      const f = await fixture(0, true),
        bad = f.preview.read('staff');
      if (kind === 'authorization') bad.release_authorizations = [];
      else {
        const refund = bad.release_payment_events.find(
          (e) => e.kind === 'synthetic_refund',
        )!;
        bad.release_payment_events = bad.release_payment_events.filter(
          (e) => e.id !== refund.id,
        );
        bad.release_ledger_entries = bad.release_ledger_entries.filter(
          (e) => e.event_id !== refund.id,
        );
      }
      vi.spyOn(f.preview, 'read').mockImplementation((actor) => ({
        ...structuredClone(bad),
        actor,
      }));
      const review = await readFinancialEvidenceSources(
          f.sources,
          f.input,
          f.gate,
        ),
        e = review.jobs[0].invoices[0];
      if (kind === 'authorization') {
        expect(e.verification).toBe('UNVERIFIED');
        expect(e.summary).toBeNull();
      } else {
        expect(e.verification).toBe('RECONCILED_SYNTHETIC_ONLY');
        expect(e.summary!.refunded_minor).toBeNull();
      }
    },
  );
  it('rejects nested canonical event accessors before execution or rendering', async () => {
    const f = await fixture(0, true),
      bad = f.preview.read('staff'),
      getter = vi.fn(() => 0);
    Object.defineProperty(bad.release_payment_events[0], 'amount_minor', {
      get: getter,
      enumerable: true,
    });
    vi.spyOn(f.preview, 'read').mockImplementation((actor) => ({
      ...bad,
      actor,
    }));
    await expect(
      readFinancialEvidenceSources(f.sources, f.input, f.gate),
    ).rejects.toThrow();
    const markup = renderToStaticMarkup(
      createElement(FinancialEvidenceReview, {
        sources: f.sources,
        enabled: true,
      }),
    );
    expect(markup).toContain('evidence is unavailable');
    expect(markup).not.toContain('<form');
    expect(getter).not.toHaveBeenCalled();
  });
  it.each(['event', 'ledger', 'invoice-property', 'invoice-customer'] as const)(
    'denies foreign %s evidence',
    async (kind) => {
      const f = await fixture(0, true),
        bad = f.preview.read('staff');
      if (kind === 'event')
        bad.release_payment_events[0].organization_id = sampleCompanies[1].id;
      if (kind === 'ledger')
        bad.release_ledger_entries[0].customer_id = crypto.randomUUID();
      if (kind === 'invoice-property')
        bad.release_invoices[0].snapshot.location!.id =
          f.sources.entries[1].target.location_id;
      if (kind === 'invoice-customer')
        bad.release_invoices[0].customer_id =
          f.sources.entries[1].target.customer_id;
      vi.spyOn(f.preview, 'read').mockImplementation((actor) => ({
        ...structuredClone(bad),
        actor,
      }));
      await expect(
        readFinancialEvidenceSources(f.sources, f.input, f.gate),
      ).rejects.toThrow();
    },
  );
  it('requires exact retained reviews/details/packets and current original handle identities', async () => {
    const f = await loaded();
    expect(() =>
      openFinancialEvidenceSource(
        structuredClone(f.review),
        f.detail.correction.exception.id,
      ),
    ).toThrow();
    await expect(
      prepareFinancialEvidenceReview(structuredClone(f.detail), f.proposal),
    ).rejects.toThrow();
    expect(() => openFinancialEvidenceSource(f.review, 'unknown')).toThrow();
    const p = await f.prepare();
    expect(
      (await reconcileFinancialEvidenceReview(structuredClone(p))).status,
    ).toBe('UNKNOWN');
    f.sources.entries = [...f.sources.entries];
    expect(() => assertFinancialEvidenceCurrent(p)).toThrow();
    expect((await reconcileFinancialEvidenceReview(p)).status).toBe('UNKNOWN');
  });
  it('delegates concurrent, alternate-note and fresh-view preparation to the unchanged C11 one-use hold', async () => {
    const f = await loaded(),
      results = await Promise.allSettled([f.prepare(), f.prepare()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const fresh = await readFinancialEvidenceSources(
        { ...f.sources },
        { ...f.input },
        f.gate,
      ),
      d = openFinancialEvidenceSource(fresh, f.detail.correction.exception.id);
    await expect(
      prepareFinancialEvidenceReview(d, {
        ...f.proposal,
        reason: 'Alternate note',
        source_sha256: d.correction.source_sha256,
      }),
    ).rejects.toThrow('already held');
    const underlying = openFinancialCorrectionException(
      fresh.correction,
      d.correction.exception.id,
    );
    await expect(
      prepareFinancialCorrection(underlying, {
        ...f.proposal,
        source_sha256: underlying.source_sha256,
      }),
    ).rejects.toThrow('already held');
  });
  it.each([
    'gate',
    'proposal',
    'input-identity',
    'root',
    'model',
    'event-snapshot',
    'role',
  ] as const)(
    'blocks %s changes at the final wrapper hash and keeps UNKNOWN permanently',
    async (kind) => {
      const f = await loaded(0, true),
        fired = digestChange(
          '"mode":"IMMUTABLE_CANONICAL_FINANCIAL_REVIEW"',
          () => {
            if (kind === 'gate') f.gate.confirmed = false;
            if (kind === 'proposal') f.proposal.remaining.other++;
            if (kind === 'input-identity')
              f.proposal.remaining = { ...f.proposal.remaining };
            if (kind === 'root') f.sources.entries = [...f.sources.entries];
            if (kind === 'model')
              f.entry.release = f.sources.entries[1].release;
            if (kind === 'event-snapshot') {
              const w = f.preview.read('staff');
              w.release_payment_events[0].amount_minor++;
              vi.spyOn(f.preview, 'read').mockImplementation((actor) => ({
                ...structuredClone(w),
                actor,
              }));
            }
            if (kind === 'role') {
              const members = f.sources.operations.syntheticMemberships.bind(
                f.sources.operations,
              );
              vi.spyOn(
                f.sources.operations,
                'syntheticMemberships',
              ).mockImplementation((org) =>
                members(org).map((m) => ({ ...m, active: false })),
              );
            }
          },
        );
      await expect(f.prepare()).rejects.toThrow();
      expect(fired()).toBe(true);
      if (kind === 'proposal') {
        f.proposal.remaining.other--;
        await expect(f.prepare()).rejects.toThrow('already held');
      }
    },
  );
  it('blocks event source drift while canonical export verification is awaiting', async () => {
    const f = await fixture(0, true),
      fired = digestChange(
        '"format":"propel-synthetic-finance-export-v1"',
        () => {
          f.gate.confirmed = false;
        },
      );
    await expect(
      readFinancialEvidenceSources(f.sources, f.input, f.gate),
    ).rejects.toThrow();
    expect(fired()).toBe(true);
  });
  it('lost wrapper acknowledgment keeps the C11 exact attempt held without replacement', async () => {
    const f = await loaded(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      if (
        new TextDecoder()
          .decode(args[1] as ArrayBuffer)
          .includes('"mode":"IMMUTABLE_CANONICAL_FINANCIAL_REVIEW"')
      )
        throw Error('Lost acknowledgment');
      return digest(...args);
    });
    await expect(f.prepare()).rejects.toThrow('Lost acknowledgment');
    vi.restoreAllMocks();
    await expect(f.prepare()).rejects.toThrow('already held');
  });
  it('reconciles exact immutable evidence only and never resumes after a revoked source', async () => {
    const f = await loaded(),
      p = await f.prepare(),
      original = JSON.stringify(p);
    f.gate.confirmed = false;
    expect((await reconcileFinancialEvidenceReview(p)).status).toBe('UNKNOWN');
    f.gate.confirmed = true;
    expect((await reconcileFinancialEvidenceReview(p)).status).toBe('UNKNOWN');
    expect(() => assertFinancialEvidenceCurrent(p)).toThrow();
    expect(JSON.stringify(p)).toBe(original);
  });
  it('a failed synchronous render fence permanently withholds the exact packet even after gate restoration', async () => {
    const f = await loaded(),
      p = await f.prepare();
    f.gate.confirmed = false;
    expect(() => assertFinancialEvidenceCurrent(p)).toThrow();
    f.gate.confirmed = true;
    expect(() => assertFinancialEvidenceCurrent(p)).toThrow();
    expect((await reconcileFinancialEvidenceReview(p)).status).toBe('UNKNOWN');
  });
  it('withholds a saved revision changed after review and preserves packet bytes', async () => {
    const f = await loaded(),
      p = await f.prepare(),
      before = JSON.stringify(p),
      raw = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ).job!;
    await f.sources.estimates.projection(f.sources.company.id, raw, {
      ...raw.projection,
      remaining: {
        ...raw.projection.remaining,
        other: raw.projection.remaining.other + 1,
      },
    });
    expect(() => assertFinancialEvidenceCurrent(p)).toThrow();
    expect((await reconcileFinancialEvidenceReview(p)).status).toBe('UNKNOWN');
    expect(JSON.stringify(p)).toBe(before);
  });
  it.each(['off', 'production', 'remote', 'https'] as const)(
    '%s admission precedes source getters and serializers in readers and UI',
    async (mode) => {
      const getter = vi.fn(() => {
          throw Error('Must not read');
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
      if (mode === 'production') vi.stubEnv('DEV', false);
      if (mode === 'remote')
        vi.stubGlobal('window', {
          location: { hostname: 'example.com', protocol: 'http:' },
        });
      if (mode === 'https')
        vi.stubGlobal('window', {
          location: { hostname: 'localhost', protocol: 'https:' },
        });
      const sources = poison as Parameters<
        typeof readFinancialEvidenceSources
      >[0];
      await expect(
        mode === 'off'
          ? readFinancialEvidenceSources(sources, {
              as_of: '',
              input_revision: 1,
            })
          : readFinancialEvidenceSources(
              sources,
              { as_of: '', input_revision: 1 },
              { enabled: true, confirmed: true },
            ),
      ).rejects.toThrow();
      const markup = renderToStaticMarkup(
        createElement(FinancialEvidenceReview, {
          sources,
          enabled: mode !== 'off',
        }),
      );
      expect(markup).not.toContain('<input');
      expect(getter).not.toHaveBeenCalled();
      expect(financialEvidenceEnabled(mode !== 'off')).toBe(false);
    },
  );
  it('enabled accessors/toJSON are rejected without execution', async () => {
    const f = await fixture(),
      getter = vi.fn(() => f.sources.estimates),
      poison = { ...f.sources };
    Object.defineProperty(poison, 'estimates', {
      get: getter,
      enumerable: true,
    });
    await expect(
      readFinancialEvidenceSources(poison, f.input, f.gate),
    ).rejects.toThrow();
    const q = { ...f.input, toJSON: getter };
    await expect(
      readFinancialEvidenceSources(f.sources, q, f.gate),
    ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('visible Inspect source phrase remains part of the accessible name and source content escapes', () => {
    const m = renderToStaticMarkup(
      createElement(FinancialEvidenceSourceButton, {
        title: '<source>',
        job: 'Exact job',
        disabled: false,
        onInspect: () => {},
      }),
    );
    expect(m).toContain(
      'aria-label="Inspect source: &lt;source&gt; for Exact job"',
    );
    expect(m).toContain('>Inspect source</button>');
    expect(m).not.toContain('<source>');
  });
});
