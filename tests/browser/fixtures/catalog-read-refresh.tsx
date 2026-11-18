// Fictional existing-engine read fixture only. No route, client or transport.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Operations } from '../../../src/lib/operations';
import { phase3Repository } from '../../../src/lib/phase3';
import { Phase3Workspace } from '../../../src/components/phase3/Phase3Workspace';
import { sampleCompanies } from '../../../src/domain/platform';
import '../../../src/styles.css';

type ReadCounts = {
  catalog: number;
  taxes: number;
  defaults: number;
  templates: number;
};
declare global {
  interface Window {
    catalogReadReview: {
      snapshot: () => {
        company: string;
        facts: { id: string; name: string; kind: string; active: boolean }[];
        reads: ReadCounts[];
        writes: number;
        waiting: boolean;
        completed: number[];
      };
      hold: () => void;
      release: () => void;
      deny: (value: boolean) => void;
      company: (index: number) => void;
    };
  }
}
void (async () => {
  const companies = sampleCompanies.slice(0, 2);
  const fixtures = await Promise.all(
    companies.map(async (company) => {
      const operations = new Operations(true);
      const repo = phase3Repository(operations);
      await repo.initialize(company);
      const facts = (await repo.catalog(company.id)).map(
        ({ id, name, kind, active }) => ({ id, name, kind, active }),
      );
      return { company, operations, repo, facts };
    }),
  );
  const reads: ReadCounts[] = fixtures.map(() => ({
    catalog: 0,
    taxes: 0,
    defaults: 0,
    templates: 0,
  }));
  const faults = [false, false],
    completed = [0, 0];
  let current = 0,
    writes = 0,
    heldFor = -1;
  let pending: (() => void) | undefined;
  for (const [index, fixture] of fixtures.entries()) {
    for (const name of ['catalog', 'taxes', 'defaults', 'templates'] as const) {
      const original = fixture.repo[name].bind(fixture.repo);
      Reflect.set(fixture.repo, name, async (org: string) => {
        if (org !== fixture.company.id) throw Error('Fixture company mismatch');
        reads[index][name]++;
        if (name === 'catalog' && heldFor === index) {
          heldFor = -1;
          await new Promise<void>((resolve) => {
            pending = resolve;
          });
          pending = undefined;
        }
        if (faults[index])
          throw Error('Catalog read unavailable in this fixture.');
        const result = await original(org);
        if (name === 'catalog') completed[index]++;
        return result;
      });
    }
    // Seed has completed. Any subsequent repository writer is a test failure.
    const readOnly = new Set([
      'constructor',
      'initialize',
      'state',
      'catalog',
      'taxes',
      'defaults',
      'templates',
      'list',
      'get',
      'history',
      'cleanDocuments',
      'materialPricing',
      'importBatches',
      'sourceEstimate',
      'importSources',
      'jobs',
      'workforce',
      'customerRevisionOrigin',
      'repairOrigin',
    ]);
    for (const name of Object.getOwnPropertyNames(
      Object.getPrototypeOf(fixture.repo),
    )) {
      const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(fixture.repo),
        name,
      );
      if (typeof descriptor?.value === 'function' && !readOnly.has(name)) {
        Reflect.set(fixture.repo, name, () => {
          writes++;
          throw Error('No catalog fixture writer authorized');
        });
      }
    }
    for (const name of Object.getOwnPropertyNames(
      Object.getPrototypeOf(fixture.operations),
    )) {
      if (
        /^(save|create|update|delete|remove|assign|revoke|accept|submit|record|set)/.test(
          name,
        )
      ) {
        const descriptor = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(fixture.operations),
          name,
        );
        if (typeof descriptor?.value === 'function')
          Reflect.set(fixture.operations, name, () => {
            writes++;
            throw Error('No operations fixture writer authorized');
          });
      }
    }
  }
  const root = createRoot(document.getElementById('root')!);
  function render() {
    const fixture = fixtures[current];
    flushSync(() =>
      root.render(
        <main>
          <h1>Controlled catalog read review</h1>
          <p data-testid="company">{fixture.company.name}</p>
          <Phase3Workspace
            key={`${fixture.company.id}-Catalog`}
            operations={fixture.operations}
            company={fixture.company}
            section="Catalog"
          />
        </main>,
      ),
    );
  }
  window.catalogReadReview = {
    snapshot: () => ({
      company: fixtures[current].company.id,
      facts: fixtures[current].facts.map((v) => ({ ...v })),
      reads: reads.map((v) => ({ ...v })),
      writes,
      waiting: !!pending,
      completed: [...completed],
    }),
    hold: () => {
      heldFor = current;
    },
    release: () => pending?.(),
    deny: (value) => {
      faults[current] = value;
    },
    company: (index) => {
      if (![0, 1].includes(index)) throw Error('Fixture company required');
      current = index;
      render();
    },
  };
  render();
})();
