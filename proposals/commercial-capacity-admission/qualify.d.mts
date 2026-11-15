import { lstatSync, readFileSync } from 'node:fs';
export function qualifyCapacityAdmission(
  root: string,
  ports?: { read?: typeof readFileSync; stat?: typeof lstatSync },
): Readonly<{
  classification: 'UNAPPLIED_SOURCE_AUTHOR_ONLY';
  base: string;
  source: string;
  baseEntries: number;
  preservedEntries: number;
  additions: 2;
  patchSha256: string;
  installationAuthorized: false;
  launchPromotionAuthorized: false;
  financialExecutionAuthorized: false;
}>;
