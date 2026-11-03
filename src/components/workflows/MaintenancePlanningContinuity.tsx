import { useEffect, useRef, useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { prototypeFields } from '../../lib/program/prototype-source';
import {
  assertFollowUpReadinessCurrentNow,
  type FollowUpReadinessInput,
  type FollowUpReadinessView,
} from '../../lib/workflows/follow-up-readiness';
import {
  readMaintenancePlanningContinuity,
  selectMaintenancePlanningSource,
  prepareMaintenancePlanningContinuity,
  assertMaintenancePlanningContinuityNow,
  reconcileMaintenancePlanningContinuity,
  closeMaintenancePlanningContinuity,
  openMaintenancePlanningContinuitySource,
  type MaintenancePlanningSelection,
  type MaintenancePlanningContinuityView,
  type MaintenancePlanningProposal,
} from '../../lib/workflows/maintenance-planning-continuity';
import './maintenance-planning-continuity.css';

export interface MaintenancePlanningContinuityProps {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string) => void;
}
export function MaintenancePlanningContinuity({
  sources,
  enabled = false,
  selectedJobId,
  onSelectJob,
}: MaintenancePlanningContinuityProps) {
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
      /* OFF/denied sources remain unread. */
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
    <PlanningDesk
      key={binding.epoch}
      sources={sources}
      selectedJobId={selectedJobId}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="maintenance-planning-continuity"
      aria-label="Maintenance planning continuity"
    >
      <h2>Maintenance planning continuity</h2>
      <p>
        {admitted
          ? 'Current authorized sources unavailable. Prior review withheld.'
          : 'Maintenance planning continuity is off. No sender, enrollment or scheduled messages.'}
      </p>
    </section>
  );
}
function PlanningDesk({
  sources,
  selectedJobId,
  onSelectJob,
}: MaintenancePlanningContinuityProps) {
  const [purpose, setPurpose] = useState<FollowUpReadinessInput['purpose']>(
      'recurring_maintenance',
    ),
    [channel, setChannel] = useState<'email' | 'sms'>('email'),
    [confirmed, setConfirmed] = useState(false),
    [proposedOn, setProposedOn] = useState('2027-01-04'),
    [planKind, setPlanKind] =
      useState<MaintenancePlanningProposal['plan_kind']>('follow_up'),
    [reviewConfirmed, setReviewConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [unknown, setUnknown] = useState(false),
    [terminal, setTerminal] = useState(false),
    [view, setView] = useState<FollowUpReadinessView | null>(null),
    [selection, setSelection] = useState<MaintenancePlanningSelection | null>(
      null,
    ),
    [review, setReview] = useState<MaintenancePlanningContinuityView | null>(
      null,
    ),
    [detail, setDetail] = useState<Awaited<
      ReturnType<typeof openMaintenancePlanningContinuitySource>
    > | null>(null),
    [message, setMessage] = useState(
      'Review available maintenance sources, then inspect an exact occurrence.',
    );
  const pending = useRef(false),
    live = useRef(true),
    gates = useRef<{ enabled: boolean; confirmed: boolean }[]>([]),
    retained = useRef<
      MaintenancePlanningSelection | MaintenancePlanningContinuityView | null
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
    if (selection || review) heading.current?.focus();
  }, [selection, review]);
  useEffect(() => {
    if (detail) sourceHeading.current?.focus();
  }, [detail]);
  function gate() {
    const g = { enabled: true, confirmed: true };
    gates.current.push(g);
    return g;
  }
  function fail() {
    setUnknown(true);
    setDetail(null);
    setMessage(
      'Exact maintenance, consent source or review UNKNOWN. No retry, replacement, sender or message execution.',
    );
  }
  function edit() {
    setConfirmed(false);
    setView(null);
    setSelection(null);
    setReview(null);
    setDetail(null);
  }
  async function read() {
    if (pending.current || !confirmed || attempted || unknown) return;
    pending.current = true;
    setBusy(true);
    setSelection(null);
    setDetail(null);
    try {
      const input: FollowUpReadinessInput = {
        window: {
          from: '2026-12-28',
          through: '2027-01-25',
          as_of: '2026-12-28T12:00:00.000Z',
          channel,
        },
        lead_days: 14,
        overdue_days: 7,
        query: '',
        kind: 'all',
        readiness: 'all',
        job_id: selectedJobId ?? '',
        customer_id: '',
        location_id: '',
        purpose,
        channel_state: 'all',
      };
      const result = await readMaintenancePlanningContinuity(
        sources,
        input,
        gate(),
      );
      if (live.current) {
        assertFollowUpReadinessCurrentNow(result);
        setView(result);
        setMessage(
          result.rows.length
            ? 'Available source-backed occurrences loaded. Requested purpose does not establish purpose consent.'
            : 'No matching authorized occurrences are available for this context. Coverage is access-limited.',
        );
      }
    } catch {
      if (live.current) fail();
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function select(key: string) {
    if (!view || pending.current || attempted || unknown) return;
    pending.current = true;
    setBusy(true);
    setDetail(null);
    setReviewConfirmed(false);
    try {
      const result = await selectMaintenancePlanningSource(view, key, gate());
      if (live.current) {
        retained.current = result;
        setSelection(result);
        setProposedOn(result.occurrence.recorded_due_on);
        setMessage(
          'Exact property, job, plan revision, occurrence and requested purpose retained. No repeated source selection is required.',
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
      !selection ||
      pending.current ||
      attempted ||
      !reviewConfirmed ||
      unknown
    )
      return;
    pending.current = true;
    setBusy(true);
    setAttempted(true);
    setDetail(null);
    try {
      const result = await prepareMaintenancePlanningContinuity(
        selection,
        { proposed_on: proposedOn, plan_kind: planKind },
        gate(),
      );
      if (live.current) {
        retained.current = result;
        setReview(result);
        setReviewConfirmed(false);
        setMessage(
          'Original consent requirements retained. Planning remains BLOCKED; renewal terms and current purpose/suppression evidence are not inferred.',
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
    if (!retained.current || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const r = await reconcileMaintenancePlanningContinuity(retained.current);
      if (live.current) {
        if (r.status === 'UNKNOWN') fail();
        else {
          setTerminal(
            [
              'CANCELLED_LOCAL_REVIEW',
              'REVOKED_LOCAL_REVIEW',
              'EXPIRED_LOCAL_REVIEW',
            ].includes(r.status),
          );
          setMessage(
            'Exact maintenance review: ' +
              r.status +
              '. Read only; sending remains blocked.',
          );
        }
      }
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  function close(action: 'CANCEL' | 'REVOKE') {
    if (!review || pending.current) return;
    try {
      const r = closeMaintenancePlanningContinuity(review, action);
      setTerminal(true);
      setDetail(null);
      setMessage(
        'Exact local review: ' +
          r.status +
          '. No consent, suppression or enrollment was changed.',
      );
    } catch {
      fail();
    }
  }
  async function open(navigate = false) {
    const target = review ?? selection;
    if (!target || pending.current || unknown || terminal) return;
    pending.current = true;
    setBusy(true);
    try {
      const result = await openMaintenancePlanningContinuitySource(target);
      assertMaintenancePlanningContinuityNow(target);
      if (live.current) {
        if (navigate) onSelectJob?.(target.occurrence.context.job_id);
        else setDetail(result);
      }
    } catch {
      if (live.current) fail();
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  let current = view,
    currentSelection = selection;
  if (current)
    try {
      assertFollowUpReadinessCurrentNow(current);
    } catch {
      current = null;
    }
  if (currentSelection)
    try {
      assertMaintenancePlanningContinuityNow(review ?? currentSelection);
    } catch {
      currentSelection = null;
    }
  return (
    <section
      className="maintenance-planning-continuity"
      aria-label="Maintenance planning continuity"
      aria-busy={busy}
    >
      <header>
        <div>
          <p className="mpc-eyebrow">GROWTH · SOURCE-BOUND PLANNING</p>
          <h2>Maintenance planning continuity</h2>
          <p>
            Carry an inspected maintenance occurrence into an explicit, blocked
            consent-requirements review.
          </p>
        </div>
        <span className="mpc-badge">Review only · no outbound execution</span>
      </header>
      <p className="mpc-boundary">
        Recorded contact preference is historical evidence. Current purpose
        consent, suppression, enrollment and renewal terms remain unverified. A
        proposed date is not enrollment, a scheduled message or permission to
        send.
      </p>
      <div className="mpc-controls">
        <label>
          Requested planning purpose
          <select
            value={purpose}
            disabled={busy || attempted}
            onChange={(e) => {
              edit();
              setPurpose(e.target.value as typeof purpose);
            }}
          >
            <option value="recurring_maintenance">Recurring maintenance</option>
            <option value="service_follow_up">Service follow-up</option>
            <option value="marketing">Marketing</option>
          </select>
        </label>
        <label>
          Requested review channel
          <select
            value={channel}
            disabled={busy || attempted}
            onChange={(e) => {
              edit();
              setChannel(e.target.value as typeof channel);
            }}
          >
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
        </label>
      </div>
      {selectedJobId && (
        <p>
          Exact Operating Center job: {selectedJobId}. Unavailable context never
          falls back to a different job.
        </p>
      )}
      <label className="mpc-check">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || attempted || unknown}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I confirm this is planning review only; requested purpose does not
        establish consent.
      </label>
      <button
        disabled={busy || !confirmed || attempted || unknown}
        onClick={() => void read()}
      >
        Review maintenance continuity sources
      </button>
      <p role={unknown ? 'alert' : 'status'}>
        {busy ? 'Checking exact maintenance sources…' : message}
      </p>
      {current && !unknown && (
        <>
          <p>
            {current.matching_occurrences} available matching occurrences.
            Counts do not establish complete property history.
          </p>
          <div className="mpc-grid">
            {current.rows.map((row) => (
              <article className="mpc-card" key={row.key}>
                <h3>{row.plan_name}</h3>
                <p>
                  {row.context.customer_label} · {row.context.property_label}
                </p>
                <p>
                  Job {row.context.job_id}. Due {row.recorded_due_on} ·{' '}
                  {row.date_basis.replaceAll('_', ' ')}.
                </p>
                <p>
                  Plan {row.plan_reference.id} revision{' '}
                  {row.plan_reference.revision}. Requested purpose{' '}
                  {row.requested_purpose}. Current channel authority UNKNOWN.
                </p>
                <button
                  aria-label={
                    'Inspect maintenance planning source ' +
                    row.context.job_id +
                    ' ' +
                    row.recorded_due_on +
                    ' ' +
                    row.key
                  }
                  disabled={busy || attempted || terminal}
                  onClick={() => void select(row.key)}
                >
                  Inspect maintenance planning source
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      {currentSelection && !terminal && !unknown && (
        <>
          <h3 ref={heading} tabIndex={-1}>
            Exact maintenance planning handoff
          </h3>
          <div className="mpc-grid">
            <article className="mpc-card">
              <h4>Retained occurrence</h4>
              <dl>
                <div>
                  <dt>Customer</dt>
                  <dd>{currentSelection.occurrence.context.customer_id}</dd>
                </div>
                <div>
                  <dt>Property</dt>
                  <dd>{currentSelection.occurrence.context.location_id}</dd>
                </div>
                <div>
                  <dt>Job</dt>
                  <dd>{currentSelection.occurrence.context.job_id}</dd>
                </div>
                <div>
                  <dt>Plan revision</dt>
                  <dd>
                    {currentSelection.occurrence.plan_reference.id} ·{' '}
                    {currentSelection.occurrence.plan_reference.revision}
                  </dd>
                </div>
                <div>
                  <dt>Requested purpose</dt>
                  <dd>{currentSelection.requested_purpose}</dd>
                </div>
              </dl>
              <button disabled={busy} onClick={() => void open()}>
                Open exact maintenance continuity source
              </button>
            </article>
            <article className="mpc-card">
              <h4>Separate planning confirmation</h4>
              <label>
                Proposed maintenance review date
                <input
                  type="date"
                  value={proposedOn}
                  disabled={busy || attempted}
                  onChange={(e) => {
                    setProposedOn(e.target.value);
                    setReviewConfirmed(false);
                  }}
                />
              </label>
              <label>
                Planning review kind
                <select
                  value={planKind}
                  disabled={busy || attempted}
                  onChange={(e) => {
                    setPlanKind(e.target.value as typeof planKind);
                    setReviewConfirmed(false);
                  }}
                >
                  <option value="follow_up">Follow-up proposal</option>
                  <option value="renewal">Renewal proposal</option>
                </select>
              </label>
              <label className="mpc-check">
                <input
                  type="checkbox"
                  checked={reviewConfirmed}
                  disabled={busy || attempted}
                  onChange={(e) => setReviewConfirmed(e.target.checked)}
                />
                I confirm this exact occurrence, purpose and proposed date; no
                sending or enrollment authority.
              </label>
              <button
                disabled={busy || attempted || !reviewConfirmed || !proposedOn}
                onClick={() => void prepare()}
              >
                Review maintenance planning requirements
              </button>
            </article>
          </div>
          {review && (
            <article className="mpc-card">
              <h4>Original blocked consent requirements</h4>
              <p>
                {review.plan_kind} · {review.proposed_on}. Communication
                authority BLOCKED. Renewal terms UNKNOWN.
              </p>
              <ul>
                {review.missing_gates.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
              <p>
                Original requirements SHA-256:{' '}
                {review.original_control.requirements_sha256}. Expires{' '}
                {new Date(review.original_control.expires_at).toISOString()}.
              </p>
              <div className="mpc-actions">
                <button disabled={busy} onClick={() => close('CANCEL')}>
                  Cancel maintenance planning review
                </button>
                <button disabled={busy} onClick={() => close('REVOKE')}>
                  Revoke maintenance planning review
                </button>
              </div>
            </article>
          )}
        </>
      )}
      {(selection || review) && (
        <button disabled={busy} onClick={() => void reconcile()}>
          Reconcile exact maintenance planning read only
        </button>
      )}
      {detail && currentSelection && !unknown && !terminal && (
        <article
          className="mpc-card"
          aria-label="Exact maintenance continuity source"
        >
          <h3 ref={sourceHeading} tabIndex={-1}>
            Exact maintenance continuity source
          </h3>
          <pre>{JSON.stringify(detail, null, 2)}</pre>
          {onSelectJob && (
            <button disabled={busy} onClick={() => void open(true)}>
              Display exact maintenance planning job
            </button>
          )}
        </article>
      )}
    </section>
  );
}
