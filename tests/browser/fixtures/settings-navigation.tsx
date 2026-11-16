// Loopback-only test harness. No added business records or connected adapter.
import { createRoot } from 'react-dom/client';
import { CompanySettings } from '../../../src/components/CompanySettings';
import { Operations } from '../../../src/lib/operations';
import { sampleCompanies } from '../../../src/domain/platform';
import '../../../src/styles.css';
if (
  import.meta.env.DEV &&
  import.meta.env.VITE_CONTRACTOR_JOURNEY_PREVIEW === 'true' &&
  location.hostname === '127.0.0.1'
) {
  const repo = new Operations(true);
  const original = repo.getSettings.bind(repo);
  const mode = new URLSearchParams(location.search).get('mode');
  let attempts = 0;
  let writerCalls = 0;
  repo.saveSettings = async () => {
    writerCalls++;
    throw Error('Fixture writer is disabled');
  };
  repo.getSettings = async (...args) => {
    attempts++;
    if (mode === 'loading') return new Promise(() => {});
    if (mode === 'error' && attempts === 1)
      throw Error('Synthetic unavailable settings');
    if (mode === 'empty' && attempts === 1) return undefined!;
    return original(...args);
  };
  createRoot(document.getElementById('root')!).render(
    <main>
      <h1>Settings navigation qualification</h1>
      <p>Existing synthetic records only. No operational access.</p>
      <CompanySettings
        repo={repo}
        company={sampleCompanies[0]}
        onSaved={() => {
          throw Error('Unexpected fixture save');
        }}
      />
      <button
        type="button"
        onClick={() => {
          document.getElementById('writer-count')!.textContent =
            String(writerCalls);
        }}
      >
        Read fixture write count
      </button>
      <output id="writer-count" aria-label="Fixture write count" />
    </main>,
  );
}
