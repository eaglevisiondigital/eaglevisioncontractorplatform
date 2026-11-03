export const cycle19Packages: readonly (readonly [string, string])[];
export function validateCycle19Manifest(
  manifest: unknown,
  read?: (path: string) => Uint8Array | string,
): Readonly<{
  packages: 5;
  author_files: 25;
  independent_files: 0 | 2;
  independent_status: 'PENDING' | 'CLEAR_LOCAL_SYNTHETIC_ONLY';
  retained_author_files: 398;
}>;
