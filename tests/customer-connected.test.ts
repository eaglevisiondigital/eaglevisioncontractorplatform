import { afterEach, expect, it, vi } from 'vitest';
import {
  ConnectedCustomerSdk,
  CustomerTokenCustody,
  composeCustomerSession,
  customerFetch,
} from '../src/lib/customer-connected';
import { projectIssuedReview } from '../src/domain/customer/review';
import { releasePreviewVersion } from '../src/lib/release';
import { sampleCompanies } from '../src/domain/platform';
afterEach(() => vi.useRealTimers());
function fixture() {
  const user = crypto.randomUUID(),
    session = crypto.randomUUID(),
    token =
      'eyJhbGciOiJmaXh0dXJlIn0.' +
      btoa(
        JSON.stringify({
          sub: user,
          session_id: session,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).replace(/=/g, '') +
      '.FIXTURE';
  const config = {
      url: 'https://' + 'a'.repeat(20) + '.supabase.co',
      publishableKey: 'sb_publishable_SYNTHETIC_ONLY',
    },
    custody = new CustomerTokenCustody();
  custody.adopt(token);
  const version = releasePreviewVersion(sampleCompanies[0]);
  version.organization_id = crypto.randomUUID();
  version.payload.location_id = crypto.randomUUID();
  const c = {
    organization_id: version.organization_id,
    customer_id: version.payload.customer_id,
    location_id: version.payload.location_id,
    company_name: 'Synthetic contractor',
    primary_color: '#00543e',
    property_label: 'Synthetic property',
    reports: true,
    version_ids: [version.id],
  };
  const review = projectIssuedReview(version, c),
    publication = crypto.randomUUID(),
    digest = 'a'.repeat(64),
    calls: { url: URL; body: Record<string, unknown>; init: RequestInit }[] =
      [];
  let active = true,
    caps = false,
    failLogout = false,
    lostDecision = false;
  let decision: unknown = null;
  const transport = vi.fn<typeof fetch>(async (input, init = {}) => {
    const url = new URL(String(input)),
      body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
    calls.push({ url, body, init });
    const headers = new Headers(init.headers);
    expect(headers.get('apikey')).toBe(config.publishableKey);
    expect(headers.get('authorization')).toBe('Bearer ' + token);
    if (url.pathname === '/auth/v1/user')
      return Response.json({
        id: user,
        email: 'synthetic@example.test',
        email_confirmed_at: '2026-10-01T00:00:00Z',
        is_anonymous: false,
        aud: 'authenticated',
      });
    if (url.pathname === '/auth/v1/logout') {
      expect(url.search).toBe('?scope=local');
      if (failLogout) throw Error('network unknown');
      active = false;
      return new Response(null, { status: 204 });
    }
    const name = url.pathname.split('/').at(-1);
    if (name === 'customer_session_status')
      return Response.json({ user_id: user, session_id: session, active });
    if (name === 'customer_runtime_status')
      return Response.json({
        reads: caps,
        publishing: caps,
        decisions: caps,
        login: false,
      });
    if (name === 'customer_portal_discover')
      return Response.json({
        user_id: user,
        contexts: [c],
        mode: 'internal-development',
      });
    if (name === 'customer_estimate_review') return Response.json(review);
    if (name === 'customer_property_reports')
      return Response.json({
        organization_id: c.organization_id,
        customer_id: c.customer_id,
        location_id: c.location_id,
        reports: [],
        media: [],
        mode: 'internal-development',
        report_only: true,
      });
    if (name === 'customer_decision_context')
      return Response.json({
        publication_id: publication,
        scope_sha256: digest,
        review,
        decision,
        financial_execution: false,
      });
    if (name === 'customer_record_decision') {
      decision = {
        id: crypto.randomUUID(),
        request_id: body.p_request,
        choice: body.p_choice,
        recorded_at: new Date().toISOString(),
        scope_sha256: body.p_digest,
      };
      if (lostDecision) throw Error('lost after commit');
      return Response.json(decision);
    }
    if (name === 'customer_publish_estimate') {
      const p = body.p as { scope_sha256: string; expires_at: string };
      return Response.json({
        publication_id: publication,
        scope_sha256: p.scope_sha256,
        expires_at: p.expires_at,
      });
    }
    if (name === 'customer_publication_preview')
      return Response.json({
        scope: review,
        scope_sha256: digest,
        repair_recommendation: null,
      });
    if (name === 'customer_revoke_publication') return Response.json(null);
    if (name === 'customer_publication_receipt')
      return Response.json({
        publication_id: publication,
        scope_sha256: digest,
        expires_at: '2030-01-01T00:00:00Z',
        revoked: false,
      });
    throw Error('Unexpected endpoint');
  });
  const sdk = new ConnectedCustomerSdk(config, custody, transport),
    composition = composeCustomerSession(sdk);
  return {
    user,
    session,
    token,
    config,
    custody,
    version,
    c,
    review,
    publication,
    digest,
    calls,
    transport,
    sdk,
    composition,
    enable: () => {
      caps = true;
    },
    loseDecision: () => {
      lostDecision = true;
    },
    loseLogout: () => {
      failLogout = true;
    },
    settleLogout: () => {
      active = false;
    },
    close: () => composition.close(),
  };
}
it('actual SDK preparation is dormant until the server explicitly permits the capability', async () => {
  const f = fixture();
  await expect(f.composition.access.discover()).rejects.toThrow('unavailable');
  expect(
    f.calls.some((c) => c.url.pathname.endsWith('/customer_portal_discover')),
  ).toBe(false);
  f.close();
});
it('actual SDK uses only caller JWT/publishable key, safe RPCs and the existing three-way reader composition', async () => {
  const f = fixture();
  f.enable();
  await f.composition.access.discover();
  expect(await f.composition.access.review(f.c, f.version.id)).toEqual(
    f.review,
  );
  expect((await f.composition.reports(f.c)).reports).toEqual([]);
  await f.composition.decisions.load(f.c, f.version.id);
  const result = await f.composition.decisions.record('approve_review', true);
  expect(result.choice).toBe('approve_review');
  expect(
    f.calls.every(
      (c) =>
        c.init.credentials === 'omit' &&
        c.init.redirect === 'error' &&
        c.init.cache === 'no-store',
    ),
  ).toBe(true);
  expect(
    f.calls.some(
      (c) =>
        c.url.pathname.includes('/token') || c.url.pathname.includes('/signup'),
    ),
  ).toBe(false);
  expect(JSON.stringify(f.sdk) + JSON.stringify(f.custody)).not.toContain(
    f.token,
  );
  f.close();
});
it('server-committed but lost decision response stays UNKNOWN, never retries and reconciles read-only', async () => {
  const f = fixture();
  f.enable();
  await f.composition.access.discover();
  await f.composition.decisions.load(f.c, f.version.id);
  f.loseDecision();
  await expect(
    f.composition.decisions.record('decline_review', true),
  ).rejects.toThrow('UNKNOWN');
  await expect(
    f.composition.decisions.record('decline_review', true),
  ).rejects.toThrow();
  expect(
    f.calls.filter((c) => c.url.pathname.endsWith('/customer_record_decision')),
  ).toHaveLength(1);
  await f.composition.decisions.load(f.c, f.version.id);
  expect(f.composition.decisions.outcome).toBe('confirmed');
  f.close();
});
it('local logout targets exactly the captured session and confirms server-side closure without global logout', async () => {
  const f = fixture();
  await expect(f.sdk.logoutLocal()).resolves.toEqual({ revoked: true });
  expect(f.custody.read()).toBeNull();
  expect(
    f.calls.filter((c) => c.url.pathname === '/auth/v1/logout'),
  ).toHaveLength(1);
  await expect(f.composition.access.discover()).rejects.toThrow();
  f.close();
});
it('lost logout response remains UNKNOWN and only read-only verification may settle it', async () => {
  const f = fixture();
  f.loseLogout();
  await expect(f.sdk.logoutLocal()).rejects.toThrow('UNKNOWN');
  expect(f.custody.read()).toBeNull();
  f.settleLogout();
  await expect(f.sdk.verifyLogout()).resolves.toEqual({ revoked: true });
  expect(
    f.calls.filter((c) => c.url.pathname === '/auth/v1/logout'),
  ).toHaveLength(1);
  f.close();
});
it('late SDK responses after custody changes cannot restore the previous customer context', async () => {
  const f = fixture();
  f.enable();
  let finish!: (v: Response) => void;
  const original = f.transport.getMockImplementation()!;
  f.transport.mockImplementation((input, init) =>
    String(input).endsWith('/customer_portal_discover')
      ? new Promise((r) => (finish = r))
      : original(input, init),
  );
  const pending = f.composition.access.discover();
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  f.custody.clearIf(f.token);
  finish(
    Response.json({
      user_id: f.user,
      contexts: [f.c],
      mode: 'internal-development',
    }),
  );
  await expect(pending).rejects.toThrow();
  f.close();
});
it('staff publishing/revocation use exact RPC payloads with no automatic duplicate writes', async () => {
  const f = fixture();
  f.enable();
  const p = {
    request_id: crypto.randomUUID(),
    scope_sha256: f.digest,
    expires_at: '2030-01-01T00:00:00Z',
  };
  await f.sdk.publicationPreview(f.c.organization_id, {});
  await f.sdk.publish(f.c.organization_id, p);
  await expect(f.sdk.publish(f.c.organization_id, p)).rejects.toThrow(
    'reconciliation',
  );
  await f.sdk.publicationReceipt(f.c.organization_id, p.request_id);
  await f.sdk.revoke(f.c.organization_id, f.publication);
  expect(
    f.calls.filter((c) =>
      c.url.pathname.endsWith('/customer_publish_estimate'),
    ),
  ).toHaveLength(1);
  f.close();
});
it.each([
  'secret-key',
  'production-provider',
  'redirect',
  'arbitrary-rpc',
  'refresh',
  'oversized',
])('bounded SDK rejects %s without credential leakage', async (attack) => {
  const f = fixture();
  const transport = vi.fn<typeof fetch>();
  if (attack === 'secret-key')
    expect(() =>
      customerFetch(
        { ...f.config, publishableKey: 'sb_secret_SYNTHETIC' },
        transport,
      ),
    ).toThrow();
  else if (attack === 'production-provider')
    expect(() =>
      customerFetch(
        { ...f.config, url: 'https://payments.example.test' },
        transport,
      ),
    ).toThrow();
  else {
    const fetcher = customerFetch(f.config, transport);
    if (attack === 'redirect') {
      transport.mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: 'https://evil.example' },
        }),
      );
      await expect(fetcher(f.config.url + '/auth/v1/user')).rejects.toThrow();
    } else if (attack === 'oversized') {
      transport.mockResolvedValue(
        new Response('x', { headers: { 'content-length': '2097153' } }),
      );
      await expect(fetcher(f.config.url + '/auth/v1/user')).rejects.toThrow();
    } else
      await expect(
        fetcher(
          f.config.url +
            (attack === 'refresh'
              ? '/auth/v1/token'
              : '/rest/v1/rpc/arbitrary'),
          { method: 'POST' },
        ),
      ).rejects.toThrow();
  }
  f.close();
});
it('unresponsive transport has a bounded deadline, without retrying any request', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const transport = vi.fn<typeof fetch>(() => new Promise(() => {}));
  const p = expect(
    customerFetch(f.config, transport)(f.config.url + '/auth/v1/user'),
  ).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(8001);
  await p;
  expect(transport).toHaveBeenCalledOnce();
  f.close();
});
it('HTTP500 publication outcome is UNKNOWN and actual SDK retry remains disabled', async () => {
  const f = fixture();
  f.enable();
  const original = f.transport.getMockImplementation()!;
  f.transport.mockImplementation((input, init) =>
    String(input).endsWith('/customer_publish_estimate')
      ? Promise.resolve(new Response('{}', { status: 500 }))
      : original(input, init),
  );
  const p = {
    request_id: crypto.randomUUID(),
    scope_sha256: f.digest,
    expires_at: new Date(Date.now() + 600000).toISOString(),
  };
  await expect(f.sdk.publish(f.c.organization_id, p)).rejects.toThrow(
    'UNKNOWN',
  );
  await expect(f.sdk.publish(f.c.organization_id, p)).rejects.toThrow(
    'reconciliation',
  );
  expect(
    f.transport.mock.calls.filter(([url]) =>
      String(url).endsWith('/customer_publish_estimate'),
    ),
  ).toHaveLength(1);
  f.close();
});
it('local logout never clears or revokes a replacement account adopted during the response', async () => {
  const f = fixture(),
    replacement = 'eyJhbGciOiJmaXh0dXJlIn0.eyJmaXh0dXJlIjp0cnVlfQ.FIXTURE';
  const original = f.transport.getMockImplementation()!;
  f.transport.mockImplementation(async (input, init) => {
    const r = await original(input, init);
    if (String(input).includes('/logout?scope=local'))
      f.custody.adopt(replacement);
    return r;
  });
  expect(await f.sdk.logoutLocal()).toEqual({ revoked: true });
  expect(f.custody.read()).toBe(replacement);
  expect(
    f.calls.filter((c) => c.url.pathname === '/auth/v1/logout'),
  ).toHaveLength(1);
  f.close();
});
