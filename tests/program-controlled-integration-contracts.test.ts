import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { ReleasePreview } from '../src/domain/release/preview';
import { Operations } from '../src/lib/operations';
import { Phase3Repository } from '../src/lib/phase3';
import { PropertyRepository } from '../src/lib/property';
import {
  reviewControlledAccountingMapping,
  reviewControlledCalendarMapping,
  reviewControlledCommunicationMapping,
  reconcileControlledIntegrationReview,
  type ControlledAccountAliases,
} from '../src/lib/controlled-integration-contracts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function fixture(index = 0) {
  const company = sampleCompanies[index],
    org = company.id,
    operations = new Operations(true),
    estimates = new Phase3Repository(operations);
  await estimates.initialize(company);
  const estimate = (await estimates.list(org))[0],
    job = (await estimates.jobs(org))[0];
  const version = (await estimates.history(org, estimate.id)).find(
    (source) => source.id === job.baseline.issued_version_id,
  )!;
  const preview = new ReleasePreview(org, version);
  await preview.command('staff', 'publish_offer', { version_id: version.id });
  const offer = preview.read('staff').release_offers[0];
  await preview.command('customer', 'decide_offer', {
    offer_id: offer.id,
    decision: 'accepted',
    note: 'LOCAL FIXTURE ONLY',
    consent: true,
  });
  await preview.command('staff', 'create_contract', {
    offer_id: offer.id,
    terms: 'LOCAL FIXTURE TERMS FOR INTERNAL TESTS ONLY',
    legal_reference: 'LOCAL FIXTURE NOT APPROVAL',
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
  const capture = preview.read('staff').release_payment_events[0],
    refundAmount = Math.floor(amount / 2);
  await preview.command('staff', 'synthetic_refund', {
    invoice_id: invoice.id,
    authorization_id: authorization.id,
    amount_minor: refundAmount,
    idempotency_key: crypto.randomUUID(),
    adjusts_event_id: capture.id,
  });
  const property = new PropertyRepository(operations, estimates);
  await property.initialize(company);
  const propertyState = property.read(org),
    plan = propertyState.plans[0],
    visit = propertyState.visits[0];
  const actor = `${org}-owner`,
    admission = { enabled: true, confirmed: true };
  const target = {
    organizationId: org,
    customerId: invoice.customer_id,
    propertyId: version.payload.location_id,
    invoiceId: invoice.id,
    contractId: contract.id,
    issuedVersionId: version.id,
    currency: invoice.currency,
    asOf: new Date().toISOString(),
  };
  const calendar = {
    organizationId: org,
    customerId: plan.customer_id,
    propertyId: plan.location_id,
    planId: plan.id,
    planRevision: plan.revision,
    visitId: visit.id,
    visitRevision: visit.revision,
  };
  const communication = {
    organizationId: org,
    customerId: invoice.customer_id,
    propertyId: null,
    channel: 'email' as const,
  };
  const aliases: ControlledAccountAliases = {
    receivable: 'Controlled receivable',
    sales: 'Controlled sales',
    tax_payable: 'Controlled tax',
    sandbox_clearing: 'Synthetic clearing only',
  };
  const declaration = {
    coverage: 'complete' as const,
    outcome: 'known' as const,
  };
  return {
    company,
    org,
    operations,
    estimates,
    preview,
    property,
    actor,
    admission,
    target,
    calendar,
    communication,
    aliases,
    declaration,
    invoice,
    capture,
    amount,
    refundAmount,
    accounting: () =>
      reviewControlledAccountingMapping(
        preview,
        operations,
        target,
        actor,
        aliases,
        declaration,
        admission,
      ),
    calendarReview: () =>
      reviewControlledCalendarMapping(property, calendar, actor, admission),
    communicationReview: () =>
      reviewControlledCommunicationMapping(
        operations,
        communication,
        actor,
        admission,
      ),
  };
}

describe('controlled existing-source accounting mapping', () => {
  it.each([0, 1, 2])(
    'maps the actual verified local financial flow for company %i with exact capture/refund identity and no effects',
    async (index) => {
      const f = await fixture(index),
        before = f.preview.read('staff'),
        commands = vi.spyOn(f.preview, 'command');
      const result = await f.accounting();
      expect(result.status).toBe('RECONCILED_SYNTHETIC_ONLY');
      expect(result.rows).toHaveLength(before.release_ledger_entries.length);
      expect(result.rows.map((row) => row.sourceLedgerId).sort()).toEqual(
        before.release_ledger_entries.map((row) => row.id).sort(),
      );
      expect(
        result.rows.find((row) => row.eventKind === 'synthetic_refund'),
      ).toMatchObject({
        adjustsEventId: f.capture.id,
        currency: f.target.currency,
      });
      expect(result.summary?.refunded_minor).toBe(String(f.refundAmount));
      expect(result.summary?.balance_minor).toBe(
        String(f.invoice.total_minor - f.amount + f.refundAmount),
      );
      expect(result.externalCustomerId).toBeNull();
      expect(result.externalProviderSchema).toBe('UNVERIFIED');
      expect(result.merchantSettlement).toBe('UNKNOWN');
      expect(
        Object.values(result.authority).every((value) => value === false),
      ).toBe(true);
      expect(f.preview.read('staff')).toEqual(before);
      expect(commands).not.toHaveBeenCalled();
      expect(await reconcileControlledIntegrationReview(result)).toEqual({
        status: 'CURRENT_LOCAL_SOURCE',
        replacement: null,
      });
    },
  );
  it.each(['outcome', 'coverage', 'partial'] as const)(
    'withholds import rows and totals for %s uncertainty',
    async (mode) => {
      const f = await fixture(),
        declaration = {
          coverage:
            mode === 'partial'
              ? 'partial'
              : mode === 'coverage'
                ? 'unknown'
                : 'complete',
          outcome: mode === 'outcome' ? 'unknown' : 'known',
        } as const;
      const result = await reviewControlledAccountingMapping(
        f.preview,
        f.operations,
        f.target,
        f.actor,
        f.aliases,
        declaration,
        f.admission,
      );
      expect(result.rows).toEqual([]);
      expect(result.summary).toBeNull();
      expect(result.status).toBe(mode === 'partial' ? 'INCOMPLETE' : 'UNKNOWN');
    },
  );
  it('withholds mapped rows for exact ledger conflicts even when aggregate source amounts remain equal', async () => {
    const f = await fixture(),
      read = f.preview.read.bind(f.preview);
    vi.spyOn(f.preview, 'read').mockImplementation((actor) => {
      const workspace = read(actor);
      const posting = workspace.release_ledger_entries.find(
        (row) => row.event_id !== null,
      )!;
      posting.event_id = '11111111-1111-4111-8111-111111111111';
      return workspace;
    });
    const result = await f.accounting();
    expect(result.status).toBe('UNRECONCILED');
    expect(result.rows).toEqual([]);
    expect(result.summary).toBeNull();
  });
  it('rejects actual staff revocation during the last asynchronous boundary', async () => {
    const f = await fixture(),
      actor = `${f.org}-estimator`,
      digest = crypto.subtle.digest.bind(crypto.subtle);
    await f.operations.manageMember(
      f.org,
      actor,
      true,
      'admin',
      'office_manager',
    );
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args);
      await f.operations.manageMember(
        f.org,
        actor,
        false,
        'admin',
        'office_manager',
      );
      return value;
    });
    await expect(
      reviewControlledAccountingMapping(
        f.preview,
        f.operations,
        f.target,
        actor,
        f.aliases,
        f.declaration,
        f.admission,
      ),
    ).rejects.toThrow();
  });
  it('never includes private source identity/contact/scope/internal cost content', async () => {
    const f = await fixture(),
      result = await f.accounting();
    const text = JSON.stringify(result);
    expect(text).not.toMatch(
      /LOCAL FIXTURE|jordan\+|@example|customer_notes|internal_notes|unit_cost|markup|cash_hour|payroll|Jordan|address_line|typed_name/,
    );
    expect(Object.isFrozen(result.rows[0])).toBe(true);
    expect(
      await reconcileControlledIntegrationReview(structuredClone(result)),
    ).toEqual({ status: 'UNKNOWN', replacement: null });
  });
  it.each([
    'customerId',
    'propertyId',
    'contractId',
    'issuedVersionId',
    'currency',
  ] as const)('denies wrong exact %s', async (key) => {
    const f = await fixture();
    await expect(
      reviewControlledAccountingMapping(
        f.preview,
        f.operations,
        {
          ...f.target,
          [key]: key === 'currency' ? 'CAD' : crypto.randomUUID(),
        },
        f.actor,
        f.aliases,
        f.declaration,
        f.admission,
      ),
    ).rejects.toThrow();
  });
  it('keeps an absent exact invoice UNKNOWN with no fallback to another invoice', async () => {
    const f = await fixture();
    const result = await reviewControlledAccountingMapping(
      f.preview,
      f.operations,
      { ...f.target, invoiceId: crypto.randomUUID() },
      f.actor,
      f.aliases,
      f.declaration,
      f.admission,
    );
    expect(result.status).toBe('UNKNOWN');
    expect(result.rows).toEqual([]);
    expect(result.summary).toBeNull();
  });
  it('rejects cross-tenant source/actor and connected Operations before reads', async () => {
    const f = await fixture(),
      foreign = await fixture(1),
      read = vi.spyOn(f.preview, 'read');
    await expect(
      reviewControlledAccountingMapping(
        f.preview,
        f.operations,
        { ...f.target, organizationId: foreign.org },
        foreign.actor,
        f.aliases,
        f.declaration,
        f.admission,
      ),
    ).rejects.toThrow();
    await expect(
      reviewControlledAccountingMapping(
        f.preview,
        new Operations(false),
        f.target,
        f.actor,
        f.aliases,
        f.declaration,
        f.admission,
      ),
    ).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { enabled: false, confirmed: true },
    { enabled: true, confirmed: false },
    { enabled: true, confirmed: 'true' },
    { enabled: true, confirmed: true, extra: 1 },
  ])(
    'requires explicit default-off admission %j before reads',
    async (admission) => {
      const f = await fixture(),
        read = vi.spyOn(f.preview, 'read');
      await expect(
        reviewControlledAccountingMapping(
          f.preview,
          f.operations,
          f.target,
          f.actor,
          f.aliases,
          f.declaration,
          admission as never,
        ),
      ).rejects.toThrow();
      expect(read).not.toHaveBeenCalled();
    },
  );
  it.each([
    { receivable: '=HYPERLINK(secret)' },
    { sales: '' },
    { sales: 'Controlled receivable' },
    {
      tax_payable: {
        toString() {
          throw Error('executed');
        },
      },
    },
  ])(
    'rejects executable, duplicate or invalid account aliases %j',
    async (patch) => {
      const f = await fixture();
      await expect(
        reviewControlledAccountingMapping(
          f.preview,
          f.operations,
          f.target,
          f.actor,
          { ...f.aliases, ...patch } as never,
          f.declaration,
          f.admission,
        ),
      ).rejects.toThrow();
    },
  );
  it('rejects accessor/symbol source targets without executing caller code', async () => {
    const f = await fixture(),
      getter = vi.fn(() => f.target.invoiceId),
      target = { ...f.target };
    Object.defineProperty(target, 'invoiceId', { get: getter });
    await expect(
      reviewControlledAccountingMapping(
        f.preview,
        f.operations,
        target,
        f.actor,
        f.aliases,
        f.declaration,
        f.admission,
      ),
    ).rejects.toThrow();
    await expect(
      reviewControlledAccountingMapping(
        f.preview,
        f.operations,
        { ...f.target, [Symbol()]: true },
        f.actor,
        f.aliases,
        f.declaration,
        f.admission,
      ),
    ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('denies an actual new refund during the asynchronous export hash without replaying it', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args);
      if (!changed) {
        changed = true;
        await f.preview.command('staff', 'synthetic_refund', {
          invoice_id: f.invoice.id,
          authorization_id: f.capture.authorization_id,
          amount_minor: 1,
          idempotency_key: crypto.randomUUID(),
          adjusts_event_id: f.capture.id,
        });
      }
      return value;
    });
    await expect(f.accounting()).rejects.toThrow();
    expect(
      f.preview
        .read('staff')
        .release_payment_events.filter(
          (event) => event.kind === 'synthetic_refund',
        ),
    ).toHaveLength(2);
  });
  it('rejects changed issued source content and withdrawn confirmation during hashes', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args);
      f.preview.version.payload.internal_notes = 'Changed during await';
      return value;
    });
    await expect(f.accounting()).rejects.toThrow();
    vi.restoreAllMocks();
    const other = await fixture(),
      otherDigest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await otherDigest(...args);
      other.admission.confirmed = false;
      return value;
    });
    await expect(other.accounting()).rejects.toThrow();
  });
  it('retains an immutable old map and exact read-only STALE status after a new actual source event', async () => {
    const f = await fixture(),
      review = await f.accounting(),
      content = JSON.stringify(review);
    await f.preview.command('staff', 'synthetic_refund', {
      invoice_id: f.invoice.id,
      authorization_id: f.capture.authorization_id,
      amount_minor: 1,
      idempotency_key: crypto.randomUUID(),
      adjusts_event_id: f.capture.id,
    });
    expect(await reconcileControlledIntegrationReview(review)).toEqual({
      status: 'STALE',
      replacement: null,
    });
    expect(JSON.stringify(review)).toBe(content);
  });
});

