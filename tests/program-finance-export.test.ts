import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  projectSyntheticFinancialExport,
  type SyntheticFinancialExportInput,
} from '../src/domain/finance/export';
import { calculateEstimate } from '../src/domain/estimating/calculation';
import { sampleCompanies } from '../src/domain/platform';
import { ReleasePreview } from '../src/domain/release/preview';
import { releasePreviewVersion } from '../src/lib/release';

async function fixture(index = 0) {
  const company = sampleCompanies[index],
    version = releasePreviewVersion(company);
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
  const invoice = preview.read('staff').release_invoices[0],
    captureAmount = invoice.snapshot.schedule[0].amount_minor;
  await preview.command('customer', 'authorize_payment', {
    invoice_id: invoice.id,
    amount_minor: captureAmount,
    consent: true,
  });
  const authorization = preview.read('staff').release_authorizations[0];
  await preview.command('staff', 'synthetic_capture', {
    invoice_id: invoice.id,
    authorization_id: authorization.id,
    amount_minor: captureAmount,
    idempotency_key: crypto.randomUUID(),
    adjusts_event_id: null,
  });
  const capture = preview.read('staff').release_payment_events[0],
    refundAmount = Math.floor(captureAmount / 2);
  await preview.command('staff', 'synthetic_refund', {
    invoice_id: invoice.id,
    authorization_id: authorization.id,
    amount_minor: refundAmount,
    idempotency_key: crypto.randomUUID(),
    adjusts_event_id: capture.id,
  });
  const workspace = preview.read('staff'),
    asOf = new Date().toISOString();
  const input: SyntheticFinancialExportInput = {
    syntheticFixture: true,
    scope: {
      organizationId: company.id,
      customerId: invoice.customer_id,
      propertyId: null,
      invoiceId: invoice.id,
      currency: invoice.currency,
      asOf,
    },
    source: {
      kind: 'release-preview',
      reference: `synthetic-source-${invoice.id}`,
      observedAt: asOf,
      coverage: 'complete',
      outcome: 'known',
      contractId: contract.id,
      eventIds: workspace.release_payment_events.map((row) => row.id),
      ledgerEntryIds: workspace.release_ledger_entries.map((row) => row.id),
    },
    invoice,
    events: workspace.release_payment_events,
    ledgerEntries: workspace.release_ledger_entries,
  };
  return { input, preview, captureAmount, refundAmount };
}
const project = (input: unknown) =>
  projectSyntheticFinancialExport(input, { enabled: true });
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe('offline synthetic financial source export', () => {
  it.each([0, 1, 2])(
    'reconciles actual existing invoice/events/ledger for company %i without side effects',
    async (index) => {
      const { input, preview, captureAmount, refundAmount } =
          await fixture(index),
        before = preview.read('staff'),
        copy = structuredClone(input);
      const result = await project(input);
      expect(result.packet.status).toBe('RECONCILED_SYNTHETIC_ONLY');
      expect(result.packet.summary).toEqual({
        invoice_total_minor: String(input.invoice!.total_minor),
        sales_minor: String(
          input.invoice!.total_minor - input.invoice!.snapshot.tax_minor,
        ),
        tax_minor: String(input.invoice!.snapshot.tax_minor),
        captured_minor: String(captureAmount),
        refunded_minor: String(refundAmount),
        balance_minor: String(
          input.invoice!.total_minor - captureAmount + refundAmount,
        ),
      });
      expect(result.packet.events.map((event) => event.id).sort()).toEqual(
        [...input.source.eventIds].sort(),
      );
      expect(result.packet.ledgerEntries.map((row) => row.id).sort()).toEqual(
        [...input.source.ledgerEntryIds].sort(),
      );
      expect(input).toEqual(copy);
      expect(preview.read('staff')).toEqual(before);
      expect(result.packet.authority).toContain('No bank settlement');
      expect(result.packet.moneyEncoding).toBe('integer-minor-decimal-string');
      expect(Object.isFrozen(result.packet.events[0])).toBe(true);
      expect(() => {
        result.packet.events[0].amount_minor = '0';
      }).toThrow();
    },
  );

  it('defaults off and rejects implicit/foreign/non-fixture admission', async () => {
    const { input } = await fixture();
    await expect(projectSyntheticFinancialExport(input)).rejects.toThrow(
      /disabled/,
    );
    await expect(
      projectSyntheticFinancialExport(input, { enabled: false }),
    ).rejects.toThrow(/disabled/);
    await expect(
      project({ ...input, syntheticFixture: false }),
    ).rejects.toThrow();
    await expect(
      project({
        ...input,
        scope: { ...input.scope, organizationId: crypto.randomUUID() },
      }),
    ).rejects.toThrow();
    delete (input.invoice!.snapshot as { internal_test?: true }).internal_test;
    await expect(project(input)).rejects.toThrow();
  });

  it('creates stable independently verifiable canonical JSON/CSV from shuffled source order', async () => {
    const { input } = await fixture(),
      one = await project(input);
    input.events = [...input.events].reverse();
    input.ledgerEntries = [...input.ledgerEntries].reverse();
    input.source.eventIds = [...input.source.eventIds].reverse();
    input.source.ledgerEntryIds = [...input.source.ledgerEntryIds].reverse();
    const two = await project(input);
    expect(two).toEqual(one);
    expect(JSON.parse(one.canonicalJson)).toEqual(one.packet);
    expect(one.integrity.jsonSha256).toBe(sha(one.canonicalJson));
    expect(one.integrity.csvSha256).toBe(sha(one.csv));
    expect(one.packet.id).toBe(`finance-export-${one.integrity.contentSha256}`);
    expect(one.csv).toContain(one.integrity.sourceSha256);
    const content = Object.fromEntries(
      Object.entries(one.packet).filter(
        ([key]) => !['id', 'integrity'].includes(key),
      ),
    );
    const canonical = (value: unknown): string =>
      Array.isArray(value)
        ? `[${value.map(canonical).join(',')}]`
        : value !== null && typeof value === 'object'
          ? `{${Object.keys(value)
              .sort()
              .map(
                (key) =>
                  `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
              )
              .join(',')}}`
          : JSON.stringify(value);
    expect(sha(canonical(content))).toBe(one.integrity.contentSha256);
  });

  it('takes a detached source snapshot before hashing awaits', async () => {
    const { input } = await fixture(),
      original = structuredClone(input);
    const pending = project(input);
    input.invoice!.invoice_number = 'changed after dispatch';
    input.events[0].amount_minor++;
    const result = await pending;
    expect(result).toEqual(await project(original));
  });

  it.each(['invoice', 'event', 'ledger', 'outcome', 'coverage'] as const)(
    'keeps missing/uncertain %s UNKNOWN with no balance',
    async (mode) => {
      const { input } = await fixture();
      if (mode === 'invoice') input.invoice = null;
      if (mode === 'event') input.events = input.events.slice(1);
      if (mode === 'ledger') input.ledgerEntries = input.ledgerEntries.slice(1);
      if (mode === 'outcome') input.source.outcome = 'unknown';
      if (mode === 'coverage') input.source.coverage = 'unknown';
      const result = await project(input);
      expect(result.packet.status).toBe('UNKNOWN');
      expect(result.packet.summary).toBeNull();
      expect(result.csv).not.toContain('"summary"');
    },
  );

  it('marks partial accessible evidence INCOMPLETE rather than zero or complete', async () => {
    const { input } = await fixture();
    input.source.coverage = 'partial';
    input.ledgerEntries = input.ledgerEntries.slice(1);
    input.source.ledgerEntryIds = input.ledgerEntries.map((row) => row.id);
    const result = await project(input);
    expect(result.packet.status).toBe('INCOMPLETE');
    expect(result.packet.summary).toBeNull();
    expect(result.packet.reasons).toEqual(['PARTIAL_COVERAGE']);
  });

  it.each([
    'manifest-extra',
    'swapped-events',
    'wrong-amount',
    'missing-posting',
    'refund-source',
    'refund-authorization',
    'invoice-tax-posting',
  ] as const)(
    'keeps proven %s conflict UNRECONCILED despite equal/known totals',
    async (mode) => {
      const { input } = await fixture();
      const eventPostings = input.ledgerEntries.filter(
        (row) => row.event_id !== null,
      );
      if (mode === 'manifest-extra') input.source.eventIds = [];
      if (mode === 'swapped-events')
        [eventPostings[0].event_id, eventPostings[1].event_id] = [
          eventPostings[1].event_id,
          eventPostings[0].event_id,
        ];
      if (mode === 'wrong-amount')
        eventPostings.forEach((row) => row.amount_minor++);
      if (mode === 'missing-posting') {
        input.ledgerEntries = input.ledgerEntries.filter(
          (row) => row.event_id === null,
        );
        input.source.ledgerEntryIds = input.ledgerEntries.map((row) => row.id);
      }
      if (mode === 'refund-source')
        input.events.find(
          (row) => row.kind === 'synthetic_refund',
        )!.adjusts_event_id = crypto.randomUUID();
      if (mode === 'refund-authorization')
        input.events.find(
          (row) => row.kind === 'synthetic_refund',
        )!.authorization_id = crypto.randomUUID();
      if (mode === 'invoice-tax-posting')
        input.ledgerEntries
          .filter((row) => row.event_id === null)
          .forEach((row) => (row.credit_account = 'sales'));
      const result = await project(input);
      expect(result.packet.status).toBe('UNRECONCILED');
      expect(result.packet.summary).toBeNull();
      expect(result.packet.reasons).toContain('EVIDENCE_CONFLICT');
    },
  );

  it.each([
    'organization_id',
    'customer_id',
    'invoice_id',
    'currency',
  ] as const)('rejects foreign %s before exporting any row', async (field) => {
    const { input } = await fixture();
    input.events[0][field] = field === 'currency' ? 'EUR' : crypto.randomUUID();
    await expect(project(input)).rejects.toThrow(/Invalid synthetic/);
  });

  it.each([
    'contract',
    'property',
    'snapshot-customer',
    'snapshot-total',
    'snapshot-currency',
    'event-after-asof',
    'bad-asof',
    'observation-before-asof',
  ] as const)('rejects incorrect %s source binding', async (mode) => {
    const { input } = await fixture();
    if (mode === 'contract') input.source.contractId = crypto.randomUUID();
    if (mode === 'property') input.scope.propertyId = crypto.randomUUID();
    if (mode === 'snapshot-customer')
      input.invoice!.snapshot.customer.id = crypto.randomUUID();
    if (mode === 'snapshot-total') input.invoice!.snapshot.total_minor++;
    if (mode === 'snapshot-currency') input.invoice!.snapshot.currency = 'EUR';
    if (mode === 'event-after-asof')
      input.events[0].created_at = new Date(
        Date.parse(input.scope.asOf) + 1,
      ).toISOString();
    if (mode === 'bad-asof') input.scope.asOf = '2026-02-30T00:00:00.000Z';
    if (mode === 'observation-before-asof')
      input.source.observedAt = new Date(
        Date.parse(input.scope.asOf) - 1,
      ).toISOString();
    await expect(project(input)).rejects.toThrow();
  });

  it.each([
    0,
    -1,
    0.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    9_000_000_000_001,
    '100',
  ])('rejects malformed minor amount %s', async (amount) => {
    const { input } = await fixture();
    Object.assign(input.events[0], { amount_minor: amount });
    await expect(project(input)).rejects.toThrow();
  });

  it.each([
    'events',
    'ledger',
    'manifest',
    'key',
    'provider',
    'kind',
    'oversized',
  ] as const)(
    'rejects duplicate or malformed %s instead of silently deduplicating',
    async (mode) => {
      const { input } = await fixture();
      if (mode === 'events') input.events = [...input.events, input.events[0]];
      if (mode === 'ledger')
        input.ledgerEntries = [...input.ledgerEntries, input.ledgerEntries[0]];
      if (mode === 'manifest')
        input.source.eventIds = [
          ...input.source.eventIds,
          input.source.eventIds[0],
        ];
      if (mode === 'key')
        input.events[1].idempotency_key = input.events[0].idempotency_key;
      if (mode === 'provider')
        Object.assign(input.events[0], { provider: 'nmi' });
      if (mode === 'kind') Object.assign(input.events[0], { kind: 'settled' });
      if (mode === 'oversized')
        input.source.eventIds = Array.from({ length: 1001 }, () =>
          crypto.randomUUID(),
        );
      await expect(project(input)).rejects.toThrow();
    },
  );

  it.each([
    '=SUM(1,2)',
    '+1',
    '-1',
    '@command',
    ' =HYPERLINK("https://example.test")',
  ])(
    'neutralizes spreadsheet formula %s without changing canonical identity text',
    async (value) => {
      const { input } = await fixture();
      input.invoice!.invoice_number = value;
      input.source.reference = value;
      const result = await project(input);
      expect(result.packet.invoice!.invoice_number).toBe(value);
      expect(result.packet.source.reference).toBe(value);
      expect(result.csv).toContain(`"'${value.replaceAll('"', '""')}"`);
    },
  );

  it.each([
    'tab\tformula',
    'line\nfeed',
    'nul\u0000byte',
    'bidi\u202eflip',
    '\u200b=SUM(1)',
    'line\u2028separator',
    '\ud800',
  ])('rejects control or malformed Unicode %j', async (value) => {
    const { input } = await fixture();
    input.invoice!.invoice_number = value;
    await expect(project(input)).rejects.toThrow();
  });

  it('allowlists safe fields and never reads or serializes internal prices, customer PII or notes', async () => {
    const { input } = await fixture(),
      marker = 'PRIVATE_SENTINEL_DO_NOT_EXPORT';
    input.invoice!.snapshot.customer.display_name = marker;
    input.invoice!.snapshot.customer.email = marker;
    input.invoice!.snapshot.notes = marker;
    input.invoice!.snapshot.terms = marker;
    Object.assign(input.invoice!.snapshot, {
      unit_cost_minor: marker,
      payroll: marker,
    });
    Object.assign(input.events[0], {
      private_note: marker,
      supplier_cost: marker,
    });
    Object.assign(input.ledgerEntries[0], { employee_rate: marker });
    const result = await project(input);
    expect(result.canonicalJson + result.csv).not.toContain(marker);
    expect(result.canonicalJson + result.csv).not.toMatch(
      /unit_cost_minor|private_note|payroll|supplier_cost|employee_rate|display_name|email/,
    );
    const getter = vi.fn(() => marker);
    Object.defineProperty(input.events[0], 'private_accessor', { get: getter });
    await expect(project(input)).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });

  it('changes integrity for a different source reference, as-of or exact event identity', async () => {
    const { input } = await fixture(),
      first = await project(input);
    input.source.reference += '-new';
    const changed = await project(input);
    expect(changed.integrity.sourceSha256).not.toBe(
      first.integrity.sourceSha256,
    );
    input.scope.asOf = new Date(Date.parse(input.scope.asOf) + 1).toISOString();
    input.source.observedAt = input.scope.asOf;
    expect((await project(input)).packet.id).not.toBe(changed.packet.id);
  });
});

