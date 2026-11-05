import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  admitCycle33Forward,
  cycle25SourcePorts,
} from './cycle25-source-lineage.mjs';
export const cycle11Packages = [
  ['crew-assignment-lab', 'CrewAssignmentLab', 'CREW_ASSIGNMENT_LAB'],
  [
    'financial-correction-review',
    'FinancialCorrectionReview',
    'FINANCIAL_CORRECTION_REVIEW',
  ],
  ['service-continuity', 'ServiceContinuity', 'SERVICE_CONTINUITY'],
  ['atomic-consent-lab', 'AtomicConsentLab', 'ATOMIC_CONSENT_LAB'],
  ['daily-action-center', 'DailyActionCenter', 'DAILY_ACTION_CENTER'],
  ['sync-admission-review', 'SyncAdmissionReview', 'SYNC_ADMISSION_REVIEW'],
];
export function cycle11OwnedPaths(i) {
  const [module, component, doc] = cycle11Packages[i];
  return [
    `src/lib/workflows/${module}.ts`,
    `src/components/workflows/${component}.tsx`,
    `src/components/workflows/${module}.css`,
    `tests/cycle11-${module}.test.ts`,
    `docs/program/CYCLE11_${doc}.md`,
    ...(i === 0
      ? [
          'server/field-lab/crew-transaction.ts',
          'tests/helpers/cycle11-crew-worker.ts',
        ]
      : []),
    ...(i === 3
      ? [
          'server/consent-lab/atomic-boundary.ts',
          'tests/helpers/cycle11-consent-worker.ts',
        ]
      : []),
  ];
}
export function readCycle11File(path) {
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
/** Preserve the original C11 hash; admit only the fixed reviewed Advanced
 * successor through exact current source/companion checks. No runtime authority. */
export function validateCycle11PublishedSource(
  file,
  bytes,
  read = readCycle11File,
) {
  const error = () => {
    throw Error(`Reviewed Cycle11 source changed: ${file.path}`);
  };
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const advanced = file.path === 'src/lib/workflows/sync-admission-review.ts';
  if (!/^[a-f0-9]{64}$/.test(file.sha256)) error();
  if (
    advanced &&
    file.sha256 !==
      '274b74bd7da08e1e0bc2ccfc3f759f4ed0cdc0a3122ebd5302fb94b18be0b067'
  )
    error();
  if (hash(bytes) === file.sha256) return;
  if (advanced) {
    try {
      const original = cycle25SourcePorts.git(
        '6108876998b891108964a4a9a7a58bef6e0b31ef',
        file.path,
      );
      if (hash(original) !== file.sha256) error();
      const result = admitCycle33Forward(file.path, bytes, original, { read });
      if (
        result.source_commit !== '2bd1060982bc4a7d7b1c30b0329888b419ade027' ||
        result.module !== 'sync-proposal-privacy' ||
        result.authority !== 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE'
      )
        error();
      return;
    } catch {
      /* Keep the original failure boundary for any unknown edit. */
    }
  }
  error();
}
export function validateCycle11Manifest(manifest, read = readCycle11File) {
  if (
    manifest.schema !== 'propel-cycle11-delivery-v1' ||
    manifest.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    manifest.parent_commit !== 'b6ac4fc28c5a50d2029db4a5a69d345af0e3f35b' ||
    manifest.coordination_branch !== 'codex/program-cycle-eleven' ||
    manifest.packages.length !== 6
  )
    throw Error('Exact six-package Cycle11 contract required');
  if (
    manifest.shared_brief.sha256 !==
      '78b9aeeebe91dbeaed2a11f0240dbfb88771241e52cc2137bfbfb8bcca0663f1' ||
    manifest.shared_brief.path !==
      'docs/program/CYCLE11_IMPLEMENTATION_BRIEF.md' ||
    createHash('sha256')
      .update(read(manifest.shared_brief.path))
      .digest('hex') !== manifest.shared_brief.sha256
  )
    throw Error('Exact Main-owned common brief formatting required');
  const paths = new Set(
    [6, 7, 8, 9, 10].flatMap((c) =>
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
        throw Error('Overlapping or out-of-scope Cycle11 source');
      validateCycle11PublishedSource(file, Buffer.from(read(file.path)), read);
      remaining.delete(file.path);
      paths.add(file.path);
    }
    if (remaining.size) throw Error('Missing exact source evidence');
  };
  const prs = new Set();
  manifest.packages.forEach((p, i) => {
    const [module, component, doc] = cycle11Packages[i];
    if (
      p.module !== module ||
      p.component !== component ||
      p.doc !== `CYCLE11_${doc}` ||
      p.parent_commit !== manifest.parent_commit ||
      !/^codex\/cycle11-/.test(p.branch) ||
      !/^\/root\//.test(p.owner) ||
      !Number.isSafeInteger(p.draft_pr) ||
      p.draft_pr < 74 ||
      prs.has(p.draft_pr) ||
      !/^[a-f0-9]{40}$/.test(p.head_commit) ||
      !Number.isSafeInteger(p.focused_new_tests) ||
      p.focused_new_tests < 1
    )
      throw Error('Exact disjoint author identity required');
    prs.add(p.draft_pr);
    verify(p.owned_files, cycle11OwnedPaths(i));
  });
  if (!/^[a-f0-9]{40}$/.test(manifest.independent_review_commit))
    throw Error('Exact independent review identity required');
  verify(manifest.independent_files, [
    'tests/cycle11-integration.test.ts',
    'docs/program/CYCLE11_INTEGRATION_REVIEW.md',
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
    JSON.parse(readCycle11File('docs/program/CYCLE10_DELIVERY_INDEX.json')),
  );
  validateCycle11Manifest(
    JSON.parse(readCycle11File('docs/program/CYCLE11_DELIVERY_INDEX.json')),
  );
  console.log(
    'Cycle11: 6 exact drafts / 34 disjoint author files and two independent files PASS. All retained protected/148 C6-C10 author bytes remain exact. Local evidence only.',
  );
}
