import { afterEach, it, expect, vi } from 'vitest';
const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ staff: true })),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  createClient.mockClear();
});
for (const path of [
  '/portal/customer/callback',
  '/portal/customer',
  '/portal/property',
  '/preview/customer-portal',
])
  it(`closed route ${path} cannot initialize staff SDK or consume Auth callback`, async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    vi.stubGlobal('window', {
      location: { pathname: path, search: '?code=unapproved' },
    });
    expect((await import('../src/lib/supabase')).supabase).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });
it('ordinary staff route retains its existing SDK composition', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  vi.stubGlobal('window', { location: { pathname: '/' } });
  expect((await import('../src/lib/supabase')).supabase).toEqual({
    staff: true,
  });
  expect(createClient).toHaveBeenCalledTimes(1);
});
