import { useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import { maintenanceDate } from '../../domain/property/maintenance';
import {
  maintenanceReviewPurposes,
  readPlanCancellationReview,
  assertPlanCancellationObservationAccess,
  rereadPlanCancellationReview,
  planCancellationFacts,
  planCancellationOccurrenceFacts,
  verifyPlanCancellationRequirements,
  selectPlanCancellationOccurrence,
  preparePlanCancellationReview,
  closePlanCancellationReview,
  reconcilePlanCancellationReview,
  type MaintenanceReviewPurpose,
  type PlanCancellationReview,
  type PlanCancellationSelection,
} from '../../lib/workflows/plan-cancellation-review';
import './maintenance-cancellation-actions.css';

export type MaintenanceCancellationActionsProps = SavedRevisionPanelProps & {
  onSourcesSaved?: () => void;
};
export function MaintenanceCancellationActions(
  props: MaintenanceCancellationActionsProps,
) {
  const allowed =
      typeof window !== 'undefined' &&
      journeyEnabled({
        development: import.meta.env.DEV,
        flag: props.enabled ? 'true' : undefined,
        hostname: window.location.hostname,
        protocol: window.location.protocol,
      }),
    [context, setContext] = useState({
      sources: props.sources,
      job: props.selectedJobId,
      allowed,
      epoch: 0,
    });
  if (
    context.sources !== props.sources ||
    context.job !== props.selectedJobId ||
    context.allowed !== allowed
  ) {
    setContext({
      sources: props.sources,
      job: props.selectedJobId,
      allowed,
      epoch: context.epoch + 1,
    });
    return null;
  }
  return allowed && props.selectedJobId ? (
    <ReviewActions
      key={context.epoch}
      {...props}
      selectedJobId={props.selectedJobId}
    />
  ) : null;
}
function ReviewActions({
  sources,
  selectedJobId,
}: SavedRevisionPanelProps & { selectedJobId: string }) {
  const [purpose, setPurpose] = useState<MaintenanceReviewPurpose>(
      'recurring_maintenance',
    ),
    [review, setReview] = useState<PlanCancellationReview>(),
    [selected, setSelected] = useState<PlanCancellationSelection>(),
    [key, setKey] = useState(''),
    [proposedOn, setProposedOn] = useState(''),
    [kind, setKind] = useState<'follow_up' | 'renewal'>('follow_up'),
    [confirmed, setConfirmed] = useState(false),
    [prepared, setPrepared] = useState(false),
    [verified, setVerified] = useState(false),
    [attempted, setAttempted] = useState(false),
    [terminalAttempted, setTerminalAttempted] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(
      'Read an exact occurrence and requested purpose. Native plan and enrollment cancellation are unsupported.',
    ),
    life = useRef({ alive: true, pending: false, serial: 0 }),
    gate = useRef({ enabled: true, confirmed: true });
  useLayoutEffect(() => {
    const l = life.current,
      g = gate.current;
    l.alive = true;
    g.enabled = true;
    g.confirmed = true;
    return () => {
      l.alive = false;
      l.serial++;
      g.enabled = false;
      g.confirmed = false;
    };
  }, []);
  async function run(action: () => Promise<void>) {
    const l = life.current;
    if (l.pending) return;
    l.pending = true;
    setBusy(true);
    try {
      await action();
    } catch {
      if (l.alive) setVerified(false);
      if (l.alive)
        setStatus(
          'Source unavailable or action held. Reconcile the retained review; never retry preparation after UNKNOWN.',
        );
    } finally {
      l.pending = false;
      if (l.alive) {
        setBusy(false);
        setConfirmed(false);
      }
    }
  }
  function resetInputs() {
    setVerified(false);
    setConfirmed(false);
  }
  async function load() {
    if (attempted || terminalAttempted) return;
    setVerified(false);
    setConfirmed(false);
    const next = review
      ? await rereadPlanCancellationReview(
          review,
          sources,
          selectedJobId,
          gate.current,
        )
      : await readPlanCancellationReview(
          sources,
          selectedJobId,
          purpose,
          gate.current,
        );
    const retained =
      key && next.desk.rows.some((row) => row.key === key)
        ? await selectPlanCancellationOccurrence(next, key)
        : undefined;
    if (life.current.alive) {
      setReview(next);
      setSelected(retained);
      setPrepared(false);
      setStatus(
        key
          ? retained
            ? 'Exact occurrence and purpose retained from current sources. Previous verification and confirmation are cleared.'
            : 'Previously selected exact occurrence is unavailable. No fallback was selected; choose a displayed source explicitly.'
          : 'Choose an exact displayed occurrence. Preparation remains blocked from sending.',
      );
    }
  }
  async function select(value: string) {
    if (!review || attempted || terminalAttempted) return;
    if (value === '') {
      setSelected(undefined);
      setKey('');
      setProposedOn('');
      setKind('follow_up');
      setPrepared(false);
      resetInputs();
      setStatus(
        'Occurrence selection cleared. Choose an exact source explicitly; no staff review was prepared or replaced.',
      );
      return;
    }
    const next = await selectPlanCancellationOccurrence(review, value);
    if (life.current.alive) {
      setSelected(next);
      setVerified(false);
      setKey(value);
      setProposedOn(next.selection.occurrence.recorded_due_on);
      setConfirmed(false);
      setPrepared(false);
      setStatus(
        'Exact occurrence selected; explicitly confirm before preparing the original blocked staff review.',
      );
    }
  }
  async function verify() {
    if (!selected) return;
    setVerified(false);
    const result = await verifyPlanCancellationRequirements(selected);
    if (life.current.alive) {
      setVerified(true);
      setStatus(
        result.status +
          ' · All sending, enrollment and renewal authority remains blocked.',
      );
    }
  }
  async function prepare() {
    if (!selected || !verified) return;
    // Reject invalid local input before consuming the original one-use attempt.
    maintenanceDate(proposedOn);
    await verifyPlanCancellationRequirements(selected);
    setAttempted(true);
    const actual = await preparePlanCancellationReview(
      selected,
      { proposed_on: proposedOn, plan_kind: kind },
      confirmed,
    );
    if (life.current.alive) {
      setPrepared(true);
      setStatus(
        'BLOCKED_LOCAL_REVIEW · ' +
          actual.requested_purpose +
          '. No consent, enrollment, renewal or sending authority.',
      );
    }
  }
  async function close(action: 'CANCEL' | 'REVOKE') {
    if (!selected || !verified) return;
    await verifyPlanCancellationRequirements(selected);
    setTerminalAttempted(true);
    const result = await closePlanCancellationReview(
      selected,
      action,
      confirmed,
    );
    if (life.current.alive) {
      setStatus(
        result.status +
          ' · Native plan unchanged; this terminal staff review cannot be replaced.',
      );
      setPrepared(false);
    }
  }
  async function reconcile() {
    if (!selected) return;
    setVerified(false);
    const result = await reconcilePlanCancellationReview(selected);
    if (life.current.alive)
      setStatus(
        result.status +
          ' · exact read-only reconciliation; replay FORBIDDEN. Native plan cancellation UNSUPPORTED.',
      );
  }
  let facts: ReturnType<typeof planCancellationFacts> | undefined,
    occurrence: ReturnType<typeof planCancellationOccurrenceFacts> | undefined;
  try {
    if (review) facts = planCancellationFacts(review);
    if (selected) occurrence = planCancellationOccurrenceFacts(selected);
  } catch {
    facts = undefined;
    occurrence = undefined;
  }
  let observationAccess = true;
  try {
    if (review) assertPlanCancellationObservationAccess(review);
  } catch {
    observationAccess = false;
  }
  const currentSelection = !!occurrence;
  let validProposedOn = true;
  try {
    maintenanceDate(proposedOn);
  } catch {
    validProposedOn = false;
  }
  if (!currentSelection && (verified || confirmed)) {
    setVerified(false);
    setConfirmed(false);
  }
  return (
    <section
      className="maintenance-cancellation-actions"
      aria-label="Maintenance staff review actions"
    >
      <h3>Maintenance staff review controls</h3>
      <p>
        Cancel this staff review only. Native plan cancellation and enrollment
        cancellation: UNSUPPORTED. No message or renewal will run.
      </p>
      <label>
        Requested staff review purpose
        <select
          value={purpose}
          disabled={
            busy || attempted || terminalAttempted || !observationAccess
          }
          onChange={(e) => {
            const next = e.target.value as MaintenanceReviewPurpose;
            if (
              attempted ||
              terminalAttempted ||
              !maintenanceReviewPurposes.includes(next)
            )
              return;
            setPurpose(next);
            setReview(undefined);
            setSelected(undefined);
            setKey('');
            setProposedOn('');
            setKind('follow_up');
            setPrepared(false);
            resetInputs();
          }}
        >
          {maintenanceReviewPurposes.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={busy || attempted || terminalAttempted || !observationAccess}
        onClick={() => void run(load)}
      >
        Read staff cancellation sources
      </button>
      {selected && !currentSelection && (
        <p role="alert">
          Exact maintenance source or staff access changed. Previous
          confirmation and verification are withheld. Reread the exact source
          before an unattempted review; attempted or UNKNOWN reviews reconcile
          only.
        </p>
      )}
      {facts && (
        <>
          <label>
            Exact cancellation review occurrence
            <select
              value={key}
              disabled={
                busy || attempted || terminalAttempted || !observationAccess
              }
              onChange={(e) => void run(() => select(e.target.value))}
            >
              <option value="">Choose exact occurrence</option>
              {key && !facts.rows.some((row) => row.key === key) && (
                <option value={key} disabled>
                  Unavailable exact occurrence · {key}
                </option>
              )}
              {facts.rows.map((row) => (
                <option key={row.key} value={row.key}>
                  {row.due_on} · {row.plan_reference.id} · revision{' '}
                  {row.plan_reference.revision}
                </option>
              ))}
            </select>
          </label>
          <p>
            Purpose consent: UNVERIFIED · Suppression: UNVERIFIED · Enrollment:
            UNVERIFIED · Renewal terms: UNKNOWN · CAPTURED_NOT_ATOMIC.
          </p>
        </>
      )}
      {selected && observationAccess && (
        <>
          <p>Exact source: {selected.selection.occurrence.key}</p>
          {occurrence && (
            <section
              className="maintenance-cancellation-actions__requirements"
              aria-label="Selected maintenance requirements"
            >
              <h4>Selected plan and renewal evidence</h4>
              <dl>
                <dt>Saved plan</dt>
                <dd>
                  {occurrence.plan.name} · {occurrence.plan.id} · revision{' '}
                  {occurrence.plan.revision}
                </dd>
                <dt>Recorded cadence</dt>
                <dd>
                  {occurrence.plan.cadence} · starts {occurrence.plan.starts_on}{' '}
                  · {occurrence.plan.timezone}
                </dd>
                <dt>Occurrence</dt>
                <dd>
                  {occurrence.occurrence_kind} · {occurrence.due_on} ·{' '}
                  {occurrence.date_basis}
                </dd>
                <dt>Requested purpose</dt>
                <dd>{occurrence.requested_purpose} · review context only</dd>
                <dt>Recorded channel</dt>
                <dd>
                  {occurrence.channel} · {occurrence.recorded_channel}
                </dd>
                <dt>Current channel authority</dt>
                <dd>{occurrence.current_channel_authority}</dd>
                <dt>Purpose consent</dt>
                <dd>{occurrence.purpose_consent}</dd>
                <dt>Suppression</dt>
                <dd>{occurrence.suppression}</dd>
                <dt>Enrollment</dt>
                <dd>{occurrence.enrollment}</dd>
                <dt>Renewal terms</dt>
                <dd>{occurrence.renewal_terms}</dd>
                <dt>Recorded follow-up references</dt>
                <dd>
                  {occurrence.followups.length
                    ? occurrence.followups
                        .map(
                          (f) =>
                            f.id +
                            ' · revision ' +
                            f.revision +
                            ' · ' +
                            (f.follow_up_on ?? 'No recorded date'),
                        )
                        .join('; ')
                    : 'No recorded follow-up reference; never inferred'}
                </dd>
              </dl>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(verify)}
              >
                Verify selected maintenance requirements
              </button>
              <p>
                {verified && currentSelection
                  ? 'Current requirements checked for this selection. Original action rechecks before proceeding.'
                  : 'Current requirements not verified; prepare and terminal actions remain disabled.'}
              </p>
            </section>
          )}
          <label>
            Proposed staff review date
            <input
              type="date"
              value={proposedOn}
              aria-invalid={!validProposedOn}
              disabled={busy || attempted || !currentSelection}
              onChange={(e) => {
                setProposedOn(e.target.value);
                resetInputs();
              }}
            />
          </label>
          {!validProposedOn && (
            <p role="status">
              Enter a valid staff review date before preparation. No original
              attempt has been consumed by this invalid input.
            </p>
          )}
          <label>
            Staff review kind
            <select
              value={kind}
              disabled={busy || attempted || !currentSelection}
              onChange={(e) => {
                setKind(e.target.value as 'follow_up' | 'renewal');
                resetInputs();
              }}
            >
              <option value="follow_up">Follow-up requirements</option>
              <option value="renewal">Renewal requirements only</option>
            </select>
          </label>
          <label className="maintenance-cancellation-actions__confirm">
            <input
              type="checkbox"
              checked={confirmed && currentSelection}
              disabled={busy || !currentSelection}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I confirm the exact source and requested staff-review action; no
            plan, consent or enrollment is changed.
          </label>
          <div className="maintenance-cancellation-actions__buttons">
            <button
              type="button"
              disabled={
                busy ||
                !currentSelection ||
                !confirmed ||
                !verified ||
                !validProposedOn ||
                attempted
              }
              onClick={() => void run(prepare)}
            >
              Prepare blocked staff review
            </button>
            <button
              type="button"
              disabled={
                busy ||
                !currentSelection ||
                !confirmed ||
                !verified ||
                !prepared ||
                terminalAttempted
              }
              onClick={() => void run(() => close('CANCEL'))}
            >
              Cancel this staff review
            </button>
            <button
              type="button"
              disabled={
                busy ||
                !currentSelection ||
                !confirmed ||
                !verified ||
                !prepared ||
                terminalAttempted
              }
              onClick={() => void run(() => close('REVOKE'))}
            >
              Revoke this staff review
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(reconcile)}
            >
              Reconcile retained staff review
            </button>
          </div>
        </>
      )}
      <p role="status" aria-live="polite">
        {observationAccess
          ? status
          : 'Access unavailable. Retained private maintenance details are withheld; original custody and UNKNOWN remain unchanged.'}
      </p>
    </section>
  );
}
