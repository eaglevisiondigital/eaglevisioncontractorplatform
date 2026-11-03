import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  readCycle13File,
  validateCycle13Manifest,
} from './check-cycle13-integrity.mjs';
export const cycle14Packages = [
  ['schedule-work-order-continuity', 'ScheduleWorkOrderContinuity'],
  ['finance-case-continuity', 'FinanceCaseContinuity'],
  ['service-source-continuity', 'ServiceSourceContinuity'],
  ['maintenance-planning-continuity', 'MaintenancePlanningContinuity'],
  ['verified-task-handoff', 'VerifiedTaskHandoff'],
  ['source-bound-addons', 'SourceBoundAddons'],
];
export function validateCycle14Manifest(manifest, read = readCycle13File) {
  if (
    manifest.schema !== 'propel-cycle14-delivery-v1' ||
    manifest.parent_commit !== '8079d2ba8ab8989f168693bd0fc7fa60d30fed1b' ||
    manifest.coordination_branch !== 'codex/program-cycle-fourteen' ||
    manifest.coordination_draft_pr !== 96 ||
    manifest.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    manifest.packages.length !== 6
  )
    throw Error('Exact bounded six-package Cycle14 contract required');
  const prior = new Set(
    [6, 7, 8, 9, 10, 11, 12, 13].flatMap((c) =>
      JSON.parse(
        read(`docs/program/CYCLE${c}_DELIVERY_INDEX.json`),
      ).packages.flatMap((p) => p.owned_files.map((f) => f.path)),
    ),
  );
  const verify = (files, expected) => {
    const pending = new Set(expected);
    if (files.length !== pending.size)
      throw Error('Exact finite author files required');
    for (const file of files) {
      if (!pending.has(file.path) || prior.has(file.path))
        throw Error('Overlapping or out-of-scope Cycle14 source');
      if (
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        createHash('sha256').update(read(file.path)).digest('hex') !==
          file.sha256
      )
        throw Error(`Reviewed Cycle14 source changed: ${file.path}`);
      pending.delete(file.path);
      prior.add(file.path);
    }
    if (pending.size) throw Error('Missing exact source evidence');
  };
  const prs = new Set();
  for (const [i, p] of manifest.packages.entries()) {
    const [module, component] = cycle14Packages[i];
    if (
      p.module !== module ||
      p.component !== component ||
      p.parent_commit !== manifest.parent_commit ||
      !/^codex\/cycle14-/.test(p.branch) ||
      !/^\/root\//.test(p.owner) ||
      !Number.isSafeInteger(p.draft_pr) ||
      p.draft_pr < 97 ||
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
      `tests/cycle14-${module}.test.ts`,
      `docs/program/CYCLE14_${module.replaceAll('-', '_').toUpperCase()}.md`,
    ]);
  }
  if (!/^[a-f0-9]{40}$/.test(manifest.independent_review_commit))
    throw Error('Exact independent review commit required');
  verify(manifest.independent_files, [
    'tests/cycle14-integration.test.ts',
    'docs/program/CYCLE14_INTEGRATION_REVIEW.md',
  ]);
  return {
    packages: 6,
    author_files: 30,
    independent_files: 2,
    retained_author_files: 253,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await import('./check-cycle13-integrity.mjs');
  validateCycle13Manifest(
    JSON.parse(readCycle13File('docs/program/CYCLE13_DELIVERY_INDEX.json')),
  );
  for (const c of [10, 11, 12]) {
    const checks = await import(`./check-cycle${c}-integrity.mjs`);
    checks[`validateCycle${c}Manifest`](
      JSON.parse(readCycle13File(`docs/program/CYCLE${c}_DELIVERY_INDEX.json`)),
    );
  }
  await import('./check-cycle9-integrity.mjs');
  console.log(
    JSON.stringify(
      validateCycle14Manifest(
        JSON.parse(readCycle13File('docs/program/CYCLE14_DELIVERY_INDEX.json')),
      ),
    ),
  );
  console.log(
    'Protected artifacts, five design locks/thirteen bindings and retained author bytes PASS. Local evidence only; release NOT AUTHORIZED.',
  );
}
