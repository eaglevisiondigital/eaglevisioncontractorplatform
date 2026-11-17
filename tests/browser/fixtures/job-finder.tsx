// Explicit synthetic browser fixture; no product route or connected client.
import { createRoot } from 'react-dom/client';
import { JobFinder } from '../../../src/components/phase3/JobFinder';
import { prototypeFixture } from '../../program/prototype-fixture';
import { sampleCompanies } from '../../../src/domain/platform';
import type { Job } from '../../../src/domain/jobs/financials';
import '../../../src/styles.css';

declare global {
  interface Window {
    jobFinder: {
      deny: () => void;
      disable: () => void;
      corrupt: (value: string) => void;
      holdRead: () => void;
      holdAuthority: () => void;
      release: () => void;
      company: (index: number) => void;
      mutateLoaded: () => void;
      shrink: () => void;
      counts: () => { reads: number; selections: number; writes: number };
    };
  }
}
void (async () => {
  const fixtures = await Promise.all(
    sampleCompanies
      .slice(0, 2)
      .map((company) => prototypeFixture(company, true)),
  );
  const rows: Job[][] = await Promise.all(
    fixtures.map(async (fixture, brand) => {
      const base = (await fixture.repo.jobs(fixture.company.id))[0];
      return Array.from({ length: 12 }, (_, index) => ({
        ...structuredClone(base),
        id: `synthetic-job-${brand}-${String(index).padStart(2, '0')}`,
        name: index === 0 ? 'Case-sensitive [Scope] job' : `Job ${index}`,
      }));
    }),
  );
  let selectedCompany = 0,
    selectedJob = rows[0][0].id,
    reads = 0,
    selections = 0,
    writes = 0;
  const state = {
    denied: false,
    disabled: false,
    corrupt: '',
    holdRead: false,
    holdAuthority: false,
    release: () => {},
  };
  const wait = () =>
    new Promise<void>((resolve) => {
      state.release = resolve;
    });
  for (const [index, fixture] of fixtures.entries()) {
    const originalAccess = fixture.ops.companyAccess.bind(fixture.ops);
    fixture.ops.companyAccess = async (...args) => {
      if (state.holdAuthority && reads > 0) {
        state.holdAuthority = false;
        await wait();
      }
      return { ...(await originalAccess(...args)), estimates: !state.denied };
    };
    const modules = fixture.ops.listModules.bind(fixture.ops);
    fixture.ops.listModules = async (...args) =>
      (await modules(...args)).map((module) => ({
        ...module,
        enabled:
          module.module === 'estimates' ? !state.disabled : module.enabled,
      }));
    fixture.repo.jobs = async () => {
      reads++;
      if (state.holdRead) {
        state.holdRead = false;
        await wait();
      }
      if (state.corrupt === 'error') throw Error('PRIVATE_RAW_ERROR');
      const result = structuredClone(rows[index]);
      if (state.corrupt === 'foreign')
        result.push({ ...result[0], organization_id: 'foreign-company' });
      if (state.corrupt === 'duplicate')
        result.push(structuredClone(result[0]));
      if (state.corrupt === 'missing') result.splice(0, 1);
      if (state.corrupt === 'changed') result[0].lock_revision++;
      return result;
    };
    for (const name of [
      'projection',
      'submitExpense',
      'reviewExpense',
      'proposeChange',
      'approveChange',
    ] as const)
      Reflect.set(fixture.repo, name, () => {
        writes++;
        throw Error('No writer belongs in the finder');
      });
  }
  const root = createRoot(document.getElementById('root')!);
  const callbacks = fixtures.map((_, index) => (id: string) => {
    if (selectedCompany !== index) throw Error('Detached selection');
    selections++;
    selectedJob = id;
    render();
  });
  function render() {
    const fixture = fixtures[selectedCompany];
    root.render(
      <main>
        <h1>Synthetic loaded job finder</h1>
        <p data-testid="selected-job">{selectedJob}</p>
        <JobFinder
          repo={fixture.repo}
          operations={fixture.ops}
          org={fixture.company.id}
          jobs={rows[selectedCompany]}
          selectedJobId={selectedJob}
          onSelect={callbacks[selectedCompany]}
        />
      </main>,
    );
  }
  window.jobFinder = {
    deny: () => {
      state.denied = true;
    },
    disable: () => {
      state.disabled = true;
    },
    corrupt: (value) => {
      state.corrupt = value;
    },
    holdRead: () => {
      state.holdRead = true;
    },
    holdAuthority: () => {
      state.holdAuthority = true;
    },
    release: () => state.release(),
    company: (index) => {
      selectedCompany = index;
      selectedJob = rows[index][0].id;
      render();
    },
    mutateLoaded: () => {
      rows[selectedCompany][0].name = 'Changed during wait';
    },
    shrink: () => {
      rows[selectedCompany].splice(1);
      render();
    },
    counts: () => ({ reads, selections, writes }),
  };
  render();
})();
