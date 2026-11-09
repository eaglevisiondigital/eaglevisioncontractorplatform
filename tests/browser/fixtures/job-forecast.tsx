import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { holdForecast } from '../../../src/components/phase3/job-forecast-conflicts';
import { Jobs } from '../../../src/components/phase3/Jobs';
import { prototypeFixture } from '../../program/prototype-fixture';
import { sampleCompanies } from '../../../src/domain/platform';
import '../../../src/styles.css';
// Development-only, loopback fixture. Never imported by App or the production entry.
if (
  import.meta.env.DEV === true &&
  import.meta.env.VITE_CONTRACTOR_JOURNEY_PREVIEW === 'true' &&
  location.hostname === '127.0.0.1'
)
  void (async () => {
    const brand = Number(
      new URLSearchParams(location.search).get('brand') || 0,
    );
    const f = await prototypeFixture(sampleCompanies[brand], true);
    let writes = 0;
    let pauseNext = false;
    let releaseRead: (() => void) | undefined;
    const readJobs = f.repo.jobs.bind(f.repo);
    f.repo.jobs = async (...args) => {
      const rows = await readJobs(...args);
      if (pauseNext) {
        pauseNext = false;
        await new Promise<void>((resolve) => {
          releaseRead = resolve;
        });
      }
      return rows;
    };
    const original = f.repo.projection.bind(f.repo);
    let loseAck = false;
    f.repo.projection = async (...args) => {
      writes++;
      await original(...args);
      if (loseAck) throw Error('Synthetic lost ACK');
    };
    async function otherUpdate() {
      const job = f.repo.syntheticJob(f.company.id, f.target.job_id!)!;
      await original(f.company.id, job, {
        ...job.projection,
        remaining: {
          ...job.projection.remaining,
          materials: 222,
          equipment: 333,
        },
      });
    }
    function Harness() {
      const [show, setShow] = useState(true),
        [message, setMessage] = useState('');
      return (
        <main>
          <h1>Existing job forecast regression fixture</h1>
          <p>Disposable local fixture only; no operational acceptance.</p>
          <button
            onClick={() =>
              void otherUpdate().then(() => setMessage('Other actor saved'))
            }
          >
            Simulate independent forecast save
          </button>
          <button
            onClick={() => {
              loseAck = true;
              setMessage('Lost acknowledgment simulation armed');
            }}
          >
            Simulate lost forecast acknowledgment
          </button>
          <button
            onClick={() => {
              pauseNext = true;
              setMessage('Next read paused');
            }}
          >
            Pause next forecast read
          </button>
          <button
            onClick={() => {
              releaseRead?.();
              releaseRead = undefined;
            }}
          >
            Release forecast read
          </button>
          <button
            onClick={() => {
              holdForecast(f.repo, f.company.id, f.target.job_id!);
              setMessage('Synthetic peer UNKNOWN hold');
            }}
          >
            Simulate peer UNKNOWN
          </button>
          <button onClick={() => setShow((v) => !v)}>
            Toggle job workspace
          </button>
          <button onClick={() => setMessage(`Writer calls: ${writes}`)}>
            Read writer call count
          </button>
          <p role="status">{message}</p>
          {show && (
            <Jobs
              repo={f.repo}
              operations={f.ops}
              company={f.company}
              initialJobId={f.target.job_id!}
              canManage
              admin
            />
          )}
        </main>
      );
    }
    createRoot(document.getElementById('root')!).render(<Harness />);
  })();
