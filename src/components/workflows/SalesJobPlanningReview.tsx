import { useEffect, useRef, useState } from 'react';
import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import type { FieldVisitReference } from '../../lib/field-scheduling';
import { FieldJobSourceReview } from '../field/FieldJobSourceReview';
import { readSalesJobPlanning } from './sales-job-planning-review';

/** A disclosure in the existing Sales workspace; no command or new authority. */
export function SalesJobPlanningReview({
  sources,
  enabled = false,
}: {
  sources: LocalJourney;
  enabled?: boolean;
}) {
  const [review, setReview] =
    useState<Awaited<ReturnType<typeof readSalesJobPlanning>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const life = useRef({ active: true });
  useEffect(() => {
    const current = life.current;
    current.active = true;
    return () => {
      current.active = false;
    };
  }, []);
  async function read(reference?: FieldVisitReference) {
    if (busy || !enabled) return;
    setBusy(true);
    setReview(undefined);
    setError(false);
    try {
      const value = await readSalesJobPlanning(sources, reference);
      value.check();
      if (life.current.active) setReview(value);
    } catch {
      if (life.current.active) setError(true);
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  if (!enabled) return null;
  let current = review?.sources === sources ? review : undefined;
  if (current) {
    try {
      current.check();
    } catch {
      current = undefined;
    }
  }
  return (
    <section aria-label="Sales issued scope and job planning">
      <h3>Issued scope &amp; existing job plan</h3>
      <p>
        Inspect the recorded job baseline without clearing agreement review
        inputs. A draft is not an issued scope; local review is not customer
        approval, a signed agreement, job authorization or completed work.
      </p>
      <button disabled={busy} onClick={() => void read()}>
        Review issued estimate &amp; job plan
      </button>
      {busy && <p role="status">Reading the original issued job source…</p>}
      {(error || (review && !current)) && (
        <p role="status">
          UNKNOWN — original source or authorization changed. Review again; no
          replacement job, estimate or visit is selected automatically.
        </p>
      )}
      {current && (
        <>
          <p role="status">
            Selected recorded visit: {current.row.date} · {current.row.status}
            {' · '}
            {current.reference.visit_id}
          </p>
          <FieldJobSourceReview
            key={JSON.stringify(current.reference)}
            repo={sources.property}
            org={sources.target.organization_id}
            actor={sources.target.actor_id}
            reference={current.reference}
            scope={current.scope}
            initiallyOpen
            onVisit={(reference) => void read(reference)}
          />
        </>
      )}
    </section>
  );
}
