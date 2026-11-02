import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { sampleCompanies } from '../../../src/domain/platform';
import { CustomerPortalPreviewModel } from '../../../src/lib/customer-preview';
import { Operations } from '../../../src/lib/operations';
import { PropertyRepository } from '../../../src/lib/property';
import { ProofOfWorkPackPreview } from '../../../src/components/property/ProofOfWorkPackPreview';
import '../../../src/styles.css';

const admitted =
  import.meta.env.DEV &&
  import.meta.env.VITE_PROOF_OF_WORK_TEST === 'true' &&
  window.location.hostname === '127.0.0.1';
function Harness() {
  const [company, setCompany] = useState(sampleCompanies[0].id);
  const [model, setModel] = useState<CustomerPortalPreviewModel | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  const release = useRef<(() => void) | null>(null);
  function pauseNextRead() {
    if (!model) return;
    const original = model.repo.estimates.jobs.bind(model.repo.estimates);
    model.repo.estimates.jobs = async (...args) => {
      model.repo.estimates.jobs = original;
      const jobs = await original(...args);
      setPaused(true);
      await new Promise<void>((resolve) => {
        release.current = resolve;
      });
      setPaused(false);
      return jobs;
    };
  }
  async function prepare() {
    setBusy(true);
    setError('');
    try {
      const c = sampleCompanies.find((c) => c.id === company)!;
      const m = new CustomerPortalPreviewModel(
        c,
        new PropertyRepository(new Operations(true)),
      );
      await m.login();
      await m.prepare();
      await m.prepareHistory();
      const context = m.read().context;
      const state = m.repo.read(c.id);
      const property = state.contexts.find(
        (p) =>
          p.customer_id === context.customer_id &&
          p.location_id === context.location_id,
      )!;
      const plan = m.repo.createPlan(
        c.id,
        property,
        'Recorded after-stage documentation',
      );
      let visit = m.repo.addVisit(c.id, plan.id, '2026-12-21', 'after');
      m.repo.saveVisit(c.id, visit, {
        summary: 'After-stage property documentation',
        internal_notes: 'PRIVATE workforce and supplier costing',
        checklist: [
          {
            id: 'record',
            label: 'Condition documentation recorded',
            completed: true,
            required: true,
          },
        ],
        findings: [],
      });
      visit = m.repo.read(c.id).visits.find((v) => v.id === visit.id)!;
      m.repo.submit(c.id, visit);
      visit = m.repo.read(c.id).visits.find((v) => v.id === visit.id)!;
      m.repo.publish(c.id, visit);
      setModel(m);
      setEpoch((e) => e + 1);
    } catch {
      setError('Synthetic evidence preparation unavailable.');
    } finally {
      setBusy(false);
    }
  }
  let properties: { id: string; label: string }[] = [];
  let location = '';
  try {
    if (model) {
      properties = model.properties();
      location = model.read().context.location_id;
    }
  } catch {
    /* Ended test session has no current property controls. */
  }
  return (
    <>
      <aside className="proof-harness" aria-label="Local development controls">
        <details className="proof-harness-controls" data-render={epoch} open>
          <summary>Local synthetic test controls</summary>
          <label>
            Contractor
            <select
              aria-label="Contractor"
              disabled={busy}
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                setModel(null);
                setEpoch((x) => x + 1);
              }}
            >
              {sampleCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy} onClick={() => void prepare()}>
            {busy ? 'Preparing…' : 'Prepare existing synthetic evidence'}
          </button>
          {error && <p role="alert">{error}</p>}
          {model && location && (
            <>
              <label>
                Property
                <select
                  aria-label="Property"
                  value={location}
                  onChange={(e) => {
                    model.selectProperty(e.target.value);
                    setEpoch((x) => x + 1);
                  }}
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={pauseNextRead}>Pause next source read</button>
              <button
                onClick={() => {
                  const c = model.read().context;
                  const property = model.repo
                    .read(c.organization_id)
                    .contexts.find(
                      (p) =>
                        p.customer_id === c.customer_id &&
                        p.location_id === c.location_id,
                    )!;
                  const plan = model.repo.createPlan(
                    c.organization_id,
                    property,
                    'Additional exact documentation',
                  );
                  let visit = model.repo.addVisit(
                    c.organization_id,
                    plan.id,
                    '2026-12-22',
                    'during',
                  );
                  model.repo.saveVisit(c.organization_id, visit, {
                    summary: 'Additional published documentation',
                    internal_notes: 'PRIVATE supplier and workforce details',
                    checklist: [],
                    findings: [],
                  });
                  visit = model.repo
                    .read(c.organization_id)
                    .visits.find((v) => v.id === visit.id)!;
                  model.repo.submit(c.organization_id, visit);
                  visit = model.repo
                    .read(c.organization_id)
                    .visits.find((v) => v.id === visit.id)!;
                  model.repo.publish(c.organization_id, visit);
                  setEpoch((x) => x + 1);
                }}
              >
                Add published evidence
              </button>
              <button onClick={() => void prepare()} disabled={busy}>
                Replace synthetic source model
              </button>
              <button
                onClick={() => {
                  model.logout();
                  setEpoch((x) => x + 1);
                }}
              >
                End synthetic session
              </button>
            </>
          )}
          {paused && <p role="status">Source read paused</p>}
          {paused && (
            <button
              onClick={() => {
                release.current?.();
                release.current = null;
              }}
            >
              Release source read
            </button>
          )}
        </details>
      </aside>
      {model && <ProofOfWorkPackPreview model={model} enabled />}
    </>
  );
}
const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    {admitted ? (
      <Harness />
    ) : (
      <main>
        <h1>Proof of Work preview is off</h1>
        <p>No customer access is enabled.</p>
      </main>
    )}
  </StrictMode>,
);
