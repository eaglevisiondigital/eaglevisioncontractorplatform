import {
  boundedBytes,
  providerJson,
  exactKeys,
  referencePattern,
  sha256,
  uuid,
} from '../providers/safety';
import type {
  AgreementBinding,
  SignatureEvidence,
  SignatureProvider,
} from './signing';
import { docusignConnectWebhook } from '../providers/webhooks';

export interface SignerAuthentication {
  organizationId: string;
  customerId: string;
  userId: string;
  sessionId: string;
  email: string;
  emailVerified: boolean;
  aal: 'aal1' | 'aal2';
  checkedAt: number;
  expiresAt: number;
  revoked: boolean;
}
export interface SignerVerifier {
  // Real Auth getUser/AAL + current auth.sessions + current portal authority.
  // Must validate a genuine session server-side; no decoded JWT/user_metadata trust.
  verify(): Promise<SignerAuthentication>;
}
export async function prepareEmbeddedSigner(
  binding: AgreementBinding,
  verifier: SignerVerifier,
  returnUrl: string,
  approvedReturnUrls: readonly string[],
) {
  const b = Object.freeze({ ...binding }),
    a = Object.freeze({ ...(await verifier.verify()) });
  const url = new URL(returnUrl);
  if (
    b.mode !== 'sandbox' ||
    !approvedReturnUrls.includes(url.href) ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    a.organizationId !== b.organizationId ||
    a.customerId !== b.customerId ||
    a.userId !== b.signerUserId ||
    a.email !== b.signerEmail ||
    !a.emailVerified ||
    a.aal !== 'aal2' ||
    a.revoked ||
    !uuid.test(a.sessionId) ||
    !Number.isFinite(a.checkedAt) ||
    a.checkedAt > Date.now() + 1000 ||
    a.checkedAt < Date.now() - 60000 ||
    !(a.expiresAt > Date.now()) ||
    !(Date.parse(b.expiresAt) > Date.now())
  )
    throw new Error('Current authenticated signer required');
  // Plan only. Dispatch must recheck this genuine session/authority immediately.
  // DocuSign authenticationMethod none indicates application-controlled ceremony;
  // it does not claim provider ID verification or legal sufficiency.
  return Object.freeze({
    mode: 'sandbox' as const,
    dispatchEnabled: false as const,
    accountId: b.providerAccountId,
    envelopeId: b.envelopeId,
    recipientId: b.recipientId,
    request: {
      returnUrl: url.href,
      authenticationMethod: 'none',
      email: b.signerEmail,
      clientUserId: b.signerUserId,
    },
    sessionDigest: sha256(a.sessionId),
    expiresAt: Math.min(a.expiresAt, Date.now() + 60000),
    requiredBeforeDispatch: [
      'recipient name from immutable approved binding',
      'current AAL2 and portal authority recheck',
      'approved provider authentication policy',
      'one-use CSRF ceremony state',
    ] as const,
  });
}
export interface PdfTrustResult {
  signedSha256: string;
  certificateSha256: string;
  policyVersion: string;
  byteRangesValid: boolean;
  signaturesValid: boolean;
  chainTrusted: boolean;
  timestampValid: boolean;
  revocation: 'good' | 'revoked' | 'unknown';
  envelopeId: string;
  recipientId: string;
}
export interface PdfTrustValidator {
  // Independent isolated PDF/CMS validator, pinned roots/policy, signed timestamp,
  // OCSP/CRL at signing time. A certificate-of-completion PDF is not a trust chain.
  validate(
    signed: Uint8Array,
    certificate: Uint8Array,
    binding: Readonly<AgreementBinding>,
  ): Promise<PdfTrustResult>;
}
export interface DocusignCredential {
  organizationId: string;
  accountId: string;
  mode: 'sandbox';
  accessToken: string;
  expiresAt: number;
}
/** Actual demo REST read paths. No envelope create/send, recipient view dispatch,
 * production endpoint, OAuth secrets, emails or signature execution method exists. */
