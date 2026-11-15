import { afterEach, expect, it } from 'vitest';
import {
  cpSync,
  realpathSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { check } from '../proposals/customer-payment-link-lifecycle/qualify.mjs';
const owned: string[] = [];
afterEach(() => {
  for (const d of owned.splice(0)) rmSync(d, { recursive: true, force: true });
});
function copy() {
  const root = process.cwd(),
    d = mkdtempSync(join(realpathSync(tmpdir()), 'customer-link-source-'));
  owned.push(d);
  cpSync(root, d, {
    recursive: true,
    filter: (p) =>
      !['.git', 'node_modules'].some(
        (n) => p === join(root, n) || p.startsWith(join(root, n) + '/'),
      ),
  });
  return d;
}
it('qualifies exact selected source and preserves links/financial operation OFF', () => {
  expect(check()).toMatchObject({
    operationalReady: false,
    linksEnabled: false,
    paymentsAuthorized: false,
  });
});
it.each([
  'proposals/customer-payment-link-lifecycle/read.ts',
  'proposals/customer-payment-link-lifecycle/query.ts',
  'server/payments/commercial-capacity.proposed.sql',
])('withdrawn %s cannot qualify', (file) => {
  const d = copy();
  writeFileSync(join(d, file), '// withdrawn');
  expect(() => check(d)).toThrow('Exact lifecycle source required');
});
it('coordinated mutable manifest and query rebinding cannot select another operation', () => {
  const d = copy(),
    p = join(d, 'proposals/customer-payment-link-lifecycle/query.ts'),
    m = join(d, 'proposals/customer-payment-link-lifecycle/source.json');
  writeFileSync(
    p,
    'export const CUSTOMER_CAPTURE_LIFECYCLE_QUERY="delete from private.sandbox_gateway_attempts";',
  );
  writeFileSync(
    m,
    readFileSync(m, 'utf8').replaceAll('READ_ONLY', 'NEW_OPERATION'),
  );
  expect(() => check(d)).toThrow();
});
it('unchanged bytes with executable source mode cannot qualify', () => {
  const d = copy();
  chmodSync(
    join(d, 'proposals/customer-payment-link-lifecycle/read.ts'),
    0o755,
  );
  expect(() => check(d)).toThrow();
});
