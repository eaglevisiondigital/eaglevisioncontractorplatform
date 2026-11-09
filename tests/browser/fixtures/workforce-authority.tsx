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
      return revoked
        ? {
            ...data,
            payroll_admin: false,
            rates: [],
            periods: data.periods.map((p) => ({ ...p, snapshot: null })),
          }
        : data;
    };
    function Harness() {
      const [message, setMessage] = useState('');
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
          <Workforce repo={repo} org={company.id} />
        </main>
      );
    }
    createRoot(document.getElementById('root')!).render(<Harness />);
  })();
