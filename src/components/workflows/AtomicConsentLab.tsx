import { useEffect, useRef, useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import {
  readAtomicConsentLab,
  assertAtomicConsentCurrentNow,
  inspectAtomicConsentRequirements,
  assertAtomicConsentRequirementsNow,
  reconcileAtomicConsentRequirements,
  openAtomicConsentSource,
  atomicConsentAttemptState,
  type AtomicConsentLabView,
  type AtomicConsentRequirements,
} from '../../lib/workflows/atomic-consent-lab';
import type { FollowUpProposalInput } from '../../lib/workflows/follow-up-admission';
import './atomic-consent-lab.css';
export interface AtomicConsentLabProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
export function AtomicConsentLab({
  sources,
  enabled = false,
  onSelectJob,
}: AtomicConsentLabProps) {
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
      /* Withhold unauthorized sources. */
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
    <ConsentForm
      key={binding.epoch}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="atomic-consent-lab"
      aria-label="Atomic consent requirements"
    >
      <h2>Atomic consent requirements</h2>
      <p>
        {admitted
          ? 'Current source or staff unavailable. Previous review withheld.'
          : 'Atomic consent review is off. No messages, outbox or provider connection exists.'}
      </p>
    </section>
  );
}
function ConsentForm({ sources, onSelectJob }: AtomicConsentLabProps) {
  const [confirmed, setConfirmed] = useState(false),
    [desk, setDesk] = useState<AtomicConsentLabView | null>(null),
    [key, setKey] = useState(''),
    [purpose, setPurpose] =
      useState<FollowUpProposalInput['purpose']>('service_follow_up'),
    [finalConfirmed, setFinalConfirmed] = useState(false),
    [result, setResult] = useState<AtomicConsentRequirements | null>(null),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [message, setMessage] = useState(''),
    [detail, setDetail] = useState<Awaited<
      ReturnType<typeof openAtomicConsentSource>
    > | null>(null);
  const active = useRef(true),
    pending = useRef(false),
    generation = useRef(0),
    gates = useRef<{ enabled: boolean; confirmed: boolean }[]>([]),
    heading = useRef<HTMLHeadingElement>(null),
    resultHeading = useRef<HTMLHeadingElement>(null),
    detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    active.current = true;
    const mountedGates = gates.current;
    return () => {
      active.current = false;
      mountedGates.forEach((g) => (g.confirmed = false));
    };
  }, []);
  useEffect(() => {
    if (desk) heading.current?.focus();
  }, [desk]);
  useEffect(() => {
    if (result) resultHeading.current?.focus();
  }, [result]);
  useEffect(() => {
    if (detail) detailHeading.current?.focus();
  }, [detail]);
  function invalidate() {
    generation.current++;
    gates.current.slice(1).forEach((g) => (g.confirmed = false));
    setFinalConfirmed(false);
    setResult(null);
    setDetail(null);
    setMessage('');
  }
  function newGate() {
    const g = { enabled: true, confirmed: true };
    gates.current.push(g);
    return g;
  }
  async function load() {
    if (!confirmed || pending.current || unknown || desk) return;
    pending.current = true;
    setBusy(true);
    const token = ++generation.current;
    try {
      const r = await readAtomicConsentLab(
        sources,
        {
          window: {
            from: '2026-12-28',
            through: '2027-01-25',
            as_of: '2026-12-28T12:00:00.000Z',
            channel: 'email',
          },
          lead_days: 14,
          overdue_days: 7,
          query: '',
          kind: 'all',
          readiness: 'all',
          job_id: '',
          customer_id: '',
          location_id: '',
        },
        newGate(),
      );
      if (active.current && token === generation.current) {
        assertAtomicConsentCurrentNow(r);
        setDesk(r);
        setMessage(
          'Actual maintenance sources loaded. Operational communication remains blocked.',
        );
      }
    } catch {
      if (active.current && token === generation.current) {
        setUnknown(true);
        setMessage(
          'Current source evidence unavailable / UNKNOWN. No communication occurred.',
        );
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function inspect() {
    if (!desk || !key || !finalConfirmed || pending.current) return;
    pending.current = true;
    setBusy(true);
    const token = generation.current;
    try {
      const c = desk.candidates.find((c) => c.key === key)!;
      const r = await inspectAtomicConsentRequirements(
        desk,
        {
          candidate_key: key,
          proposed_on: c.selection.due_on,
          purpose,
          plan_kind: 'follow_up',
        },
        newGate(),
      );
      if (active.current && token === generation.current) {
        assertAtomicConsentRequirementsNow(r);
        setResult(r);
        setMessage(
          'One immutable blocked requirements review retained. No positive consent was fabricated.',
        );
      }
    } catch {
      if (active.current && token === generation.current) {
        setUnknown(true);
        setMessage(
          'Existing review or UNKNOWN. Exact read-only reconciliation only; no replay or replacement.',
        );
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (!result || pending.current) return;
    pending.current = true;
    setBusy(true);
    const token = generation.current;
    try {
      const r = await reconcileAtomicConsentRequirements(result);
      if (active.current && token === generation.current)
        setMessage(
          r.status === 'EXACT_BLOCKED_REQUIREMENTS'
            ? 'Exact blocked requirements remain current. No send authority.'
            : 'Retained requirements UNKNOWN. No retry or replacement.',
        );
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function open(navigate = false) {
    if (!desk || !key || pending.current) return;
    pending.current = true;
    setBusy(true);
    const token = generation.current;
    try {
      const r = await openAtomicConsentSource(desk, key);
      if (active.current && token === generation.current) {
        assertAtomicConsentCurrentNow(desk);
        setDetail(r);
        if (navigate) onSelectJob?.(r.job_id);
      }
    } catch {
      if (active.current && token === generation.current) {
        setDesk(null);
        setResult(null);
        setDetail(null);
        setUnknown(true);
        setMessage('Exact source UNKNOWN. Prior evidence withheld.');
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  let current = desk;
  if (current)
    try {
      assertAtomicConsentCurrentNow(current);
    } catch {
      current = null;
    }
  let currentResult = result;
  if (currentResult)
    try {
      assertAtomicConsentRequirementsNow(currentResult);
    } catch {
      currentResult = null;
    }
  const candidate = current?.candidates.find((c) => c.key === key),
    attempt =
      current && key ? atomicConsentAttemptState(current, key) : 'NOT_REVIEWED';
  return (
    <section
      className="atomic-consent-lab"
      aria-label="Atomic consent requirements"
      aria-busy={busy}
    >
      <header>
        <div>
          <p className="acl-eyebrow">GROWTH · SOURCE-BOUND STAFF REVIEW</p>
          <h2>Consent boundary requirements</h2>
          <p>
            Keep actual follow-up evidence separate from hypothetical
            transaction tests.
          </p>
        </div>
        <span className="acl-badge">All communication BLOCKED</span>
      </header>
      <p className="acl-boundary">
        Current purpose consent, suppression, enrollment, sender authority and
        atomic source revocation remain unverified. This browser never resolves
        a recipient or connects to a writer, outbox, sender or provider.
        Positive server-lab cases use marked synthetic fixtures only.
      </p>
      <label className="acl-check">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || unknown || Boolean(desk)}
          onChange={(e) => {
            setConfirmed(e.target.checked);
          }}
        />
        I confirm this is an internal review of actual maintenance evidence
        only.
      </label>
      <button
        disabled={!confirmed || busy || unknown || Boolean(desk)}
        onClick={() => void load()}
      >
        {busy
          ? 'Checking consent sources…'
          : 'Load consent-bound maintenance sources'}
      </button>
      <p role={unknown ? 'alert' : 'status'}>{message}</p>
      {desk && !current && (
        <p role="alert">
          Source or staff context changed. Prior maintenance evidence withheld.
        </p>
      )}
      {current && (
        <>
          <h3 ref={heading} tabIndex={-1}>
            Available source-bound follow-up records
          </h3>
          <p>
            {current.matching_occurrences} matching of{' '}
            {current.available_occurrences} available occurrences. Complete
            coverage is UNKNOWN.
          </p>
          {!current.candidates.length ? (
            <p>
              No accessible matching opportunities; no permission to contact is
              implied.
            </p>
          ) : (
            <div className="acl-controls">
              <label>
                Exact maintenance opportunity
                <select
                  value={key}
                  onChange={(e) => {
                    invalidate();
                    setKey(e.target.value);
                  }}
                >
                  <option value="">Choose an exact recorded source</option>
                  {current.candidates.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.context.customer_label} · {c.context.property_label} ·{' '}
                      {c.plan_name} · {c.selection.due_on}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Requested purpose
                <select
                  value={purpose}
                  onChange={(e) => {
                    invalidate();
                    setPurpose(
                      e.target.value as FollowUpProposalInput['purpose'],
                    );
                  }}
                >
                  <option value="service_follow_up">Service follow-up</option>
                  <option value="recurring_maintenance">
                    Recurring maintenance
                  </option>
                  <option value="marketing">Marketing</option>
                </select>
              </label>
            </div>
          )}
          {candidate && (
            <article className="acl-card">
              <h4>{candidate.plan_name}</h4>
              <p>
                {candidate.context.customer_label} ·{' '}
                {candidate.context.property_label}
              </p>
              <p>
                Job {candidate.context.job_id}
                <br />
                Plan {candidate.selection.source.plan_id} · revision{' '}
                {candidate.selection.source.plan_revision}
                <br />
                Recorded due date {candidate.selection.due_on}
              </p>
              <p>
                One-use review state: {attempt}. A renewal opportunity never
                establishes enrollment or consent.
              </p>
              <label className="acl-check">
                <input
                  type="checkbox"
                  checked={finalConfirmed}
                  disabled={busy || attempt !== 'NOT_REVIEWED'}
                  onChange={(e) => {
                    setFinalConfirmed(e.target.checked);
                  }}
                />
                I confirm the exact source and purpose; inspect missing atomic
                requirements only.
              </label>
              <div className="acl-actions">
                <button
                  disabled={
                    !finalConfirmed || busy || attempt !== 'NOT_REVIEWED'
                  }
                  onClick={() => void inspect()}
                >
                  Inspect atomic consent requirements
                </button>
                <button disabled={busy} onClick={() => void open()}>
                  Open exact consent source
                </button>
              </div>
            </article>
          )}
        </>
      )}
      {currentResult && current && (
        <section
          className="acl-card"
          aria-label="Immutable atomic consent requirements"
        >
          <h3 ref={resultHeading} tabIndex={-1}>
            Atomic consent remains blocked
          </h3>
          <p>
            Observed historical channel state: {currentResult.observed.channel}.
            Current channel UNKNOWN; purpose {currentResult.observed.purpose};
            suppression {currentResult.observed.suppression}; enrollment{' '}
            {currentResult.observed.enrollment}.
          </p>
          <div className="acl-grid">
            <div>
              <h4>Actual missing authority</h4>
              <ul>
                {currentResult.missing_gates.map((g) => (
                  <li key={g}>{g.replaceAll('_', ' ')}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Hypothetical atomic contract</h4>
              <ul>
                {currentResult.required_atomic_facts.map((g) => (
                  <li key={g}>{g.replaceAll('_', ' ')}</li>
                ))}
              </ul>
            </div>
          </div>
          <p>
            Source {currentResult.envelope.source_sha256}
            <br />
            Immutable blocked-review binding {currentResult.integrity.sha256}
          </p>
          <p>
            Separate transaction tests prove only participating synthetic
            fixture serialization. Global source/Auth atomicity and real consent
            remain UNVERIFIED.
          </p>
          <button disabled={busy} onClick={() => void reconcile()}>
            Reconcile exact atomic requirements
          </button>
        </section>
      )}
      {detail && current && (
        <section className="acl-card" aria-label="Exact atomic consent source">
          <h3 ref={detailHeading} tabIndex={-1}>
            Exact atomic consent source
          </h3>
          <p>
            {detail.customer_label} · {detail.property_label}
          </p>
          <dl>
            {Object.entries(detail)
              .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k.replaceAll('_', ' ')}</dt>
                  <dd>{String(v)}</dd>
                </div>
              ))}
          </dl>
          {onSelectJob && (
            <button disabled={busy} onClick={() => void open(true)}>
              Display existing consent job workflow
            </button>
          )}
        </section>
      )}
    </section>
  );
}
