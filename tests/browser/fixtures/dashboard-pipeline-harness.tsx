// Disposable browser fixture; no App route, persistence or connected client.
import { createRoot } from 'react-dom/client';
import { NewLeadDashboard } from '../../../src/components/CompanyOperations';
import { Operations } from '../../../src/lib/operations';
import { sampleCompanies } from '../../../src/domain/platform';
import '../../../src/styles.css';

declare global {
  interface Window {
    dashboardPipeline: {
      select: (org: string) => void;
      replace: () => Promise<void>;
      hold: () => void;
      release: () => void;
      deny: () => void;
      disable: () => void;
      fail: () => void;
      empty: () => void;
      calls: () => { org: string; status: string; page: number }[];
      opened: () => number;
      corrupt: (
        mode: 'none' | 'tenant' | 'stage' | 'duplicate' | 'count',
      ) => void;
      writes: () => number;
    };
  }
}
void (async () => {
  const root = createRoot(document.getElementById('root')!);
  let org = sampleCompanies[0].id;
  let generation = 0;
  let opened = 0;
  let writes = 0;
  let invalid: 'none' | 'tenant' | 'stage' | 'duplicate' | 'count' = 'none';
  const calls: { org: string; status: string; page: number }[] = [];
  const state = {
    denied: false,
    disabled: false,
    failed: false,
    empty: false,
    hold: false,
    release: () => {},
  };
  async function repository() {
    const repo = new Operations(true);
    const model = ++generation;
    for (const company of sampleCompanies) {
      for (let index = 0; index < 24; index++)
        await repo.sampleSubmit(company.slug, {
          name: 'Synthetic dashboard fixture',
          email: 'dashboard@example.test',
          phone: '555-0100',
          address: '1 Example Lane',
          city: 'Example',
          region: 'IL',
          postal_code: '00000',
          country_code: 'US',
          property_type: 'residential',
          service_category: `Fixture request ${index}`,
          description: `${company.id} model ${model} lead ${index}`,
          preferred_appointment: '',
          contact_preference: 'email',
          email_consent: true,
          sms_consent: false,
          consent_version: 'contact-v1',
        });
      const last = (await repo.listIntake(company.id, 'new', 1)).rows.at(-1)!;
      await repo.assignIntake(company.id, last.id, null, 'closed');
      const own = (await repo.listIntake(company.id, 'new', 0)).rows;
      await repo.assignIntake(company.id, own[0].id, null, 'reviewing');
      await repo.assignIntake(company.id, own[1].id, null, 'qualified');
    }
    const assign = repo.assignIntake.bind(repo);
    repo.assignIntake = async (...args) => {
      writes++;
      return assign(...args);
    };
    const access = repo.companyAccess.bind(repo);
    repo.companyAccess = async (company) => ({
      ...(await access(company)),
      intake_read: !state.denied,
    });
    const modules = repo.listModules.bind(repo);
    repo.listModules = async (company) =>
      (await modules(company)).map((module) => ({
        ...module,
        enabled: module.module === 'intake' ? !state.disabled : module.enabled,
      }));
    const intake = repo.listIntake.bind(repo);
    repo.listIntake = async (company, status = '', page = 0) => {
      calls.push({ org: company, status, page });
      const result = await intake(company, status, page);
      if (state.hold) {
        state.hold = false;
        await new Promise<void>((resolve) => {
          state.release = resolve;
        });
      }
      if (state.failed) throw Error('Synthetic dashboard reader unavailable');
      if (state.empty) return { rows: [], count: 0 };
      if (invalid === 'tenant' && result.rows.length)
        return {
          ...result,
          rows: [
            { ...result.rows[0], organization_id: 'foreign-fixture-company' },
          ],
        };
      if (invalid === 'stage' && result.rows.length)
        return {
          ...result,
          rows: [
            { ...result.rows[0], status: status === 'new' ? 'closed' : 'new' },
          ],
        };
      if (invalid === 'duplicate' && result.rows.length)
        return { ...result, rows: [result.rows[0], result.rows[0]] };
      if (invalid === 'count') return { ...result, count: Number.NaN };
      return result;
    };
    return repo;
  }
  let repo = await repository();
  function render() {
    root.render(
      <main>
        <h1>Readonly dashboard fixture</h1>
        <NewLeadDashboard
          repo={repo}
          org={org}
          onOpen={() => {
            opened++;
          }}
        />
      </main>,
    );
  }
  window.dashboardPipeline = {
    corrupt: (mode) => {
      invalid = mode;
    },
    writes: () => writes,
    select: (company) => {
      org = company;
      render();
    },
    replace: async () => {
      repo = await repository();
      render();
    },
    hold: () => {
      state.hold = true;
    },
    release: () => {
      state.release();
    },
    deny: () => {
      state.denied = true;
    },
    disable: () => {
      state.disabled = true;
    },
    fail: () => {
      state.failed = true;
    },
    empty: () => {
      state.empty = true;
    },
    calls: () => calls,
    opened: () => opened,
  };
  render();
})();
