import { useEffect, useRef, useState } from 'react';
import type { PropertyRepository } from '../../lib/property';
import type { WorkOrderModel } from '../../lib/field-work-orders';
import { capacityDay, capacityWindow } from '../../domain/field/crew-capacity';
import {
  reviewCrewDayCapacity,
  type CrewDayCapacityReview,
  type CrewPlanningWindow,
  type CrewProposedHours,
} from '../../lib/field-crew-capacity';
import './crew-capacity.css';

const names = {
  WORK_ORDER_OVERLAP: 'Work-order windows overlap',
  VISIT_OVERLAP: 'Visit / work windows overlap',
  SAME_SOURCE_WINDOWS:
    'Same-source windows overlap · review possible duplicate',
  PROPOSAL_RECORDED_OVERLAP: 'Proposed window overlaps recorded time',
  RECORDED_OVERLAP: 'Recorded segments overlap',
};
const minutes = (value: number | null) =>
  value === null ? 'UNKNOWN' : `${Math.round(value * 100) / 100} min`;
export function CrewCapacityPreview({
  repo,
  model,
  day: initialDay,
  onSource,
}: {
  repo: PropertyRepository;
  model: WorkOrderModel;
  day: string;
  onSource: (order: WorkOrderModel['orders'][number]) => void;
}) {
  const [day, setDay] = useState(initialDay),
    [timezone, setTimezone] = useState(model.timezone);
  const [worker, setWorker] = useState(''),
    [source, setSource] = useState('');
  const [start, setStart] = useState(initialDay + 'T09:00'),
    [end, setEnd] = useState(initialDay + 'T11:00');
  const [hourStart, setHourStart] = useState(initialDay + 'T08:00'),
    [hourEnd, setHourEnd] = useState(initialDay + 'T16:00');
  const [windows, setWindows] = useState<CrewPlanningWindow[]>([]),
    [hours, setHours] = useState<CrewProposedHours[]>([]);
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''),
    [review, setReview] = useState<CrewDayCapacityReview | null>(null);
  const result = useRef<HTMLElement>(null),
    sequence = useRef(0),
    active = useRef(true),
    inFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (review) result.current?.focus();
  }, [review]);
  const invalidate = () => {
    sequence.current++;
    setReview(null);
    setConfirmed(false);
    setMessage('');
  };
  const targets = model.orders
    .filter((o) => o.crew.some((w) => w.worker_id === worker))
    .flatMap((order) => [
      {
        key: 'job:' + order.source.job_id,
        order,
        visit_id: null,
        label: 'Work order · ' + order.title,
      },
      ...order.visits.map((visit) => ({
        key: 'visit:' + visit.id,
        order,
        visit_id: visit.id,
        label: 'Property visit · ' + visit.plan_name + ' · ' + visit.date,
      })),
    ]);
  function addWindow() {
    invalidate();
    try {
      capacityWindow(start, end, timezone, capacityDay(day, timezone));
      const target = targets.find((item) => item.key === source);
      if (!target)
        throw Error('Choose an exact assigned work order or linked visit');
      if (windows.length >= 32)
        throw Error('At most 32 proposed windows per review');
      setWindows([
        ...windows,
        {
          order: target.order,
          worker_id: worker,
          visit_id: target.visit_id,
          start,
          end,
        },
      ]);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Proposed window unavailable',
      );
    }
  }
  function addHours() {
    invalidate();
    try {
      capacityWindow(hourStart, hourEnd, timezone, capacityDay(day, timezone));
      if (!model.crew.some((w) => w.worker_id === worker))
        throw Error('Choose a current crew member');
      if (hours.length >= 32)
        throw Error('At most 32 proposed-hours periods per review');
      setHours([
        ...hours,
        { worker_id: worker, start: hourStart, end: hourEnd },
      ]);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Proposed hours unavailable',
      );
    }
  }
  async function inspect() {
    if (!confirmed || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setReview(null);
    setMessage('');
    const token = ++sequence.current;
    try {
      const value = await reviewCrewDayCapacity(
        repo,
        model.organization_id,
        model.actor,
        { day, timezone, windows, hours, confirmed },
      );
      if (active.current && token === sequence.current) setReview(value);
    } catch (error) {
      if (active.current && token === sequence.current)
        setMessage(
          error instanceof Error
            ? error.message
            : 'Capacity review unavailable. Reload field records.',
        );
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  if (!model.manager)
    return (
      <section className="crew-capacity" aria-labelledby="capacity-title">
        <h3 id="capacity-title">Crew-day capacity review</h3>
        <p>
          Office proposal controls are unavailable in the technician view.
          Existing own assigned sources remain above.
        </p>
      </section>
    );
  return (
    <section className="crew-capacity" aria-labelledby="capacity-title">
      <div className="capacity-heading">
        <span className="wo-kicker">LOCAL PLANNING REVIEW</span>
        <h3 id="capacity-title">Crew-day capacity & overlaps</h3>
        <p>
          Review human-proposed windows against exact current crew and recorded
          evidence. Nothing is scheduled or dispatched.
        </p>
      </div>
      <p className="capacity-boundary">
        Actual working availability is UNKNOWN. No future shift is recorded in
        the existing sources. Proposed hours are temporary review inputs;
        payroll rules and inspection dates do not establish availability.
      </p>
      <fieldset disabled={busy}>
        <legend>Choose the crew day and exact source</legend>
        <div className="capacity-controls">
          <label>
            Capacity day
            <input
              type="date"
              value={day}
              onChange={(e) => {
                invalidate();
                setDay(e.target.value);
                setWindows([]);
                setHours([]);
                setStart(e.target.value + 'T09:00');
                setEnd(e.target.value + 'T11:00');
                setHourStart(e.target.value + 'T08:00');
                setHourEnd(e.target.value + 'T16:00');
              }}
            />
          </label>
          <label>
            Planning timezone
            <input
              value={timezone}
              onChange={(e) => {
                invalidate();
                setTimezone(e.target.value);
              }}
            />
          </label>
          <label>
            Planning crew member
            <select
              value={worker}
              onChange={(e) => {
                invalidate();
                setWorker(e.target.value);
                setSource('');
              }}
            >
              <option value="">Choose crew member</option>
              {model.crew.map((w) => (
                <option key={w.worker_id} value={w.worker_id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Exact proposed source
            <select
              value={source}
              onChange={(e) => {
                invalidate();
                setSource(e.target.value);
              }}
            >
              <option value="">Choose assigned source</option>
              {targets.map((target) => (
                <option key={target.key} value={target.key}>
                  {target.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!targets.length && (
          <p className="capacity-empty">
            Choose a crew member with a current job relationship. Use the
            existing work-order review above to retain a sample assignment
            first.
          </p>
        )}
        <div className="capacity-inputs">
          <div>
            <h4>Proposed work / visit window</h4>
            <label>
              Window start
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => {
                  invalidate();
                  setStart(e.target.value);
                }}
              />
            </label>
            <label>
              Window end
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => {
                  invalidate();
                  setEnd(e.target.value);
                }}
              />
            </label>
            <button
              type="button"
              disabled={!source || !worker}
              onClick={addWindow}
            >
              Add proposed window
            </button>
          </div>
          <div>
            <h4>Human-proposed working hours</h4>
            <label>
              Proposed hours start
              <input
                type="datetime-local"
                value={hourStart}
                onChange={(e) => {
                  invalidate();
                  setHourStart(e.target.value);
                }}
              />
            </label>
            <label>
              Proposed hours end
              <input
                type="datetime-local"
                value={hourEnd}
                onChange={(e) => {
                  invalidate();
                  setHourEnd(e.target.value);
                }}
              />
            </label>
            <button type="button" disabled={!worker} onClick={addHours}>
              Add proposed hours
            </button>
          </div>
        </div>
      </fieldset>
      <div className="capacity-inputs">
        <div>
          <h4>{windows.length} proposed window(s)</h4>
          {!windows.length ? (
            <p>No timed work proposal. Dated visits remain untimed evidence.</p>
          ) : (
            <ol>
              {windows.map((w, i) => (
                <li key={i}>
                  {w.order.title}
                  {w.visit_id
                    ? ' · linked visit ' + w.visit_id
                    : ' · work order'}
                  <br />
                  {w.start} → {w.end}
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      invalidate();
                      setWindows(windows.filter((_, at) => at !== i));
                    }}
                  >
                    Remove window {i + 1}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <h4>{hours.length} proposed-hours period(s)</h4>
          {!hours.length ? (
            <p>
              Available capacity stays UNKNOWN until hours are explicitly
              proposed.
            </p>
          ) : (
            <ol>
              {hours.map((h, i) => (
                <li key={i}>
                  {model.crew.find((w) => w.worker_id === h.worker_id)?.label}
                  <br />
                  {h.start} → {h.end}
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      invalidate();
                      setHours(hours.filter((_, at) => at !== i));
                    }}
                  >
                    Remove hours {i + 1}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      <label className="capacity-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy}
          onChange={(e) => {
            setConfirmed(e.target.checked);
            setReview(null);
          }}
        />
        I reviewed the exact sources and these temporary proposed hours /
        windows. This review does not schedule, dispatch or confirm actual
        availability.
      </label>
      <div className="capacity-actions">
        <button disabled={!confirmed || busy} onClick={() => void inspect()}>
          {busy ? 'Reading current crew evidence…' : 'Review crew-day capacity'}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            invalidate();
            setWindows([]);
            setHours([]);
          }}
        >
          Clear all proposals
        </button>
      </div>
      {message && (
        <p role="alert" className="capacity-state">
          {message}
        </p>
      )}
      {busy && (
        <p role="status">
          Checking current source revisions and crew relationships…
        </p>
      )}
      {review && (
        <section
          className="capacity-result"
          ref={result}
          tabIndex={-1}
          aria-labelledby="capacity-result-title"
        >
          <h4 id="capacity-result-title">
            Crew-day proposal review · {review.day}
          </h4>
          <p>
            {review.timezone} · {review.civil_day_minutes} civil-day minutes.
            Session proposal only; actual availability UNKNOWN. Available
            records do not prove complete history.
          </p>
          <p>
            {review.duplicate_proposals_ignored} exact duplicate proposal(s)
            excluded from counting. Adjacent windows do not overlap.
          </p>
          <ul className="capacity-workers">
            {review.workers.map((w) => (
              <li key={w.worker_id}>
                <h4>{w.label}</h4>
                <dl>
                  <dt>Proposed work · union</dt>
                  <dd>{minutes(w.planned_minutes)}</dd>
                  <dt>Proposed hours · union</dt>
                  <dd>{minutes(w.proposed_available_minutes)}</dd>
                  <dt>Outside proposed hours</dt>
                  <dd>{minutes(w.outside_proposed_hours_minutes)}</dd>
                  <dt>Unallocated proposed hours</dt>
                  <dd>{minutes(w.unused_proposed_minutes)}</dd>
                  <dt>Review status</dt>
                  <dd>{w.capacity_state.replaceAll('_', ' ')}</dd>
                  <dt>Recorded segments · union</dt>
                  <dd>
                    {minutes(w.recorded_minutes)} ·{' '}
                    {w.recorded_coverage.replaceAll('_', ' ')}
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
          <h4>{review.overlaps.length} timed overlap(s) to review</h4>
          {!review.overlaps.length ? (
            <p>
              No overlaps in the available timed inputs. Untimed visits and
              missing evidence remain UNKNOWN.
            </p>
          ) : (
            <ul className="capacity-overlaps">
              {review.overlaps.map((o, i) => (
                <li key={i}>
                  <b>{names[o.kind]}</b>
                  <span>
                    {minutes(o.minutes)} ·{' '}
                    {model.crew.find((w) => w.worker_id === o.worker_id)?.label}
                  </span>
                  <small>
                    {o.first} ↔ {o.second}
                  </small>
                </li>
              ))}
            </ul>
          )}
          {review.recorded_issues.length > 0 && (
            <p>{review.recorded_issues.join('; ')}</p>
          )}
          <h4>Exact proposed source references</h4>
          {review.windows.map((w, i) => (
            <div className="capacity-source" key={i}>
              <b>{w.label}</b>
              <p>
                Organization {w.source.organization_id} · {w.local_start} →{' '}
                {w.local_end} / {review.timezone}
              </p>
              <p>
                Job {w.source.job_id} / revision {w.source.job_revision} ·
                issued version {w.source.issued_version_id} /{' '}
                {w.source.issued_version_number}
              </p>
              <p>
                Customer {w.source.customer_id} · property{' '}
                {w.source.property_id ?? 'UNKNOWN'}
              </p>
              {w.visit_id && (
                <p>
                  Visit {w.visit_id} / {w.source.visit_revision} · plan{' '}
                  {w.source.plan_id} / {w.source.plan_revision}
                </p>
              )}
              <button
                className="secondary"
                onClick={() => {
                  const order = model.orders.find(
                    (o) => o.source.job_id === w.job_id,
                  );
                  if (order) onSource(order);
                }}
              >
                Inspect capacity source {i + 1}
              </button>
            </div>
          ))}
          <h4>Dated property visits · timing evidence</h4>
          {!review.dated_visits.length ? (
            <p>No accessible linked visits recorded on this property date.</p>
          ) : (
            <ul>
              {review.dated_visits.map((v) => (
                <li key={v.visit_id}>
                  {v.property_label} · {v.date} / {v.timezone}
                  <br />
                  {v.timing.replaceAll('_', ' ')} · crew {v.assignment}
                  <small>
                    Visit {v.visit_id} / {v.visit_revision}; plan {v.plan_id} /{' '}
                    {v.plan_revision}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}
