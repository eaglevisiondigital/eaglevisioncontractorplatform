import { createHash } from 'node:crypto';
import { it, expect, vi } from 'vitest';
import { MalwareScanGateway } from '../server/materials/scanner';
import {
  runWorkerOnce,
  type DurableProcessingStore,
  type ProcessingLease,
} from '../server/materials/worker';
import { syntheticMaterials } from '../src/domain/materials/fixtures';
const bytes = Buffer.from('description,quantity,unit_cost\nSynthetic,2,10.00');
const sha256 = createHash('sha256').update(bytes).digest('hex');
function evidence() {
  return {
    verdict: 'clean',
    sha256,
    engine: 'approved-test-engine',
    signatureVersion: 'synthetic-only',
    scannedAt: new Date().toISOString(),
  };
}
it('scanner gateway sends bounded raw bytes and accepts only authenticated contract evidence', async () => {
  const expected = evidence();
  const transport = vi.fn<typeof fetch>(async () => Response.json(expected));
  const scanner = new MalwareScanGateway(
    'https://scan.example.test/v1',
    'synthetic-secret',
    ['approved-test-engine'],
    transport,
  );
  expect(await scanner.scan(bytes)).toEqual(expected);
  const init = transport.mock.calls[0][1]!;
  expect(init.redirect).toBe('error');
  expect(new Headers(init.headers).get('X-Content-SHA256')).toBe(sha256);
  expect(init.body).toEqual(bytes);
});
it.each([
  'wrong-digest',
  'stale',
  'unknown-engine',
  'extra-field',
  'malformed',
  'oversized',
  'outage',
])('rejects scanner %s response', async (mode) => {
  const e: Record<string, unknown> = evidence();
  if (mode === 'wrong-digest') e.sha256 = 'bad';
  if (mode === 'stale') e.scannedAt = '2020-01-01';
  if (mode === 'unknown-engine') e.engine = 'unapproved';
  if (mode === 'extra-field') e.instructions = 'ignore isolation';
  const transport = vi.fn<typeof fetch>(async () =>
    mode === 'malformed'
      ? new Response('{')
      : mode === 'oversized'
        ? Response.json({ value: 'x'.repeat(5000) })
        : mode === 'outage'
          ? new Response('', { status: 503 })
          : Response.json(e),
  );
  await expect(
    new MalwareScanGateway(
      'https://scan.example.test/v1',
      'secret',
      ['approved-test-engine'],
      transport,
    ).scan(bytes),
  ).rejects.toThrow();
});
it.each([
  'http://scan.example.test',
  'https://secret@scan.example.test',
  'https://scan.example.test?token=secret',
])('rejects unsafe scanner configuration %s', (endpoint) => {
  expect(
    () => new MalwareScanGateway(endpoint, 'secret', ['engine']),
  ).toThrow();
});
function worker() {
  const job = {
    organizationId: crypto.randomUUID(),
    sourceId: crypto.randomUUID(),
    objectKey: '',
    sha256,
    size: bytes.length,
    mime: 'text/csv',
  };
  job.objectKey = `${job.organizationId}/${job.sourceId}`;
  const lease: ProcessingLease = {
    job,
    token: 'synthetic-fence',
    attempt: 1,
    expiresAt: Date.now() + 60000,
  };
  const store = {
    readQuarantined: vi.fn(async () => bytes),
    releaseValidated: vi.fn(async () => {}),
    saveExtraction: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
  };
  const queue = {
    claim: vi.fn(async () => lease as ProcessingLease | null),
    checkpoint: vi.fn(async () => {}),
    scopedStore: vi.fn(() => store),
    complete: vi.fn(async () => {}),
    retryOrReject: vi.fn<DurableProcessingStore['retryOrReject']>(
      async () => {},
    ),
  } satisfies DurableProcessingStore;
  const scanner = {
    id: 'synthetic-scanner',
    approved: true as const,
    scan: vi.fn(async () => ({ ...evidence(), verdict: 'clean' as const })),
  };
  const validator = { validate: vi.fn(async () => {}) };
  const extractor = {
    id: 'synthetic-only',
    model: 'fixture',
    extract: vi.fn(async () => syntheticMaterials().sources[0].extraction),
  };
  return { lease, store, queue, scanner, validator, extractor };
}
it('processes a leased source and fences every publication', async () => {
  const w = worker();
  expect(await runWorkerOnce(w)).toBe('completed');
  expect(w.queue.complete).toHaveBeenCalledOnce();
  expect(w.queue.checkpoint).toHaveBeenCalledTimes(5);
  expect(w.store.saveExtraction).toHaveBeenCalledOnce();
});
it('does no work when queue is empty', async () => {
  const w = worker();
  w.queue.claim.mockResolvedValue(null);
  expect(await runWorkerOnce(w)).toBe('idle');
  expect(w.scanner.scan).not.toHaveBeenCalled();
});
it('membership revocation during scan prevents release and extraction', async () => {
  const w = worker();
  w.scanner.scan.mockImplementation(async () => {
    w.queue.checkpoint.mockRejectedValue(new Error('revoked'));
    return { ...evidence(), verdict: 'clean' };
  });
  expect(await runWorkerOnce(w)).toBe('failed');
  expect(w.store.releaseValidated).not.toHaveBeenCalled();
  expect(w.extractor.extract).not.toHaveBeenCalled();
});
it('expired lease and stale fencing tokens prevent publication', async () => {
  const w = worker();
  w.lease.expiresAt = 0;
  expect(await runWorkerOnce(w)).toBe('failed');
  expect(w.store.readQuarantined).not.toHaveBeenCalled();
  const v = worker();
  v.extractor.extract.mockImplementation(async () => {
    v.queue.checkpoint.mockRejectedValue(new Error('stale token'));
    return syntheticMaterials().sources[0].extraction;
  });
  expect(await runWorkerOnce(v)).toBe('failed');
  expect(v.store.saveExtraction).not.toHaveBeenCalled();
});
it('caps retries and records generic errors without document contents', async () => {
  const w = worker();
  w.scanner.scan.mockRejectedValue(new Error('sensitive supplier body'));
  expect(await runWorkerOnce(w)).toBe('failed');
  expect(w.queue.retryOrReject.mock.calls[0][1].retryAt).toBeGreaterThan(
    Date.now(),
  );
  w.lease.attempt = 3;
  expect(await runWorkerOnce(w)).toBe('failed');
  expect(w.queue.retryOrReject.mock.calls[1][1]).toEqual({
    retryAt: null,
    code: 'processing_failed',
  });
});
