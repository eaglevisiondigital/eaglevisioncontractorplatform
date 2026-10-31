import { expect, it, vi } from 'vitest';
import {
  PreparedCustomerRequests,
  customerRequestBody,
  customerRequestReference,
  customerRequestStatus,
  customerRequestReceipt,
  staffRequestQueue,
  type CustomerRequestBody,
} from '../src/lib/customer-requests';
import {
  ConnectedCustomerSdk,
  CustomerTokenCustody,
  customerFetch,
} from '../src/lib/customer-connected';
import { PreparedCustomerReconciliation } from '../src/lib/customer-reconciliation';
function fixture() {
  const user = crypto.randomUUID(),
    session = crypto.randomUUID();
  const body: CustomerRequestBody = {
    organization_id: crypto.randomUUID(),
    customer_id: crypto.randomUUID(),
    location_id: crypto.randomUUID(),
    version_id: crypto.randomUUID(),
    publication_id: crypto.randomUUID(),
    scope_sha256: 'a'.repeat(64),
    request_id: crypto.randomUUID(),
    choice: 'request_changes_review',
    acknowledgment: 'review-only-v2',
    note: 'Requested scope change',
  };
  const ref = {
    ...Object.fromEntries(Object.entries(body).filter(([k]) => k !== 'note')),
    schema: 'customer-request-v2',
    user_id: user,
    request_sha256: 'b'.repeat(64),
  };
  const receipt = {
    ...Object.fromEntries(
      Object.entries(body).filter(([k]) => k !== 'acknowledgment'),
    ),
    id: crypto.randomUUID(),
    estimate_id: crypto.randomUUID(),
    version_number: 2,
    recorded_at: '2026-10-31T00:00:00Z',
    request_sha256: 'b'.repeat(64),
  };
  const result = {
    reference: ref,
    outcome: 'confirmed',
    custody: 'claimed-v2',
    receipt,
    replay_allowed: false,
    financial_execution: false,
  };
  const state = {
    user,
    active: true,
    reads: true,
    result: result as unknown,
    queue: {
      organization_id: body.organization_id,
      requests: [
        {
          receipt,
          customer_name: 'Synthetic customer',
          property_label: 'Synthetic property',
          project_name: 'Synthetic scope',
        },
      ],
      limited: true,
      financial_execution: false,
    } as unknown,
  };
  const calls: string[] = [];
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
  const transport = vi.fn<typeof fetch>(async (input) => {
    const name = new URL(String(input)).pathname.split('/').at(-1)!;
    calls.push(name);
    if (name === 'user')
      return Response.json({
        id: state.user,
        aud: 'authenticated',
        is_anonymous: false,
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
    if (
      name === 'customer_review_request_receipt' ||
      name === 'customer_review_request_status'
    )
      return Response.json(state.result);
    if (name === 'customer_change_request_queue')
      return Response.json(state.queue);
    throw Error('Unexpected test transport request');
  });
  const sdk = new ConnectedCustomerSdk(
    {
      url: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
      publishableKey: 'sb_publishable_SYNTHETIC_ONLY',
    },
    custody,
    transport,
  );
  const reads = {
    receipt: sdk.requestReceipt,
    status: sdk.requestStatus,
    queue: sdk.staffRequestQueue,
  };
  const reader = new PreparedCustomerRequests(sdk.identityPort(), reads);
  return {
    user,
    body,
    ref,
    receipt,
    result,
    state,
    calls,
    custody,
    sdk,
    reader,
    reads,
    close() {
      reader.close();
      sdk.close();
    },
  };
}
it('actual SDK supports only exact receipt/status and staff reads, without requiring a live publication or mutation', async () => {
  const f = fixture();
  expect((await f.reader.reconcile(f.ref)).receipt).toEqual(f.receipt);
  expect((await f.reader.status(f.body)).outcome).toBe('confirmed');
  expect((await f.reader.queue(f.body.organization_id)).requests).toHaveLength(
    1,
  );
  const reconciliation = new PreparedCustomerReconciliation(f.sdk);
  expect((await reconciliation.reconcileRequest(f.ref)).outcome).toBe(
    'confirmed',
  );
  reconciliation.close();
  expect(f.calls).not.toContain('customer_portal_discover');
  expect(f.calls.some((x) => /record|claim|publish|token|logout/.test(x))).toBe(
    false,
  );
  f.close();
});
it('default-off commands and capabilities cannot dispatch writes', async () => {
  const f = fixture();
  await expect(f.reader.submit(f.body, true)).rejects.toThrow('unavailable');
  expect(f.calls).toHaveLength(0);
  f.state.reads = false;
  await expect(f.reader.status(f.body)).rejects.toThrow();
  expect(f.calls).not.toContain('customer_review_request_status');
  f.close();
});
it.each(['customer_record_review_request', 'customer_request_claim'])(
  'bounded fetch rejects an unmounted %s network writer',
  async (name) => {
    const transport = vi.fn<typeof fetch>();
    const bounded = customerFetch(
      {
        url: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
        publishableKey: 'sb_publishable_SYNTHETIC_ONLY',
      },
      transport,
    );
    await expect(
      bounded('https://aaaaaaaaaaaaaaaaaaaa.supabase.co/rest/v1/rpc/' + name, {
        method: 'POST',
        body: '{}',
      }),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  },
);
it.each(['', ' \u3000\t', '😀'.repeat(2001), '\ud800'])(
  'rejects unsafe or out-of-bound explanations: %j',
  (note) => {
    const f = fixture();
    expect(() => customerRequestBody({ ...f.body, note })).toThrow();
    f.close();
  },
);
it('counts Unicode code points, preserves markup as text and does not normalize meaning', () => {
  const f = fixture();
  expect(
    customerRequestBody({
      ...f.body,
      note: ' \u00a0' + '😀'.repeat(2000) + '\u3000',
    }).note,
  ).toBe('😀'.repeat(2000));
  expect(
    customerRequestBody({ ...f.body, note: ' <script>text only</script> v ' })
      .note,
  ).toBe('<script>text only</script> v');
  f.close();
});
it.each(['approve_review', 'decline_review'] as const)(
  'retains the existing %s choice with no explanation',
  (choice) => {
    const f = fixture();
    expect(
      customerRequestBody({
        ...f.body,
        choice,
        acknowledgment: 'review-only-v1',
        note: '',
      }).choice,
    ).toBe(choice);
    expect(() =>
      customerRequestBody({ ...f.body, choice, note: 'not permitted' }),
    ).toThrow();
    f.close();
  },
);
it.each([
  { private_note: 'no' },
  { customer_id: 'invalid' },
  { choice: 'accepted' },
  { acknowledgment: ['review-only-v2'] },
  { scope_sha256: 'bad' },
  { note: 3 },
])('strictly rejects expanded/invalid request bodies: %j', (change) => {
  const f = fixture();
  expect(() => customerRequestBody({ ...f.body, ...change })).toThrow();
  f.close();
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'version_id',
  'publication_id',
  'request_id',
  'scope_sha256',
  'request_sha256',
  'choice',
])('rejects a mismatching exact receipt %s', (key) => {
  const f = fixture(),
    value = structuredClone(f.result);
  Object.assign(value.receipt, {
    [key]: key.endsWith('sha256')
      ? 'c'.repeat(64)
      : key === 'choice'
        ? 'decline_review'
        : crypto.randomUUID(),
  });
  expect(() =>
    customerRequestStatus(value, customerRequestReference(f.ref)),
  ).toThrow();
  f.close();
});
it.each([
  { private_unit_cost: 1234 },
  { staff_note: 'private' },
  { payroll: 1234 },
])('excludes private fields from receipts and queues: %j', (extra) => {
  const f = fixture();
  expect(() => customerRequestReceipt({ ...f.receipt, ...extra })).toThrow();
  expect(() =>
    staffRequestQueue(
      { ...(f.state.queue as object), private_note: 'no' },
      f.body.organization_id,
    ),
  ).toThrow();
  f.close();
});
it('keeps absent receipts UNKNOWN rather than authorizing retry', async () => {
  const f = fixture();
  f.state.result = {
    ...f.result,
    outcome: 'UNKNOWN',
    custody: 'unconfirmed',
    receipt: null,
  };
  expect(await f.reader.reconcile(f.ref)).toMatchObject({
    outcome: 'UNKNOWN',
    custody: 'unconfirmed',
    receipt: null,
    replay_allowed: false,
  });
  f.close();
});
it.each(['identity', 'session', 'custody'])(
  'rejects changed %s authority for exact receipt reads',
  async (kind) => {
    const f = fixture();
    if (kind === 'identity') f.state.user = crypto.randomUUID();
    if (kind === 'session') f.state.active = false;
    if (kind === 'custody') f.custody.clearIf(f.custody.read()!);
    await expect(f.reader.reconcile(f.ref)).rejects.toThrow();
    f.close();
  },
);
it('a local command holds its logical target after UNKNOWN and never generates a replacement', async () => {
  const f = fixture(),
    submit = vi.fn(async () => {
      throw Error('lost response');
    });
  const prepared = new PreparedCustomerRequests(f.sdk.identityPort(), f.reads, {
    mode: 'disposable-local',
    submit,
  });
  await expect(prepared.submit(f.body, true)).rejects.toThrow('UNKNOWN');
  await expect(
    prepared.submit({ ...f.body, request_id: crypto.randomUUID() }, true),
  ).rejects.toThrow('Existing attempt');
  expect(submit).toHaveBeenCalledTimes(1);
  prepared.close();
  f.close();
});
it('explicit confirmation and source identity are required even for controlled local commands', async () => {
  const f = fixture(),
    submit = vi.fn(async () => f.result);
  const prepared = new PreparedCustomerRequests(f.sdk.identityPort(), f.reads, {
    mode: 'disposable-local',
    submit,
  });
  await expect(prepared.submit(f.body, false)).rejects.toThrow();
  expect(submit).not.toHaveBeenCalled();
  f.state.user = crypto.randomUUID();
  await expect(prepared.reconcile(f.ref)).rejects.toThrow();
  prepared.close();
  f.close();
});
