import type {
  AgreementBinding,
  AgreementEvidenceStore,
  CompletedAgreement,
} from './signing';
import type { ConnectInbox } from './docusign';
import { ProviderControl } from '../providers/control';
import { sha256 } from '../providers/safety';
export interface ImmutableAgreementObjects {
  // Create-only, private, content-addressed. Verify existing bytes on identical
  // writes. Never overwrite or sign a staff/customer download URL here.
  stage(input: {
    organizationId: string;
    agreementId: string;
    kind: 'signed' | 'certificate';
    sha256: string;
    bytes: Uint8Array;
  }): Promise<{ sha256: string }>;
}
const digestBinding = (binding: Readonly<AgreementBinding>) =>
  sha256(
    JSON.stringify(
      Object.entries(binding).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
export class DurableAgreementStore
  implements AgreementEvidenceStore, ConnectInbox
{
  constructor(
    private readonly control: ProviderControl,
    private readonly objects: ImmutableAgreementObjects,
  ) {
    if (control.service !== 'agreement')
      throw new Error('Agreement workload required');
  }
  async load(organizationId: string, agreementId: string) {
    this.control.assertScope(organizationId, agreementId, 'agreement');
    const r = await this.control.command('load', {}),
      b = r.binding as AgreementBinding;
    if (
      !b ||
      b.organizationId !== organizationId ||
      b.agreementId !== agreementId ||
      digestBinding(b) !== r.digest
    )
      throw new Error('Immutable binding integrity failure');
    return Object.freeze({ ...b });
  }
  async checkpoint(binding: Readonly<AgreementBinding>) {
    this.control.assertScope(
      binding.organizationId,
      binding.agreementId,
      'agreement',
    );
    const r = await this.control.command('checkpoint', {
      bindingDigest: digestBinding(binding),
    });
    if (r.status !== 'current') throw new Error('Agreement authority revoked');
  }
  async appendCompleted(
    binding: Readonly<AgreementBinding>,
    record: Readonly<CompletedAgreement>,
    bytes: { signed: Uint8Array; certificate: Uint8Array },
  ) {
    const b = Object.freeze({ ...binding }),
      r = Object.freeze({ ...record }),
      signed = Uint8Array.from(bytes.signed),
      certificate = Uint8Array.from(bytes.certificate);
    await this.checkpoint(b);
    if (
      r.organizationId !== b.organizationId ||
      r.agreementId !== b.agreementId ||
      r.providerAccountId !== b.providerAccountId ||
      r.envelopeId !== b.envelopeId ||
      r.mode !== 'sandbox' ||
      r.legalExecutionEnabled !== false ||
      r.sourceSha256 !== b.originalSha256 ||
      sha256(signed) !== r.signedSha256 ||
      sha256(certificate) !== r.certificateSha256
    )
      throw new Error('Agreement evidence mismatch');
    for (const [kind, content] of [
      ['signed', signed],
      ['certificate', certificate],
    ] as const) {
      const digest = sha256(content);
      const staged = await this.objects.stage({
        organizationId: b.organizationId,
        agreementId: b.agreementId,
        kind,
        sha256: digest,
        bytes: content,
      });
      if (staged.sha256 !== digest)
        throw new Error('Evidence staging mismatch');
      await this.checkpoint(b);
    }
    await this.control.command('complete', {
      bindingDigest: digestBinding(b),
      signedSha256: r.signedSha256,
      certificateSha256: r.certificateSha256,
      recordDigest: sha256(
        JSON.stringify(
          Object.entries(r).sort(([a], [b]) => a.localeCompare(b)),
        ),
      ),
    });
  }
  async record(input: Parameters<ConnectInbox['record']>[0]) {
    // Scope is bound by the connection; load/checkpoint never trusts webhook tenant.
    const b = await this.load(input.organizationId, this.agreementId());
    if (
      input.accountId !== b.providerAccountId ||
      input.envelopeId !== b.envelopeId
    )
      throw new Error('Connect tenant denied');
    const r = await this.control.command('event', {
      bindingDigest: digestBinding(b),
      eventId: input.eventId,
      digest: input.digest,
      accountId: input.accountId,
      envelopeId: input.envelopeId,
    });
    if (r.status !== 'recorded' && r.status !== 'duplicate')
      throw new Error('Connect not durable');
    return r.status;
  }
  // Set only by trusted composition, not an HTTP parameter.
  private boundAgreementId = '';
  bindAgreement(organizationId: string, agreementId: string) {
    this.control.assertScope(organizationId, agreementId, 'agreement');
    if (this.boundAgreementId && this.boundAgreementId !== agreementId)
      throw new Error('Agreement already bound');
    this.boundAgreementId = agreementId;
    return this;
  }
  private agreementId() {
    if (!this.boundAgreementId) throw new Error('Agreement binding required');
    return this.boundAgreementId;
  }
}
export { digestBinding };
