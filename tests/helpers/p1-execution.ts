import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { p1Evidence, p1Now } from './property-p1-fixture';
import { prepareP1, featureSql } from '../../server/property/p1-readiness';
import {
  sha256,
  canonical,
  loadP1Package,
} from '../../server/property/execution/package';
export function executionPackage(evidence = p1Evidence()) {
  const root = mkdtempSync(join(tmpdir(), 'propel-executor-'));
  chmodSync(root, 0o700);
  const plan = prepareP1(evidence, 'p1-local-executor', p1Now),
    sql = featureSql(plan);
  const bytes = {
    'p1-plan.private.json': JSON.stringify(plan),
    'activate-features.proposed.sql': sql.activation,
    'deactivate-features.proposed.sql': sql.cleanup,
    'p2-separate-review.private.json': JSON.stringify(plan.p2),
  };
  const op = {
    targetProjectRef: 'a'.repeat(20),
    files: Object.entries(bytes).map(([file, text]) => ({
      file,
      sha256: sha256(text),
    })),
    maximumWindowSeconds: 1800,
    fixtureSteps: 75,
    assertionRpcProbes: 69,
    domainRows: 57,
    featureRows: 3,
    customerMappings: 0,
    reportLeases: 0,
    providers: false,
    media: false,
    deployment: false,
    runKey: plan.runKey,
  };
  const raw = canonical(op) + '\n',
    hash = sha256(raw);
  for (const [file, text] of Object.entries({
    ...bytes,
    'operation.private.json': raw,
  }))
    writeFileSync(join(root, file), text, { mode: 0o600 });
  return {
    root,
    evidence,
    plan,
    hash,
    frozen: loadP1Package(root, op.targetProjectRef, hash),
  };
}
