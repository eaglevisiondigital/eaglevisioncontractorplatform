// Disposable existing-engine records only. This fixture exposes no product route.
import { createRoot } from 'react-dom/client';
import { Estimates } from '../../../src/components/phase3/Estimates';
import { prototypeFixture } from '../../program/prototype-fixture';
import {
  calculateEstimate,
  formatMinor,
} from '../../../src/domain/estimating/calculation';
import '../../../src/styles.css';
declare global {
  interface Window {
    estimatePreviewIntegrity: {
      snapshot: () => Promise<{
        number: string;
        saved: { project: string; lock: number; status: string; total: number };
        quantity: number;
        capturedAmounts: string[];
        workingAmounts: string[];
        capturedTaxLabel: string;
        currentTaxRate: number;
        capturedTaxRate: number;
        currentTaxPresent: boolean;
        writes: number;
      }>;
    };
  }
}
void (async () => {
  const mode = new URL(location.href).searchParams.get('mode') ?? 'draft';
  if (
    ![
      'draft',
      'draft-tax-changed',
      'issued-tax-changed',
      'issued-tax-missing',
      'archived-tax-changed',
    ].includes(mode)
  )
    throw Error('Known fictional scenario required');
  const f = await prototypeFixture();
  await f.repo.saveTax(f.company.id, {
    name: 'Fictional captured tax',
    reference: 'TEST ONLY',
    jurisdiction: 'Fictional jurisdiction',
    contract_type: 'Fictional scope',
    rate_bps: 1000,
    status: 'reviewed',
    active: true,
  });
  const tax = (await f.repo.taxes(f.company.id)).find(
    (row) => row.name === 'Fictional captured tax',
  );
  if (!tax) throw Error('Existing-engine fictional policy required');
  f.bundle = await f.repo.save(f.company.id, f.bundle, {
    ...structuredClone(f.bundle.version.payload),
    tax_policy_id: tax.id,
    lines: f.bundle.version.payload.lines.map((row, index) =>
      index === 0 ? { ...row, taxable: true } : row,
    ),
  });
  if (mode.startsWith('issued'))
    f.bundle = await f.repo.issue(f.company.id, f.bundle);
  if (mode.startsWith('archived')) {
    await f.repo.archive(f.company.id, f.bundle.estimate.id, true);
    f.bundle = await f.repo.get(
      f.company.id,
      f.bundle.estimate.id,
      f.bundle.version.id,
    );
  }
  const saved = structuredClone(f.bundle),
    policy = saved.version.tax_policy_snapshot;
  if (!policy || saved.version.calculation.tax_minor <= 0)
    throw Error('Actual positive captured tax fixture required');
  const taxes = f.repo.taxes.bind(f.repo),
    get = f.repo.get.bind(f.repo);
  const changed = mode.endsWith('changed'),
    missing = mode.endsWith('missing');
  const currentRate = missing
    ? 0
    : changed
      ? policy.rate_bps + 500
      : policy.rate_bps;
  if (currentRate > 10000) throw Error('Valid synthetic tax rate required');
  f.repo.taxes = async (org) => {
    if (org !== f.company.id) throw Error('Exact fictional tenant only');
    const rows = await taxes(org);
    return missing
      ? rows.filter((r) => r.id !== policy.id)
      : rows.map((r) =>
          r.id === policy.id ? { ...r, rate_bps: currentRate } : r,
        );
  };
  let writes = 0;
  for (const owner of [f.repo, f.ops]) {
    for (const name of Object.getOwnPropertyNames(
      Object.getPrototypeOf(owner),
    )) {
      const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(owner),
        name,
      );
      if (
        typeof descriptor?.value === 'function' &&
        /^(save|create|update|delete|remove|assign|revoke|accept|submit|record|set|issue|revise|duplicate|archive|approve)/.test(
          name,
        )
      )
        Reflect.set(owner, name, () => {
          writes++;
          throw Error('No fixture write authorized after seed');
        });
    }
  }
  const amounts = (c: typeof saved.version.calculation) =>
    [c.subtotal_minor, -c.discount_minor, c.tax_minor, c.total_minor].map((n) =>
      formatMinor(n, saved.version.payload.currency),
    );
  window.estimatePreviewIntegrity = {
    snapshot: async () => {
      const current = await get(
        f.company.id,
        saved.estimate.id,
        saved.version.id,
      );
      return {
        number: saved.estimate.estimate_number,
        saved: {
          project: current.version.payload.project.name,
          lock: current.version.lock_revision,
          status: current.version.status,
          total: current.version.calculation.total_minor,
        },
        quantity: saved.version.payload.lines[0].quantity_milli / 1000,
        capturedAmounts: amounts(saved.version.calculation),
        workingAmounts: amounts(
          calculateEstimate(saved.version.payload, currentRate),
        ),
        capturedTaxLabel: `${policy.name} · ${policy.rate_bps / 100}% · ${policy.status}`,
        currentTaxRate: currentRate,
        capturedTaxRate: policy.rate_bps,
        currentTaxPresent: !missing,
        writes,
      };
    },
  };
  createRoot(document.getElementById('root')!).render(
    <main>
      <h1>Fictional estimate preview review</h1>
      <Estimates repo={f.repo} company={f.company} canIssue={false} />
    </main>,
  );
})();
