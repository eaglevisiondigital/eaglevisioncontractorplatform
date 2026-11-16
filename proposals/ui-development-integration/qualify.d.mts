export type UIFile = { mode: string; data: Buffer };
export function qualifyUIDevelopmentIntegration(
  root: string,
  hook?: (phase: 'after-capture' | 'after-compose') => unknown,
): Promise<{
  beforeTree: string;
  afterTree: string;
  changedPaths: number;
  afterFixture: Map<string, UIFile>;
  check(): void;
}>;
export function verifyUIDevelopmentAfterimage(
  root: string,
  hook?: () => unknown,
): Promise<{ tree: string; files: number }>;
