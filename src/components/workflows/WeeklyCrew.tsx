import { useEffect, useRef, useState } from 'react';
import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import { fieldWorkflowEnabled } from '../../lib/workflows/field-workflow';
import {
  readWeeklyCrew,
  reconcileWeeklyCrew,
  compareWeeklyCrewSnapshots,
  type WeeklyCrewView,
  type WeeklyCrewProposal,
} from '../../lib/workflows/weekly-crew';
import './weekly-crew.css';

export interface WeeklyCrewProps {
  sources: LocalJourney;
  enabled?: boolean;
}
export function WeeklyCrew(props: WeeklyCrewProps) {
  const key = JSON.stringify([
    props.sources.target,
    props.sources.scheduled_visit_id,
    props.sources.day,
    props.enabled,
  ]);
  const [context, setContext] = useState({
    sources: props.sources,
    key,
    epoch: 0,
  });
  if (context.sources !== props.sources || context.key !== key) {
    setContext({ sources: props.sources, key, epoch: context.epoch + 1 });
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
    <WeeklyReview key={context.epoch} {...props} />
  ) : (
    <section
      className="weekly-crew"
      role="region"
      aria-label="Weekly crew scheduling review"
    >
      <h2>Weekly crew review is off</h2>
      <p>No scheduling or dispatch is enabled.</p>
    </section>
  );
}
type Event = WeeklyCrewView['days'][number]['lanes'][number]['events'][number];
function WeeklyReview({ sources }: WeeklyCrewProps) {
  const [week, setWeek] = useState(sources.day),
    [day, setDay] = useState(sources.day),
    [workerFilter, setWorkerFilter] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [base, setBase] = useState<WeeklyCrewView | null>(null),
    [view, setView] = useState<WeeklyCrewView | null>(null),
    [first, setFirst] = useState<WeeklyCrewView | null>(null),
    [comparison, setComparison] = useState<Awaited<
      ReturnType<typeof compareWeeklyCrewSnapshots>
    > | null>(null),
    [compareConfirmed, setCompareConfirmed] = useState(false),
    [proposals, setProposals] = useState<WeeklyCrewProposal[]>([]),
    [worker, setWorker] = useState(''),
    [visit, setVisit] = useState(sources.scheduled_visit_id),
    [proposalDay, setProposalDay] = useState(sources.day),
    [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [hoursStart, setHoursStart] = useState(''),
    [hoursEnd, setHoursEnd] = useState(''),
    [detail, setDetail] = useState<Event | null>(null),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [hasRetained, setHasRetained] = useState(false);
  const live = useRef(true),
    pending = useRef(false),
    epoch = useRef(0),
    gates = useRef<{ enabled: boolean; confirmed: boolean }[]>([]),
    pendingGate = useRef<{ enabled: boolean; confirmed: boolean } | null>(null),
    retained = useRef<WeeklyCrewView | null>(null),
    heading = useRef<HTMLHeadingElement>(null),
    sourceHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    live.current = true;
    const registered = gates.current;
    return () => {
      live.current = false;
      for (const gate of registered) gate.confirmed = false;
    };
  }, []);
  useEffect(() => {
    if (view) heading.current?.focus();
  }, [view]);
  useEffect(() => {
    if (detail) sourceHeading.current?.focus();
  }, [detail]);
  function invalidate() {
    epoch.current++;
    if (pendingGate.current) pendingGate.current.confirmed = false;
    setConfirmed(false);
    setCompareConfirmed(false);
    setComparison(null);
    setView(null);
    setDetail(null);
    setStatus('');
    setError('');
  }
  async function load() {
    if (!confirmed || pending.current || unknown) return;
    const token = ++epoch.current,
      gate = { enabled: true, confirmed: true };
    gates.current.push(gate);
    pendingGate.current = gate;
    pending.current = true;
    setBusy(true);
    setError('');
    setStatus('');
    setView(null);
    setComparison(null);
    try {
      const result = await readWeeklyCrew(
        sources,
        {
          week_start: week,
          timezone: sources.timezone,
          worker_id: '',
          proposals,
        },
        gate,
      );
      if (live.current && token === epoch.current) {
        setView(result);
        setBase(result);
        setDay(
          result.days.some((d) => d.day === day) ? day : result.week_start,
        );
        retained.current = result;
        setHasRetained(true);
        setStatus(
          'Seven-day source review loaded. Actual availability remains UNKNOWN.',
        );
      }
    } catch {
      if (live.current && token === epoch.current) {
        setUnknown(true);
        setBase(null);
        setError(
          'Weekly evidence is UNKNOWN or changed. No schedule was written. Only exact retained-source reconciliation is available; nothing will retry automatically.',
        );
      }
    } finally {
      pending.current = false;
      pendingGate.current = null;
      if (live.current) setBusy(false);
    }
  }
  async function verify() {
    if (!retained.current || pending.current) return;
    pending.current = true;
    setBusy(true);
    const token = ++epoch.current;
    const result = await reconcileWeeklyCrew(retained.current);
    if (live.current && token === epoch.current) {
      if (result.status === 'CURRENT_REVIEW_ONLY')
        setStatus(
          'The exact retained source matches available evidence. No lock, booking or dispatch was applied.',
        );
      else {
        setUnknown(true);
        setView(null);
        setBase(null);
        setDetail(null);
        setError(
          'Exact retained weekly evidence is UNKNOWN. No replacement, new assignment or replay was performed.',
        );
      }
    }
    pending.current = false;
    if (live.current) setBusy(false);
  }
  async function compare() {
    if (!first || !view || !compareConfirmed || pending.current || unknown)
      return;
    pending.current = true;
    setBusy(true);
    const token = ++epoch.current,
      gate = { enabled: true, confirmed: true };
    gates.current.push(gate);
    pendingGate.current = gate;
    const result = await compareWeeklyCrewSnapshots(
      first,
      view,
      {
        expected_first_sha256: first.integrity.sha256,
        expected_second_sha256: view.integrity.sha256,
      },
      gate,
    );
    if (live.current && token === epoch.current) {
      setComparison(result);
      if (result.status === 'UNKNOWN') {
        setUnknown(true);
        setView(null);
        setBase(null);
        setError(
          'Snapshot comparison is UNKNOWN. No proposal was applied or replayed.',
        );
      }
    }
    pending.current = false;
    pendingGate.current = null;
    if (live.current) setBusy(false);
  }
  const visibleDay = view?.days.find((d) => d.day === day),
    crew = base?.days[0].lanes ?? [];
  return (
    <section
      className="weekly-crew"
      role="region"
      aria-label="Weekly crew scheduling review"
    >
      <header className="wc-header">
        <div>
          <p className="wc-eyebrow">FIELD / SEVEN-DAY SOURCE REVIEW</p>
          <h2>Weekly crew scheduling review</h2>
        </div>
        <span className="wc-badge">Read only · not dispatch</span>
      </header>
      <p className="wc-boundary">
        Selected job/property and its assigned crew only. Recorded visits,
        recorded time and unsaved human proposals remain separate. Availability
        is always UNKNOWN.
      </p>
      <div className="wc-controls">
        <label>
          Week starting
          <input
            type="date"
            value={week}
            disabled={unknown}
            onChange={(event) => {
              invalidate();
              setWeek(event.target.value);
              setProposals([]);
              setBase(null);
              setFirst(null);
            }}
          />
        </label>
        <p>Calendar days use {sources.timezone}.</p>
      </div>
      <label className="wc-check">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={unknown}
          onChange={(event) => {
            invalidate();
            setConfirmed(event.target.checked);
          }}
        />
        I confirm this exact local weekly source and proposal review.
      </label>
      <button
        disabled={!confirmed || busy || unknown}
        onClick={() => void load()}
      >
        Review weekly crew board
      </button>
      {busy && (
        <p role="status">
          Checking seven canonical day boards and current source revisions…
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="wc-state">
          {error}
        </p>
      )}
      {!view && !busy && !error && (
        <p className="wc-state">
          Choose a week and explicitly review its available evidence. Nothing
          loads or schedules automatically.
        </p>
      )}
      {base && !unknown && (
        <article className="wc-card">
          <h3>{base.job_title}</h3>
          <p>
            {base.customer_label} · {base.property_label}
          </p>
          <p>
            Job revision {base.source.job_revision} · issued version{' '}
            {base.source.issued_version_number}. Original visits keep their
            recorded dates and revisions.
          </p>
          {!crew.length ? (
            <p className="wc-state">
              No eligible crew is assigned to this job. This panel cannot assign
              staff or establish availability.
            </p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (proposals.length >= 14) return;
                invalidate();
                setProposals([
                  ...proposals,
                  {
                    day: proposalDay,
                    source_visit_id: visit,
                    worker_id: worker,
                    start: start ? `${proposalDay}T${start}` : null,
                    end: end ? `${proposalDay}T${end}` : null,
                    hours_start: hoursStart
                      ? `${proposalDay}T${hoursStart}`
                      : null,
                    hours_end: hoursEnd ? `${proposalDay}T${hoursEnd}` : null,
                  },
                ]);
              }}
            >
              <h3>Unsaved weekly proposal</h3>
              <div className="wc-fields">
                <label>
                  Proposal day
                  <input
                    type="date"
                    required
                    value={proposalDay}
                    onChange={(e) => {
                      invalidate();
                      setProposalDay(e.target.value);
                    }}
                  />
                </label>
                <label>
                  Assigned technician
                  <select
                    required
                    value={worker}
                    onChange={(e) => {
                      invalidate();
                      setWorker(e.target.value);
                    }}
                  >
                    <option value="">
                      Choose existing assigned technician
                    </option>
                    {crew.map((w) => (
                      <option key={w.worker_id} value={w.worker_id}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Original visit reference
                  <select
                    required
                    value={visit}
                    onChange={(e) => {
                      invalidate();
                      setVisit(e.target.value);
                    }}
                  >
                    {base.original_visits.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.date} · {v.plan_name} · revision {v.revision}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Proposed start
                  <input
                    type="time"
                    step="60"
                    value={start}
                    required={!!end}
                    onChange={(e) => {
                      invalidate();
                      setStart(e.target.value);
                    }}
                  />
                </label>
                <label>
                  Proposed end
                  <input
                    type="time"
                    step="60"
                    value={end}
                    required={!!start}
                    onChange={(e) => {
                      invalidate();
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
                      invalidate();
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
                      invalidate();
                      setHoursEnd(e.target.value);
                    }}
                  />
                </label>
              </div>
              <p>
                Times are explicit human proposals in {sources.timezone}. Leave
                both visit times empty for date-only UNKNOWN evidence. Another
                day creates only an unsaved JOB_WINDOW review; the original
                visit is not moved.
              </p>
              <button type="submit" disabled={busy || proposals.length >= 14}>
                Add unsaved proposal to review
              </button>
            </form>
          )}
          {!!proposals.length && (
            <div>
              <h4>Unsaved input rows</h4>
              {proposals.map((p, index) => (
                <p key={index}>
                  Proposal {index + 1} · {p.day} ·{' '}
                  {p.start?.slice(11) ?? 'time UNKNOWN'} →{' '}
                  {p.end?.slice(11) ?? 'UNKNOWN'}{' '}
                  <button
                    type="button"
                    onClick={() => {
                      invalidate();
                      setProposals(proposals.filter((_, i) => i !== index));
                    }}
                  >
                    Remove proposal {index + 1}
                  </button>
                </p>
              ))}
              <p>
                Confirm the changed inputs and review the board again. These
                rows are not a schedule store.
              </p>
            </div>
          )}
        </article>
      )}
      {view && (
        <>
          <h3 tabIndex={-1} ref={heading}>
            Seven-day crew evidence
          </h3>
          <label>
            Show assigned technician
            <select
              value={workerFilter}
              onChange={(e) => {
                setWorkerFilter(e.target.value);
                setDetail(null);
              }}
            >
              <option value="">All assigned crew</option>
              {view.days[0].lanes.map((w) => (
                <option key={w.worker_id} value={w.worker_id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
          <div className="wc-week">
            {view.days.map((d) => (
              <button
                type="button"
                key={d.day}
                aria-pressed={day === d.day}
                onClick={() => {
                  setDay(d.day);
                  setDetail(null);
                }}
              >
                <strong>{d.day}</strong>
                <span>
                  {d.lanes
                    .filter(
                      (w) => !workerFilter || w.worker_id === workerFilter,
                    )
                    .reduce((sum, w) => sum + w.events.length, 0)}{' '}
                  evidence entries
                </span>
                <span>{d.civil_day_minutes} minute civil day</span>
              </button>
            ))}
          </div>
          <div className="wc-lanes">
            {visibleDay?.lanes
              .filter((w) => !workerFilter || w.worker_id === workerFilter)
              .map((lane) => (
                <article className="wc-card" key={lane.worker_id}>
                  <h4>
                    {lane.label} · {day}
                  </h4>
                  <p>
                    Actual availability: UNKNOWN. Proposed minutes:{' '}
                    {lane.capacity?.planned_minutes ?? 'UNKNOWN'}; proposed
                    working minutes:{' '}
                    {lane.capacity?.proposed_available_minutes ?? 'UNKNOWN'}.
                  </p>
                  {!lane.events.length && (
                    <p>
                      No selected job/property evidence for this day; this is
                      not proof of free time.
                    </p>
                  )}
                  {lane.events.map((event, index) => (
                    <div className="wc-event" key={index}>
                      <p>
                        <strong>{event.kind.replaceAll('_', ' ')}</strong> ·{' '}
                        {event.description}
                      </p>
                      <p>
                        {event.start
                          ? `${event.start} → ${event.end ?? 'end UNKNOWN'}`
                          : `${event.date} · time UNKNOWN`}
                      </p>
                      <button type="button" onClick={() => setDetail(event)}>
                        Inspect exact source {index + 1}
                      </button>
                    </div>
                  ))}
                  {lane.conflicts.map((conflict, index) => (
                    <p className="wc-state" key={index}>
                      <strong>{conflict.kind.replaceAll('_', ' ')}</strong> ·{' '}
                      {conflict.minutes} minutes · {conflict.first} /{' '}
                      {conflict.second}
                    </p>
                  ))}
                </article>
              ))}
          </div>
          {!view.days[0].lanes.length && (
            <p className="wc-state">
              No eligible assigned crew evidence is available.
            </p>
          )}
          <p>
            Coverage: selected job/property, available records only. Cross-job
            recorded conflicts may be referenced for the current authorized
            reviewer. Workforce currentness is CAPTURED NOT ATOMIC; no proposed
            window establishes actual availability.
          </p>
          <button
            onClick={() => {
              setFirst(view);
              setComparison(null);
              setCompareConfirmed(false);
            }}
          >
            Retain snapshot A for source comparison
          </button>
          {first && (
            <div className="wc-card">
              <h4>Retained snapshot A</h4>
              <p>
                Reviewer {first.reviewer_id} · source revision{' '}
                {first.source_revision_sha256}
              </p>
              <p>
                Earlier snapshot bytes remain unchanged when proposal inputs
                change. Two snapshots from this panel use the same synthetic
                reviewer, not independent human approval.
              </p>
              <label className="wc-check">
                <input
                  type="checkbox"
                  checked={compareConfirmed}
                  onChange={(e) => {
                    if (pendingGate.current)
                      pendingGate.current.confirmed = false;
                    setCompareConfirmed(e.target.checked);
                    setComparison(null);
                  }}
                />
                Compare these exact captured snapshot references without
                applying either proposal.
              </label>
              <button
                disabled={!compareConfirmed || busy || unknown}
                onClick={() => void compare()}
              >
                Compare retained weekly snapshots
              </button>
            </div>
          )}
        </>
      )}
      {comparison && (
        <div className="wc-state" role="status">
          <h4>Source/CAS review: {comparison.status.replaceAll('_', ' ')}</h4>
          <p>No lock acquired, assignment written or proposal applied.</p>
          {comparison.status === 'MATCHING_SOURCE_REVIEW_ONLY' && (
            <>
              <p>
                {comparison.reviewers.replaceAll('_', ' ')} · actual
                availability UNKNOWN
              </p>
              {comparison.conflicts.length ? (
                comparison.conflicts.map((c, i) => (
                  <p key={i}>
                    {c.day} · {c.kind.replaceAll('_', ' ')} · {c.minutes}{' '}
                    minutes
                  </p>
                ))
              ) : (
                <p>
                  No reported overlap in the combined available proposal
                  evidence; not proof of availability.
                </p>
              )}
            </>
          )}
        </div>
      )}
      {hasRetained && (
        <button disabled={busy} onClick={() => void verify()}>
          Check exact retained weekly source
        </button>
      )}
      {detail && (
        <article className="wc-card">
          <h3 tabIndex={-1} ref={sourceHeading}>
            Exact field source
          </h3>
          <p>
            {detail.kind.replaceAll('_', ' ')} · {detail.description}
          </p>
          <p>
            Job {detail.job_id} · revision {detail.job_revision}
          </p>
          <p>
            Customer {detail.customer_id} · property {detail.property_id}
          </p>
          <p>
            Issued version {detail.issued_version_id} · v
            {detail.issued_version_number}
          </p>
          <p>
            Visit {detail.visit_id ?? 'No visit moved or created'} · revision{' '}
            {detail.visit_revision ?? 'N/A'} · plan{' '}
            {detail.plan_id ?? 'Job window only'} · revision{' '}
            {detail.plan_revision ?? 'N/A'}
          </p>
          <p>
            Recorded time {detail.recorded_id ?? 'No timestamp record'} ·
            timezone {detail.timezone}
          </p>
          <p>
            This is source evidence or an unsaved proposal, not verified
            completion or dispatch.
          </p>
        </article>
      )}
    </section>
  );
}
