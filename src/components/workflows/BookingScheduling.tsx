import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { PropertyRepository } from '../../lib/property';
import type { PrototypeTarget } from '../../lib/program/prototype-source';
import { fieldWorkflowEnabled } from '../../lib/workflows/field-workflow';
import {
  readBookingSchedulingSource,
  readBookingScheduling,
  reconcileBookingScheduling,
  type BookingSchedulingSource,
  type BookingSchedulingReview,
} from '../../lib/workflows/booking-scheduling';
import './booking-scheduling.css';

export interface BookingSchedulingProps {
  repo: PropertyRepository;
  target: PrototypeTarget;
  sourceVisitId: string;
  day: string;
  timezone: string;
  enabled?: boolean;
}
export function BookingScheduling(props: BookingSchedulingProps) {
  const key = JSON.stringify([
    props.target,
    props.sourceVisitId,
    props.day,
    props.timezone,
    props.enabled,
  ]);
  const [context, setContext] = useState({ repo: props.repo, key, epoch: 0 });
  if (context.repo !== props.repo || context.key !== key) {
    setContext({ repo: props.repo, key, epoch: context.epoch + 1 });
    return null;
  }
  const enabled =
    typeof window !== 'undefined' &&
    fieldWorkflowEnabled({
      development: import.meta.env.DEV,
      flag: props.enabled === true ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    });
  return enabled ? (
    <BookingForm key={context.epoch} {...props} />
  ) : (
    <section className="booking-scheduling">
      <h2>Booking review is off</h2>
      <p>No scheduling or dispatch is enabled.</p>
    </section>
  );
}
function BookingForm({
  repo,
  target,
  sourceVisitId,
  day,
  timezone,
}: BookingSchedulingProps) {
  const [source, setSource] = useState<BookingSchedulingSource | null>(null),
    [view, setView] = useState<BookingSchedulingReview | null>(null),
    [date, setDate] = useState(day),
    [worker, setWorker] = useState(''),
    [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [hoursStart, setHoursStart] = useState(''),
    [hoursEnd, setHoursEnd] = useState(''),
    [reviewNote, setReviewNote] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [unknown, setUnknown] = useState(false);
  const [hasRetained, setHasRetained] = useState(false);
  const pending = useRef(false),
    epoch = useRef(0),
    live = useRef(true),
    sourceGate = useRef({ enabled: true, confirmed: false }),
    reviewGate = useRef({ enabled: true, confirmed: false }),
    retained = useRef<BookingSchedulingReview | null>(null),
    resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      sourceGate.current.confirmed = reviewGate.current.confirmed = false;
    };
  }, []);
  useEffect(() => {
    if (view) resultHeading.current?.focus();
  }, [view]);
  function edit() {
    epoch.current++;
    reviewGate.current.confirmed = false;
    setConfirmed(false);
    setView(null);
    retained.current = null;
    setHasRetained(false);
    setStatus('');
    setError('');
  }
  async function loadSource() {
    if (pending.current) return;
    const token = ++epoch.current;
    pending.current = true;
    setBusy(true);
    setSource(null);
    setView(null);
    setError('');
    setStatus('');
    setUnknown(false);
    setConfirmed(false);
    retained.current = null;
    setHasRetained(false);
    sourceGate.current.confirmed = reviewGate.current.confirmed = false;
    const gate = { enabled: true, confirmed: true };
    sourceGate.current = gate;
    try {
      const result = await readBookingSchedulingSource(
        repo,
        target,
        sourceVisitId,
        gate,
      );
      if (live.current && token === epoch.current) {
        setSource(result);
        setWorker('');
        setStatus(
          'The exact current visit and its existing assigned crew are ready for review.',
        );
      }
    } catch {
      if (live.current && token === epoch.current) {
        setUnknown(true);
        setError(
          'Current visit evidence is UNKNOWN or unavailable. No visit, crew or schedule was changed.',
        );
      }
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function review(event: FormEvent) {
    event.preventDefault();
    if (!source || !confirmed || unknown || pending.current) return;
    const token = ++epoch.current;
    pending.current = true;
    setBusy(true);
    setView(null);
    setError('');
    setStatus('');
    const gate = { enabled: true, confirmed: true };
    reviewGate.current = gate;
    try {
      const result = await readBookingScheduling(
        repo,
        target,
        {
          source,
          source_visit_id: sourceVisitId,
          day: date,
          timezone,
          worker_id: worker,
          review_note: reviewNote,
          start: start ? `${date}T${start}` : null,
          end: end ? `${date}T${end}` : null,
          hours_start: hoursStart ? `${date}T${hoursStart}` : null,
          hours_end: hoursEnd ? `${date}T${hoursEnd}` : null,
        },
        gate,
      );
      if (live.current && token === epoch.current) {
        retained.current = result;
        setHasRetained(true);
        setView(result);
        setStatus(
          'Unsaved proposal reviewed. Original visit unchanged; actual availability remains UNKNOWN.',
        );
      }
    } catch {
      if (live.current && token === epoch.current) {
        setUnknown(true);
        setSource(null);
        setError(
          'Review is UNKNOWN: an input, source revision or current staff relationship could not be verified. No schedule was changed and nothing will retry automatically.',
        );
      }
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function verify() {
    if (!retained.current || pending.current) return;
    const token = ++epoch.current;
    pending.current = true;
    setBusy(true);
    setStatus('');
    const result = await reconcileBookingScheduling(retained.current);
    if (live.current && token === epoch.current) {
      if (result.status === 'CURRENT_REVIEW_ONLY')
        setStatus(
          'Exact retained review still matches the available source. Availability and scheduling authority remain UNKNOWN / blocked.',
        );
      else {
        setView(null);
        setSource(null);
        setUnknown(true);
        setError(
          'Exact retained review is UNKNOWN. It has not been replaced, replayed or applied.',
        );
      }
    }
    pending.current = false;
    if (live.current) setBusy(false);
  }
  const reviewLabels = {
    UNKNOWN: 'Date only — timing UNKNOWN',
    RECORDED_TIME_UNKNOWN: 'Recorded time coverage UNKNOWN',
    RECORDED_CONFLICT: 'Recorded time conflict',
    OUTSIDE_PROPOSED_HOURS: 'Outside proposed working hours',
    HOURS_UNKNOWN: 'Proposed working hours UNKNOWN',
    NO_REPORTED_CONFLICT: 'No reported conflict in available evidence',
  };
  return (
    <section className="booking-scheduling" aria-labelledby="booking-title">
      <div className="bs-heading">
        <div>
          <p className="bs-eyebrow">FIELD / BOOKING PROPOSALS</p>
          <h2 id="booking-title">Booking &amp; rescheduling review</h2>
        </div>
        <span className="bs-badge">Unsaved staff review</span>
      </div>
      <p className="bs-boundary">
        Propose a civil day, a technician already assigned to this job and
        working hours. Review conflicts without changing a visit or dispatching
        work.
      </p>
      <button type="button" disabled={busy} onClick={() => void loadSource()}>
        Load current visit for booking review
      </button>
      {!source && !busy && !error && (
        <p className="bs-state">
          Load the exact existing visit to begin. No booking runs automatically.
        </p>
      )}
      {busy && (
        <p role="status">
          Checking current source revisions and available crew evidence…
        </p>
      )}
      {error && (
        <p className="bs-state" role="alert">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {source && !unknown && (
        <>
          <article className="bs-card">
            <p className="bs-eyebrow">ORIGINAL RECORDED VISIT — UNCHANGED</p>
            <h3>{source.job_title}</h3>
            <p>
              {source.customer_label} · {source.property_label}
            </p>
            <p>
              {source.original_visit.date} · {source.original_visit.timezone} ·{' '}
              {source.original_visit.plan_name}
            </p>
            <p>
              Visit revision {source.original_visit.revision} · plan revision{' '}
              {source.original_visit.plan_revision} · issued estimate v
              {source.source.issued_version_number}
            </p>
            <details>
              <summary>Exact source references</summary>
              <p>Job {source.source.job_id}</p>
              <p>Property {source.source.location_id}</p>
              <p>Visit {source.original_visit.id}</p>
              <p>Plan {source.original_visit.plan_id}</p>
            </details>
          </article>
          {!source.crew.length ? (
            <p className="bs-state">
              No eligible technician is currently assigned to this job. This
              form cannot assign staff or dispatch work.
            </p>
          ) : (
            <form className="bs-card" onSubmit={(event) => void review(event)}>
              <h3>Human proposal</h3>
              <div className="bs-fields">
                <label>
                  Proposed civil day
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => {
                      edit();
                      setDate(e.target.value);
                    }}
                  />
                </label>
                <label>
                  Existing assigned technician
                  <select
                    required
                    value={worker}
                    onChange={(e) => {
                      edit();
                      setWorker(e.target.value);
                    }}
                  >
                    <option value="">Choose an assigned technician</option>
                    {source.crew.map((w) => (
                      <option key={w.worker_id} value={w.worker_id}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Proposed start time
                  <input
                    type="time"
                    step="60"
                    value={start}
                    required={!!end}
                    onChange={(e) => {
                      edit();
                      setStart(e.target.value);
                    }}
                  />
                </label>
                <label>
                  Proposed end time
                  <input
                    type="time"
                    step="60"
                    value={end}
                    required={!!start}
                    onChange={(e) => {
                      edit();
                      setEnd(e.target.value);
                    }}
                  />
                </label>
                <label>
                  Proposed working-hours start
                  <input
                    type="time"
                    step="60"
                    value={hoursStart}
                    required={!!hoursEnd}
                    onChange={(e) => {
                      edit();
                      setHoursStart(e.target.value);
                    }}
                  />
                </label>
                <label>
                  Proposed working-hours end
                  <input
                    type="time"
                    step="60"
                    value={hoursEnd}
                    required={!!hoursStart}
                    onChange={(e) => {
                      edit();
                      setHoursEnd(e.target.value);
                    }}
                  />
                </label>
              </div>
              <label className="bs-note">
                Review note (unsaved)
                <textarea
                  required
                  maxLength={200}
                  value={reviewNote}
                  onChange={(event) => {
                    edit();
                    setReviewNote(event.target.value);
                  }}
                />
              </label>
              <p>
                This human review context stays separate from published
                inspection observations.
              </p>
              <p>
                All times use {timezone}. Leave both visit times blank for a
                date-only review. Working hours are human proposals, not
                recorded availability. Invalid or repeated daylight-saving times
                are rejected.
              </p>
              {date !== source.original_visit.date && (
                <p className="bs-state">
                  Alternate day: an unsaved job-window rescheduling proposal.
                  The original visit stays on {source.original_visit.date}.
                </p>
              )}
              <label className="bs-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => {
                    edit();
                    setConfirmed(e.target.checked);
                  }}
                />
                I confirm these exact unsaved proposal inputs for a local
                conflict review.
              </label>
              <button
                type="submit"
                disabled={!confirmed || busy || !worker || !date}
              >
                Review booking proposal
              </button>
            </form>
          )}
        </>
      )}
      {view && (
        <article className="bs-result" aria-labelledby="booking-result">
          <h3 id="booking-result" tabIndex={-1} ref={resultHeading}>
            Booking review — not scheduled
          </h3>
          <p className="bs-badge">{reviewLabels[view.capacity.review]}</p>
          <p>Unsaved review context: {view.proposal.review_note}</p>
          <div className="bs-comparison">
            <div>
              <h4>Original visit</h4>
              <p>{view.original_visit.date}</p>
              <p>Visit revision {view.original_visit.revision}; unchanged</p>
            </div>
            <div>
              <h4>Unsaved proposal</h4>
              <p>
                {view.proposal.day} · {view.proposal.timezone}
              </p>
              <p>
                {view.proposal.start && view.proposal.end
                  ? `${view.proposal.start.slice(11)}–${view.proposal.end.slice(11)}`
                  : 'Time UNKNOWN'}
              </p>
              <p>
                {view.proposal.kind === 'UNSAVED_JOB_WINDOW_RESCHEDULE'
                  ? 'Job window only; original visit not moved'
                  : 'Human-proposed window for the original visit'}
              </p>
            </div>
          </div>
          <dl className="bs-metrics">
            <div>
              <dt>Proposed minutes</dt>
              <dd>{view.capacity.worker.planned_minutes}</dd>
            </div>
            <div>
              <dt>Proposed working minutes</dt>
              <dd>
                {view.capacity.worker.proposed_available_minutes ?? 'UNKNOWN'}
              </dd>
            </div>
            <div>
              <dt>Outside proposed hours</dt>
              <dd>
                {view.capacity.worker.outside_proposed_hours_minutes ??
                  'UNKNOWN'}
              </dd>
            </div>
            <div>
              <dt>Civil day minutes</dt>
              <dd>{view.capacity.civil_day_minutes}</dd>
            </div>
          </dl>
          <h4>Conflict evidence</h4>
          {!view.capacity.conflicts.length && (
            <p>
              No recorded overlap found in available evidence. This does not
              establish actual availability or complete coverage.
            </p>
          )}
          {view.capacity.conflicts.map((c, index) => (
            <p key={index}>
              <strong>{c.kind.replaceAll('_', ' ')}</strong> · {c.minutes}{' '}
              minutes · {c.first} / {c.second}
            </p>
          ))}
          <h4>Original property visits on the proposed day</h4>
          {!view.capacity.dated_visits.length && (
            <p>
              No recorded visit for this job/property on that day. An
              alternate-day proposal does not create one.
            </p>
          )}
          {view.capacity.dated_visits.map((v) => (
            <p key={v.visit_id}>
              {v.date} · visit {v.visit_id} ·{' '}
              {v.timing === 'TIME_UNKNOWN'
                ? 'Recorded time UNKNOWN'
                : 'Human-proposed window, not availability'}
            </p>
          ))}
          <p>
            Actual availability: UNKNOWN. Workforce evidence is captured, not
            atomic; coverage is available records only. This immutable session
            review is not a saved booking, dispatch or durable offline record.
          </p>
          <details>
            <summary>Review integrity</summary>
            <p>SHA-256 {view.integrity.sha256}</p>
          </details>
        </article>
      )}
      {hasRetained && (
        <button type="button" disabled={busy} onClick={() => void verify()}>
          Check exact retained booking review
        </button>
      )}
    </section>
  );
}
