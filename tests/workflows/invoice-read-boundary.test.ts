import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
// @ts-expect-error Isolated JavaScript build-time source-admission checker.
import { checkPaymentAckAdmission } from '../../scripts/check-payment-ack-admission.mjs';
import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../src/lib/supabase', () => ({ supabase: { rpc } }));
import { customerPreview } from '../../src/domain/estimating/customer-preview';
import { sampleCompanies } from '../../src/domain/platform';
import { releasePreviewVersion } from '../../src/lib/release';
import { ReleaseRepository } from '../../src/lib/release';
import {
  emptyWorkspace,
  type ReleaseWorkspace,
} from '../../src/domain/release/types';
const org = sampleCompanies[0].id;
function workspace(): ReleaseWorkspace {
  const w = emptyWorkspace('staff');
  const snapshot = customerPreview(releasePreviewVersion(sampleCompanies[0]));
  w.release_invoices.push({
    id: crypto.randomUUID(),
    organization_id: org,
    customer_id: snapshot.customer.id,
    contract_id: crypto.randomUUID(),
    invoice_number: 'TEST-INV-1',
    currency: 'USD',
    total_minor: snapshot.total_minor,
    created_at: new Date().toISOString(),
    snapshot,
  });
  return w;
}
beforeEach(() => rpc.mockReset());
it.each([
  'tenant',
  'customer',
  'currency',
  'total',
  'duplicate',
  'collection',
  'row',
  'oversized',
  'foreign-profile',
  'customer-profile',
  'malformed-profile',
])(
  'rejects %s source mismatch before returning invoice workspace',
  async (mode) => {
    const w = workspace();
    if (mode === 'tenant')
      w.release_invoices[0].organization_id = crypto.randomUUID();
    if (mode === 'customer')
      w.release_invoices[0].snapshot.customer.id = crypto.randomUUID();
    if (mode === 'currency') w.release_invoices[0].snapshot.currency = 'EUR';
    if (mode === 'total') w.release_invoices[0].snapshot.total_minor = 999;
    if (mode === 'duplicate')
      w.release_invoices.push(structuredClone(w.release_invoices[0]));
    if (mode === 'collection') w.release_invoices = null as never;
    if (mode === 'row') w.release_ledger_entries.push(null as never);
    if (mode === 'oversized')
      w.release_invoices = Array.from({ length: 201 }, () => ({
        ...structuredClone(w.release_invoices[0]),
        id: crypto.randomUUID(),
      }));
    if (mode === 'foreign-profile' || mode === 'customer-profile')
      w.email_profile = {
        organization_id: mode === 'foreign-profile' ? crypto.randomUUID() : org,
        sender_name: 'Fictional staff',
        sender_email: 'staff@example.test',
        domain: 'example.test',
        status: 'unverified',
      } as never;
    if (mode === 'customer-profile') w.actor = 'customer';
    if (mode === 'malformed-profile') w.email_profile = 'invalid' as never;
    rpc.mockResolvedValue({ error: null, data: w });
    await expect(
      new ReleaseRepository(false).read(org, 'staff'),
    ).rejects.toThrow(/Invalid workspace/);
    expect(rpc).toHaveBeenCalledWith('release_workspace', { p_org: org });
  },
);
it('returns exact internal invoice scope without conferring commercial authority', async () => {
  const w = workspace();
  rpc.mockResolvedValue({ error: null, data: w });
  expect(await new ReleaseRepository(false).read(org, 'staff')).toEqual(w);
});

it('keeps the exact writer/grant inventory explicit and grants no commercial installation', () => {
  const evidence = JSON.parse(
    readFileSync('docs/FIRST_CONTRACTOR_INVOICE_BOUNDARY.json', 'utf8'),
  );
  expect(evidence.genuineCommercialWriter).toBeNull();
  expect(evidence.commercialOperationalAcceptance).toBe('NOT_RUN');
  expect(evidence.installationDiff.protectedSqlChanges).toEqual([]);
  expect(evidence.installationDiff.grantsToInstall).toEqual([]);
  for (const source of evidence.sources) {
    let bytes = readFileSync(source.path);
    if (source.path === 'server/payments/control-store.ts') {
      // The historical inventory remains exact. Only the separately authorized
      // successor is current; no unknown edit or generic pin replacement passes.
      checkPaymentAckAdmission();
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        '2dc82d0ff2548051de6df1461ddf783355e602da914a099bf14f0eba29f3ac7c',
      );
      bytes = execFileSync('git', [
        '--no-replace-objects',
        'show',
        '44955c2b6e4475bf82fc1bc535591a8e387b635e:server/payments/control-store.ts',
      ]);
    }
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      source.sha256,
    );
  }
});

it('preserves own-company staff profile and null/absent profile forms', async () => {
  for (const profile of [
    undefined,
    null,
    {
      organization_id: org,
      sender_name: 'Fictional staff',
      sender_email: 'staff@example.test',
      domain: 'example.test',
      status: 'unverified',
    },
  ]) {
    const w = workspace();
    w.email_profile = profile as never;
    rpc.mockResolvedValue({ error: null, data: w });
    expect(await new ReleaseRepository(false).read(org, 'staff')).toEqual(w);
  }
});
