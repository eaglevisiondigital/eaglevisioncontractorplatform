import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../src/lib/database.types';
import { validateExtraction } from '../../src/domain/materials/import';
import type { DurableProcessingStore, ProcessingLease } from './worker';
import type { QuarantineJob, QuarantineStore } from './pipeline';
// The resource-isolated worker's object gateway must independently authenticate the
// workload and check this lease/current grants. No staff/browser upload policy is added.
export interface WorkerObjects {
  readQuarantined(
    job: QuarantineJob,
    lease: ProcessingLease,
  ): Promise<Uint8Array>;
  putPrivateClean(
    job: QuarantineJob,
    lease: ProcessingLease,
    bytes: Uint8Array,
  ): Promise<{ sha256: string }>;
}
export class SupabaseProcessingStore implements DurableProcessingStore {
  private bytes = new Map<string, Uint8Array>();
  constructor(
    private client: SupabaseClient<Database>,
    private organizationId: string,
    private objects: WorkerObjects,
    private validatorVersion: string,
  ) {
    if (!validatorVersion)
      throw new Error('Approved validator version required');
  }
  private async call(
    operation: string,
    lease?: ProcessingLease,
    payload: Json = {},
  ) {
    if (
      lease?.job.organizationId &&
      lease.job.organizationId !== this.organizationId
    )
      throw new Error('Worker tenant mismatch');
    const r = await this.client.rpc('material_worker_control', {
      p_org: this.organizationId,
      p_operation: operation,
      p_source: lease?.job.sourceId ?? null,
      p_lease: lease?.token ?? null,
      p_payload: payload,
    });
    if (r.error)
      throw Object.assign(new Error('Worker control unavailable'), {
        code: r.error.code,
      });
    return r.data;
  }
  async claim(): Promise<ProcessingLease | null> {
    const value = await this.call('claim');
    if (value === null) return null;
    const lease = value as unknown as ProcessingLease;
    if (
      !lease?.job ||
      lease.job.organizationId !== this.organizationId ||
      !lease.token ||
      !Number.isFinite(lease.expiresAt)
    )
      throw new Error('Invalid worker lease');
    return lease;
  }
  async checkpoint(lease: ProcessingLease) {
    if ((await this.call('checkpoint', lease)) !== true)
      throw new Error('Worker checkpoint denied');
  }
  scopedStore(lease: ProcessingLease): QuarantineStore {
    const same = (job: QuarantineJob) => {
      if (JSON.stringify(job) !== JSON.stringify(lease.job))
        throw new Error('Source lease mismatch');
    };
    return {
      readQuarantined: async (job) => {
        same(job);
        await this.checkpoint(lease);
        const bytes = await this.objects.readQuarantined(job, lease);
        if (
          bytes.length !== job.size ||
          createHash('sha256').update(bytes).digest('hex') !== job.sha256
        )
          throw new Error('Object integrity failure');
        this.bytes.set(lease.token, bytes);
        return bytes;
      },
      releaseValidated: async (job, evidence) => {
        same(job);
        await this.call('release', lease, {
          scan: evidence as unknown as Json,
          validator: { id: this.validatorVersion, sha256: job.sha256 },
        });
        const bytes = this.bytes.get(lease.token);
        if (!bytes) throw new Error('Validated bytes unavailable');
        await this.checkpoint(lease);
        const staged = await this.objects.putPrivateClean(job, lease, bytes);
        if (staged.sha256 !== job.sha256)
          throw new Error('Private clean object mismatch');
      },
      saveExtraction: async (job, extraction, provider) => {
        same(job);
        await this.call('save', lease, {
          extraction: validateExtraction(extraction) as unknown as Json,
          provider,
        });
      },
      fail: async (job) => {
        same(job);
        this.bytes.delete(lease.token);
        await this.call('fail', lease);
      },
    };
  }
  async complete(lease: ProcessingLease) {
    await this.call('complete', lease);
    this.bytes.delete(lease.token);
  }
  async retryOrReject(lease: ProcessingLease) {
    this.bytes.delete(lease.token);
    try {
      await this.call('retry', lease);
    } catch (e) {
      if ((e as { code?: string }).code !== '42501') throw e;
    }
  }
}
