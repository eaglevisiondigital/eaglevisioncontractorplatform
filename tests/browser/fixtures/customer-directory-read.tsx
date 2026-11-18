// Fictional read controls; all repository reads delegate to the existing sample engine.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { CompanyOperations } from '../../../src/components/CompanyOperations';
import { Operations } from '../../../src/lib/operations';
import { sampleCompanies } from '../../../src/domain/platform';
import '../../../src/styles.css';

type Query = {
  organization: string;
  query: string;
  kind: string;
  page: number;
};
declare global {
  interface Window {
    customerDirectoryRead: {
      counts(): {
        reads: number;
        access: number;
        modules: number;
        writes: number;
      };
      queries(): Query[];
      failNext(): void;
      holdNext(): void;
      waiting(): boolean;
      release(): void;
      company(index: number): void;
      completed(): Query[];
    };
  }
}
const scenario = new URL(window.location.href).searchParams.get('scenario');
const repo = new Operations(true);
let reads = 0,
  accessCalls = 0,
  modules = 0,
  writes = 0,
  selected = 0;
let failures =
  scenario === 'ready' ||
  scenario === 'role' ||
  scenario === 'module' ||
  scenario === 'denied'
    ? 0
    : 1;
let held = false,
  waiting = false;
let release = () => {};
const queries: Query[] = [],
  completed: Query[] = [];
const access = repo.companyAccess.bind(repo);
repo.companyAccess = async (...args) => {
  accessCalls++;
  const value = await access(...args);
  return { ...value, crm: scenario === 'role' ? false : value.crm };
};
const listModules = repo.listModules.bind(repo);
repo.listModules = async (...args) => {
  modules++;
  return (await listModules(...args)).map((row) => ({
    ...row,
    enabled:
      scenario === 'module' && row.module === 'crm' ? false : row.enabled,
  }));
};
const customers = repo.listCustomers.bind(repo);
repo.listCustomers = async (organization, query = '', kind = '', page = 0) => {
  reads++;
  const entry = { organization, query, kind, page };
  queries.push(entry);
  const rows = await customers(organization, query, kind, page);
  if (scenario === 'denied')
    throw Error('Customer directory access unavailable.');
  if (failures > 0) {
    failures--;
    throw Error('Customer directory read temporarily unavailable.');
  }
  if (held) {
    held = false;
    waiting = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    waiting = false;
  }
  completed.push(entry);
  return rows;
};
for (const name of [
  'saveCustomer',
  'saveLocation',
  'recordConsent',
  'addNote',
] as const) {
  const original = repo[name];
  Reflect.set(repo, name, function (this: Operations, ...args: unknown[]) {
    writes++;
    return Reflect.apply(original, this, args);
  });
}
const root = createRoot(document.getElementById('root')!);
function render() {
  const company = sampleCompanies[selected];
  root.render(
    <main>
      <h1>Fictional customer-directory read review · {company.name}</h1>
      <CompanyOperations
        key={`${company.id}-Customers`}
        repo={repo}
        company={company}
        section="Customers"
        onSaved={() => {}}
        onCustomers={() => {}}
        onIntake={() => {}}
      />
    </main>,
  );
}
window.customerDirectoryRead = {
  counts: () => ({ reads, access: accessCalls, modules, writes }),
  queries: () => structuredClone(queries),
  failNext: () => {
    failures++;
  },
  holdNext: () => {
    held = true;
  },
  waiting: () => waiting,
  release: () => release(),
  company: (index) => {
    selected = index;
    flushSync(render);
  },
  completed: () => structuredClone(completed),
};
render();
