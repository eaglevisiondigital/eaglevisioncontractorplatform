import { timingSafeEqual } from 'node:crypto';
const same = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
export interface CustomerSecurityStore {
  consumeCallback(
    state: string,
    binding: string,
    now: number,
  ): Promise<boolean>;
  consumeRate(
    key: string,
    action: string,
    limit: number,
    windowSeconds: number,
  ): Promise<boolean>;
}
const origin = (s: string) => {
  const u = new URL(s);
  if (u.protocol !== 'https:' || u.origin !== s || u.username || u.password)
    throw Error('Customer request unavailable');
  return u.origin;
};
async function bounded<T>(p: Promise<T>, milliseconds = 2000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(Error('Security store unavailable')),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
/** Dormant BFF policy, never a registered endpoint. Context must come from server-verified Auth + session status. */
export async function authorizeCustomerRequest(
  request: Request,
  context: { userId: string; sessionId: string; csrf: string },
  expectedOrigin: string,
  store: CustomerSecurityStore,
) {
  const trusted = origin(expectedOrigin),
    url = new URL(request.url);
  if (
    url.origin !== trusted ||
    request.method !== 'POST' ||
    ![
      '/api/customer/review',
      '/api/customer/publish',
      '/api/customer/revoke',
    ].includes(url.pathname) ||
    url.search ||
    request.headers.get('origin') !== trusted ||
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    request.headers.get('content-type')?.split(';')[0] !== 'application/json' ||
    !/^Bearer [A-Za-z0-9_.-]+$/.test(
      request.headers.get('authorization') ?? '',
    ) ||
    !/^[-A-Za-z0-9_]{43}$/.test(context.csrf) ||
    !same(request.headers.get('x-csrf-token') ?? '', context.csrf)
  )
    throw Error('Customer request unavailable');
  if (
    ![context.userId, context.sessionId].every((x) =>
      /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(x),
    )
  )
    throw Error('Customer request unavailable');
  const size = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(size) || size < 0 || size > 131072)
    throw Error('Customer request unavailable');
  // No IP/user/tenant selector supplied by the request is accepted as a rate authority.
  if (
    !(await bounded(
      store.consumeRate(
        context.userId + '/' + context.sessionId,
        url.pathname,
        10,
        60,
      ),
    ))
  )
    throw Error('Customer request unavailable');
  // Read incrementally so absent/forged Content-Length cannot bypass the actual byte cap.
  const reader = request.body?.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  const deadline = performance.now() + 2000;
  if (reader)
    try {
      while (true) {
        const remaining = deadline - performance.now();
        if (remaining <= 0) throw Error('Customer request unavailable');
        const part = await bounded(reader.read(), remaining);
        if (part.done) break;
        bytes += part.value.length;
        if (bytes > 131072) throw Error('Customer request unavailable');
        chunks.push(part.value);
      }
    } finally {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  const body = Buffer.concat(chunks);
  try {
    const value: unknown = JSON.parse(body.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error();
    return value;
  } catch {
    throw Error('Customer request unavailable');
  }
}
/** Checks only a PKCE authorization-code handoff. It does not exchange a code, sign in or accept tenant selectors. */
export async function validateCustomerCallback(
  url: string,
  expectedOrigin: string,
  cookieState: string,
  binding: string,
  store: CustomerSecurityStore,
  now = Date.now(),
) {
  const u = new URL(url),
    trusted = origin(expectedOrigin),
    state = u.searchParams.get('state') ?? '',
    code = u.searchParams.get('code') ?? '';
  if (
    u.origin !== trusted ||
    u.pathname !== '/portal/customer/callback' ||
    u.hash ||
    u.username ||
    u.password ||
    [...u.searchParams.keys()].sort().join(',') !== 'code,state' ||
    !/^[-A-Za-z0-9_]{32,128}$/.test(state) ||
    !/^[-A-Za-z0-9_]{1,512}$/.test(code) ||
    !same(state, cookieState) ||
    !/^[a-f0-9]{64}$/.test(binding) ||
    !Number.isSafeInteger(now) ||
    !(await bounded(store.consumeCallback(state, binding, now)))
  )
    throw Error('Customer callback unavailable');
  return { code };
}
export const customerDisabledResponse = () =>
  new Response('Customer access is not enabled.', {
    status: 503,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
