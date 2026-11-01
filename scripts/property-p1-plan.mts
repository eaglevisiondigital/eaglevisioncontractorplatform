import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  prepareP1,
  featureSql,
  canonical,
} from '../server/property/p1-readiness.ts';
const args = process.argv.slice(2);
if (!args.length) {
  console.log(
    JSON.stringify({
      status: 'PREPARATION_ONLY',
      executor: false,
      requires: 'Private fresh evidence JSON and fixed run key',
      fixtureSteps: 75,
      domainRows: 57,
      featureRows: 3,
      customerMappings: 0,
      reportLeases: 0,
    }),
  );
} else {
  if (args.length !== 2 || args[0].startsWith('--'))
    throw Error(
      'Expected private evidence file and fixed run key; no execute option',
    );
  const raw = readFileSync(args[0], 'utf8');
  if (Buffer.byteLength(raw) > 2097152) throw Error('Evidence too large');
  const input = JSON.parse(raw),
    target = JSON.parse(
      readFileSync('.staging/connected-development-target.json', 'utf8'),
    );
  if (
    input.targetProjectRef !== target.supabase.projectRef ||
    target.environment !== 'internal-development'
  )
    throw Error('Approved development target mismatch');
  const plan = prepareP1(input.evidence, args[1], Date.now()),
    sql = featureSql(plan),
    root = '.staging/property-p1/package/';
  if (existsSync(root))
    throw Error(
      'Frozen proposal already exists; never overwrite reviewed operations',
    );
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const files = {
    'p1-plan.private.json': JSON.stringify(plan, null, 2) + '\n',
    'activate-features.proposed.sql': sql.activation,
    'deactivate-features.proposed.sql': sql.cleanup,
    'p2-separate-review.private.json': JSON.stringify(plan.p2, null, 2) + '\n',
  };
  const entries = Object.entries(files).map(([file, bytes]) => ({
    file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }));
  const operation = {
    status: 'PROPOSED_NOT_AUTHORIZED',
    sourceCheckpoint: 'b63a9ef',
    targetProjectRef: input.targetProjectRef,
    runKey: args[1],
    files: entries,
    featureRows: 3,
    fixtureSteps: 75,
    domainRows: 57,
    assertionRpcProbes: plan.companies.reduce((n, c) => n + c.probes.length, 0),
    maximumWindowSeconds: 1800,
    cleanupAttempts: 2,
    cleanupRetry:
      'manual only after confirmed rolled-back lock timeout and fresh read; unknown result means stop/read-only',
    newIdentities: 0,
    newMemberships: 0,
    newEstimates: 0,
    newUnmatchedExpenses: 3,
    customerMappings: 0,
    reportLeases: 0,
    hostedExecutionAuthorized: false,
    p2ExecutionAuthorized: false,
    providers: false,
    media: false,
    deployment: false,
  };
  const operationBytes = canonical(operation) + '\n',
    sha = createHash('sha256').update(operationBytes).digest('hex');
  for (const [name, bytes] of Object.entries({
    ...files,
    'operation.private.json': operationBytes,
    'operation.sha256': sha + '\n',
  }))
    writeFileSync(root + name, bytes, { mode: 0o600, flag: 'wx' });
  console.log(
    JSON.stringify({
      status: operation.status,
      sha256: sha,
      fixtureSteps: 75,
      domainRows: 57,
      assertionRpcProbes: operation.assertionRpcProbes,
      stageCounts: plan.stageCounts,
      tracking: plan.tracking,
      hostedExecutor: false,
    }),
  );
}
