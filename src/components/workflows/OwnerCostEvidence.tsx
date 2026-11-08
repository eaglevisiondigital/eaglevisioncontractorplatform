import { useEffect, useRef, useState } from 'react';
import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import { JobMarginAnalysis } from '../finance/JobMarginAnalysis';
import { readOwnerCostEvidence } from './owner-cost-evidence';

/** Detailed source inspection beside existing priorities, never a new ranking. */
export function OwnerCostEvidence({
  sources,
  enabled = false,
  onFinance,
}: {
  sources: LocalJourney;
  enabled?: boolean;
  onFinance(): Promise<boolean>;
}) {
  const [view, setView] =
    useState<Awaited<ReturnType<typeof readOwnerCostEvidence>>>();
  const [shown, show] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const life = useRef({ active: true });
  useEffect(() => {
    const current = life.current;
    current.active = true;
    return () => {
      current.active = false;
    };
  }, []);
  let current = view?.sources === sources ? view : undefined;
  if (current)
    try {
      current.check();
    } catch {
      current = undefined;
    }
  async function read() {
    if (busy || !enabled) return;
    setBusy(true);
    setError(false);
    setView(undefined);
    try {
      const result = await readOwnerCostEvidence(sources);
      result.check();
      if (life.current.active) {
        setView(result);
        show(true);
      }
    } catch {
      if (life.current.active) setError(true);
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  async function openFinance() {
    if (!current || busy || !enabled) return;
    setBusy(true);
    setError(false);
    try {
      current.check();
      await current.reader.read(current.scope, sources.target.actor_id);
      current.check();
      if (!life.current.active || !(await onFinance())) throw Error();
      current.check();
    } catch {
      if (life.current.active) {
        setError(true);
        setView(undefined);
      }
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  if (!enabled) return null;
  return (
    <section aria-label="Owner job cost evidence">
      <h3>Job costs behind daily priorities</h3>
      <p>
        Inspect the recorded costs behind this job's daily priorities. Missing
        costs do not prove zero spending; suggestions do not authorize posting,
        an invoice or payment.
      </p>
      <button disabled={busy} onClick={() => void read()}>
        Inspect this job's cost coverage
      </button>
      {busy && <p role="status">Checking the original job and cost sources…</p>}
      {(error || (view && !current)) && (
        <p role="status">
          UNKNOWN — the original job, cost source or authorization changed. Read
          the exact source again; no replacement job is selected.
        </p>
      )}
      {current && (
        <>
          <p>
            Job {current.scope.jobId} · Issued version{' '}
            {current.scope.issuedVersionId} · Customer{' '}
            {current.scope.customerId}
          </p>
          {current.scope.propertyId === null && (
            <p>Baseline property UNKNOWN; these are job-wide costs.</p>
          )}
          <button
            className="secondary"
            onClick={() => show(!shown)}
            aria-expanded={shown}
          >
            {shown ? 'Hide owner cost details' : 'Show owner cost details'}
          </button>
          <div hidden={!shown}>
            <JobMarginAnalysis
              reader={current.reader}
              scope={current.scope}
              actor={sources.target.actor_id}
            />
          </div>
          <button disabled={busy} onClick={() => void openFinance()}>
            Open this job's financial review
          </button>
        </>
      )}
    </section>
  );
}
