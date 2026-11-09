import { useEffect, useRef, useState } from 'react';
import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import { readCrewJobReadiness } from './crew-job-readiness';
export function CrewJobReadiness({ sources }: { sources: LocalJourney }) {
  const signature = JSON.stringify([
    sources.target,
    sources.worker_id,
    sources.scheduled_visit_id,
    sources.plan_id,
    sources.timezone,
    sources.day,
  ]);
  const [binding, bind] = useState({ sources, signature, generation: 0 });
  if (binding.sources !== sources || binding.signature !== signature) {
    bind({ sources, signature, generation: binding.generation + 1 });
    return null;
  }
  return <Review key={binding.generation} sources={sources} />;
}
function Review({ sources }: { sources: LocalJourney }) {
  const [day, setDay] = useState(sources.day),
    [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [hoursStart, setHoursStart] = useState(''),
    [hoursEnd, setHoursEnd] = useState(''),
    [note, setNote] = useState(''),
    [confirmed, confirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [view, setView] =
      useState<Awaited<ReturnType<typeof readCrewJobReadiness>>>();
  const life = useRef(true),
    epoch = useRef(0),
    pending = useRef(false);
  useEffect(() => {
    life.current = true;
    return () => {
      life.current = false;
      epoch.current++;
    };
  }, []);
  const signature = JSON.stringify([day, start, end, hoursStart, hoursEnd]);
  const [reviewed, setReviewed] = useState('');
  let current = reviewed === signature ? view : undefined;
  try {
    current?.check();
  } catch {
    current = undefined;
  }
  function edit() {
    epoch.current++;
    confirm(false);
    setError('');
    setStatus('');
  }
  async function evaluate() {
    if (pending.current || !confirmed) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const token = epoch.current;
    try {
      const value = await readCrewJobReadiness(sources, {
        week_start: day,
        timezone: sources.timezone,
        worker_id: sources.worker_id,
        proposals: [
          {
            day,
            source_visit_id: sources.scheduled_visit_id,
            worker_id: sources.worker_id,
            start: start ? day + 'T' + start : null,
            end: end ? day + 'T' + end : null,
            hours_start: hoursStart ? day + 'T' + hoursStart : null,
            hours_end: hoursEnd ? day + 'T' + hoursEnd : null,
          },
        ],
      });
      value.check();
      if (life.current && token === epoch.current) {
        setView(value);
        setReviewed(signature);
        confirm(false);
      }
    } catch {
      if (life.current && token === epoch.current)
        setError(
          'UNKNOWN — validate paired local times and current source/authorization. No schedule or assignment was written.',
        );
    } finally {
      pending.current = false;
      if (life.current) setBusy(false);
    }
  }
  const selected = current?.weekly.days.find((d) => d.day === day);
  async function reconcile() {
    if (!current || busy) return;
    const retained = current,
      token = epoch.current;
    setBusy(true);
    try {
      await retained.inspect();
      if (life.current && token === epoch.current) {
        setError('');
        setStatus(
          'Captured source rechecked; operational readiness remains UNKNOWN.',
        );
      }
    } catch {
      if (life.current && token === epoch.current)
        setError(
          'UNKNOWN — original crew evidence changed; no replacement or replay.',
        );
    } finally {
      if (life.current) setBusy(false);
    }
  }
  return (
    <section aria-label="Crew day and job readiness review">
      <h3>Evaluate proposed crew workday readiness</h3>
      <p>
        Exact assigned crew context {sources.worker_id}. This is a human
        planning proposal, not a confirmed booking or availability.
      </p>
      <label>
        Readiness proposed day
        <input
          type="date"
          value={day}
          onChange={(e) => {
            edit();
            setDay(e.target.value);
          }}
        />
      </label>
      <label>
        Readiness proposed start
        <input
          type="time"
          value={start}
          onChange={(e) => {
            edit();
            setStart(e.target.value);
          }}
        />
      </label>
      <label>
        Readiness proposed end
        <input
          type="time"
          value={end}
          onChange={(e) => {
            edit();
            setEnd(e.target.value);
          }}
        />
      </label>
      <label>
        Readiness proposed working hours start
        <input
          type="time"
          value={hoursStart}
          onChange={(e) => {
            edit();
            setHoursStart(e.target.value);
          }}
        />
      </label>
      <label>
        Readiness proposed working hours end
        <input
          type="time"
          value={hoursEnd}
          onChange={(e) => {
            edit();
            setHoursEnd(e.target.value);
          }}
        />
      </label>
      <label>
        Unfinished readiness notes
        <textarea
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => confirm(e.target.checked)}
        />
        I confirm this proposed workday for read-only readiness evaluation.
      </label>
      <button disabled={busy || !confirmed} onClick={() => void evaluate()}>
        Evaluate exact job readiness
      </button>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {view && !current && (
        <p role="status">
          Previous readiness evidence UNKNOWN or inputs changed; unfinished
          planning inputs retained.
        </p>
      )}
      {current && (
        <>
          <h4>Readiness: REVIEW REQUIRED · operational readiness UNKNOWN</h4>
          <p>
            Job {current.materials.cost.scope.jobId} · issued version{' '}
            {current.materials.cost.scope.issuedVersionId} · proposed day {day}{' '}
            · {sources.timezone}
          </p>
          <h4>Captured crew conflict and capacity evaluation</h4>
          <p>
            Workforce currentness: CAPTURED NOT ATOMIC. These are results at
            evaluation, not continuous availability. Recheck retained evidence
            after other work changes; any mismatch requires review, not
            automatic replacement.
          </p>
          <button disabled={busy} onClick={() => void reconcile()}>
            Recheck exact retained crew readiness
          </button>
          {selected?.lanes.map((l) => (
            <article key={l.worker_id}>
              <p>
                {l.label} · {l.conflicts.length} documented conflict flags in
                available records.
              </p>
              <p>
                Proposed minutes {l.capacity?.planned_minutes ?? 'UNKNOWN'} ·
                proposed working minutes{' '}
                {l.capacity?.proposed_available_minutes ?? 'UNKNOWN'}. Actual
                availability UNKNOWN.
              </p>
              <p>
                Original capacity result:{' '}
                {l.capacity?.capacity_state.replaceAll('_', ' ') ?? 'UNKNOWN'} ·
                outside proposed hours:{' '}
                {l.capacity?.outside_proposed_hours_minutes ?? 'UNKNOWN'}{' '}
                minutes.
              </p>
              <ul>
                {l.conflicts.map((c, i) => (
                  <li key={i}>
                    {c.kind.replaceAll('_', ' ')} · {c.minutes} minutes
                  </li>
                ))}
              </ul>
              <ul>
                {l.events.map((e, i) => (
                  <li key={i}>
                    {e.kind.replaceAll('_', ' ')} · {e.description}
                  </li>
                ))}
              </ul>
            </article>
          ))}
          <h4>Scope and material preparation requirements</h4>
          <p>
            {
              current.materials.source.snapshot.estimate.lines.filter(
                (l) => l.included,
              ).length
            }{' '}
            included issued scope lines. Measurements and genuine customer/job
            authorization UNVERIFIED.
          </p>
          {!current.materials.materials.length && (
            <p>
              Material requirements UNKNOWN — no included material/product
              scope.
            </p>
          )}
          <ul>
            {current.materials.materials.map((l) => (
              <li key={l.id}>
                {l.description} · recorded estimate quantity{' '}
                {l.quantity_milli / 1000} {l.unit} · catalog mapping{' '}
                {l.catalogMapping}. Supplier quote and material receipt UNKNOWN.
              </li>
            ))}
          </ul>
          <p>
            Canonical cost coverage: {current.cost.status}. Missing costs do not
            prove zero cost or invoice readiness.
          </p>
          <p>
            Customer confirmation, site access, permits, material receipt,
            verified technician availability and dispatch authorization remain
            UNVERIFIED/UNKNOWN. No assignment, booking or preparation command is
            consumed by this review.
          </p>
        </>
      )}
    </section>
  );
}
