import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { admitPilotPassportPublished } from './v1-pilot-source-integrity.mjs';
export const cycle13Packages = [
  ['work-order-revisions', 'WorkOrderRevisions', 'WORK_ORDER_REVISIONS'],
  ['financial-casework', 'FinancialCasework', 'FINANCIAL_CASEWORK'],
  ['service-passport-desk', 'ServicePassportDesk', 'SERVICE_PASSPORT_DESK'],
  ['follow-up-readiness', 'FollowUpReadiness', 'FOLLOW_UP_READINESS'],
  ['operating-navigation', 'OperatingNavigation', 'OPERATING_NAVIGATION'],
  ['addon-review-desk', 'AddonReviewDesk', 'ADDON_REVIEW_DESK'],
  ['visual-approval-inventory', null, 'VISUAL_APPROVAL_REVIEW'],
];
export function cycle13OwnedPaths(i) {
  const [module, component, doc] = cycle13Packages[i];
  if (i === 6)
    return [
      'docs/program/CYCLE13_VISUAL_APPROVAL_INVENTORY.json',
      'docs/program/CYCLE13_VISUAL_APPROVAL_REVIEW.md',
      'scripts/cycle13-visual-comparison.mjs',
      'scripts/cycle13-visual-comparison.d.mts',
      'tests/program/cycle13-visual-evidence.test.ts',
    ];
  return [
    `src/lib/workflows/${module}.ts`,
    `src/components/workflows/${component}.tsx`,
    `src/components/workflows/${module}.css`,
    `tests/cycle13-${module}.test.ts`,
    `docs/program/CYCLE13_${doc}.md`,
    ...(i === 0
      ? [
          'server/field-lab/work-order-revisions.ts',
          'tests/helpers/cycle13-work-order-worker.ts',
        ]
      : []),
  ];
}
export function readCycle13File(path) {
  if (
    typeof path !== 'string' ||
    !/^(docs\/program|scripts|src\/(lib|components)\/workflows|server\/(field-lab|consent-lab)|tests)\/[a-zA-Z0-9_./-]+$/.test(
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
export function validateCycle13Manifest(manifest, read = readCycle13File) {
  if (
    manifest.schema !== 'propel-cycle13-delivery-v1' ||
    manifest.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    manifest.parent_commit !== 'c41a2424a0bd098905fd60965ef7f78447f1c753' ||
    manifest.coordination_branch !== 'codex/program-cycle-thirteen' ||
    manifest.packages.length !== 7
  )
    throw Error('Exact seven-package Cycle13 contract required');
  const paths = new Set(
    [6, 7, 8, 9, 10, 11, 12].flatMap((c) =>
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
        throw Error('Overlapping or out-of-scope Cycle13 source');
      const passport =
        file.path === 'src/lib/workflows/service-passport-desk.ts';
      const bytes = Buffer.from(read(file.path));
      if (
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        (passport &&
          file.sha256 !==
            'b235dc62e3b6e3f0eceed01af3c36ce94fbf1c2d274b1e5f219abef7d9b73f53')
      )
        throw Error(`Reviewed Cycle13 source changed: ${file.path}`);
      if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
        let reviewed = false;
        if (passport)
          try {
            const result = admitPilotPassportPublished(file, bytes, { read });
            reviewed =
              result.source_commit ===
                '4151bbcfa3d049d0cc0a895487a0a51ff066c49d' &&
              result.authority === 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE' &&
              result.business_authority === false &&
              result.restore_adapter === false;
          } catch {
            /* Unknown edits retain the original integrity rejection. */
          }
        if (!reviewed)
          throw Error(`Reviewed Cycle13 source changed: ${file.path}`);
      }
      remaining.delete(file.path);
      paths.add(file.path);
    }
    if (remaining.size) throw Error('Missing exact source evidence');
  };
  const prs = new Set();
  manifest.packages.forEach((p, i) => {
    const [module, component, doc] = cycle13Packages[i];
    if (
      p.module !== module ||
      p.component !== component ||
      p.doc !== `CYCLE13_${doc}` ||
      p.parent_commit !== manifest.parent_commit ||
      !/^codex\/cycle13-/.test(p.branch) ||
      !/^\/root\//.test(p.owner) ||
      !Number.isSafeInteger(p.draft_pr) ||
      p.draft_pr < 89 ||
      prs.has(p.draft_pr) ||
      !/^[a-f0-9]{40}$/.test(p.head_commit) ||
      !Number.isSafeInteger(p.focused_new_tests) ||
      p.focused_new_tests < 1
    )
      throw Error('Exact disjoint author identity required');
    prs.add(p.draft_pr);
    verify(p.owned_files, cycle13OwnedPaths(i));
  });
  if (!/^[a-f0-9]{40}$/.test(manifest.independent_review_commit))
    throw Error('Exact independent review identity required');
  verify(manifest.independent_files, [
    'tests/cycle13-integration.test.ts',
    'docs/program/CYCLE13_INTEGRATION_REVIEW.md',
  ]);
  return { packages: 7, author_files: 37, independent_files: 2 };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await import('./check-cycle9-integrity.mjs');
  for (const cycle of [10, 11]) {
    const checks = await import(`./check-cycle${cycle}-integrity.mjs`);
    checks[`validateCycle${cycle}Manifest`](
      JSON.parse(
        readCycle13File(`docs/program/CYCLE${cycle}_DELIVERY_INDEX.json`),
      ),
    );
  }
  const { validateCycle12Manifest } =
    await import('./check-cycle12-integrity.mjs');
  validateCycle12Manifest(
    JSON.parse(readCycle13File('docs/program/CYCLE12_DELIVERY_INDEX.json')),
  );
  validateCycle13Manifest(
    JSON.parse(readCycle13File('docs/program/CYCLE13_DELIVERY_INDEX.json')),
  );
  console.log(
    'Cycle13: 7 original drafts / 37 disjoint author paths and two independent files PASS, with only the finite reviewed Passport native successor permitted. Original pins remain unchanged. Local source evidence only.',
  );
}
