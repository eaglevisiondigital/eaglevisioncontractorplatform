// Fictional existing-engine records; read observation only, no App route/client.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Estimates } from '../../../src/components/phase3/Estimates';
import { sampleCompanies } from '../../../src/domain/platform';
import { prototypeFixture } from '../../program/prototype-fixture';
import '../../../src/styles.css';
type Counts = {
  list: number;
  templates: number;
  defaults: number;
  catalog: number;
  taxes: number;
  customers: number;
  get: number;
};
declare global {
  interface Window {
    estimateReadReview: {
      snapshot: () => {
        company: string;
        facts: { id: string; name: string; status: string }[];
        reads: Counts[];
        writes: number;
        waiting: boolean;
        completed: number[];
        rejected: number[];
      };
      hold: () => void;
      release: () => void;
      deny: (value: boolean, index?: number) => void;
      company: (index: number) => void;
    };
  }
}
void (async () => {
  const fixtures = await Promise.all(
    sampleCompanies.slice(0, 2).map(async (company) => {
      const fixture = await prototypeFixture(company);
      await fixture.repo.issue(company.id, fixture.bundle);
      const facts = (await fixture.repo.list(company.id)).map((row) => ({
        id: row.id,
        name: row.project_name,
        status: row.status,
      }));
      if (
        facts.length !== 2 ||
        facts.filter((row) => row.status === 'draft').length !== 1 ||
        facts.filter((row) => row.status === 'issued').length !== 1
      )
        throw Error('Two actual draft and issued fixture records required');
      return { ...fixture, facts };
    }),
  );
  let current = 0,
    writes = 0,
    heldFor = -1;
  let pending: (() => void) | undefined;
  const faults = [false, false],
    completed = [0, 0],
    rejected = [0, 0];
  const reads: Counts[] = fixtures.map(() => ({
    list: 0,
    templates: 0,
    defaults: 0,
    catalog: 0,
    taxes: 0,
    customers: 0,
    get: 0,
  }));
  for (const [index, fixture] of fixtures.entries()) {
    for (const name of [
      'list',
      'templates',
      'defaults',
      'catalog',
      'taxes',
    ] as const) {
      const original = fixture.repo[name].bind(fixture.repo);
      Reflect.set(fixture.repo, name, async (org: string) => {
        if (org !== fixture.company.id) throw Error('Fixture tenant mismatch');
        reads[index][name]++;
        if (name === 'list' && heldFor === index) {
          heldFor = -1;
          await new Promise<void>((resolve) => {
            pending = resolve;
          });
          pending = undefined;
        }
        if (faults[index]) {
          rejected[index]++;
          throw Error('PRIVATE_BACKEND_READ_FAILURE');
        }
        const result = await original(org);
        if (name === 'list') completed[index]++;
        return result;
      });
    }
    const customers = fixture.ops.listCustomers.bind(fixture.ops);
    fixture.ops.listCustomers = async (...args) => {
      reads[index].customers++;
      return customers(...args);
    };
    const get = fixture.repo.get.bind(fixture.repo);
    fixture.repo.get = async (...args) => {
      reads[index].get++;
      return get(...args);
    };
    const readOnly = new Set([
      'constructor',
      'initialize',
      'state',
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
      Object.getPrototypeOf(fixture.repo),
    )) {
      const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(fixture.repo),
        name,
      );
      if (typeof descriptor?.value === 'function' && !readOnly.has(name))
        Reflect.set(fixture.repo, name, () => {
          writes++;
          throw Error('No estimate fixture writer authorized after seed');
        });
    }
    for (const name of Object.getOwnPropertyNames(
      Object.getPrototypeOf(fixture.ops),
    )) {
      const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(fixture.ops),
        name,
      );
      if (
        /^(save|create|update|delete|remove|assign|revoke|accept|submit|record|set)/.test(
          name,
        ) &&
        typeof descriptor?.value === 'function'
      )
        Reflect.set(fixture.ops, name, () => {
          writes++;
          throw Error('No operations writer authorized after seed');
        });
    }
  }
  const root = createRoot(document.getElementById('root')!);
  const render = () => {
    const f = fixtures[current];
    flushSync(() =>
      root.render(
        <main>
          <h1>Fictional estimate read-state review</h1>
          <p data-testid="company">{f.company.name}</p>
          <Estimates
            key={f.company.id}
            repo={f.repo}
            company={f.company}
            canIssue={false}
          />
        </main>,
      ),
    );
  };
  window.estimateReadReview = {
    snapshot: () => ({
      company: fixtures[current].company.id,
      facts: fixtures[current].facts.map((v) => ({ ...v })),
      reads: reads.map((v) => ({ ...v })),
      writes,
      waiting: !!pending,
      completed: [...completed],
      rejected: [...rejected],
    }),
    hold: () => {
      heldFor = current;
    },
    release: () => pending?.(),
    deny: (value, index = current) => {
      faults[index] = value;
    },
    company: (index) => {
      if (![0, 1].includes(index)) throw Error('Fixture company required');
      current = index;
      render();
    },
  };
  render();
})();
