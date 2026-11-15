import { readFileSync, lstatSync } from 'node:fs';
import { expect, it } from 'vitest';
import { captureCustomerPaymentPublicationProposal } from '../proposals/customer-payment-publication/qualification';
it('captures exact immutable parent +new security mapping only, with no installation or financial authority', async () => {
  const p = await captureCustomerPaymentPublicationProposal();
  expect(p.classification).toBe('UNAPPLIED_CUSTOMER_PAYMENT_PUBLICATION_ONLY');
  expect(p.installationAuthorized).toBe(false);
  expect(p.financialExecutionAuthorized).toBe(false);
  expect(p.migrations).toHaveLength(14);
  expect(p.publicationSql).toContain('as $$select false$$');
  expect(p.publicationSql).not.toMatch(
    /create function public\.|grant .* to authenticated;/i,
  );
});
it.each([
  'proposals/invoice-payment-receipt/qualification.ts',
  'proposals/customer-payment-publication/publication.proposed.sql',
  'proposals/customer-payment-publication/contract.ts',
  'proposals/customer-payment-publication/reader.ts',
  'proposals/customer-payment-publication/CustomerPaymentReceipt.tsx',
])('rejects unknown %s without fixture installation', async (path) => {
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    const b = readFileSync(p);
    return String(p) === path
      ? Buffer.concat([b, Buffer.from('\nUNREVIEWED')])
      : b;
  }) as typeof readFileSync;
  await expect(
    captureCustomerPaymentPublicationProposal({ read }),
  ).rejects.toThrow();
});
it.each(['symlink', 'mode'] as const)(
  'rejects %s parent substitution before dynamic import',
  async (kind) => {
    const stat = ((p: Parameters<typeof lstatSync>[0]) => {
      const s = lstatSync(p);
      return String(p) === 'proposals/invoice-payment-receipt/qualification.ts'
        ? new Proxy(s, {
            get(t, k) {
              if (k === 'isSymbolicLink' && kind === 'symlink')
                return () => true;
              if (k === 'mode' && kind === 'mode') return 0o755;
              return Reflect.get(t, k);
            },
          })
        : s;
    }) as typeof lstatSync;
    await expect(
      captureCustomerPaymentPublicationProposal({ stat }),
    ).rejects.toThrow();
  },
);
it('new source withdrawal during parent source capture denies before returning SQL', async () => {
  let changed = false;
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    if (String(p) === 'tests/database/bootstrap.sql') changed = true;
    const b = readFileSync(p);
    return changed &&
      String(p) ===
        'proposals/customer-payment-publication/publication.proposed.sql'
      ? Buffer.concat([b, Buffer.from('\nWITHDRAWN')])
      : b;
  }) as typeof readFileSync;
  await expect(
    captureCustomerPaymentPublicationProposal({ read }),
  ).rejects.toThrow();
  expect(changed).toBe(true);
});
it('uses the original exact sourceCurrent predicate without bypassing or weakening the issued-draft guard', () => {
  const original = readFileSync(
    'proposals/commercial-payment-capacity/reviewed-drafts.sql',
    'utf8',
  );
  const start =
    original.indexOf("'sourceCurrent',") + "'sourceCurrent',".length;
  const predicate = original.slice(
    start,
    original.indexOf(",\n 'revision'", start),
  );
  const sql = readFileSync(
    'proposals/customer-payment-publication/publication.proposed.sql',
    'utf8',
  );
  expect(sql).toContain('if (' + predicate + ') is not true');
  expect(sql).not.toContain('commercial_draft_projection(');
  expect(original).toContain('Invoice already issued; use issued reader');
  expect(sql).not.toMatch(
    /create (or replace )?function private\.customer_(capability|portal_guard|publisher_guard)/,
  );
});
it('adds only bounded permission metadata, not amounts/payment business state or operational credentials', () => {
  const sql = readFileSync(
    'proposals/customer-payment-publication/publication.proposed.sql',
    'utf8',
  );
  const table = sql.slice(
    sql.indexOf('create table private.commercial_payment_access'),
    sql.indexOf('alter table private.commercial_payment_access'),
  );
  expect(table).not.toMatch(
    /amount|balance|settlement|token|credential|provider_transaction/i,
  );
  expect(table).toContain("purpose='original_payment_receipt'");
  expect(table).toContain('foreign key(organization_id,attempt_key)');
  expect(sql).not.toMatch(
    /insert into private\.sandbox_gateway|update private\.sandbox_gateway|insert into private\.commercial_invoice|update private\.commercial_invoice/,
  );
});
