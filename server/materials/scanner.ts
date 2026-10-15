import { createHash } from 'node:crypto';
import type { ApprovedScanner, ScanEvidence } from './pipeline';
import { MAX_SOURCE_BYTES } from './pipeline';

// Contract adapter only. Operator approval/engine validation and hosting are separate gates.
export class MalwareScanGateway implements ApprovedScanner {
  readonly approved = true as const;
  readonly id = 'approved-malware-gateway';
  constructor(
    private endpoint: string,
    private token: string,
    private approvedEngines: readonly string[],
    private transport: typeof fetch = fetch,
  ) {
    const url = new URL(endpoint);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      !token ||
      !approvedEngines.length
    )
      throw new Error('Invalid scanner configuration');
  }
  async scan(bytes: Uint8Array): Promise<ScanEvidence> {
    if (!bytes.length || bytes.length > MAX_SOURCE_BYTES)
      throw new Error('Invalid scan size');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const response = await this.transport(this.endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/octet-stream',
        'X-Content-SHA256': sha256,
      },
      body: Buffer.from(bytes),
    });
    if (
      !response.ok ||
      !response.body ||
      !response.headers.get('content-type')?.startsWith('application/json')
    )
      throw new Error('Scanner unavailable');
    const reader = response.body.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.length;
        if (size > 4096) {
          await reader.cancel();
          throw new Error('Invalid scan response');
        }
        chunks.push(item.value);
      }
    } finally {
      reader.releaseLock();
    }
    const e = JSON.parse(
      Buffer.concat(chunks).toString('utf8'),
    ) as ScanEvidence;
    if (
      !e ||
      Object.keys(e).sort().join(',') !==
        'engine,scannedAt,sha256,signatureVersion,verdict' ||
      !['clean', 'infected', 'unknown'].includes(e.verdict) ||
      e.sha256 !== sha256 ||
      !this.approvedEngines.includes(e.engine) ||
      typeof e.signatureVersion !== 'string' ||
      !e.signatureVersion.trim() ||
      e.signatureVersion.length > 200 ||
      typeof e.scannedAt !== 'string' ||
      !Number.isFinite(Date.parse(e.scannedAt)) ||
      Math.abs(Date.now() - Date.parse(e.scannedAt)) > 15 * 60000
    )
      throw new Error('Untrusted scan evidence');
    return e;
  }
}
