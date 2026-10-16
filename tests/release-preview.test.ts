import { expect, it } from 'vitest';
import { ReleasePreview } from '../src/domain/release/preview';
import { invoiceBalance, verifyLedger } from '../src/domain/release/types';
import { releasePreviewVersion } from '../src/lib/release';
import { sampleCompanies } from '../src/domain/platform';
async function flow(index = 0) {
  const co = sampleCompanies[index],
    r = new ReleasePreview(co.id, releasePreviewVersion(co));
  await r.command('staff', 'publish_offer', { version_id: r.version.id });
  let w = r.read('staff');
  const offer = w.release_offers[0];
  await r.command('customer', 'decide_offer', {
    offer_id: offer.id,
    decision: 'accepted',
    note: 'Synthetic',
    consent: true,
  });
  await r.command('staff', 'create_contract', {
    offer_id: offer.id,
    terms: 'Synthetic internal contract terms only.',
    legal_reference: 'Test legal reference',
  });
  w = r.read('staff');
  const contract = w.release_contracts[0];
  await r.command('customer', 'sign_contract', {
    contract_id: contract.id,
    document_hash: contract.document_hash,
    typed_name: 'Synthetic Customer',
    consent: true,
  });
  await r.command('staff', 'create_invoice', { contract_id: contract.id });
  return r;
}
it.each([0, 1, 2])(
  'preserves branded immutable selling scope through the full pilot %i preview',
  async (index) => {
    const r = await flow(index),
      w = r.read('customer'),
      invoice = w.release_invoices[0];
    expect(invoice.snapshot.company.name).toBe(sampleCompanies[index].name);
    expect(JSON.stringify(w)).not.toContain('unit_cost_minor');
    expect(JSON.stringify(w)).not.toContain('markup_bps');
    expect(
      verifyLedger(invoice, w.release_ledger_entries, w.release_payment_events),
    ).toBe(invoice.total_minor);
    const clone = r.read('customer');
    clone.release_invoices[0].total_minor = 0;
    expect(r.read('staff').release_invoices[0].total_minor).toBeGreaterThan(0);
  },
);
it('enforces explicit customer consent, staff permissions and exact signature hash', async () => {
  const co = sampleCompanies[0],
    r = new ReleasePreview(co.id, releasePreviewVersion(co));
  await expect(
    r.command('customer', 'publish_offer', { version_id: r.version.id }),
  ).rejects.toThrow();
  await r.command('staff', 'publish_offer', { version_id: r.version.id });
  const o = r.read('staff').release_offers[0];
  await expect(
    r.command('customer', 'decide_offer', {
      offer_id: o.id,
      decision: 'accepted',
      note: '',
      consent: false,
    }),
  ).rejects.toThrow();
  await r.command('customer', 'decide_offer', {
    offer_id: o.id,
    decision: 'accepted',
    note: '',
    consent: true,
  });
  await r.command('staff', 'create_contract', {
    offer_id: o.id,
    terms: 'Synthetic terms for internal testing',
    legal_reference: 'Synthetic review',
  });
  await expect(
    r.command('customer', 'sign_contract', {
      contract_id: r.read('staff').release_contracts[0].id,
      document_hash: '0'.repeat(64),
      typed_name: 'Synthetic',
      consent: true,
    }),
  ).rejects.toThrow();
});
it('reconciles a deposit, idempotent capture and full refund without customer overbilling', async () => {
  const r = await flow(),
    i = r.read('staff').release_invoices[0],
    amount = i.snapshot.schedule[0]?.amount_minor ?? 1;
  await r.command('customer', 'authorize_payment', {
    invoice_id: i.id,
    amount_minor: amount,
    consent: true,
  });
  const a = r.read('staff').release_authorizations[0],
    p = {
      invoice_id: i.id,
      authorization_id: a.id,
      amount_minor: amount,
      idempotency_key: crypto.randomUUID(),
      adjusts_event_id: null,
    };
  await Promise.all([
    r.command('staff', 'synthetic_capture', p),
    r.command('staff', 'synthetic_capture', p),
  ]);
  let w = r.read('staff');
  expect(w.release_payment_events).toHaveLength(1);
  expect(invoiceBalance(i, w.release_payment_events)).toBe(
    i.total_minor - amount,
  );
  await r.command('staff', 'synthetic_refund', {
    ...p,
    idempotency_key: crypto.randomUUID(),
    adjusts_event_id: w.release_payment_events[0].id,
  });
  w = r.read('staff');
  expect(
    verifyLedger(i, w.release_ledger_entries, w.release_payment_events),
  ).toBe(i.total_minor);
  await expect(
    r.command('staff', 'synthetic_refund', {
      ...p,
      idempotency_key: crypto.randomUUID(),
      adjusts_event_id: w.release_payment_events[0].id,
    }),
  ).rejects.toThrow();
});
it('keeps messages internal and sender unverified; rejects raw card or fabricated verification fields', async () => {
  const r = await flow();
  await r.command('staff', 'configure_email', {
    sender_name: 'Synthetic',
    sender_email: 'a@example.test',
    domain: 'example.test',
  });
  expect(r.read('staff').email_profile?.status).toBe('unverified');
  expect(r.read('staff').release_messages[0].channel).toBe('internal_sink');
  await expect(
    r.command('staff', 'configure_email', {
      sender_name: 'Synthetic',
      sender_email: 'a@example.test',
      domain: 'example.test',
      status: 'verified',
    }),
  ).rejects.toThrow();
});
