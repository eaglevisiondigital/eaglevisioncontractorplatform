import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const { qualifyInvoiceAdmission } = await import(
  new URL(
    '../proposals/launch-caller-payment-integration/qualify.mjs',
    import.meta.url,
  ).href
);
it('qualifies exact full invoice source context without granting protected or operational admission', async () => {
  expect(await qualifyInvoiceAdmission()).toEqual({
    mode: 'complete',
    result: 'SOURCE_READY_FOR_REVIEW_NOT_ADMITTED',
    operationalReady: false,
    admissionAuthorized: false,
  });
});
it('rejects treating the exact five-file source diff as a standalone installation', async () => {
  expect(await qualifyInvoiceAdmission({ mode: 'partial' })).toEqual({
    mode: 'partial',
    result: 'DENIED',
    operationalReady: false,
    admissionAuthorized: false,
  });
});
it.each(['client-edit', 'caller-edit', 'fixture-edit', 'manifest-rebind'])(
  'denies actual %s in disposable full context',
  async (mode) => {
    expect((await qualifyInvoiceAdmission({ mode })).result).toBe('DENIED');
  },
);
it('rejects unknown helper bytes before import or execution', async () => {
  expect(await qualifyInvoiceAdmission({ mode: 'helper-edit' })).toEqual({
    mode: 'helper-edit',
    result: 'DENIED_BEFORE_EXECUTION',
    operationalReady: false,
    admissionAuthorized: false,
  });
});
it('rejects invented approval metadata before building a disposable candidate', async () => {
  const record = JSON.parse(
    readFileSync(
      'proposals/launch-caller-payment-integration/evidence.json',
      'utf8',
    ),
  );
  record.authorization.protectedPromotion = 'APPROVED';
  await expect(qualifyInvoiceAdmission({ record })).rejects.toThrow(
    'Exact source-decision record',
  );
});
it('rejects a different proposed source patch', async () => {
  await expect(
    qualifyInvoiceAdmission({ patch: Buffer.from('UNKNOWN PATCH') }),
  ).rejects.toThrow('Exact five-file');
});
