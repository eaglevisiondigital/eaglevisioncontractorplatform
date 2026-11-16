import type { PathLike, Stats } from 'node:fs';
export function qualifyNativeQuoteFixture(options?: {
  read?: (path: PathLike) => Buffer;
  stat?: (path: PathLike) => Stats;
}): Readonly<{
  classification: string;
  base: string;
  patchSHA256: string;
  projection: readonly Readonly<{
    path: string;
    content: string;
    sha256: string;
  }>[];
  sourceAuthorApproval: false;
  operationalReady: false;
}>;
