import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readCycle13File } from './check-cycle13-integrity.mjs';
import { validateCycle14Manifest } from './check-cycle14-integrity.mjs';

export const cycle15Packages = [
  ['field-task-continuity', 'FieldTaskContinuity'],
  ['finance-review-path', 'FinanceReviewPath'],
  ['service-review-path', 'ServiceReviewPath'],
  ['maintenance-review-path', 'MaintenanceReviewPath'],
  ['explainable-task-links', 'ExplainableTaskLinks'],
  ['addon-task-continuity', 'AddonTaskContinuity'],
];

export function validateCycle15Manifest(manifest, read = readCycle13File) {
  if (
    manifest.schema !== 'propel-cycle15-delivery-v1' ||
    manifest.parent_commit !== '610e38abc37a16a9a894e946c0c4c4df16120985' ||
    manifest.plan_commit !== 'b3ff9c9cffcfc8701da99710307a8bec3b53d147' ||
    manifest.coordination_branch !== 'codex/program-cycle-fifteen' ||
    manifest.coordination_draft_pr !== 107 ||
    manifest.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    manifest.packages.length !== 6
  )
    throw Error('Exact bounded Cycle15 source and plan required');
  const prior = new Set(
    [6, 7, 8, 9, 10, 11, 12, 13, 14].flatMap((cycle) =>
      JSON.parse(
        read(`docs/program/CYCLE${cycle}_DELIVERY_INDEX.json`),
      ).packages.flatMap((p) => p.owned_files.map((f) => f.path)),
    ),
  );
  const verify = (files, expected) => {
    const remaining = new Set(expected);
    if (files.length !== remaining.size)
      throw Error('Exact finite author files required');
    for (const file of files) {
      if (!remaining.has(file.path) || prior.has(file.path))
        throw Error('Overlapping or out-of-scope Cycle15 source');
      if (
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        createHash('sha256').update(read(file.path)).digest('hex') !==
          file.sha256
      )
        throw Error(`Reviewed Cycle15 source changed: ${file.path}`);
      remaining.delete(file.path);
      prior.add(file.path);
    }
    if (remaining.size) throw Error('Missing exact source evidence');
  };
  const prs = new Set();
  for (const [i, p] of manifest.packages.entries()) {
    const [module, component] = cycle15Packages[i];
    if (
      p.module !== module ||
      p.component !== component ||
      p.branch !== `codex/cycle15-${module}` ||
      p.parent_commit !== manifest.parent_commit ||
      !/^\/root\//.test(p.owner) ||
      !/^[a-f0-9]{40}$/.test(p.head_commit) ||
      !Number.isSafeInteger(p.draft_pr) ||
      p.draft_pr <= 103 ||
      prs.has(p.draft_pr) ||
      !Number.isSafeInteger(p.focused_new_tests) ||
      p.focused_new_tests < 1
    )
      throw Error('Exact disjoint author identity required');
    prs.add(p.draft_pr);
    verify(p.owned_files, [
      `src/lib/workflows/${module}.ts`,
      `src/components/workflows/${component}.tsx`,
      `src/components/workflows/${module}.css`,
      `tests/cycle15-${module}.test.ts`,
      `docs/program/CYCLE15_${module.replaceAll('-', '_').toUpperCase()}.md`,
    ]);
  }
  if (!/^[a-f0-9]{40}$/.test(manifest.independent_review_commit))
    throw Error('Exact independent review commit required');
  verify(manifest.independent_files, [
    'tests/cycle15-integration.test.ts',
    'docs/program/CYCLE15_INTEGRATION_REVIEW.md',
  ]);
  return {
    packages: 6,
    author_files: 30,
    independent_files: 2,
    retained_author_files: 283,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await import('./check-cycle14-integrity.mjs');
  validateCycle14Manifest(
    JSON.parse(readCycle13File('docs/program/CYCLE14_DELIVERY_INDEX.json')),
  );
  // The older checker CLI validates all original protected/author bytes too.
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, ['scripts/check-cycle14-integrity.mjs'], {
    stdio: 'inherit',
  });
  console.log(
    JSON.stringify(
      validateCycle15Manifest(
        JSON.parse(readCycle13File('docs/program/CYCLE15_DELIVERY_INDEX.json')),
      ),
    ),
  );
  console.log(
    'Cycle15 exact sources; protected/design/release boundaries unchanged. No operational acceptance.',
  );
}
