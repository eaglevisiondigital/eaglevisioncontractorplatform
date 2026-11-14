import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  validateSandboxIntent,
  type SandboxIntent,
  type SandboxMerchant,
} from '../sandbox';
import type { SandboxTokenVault, TokenReference } from '../token-reference';
import { digestPattern, uuid } from '../../providers/safety';

export interface NmiLabBinding {
  merchant: SandboxMerchant;
  intent: SandboxIntent;
  customerId: string;
  actorId: string;
  sessionId: string;
  sourceDigest: string;
  consentDigest: string;
  csrfDigest: string;
  origin: string;
  validUntil: string;
}
export interface NmiLabAuthority {
  fixture: true;
  active: boolean;
  aal: 2;
  binding: NmiLabBinding;
}
export interface NmiLabPorts {
  testOnly: true;
  readCurrent: (signal: AbortSignal) => Promise<NmiLabAuthority>;
}
export interface NmiLabCeremony {
  readonly fixture: true;
  readonly ceremonyId: string;
  readonly state: string;
  readonly origin: string;
  readonly expiresAt: string;
}
const denied = () =>
  Error('NMI token handoff unavailable; reconcile original intent');
function plain(input: unknown, depth = 0): void {
  if (
    input === null ||
    typeof input !== 'object' ||
    depth > 4 ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    throw denied();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length > 16) throw denied();
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') throw denied();
    const d = descriptors[key];
    if (!('value' in d)) throw denied();
    if (d.value && typeof d.value === 'object') plain(d.value, depth + 1);
    else if (
      !['string', 'boolean', 'number'].includes(typeof d.value) ||
      (typeof d.value === 'string' && d.value.length > 4096)
    )
      throw denied();
  }
}
function data<T>(input: T, keys: readonly string[]): T {
  if (!input || typeof input !== 'object') throw denied();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(descriptors).some(
      (k) => typeof k !== 'string' || !keys.includes(k),
    ) ||
    keys.some((key) => !descriptors[key] || !('value' in descriptors[key]))
  )
    throw denied();
  plain(input);
  return structuredClone(input);
}
function binding(input: NmiLabBinding): Readonly<NmiLabBinding> {
  const b = data(input, [
    'merchant',
    'intent',
    'customerId',
    'actorId',
    'sessionId',
    'sourceDigest',
    'consentDigest',
    'csrfDigest',
    'origin',
    'validUntil',
  ]);
  const m = data(b.merchant, [
    'organizationId',
    'merchantConfigId',
    'provider',
    'mode',
    'approvalReference',
    'approvedUntil',
  ]);
  const i = data(b.intent, [
    'organizationId',
    'merchantConfigId',
    'invoiceId',
    'authorizationId',
    'idempotencyKey',
    'amountMinor',
    'currency',
    'expiresAt',
  ]);
  validateSandboxIntent(m, i);
  if (
    m.provider !== 'nmi' ||
    m.mode !== 'sandbox' ||
    ![
      m.organizationId,
      m.merchantConfigId,
      b.customerId,
      b.actorId,
      b.sessionId,
    ].every((v) => typeof v === 'string' && uuid.test(v)) ||
    typeof m.approvalReference !== 'string' ||
    m.approvalReference.trim().length < 8 ||
    !Number.isFinite(Date.parse(m.approvedUntil)) ||
    ![b.sourceDigest, b.consentDigest, b.csrfDigest].every(
      (v) => typeof v === 'string' && digestPattern.test(v),
    ) ||
    typeof b.origin !== 'string' ||
    !/^https:\/\/[a-z0-9-]+\.invalid$/.test(b.origin) ||
    !Number.isFinite(Date.parse(b.validUntil)) ||
    Date.parse(b.validUntil) <= Date.now()
  )
    throw denied();
  return Object.freeze({
    merchant: Object.freeze({
      organizationId: m.organizationId,
      merchantConfigId: m.merchantConfigId,
      provider: m.provider,
      mode: m.mode,
      approvalReference: m.approvalReference,
      approvedUntil: m.approvedUntil,
    }),
    intent: Object.freeze({
      organizationId: i.organizationId,
      merchantConfigId: i.merchantConfigId,
      invoiceId: i.invoiceId,
      authorizationId: i.authorizationId,
      idempotencyKey: i.idempotencyKey,
      amountMinor: i.amountMinor,
      currency: i.currency,
      expiresAt: i.expiresAt,
    }),
    customerId: b.customerId,
    actorId: b.actorId,
    sessionId: b.sessionId,
    sourceDigest: b.sourceDigest,
    consentDigest: b.consentDigest,
    csrfDigest: b.csrfDigest,
    origin: b.origin,
    validUntil: b.validUntil,
  });
}
const digest = (b: Readonly<NmiLabBinding>) =>
  createHash('sha256').update(JSON.stringify(b)).digest('hex');

/** Offline fictional-token custody only. No SDK/script loader, network, credential,
 * route, SQL or payment engine. One object owns one ephemeral ceremony/intent.
 * Real provider tokens/origins are deliberately rejected. Restart is not custody.
 */
