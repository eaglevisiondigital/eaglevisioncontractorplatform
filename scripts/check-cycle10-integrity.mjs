import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { admitCycle33ExecutionPublished } from './cycle25-source-lineage.mjs';
export const cycle10Packages = [
  ['crew-plan-review', 'CrewPlanReview', 'CREW_PLAN_REVIEW'],
  ['financial-exceptions', 'FinancialExceptions', 'FINANCIAL_EXCEPTIONS'],
  ['service-desk', 'ServiceDesk', 'SERVICE_DESK'],
  ['follow-up-admission', 'FollowUpAdmission', 'FOLLOW_UP_ADMISSION'],
  ['priority-explanations', 'PriorityExplanations', 'PRIORITY_EXPLANATIONS'],
  ['advanced-handoffs', 'AdvancedHandoffs', 'ADVANCED_HANDOFFS'],
];
export function readCycle10File(path) {
  if (
    typeof path !== 'string' ||
    !/^(docs\/program|src\/(lib|components)\/workflows|tests)\/[a-zA-Z0-9_./-]+$/.test(
      path,
    ) ||
    path
      .split('/')
      .some((p) => !p || p === '.' || p === '..' || p.startsWith('.'))
  )
    throw Error('Declared finite public source path required');
  let current = process.cwd();
  for (const segment of path.split('/')) {
    current = resolve(current, segment);
    if (lstatSync(current).isSymbolicLink())
      throw Error('Source symlinks forbidden');
  }
  if (!lstatSync(current).isFile()) throw Error('Regular source required');
  return readFileSync(current);
}
export function validateCycle10Manifest(manifest, read = readCycle10File) {
  if (
    manifest.schema !== 'propel-cycle10-delivery-v1' ||
    manifest.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    manifest.parent_commit !== 'cc034258a9d9cd11599080b6d4169bc3ca7cffd7' ||
    manifest.coordination_branch !== 'codex/program-cycle-ten' ||
    manifest.packages.length !== 6
  )
    throw Error('Exact six-package Cycle10 contract required');
  const paths = new Set(
    [6, 7, 8, 9].flatMap((c) =>
      JSON.parse(
        read(`docs/program/CYCLE${c}_DELIVERY_INDEX.json`),
      ).packages.flatMap((p) => p.owned_files.map((f) => f.path)),
    ),
  );
  const verify = (files, expected) => {
    const remaining = new Set(expected);
    if (files.length !== remaining.size)
      throw Error('Exact finite source scope required');
    for (const file of files) {
      if (!remaining.has(file.path) || paths.has(file.path))
        throw Error('Overlapping or out-of-scope Cycle10 source');
      const bytes = Buffer.from(read(file.path));
      const advanced = file.path === 'src/lib/workflows/advanced-handoffs.ts';
      if (
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        (advanced &&
          file.sha256 !==
            '61c141d0fa24acb8d0eb84c194f6c19576356b875ad95865b72a08b92406db16')
      )
        throw Error(`Reviewed Cycle10 source changed: ${file.path}`);
      if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
        let reviewed = false;
        if (advanced)
          try {
            const result = admitCycle33ExecutionPublished(file, bytes, {
              read,
            });
            reviewed =
              result.source_commit ===
                '58c96bad25b314bcf11faf33020fc7bb2791a429' &&
              result.authority === 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE' &&
              result.business_authority === false &&
              result.restore_adapter === false;
          } catch {
            /* Unknown edits keep the original integrity rejection. */
          }
        if (!reviewed)
          throw Error(`Reviewed Cycle10 source changed: ${file.path}`);
      }
      remaining.delete(file.path);
      paths.add(file.path);
    }
    if (remaining.size) throw Error('Missing exact source evidence');
  };
  const prs = new Set();
  manifest.packages.forEach((p, i) => {
    const [module, component, doc] = cycle10Packages[i];
    if (
      p.module !== module ||
      p.component !== component ||
      p.doc !== `CYCLE10_${doc}` ||
      p.parent_commit !== manifest.parent_commit ||
      !/^codex\/cycle10-/.test(p.branch) ||
      !/^\/root\//.test(p.owner) ||
      !Number.isSafeInteger(p.draft_pr) ||
      p.draft_pr < 66 ||
      prs.has(p.draft_pr) ||
      !/^[a-f0-9]{40}$/.test(p.head_commit) ||
      !Number.isSafeInteger(p.focused_new_tests) ||
      p.focused_new_tests < 1
    )
      throw Error('Exact disjoint author identity required');
    prs.add(p.draft_pr);
    verify(p.owned_files, [
      `src/lib/workflows/${module}.ts`,
      `src/components/workflows/${component}.tsx`,
      `src/components/workflows/${module}.css`,
      `tests/cycle10-${module}.test.ts`,
      `docs/program/CYCLE10_${doc}.md`,
    ]);
  });
  if (!/^[a-f0-9]{40}$/.test(manifest.independent_review_commit))
    throw Error('Exact independent review identity required');
  verify(manifest.independent_files, [
    'tests/cycle10-integration.test.ts',
    'docs/program/CYCLE10_INTEGRATION_REVIEW.md',
  ]);
  return { packages: 6, author_files: 30, independent_files: 2 };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await import('./check-cycle9-integrity.mjs');
  validateCycle10Manifest(
    JSON.parse(readCycle10File('docs/program/CYCLE10_DELIVERY_INDEX.json')),
  );
  console.log(
    'Cycle10: 6 exact drafts / 30 disjoint author files and two independent files PASS. All retained protected/118 C6-C9 author bytes remain exact. Local evidence only.',
  );
}
