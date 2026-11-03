import { useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import { MaintenanceSavedRevisions } from './MaintenanceSavedRevisions';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  readMaintenancePlanCorrectionReview,
  assertMaintenancePlanCorrectionCurrent,
  parsePlanCorrectionInput,
  maintenancePlanRenewalReview,
  saveMaintenancePlanCorrectionReview,
  reconcileMaintenancePlanCorrectionReview,
  type MaintenancePlanCorrectionReview,
  type PlanCorrectionInput,
} from '../../lib/workflows/maintenance-plan-correction';
import './maintenance-plan-correction.css';
export type MaintenancePlanCorrectionProps = SavedRevisionPanelProps & {
  onSourcesSaved?: () => void;
};
export function MaintenancePlanCorrection(
  props: MaintenancePlanCorrectionProps,
) {
  const allowed =
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: props.enabled ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    });
  const [context, setContext] = useState({
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
  return (
    <section
      className="maintenance-plan-correction"
      aria-label="Maintenance plan correction"
    >
      {allowed && props.selectedJobId && (
        <PlanForm
          key={context.epoch}
          {...props}
          selectedJobId={props.selectedJobId}
        />
      )}
      <details>
        <summary>Saved maintenance source review</summary>
        <MaintenanceSavedRevisions {...props} />
      </details>
    </section>
  );
}
function PlanForm({
  sources,
  selectedJobId,
  onSourcesSaved,
}: MaintenancePlanCorrectionProps & { selectedJobId: string }) {
  const [review, setReview] = useState<MaintenancePlanCorrectionReview>(),
    [name, setName] = useState(''),
    [cadence, setCadence] = useState<PlanCorrectionInput['cadence']>('monthly'),
    [interval, setInterval] = useState('14'),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      'Load the exact saved plan and original renewal review before proposing a correction.',
    );
  const gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ alive: true, pending: false, serial: 0 }),
    heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const g = gate.current,
      l = life.current;
    g.enabled = true;
    g.confirmed = true;
    l.alive = true;
    return () => {
      g.enabled = false;
      g.confirmed = false;
      l.alive = false;
      l.serial++;
    };
  }, []);
  async function load() {
    const l = life.current;
    if (l.pending) return;
    l.pending = true;
    const token = ++l.serial;
    setBusy(true);
    setConfirmed(false);
    setMessage(
      'Loading the exact saved plan and original renewal requirements…',
    );
    try {
      const next = await readMaintenancePlanCorrectionReview(
        sources,
        selectedJobId,
        gate.current,
      );
      if (!l.alive || token !== l.serial) return;
      setReview(next);
      setName(next.source.name);
      setCadence(next.source.cadence);
      setInterval(String(next.source.interval_days));
      setMessage(
        next.source.can_edit
          ? 'Exact saved plan and current original renewal evidence loaded. No renewal or sending authority is granted.'
          : 'Original plan correction is held or already used. Read-only review only.',
      );
      heading.current?.focus();
    } catch {
      if (l.alive && token === l.serial)
        setMessage(
          'UNKNOWN — exact current plan, authorized property or recorded contact review is unavailable. No plan was substituted.',
        );
    } finally {
      l.pending = false;
      if (l.alive && token === l.serial) setBusy(false);
    }
  }
  const input = review
    ? {
        plan_id: review.source.plan_id,
        revision: review.source.revision,
        name,
        cadence,
        interval_days: /^\d+$/.test(interval) ? Number(interval) : NaN,
      }
    : undefined;
  let current = false,
    valid = false,
    renewal: ReturnType<typeof maintenancePlanRenewalReview> | undefined;
  if (review)
    try {
      current = assertMaintenancePlanCorrectionCurrent(review).can_edit;
      renewal = maintenancePlanRenewalReview(review);
      parsePlanCorrectionInput(input, review.source);
      valid = true;
    } catch {
      /* Current source or valid proposed fields are required before confirmation. */
    }
  async function save() {
    const l = life.current;
    if (!review || !input || !confirmed || !current || !valid || l.pending)
      return;
    l.pending = true;
    const token = ++l.serial;
    setBusy(true);
    setMessage(
      'Checking current source and recorded-contact guards before the exact plan correction…',
    );
    try {
      const result = await saveMaintenancePlanCorrectionReview(
        review,
        input,
        true,
      );
      if (result.status !== 'SYNTHETIC_SOURCE_SAVED')
        throw Error('Exact known source save acknowledgment required');
      if (l.alive && token === l.serial) {
        setConfirmed(false);
        setMessage(
          'SYNTHETIC_SOURCE_SAVED — original plan ID retained and saved revision advanced. Prior occurrences are historical; reread current planning through the existing workspace. No enrollment, renewal, scheduling or message executed.',
        );
        try {
          onSourcesSaved?.();
        } catch {
          /* A display refresh never retries the plan save. */
        }
      }
    } catch {
      if (l.alive && token === l.serial) {
        setConfirmed(false);
        setMessage(
          'UNKNOWN — stale, denied or uncertain correction. Retain the original hold and use exact read-only reconciliation only.',
        );
      }
    } finally {
      l.pending = false;
      if (l.alive && token === l.serial) setBusy(false);
    }
  }
  async function reconcile() {
    const l = life.current;
    if (!review || l.pending) return;
    l.pending = true;
    const token = ++l.serial;
    setBusy(true);
    setMessage(
      'Reading the exact original plan acknowledgment without replay…',
    );
    try {
      const result = await reconcileMaintenancePlanCorrectionReview(review);
      if (l.alive && token === l.serial)
        setMessage(
          `${result.state} — ${result.observed}. Exact source read only; the original hold remains and no retry is enabled.`,
        );
    } catch {
      if (l.alive && token === l.serial)
        setMessage(
          'UNKNOWN — exact saved plan result unavailable. No retry, replacement plan or inferred renewal.',
        );
    } finally {
      l.pending = false;
      if (l.alive && token === l.serial) setBusy(false);
    }
  }
  return (
    <section
      className="maintenance-plan-form"
      aria-label="Correct exact maintenance plan"
      aria-busy={busy}
    >
      <h3 tabIndex={-1} ref={heading}>
        Correct exact maintenance plan
      </h3>
      <p>
        Review and save the existing plan’s name and cadence under its original
        revision guard. Anchor date, timezone, checklist, ownership and existing
        visits remain unchanged.
      </p>
      <button
        type="button"
        disabled={busy || Boolean(review)}
        onClick={() => void load()}
      >
        Load current maintenance plan
      </button>
      <p role="status">{message}</p>
      {review && current && (
        <p>
          Customer <code>{review.view.identity.customer_id}</code> · property{' '}
          <code>{review.view.identity.location_id}</code> · job{' '}
          <code>{review.view.identity.job_id}</code> · plan{' '}
          <code>{review.source.plan_id}</code> · saved revision{' '}
          {review.source.revision}
        </p>
      )}
      {review && !current && (
        <p role="alert">
          Source changed or original correction is held. Editable plan and prior
          planning details are withheld.
        </p>
      )}
      {review && current && (
        <>
          <dl>
            <dt>Original plan</dt>
            <dd>{review.source.name}</dd>
            <dt>Original cadence</dt>
            <dd>
              {review.source.cadence} · recorded interval{' '}
              {review.source.interval_days} days
            </dd>
          </dl>
          <label>
            Corrected plan name
            <input
              value={name}
              maxLength={200}
              disabled={busy}
              onChange={(e) => {
                setName(e.target.value);
                setConfirmed(false);
              }}
            />
          </label>
          <div className="maintenance-plan-fields">
            <label>
              Corrected cadence
              <select
                value={cadence}
                disabled={busy}
                onChange={(e) => {
                  setCadence(e.target.value as PlanCorrectionInput['cadence']);
                  setConfirmed(false);
                }}
              >
                <option value="once">Once</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              Recorded custom interval (days)
              <input
                type="number"
                min={1}
                max={365}
                step={1}
                value={interval}
                disabled={busy}
                onChange={(e) => {
                  setInterval(e.target.value);
                  setConfirmed(false);
                }}
              />
            </label>
          </div>
          <p>
            Custom intervals apply only to custom cadence. Native
            weekly/monthly/once scheduling rules remain authoritative.
          </p>
          {renewal && (
            <section aria-label="Original renewal requirements">
              <h4>Original renewal requirements</h4>
              <dl>
                <dt>Recorded channel</dt>
                <dd>{renewal.recorded_channel}</dd>
                <dt>Purpose consent / suppression</dt>
                <dd>
                  {renewal.purpose_consent} / {renewal.suppression}
                </dd>
                <dt>Enrollment / renewal terms</dt>
                <dd>
                  {renewal.enrollment} / {renewal.renewal_terms}
                </dd>
              </dl>
              <p>
                Current recorded planning occurrences:{' '}
                {renewal.occurrences.length}. Available sources only; no
                complete future coverage or consent-at-send claim.
              </p>
              {renewal.occurrences.length ? (
                <ul>
                  {renewal.occurrences.map((o) => (
                    <li key={o.id}>
                      {o.due_on} · {o.kind} · message {o.message_authority},
                      scheduling {o.scheduling_authority}, billing{' '}
                      {o.billing_authority}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  No occurrences available in the original bounded review
                  window.
                </p>
              )}
            </section>
          )}
          {!valid && (
            <p role="alert">
              Use a nonempty trimmed name and an integer interval from 1 through
              365. Source identity and saved revision cannot be edited.
            </p>
          )}
          <label className="maintenance-plan-check">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I reviewed this exact saved plan revision and confirm only this
            local name/cadence correction. No renewal or message is authorized.
          </label>
          <button
            type="button"
            disabled={busy || !confirmed || !valid}
            onClick={() => void save()}
          >
            Save exact maintenance plan correction
          </button>
        </>
      )}
      {review && (
        <button type="button" disabled={busy} onClick={() => void reconcile()}>
          Reconcile exact maintenance plan correction
        </button>
      )}
    </section>
  );
}
