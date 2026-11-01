import { ProviderControl } from '../providers/control';
import { sha256 } from '../providers/safety';
import {
  prepareTenantNotification,
  senderVerificationRecord,
  type CommunicationRepository,
  type TenantSenderProfile,
  type VerifiedSender,
  verifyTenantEmailEvent,
} from './preparation';

export interface DurableCommunicationRepository extends CommunicationRepository {
  authorizeDocument(
    input: Parameters<typeof prepareTenantNotification>[0],
  ): Promise<void>;
}
/** Durable preparation and verified event suppression only; deliberately no send,
 * delivery-claim, recipient override, binding creation or suppression-clear method. */
export class DurableEmailPreparation {
  constructor(private readonly control: ProviderControl) {
    if (control.service !== 'email') throw new Error('Email workload required');
  }
  async prepare(
    input: Parameters<typeof prepareTenantNotification>[0],
    profile: TenantSenderProfile,
    receipt: VerifiedSender,
    repository: DurableCommunicationRepository,
  ) {
    this.control.assertScope(
      input.organizationId,
      profile.configurationId,
      'email',
    );
    if (profile.organizationId !== input.organizationId)
      throw new Error('Sender tenant denied');
    await repository.authorizeDocument(input);
    const message = await prepareTenantNotification(input, receipt, repository);
    const domain = senderVerificationRecord(profile, receipt);
    await this.control.command('domain', { ...domain });
    // No email address, rendered content or bearer link goes into the DB/audit.
    await repository.authorizeDocument(input);
    return this.control.command('prepare', {
      domainId: domain.id,
      customerId: message.customerId,
      documentId: message.documentId,
      purpose: input.purpose,
      key: message.idempotencyKey,
      digest: sha256(
        JSON.stringify([
          message.from,
          message.replyTo,
          message.to,
          message.subject,
          message.text,
          message.html,
        ]),
      ),
    });
  }
  async receive(
    raw: Uint8Array,
    headers: Parameters<typeof verifyTenantEmailEvent>[1],
    secret: string,
    binding: Parameters<typeof verifyTenantEmailEvent>[3] & {
      configurationId: string;
    },
  ) {
    this.control.assertScope(
      binding.organizationId,
      binding.configurationId,
      'email',
    );
    const event = verifyTenantEmailEvent(raw, headers, secret, {
      organizationId: binding.organizationId,
      providerAccountId: binding.providerAccountId,
      providerMessageId: binding.providerMessageId,
    });
    return this.control.command('event', {
      accountId: event.providerAccountId,
      messageId: event.providerMessageId,
      eventId: event.eventId,
      digest: event.bodyDigest,
      type: event.type,
    });
  }
}
