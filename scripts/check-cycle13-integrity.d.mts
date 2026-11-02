export const cycle13Packages: readonly (readonly string[])[];
export function readCycle13File(path: string): Buffer;
export function validateCycle13Manifest(
  manifest: unknown,
  read?: (path: string) => Buffer,
): { packages: number; author_files: number; independent_files: number };

export function cycle13OwnedPaths(index: number): string[];
