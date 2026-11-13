import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { Workforce } from '../../../src/components/phase3/Workforce';
import { Operations } from '../../../src/lib/operations';
import { Phase3Repository } from '../../../src/lib/phase3';
import { sampleCompanies } from '../../../src/domain/platform';
import '../../../src/styles.css';
// Development-only source/authorization fault injection. No real Auth or grants.
if (
  import.meta.env.DEV &&
  import.meta.env.VITE_CONTRACTOR_JOURNEY_PREVIEW === 'true' &&
  location.hostname === '127.0.0.1'
)
  void (async () => {
    const company =
        sampleCompanies[
          Number(new URLSearchParams(location.search).get('brand') || 0)
        ],
      ops = new Operations(true),
      repo = new Phase3Repository(ops);
    await repo.initialize(company);
    const read = repo.workforce.bind(repo);
    await repo.initialize(sampleCompanies[1]);
    const originalTime = (await read(company.id)).entries.find(
      (e) => e.submitted,
    )!;
    const rawRecordTime = repo.recordTime.bind(repo);
    let manualWrites = 0,
      loseTimeAck = false,
      pauseSource = false,
      sourcePaused = false;
    let releaseSource: (() => void) | undefined;
    repo.recordTime = async (...args) => {
      manualWrites++;
      const id = await rawRecordTime(...args);
      if (loseTimeAck) {
        loseTimeAck = false;
        throw Error('Fictional lost time acknowledgment');
      }
      return id;
    };
    let revoked = false;
    let rejectPaused = false;
    let pause = false,
      release: (() => void) | undefined;
    const payroll = repo.payroll.bind(repo);
    repo.payroll = async (...args) => {
      const result = await payroll(...args);
      if (pause) {
        pause = false;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        if (rejectPaused) throw Error('Synthetic delayed payroll rejection');
      }
      return result;
    };
    repo.workforce = async (...args) => {
      const data = await read(...args);
      if (pauseSource) {
        pauseSource = false;
        sourcePaused = true;
        await new Promise<void>((resolve) => {
          releaseSource = resolve;
        });
        sourcePaused = false;
      }
      return revoked
        ? {
            ...data,
            payroll_admin: false,
            rates: [],
            periods: data.periods.map((p) => ({ ...p, snapshot: null })),
          }
        : data;
    };
    const correct = repo.resolveClock.bind(repo);
    let correctionCalls = 0;
    repo.resolveClock = async (...args) => {
      correctionCalls++;
      return correct(...args);
    };
    function Harness() {
      const [message, setMessage] = useState('');
      const [org, setOrg] = useState(company.id);
      return (
        <main>
          <h1>Workforce authorization regression fixture</h1>
          <p>
            Fictional records only; no permission changes or hosted operations.
          </p>
          <button
            onClick={() => {
              revoked = true;
              setMessage('Fixture payroll authority revoked');
            }}
          >
            Revoke fixture payroll access
          </button>
          <p role="status">{message}</p>
          <button
            onClick={() => {
              pause = true;
            }}
          >
            Pause next payroll preview result
          </button>
          <button
            onClick={() => {
              release?.();
              release = undefined;
            }}
          >
            Release payroll preview result
          </button>
          <button
            onClick={() => {
              rejectPaused = true;
              release?.();
              release = undefined;
            }}
          >
            Reject paused payroll result
          </button>
          <button
            onClick={() =>
              void (async () => {
                const data = await read(company.id);
                await repo.recordTime(company.id, data.workers[0].id, {
                  job_id: null,
                  overhead_center: 'Administration',
                  task: 'Fixture original missed clock',
                  kind: 'work',
                  started_at: new Date(Date.now() - 60000).toISOString(),
                  ended_at: null,
                  corrects_id: null,
                  billable: false,
                });
                setMessage('Fixture original clock prepared');
              })()
            }
          >
            Prepare fixture missed clock
          </button>
          <button
            onClick={() =>
              void (async () => {
                const data = await read(company.id),
                  worker = data.workers[0];
                await correct(
                  company.id,
                  worker.id,
                  new Date(Date.now() - 40000).toISOString(),
                  'Fixture exact original clock closure',
                );
                await repo.recordTime(company.id, worker.id, {
                  job_id: null,
                  overhead_center: 'Administration',
                  task: 'Fixture replacement clock',
                  kind: 'work',
                  started_at: new Date(Date.now() - 30000).toISOString(),
                  ended_at: null,
                  corrects_id: null,
                  billable: false,
                });
                setMessage('Fixture clock replaced without refreshing review');
              })()
            }
          >
            Replace fixture open clock
          </button>
          <button
            onClick={() =>
              void (async () => {
                const data = await read(company.id);
                setMessage(
                  `Correction calls: ${correctionCalls}; open clocks: ${data.entries.filter((entry) => !entry.ended_at).length}`,
                );
              })()
            }
          >
            Inspect fixture correction evidence
          </button>
          <output data-testid="time-original-id">{originalTime.id}</output>
          <output data-testid="time-worker-id">{originalTime.worker_id}</output>
          <output data-testid="time-target">
            {originalTime.job_id ?? `overhead:${originalTime.overhead_center}`}
          </output>
          <output data-testid="time-start">{originalTime.started_at}</output>
          <button
            onClick={() => {
              pauseSource = true;
            }}
          >
            Pause next fixture workforce source read
          </button>
          <button
            onClick={() =>
              setMessage(
                sourcePaused
                  ? 'Fixture workforce source paused'
                  : 'Fixture workforce source running',
              )
            }
          >
            Inspect fixture source pause
          </button>
          <button
            onClick={() => {
              releaseSource?.();
              releaseSource = undefined;
            }}
          >
            Release fixture workforce source read
          </button>
          <button
            onClick={() => {
              loseTimeAck = true;
            }}
          >
            Lose next fixture manual-time acknowledgment
          </button>
          <button
            onClick={() => setMessage(`Manual time writes: ${manualWrites}`)}
          >
            Inspect fixture manual-time writes
          </button>
          <button onClick={() => setOrg(sampleCompanies[1].id)}>
            Switch fixture company
          </button>
          <Workforce repo={repo} org={org} />
        </main>
      );
    }
    createRoot(document.getElementById('root')!).render(<Harness />);
  })();
