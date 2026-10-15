import {
  processQuarantined,
  type QuarantineJob,
  type QuarantineStore,
  type ApprovedScanner,
  type ContentValidator,
  type ExtractionProvider,
} from './pipeline';

export interface ProcessingLease {
  job: QuarantineJob;
  token: string; // Opaque fencing token; never log or expose to staff.
  attempt: number;
  expiresAt: number;
}
// Not a persistence implementation. All CAS + authorization checks must be atomic in
// the trusted control service, including org/module/member/source/batch state checks.
export interface DurableProcessingStore {
  claim(): Promise<ProcessingLease | null>;
  checkpoint(lease: ProcessingLease): Promise<void>;
  scopedStore(lease: ProcessingLease): QuarantineStore;
  complete(lease: ProcessingLease): Promise<void>;
  retryOrReject(
    lease: ProcessingLease,
    disposition: { retryAt: number | null; code: 'processing_failed' },
  ): Promise<void>;
}
export async function runWorkerOnce(deps: {
  queue: DurableProcessingStore;
  scanner: ApprovedScanner;
  validator: ContentValidator;
  extractor: ExtractionProvider;
  now?: () => number;
}): Promise<'idle' | 'completed' | 'failed'> {
  const now = deps.now ?? Date.now;
  const lease = await deps.queue.claim();
  if (!lease) return 'idle';
  // Recheck after every external call; a stale/expired/revoked worker cannot publish.
  async function checkpoint() {
    if (
      !lease!.token ||
      !Number.isInteger(lease!.attempt) ||
      lease!.attempt < 1 ||
      lease!.attempt > 3 ||
      !Number.isFinite(lease!.expiresAt) ||
      lease!.expiresAt <= now()
    )
      throw new Error('Invalid or expired lease');
    await deps.queue.checkpoint(lease!);
  }
  try {
    await checkpoint();
    const store = deps.queue.scopedStore(lease);
    const fenced: QuarantineStore = {
      async readQuarantined(job) {
        await checkpoint();
        return store.readQuarantined(job);
      },
      async releaseValidated(job, evidence) {
        await checkpoint();
        await store.releaseValidated(job, evidence);
      },
      async saveExtraction(job, extraction, provider) {
        await checkpoint();
        await store.saveExtraction(job, extraction, provider);
      },
      // This must also CAS by token. A failure cannot overwrite another worker's success.
      async fail(job, code) {
        await checkpoint();
        await store.fail(job, code);
      },
    };
    await processQuarantined(lease.job, { ...deps, store: fenced });
    await checkpoint();
    await deps.queue.complete(lease);
    return 'completed';
  } catch {
    // Token-checked queue operation must be a no-op for stale/revoked leases.
    await deps.queue.retryOrReject(lease, {
      retryAt:
        lease.attempt >= 3 ? null : now() + 30000 * 2 ** (lease.attempt - 1),
      code: 'processing_failed',
    });
    return 'failed';
  }
}