export class NmiTokenHandoffLab implements SandboxTokenVault {
  readonly #binding: Readonly<NmiLabBinding>;
  readonly #readCurrent: NmiLabPorts['readCurrent'];
  readonly #expires: number;
  readonly #ceremonyId = randomUUID();
  readonly #state = randomBytes(32).toString('base64url');
  readonly #referenceId = randomUUID();
  #phase: 'new' | 'held' | 'open' | 'ready' | 'spent' | 'closed' = 'new';
  #token: string | undefined;
  constructor(input: NmiLabBinding, ports: NmiLabPorts) {
    try {
      const descriptors = Object.getOwnPropertyDescriptors(ports);
      if (
        Reflect.ownKeys(descriptors).some(
          (key) => !['testOnly', 'readCurrent'].includes(String(key)),
        ) ||
        descriptors.testOnly?.value !== true ||
        typeof descriptors.readCurrent?.value !== 'function'
      )
        throw denied();
      const readCurrent = descriptors.readCurrent
        .value as NmiLabPorts['readCurrent'];
      this.#binding = binding(input);
      this.#readCurrent = readCurrent;
      // Five minutes is a stricter local lab policy, not an asserted NMI TTL.
      this.#expires = Math.min(
        Date.now() + 300000,
        Date.parse(this.#binding.validUntil),
        Date.parse(this.#binding.merchant.approvedUntil),
        Date.parse(this.#binding.intent.expiresAt),
      );
    } catch {
      throw denied();
    }
  }
  #current() {
    if (Date.now() >= this.#expires || this.#phase === 'closed') throw denied();
    validateSandboxIntent(this.#binding.merchant, this.#binding.intent);
  }
  async #authority() {
    this.#current();
    const controller = new AbortController();
    const deadline = Math.min(Date.now() + 5000, this.#expires);
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(5000, this.#expires - Date.now()),
    );
    try {
      const current = await new Promise<NmiLabAuthority>((resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(denied()), {
          once: true,
        });
        Promise.resolve(this.#readCurrent(controller.signal)).then(
          resolve,
          () => reject(denied()),
        );
      });
      if (controller.signal.aborted || Date.now() >= deadline) throw denied();
      this.#current();
      const a = data(current, ['fixture', 'active', 'aal', 'binding']);
      if (
        a.fixture !== true ||
        a.active !== true ||
        a.aal !== 2 ||
        digest(binding(a.binding)) !== digest(this.#binding)
      )
        throw denied();
    } finally {
      clearTimeout(timeout);
    }
  }
  async begin(): Promise<NmiLabCeremony> {
    if (this.#phase !== 'new') throw denied();
    this.#phase = 'held';
    try {
      await this.#authority();
      this.#current();
      this.#phase = 'open';
      return Object.freeze({
        fixture: true,
        ceremonyId: this.#ceremonyId,
        state: this.#state,
        origin: this.#binding.origin,
        expiresAt: new Date(this.#expires).toISOString(),
      });
    } catch {
      throw denied();
    }
  }
  async receive(
    input: { ceremonyId: string; state: string; paymentToken: string },
    requestOrigin: string,
  ): Promise<Readonly<TokenReference>> {
    try {
      const callback = data(input, ['ceremonyId', 'state', 'paymentToken']);
      if (
        this.#phase !== 'open' ||
        callback.ceremonyId !== this.#ceremonyId ||
        callback.state !== this.#state ||
        requestOrigin !== this.#binding.origin ||
        typeof callback.paymentToken !== 'string' ||
        !/^fictional_nmi_[a-zA-Z0-9_-]{8,100}$/.test(callback.paymentToken)
      )
        throw denied();
      this.#phase = 'held';
      await this.#authority();
      this.#current();
      this.#token = callback.paymentToken;
      this.#phase = 'ready';
      return this.#reference();
    } catch {
      throw denied();
    }
  }
  #reference(): Readonly<TokenReference> {
    const b = this.#binding;
    return Object.freeze({
      id: this.#referenceId,
      organizationId: b.merchant.organizationId,
      merchantConfigId: b.merchant.merchantConfigId,
      customerId: b.customerId,
      provider: 'nmi',
      mode: 'sandbox',
      expiresAt: new Date(this.#expires).toISOString(),
    });
  }
  async resolve(
    input: Parameters<SandboxTokenVault['resolve']>[0],
  ): ReturnType<SandboxTokenVault['resolve']> {
    let claimed = false;
    try {
      const scope = data(input, [
        'id',
        'organizationId',
        'merchantConfigId',
        'customerId',
        'provider',
        'mode',
        'idempotencyKey',
      ]);
      const { expiresAt: _expiresAt, ...expected } = this.#reference();
      if (
        !_expiresAt ||
        this.#phase !== 'ready' ||
        scope.idempotencyKey !== this.#binding.intent.idempotencyKey ||
        Object.entries(expected).some(
          ([k, v]) => scope[k as keyof typeof scope] !== v,
        )
      )
        throw denied();
      this.#phase = 'held'; // Claim before await. Failure/UNKNOWN never restores it.
      claimed = true;
      await this.#authority();
      this.#current();
      if (!this.#token) throw denied();
      const value = this.#token;
      this.#token = undefined;
      this.#phase = 'spent';
      return {
        reference: this.#reference(),
        token: Object.freeze({ provider: 'nmi', value }),
      };
    } catch {
      if (claimed) this.#token = undefined;
      throw denied();
    }
  }
  close() {
    this.#phase = 'closed';
    this.#token = undefined;
  }
}
