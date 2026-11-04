// Extend the unchanged 76-file capture evidence with the two corrected native
// consumers outside that historical inventory. No historical capture is rewritten.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspectCycle32Sources } from './cycle25-source-lineage.mjs';

const directory = resolve(
  process.env.CYCLE24_ARTIFACT_DIR ?? 'artifacts/cycle28',
);
inspectCycle32Sources({ requireCombined: true });
await import('./collect-cycle24-browser.mjs');
const old = JSON.parse(
  readFileSync(resolve(directory, 'browser-validation.json')),
);
if (old.executed_commits.length !== 1 || old.runtime_files !== 76)
  throw Error(
    'One exact existing browser capture and 76-file inventory required',
  );
const commit = old.executed_commits[0];
const extra = [
  'src/lib/profit-guard.ts',
  'src/lib/program/voice-estimate.ts',
].map((path) => {
  const bytes = readFileSync(path);
  const original = execFileSync('git', ['show', `${commit}:${path}`]);
  if (!bytes.equals(original))
    throw Error('Additional corrected consumer differs from captured commit');
  return { path, sha256: createHash('sha256').update(bytes).digest('hex') };
});
const value = {
  ...old,
  schema: 'propel-cycle32-browser-validation-v1',
  additional_execution_bound_sources: extra,
  runtime_files: 78,
  capture_inventory_limit:
    '76_CAPTURED_PLUS_2_EXECUTION_BOUND_NOT_COMPLETE_TRANSITIVE_RUNTIME',
  // Physical evidence is separate from local browser captures and never inherited.
  physical_recovery: 'BROWSER_NOT_PHYSICAL_RECOVERY_EVIDENCE',
  owner_witness_reference:
    'docs/program/CYCLE32_PHYSICAL_RECOVERY_EVIDENCE.json',
  visual_approval: 'PENDING',
};
writeFileSync(
  resolve(directory, 'cycle32-browser-validation.json'),
  JSON.stringify(value, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    captured_files: 76,
    additional_bound_files: 2,
    total_scoped_files: 78,
    complete_transitive_runtime: false,
  }),
);
