import { useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  maintenanceReviewPurposes,
  readPlanCancellationReview,
  planCancellationFacts,
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
    setConfirmed(false);
  }
  async function load() {
    const next = await readPlanCancellationReview(
      sources,
      selectedJobId,
      purpose,
      gate.current,
    );
    if (life.current.alive) {
      setReview(next);
      setSelected(undefined);
      setKey('');
      setPrepared(false);
      setStatus(
        'Choose an exact displayed occurrence. Preparation remains blocked from sending.',
      );
    }
  }
  async function select(value: string) {
    if (!review) return;
    const next = await selectPlanCancellationOccurrence(review, value);
    if (life.current.alive) {
      setSelected(next);
      setKey(value);
      setProposedOn(next.selection.occurrence.recorded_due_on);
      setConfirmed(false);
      setPrepared(false);
      setStatus(
        'Exact occurrence selected; explicitly confirm before preparing the original blocked staff review.',
      );
    }
  }
  async function prepare() {
    if (!selected) return;
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
    if (!selected) return;
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
    const result = await reconcilePlanCancellationReview(selected);
    if (life.current.alive)
      setStatus(
        result.status +
          ' · exact read-only reconciliation; replay FORBIDDEN. Native plan cancellation UNSUPPORTED.',
      );
  }
  let facts: ReturnType<typeof planCancellationFacts> | undefined;
  try {
    if (review) facts = planCancellationFacts(review);
  } catch {
    facts = undefined;
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
          disabled={busy || !!selected}
          onChange={(e) => {
            setPurpose(e.target.value as MaintenanceReviewPurpose);
            setReview(undefined);
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
        disabled={busy || !!selected}
        onClick={() => void run(load)}
      >
        Read staff cancellation sources
      </button>
      {facts && (
        <>
          <label>
            Exact cancellation review occurrence
            <select
              value={key}
              disabled={busy || !!selected}
              onChange={(e) => void run(() => select(e.target.value))}
            >
              <option value="">Choose exact occurrence</option>
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
      {selected && (
        <>
          <p>Exact source: {selected.selection.occurrence.key}</p>
          <label>
            Proposed staff review date
            <input
              type="date"
              value={proposedOn}
              disabled={busy || attempted}
              onChange={(e) => {
                setProposedOn(e.target.value);
                resetInputs();
              }}
            />
          </label>
          <label>
            Staff review kind
            <select
              value={kind}
              disabled={busy || attempted}
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
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I confirm the exact source and requested staff-review action; no
            plan, consent or enrollment is changed.
          </label>
          <div className="maintenance-cancellation-actions__buttons">
            <button
              type="button"
              disabled={busy || !confirmed || attempted}
              onClick={() => void run(prepare)}
            >
              Prepare blocked staff review
            </button>
            <button
              type="button"
              disabled={busy || !confirmed || !prepared || terminalAttempted}
              onClick={() => void run(() => close('CANCEL'))}
            >
              Cancel this staff review
            </button>
            <button
              type="button"
              disabled={busy || !confirmed || !prepared || terminalAttempted}
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
        {status}
      </p>
    </section>
  );
}
