import { useEffect, useRef, useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import {
  admitCrewAssignment,
  assertCrewAssignmentCurrentNow,
  openCrewAssignmentJob,
  reconcileCrewAssignment,
  type CrewAssignmentAdmission,
  type CrewAssignmentInput,
} from '../../lib/workflows/crew-assignment-lab';
import './crew-assignment-lab.css';
export interface CrewAssignmentLabProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
export function CrewAssignmentLab({
  sources,
  enabled = false,
  onSelectJob,
}: CrewAssignmentLabProps) {
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
      /* Sources withheld. */
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
    <CrewAssignmentForm
      key={binding.epoch}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section className="crew-assignment-lab" aria-label="Crew assignment lab">
      <h2>Crew assignment lab</h2>
      <p>
        {admitted
          ? 'Current authorized sources unavailable. Prior proposals withheld.'
          : 'Crew assignment lab is off. No reservation or dispatch enabled.'}
      </p>
    </section>
  );
}
function CrewAssignmentForm({ sources, onSelectJob }: CrewAssignmentLabProps) {
  const first = sources.entries[0];
  const [selected, setSelected] = useState(first.target.job_id!),
    [start, setStart] = useState('09:00'),
    [end, setEnd] = useState('11:00'),
    [hoursStart, setHoursStart] = useState('08:00'),
    [hoursEnd, setHoursEnd] = useState('16:00'),
    [confirmed, setConfirmed] = useState(false),
    [view, setView] = useState<CrewAssignmentAdmission | null>(null),
    [busy, setBusy] = useState(false),
    [hasRetained, setHasRetained] = useState(false),
    [unknown, setUnknown] = useState(false),
    [message, setMessage] = useState(''),
    [detail, setDetail] = useState<Awaited<
      ReturnType<typeof openCrewAssignmentJob>
    > | null>(null);
  const active = useRef(true),
    pending = useRef(false),
    generation = useRef(0),
    gate = useRef<{ enabled: boolean; confirmed: boolean } | null>(null),
    retained = useRef<CrewAssignmentAdmission | null>(null),
    heading = useRef<HTMLHeadingElement>(null),
    detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (gate.current) gate.current.confirmed = false;
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
    if (gate.current) gate.current.confirmed = false;
    setView(null);
    setDetail(null);
    setConfirmed(false);
    setMessage('');
  }
  async function review() {
    if (!confirmed || pending.current || unknown) return;
    pending.current = true;
    setBusy(true);
    setView(null);
    setDetail(null);
    const token = ++generation.current,
      g = { enabled: true, confirmed: true };
    gate.current = g;
    const e = sources.entries.find((e) => e.target.job_id === selected)!;
    const input: CrewAssignmentInput = {
      week_start: e.day,
      timezone: e.timezone,
      proposal: {
        job_id: e.target.job_id!,
        worker_id: e.worker_id,
        source_visit_id: e.scheduled_visit_id,
        day: e.day,
        start: start ? e.day + 'T' + start : null,
        end: end ? e.day + 'T' + end : null,
        hours_start: hoursStart ? e.day + 'T' + hoursStart : null,
        hours_end: hoursEnd ? e.day + 'T' + hoursEnd : null,
      },
    };
    try {
      const result = await admitCrewAssignment(sources, input, g);
      if (active.current && token === generation.current) {
        assertCrewAssignmentCurrentNow(result);
        retained.current = result;
        setHasRetained(true);
        setView(result);
        setMessage(
          'Exact proposal admitted for review only. No durable reservation was submitted.',
        );
      }
    } catch {
      if (active.current && token === generation.current) {
        setUnknown(true);
        setMessage(
          'Source or proposal unavailable / UNKNOWN. No assignment changed; exact retained read-only reconciliation only.',
        );
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (!retained.current || pending.current) return;
    pending.current = true;
    setBusy(true);
    const token = generation.current;
    try {
      const r = await reconcileCrewAssignment(retained.current);
      if (active.current && token === generation.current)
        setMessage(
          r.status === 'CURRENT_ADMISSION_ONLY'
            ? 'Exact retained admission is current for review only. No writer connected.'
            : 'Exact retained admission remains UNKNOWN. No replay or replacement.',
        );
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function open(navigate = false) {
    if (!view || pending.current) return;
    pending.current = true;
    setBusy(true);
    const token = generation.current;
    try {
      const r = await openCrewAssignmentJob(view);
      if (active.current && token === generation.current) {
        assertCrewAssignmentCurrentNow(view);
        setDetail(r);
        if (navigate) onSelectJob?.(r.job_id);
      }
    } catch {
      if (active.current && token === generation.current) {
        setView(null);
        setDetail(null);
        setUnknown(true);
        setMessage(
          'Exact source navigation is UNKNOWN; prior detail withheld.',
        );
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  let current = view;
  if (current)
    try {
      assertCrewAssignmentCurrentNow(current);
    } catch {
      current = null;
    }
  return (
    <section
      className="crew-assignment-lab"
      aria-label="Crew assignment lab"
      aria-busy={busy}
    >
      <header>
        <div>
          <p className="cal-eyebrow">FIELD OPERATIONS · DISPOSABLE LAB</p>
          <h2>Crew assignment readiness</h2>
          <p>
            Review one exact job, assigned technician and original visit before
            a test-only reservation experiment.
          </p>
        </div>
        <span className="cal-badge">No browser writer or dispatch</span>
      </header>
      <p className="cal-boundary">
        This browser prepares a source-bound human proposal only. Separate
        server-only tests exercise durable command custody and concurrent
        reservation metadata. They never modify the business schedule. Actual
        availability and operational authorization remain UNKNOWN.
      </p>
      <div className="cal-controls">
        <label>
          Existing job and assigned technician
          <select
            value={selected}
            onChange={(e) => {
              invalidate();
              setSelected(e.target.value);
            }}
          >
            {sources.entries.map((e) => (
              <option key={e.target.job_id} value={e.target.job_id!}>
                Job {e.target.job_id}
              </option>
            ))}
          </select>
        </label>
        {(
          [
            ['Proposed start', start, setStart],
            ['Proposed end', end, setEnd],
            ['Proposed working-hours start', hoursStart, setHoursStart],
            ['Proposed working-hours end', hoursEnd, setHoursEnd],
          ] as const
        ).map(([label, value, set]) => (
          <label key={label}>
            {label}
            <input
              type="time"
              value={value}
              onChange={(e) => {
                invalidate();
                set(e.target.value);
              }}
            />
          </label>
        ))}
      </div>
      <label className="cal-check">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || unknown}
          onChange={(e) => {
            invalidate();
            setConfirmed(e.target.checked);
          }}
        />
        I confirm this is an unsaved human proposal, not an assignment or
        dispatch.
      </label>
      <div className="cal-actions">
        <button
          disabled={!confirmed || busy || unknown}
          onClick={() => void review()}
        >
          {busy
            ? 'Checking exact crew sources…'
            : 'Review crew assignment readiness'}
        </button>
        <button
          disabled={!hasRetained || busy}
          onClick={() => void reconcile()}
        >
          Reconcile exact retained admission
        </button>
      </div>
      <p role={unknown ? 'alert' : 'status'}>{message}</p>
      {view && !current && (
        <p role="alert">
          Source or staff context changed. Previous admission withheld.
        </p>
      )}
      {current && (
        <>
          <h3 ref={heading} tabIndex={-1}>
            Source-bound assignment proposal
          </h3>
          <div className="cal-grid">
            <article className="cal-card">
              <h4>Exact source</h4>
              <dl>
                {Object.entries(current.envelope)
                  .filter(([k]) =>
                    [
                      'organization_id',
                      'customer_id',
                      'property_id',
                      'job_id',
                      'job_revision',
                      'issued_version_id',
                      'issued_version_number',
                      'visit_id',
                      'visit_revision',
                      'plan_id',
                      'plan_revision',
                      'worker_id',
                      'day',
                      'timezone',
                    ].includes(k),
                  )
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{k.replaceAll('_', ' ')}</dt>
                      <dd>{String(v)}</dd>
                    </div>
                  ))}
              </dl>
              <button disabled={busy} onClick={() => void open()}>
                Open exact assignment job source
              </button>
            </article>
            <article className="cal-card">
              <h4>Canonical capacity review</h4>
              <p>
                {current.capacity?.planned_minutes ?? 'UNKNOWN'} proposed
                minutes ·{' '}
                {current.capacity?.proposed_available_minutes ?? 'UNKNOWN'}{' '}
                proposed working minutes
              </p>
              <p>Capacity: {current.envelope.canonical_capacity_state}</p>
              <p>
                {current.conflicts.length} recorded conflicts · actual
                availability UNKNOWN
              </p>
              {current.conflicts.map((c, i) => (
                <p key={i}>
                  {c.kind.replaceAll('_', ' ')} · {c.minutes} minutes
                </p>
              ))}
              <p>Integrity SHA-256: {current.integrity.sha256}</p>
              <p>Browser persistence: NONE. Durable writer: NOT CONNECTED.</p>
              <p>
                Source capture is not atomic with global authorization or the
                server lab.
              </p>
            </article>
          </div>
        </>
      )}
      {detail && current && (
        <section className="cal-card" aria-label="Exact assignment source">
          <h3 tabIndex={-1} ref={detailHeading}>
            Exact assignment source
          </h3>
          <p>{detail.title}</p>
          <dl>
            {Object.entries(detail).map(([k, v]) => (
              <div key={k}>
                <dt>{k.replaceAll('_', ' ')}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {onSelectJob && (
            <button disabled={busy} onClick={() => void open(true)}>
              Display existing assignment job workflow
            </button>
          )}
        </section>
      )}
    </section>
  );
}
