import { expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { projectIssuedReview } from '../src/domain/customer/review';
import { releasePreviewVersion } from '../src/lib/release';
import {
  ConnectedCustomerSdk,
  CustomerTokenCustody,
} from '../src/lib/customer-connected';
import {
  PreparedCustomerReconciliation,
  type CustomerReviewReference,
} from '../src/lib/customer-reconciliation';

// Protocol fixtures through the actual pinned SDK; never hosted/Auth evidence.
function fixture(company = sampleCompanies[0]) {
  const user = crypto.randomUUID(),
    session = crypto.randomUUID();
  const custody = new CustomerTokenCustody();
  const token =
    'eyJhbGciOiJmaXh0dXJlIn0.' +
    btoa(
      JSON.stringify({
        sub: user,
        session_id: session,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).replace(/=/g, '') +
    '.FIXTURE';
  custody.adopt(token);
  const version = releasePreviewVersion(company);
  version.organization_id = crypto.randomUUID();
  version.payload.location_id = crypto.randomUUID();
  const c = {
    organization_id: version.organization_id,
    customer_id: version.payload.customer_id,
    location_id: version.payload.location_id,
    company_name: company.name,
    primary_color: company.primary_color,
    property_label: 'Synthetic property',
    reports: false,
    version_ids: [version.id],
  };
  const ref: CustomerReviewReference = {
    schema: 'customer-review-reference-v1',
    user_id: user,
    customer_id: c.customer_id,
    location_id: c.location_id,
    version_id: version.id,
    request: {
      organization_id: c.organization_id,
      publication_id: crypto.randomUUID(),
      scope_sha256: 'a'.repeat(64),
      choice: 'approve_review',
      acknowledgment: 'review-only-v1',
      request_id: crypto.randomUUID(),
    },
  };
  const receipt = {
    id: crypto.randomUUID(),
    request_id: ref.request.request_id,
    choice: ref.request.choice,
    scope_sha256: ref.request.scope_sha256,
    recorded_at: '2026-10-31T12:00:00Z',
  };
  const state = {
    user,
    active: true,
    reads: true,
    discovery: { user_id: user, contexts: [c], mode: 'internal-development' },
    review: projectIssuedReview(version, c),
    context: {
      publication_id: ref.request.publication_id,
      scope_sha256: ref.request.scope_sha256,
      review: projectIssuedReview(version, c),
      decision: receipt as unknown,
      financial_execution: false,
    },
    fail: '',
    hook: (name: string) => {
      void name;
    },
  };
  const calls: string[] = [];
  const transport = vi.fn<typeof fetch>(async (input, init = {}) => {
    const url = new URL(String(input));
    const name = url.pathname.split('/').at(-1)!;
    calls.push(name);
    expect(url.hostname).toBe('aaaaaaaaaaaaaaaaaaaa.supabase.co');
    expect(init.credentials).toBe('omit');
    expect(init.cache).toBe('no-store');
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer ' + token,
    );
    expect([
      'user',
      'customer_session_status',
      'customer_runtime_status',
      'customer_portal_discover',
      'customer_estimate_review',
      'customer_decision_context',
    ]).toContain(name);
    state.hook(name);
    if (state.fail === name)
      return Response.json(
        { message: 'private provider error' },
        { status: 503 },
      );
    if (name === 'user')
      return Response.json({
        id: state.user,
        aud: 'authenticated',
        is_anonymous: false,
        email: 'synthetic@example.test',
        email_confirmed_at: '2026-10-01T00:00:00Z',
      });
    if (name === 'customer_session_status')
      return Response.json({
        user_id: state.user,
        session_id: session,
        active: state.active,
      });
    if (name === 'customer_runtime_status')
      return Response.json({
        reads: state.reads,
        publishing: false,
        decisions: false,
        login: false,
      });
    if (name === 'customer_portal_discover')
      return Response.json(state.discovery);
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      p_org: c.organization_id,
      p_customer: c.customer_id,
      p_location: c.location_id,
      p_version: version.id,
    });
    return Response.json(
      name === 'customer_estimate_review' ? state.review : state.context,
    );
  });
  const sdk = new ConnectedCustomerSdk(
    {
      url: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
      publishableKey: 'sb_publishable_SYNTHETIC_ONLY',
    },
    custody,
    transport,
  );
  const reader = new PreparedCustomerReconciliation(sdk);
  return {
    ref,
    receipt,
    state,
    calls,
    reader,
    custody,
    sdk,
    close() {
      reader.close();
      sdk.close();
    },
  };
}
it.each(sampleCompanies)(
  'reconciles an exact receipt for $name through read-only SDK interfaces',
  async (company) => {
    const f = fixture(company);
    expect(await f.reader.reconcile(f.ref)).toEqual({
      status: 'confirmed',
      outcome: 'confirmed',
      receipt: f.receipt,
      mutation_performed: false,
      replay_allowed: false,
    });
    expect(
      f.calls.filter((x) => x === 'customer_decision_context'),
    ).toHaveLength(1);
    expect(f.calls).not.toContain('customer_record_decision');
    f.close();
  },
);
it('does not interpret a missing receipt as failed execution or permission to replay', async () => {
  const f = fixture();
  f.state.context.decision = null;
  expect(await f.reader.reconcile(f.ref)).toEqual({
    status: 'undetermined',
    outcome: 'UNKNOWN',
    mutation_performed: false,
    replay_allowed: false,
  });
  f.state.context.decision = f.receipt;
  expect((await f.reader.reconcile(f.ref)).status).toBe('confirmed');
  f.close();
});
it('a new reader can inspect the same externally retained reference without resending', async () => {
  const f = fixture();
  f.reader.close();
  const restarted = new PreparedCustomerReconciliation(f.sdk);
  const retained = structuredClone(f.ref);
  expect((await restarted.reconcile(retained)).status).toBe('confirmed');
  expect((await restarted.reconcile(undefined)).outcome).toBe('UNKNOWN');
  restarted.close();
  f.close();
});
it.each(['publication_id', 'scope_sha256', 'request_id', 'choice'] as const)(
  'rejects mismatching exact %s without replay',
  async (key) => {
    const f = fixture();
    if (key === 'publication_id')
      f.state.context.publication_id = crypto.randomUUID();
    else if (key === 'scope_sha256') {
      f.state.context.scope_sha256 = 'b'.repeat(64);
      f.state.context.decision = { ...f.receipt, scope_sha256: 'b'.repeat(64) };
    } else
      f.state.context.decision = {
        ...f.receipt,
        [key]: key === 'choice' ? 'decline_review' : crypto.randomUUID(),
      };
    expect((await f.reader.reconcile(f.ref)).status).toBe('conflict');
    f.close();
  },
);
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'version_id',
  'user_id',
])('cannot authorize a foreign %s using a retained selector', async (field) => {
  const f = fixture();
  const ref = structuredClone(f.ref);
  if (field === 'organization_id')
    ref.request.organization_id = crypto.randomUUID();
  else Object.assign(ref, { [field]: crypto.randomUUID() });
  expect((await f.reader.reconcile(ref)).status).toBe('unavailable');
  expect(f.calls).not.toContain('customer_decision_context');
  f.close();
});
it.each([
  { extra: 'private note' },
  { request: { choice: 'changes_requested' } },
  { request: { choice: ['approve_review'] } },
  { request: { acknowledgment: 'contract' } },
  { request: { scope_sha256: 'not-a-hash' } },
  { request: { request_id: 'invalid' } },
  { request: { note: 'must not cross this contract' } },
])(
  'rejects invalid or expanded retained references before transport: %j',
  async (change) => {
    const f = fixture();
    const ref = {
      ...f.ref,
      ...change,
      request: { ...f.ref.request, ...change.request },
    };
    expect((await f.reader.reconcile(ref)).outcome).toBe('UNKNOWN');
    expect(f.calls).toHaveLength(0);
    f.close();
  },
);
it.each([
  'customer_portal_discover',
  'customer_estimate_review',
  'customer_decision_context',
])(
  'retains UNKNOWN after a single failed %s read, without transport retries',
  async (name) => {
    const f = fixture();
    f.state.fail = name;
    expect((await f.reader.reconcile(f.ref)).status).toBe('unavailable');
    expect(f.calls.filter((x) => x === name)).toHaveLength(1);
    f.close();
  },
);
it('honors default-off capabilities and revoked sessions', async () => {
  const f = fixture();
  f.state.reads = false;
  expect((await f.reader.reconcile(f.ref)).outcome).toBe('UNKNOWN');
  expect(f.calls).not.toContain('customer_portal_discover');
  f.state.reads = true;
  f.state.active = false;
  expect((await f.reader.reconcile(f.ref)).outcome).toBe('UNKNOWN');
  f.close();
});
it('cannot reconcile after publication expiry or mapping removal using a historical reference', async () => {
  const f = fixture();
  f.state.discovery.contexts = [];
  expect((await f.reader.reconcile(f.ref)).status).toBe('unavailable');
  expect(f.calls).not.toContain('customer_decision_context');
  f.close();
});
it.each([
  'private-field',
  'different-source',
  'financial-authority',
  'malformed-receipt',
])('rejects unsafe or inconsistent context: %s', async (kind) => {
  const f = fixture();
  if (kind === 'private-field')
    Object.assign(f.state.context.review, { internal_unit_cost: 100 });
  if (kind === 'different-source')
    f.state.context.review.version_id = crypto.randomUUID();
  if (kind === 'financial-authority')
    f.state.context.financial_execution = true;
  if (kind === 'malformed-receipt')
    f.state.context.decision = { ...f.receipt, private_note: 'private' };
  expect(await f.reader.reconcile(f.ref)).toEqual({
    status: 'unavailable',
    outcome: 'UNKNOWN',
    mutation_performed: false,
    replay_allowed: false,
  });
  f.close();
});
it.each(['identity', 'custody', 'close'])(
  'discards results after %s changes during a read',
  async (kind) => {
    const f = fixture();
    f.state.hook = (name) => {
      if (name !== 'customer_decision_context') return;
      if (kind === 'identity') f.state.user = crypto.randomUUID();
      if (kind === 'custody') f.custody.clearIf(f.custody.read()!);
      if (kind === 'close') f.reader.close();
    };
    expect((await f.reader.reconcile(f.ref)).status).toBe('unavailable');
    f.close();
  },
);
it('snapshots the input before awaiting and returns detached receipt evidence', async () => {
  const f = fixture();
  f.state.hook = (name) => {
    if (name === 'customer_decision_context')
      f.ref.request.request_id = crypto.randomUUID();
  };
  const result = await f.reader.reconcile(f.ref);
  expect(result.status).toBe('confirmed');
  if (result.status === 'confirmed') result.receipt.id = crypto.randomUUID();
  expect(f.state.context.decision).toEqual(f.receipt);
  f.close();
});
