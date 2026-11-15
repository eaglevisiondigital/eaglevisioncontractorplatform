export function capture(root?: string): {
  root: string;
  manifest: Record<string, unknown>;
  base: { path: string; mode: string; oid: string }[];
  bodies: Buffer[];
  files: Record<string, Buffer>;
  sql: Record<string, Buffer>;
  classification: string;
  operationalReady: false;
};
export function materialize(root?: string): {
  directory: string;
  classification: string;
  operationalReady: false;
};
