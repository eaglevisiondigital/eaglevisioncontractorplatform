import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readCycle13File } from './check-cycle13-integrity.mjs';
import { validateCycle15Manifest } from './check-cycle15-integrity.mjs';

export const cycle16Packages = [
  ['daily-field-guide', 'DailyFieldGuide'],
  ['daily-finance-guide', 'DailyFinanceGuide'],
  ['service-completion-guide', 'ServiceCompletionGuide'],
  ['retention-review-guide', 'RetentionReviewGuide'],
  ['owner-briefing-guide', 'OwnerBriefingGuide'],
  ['addon-readiness-guide', 'AddonReadinessGuide'],
];

export function validateCycle16Manifest(manifest, read = readCycle13File) {
  if (
    manifest.schema !== 'propel-cycle16-delivery-v1' ||
    manifest.parent_commit !== 'b4014771050b28d1ec1dffd0fa42cb3617a5fae9' ||
    manifest.plan_commit !== 'cf8e2fcf57d8455c118310a553096577599c3232' ||
    manifest.coordination_branch !== 'codex/program-cycle-sixteen' ||
    manifest.coordination_draft_pr !== 111 ||
    manifest.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    manifest.independent_status !== 'CLEAR_LOCAL_SYNTHETIC_ONLY' ||
    manifest.packages.length !== 6
  )
    throw Error('Exact bounded Cycle16 source and plan required');
  const prior = new Set(
    [6, 7, 8, 9, 10, 11, 12, 13, 14, 15].flatMap((cycle) =>
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
        throw Error('Overlapping or out-of-scope Cycle16 source');
      if (
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        createHash('sha256').update(read(file.path)).digest('hex') !==
          file.sha256
      )
        throw Error(`Reviewed Cycle16 source changed: ${file.path}`);
      remaining.delete(file.path);
      prior.add(file.path);
    }
    if (remaining.size) throw Error('Missing exact source evidence');
  };
  const prs = new Set();
  for (const [i, p] of manifest.packages.entries()) {
    const [module, component] = cycle16Packages[i];
    if (
      p.module !== module ||
      p.component !== component ||
      p.branch !== `codex/cycle16-${module}` ||
      p.parent_commit !== manifest.parent_commit ||
      !/^\/root\//.test(p.owner) ||
      !/^[a-f0-9]{40}$/.test(p.head_commit) ||
      !Number.isSafeInteger(p.draft_pr) ||
      p.draft_pr <= 111 ||
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
      `tests/cycle16-${module}.test.ts`,
      `docs/program/CYCLE16_${module.replaceAll('-', '_').toUpperCase()}.md`,
    ]);
  }
  if (!/^[a-f0-9]{40}$/.test(manifest.independent_review_commit))
    throw Error('Exact independent review commit required');
  verify(manifest.independent_files, [
    'tests/cycle16-integration.test.ts',
    'docs/program/CYCLE16_INTEGRATION_REVIEW.md',
  ]);
  return {
    packages: 6,
    author_files: 30,
    independent_files: 2,
    retained_author_files: 313,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await import('./check-cycle15-integrity.mjs');
  validateCycle15Manifest(
    JSON.parse(readCycle13File('docs/program/CYCLE15_DELIVERY_INDEX.json')),
  );
  // The older checker CLI validates all original protected/author bytes too.
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, ['scripts/check-cycle15-integrity.mjs'], {
    stdio: 'inherit',
  });
  console.log(
    JSON.stringify(
      validateCycle16Manifest(
        JSON.parse(readCycle13File('docs/program/CYCLE16_DELIVERY_INDEX.json')),
      ),
    ),
  );
  console.log(
    'Cycle16 exact sources; protected/design/release boundaries unchanged. No operational acceptance.',
  );
}
