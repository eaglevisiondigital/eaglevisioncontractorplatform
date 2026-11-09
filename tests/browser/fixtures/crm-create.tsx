// Existing component and canonical sample writer, isolated regression fixture only.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { Customers } from '../../../src/components/Customers';
import { Operations } from '../../../src/lib/operations';
import { sampleCompanies } from '../../../src/domain/platform';
import '../../../src/styles.css';
if (
  import.meta.env.DEV &&
  import.meta.env.VITE_CONTRACTOR_JOURNEY_PREVIEW === 'true' &&
  location.hostname === '127.0.0.1'
) {
  const repo = new Operations(true),
    original = repo.saveCustomer.bind(repo);
  const mode = new URLSearchParams(location.search).get('mode');
  let calls = 0,
    release: (() => void) | undefined;
  repo.saveCustomer = async (...args) => {
    calls++;
    if (mode === 'pause')
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    if (mode === 'before') throw Error('Synthetic loss before commit');
    const row = await original(...args);
    if (mode === 'after') throw Error('Synthetic loss after commit');
    return row;
  };
  function Harness() {
    const [brand, setBrand] = useState(0),
      [count, setCount] = useState('');
    return (
      <main>
        <h1>CRM create regression fixture</h1>
        <p>Fictional records only; not operational acceptance.</p>
        <button
          onClick={() => {
            release?.();
            release = undefined;
          }}
        >
          Release pending customer acknowledgment
        </button>
        <button onClick={() => setBrand(1)}>
          Select other fixture company
        </button>
        <button onClick={() => setCount(`Writer calls: ${calls}`)}>
          Read fixture writer count
        </button>
        <p role="status">{count}</p>
        <Customers repo={repo} org={sampleCompanies[brand].id} />
      </main>
    );
  }
  createRoot(document.getElementById('root')!).render(<Harness />);
}