describe('actual inspection-to-calendar mapping without booking authority', () => {
  it.each([0, 1, 2])(
    'uses exact actual plan/visit/property identities for company %i and keeps time unknown',
    async (index) => {
      const f = await fixture(index),
        before = f.property.read(f.org),
        write = vi.spyOn(f.property, 'addVisit'),
        result = await f.calendarReview();
      expect(result.target).toEqual(f.calendar);
      expect(result.proposal).toMatchObject({
        sourceKind: 'inspection-visit',
        sourceDate: before.visits[0].visited_on,
        startInstant: null,
        endInstant: null,
        externalEventId: null,
        availability: 'UNKNOWN',
      });
      expect(JSON.stringify(result)).not.toMatch(
        /INTERNAL|supplier access|summary|address_line|internal_notes/,
      );
      expect(f.property.read(f.org)).toEqual(before);
      expect(write).not.toHaveBeenCalled();
      expect(await reconcileControlledIntegrationReview(result)).toEqual({
        status: 'CURRENT_LOCAL_SOURCE',
        replacement: null,
      });
    },
  );
  it.each(['customerId', 'propertyId', 'planId', 'visitId'] as const)(
    'denies wrong exact calendar %s',
    async (key) => {
      const f = await fixture();
      await expect(
        reviewControlledCalendarMapping(
          f.property,
          { ...f.calendar, [key]: crypto.randomUUID() },
          f.actor,
          f.admission,
        ),
      ).rejects.toThrow();
    },
  );
  it('rejects stale plan or visit revisions', async () => {
    const f = await fixture();
    await expect(
      reviewControlledCalendarMapping(
        f.property,
        { ...f.calendar, planRevision: f.calendar.planRevision + 1 },
        f.actor,
        f.admission,
      ),
    ).rejects.toThrow();
    await expect(
      reviewControlledCalendarMapping(
        f.property,
        { ...f.calendar, visitRevision: f.calendar.visitRevision + 1 },
        f.actor,
        f.admission,
      ),
    ).rejects.toThrow();
  });
  it('denies an actual plan edit during hash wait and never generates another visit', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle),
      before = f.property.read(f.org);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args);
      f.property.savePlan(f.org, {
        ...before.plans[0],
        name: 'Explicit human edit',
      });
      return value;
    });
    await expect(f.calendarReview()).rejects.toThrow();
    expect(f.property.read(f.org).visits).toEqual(before.visits);
  });
  it('defaults calendar mapping off and rejects field staff', async () => {
    const f = await fixture();
    await expect(
      reviewControlledCalendarMapping(f.property, f.calendar, f.actor),
    ).rejects.toThrow();
    await expect(
      reviewControlledCalendarMapping(
        f.property,
        f.calendar,
        `${f.org}-field`,
        f.admission,
      ),
    ).rejects.toThrow();
  });
});

