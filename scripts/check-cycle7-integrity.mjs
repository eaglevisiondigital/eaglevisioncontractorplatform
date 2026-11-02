import './check-cycle6-integrity.mjs';
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
      throw Error('Source symlinks are not permitted');
  }
  if (!lstatSync(current).isFile()) throw Error('Regular source required');
  return readFileSync(current);
};
const manifest = JSON.parse(read('docs/program/CYCLE7_DELIVERY_INDEX.json'));
const baseline = JSON.parse(read('docs/program/CYCLE6_DELIVERY_INDEX.json'));
if (
  manifest.schema !== 'propel-cycle7-delivery-v1' ||
  manifest.release !== 'NOT_READY_NOT_AUTHORIZED' ||
  manifest.parent_commit !== 'f89c2bd32d1f5c8a05a1f12805140235845c81fb' ||
  manifest.packages.length !== 3
)
  throw Error('Exact bounded Cycle7 source contract required');
const paths = new Set(
  baseline.packages.flatMap((p) => p.owned_files.map((f) => f.path)),
);
const expected = [
  ['customer-service', 'CustomerService', 'CYCLE7_CUSTOMER_SERVICE', 46],
  ['job-review', 'JobReview', 'CYCLE7_JOB_REVIEW', 47],
  ['booking-scheduling', 'BookingScheduling', 'CYCLE7_BOOKING_SCHEDULING', 48],
];
for (const [index, pkg] of manifest.packages.entries()) {
  const [module, component, doc, pr] = expected[index];
  if (
    !/^[a-f0-9]{40}$/.test(pkg.head_commit) ||
    pkg.parent_commit !== manifest.parent_commit ||
    pkg.draft_pr !== pr ||
    !pkg.branch.startsWith('codex/') ||
    pkg.owned_files.length !== 5
  )
    throw Error('Exact draft source identity required');
  const owned = new Set([
    `src/lib/workflows/${module}.ts`,
    `src/components/workflows/${component}.tsx`,
    `src/components/workflows/${module}.css`,
    `tests/cycle7-${module}.test.ts`,
    `docs/program/${doc}.md`,
  ]);
  for (const file of pkg.owned_files) {
    if (!owned.has(file.path) || paths.has(file.path))
      throw Error('Overlapping or out-of-scope author path');
    if (
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      createHash('sha256').update(read(file.path)).digest('hex') !== file.sha256
    )
      throw Error(`Reviewed Cycle7 source changed: ${file.path}`);
    paths.add(file.path);
    owned.delete(file.path);
  }
  if (owned.size) throw Error('Missing source evidence');
}
console.log(
  'Cycle7: 3 exact draft packages / 15 disjoint reviewed files PASS. Unsaved local reviews only; no operational acceptance.',
);
