import { useEffect, useRef, useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import {
  reviewCrewPlans,
  reconcileCrewPlans,
  openCrewPlanJob,
  assertCrewPlanCurrentNow,
  type CrewPlanReviewView,
  type CrewPlanInput,
} from '../../lib/workflows/crew-plan-review';
import type { PortfolioSchedulingProposal } from '../../lib/workflows/portfolio-scheduling';
import './crew-plan-review.css';
export interface CrewPlanReviewProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
export function CrewPlanReview({
  sources,
  enabled = false,
  onSelectJob,
}: CrewPlanReviewProps) {
  const admitted =
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: enabled ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    });
  let check: (() => void) | null = null;
  if (admitted)
    try {
      check = captureOperatingSources(sources, sources.gate).check;
    } catch {
      /* Withhold unavailable sources. */
    }
  const [binding, setBinding] = useState({
    sources,
    admitted,
    check,
    epoch: 0,
  });
  let changed = false;
  try {
    binding.check?.();
  } catch {
    changed = true;
  }
  if (
    binding.sources !== sources ||
    binding.admitted !== admitted ||
    changed ||
    Boolean(binding.check) !== Boolean(check)
  ) {
    setBinding({ sources, admitted, check, epoch: binding.epoch + 1 });
    return null;
  }
  return admitted && check ? (
    <CrewPlanForm
      key={binding.epoch}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="crew-plan-review"
      aria-label="Weekly crew plan comparison"
    >
      <h2>Weekly crew plan comparison</h2>
      <p>
        {admitted
          ? 'Current authorized sources are unavailable. Prior plans are withheld.'
          : 'Crew-plan comparison is off. No schedule, assignment or dispatch is enabled.'}
      </p>
    </section>
  );
}
function CrewPlanForm({ sources, onSelectJob }: CrewPlanReviewProps) {
  const first = sources.entries[0];
  const [week, setWeek] = useState(first.day),
    [jobFilter, setJobFilter] = useState(''),
    [workerFilter, setWorkerFilter] = useState(''),
    [planA, setPlanA] = useState<PortfolioSchedulingProposal[]>([]),
    [planB, setPlanB] = useState<PortfolioSchedulingProposal[]>([]),
    [choices, setChoices] = useState<CrewPlanReviewView['jobs']>([]),
    [plan, setPlan] = useState('A'),
    [job, setJob] = useState(''),
    [worker, setWorker] = useState(''),
    [visit, setVisit] = useState(''),
    [day, setDay] = useState(first.day),
    [start, setStart] = useState('09:00'),
    [end, setEnd] = useState('11:00'),
    [hoursStart, setHoursStart] = useState('08:00'),
    [hoursEnd, setHoursEnd] = useState('16:00'),
    [confirmed, setConfirmed] = useState(false),
    [view, setView] = useState<CrewPlanReviewView | null>(null),
    [hasRetained, setHasRetained] = useState(false),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [detail, setDetail] = useState<Awaited<
      ReturnType<typeof openCrewPlanJob>
    > | null>(null);
  const live = useRef(true),
    pending = useRef(false),
    generation = useRef(0),
    activeGate = useRef<{ enabled: boolean; confirmed: boolean } | null>(null),
    retained = useRef<CrewPlanReviewView | null>(null),
    heading = useRef<HTMLHeadingElement>(null),
    detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (activeGate.current) activeGate.current.confirmed = false;
    };
  }, []);
  useEffect(() => {
    if (view) heading.current?.focus();
  }, [view]);
  useEffect(() => {
    if (detail) detailHeading.current?.focus();
  }, [detail]);
  function invalidate() {
    generation.current++;
    if (activeGate.current) activeGate.current.confirmed = false;
    setView(null);
    setDetail(null);
    setConfirmed(false);
    setMessage('');
    setError('');
  }
  async function review() {
    if (!confirmed || pending.current || unknown) return;
    const token = ++generation.current,
      gate = { enabled: true, confirmed: true };
    activeGate.current = gate;
    pending.current = true;
    setBusy(true);
    setView(null);
    setDetail(null);
    setError('');
    const input: CrewPlanInput = {
      week_start: week,
      timezone: first.timezone,
      job_id: jobFilter,
      worker_id: workerFilter,
      plan_a: planA,
      plan_b: planB,
    };
    try {
      const result = await reviewCrewPlans(sources, input, gate);
      if (live.current && token === generation.current) {
        assertCrewPlanCurrentNow(result);
        setView(result);
        setChoices(result.jobs);
        retained.current = result;
        setHasRetained(true);
        setMessage(
          'Exact source-bound comparison prepared. Neither proposal was applied.',
        );
      }
    } catch {
      if (live.current && token === generation.current) {
        setChoices([]);
        setUnknown(true);
        setError(
          'The comparison is unavailable or UNKNOWN. No schedule changed. Only the exact retained review can be reconciled.',
        );
      }
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (!retained.current || pending.current) return;
    const token = generation.current;
    pending.current = true;
    setBusy(true);
    try {
      const result = await reconcileCrewPlans(retained.current);
      if (live.current && token === generation.current)
        setMessage(
          result.status === 'CURRENT_REVIEW_ONLY'
            ? 'Exact retained sources are current for read-only review. No proposal applied.'
            : 'Retained sources remain UNKNOWN. No replay or replacement.',
        );
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function open(jobId: string) {
    if (!view || pending.current) return;
    const token = generation.current;
    pending.current = true;
    setBusy(true);
    try {
      const target = await openCrewPlanJob(view, jobId);
      if (live.current && token === generation.current) {
        assertCrewPlanCurrentNow(view);
        setDetail(target);
        onSelectJob?.(target.job_id);
      }
    } catch {
      if (live.current && token === generation.current) {
        setView(null);
        setDetail(null);
        setUnknown(true);
        setError('Exact source navigation is UNKNOWN and has been withheld.');
      }
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  const selected = choices.find((j) => j.source.job_id === job) ?? choices[0],
    selectedWorker =
      selected?.crew.find((w) => w.worker_id === worker) ?? selected?.crew[0],
    selectedVisit =
      selected?.visits.find((v) => v.id === visit) ??
      selected?.visits.find(
        (v) =>
          v.id ===
          sources.entries.find(
            (e) => e.target.job_id === selected.source.job_id,
          )?.scheduled_visit_id,
      ) ??
      selected?.visits[0];
  const workers = [
    ...new Map(
      choices.flatMap((j) => j.crew).map((w) => [w.worker_id, w]),
    ).values(),
  ];
  function add() {
    if (!selected || !selectedWorker || !selectedVisit || busy || unknown)
      return;
    const row: PortfolioSchedulingProposal = {
        job_id: selected.source.job_id,
        worker_id: selectedWorker.worker_id,
        source_visit_id: selectedVisit.id,
        day,
        start: start ? day + 'T' + start : null,
        end: end ? day + 'T' + end : null,
        hours_start: hoursStart ? day + 'T' + hoursStart : null,
        hours_end: hoursEnd ? day + 'T' + hoursEnd : null,
      },
      rows = plan === 'A' ? planA : planB;
    if (
      rows.length >= 32 ||
      rows.some(
        (p) =>
          p.job_id === row.job_id &&
          p.worker_id === row.worker_id &&
          p.source_visit_id === row.source_visit_id &&
          p.day === row.day,
      )
    ) {
      setError(
        'Choose a distinct job, technician, visit and day, or remove the existing proposal first.',
      );
      return;
    }
    invalidate();
    if (plan === 'A') setPlanA([...rows, row]);
    else setPlanB([...rows, row]);
  }
  let current = view;
  if (current)
    try {
      assertCrewPlanCurrentNow(current);
    } catch {
      current = null;
    }
  return (
    <section
      className="crew-plan-review"
      aria-label="Weekly crew plan comparison"
      aria-busy={busy}
    >
      <header>
        <div>
          <p className="cpr-eyebrow">FIELD OPERATIONS · STAFF REVIEW ONLY</p>
          <h2>Compare weekly crew plans</h2>
          <p>
            Review the recorded week beside two unsaved human proposals. Actual
            availability remains UNKNOWN.
          </p>
        </div>
        <span className="cpr-badge">No assignment or dispatch</span>
      </header>
      <p className="cpr-boundary">
        Capacity is calculated from authorized company records and explicit
        proposed working hours. Civil-day minutes describe the calendar; they
        are not available working hours. Review capture is not an atomic
        reservation.
      </p>
      <div className="cpr-controls">
        <label>
          Week starting
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
          Displayed job
          <select
            value={jobFilter}
            onChange={(e) => {
              invalidate();
              setJobFilter(e.target.value);
            }}
          >
            <option value="">All admitted jobs</option>
            {choices.map((j) => (
              <option value={j.source.job_id} key={j.source.job_id}>
                {j.title} · {j.property.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Displayed technician
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
      <p>
        Timezone: {first.timezone}. First review loads exact source choices; no
        proposals are created automatically.
      </p>
      <label className="cpr-check">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || unknown}
          onChange={(e) => {
            invalidate();
            setConfirmed(e.target.checked);
          }}
        />
        I confirm these are two unsaved human proposals for read-only
        comparison.
      </label>
      <button
        disabled={!confirmed || busy || unknown}
        onClick={() => void review()}
      >
        {busy ? 'Checking crew-plan sources…' : 'Compare weekly crew plans'}
      </button>
      <button disabled={!hasRetained || busy} onClick={() => void reconcile()}>
        Reconcile exact retained comparison
      </button>
      {error && <p role="alert">{error}</p>}
      <p role="status">{message}</p>
      <details className="cpr-card">
        <summary>Build separate plan A and plan B proposals</summary>
        {!choices.length ? (
          <p>
            Confirm and compare once to load authorized job, visit and
            technician relationships.
          </p>
        ) : (
          <>
            <div className="cpr-controls">
              <label>
                Proposal plan
                <select
                  value={plan}
                  onChange={(e) => {
                    invalidate();
                    setPlan(e.target.value);
                  }}
                >
                  <option>A</option>
                  <option>B</option>
                </select>
              </label>
              <label>
                Proposal job
                <select
                  value={selected?.source.job_id ?? ''}
                  onChange={(e) => {
                    invalidate();
                    setJob(e.target.value);
                    setWorker('');
                    setVisit('');
                  }}
                >
                  {choices.map((j) => (
                    <option key={j.source.job_id} value={j.source.job_id}>
                      {j.title} · {j.customer.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assigned technician
                <select
                  value={selectedWorker?.worker_id ?? ''}
                  onChange={(e) => {
                    invalidate();
                    setWorker(e.target.value);
                  }}
                >
                  {selected?.crew.map((w) => (
                    <option key={w.worker_id} value={w.worker_id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Original property visit
                <select
                  value={selectedVisit?.id ?? ''}
                  onChange={(e) => {
                    invalidate();
                    setVisit(e.target.value);
                  }}
                >
                  {selected?.visits.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.date} · {v.plan_name} · {v.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Proposed day
                <input
                  type="date"
                  value={day}
                  onChange={(e) => {
                    invalidate();
                    setDay(e.target.value);
                  }}
                />
              </label>
              <label>
                Proposed start
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
                Proposed end
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
                Proposed working-hours start
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
                Proposed working-hours end
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
              Clear both working-hours fields to preserve unknown capacity. The
              original visit date remains unchanged.
            </p>
            <button onClick={add} disabled={busy || unknown}>
              Add unsaved proposal to plan {plan}
            </button>
          </>
        )}
        <div className="cpr-comparison">
          {(
            [
              ['A', planA],
              ['B', planB],
            ] as const
          ).map(([name, rows]) => (
            <section aria-label={'Unsaved crew plan ' + name} key={name}>
              <h3>
                Plan {name} · {rows.length} proposed rows
              </h3>
              {!rows.length && (
                <p>
                  No proposed windows. This does not establish availability.
                </p>
              )}
              <ol>
                {rows.map((p, i) => (
                  <li key={i}>
                    {p.day} · {p.start?.slice(11) ?? 'time UNKNOWN'}–
                    {p.end?.slice(11) ?? 'UNKNOWN'}
                    <br />
                    Job {p.job_id}
                    <br />
                    Technician {p.worker_id}
                    <button
                      disabled={busy}
                      onClick={() => {
                        invalidate();
                        if (name === 'A')
                          setPlanA(planA.filter((_, n) => n !== i));
                        else setPlanB(planB.filter((_, n) => n !== i));
                      }}
                    >
                      Remove plan {name} proposal {i + 1}
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </details>
      {view && !current && (
        <p role="alert">
          Source or staff context changed. Previous comparison is withheld.
        </p>
      )}
      {current && (
        <>
          <h3 tabIndex={-1} ref={heading}>
            Recorded week and plan comparison
          </h3>
          <p>
            {current.matching_jobs} of {current.available_jobs} admitted jobs ·
            available records only. Hash {current.integrity.sha256}
          </p>
          {!current.changes.length && (
            <p className="cpr-empty">
              No proposed differences. Missing visits and date-only evidence do
              not prove an available slot or completed work.
            </p>
          )}
          <div className="cpr-jobs">
            {current.jobs
              .filter((j) => !jobFilter || j.source.job_id === jobFilter)
              .map((j) => (
                <article className="cpr-card" key={j.source.job_id}>
                  <h4>{j.title}</h4>
                  <p>
                    {j.customer.label} · {j.property.label}
                  </p>
                  <p>
                    Job {j.source.job_id}
                    <br />
                    Issued version {j.source.issued_version_id} · v
                    {j.source.issued_version_number}
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => void open(j.source.job_id)}
                  >
                    Open exact crew-plan job source
                  </button>
                </article>
              ))}
          </div>
          {current.changes.map((c) => (
            <article
              className="cpr-change"
              key={JSON.stringify([
                c.job_id,
                c.worker_id,
                c.source_visit_id,
                c.day,
              ])}
            >
              <strong>
                {c.status} proposal · {c.day}
              </strong>
              <p>
                Job {c.job_id} · technician {c.worker_id} · original visit{' '}
                {c.source_visit_id}
              </p>
              <div className="cpr-comparison">
                <p>
                  Plan A:{' '}
                  {c.plan_a
                    ? `${c.plan_a.start ?? 'time UNKNOWN'} to ${c.plan_a.end ?? 'UNKNOWN'}`
                    : 'No proposed row'}
                </p>
                <p>
                  Plan B:{' '}
                  {c.plan_b
                    ? `${c.plan_b.start ?? 'time UNKNOWN'} to ${c.plan_b.end ?? 'UNKNOWN'}`
                    : 'No proposed row'}
                </p>
              </div>
            </article>
          ))}
          <div className="cpr-week">
            {current.days.map((d) => (
              <article className="cpr-card" key={d.day}>
                <h4>{d.day}</h4>
                <p>
                  {d.civil_day_minutes} calendar minutes · actual availability
                  UNKNOWN
                </p>
                {d.lanes.map((l) => (
                  <section
                    className="cpr-lane"
                    aria-label={l.label + ' on ' + d.day}
                    key={l.worker_id}
                  >
                    <h5>{l.label}</h5>
                    <p>
                      Recorded evidence: {l.recorded_events.length} events;
                      date-only visits retain time UNKNOWN.
                    </p>
                    <ul>
                      {l.recorded_events.map((e, i) => (
                        <li key={i}>
                          {e.kind.replaceAll('_', ' ')} ·{' '}
                          {e.date ?? e.start ?? 'timing UNKNOWN'} · job{' '}
                          {e.job_id}
                        </li>
                      ))}
                    </ul>
                    <div className="cpr-comparison">
                      {(
                        [
                          ['A', l.plan_a],
                          ['B', l.plan_b],
                        ] as const
                      ).map(([name, data]) => (
                        <div key={name}>
                          <h5>Plan {name}</h5>
                          <p>
                            {data.capacity?.planned_minutes ?? 'UNKNOWN'}{' '}
                            proposed workload minutes
                          </p>
                          <p>
                            {data.capacity?.proposed_available_minutes ??
                              'UNKNOWN'}{' '}
                            proposed working minutes
                          </p>
                          <p>
                            {data.capacity?.capacity_state ?? 'UNKNOWN'} ·{' '}
                            {data.conflicts.length} conflicts
                          </p>
                          {data.conflicts.map((c, i) => (
                            <p key={i} className="cpr-conflict">
                              {c.kind.replaceAll('_', ' ')} · {c.minutes}{' '}
                              minutes
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                    <p>
                      Plan B minus A proposed workload:{' '}
                      {l.proposed_workload_difference_minutes ?? 'UNKNOWN'}{' '}
                      minutes. No improvement or available capacity is inferred.
                    </p>
                  </section>
                ))}
              </article>
            ))}
          </div>
        </>
      )}
      {detail && current && (
        <section className="cpr-card" aria-label="Exact crew-plan source">
          <h3 ref={detailHeading} tabIndex={-1}>
            Exact crew-plan source
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
        </section>
      )}
    </section>
  );
}
