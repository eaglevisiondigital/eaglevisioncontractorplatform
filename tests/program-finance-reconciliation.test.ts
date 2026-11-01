import { describe, expect, it } from 'vitest';
import { calculateEstimate } from '../src/domain/estimating/calculation';
import { baselineFromEstimate } from '../src/domain/jobs/financials';
import {
  reconcileStatement,
  type StatementRow,
} from '../server/payments/reconciliation';
import type { SandboxMerchant } from '../server/payments/sandbox';
import { sampleCompanies } from '../src/domain/platform';
import { ReleasePreview } from '../src/domain/release/preview';
import { verifyLedger } from '../src/domain/release/types';
import { releasePreviewVersion } from '../src/lib/release';

async function invoiceFlow(company = sampleCompanies[0]) {
  const version = releasePreviewVersion(company);
  version.payload.discount = { kind: 'percent', value: 1234 };
  version.payload.lines[0].taxable = true;
  version.calculation = calculateEstimate(version.payload, 725);
  const preview = new ReleasePreview(company.id, version);
  await preview.command('staff', 'publish_offer', { version_id: version.id });
  const offer = preview.read('staff').release_offers[0];
  await preview.command('customer', 'decide_offer', {
    offer_id: offer.id,
    decision: 'accepted',
    note: 'Synthetic only',
    consent: true,
  });
  await preview.command('staff', 'create_contract', {
    offer_id: offer.id,
    terms: 'Internal synthetic terms only',
    legal_reference: 'Synthetic legal reference',
  });
  const contract = preview.read('staff').release_contracts[0];
  await preview.command('customer', 'sign_contract', {
    contract_id: contract.id,
    document_hash: contract.document_hash,
    typed_name: 'Synthetic Customer',
    consent: true,
  });
  await preview.command('staff', 'create_invoice', {
    contract_id: contract.id,
  });
  const invoice = preview.read('staff').release_invoices[0];
  const amount = invoice.snapshot.schedule[0].amount_minor;
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
  return { preview, invoice, amount, version };
}

async function refundedFlow() {
  const flow = await invoiceFlow();
  const capture = flow.preview.read('staff').release_payment_events[0];
  await flow.preview.command('staff', 'synthetic_refund', {
    invoice_id: flow.invoice.id,
    authorization_id: capture.authorization_id,
    amount_minor: flow.amount,
    idempotency_key: crypto.randomUUID(),
    adjusts_event_id: capture.id,
  });
  return flow;
}

describe('FIN-001 exact invoice/event/ledger reconciliation', () => {
  it.each(sampleCompanies)(
    'reconciles canonical tax, discount, schedule, cost baseline and invoice for $name',
    async (company) => {
      const { preview, invoice, amount, version } = await invoiceFlow(company);
      const workspace = preview.read('staff');
      const scope = invoice.snapshot;
      expect(
        scope.subtotal_minor - scope.discount_minor + scope.tax_minor,
      ).toBe(invoice.total_minor);
      expect(scope.tax_minor).toBeGreaterThan(0);
      expect(scope.discount_minor).toBeGreaterThan(0);
      expect(
        scope.schedule.reduce((sum, item) => sum + item.amount_minor, 0),
      ).toBe(invoice.total_minor);
      const baseline = baselineFromEstimate(
        version.id,
        version.payload,
        version.calculation,
      );
      expect(baseline.issued_version_id).toBe(version.id);
      expect(baseline.revenue_minor).toBe(
        invoice.total_minor - scope.tax_minor,
      );
      expect(baseline.currency).toBe(invoice.currency);
      expect(
        verifyLedger(
          invoice,
          workspace.release_ledger_entries,
          workspace.release_payment_events,
        ),
      ).toBe(invoice.total_minor - amount);
      expect(JSON.stringify(scope)).not.toMatch(
        /unit_cost_minor|markup_bps|internal_note|cash_hour_minor/,
      );
      expect(
        workspace.release_payment_events.every(
          (event) => event.provider === 'synthetic',
        ),
      ).toBe(true);
    },
  );

  it('accepts exact capture and reversing refund evidence without changing immutable sources', async () => {
    const { preview, invoice, version } = await refundedFlow();
    const workspace = preview.read('staff');
    const before = structuredClone(workspace);
    expect(
      verifyLedger(
        invoice,
        workspace.release_ledger_entries,
        workspace.release_payment_events,
      ),
    ).toBe(invoice.total_minor);
    expect(workspace).toEqual(before);
    expect(invoice.snapshot.total_minor).toBe(version.calculation.total_minor);
    expect(workspace.release_contracts).toHaveLength(1);
    expect(workspace.release_invoices).toHaveLength(1);
    expect(
      workspace.release_messages.every(
        (message) => message.channel === 'internal_sink',
      ),
    ).toBe(true);
  });
  it('rejects a numerically balanced ledger with a nonexistent payment event reference', async () => {
    const { preview, invoice } = await invoiceFlow();
    const workspace = preview.read('staff');
    workspace.release_ledger_entries.find(
      (r) => r.event_id !== null,
    )!.event_id = crypto.randomUUID();
    expect(() =>
      verifyLedger(
        invoice,
        workspace.release_ledger_entries,
        workspace.release_payment_events,
      ),
    ).toThrow();
  });
});

