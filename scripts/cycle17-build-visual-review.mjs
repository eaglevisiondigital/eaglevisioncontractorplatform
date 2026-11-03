import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  createCycle17VisualReview,
  readCycle17Png,
  writeCycle17VisualOutput,
} from './cycle17-visual-review.mjs';
const screenshots = [];
for (const scope of ['operating-panels', 'advanced-panels'])
  for (const brand of ['straight-edge', 'cunningham', 'roofing-example'])
    for (const viewport of ['desktop', 'tablet', 'mobile'])
      for (const side of ['reference', 'current']) {
        const path = `artifacts/cycle17/${side}-${scope}-${viewport}-${brand}.png`;
        const metaPath = path.replace(/\.png$/, '.json');
        if (lstatSync(metaPath).isSymbolicLink())
          throw Error('Capture metadata links forbidden');
        const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
        if (
          meta.schema !== 'propel-cycle17-capture-v1' ||
          meta.brand !== brand ||
          meta.viewport !== viewport ||
          meta.approval !== 'PENDING' ||
          meta.release !== 'NOT_READY_NOT_AUTHORIZED' ||
          !/^([a-f0-9]{40})$/.test(meta.source)
        )
          throw Error('Exact clean-source capture metadata required');
        const bytes = readCycle17Png(process.cwd(), path);
        screenshots.push({
          scope,
          side,
          brand,
          viewport,
          path,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          width: bytes.readUInt32BE(16),
          height: bytes.readUInt32BE(20),
          source: meta.source,
          approval: 'PENDING',
        });
      }
const manifest = {
  schema: 'propel-cycle17-owner-visual-v1',
  visual_approval: 'PENDING',
  screenshots,
};
const result = createCycle17VisualReview(manifest, (p) =>
  readCycle17Png(process.cwd(), p),
);
writeCycle17VisualOutput(
  process.cwd(),
  'artifacts/cycle17/visual-manifest.json',
  JSON.stringify(manifest, null, 2) + '\n',
);
writeCycle17VisualOutput(
  process.cwd(),
  'artifacts/cycle17/owner-visual-review.html',
  result.html,
);
console.log(
  JSON.stringify({
    ...result,
    html: undefined,
    output: 'artifacts/cycle17/owner-visual-review.html',
  }),
);
