import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { Operations } from '../../../src/lib/operations';
import { sampleCompanies } from '../../../src/domain/platform';
import { ContactConsentEditor } from '../../../src/components/crm/ContactConsentEditor';
import '../../../src/styles.css';
if (
  import.meta.env.DEV &&
  import.meta.env.VITE_CONTRACTOR_JOURNEY_PREVIEW === 'true' &&
  location.hostname === '127.0.0.1'
)
  void (async () => {
    const repo = new Operations(true),
      org = sampleCompanies[0].id,
      customer = (await repo.listCustomers(org)).rows[0];
    await repo.recordConsent(org, customer.id, true, false);
    const raw = repo.recordConsent.bind(repo);
    let writes = 0,
      lose = false,
      revoked = false;
    repo.recordConsent = async (...args) => {
      writes++;
      const result = await raw(...args);
      if (lose) {
        lose = false;
        throw Error('Fictional lost ACK');
      }
      return result;
    };
    const access = repo.companyAccess.bind(repo);
    repo.companyAccess = async (...args) => ({
      ...(await access(...args)),
      crm: !revoked,
    });
    const initial = await repo.customerHistory(org, customer.id);
    function Fixture() {
      const [history, setHistory] = useState(initial),
        [ready, setReady] = useState(true),
        [mounted, setMounted] = useState(true),
        [count, setCount] = useState(0);
      function refresh() {
        setReady(false);
        void repo.customerHistory(org, customer.id).then((h) => {
          setHistory(h);
          setReady(true);
          setCount(writes);
        });
      }
      return (
        <main>
          <h1>Fictional consent source control</h1>
          <p>Same-tab test only. No communications.</p>
          <button
            onClick={() => {
              void raw(org, customer.id, false, false);
            }}
          >
            Append fictional email opt-out
          </button>
          <button
            onClick={() => {
              revoked = true;
            }}
          >
            Revoke fictional CRM access
          </button>
          <button
            onClick={() => {
              lose = true;
            }}
          >
            Lose next fixture acknowledgment
          </button>
          <button
            onClick={() => {
              setMounted(!mounted);
              refresh();
            }}
          >
            Close or reopen editor
          </button>
          <button onClick={() => setCount(writes)}>Inspect writer count</button>
          <output aria-label="Writer count">{count}</output>
          {mounted && (
            <ContactConsentEditor
              repo={repo}
              org={org}
              customer={customer}
              history={history}
              ready={ready}
              onRefresh={refresh}
            />
          )}
        </main>
      );
    }
    createRoot(document.getElementById('root')!).render(<Fixture />);
  })();
