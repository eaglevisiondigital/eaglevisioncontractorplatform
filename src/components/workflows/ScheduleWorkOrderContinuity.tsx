import { useEffect, useRef, useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { prototypeFields } from '../../lib/program/prototype-source';
import {
  beginScheduleWorkOrderContinuity,
  prepareScheduleWorkOrderInstructions,
  assertScheduleWorkOrderContinuityNow,
  reconcileScheduleWorkOrderContinuity,
  closeScheduleWorkOrderContinuity,
  openScheduleWorkOrderContinuitySource,
  type ScheduleWorkOrderHandoff,
  type ScheduleWorkOrderContinuityView,
} from '../../lib/workflows/schedule-work-order-continuity';
import './schedule-work-order-continuity.css';

export interface ScheduleWorkOrderContinuityProps {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string) => void;
}
export function ScheduleWorkOrderContinuity({
  sources,
  enabled = false,
  selectedJobId,
  onSelectJob,
}: ScheduleWorkOrderContinuityProps) {
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
      const root = prototypeFields(sources, [
        'company',
        'operations',
        'estimates',
        'property',
        'entries',
        'gate',
      ]);
      check = captureOperatingSources(
        sources,
        root.gate as OperatingSources['gate'],
      ).check;
    } catch {
      /* No source access when OFF or denied. */
    }
  const [binding, setBinding] = useState({
    sources,
    admitted,
    check,
    selectedJobId,
    epoch: 0,
  });
  let changed = false;
  if (admitted && check && binding.sources === sources)
    try {
      binding.check?.();
    } catch {
      changed = true;
    }
  if (
    binding.sources !== sources ||
    binding.admitted !== admitted ||
    binding.selectedJobId !== selectedJobId ||
    changed ||
    Boolean(binding.check) !== Boolean(check)
  ) {
    setBinding({
      sources,
      admitted,
      check,
      selectedJobId,
      epoch: binding.epoch + 1,
    });
    return null;
  }
  return admitted && check ? (
    <ContinuityDesk
      key={binding.epoch}
      sources={sources}
      selectedJobId={selectedJobId}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="schedule-work-order-continuity"
      aria-label="Schedule and work-order continuity"
    >
      <h2>Schedule and work-order continuity</h2>
      <p>
        {admitted
          ? 'Current authorized sources unavailable. Prior review withheld.'
          : 'Schedule and work-order continuity is off. No scheduling or dispatch enabled.'}
      </p>
    </section>
  );
}
function ContinuityDesk({
  sources,
  selectedJobId,
  onSelectJob,
}: ScheduleWorkOrderContinuityProps) {
  const [selected, setSelected] = useState(
      selectedJobId ?? sources.entries[0].target.job_id!,
    ),
    [start, setStart] = useState('11:00'),
    [end, setEnd] = useState('13:00'),
    [minutes, setMinutes] = useState('30'),
    [instructions, setInstructions] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [instructionConfirmed, setInstructionConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [transferAttempted, setTransferAttempted] = useState(false),
    [terminal, setTerminal] = useState(false),
    [unknown, setUnknown] = useState(false),
    [handoff, setHandoff] = useState<ScheduleWorkOrderHandoff | null>(null),
    [packet, setPacket] = useState<ScheduleWorkOrderContinuityView | null>(
      null,
    ),
    [detail, setDetail] = useState<Awaited<
      ReturnType<typeof openScheduleWorkOrderContinuitySource>
    > | null>(null),
    [message, setMessage] = useState(
      'Choose an existing job and explicitly review its human schedule proposal.',
    );
  const pending = useRef(false),
    live = useRef(true),
    gates = useRef<{ enabled: boolean; confirmed: boolean }[]>([]),
    retained = useRef<
      ScheduleWorkOrderHandoff | ScheduleWorkOrderContinuityView | null
    >(null),
    heading = useRef<HTMLHeadingElement>(null),
    sourceHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    live.current = true;
    const own = gates.current;
    return () => {
      live.current = false;
      own.forEach((g) => {
        g.confirmed = false;
      });
    };
  }, []);
  useEffect(() => {
    if (handoff || packet) heading.current?.focus();
  }, [handoff, packet]);
  useEffect(() => {
    if (detail) sourceHeading.current?.focus();
  }, [detail]);
  const entry = sources.entries.find((e) => e.target.job_id === selected);
  let current = packet ?? handoff;
  if (current)
    try {
      assertScheduleWorkOrderContinuityNow(current);
    } catch {
      current = null;
    }
  function fail() {
    setUnknown(true);
    setDetail(null);
    setMessage(
      'Exact source or handoff UNKNOWN. Retained evidence can only be reconciled read only; no retry or replacement.',
    );
  }
  function gate() {
    const g = { enabled: true, confirmed: true };
    gates.current.push(g);
    return g;
  }
  async function begin() {
    if (pending.current || attempted || !entry || !confirmed) return;
    pending.current = true;
    setBusy(true);
    setAttempted(true);
    try {
      const duration = Number(minutes);
      if (!Number.isSafeInteger(duration) || duration < 1 || duration > 60)
        throw Error('Invalid expiration');
      const original = {
        week_start: entry.day,
        timezone: entry.timezone,
        proposal: {
          job_id: entry.target.job_id!,
          day: entry.day,
          source_visit_id: entry.scheduled_visit_id,
          worker_id: entry.worker_id,
          start: entry.day + 'T09:00',
          end: entry.day + 'T11:00',
          hours_start: entry.day + 'T08:00',
          hours_end: entry.day + 'T16:00',
        },
      };
      const result = await beginScheduleWorkOrderContinuity(
        sources,
        {
          original,
          proposed: {
            ...original,
            proposal: {
              ...original.proposal,
              start: start ? entry.day + 'T' + start : null,
              end: end ? entry.day + 'T' + end : null,
            },
          },
          expected_revision: 0,
          expires_at: Date.now() + duration * 60_000,
        },
        gate(),
      );
      if (live.current) {
        retained.current = result;
        setHandoff(result);
        setConfirmed(false);
        setMessage(
          'Schedule reviewed. The exact job, property, worker, visit, version and expiration are retained for the separate instruction handoff.',
        );
      }
    } catch {
      if (live.current) fail();
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function prepare() {
    if (
      pending.current ||
      transferAttempted ||
      !handoff ||
      !instructionConfirmed ||
      terminal ||
      unknown
    )
      return;
    pending.current = true;
    setBusy(true);
    setTransferAttempted(true);
    setDetail(null);
    try {
      const result = await prepareScheduleWorkOrderInstructions(
        handoff,
        { instructions: instructions.trim() },
        gate(),
      );
      if (live.current) {
        retained.current = result;
        setPacket(result);
        setInstructionConfirmed(false);
        setMessage(
          'Exact predecessor retained in the work-order review. Issued scope remains unchanged; no dispatch or durable full-text custody.',
        );
      }
    } catch {
      if (live.current) fail();
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (pending.current || !retained.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const result = await reconcileScheduleWorkOrderContinuity(
        retained.current,
      );
      if (live.current) {
        if (result.status === 'UNKNOWN') fail();
        else {
          setTerminal(
            ['CANCELLED', 'REVOKED', 'EXPIRED'].includes(result.status),
          );
          setMessage(
            'Exact continuity: ' +
              result.status +
              '. Read only; replay forbidden and durable receipt UNKNOWN.',
          );
        }
      }
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  function close(action: 'CANCEL' | 'REVOKE') {
    if (!current || pending.current) return;
    try {
      const r = closeScheduleWorkOrderContinuity(current, action);
      setTerminal(true);
      setDetail(null);
      setMessage(
        'Exact continuity: ' +
          r.status +
          '. Terminal same-tab withdrawal; no replacement.',
      );
    } catch {
      fail();
    }
  }
  async function open(navigate = false) {
    if (!current || pending.current || terminal || unknown) return;
    pending.current = true;
    setBusy(true);
    try {
      const result = await openScheduleWorkOrderContinuitySource(current);
      assertScheduleWorkOrderContinuityNow(current);
      if (live.current) {
        if (navigate) onSelectJob?.(current.job_id);
        else setDetail(result);
      }
    } catch {
      if (live.current) fail();
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  return (
    <section
      className="schedule-work-order-continuity"
      aria-label="Schedule and work-order continuity"
      aria-busy={busy}
    >
      <header>
        <div>
          <p className="swoc-eyebrow">FIELD · EXACT PROPOSAL HANDOFF</p>
          <h2>Schedule and work-order continuity</h2>
          <p>
            Review a schedule, then carry its exact sources into a separately
            confirmed work-order proposal.
          </p>
        </div>
        <span className="swoc-badge">Same-tab review only</span>
      </header>
      <p className="swoc-boundary">
        Original 09:00–11:00 and working hours 08:00–16:00 are explicit human
        assumptions. Actual availability is UNKNOWN. No live scheduling,
        dispatch, issued-scope change or physical completion.
      </p>
      <div className="swoc-controls">
        <label>
          Continuity work-order job
          <select
            value={selected}
            disabled={busy || attempted || Boolean(selectedJobId)}
            onChange={(e) => {
              setSelected(e.target.value);
              setConfirmed(false);
            }}
          >
            {sources.entries.map((e) => (
              <option key={e.target.job_id} value={e.target.job_id!}>
                Job {e.target.job_id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Review expiration in minutes
          <input
            type="number"
            min="1"
            max="60"
            value={minutes}
            disabled={busy || attempted}
            onChange={(e) => {
              setMinutes(e.target.value);
              setConfirmed(false);
            }}
          />
        </label>
        <label>
          Continuity proposed start
          <input
            type="time"
            value={start}
            disabled={busy || attempted}
            onChange={(e) => {
              setStart(e.target.value);
              setConfirmed(false);
            }}
          />
        </label>
        <label>
          Continuity proposed end
          <input
            type="time"
            value={end}
            disabled={busy || attempted}
            onChange={(e) => {
              setEnd(e.target.value);
              setConfirmed(false);
            }}
          />
        </label>
      </div>
      {entry ? (
        <p>
          Recorded visit {entry.scheduled_visit_id} · {entry.day} · worker{' '}
          {entry.worker_id} · {entry.timezone}.
        </p>
      ) : (
        <p role="alert">
          No exact authorized job/visit is available. No fallback selection.
        </p>
      )}
      <label className="swoc-check">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || attempted}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I confirm this schedule and working window are human proposals only.
      </label>
      <button
        disabled={!entry || !confirmed || busy || attempted}
        onClick={() => void begin()}
      >
        Review continuity schedule proposal
      </button>
      <p role={unknown ? 'alert' : 'status'}>
        {busy ? 'Checking exact continuity sources…' : message}
      </p>
      {current && !terminal && !unknown && (
        <>
          <h3 ref={heading} tabIndex={-1}>
            Retained schedule-to-work-order sources
          </h3>
          <div className="swoc-grid">
            <article className="swoc-card">
              <h4>Exact selected context</h4>
              <dl>
                <div>
                  <dt>Customer</dt>
                  <dd>{current.customer_id}</dd>
                </div>
                <div>
                  <dt>Property</dt>
                  <dd>{current.property_id}</dd>
                </div>
                <div>
                  <dt>Job</dt>
                  <dd>{current.job_id}</dd>
                </div>
                <div>
                  <dt>Issued source version</dt>
                  <dd>{handoff!.source_version}</dd>
                </div>
                <div>
                  <dt>Schedule predecessor</dt>
                  <dd>
                    Revision {handoff!.schedule.revision} ·{' '}
                    {handoff!.schedule.integrity.sha256}
                  </dd>
                </div>
                <div>
                  <dt>Expiration</dt>
                  <dd>
                    {new Date(handoff!.schedule.expires_at).toISOString()}
                  </dd>
                </div>
              </dl>
              <button disabled={busy} onClick={() => void open()}>
                Inspect exact continuity source
              </button>
            </article>
            <article className="swoc-card">
              <h4>Separate instruction handoff</h4>
              <label>
                Continuity operational instructions
                <textarea
                  value={instructions}
                  maxLength={2000}
                  disabled={busy || transferAttempted}
                  onChange={(e) => {
                    setInstructions(e.target.value);
                    setInstructionConfirmed(false);
                  }}
                />
              </label>
              <label className="swoc-check">
                <input
                  type="checkbox"
                  checked={instructionConfirmed}
                  disabled={busy || transferAttempted}
                  onChange={(e) => setInstructionConfirmed(e.target.checked)}
                />
                I confirm these instructions preserve the exact reviewed sources
                and do not amend issued scope.
              </label>
              <button
                disabled={
                  busy ||
                  transferAttempted ||
                  !instructionConfirmed ||
                  !instructions.trim()
                }
                onClick={() => void prepare()}
              >
                Prepare exact work-order handoff
              </button>
              {packet && (
                <p>
                  Prepared review revision {packet.order.revision} from schedule
                  revision {packet.predecessor.revision}.{' '}
                  {packet.order.instructions}
                </p>
              )}
            </article>
          </div>
          <div className="swoc-actions">
            <button disabled={busy} onClick={() => close('CANCEL')}>
              Cancel continuity review
            </button>
            <button disabled={busy} onClick={() => close('REVOKE')}>
              Revoke continuity review
            </button>
          </div>
        </>
      )}
      {(handoff || packet) && (
        <button disabled={busy} onClick={() => void reconcile()}>
          Reconcile exact continuity read only
        </button>
      )}
      {detail && current && !terminal && !unknown && (
        <article className="swoc-card" aria-label="Exact continuity source">
          <h3 ref={sourceHeading} tabIndex={-1}>
            Exact continuity source
          </h3>
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
              Display exact continuity job
            </button>
          )}
        </article>
      )}
    </section>
  );
}
