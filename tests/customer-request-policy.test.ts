import { expect, it, vi } from 'vitest';
import {
  authorizeCustomerRequest,
  validateCustomerCallback,
  customerDisabledResponse,
  type CustomerSecurityStore,
} from '../server/customer/request-policy';
const host = 'https://internal.example.test',
  csrf = 'a'.repeat(43),
  binding = 'b'.repeat(64);
const context = {
  userId: crypto.randomUUID(),
  sessionId: crypto.randomUUID(),
  csrf,
};
const store = (): CustomerSecurityStore => ({
  consumeRate: vi.fn().mockResolvedValue(true),
  consumeCallback: vi.fn().mockResolvedValue(true),
});
function request(headers: Record<string, string> = {}, body = '{}') {
  return new Request(host + '/api/customer/review', {
    method: 'POST',
    headers: {
      origin: host,
      'content-type': 'application/json',
      authorization: 'Bearer FIXTURE_ONLY',
      'x-csrf-token': csrf,
      ...headers,
    },
    body,
  });
}
it('prepared request policy uses verified session authority, strict origin/CSRF and a bounded atomic rate store', async () => {
  const s = store();
  expect(await authorizeCustomerRequest(request(), context, host, s)).toEqual(
    {},
  );
  expect(s.consumeRate).toHaveBeenCalledWith(
    context.userId + '/' + context.sessionId,
    '/api/customer/review',
    10,
    60,
  );
});
it.each<Record<string, string>>([
  { origin: 'https://evil.example' },
  { 'sec-fetch-site': 'cross-site' },
  { 'x-csrf-token': 'wrong' },
  { 'content-type': 'text/plain' },
  { authorization: 'none' },
  { 'content-length': '131073' },
])('prepared request policy rejects forged boundary %o', async (headers) => {
  await expect(
    authorizeCustomerRequest(request(headers), context, host, store()),
  ).rejects.toThrow();
});
it('actual bytes and store failure cannot bypass body/rate limits', async () => {
  await expect(
    authorizeCustomerRequest(
      request({}, JSON.stringify({ x: 'x'.repeat(131072) })),
      context,
      host,
      store(),
    ),
  ).rejects.toThrow();
  const s = store();
  s.consumeRate = async () => false;
  await expect(
    authorizeCustomerRequest(request(), context, host, s),
  ).rejects.toThrow();
});
it('PKCE handoff requires exact callback/state/cookie and atomic single-use binding; it performs no exchange', async () => {
  const s = store();
  expect(
    await validateCustomerCallback(
      host + '/portal/customer/callback?code=fixture_code&state=' + csrf,
      host,
      csrf,
      binding,
      s,
    ),
  ).toEqual({ code: 'fixture_code' });
  s.consumeCallback = async () => false;
  await expect(
    validateCustomerCallback(
      host + '/portal/customer/callback?code=fixture_code&state=' + csrf,
      host,
      csrf,
      binding,
      s,
    ),
  ).rejects.toThrow();
});
it.each([
  '&organization_id=forged',
  '&redirect_to=https://evil.example',
  '#access_token=fixture',
])('callback cannot smuggle tenant, redirect or token %s', async (extra) => {
  await expect(
    validateCustomerCallback(
      host +
        '/portal/customer/callback?code=fixture_code&state=' +
        csrf +
        extra,
      host,
      csrf,
      binding,
      store(),
    ),
  ).rejects.toThrow();
});
it('customer login remains server-disabled and non-cacheable', async () => {
  const r = customerDisabledResponse();
  expect(r.status).toBe(503);
  expect(r.headers.get('cache-control')).toBe('no-store');
});
