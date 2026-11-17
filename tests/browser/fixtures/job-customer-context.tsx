// Disposable synthetic browser fixture only; no product route or connected client.
import { createRoot } from 'react-dom/client';
import { JobCustomerContext } from '../../../src/components/phase3/JobCustomerContext';
import { prototypeFixture } from '../../program/prototype-fixture';
import { sampleCompanies } from '../../../src/domain/platform';
import {
  forecastHeld,
  holdForecast,
} from '../../../src/components/phase3/job-forecast-conflicts';
import type { Customer } from '../../../src/lib/operations';
import type { EstimateBundle } from '../../../src/domain/estimating/types';
import '../../../src/styles.css';

declare global {
  interface Window {
    jobCustomerContext: {
      hold: (phase: string) => void;
      release: () => void;
      deny: (kind: string) => void;
      corrupt: (kind: string) => void;
      select: (index: number) => void;
      replace: (kind: string) => void;
      mutate: (kind: string) => void;
      counts: () => {
        jobs: number;
        sources: string[];
        writes: number;
        held: boolean;
        waiting: string;
      };
      versions: () => { original: string; current: string };
      unknown: () => void;
    };
  }
}
void (async () => {
  const fixtures = await Promise.all(
    sampleCompanies.slice(0, 2).map((c) => prototypeFixture(c, true)),
  );
  // A later private draft must not replace the original issued CRM identity.
  const revisions = await Promise.all(
    fixtures.map((f) => f.repo.revise(f.company.id, f.bundle)),
  );
  const jobs = await Promise.all(
    fixtures.map((f) => f.repo.jobs(f.company.id)),
  );
  let selected = 0,
    reads = 0,
    writes = 0;
  const sources: string[] = [];
  let corrupt = '',
    denial = '',
    hold = '',
    release = () => {},
    postRead = false,
    waiting = '';
  let lastCustomers: Customer[] = [];
  let lastSource: EstimateBundle | undefined;
  let replacement: 'repo' | 'operations' | '' = '';
  async function wait(phase: string) {
    if (hold !== phase) return;
    hold = '';
    waiting = phase;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    waiting = '';
  }
  for (const [index, f] of fixtures.entries()) {
    const access = f.ops.companyAccess.bind(f.ops);
    f.ops.companyAccess = async (...args) => {
      if (postRead) await wait('authority');
      return {
        ...(await access(...args)),
        crm: denial !== 'crm' && !(denial === 'previous' && index !== selected),
        estimates: denial !== 'estimates',
      };
    };
    const modules = f.ops.listModules.bind(f.ops);
    f.ops.listModules = async (...args) =>
      (await modules(...args)).map((m) => ({
        ...m,
        enabled: denial === m.module + '-module' ? false : m.enabled,
        organization_id:
          corrupt === 'module-tenant' ? 'foreign-company' : m.organization_id,
      }));
    const list = f.repo.jobs.bind(f.repo);
    f.repo.jobs = async (...args) => {
      reads++;
      const rows = await list(...args);
      await wait('jobs');
      if (corrupt === 'persisted-job-missing')
        return rows.filter((j) => j.id !== f.target.job_id);
      if (corrupt === 'persisted-job-baseline')
        rows.find((j) => j.id === f.target.job_id)!.baseline.issued_version_id =
          'persisted-replacement';
      if (corrupt === 'private-error')
        throw Error('PRIVATE synthetic diagnostic must not appear');
      if (corrupt === 'job-tenant')
        rows.push({
          ...rows[0],
          id: 'foreign-job',
          organization_id: 'foreign-company',
        });
      if (corrupt === 'job-duplicate') rows.push(structuredClone(rows[0]));
      if (corrupt === 'baseline')
        rows.find((j) => j.id === f.target.job_id)!.baseline.issued_version_id =
          'replacement';
      return rows;
    };
    const source = f.repo.sourceEstimate.bind(f.repo);
    f.repo.sourceEstimate = async (...args) => {
      sources.push(args[1]);
      lastCustomers = [];
      const value = await source(...args);
      if (corrupt === 'source-tenant')
        value.version.organization_id = 'foreign-company';
      if (corrupt === 'source-status') value.version.status = 'draft';
      if (corrupt === 'source-version')
        value.version.id = 'latest-substitution';
      if (corrupt === 'source-customer')
        value.estimate.customer_id = 'different-customer';
      if (corrupt === 'source-baseline')
        value.version.payload.lines[0].description += ' changed';
      if (corrupt === 'no-property') value.version.payload.location_id = null;
      lastSource = value;
      return value;
    };
    const customer = f.ops.getCustomer.bind(f.ops);
    f.ops.getCustomer = async (...args) => {
      const value = await customer(...args);
      if (corrupt === 'customer-tenant')
        value.organization_id = 'foreign-company';
      if (corrupt === 'customer-id') value.id = 'different-customer';
      if (corrupt === 'customer-name') value.display_name = '';
      lastCustomers.push(value);
      await wait('customer');
      postRead = true;
      return value;
    };
    const location = f.ops.getLocation.bind(f.ops);
    f.ops.getLocation = async (...args) => {
      const value = await location(...args);
      if (corrupt === 'property-tenant')
        value.organization_id = 'foreign-company';
      if (corrupt === 'property-customer')
        value.customer_id = 'different-customer';
      if (corrupt === 'property-id') value.id = 'different-property';
      return value;
    };
    for (const name of [
      'projection',
      'submitExpense',
      'reviewExpense',
      'proposeChange',
      'approveChange',
    ] as const)
      Reflect.set(f.repo, name, () => {
        writes++;
        throw Error('Unexpected command');
      });
    for (const name of [
      'saveCustomer',
      'saveLocation',
      'addNote',
      'recordConsent',
    ] as const)
      Reflect.set(f.ops, name, () => {
        writes++;
        throw Error('Unexpected command');
      });
  }
  const root = createRoot(document.getElementById('root')!);
  const render = () => {
    const f = fixtures[selected];
    root.render(
      <main>
        <h1>Synthetic job contact fixture</h1>
        <JobCustomerContext
          repo={replacement === 'repo' ? Object.create(f.repo) : f.repo}
          operations={
            replacement === 'operations' ? Object.create(f.ops) : f.ops
          }
          org={f.company.id}
          job={jobs[selected].find((j) => j.id === f.target.job_id)!}
        />
      </main>,
    );
  };
  window.jobCustomerContext = {
    versions: () => ({
      original: fixtures[selected].target.version_id,
      current: revisions[selected].version.id,
    }),
    hold: (phase) => {
      hold = phase;
    },
    release: () => release(),
    deny: (kind) => {
      denial = kind;
    },
    corrupt: (kind) => {
      corrupt = kind;
    },
    select: (index) => {
      selected = index;
      replacement = '';
      render();
    },
    replace: (kind) => {
      replacement = kind as typeof replacement;
      render();
    },
    mutate: (kind) => {
      if (kind === 'customer')
        for (const value of lastCustomers)
          value.email = 'late-mutation@example.invalid';
      if (kind === 'source')
        lastSource!.version.payload.customer_id = 'late-substitution';
      if (kind === 'job')
        jobs[selected].find(
          (j) => j.id === fixtures[selected].target.job_id,
        )!.baseline.issued_version_id = 'late-baseline';
    },
    counts: () => ({
      jobs: reads,
      sources,
      writes,
      waiting,
      held: forecastHeld(
        fixtures[selected].repo,
        fixtures[selected].company.id,
        fixtures[selected].target.job_id!,
      ),
    }),
    unknown: () =>
      holdForecast(
        fixtures[selected].repo,
        fixtures[selected].company.id,
        fixtures[selected].target.job_id!,
      ),
  };
  render();
})();
