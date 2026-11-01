import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types';
import { SupabaseProcessingStore } from '../server/materials/control-store';
import { runWorkerOnce } from '../server/materials/worker';
import {
  SupplierCsvExtractor,
  SupplierCsvValidator,
} from '../server/materials/csv';
function setup() {
  const bytes = readFileSync('docs/SUPPLIER_IMPORT_TEMPLATE.csv'),
    organizationId = crypto.randomUUID(),
    sourceId = crypto.randomUUID(),
    sha256 = createHash('sha256').update(bytes).digest('hex');
  const lease = {
    job: {
      organizationId,
      sourceId,
      objectKey: `${organizationId}/${sourceId}`,
      sha256,
      mime: 'text/csv',
      size: bytes.length,
    },
    token: crypto.randomUUID(),
    attempt: 1,
    expiresAt: Date.now() + 120000,
  };
  const rpc = vi.fn(async (_name: string, args: { p_operation: string }) => ({
    data: args.p_operation === 'claim' ? lease : true,
    error: null as { code: string } | null,
  }));
  const objects = {
    readQuarantined: vi.fn(async () => bytes as Uint8Array),
    putPrivateClean: vi.fn(async () => ({ sha256 })),
  };
  const queue = new SupabaseProcessingStore(
    { rpc } as unknown as SupabaseClient<Database>,
    organizationId,
    objects,
    'synthetic-validator',
  );
  const scanner = {
    id: 'synthetic-only',
    approved: true as const,
    scan: vi.fn(async () => ({
      verdict: 'clean' as const,
      sha256,
      engine: 'synthetic-contract',
      signatureVersion: 'fixture-not-a-real-scan',
      scannedAt: new Date().toISOString(),
    })),
  };
  return {
    bytes,
    lease,
    rpc,
    objects,
    queue,
    scanner,
    validator: new SupplierCsvValidator(),
    extractor: new SupplierCsvExtractor(),
  };
}
it('runs real literal CSV validation/extraction through the scoped store contract after synthetic scan', async () => {
  const s = setup();
  expect(await runWorkerOnce(s)).toBe('completed');
  expect(s.objects.putPrivateClean).toHaveBeenCalledWith(
    s.lease.job,
    s.lease,
    s.bytes,
  );
  const operations = s.rpc.mock.calls.map(([, a]) => a.p_operation);
  expect(operations.indexOf('release')).toBeLessThan(
    operations.indexOf('save'),
  );
  expect(operations.at(-1)).toBe('complete');
});
it('rejects changed object bytes before a scanner call or release', async () => {
  const s = setup();
  s.objects.readQuarantined.mockResolvedValue(Buffer.from('corrupted bytes'));
  expect(await runWorkerOnce(s)).toBe('failed');
  expect(s.scanner.scan).not.toHaveBeenCalled();
  expect(s.objects.putPrivateClean).not.toHaveBeenCalled();
});
it('does not persist extraction after clean-object digest mismatch', async () => {
  const s = setup();
  s.objects.putPrivateClean.mockResolvedValue({ sha256: '0'.repeat(64) });
  expect(await runWorkerOnce(s)).toBe('failed');
  expect(s.rpc.mock.calls.map(([, a]) => a.p_operation)).not.toContain('save');
});
it('a permission revocation during extraction prevents publication and treats denied retry as no-op', async () => {
  const s = setup();
  let revoked = false;
  s.rpc.mockImplementation(async (_name, args) =>
    revoked
      ? {
          data: false,
          error: args.p_operation === 'retry' ? null : { code: '42501' },
        }
      : { data: args.p_operation === 'claim' ? s.lease : true, error: null },
  );
  const extractor = {
    id: 'synthetic-csv',
    model: 'literal-fixture',
    extract: async () => {
      revoked = true;
      return new SupplierCsvExtractor().extract(s.bytes, 'text/csv');
    },
  };
  expect(await runWorkerOnce({ ...s, extractor })).toBe('failed');
  expect(s.rpc.mock.calls.map(([, a]) => a.p_operation)).not.toContain('save');
  expect(s.objects.putPrivateClean).toHaveBeenCalledOnce();
});
