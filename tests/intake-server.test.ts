import { afterEach, expect, it, vi } from 'vitest';
import { intakeProfile, limitedJson, submitIntake } from '../src/server/intake';
import { validateIntake } from '../src/domain/intake';
const payload = {
  name: 'A Synthetic Customer',
  email: 'person@example.test',
  phone: '555-0188',
  address: '100 Example Lane',
  city: 'Example',
  region: 'IL',
  postal_code: '00000',
  country_code: 'US',
  property_type: 'residential',
  service_category: 'General inquiry',
  description: 'A synthetic repair request for the testing environment.',
  preferred_appointment: 'Morning',
  contact_preference: 'email',
  email_consent: true,
  sms_consent: false,
  consent_version: 'contact-v1',
};
const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
  PUBLIC_INTAKE_ENABLED: 'true',
  TURNSTILE_SECRET_KEY: 'synthetic-turnstile-secret',
  TURNSTILE_SITE_KEY: 'public-site-key',
  TURNSTILE_HOSTNAME: 'app.example',
  INTAKE_GATEWAY_KEY: 'local-synthetic-gateway-key-only-0000',
  INTAKE_RATE_LIMIT_SECRET: 'local-synthetic-rate-secret-only-0000',
};
const body = () => ({
  slug: 'straight-edge',
  payload,
  verification_token: 'verified-token',
  honeypot: '',
  idempotency_key: crypto.randomUUID(),
});
function request(
  value: unknown = body(),
  headers: Record<string, string> = {},
) {
  return new Request('https://app.example/api/intake-submit', {
    method: 'POST',
    headers: {
      origin: 'https://app.example',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(value),
  });
}
const verify = {
  success: true,
  hostname: 'app.example',
  action: 'estimate_request',
};
afterEach(() => vi.unstubAllGlobals());
it('fails closed without enabled infrastructure or trusted runtime IP', async () => {
  expect((await submitIntake(request(), {}, '127.0.0.1')).status).toBe(503);
  expect((await submitIntake(request(), env, undefined)).status).toBe(503);
  expect(
    (
      await submitIntake(
        request(),
        { ...env, PUBLIC_INTAKE_ENABLED: 'false' },
        '127.0.0.1',
      )
    ).status,
  ).toBe(503);
});
it('blocks cross-origin submissions, unexpected tenant fields and honeypot bots before network access', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  expect(
    (
      await submitIntake(
        request(body(), { origin: 'https://evil.example' }),
        env,
        '127.0.0.1',
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await submitIntake(
        request({ ...body(), organization_id: 'forged' }),
        env,
        '127.0.0.1',
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await submitIntake(
        request({ ...body(), honeypot: 'bot' }),
        env,
        '127.0.0.1',
      )
    ).status,
  ).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it('bounds streaming request bodies without trusting Content-Length', async () => {
  await expect(
    limitedJson(
      new Request('https://app.example', {
        method: 'POST',
        body: 'x'.repeat(19000),
      }),
    ),
  ).rejects.toThrow('Request too large');
  expect(
    (
      await submitIntake(
        request({ ...body(), extra: 'x'.repeat(19000) }),
        env,
        '127.0.0.1',
      )
    ).status,
  ).toBe(400);
});
it.each([
  { ...verify, success: false },
  { ...verify, hostname: 'evil.example' },
  { ...verify, action: 'other-action' },
])(
  'rejects invalid verification without calling the database (%j)',
  async (result) => {
    const fetch = vi.fn().mockResolvedValue(Response.json(result));
    vi.stubGlobal('fetch', fetch);
    expect((await submitIntake(request(), env, '127.0.0.1')).status).toBe(403);
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it('validates CAPTCHA server-side, hashes trusted IP and passes only server-controlled routing credentials', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(verify))
    .mockResolvedValueOnce(Response.json({ status: 'accepted' }));
  vi.stubGlobal('fetch', fetch);
  const response = await submitIntake(request(), env, '192.0.2.1');
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ accepted: true });
  const rpc = JSON.parse(fetch.mock.calls[1][1].body as string);
  expect(rpc.p_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(rpc)).not.toContain('192.0.2.1');
  expect(rpc.p_gateway_key).toBe(env.INTAKE_GATEWAY_KEY);
  expect(rpc).not.toHaveProperty('organization_id');
  expect(response.headers.get('cache-control')).toBe('no-store');
});
it('maps durable database rate limits and unavailable routes to safe responses', async () => {
  for (const [status, code] of [
    ['rate_limited', 429],
    ['unavailable', 404],
  ] as const) {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(verify))
      .mockResolvedValueOnce(Response.json({ status }));
    vi.stubGlobal('fetch', fetch);
    expect((await submitIntake(request(), env, '192.0.2.1')).status).toBe(code);
  }
});
it('sanitizes database errors and verification outages without leaking credentials', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(verify))
    .mockResolvedValueOnce(
      Response.json(
        { code: '42501', message: env.INTAKE_GATEWAY_KEY },
        { status: 403 },
      ),
    );
  vi.stubGlobal('fetch', fetch);
  const response = await submitIntake(request(), env, '192.0.2.1');
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain(env.INTAKE_GATEWAY_KEY);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
  expect((await submitIntake(request(), env, '192.0.2.1')).status).toBe(503);
});
it('publishes only a resolved branded profile and public verification readiness', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json({ name: 'Straight Edge', slug: 'straight-edge' }),
    );
  vi.stubGlobal('fetch', fetch);
  const response = await intakeProfile(
    new Request('https://app.example/api/intake-profile?slug=straight-edge'),
    env,
  );
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result).toMatchObject({
    profile: { name: 'Straight Edge' },
    site_key: env.TURNSTILE_SITE_KEY,
    ready: true,
  });
  expect(JSON.stringify(result)).not.toContain(env.INTAKE_GATEWAY_KEY);
});
it('rejects malformed payloads and selected-contact consent conflicts', () => {
  expect(validateIntake(payload)).toEqual(payload);
  for (const changes of [
    { organization_id: 'forged' },
    { email_consent: false },
    { contact_preference: 'sms', sms_consent: false },
    { description: 'short' },
    { email: 'invalid' },
    { property_type: 'unknown' },
  ])
    expect(() => validateIntake({ ...payload, ...changes })).toThrow();
});
