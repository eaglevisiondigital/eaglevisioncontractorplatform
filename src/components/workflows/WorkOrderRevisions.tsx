import { useEffect, useRef, useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { prototypeFields } from '../../lib/program/prototype-source';
import {
  reviewWorkOrderRevision,
  assertWorkOrderRevisionCurrentNow,
  reconcileWorkOrderRevision,
  closeWorkOrderRevision,
  openWorkOrderRevisionSource,
  type WorkOrderRevisionView,
} from '../../lib/workflows/work-order-revisions';
import './work-order-revisions.css';

export interface WorkOrderRevisionsProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
export function WorkOrderRevisions({
  sources,
  enabled = false,
  onSelectJob,
}: WorkOrderRevisionsProps) {
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
      /* Admit before every source read. */
    }
  const [binding, setBinding] = useState({
    sources,
    admitted,
    check,
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
    changed ||
    Boolean(binding.check) !== Boolean(check)
  ) {
    setBinding({ sources, admitted, check, epoch: binding.epoch + 1 });
    return null;
  }
  return admitted && check ? (
    <RevisionDesk
      key={binding.epoch}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section className="work-order-revisions" aria-label="Work-order revisions">
      <h2>Work-order revisions</h2>
      <p>
        {admitted
          ? 'Current authorized sources unavailable. Prior review withheld.'
          : 'Work-order revisions are off. No dispatch or durable browser writer enabled.'}
      </p>
    </section>
  );
}
function RevisionDesk({ sources, onSelectJob }: WorkOrderRevisionsProps) {
  const [selected, setSelected] = useState(sources.entries[0].target.job_id!),
    [instructions, setInstructions] = useState(''),
    [start, setStart] = useState('11:00'),
    [end, setEnd] = useState('13:00'),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [closed, setClosed] = useState(false),
    [attempted, setAttempted] = useState(false),
    [hasRetained, setHasRetained] = useState(false),
    [view, setView] = useState<WorkOrderRevisionView | null>(null),
    [message, setMessage] = useState(''),
    [detail, setDetail] = useState<Awaited<
      ReturnType<typeof openWorkOrderRevisionSource>
    > | null>(null);
  const active = useRef(true),
    pending = useRef(false),
    revision = useRef(0),
    deadline = useRef<number | null>(null),
    retained = useRef<WorkOrderRevisionView | null>(null),
    gates = useRef<{ enabled: boolean; confirmed: boolean }[]>([]),
    heading = useRef<HTMLHeadingElement>(null),
    detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    active.current = true;
    const admittedGates = gates.current;
    return () => {
      active.current = false;
      admittedGates.forEach((g) => {
        g.confirmed = false;
      });
    };
  }, []);
  useEffect(() => {
    if (view) heading.current?.focus();
  }, [view]);
  useEffect(() => {
    if (detail) detailHeading.current?.focus();
  }, [detail]);
  function edit() {
    setConfirmed(false);
    setDetail(null);
    setMessage('');
  }
  function fail() {
    setUnknown(true);
    setView(null);
    setDetail(null);
    setMessage(
      'Exact source, instructions, staff or receipt UNKNOWN. Exact retained read only; no replay or replacement.',
    );
  }
  async function review() {
    if (!confirmed || pending.current || unknown || closed) return;
    pending.current = true;
    setBusy(true);
    setAttempted(true);
    setDetail(null);
    const g = { enabled: true, confirmed: true };
    gates.current.push(g);
    try {
      const e = sources.entries.find((e) => e.target.job_id === selected)!;
      deadline.current ??= Date.now() + 30 * 60_000;
      const original = {
        week_start: e.day,
        timezone: e.timezone,
        proposal: {
          job_id: e.target.job_id!,
          source_visit_id: e.scheduled_visit_id,
          worker_id: e.worker_id,
          day: e.day,
          start: e.day + 'T09:00',
          end: e.day + 'T11:00',
          hours_start: e.day + 'T08:00',
          hours_end: e.day + 'T16:00',
        },
      };
      const result = await reviewWorkOrderRevision(
        sources,
        {
          instructions: instructions.trim(),
          schedule: {
            original,
            proposed: {
              ...original,
              proposal: {
                ...original.proposal,
                start: start ? e.day + 'T' + start : null,
                end: end ? e.day + 'T' + end : null,
              },
            },
            expected_revision: revision.current,
            expires_at: deadline.current,
          },
        },
        g,
      );
      if (active.current) {
        assertWorkOrderRevisionCurrentNow(result);
        retained.current = result;
        setHasRetained(true);
        revision.current = result.revision;
        setView(result);
        setConfirmed(false);
        setMessage(
          'Work-order proposal reviewed. Issued instructions remain immutable. Durable receipt UNKNOWN; server lab is not connected.',
        );
      }
    } catch {
      if (active.current) fail();
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (!retained.current || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const r = await reconcileWorkOrderRevision(retained.current);
      if (active.current) {
        if (r.status === 'UNKNOWN') fail();
        else {
          if (['CANCELLED', 'REVOKED', 'EXPIRED'].includes(r.status)) {
            setClosed(true);
            setView(null);
            setDetail(null);
          }
          setMessage(
            'Exact work-order revision: ' +
              r.status +
              '. Read only; durable receipt UNKNOWN.',
          );
        }
      }
    } catch {
      if (active.current) fail();
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  function close(action: 'CANCEL' | 'REVOKE') {
    if (!view || pending.current) return;
    try {
      const r = closeWorkOrderRevision(view, action);
      setClosed(true);
      setView(null);
      setDetail(null);
      setMessage(
        'Work-order review ' +
          r.status +
          '. Original C12 same-tab lineage withdrawn. No business work order changed.',
      );
    } catch {
      fail();
    }
  }
  async function open(navigate = false) {
    if (!view || pending.current || (navigate && !detail)) return;
    pending.current = true;
    setBusy(true);
    try {
      const result = await openWorkOrderRevisionSource(view);
      if (active.current) {
        assertWorkOrderRevisionCurrentNow(view);
        setDetail(result);
        if (
          navigate &&
          detail?.job_id === result.job_id &&
          detail.organization_id === result.organization_id
        )
          onSelectJob?.(result.job_id);
      }
    } catch {
      if (active.current) fail();
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  let current = view;
  if (current)
    try {
      assertWorkOrderRevisionCurrentNow(current);
    } catch {
      current = null;
    }
  if (view && !current && !unknown) {
    fail();
    return null;
  }
  const entry = sources.entries.find((e) => e.target.job_id === selected);
  return (
    <section
      className="work-order-revisions"
      aria-label="Work-order revisions"
      aria-busy={busy}
    >
      <header>
        <div>
          <p className="wor-eyebrow">FIELD · HUMAN PROPOSAL REVIEW</p>
          <h2>Work-order revisions</h2>
          <p>
            Compare issued instructions with a staff proposal over existing job,
            crew, plan and visit sources.
          </p>
        </div>
        <span className="wor-badge">Review only · durable receipt UNKNOWN</span>
      </header>
      <p className="wor-boundary">
        Proposed instructions never rewrite issued scope. Original window
        09:00–11:00 and working hours 08:00–16:00 are explicit human
        assumptions. Date-only visits and actual availability remain UNKNOWN.
        Browser history is same-tab only; the separate disposable C12 journal is
        not connected. No dispatch, completion, customer communication or
        financial authority.
      </p>
      <div className="wor-controls">
        <label>
          Existing work-order job
          <select
            value={selected}
            disabled={busy || attempted || unknown || closed}
            onChange={(e) => {
              edit();
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
        <label>
          Proposed operational instructions
          <textarea
            value={instructions}
            maxLength={2000}
            disabled={busy || unknown || closed}
            onChange={(e) => {
              edit();
              setInstructions(e.target.value);
            }}
            placeholder="Describe the staff proposal; do not imply approved scope changes."
          />
        </label>
        <label>
          Proposed work-order start
          <input
            type="time"
            value={start}
            disabled={busy || unknown || closed}
            onChange={(e) => {
              edit();
              setStart(e.target.value);
            }}
          />
        </label>
        <label>
          Proposed work-order end
          <input
            type="time"
            value={end}
            disabled={busy || unknown || closed}
            onChange={(e) => {
              edit();
              setEnd(e.target.value);
            }}
          />
        </label>
      </div>
      {entry ? (
        <p>
          Recorded visit date: {entry.day}. Visit: {entry.scheduled_visit_id}.
          Worker: {entry.worker_id}. Timezone: {entry.timezone}.
        </p>
      ) : (
        <p>No exact work-order source available.</p>
      )}
      <label className="wor-check">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || unknown || closed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I confirm these instructions and times are human proposals only, with no
        issued-scope change or dispatch.
      </label>
      <div className="wor-actions">
        <button
          disabled={
            !entry ||
            !confirmed ||
            !instructions.trim() ||
            busy ||
            unknown ||
            closed
          }
          onClick={() => void review()}
        >
          {busy
            ? 'Checking exact work-order sources…'
            : 'Review work-order revision'}
        </button>
        <button
          disabled={!hasRetained || busy}
          onClick={() => void reconcile()}
        >
          Reconcile exact work-order revision
        </button>
      </div>
      <p role={unknown ? 'alert' : 'status'}>{message}</p>
      {current && (
        <>
          <h3 ref={heading} tabIndex={-1}>
            Source-bound work-order comparison
          </h3>
          <div className="wor-grid">
            <article className="wor-card">
              <h4>Original issued instructions</h4>
              <p>{current.title}</p>
              <p>
                Issued version {current.original.envelope.issued_version_number}
                : {current.original.envelope.issued_version_id}
              </p>
              <ul>
                {current.issued_scope.map((line) => (
                  <li key={line.id}>
                    {line.description} · {line.quantity_milli / 1000}{' '}
                    {line.unit}
                  </li>
                ))}
              </ul>
              <p>Scope SHA-256: {current.scope_sha256}</p>
              <h4>Proposed operational instructions</h4>
              <p>{current.instructions}</p>
              <p>
                Saved same-tab revision {current.revision}; expires{' '}
                {new Date(current.expires_at).toISOString()}.
              </p>
              <button disabled={busy} onClick={() => void open()}>
                Open exact work-order revision source
              </button>
            </article>
            <article className="wor-card">
              <h4>Original and proposed scheduling references</h4>
              {(['original', 'proposed'] as const).map((kind) => (
                <div key={kind}>
                  <h4>
                    {kind === 'original'
                      ? 'Original human proposal'
                      : 'Proposed human revision'}
                  </h4>
                  <p>
                    {current[kind].envelope.start === null
                      ? 'Date-only / UNKNOWN'
                      : new Date(
                          current[kind].envelope.start,
                        ).toISOString()}{' '}
                    →{' '}
                    {current[kind].envelope.end === null
                      ? 'UNKNOWN'
                      : new Date(current[kind].envelope.end).toISOString()}{' '}
                    (UTC)
                  </p>
                  <p>
                    Job revision {current[kind].envelope.job_revision}; worker{' '}
                    {current[kind].envelope.worker_id}; visit{' '}
                    {current[kind].envelope.visit_id} revision{' '}
                    {current[kind].envelope.visit_revision}; plan{' '}
                    {current[kind].envelope.plan_id} revision{' '}
                    {current[kind].envelope.plan_revision}.
                  </p>
                </div>
              ))}
              <p>
                Property: {current.property_id}. Customer: {current.customer_id}
                . Actual availability UNKNOWN. Durable receipt UNKNOWN; no
                synthesized receipt.
              </p>
              <div className="wor-actions">
                <button disabled={busy} onClick={() => close('CANCEL')}>
                  Cancel work-order revision review
                </button>
                <button disabled={busy} onClick={() => close('REVOKE')}>
                  Revoke work-order revision review
                </button>
              </div>
            </article>
          </div>
          <article className="wor-card">
            <h4>Immutable same-tab revision lineage</h4>
            <ol>
              {current.history.map((h) => (
                <li key={h.revision}>
                  Revision {h.revision}: {h.instructions}. Original issued scope
                  SHA-256: {h.scope_sha256}. Proposed scheduling source SHA-256:{' '}
                  {h.proposed.sha256}.
                </li>
              ))}
            </ol>
            <p>
              Review SHA-256: {current.integrity.sha256}. Receipt custody
              UNKNOWN; no automatic replay.
            </p>
          </article>
        </>
      )}
      {detail && current && (
        <section
          className="wor-card"
          aria-label="Exact work-order revision source"
        >
          <h3 ref={detailHeading} tabIndex={-1}>
            Exact work-order revision source
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
              Display existing work-order job workflow
            </button>
          )}
        </section>
      )}
    </section>
  );
}