describe('strict primitive export enum admission', () => {
  it.each(['coverage', 'outcome', 'kind', 'debit_account', 'credit_account'])(
    'rejects object-valued %s without coercion, private serialization or freezing caller data',
    async (field) => {
      const { input } = await fixture();
      const valid =
        field === 'coverage'
          ? 'complete'
          : field === 'outcome'
            ? 'unknown'
            : field === 'kind'
              ? 'synthetic_capture'
              : field === 'debit_account'
                ? 'sandbox_clearing'
                : 'receivable';
      const coercion = vi.fn(() => valid);
      const malicious = Object.assign(Object(valid), {
        private_note: 'PRIVATE_SENTINEL_ENUM_OBJECT',
        toString: coercion,
        toJSON: coercion,
      });
      if (field === 'coverage' || field === 'outcome')
        (input.source as unknown as Record<string, unknown>)[field] = malicious;
      else if (field === 'kind')
        (input.events[0] as unknown as Record<string, unknown>)[field] =
          malicious;
      else
        (input.ledgerEntries[0] as unknown as Record<string, unknown>)[field] =
          malicious;
      await expect(project(input)).rejects.toThrow(
        /Invalid synthetic financial export evidence/,
      );
      expect(coercion).not.toHaveBeenCalled();
      expect(Object.isFrozen(malicious)).toBe(false);
      expect(malicious.private_note).toBe('PRIVATE_SENTINEL_ENUM_OBJECT');
    },
  );
});
