export function capture(root?: string): {
  root: string;
  m: Record<string, unknown>;
  base: { path: string; mode: string; oid: string }[];
  files: Record<string, Buffer>;
  imported: Record<string, Buffer>;
  classification: string;
  operationalReady: false;
};
export function materialize(
  root?: string,
  frame?: 'proposed' | 'original',
): { directory: string; classification: string; operationalReady: false };
