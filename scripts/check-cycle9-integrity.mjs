import { admitServicePrivacyTest } from './service-privacy-source-admission.mjs';
import './check-cycle8-integrity.mjs';
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// Verify the new companion before executing its captured bytes.
const signatureHelperUrl = new URL(
  './operating-source-signature-admission.mjs',
  import.meta.url,
);
if (
  !lstatSync(signatureHelperUrl).isFile() ||
  lstatSync(signatureHelperUrl).isSymbolicLink()
)
  throw Error('Reviewed operating-signature helper required');
const signatureHelperBytes = readFileSync(signatureHelperUrl);
if (
  createHash('sha256').update(signatureHelperBytes).digest('hex') !==
  '38fd3d784b10dd634f6b03a5995a4ce4392eb2924865349d1414328701113978'
)
  throw Error('Reviewed operating-signature helper required');
const { admitOperatingSignatureSource } = await import(
  'data:text/javascript;base64,' + signatureHelperBytes.toString('base64')
);

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
      throw Error('Source symlinks forbidden');
  }
  if (!lstatSync(current).isFile()) throw Error('Regular source required');
  return readFileSync(current);
};
const manifest = JSON.parse(read('docs/program/CYCLE9_DELIVERY_INDEX.json'));
if (
  manifest.schema !== 'propel-cycle9-delivery-v1' ||
  manifest.release !== 'NOT_READY_NOT_AUTHORIZED' ||
  manifest.baseline_commit !== 'fe813ed261ad56fffb91ca15ac2aa41a92a8847e' ||
  manifest.parent_commit !== 'c3bbfebd8467263f851d7b27ab68eb20c5db4df7' ||
  manifest.coordination_parent_commit !==
    '7d5a3a797fc0552369c29d1d3ba8db0d2bdcf765' ||
  manifest.packages.length !== 7
)
  throw Error('Exact seven-package Cycle9 contract required');
const paths = new Set(
  [6, 7, 8].flatMap((cycle) =>
    JSON.parse(
      read(`docs/program/CYCLE${cycle}_DELIVERY_INDEX.json`),
    ).packages.flatMap((p) => p.owned_files.map((f) => f.path)),
  ),
);
const expected = [
  [
    'portfolio-scheduling',
    'PortfolioScheduling',
    'CYCLE9_PORTFOLIO_SCHEDULING',
    57,
  ],
  [
    'operating-selection',
    'OperatingSelection',
    'CYCLE9_OPERATING_SELECTION',
    58,
  ],
  ['portfolio-finance', 'PortfolioFinance', 'CYCLE9_PORTFOLIO_FINANCE', 60],
  ['portfolio-service', 'PortfolioService', 'CYCLE9_PORTFOLIO_SERVICE', 61],
  [
    'portfolio-maintenance',
    'PortfolioMaintenance',
    'CYCLE9_PORTFOLIO_MAINTENANCE',
    62,
  ],
  ['business-briefing', 'BusinessBriefing', 'CYCLE9_BUSINESS_BRIEFING', 63],
  ['operating-addons', 'OperatingAddons', 'CYCLE9_OPERATING_ADDONS', 64],
];
function verify(files, expectedPaths) {
  const remaining = new Set(expectedPaths);
  if (files.length !== remaining.size)
    throw Error('Exact finite source scope required');
  for (const file of files) {
    if (!remaining.has(file.path) || paths.has(file.path))
      throw Error('Overlapping/out-of-scope Cycle9 source');
    const current = read(file.path);
    if (
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      (createHash('sha256').update(current).digest('hex') !== file.sha256 &&
        !admitServicePrivacyTest(file.path, current, file.sha256) &&
        !admitOperatingSignatureSource(file.path, current, file.sha256))
    )
      throw Error(`Reviewed Cycle9 source changed: ${file.path}`);
    paths.add(file.path);
    remaining.delete(file.path);
  }
  if (remaining.size) throw Error('Missing exact source evidence');
}
for (const [i, pkg] of manifest.packages.entries()) {
  const [module, component, doc, pr] = expected[i];
  if (
    pkg.module !== module ||
    pkg.component !== component ||
    pkg.doc !== doc ||
    pkg.draft_pr !== pr ||
    pkg.parent_commit !== manifest.parent_commit ||
    !/^codex\/cycle9-/.test(pkg.branch) ||
    !/^[a-f0-9]{40}$/.test(pkg.head_commit)
  )
    throw Error('Exact author identity required');
  verify(pkg.owned_files, [
    `src/lib/workflows/${module}.ts`,
    `src/components/workflows/${component}.tsx`,
    `src/components/workflows/${module}.css`,
    `tests/cycle9-${module}.test.ts`,
    `docs/program/${doc}.md`,
  ]);
}
if (
  manifest.foundation.draft_pr !== 59 ||
  manifest.foundation.head_commit !==
    '7d5a3a797fc0552369c29d1d3ba8db0d2bdcf765' ||
  manifest.independent_review_commit !==
    '0825e3c00379a59bea79453a1825a64679cb3847'
)
  throw Error('Reviewed foundation/reviewer identity required');
verify(manifest.foundation.owned_files, [
  'src/lib/workflows/operating-center-runtime.ts',
  'tests/cycle9-operating-runtime.test.ts',
]);
verify(manifest.independent_files, [
  'tests/cycle9-integration.test.ts',
  'docs/program/CYCLE9_INTEGRATION_REVIEW.md',
]);
console.log(
  'Cycle9: 7 exact draft packages / 35 disjoint author files, two foundation and two independent files PASS. Local evidence only; no release or execution authority.',
);
