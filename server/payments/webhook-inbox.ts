import type { SandboxMerchant } from './sandbox';
import { authorizeNetWebhook, nmiPaymentWebhook } from '../providers/webhooks';
import { providerJson, referencePattern } from '../providers/safety';
export interface GatewayEventInbox {
  recordWebhook(
    merchant: SandboxMerchant,
    eventId: string,
    bodyDigest: string,
  ): Promise<'recorded' | 'duplicate'>;
}
export async function receiveSandboxPaymentWebhook(
  input: Uint8Array,
  signature: string,
  merchant: SandboxMerchant,
  signingKey: Readonly<{
    organizationId: string;
    merchantConfigId: string;
    provider: SandboxMerchant['provider'];
    value: string;
    webhookId?: string;
  }>,
  inbox: GatewayEventInbox,
) {
  const m = Object.freeze({ ...merchant }),
    key = Object.freeze({ ...signingKey }),
    raw = Buffer.from(input);
  if (
    m.mode !== 'sandbox' ||
    m.organizationId !== key.organizationId ||
    m.merchantConfigId !== key.merchantConfigId ||
    m.provider !== key.provider
  )
    throw new Error('Webhook merchant binding denied');
  const digest =
    m.provider === 'authorize_net'
      ? authorizeNetWebhook(raw, signature, key.value)
      : nmiPaymentWebhook(raw, signature, key.value).bodyDigest;
  // Parse only after authenticating exact bytes. Never accept a tenant from payload.
  const event = providerJson(raw.toString('utf8'));
  const eventId =
    m.provider === 'authorize_net' ? event.notificationId : event.event_id;
  if (
    typeof eventId !== 'string' ||
    !referencePattern.test(eventId) ||
    (m.provider === 'authorize_net' &&
      (!key.webhookId || event.webhookId !== key.webhookId))
  )
    throw new Error('Webhook subscription/event mismatch');
  // Return success to HTTP only AFTER this durable insert. No financial side effect;
  // a separately approved reconciler must fetch actual provider transaction facts.
  return inbox.recordWebhook(m, eventId, digest);
}
