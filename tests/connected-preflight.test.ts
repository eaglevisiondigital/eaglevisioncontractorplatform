import { expect, it, vi } from 'vitest';
import {
  readConnectedPreflight,
  validateReadTarget,
  type ReadPreflightTarget,
} from '../server/staging/preflight';
import { tenantTables, pilotNames } from '../server/staging/acceptance';
import { acceptanceRoster, acceptanceRoles } from '../server/staging/roster';
const target = (): ReadPreflightTarget => ({
  supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
  publishableKey: 'sb_publishable_synthetic',
  approvalReference: 'Synthetic read-only test',
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
});
const response = (url: string) =>
  url.endsWith('/auth/v1/settings')
    ? Response.json({
        disable_signup: true,
        external: { email: true, phone: false },
      })
    : Response.json(
        url.includes('schema-probe-never') ? {} : { code: '42501' },
        { status: 401 },
      );
it('performs bounded read-only HTTP checks without logging bodies or credentials', async () => {
  const transport = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith('/storage/v1/bucket')) return Response.json([]);
    if (new Headers(init?.headers).has('Accept-Profile'))
      return Response.json({ code: 'PGRST106' }, { status: 406 });
    return response(String(url));
  });
  const report = await readConnectedPreflight(target(), transport);
  expect(report.failed).toBe(0);
  expect(report.passed).toBe(tenantTables.length + 6);
  for (const [, init] of transport.mock.calls) {
    expect(init?.method).toBe('GET');
    expect(init?.redirect).toBe('error');
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  }
  expect(JSON.stringify(report)).not.toContain('sb_publishable');
  expect(JSON.stringify(report)).not.toContain('42501');
});
it.each([
  'foreign-host',
  'credentials',
  'expiry',
  'missing-approval',
  'service-key',
  'query',
  'future-expiry',
])('rejects invalid preflight configuration: %s', async (mode) => {
  const t = target();
  if (mode === 'foreign-host') t.supabaseUrl = 'https://example.com';
  if (mode === 'credentials')
    t.supabaseUrl = 'https://user:pass@abcdefghijklmnopqrst.supabase.co';
  if (mode === 'expiry') t.expiresAt = '2000-01-01';
  if (mode === 'future-expiry')
    t.expiresAt = new Date(Date.now() + 2 * 86400000).toISOString();
  if (mode === 'missing-approval') t.approvalReference = '';
  if (mode === 'service-key') t.publishableKey = 'sb_secret_bad';
  if (mode === 'query') t.supabaseUrl += '?x=1';
  expect(() => validateReadTarget(t)).toThrow();
  const transport = vi.fn<typeof fetch>();
  await expect(readConnectedPreflight(t, transport)).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
});
it.each([
  'empty-success',
  'server-error',
  'wrong-error',
  'signup-enabled',
  'schema-still-exposed',
])(
  'records %s as failed rather than accepting a vacuous denial',
  async (mode) => {
    const transport = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith('/auth/v1/settings'))
        return Response.json({
          disable_signup: mode !== 'signup-enabled',
          external: { email: true, phone: false },
        });
      if (String(url).endsWith('/storage/v1/bucket')) return Response.json([]);
      if (new Headers(init?.headers).has('Accept-Profile'))
        return mode === 'schema-still-exposed'
          ? Response.json([])
          : Response.json({ code: 'PGRST106' }, { status: 406 });
      if (mode === 'empty-success') return Response.json([]);
      if (mode === 'server-error')
        return Response.json({ code: '42501' }, { status: 500 });
      if (mode === 'wrong-error')
        return Response.json({ code: 'PGRST301' }, { status: 401 });
      return Response.json({ code: '42501' }, { status: 401 });
    });
    expect(
      (await readConnectedPreflight(target(), transport)).failed,
    ).toBeGreaterThan(0);
  },
);
it('propagates transport failures instead of declaring security success', async () => {
  await expect(
    readConnectedPreflight(target(), async () => {
      throw new Error('offline');
    }),
  ).rejects.toThrow('offline');
});
it('plans 22 distinct identities covering seven roles in each company without assigning authority', () => {
  const roster = acceptanceRoster();
  expect(roster).toHaveLength(22);
  expect(new Set(roster.map((r) => r.alias)).size).toBe(22);
  expect(roster.filter((r) => r.requiredMfa)).toHaveLength(4);
  for (const company of pilotNames)
    expect(
      roster.filter((r) => r.company === company).map((r) => r.role),
    ).toEqual([...acceptanceRoles]);
  expect(JSON.stringify(roster)).not.toMatch(
    /password|access_token|secret|organizationId|userId/,
  );
});

it('fails when the anonymous Storage listing discloses a bucket', async () => {
  const transport = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith('/storage/v1/bucket'))
      return Response.json([{ id: 'must-not-disclose' }]);
    if (new Headers(init?.headers).has('Accept-Profile'))
      return Response.json({ code: 'PGRST106' }, { status: 406 });
    return response(String(url));
  });
  const r = await readConnectedPreflight(target(), transport);
  expect(
    r.checks.find((c) => c.name === 'anonymous:storage-bucket-list-empty')
      ?.passed,
  ).toBe(false);
  expect(JSON.stringify(r)).not.toContain('must-not-disclose');
});
