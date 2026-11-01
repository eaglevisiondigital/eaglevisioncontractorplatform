import type { WorkerObjects } from './control-store';
import type { ProcessingLease } from './worker';
import type { QuarantineJob } from './pipeline';
import { MAX_SOURCE_BYTES } from './pipeline';
import {
  providerJson,
  boundedBytes,
  digestPattern,
  exactKeys,
  operatorEndpoint,
  sha256,
  uuid,
} from '../providers/safety';

// Wire contract for the separately approved workload byte service, NOT a staff
// Storage client or a replacement for service-side lease/CAS authorization.
export class WorkerObjectGateway implements WorkerObjects {
  private readonly origin: string;
  constructor(
    private readonly organizationId: string,
    endpoint: string,
    private readonly workloadCredential: string,
    private readonly transport: typeof fetch,
  ) {
    this.origin = operatorEndpoint(endpoint).replace(/\/$/, '');
    if (!uuid.test(organizationId) || !workloadCredential)
      throw new Error('Invalid workload configuration');
  }
  private scope(job: QuarantineJob, lease: ProcessingLease) {
    const bound = Object.freeze({ ...job });
    if (
      !uuid.test(bound.sourceId) ||
      bound.organizationId !== this.organizationId ||
      bound.objectKey !== `${this.organizationId}/${bound.sourceId}` ||
      !digestPattern.test(bound.sha256) ||
      !Number.isInteger(bound.size) ||
      bound.size < 8 ||
      bound.size > MAX_SOURCE_BYTES ||
      lease.expiresAt <= Date.now() ||
      !Number.isFinite(lease.expiresAt) ||
      !/^[a-zA-Z0-9_-]{8,200}$/.test(lease.token) ||
      Object.keys(bound).some(
        (k) =>
          bound[k as keyof QuarantineJob] !==
          lease.job[k as keyof QuarantineJob],
      )
    )
      throw new Error('Invalid object capability');
    exactKeys(bound, [
      'organizationId',
      'sourceId',
      'objectKey',
      'sha256',
      'mime',
      'size',
    ]);
    return {
      bound,
      headers: {
        Authorization: `Bearer ${this.workloadCredential}`,
        'X-Worker-Lease': lease.token,
        'X-Organization-Id': this.organizationId,
        'X-Source-Id': bound.sourceId,
        'X-Content-SHA256': bound.sha256,
        'X-Source-Size': String(bound.size),
      },
    };
  }
  async readQuarantined(job: QuarantineJob, lease: ProcessingLease) {
    const { bound, headers } = this.scope(job, lease);
    const response = await this.transport(`${this.origin}/v1/quarantine/read`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers,
    });
    const bytes = await boundedBytes(response, MAX_SOURCE_BYTES);
    if (bytes.length !== bound.size || sha256(bytes) !== bound.sha256)
      throw new Error('Quarantine byte integrity mismatch');
    return bytes;
  }
  async putPrivateClean(
    job: QuarantineJob,
    lease: ProcessingLease,
    input: Uint8Array,
  ) {
    const { bound, headers } = this.scope(job, lease);
    const bytes = Buffer.from(input);
    if (bytes.length !== bound.size || sha256(bytes) !== bound.sha256)
      throw new Error('Clean byte integrity mismatch');
    const response = await this.transport(`${this.origin}/v1/clean/stage`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: { ...headers, 'Content-Type': 'application/octet-stream' },
      body: bytes,
    });
    const result = providerJson(
      (await boundedBytes(response, 4096)).toString('utf8'),
    );
    if (!result || typeof result !== 'object')
      throw new Error('Invalid clean receipt');
    exactKeys(result, ['sha256', 'objectKey']);
    if (result.sha256 !== bound.sha256 || result.objectKey !== bound.objectKey)
      throw new Error('Clean receipt scope mismatch');
    return { sha256: bound.sha256 };
  }
}
