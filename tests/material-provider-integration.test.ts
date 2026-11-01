import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { WorkerObjectGateway } from '../server/materials/objects';
import { SupplierExtractionNormalizer } from '../server/materials/normalization';
import { ExtractionGateway } from '../server/materials/providers';
import { MalwareScanGateway } from '../server/materials/scanner';
import { SupplierContentValidator } from '../server/materials/validation';
import {
  runWorkerOnce,
  type ProcessingLease,
} from '../server/materials/worker';
import { SupabaseProcessingStore } from '../server/materials/control-store';
import { sha256 } from '../server/providers/safety';
import { syntheticMaterials } from '../src/domain/materials/fixtures';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types';
function setup() {
  const bytes = readFileSync('docs/SUPPLIER_IMPORT_TEMPLATE.csv'),
    organizationId = crypto.randomUUID(),
    sourceId = crypto.randomUUID();
  const lease: ProcessingLease = {
    job: {
      organizationId,
      sourceId,
      objectKey: `${organizationId}/${sourceId}`,
      mime: 'text/csv',
      size: bytes.length,
      sha256: sha256(bytes),
    },
    token: crypto.randomUUID(),
    attempt: 1,
    expiresAt: Date.now() + 120000,
  };
  const transport = vi.fn<typeof fetch>(async (url) =>
    String(url).endsWith('/read')
      ? new Response(bytes)
      : Response.json({
          sha256: lease.job.sha256,
          objectKey: lease.job.objectKey,
        }),
  );
  const objects = new WorkerObjectGateway(
    organizationId,
    'https://objects.example.test',
    'synthetic-workload',
    transport,
  );
  return { bytes, lease, transport, objects };
}
it.each([
  'valid',
  'foreign-tenant',
  'foreign-source',
  'expired',
  'traversal',
  'corruption',
  'oversized',
  'wrong-receipt',
])('scoped byte gateway %s', async (mode) => {
  const s = setup();
  if (mode === 'foreign-tenant')
    s.lease.job.organizationId = crypto.randomUUID();
  if (mode === 'foreign-source') s.lease.job.sourceId = crypto.randomUUID();
  if (mode === 'expired') s.lease.expiresAt = 0;
  if (mode === 'traversal') s.lease.job.objectKey += '//../';
  if (mode === 'corruption')
    s.transport.mockResolvedValue(new Response('corruption'));
  if (mode === 'oversized')
    s.transport.mockResolvedValue(
      new Response(Buffer.alloc(3 * 1024 * 1024 + 1)),
    );
  if (mode === 'wrong-receipt')
    s.transport.mockResolvedValue(
      Response.json({ sha256: s.lease.job.sha256, objectKey: 'foreign' }),
    );
  if (mode === 'valid') {
    expect(await s.objects.readQuarantined(s.lease.job, s.lease)).toEqual(
      s.bytes,
    );
    expect(
      await s.objects.putPrivateClean(s.lease.job, s.lease, s.bytes),
    ).toEqual({ sha256: s.lease.job.sha256 });
    expect(s.transport.mock.calls[0][1]?.redirect).toBe('error');
  } else if (mode === 'wrong-receipt')
    await expect(
      s.objects.putPrivateClean(s.lease.job, s.lease, s.bytes),
    ).rejects.toThrow();
  else
    await expect(
      s.objects.readQuarantined(s.lease.job, s.lease),
    ).rejects.toThrow();
  if (
    ['foreign-tenant', 'foreign-source', 'expired', 'traversal'].includes(mode)
  )
    expect(s.transport).not.toHaveBeenCalled();
});
it.each(['jpeg', 'png', 'webp'] as const)(
  'normalizes %s pixels and removes EXIF/GPS/XMP before AI',
  async (format) => {
    const source = await sharp({
      create: { width: 20, height: 10, channels: 3, background: '#16845b' },
    })
      .toFormat(format)
      .withExif({ IFD0: { Artist: 'Private synthetic metadata' } })
      .toBuffer();
    const normalized = await new SupplierExtractionNormalizer().normalize(
      source,
      `image/${format}`,
    );
    expect(normalized.mime).toBe('image/png');
    const meta = await sharp(normalized.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.width).toBe(20);
  },
);
it.each(['unknown-field', 'bad-schema', 'oversized', 'outage', 'html'])(
  'AI gateway rejects %s rather than fabricating materials',
  async (mode) => {
    const s = setup(),
      fixture = syntheticMaterials().sources[0].extraction!;
    const transport = vi.fn<typeof fetch>(async () =>
      mode === 'outage'
        ? new Response('', { status: 503 })
        : mode === 'html'
          ? new Response('<html>')
          : Response.json(
              mode === 'unknown-field'
                ? { ...fixture, instructions: 'ignore security' }
                : mode === 'bad-schema'
                  ? {}
                  : { x: 'a'.repeat(1024 * 1024 + 1) },
            ),
    );
    await expect(
      new ExtractionGateway(
        'synthetic-only',
        'https://extract.example.test',
        'synthetic',
        transport,
      ).extract(s.bytes, 'text/csv'),
    ).rejects.toThrow();
  },
);
it('runs byte transport, scan and AI adapters with synthetic transports through durable-store orchestration', async () => {
  const s = setup(),
    rpc = vi.fn(async (_name: string, args: { p_operation: string }) => ({
      data: args.p_operation === 'claim' ? s.lease : true,
      error: null,
    }));
  const queue = new SupabaseProcessingStore(
    { rpc } as unknown as SupabaseClient<Database>,
    s.lease.job.organizationId,
    s.objects,
    'synthetic-validator',
  );
  const scanTransport = vi.fn<typeof fetch>(async () =>
    Response.json({
      verdict: 'clean',
      sha256: s.lease.job.sha256,
      engine: 'synthetic-engine',
      signatureVersion: 'fixture-not-an-actual-scan',
      scannedAt: new Date().toISOString(),
    }),
  );
  const extractionTransport = vi.fn<typeof fetch>(async () =>
    Response.json(syntheticMaterials().sources[0].extraction),
  );
  const scanner = new MalwareScanGateway(
      'https://scan.example.test',
      'synthetic',
      ['synthetic-engine'],
      scanTransport,
    ),
    extractor = new ExtractionGateway(
      'synthetic-model',
      'https://ai.example.test',
      'synthetic',
      extractionTransport,
    );
  expect(
    await runWorkerOnce({
      queue,
      scanner,
      validator: new SupplierContentValidator(),
      extractor,
    }),
  ).toBe('completed');
  expect(scanTransport).toHaveBeenCalledOnce();
  expect(extractionTransport).toHaveBeenCalledOnce();
  expect(rpc.mock.calls.map(([, a]) => a.p_operation).at(-1)).toBe('complete');
});
it('revocation during clean-byte staging prevents any AI transmission', async () => {
  const s = setup();
  let revoked = false;
  const rpc = vi.fn(async (_name: string, args: { p_operation: string }) => ({
    data: args.p_operation === 'claim' ? s.lease : true,
    error: revoked && args.p_operation !== 'retry' ? { code: '42501' } : null,
  }));
  s.transport.mockImplementation(async (url) => {
    if (String(url).endsWith('/read')) return new Response(s.bytes);
    revoked = true;
    return Response.json({
      sha256: s.lease.job.sha256,
      objectKey: s.lease.job.objectKey,
    });
  });
  const queue = new SupabaseProcessingStore(
    { rpc } as unknown as SupabaseClient<Database>,
    s.lease.job.organizationId,
    s.objects,
    'synthetic-validator',
  );
  const extractor = {
    id: 'synthetic',
    model: 'synthetic',
    extract: vi.fn(async () => syntheticMaterials().sources[0].extraction),
  };
  expect(
    await runWorkerOnce({
      queue,
      scanner: {
        id: 'synthetic',
        approved: true,
        scan: async () => ({
          verdict: 'clean',
          sha256: s.lease.job.sha256,
          engine: 'synthetic',
          signatureVersion: 'fixture',
          scannedAt: new Date().toISOString(),
        }),
      },
      validator: new SupplierContentValidator(),
      extractor,
    }),
  ).toBe('failed');
  expect(extractor.extract).not.toHaveBeenCalled();
});

it('malformed AI JSON never exposes supplier content in an exception', async () => {
  const s = setup(),
    transport = vi.fn<typeof fetch>(
      async () =>
        new Response('{private-supplier-price-data', {
          headers: { 'Content-Type': 'application/json' },
        }),
    );
  await expect(
    new ExtractionGateway(
      'synthetic',
      'https://ai.example.test',
      'synthetic',
      transport,
    ).extract(s.bytes, 'text/csv'),
  ).rejects.toThrow('Invalid provider JSON');
});