describe('FIN-001 numerically balanced evidence must retain exact provenance', () => {
  it.each([
    'swapped-events',
    'changed-amounts',
    'missing-postings',
    'duplicate-postings',
    'duplicate-events',
    'wrong-provider',
    'wrong-kind',
    'wrong-invoice-posting',
  ] as const)('rejects %s', async (mode) => {
    const { preview, invoice } = await refundedFlow();
    const workspace = preview.read('staff');
    const postings = workspace.release_ledger_entries.filter(
      (row) => row.event_id !== null,
    );
    if (mode === 'swapped-events')
      [postings[0].event_id, postings[1].event_id] = [
        postings[1].event_id,
        postings[0].event_id,
      ];
    if (mode === 'changed-amounts')
      postings.forEach((row) => row.amount_minor++);
    if (mode === 'missing-postings')
      workspace.release_ledger_entries =
        workspace.release_ledger_entries.filter((row) => row.event_id === null);
    if (mode === 'duplicate-postings')
      workspace.release_ledger_entries.push(
        ...postings.map((row) => ({ ...row, id: crypto.randomUUID() })),
      );
    if (mode === 'duplicate-events')
      workspace.release_payment_events.push(
        ...structuredClone(workspace.release_payment_events),
      );
    if (mode === 'wrong-provider')
      Object.assign(workspace.release_payment_events[0], { provider: 'nmi' });
    if (mode === 'wrong-kind')
      Object.assign(workspace.release_payment_events[0], {
        kind: 'provider_capture',
      });
    if (mode === 'wrong-invoice-posting')
      workspace.release_ledger_entries.find(
        (row) => row.event_id === null,
      )!.credit_account = 'receivable';
    expect(() =>
      verifyLedger(
        invoice,
        workspace.release_ledger_entries,
        workspace.release_payment_events,
      ),
    ).toThrow();
  });

  it('rejects a foreign invoice event even when its amount matches the local capture', async () => {
    const own = await invoiceFlow(sampleCompanies[0]);
    const foreign = await invoiceFlow(sampleCompanies[1]);
    const workspace = own.preview.read('staff');
    const foreignEvent =
      foreign.preview.read('staff').release_payment_events[0];
    workspace.release_ledger_entries.find(
      (row) => row.event_id !== null,
    )!.event_id = foreignEvent.id;
    workspace.release_payment_events.push({
      ...foreignEvent,
      amount_minor: own.amount,
    });
    expect(() =>
      verifyLedger(
        own.invoice,
        workspace.release_ledger_entries,
        workspace.release_payment_events,
      ),
    ).toThrow();
  });

  it.each(['organization_id', 'customer_id', 'currency'] as const)(
    'rejects a payment event with mismatched %s',
    async (field) => {
      const { preview, invoice } = await invoiceFlow();
      const workspace = preview.read('staff');
      workspace.release_payment_events[0][field] =
        field === 'currency' ? 'EUR' : crypto.randomUUID();
      expect(() =>
        verifyLedger(
          invoice,
          workspace.release_ledger_entries,
          workspace.release_payment_events,
        ),
      ).toThrow();
    },
  );
});

describe('FIN-001 provider statement identity and integer contract', () => {
  const merchant: SandboxMerchant = {
    organizationId: crypto.randomUUID(),
    merchantConfigId: crypto.randomUUID(),
    provider: 'nmi',
    mode: 'sandbox',
    approvalReference: 'Synthetic no-call evidence',
    approvedUntil: '2030-01-01T00:00:00Z',
  };
  const row = (
    transactionId: string,
    amountMinor: number,
    kind: StatementRow['kind'] = 'capture',
  ): StatementRow => ({
    organizationId: merchant.organizationId,
    merchantConfigId: merchant.merchantConfigId,
    provider: merchant.provider,
    mode: 'sandbox',
    transactionId,
    kind,
    amountMinor,
    currency: 'USD',
  });

  it('retains exact BigInt aggregate above the safe-number boundary', () => {
    const rows = [
      row('capture_a', Number.MAX_SAFE_INTEGER),
      row('capture_b', Number.MAX_SAFE_INTEGER),
      row('refund_a', 1, 'refund'),
    ];
    const result = reconcileStatement(merchant, rows, [...rows].reverse());
    expect(result.balanced).toBe(true);
    expect(result.expectedNetMinor).toBe('18014398509481981');
    expect(result.reportedNetMinor).toBe(result.expectedNetMinor);
  });

  it('does not infer transaction identity from equal amounts or equal net totals', () => {
    const result = reconcileStatement(
      merchant,
      [row('source_a', 1000)],
      [row('unrelated_b', 1000)],
    );
    expect(result.expectedNetMinor).toBe(result.reportedNetMinor);
    expect(result.balanced).toBe(false);
    expect(result.missing).toEqual(['source_a']);
    expect(result.unexpected).toEqual(['unrelated_b']);
  });
});
