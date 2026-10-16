import {
  providerJson,
  boundedBytes,
  exactKeys,
  sha256,
  uuid,
} from '../providers/safety';
import { resendWebhook } from '../providers/webhooks';

export interface TenantSenderProfile {
  organizationId: string;
  configurationId: string;
  version: number;
  providerAccountId: string;
  domainId: string;
  domain: string;
  fromEmail: string;
  replyTo: string;
  companyName: string;
  primaryColor: string;
}
export interface VerifiedSender {
  readonly verificationId: string;
  readonly checkedAt: number;
}
const evidence = new WeakMap<
  VerifiedSender,
  { profileDigest: string; expiresAt: number }
>();
const email =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,63}$/;
function profileDigest(p: TenantSenderProfile) {
  exactKeys(p, [
    'organizationId',
    'configurationId',
    'version',
    'providerAccountId',
    'domainId',
    'domain',
    'fromEmail',
    'replyTo',
    'companyName',
    'primaryColor',
  ]);
  if (
    ![p.organizationId, p.configurationId, p.domainId].every((v) =>
      uuid.test(v),
    ) ||
    !Number.isSafeInteger(p.version) ||
    p.version < 1 ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(p.providerAccountId) ||
    p.domain !== p.domain.toLowerCase() ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      p.domain,
    ) ||
    !email.test(p.fromEmail) ||
    !email.test(p.replyTo) ||
    p.fromEmail.split('@')[1] !== p.domain ||
    p.replyTo.split('@')[1] !== p.domain ||
    !p.companyName.trim() ||
    p.companyName.length > 160 ||
    /[\r\n]/.test(p.companyName) ||
    !/^#[a-f0-9]{6}$/i.test(p.primaryColor)
  )
    throw new Error('Invalid tenant sender');
  return sha256(
    JSON.stringify([
      p.organizationId,
      p.configurationId,
      p.version,
      p.providerAccountId,
      p.domainId,
      p.domain,
      p.fromEmail,
      p.replyTo,
      p.companyName,
      p.primaryColor,
    ]),
  );
}
export async function verifyTenantSender(
  profile: TenantSenderProfile,
  deps: {
    credential: Readonly<{
      organizationId: string;
      providerAccountId: string;
      value: string;
    }>;
    transport: typeof fetch;
    verifyDns: (domain: string) => Promise<{
      domain: string;
      spf: boolean;
      dkim: boolean;
      dmarc: boolean;
      checkedAt: number;
    }>;
  },
) {
  const p = Object.freeze({ ...profile }),
    digest = profileDigest(p);
  if (
    !deps.credential.value ||
    deps.credential.organizationId !== p.organizationId ||
    deps.credential.providerAccountId !== p.providerAccountId
  )
    throw new Error('Sender verification credential required');
  const response = await deps.transport(
    `https://api.resend.com/domains/${p.domainId}`,
    {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${deps.credential.value}` },
    },
  );
  const data = providerJson(
    (await boundedBytes(response, 65536)).toString('utf8'),
  );
  if (
    data.id !== p.domainId ||
    data.name !== p.domain ||
    data.status !== 'verified'
  )
    throw new Error('Provider domain unverified');
  const dns = await deps.verifyDns(p.domain);
  if (
    dns.domain !== p.domain ||
    dns.spf !== true ||
    dns.dkim !== true ||
    dns.dmarc !== true ||
    !Number.isFinite(dns.checkedAt) ||
    Math.abs(Date.now() - dns.checkedAt) > 300000
  )
    throw new Error('Current tenant DNS authentication required');
  const checkedAt = Date.now(),
    receipt = Object.freeze({ verificationId: crypto.randomUUID(), checkedAt });
  evidence.set(receipt, {
    profileDigest: digest,
    expiresAt: checkedAt + 15 * 60000,
  });
  return receipt;
}
/** Persist only opaque verification facts. Receipts are process-local evidence;
 * caller-created objects, copied receipts and changed profiles are rejected. */
export function senderVerificationRecord(
  profile: TenantSenderProfile,
  receipt: VerifiedSender,
) {
  const p = Object.freeze({ ...profile }),
    proof = evidence.get(receipt),
    digest = profileDigest(p);
  if (!proof || proof.expiresAt <= Date.now() || proof.profileDigest !== digest)
    throw new Error('Sender receipt expired or changed');
  return Object.freeze({
    id: receipt.verificationId,
    version: p.version,
    profileDigest: digest,
    accountId: p.providerAccountId,
    domainId: p.domainId,
    checkedAt: new Date(receipt.checkedAt).toISOString(),
    expiresAt: new Date(proof.expiresAt).toISOString(),
    digest: sha256(
      JSON.stringify([
        receipt.verificationId,
        digest,
        receipt.checkedAt,
        proof.expiresAt,
      ]),
    ),
  });
}
export interface CommunicationContext {
  organizationId: string;
  customerId: string;
  customerEmail: string;
  contactVerified: boolean;
  consent: boolean;
  suppressed: boolean;
  profile: TenantSenderProfile;
}
export interface CommunicationRepository {
  load(
    organizationId: string,
    customerId: string,
  ): Promise<CommunicationContext>;
}
function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}
export async function prepareTenantNotification(
  input: {
    organizationId: string;
    customerId: string;
    documentId: string;
    purpose: 'estimate_ready' | 'agreement_ready' | 'invoice_ready';
    reference: string;
  },
  receipt: VerifiedSender,
  repository: CommunicationRepository,
) {
  const i = Object.freeze({ ...input });
  exactKeys(i, [
    'organizationId',
    'customerId',
    'documentId',
    'purpose',
    'reference',
  ]);
  if (
    ![i.organizationId, i.customerId, i.documentId].every((v) =>
      uuid.test(v),
    ) ||
    !['estimate_ready', 'agreement_ready', 'invoice_ready'].includes(
      i.purpose,
    ) ||
    typeof i.reference !== 'string' ||
    !i.reference.trim() ||
    i.reference.length > 100 ||
    /[\r\n]/.test(i.reference)
  )
    throw new Error('Invalid notification');
  const context = await repository.load(i.organizationId, i.customerId);
  // Repository must resolve current permission/recipient, never accept an address
  // or tenant profile from public form data. Receipts cannot survive a profile edit.
  const p = { ...context.profile },
    proof = evidence.get(receipt);
  if (
    context.organizationId !== i.organizationId ||
    context.customerId !== i.customerId ||
    p.organizationId !== i.organizationId ||
    !email.test(context.customerEmail) ||
    !context.contactVerified ||
    !context.consent ||
    context.suppressed ||
    !proof ||
    proof.expiresAt <= Date.now() ||
    proof.profileDigest !== profileDigest(p)
  )
    throw new Error('Notification scope/consent/sender denied');
  const label = {
    estimate_ready: 'Estimate',
    agreement_ready: 'Agreement',
    invoice_ready: 'Invoice',
  }[i.purpose];
  const subject = `${p.companyName}: ${label} ${i.reference}`;
  const text = `${p.companyName}\n${label} ${i.reference} is prepared for review.\nInternal preparation only. No message has been sent.`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(subject)}</title></head><body><main style="border-top:4px solid ${p.primaryColor}"><h1>${escape(p.companyName)}</h1><p>${escape(label)} ${escape(i.reference)} is prepared for review.</p><p>Internal preparation only. No message has been sent.</p></main></body></html>`;
  return Object.freeze({
    organizationId: i.organizationId,
    customerId: i.customerId,
    documentId: i.documentId,
    from: p.fromEmail,
    replyTo: p.replyTo,
    to: context.customerEmail,
    subject,
    text,
    html,
    idempotencyKey: sha256(
      JSON.stringify([
        i.organizationId,
        i.customerId,
        i.documentId,
        i.purpose,
        p.configurationId,
        p.version,
      ]),
    ),
    delivery: 'disabled' as const,
    providerRequest: null,
  });
}

export function verifyTenantEmailEvent(
  raw: Uint8Array,
  headers: { id: string; timestamp: string; signature: string },
  secret: string,
  binding: {
    organizationId: string;
    providerAccountId: string;
    providerMessageId: string;
  },
) {
  const verified = resendWebhook(raw, headers, secret);
  exactKeys(binding, [
    'organizationId',
    'providerAccountId',
    'providerMessageId',
  ]);
  if (
    !uuid.test(binding.organizationId) ||
    !binding.providerAccountId ||
    !uuid.test(binding.providerMessageId)
  )
    throw new Error('Invalid email event binding');
  const event = providerJson(Buffer.from(raw).toString('utf8'));
  if (
    ![
      'email.sent',
      'email.delivered',
      'email.bounced',
      'email.complained',
    ].includes(event.type) ||
    event.data?.email_id !== binding.providerMessageId
  )
    throw new Error('Email event scope mismatch');
  // Persist facts via a future atomic inbox+suppression transaction. Older delivered
  // events must never clear a bounce/complaint suppression. No customer PII retained.
  return Object.freeze({
    ...binding,
    eventId: verified.eventId,
    bodyDigest: verified.bodyDigest,
    type: event.type as string,
    suppressionRequired:
      event.type === 'email.bounced' || event.type === 'email.complained',
  });
}
