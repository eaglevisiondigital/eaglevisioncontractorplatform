export interface SourceQualification {
  classification: 'QUALIFIED_SOURCE_ONLY_OPERATIONAL_HELD';
  author: string;
  parent: string;
  phase: 'original' | 'proposed';
  files: number;
  sourceTree: string;
  guardPatchSHA256: string;
  canonicalFHGChanged: false;
  installationAuthorized: false;
  operationalReady: false;
  fixture: Record<string, { mode: string; bytes: Buffer }>;
  proposedGuard: Buffer;
}
export function qualifyOperatingAdmission(
  root: string,
  phase?: 'original' | 'proposed',
  boundary?: (stage: 'after-capture' | 'before-return') => void | Promise<void>,
): Promise<SourceQualification>;
