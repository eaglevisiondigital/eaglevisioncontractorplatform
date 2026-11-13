import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { Operations } from '../../../src/lib/operations';
import { sampleCompanies } from '../../../src/domain/platform';
import { LocationEditor } from '../../../src/components/crm/LocationEditor';
import '../../../src/styles.css';
if (
  import.meta.env.DEV &&
  import.meta.env.VITE_CONTRACTOR_JOURNEY_PREVIEW === 'true' &&
  location.hostname === '127.0.0.1'
)
  void (async () => {
    const repo = new Operations(true),
      org = sampleCompanies[0].id,
      customer = (await repo.listCustomers(org)).rows[0],
      draft = {
        address_line1: '10 Original',
        address_line2: 'Suite Fictional',
        city: 'Fictional City',
        region: 'IL',
        postal_code: '00000',
        country_code: 'US',
      };
    await repo.saveLocation(org, customer.id, draft);
    const initial = (await repo.listLocations(org, customer.id)).find(
        (l) => l.address_line1 === '10 Original',
      )!,
      raw = repo.saveLocation.bind(repo),
      read = repo.listLocations.bind(repo),
      access = repo.companyAccess.bind(repo);
    let count = 0,
      lose = false,
      revoked = false,
      pause = false,
      paused = false,
      release: (() => void) | undefined;
    repo.saveLocation = async (...args) => {
      count++;
      await raw(...args);
      if (lose) {
        lose = false;
        throw Error('Fictional lost ACK');
      }
    };
    repo.listLocations = async (...args) => {
      const result = await read(...args);
      if (pause) {
        pause = false;
        paused = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return result;
    };
    repo.companyAccess = async (...args) => ({
      ...(await access(...args)),
      crm: !revoked,
    });
    function Fixture() {
      const [source, setSource] = useState(initial),
        [mounted, setMounted] = useState(true),
        [n, setN] = useState(0),
        [saved, setSaved] = useState(''),
        [instance, setInstance] = useState(0),
        [pauseInfo, setPauseInfo] = useState(false);
      function reopen() {
        void read(org, customer.id).then((rows) => {
          setSource(rows.find((l) => l.id === initial.id)!);
          setMounted(true);
          setInstance((v) => v + 1);
          setN(count);
        });
      }
      return (
        <main>
          <h1>Fictional service address editing</h1>
          <p>Same-tab synthetic state; no verified site conditions.</p>
          <button
            onClick={() => {
              void raw(
                org,
                customer.id,
                { ...draft, address_line1: '20 Newer' },
                initial.id,
              );
            }}
          >
            Append fictional newer address
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
            Lose next fixture save acknowledgment
          </button>
          <button
            onClick={() => {
              pause = true;
            }}
          >
            Pause next fixture location read
          </button>
          <button
            onClick={() => {
              release?.();
            }}
          >
            Release fixture location read
          </button>
          <button onClick={() => setPauseInfo(paused)}>
            Inspect fixture location pause
          </button>
          <output aria-label="Location pause">
            {pauseInfo ? 'paused' : 'not paused'}
          </output>
          <button onClick={() => setMounted(false)}>Close editor</button>
          <button onClick={reopen}>Reopen editor</button>
          <button onClick={() => setN(count)}>Inspect writer count</button>
          <output aria-label="Writer count">{n}</output>
          {saved && <p role="status">{saved}</p>}
          {mounted && (
            <LocationEditor
              key={instance}
              repo={repo}
              org={org}
              customer={customer.id}
              location={source}
              onSaved={() => {
                setSaved('Saved existing location');
                setMounted(false);
                setN(count);
              }}
            />
          )}
        </main>
      );
    }
    createRoot(document.getElementById('root')!).render(<Fixture />);
  })();