describe('actual consent-to-preparation requirement mapping, never sending', () => {
  it.each([0, 1, 2])(
    'reads existing customer consent for company %i but leaves every send gate NO-GO',
    async (index) => {
      const f = await fixture(index);
      await f.operations.recordConsent(f.org, f.target.customerId, true, false);
      const before = await f.operations.customerHistory(
          f.org,
          f.target.customerId,
        ),
        write = vi.spyOn(f.operations, 'recordConsent');
      const result = await f.communicationReview();
      expect(result.consentSourceIds).toEqual([before.consents[0].id]);
      expect(result.recordedPreference).toBe('RECORDED_ALLOWANCE_ONLY');
      expect(result).toMatchObject({
        admission: 'NO_GO',
        purposeConsent: 'UNVERIFIED',
        suppression: 'UNVERIFIED',
        sender: 'UNVERIFIED',
        currentConsentCoverage: 'UNKNOWN',
        verifiedRecipient: null,
        externalContactId: null,
      });
      expect(result.existingPreparationRequirements).toEqual(
        expect.arrayContaining([
          'customerEmail',
          'contactVerified',
          'consent',
          'suppressed',
          'profile',
        ]),
      );
      expect(JSON.stringify(result)).not.toMatch(
        /jordan\+|@example|555-|recorded_by|customer_notes/,
      );
      expect(write).not.toHaveBeenCalled();
      expect(await reconcileControlledIntegrationReview(result)).toEqual({
        status: 'UNKNOWN',
        replacement: null,
      });
    },
  );
  it('preserves separate recorded SMS allowance without resolving or exporting a telephone recipient', async () => {
    const f = await fixture();
    await f.operations.recordConsent(f.org, f.target.customerId, false, true);
    const result = await reviewControlledCommunicationMapping(
      f.operations,
      { ...f.communication, channel: 'sms' },
      f.actor,
      f.admission,
    );
    expect(result.recordedPreference).toBe('RECORDED_ALLOWANCE_ONLY');
    expect(result.admission).toBe('NO_GO');
    expect(result.channelPreparation).toBe(
      'UNVERIFIED_NO_SMS_PREPARATION_CONTRACT',
    );
    expect(result.existingPreparationRequirements).toEqual([]);
    expect(result.verifiedRecipient).toBeNull();
  });
  it('retains a recorded opt-out instead of promoting a contact relationship into consent', async () => {
    const f = await fixture();
    await f.operations.recordConsent(f.org, f.target.customerId, false, true);
    const result = await f.communicationReview();
    expect(result.recordedPreference).toBe('RECORDED_OPT_OUT');
    expect(result.admission).toBe('NO_GO');
  });
  it('keeps missing consent UNKNOWN with no invented evidence IDs', async () => {
    const f = await fixture(),
      result = await f.communicationReview();
    expect(result.recordedPreference).toBe('UNKNOWN');
    expect(result.consentSourceIds).toEqual([]);
  });
  it('keeps same-time contradictory records uncertain rather than choosing an arbitrary newest one', async () => {
    const f = await fixture();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    await f.operations.recordConsent(f.org, f.target.customerId, true, false);
    await f.operations.recordConsent(f.org, f.target.customerId, false, false);
    const result = await f.communicationReview();
    expect(result.recordedPreference).toBe('UNKNOWN');
    expect(result.consentSourceIds).toHaveLength(2);
  });
  it('denies unknown/foreign customer and wrong property instead of exposing contact data', async () => {
    const f = await fixture();
    await expect(
      reviewControlledCommunicationMapping(
        f.operations,
        { ...f.communication, customerId: crypto.randomUUID() },
        f.actor,
        f.admission,
      ),
    ).rejects.toThrow();
    await expect(
      reviewControlledCommunicationMapping(
        f.operations,
        { ...f.communication, propertyId: crypto.randomUUID() },
        f.actor,
        f.admission,
      ),
    ).rejects.toThrow();
    await expect(
      reviewControlledCommunicationMapping(
        new Operations(false),
        f.communication,
        f.actor,
        f.admission,
      ),
    ).rejects.toThrow();
  });
  it('rejects consent drift during the actual async customer history capture', async () => {
    const f = await fixture(),
      read = f.operations.customerHistory.bind(f.operations);
    let calls = 0;
    vi.spyOn(f.operations, 'customerHistory').mockImplementation(
      async (...args) => {
        const value = await read(...args);
        if (++calls === 1)
          await f.operations.recordConsent(
            f.org,
            f.target.customerId,
            false,
            false,
          );
        return value;
      },
    );
    await expect(f.communicationReview()).rejects.toThrow();
  });
  it('reads changed consent evidence only to mark the old review STALE, never replace or send', async () => {
    const f = await fixture(),
      result = await f.communicationReview();
    await f.operations.recordConsent(f.org, f.target.customerId, false, false);
    expect(await reconcileControlledIntegrationReview(result)).toEqual({
      status: 'STALE',
      replacement: null,
    });
    expect(
      Object.values(result.authority).every((value) => value === false),
    ).toBe(true);
  });
  it('requires default-off confirmation and current eligible staff after an awaited read', async () => {
    const f = await fixture();
    await expect(
      reviewControlledCommunicationMapping(
        f.operations,
        f.communication,
        f.actor,
      ),
    ).rejects.toThrow();
    await expect(
      reviewControlledCommunicationMapping(
        f.operations,
        f.communication,
        `${f.org}-field`,
        f.admission,
      ),
    ).rejects.toThrow();
    const read = f.operations.customerHistory.bind(f.operations);
    vi.spyOn(f.operations, 'customerHistory').mockImplementation(
      async (...args) => {
        const value = await read(...args);
        f.admission.confirmed = false;
        return value;
      },
    );
    await expect(f.communicationReview()).rejects.toThrow();
  });
});
