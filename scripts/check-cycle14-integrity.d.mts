export const cycle14Packages: readonly (readonly [string, string])[];
export function validateCycle14Manifest(
  manifest: unknown,
  read?: (path: string) => Uint8Array | string,
): Readonly<{
  packages: 6;
  author_files: 30;
  independent_files: 2;
  retained_author_files: 253;
}>;
