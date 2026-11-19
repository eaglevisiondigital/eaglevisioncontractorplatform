// Fictional existing-engine scenarios only; URL choices grant no product authority.
import { createRoot } from 'react-dom/client';
import { Estimates } from '../../../src/components/phase3/Estimates';
import { prototypeFixture } from '../../program/prototype-fixture';
import '../../../src/styles.css';
declare global {
  interface Window {
    estimateEditorReview: {
      snapshot: () => Promise<{
        target: {
          id: string;
          version: string;
          number: string;
          customer: string;
        };
        saved: { name: string; lock: number; status: string };
        jobs: { id: string; version: string; org: string }[];
        saveCalls: number;
        jobCalls: number;
        otherWrites: number;
        waiting: string | null;
      }>;
      release: (reject?: boolean) => void;
    };
  }
}
void (async () => {
  const params = new URL(location.href).searchParams;
  const issued = params.get('mode') === 'issued';
  const f = await prototypeFixture();
  if (issued) f.bundle = await f.repo.issue(f.company.id, f.bundle);
  const target = {
    id: f.bundle.estimate.id,
    version: f.bundle.version.id,
    number: f.bundle.estimate.estimate_number,
    customer: f.bundle.estimate.customer_id,
  };
  const save = f.repo.save.bind(f.repo),
    approve = f.repo.approveJob.bind(f.repo),
    get = f.repo.get.bind(f.repo),
    jobs = f.repo.jobs.bind(f.repo);
  let saveCalls = 0,
    jobCalls = 0,
    otherWrites = 0;
  let pending: { kind: string; resolve: (reject: boolean) => void } | undefined;
  const wait = async (kind: string) => {
    if (pending) throw Error('One pending fixture action only');
    const reject = await new Promise<boolean>((resolve) => {
      pending = { kind, resolve };
    });
    pending = undefined;
    if (reject) throw Error('Fixture update declined');
  };
  // Trap the editor's other public writer entry points; preserve private engine calls.
  for (const name of [
    'create',
    'issue',
    'saveTemplate',
    'revise',
    'duplicate',
    'archive',
  ] as const)
    Reflect.set(f.repo, name, () => {
      otherWrites++;
      throw Error('No other fixture writer authorized');
    });
  for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(f.ops))) {
    const descriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(f.ops),
      name,
    );
    if (
      /^(save|create|update|delete|remove|assign|revoke|accept|submit|record|set)/.test(
        name,
      ) &&
      typeof descriptor?.value === 'function'
    )
      Reflect.set(f.ops, name, () => {
        otherWrites++;
        throw Error('No operations writer authorized after seed');
      });
  }
  f.repo.save = async (...args) => {
    if (
      issued ||
      args[0] !== f.company.id ||
      args[1].estimate.id !== target.id ||
      args[1].version.id !== target.version ||
      args[2].customer_id !== target.customer
    )
      throw Error('Exact fictional draft/customer required');
    if (++saveCalls !== 1) throw Error('One explicit fixture save only');
    await wait('save');
    return save(...args);
  };
  f.repo.approveJob = async (...args) => {
    if (
      !issued ||
      args[0] !== f.company.id ||
      args[1].version.id !== target.version
    )
      throw Error('Exact fictional issued version required');
    if (++jobCalls !== 1) throw Error('One explicit fixture baseline only');
    await wait('job');
    return approve(...args);
  };
  window.estimateEditorReview = {
    snapshot: async () => {
      const bundle = await get(f.company.id, target.id, target.version);
      return {
        target: { ...target },
        saved: {
          name: bundle.version.payload.project.name,
          lock: bundle.version.lock_revision,
          status: bundle.version.status,
        },
        jobs: (await jobs(f.company.id)).map((job) => ({
          id: job.id,
          version: job.baseline.issued_version_id,
          org: job.organization_id,
        })),
        saveCalls,
        jobCalls,
        otherWrites,
        waiting: pending?.kind ?? null,
      };
    },
    release: (reject = false) => pending?.resolve(reject),
  };
  createRoot(document.getElementById('root')!).render(
    <main>
      <h1>Fictional estimate editor review</h1>
      <Estimates
        repo={f.repo}
        company={f.company}
        canIssue={params.get('canIssue') === 'yes'}
      />
    </main>,
  );
})();
