import { it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  IsolatedDocumentService,
  cleanupOrphan,
  REQUIRED_WORKER_LIMITS,
  type WorkerSecurity,
} from '../server/materials/isolated-service';
import {
  DocusignSandboxReader,
  prepareEmbeddedSigner,
  receiveDocusignConnect,
  type PdfTrustResult,
  type SignerAuthentication,
} from '../server/contracts/docusign';
import {
  DurableAgreementStore,
  digestBinding,
} from '../server/contracts/persistence';
import { ProviderControl } from '../server/providers/control';
import { sha256 } from '../server/providers/safety';
import type { AgreementBinding } from '../server/contracts/signing';
import { execFileSync } from 'node:child_process';
const org = crypto.randomUUID(),
  source = crypto.randomUUID(),
  bytes = Buffer.from('synthetic-file-bytes');
const job = {
  organizationId: org,
  sourceId: source,
  objectKey: `${org}/${source}`,
  sha256: sha256(bytes),
  size: bytes.length,
  mime: 'image/png' as const,
};
const lease = {
  job,
  token: 'synthetic_lease_token',
  expiresAt: Date.now() + 60000,
  attempt: 1,
};
const policy = {
  organizationId: org,
  issuer: 'https://workload.example.test',
  audience: 'propel-document-worker',
  subject: 'isolated-worker',
};
function worker(options: Partial<WorkerSecurity> = {}) {
  const security: WorkerSecurity = {
    authenticate: vi.fn(async () => ({
      ...policy,
      sourceId: source,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60000,
    })),
    checkpoint: vi.fn(async () => {}),
    releaseEvidence: vi.fn(async () => ({
      sha256: job.sha256,
      clean: true,
      fullValidation: true,
      checkedAt: Date.now(),
    })),
    assertRuntime: vi.fn(async () => {}),
    ...options,
  };
  const objects = {
    readQuarantine: vi.fn(async () => bytes),
    stage: vi.fn(async () => ({ sha256: job.sha256 })),
  };
  return {
    security,
    objects,
    service: new IsolatedDocumentService(policy, security, objects),
  };
}
it('scoped workload reads quarantine and stages only scanner-validated immutable bytes', async () => {
  const w = worker();
  expect(await w.service.read('synthetic-credential', job, lease)).toEqual(
    Uint8Array.from(bytes),
  );
  await w.service.stage('synthetic-credential', job, lease, bytes);
  expect(w.objects.stage.mock.calls).toHaveLength(1);
  expect(w.security.checkpoint).toHaveBeenCalledTimes(5);
});
it.each([
  'organizationId',
  'sourceId',
  'issuer',
  'audience',
  'subject',
] as const)(
  'rejects document workload %s mismatch before reading',
  async (key) => {
    const w = worker({
      authenticate: async () => ({
        ...policy,
        sourceId: source,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60000,
        [key]: 'wrong',
      }),
    });
    await expect(w.service.read('credential', job, lease)).rejects.toThrow(
      /denied/,
    );
    expect(w.objects.readQuarantine).not.toHaveBeenCalled();
  },
);
it('rejects unverified workload signature and runtime isolation attestation failures', async () => {
  for (const options of [
    {
      authenticate: async () => {
        throw new Error('Signature invalid');
      },
    },
    {
      assertRuntime: async () => {
        throw new Error('Runtime not isolated');
      },
    },
  ]) {
    const w = worker(options);
    await expect(w.service.read('credential', job, lease)).rejects.toThrow();
    expect(w.objects.readQuarantine).not.toHaveBeenCalled();
  }
});
it('rejects expired/oversized identity lifetime and stale lease', async () => {
  const w = worker({
    authenticate: async () => ({
      ...policy,
      sourceId: source,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    }),
  });
  await expect(w.service.read('credential', job, lease)).rejects.toThrow(
    /denied/,
  );
  const good = worker();
  await expect(
    good.service.read('credential', job, {
      ...lease,
      expiresAt: Date.now() - 1,
    }),
  ).rejects.toThrow(/denied/);
});
it('rejects dirty/partial/stale scan evidence without staging', async () => {
  for (const override of [
    { clean: false },
    { fullValidation: false },
    { checkedAt: Date.now() - 3600000 },
  ]) {
    const w = worker({
      releaseEvidence: async () => ({
        sha256: job.sha256,
        clean: true,
        fullValidation: true,
        checkedAt: Date.now(),
        ...override,
      }),
    });
    await expect(
      w.service.stage('credential', job, lease, bytes),
    ).rejects.toThrow(/scanner/);
    expect(w.objects.stage).not.toHaveBeenCalled();
  }
});
it('revocation after byte read returns no bytes to AI', async () => {
  let calls = 0;
  const w = worker({
    checkpoint: async () => {
      if (++calls === 2) throw new Error('Revoked');
    },
  });
  await expect(w.service.read('credential', job, lease)).rejects.toThrow(
    /Revoked/,
  );
});
it('rejects corrupted staging bytes and preserves parser limits', async () => {
  const w = worker();
  await expect(
    w.service.stage('credential', job, lease, Buffer.from('corrupt')),
  ).rejects.toThrow(/integrity/);
  expect(REQUIRED_WORKER_LIMITS.maxParallelJobs).toBe(1);
  expect(REQUIRED_WORKER_LIMITS.maxAttempts).toBe(3);
});
it('orphan cleanup requires authoritative lock and exact version, never recent/original objects', async () => {
  const candidate = {
      organizationId: org,
      sourceId: source,
      objectVersion: 'synthetic-v1',
      createdAt: Date.now() - 90000000,
      kind: 'staged-clean' as const,
    },
    objects = { deleteExactVersion: vi.fn(async () => {}) };
  await expect(
    cleanupOrphan(
      { ...candidate, createdAt: Date.now() },
      { withDeletableStage: vi.fn() },
      objects,
    ),
  ).rejects.toThrow(/retention/);
  expect(
    await cleanupOrphan(
      candidate,
      { withDeletableStage: async () => 'retained' },
      objects,
    ),
  ).toBe('retained');
  expect(objects.deleteExactVersion).not.toHaveBeenCalled();
  expect(
    await cleanupOrphan(
      candidate,
      {
        withDeletableStage: async (c, op) => {
          expect(c.objectVersion).toBe('synthetic-v1');
          await op();
          return 'deleted';
        },
      },
      objects,
    ),
  ).toBe('deleted');
  expect(objects.deleteExactVersion).toHaveBeenCalledOnce();
});
const binding: AgreementBinding = {
  providerId: 'docusign-demo-v1',
  organizationId: org,
  customerId: crypto.randomUUID(),
  agreementId: crypto.randomUUID(),
  estimateVersionId: crypto.randomUUID(),
  acceptedDecisionId: crypto.randomUUID(),
  templateVersion: 'synthetic-v1',
  consentVersion: 'synthetic-consent-v1',
  originalSha256: sha256(bytes),
  providerAccountId: crypto.randomUUID(),
  envelopeId: crypto.randomUUID(),
  recipientId: '1',
  signerUserId: crypto.randomUUID(),
  signerEmail: 'signer@example.test',
  preparedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 600000).toISOString(),
  mode: 'sandbox',
};
function signer(): SignerAuthentication {
  return {
    organizationId: org,
    customerId: binding.customerId,
    userId: binding.signerUserId,
    sessionId: crypto.randomUUID(),
    email: binding.signerEmail,
    emailVerified: true,
    aal: 'aal2',
    checkedAt: Date.now(),
    expiresAt: Date.now() + 60000,
    revoked: false,
  };
}
it('embedded signer preparation requires actual current AAL2/portal binding and approved callback', async () => {
  const r = await prepareEmbeddedSigner(
    binding,
    { verify: async () => signer() },
    'https://internal.example.test/return',
    ['https://internal.example.test/return'],
  );
  expect(r.dispatchEnabled).toBe(false);
  for (const overrides of [
    { aal: 'aal1' as const },
    { revoked: true },
    { customerId: crypto.randomUUID() },
    { checkedAt: Date.now() - 120000 },
  ])
    await expect(
      prepareEmbeddedSigner(
        binding,
        { verify: async () => ({ ...signer(), ...overrides }) },
        'https://internal.example.test/return',
        ['https://internal.example.test/return'],
      ),
    ).rejects.toThrow(/authenticated signer/);
});
function docusign(
  overrides: Partial<PdfTrustResult> = {},
  recipientEmail = binding.signerEmail,
) {
  const signed = Buffer.from('synthetic signed PDF placeholder'),
    certificate = Buffer.from('synthetic CoC placeholder');
  const transport = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.endsWith('/recipients'))
      return Response.json({
        signers: [
          {
            recipientId: '1',
            clientUserId: binding.signerUserId,
            email: recipientEmail,
            status: 'completed',
          },
        ],
      });
    if (u.endsWith('/documents/1')) return new Response(signed);
    if (u.endsWith('/documents/certificate')) return new Response(certificate);
    return Response.json({
      envelopeId: binding.envelopeId,
      status: 'completed',
      completedDateTime: new Date().toISOString(),
    });
  });
  const trust = {
    validate: vi.fn(async () => ({
      signedSha256: sha256(signed),
      certificateSha256: sha256(certificate),
      policyVersion: 'fixture-only',
      byteRangesValid: true,
      signaturesValid: true,
      chainTrusted: true,
      timestampValid: true,
      revocation: 'good' as const,
      envelopeId: binding.envelopeId,
      recipientId: '1',
      ...overrides,
    })),
  };
  return {
    transport,
    trust,
    reader: new DocusignSandboxReader(
      {
        organizationId: org,
        accountId: binding.providerAccountId,
        mode: 'sandbox',
        accessToken: 'synthetic-token',
        expiresAt: Date.now() + 60000,
      },
      transport,
      async () => bytes,
      trust,
    ),
  };
}
it('demo reader uses only authenticated GETs and independent byte-bound trust port', async () => {
  const d = docusign();
  expect((await d.reader.readEvidence(binding)).status).toBe('completed');
  expect(d.transport).toHaveBeenCalledTimes(4);
  for (const [url, init] of d.transport.mock.calls as unknown as [
    string,
    RequestInit,
  ][]) {
    expect(url).toMatch(
      /^https:\/\/demo.docusign.net\/restapi\/v2.1\/accounts\//,
    );
    expect(init.method).toBe('GET');
  }
  expect(d.trust.validate).toHaveBeenCalledOnce();
});
it.each([
  { revocation: 'unknown' as const },
  { chainTrusted: false },
  { signaturesValid: false },
  { timestampValid: false },
  { signedSha256: 'a'.repeat(64) },
  { envelopeId: crypto.randomUUID() },
])('rejects unverified certificate evidence %j', async (override) => {
  await expect(docusign(override).reader.readEvidence(binding)).rejects.toThrow(
    /trust verification/,
  );
});
it('wrong account or recipient denies evidence before completion', async () => {
  const d = docusign();
  await expect(
    d.reader.readEvidence({ ...binding, organizationId: crypto.randomUUID() }),
  ).rejects.toThrow(/scope/);
  expect(d.transport).not.toHaveBeenCalled();
  await expect(
    docusign({}, 'other@example.test').reader.readEvidence(binding),
  ).rejects.toThrow(/identity mismatch/);
});
it('Connect authenticates raw body and binds account/envelope before durable acknowledgment', async () => {
  const secret = 'synthetic-secret-only',
    raw = Buffer.from(
      JSON.stringify({
        event: 'envelope-completed',
        generatedDateTime: new Date().toISOString(),
        data: {
          accountId: binding.providerAccountId,
          envelopeId: binding.envelopeId,
        },
      }),
    ),
    signature = createHmac('sha256', secret).update(raw).digest('base64'),
    inbox = { record: vi.fn(async () => 'recorded' as const) },
    scope = {
      organizationId: org,
      accountId: binding.providerAccountId,
      envelopeId: binding.envelopeId,
    };
  expect(
    await receiveDocusignConnect(raw, signature, secret, scope, inbox),
  ).toBe('recorded');
  await expect(
    receiveDocusignConnect(raw, 'invalid', secret, scope, inbox),
  ).rejects.toThrow(/signature/);
  expect(inbox.record).toHaveBeenCalledOnce();
});
it('agreement store detects binding mutation and checks authority around create-only evidence', async () => {
  const command = vi.fn(async (_sql: string, params?: unknown[]) => {
    const action = params?.[2];
    return {
      rows: [
        {
          result:
            action === 'load'
              ? { binding, digest: digestBinding(binding) }
              : { status: action === 'checkpoint' ? 'current' : 'recorded' },
        },
      ],
    };
  });
  const control = new ProviderControl(
    { query: command } as unknown as ConstructorParameters<
      typeof ProviderControl
    >[0],
    { organizationId: org, scopeId: binding.agreementId, service: 'agreement' },
  );
  const objects = {
      stage: vi.fn(async (p: { sha256: string }) => ({ sha256: p.sha256 })),
    },
    store = new DurableAgreementStore(control, objects);
  expect(await store.load(org, binding.agreementId)).toEqual(binding);
  await store.checkpoint(binding);
  await expect(
    store.load(crypto.randomUUID(), binding.agreementId),
  ).rejects.toThrow(/scope/);
  const signed = Buffer.from('synthetic-signed'),
    certificate = Buffer.from('synthetic-certificate');
  await store.appendCompleted(
    binding,
    {
      providerId: binding.providerId,
      organizationId: org,
      agreementId: binding.agreementId,
      envelopeId: binding.envelopeId,
      providerAccountId: binding.providerAccountId,
      sourceSha256: binding.originalSha256,
      signedSha256: sha256(signed),
      certificateSha256: sha256(certificate),
      completedAt: new Date().toISOString(),
      consentVersion: binding.consentVersion,
      mode: 'sandbox',
      legalExecutionEnabled: false,
    },
    { signed, certificate },
  );
  expect(objects.stage).toHaveBeenCalledTimes(2);
});
it('sandbox acceptance CLI default plan performs no credential lookup or API calls', () => {
  execFileSync(process.execPath, ['scripts/build-provider-acceptance.mjs'], {
    stdio: 'pipe',
  });
  const plan = JSON.parse(
    execFileSync(
      process.execPath,
      ['.staging/provider-readiness/runner.mjs', 'plan'],
      { encoding: 'utf8' },
    ),
  );
  expect(plan.status).toBe('NOT RUN');
  expect(plan.networkCalls).toBe(0);
  expect(plan.credentialsRead).toBe(0);
});
it('workload verifier validates a real RSA signature and rejects algorithm/issuer/tenant/expiry substitution', async () => {
  const { generateKeyPairSync, sign } = await import('node:crypto');
  const { WorkloadJwtVerifier } =
    await import('../server/materials/workload-identity');
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const config = {
    ...policy,
    expiresAt: Date.now() + 60000,
    keys: [
      { kid: 'synthetic-key', jwk: pair.publicKey.export({ format: 'jwk' }) },
    ],
  };
  const verifier = new WorkloadJwtVerifier(config);
  const claims = {
    iss: policy.issuer,
    aud: policy.audience,
    sub: policy.subject,
    organization_id: org,
    source_id: source,
    jti: crypto.randomUUID(),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60,
  };
  const jwt = (
    c = claims,
    h: Record<string, unknown> = {
      alg: 'RS256',
      typ: 'JWT',
      kid: 'synthetic-key',
    },
  ) => {
    const input =
      Buffer.from(JSON.stringify(h)).toString('base64url') +
      '.' +
      Buffer.from(JSON.stringify(c)).toString('base64url');
    return (
      input +
      '.' +
      sign('RSA-SHA256', Buffer.from(input), pair.privateKey).toString(
        'base64url',
      )
    );
  };
  expect((await verifier.authenticate(jwt())).sourceId).toBe(source);
  for (const changes of [
    { iss: 'https://wrong.example.test' },
    { organization_id: crypto.randomUUID() },
    { exp: claims.iat - 1 },
    { aud: 'wrong' },
    { exp: claims.iat + 3600 },
  ])
    await expect(
      verifier.authenticate(jwt({ ...claims, ...changes })),
    ).rejects.toThrow(/denied/);
  await expect(
    verifier.authenticate(
      jwt(claims, { alg: 'none', typ: 'JWT', kid: 'synthetic-key' }),
    ),
  ).rejects.toThrow(/denied/);
  await expect(verifier.authenticate(jwt() + 'tampered')).rejects.toThrow(
    /denied/,
  );
  await expect(
    verifier.authenticate(
      jwt(claims, {
        alg: 'RS256',
        typ: 'JWT',
        kid: 'synthetic-key',
        jku: 'https://attacker.example.test',
      }),
    ),
  ).rejects.toThrow(/denied/);
});
it('sender DNS verification requires exact approved records and rejects duplicate SPF and monitor-only DMARC', async () => {
  const { verifyApprovedSenderDns } =
    await import('../server/communications/dns');
  const config = {
    domain: 'company.example.test',
    spf: {
      name: 'send.company.example.test',
      value: 'v=spf1 include:approved.example.test -all',
    },
    dkim: {
      name: 'vendor._domainkey.company.example.test',
      value: 'v=DKIM1; k=rsa; p=SYNTHETIC',
    },
    dmarc: {
      name: '_dmarc.company.example.test',
      value: 'v=DMARC1; p=reject;',
    },
  };
  const resolve = async (name: string) => {
    const record = [config.spf, config.dkim, config.dmarc].find(
      (r) => r.name === name,
    )!;
    return [[record.value]];
  };
  expect(
    await verifyApprovedSenderDns(config.domain, config, resolve),
  ).toMatchObject({ spf: true, dkim: true, dmarc: true });
  expect(
    (
      await verifyApprovedSenderDns(config.domain, config, async (name) =>
        name === config.spf.name
          ? [[config.spf.value], [config.spf.value]]
          : resolve(name),
      )
    ).spf,
  ).toBe(false);
  await expect(
    verifyApprovedSenderDns(
      config.domain,
      { ...config, dmarc: { ...config.dmarc, value: 'v=DMARC1; p=none;' } },
      resolve,
    ),
  ).rejects.toThrow(/configuration required/);
  await expect(
    verifyApprovedSenderDns(
      config.domain,
      { ...config, dkim: { ...config.dkim, name: 'other.example.test' } },
      resolve,
    ),
  ).rejects.toThrow(/scope denied/);
});
