import { isProxy } from 'node:util/types';
import { createHash } from 'node:crypto';
import { NmiTokenHandoffLab, type NmiLabCeremony } from './nmi-token-handoff';
import { receiveNmiComponentOnPayLab } from './nmi-component-event';

const close = NmiTokenHandoffLab.prototype.close;
const unavailable = () =>
  Error('Offline NMI component unavailable; reconcile original intent');
const reply = 'Offline handoff only; payment NOT EXECUTED.' as const;
type Handoff = Awaited<ReturnType<typeof receiveNmiComponentOnPayLab>>;

// onChange is a local editing signal, never authorization or payment evidence.
// Only completion and a private fictional-token digest survive this shape check.
const tokenDigest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
function completed(event: unknown) {
  if (
    !event ||
    typeof event !== 'object' ||
    isProxy(event) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(event))
  )
    throw unavailable();
  let complete: boolean | undefined;
  let token: string | undefined;
  for (const key of Reflect.ownKeys(event)) {
    if (!['complete', 'token', 'lookupData'].includes(String(key)))
      throw unavailable();
    const d = Object.getOwnPropertyDescriptor(event, key);
    if (!d || !('value' in d)) throw unavailable();
    if (key === 'complete') {
      if (typeof d.value !== 'boolean') throw unavailable();
      complete = d.value;
    }
    if (key === 'token') {
      if (
        typeof d.value !== 'string' ||
        (d.value !== '' &&
          !/^fictional_nmi_[a-zA-Z0-9_-]{8,100}$/.test(d.value))
      )
        throw unavailable();
      token = d.value;
    }
    // lookupData is never read, traversed, copied or serialized.
  }
  if (complete === undefined || (complete && !token)) throw unavailable();
  return { complete, digest: complete ? tokenDigest(token!) : undefined };
}

/** Offline callback composition only. Reuses the original ceremony/vault and
 * onPay adapter, with no SDK, route, network, operational Auth or payment writer.
 * Any editing event after explicit submission permanently closes this instance.
 * A local reference is not an independently durable receipt or payment result.
 */
export function createNmiComponentCallbacksLab(
  lab: NmiTokenHandoffLab,
  ceremony: NmiLabCeremony,
) {
  if (isProxy(lab) || !(lab instanceof NmiTokenHandoffLab)) throw unavailable();
  if (
    !ceremony ||
    typeof ceremony !== 'object' ||
    isProxy(ceremony) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(ceremony))
  )
    throw unavailable();
  const keys = ['fixture', 'ceremonyId', 'state', 'origin', 'expiresAt'];
  const values: Record<string, string | true> = {};
  for (const key of Reflect.ownKeys(ceremony)) {
    if (typeof key !== 'string' || !keys.includes(key)) throw unavailable();
    const d = Object.getOwnPropertyDescriptor(ceremony, key);
    if (!d || !('value' in d)) throw unavailable();
    if (key === 'fixture' ? d.value !== true : typeof d.value !== 'string')
      throw unavailable();
    values[key] = d.value;
  }
  if (keys.some((key) => !Object.hasOwn(values, key))) throw unavailable();
  const captured = Object.freeze({ ...values }) as unknown as NmiLabCeremony;
  const expires = Date.parse(captured.expiresAt);
  if (!Number.isFinite(expires) || Date.now() >= expires) throw unavailable();
  let phase: 'editing' | 'pending' | 'ready' | 'closed' = 'editing';
  let complete = false;
  let expectedToken: string | undefined;
  let handoff: Handoff | undefined;
  const end = () => {
    phase = 'closed';
    complete = false;
    expectedToken = undefined;
    handoff = undefined;
    try {
      close.call(lab);
    } catch {
      // A fabricated prototype cannot provide a real lab's private custody.
    }
  };
  const current = () => {
    if (phase === 'closed' || Date.now() >= expires) {
      end();
      throw unavailable();
    }
  };
  return Object.freeze({
    onChange(event: unknown): void {
      try {
        current();
        // A later complete event may represent different fields/token too.
        if (phase !== 'editing') throw unavailable();
        const result = completed(event);
        complete = result.complete;
        expectedToken = result.digest;
      } catch {
        end();
        throw unavailable();
      }
    },
    async onPay(event: unknown): Promise<string> {
      try {
        current();
        if (phase !== 'editing' || !complete) return reply;
        phase = 'pending'; // Claim synchronously before the existing handoff await.
        if (!event || typeof event !== 'object' || isProxy(event))
          throw unavailable();
        const pending = (() => {
          const token = Object.getOwnPropertyDescriptor(event, 'token');
          if (
            !token ||
            !('value' in token) ||
            typeof token.value !== 'string' ||
            !/^fictional_nmi_[a-zA-Z0-9_-]{8,100}$/.test(token.value) ||
            tokenDigest(token.value) !== expectedToken
          )
            throw unavailable();
          expectedToken = undefined;
          return receiveNmiComponentOnPayLab(lab, captured, event);
        })();
        event = undefined;
        const result = await pending;
        current();
        if (phase !== 'pending') throw unavailable();
        handoff = result;
        phase = 'ready';
      } catch {
        end();
      }
      // Even successful token custody is not SDK payment-success true.
      return reply;
    },
    readHandoff(): Readonly<Handoff> {
      current();
      if (phase !== 'ready' || !complete || !handoff) throw unavailable();
      return handoff;
    },
    close: end,
  });
}
