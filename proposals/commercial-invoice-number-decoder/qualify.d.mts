import { lstatSync, readFileSync } from 'node:fs';
export function captureNumberDecoder(
  root: string,
  ports?: { read?: typeof readFileSync; stat?: typeof lstatSync },
): Readonly<{
  classification: 'UNAPPLIED_NUMBER_DECODER_ONLY';
  parent: string;
  parentEntries: 2455;
  target: string;
  source: string;
  customerSource: string;
  customerPatch: string;
  customerParent: string;
  patch: string;
  patchSha256: string;
  sourceAuthor: null;
  connectionAdmission: 'HELD';
  installationAuthorized: false;
  operationalReady: false;
  material: Readonly<{
    originalCustomer: string;
    bootstrapSql: string;
    draftSql: string;
    issuanceSql: string;
    namespaceSql: string;
    yearSql: string;
    connectionGuard: string;
    originalPresenter: string;
    connectionSources: readonly Readonly<{ path: string; source: string }>[];
    migrations: readonly Readonly<{ path: string; sql: string }>[];
  }>;
}>;
