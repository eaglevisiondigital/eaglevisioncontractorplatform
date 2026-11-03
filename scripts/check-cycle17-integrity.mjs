import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
export const cycle17Packages = [
  ['field-workspace', 'FieldWorkspace'],
  ['finance-case-desk', 'FinanceCaseDesk'],
  ['service-passport-path', 'ServicePassportPath'],
  ['retained-maintenance-desk', 'RetainedMaintenanceDesk'],
  ['owner-action-desk', 'OwnerActionDesk'],
  ['addon-task-desk', 'AddonTaskDesk'],
];
export function validateCycle17Manifest(
  manifest,
  read = (p) => readFileSync(p),
) {
  if (
    manifest.schema !== 'propel-cycle17-delivery-v1' ||
    manifest.parent_commit !== '3cbea85ce464b3e67fb78c8992ec192cdd8d2407' ||
    manifest.plan_commit !== '624ae715d05cc8bf602fcefe3843063fc1debc8d' ||
    manifest.coordination_branch !== 'codex/program-cycle-seventeen' ||
    manifest.coordination_draft_pr !== 118 ||
    manifest.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    manifest.independent_status !== 'CLEAR_LOCAL_SYNTHETIC_ONLY' ||
    manifest.packages.length !== 6
  )
    throw Error('Exact bounded Cycle17 source and plan required');
  const prior = new Set(
    [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].flatMap((c) =>
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
        throw Error('Overlapping or out-of-scope Cycle17 source');
      if (
        !/^[a-f0-9]{64}$/.test(f.sha256) ||
        createHash('sha256').update(read(f.path)).digest('hex') !== f.sha256
      )
        throw Error(`Reviewed Cycle17 source changed: ${f.path}`);
      remaining.delete(f.path);
      prior.add(f.path);
    }
    if (remaining.size) throw Error('Missing exact source evidence');
  };
  for (const [i, p] of manifest.packages.entries()) {
    const [module, component] = cycle17Packages[i];
    if (
      p.module !== module ||
      p.component !== component ||
      p.branch !== `codex/cycle17-${module}` ||
      p.parent_commit !== manifest.parent_commit ||
      !/^\/root\//.test(p.owner) ||
      !/^([a-f0-9]{40})$/.test(p.head_commit) ||
      !Number.isSafeInteger(p.draft_pr) ||
      p.draft_pr <= 118 ||
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
      `tests/cycle17-${module}.test.ts`,
      `docs/program/CYCLE17_${module.replaceAll('-', '_').toUpperCase()}.md`,
    ]);
  }
  if (!/^[a-f0-9]{40}$/.test(manifest.independent_review_commit))
    throw Error('Exact independent review commit required');
  verify(manifest.independent_files, [
    'tests/cycle17-integration.test.ts',
    'docs/program/CYCLE17_INTEGRATION_REVIEW.md',
  ]);
  return {
    packages: 6,
    author_files: 30,
    independent_files: 2,
    retained_author_files: 343,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  execFileSync(process.execPath, ['scripts/check-cycle16-integrity.mjs'], {
    stdio: 'inherit',
  });
  console.log(
    JSON.stringify(
      validateCycle17Manifest(
        JSON.parse(
          readFileSync('docs/program/CYCLE17_DELIVERY_INDEX.json', 'utf8'),
        ),
      ),
    ),
  );
  console.log(
    'Cycle17 exact sources; protected/design/release boundaries unchanged. No operational acceptance.',
  );
}
