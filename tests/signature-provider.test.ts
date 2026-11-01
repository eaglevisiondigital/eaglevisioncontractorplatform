import { expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  verifySandboxAgreement,
  prepareDocusignSandboxDraft,
  SignatureSandboxGateway,
  type AgreementBinding,
  type SignatureEvidence,
  type CompletedAgreement,
} from '../server/contracts/signing';
import { sha256 } from '../server/providers/safety';
async function pdf(text: string) {
  const d = await PDFDocument.create();
  d.addPage().drawText(text);
  return d.save();
}
async function setup() {
  const original = await pdf('Synthetic approved customer selling scope'),
    signed = await pdf(
      'Synthetic signed-document fixture, NOT a genuine signature',
    ),
    certificate = await pdf(
      'Synthetic certificate fixture, NOT provider evidence',
    );
  const binding: AgreementBinding = {
    providerId: 'synthetic-only',
    organizationId: crypto.randomUUID(),
    customerId: crypto.randomUUID(),
    agreementId: crypto.randomUUID(),
    estimateVersionId: crypto.randomUUID(),
    acceptedDecisionId: crypto.randomUUID(),
    templateVersion: 'synthetic-template-v1',
    consentVersion: 'synthetic-consent-v1',
    originalSha256: sha256(original),
    providerAccountId: 'synthetic-account',
    envelopeId: 'synthetic-envelope',
    recipientId: '1',
    signerUserId: crypto.randomUUID(),
    signerEmail: 'synthetic@example.test',
    preparedAt: new Date(Date.now() - 60000).toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    mode: 'sandbox',
  };
  const evidence: SignatureEvidence = {
    mode: 'sandbox',
    providerAccountId: binding.providerAccountId,
    envelopeId: binding.envelopeId,
    recipientId: binding.recipientId,
    signerUserId: binding.signerUserId,
    signerEmail: binding.signerEmail,
    consentVersion: binding.consentVersion,
    status: 'completed',
    completedAt: new Date().toISOString(),
    original,
    signed,
    certificate,
  };
  let record: CompletedAgreement | undefined;
  const store = {
    load: vi.fn(async () => binding),
    checkpoint: vi.fn(async () => {}),
    appendCompleted: vi.fn(
      async (
        _b: Readonly<AgreementBinding>,
        r: Readonly<CompletedAgreement>,
      ) => {
        if (record && JSON.stringify(record) !== JSON.stringify(r))
          throw new Error('Immutable agreement');
        record = r;
      },
    ),
  };
  const provider = {
    id: 'synthetic-only',
    mode: 'sandbox' as const,
    readEvidence: vi.fn(async () => evidence),
  };
  return { binding, evidence, store, provider };
}
it('binds sandbox completion to original bytes, signer, consent, account and immutable evidence hashes', async () => {
  const s = await setup();
  const record = await verifySandboxAgreement(
    s.binding.organizationId,
    s.binding.agreementId,
    s.store,
    s.provider,
  );
  expect(record.legalExecutionEnabled).toBe(false);
  expect(record.signedSha256).toBe(sha256(s.evidence.signed));
  expect(Object.isFrozen(record)).toBe(true);
  await verifySandboxAgreement(
    s.binding.organizationId,
    s.binding.agreementId,
    s.store,
    s.provider,
  );
  s.evidence.signed = await pdf('Conflicting later evidence');
  await expect(
    verifySandboxAgreement(
      s.binding.organizationId,
      s.binding.agreementId,
      s.store,
      s.provider,
    ),
  ).rejects.toThrow(/Immutable/);
});
it.each([
  'tenant',
  'account',
  'envelope',
  'signer',
  'consent',
  'source',
  'unsigned',
  'expired',
  'pending',
  'missing-certificate',
  'live',
])('rejects %s signing evidence', async (mode) => {
  const s = await setup();
  if (mode === 'tenant') s.binding.organizationId = crypto.randomUUID();
  if (mode === 'account') s.evidence.providerAccountId = 'foreign';
  if (mode === 'envelope') s.evidence.envelopeId = 'foreign';
  if (mode === 'signer') s.evidence.signerUserId = crypto.randomUUID();
  if (mode === 'consent') s.evidence.consentVersion = 'different';
  if (mode === 'source') s.evidence.original = await pdf('Changed scope');
  if (mode === 'unsigned') s.evidence.signed = s.evidence.original;
  if (mode === 'expired') s.binding.expiresAt = '2020-01-01';
  if (mode === 'pending') s.evidence.status = 'sent' as 'completed';
  if (mode === 'missing-certificate') s.evidence.certificate = new Uint8Array();
  if (mode === 'live') s.evidence.mode = 'live' as 'sandbox';
  await expect(
    verifySandboxAgreement(
      mode === 'tenant' ? crypto.randomUUID() : s.binding.organizationId,
      s.binding.agreementId,
      s.store,
      s.provider,
    ),
  ).rejects.toThrow();
  expect(s.store.appendCompleted).not.toHaveBeenCalled();
});
it('revocation during provider call blocks agreement completion', async () => {
  const s = await setup();
  s.provider.readEvidence.mockImplementation(async () => {
    s.store.checkpoint.mockRejectedValue(new Error('revoked'));
    return s.evidence;
  });
  await expect(
    verifySandboxAgreement(
      s.binding.organizationId,
      s.binding.agreementId,
      s.store,
      s.provider,
    ),
  ).rejects.toThrow();
  expect(s.store.appendCompleted).not.toHaveBeenCalled();
});
it('prepares a DocuSign sandbox draft without sending an envelope or mail', async () => {
  const s = await setup(),
    draft = prepareDocusignSandboxDraft(s.binding, s.evidence.original, {
      name: 'Synthetic Customer',
      email: 'synthetic@example.test',
    });
  expect(draft.status).toBe('created');
  expect(draft.baseUrl).toBe('https://demo.docusign.net/restapi/v2.1');
  expect(draft.recipients.signers[0].clientUserId).toBe(s.binding.signerUserId);
});
it('parses only the neutral bounded sandbox evidence gateway contract', async () => {
  const s = await setup();
  const encoded = {
    ...s.evidence,
    original: Buffer.from(s.evidence.original).toString('base64'),
    signed: Buffer.from(s.evidence.signed).toString('base64'),
    certificate: Buffer.from(s.evidence.certificate).toString('base64'),
  };
  const transport = vi.fn<typeof fetch>(async () => Response.json(encoded)),
    gateway = new SignatureSandboxGateway(
      'https://sign.example.test/v1/evidence',
      'synthetic',
      transport,
    );
  s.binding.providerId = gateway.id;
  expect((await gateway.readEvidence(s.binding)).signed).toEqual(
    Buffer.from(s.evidence.signed),
  );
  expect(transport.mock.calls[0][1]?.redirect).toBe('error');
  transport.mockResolvedValue(
    Response.json({ ...encoded, execute_payment: true }),
  );
  await expect(gateway.readEvidence(s.binding)).rejects.toThrow();
});

it('rejects a different signature provider even with matching account identifiers', async () => {
  const s = await setup();
  s.provider.id = 'other-provider';
  await expect(
    verifySandboxAgreement(
      s.binding.organizationId,
      s.binding.agreementId,
      s.store,
      s.provider,
    ),
  ).rejects.toThrow(/tenant mismatch/);
  expect(s.provider.readEvidence).not.toHaveBeenCalled();
});
