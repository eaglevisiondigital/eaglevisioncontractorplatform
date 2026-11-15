import { lstatSync, readFileSync } from 'node:fs';
export function qualifyCapacityComposition(
  root: string,
  ports?: { read?: typeof readFileSync; stat?: typeof lstatSync },
): Readonly<{
  classification: 'UNAPPLIED_THREE_ADDITION_LAUNCH_COMPOSITION';
  base: string;
  sourceAuthor: string;
  baseEntries: 2438;
  sourceAuthorEntries: 2440;
  proposedEntries: 2441;
  additions: 3;
  patchSha256: string;
  installationAuthorized: false;
  launchPromotionAuthorized: false;
  financialExecutionAuthorized: false;
  material: Readonly<{
    installationAuthorized: false;
    financialExecutionAuthorized: false;
    bootstrapSql: string;
    draftSql: string;
    issuanceSql: string;
    capacitySql: string;
    migrations: readonly Readonly<{ path: string; sql: string }>[];
  }>;
}>;
