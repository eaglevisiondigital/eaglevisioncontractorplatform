// Fictional existing-engine creation only; no App route, provider or client.
import { createRoot } from 'react-dom/client';
import { Estimates } from '../../../src/components/phase3/Estimates';
import { prototypeFixture } from '../../program/prototype-fixture';
import '../../../src/styles.css';
declare global {
  interface Window {
    estimateCreateReview: {
      snapshot: () => {
        calls: number;
        otherWrites: number;
        waiting: boolean;
        listReads: number;
        created: { id: string; customer: string; status: string } | null;
      };
      release: (deny?: boolean) => void;
      saved: () => Promise<{ id: string; customer: string; status: string }[]>;
    };
  }
}
void (async () => {
  const f = await prototypeFixture();
  let calls = 0,
    otherWrites = 0,
    listReads = 0;
  let pending: ((deny: boolean) => void) | undefined;
  let created: { id: string; customer: string; status: string } | null = null;
  const create = f.repo.create.bind(f.repo),
    list = f.repo.list.bind(f.repo);
  const readOnly = new Set([
    'constructor',
    'initialize',
    'state',
    // Internal implementation invoked by the one observed repo.create call.
    'createWithGuard',
    'list',
    'get',
    'catalog',
    'taxes',
    'defaults',
    'templates',
    'history',
    'customerRevisionOrigin',
    'repairOrigin',
    'cleanDocuments',
    'materialPricing',
    'importBatches',
    'sourceEstimate',
    'importSources',
    'jobs',
    'workforce',
  ]);
  for (const name of Object.getOwnPropertyNames(
    Object.getPrototypeOf(f.repo),
  )) {
    const descriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(f.repo),
      name,
    );
    if (typeof descriptor?.value === 'function' && !readOnly.has(name))
      Reflect.set(f.repo, name, () => {
        otherWrites++;
        throw Error('No other fixture writer authorized');
      });
  }
  for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(f.ops))) {
    const descriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(f.ops),
      name,
    );
    if (
      /^(save|create|update|delete|remove|assign|revoke|accept|submit|record|set)/.test(
        name,
      ) &&
      typeof descriptor?.value === 'function'
    )
      Reflect.set(f.ops, name, () => {
        otherWrites++;
        throw Error('No operations writer authorized after seed');
      });
  }
  f.repo.create = async (...args) => {
    if (
      args[0].id !== f.company.id ||
      args[1].customer_id !== f.target.customer_id
    )
      throw Error('Exact fictional tenant/customer required');
    calls++;
    if (calls !== 1) throw Error('One explicit fixture creation only');
    const deny = await new Promise<boolean>((resolve) => {
      pending = resolve;
    });
    pending = undefined;
    if (deny) throw Error('Fixture draft creation declined');
    const result = await create(...args);
    created = {
      id: result.estimate.id,
      customer: result.estimate.customer_id,
      status: result.estimate.status,
    };
    return result;
  };
  f.repo.list = async (...args) => {
    listReads++;
    return list(...args);
  };
  window.estimateCreateReview = {
    snapshot: () => ({
      calls,
      otherWrites,
      waiting: !!pending,
      listReads,
      created,
    }),
    release: (deny = false) => pending?.(deny),
    saved: async () =>
      (await list(f.company.id)).map((row) => ({
        id: row.id,
        customer: row.customer_id,
        status: row.status,
      })),
  };
  createRoot(document.getElementById('root')!).render(
    <main>
      <h1>Fictional estimate creation review</h1>
      <Estimates repo={f.repo} company={f.company} canIssue={false} />
    </main>,
  );
})();
