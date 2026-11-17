import { afterEach, expect, it, vi } from 'vitest';
import {
  readConnectedPreflight,
  type ReadPreflightTarget,
} from '../server/staging/preflight';
const epoch = Date.UTC(2026, 10, 17, 12);
afterEach(() => vi.restoreAllMocks());
function fixture(lifetime = 3600000) {
  let now = epoch;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const target: ReadPreflightTarget = {
    supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
    publishableKey: 'sb_publishable_synthetic',
    approvalReference: 'Synthetic window qualification',
    expiresAt: new Date(epoch + lifetime).toISOString(),
  };
  const valid = (url: string, init?: RequestInit) => {
    if (url.endsWith('/auth/v1/settings'))
      return Response.json({
        disable_signup: true,
        external: { email: true, phone: false },
      });
    if (url.endsWith('/storage/v1/bucket')) return Response.json([]);
    if (new Headers(init?.headers).has('Accept-Profile'))
      return Response.json({ code: 'PGRST106' }, { status: 406 });
    return Response.json({ code: '42501' }, { status: 401 });
  };
  return {
    target,
    valid,
    advance: (milliseconds: number) => {
      now = epoch + milliseconds;
    },
  };
}
it('stops after the approval expires while the first response body is read', async () => {
  const f = fixture();
  const transport = vi.fn<typeof fetch>(async (url, init) => {
    const response = f.valid(String(url), init);
    const body = response.json.bind(response);
    response.json = async () => {
      const value = await body();
      f.advance(3600000);
      return value;
    };
    return response;
  });
  await expect(readConnectedPreflight(f.target, transport)).rejects.toThrow(
    /window|expired/i,
  );
  expect(transport).toHaveBeenCalledTimes(1);
});
it('rejects expiry after headers without reading the response body', async () => {
  const f = fixture();
  const body = vi.fn(async () => ({
    disable_signup: true,
    external: { email: true, phone: false },
  }));
  const transport = vi.fn<typeof fetch>(async () => {
    f.advance(3600000);
    const response = Response.json({});
    response.json = body;
    return response;
  });
  await expect(readConnectedPreflight(f.target, transport)).rejects.toThrow(
    /window|expired/i,
  );
  expect(body).not.toHaveBeenCalled();
  expect(transport).toHaveBeenCalledTimes(1);
});
it('does not report success when the final response outlives approval', async () => {
  const f = fixture();
  const transport = vi.fn<typeof fetch>(async (url, init) => {
    const response = f.valid(String(url), init);
    if (String(url).endsWith('/rpc/release_contexts')) {
      const body = response.json.bind(response);
      response.json = async () => {
        const value = await body();
        f.advance(3600000);
        return value;
      };
    }
    return response;
  });
  await expect(readConnectedPreflight(f.target, transport)).rejects.toThrow(
    /window|expired/i,
  );
  expect(String(transport.mock.calls.at(-1)?.[0])).toContain(
    '/rpc/release_contexts',
  );
});
it('bounds every request timeout by the remaining approval window', async () => {
  const f = fixture(500);
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  const transport = vi.fn<typeof fetch>(async (url, init) =>
    f.valid(String(url), init),
  );
  expect((await readConnectedPreflight(f.target, transport)).failed).toBe(0);
  expect(timeout).toHaveBeenCalled();
  for (const [milliseconds] of timeout.mock.calls)
    expect(milliseconds).toBe(500);
});
it('validates the same captured URL that is used for every read', async () => {
  const f = fixture();
  let reads = 0;
  Object.defineProperty(f.target, 'supabaseUrl', {
    enumerable: true,
    get: () =>
      ++reads === 1
        ? 'https://abcdefghijklmnopqrst.supabase.co'
        : 'https://example.invalid',
  });
  const transport = vi.fn<typeof fetch>(async (url, init) =>
    f.valid(String(url), init),
  );
  expect((await readConnectedPreflight(f.target, transport)).failed).toBe(0);
  expect(reads).toBe(1);
  for (const [url] of transport.mock.calls)
    expect(
      String(url).startsWith('https://abcdefghijklmnopqrst.supabase.co/'),
    ).toBe(true);
});
it('rejects URL-shaped objects before any transport call', async () => {
  const f = fixture();
  Object.assign(f.target, {
    supabaseUrl: {
      toString: () => 'https://abcdefghijklmnopqrst.supabase.co',
      replace: () => 'https://example.invalid',
    },
  });
  const transport = vi.fn<typeof fetch>(async (url, init) =>
    f.valid(String(url), init),
  );
  await expect(readConnectedPreflight(f.target, transport)).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
});
it('stops if the approval clock moves backwards during a read', async () => {
  const f = fixture();
  const transport = vi.fn<typeof fetch>(async (url, init) => {
    const response = f.valid(String(url), init);
    f.advance(-1);
    return response;
  });
  await expect(readConnectedPreflight(f.target, transport)).rejects.toThrow(
    /window|clock/i,
  );
  expect(transport).toHaveBeenCalledTimes(1);
});
it('retains a captured target despite later mutation of the input', async () => {
  const f = fixture();
  const transport = vi.fn<typeof fetch>(async (url, init) => {
    f.target.supabaseUrl = 'https://example.invalid';
    f.target.publishableKey = 'sb_secret_unusable';
    f.target.expiresAt = '2000-01-01';
    return f.valid(String(url), init);
  });
  const result = await readConnectedPreflight(f.target, transport);
  expect(result.failed).toBe(0);
  expect(JSON.stringify(result)).not.toMatch(
    /synthetic|sb_secret|example.invalid/,
  );
  for (const [url, init] of transport.mock.calls) {
    expect(
      String(url).startsWith('https://abcdefghijklmnopqrst.supabase.co/'),
    ).toBe(true);
    expect(new Headers(init?.headers).get('apikey')).toBe(
      'sb_publishable_synthetic',
    );
  }
});
