import { afterEach, describe, expect, it, vi } from 'vitest';
import { organizationContext } from '../src/server/context';
const org = '10000000-0000-4000-8000-000000000001';
const user = '20000000-0000-4000-8000-000000000001';
const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
};
function request(query = org, token = 'test-token', method = 'GET') {
  return new Request(
    `https://app.example/api/organization-context?organization_id=${query}`,
    { method, headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
}
afterEach(() => vi.unstubAllGlobals());
describe('protected server context', () => {
  it('rejects anonymous requests, invalid IDs, unsupported methods and missing configuration', async () => {
    expect((await organizationContext(request(org, ''), env)).status).toBe(401);
    expect((await organizationContext(request('forged'), env)).status).toBe(
      400,
    );
    expect(
      (await organizationContext(request(org, 'test', 'POST'), env)).status,
    ).toBe(405);
    expect((await organizationContext(request(), {})).status).toBe(503);
  });
  it('validates the token with Auth, forwarding no unverified data', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: 'Invalid JWT' }, { status: 401 }),
      );
    vi.stubGlobal('fetch', fetch);
    expect((await organizationContext(request(), env)).status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('denies an authenticated user without the requested membership', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: user }))
      .mockResolvedValueOnce(Response.json(null));
    vi.stubGlobal('fetch', fetch);
    expect((await organizationContext(request(), env)).status).toBe(403);
    const membershipUrl = String(fetch.mock.calls[1][0]);
    expect(membershipUrl).toContain(`organization_id=eq.${org}`);
    expect(membershipUrl).toContain(`user_id=eq.${user}`);
    expect(membershipUrl).toContain('active=eq.true');
  });
  it('returns only an authorized profile using the callers bearer token', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: user }))
      .mockResolvedValueOnce(Response.json({ role: 'admin' }))
      .mockResolvedValueOnce(Response.json({ id: org, name: 'Test company' }));
    vi.stubGlobal('fetch', fetch);
    const response = await organizationContext(request(), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      organization: { id: org, name: 'Test company' },
      role: 'admin',
    });
    const headers = new Headers(fetch.mock.calls[2][1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer test-token');
  });
});
