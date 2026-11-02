import { useEffect, useRef, useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import {
  readFollowUpDesk,
  prepareFollowUpAdmission,
  reconcileFollowUpAdmission,
  openFollowUpSource,
  assertFollowUpCurrentNow,
  followUpAttemptState,
  type FollowUpDeskView,
  type FollowUpAdmissionView,
  type FollowUpProposalInput,
} from '../../lib/workflows/follow-up-admission';
import './follow-up-admission.css';
export interface FollowUpAdmissionProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
export function FollowUpAdmission({
  sources,
  enabled = false,
  onSelectJob,
}: FollowUpAdmissionProps) {
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
      /* Withhold unavailable original sources. */
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
    <FollowUpForm
      key={binding.epoch}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="follow-up-admission"
      aria-label="Source-safe follow-up desk"
    >
      <h2>Follow-up admission review</h2>
      <p>
        {admitted
          ? 'Current authorized sources are unavailable. Previous reviews are withheld.'
          : 'Follow-up review is off. No communication, enrollment or scheduling is enabled.'}
      </p>
    </section>
  );
}
function FollowUpForm({ sources, onSelectJob }: FollowUpAdmissionProps) {
  const first = sources.entries[0];
  const [from, setFrom] = useState('2026-12-28'),
    [through, setThrough] = useState('2027-01-25'),
    [asOf, setAsOf] = useState('2026-12-28'),
    [channel, setChannel] = useState<'email' | 'sms'>('email'),
    [query, setQuery] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [desk, setDesk] = useState<FollowUpDeskView | null>(null),
    [selected, setSelected] = useState(''),
    [proposedOn, setProposedOn] = useState(first.day),
    [purpose, setPurpose] =
      useState<FollowUpProposalInput['purpose']>('service_follow_up'),
    [kind, setKind] = useState<FollowUpProposalInput['plan_kind']>('follow_up'),
    [finalConfirmed, setFinalConfirmed] = useState(false),
    [result, setResult] = useState<FollowUpAdmissionView | null>(null),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [sourceKey, setSourceKey] = useState(''),
    [sourceDetail, setSourceDetail] = useState<Awaited<
      ReturnType<typeof openFollowUpSource>
    > | null>(null);
  const live = useRef(true),
    pending = useRef(false),
    generation = useRef(0),
    deskGate = useRef<{ enabled: boolean; confirmed: boolean } | null>(null),
    finalGate = useRef<{ enabled: boolean; confirmed: boolean } | null>(null),
    deskHeading = useRef<HTMLHeadingElement>(null),
    resultHeading = useRef<HTMLHeadingElement>(null),
    sourceHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (deskGate.current) deskGate.current.confirmed = false;
      if (finalGate.current) finalGate.current.confirmed = false;
    };
  }, []);
  useEffect(() => {
    if (desk) deskHeading.current?.focus();
  }, [desk]);
  useEffect(() => {
    if (result) resultHeading.current?.focus();
  }, [result]);
  useEffect(() => {
    if (sourceDetail) sourceHeading.current?.focus();
  }, [sourceDetail]);
  function invalidateProposal() {
    generation.current++;
    if (finalGate.current) finalGate.current.confirmed = false;
    setFinalConfirmed(false);
    setResult(null);
    setSourceDetail(null);
    setError('');
    setMessage('');
  }
  function invalidateDesk() {
    invalidateProposal();
    if (deskGate.current) deskGate.current.confirmed = false;
    setConfirmed(false);
    setDesk(null);
    setSelected('');
  }
  async function load() {
    if (!confirmed || pending.current || unknown) return;
    const token = ++generation.current,
      gate = { enabled: true, confirmed: true };
    deskGate.current = gate;
    pending.current = true;
    setBusy(true);
    setError('');
    setDesk(null);
    setSelected('');
    setResult(null);
    try {
      const view = await readFollowUpDesk(
        sources,
        {
          window: { from, through, as_of: asOf + 'T12:00:00.000Z', channel },
          lead_days: 14,
          overdue_days: 7,
          query,
          kind: 'all',
          readiness: 'all',
          job_id: '',
          customer_id: '',
          location_id: '',
        },
        gate,
      );
      if (live.current && token === generation.current) {
        assertFollowUpCurrentNow(view);
        setDesk(view);
        setMessage(
          'Available source-bound opportunities loaded. All communication remains blocked.',
        );
      }
    } catch {
      if (live.current && token === generation.current) {
        setUnknown(true);
        setError(
          'Current follow-up evidence is unavailable or UNKNOWN. No communication or scheduling occurred.',
        );
      }
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function inspect() {
    if (!desk || !selected || !finalConfirmed || pending.current) return;
    const token = generation.current,
      gate = { enabled: true, confirmed: true };
    finalGate.current = gate;
    pending.current = true;
    setBusy(true);
    setResult(null);
    setError('');
    try {
      const review = await prepareFollowUpAdmission(
        desk,
        {
          candidate_key: selected,
          proposed_on: proposedOn,
          purpose,
          plan_kind: kind,
        },
        gate,
      );
      if (live.current && token === generation.current) {
        assertFollowUpCurrentNow(desk);
        setResult(review);
        setMessage(
          'One immutable blocked admission review retained. No recipient or provider request exists.',
        );
      }
    } catch {
      if (live.current && token === generation.current) {
        setUnknown(true);
        setError(
          'Admission evidence is UNKNOWN or already retained. No replay, replacement or message is permitted.',
        );
      }
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (!desk || !selected || pending.current) return;
    const token = generation.current;
    pending.current = true;
    setBusy(true);
    try {
      const status = await reconcileFollowUpAdmission(desk, selected);
      if (live.current && token === generation.current) {
        if (status.status === 'EXACT_BLOCKED_REVIEW')
          setMessage(
            'Exact retained blocked review still matches captured sources. It grants no sending authority.',
          );
        else {
          setResult(null);
          setUnknown(true);
          setMessage(
            'Exact retained admission remains UNKNOWN. No replay or replacement.',
          );
        }
      }
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function open(key: string, navigate = false) {
    if (!desk || pending.current) return;
    const token = generation.current;
    pending.current = true;
    setBusy(true);
    try {
      const detail = await openFollowUpSource(desk, key);
      if (live.current && token === generation.current) {
        assertFollowUpCurrentNow(desk);
        setSourceDetail(detail);
        setSourceKey(key);
        if (navigate) onSelectJob?.(detail.job_id);
      }
    } catch {
      if (live.current && token === generation.current) {
        setDesk(null);
        setResult(null);
        setUnknown(true);
        setError('Exact follow-up source changed. Navigation is withheld.');
      }
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  let current = desk;
  if (current)
    try {
      assertFollowUpCurrentNow(current);
    } catch {
      current = null;
    }
  const candidate = current?.candidates.find((c) => c.key === selected),
    attempt =
      current && candidate
        ? followUpAttemptState(current, candidate.key)
        : 'NOT_REVIEWED';
  return (
    <section
      className="follow-up-admission"
      aria-label="Source-safe follow-up desk"
      aria-busy={busy}
    >
      <header>
        <div>
          <p className="fua-eyebrow">GROWTH · LOCAL STAFF PLANNING</p>
          <h2>Maintenance and follow-up admission</h2>
          <p>
            Keep recorded recurrence separate from proposed renewal and
            follow-up dates.
          </p>
        </div>
        <span className="fua-badge">Communication BLOCKED</span>
      </header>
      <p className="fua-boundary">
        Historical channel preferences are planning evidence. Current purpose
        consent, suppression, sender authority, enrollment and an atomic
        consent-at-send gate are unverified. No recipient is resolved.
      </p>
      <div className="fua-controls">
        <label>
          Opportunity window from
          <input
            type="date"
            value={from}
            onChange={(e) => {
              invalidateDesk();
              setFrom(e.target.value);
            }}
          />
        </label>
        <label>
          Opportunity window through
          <input
            type="date"
            value={through}
            onChange={(e) => {
              invalidateDesk();
              setThrough(e.target.value);
            }}
          />
        </label>
        <label>
          Planning as-of date
          <input
            type="date"
            value={asOf}
            onChange={(e) => {
              invalidateDesk();
              setAsOf(e.target.value);
            }}
          />
        </label>
        <label>
          Proposed communication channel
          <select
            value={channel}
            onChange={(e) => {
              invalidateDesk();
              setChannel(e.target.value as 'email' | 'sms');
            }}
          >
            <option value="email">Email review</option>
            <option value="sms">SMS review</option>
          </select>
        </label>
        <label>
          Search available opportunities
          <input
            type="search"
            value={query}
            onChange={(e) => {
              invalidateDesk();
              setQuery(e.target.value);
            }}
          />
        </label>
      </div>
      <label className="fua-check">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || unknown}
          onChange={(e) => {
            invalidateDesk();
            setConfirmed(e.target.checked);
          }}
        />
        I confirm this source-bound maintenance planning review only.
      </label>
      <button
        disabled={!confirmed || busy || unknown}
        onClick={() => void load()}
      >
        {busy
          ? 'Checking follow-up sources…'
          : 'Review follow-up opportunities'}
      </button>
      {error && <p role="alert">{error}</p>}
      <p role="status">{message}</p>
      {desk && !current && (
        <p role="alert">
          Sources or current staff context changed. Previous opportunities are
          withheld.
        </p>
      )}
      {current && (
        <>
          <h3 tabIndex={-1} ref={deskHeading}>
            Available maintenance opportunities
          </h3>
          <p>
            {current.matching_occurrences} matching of{' '}
            {current.available_occurrences} available occurrences across{' '}
            {current.jobs.length} admitted jobs. Coverage is access-limited;
            complete history is UNKNOWN.
          </p>
          {!current.candidates.length && (
            <p className="fua-empty">
              No matching available opportunities. This does not prove that
              maintenance is complete or a customer may be contacted.
            </p>
          )}
          <div className="fua-opportunities">
            {current.candidates.map((c, i) => (
              <article className="fua-card" key={c.key}>
                <p className="fua-eyebrow">
                  {c.selection.kind.replaceAll('_', ' ')}
                </p>
                <h4>{c.plan_name}</h4>
                <p>
                  {c.context.customer_label} · {c.context.property_label}
                </p>
                <p>
                  Recorded due date: <strong>{c.selection.due_on}</strong>
                  <br />
                  Staff planning: {c.planning_status}
                  <br />
                  Message eligibility: BLOCKED
                </p>
                <p>
                  Job {c.context.job_id}
                  <br />
                  Plan {c.selection.source.plan_id} · revision{' '}
                  {c.selection.source.plan_revision}
                </p>
                <button disabled={busy} onClick={() => void open(c.key)}>
                  Open exact follow-up source {i + 1}
                </button>
                <button
                  disabled={busy || unknown}
                  onClick={() => {
                    invalidateProposal();
                    setSelected(c.key);
                    setProposedOn(c.selection.due_on);
                  }}
                >
                  Review proposed follow-up {i + 1}
                </button>
              </article>
            ))}
          </div>
          {candidate && (
            <section
              className="fua-card"
              aria-label="Explicit follow-up admission proposal"
            >
              <h3>Inspect final admission requirements</h3>
              <p>
                {candidate.context.customer_label} ·{' '}
                {candidate.context.property_label}
              </p>
              <p>
                Recorded due date {candidate.selection.due_on} stays unchanged.
                The proposed date below creates no visit, enrollment or customer
                obligation.
              </p>
              <div className="fua-controls">
                <label>
                  Unsaved proposed follow-up date
                  <input
                    type="date"
                    value={proposedOn}
                    onChange={(e) => {
                      invalidateProposal();
                      setProposedOn(e.target.value);
                    }}
                  />
                </label>
                <label>
                  Proposed planning kind
                  <select
                    value={kind}
                    onChange={(e) => {
                      invalidateProposal();
                      setKind(
                        e.target.value as FollowUpProposalInput['plan_kind'],
                      );
                    }}
                  >
                    <option value="follow_up">Follow-up review</option>
                    <option value="renewal">Renewal planning review</option>
                  </select>
                </label>
                <label>
                  Requested communication purpose
                  <select
                    value={purpose}
                    onChange={(e) => {
                      invalidateProposal();
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
              <p>
                One-use source review state: {attempt}. Session memory is not
                crash-durable custody.
              </p>
              <label className="fua-check">
                <input
                  type="checkbox"
                  checked={finalConfirmed}
                  disabled={busy || attempt !== 'NOT_REVIEWED'}
                  onChange={(e) => {
                    invalidateProposal();
                    setFinalConfirmed(e.target.checked);
                  }}
                />
                I confirm this exact proposed date and purpose; inspect blocked
                requirements only.
              </label>
              <button
                disabled={!finalConfirmed || busy || attempt !== 'NOT_REVIEWED'}
                onClick={() => void inspect()}
              >
                Inspect final admission gates
              </button>
              <button
                disabled={busy || attempt === 'NOT_REVIEWED'}
                onClick={() => void reconcile()}
              >
                Reconcile exact admission review
              </button>
            </section>
          )}
        </>
      )}
      {result && current && (
        <section
          className="fua-card"
          aria-label="Immutable blocked follow-up review"
        >
          <h3 tabIndex={-1} ref={resultHeading}>
            Follow-up admission blocked
          </h3>
          <p>
            Staff Preview Only · not sent, enrolled, scheduled or authorized.
          </p>
          <div className="fua-comparison">
            <div>
              <h4>Recorded source</h4>
              <p>
                {result.recorded_plan_name}
                <br />
                Due {result.recorded_due_on}
                <br />
                Job {result.context.job_id}
              </p>
            </div>
            <div>
              <h4>Unsaved human proposal</h4>
              <p>
                {result.proposal.plan_kind.replaceAll('_', ' ')} ·{' '}
                {result.proposal.proposed_on}
                <br />
                {result.proposal.purpose.replaceAll('_', ' ')}
              </p>
            </div>
          </div>
          <p>
            Observed historical contact-v1 state:{' '}
            {result.observed_contact_v1_state}. Current channel authority
            UNKNOWN. Suppression {result.suppression}; purpose consent{' '}
            {result.purpose_consent}. No operational consent gate exists.
          </p>
          <ul>
            {result.missing_gates.map((g) => (
              <li key={g}>{g.replaceAll('_', ' ')}</li>
            ))}
          </ul>
          <p>Immutable review hash {result.integrity.sha256}</p>
        </section>
      )}
      {sourceDetail && current && (
        <section
          className="fua-card"
          aria-label="Exact follow-up source detail"
        >
          <h3 tabIndex={-1} ref={sourceHeading}>
            Exact follow-up source
          </h3>
          {onSelectJob && (
            <button
              disabled={busy || !sourceKey}
              onClick={() => void open(sourceKey, true)}
            >
              Display existing job workflow
            </button>
          )}
          <p>
            {sourceDetail.customer_label} · {sourceDetail.property_label}
          </p>
          <dl>
            <dt>Company</dt>
            <dd>{sourceDetail.organization_id}</dd>
            <dt>Customer</dt>
            <dd>{sourceDetail.customer_id}</dd>
            <dt>Property</dt>
            <dd>{sourceDetail.location_id}</dd>
            <dt>Job</dt>
            <dd>{sourceDetail.job_id}</dd>
            <dt>Issued version</dt>
            <dd>{sourceDetail.issued_version_id}</dd>
          </dl>
        </section>
      )}
    </section>
  );
}
