import { useEffect, useRef, useState } from 'react';
import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import { JobMarginAnalysis } from '../finance/JobMarginAnalysis';
import { readProcurementJobEvidence } from './procurement-job-evidence';

export function ProcurementJobEvidence({
  sources,
  onFinance,
}: {
  sources: LocalJourney;
  onFinance(): Promise<boolean>;
}) {
  const signature = JSON.stringify([sources.target, sources.gate]);
  const [binding, bind] = useState({ sources, signature, generation: 0 });
  if (binding.sources !== sources || binding.signature !== signature) {
    bind({ sources, signature, generation: binding.generation + 1 });
    return null;
  }
  return (
    <Review key={binding.generation} sources={sources} onFinance={onFinance} />
  );
}
function Review({
  sources,
  onFinance,
}: {
  sources: LocalJourney;
  onFinance(): Promise<boolean>;
}) {
  const [view, setView] =
    useState<Awaited<ReturnType<typeof readProcurementJobEvidence>>>();
  const [query, setQuery] = useState(''),
    [note, setNote] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  let current = view;
  try {
    current?.check();
  } catch {
    current = undefined;
  }
  async function read() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const value = await readProcurementJobEvidence(sources);
      value.check();
      if (live.current) setView(value);
    } catch {
      if (live.current) {
        setView(undefined);
        setError(
          'UNKNOWN — exact material, procurement or cost source unavailable.',
        );
      }
    } finally {
      if (live.current) setBusy(false);
    }
  }
  async function finance() {
    if (!current || busy) return;
    const value = current;
    setBusy(true);
    try {
      value.check();
      await value.cost.reader.read(value.cost.scope, sources.target.actor_id);
      value.check();
      if (!live.current || !(await onFinance())) throw Error();
      value.check();
      document.getElementById('journey-finance')?.focus();
    } catch {
      if (live.current) {
        setView(undefined);
        setError('UNKNOWN — exact Finance handoff unavailable.');
      }
    } finally {
      if (live.current) setBusy(false);
    }
  }
  return (
    <section aria-label="Procurement and exact job materials">
      <h3>Procurement → job materials → cost review</h3>
      <p>
        Issued estimate scope is a requirement reference, not a purchase,
        approval or receipt. Supplier quotes, verified supplier identity and
        received quantities remain UNKNOWN unless independently recorded.
      </p>
      <label>
        Filter recorded materials
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <label>
        Unfinished procurement notes
        <textarea
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <p>
        Notes are unsaved local inputs; no order or supplier commitment is
        created.
      </p>
      <button disabled={busy} onClick={() => void read()}>
        Review job materials and procurement requirements
      </button>
      {(error || (view && !current)) && (
        <p role="status">
          {error ||
            'UNKNOWN — stale or revoked source; private evidence withheld.'}
        </p>
      )}
      {current && (
        <>
          <p>
            Exact job {current.cost.scope.jobId} · issued estimate{' '}
            {current.cost.scope.estimateId} · version{' '}
            {current.cost.scope.issuedVersionId}
          </p>
          <h4>Included material requirements</h4>
          {!current.materials.length && (
            <p>
              Material requirements UNKNOWN — no included material/product lines
              in this exact issued scope.
            </p>
          )}
          <ul>
            {current.materials
              .filter((l) =>
                l.description.toLowerCase().includes(query.toLowerCase()),
              )
              .map((l) => (
                <li key={l.id}>
                  <strong>{l.description}</strong>
                  <p>
                    Scope line {l.id} · catalog {l.catalog_item_id ?? 'UNKNOWN'}{' '}
                    · mapping {l.catalogMapping}
                  </p>
                  <p>
                    Recorded estimate quantity:{' '}
                    {l.quantity_milli > 0 ? l.quantity_milli / 1000 : 'UNKNOWN'}{' '}
                    {l.unit}. Purchase / received quantity: UNKNOWN.
                  </p>
                  <p>
                    Recorded vendor label: {l.recordedVendor || 'UNKNOWN'} ·
                    supplier identity UNKNOWN · supplier quote / price evidence
                    UNKNOWN.
                  </p>
                </li>
              ))}
          </ul>
          <h4>Existing procurement requirements</h4>
          <ul>
            {current.requirements.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
          <p>
            Proposed purchases: review only. Procurement approval: BLOCKED.
            Material receipt: UNKNOWN. Posted costs appear only in the canonical
            cost evidence below; this review posts nothing.
          </p>
          <button disabled={busy} onClick={() => void finance()}>
            Open exact materials job in Finance
          </button>
          <JobMarginAnalysis
            reader={current.cost.reader}
            scope={current.cost.scope}
            actor={sources.target.actor_id}
          />
        </>
      )}
    </section>
  );
}
