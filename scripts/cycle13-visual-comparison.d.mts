export interface VisualScreenshot {
  id: string;
  pair: string;
  side: 'reference' | 'current';
  surface: 'customer-portal' | 'contractor-back-office' | 'operating-center';
  brand: 'straight-edge' | 'cunningham' | 'roofing-example';
  viewport: 'desktop' | 'tablet' | 'mobile';
  path: string;
  sha256: string;
  caption: string;
  sourceCommit?: string | null;
}
export interface VisualComparisonManifest {
  schema: 'propel-cycle13-visual-comparison-v1';
  sourceCommit: string | null;
  sourceState?: 'COMMITTED' | 'WORKING_TREE_UNCOMMITTED';
  screenshots: VisualScreenshot[];
  title?: string;
}
export const visualComparisonLimits: Readonly<{
  screenshots: 144;
  bytesPerImage: number;
  totalImageBytes: number;
  outputPath: 'artifacts/cycle13/visual-comparison.html';
}>;
export function sha256VisualBytes(bytes: Uint8Array): string;
export function readVisualInventory(root?: string): unknown;
export function validateVisualInventory(
  root: string,
  inventory: unknown,
): Readonly<{ locks: 5; bindings: 13; approvalRecords: 3 }>;
export function generateVisualComparison(options: {
  root?: string;
  manifest: unknown;
  outputPath?: string;
}): Readonly<{
  html: string;
  screenshots: number;
  completePairs: number;
  imageBytes: number;
  missingCoverage: readonly {
    surface: VisualScreenshot['surface'];
    brand: VisualScreenshot['brand'];
    viewport: VisualScreenshot['viewport'];
    paired: boolean;
  }[];
  approvalGranted: false;
  release: 'NOT_READY_NOT_AUTHORIZED';
}>;
