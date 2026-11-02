import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export const cycle12Packages = [
  [
    'schedule-proposal-revisions',
    'ScheduleProposalRevisions',
    'SCHEDULE_PROPOSAL_REVISIONS',
  ],
  [
    'financial-evidence-review',
    'FinancialEvidenceReview',
    'FINANCIAL_EVIDENCE_REVIEW',
  ],
  [
    'service-lifecycle-review',
    'ServiceLifecycleReview',
    'SERVICE_LIFECYCLE_REVIEW',
  ],
  [
    'consent-cancellation-review',
    'ConsentCancellationReview',
    'CONSENT_CANCELLATION_REVIEW',
  ],
  [
    'verified-operating-suggestions',
    'VerifiedOperatingSuggestions',
    'VERIFIED_OPERATING_SUGGESTIONS',
  ],
  [
    'external-proposal-lifecycle',
    'ExternalProposalLifecycle',
    'EXTERNAL_PROPOSAL_LIFECYCLE',
  ],
];
export function cycle12OwnedPaths(i) {
  const [module, component, doc] = cycle12Packages[i];
  return [
    `src/lib/workflows/${module}.ts`,
    `src/components/workflows/${component}.tsx`,
    `src/components/workflows/${module}.css`,
    `tests/cycle12-${module}.test.ts`,
    `docs/program/CYCLE12_${doc}.md`,
    ...(i === 0
      ? [
          'server/field-lab/proposal-revisions.ts',
          'tests/helpers/cycle12-schedule-worker.ts',
        ]
      : []),
    ...(i === 3
      ? [
          'server/consent-lab/cancellation-review.ts',
          'tests/helpers/cycle12-consent-worker.ts',
        ]
      : []),
  ];
}
export function readCycle12File(path) {
  if (
    typeof path !== 'string' ||
    !/^(docs\/program|src\/(lib|components)\/workflows|server\/(field-lab|consent-lab)|tests)\/[a-zA-Z0-9_./-]+$/.test(
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
export function validateCycle12Manifest(manifest, read = readCycle12File) {
  if (
    manifest.schema !== 'propel-cycle12-delivery-v1' ||
    manifest.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    manifest.parent_commit !== '2691fcf9aafb77f831899144c020a8d562222722' ||
    manifest.coordination_branch !== 'codex/program-cycle-twelve' ||
    manifest.packages.length !== 6
  )
    throw Error('Exact six-package Cycle12 contract required');
  const paths = new Set(
    [6, 7, 8, 9, 10, 11].flatMap((c) =>
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
        throw Error('Overlapping or out-of-scope Cycle12 source');
      if (
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        createHash('sha256').update(read(file.path)).digest('hex') !==
          file.sha256
      )
        throw Error(`Reviewed Cycle12 source changed: ${file.path}`);
      remaining.delete(file.path);
      paths.add(file.path);
    }
    if (remaining.size) throw Error('Missing exact source evidence');
  };
  const prs = new Set();
  manifest.packages.forEach((p, i) => {
    const [module, component, doc] = cycle12Packages[i];
    if (
      p.module !== module ||
      p.component !== component ||
      p.doc !== `CYCLE12_${doc}` ||
      p.parent_commit !== manifest.parent_commit ||
      !/^codex\/cycle12-/.test(p.branch) ||
      !/^\/root\//.test(p.owner) ||
      !Number.isSafeInteger(p.draft_pr) ||
      p.draft_pr < 82 ||
      prs.has(p.draft_pr) ||
      !/^[a-f0-9]{40}$/.test(p.head_commit) ||
      !Number.isSafeInteger(p.focused_new_tests) ||
      p.focused_new_tests < 1
    )
      throw Error('Exact disjoint author identity required');
    prs.add(p.draft_pr);
    verify(p.owned_files, cycle12OwnedPaths(i));
  });
  if (!/^[a-f0-9]{40}$/.test(manifest.independent_review_commit))
    throw Error('Exact independent review identity required');
  verify(manifest.independent_files, [
    'tests/cycle12-integration.test.ts',
    'docs/program/CYCLE12_INTEGRATION_REVIEW.md',
  ]);
  return { packages: 6, author_files: 34, independent_files: 2 };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await import('./check-cycle9-integrity.mjs');
  const { validateCycle10Manifest } =
    await import('./check-cycle10-integrity.mjs');
  validateCycle10Manifest(
    JSON.parse(readCycle12File('docs/program/CYCLE10_DELIVERY_INDEX.json')),
  );
  const { validateCycle11Manifest } =
    await import('./check-cycle11-integrity.mjs');
  validateCycle11Manifest(
    JSON.parse(readCycle12File('docs/program/CYCLE11_DELIVERY_INDEX.json')),
  );
  validateCycle12Manifest(
    JSON.parse(readCycle12File('docs/program/CYCLE12_DELIVERY_INDEX.json')),
  );
  console.log(
    'Cycle12: 6 exact drafts / 34 disjoint author files and two independent files PASS. All retained protected/182 C6-C11 author bytes remain exact. Local evidence only.',
  );
}
