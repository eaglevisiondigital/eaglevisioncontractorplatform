import { type Locator } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { captureVisualSourceCommit } from './cycle14-browser-helpers';
import type { OwnerVisualScreenshot } from '../../scripts/cycle14-visual-review.mjs';
export async function visualCapture(
  region: Locator,
  scope: OwnerVisualScreenshot['scope'],
  side: OwnerVisualScreenshot['side'],
  brand: string,
  viewport: OwnerVisualScreenshot['viewport'],
) {
  const id = `${scope}-${side}-${viewport}-${brand}`,
    path = `artifacts/cycle14/${id}.png`;
  await region.screenshot({ path });
  const record: OwnerVisualScreenshot = {
    scope,
    side,
    brand: brand as OwnerVisualScreenshot['brand'],
    viewport,
    path,
    sha256: createHash('sha256')
      .update(await readFile(path))
      .digest('hex'),
    sourceCommit: captureVisualSourceCommit(),
    caption:
      side === 'reference'
        ? 'Retained Cycle13 component rendered in the current local build. NOT an owner-approved original; synthetic states may differ.'
        : 'Current Cycle14 local continuity state. Owner visual approval PENDING; no operational authority.',
  };
  await writeFile(
    `artifacts/cycle14/visual-${id}.json`,
    JSON.stringify(record, null, 2) + '\n',
  );
}
