import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isUuid, requireFrozen, type FrozenP1 } from './package.ts';
export interface P1Identity {
  alias: string;
  userId: string;
  organizationId: string;
  owner: boolean;
  email: string;
  factorId?: string;
}
export interface RpcReply {
  data: unknown;
  code: string | null;
  status: number;
}
export interface P1Caller {
  verify(): Promise<{ userId: string; aal: string; sessionId: string }>;
  rpc(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<RpcReply>;
  signOut(): Promise<void>;
}
export interface P1Actors {
  get(organization: string, role: string): P1Caller;
  verifyAll(): Promise<void>;
}
/** No login/password reader. Accepts only existing normal-user sessions from an owner-assisted handoff. */
export class SupabaseP1Callers implements P1Actors {
  private users = new Map<
    string,
    { identity: P1Identity; caller: P1Caller; client: SupabaseClient }
  >();
  private aliases = new Map<string, P1Caller>();
  constructor(
    private frozen: FrozenP1,
    private publishableKey: string,
    private custody: {
      register(alias: string, token: string, factorId?: string): Promise<void>;
    },
    private transport: typeof fetch = fetch,
  ) {
    requireFrozen(frozen);
    if (
      !/^[a-z]{20}$/.test(frozen.target) ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)
    )
      throw Error('Exact development target and publishable key required');
  }
  private client(token: string) {
    const base = `https://${this.frozen.target}.supabase.co`;
    return createClient(base, this.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { Authorization: 'Bearer ' + token },
        fetch: (input, init) => {
          const u = new URL(
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.href
                : input.url,
          );
          if (
            u.origin !== base ||
            !(
              u.pathname === '/auth/v1/user' ||
              u.pathname === '/auth/v1/.well-known/jwks.json' ||
              u.pathname === '/auth/v1/logout' ||
              u.pathname.startsWith('/rest/v1/rpc/')
            )
          )
            throw Error('Unexpected caller endpoint');
          return this.transport(input, {
            ...init,
            redirect: 'error',
            signal: init?.signal ?? AbortSignal.timeout(12000),
          });
        },
      },
    });
  }
  async add(identity: P1Identity, token: string, originalAal1?: string) {
    if (
      !isUuid(identity.userId) ||
      !isUuid(identity.organizationId) ||
      this.users.has(identity.alias) ||
      /customer|platform/.test(identity.alias) ||
      !/^pilot-[123]-(owner|estimator|assigned-field|unassigned-field|revoked-staff)$/.test(
        identity.alias,
      )
    )
      throw Error('Staff handoff binding invalid');
    const expected = this.frozen.plan.companies
      .flatMap((c) => Object.values(c.actorBindings))
      .find((a) => a.alias === identity.alias);
    if (
      !expected ||
      expected.user_id !== identity.userId ||
      expected.organization_id !== identity.organizationId ||
      (expected.role === 'owner') !== identity.owner
    )
      throw Error('Frozen identity mismatch');
    identity = Object.freeze({ ...identity });
    const client = this.client(token);
    let safeToClose = false;
    const verifyToken = async (value: string, requireAal2: boolean) => {
      // getUser validates against Auth; getClaims verifies the exact signed token, never user_metadata.
      const [user, claims] = await Promise.all([
        client.auth.getUser(value),
        client.auth.getClaims(value),
      ]);
      const c = claims.data?.claims;
      if (
        value === token &&
        !user.error &&
        !claims.error &&
        user.data.user.id === identity.userId &&
        c?.sub === identity.userId &&
        c.role === 'authenticated' &&
        c.iss === `https://${this.frozen.target}.supabase.co/auth/v1`
      )
        safeToClose = true;
      if (
        user.error ||
        claims.error ||
        !c ||
        user.data.user.id !== identity.userId ||
        user.data.user.email !== identity.email ||
        !user.data.user.email_confirmed_at ||
        user.data.user.is_anonymous ||
        c.sub !== identity.userId ||
        c.role !== 'authenticated' ||
        c.iss !== `https://${this.frozen.target}.supabase.co/auth/v1` ||
        !isUuid(c.session_id) ||
        !Number.isFinite(c.exp) ||
        c.exp * 1000 <= Date.now() + 15000 ||
        (requireAal2 ? c.aal !== 'aal2' : c.aal !== 'aal1')
      )
        throw Error('Verified caller identity/AAL mismatch');
      if (
        requireAal2 &&
        (!identity.factorId ||
          !user.data.user.factors?.some(
            (f) =>
              f.id === identity.factorId &&
              f.factor_type === 'totp' &&
              f.status === 'verified',
          ))
      )
        throw Error('Existing owner factor mismatch');
      return {
        userId: identity.userId,
        aal: String(c.aal),
        sessionId: String(c.session_id),
      };
    };
    const signOut = async () => {
      const r = await this.transport(
        `https://${this.frozen.target}.supabase.co/auth/v1/logout?scope=global`,
        {
          method: 'POST',
          headers: {
            apikey: this.publishableKey,
            Authorization: 'Bearer ' + token,
          },
          redirect: 'error',
          signal: AbortSignal.timeout(12000),
        },
      );
      if (!r.ok) throw Error('Global session sign-out unconfirmed');
    };
    const make = (
      c: SupabaseClient,
      value: string,
      high: boolean,
    ): P1Caller => ({
      verify: () => verifyToken(value, high),
      rpc: async (name, args, signal) => {
        if (
          ![
            'property_command',
            'property_workspace',
            'submit_job_expense',
            'review_job_expense',
          ].includes(name)
        )
          throw Error('RPC outside P1 allowlist');
        const r = await c.rpc(name, args).abortSignal(signal);
        // Invalid/network responses must never become expected permission denials.
        return { data: r.data, code: r.error?.code ?? null, status: r.status };
      },
      signOut,
    });
    const caller = make(client, token, identity.owner);
    try {
      const bound = await caller.verify();
      if (identity.owner) {
        if (!originalAal1) throw Error('Original genuine AAL1 token required');
        const low = await verifyToken(originalAal1, false);
        if (low.sessionId !== bound.sessionId)
          throw Error('Owner token session changed');
        this.aliases.set(
          identity.organizationId + ':owner-original-aal1',
          make(this.client(originalAal1), originalAal1, false),
        );
      }
      await this.custody.register(identity.alias, token, identity.factorId);
      this.users.set(identity.alias, { identity, caller, client });
      const role = identity.alias.replace(/^pilot-[123]-/, '');
      this.aliases.set(identity.organizationId + ':' + role, caller);
      if (role === 'assigned-field')
        this.aliases.set(
          identity.organizationId + ':assigned-field-signed-out-same-jwt',
          caller,
        );
    } catch {
      if (safeToClose)
        try {
          await signOut();
        } catch {
          /* Independent cleanup must still verify zero sessions. */
        }
      throw Error('Verified session handoff failed; check independent cleanup');
    }
  }
  get(org: string, role: string) {
    const c = this.aliases.get(org + ':' + role);
    if (!c) throw Error('Frozen actor session absent');
    return c;
  }
  async verifyAll() {
    if (
      this.users.size !== 15 ||
      [...this.users.values()].filter((x) => x.identity.owner).length !== 3
    )
      throw Error('Exactly15 verified staff sessions required');
    for (const { caller } of this.users.values()) await caller.verify();
  }
  async closeAll() {
    const r = await Promise.allSettled(
      [...this.users.values()].map((x) => x.caller.signOut()),
    );
    if (r.some((x) => x.status === 'rejected'))
      throw Error('Session cleanup requires independent verification');
  }
}
