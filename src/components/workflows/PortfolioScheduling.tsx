import { useEffect, useRef, useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import type { OperatingSources } from '../../lib/workflows/operating-center-runtime';
import {
  readPortfolioScheduling,
  reconcilePortfolioScheduling,
  openPortfolioSchedulingJob,
  type PortfolioSchedulingView,
  type PortfolioSchedulingProposal,
} from '../../lib/workflows/portfolio-scheduling';
import './portfolio-scheduling.css';
export interface PortfolioSchedulingProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
export function PortfolioScheduling(props: PortfolioSchedulingProps) {
  const [context, setContext] = useState({ sources: props.sources, epoch: 0 });
  if (context.sources !== props.sources) {
    setContext({ sources: props.sources, epoch: context.epoch + 1 });
    return null;
  }
  const enabled =
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: props.enabled === true ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    });
  return enabled ? (
    <SchedulingReview key={context.epoch} {...props} />
  ) : (
    <section
      className="portfolio-scheduling"
      aria-label="Multi-job weekly scheduling"
      role="region"
    >
      <h2>Multi-job scheduling is off</h2>
      <p>No assignment or dispatch is enabled.</p>
    </section>
  );
}
function SchedulingReview({ sources, onSelectJob }: PortfolioSchedulingProps) {
  const first = sources.entries[0];
  const [week, setWeek] = useState(first?.day ?? ''),
    [jobFilter, setJobFilter] = useState(''),
    [workerFilter, setWorkerFilter] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [view, setView] = useState<PortfolioSchedulingView | null>(null),
    [choices, setChoices] = useState<PortfolioSchedulingView['jobs']>([]),
    [proposals, setProposals] = useState<PortfolioSchedulingProposal[]>([]),
    [proposalJob, setProposalJob] = useState(''),
    [proposalDay, setProposalDay] = useState(first?.day ?? ''),
    [start, setStart] = useState('09:00'),
    [end, setEnd] = useState('11:00'),
    [hoursStart, setHoursStart] = useState('08:00'),
    [hoursEnd, setHoursEnd] = useState('16:00'),
    [hasRetained, setHasRetained] = useState(false),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [detail, setDetail] = useState<Awaited<
      ReturnType<typeof openPortfolioSchedulingJob>
    > | null>(null);
  const generation = useRef(0),
    pending = useRef(false),
    live = useRef(true),
    gates = useRef<{ enabled: boolean; confirmed: boolean }[]>([]),
    activeGate = useRef<{ enabled: boolean; confirmed: boolean } | null>(null),
    retained = useRef<PortfolioSchedulingView | null>(null),
    heading = useRef<HTMLHeadingElement>(null),
    sourceHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    live.current = true;
    const gs = gates.current;
    return () => {
      live.current = false;
      for (const g of gs) g.confirmed = false;
    };
  }, []);
  useEffect(() => {
    if (view) heading.current?.focus();
  }, [view]);
  useEffect(() => {
    if (detail) sourceHeading.current?.focus();
  }, [detail]);
  function invalidate() {
    generation.current++;
    if (activeGate.current) activeGate.current.confirmed = false;
    setConfirmed(false);
    setView(null);
    setDetail(null);
    setMessage('');
    setError('');
  }
  async function load() {
    if (!confirmed || pending.current || unknown) return;
    const token = ++generation.current,
      gate = { enabled: true, confirmed: true };
    gates.current.push(gate);
    activeGate.current = gate;
    pending.current = true;
    setBusy(true);
    setError('');
    setView(null);
    setDetail(null);
    try {
      const result = await readPortfolioScheduling(
        sources,
        {
          week_start: week,
          timezone: first.timezone,
          job_id: jobFilter,
          worker_id: workerFilter,
          proposals,
        },
        gate,
      );
      if (live.current && token === generation.current) {
        setView(result);
        setChoices(result.jobs);
        retained.current = result;
        setHasRetained(true);
        setMessage(
          'Seven-day company review loaded. Actual availability remains UNKNOWN.',
        );
      }
    } catch {
      if (live.current && token === generation.current) {
        setUnknown(true);
        setChoices([]);
        setError(
          'Current scheduling evidence is UNKNOWN. No schedule changed. Only exact retained read reconciliation is available.',
        );
      }
    } finally {
      pending.current = false;
      activeGate.current = null;
      if (live.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (pending.current || !retained.current) return;
    pending.current = true;
    setBusy(true);
    const token = generation.current;
    try {
      const result = await reconcilePortfolioScheduling(retained.current);
      if (live.current && token === generation.current)
        setMessage(
          result.status === 'CURRENT_REVIEW_ONLY'
            ? 'Exact retained evidence still matches. No proposal applied.'
            : 'Retained source is UNKNOWN. No replacement or replay.',
        );
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function open(job: string) {
    if (!view || pending.current) return;
    pending.current = true;
    setBusy(true);
    const token = generation.current;
    try {
      const result = await openPortfolioSchedulingJob(view, job);
      if (live.current && token === generation.current) {
        setDetail(result);
        onSelectJob?.(result.job_id);
      }
    } catch {
      if (live.current && token === generation.current) {
        setView(null);
        setDetail(null);
        setUnknown(true);
        setError('Selected source is UNKNOWN or changed; navigation withheld.');
      }
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  const selected =
      choices.find((j) => j.source.job_id === proposalJob) ?? choices[0],
    workers = [
      ...new Map(
        choices.flatMap((j) => j.crew).map((w) => [w.worker_id, w]),
      ).values(),
    ];
  function addProposal() {
    if (!selected?.crew[0] || !selected.visits[0] || proposals.length >= 32)
      return;
    const visit =
      selected.visits.find(
        (v) =>
          v.id ===
          sources.entries.find(
            (e) => e.target.job_id === selected.source.job_id,
          )?.scheduled_visit_id,
      ) ?? selected.visits[0];
    const row = {
      job_id: selected.source.job_id,
      day: proposalDay,
      source_visit_id: visit.id,
      worker_id: selected.crew[0].worker_id,
      start: start ? proposalDay + 'T' + start : null,
      end: end ? proposalDay + 'T' + end : null,
      hours_start: hoursStart ? proposalDay + 'T' + hoursStart : null,
      hours_end: hoursEnd ? proposalDay + 'T' + hoursEnd : null,
    };
    invalidate();
    setProposals([...proposals, row]);
  }
  return (
    <section
      className="portfolio-scheduling"
      role="region"
      aria-label="Multi-job weekly scheduling"
    >
      <div className="ps-header">
        <div>
          <p className="ps-eyebrow">FIELD OPERATIONS · LOCAL REVIEW</p>
          <h2>Weekly crew operating board</h2>
          <p>
            Review admitted jobs together, with exact customer, property and
            crew evidence.
          </p>
        </div>
        <span className="ps-badge">Availability UNKNOWN</span>
      </div>
      <p className="ps-boundary">
        Available admitted records only. Date-only appointments do not reserve a
        time. Working hours and timed windows are unsaved human proposals; no
        assignment, dispatch or synchronization occurs.
      </p>
      <div className="ps-card">
        <div className="ps-fields">
          <label>
            Week starts
            <input
              type="date"
              value={week}
              onChange={(e) => {
                invalidate();
                setWeek(e.target.value);
              }}
            />
          </label>
          <label>
            Job filter
            <select
              value={jobFilter}
              onChange={(e) => {
                invalidate();
                setJobFilter(e.target.value);
              }}
            >
              <option value="">All admitted jobs</option>
              {choices.map((j) => (
                <option key={j.source.job_id} value={j.source.job_id}>
                  {j.customer.label} · {j.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Technician filter
            <select
              value={workerFilter}
              onChange={(e) => {
                invalidate();
                setWorkerFilter(e.target.value);
              }}
            >
              <option value="">All assigned technicians</option>
              {workers.map((w) => (
                <option key={w.worker_id} value={w.worker_id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="ps-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => {
              setConfirmed(e.target.checked);
              if (!e.target.checked) invalidate();
            }}
          />
          I confirm this is an unsaved, source-bound scheduling review.
        </label>
        <button
          disabled={!confirmed || busy || unknown}
          onClick={() => void load()}
        >
          {busy ? 'Reviewing sources…' : 'Review multi-job week'}
        </button>
        {hasRetained && (
          <button disabled={busy} onClick={() => void reconcile()}>
            Check exact retained sources
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {choices.length > 0 && !unknown && (
        <details className="ps-card">
          <summary>Detached timed proposal review</summary>
          <p>
            Add source-bound windows across jobs to inspect canonical conflicts.
            The first existing assigned technician is named explicitly; this
            does not change crew.
          </p>
          <div className="ps-fields">
            <label>
              Proposal job
              <select
                value={selected?.source.job_id ?? ''}
                onChange={(e) => {
                  invalidate();
                  setProposalJob(e.target.value);
                }}
              >
                {choices.map((j) => (
                  <option key={j.source.job_id} value={j.source.job_id}>
                    {j.customer.label} · {j.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Proposal day
              <input
                type="date"
                value={proposalDay}
                onChange={(e) => {
                  invalidate();
                  setProposalDay(e.target.value);
                }}
              />
            </label>
            <label>
              Window start
              <input
                type="time"
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
                type="time"
                value={end}
                onChange={(e) => {
                  invalidate();
                  setEnd(e.target.value);
                }}
              />
            </label>
            <label>
              Proposed working hours start
              <input
                type="time"
                value={hoursStart}
                onChange={(e) => {
                  invalidate();
                  setHoursStart(e.target.value);
                }}
              />
            </label>
            <label>
              Proposed working hours end
              <input
                type="time"
                value={hoursEnd}
                onChange={(e) => {
                  invalidate();
                  setHoursEnd(e.target.value);
                }}
              />
            </label>
          </div>
          <p>
            Existing assigned technician:{' '}
            {selected?.crew[0]?.label ?? 'UNKNOWN'}. Original visit retained;
            alternate days are job windows.
          </p>
          <button
            disabled={busy || proposals.length >= 32}
            onClick={addProposal}
          >
            Add detached window
          </button>
          <button
            disabled={busy || !proposals.length}
            onClick={() => {
              invalidate();
              setProposals([]);
            }}
          >
            Clear detached windows
          </button>
          <ul>
            {proposals.map((p, i) => (
              <li key={i}>
                {p.day} · {p.start?.slice(11) ?? 'time UNKNOWN'}–
                {p.end?.slice(11) ?? 'UNKNOWN'} · job {p.job_id}
              </li>
            ))}
          </ul>
        </details>
      )}
      {view && (
        <>
          <h3 ref={heading} tabIndex={-1}>
            Seven-day evidence · {view.matching_jobs} of {view.available_jobs}{' '}
            admitted jobs
          </h3>
          <p>
            Capacity uses canonical authorized company records and all explicit
            proposals, even when displayed events are filtered.
          </p>
          <div className="ps-jobs">
            {view.jobs
              .filter(
                (j) =>
                  !view.filters.job_id ||
                  j.source.job_id === view.filters.job_id,
              )
              .map((j) => (
                <article className="ps-card" key={j.source.job_id}>
                  <h4>{j.customer.label}</h4>
                  <p>{j.property.label}</p>
                  <p>
                    {j.title} · issued version {j.source.issued_version_number}
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => void open(j.source.job_id)}
                  >
                    Open exact job source
                  </button>
                </article>
              ))}
          </div>
          <div className="ps-week">
            {view.days.map((day) => (
              <article className="ps-day" key={day.day}>
                <h4>{day.day}</h4>
                <p>{day.civil_day_minutes} civil-day minutes</p>
                {day.lanes.map((l) => (
                  <div className="ps-lane" key={l.worker_id}>
                    <h5>{l.label}</h5>
                    <p>
                      Planned {l.capacity?.planned_minutes ?? 'UNKNOWN'} min ·
                      proposed hours{' '}
                      {l.capacity?.proposed_available_minutes ?? 'UNKNOWN'}
                    </p>
                    <p>
                      {l.conflicts.length} canonical conflict record(s) ·
                      availability UNKNOWN
                    </p>
                    {l.conflicts.map((c, i) => (
                      <p className="ps-conflict" key={i}>
                        Conflict · {c.kind.replaceAll('_', ' ')} · {c.minutes}{' '}
                        min
                      </p>
                    ))}
                    {!l.events.length ? (
                      <p>
                        No matching recorded events. Availability remains
                        UNKNOWN.
                      </p>
                    ) : (
                      l.events.map((e, i) => (
                        <div className="ps-event" key={i}>
                          <strong>{e.kind.replaceAll('_', ' ')}</strong>
                          <p>
                            {e.customer_label} ·{' '}
                            {e.property_label ?? 'Property UNKNOWN'}
                          </p>
                          <p>{e.description}</p>
                          <p>
                            {e.start ?? e.date ?? 'time UNKNOWN'}
                            {e.end ? ' → ' + e.end : ''} ·{' '}
                            {e.timing.replaceAll('_', ' ')}
                          </p>
                          <button
                            disabled={busy}
                            onClick={() => void open(e.job_id)}
                          >
                            Review event source
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </article>
            ))}
          </div>
        </>
      )}
      {detail && (
        <div className="ps-card">
          <h3 ref={sourceHeading} tabIndex={-1}>
            Exact selected scheduling source
          </h3>
          <p>{detail.title}</p>
          <dl>
            {Object.entries(detail)
              .filter(([k]) => k !== 'title')
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k.replaceAll('_', ' ')}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}
      {!view && !busy && !error && (
        <p className="ps-empty">
          Confirm a week to review available company evidence. No complete
          workforce or historical coverage is implied.
        </p>
      )}
      <p>
        Offline/source-sync, Storm Mode and Contractor Network remain
        review-only. No external crew or capacity is assumed.
      </p>
    </section>
  );
}
