import { PDFDocument } from 'pdf-lib';
import {
  providerJson,
  boundedBytes,
  digestPattern,
  exactKeys,
  operatorEndpoint,
  referencePattern,
  sha256,
  uuid,
} from '../providers/safety';

export interface AgreementBinding {
  providerId: string;
  organizationId: string;
  customerId: string;
  agreementId: string;
  estimateVersionId: string;
  acceptedDecisionId: string;
  templateVersion: string;
  consentVersion: string;
  originalSha256: string;
  providerAccountId: string;
  envelopeId: string;
  recipientId: string;
  signerUserId: string;
  signerEmail: string;
  preparedAt: string;
  expiresAt: string;
  mode: 'sandbox';
}
export interface SignatureEvidence {
  mode: 'sandbox';
  providerAccountId: string;
  envelopeId: string;
  recipientId: string;
  signerUserId: string;
  signerEmail: string;
  consentVersion: string;
  status: 'completed';
  completedAt: string;
  original: Uint8Array;
  signed: Uint8Array;
  certificate: Uint8Array;
}
export interface SignatureProvider {
  readonly id: string;
  readonly mode: 'sandbox';
  readEvidence(binding: Readonly<AgreementBinding>): Promise<SignatureEvidence>;
}
export interface CompletedAgreement {
  providerId: string;
  organizationId: string;
  agreementId: string;
  envelopeId: string;
  providerAccountId: string;
  sourceSha256: string;
  signedSha256: string;
  certificateSha256: string;
  completedAt: string;
  consentVersion: string;
  mode: 'sandbox';
  legalExecutionEnabled: false;
}
export interface AgreementEvidenceStore {
  // Load immutable accepted scope/binding under current tenant/customer authority.
  load(organizationId: string, agreementId: string): Promise<AgreementBinding>;
  checkpoint(binding: Readonly<AgreementBinding>): Promise<void>;
  // Implement as atomic append + current authorization/accepted-version CAS.
  // Write private immutable objects first; failed CAS leaves unreadable orphans.
  appendCompleted(
    binding: Readonly<AgreementBinding>,
    record: Readonly<CompletedAgreement>,
    bytes: { signed: Uint8Array; certificate: Uint8Array },
  ): Promise<void>;
}
function validateBinding(b: AgreementBinding) {
  exactKeys(b, [
    'providerId',
    'organizationId',
    'customerId',
    'agreementId',
    'estimateVersionId',
    'acceptedDecisionId',
    'templateVersion',
    'consentVersion',
    'originalSha256',
    'providerAccountId',
    'envelopeId',
    'recipientId',
    'signerUserId',
    'signerEmail',
    'preparedAt',
    'expiresAt',
    'mode',
  ]);
  if (
    b.mode !== 'sandbox' ||
    ![
      b.organizationId,
      b.customerId,
      b.agreementId,
      b.estimateVersionId,
      b.acceptedDecisionId,
      b.signerUserId,
    ].every((x) => uuid.test(x)) ||
    ![b.providerId, b.providerAccountId, b.envelopeId, b.recipientId].every(
      (x) => referencePattern.test(x),
    ) ||
    !digestPattern.test(b.originalSha256) ||
    typeof b.templateVersion !== 'string' ||
    !b.templateVersion ||
    b.templateVersion.length > 200 ||
    typeof b.consentVersion !== 'string' ||
    !b.consentVersion ||
    b.consentVersion.length > 200 ||
    typeof b.signerEmail !== 'string' ||
    b.signerEmail.length > 254 ||
    !/^\S+@\S+\.\S+$/.test(b.signerEmail) ||
    !Number.isFinite(Date.parse(b.preparedAt)) ||
    Date.parse(b.preparedAt) > Date.now() ||
    !(Date.parse(b.expiresAt) > Date.now())
  )
    throw new Error('Invalid sandbox agreement binding');
}
async function boundedPdf(input: Uint8Array) {
  const bytes = Uint8Array.from(input);
  if (
    bytes.length < 8 ||
    bytes.length > 5 * 1024 * 1024 ||
    !Buffer.from(bytes.subarray(0, 5)).equals(Buffer.from('%PDF-'))
  )
    throw new Error('Invalid agreement evidence document');
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    throwOnInvalidObject: true,
    updateMetadata: false,
  });
  if (
    doc.isEncrypted ||
    doc.getPageCount() < 1 ||
    doc.getPageCount() > 100 ||
    doc.context.enumerateIndirectObjects().length > 20000 ||
    !/%%EOF\s*$/.test(
      Buffer.from(bytes.subarray(Math.max(0, bytes.length - 1024))).toString(
        'latin1',
      ),
    )
  )
    throw new Error('Invalid agreement evidence pages');
  // Full signed-PDF cryptographic/certificate validation is a separate reviewed
  // verifier; never flatten/resave signed bytes, which would destroy signatures.
  return bytes;
}
export async function verifySandboxAgreement(
  organizationId: string,
  agreementId: string,
  store: AgreementEvidenceStore,
  provider: SignatureProvider,
) {
  const binding = Object.freeze({
    ...(await store.load(organizationId, agreementId)),
  });
  validateBinding(binding);
  if (
    binding.organizationId !== organizationId ||
    binding.agreementId !== agreementId ||
    provider.mode !== 'sandbox' ||
    provider.id !== binding.providerId
  )
    throw new Error('Agreement tenant mismatch');
  await store.checkpoint(binding);
  const raw = await provider.readEvidence(binding);
  const evidence = {
    ...raw,
    original: Uint8Array.from(raw.original),
    signed: Uint8Array.from(raw.signed),
    certificate: Uint8Array.from(raw.certificate),
  };
  if (
    evidence.mode !== 'sandbox' ||
    evidence.status !== 'completed' ||
    ![
      'providerAccountId',
      'envelopeId',
      'recipientId',
      'signerUserId',
      'signerEmail',
      'consentVersion',
    ].every(
      (k) =>
        evidence[k as keyof SignatureEvidence] ===
        binding[k as keyof AgreementBinding],
    ) ||
    !(Date.parse(evidence.completedAt) >= Date.parse(binding.preparedAt)) ||
    Date.parse(evidence.completedAt) > Date.now() + 60000 ||
    Date.parse(evidence.completedAt) > Date.parse(binding.expiresAt) ||
    sha256(evidence.original) !== binding.originalSha256
  )
    throw new Error('Unverified agreement completion');
  await store.checkpoint(binding);
  await boundedPdf(evidence.original);
  const signed = await boundedPdf(evidence.signed),
    certificate = await boundedPdf(evidence.certificate);
  if (sha256(signed) === binding.originalSha256)
    throw new Error('Unchanged document is not signature evidence');
  if (!(Date.parse(binding.expiresAt) > Date.now()))
    throw new Error('Agreement expired during verification');
  const record = Object.freeze({
    providerId: binding.providerId,
    organizationId,
    agreementId,
    envelopeId: binding.envelopeId,
    providerAccountId: binding.providerAccountId,
    sourceSha256: binding.originalSha256,
    signedSha256: sha256(signed),
    certificateSha256: sha256(certificate),
    completedAt: evidence.completedAt,
    consentVersion: binding.consentVersion,
    mode: 'sandbox' as const,
    legalExecutionEnabled: false as const,
  });
  await store.checkpoint(binding);
  await store.appendCompleted(binding, record, { signed, certificate });
  return record;
}

