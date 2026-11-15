type Row = { path: string; mode: string; oid: string };
export function validateIdentity(
  data: unknown,
  base: Row[],
  sql: Record<string, Buffer>,
): { current: Row[]; authored: Row[] };
export function qualify(root?: string): Promise<{
  classification: string;
  actualSqlAuthor: string;
  actualSqlParent: string;
  guardPreparedBase: string;
  guardAuthor: null;
  guardAuthorParent: null;
  laterCompositionParent: null;
  operationalReady: false;
  installationAuthorized: false;
  compositionAuthorized: false;
}>;
export function materialize(root?: string): Promise<{
  directory: string;
  classification: string;
  actualSqlAuthor: string;
  guardPreparedBase: string;
  guardAuthor: null;
  laterCompositionParent: null;
  operationalReady: false;
  installationAuthorized: false;
  compositionAuthorized: false;
}>;
