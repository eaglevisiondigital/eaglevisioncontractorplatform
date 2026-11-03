export function readCycle17Png(root: string, path: string): Buffer;
export function createCycle17VisualReview(
  manifest: unknown,
  read: (path: string) => Buffer,
): Readonly<{
  html: string;
  screenshots: 36;
  completePairs: 18;
  approval: 'PENDING';
}>;
export function writeCycle17VisualOutput(
  root: string,
  path: string,
  contents: string,
): void;
