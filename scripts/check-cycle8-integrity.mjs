import {
  validateSalesPackage,
  validateSalesPublishedSource,
  ports as salesSourcePorts,
} from './v1-sales-source-admission.mjs';
import './check-cycle7-integrity.mjs';
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const read = (path) => {
  if (
    typeof path !== 'string' ||
    !/^(docs\/program|src\/(lib|components)\/workflows|tests)\/[a-zA-Z0-9_./-]+$/.test(
      path,
    ) ||
    path
      .split('/')
      .some((p) => !p || p === '.' || p === '..' || p.startsWith('.'))
  )
    throw Error('Declared public source path required');
  let current = process.cwd();
  for (const part of path.split('/')) {
    current = resolve(current, part);
    if (lstatSync(current).isSymbolicLink())
      throw Error('Source symlinks forbidden');
  }
  if (!lstatSync(current).isFile()) throw Error('Regular source required');
  return readFileSync(current);
};
const manifest = JSON.parse(read('docs/program/CYCLE8_DELIVERY_INDEX.json'));
const prior = [6, 7].flatMap(
  (cycle) =>
    JSON.parse(read(`docs/program/CYCLE${cycle}_DELIVERY_INDEX.json`)).packages,
);
if (
  manifest.schema !== 'propel-cycle8-delivery-v1' ||
  manifest.release !== 'NOT_READY_NOT_AUTHORIZED' ||
  manifest.parent_commit !== 'a20f11855388e7cf8283294a3775e1c86a2cc66e' ||
  manifest.packages.length !== 6
)
  throw Error('Exact six-package Cycle8 contract required');
const paths = new Set(prior.flatMap((p) => p.owned_files.map((f) => f.path)));
const expected = [
  ['weekly-crew', 'WeeklyCrew', 'CYCLE8_WEEKLY_CREW'],
  ['finance-desk', 'FinanceDesk', 'CYCLE8_FINANCE_DESK'],
  ['sales-desk', 'SalesDesk', 'CYCLE8_SALES_DESK'],
  ['completion-review', 'CompletionReview', 'CYCLE8_COMPLETION_REVIEW'],
  ['maintenance-desk', 'MaintenanceDesk', 'CYCLE8_MAINTENANCE_DESK'],
  ['daily-operations', 'DailyOperations', 'CYCLE8_DAILY_OPERATIONS'],
];
const prs = new Set();
for (const [index, pkg] of manifest.packages.entries()) {
  const [module, component, doc] = expected[index];
  if (
    !/^[a-f0-9]{40}$/.test(pkg.head_commit) ||
    pkg.parent_commit !== manifest.parent_commit ||
    !Number.isSafeInteger(pkg.draft_pr) ||
    pkg.draft_pr <= 49 ||
    prs.has(pkg.draft_pr) ||
    !pkg.branch.startsWith('codex/cycle8-') ||
    pkg.owned_files.length !== 5
  )
    throw Error('Exact distinct draft source identity required');
  prs.add(pkg.draft_pr);
  if (index === 2) validateSalesPackage(pkg);
  const owned = new Set([
    `src/lib/workflows/${module}.ts`,
    `src/components/workflows/${component}.tsx`,
    `src/components/workflows/${module}.css`,
    `tests/cycle8-${module}.test.ts`,
    `docs/program/${doc}.md`,
  ]);
  for (const file of pkg.owned_files) {
    if (!owned.has(file.path) || paths.has(file.path))
      throw Error('Overlapping/out-of-scope author path');
    const bytes = read(file.path);
    if (!/^[a-f0-9]{64}$/.test(file.sha256))
      throw Error(`Reviewed Cycle8 source changed: ${file.path}`);
    if (index === 2 && file.path === 'src/lib/workflows/sales-desk.ts') {
      validateSalesPublishedSource(file, bytes, pkg, {
        read: (path) =>
          path === '.github/workflows/v1-sales-final-authority.yml'
            ? salesSourcePorts.read(path)
            : read(path),
      });
    } else if (createHash('sha256').update(bytes).digest('hex') !== file.sha256)
      throw Error(`Reviewed Cycle8 source changed: ${file.path}`);
    paths.add(file.path);
    owned.delete(file.path);
  }
  if (owned.size) throw Error('Missing source evidence');
}
// One explicit forward test correction; never rewrite the historical C5 source index
// or use this record to relax business-source, migration or artwork locks.
const correctionPath = 'tests/program-controlled-integration-contracts.test.ts';
const legacy = JSON.parse(read('docs/program/CYCLE5_DELIVERY_INDEX.json'))
  .packages.flatMap((p) => p.owned_files)
  .find((f) => f.path === correctionPath);
const corrections = manifest.compatibility_fixes;
if (!Array.isArray(corrections) || corrections.length !== 1)
  throw Error('Exact finite compatibility correction required');
const correction = corrections[0];
if (
  correction.path !== correctionPath ||
  paths.has(correction.path) ||
  correction.base_commit !== manifest.parent_commit ||
  correction.base_sha256 !== legacy?.sha256 ||
  !/^[a-f0-9]{40}$/.test(correction.commit) ||
  !/^[a-f0-9]{64}$/.test(correction.sha256) ||
  createHash('sha256').update(read(correction.path)).digest('hex') !==
    correction.sha256
)
  throw Error('Unreviewed compatibility correction');
console.log(
  'Cycle8: 6 exact draft packages / 30 disjoint source files PASS. Local review only; no operational acceptance.',
);