export class DocusignSandboxReader implements SignatureProvider {
  readonly id = 'docusign-demo-v1';
  readonly mode = 'sandbox' as const;
  private readonly credential: Readonly<DocusignCredential>;
  constructor(
    credential: DocusignCredential,
    private readonly transport: typeof fetch,
    private readonly original: (
      binding: Readonly<AgreementBinding>,
    ) => Promise<Uint8Array>,
    private readonly trust: PdfTrustValidator,
  ) {
    this.credential = Object.freeze({ ...credential });
    if (
      !uuid.test(credential.organizationId) ||
      !uuid.test(credential.accountId) ||
      credential.mode !== 'sandbox' ||
      !credential.accessToken
    )
      throw new Error('Demo credential required');
  }
  private async get(
    b: Readonly<AgreementBinding>,
    path: string,
    limit: number,
  ) {
    const c = this.credential;
    if (
      b.mode !== 'sandbox' ||
      b.providerId !== this.id ||
      b.organizationId !== c.organizationId ||
      b.providerAccountId !== c.accountId ||
      !uuid.test(b.envelopeId) ||
      !(c.expiresAt > Date.now()) ||
      !(Date.parse(b.expiresAt) > Date.now())
    )
      throw new Error('DocuSign account scope denied');
    return boundedBytes(
      await this.transport(
        `https://demo.docusign.net/restapi/v2.1/accounts/${c.accountId}/envelopes/${b.envelopeId}${path}`,
        {
          method: 'GET',
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
          headers: { Authorization: `Bearer ${c.accessToken}` },
        },
      ),
      limit,
    );
  }
  async readEvidence(
    binding: Readonly<AgreementBinding>,
  ): Promise<SignatureEvidence> {
    const b = Object.freeze({ ...binding });
    const envelope = providerJson(
      (await this.get(b, '', 65536)).toString('utf8'),
    );
    const recipients = providerJson(
      (await this.get(b, '/recipients', 65536)).toString('utf8'),
    );
    const signers = recipients.signers;
    if (
      envelope.envelopeId !== b.envelopeId ||
      envelope.status !== 'completed' ||
      !Array.isArray(signers) ||
      signers.length !== 1 ||
      signers[0].recipientId !== b.recipientId ||
      signers[0].clientUserId !== b.signerUserId ||
      signers[0].email !== b.signerEmail ||
      signers[0].status !== 'completed' ||
      !Number.isFinite(Date.parse(envelope.completedDateTime))
    )
      throw new Error('DocuSign completion identity mismatch');
    const signed = await this.get(b, '/documents/1', 5 * 1024 * 1024),
      certificate = await this.get(
        b,
        '/documents/certificate',
        5 * 1024 * 1024,
      ),
      original = Uint8Array.from(await this.original(b));
    if (sha256(original) !== b.originalSha256)
      throw new Error('Immutable original mismatch');
    const proof = await this.trust.validate(
      Uint8Array.from(signed),
      Uint8Array.from(certificate),
      b,
    );
    exactKeys(proof, [
      'signedSha256',
      'certificateSha256',
      'policyVersion',
      'byteRangesValid',
      'signaturesValid',
      'chainTrusted',
      'timestampValid',
      'revocation',
      'envelopeId',
      'recipientId',
    ]);
    if (
      proof.signedSha256 !== sha256(signed) ||
      proof.certificateSha256 !== sha256(certificate) ||
      !referencePattern.test(proof.policyVersion) ||
      proof.byteRangesValid !== true ||
      proof.signaturesValid !== true ||
      proof.chainTrusted !== true ||
      proof.timestampValid !== true ||
      proof.revocation !== 'good' ||
      proof.envelopeId !== b.envelopeId ||
      proof.recipientId !== b.recipientId
    )
      throw new Error('Independent PDF trust verification required');
    return {
      mode: 'sandbox',
      status: 'completed',
      providerAccountId: b.providerAccountId,
      envelopeId: b.envelopeId,
      recipientId: b.recipientId,
      signerUserId: b.signerUserId,
      signerEmail: b.signerEmail,
      consentVersion: b.consentVersion,
      completedAt: envelope.completedDateTime,
      original,
      signed,
      certificate,
    };
  }
}
export interface ConnectInbox {
  record(input: {
    organizationId: string;
    accountId: string;
    envelopeId: string;
    eventId: string;
    digest: string;
  }): Promise<'recorded' | 'duplicate'>;
}
export async function receiveDocusignConnect(
  raw: Uint8Array,
  signature: string,
  secret: string,
  binding: { organizationId: string; accountId: string; envelopeId: string },
  inbox: ConnectInbox,
) {
  const verified = docusignConnectWebhook(raw, signature, secret);
  const body = providerJson(Buffer.from(raw).toString('utf8'));
  // JSON SIM schema only; legacy XML requires its own reviewed parser.
  if (
    ![binding.organizationId, binding.accountId, binding.envelopeId].every(
      (v) => uuid.test(v),
    ) ||
    body.data?.accountId !== binding.accountId ||
    body.data?.envelopeId !== binding.envelopeId ||
    typeof body.generatedDateTime !== 'string' ||
    !referencePattern.test(body.event)
  )
    throw new Error('Connect scope denied');
  // Connect does not guarantee a universal event UUID. Stable digest deduplication
  // records exact retries; every accepted notification remains only a read trigger.
  const eventId = sha256(
    JSON.stringify([
      body.event,
      body.generatedDateTime,
      binding.envelopeId,
      verified,
    ]),
  );
  return inbox.record({ ...binding, eventId, digest: verified });
}
