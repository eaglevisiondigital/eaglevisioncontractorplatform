import { useEffect, useRef, useState } from 'react';
import type { PropertyRepository } from '../../lib/property';
import type { WorkOrder, WorkOrderModel } from '../../lib/field-work-orders';
import {
  readTechnicianDayBoard,
  openTechnicianDayBoardSource,
  type TechnicianDayBoardView,
  type TechnicianDayInput,
} from '../../lib/field-day-board';
import type {
  CrewPlanningWindow,
  CrewProposedHours,
} from '../../lib/field-crew-capacity';
import './technician-day-board.css';

const conflictNames = {
  WORK_ORDER_OVERLAP: 'Work-order overlap',
  VISIT_OVERLAP: 'Visit / work overlap',
  SAME_SOURCE_WINDOWS: 'Same-source overlap',
  PROPOSAL_RECORDED_OVERLAP: 'Proposal / recorded overlap',
  RECORDED_OVERLAP: 'Recorded overlap',
};
const duration = (value: number | null) =>
  value === null ? 'UNKNOWN' : `${value} min`;

/** Own identity boundary: parent remounts are not required to hide prior evidence. */
export function TechnicianDayBoard(props: {
  repo: PropertyRepository;
  model: WorkOrderModel;
  day: string;
  onSource: (order: WorkOrder) => void;
}) {
  const [binding, setBinding] = useState({
    repo: props.repo,
    key: JSON.stringify([props.model, props.day]),
    generation: 0,
  });
  const key = JSON.stringify([props.model, props.day]);
  if (binding.repo !== props.repo || binding.key !== key) {
    setBinding({ repo: props.repo, key, generation: binding.generation + 1 });
    return null;
  }
  return <Board key={binding.generation} {...props} />;
}
function Board({
  repo,
  model,
  day: initialDay,
  onSource,
}: {
  repo: PropertyRepository;
  model: WorkOrderModel;
  day: string;
  onSource: (order: WorkOrder) => void;
}) {
  const [day, setDay] = useState(initialDay),
    [timezone, setTimezone] = useState(model.timezone),
    [worker, setWorker] = useState('');
  const [source, setSource] = useState(''),
    [start, setStart] = useState(initialDay + 'T09:00'),
    [end, setEnd] = useState(initialDay + 'T11:00');
  const [hoursStart, setHoursStart] = useState(initialDay + 'T08:00'),
    [hoursEnd, setHoursEnd] = useState(initialDay + 'T16:00');
  const [windows, setWindows] = useState<CrewPlanningWindow[]>([]),
    [hours, setHours] = useState<CrewProposedHours[]>([]);
  const [confirmed, setConfirmed] = useState(false),
    [view, setView] = useState<TechnicianDayBoardView | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const current = useRef(0),
    mounted = useRef(true),
    pending = useRef(false),
    input = useRef<TechnicianDayInput | null>(null),
    result = useRef<HTMLElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (input.current?.proposal) input.current.proposal.confirmed = false;
    };
  }, []);
  useEffect(() => {
    if (view) result.current?.focus();
  }, [view]);
  const invalidate = () => {
    current.current++;
    if (input.current?.proposal) input.current.proposal.confirmed = false;
    setView(null);
    setMessage('');
    setConfirmed(false);
  };
  const crew = model.manager
    ? model.crew
    : model.crew.filter((w) => w.user_id === model.actor);
  const targets = model.orders
    .filter((o) => o.crew.some((w) => w.worker_id === worker))
    .flatMap((order) => [
      {
        key: 'job:' + order.source.job_id,
        order,
        visit_id: null,
        label: 'Work order · ' + order.title,
      },
      ...order.visits.map((v) => ({
        key: 'visit:' + v.id,
        order,
        visit_id: v.id,
        label: 'Property visit · ' + v.plan_name + ' · ' + v.date,
      })),
    ]);
  async function load() {
    if (pending.current || ((windows.length || hours.length) && !confirmed))
      return;
    pending.current = true;
    const token = ++current.current;
    setBusy(true);
    setView(null);
    setMessage('');
    const request: TechnicianDayInput = {
      day,
      timezone,
      worker_id: worker,
      proposal:
        windows.length || hours.length
          ? { day, timezone, windows, hours, confirmed }
          : null,
    };
    input.current = request;
    try {
      const board = await readTechnicianDayBoard(
        repo,
        model.organization_id,
        model.actor,
        request,
      );
      if (mounted.current && token === current.current) setView(board);
    } catch (e) {
      if (mounted.current && token === current.current)
        setMessage(
          e instanceof Error
            ? e.message
            : 'Day board unavailable. Reload sources.',
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function inspect(job: string) {
    if (!view || pending.current) return;
    pending.current = true;
    const token = ++current.current;
    setBusy(true);
    setMessage('');
    try {
      const source = await openTechnicianDayBoardSource(view, job);
      if (mounted.current && token === current.current) onSource(source);
    } catch {
      if (mounted.current && token === current.current) {
        setView(null);
        setMessage(
          'Exact source changed or access unavailable. Reload field records.',
        );
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="technician-day-board" aria-labelledby="day-board-title">
      <div className="tdb-heading">
        <span className="wo-kicker">PEOPLE / EVIDENCE / PROPOSED DAY</span>
        <h3 id="day-board-title">Technician day board</h3>
        <p>
          A readable day for each current technician, with exact work-order and
          property evidence.
        </p>
      </div>
      <p className="tdb-boundary">
        Read-only local review · actual availability UNKNOWN. Proposed windows
        are human review inputs, never dispatch. A date-only property visit has
        no verified time or technician appointment.
      </p>
      <div className="tdb-controls">
        <label>
          Board day
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
              setHoursStart(e.target.value + 'T08:00');
              setHoursEnd(e.target.value + 'T16:00');
            }}
          />
        </label>
        <label>
          Board timezone
          <input
            value={timezone}
            onChange={(e) => {
              invalidate();
              setTimezone(e.target.value);
            }}
          />
        </label>
        <label>
          Board technician
          <select
            value={worker}
            onChange={(e) => {
              invalidate();
              setWorker(e.target.value);
              setSource('');
            }}
          >
            <option value="">All authorized technicians</option>
            {crew.map((w) => (
              <option key={w.worker_id} value={w.worker_id}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {model.manager && (
        <details className="tdb-proposals">
          <summary>Review optional human proposals</summary>
          <p>
            Temporary windows and working hours only. Use current job crew
            relationships; none are assigned here.
          </p>
          <div className="tdb-controls">
            <label>
              Board proposal source
              <select
                value={source}
                onChange={(e) => {
                  invalidate();
                  setSource(e.target.value);
                }}
              >
                <option value="">Choose an assigned source</option>
                {targets.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Board window start
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
              Board window end
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => {
                  invalidate();
                  setEnd(e.target.value);
                }}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={!source || !worker || windows.length >= 32}
            onClick={() => {
              invalidate();
              const target = targets.find((t) => t.key === source);
              if (target)
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
            }}
          >
            Add board window
          </button>
          <div className="tdb-controls">
            <label>
              Board hours start
              <input
                type="datetime-local"
                value={hoursStart}
                onChange={(e) => {
                  invalidate();
                  setHoursStart(e.target.value);
                }}
              />
            </label>
            <label>
              Board hours end
              <input
                type="datetime-local"
                value={hoursEnd}
                onChange={(e) => {
                  invalidate();
                  setHoursEnd(e.target.value);
                }}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={!worker || hours.length >= 32}
            onClick={() => {
              invalidate();
              setHours([
                ...hours,
                { worker_id: worker, start: hoursStart, end: hoursEnd },
              ]);
            }}
          >
            Add board proposed hours
          </button>
          <p>
            {windows.length} proposed window(s) · {hours.length} proposed-hours
            period(s)
          </p>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              invalidate();
              setWindows([]);
              setHours([]);
            }}
          >
            Clear board proposals
          </button>
          {!!(windows.length || hours.length) && (
            <label className="tdb-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => {
                  invalidate();
                  setConfirmed(e.target.checked);
                }}
              />
              I confirm these exact temporary windows and hours for review only
            </label>
          )}
        </details>
      )}
      <button
        type="button"
        disabled={busy || (!!(windows.length || hours.length) && !confirmed)}
        onClick={() => void load()}
      >
        {busy ? 'Reading exact day sources…' : 'Review technician day'}
      </button>
      {busy && (
        <p role="status">
          Reading current work orders, crew and property evidence…
        </p>
      )}
      {message && (
        <p className="tdb-error" role="alert">
          {message}
        </p>
      )}
      {view && (
        <section
          className="tdb-result"
          ref={result}
          tabIndex={-1}
          aria-label="Current technician day evidence"
        >
          <div className="tdb-heading">
            <h4>
              {view.day} · {view.timezone}
            </h4>
            <p>
              {view.organization_id} · {view.civil_day_minutes} civil-day
              minutes · available records only
            </p>
            <p>
              Actual availability UNKNOWN ·{' '}
              {view.proposal_review === 'NOT_REQUESTED'
                ? 'No capacity proposal reviewed'
                : 'Explicit human proposals reviewed'}
            </p>
          </div>
          {!view.lanes.length && (
            <p>No current authorized technicians are available in this view.</p>
          )}
          <p>
            {view.duplicate_proposals_ignored} exact duplicate proposal(s)
            ignored in capacity totals.
          </p>
          <div className="tdb-lanes">
            {view.lanes.map((lane) => (
              <article key={lane.worker_id} className="tdb-lane">
                <h4>{lane.label}</h4>
                <p className="tdb-muted">
                  {lane.worker_id} · job crew relationship only
                </p>
                {lane.capacity && (
                  <dl>
                    <dt>Union proposed work</dt>
                    <dd>{duration(lane.capacity.planned_minutes)}</dd>
                    <dt>Proposed working hours</dt>
                    <dd>
                      {duration(lane.capacity.proposed_available_minutes)}
                    </dd>
                    <dt>Outside proposed hours</dt>
                    <dd>
                      {duration(lane.capacity.outside_proposed_hours_minutes)}
                    </dd>
                    <dt>Capacity review</dt>
                    <dd>{lane.capacity.capacity_state.replaceAll('_', ' ')}</dd>
                  </dl>
                )}
                {!!lane.conflicts.length && (
                  <div className="tdb-conflicts">
                    <strong>{lane.conflicts.length} timed conflict(s)</strong>
                    <ul>
                      {lane.conflicts.map((conflict, i) => (
                        <li key={i}>
                          {conflictNames[conflict.kind]} ·{' '}
                          {duration(conflict.minutes)}
                          <small>
                            {conflict.first} ↔ {conflict.second}
                          </small>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!lane.events.length && (
                  <p className="tdb-empty">
                    No accessible dated visits, timestamp records or proposed
                    windows for this technician/day. This does not prove
                    availability.
                  </p>
                )}
                <ol>
                  {lane.events.map((entry, i) => (
                    <li
                      key={i}
                      className={'tdb-event tdb-' + entry.kind.toLowerCase()}
                    >
                      <strong>
                        {entry.kind === 'DATE_ONLY_VISIT'
                          ? 'Date-only visit · TIME UNKNOWN'
                          : entry.kind === 'PROPOSED_WINDOW'
                            ? 'Human-proposed window'
                            : 'Recorded timestamp evidence'}
                      </strong>
                      <h5>{entry.description}</h5>
                      <p>
                        {entry.title} · {entry.customer_label}
                      </p>
                      <p>{entry.property_label ?? 'Property UNKNOWN'}</p>
                      <p>
                        {entry.start ? (
                          <>
                            {entry.start} → {entry.end ?? 'End UNKNOWN'} ·{' '}
                            {entry.timezone}
                          </>
                        ) : (
                          <>
                            {entry.date} · {entry.timezone} · appointment time
                            UNKNOWN
                          </>
                        )}
                      </p>
                      <details>
                        <summary>Exact source identity</summary>
                        <dl>
                          <dt>Job / revision</dt>
                          <dd>
                            {entry.job_id} / {entry.job_revision}
                          </dd>
                          <dt>Estimate</dt>
                          <dd>{entry.estimate_id}</dd>
                          <dt>Issued version</dt>
                          <dd>
                            {entry.issued_version_id} / v
                            {entry.issued_version_number}
                          </dd>
                          <dt>Customer / property</dt>
                          <dd>
                            {entry.customer_id} /{' '}
                            {entry.property_id ?? 'UNKNOWN'}
                          </dd>
                          {entry.visit_id && (
                            <>
                              <dt>Visit / plan revisions</dt>
                              <dd>
                                {entry.visit_id} / r{entry.visit_revision} ·{' '}
                                {entry.plan_id} / r{entry.plan_revision}
                              </dd>
                            </>
                          )}
                          {entry.recorded_id && (
                            <>
                              <dt>Recorded segment</dt>
                              <dd>{entry.recorded_id}</dd>
                            </>
                          )}
                        </dl>
                      </details>
                      <button
                        className="secondary"
                        type="button"
                        disabled={busy}
                        onClick={() => void inspect(entry.job_id)}
                      >
                        Open board source · {entry.title}
                      </button>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
          {!!view.recorded_issues.length && (
            <p>{view.recorded_issues.join(' · ')}</p>
          )}
          <p>
            Recorded timestamps may include breaks and incomplete history. No
            physical completion, customer approval, payroll or dispatch is
            established.
          </p>
        </section>
      )}
    </section>
  );
}
