/** Bundled with scripts/build-provider-acceptance.mjs. Default = OFFLINE PLAN.
 * Never run --execute-approved without separate owner approval of the exact private
 * manifest hash, test account and operation. No seeding, grants or deployment here. */
import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, sep } from 'node:path';
import { Pool } from 'pg';
import { ProviderControl } from '../server/providers/control';
import { RestrictedSandboxStore } from '../server/payments/control-store';
import {
  SandboxGateway,
  type GatewayToken,
  type SandboxCredentials,
  type SandboxMerchant,
  type SandboxIntent,
} from '../server/payments/sandbox';
import {
  SandboxRefundGateway,
  type SandboxRefund,
} from '../server/payments/refunds';
import { exactKeys, sha256 } from '../server/providers/safety';

async function main() {
  const [mode, path, approvedHash] = process.argv.slice(2);
  if (mode === undefined || mode === 'plan') {
    console.log(
      JSON.stringify({
        status: 'NOT RUN',
        networkCalls: 0,
        credentialsRead: 0,
        steps: [
          'review unapplied migration and restricted workload identity',
          'approve exact test-account/merchant/authorization manifest',
          'capture with provider-hosted tokenization',
          'repeat identical durable key without second provider call',
          'verify signed webhook inbox and query provider settlement',
          'separately approve settled partial refund and reconcile',
          'stop on UNKNOWN; independent provider evidence required',
        ],
        blockers: [
          'owner approval',
          'provider-approved sandbox accounts',
          'restricted workload connection',
          'genuine token/profile and authorization',
          'verified callback/statement evidence',
        ],
      }),
    );
    return;
  }
  if (mode !== '--execute-approved' || !path || !approvedHash)
    throw new Error('Plan or separately approved execution required');
  const absolute = resolve(path),
    root = resolve('.staging/provider-readiness') + sep;
  if (!absolute.startsWith(root) || statSync(absolute).mode & 0o077)
    throw new Error('Private manifest required');
  const raw = readFileSync(absolute);
  if (sha256(raw) !== approvedHash)
    throw new Error('Exact operation hash mismatch');
  const p = JSON.parse(raw.toString('utf8')) as {
    mode: 'sandbox';
    providerApprovedTestAccount: true;
    approvalReference: string;
    expiresAt: string;
    operation: 'capture' | 'refund';
    merchant: SandboxMerchant;
    intent: SandboxIntent | SandboxRefund;
    keychainService: string;
    keychainAccount: string;
  };
  exactKeys(p, [
    'mode',
    'providerApprovedTestAccount',
    'approvalReference',
    'expiresAt',
    'operation',
    'merchant',
    'intent',
    'keychainService',
    'keychainAccount',
  ]);
  const until = Date.parse(p.expiresAt);
  if (
    p.mode !== 'sandbox' ||
    p.providerApprovedTestAccount !== true ||
    !p.approvalReference ||
    !(until > Date.now()) ||
    until > Date.now() + 1800000 ||
    !['capture', 'refund'].includes(p.operation) ||
    !/^propel-sandbox-[a-z0-9-]+$/.test(p.keychainService) ||
    !/^operator-[a-z0-9-]+$/.test(p.keychainAccount) ||
    p.merchant.mode !== 'sandbox' ||
    p.merchant.approvedUntil !== p.expiresAt ||
    p.intent.expiresAt !== p.expiresAt
  )
    throw new Error('Reviewed sandbox scope required');
  // Captured entirely in memory. Never echo argv credential values, stdout or error
  // diagnostics from security/pg/provider. No environment/file secret fallback.
  let secretBuffer: Buffer;
  try {
    secretBuffer = execFileSync(
      '/usr/bin/security',
      [
        'find-generic-password',
        '-s',
        p.keychainService,
        '-a',
        p.keychainAccount,
        '-w',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 65536 },
    );
  } catch {
    throw new Error('Approved Keychain access unavailable');
  }
  const secrets = JSON.parse(secretBuffer.toString('utf8').trim()) as {
    organizationId: string;
    merchantConfigId: string;
    provider: string;
    databaseUrl: string;
    databaseCaPem: string;
    credentials: SandboxCredentials;
    token?: GatewayToken;
  };
  secretBuffer.fill(0);
  if (
    secrets.organizationId !== p.merchant.organizationId ||
    secrets.merchantConfigId !== p.merchant.merchantConfigId ||
    secrets.provider !== p.merchant.provider
  )
    throw new Error('Tenant credential binding denied');
  const dbUrl = new URL(secrets.databaseUrl);
  if (
    dbUrl.protocol !== 'postgresql:' ||
    !/^propel_provider_[a-z0-9_]+$/.test(decodeURIComponent(dbUrl.username)) ||
    dbUrl.search ||
    dbUrl.hash ||
    !secrets.databaseCaPem
  )
    throw new Error('Restricted TLS workload connection required');
  const pool = new Pool({
    connectionString: dbUrl.href,
    ssl: { rejectUnauthorized: true, ca: secrets.databaseCaPem },
    max: 1,
    connectionTimeoutMillis: 15000,
    statement_timeout: 15000,
  });
  let calls = 0;
  const transport: typeof fetch = async (url, options) => {
    calls++;
    return fetch(url, options);
  };
  const control = new ProviderControl(
      {
        query: async (sql, params) => ({
          rows: (await pool.query(sql, params)).rows,
        }),
      },
      {
        organizationId: p.merchant.organizationId,
        scopeId: p.merchant.merchantConfigId,
        service: 'payment',
      },
    ),
    store = new RestrictedSandboxStore(control);
  try {
    const operation = () =>
      p.operation === 'capture'
        ? new SandboxGateway(
            p.merchant,
            secrets.credentials,
            store,
            transport,
          ).capture(p.intent, secrets.token!)
        : new SandboxRefundGateway(
            p.merchant,
            secrets.credentials,
            store,
            transport,
          ).refund(p.intent as SandboxRefund);
    if (p.operation === 'capture' && !secrets.token)
      throw new Error('Genuine provider opaque token required');
    const result = await operation();
    if (result.status === 'unknown') {
      console.log(
        JSON.stringify({
          status: 'BLOCKED',
          providerCalls: calls,
          reason: 'UNKNOWN held durably; do not retry or change key',
        }),
      );
      process.exitCode = 2;
      return;
    }
    const firstCalls = calls,
      replay = await operation();
    if (
      calls !== firstCalls ||
      Object.keys(result).some(
        (k) =>
          replay[k as keyof typeof replay] !== result[k as keyof typeof result],
      )
    )
      throw new Error('Durable replay acceptance failed');
    console.log(
      JSON.stringify({
        status: calls === 1 ? 'PASS' : 'NOT RUN',
        scope: 'genuine single sandbox operation and durable replay ONLY',
        operation: p.operation,
        provider: p.merchant.provider,
        outcome: result.status,
        providerCalls: calls,
        remaining:
          'webhook, settlement, full reconciliation, negative scopes and independent acceptance NOT RUN by this command',
      }),
    );
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    'BLOCKED: sandbox acceptance stopped. Credentials/provider/database diagnostics are withheld. Inspect private operator evidence; do not automatically retry.',
  );
  process.exitCode = 1;
});
