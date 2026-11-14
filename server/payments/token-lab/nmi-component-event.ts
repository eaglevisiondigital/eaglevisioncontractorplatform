import { isProxy } from 'node:util/types';
import { NmiTokenHandoffLab, type NmiLabCeremony } from './nmi-token-handoff';

// Capture the existing lab methods, not a later replacement on a caller object.
const receive = NmiTokenHandoffLab.prototype.receive;
const close = NmiTokenHandoffLab.prototype.close;
const unavailable = () =>
  Error('Offline NMI component handoff unavailable; reconcile original intent');
function descriptors(
  input: unknown,
  allowed: readonly string[],
  required: readonly string[],
) {
  if (
    !input ||
    typeof input !== 'object' ||
    isProxy(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    throw unavailable();
  const retained: Record<string, PropertyDescriptor> = {};
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !allowed.includes(key)) throw unavailable();
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor)) throw unavailable();
    // Optional lookupData is shape-checked only. Never copy its descriptor/value
    // into the record retained by the asynchronous handoff.
    if (required.includes(key)) retained[key] = descriptor;
  }
  if (required.some((key) => !Object.hasOwn(retained, key)))
    throw unavailable();
  return retained;
}

/** Node-only offline adapter for the documented onPay PaymentEvent shape.
 * It does not load an SDK, collect data, call a provider, or implement onChange,
 * wallets/3DS, genuine Auth or durable custody. Optional lookupData is never
 * traversed, copied, serialized or retained. Only fictional lab tokens can pass.
 */
export async function receiveNmiComponentOnPayLab(
  lab: NmiTokenHandoffLab,
  ceremony: NmiLabCeremony,
  event: unknown,
) {
  try {
    if (isProxy(lab) || !(lab instanceof NmiTokenHandoffLab))
      throw unavailable();
    const receipt = descriptors(
      ceremony,
      ['fixture', 'ceremonyId', 'state', 'origin', 'expiresAt'],
      ['fixture', 'ceremonyId', 'state', 'origin', 'expiresAt'],
    );
    const callback = descriptors(event, ['token', 'lookupData'], ['token']);
    event = undefined; // Release our event reference before any await.
    if (
      receipt.fixture.value !== true ||
      !['ceremonyId', 'state', 'origin', 'expiresAt'].every(
        (key) => typeof receipt[key].value === 'string',
      ) ||
      typeof callback.token.value !== 'string'
    )
      throw unavailable();
    const expectedExpiry = receipt.expiresAt.value as string;
    if (
      !Number.isFinite(Date.parse(expectedExpiry)) ||
      Date.parse(expectedExpiry) <= Date.now()
    )
      throw unavailable();
    const input = Object.freeze({
      ceremonyId: receipt.ceremonyId.value as string,
      state: receipt.state.value as string,
      paymentToken: callback.token.value,
    });
    const origin = receipt.origin.value as string;
    const reference = await receive.call(lab, input, origin);
    if (
      reference.expiresAt !== expectedExpiry ||
      Date.parse(reference.expiresAt) <= Date.now()
    ) {
      close.call(lab);
      throw unavailable();
    }
    return Object.freeze({
      fixture: true as const,
      status: 'TOKEN_REFERENCE_ONLY' as const,
      reference,
      paymentExecuted: false as const,
      settlement: 'UNVERIFIED' as const,
      // NMI onPay treats true as payment success. Token handoff cannot claim it.
      componentReply:
        'Offline handoff recorded; payment NOT EXECUTED.' as const,
    });
  } catch {
    throw unavailable();
  }
}
