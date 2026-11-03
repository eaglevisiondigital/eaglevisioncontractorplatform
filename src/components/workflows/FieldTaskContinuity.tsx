import { useEffect, useRef, useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import {
  beginScheduleWorkOrderContinuity,
  prepareScheduleWorkOrderInstructions,
  assertScheduleWorkOrderContinuityNow,
  closeScheduleWorkOrderContinuity,
  reconcileScheduleWorkOrderContinuity,
  type ScheduleWorkOrderHandoff,
  type ScheduleWorkOrderContinuityView,
} from '../../lib/workflows/schedule-work-order-continuity';
import {
  readFieldTaskEvidence,
  assertFieldTaskEvidenceNow,
  reconcileFieldTaskEvidence,
  returnFieldTaskReview,
  type FieldTaskEvidence,
} from '../../lib/workflows/field-task-continuity';
import { prototypeFields } from '../../lib/program/prototype-source';
import './field-task-continuity.css';

export interface FieldTaskContinuityProps {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string) => void;
}
export function FieldTaskContinuity(props: FieldTaskContinuityProps) {
  const { sources, enabled = false, selectedJobId } = props;
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
      /* Denied source stays hidden. */
    }
  const [binding, setBinding] = useState({
    sources,
    admitted,
    check,
    selectedJobId,
    epoch: 0,
  });
  let changed = false;
  if (binding.sources === sources && binding.check)
    try {
      binding.check();
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
    <TaskDesk key={binding.epoch} {...props} />
  ) : (
    <section
      className="field-task-continuity"
      aria-label="Field task continuity"
    >
      <h2>Field task continuity</h2>
      <p>
        {admitted
          ? 'Current authorized sources unavailable. Prior task withheld.'
          : 'Field task continuity is off. No dispatch or time recording enabled.'}
      </p>
    </section>
  );
}
function TaskDesk({
  sources,
  selectedJobId,
  onSelectJob,
}: FieldTaskContinuityProps) {
  const [selected, setSelected] = useState(selectedJobId ?? ''),
    [note, setNote] = useState(''),
    [scheduleConfirmed, setScheduleConfirmed] = useState(false),
    [instructionsConfirmed, setInstructionsConfirmed] = useState(false),
    [handoff, setHandoff] = useState<ScheduleWorkOrderHandoff | null>(null),
    [packet, setPacket] = useState<ScheduleWorkOrderContinuityView | null>(
      null,
    ),
    [evidence, setEvidence] = useState<FieldTaskEvidence | null>(null),
    [inEvidence, setInEvidence] = useState(false),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [prepared, setPrepared] = useState(false),
    [terminal, setTerminal] = useState(false),
    [unknown, setUnknown] = useState(false),
    [message, setMessage] = useState(
      'Select one exact work-order job. Review assumptions before preparing instructions.',
    );
  const live = useRef(true),
    pending = useRef(false),
    gates = useRef<{ enabled: boolean; confirmed: boolean }[]>([]),
    heading = useRef<HTMLHeadingElement>(null);
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
    if (handoff || packet || evidence) heading.current?.focus();
  }, [handoff, packet, evidence, inEvidence]);
  const entry = sources.entries.find((e) => e.target.job_id === selected);
  let current = packet ?? handoff;
  if (current)
    try {
      assertScheduleWorkOrderContinuityNow(current);
      if (evidence) assertFieldTaskEvidenceNow(evidence);
    } catch {
      current = null;
    }
  const fail = () => {
    setUnknown(true);
    setInEvidence(false);
    setMessage(
      'Task evidence UNKNOWN. Exact read-only reconciliation only; no retry, replacement or automatic continuation.',
    );
  };
  const gate = () => {
    const g = { enabled: true, confirmed: true };
    gates.current.push(g);
    return g;
  };
  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await action();
    } catch {
      if (live.current) fail();
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function begin() {
    if (!entry || !scheduleConfirmed || attempted || terminal || unknown)
      return;
    setAttempted(true);
    await run(async () => {
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
      const view = await beginScheduleWorkOrderContinuity(
        sources,
        {
          original,
          proposed: {
            ...original,
            proposal: {
              ...original.proposal,
              start: entry.day + 'T11:00',
              end: entry.day + 'T13:00',
            },
          },
          expected_revision: 0,
          expires_at: Date.now() + 30 * 60_000,
        },
        gate(),
      );
      if (live.current) {
        setHandoff(view);
        setScheduleConfirmed(false);
        setMessage(
          'Exact schedule predecessor retained. Prepare instructions only after separate confirmation.',
        );
      }
    });
  }
  async function prepare() {
    if (
      !handoff ||
      !instructionsConfirmed ||
      !note.trim() ||
      prepared ||
      terminal ||
      unknown
    )
      return;
    setPrepared(true);
    await run(async () => {
      const view = await prepareScheduleWorkOrderInstructions(
        handoff,
        { instructions: note.trim() },
        gate(),
      );
      if (live.current) {
        setPacket(view);
        setInstructionsConfirmed(false);
        setMessage(
          'Instructions prepared for review only. Open the same job and technician-day evidence without another selector.',
        );
      }
    });
  }
  async function openEvidence() {
    if (!packet || terminal || unknown) return;
    await run(async () => {
      const view =
        evidence ?? (await readFieldTaskEvidence(sources, packet, gate()));
      assertFieldTaskEvidenceNow(view);
      if (live.current) {
        setEvidence(view);
        setInEvidence(true);
        setMessage(
          'Recorded job/technician-day evidence only. Time worked and availability are not inferred.',
        );
      }
    });
  }
  async function back(navigate = false) {
    if (!evidence || terminal || unknown) return;
    await run(async () => {
      const view = await returnFieldTaskReview(evidence);
      if (live.current) {
        setInEvidence(false);
        setMessage(
          'Returned to the same schedule predecessor and instruction revision.',
        );
        if (navigate) onSelectJob?.(view.job_id);
      }
    });
  }
  async function reconcile() {
    if (!handoff) return;
    await run(async () => {
      const result = evidence
        ? await reconcileFieldTaskEvidence(evidence)
        : await reconcileScheduleWorkOrderContinuity(packet ?? handoff);
      if (live.current) {
        if (result.status === 'UNKNOWN') fail();
        else {
          setTerminal(
            ['CANCELLED', 'REVOKED', 'EXPIRED'].includes(result.status),
          );
          setMessage(
            'Exact read-only status: ' +
              result.status +
              '. No replay. Durable custody UNKNOWN.',
          );
        }
      }
    });
  }
  function close(action: 'CANCEL' | 'REVOKE') {
    if (!current || busy) return;
    try {
      const r = closeScheduleWorkOrderContinuity(current, action);
      setTerminal(true);
      setInEvidence(false);
      setMessage(
        'Exact task review ' + r.status + '. No new work or replacement.',
      );
    } catch {
      fail();
    }
  }
  return (
    <section
      className="field-task-continuity"
      aria-label="Field task continuity"
      aria-busy={busy}
    >
      <header>
        <p className="ftc-eyebrow">FIELD · EXACT TASK PATH</p>
        <h2>Field task continuity</h2>
        <p>
          Schedule predecessor → instruction review → technician-day evidence →
          same task.
        </p>
      </header>
      <p className="ftc-boundary">
        Local staff review only. Original 09:00–11:00, revised 11:00–13:00 and
        working hours 08:00–16:00 are explicit human assumptions. Actual
        availability UNKNOWN; no dispatch, time recording or completion
        authority. Same-tab references are not durable custody.
      </p>
      {!handoff && (
        <div className="ftc-card">
          <label>
            Field task job
            <select
              value={selected}
              disabled={busy || attempted || Boolean(selectedJobId)}
              onChange={(e) => {
                setSelected(e.target.value);
                setScheduleConfirmed(false);
              }}
            >
              <option value="">Choose an exact job</option>
              {sources.entries.map((e) => (
                <option key={e.target.job_id} value={e.target.job_id!}>
                  Job {e.target.job_id}
                </option>
              ))}
            </select>
          </label>
          {entry ? (
            <p>
              Recorded visit {entry.scheduled_visit_id} · {entry.day} ·
              technician {entry.worker_id} · {entry.timezone}.
            </p>
          ) : (
            <p>No exact authorized job selected. No fallback selection.</p>
          )}
          <label className="ftc-check">
            <input
              type="checkbox"
              checked={scheduleConfirmed}
              disabled={busy || attempted}
              onChange={(e) => setScheduleConfirmed(e.target.checked)}
            />
            I confirm these time windows are human proposals only.
          </label>
          <button
            disabled={!entry || !scheduleConfirmed || busy || attempted}
            onClick={() => void begin()}
          >
            Review field task schedule
          </button>
        </div>
      )}
      <p
        role={
          unknown || (handoff && !current && !terminal) ? 'alert' : 'status'
        }
      >
        {busy
          ? 'Checking exact task sources…'
          : handoff && !current && !terminal
            ? 'Exact task source changed. Detail withheld; reconcile read only.'
            : message}
      </p>
      {current && !terminal && !unknown && (
        <>
          <h3 tabIndex={-1} ref={heading}>
            {inEvidence
              ? 'Exact technician-day evidence'
              : 'Retained field task review'}
          </h3>
          <div className="ftc-grid">
            <article className="ftc-card">
              <h4>Exact context</h4>
              <dl>
                <div>
                  <dt>Customer / property</dt>
                  <dd>
                    {current.customer_id} / {current.property_id}
                  </dd>
                </div>
                <div>
                  <dt>Job / issued version</dt>
                  <dd>
                    {current.job_id} / {handoff!.source_version}
                  </dd>
                </div>
                <div>
                  <dt>Schedule predecessor</dt>
                  <dd>
                    Revision {handoff!.schedule.revision} ·{' '}
                    {handoff!.schedule.integrity.sha256}
                  </dd>
                </div>
                <div>
                  <dt>Expires</dt>
                  <dd>
                    {new Date(handoff!.schedule.expires_at).toISOString()}
                  </dd>
                </div>
              </dl>
            </article>
            {!inEvidence ? (
              <article className="ftc-card">
                <h4>Instruction review</h4>
                <label>
                  Field task instructions
                  <textarea
                    value={note}
                    maxLength={2000}
                    disabled={busy || prepared}
                    onChange={(e) => {
                      setNote(e.target.value);
                      setInstructionsConfirmed(false);
                    }}
                  />
                </label>
                <label className="ftc-check">
                  <input
                    type="checkbox"
                    checked={instructionsConfirmed}
                    disabled={busy || prepared}
                    onChange={(e) => setInstructionsConfirmed(e.target.checked)}
                  />
                  I confirm these instructions preserve issued scope and exact
                  sources.
                </label>
                <button
                  disabled={
                    busy || prepared || !instructionsConfirmed || !note.trim()
                  }
                  onClick={() => void prepare()}
                >
                  Prepare field task instructions
                </button>
                {packet && (
                  <>
                    <p>
                      Prepared instruction revision {packet.order.revision}:{' '}
                      {packet.order.instructions}
                    </p>
                    <button disabled={busy} onClick={() => void openEvidence()}>
                      Open exact technician-day evidence
                    </button>
                  </>
                )}
              </article>
            ) : (
              evidence && (
                <article className="ftc-card">
                  <h4>Recorded evidence · not availability</h4>
                  <p>{evidence.job.title}</p>
                  <p>
                    {evidence.technician_day.label} ·{' '}
                    {evidence.technician_day.day} ·{' '}
                    {evidence.technician_day.timezone}
                  </p>
                  <p>
                    Technician {evidence.technician_day.worker_id}. Actual
                    availability UNKNOWN. Time worked NOT INFERRED.
                  </p>
                  {evidence.technician_day.events.length ? (
                    <ul>
                      {evidence.technician_day.events.map((event, i) => (
                        <li key={i}>
                          {event.kind}: {event.description} · exact job{' '}
                          {event.job_id} · {event.start ?? 'time UNKNOWN'} →{' '}
                          {event.end ?? 'end UNKNOWN'}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      No recorded events available for this exact
                      technician/job/day. Absence is not zero work.
                    </p>
                  )}
                  <p>
                    Instruction revision {evidence.instructions.revision}:{' '}
                    {evidence.instructions.text}
                  </p>
                  <p>Evidence SHA-256: {evidence.integrity.sha256}</p>
                  <button disabled={busy} onClick={() => void back()}>
                    Return to field task review
                  </button>
                  {onSelectJob && (
                    <button disabled={busy} onClick={() => void back(true)}>
                      Display exact field task job
                    </button>
                  )}
                </article>
              )
            )}
          </div>
          <div className="ftc-actions">
            <button disabled={busy} onClick={() => close('CANCEL')}>
              Cancel field task review
            </button>
            <button disabled={busy} onClick={() => close('REVOKE')}>
              Revoke field task review
            </button>
          </div>
        </>
      )}
      {handoff && (
        <button disabled={busy} onClick={() => void reconcile()}>
          Reconcile field task read only
        </button>
      )}
    </section>
  );
}
