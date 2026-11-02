export const cycle10Packages: readonly (readonly string[])[];
export function readCycle10File(path: string): Buffer;
export function validateCycle10Manifest(
  manifest: unknown,
  read?: (path: string) => Buffer,
): { packages: number; author_files: number; independent_files: number };
