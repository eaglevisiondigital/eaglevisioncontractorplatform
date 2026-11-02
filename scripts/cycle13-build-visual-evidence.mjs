import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateVisualComparison } from './cycle13-visual-comparison.mjs';
export function bindCapturedVisualSource(records) {
  if (!Array.isArray(records) || !records.length)
    throw Error('Actual captured source records required');
  const identities = new Set();
  for (const record of records) {
    if (!record || typeof record !== 'object')
      throw Error('Captured source record required');
    const field = Object.getOwnPropertyDescriptor(record, 'sourceCommit');
    if (field && !Object.hasOwn(field, 'value'))
      throw Error('Captured source data required');
    const value = field?.value ?? null;
    if (
      value !== null &&
      (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value))
    )
      throw Error('Exact captured commit or UNKNOWN required');
    identities.add(value);
  }
  if (identities.size !== 1)
    throw Error('Mixed captured checkout identities forbidden');
  const sourceCommit = [...identities][0];
  return {
    sourceCommit,
    sourceState:
      sourceCommit === null ? 'WORKING_TREE_UNCOMMITTED' : 'COMMITTED',
  };
}
function main() {
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
  const manifest = {
    schema: 'propel-cycle13-visual-comparison-v1',
    ...bindCapturedVisualSource(screenshots),
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
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main();