// Neutral gateway contract, not a claim that DocuSign has returned this schema.
// A future approved gateway must authenticate sandbox account/recipient evidence
// from provider APIs; caller POST data or webhook status cannot serve as evidence.
export class SignatureSandboxGateway implements SignatureProvider {
  readonly id = 'signature-sandbox-gateway-v1';
  readonly mode = 'sandbox' as const;
  private readonly endpoint: string;
  constructor(
    endpoint: string,
    private readonly token: string,
    private readonly transport: typeof fetch,
  ) {
    this.endpoint = operatorEndpoint(endpoint);
    if (!token) throw new Error('Signature gateway credential required');
  }
  async readEvidence(
    binding: Readonly<AgreementBinding>,
  ): Promise<SignatureEvidence> {
    validateBinding(binding);
    if (binding.providerId !== this.id)
      throw new Error('Signature provider binding denied');
    const response = await this.transport(this.endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        schema_version: 1,
        mode: 'sandbox',
        account_id: binding.providerAccountId,
        envelope_id: binding.envelopeId,
      }),
    });
    const data = providerJson(
      (await boundedBytes(response, 22 * 1024 * 1024)).toString('utf8'),
    );
    if (!data || typeof data !== 'object')
      throw new Error('Invalid signature evidence');
    exactKeys(data, [
      'mode',
      'providerAccountId',
      'envelopeId',
      'recipientId',
      'signerUserId',
      'signerEmail',
      'consentVersion',
      'status',
      'completedAt',
      'original',
      'signed',
      'certificate',
    ]);
    const decode = (value: unknown) => {
      if (
        typeof value !== 'string' ||
        value.length > 7 * 1024 * 1024 ||
        !/^[a-zA-Z0-9+/]+={0,2}$/.test(value)
      )
        throw new Error('Invalid evidence encoding');
      const bytes = Buffer.from(value, 'base64');
      if (bytes.toString('base64') !== value)
        throw new Error('Noncanonical evidence encoding');
      return bytes;
    };
    return {
      ...data,
      original: decode(data.original),
      signed: decode(data.signed),
      certificate: decode(data.certificate),
    };
  }
}

export function prepareDocusignSandboxDraft(
  binding: AgreementBinding,
  pdf: Uint8Array,
  signer: { name: string; email: string },
) {
  validateBinding(binding);
  if (
    sha256(pdf) !== binding.originalSha256 ||
    !signer.name.trim() ||
    signer.name.length > 160 ||
    !/^\S+@\S+\.\S+$/.test(signer.email) ||
    signer.email !== binding.signerEmail ||
    /[\r\n]/.test(signer.name + signer.email)
  )
    throw new Error('Invalid draft identity/document');
  // Plan only; status created never sends an envelope or notification.
  return {
    baseUrl: 'https://demo.docusign.net/restapi/v2.1',
    accountId: binding.providerAccountId,
    status: 'created' as const,
    documents: [
      {
        documentBase64: Buffer.from(pdf).toString('base64'),
        name: 'Contract.pdf',
        fileExtension: 'pdf',
        documentId: '1',
      },
    ],
    recipients: {
      signers: [
        {
          name: signer.name,
          email: signer.email,
          recipientId: binding.recipientId,
          clientUserId: binding.signerUserId,
        },
      ],
    },
  };
}
