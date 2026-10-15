import { describe, it, expect, vi } from 'vitest';
import {
  pilotNames,
  tenantTables,
  validateManifest,
  verifyConnectedIsolation,
  type StagingManifest,
} from '../server/staging/acceptance';
const manifest = (): StagingManifest => ({
  environment: 'isolated-staging',
  approvalReference: 'Synthetic local approval',
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  syntheticOnly: true,
  supabaseUrl: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
  forbiddenProjectRefs: ['bbbbbbbbbbbbbbbbbbbb'],
  companies: pilotNames.map((name, i) => ({
    name,
    organizationId: `90000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    ownerTokenEnv: `EV_STAGE_${['PROPERTY', 'CONSTRUCTION', 'ROOFING'][i]}_JWT`,
  })),
});
function setup() {
  const m = manifest();
  const env = Object.fromEntries(
    m.companies.map((c, i) => [
      c.ownerTokenEnv,
      `header.${Buffer.from(JSON.stringify({ sub: `user${i}`, aal: 'aal2', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.signature`,
    ]),
  );
  const transport = vi.fn<typeof fetch>(async (input, init) => {
    const u = new URL(String(input));
    const token = new Headers(init?.headers).get('Authorization')?.slice(7);
    const index = m.companies.findIndex((c) => env[c.ownerTokenEnv] === token);
    if (u.pathname === '/auth/v1/user')
      return Response.json({ id: `user${index}`, is_anonymous: false });
    const org = u.searchParams.get('organization_id')?.slice(3);
    return Response.json(
      index >= 0 && m.companies[index].organizationId === org
        ? [{ organization_id: org }]
        : [],
    );
  });
  return { m, env, transport };
}
describe('offline staging guard and connected acceptance contracts (synthetic transport)', () => {
  it('validates all three distinct pilots with expiring approval', () =>
    expect(validateManifest(manifest())).toBeTruthy());
  it.each([
    'expired',
    'production',
    'duplicate',
    'existing',
    'credentials',
    'missing-forbidden',
    'long-approval',
  ])('rejects unsafe manifest %s', (mode) => {
    const m = manifest();
    if (mode === 'expired') m.expiresAt = '2020-01-01';
    if (mode === 'production')
      m.environment = 'production' as 'isolated-staging';
    if (mode === 'duplicate')
      m.companies[1].organizationId = m.companies[0].organizationId;
    if (mode === 'existing')
      m.forbiddenProjectRefs.push('aaaaaaaaaaaaaaaaaaaa');
    if (mode === 'credentials')
      m.supabaseUrl = 'https://secret@aaaaaaaaaaaaaaaaaaaa.supabase.co';
    if (mode === 'missing-forbidden') m.forbiddenProjectRefs = [];
    if (mode === 'long-approval')
      m.expiresAt = new Date(Date.now() + 8 * 86400000).toISOString();
    expect(() => validateManifest(m)).toThrow();
  });
  it('makes same-tenant positive and all ordered cross-tenant negative reads without writes', async () => {
    const s = setup();
    const r = await verifyConnectedIsolation(
      s.m,
      'sb_publishable_fixture',
      s.env,
      s.transport,
    );
    expect(r.passed).toBe(tenantTables.length * 10);
    expect(
      s.transport.mock.calls.every(
        ([, init]) =>
          !init?.method && !init?.body && init?.redirect === 'error',
      ),
    ).toBe(true);
  });
  it('fails on an empty own-tenant fixture instead of passing isolation vacuously', async () => {
    const s = setup();
    s.transport
      .mockImplementationOnce(async () => Response.json({ id: 'user0' }))
      .mockImplementationOnce(async () => Response.json([]));
    await expect(
      verifyConnectedIsolation(
        s.m,
        'sb_publishable_fixture',
        s.env,
        s.transport,
      ),
    ).rejects.toThrow(/positive control/);
  });
  it('detects one leaked row immediately', async () => {
    const s = setup();
    s.transport
      .mockImplementationOnce(async () => Response.json({ id: 'user0' }))
      .mockImplementationOnce(async () =>
        Response.json([{ organization_id: s.m.companies[0].organizationId }]),
      )
      .mockImplementationOnce(async () =>
        Response.json([{ organization_id: s.m.companies[1].organizationId }]),
      );
    await expect(
      verifyConnectedIsolation(
        s.m,
        'sb_publishable_fixture',
        s.env,
        s.transport,
      ),
    ).rejects.toThrow(/cross-tenant/);
  });
  it('refuses missing sessions and secret API keys', async () => {
    const s = setup();
    await expect(
      verifyConnectedIsolation(s.m, 'sb_secret_bad', s.env, s.transport),
    ).rejects.toThrow();
    await expect(
      verifyConnectedIsolation(s.m, 'sb_publishable_fixture', {}, s.transport),
    ).rejects.toThrow();
    expect(s.transport).not.toHaveBeenCalled();
  });
  it('rejects unverified Auth responses and AAL1 sessions', async () => {
    const s = setup();
    s.transport.mockImplementationOnce(async () =>
      Response.json({ id: 'other' }),
    );
    await expect(
      verifyConnectedIsolation(
        s.m,
        'sb_publishable_fixture',
        s.env,
        s.transport,
      ),
    ).rejects.toThrow(/AAL2/);
    s.env[s.m.companies[0].ownerTokenEnv] =
      `h.${Buffer.from(JSON.stringify({ sub: 'user0', aal: 'aal1', exp: Date.now() / 1000 + 3600 })).toString('base64url')}.s`;
    await expect(
      verifyConnectedIsolation(
        s.m,
        'sb_publishable_fixture',
        s.env,
        s.transport,
      ),
    ).rejects.toThrow(/AAL2/);
  });
});

import { assertIsolatedBuild } from '../server/staging/build-policy';
it.each(['production', 'dev', undefined])(
  'blocks Netlify %s context even if staging flag is set',
  (context) => {
    expect(() =>
      assertIsolatedBuild({
        CONTEXT: context,
        BRANCH: 'codex/test',
        EV_ISOLATED_STAGING_BUILD: 'approved-internal-only',
      }),
    ).toThrow();
  },
);
it('accepts only configured internal preview builds and rejects main', () => {
  expect(() =>
    assertIsolatedBuild({
      CONTEXT: 'deploy-preview',
      BRANCH: 'codex/test',
      EV_ISOLATED_STAGING_BUILD: 'approved-internal-only',
    }),
  ).not.toThrow();
  expect(() =>
    assertIsolatedBuild({
      CONTEXT: 'deploy-preview',
      BRANCH: 'main',
      EV_ISOLATED_STAGING_BUILD: 'approved-internal-only',
    }),
  ).toThrow();
  expect(() =>
    assertIsolatedBuild({ CONTEXT: 'deploy-preview', BRANCH: 'codex/test' }),
  ).toThrow();
});

import {
  runConnectedWorkflows,
  requiredWorkflowRpcs,
  workflowModules,
  type WorkflowScenario,
} from '../server/staging/workflows';
function workflowSetup() {
  const s = setup();
  const scenarios: WorkflowScenario[] = s.m.companies.flatMap((c, i) =>
    workflowModules.map((module, j) => ({
      companyId: c.organizationId,
      module,
      steps: requiredWorkflowRpcs[module].map((rpc, k) => ({
        id: `step_${i}_${j}_${k}`,
        rpc,
        args: { p_org: c.organizationId },
        tokenEnv: c.ownerTokenEnv,
        expect: { assertions: [{ path: 'checked', equals: true }] },
      })),
    })),
  );
  s.transport.mockImplementation(async (input) =>
    String(input).includes('/auth/')
      ? Response.json({ id: 'synthetic-test-actor' })
      : Response.json({ checked: true }),
  );
  return { ...s, scenarios };
}
it('executes only explicitly approved complete internal RPC plans with exact assertions', async () => {
  const s = workflowSetup();
  const result = await runConnectedWorkflows(
    s.m,
    s.scenarios,
    'sb_publishable_fixture',
    s.env,
    s.m.approvalReference,
    s.transport,
  );
  expect(result.passed).toBe(
    3 * Object.values(requiredWorkflowRpcs).flat().length,
  );
  expect(
    s.transport.mock.calls
      .filter(([input]) => String(input).includes('/rpc/'))
      .every(
        ([, init]) => init?.method === 'POST' && init.redirect === 'error',
      ),
  ).toBe(true);
});
it.each([
  'no-approval',
  'foreign-org',
  'execution-rpc',
  'missing-module',
  'missing-rpc',
])('refuses unsafe workflow %s before network', async (mode) => {
  const s = workflowSetup();
  let approval = s.m.approvalReference;
  if (mode === 'no-approval') approval = '';
  if (mode === 'foreign-org')
    s.scenarios[0].steps[0].args.p_org = crypto.randomUUID();
  if (mode === 'execution-rpc') s.scenarios[0].steps[0].rpc = 'charge_customer';
  if (mode === 'missing-module') s.scenarios.pop();
  if (mode === 'missing-rpc') s.scenarios[0].steps.pop();
  await expect(
    runConnectedWorkflows(
      s.m,
      s.scenarios,
      'sb_publishable_fixture',
      s.env,
      approval,
      s.transport,
    ),
  ).rejects.toThrow();
  expect(s.transport).not.toHaveBeenCalled();
});
it('fails mismatched arithmetic assertions and exact SQLSTATE denials', async () => {
  const s = workflowSetup();
  s.scenarios[0].steps[0].expect = {
    assertions: [{ path: 'checked', equals: 123 }],
  };
  await expect(
    runConnectedWorkflows(
      s.m,
      s.scenarios,
      'sb_publishable_fixture',
      s.env,
      s.m.approvalReference,
      s.transport,
    ),
  ).rejects.toThrow(/assertion/);
  s.scenarios[0].steps[0].expect = {
    assertions: [{ path: 'checked', equals: true }],
  };
  s.scenarios[0].steps.push({
    id: 'denial',
    rpc: 'create_estimate',
    args: { p_org: s.m.companies[0].organizationId },
    tokenEnv: s.m.companies[0].ownerTokenEnv,
    expect: { errorCode: '42501' },
  });
  await expect(
    runConnectedWorkflows(
      s.m,
      s.scenarios,
      'sb_publishable_fixture',
      s.env,
      s.m.approvalReference,
      s.transport,
    ),
  ).rejects.toThrow(/denial/);
});
it('resolves exact previous-step references without evaluating code', async () => {
  const s = workflowSetup();
  s.scenarios[0].steps[1].args.p_lock = { $ref: 'step_0_0_0.checked' };
  await runConnectedWorkflows(
    s.m,
    s.scenarios,
    'sb_publishable_fixture',
    s.env,
    s.m.approvalReference,
    s.transport,
  );
  const calls = s.transport.mock.calls.filter(([input]) =>
    String(input).includes('/rpc/'),
  );
  expect(JSON.parse(String(calls[1][1]?.body)).p_lock).toBe(true);
});
it('uses apikey-only anonymous requests rather than an invalid publishable bearer token', async () => {
  const s = setup();
  await verifyConnectedIsolation(
    s.m,
    'sb_publishable_fixture',
    s.env,
    s.transport,
  );
  const anonymous = s.transport.mock.calls.filter(
    ([, init]) => !new Headers(init?.headers).has('Authorization'),
  );
  expect(anonymous).toHaveLength(tenantTables.length);
});
it('accepts genuine PostgREST void 204 and scalar UUID results without weakening assertions', async () => {
  const s = workflowSetup();
  for (const scenario of s.scenarios)
    for (const step of scenario.steps) {
      step.expect = {
        assertions: [
          step.rpc === 'submit_time'
            ? { path: '', equals: null }
            : { path: '', type: 'uuid' },
        ],
      };
    }
  s.transport.mockImplementation(async (input) =>
    String(input).includes('/auth/')
      ? Response.json({ id: 'synthetic-test-actor' })
      : String(input).endsWith('/submit_time')
        ? new Response(null, { status: 204 })
        : Response.json('90000000-0000-4000-8000-000000000001'),
  );
  await expect(
    runConnectedWorkflows(
      s.m,
      s.scenarios,
      'sb_publishable_fixture',
      s.env,
      s.m.approvalReference,
      s.transport,
    ),
  ).resolves.toHaveProperty('passed');
});
it('rejects a missing assertion operand before any network access', async () => {
  const s = workflowSetup();
  s.scenarios[0].steps[0].expect = { assertions: [{ path: '' }] };
  await expect(
    runConnectedWorkflows(
      s.m,
      s.scenarios,
      'sb_publishable_fixture',
      s.env,
      s.m.approvalReference,
      s.transport,
    ),
  ).rejects.toThrow();
  expect(s.transport).not.toHaveBeenCalled();
});
