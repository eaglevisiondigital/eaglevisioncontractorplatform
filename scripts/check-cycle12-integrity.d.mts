export const cycle12Packages: readonly (readonly string[])[];
export function readCycle12File(path: string): Buffer;
export function validateCycle12Manifest(
  manifest: unknown,
  read?: (path: string) => Buffer,
): { packages: number; author_files: number; independent_files: number };

export function cycle12OwnedPaths(index: number): string[];
