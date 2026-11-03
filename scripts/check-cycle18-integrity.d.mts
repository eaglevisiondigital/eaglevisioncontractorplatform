export const cycle18Packages: readonly (readonly [string, string])[];
export function validateCycle18Manifest(
  manifest: unknown,
  read?: (path: string) => Uint8Array | string,
): Readonly<{
  packages: 5;
  author_files: 25;
  independent_files: 2;
  retained_author_files: 373;
}>;
