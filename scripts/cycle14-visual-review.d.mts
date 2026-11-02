export interface OwnerVisualScreenshot {
  scope: 'operating-panels' | 'advanced-panels';
  brand: 'straight-edge' | 'cunningham' | 'roofing-example';
  viewport: 'desktop' | 'tablet' | 'mobile';
  side: 'reference' | 'current';
  path: string;
  sha256: string;
  sourceCommit: string | null;
  caption: string;
}
export const visualReviewPath: 'artifacts/cycle14/owner-visual-review.html';
export function writeOwnerVisualOutput(
  root: string,
  path: string,
  contents: string,
): void;
export function readReviewImage(root: string, path: string): Buffer;
export function createOwnerVisualReview(options: {
  root?: string;
  manifest: unknown;
  read?: (root: string, path: string) => Buffer;
}): Readonly<{
  html: string;
  screenshots: number;
  completePairs: number;
  missingPairs: number;
  approvalGranted: false;
  release: 'NOT_READY_NOT_AUTHORIZED';
}>;
