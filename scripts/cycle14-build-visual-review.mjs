import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import {
  createOwnerVisualReview,
  visualReviewPath,
  writeOwnerVisualOutput,
} from './cycle14-visual-review.mjs';
const dir = 'artifacts/cycle14';
for (const part of ['artifacts', dir])
  if (lstatSync(part).isSymbolicLink())
    throw Error('Private/symlink output forbidden');
const names = readdirSync(dir)
  .filter((n) =>
    /^visual-(operating-panels|advanced-panels)-(reference|current)-(desktop|tablet|mobile)-(straight-edge|cunningham|roofing-example)\.json$/.test(
      n,
    ),
  )
  .sort();
const screenshots = names.map((name) => {
  const path = `${dir}/${name}`;
  if (lstatSync(path).isSymbolicLink())
    throw Error('Screenshot record links forbidden');
  const item = JSON.parse(readFileSync(path, 'utf8'));
  if (
    name !==
    `visual-${item.scope}-${item.side}-${item.viewport}-${item.brand}.json`
  )
    throw Error('Exact capture record context required');
  return item;
});
const manifest = { schema: 'propel-cycle14-owner-visual-v1', screenshots };
const result = createOwnerVisualReview({ manifest });
if (result.screenshots !== 36 || result.completePairs !== 18)
  throw Error('All actual two-scope/three-brand/three-viewport pairs required');
writeOwnerVisualOutput(
  process.cwd(),
  `${dir}/visual-manifest.json`,
  JSON.stringify(manifest, null, 2) + '\n',
);
writeOwnerVisualOutput(process.cwd(), visualReviewPath, result.html);
console.log(
  JSON.stringify({ ...result, html: undefined, output: visualReviewPath }),
);
