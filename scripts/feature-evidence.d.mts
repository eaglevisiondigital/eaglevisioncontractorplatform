export interface SourceReference {
  path: string;
  line: number;
  sha256: string;
}
export interface InventoryFile {
  path: string;
  owner: string;
  bytes: number;
  sha256: string;
}
export interface SourceInventory {
  roots: string[];
  rootFiles: string[];
  extensions: string[];
  fileCount: number;
  counts: Record<string, number>;
  files: InventoryFile[];
}
export const requiredFeatureIds: readonly string[];
export function validateDesignContract(
  root: string,
  contract: unknown,
): {
  lockedFiles: number;
  sourceBindings: number;
  runtimeAcceptance: 'NOT_INFERRED';
};
export function validateFeatureEvidence(
  root: string,
  manifest: unknown,
): {
  schema: string;
  sourceCommit: string;
  featureCount: number;
  execution: 'not_authorized';
  currentCi: string;
  features: {
    id: string;
    owner: string;
    local: string;
    hosted: string;
    release: 'not_authorized';
    sources: SourceReference[];
    tests: SourceReference[];
    records: SourceReference[];
  }[];
};
export function sourceOwner(path: string): string;
export function inventorySources(root: string): SourceInventory;
export function runFeatureEvidence(root: string, json?: boolean): string;
