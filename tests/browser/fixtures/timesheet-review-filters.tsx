// Explicit fictional authorized projections; no connected client or business writer.
import { createRoot } from 'react-dom/client';
import { Workforce } from '../../../src/components/phase3/Workforce';
import { prototypeFixture } from '../../program/prototype-fixture';
import { sampleCompanies } from '../../../src/domain/platform';
import type { WorkforceData } from '../../../src/lib/phase3';
import '../../../src/styles.css';

declare global {
  interface Window {
    timesheetFilters: {
      counts: () => { reads: number; writes: number; waiting: boolean };
      jobs: () => string[];
      mode: (value: string) => void;
      hold: () => void;
      release: () => void;
      select: (index: number) => void;
      replaceRepo: () => void;
    };
  }
}
void (async () => {
  const fixtures = await Promise.all(
    sampleCompanies.slice(0, 2).map((c) => prototypeFixture(c, true)),
  );
  const sources: WorkforceData[] = await Promise.all(
    fixtures.map((f) => f.repo.workforce(f.company.id)),
  );
  for (const [index, source] of sources.entries()) {
    const [a, b] = source.workers;
    const [first, second] = source.jobs;
    const entry = (
      id: string,
      worker: string,
      job: string | null,
      submitted: boolean,
      day = '2026-11-01',
    ) => ({
      id: `${index}-${id}`,
      worker_id: worker,
      job_id: job,
      overhead_center: job ? null : 'Administration',
      task: id,
      kind: 'work' as const,
      started_at: `${day}T08:00:00-06:00`,
      ended_at: `${day}T09:00:00-06:00`,
      submitted,
      billable: !!job,
      corrects_id: null,
    });
    source.entries = [
      entry('Draft fence', a.id, first.id, false),
      entry('Submitted fence', b.id, first.id, true),
      entry('Approved prototype', b.id, second.id, true),
      entry('Rejected office', a.id, null, true),
      entry('Locked prototype', b.id, second.id, true, '2026-10-15'),
      entry('Unmapped old job', a.id, 'unavailable-job', true),
      { ...entry('Open fence', b.id, first.id, false), ended_at: null },
    ];
    source.reviews = [
      {
        entry_id: `${index}-Approved prototype`,
        decision: 'approved',
        reason: 'Synthetic fixture',
      },
      {
        entry_id: `${index}-Rejected office`,
        decision: 'rejected',
        reason: 'Synthetic fixture',
      },
      {
        entry_id: `${index}-Locked prototype`,
        decision: 'approved',
        reason: 'Synthetic fixture',
      },
    ];
    source.periods = [
      {
        id: `${index}-period`,
        starts_at: '2026-10-01T00:00:00Z',
        ends_at: '2026-11-01T00:00:00Z',
        status: 'locked',
        snapshot: null,
      },
    ];
    source.rates[0].classification_review_reference =
      'PRIVATE rate review must stay hidden from timesheets';
  }
  let selected = 0,
    reads = 0,
    writes = 0,
    mode = '',
    hold = false,
    waiting = false,
    release = () => {},
    replace = false;
  for (const [index, f] of fixtures.entries()) {
    f.repo.workforce = async () => {
      reads++;
      const value = structuredClone(sources[index]);
      if (mode === 'limited') {
        const worker = value.workers[1];
        value.workers = [worker];
        value.entries = value.entries.filter((e) => e.worker_id === worker.id);
        value.rates = [];
        value.payroll_admin = false;
        value.review_worker_ids = [];
      }
      if (mode === 'empty') value.entries = [];
      if (hold) {
        hold = false;
        waiting = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        waiting = false;
      }
      if (mode === 'error') throw Error('Timesheet source unavailable');
      return value;
    };
    for (const name of [
      'recordTime',
      'clock',
      'submitTime',
      'reviewTime',
      'resolveClock',
      'payroll',
      'adjustPayroll',
      'saveWorker',
      'configureWorkforce',
      'assignSupervisor',
    ])
      Reflect.set(f.repo, name, () => {
        writes++;
        throw Error('Unexpected command in read-only filter test');
      });
  }
  const root = createRoot(document.getElementById('root')!);
  const render = () => {
    const f = fixtures[selected];
    root.render(
      <main>
        <h1>Fictional timesheet review fixture</h1>
        <Workforce
          repo={replace ? Object.create(f.repo) : f.repo}
          org={f.company.id}
        />
      </main>,
    );
  };
  window.timesheetFilters = {
    counts: () => ({ reads, writes, waiting }),
    jobs: () => sources[selected].jobs.map((j) => j.id),
    mode: (value) => {
      mode = value;
    },
    hold: () => {
      hold = true;
    },
    release: () => release(),
    select: (index) => {
      selected = index;
      replace = false;
      render();
    },
    replaceRepo: () => {
      replace = true;
      render();
    },
  };
  render();
})();
