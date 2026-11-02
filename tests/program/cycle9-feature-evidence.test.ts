import { expect, it } from 'vitest';
import { sourceOwner } from '../../scripts/feature-evidence.mjs';

// Keep forward ownership assertions out of the retained Cycle8 result contract.
for (const [path, owner] of [
  ['src/lib/workflows/operating-center-runtime.ts', 'A1'],
  ['src/components/workflows/OperatingSelection.tsx', 'A2'],
  ['src/lib/workflows/portfolio-finance.ts', 'A4'],
  ['src/lib/workflows/operating-addons.ts', 'A7'],
])
  it(`Cycle9 ownership precedence: ${path}`, () => {
    expect(sourceOwner(path)).toBe(owner);
  });
