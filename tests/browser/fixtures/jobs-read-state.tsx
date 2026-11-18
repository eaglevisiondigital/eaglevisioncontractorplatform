// Fictional read controls around the existing workspace and repositories.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Phase3Workspace } from '../../../src/components/phase3/Phase3Workspace';
import { Operations } from '../../../src/lib/operations';
import { phase3Repository } from '../../../src/lib/phase3';
import { sampleCompanies } from '../../../src/domain/platform';
import '../../../src/styles.css';

declare global {
  interface Window {
    jobsReadState: {
      counts(): { reads: number; initialization: number; writes: number };
      failNext(): void;
      holdNext(): void;
      waiting(): boolean;
      release(): void;
      company(index: number): void;
      completed(): string[];
      loaded(): { organization: string; names: string[]; ids: string[] }[];
    };
  }
}
const scenario = new URL(window.location.href).searchParams.get('scenario');
const operations = new Operations(true);
const repo = phase3Repository(operations);
let reads = 0,
  initialization = 0,
  writes = 0,
  selected = 0;
let failures = scenario === 'error' ? 1 : 0;
let held = scenario === 'loading',
  waiting = false;
let release = () => {};
const completed: string[] = [];
const loaded: { organization: string; names: string[]; ids: string[] }[] = [];
const access = operations.companyAccess.bind(operations);
operations.companyAccess = async (...args) => ({
  ...(await access(...args)),
  // A fictional estimator without the separate sample-property admin panel.
  settings: false,
});
const initialize = repo.initialize;
repo.initialize = function (...args) {
  initialization++;
  return Reflect.apply(initialize, this, args);
};
for (const name of [
  'create',
  'save',
  'issue',
  'revise',
  'approveJob',
  'duplicate',
  'archive',
] as const) {
  const original = repo[name];
  Reflect.set(repo, name, function (this: typeof repo, ...args: unknown[]) {
    writes++;
    return Reflect.apply(original, this, args);
  });
}
const jobs = repo.jobs;
repo.jobs = async function (...args) {
  reads++;
  const rows = await Reflect.apply(jobs, this, args);
  loaded.push({
    organization: args[0],
    names: rows.map((row) => row.name),
    ids: rows.map((row) => row.id),
  });
  if (failures > 0) {
    failures--;
    throw Error('Job records temporarily unavailable.');
  }
  if (held) {
    held = false;
    waiting = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    waiting = false;
  }
  completed.push(args[0]);
  return scenario === 'empty' ? [] : rows;
};
const root = createRoot(document.getElementById('root')!);
function render() {
  const company = sampleCompanies[selected];
  root.render(
    <main>
      <h1>Fictional job read review · {company.name}</h1>
      <Phase3Workspace
        key={`${company.id}-Jobs`}
        operations={operations}
        company={company}
        section="Jobs"
      />
    </main>,
  );
}
window.jobsReadState = {
  counts: () => ({ reads, initialization, writes }),
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
  completed: () => [...completed],
  loaded: () => structuredClone(loaded),
};
render();
