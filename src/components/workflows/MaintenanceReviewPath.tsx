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
  type MaintenancePlanningSelection,
  type MaintenancePlanningContinuityView,
  type MaintenancePlanningProposal,
} from '../../lib/workflows/maintenance-planning-continuity';
import {
  readMaintenanceReviewRequirements,
  assertMaintenanceReviewRequirementsNow,
  reconcileMaintenanceReviewRequirements,
  returnMaintenancePlanningReview,
  type MaintenanceReviewRequirements,
} from '../../lib/workflows/maintenance-review-path';
import './maintenance-review-path.css';

export interface MaintenanceReviewPathProps {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string) => void;
}
export function MaintenanceReviewPath(props: MaintenanceReviewPathProps) {
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
      /* Denied detail stays hidden. */
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
    <ReviewDesk key={binding.epoch} {...props} />
  ) : (
    <section
      className="maintenance-review-path"
      aria-label="Maintenance review path"
    >
      <h2>Maintenance review path</h2>
      <p>
        {admitted
          ? 'Current authorized sources unavailable. Prior planning withheld.'
          : 'Maintenance review path is off. No enrollment, sender or communications enabled.'}
      </p>
    </section>
  );
}
function ReviewDesk({
  sources,
  selectedJobId,
  onSelectJob,
}: MaintenanceReviewPathProps) {
  const [purpose, setPurpose] = useState<FollowUpReadinessInput['purpose']>(
      'recurring_maintenance',
    ),
    [channel, setChannel] = useState<'email' | 'sms'>('email'),
    [confirmed, setConfirmed] = useState(false),
    [reviewConfirmed, setReviewConfirmed] = useState(false),
    [proposedOn, setProposedOn] = useState('2027-01-04'),
    [kind, setKind] =
      useState<MaintenancePlanningProposal['plan_kind']>('follow_up'),
    [view, setView] = useState<FollowUpReadinessView | null>(null),
    [selection, setSelection] = useState<MaintenancePlanningSelection | null>(
      null,
    ),
    [review, setReview] = useState<MaintenancePlanningContinuityView | null>(
      null,
    ),
    [requirements, setRequirements] =
      useState<MaintenanceReviewRequirements | null>(null),
    [inRequirements, setInRequirements] = useState(false),
    [attempted, setAttempted] = useState(false),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [terminal, setTerminal] = useState(false),
    [message, setMessage] = useState(
      'Review source-backed occurrences for the selected job, purpose and channel.',
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
    if (selection || review || requirements) heading.current?.focus();
  }, [selection, review, requirements, inRequirements]);
  const gate = () => {
    const g = { enabled: true, confirmed: true };
    gates.current.push(g);
    return g;
  };
  const fail = () => {
    setUnknown(true);
    setInRequirements(false);
    setMessage(
      'Exact maintenance/consent path UNKNOWN. Read-only reconciliation only; no retry, replacement, enrollment or sending.',
    );
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
  function edit() {
    setConfirmed(false);
    setView(null);
    setSelection(null);
    setRequirements(null);
    setReview(null);
    setInRequirements(false);
  }
  async function load() {
    if (!confirmed || attempted || unknown) return;
    await run(async () => {
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
        setView(result);
        setMessage(
          result.rows.length
            ? 'Exact available planning items loaded. Historical contact evidence does not grant current consent.'
            : 'No matching available occurrences. Coverage is access-limited, not complete history.',
        );
      }
    });
  }
  async function choose(key: string) {
    if (!view || attempted || unknown) return;
    await run(async () => {
      const result = await selectMaintenancePlanningSource(view, key, gate());
      if (live.current) {
        setSelection(result);
        setProposedOn(result.occurrence.recorded_due_on);
        setReviewConfirmed(false);
        setMessage(
          'Exact occurrence, plan revision, job, purpose and channel retained.',
        );
      }
    });
  }
  async function prepare() {
    if (!selection || !reviewConfirmed || attempted || unknown || terminal)
      return;
    setAttempted(true);
    await run(async () => {
      const result = await prepareMaintenancePlanningContinuity(
        selection,
        { proposed_on: proposedOn, plan_kind: kind },
        gate(),
      );
      if (live.current) {
        setReview(result);
        setReviewConfirmed(false);
        setMessage(
          'Original blocked consent requirements prepared. Inspect exact gaps without another source selector.',
        );
      }
    });
  }
  async function inspect() {
    if (!review || unknown || terminal) return;
    await run(async () => {
      const result =
        requirements ??
        (await readMaintenanceReviewRequirements(review, gate()));
      assertMaintenanceReviewRequirementsNow(result);
      if (live.current) {
        setRequirements(result);
        setInRequirements(true);
        setMessage(
          'Original requirements only. Current consent, suppression and renewal terms remain unverified. No sending authority.',
        );
      }
    });
  }
  async function back(navigate = false) {
    if (!requirements || unknown || terminal) return;
    await run(async () => {
      const result = await returnMaintenancePlanningReview(requirements);
      if (live.current) {
        setInRequirements(false);
        setMessage(
          'Returned to the same occurrence and original blocked review. No enrollment or message created.',
        );
        if (navigate) onSelectJob?.(result.occurrence.context.job_id);
      }
    });
  }
  async function reconcile() {
    const original = review ?? selection;
    if (!original) return;
    await run(async () => {
      const result = requirements
        ? await reconcileMaintenanceReviewRequirements(requirements)
        : await reconcileMaintenancePlanningContinuity(original);
      if (live.current) {
        if (result.status === 'UNKNOWN') fail();
        else {
          setTerminal(
            [
              'CANCELLED_LOCAL_REVIEW',
              'REVOKED_LOCAL_REVIEW',
              'EXPIRED_LOCAL_REVIEW',
            ].includes(result.status),
          );
          setMessage(
            'Exact read-only status: ' +
              result.status +
              '. No replay or sending.',
          );
        }
      }
    });
  }
  function close(action: 'CANCEL' | 'REVOKE') {
    if (!review || busy) return;
    try {
      const result = closeMaintenancePlanningContinuity(review, action);
      setTerminal(true);
      setInRequirements(false);
      setMessage(
        'Planning review ' +
          result.status +
          '. Original evidence retained; no consent mutation.',
      );
    } catch {
      fail();
    }
  }
  let current = view,
    currentSelection = review ?? selection;
  if (current)
    try {
      assertFollowUpReadinessCurrentNow(current);
    } catch {
      current = null;
    }
  if (currentSelection)
    try {
      assertMaintenancePlanningContinuityNow(currentSelection);
      if (requirements) assertMaintenanceReviewRequirementsNow(requirements);
    } catch {
      currentSelection = null;
    }
  return (
    <section
      className="maintenance-review-path"
      aria-label="Maintenance review path"
      aria-busy={busy}
    >
      <header>
        <p className="mrp-eyebrow">GROWTH · EXACT PLANNING PATH</p>
        <h2>Maintenance review path</h2>
        <p>
          One occurrence → original consent requirements → same planning item.
        </p>
      </header>
      <p className="mrp-boundary">
        Local planning only. Requested purpose is review context, never purpose
        consent. Historical contact evidence is not current permission.
        Suppression, enrollment and renewal terms remain unverified. No sender,
        recipient resolution, outbound worker or financial authority. Same-tab
        references are not durable custody.
      </p>
      <p>Job context: {selectedJobId ?? 'All currently authorized jobs'}.</p>
      {!selection && (
        <div className="mrp-card">
          <div className="mrp-controls">
            <label>
              Maintenance path purpose
              <select
                value={purpose}
                disabled={busy || attempted}
                onChange={(e) => {
                  edit();
                  setPurpose(e.target.value as typeof purpose);
                }}
              >
                <option value="recurring_maintenance">
                  Recurring maintenance
                </option>
                <option value="service_follow_up">Service follow-up</option>
                <option value="marketing">Marketing</option>
              </select>
            </label>
            <label>
              Maintenance path channel
              <select
                value={channel}
                disabled={busy || attempted}
                onChange={(e) => {
                  edit();
                  setChannel(e.target.value as typeof channel);
                }}
              >
                <option value="email">Email evidence</option>
                <option value="sms">SMS evidence</option>
              </select>
            </label>
          </div>
          <label className="mrp-check">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || attempted}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I confirm this is a source review only, with no permission to send.
          </label>
          <button
            disabled={busy || !confirmed || attempted || unknown}
            onClick={() => void load()}
          >
            Review maintenance path sources
          </button>
        </div>
      )}
      <p
        role={
          unknown || (selection && !currentSelection && !terminal)
            ? 'alert'
            : 'status'
        }
      >
        {busy
          ? 'Checking exact planning sources…'
          : selection && !currentSelection && !terminal
            ? 'Exact planning source changed. Detail withheld; reconcile read only.'
            : message}
      </p>
      {current && !selection && !unknown && (
        <div className="mrp-grid">
          {current.rows.length ? (
            current.rows.map((row) => (
              <article className="mrp-card" key={row.key}>
                <h3>{row.context.property_label}</h3>
                <p>
                  {row.plan_name} · {row.recorded_due_on} · {row.date_basis}
                </p>
                <p>
                  {row.context.customer_label} · {row.context.job_title}
                </p>
                <p>
                  Historical channel:{' '}
                  {row.observed_contact_v1.observed_channel_state}. Current
                  authority UNKNOWN.
                </p>
                <button disabled={busy} onClick={() => void choose(row.key)}>
                  Inspect maintenance item {row.recorded_due_on}
                </button>
              </article>
            ))
          ) : (
            <p>No matching available maintenance items.</p>
          )}
        </div>
      )}
      {currentSelection && !unknown && !terminal && (
        <>
          <h3 tabIndex={-1} ref={heading}>
            {inRequirements
              ? 'Exact consent and suppression requirements'
              : 'Retained maintenance planning item'}
          </h3>
          <div className="mrp-grid">
            <article className="mrp-card">
              <h4>{currentSelection.occurrence.plan_name}</h4>
              <dl>
                <div>
                  <dt>Customer / property</dt>
                  <dd>
                    {currentSelection.occurrence.context.customer_id} /{' '}
                    {currentSelection.occurrence.context.location_id}
                  </dd>
                </div>
                <div>
                  <dt>Job / occurrence</dt>
                  <dd>
                    {currentSelection.occurrence.context.job_id} /{' '}
                    {currentSelection.occurrence.key}
                  </dd>
                </div>
                <div>
                  <dt>Plan / revision</dt>
                  <dd>
                    {currentSelection.occurrence.plan_reference.id} /{' '}
                    {currentSelection.occurrence.plan_reference.revision}
                  </dd>
                </div>
                <div>
                  <dt>Purpose / channel</dt>
                  <dd>
                    {currentSelection.requested_purpose} /{' '}
                    {currentSelection.occurrence.channel}
                  </dd>
                </div>
              </dl>
            </article>
            {!inRequirements ? (
              <article className="mrp-card">
                <h4>Explicit human plan</h4>
                <label>
                  Maintenance path proposed date
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
                  Maintenance path plan kind
                  <select
                    value={kind}
                    disabled={busy || attempted}
                    onChange={(e) => {
                      setKind(e.target.value as typeof kind);
                      setReviewConfirmed(false);
                    }}
                  >
                    <option value="follow_up">Follow-up review</option>
                    <option value="renewal">Renewal review</option>
                  </select>
                </label>
                <label className="mrp-check">
                  <input
                    type="checkbox"
                    checked={reviewConfirmed}
                    disabled={busy || attempted}
                    onChange={(e) => setReviewConfirmed(e.target.checked)}
                  />
                  I confirm this plan only inspects original missing consent
                  requirements.
                </label>
                <button
                  disabled={
                    busy || attempted || !reviewConfirmed || !proposedOn
                  }
                  onClick={() => void prepare()}
                >
                  Prepare maintenance path requirements
                </button>
                {review && (
                  <>
                    <p>
                      Original review BLOCKED. Expires{' '}
                      {new Date(
                        review.original_control.expires_at,
                      ).toISOString()}
                      .
                    </p>
                    <button disabled={busy} onClick={() => void inspect()}>
                      Open exact maintenance requirements
                    </button>
                  </>
                )}
              </article>
            ) : (
              requirements && (
                <article className="mrp-card">
                  <h4>Send authority BLOCKED</h4>
                  <dl>
                    <div>
                      <dt>Current channel authority</dt>
                      <dd>{requirements.current_channel_authority}</dd>
                    </div>
                    <div>
                      <dt>Purpose consent</dt>
                      <dd>{requirements.purpose_consent}</dd>
                    </div>
                    <div>
                      <dt>Suppression</dt>
                      <dd>{requirements.suppression}</dd>
                    </div>
                    <div>
                      <dt>Enrollment / renewal terms</dt>
                      <dd>{requirements.enrollment} / UNKNOWN</dd>
                    </div>
                  </dl>
                  <h4>Original missing gates</h4>
                  <ul>
                    {requirements.missing_gates.map((gap, i) => (
                      <li key={i}>{gap}</li>
                    ))}
                  </ul>
                  <p>
                    Exact requirements hash:{' '}
                    {requirements.original_control.requirements_sha256}
                  </p>
                  <p>Path SHA-256: {requirements.integrity.sha256}</p>
                  <button disabled={busy} onClick={() => void back()}>
                    Return to maintenance planning item
                  </button>
                  {onSelectJob && (
                    <button disabled={busy} onClick={() => void back(true)}>
                      Display exact maintenance job
                    </button>
                  )}
                </article>
              )
            )}
          </div>
          {review && (
            <div className="mrp-actions">
              <button disabled={busy} onClick={() => close('CANCEL')}>
                Cancel maintenance path review
              </button>
              <button disabled={busy} onClick={() => close('REVOKE')}>
                Revoke maintenance path review
              </button>
            </div>
          )}
        </>
      )}
      {selection && (
        <button disabled={busy} onClick={() => void reconcile()}>
          Reconcile maintenance path read only
        </button>
      )}
    </section>
  );
}
