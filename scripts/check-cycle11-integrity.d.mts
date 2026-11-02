export const cycle11Packages: readonly (readonly string[])[];
export function readCycle11File(path: string): Buffer;
export function validateCycle11Manifest(
  manifest: unknown,
  read?: (path: string) => Buffer,
): { packages: number; author_files: number; independent_files: number };

export function cycle11OwnedPaths(index: number): string[];
