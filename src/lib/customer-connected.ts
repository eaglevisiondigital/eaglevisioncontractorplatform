import {
  customerRequestBody,
  customerRequestReference,
  type CustomerRequestBody,
  type CustomerRequestReference,
} from './customer-requests';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './database.types';
import {
  PreparedCustomerAccess,
  type CustomerIdentityPort,
} from './customer-access';
import {
  PreparedCustomerDecision,
  type ReviewDecisionRequest,
} from './customer-decision';
import type { CustomerContext } from '../domain/customer/review';
import {
  parsePropertyReportPage,
  reportUuid,
} from '../domain/property/report-page';

// Forward proposal read signatures only; generated fourteen types remain unchanged.
type Functions = Database['public']['Functions'] & {
  customer_review_request_receipt: {
    Args: { p_org: string; p_ref: Json };
    Returns: Json;
  };
  customer_review_request_status: {
    Args: { p_org: string; p_body: Json };
    Returns: Json;
  };
  customer_change_request_queue: { Args: { p_org: string }; Returns: Json };
};
type PreparedDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Functions'> & { Functions: Functions };
};
type Capability = 'reads' | 'publishing' | 'decisions';
const rpcNames = [
  'customer_portal_discover',
  'customer_estimate_review',
  'customer_property_reports',
  'customer_publication_preview',
  'customer_publish_estimate',
  'customer_revoke_publication',
  'customer_publication_receipt',
  'customer_decision_context',
  'customer_record_decision',
  'customer_runtime_status',
  'customer_session_status',
  'customer_review_request_receipt',
  'customer_review_request_status',
  'customer_change_request_queue',
] as const;
type RpcName = (typeof rpcNames)[number];
/** Memory only. A future approved Auth broker supplies an existing access token, never identity authority. */
export class CustomerTokenCustody {
  #token: string | null = null;
  #listeners = new Set<() => void>();
  adopt(token: string) {
    if (
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ||
      token.length > 16384
    )
      throw Error('Session unavailable');
    this.#token = token;
    this.#listeners.forEach((f) => {
      try {
        f();
      } catch {
        /* A consumer cannot veto other session invalidations. */
      }
    });
  }
  read() {
    return this.#token;
  }
  clearIf(token: string) {
    if (this.#token === token) {
      this.#token = null;
      this.#listeners.forEach((f) => {
        try {
          f();
        } catch {
          /* A consumer cannot veto other session invalidations. */
        }
      });
    }
  }
  subscribe(fn: () => void) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }
  toJSON() {
    return { session: 'redacted' };
  }
}
export interface CustomerSdkConfiguration {
  url: string;
  publishableKey: string;
}
interface SessionStatus {
  user_id: string;
  session_id: string;
  active: boolean;
}
const shape = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).sort().join(',') === keys.sort().join(',');
function status(v: unknown, user: string): SessionStatus {
  if (
    !shape(v, ['user_id', 'session_id', 'active']) ||
    v.user_id !== user ||
    !reportUuid(v.session_id) ||
    typeof v.active !== 'boolean'
  )
    throw Error('Session unavailable');
  return v as unknown as SessionStatus;
}
/** Bound origin/endpoints, no cookies, redirects, refresh/sign-in, implicit retry or unbounded transport. */
export function customerFetch(
  config: CustomerSdkConfiguration,
  transport: typeof fetch = fetch,
): typeof fetch {
  const u = new URL(config.url);
  if (
    u.protocol !== 'https:' ||
    !/^[a-z0-9]{20}\.supabase\.co$/.test(u.hostname) ||
    u.pathname !== '/' ||
    u.search ||
    u.hash ||
    u.username ||
    u.password ||
    u.port ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey)
  )
    throw Error('Reviewed public SDK configuration required');
  return async (input, init = {}) => {
    const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      ),
      method = (
        init.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase();
    const allowed =
      url.origin === u.origin &&
      ((method === 'GET' && url.pathname === '/auth/v1/user' && !url.search) ||
        (method === 'POST' &&
          url.pathname === '/auth/v1/logout' &&
          url.search === '?scope=local') ||
        (method === 'POST' &&
          !url.search &&
          rpcNames.some((n) => url.pathname === '/rest/v1/rpc/' + n)));
    if (
      !allowed ||
      (typeof init.body === 'string' &&
        new TextEncoder().encode(init.body).length > 131072)
    )
      throw Error('Customer request unavailable');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await transport(input, {
            ...init,
            signal: AbortSignal.any([
              controller.signal,
              ...(init.signal ? [init.signal] : []),
            ]),
            credentials: 'omit',
            redirect: 'error',
            cache: 'no-store',
          });
          if (
            (response.status >= 300 && response.status < 400) ||
            Number(response.headers.get('content-length') ?? 0) > 2097152
          )
            throw Error();
          const reader = response.body?.getReader(),
            chunks: Uint8Array[] = [];
          let length = 0;
          if (reader)
            try {
              while (true) {
                const part = await reader.read();
                if (part.done) break;
                length += part.value.length;
                if (length > 2097152) throw Error();
                chunks.push(part.value);
              }
            } finally {
              reader.releaseLock();
            }
          const body = new Uint8Array(length);
          let offset = 0;
          for (const c of chunks) {
            body.set(c, offset);
            offset += c.length;
          }
          return new Response(
            [204, 205, 304].includes(response.status) ? null : body,
            {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            },
          );
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(Error('Customer request timed out'));
          }, 8000);
        }),
      ]);
    } catch {
      controller.abort();
      throw Error('Customer request unavailable');
    } finally {
      clearTimeout(timer);
    }
  };
}
/** Not mounted or auto-started. Genuine connected acceptance and permission/activation approval are still required. */
export class ConnectedCustomerSdk {
  #auth: SupabaseClient<Database>;
  #config: CustomerSdkConfiguration;
  #fetch: typeof fetch;
  #epoch = 0;
  #closed = false;
  #pendingLogout: { token: string; user: string; session: string } | null =
    null;
  #attempts = new Map<string, 'pending' | 'unknown' | 'confirmed'>();
  #unsubscribe: () => void;
  constructor(
    config: CustomerSdkConfiguration,
    readonly custody: CustomerTokenCustody,
    transport: typeof fetch = fetch,
  ) {
    this.#config = { ...config };
    this.#fetch = customerFetch(config, transport);
    this.#auth = createClient<Database>(config.url, config.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      db: { retry: false },
      global: { fetch: this.#fetch },
    });
    this.#unsubscribe = custody.subscribe(() => {
      this.#epoch++;
    });
  }
  private tokenClient(token: string) {
    return createClient<Database>(
      this.#config.url,
      this.#config.publishableKey,
      {
        accessToken: async () => token,
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        db: { retry: false },
        global: { fetch: this.#fetch },
      },
    );
  }
  private async invoke<N extends RpcName>(
    client: SupabaseClient<Database>,
    name: N,
    args: Functions[N]['Args'],
  ) {
    // Type correlation is preserved at each named adapter; the generated union overload erases it internally.
    const r = await (client as unknown as SupabaseClient<PreparedDatabase>)
      .rpc(name, args as never)
      .retry(false)
      .abortSignal(AbortSignal.timeout(8000));
    if (r.error) throw Error('Customer operation unavailable');
    return r.data as unknown;
  }
  private async capture(active = true) {
    const token = this.custody.read(),
      epoch = this.#epoch;
    if (this.#closed || this.#pendingLogout || !token)
      throw Error('Customer session unavailable');
    const verified = await this.#auth.auth.getUser(token);
    if (
      verified.error ||
      !verified.data.user ||
      !reportUuid(verified.data.user.id)
    )
      throw Error('Customer session unavailable');
    const client = this.tokenClient(token),
      s = status(
        await this.invoke(client, 'customer_session_status', {}),
        verified.data.user.id,
      );
    if (
      (active && !s.active) ||
      this.custody.read() !== token ||
      epoch !== this.#epoch
    )
      throw Error('Customer session unavailable');
    return {
      token,
      epoch,
      client,
      user: s.user_id,
      session: s.session_id,
      active: s.active,
    };
  }
  private async request<N extends RpcName>(
    name: N,
    args: Functions[N]['Args'],
    cap: Capability,
    attempt?: string,
  ) {
    const c = await this.capture();
    const runtime = await this.invoke(c.client, 'customer_runtime_status', {});
    if (
      !shape(runtime, ['reads', 'publishing', 'decisions', 'login']) ||
      runtime.login !== false ||
      !['reads', 'publishing', 'decisions'].every(
        (k) => typeof runtime[k] === 'boolean',
      ) ||
      runtime[cap] !== true
    )
      throw Error('Customer workflows disabled');
    if (c.epoch !== this.#epoch || c.token !== this.custody.read())
      throw Error('Customer session changed');
    const key = attempt ? c.user + '/' + attempt : null;
    if (key) {
      if (this.#attempts.has(key))
        throw Error('Existing attempt requires read-only reconciliation');
      this.#attempts.set(key, 'pending');
    }
    try {
      const result = await this.invoke(c.client, name, args);
      if (c.epoch !== this.#epoch || c.token !== this.custody.read())
        throw Error();
      if (name === 'customer_publish_estimate') {
        const p = (args as Functions['customer_publish_estimate']['Args'])
          .p as Record<string, Json>;
        if (
          !shape(result, ['publication_id', 'scope_sha256', 'expires_at']) ||
          !reportUuid(result.publication_id) ||
          result.scope_sha256 !== p.scope_sha256 ||
          typeof result.expires_at !== 'string' ||
          Date.parse(result.expires_at) !== Date.parse(String(p.expires_at))
        )
          throw Error();
      }
      if (name === 'customer_record_decision') {
        const p = args as Functions['customer_record_decision']['Args'];
        if (
          !shape(result, [
            'id',
            'request_id',
            'choice',
            'recorded_at',
            'scope_sha256',
          ]) ||
          !reportUuid(result.id) ||
          result.request_id !== p.p_request ||
          result.choice !== p.p_choice ||
          result.scope_sha256 !== p.p_digest ||
          typeof result.recorded_at !== 'string' ||
          !Number.isFinite(Date.parse(result.recorded_at))
        )
          throw Error();
      }
      if (
        name === 'customer_revoke_publication' &&
        result !== null &&
        result !== undefined &&
        result !== ''
      )
        throw Error();
      if (key) this.#attempts.set(key, 'confirmed');
      return result;
    } catch {
      if (key) {
        this.#attempts.set(key, 'unknown');
        throw Error('Customer mutation outcome UNKNOWN; never retry');
      }
      throw Error('Customer operation unavailable');
    }
  }
  identityPort(): CustomerIdentityPort {
    return {
      getUser: async () => {
        try {
          const c = await this.capture();
          return { data: { user: { id: c.user } }, error: null };
        } catch {
          return { data: { user: null }, error: Error('Session unavailable') };
        }
      },
      onAuthStateChange: (fn) => ({
        data: { subscription: { unsubscribe: this.custody.subscribe(fn) } },
      }),
    };
  }
  discover = () => this.request('customer_portal_discover', {}, 'reads');
  review = (c: CustomerContext, version: string) =>
    this.request(
      'customer_estimate_review',
      {
        p_org: c.organization_id,
        p_customer: c.customer_id,
        p_location: c.location_id,
        p_version: version,
      },
      'reads',
    );
  requestReceipt = (org: string, value: CustomerRequestReference) =>
    this.request(
      'customer_review_request_receipt',
      { p_org: org, p_ref: customerRequestReference(value) as unknown as Json },
      'reads',
    );
  requestStatus = (org: string, value: CustomerRequestBody) =>
    this.request(
      'customer_review_request_status',
      { p_org: org, p_body: customerRequestBody(value) as unknown as Json },
      'reads',
    );
  staffRequestQueue = (org: string) =>
    this.request('customer_change_request_queue', { p_org: org }, 'reads');
  reportPage = async (c: CustomerContext, before: string | null = null) =>
    parsePropertyReportPage(
      await this.request(
        'customer_property_reports',
        {
          p_org: c.organization_id,
          p_customer: c.customer_id,
          p_location: c.location_id,
          p_before: before,
        },
        'reads',
      ),
      {
        organization_id: c.organization_id,
        customer_id: c.customer_id,
        location_id: c.location_id,
      },
    );
  decisionContext = (c: CustomerContext, version: string) =>
    this.request(
      'customer_decision_context',
      {
        p_org: c.organization_id,
        p_customer: c.customer_id,
        p_location: c.location_id,
        p_version: version,
      },
      'reads',
    );
  recordDecision = (p: ReviewDecisionRequest) =>
    this.request(
      'customer_record_decision',
      {
        p_org: p.organization_id,
        p_publication: p.publication_id,
        p_digest: p.scope_sha256,
        p_choice: p.choice,
        p_ack: p.acknowledgment,
        p_request: p.request_id,
      },
      'decisions',
      'decision/' + p.organization_id + '/' + p.request_id,
    );
  publicationPreview = (org: string, p: Json) =>
    this.request(
      'customer_publication_preview',
      { p_org: org, p },
      'publishing',
    );
  publish = (org: string, p: Json & { request_id: string }) =>
    this.request(
      'customer_publish_estimate',
      { p_org: org, p },
      'publishing',
      'publish/' + org + '/' + p.request_id,
    );
  publicationReceipt = (
    org: string,
    request: string | null,
    publication: string | null = null,
  ) =>
    this.request(
      'customer_publication_receipt',
      { p_org: org, p_request: request, p_publication: publication },
      'publishing',
    );
  revoke = (org: string, publication: string) =>
    this.request(
      'customer_revoke_publication',
      { p_org: org, p_publication: publication },
      'publishing',
      'revoke/' + org + '/' + publication,
    );
  async logoutLocal() {
    const c = await this.capture(false);
    this.#epoch++;
    this.#pendingLogout = { token: c.token, user: c.user, session: c.session };
    this.custody.clearIf(c.token);
    if (c.active) {
      // SDK method naming does not confer admin authority: apikey remains publishable and jwt is exactly the caller's frozen token.
      // Avoid signOut() selecting a later account/session after an Auth change. Only POST /logout?scope=local is permitted.
      try {
        await this.#auth.auth.admin.signOut(c.token, 'local');
      } catch {
        /* Read-only verification settles success or UNKNOWN; no logout retry. */
      }
    }
    return this.verifyLogout();
  }
  async verifyLogout() {
    const p = this.#pendingLogout;
    if (!p) throw Error('No pending local logout');
    try {
      const s = status(
        await this.invoke(
          this.tokenClient(p.token),
          'customer_session_status',
          {},
        ),
        p.user,
      );
      if (s.session_id !== p.session || s.active) throw Error();
      this.#pendingLogout = null;
      return { revoked: true as const };
    } catch {
      throw Error('Local logout UNKNOWN; read-only verification required');
    }
  }
  close() {
    this.#closed = true;
    this.#epoch++;
    this.#unsubscribe();
  }
  toJSON() {
    return { customerSdk: 'redacted', connectedRoute: false };
  }
}
/** Reuses existing prepared readers and strict report parser; no sample fallback, sign-in, router or credential persistence. */
export function composeCustomerSession(sdk: ConnectedCustomerSdk) {
  const auth = sdk.identityPort(),
    access = new PreparedCustomerAccess(auth, {
      discover: sdk.discover,
      review: sdk.review,
    }),
    decisions = new PreparedCustomerDecision(auth, access, {
      context: sdk.decisionContext,
      record: sdk.recordDecision,
    });
  return {
    access,
    decisions,
    reports: async (c: CustomerContext, before: string | null = null) => {
      const fresh = await access.discover();
      const exact = fresh.find(
        (x) =>
          x.organization_id === c.organization_id &&
          x.customer_id === c.customer_id &&
          x.location_id === c.location_id &&
          x.reports,
      );
      if (!exact) throw Error('Customer reports unavailable');
      return sdk.reportPage(exact, before);
    },
    close: () => {
      decisions.close();
      access.close();
      sdk.close();
    },
  };
}
