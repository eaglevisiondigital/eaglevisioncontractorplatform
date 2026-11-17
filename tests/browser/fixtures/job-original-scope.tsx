// Explicit synthetic browser fixture; no product route or connected client.
import { createRoot } from 'react-dom/client';
import { JobOriginalScope } from '../../../src/components/phase3/JobOriginalScope';
import { prototypeFixture } from '../../program/prototype-fixture';
import { sampleCompanies } from '../../../src/domain/platform';
import {
  forecastHeld,
  holdForecast,
} from '../../../src/components/phase3/job-forecast-conflicts';
import '../../../src/styles.css';

declare global {
  interface Window {
    jobOriginalScope: {
      hold: () => void;
      release: () => void;
      deny: () => void;
      disable: () => void;
      fail: () => void;
      select: (index: number) => void;
      denyPrevious: () => void;
      corrupt: (value: string) => void;
      counts: () => { reads: number; writes: number };
      unknown: () => void;
      held: () => boolean;
    };
  }
}
void (async () => {
  const fixtures = await Promise.all(
    sampleCompanies.map((c) => prototypeFixture(c, true)),
  );
  let selected = 0;
  let previous = 0;
  let denyPrevious = false;
  let reads = 0;
  let writes = 0;
  const state = {
    hold: false,
    release: () => {},
    denied: false,
    disabled: false,
    failed: false,
    corrupt: '',
  };
  for (const [index, f] of fixtures.entries()) {
    const access = f.ops.companyAccess.bind(f.ops);
    f.ops.companyAccess = async (...args) => ({
      ...(await access(...args)),
      estimates: !state.denied && !(denyPrevious && index === previous),
    });
    const modules = f.ops.listModules.bind(f.ops);
    f.ops.listModules = async (...args) =>
      (await modules(...args)).map((m) => ({
        ...m,
        enabled: m.module === 'estimates' ? !state.disabled : m.enabled,
      }));
    const jobs = f.repo.jobs.bind(f.repo);
    f.repo.jobs = async (...args) => {
      reads++;
      let rows = await jobs(...args);
      if (state.hold) {
        state.hold = false;
        await new Promise<void>((resolve) => {
          state.release = resolve;
        });
      }
      if (state.failed)
        throw Error('Synthetic private error must not be displayed');
      const target = rows.find((row) => row.id === f.target.job_id)!;
      if (state.corrupt === 'tenant')
        rows = [
          ...rows,
          { ...target, id: 'foreign-job', organization_id: 'foreign-company' },
        ];
      if (state.corrupt === 'duplicate')
        rows = [...rows, structuredClone(target)];
      if (state.corrupt === 'baseline')
        target.baseline.issued_version_id = 'substituted-version';
      if (state.corrupt === 'quantity')
        target.baseline.lines[0].quantity_milli = Number.NaN;
      return rows;
    };
    for (const name of [
      'projection',
      'submitExpense',
      'reviewExpense',
      'proposeChange',
      'approveChange',
    ] as const) {
      const original = f.repo[name].bind(f.repo);
      Reflect.set(f.repo, name, (...args: unknown[]) => {
        writes++;
        return Reflect.apply(original, undefined, args);
      });
    }
  }
  const jobs = await Promise.all(
    fixtures.map((f) => f.repo.jobs(f.company.id)),
  );
  reads = 0;
  const root = createRoot(document.getElementById('root')!);
  const render = () => {
    const f = fixtures[selected];
    const job = jobs[selected].find((j) => j.id === f.target.job_id)!;
    root.render(
      <main>
        <h1>Synthetic original scope fixture</h1>
        <JobOriginalScope
          repo={f.repo}
          operations={f.ops}
          org={f.company.id}
          job={job}
        />
      </main>,
    );
  };
  window.jobOriginalScope = {
    hold: () => {
      state.hold = true;
    },
    release: () => state.release(),
    deny: () => {
      state.denied = true;
    },
    disable: () => {
      state.disabled = true;
    },
    fail: () => {
      state.failed = true;
    },
    corrupt: (value) => {
      state.corrupt = value;
    },
    select: (index) => {
      previous = selected;
      selected = index;
      render();
    },
    denyPrevious: () => {
      denyPrevious = true;
    },
    counts: () => ({ reads, writes }),
    unknown: () => {
      const f = fixtures[selected];
      holdForecast(f.repo, f.company.id, f.target.job_id!);
    },
    held: () => {
      const f = fixtures[selected];
      return forecastHeld(f.repo, f.company.id, f.target.job_id!);
    },
  };
  render();
})();
