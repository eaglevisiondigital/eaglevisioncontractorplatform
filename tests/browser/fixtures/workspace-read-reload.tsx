// Fictional local read-failure controls around the actual existing repositories.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Phase3Workspace } from '../../../src/components/phase3/Phase3Workspace';
import { Operations } from '../../../src/lib/operations';
import { Phase3Repository } from '../../../src/lib/phase3';
import { sampleCompanies } from '../../../src/domain/platform';
import '../../../src/styles.css';
declare global {
  interface Window {
    workspaceReadReload: {
      counts(): {
        access: number;
        modules: number;
        initialize: number;
        customerReads: number;
        writes: number;
      };
      deny(): void;
      disable(): void;
      hold(): void;
      waiting(): boolean;
      release(): void;
      company(index: number): void;
      initialized(): string[];
    };
  }
}
const scenario = new URL(window.location.href).searchParams.get('scenario');
const operations = new Operations(true);
let index = 0,
  accessCalls = 0,
  moduleCalls = 0,
  initializes = 0,
  customerReads = 0,
  writes = 0;
let failures = scenario === 'ready' || scenario === 'seed' ? 0 : 1;
let denied = false,
  disabled = false,
  holdNext = false,
  waiting = false;
let release = () => {};
const initialized: string[] = [];
const access = operations.companyAccess.bind(operations);
operations.companyAccess = async (...args) => {
  accessCalls++;
  if (failures > 0) {
    failures--;
    throw Error('Workspace access read temporarily unavailable.');
  }
  const value = await access(...args);
  if (holdNext) {
    holdNext = false;
    waiting = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    waiting = false;
  }
  return { ...value, estimates: denied ? false : value.estimates };
};
const modules = operations.listModules.bind(operations);
operations.listModules = async (...args) => {
  moduleCalls++;
  return (await modules(...args)).map((row) => ({
    ...row,
    enabled: row.module === 'estimates' && disabled ? false : row.enabled,
  }));
};
const customers = operations.listCustomers.bind(operations);
operations.listCustomers = async (...args) => {
  customerReads++;
  if (scenario === 'seed' && args[0] === sampleCompanies[0].id)
    throw Error('Synthetic sample source initialization unavailable.');
  return customers(...args);
};
const initialize = Phase3Repository.prototype.initialize;
Phase3Repository.prototype.initialize = async function (...args) {
  initializes++;
  try {
    return await Reflect.apply(initialize, this, args);
  } finally {
    initialized.push(args[0].id);
  }
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
  const original = Phase3Repository.prototype[name];
  Reflect.set(
    Phase3Repository.prototype,
    name,
    function (this: Phase3Repository, ...args: unknown[]) {
      writes++;
      return Reflect.apply(original, this, args);
    },
  );
}
const root = createRoot(document.getElementById('root')!);
function render() {
  root.render(
    <main>
      <h1>Fictional workspace read review · {sampleCompanies[index].name}</h1>
      <Phase3Workspace
        operations={operations}
        company={sampleCompanies[index]}
        section="Estimates"
      />
    </main>,
  );
}
window.workspaceReadReload = {
  counts: () => ({
    access: accessCalls,
    modules: moduleCalls,
    initialize: initializes,
    customerReads,
    writes,
  }),
  deny: () => {
    denied = true;
  },
  disable: () => {
    disabled = true;
  },
  hold: () => {
    holdNext = true;
  },
  waiting: () => waiting,
  release: () => release(),
  company: (selected) => {
    index = selected;
    flushSync(render);
  },
  initialized: () => [...initialized],
};
render();
