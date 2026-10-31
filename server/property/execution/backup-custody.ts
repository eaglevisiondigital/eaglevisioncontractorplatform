import {
  createCipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { inspect } from 'node:util';
import { requireFrozen, type FrozenP1 } from './package.ts';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}

/** Encrypted file-message protocol, no listener, login or credential reader.
 * The transport moves encrypted envelopes/receipts between independent devices.
 * The shared key is per run, supplied in memory through separately approved custody.
 */
export class P1BackupCustody {
  private binding: Record<string, string>;
  private encryption: Buffer;
  private acknowledgment: Buffer;
  private states = new Map<
    string,
    { phase: string; tokenHash?: string; session?: string }
  >();
  private stopped = false;
  private heartbeatCounter = 0;
  private acknowledged = new Map<string, Set<string>>();
  constructor(
    private frozen: FrozenP1,
    key: Uint8Array,
    run: string,
    private exchange: (encryptedEnvelope: string) => Promise<unknown>,
  ) {
    requireFrozen(frozen);
    if (key.length !== 32 || !/^[a-f0-9-]{36}$/.test(run))
      throw Error('Per-run backup custody required');
    this.binding = {
      operation: frozen.operationHash,
      target: frozen.target,
      run,
      protocol: 'propel-p1-custody-v1',
    };
    const material = Buffer.from(
      hkdfSync(
        'sha256',
        key,
        createHash('sha256').update(canonical(this.binding)).digest(),
        'propel-p1-custody-v1',
        64,
      ),
    );
    this.encryption = Buffer.from(material.subarray(0, 32));
    this.acknowledgment = Buffer.from(material.subarray(32));
    material.fill(0);
  }
  private allowed(alias: string) {
    if (
      this.stopped ||
      !/^pilot-[123]-(owner|estimator|assigned-field|unassigned-field|revoked-staff)$/.test(
        alias,
      ) ||
      !this.frozen.plan.companies.some((c) =>
        Object.values(c.actorBindings).some((a) => a.alias === alias),
      )
    )
      throw Error('Backup custody unavailable');
  }
  private async send(alias: string, kind: string, token: string) {
    const id = randomUUID();
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryption, nonce);
    cipher.setAAD(
      Buffer.from(canonical({ ...this.binding, purpose: 'handoff' })),
    );
    const encrypted = Buffer.concat([
      cipher.update(
        canonical({
          id,
          alias,
          kind,
          token,
          issued: Math.floor(Date.now() / 1000),
        }),
      ),
      cipher.final(),
    ]);
    const packet = Buffer.concat([
      nonce,
      encrypted,
      cipher.getAuthTag(),
    ]).toString('base64');
    const receipt = {
      id,
      kind,
      packetHash: createHash('sha256').update(packet).digest('hex'),
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const raw = await Promise.race([
        this.exchange(packet),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(Error('Backup acknowledgment absent')),
            10000,
          );
        }),
      ]);
      const ack = raw as { receipt?: unknown; mac?: string } | null;
      const expected = createHmac('sha256', this.acknowledgment)
        .update(canonical({ ...this.binding, receipt }))
        .digest();
      if (
        !ack ||
        typeof ack.mac !== 'string' ||
        !/^[a-f0-9]{64}$/.test(ack.mac) ||
        canonical(ack.receipt) !== canonical(receipt) ||
        !timingSafeEqual(Buffer.from(ack.mac, 'hex'), expected) ||
        this.stopped
      )
        throw Error('Backup acknowledgment invalid');
    } catch {
      this.stopped = true;
      throw Error('Independent custody UNKNOWN; stop and contain, never retry');
    } finally {
      clearTimeout(timer);
    }
  }
  /** Must receive durable backup intent ACK BEFORE any external password sign-in.
   * A creation failure/lost response leaves an unresolved intent on the backup.
   * This method never creates a session. No callback retry or UID-only revocation.
   */
  async reserveCreation(alias: string) {
    this.allowed(alias);
    if (this.states.has(alias))
      throw Error('Duplicate creation intent forbidden');
    this.states.set(alias, { phase: 'UNKNOWN' });
    await this.send(alias, 'INTENT', '');
    this.states.set(alias, { phase: 'INTENT' });
  }
  async accept(alias: string, token: string) {
    this.allowed(alias);
    const state = this.states.get(alias);
    if (!state) throw Error('Durable creation intent required');
    const hash = createHash('sha256').update(token).digest('hex');
    if (state.tokenHash === hash) return; // Same acknowledged bytes, no second message.
    if (!['INTENT', 'SESSION'].includes(state.phase))
      throw Error('Durable creation intent required');
    let session: string;
    try {
      const claims = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      );
      session = claims.session_id;
      if (
        !/^[a-f0-9-]{36}$/.test(session) ||
        (state.session && state.session !== session) ||
        (state.phase === 'SESSION' && !alias.endsWith('-owner'))
      )
        throw Error();
    } catch {
      this.stopped = true;
      throw Error('Session framing invalid; independently contain');
    }
    const kind = state.phase === 'INTENT' ? 'SESSION' : 'UPGRADE';
    this.states.set(alias, { phase: 'UNKNOWN' });
    await this.send(alias, kind, token);
    this.states.set(alias, {
      phase: kind === 'UPGRADE' ? 'UPGRADED' : 'SESSION',
      tokenHash: hash,
      session,
    });
    const known = this.acknowledged.get(alias) ?? new Set<string>();
    known.add(hash);
    this.acknowledged.set(alias, known);
  }
  assertAcknowledged(alias: string, token: string) {
    this.allowed(alias);
    const state = this.states.get(alias);
    if (
      !state ||
      !['SESSION', 'UPGRADED'].includes(state.phase) ||
      !this.acknowledged
        .get(alias)
        ?.has(createHash('sha256').update(token).digest('hex'))
    )
      throw Error('Exact session lacks independent backup acknowledgment');
  }
  assertReady() {
    if (this.stopped || this.states.size !== 15)
      throw Error('Independent custody incomplete');
    for (const [alias, state] of this.states)
      if (state.phase !== (alias.endsWith('-owner') ? 'UPGRADED' : 'SESSION'))
        throw Error(
          'All fifteen sessions and three genuine owner upgrades required',
        );
  }
  matches(frozen: FrozenP1) {
    requireFrozen(frozen);
    return (
      frozen.operationHash === this.frozen.operationHash &&
      frozen.target === this.frozen.target
    );
  }
  /** Encrypted heartbeat for the independent device; never renews human presence. */
  heartbeatEnvelope() {
    if (this.stopped) throw Error('Backup custody stopped');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryption, nonce);
    cipher.setAAD(
      Buffer.from(canonical({ ...this.binding, purpose: 'heartbeat' })),
    );
    return Buffer.concat([
      nonce,
      cipher.update(
        canonical({
          counter: ++this.heartbeatCounter,
          issued: Math.floor(Date.now() / 1000),
        }),
      ),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64');
  }
  stop() {
    this.stopped = true;
    this.encryption.fill(0);
    this.acknowledgment.fill(0);
  }
  toJSON() {
    return { status: 'REDACTED_INDEPENDENT_CUSTODY' };
  }
  [inspect.custom]() {
    return 'P1BackupCustody(keys_and_sessions_redacted)';
  }
}
