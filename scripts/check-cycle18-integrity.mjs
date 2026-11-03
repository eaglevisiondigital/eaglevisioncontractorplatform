import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
export const cycle18Packages = [
  ['field-agenda', 'FieldAgenda'],
  ['cost-invoice-review', 'CostInvoiceReview'],
  ['service-update-review', 'ServiceUpdateReview'],
  ['maintenance-agenda', 'MaintenanceAgenda'],
  ['priority-actions', 'PriorityActions'],
];
export function validateCycle18Manifest(
  manifest,
  read = (p) => readFileSync(p),
) {
  if (
    manifest.schema !== 'propel-cycle18-delivery-v1' ||
    manifest.parent_commit !== 'ab7a95596f89f7bceb1fc089cdaa790a55fb10d5' ||
    manifest.plan_commit !== '428c2a9afce95c98cc8be4a725a3e22b02b0e70d' ||
    manifest.coordination_branch !== 'codex/program-cycle-eighteen' ||
    manifest.coordination_draft_pr !== 125 ||
    manifest.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    manifest.independent_status !== 'CLEAR_LOCAL_SYNTHETIC_ONLY' ||
    manifest.packages.length !== 5
  )
    throw Error('Exact bounded Cycle18 source and plan required');
  const prior = new Set(
    [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].flatMap((c) =>
      JSON.parse(
        read(`docs/program/CYCLE${c}_DELIVERY_INDEX.json`),
      ).packages.flatMap((p) => p.owned_files.map((f) => f.path)),
    ),
  );
  const seenPRs = new Set();
  const verify = (files, expected) => {
    const remaining = new Set(expected);
    if (files.length !== remaining.size)
      throw Error('Exact finite author files required');
    for (const f of files) {
      if (!remaining.has(f.path) || prior.has(f.path))
        throw Error('Overlapping or out-of-scope Cycle18 source');
      if (
        !/^[a-f0-9]{64}$/.test(f.sha256) ||
        createHash('sha256').update(read(f.path)).digest('hex') !== f.sha256
      )
        throw Error(`Reviewed Cycle18 source changed: ${f.path}`);
      remaining.delete(f.path);
      prior.add(f.path);
    }
    if (remaining.size) throw Error('Missing exact source evidence');
  };
  for (const [i, p] of manifest.packages.entries()) {
    const [module, component] = cycle18Packages[i];
    if (
      p.module !== module ||
      p.component !== component ||
      p.branch !== `codex/cycle18-${module}` ||
      p.parent_commit !== manifest.plan_commit ||
      !/^\/root\//.test(p.owner) ||
      !/^([a-f0-9]{40})$/.test(p.head_commit) ||
      !Number.isSafeInteger(p.draft_pr) ||
      p.draft_pr <= 125 ||
      seenPRs.has(p.draft_pr) ||
      !Number.isSafeInteger(p.focused_new_tests) ||
      p.focused_new_tests < 1
    )
      throw Error('Exact disjoint author identity required');
    seenPRs.add(p.draft_pr);
    verify(p.owned_files, [
      `src/lib/workflows/${module}.ts`,
      `src/components/workflows/${component}.tsx`,
      `src/components/workflows/${module}.css`,
      `tests/cycle18-${module}.test.ts`,
      `docs/program/CYCLE18_${module.replaceAll('-', '_').toUpperCase()}.md`,
    ]);
  }
  if (!/^[a-f0-9]{40}$/.test(manifest.independent_review_commit))
    throw Error('Exact independent review commit required');
  verify(manifest.independent_files, [
    'tests/cycle18-independent-integration-review.test.ts',
    'docs/program/CYCLE18_INDEPENDENT_REVIEW.json',
  ]);
  return {
    packages: 5,
    author_files: 25,
    independent_files: 2,
    retained_author_files: 373,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  execFileSync(process.execPath, ['scripts/check-cycle17-integrity.mjs'], {
    stdio: 'inherit',
  });
  console.log(
    JSON.stringify(
      validateCycle18Manifest(
        JSON.parse(
          readFileSync('docs/program/CYCLE18_DELIVERY_INDEX.json', 'utf8'),
        ),
      ),
    ),
  );
  console.log(
    'Cycle18 exact sources; protected/design/release boundaries unchanged. No operational acceptance.',
  );
}
