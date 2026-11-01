import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompanyProfile } from '../../domain/platform';
import type { PropertyRepository } from '../../lib/property';
import {
  confirmCrewAssignment,
  dailyCrewSchedule,
  openFieldWorkOrder,
  readFieldWorkOrders,
  reconcileCrewAssignment,
  reviewCrewAssignment,
  type CrewAssignmentReview,
  type WorkOrder,
} from '../../lib/field-work-orders';
import { useResource } from '../forms-state';
import './field-work-orders.css';

export function FieldWorkOrdersPreview({
  company,
  repo,
}: {
  company: CompanyProfile;
  repo: PropertyRepository;
}) {
  const [actor, setActor] = useState(company.id + '-owner');
  return (
    <section className="field-work-orders" aria-labelledby="work-orders-title">
      <div className="wo-heading">
        <div>
          <span className="field-eyebrow">
            JOB SCOPE / PEOPLE / PROPERTY DAY
          </span>
          <h2 id="work-orders-title">Work orders & crew day</h2>
          <p>
            One exact job baseline. Current sample crew. Existing inspection
            dates.
          </p>
        </div>
        <label>
          Sample staff view
          <select value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value={company.id + '-owner'}>
              Office reviewer · Alex
            </option>
            <option value={company.id + '-field'}>Technician · Sam</option>
          </select>
        </label>
      </div>
      <p className="wo-boundary">
        Local sample only · crew relationships do not dispatch work. Inspection
        dates and recorded time do not establish repair completion.
      </p>
      <CrewDay key={actor} company={company} repo={repo} actor={actor} />
    </section>
  );
}
function CrewDay({
  company,
  repo,
  actor,
}: {
  company: CompanyProfile;
  repo: PropertyRepository;
  actor: string;
}) {
  const [generation, setGeneration] = useState(0);
  const resource = useResource(
    useCallback(async () => {
      await repo.initialize(company);
      return {
        ...(await readFieldWorkOrders(repo, company.id, actor)),
        generation,
      };
    }, [repo, company, actor, generation]),
  );
  const [day, setDay] = useState('2026-10-16');
  const [worker, setWorker] = useState('');
  const [property, setProperty] = useState('');
  const [selected, setSelected] = useState<WorkOrder | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [simulateError, setSimulateError] = useState(false);
  const [target, setTarget] = useState('');
  const [review, setReview] = useState<CrewAssignmentReview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [outcome, setOutcome] = useState<'PREPARED' | 'UNKNOWN' | null>(null);
  const detail = useRef<HTMLElement>(null),
    reviewDetail = useRef<HTMLElement>(null),
    result = useRef<HTMLDivElement>(null);
  const active = useRef(true),
    sequence = useRef(0),
    submitted = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (selected) detail.current?.focus();
  }, [selected]);
  useEffect(() => {
    if (review) reviewDetail.current?.focus();
  }, [review]);
  useEffect(() => {
    if (outcome) result.current?.focus();
  }, [outcome]);
  const resetDetail = () => {
    sequence.current++;
    setSelected(null);
    setReview(null);
    setOutcome(null);
    setConfirmed(false);
    setTarget('');
    setMessage('');
  };
  const reload = () => {
    resetDetail();
    setSimulateError(false);
    setGeneration((value) => value + 1);
  };
  const hidden = !resource.error && resource.data?.generation !== generation;
  const available =
    !!resource.data &&
    !resource.loading &&
    !resource.error &&
    !hidden &&
    !simulateError;
  const model = available ? resource.data : undefined;
  let dateError = '',
    daily: ReturnType<typeof dailyCrewSchedule> = { visits: [], recorded: [] };
  try {
    if (model) daily = dailyCrewSchedule(model, day, worker, property);
  } catch {
    dateError = 'Choose a valid calendar date.';
  }
  const properties = [
    ...new Map(
      (model?.orders ?? []).flatMap((o) =>
        o.visits.map((v) => [v.location_id, v.property_label] as const),
      ),
    ).entries(),
  ];
  const orders = (model?.orders ?? []).filter(
    (o) =>
      (!worker || o.crew.some((w) => w.worker_id === worker)) &&
      (!property ||
        o.baseline_property?.id === property ||
        o.visits.some((v) => v.location_id === property)),
  );
  async function open(order: WorkOrder) {
    resetDetail();
    const token = sequence.current;
    setBusy(true);
    try {
      const current = await openFieldWorkOrder(repo, company.id, actor, order);
      if (active.current && token === sequence.current) setSelected(current);
    } catch {
      if (active.current && token === sequence.current)
        setMessage(
          'Work-order source changed or access unavailable. Reload field records.',
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function prepareReview() {
    if (!selected || busy) return;
    setBusy(true);
    setMessage('');
    setConfirmed(false);
    setReview(null);
    setOutcome(null);
    const token = ++sequence.current;
    try {
      const current = await reviewCrewAssignment(
        repo,
        company.id,
        actor,
        selected,
        target,
      );
      if (active.current && token === sequence.current) {
        submitted.current = false;
        setReview(current);
      }
    } catch (e) {
      if (active.current && token === sequence.current)
        setMessage(
          e instanceof Error
            ? e.message
            : 'Crew review unavailable. Reload field records.',
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function assign() {
    if (!review || submitted.current || !confirmed) return;
    submitted.current = true;
    setBusy(true);
    setMessage('');
    const token = ++sequence.current;
    try {
      const current = await confirmCrewAssignment(review, confirmed);
      if (active.current && token === sequence.current) {
        setOutcome(current.status);
        setSelected(null);
      }
    } catch (e) {
      if (active.current && token === sequence.current)
        setMessage(
          e instanceof Error
            ? e.message
            : 'Crew review changed. Reload field records.',
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (!review || busy) return;
    setBusy(true);
    const token = ++sequence.current;
    const current = await reconcileCrewAssignment(review);
    if (active.current && token === sequence.current)
      setOutcome(current.status);
    if (active.current) setBusy(false);
  }
  const filter = (change: () => void) => {
    resetDetail();
    change();
  };
  return (
    <>
      <div className="wo-controls">
        <label>
          Property day
          <input
            type="date"
            value={day}
            onChange={(e) => filter(() => setDay(e.target.value))}
          />
        </label>
        <label>
          Crew member
          <select
            value={worker}
            disabled={!model}
            onChange={(e) => filter(() => setWorker(e.target.value))}
          >
            <option value="">All visible crew</option>
            {model?.crew.map((w) => (
              <option key={w.worker_id} value={w.worker_id}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Inspection property
          <select
            value={property}
            disabled={!model}
            onChange={(e) => filter(() => setProperty(e.target.value))}
          >
            <option value="">All visible properties</option>
            {properties.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary"
          disabled={resource.loading || busy}
          onClick={reload}
        >
          Reload field records
        </button>
      </div>
      {message && (
        <p className="wo-state" role="alert">
          {message}
        </p>
      )}
      {resource.loading || hidden ? (
        <p className="wo-state" role="status">
          Loading current job and crew records…
        </p>
      ) : !model ? (
        <div className="wo-state" role="alert">
          <h3>Field records unavailable</h3>
          <p>Reload to inspect current accessible records.</p>
        </div>
      ) : (
        <>
          <div className="wo-grid">
            <section className="wo-jobs" aria-labelledby="wo-available">
              <h3 id="wo-available">Available work orders</h3>
              <p>{orders.length} visible job baseline(s)</p>
              {!orders.length ? (
                <p className="wo-state">
                  No work orders match the current crew, property or active
                  assignment. A staff view does not grant job access.
                </p>
              ) : (
                <ul className="wo-list">
                  {orders.map((order) => (
                    <li key={order.source.job_id}>
                      <span className="wo-kicker">
                        ISSUED BASELINE V{order.source.issued_version_number}
                      </span>
                      <h4>{order.title}</h4>
                      <p>{order.customer.label}</p>
                      <p>
                        <b>Crew</b>{' '}
                        {order.crew.length
                          ? order.crew.map((w) => w.label).join(', ')
                          : 'UNKNOWN · no active verified relationship'}
                      </p>
                      <p>
                        <b>Baseline property</b>{' '}
                        {order.baseline_property?.label ??
                          'UNKNOWN · no retained property ID'}
                      </p>
                      <button disabled={busy} onClick={() => void open(order)}>
                        Open work order · {order.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="wo-day" aria-labelledby="wo-day-title">
              <h3 id="wo-day-title">
                Daily crew view · {day || 'choose a date'}
              </h3>
              <p>
                Inspection dates use each plan’s timezone. No time slot,
                availability or conflict check is recorded.
              </p>
              {dateError ? (
                <p role="alert">{dateError}</p>
              ) : (
                <>
                  <h4>Dated inspection visits</h4>
                  {!daily.visits.length ? (
                    <p className="wo-empty">
                      No exact linked inspection visits on this property day.
                      Future work schedule remains UNKNOWN.
                    </p>
                  ) : (
                    <ul className="wo-list">
                      {daily.visits.map(({ order, visit }) => (
                        <li key={visit.id}>
                          <span className="wo-kicker">
                            {visit.status} inspection · {visit.timezone}
                          </span>
                          <h4>{visit.property_label}</h4>
                          <p>
                            {visit.plan_name} · {order.title}
                          </p>
                          <p>
                            Crew:{' '}
                            {order.crew.map((w) => w.label).join(', ') ||
                              'UNKNOWN · unassigned'}
                          </p>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => void open(order)}
                          >
                            Inspect work-order source · {visit.plan_name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <h4>Recorded crew time</h4>
                  <p>
                    Existing segments in {model.timezone}; recorded time is not
                    a planned shift or proof of completion.
                  </p>
                  {!daily.recorded.length ? (
                    <p className="wo-empty">
                      No visible assigned-crew segments overlap this day.
                    </p>
                  ) : (
                    <ul className="wo-list">
                      {daily.recorded.map(({ order, entry }) => (
                        <li key={entry.id}>
                          <h4>
                            {
                              order.crew.find(
                                (w) => w.worker_id === entry.worker_id,
                              )?.label
                            }
                          </h4>
                          <p>
                            {order.title} · {entry.kind.replaceAll('_', ' ')}
                          </p>
                          <p>
                            <time dateTime={entry.started_at}>
                              {entry.started_at}
                            </time>{' '}
                            →{' '}
                            {entry.ended_at ? (
                              <time dateTime={entry.ended_at}>
                                {entry.ended_at}
                              </time>
                            ) : (
                              'End UNKNOWN'
                            )}
                          </p>
                          <button
                            className="secondary"
                            onClick={() => void open(order)}
                          >
                            Inspect recorded-time source · {order.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          </div>
          {selected && (
            <section
              className="wo-detail"
              ref={detail}
              tabIndex={-1}
              aria-labelledby="wo-detail-title"
            >
              <div className="wo-heading">
                <h3 id="wo-detail-title">Technician work-order detail</h3>
                <button className="secondary" onClick={resetDetail}>
                  Close work order
                </button>
              </div>
              <h4>{selected.title}</h4>
              <p>{selected.customer.label}</p>
              <dl>
                <dt>Organization ID</dt>
                <dd>{selected.source.organization_id}</dd>
                <dt>Job ID / revision</dt>
                <dd>
                  {selected.source.job_id} / {selected.source.job_revision}
                </dd>
                <dt>Estimate ID</dt>
                <dd>{selected.source.estimate_id}</dd>
                <dt>Issued version ID / number</dt>
                <dd>
                  {selected.source.issued_version_id} /{' '}
                  {selected.source.issued_version_number}
                </dd>
                <dt>Customer ID</dt>
                <dd>{selected.customer.id}</dd>
                <dt>Baseline property ID</dt>
                <dd>
                  {selected.baseline_property?.id ??
                    'UNKNOWN · issued source has no property association'}
                </dd>
                <dt>Current crew relationship</dt>
                <dd>
                  {selected.assignment_state} ·{' '}
                  {selected.crew.map((w) => w.label).join(', ') ||
                    'No active verified relationship'}
                </dd>
              </dl>
              <h4>Issued job scope</h4>
              <ul className="wo-scope">
                {selected.scope.map((line) => (
                  <li key={line.id}>
                    <b>{line.description}</b>
                    <span>
                      {line.quantity_milli / 1000}{' '}
                      {line.unit.replaceAll('_', ' ')} · source line {line.id}
                    </span>
                  </li>
                ))}
              </ul>
              <h4>Exact linked inspection sources</h4>
              {selected.visits.length ? (
                selected.visits.map((visit) => (
                  <dl key={visit.id}>
                    <dt>Property / ID</dt>
                    <dd>
                      {visit.property_label} / {visit.location_id}
                    </dd>
                    <dt>Plan ID / revision</dt>
                    <dd>
                      {visit.plan_id} / {visit.plan_revision}
                    </dd>
                    <dt>Visit ID / revision</dt>
                    <dd>
                      {visit.id} / {visit.revision}
                    </dd>
                    <dt>Recorded date / status</dt>
                    <dd>
                      {visit.date} · {visit.timezone} · {visit.status}
                    </dd>
                  </dl>
                ))
              ) : (
                <p>UNKNOWN · no exact linked inspection visit.</p>
              )}
              {selected.recorded_time.length > 0 && (
                <>
                  <h4>Exact recorded-time source IDs</h4>
                  <ul className="wo-scope">
                    {selected.recorded_time.map((entry) => (
                      <li key={entry.id}>
                        {entry.id} · worker {entry.worker_id}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {model.manager && (
                <div className="wo-assignment">
                  <h4>Review local crew relationship</h4>
                  <p>
                    Choose an existing active sample worker. This grants a local
                    sample job relationship only.
                  </p>
                  <label>
                    Worker for this job
                    <select
                      value={target}
                      onChange={(e) => {
                        setTarget(e.target.value);
                        setReview(null);
                        setConfirmed(false);
                        setOutcome(null);
                      }}
                    >
                      <option value="">Choose worker</option>
                      {model.crew
                        .filter(
                          (w) =>
                            !selected.crew.some((c) => c.user_id === w.user_id),
                        )
                        .map((w) => (
                          <option key={w.user_id} value={w.user_id}>
                            {w.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    disabled={!target || busy}
                    onClick={() => void prepareReview()}
                  >
                    Review exact crew relationship
                  </button>
                </div>
              )}
            </section>
          )}
          {review && !outcome && (
            <section
              className="wo-review"
              ref={reviewDetail}
              tabIndex={-1}
              aria-labelledby="wo-review-title"
            >
              <h3 id="wo-review-title">
                Confirm exact local crew relationship
              </h3>
              <p>
                {review.order.title} · {review.target.label}
              </p>
              <dl>
                <dt>Job ID</dt>
                <dd>{review.order.source.job_id}</dd>
                <dt>Worker ID</dt>
                <dd>{review.target.worker_id}</dd>
                <dt>Member ID</dt>
                <dd>{review.target.user_id}</dd>
                <dt>Current relationship</dt>
                <dd>
                  {review.current_active === null
                    ? 'No retained relationship'
                    : 'Inactive'}
                </dd>
              </dl>
              <label className="wo-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I reviewed this exact job, current sample worker and source.
                Retain this local crew relationship.
              </label>
              <button
                disabled={!confirmed || busy}
                onClick={() => void assign()}
              >
                Confirm local crew relationship
              </button>
            </section>
          )}
          {outcome && (
            <div className="wo-result" ref={result} tabIndex={-1} role="status">
              <h3>
                {outcome === 'PREPARED'
                  ? 'Local crew relationship retained'
                  : 'Crew relationship outcome UNKNOWN'}
              </h3>
              <p>
                {outcome === 'PREPARED'
                  ? 'Reload field records or switch to the technician view to inspect the current assigned job.'
                  : 'No retry or replacement. Inspect only the exact retained attempt.'}{' '}
                No dispatch occurred.
              </p>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void reconcile()}
              >
                Inspect exact assignment read-only
              </button>
            </div>
          )}
        </>
      )}
      <details className="wo-development">
        <summary>Work-order development states</summary>
        <p>
          Sample selectors and this state simulation confer no connected access.
          Refresh clears local sample custody.
        </p>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            resetDetail();
            setSimulateError(true);
          }}
        >
          Simulate field read error
        </button>
      </details>
    </>
  );
}
