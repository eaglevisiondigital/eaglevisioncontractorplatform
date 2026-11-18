// Explicit synthetic browser fixture; no product route or connected client.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
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
    jobScopeFind: {
      hold: () => void;
      release: () => void;
      waiting: () => boolean;
      deny: () => void;
      disable: () => void;
      fail: () => void;
      select: (index: number) => void;
      denyPrevious: () => void;
      corrupt: (value: string) => void;
      counts: () => { reads: number; writes: number; authorityReads: number };
      unknown: () => void;
      held: () => boolean;
      replace: (kind: string) => void;
      selectSnapshot: (index: number) => {
        privateViewPresent: boolean;
        searchPresent: boolean;
      };
    };
  }
}
void (async () => {
  const fixtures = await Promise.all(
    sampleCompanies.slice(0, 2).map(async (c) => {
      const f = await prototypeFixture(c, false);
      const payload = structuredClone(f.bundle.version.payload);
      const base = payload.lines[0];
      const kinds = [
        'material',
        'product',
        'labor',
        'service',
        'allowance',
      ] as const;
      payload.lines = Array.from({ length: 18 }, (_, i) => ({
        ...structuredClone(base),
        id: crypto.randomUUID(),
        kind: kinds[i % kinds.length],
        description:
          i % 2 === 0
            ? `North [West] panel ${i + 1}`
            : `South assembly ${i + 1}`,
        quantity_milli: (i + 1) * 1000,
        option_id: null,
        internal_note: 'PRIVATE fictional source note',
      }));
      const draft = await f.repo.save(c.id, f.bundle, payload);
      const bundle = await f.repo.issue(c.id, draft);
      const jobId = await f.repo.approveJob(c.id, bundle);
      return {
        ...f,
        bundle,
        target: { ...f.target, version_id: bundle.version.id, job_id: jobId },
      };
    }),
  );
  let selected = 0;
  let replacement = '';
  let previous = 0;
  let denyPrevious = false;
  let reads = 0;
  let writes = 0;
  let authorityReads = 0;
  const state = {
    hold: false,
    waiting: false,
    release: () => {},
    denied: false,
    disabled: false,
    failed: false,
    corrupt: '',
  };
  for (const [index, f] of fixtures.entries()) {
    const access = f.ops.companyAccess.bind(f.ops);
    f.ops.companyAccess = async (...args) => {
      authorityReads++;
      return {
        ...(await access(...args)),
        estimates: !state.denied && !(denyPrevious && index === previous),
      };
    };
    const modules = f.ops.listModules.bind(f.ops);
    f.ops.listModules = async (...args) => {
      authorityReads++;
      return (await modules(...args)).map((m) => ({
        ...m,
        enabled: m.module === 'estimates' ? !state.disabled : m.enabled,
      }));
    };
    const jobs = f.repo.jobs.bind(f.repo);
    f.repo.jobs = async (...args) => {
      reads++;
      let rows = await jobs(...args);
      if (state.hold) {
        state.hold = false;
        state.waiting = true;
        await new Promise<void>((resolve) => {
          state.release = resolve;
        });
        state.waiting = false;
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
          repo={replacement === 'repo' ? Object.create(f.repo) : f.repo}
          operations={
            replacement === 'operations' ? Object.create(f.ops) : f.ops
          }
          org={f.company.id}
          job={job}
        />
      </main>,
    );
  };
  window.jobScopeFind = {
    replace: (kind) => {
      replacement = kind;
      render();
    },
    selectSnapshot: (index) => {
      selected = index;
      replacement = '';
      flushSync(() => render());
      return {
        privateViewPresent: !!document.querySelector(
          '[aria-label="Original job scope reference"]',
        ),
        searchPresent: !!document.querySelector(
          '[aria-label="Find original scope lines"]',
        ),
      };
    },
    hold: () => {
      state.hold = true;
    },
    release: () => state.release(),
    waiting: () => state.waiting,
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
    counts: () => ({ reads, writes, authorityReads }),
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
