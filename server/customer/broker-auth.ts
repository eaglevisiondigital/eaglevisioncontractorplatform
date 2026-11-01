import {
  ConnectedCustomerSdk,
  CustomerTokenCustody,
  type CustomerSdkConfiguration,
} from '../../src/lib/customer-connected';
import { reportUuid } from '../../src/domain/property/report-page';

export interface BrokerActor {
  user_id: string;
  session_id: string;
  aal: 'aal1' | 'aal2';
  expires_at: number;
}
const proofs = new WeakMap<
  object,
  { actor: BrokerActor; verifiedAt: number }
>();
/** A server-issued object reference, never a deserialized browser assertion. */
export type BrokerIdentity = Readonly<{ verified: true }>;
export function brokerActor(identity: BrokerIdentity): BrokerActor {
  const proof = proofs.get(identity),
    actor = proof?.actor;
  if (
    !actor ||
    !proof ||
    Date.now() - proof.verifiedAt > 30000 ||
    actor.expires_at * 1000 <= Date.now()
  )
    throw Error('Current verified broker identity required');
  return { ...actor };
}
/** Reuses actual pinned SDK getUser + current session-status contract. No login/refresh. */
export class CustomerBrokerAuth {
  constructor(
    private readonly config: CustomerSdkConfiguration,
    private readonly transport: typeof fetch = fetch,
  ) {}
  async verify(bearer: string): Promise<BrokerIdentity> {
    const custody = new CustomerTokenCustody();
    custody.adopt(bearer);
    const sdk = new ConnectedCustomerSdk(this.config, custody, this.transport);
    try {
      // Only after Auth has authenticated this EXACT bearer and the session RPC
      // confirms its current row do we inspect its already-authenticated claims.
      const current = await sdk.verifiedSession();
      const value: unknown = JSON.parse(
        Buffer.from(bearer.split('.')[1], 'base64url').toString('utf8'),
      );
      const c = value as Record<string, unknown>;
      if (
        !c ||
        typeof c !== 'object' ||
        Array.isArray(c) ||
        c.sub !== current.user_id ||
        c.session_id !== current.session_id ||
        !reportUuid(c.sub) ||
        !reportUuid(c.session_id) ||
        c.iss !== this.config.url.replace(/\/$/, '') + '/auth/v1' ||
        c.aud !== 'authenticated' ||
        c.role !== 'authenticated' ||
        (c.aal !== 'aal1' && c.aal !== 'aal2') ||
        typeof c.exp !== 'number' ||
        !Number.isSafeInteger(c.exp) ||
        c.exp * 1000 <= Date.now() ||
        typeof c.iat !== 'number' ||
        !Number.isSafeInteger(c.iat) ||
        c.iat * 1000 > Date.now() + 30000 ||
        c.iat >= c.exp
      )
        throw Error('Verified caller context required');
      const proof = Object.freeze({ verified: true as const });
      proofs.set(proof, {
        verifiedAt: Date.now(),
        actor: {
          user_id: current.user_id,
          session_id: current.session_id,
          aal: c.aal,
          expires_at: c.exp,
        },
      });
      return proof;
    } catch {
      throw Error('Verified broker identity unavailable');
    } finally {
      sdk.close();
      custody.clearIf(bearer);
    }
  }
}
