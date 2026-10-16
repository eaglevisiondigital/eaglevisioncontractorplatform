import type { QuarantineJob } from './pipeline';
import { MAX_SOURCE_BYTES } from './pipeline';
import type { ProcessingLease } from './worker';
import { sha256, uuid } from '../providers/safety';

export interface WorkloadIdentity {
  issuer: string;
  audience: string;
  subject: string;
  organizationId: string;
  sourceId: string;
  expiresAt: number;
  issuedAt: number;
}
export interface WorkerSecurity {
  // Cryptographic OIDC/SPIFFE verifier: signature, pinned issuer/JWKS, audience,
  // short TTL and revocation. Never just decode a bearer JWT.
  authenticate(credential: string): Promise<WorkloadIdentity>;
  checkpoint(
    job: Readonly<QuarantineJob>,
    lease: Readonly<ProcessingLease>,
  ): Promise<void>;
  releaseEvidence(
    job: Readonly<QuarantineJob>,
    lease: Readonly<ProcessingLease>,
  ): Promise<{
    sha256: string;
    clean: boolean;
    fullValidation: boolean;
    checkedAt: number;
  }>;
  assertRuntime(): Promise<void>;
}
export interface PrivateWorkerObjects {
  readQuarantine(job: Readonly<QuarantineJob>): Promise<Uint8Array>;
  // Isolated stage, create-only and versioned by attempt; never a staff-visible object.
  stage(
    job: Readonly<QuarantineJob>,
    attemptDigest: string,
    bytes: Uint8Array,
  ): Promise<{ sha256: string }>;
}
export class IsolatedDocumentService {
  private readonly policy: Readonly<{
    issuer: string;
    audience: string;
    subject: string;
    organizationId: string;
  }>;
  constructor(
    policy: {
      issuer: string;
      audience: string;
      subject: string;
      organizationId: string;
    },
    private readonly security: WorkerSecurity,
    private readonly objects: PrivateWorkerObjects,
  ) {
    this.policy = Object.freeze({ ...policy });
    if (
      !uuid.test(policy.organizationId) ||
      !policy.issuer ||
      !policy.audience ||
      !policy.subject
    )
      throw new Error('Approved workload policy required');
  }
  private async authorize(
    credential: string,
    input: QuarantineJob,
    leaseInput: ProcessingLease,
  ) {
    const job = Object.freeze({ ...input }),
      lease = Object.freeze({
        ...leaseInput,
        job: Object.freeze({ ...leaseInput.job }),
      }),
      p = this.policy;
    const identity = await this.security.authenticate(credential);
    if (
      identity.issuer !== p.issuer ||
      identity.audience !== p.audience ||
      identity.subject !== p.subject ||
      identity.organizationId !== p.organizationId ||
      job.organizationId !== p.organizationId ||
      identity.sourceId !== job.sourceId ||
      !uuid.test(job.sourceId) ||
      job.objectKey !== `${p.organizationId}/${job.sourceId}` ||
      !Number.isInteger(job.size) ||
      job.size < 8 ||
      job.size > MAX_SOURCE_BYTES ||
      !Number.isFinite(identity.issuedAt) ||
      !Number.isFinite(identity.expiresAt) ||
      identity.issuedAt > Date.now() + 1000 ||
      identity.issuedAt < Date.now() - 300000 ||
      identity.expiresAt <= Date.now() ||
      identity.expiresAt > identity.issuedAt + 300000 ||
      lease.expiresAt <= Date.now() ||
      !Number.isFinite(lease.expiresAt) ||
      JSON.stringify(job) !== JSON.stringify(lease.job)
    )
      throw new Error('Document workload denied');
    await this.security.assertRuntime();
    await this.security.checkpoint(job, lease);
    return { job, lease };
  }
  async read(credential: string, job: QuarantineJob, lease: ProcessingLease) {
    const b = await this.authorize(credential, job, lease);
    const bytes = Uint8Array.from(await this.objects.readQuarantine(b.job));
    if (bytes.length !== b.job.size || sha256(bytes) !== b.job.sha256)
      throw new Error('Quarantine integrity failure');
    await this.security.checkpoint(b.job, b.lease);
    return bytes;
  }
  async stage(
    credential: string,
    job: QuarantineJob,
    lease: ProcessingLease,
    input: Uint8Array,
  ) {
    const bytes = Uint8Array.from(input),
      b = await this.authorize(credential, job, lease);
    if (bytes.length !== b.job.size || sha256(bytes) !== b.job.sha256)
      throw new Error('Stage integrity failure');
    const proof = await this.security.releaseEvidence(b.job, b.lease);
    if (
      proof.sha256 !== b.job.sha256 ||
      proof.clean !== true ||
      proof.fullValidation !== true ||
      !Number.isFinite(proof.checkedAt) ||
      proof.checkedAt > Date.now() + 1000 ||
      proof.checkedAt < Date.now() - 900000
    )
      throw new Error('Current scanner/full validation required');
    await this.security.checkpoint(b.job, b.lease);
    const receipt = await this.objects.stage(
      b.job,
      sha256(b.lease.token),
      bytes,
    );
    if (receipt.sha256 !== b.job.sha256)
      throw new Error('Stage acknowledgment mismatch');
    await this.security.checkpoint(b.job, b.lease);
    return { sha256: receipt.sha256, objectKey: b.job.objectKey };
  }
}
export interface OrphanCandidate {
  organizationId: string;
  sourceId: string;
  objectVersion: string;
  createdAt: number;
  kind: 'staged-clean';
}
export interface OrphanCatalog {
  // Must lock authoritative source + object-version record and recheck committed,
  // current lease, reference and legal-hold status in same critical section.
  withDeletableStage(
    candidate: Readonly<OrphanCandidate>,
    operation: () => Promise<void>,
  ): Promise<'deleted' | 'retained'>;
}
export async function cleanupOrphan(
  candidate: OrphanCandidate,
  catalog: OrphanCatalog,
  objects: { deleteExactVersion(c: Readonly<OrphanCandidate>): Promise<void> },
  now = Date.now(),
) {
  const c = Object.freeze({ ...candidate });
  if (
    c.kind !== 'staged-clean' ||
    ![c.organizationId, c.sourceId].every((v) => uuid.test(v)) ||
    !c.objectVersion ||
    c.objectVersion.length > 200 ||
    !Number.isFinite(c.createdAt) ||
    !Number.isFinite(now) ||
    c.createdAt > now - 86400000
  )
    throw new Error('Orphan retention gate');
  return catalog.withDeletableStage(c, () => objects.deleteExactVersion(c));
}
// Enforcement belongs to the approved container/runtime, not a JS promise timeout.
export const REQUIRED_WORKER_LIMITS = Object.freeze({
  network: 'allowlisted-gateways-only',
  uid: 65532,
  readOnlyRoot: true,
  capabilities: 'drop-all',
  noNewPrivileges: true,
  memoryMiB: 512,
  cpu: 1,
  pids: 64,
  tmpfsMiB: 32,
  wallSeconds: 60,
  maxParallelJobs: 1,
  maxAttempts: 3,
  maxInputBytes: MAX_SOURCE_BYTES,
});
