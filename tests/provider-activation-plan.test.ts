import { it, expect } from 'vitest';
import {
  compileWorkloadProbe,
  sandboxReadinessPlan,
  type WorkloadProbeProposal,
} from '../server/providers/activation-plan';
const proposal: WorkloadProbeProposal = {
  organizationId: '10000000-0000-4000-8000-000000000001',
  scopeId: '10000000-0000-4000-8000-000000000002',
  capabilityId: '10000000-0000-4000-8000-000000000003',
  role: 'propel_provider_anet_probe_local',
  ttlSeconds: 900,
};
it('offline plan never claims activation, sends, or provider acceptance', () => {
  const p = sandboxReadinessPlan();
  expect(p).toMatchObject({
    status: 'REVIEW_ONLY_NOT_AUTHORIZED',
    hostedWrites: 0,
    providerCalls: 0,
    credentialsRead: 0,
    releaseReady: false,
  });
  expect(p.stages.map((s) => s.id)).toEqual([
    'identity_probe',
    'authorize_net',
    'nmi',
    'docusign',
    'email',
  ]);
});
it('returned plans cannot mutate later plans', () => {
  (sandboxReadinessPlan().stages[0].requires as unknown as string[])[0] =
    'mutated';
  expect(sandboxReadinessPlan().stages[0].requires[0]).toBe(
    'exact owner operation approval',
  );
});
it('compiles a dormant diagnostic role, never a merchant/payment capability', () => {
  const p = compileWorkloadProbe(proposal);
  expect(p.grant).toContain(
    'nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls',
  );
  expect(p.grant).toContain("interval '900 seconds'");
  expect(p.grant).not.toMatch(
    /grant execute on function private\.(sandbox_gateway_control|provider_email_control|provider_agreement_control)/,
  );
  expect(p.grant).not.toMatch(
    /insert into private\.(merchant_configurations|sandbox_gateway_authorizations)/,
  );
  expect(p.providerCallsAllowed).toBe(0);
  expect(p).toEqual(compileWorkloadProbe({ ...proposal }));
});
it('revocation closes login before lock wait and retains immutable evidence', () => {
  const p = compileWorkloadProbe(proposal);
  expect(p.revoke.indexOf('nologin password null')).toBeLessThan(
    p.revoke.indexOf('pg_terminate_backend'),
  );
  expect(p.revoke.indexOf('pg_terminate_backend')).toBeLessThan(
    p.revoke.indexOf('update private.provider_workloads'),
  );
  expect(p.revoke).not.toMatch(/\n(?:delete|truncate|drop owned)/i);
  expect(p.revoke).toContain(`id='${proposal.capabilityId}'`);
});
it.each([
  { role: 'postgres' },
  { role: 'propel_provider_anet_probe_x;drop role postgres' },
  { role: 'propel_provider_anet_probe_abcdefghijklm' },
  { ttlSeconds: 1800 },
  { organizationId: 'not-a-uuid' },
  { scopeId: proposal.organizationId },
  { capabilityId: proposal.scopeId },
  { password: 'do not accept secrets' },
  { provider: 'nmi' },
])('rejects widened or malformed proposal %j', (patch) => {
  expect(() =>
    compileWorkloadProbe({ ...proposal, ...patch } as WorkloadProbeProposal),
  ).toThrow();
});
it('every reviewed byte change alters the operation hashes', () => {
  const a = compileWorkloadProbe(proposal),
    b = compileWorkloadProbe({
      ...proposal,
      role: 'propel_provider_anet_probe_local2',
    });
  expect(a.grantSha256).not.toBe(b.grantSha256);
  expect(a.revokeSha256).not.toBe(b.revokeSha256);
});
