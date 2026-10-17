import { createHmac } from 'node:crypto';
import { constantEqual, sha256 } from './safety';

function bounded(body: Uint8Array) {
  if (!body.length || body.length > 65536)
    throw new Error('Invalid webhook size');
}
// Authentication only. Callers must persist an atomic tenant/account/event inbox,
// resolve provider-account binding server-side and independently fetch/reconcile.
// A valid signature never directly authorizes ledger or agreement transitions.
export function authorizeNetWebhook(
  body: Uint8Array,
  signature: string,
  hexKey: string,
) {
  bounded(body);
  if (
    !/^[a-f0-9]{128}$/i.test(hexKey) ||
    !/^sha512=[a-f0-9]{128}$/i.test(signature)
  )
    throw new Error('Invalid webhook signature');
  const expected = createHmac('sha512', Buffer.from(hexKey, 'hex'))
    .update(body)
    .digest('hex');
  if (!constantEqual(signature.slice(7).toLowerCase(), expected))
    throw new Error('Invalid webhook signature');
  return sha256(body);
}
export function nmiPaymentWebhook(
  body: Uint8Array,
  header: string,
  key: string,
) {
  bounded(body);
  // NMI payment webhooks use nonce.rawBody; the similarly named underwriting
  // Signature header is a different protocol and must not be substituted.
  const match = /^t=([a-zA-Z0-9_-]{1,128}),s=([a-f0-9]{64})$/i.exec(header);
  if (!match || key.length < 16) throw new Error('Invalid webhook signature');
  const expected = createHmac('sha256', key)
    .update(match[1] + '.')
    .update(body)
    .digest('hex');
  if (!constantEqual(match[2].toLowerCase(), expected))
    throw new Error('Invalid webhook signature');
  // The documented nonce is not assumed to be a timestamp. Durable replay
  // exclusion is mandatory; do not invent a five-minute timestamp guarantee.
  return { bodyDigest: sha256(body), nonce: match[1] };
}
export function docusignConnectWebhook(
  body: Uint8Array,
  signature: string,
  key: string,
) {
  bounded(body);
  if (key.length < 16 || !/^[a-zA-Z0-9+/]{43}=$/.test(signature))
    throw new Error('Invalid webhook signature');
  const expected = createHmac('sha256', key).update(body).digest('base64');
  if (!constantEqual(signature, expected))
    throw new Error('Invalid webhook signature');
  return sha256(body);
}
export function resendWebhook(
  body: Uint8Array,
  headers: { id: string; timestamp: string; signature: string },
  key: string,
  now = Date.now(),
) {
  bounded(body);
  if (
    !/^whsec_[a-zA-Z0-9+/]+={0,2}$/.test(key) ||
    !/^[a-zA-Z0-9_-]{1,200}$/.test(headers.id) ||
    !/^[0-9]{10}$/.test(headers.timestamp) ||
    Math.abs(now - Number(headers.timestamp) * 1000) > 300000
  )
    throw new Error('Invalid webhook signature');
  const secret = Buffer.from(key.slice(6), 'base64');
  if (secret.length < 16) throw new Error('Invalid webhook key');
  const expected = createHmac('sha256', secret)
    .update(`${headers.id}.${headers.timestamp}.`)
    .update(body)
    .digest('base64');
  const signatures = headers.signature.split(' ');
  if (
    signatures.length > 5 ||
    !signatures.some(
      (v) =>
        /^v1,[a-zA-Z0-9+/]{43}=$/.test(v) &&
        constantEqual(v.slice(3), expected),
    )
  )
    throw new Error('Invalid webhook signature');
  return { eventId: headers.id, bodyDigest: sha256(body) };
}
