import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { generateVisualComparison } from './cycle13-visual-comparison.mjs';
const screenshots = [];
for (const viewport of ['desktop', 'tablet', 'mobile'])
  for (const brand of ['straight-edge', 'cunningham', 'roofing-example']) {
    const entries = JSON.parse(
      readFileSync(
        `artifacts/cycle13/visual-entries-${viewport}-${brand}.json`,
        'utf8',
      ),
    );
    if (
      !Array.isArray(entries) ||
      entries.length !== 4 ||
      entries.some((e) => e.viewport !== viewport || e.brand !== brand)
    )
      throw Error('Exact actual four-surface screenshot evidence required');
    screenshots.push(...entries);
    const operating = JSON.parse(
      readFileSync(
        `artifacts/cycle13/operating-visual-${viewport}-${brand}.json`,
        'utf8',
      ),
    );
    if (
      operating.viewport !== viewport ||
      operating.brand !== brand ||
      operating.side !== 'current' ||
      operating.surface !== 'operating-center'
    )
      throw Error('Exact current Operating Center screenshot required');
    screenshots.push(operating);
  }
const head = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
if (!/^[a-f0-9]{40}$/.test(head))
  throw Error('Exact checkout identity unavailable');
const dirty =
  execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
    encoding: 'utf8',
  }).trim().length > 0;
const manifest = {
  schema: 'propel-cycle13-visual-comparison-v1',
  sourceCommit: dirty ? null : head,
  sourceState: dirty ? 'WORKING_TREE_UNCOMMITTED' : 'COMMITTED',
  screenshots,
};
const result = generateVisualComparison({
  root: process.cwd(),
  manifest,
  outputPath: 'artifacts/cycle13/visual-comparison.html',
});
writeFileSync(
  'artifacts/cycle13/visual-comparison-manifest.json',
  JSON.stringify(manifest, null, 2) + '\n',
);
writeFileSync(
  'artifacts/cycle13/visual-comparison-result.json',
  JSON.stringify({ ...result, html: undefined }, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    screenshots: result.screenshots,
    completePairs: result.completePairs,
    missingCoverage: result.missingCoverage,
    approvalGranted: result.approvalGranted,
    sourceState: manifest.sourceState,
  }),
);
