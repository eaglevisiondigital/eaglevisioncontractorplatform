import { useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import { MaintenancePlanCorrection } from './MaintenancePlanCorrection';
import {
  readMaintenanceRequirementsReview,
  inspectMaintenanceRequirements,
  compareMaintenanceRequirements,
  maintenanceRequirementsDestination,
  type MaintenanceRequirementsSnapshot,
} from '../../lib/workflows/maintenance-requirements-review';
import './maintenance-requirements-review.css';

type Props = SavedRevisionPanelProps & { onSourcesSaved?: () => void };
export function MaintenanceRequirementsReview(props: Props) {
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
  if (!allowed || !props.selectedJobId) return null;
  return (
    <section
      className="maintenance-requirements-review"
      aria-label="Maintenance requirements and revision review"
    >
      <Requirements
        key={context.epoch}
        {...props}
        selectedJobId={props.selectedJobId}
      />
      <details>
        <summary>Original maintenance plan correction controls</summary>
        <MaintenancePlanCorrection {...props} />
      </details>
    </section>
  );
}
function Requirements({
  sources,
  selectedJobId,
  onContinue,
}: Props & { selectedJobId: string }) {
  const [snapshot, setSnapshot] = useState<MaintenanceRequirementsSnapshot>(),
    [before, setBefore] = useState<MaintenanceRequirementsSnapshot>(),
    [message, setMessage] = useState(
      'Review current recorded plan, occurrence and channel evidence. All sending and renewal authority remains blocked.',
    ),
    [busy, setBusy] = useState(false);
  const gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ alive: true, pending: false });
  useLayoutEffect(() => {
    const g = gate.current,
      l = life.current;
    l.alive = true;
    g.enabled = true;
    return () => {
      l.alive = false;
      g.enabled = false;
    };
  }, []);
  async function read(capture: boolean) {
    if (life.current.pending) return;
    life.current.pending = true;
    setBusy(true);
    setSnapshot(undefined);
    setMessage(
      'Reading current native recurrence and recorded channel sources…',
    );
    try {
      const next = await readMaintenanceRequirementsReview(
        sources,
        selectedJobId,
        gate.current,
      );
      if (!life.current.alive) return;
      setSnapshot(next);
      if (capture) setBefore(next);
      setMessage(
        capture
          ? 'Same-session reference captured. This is a read-only reference, not restored history or authority.'
          : 'Current requirements read. Compare exact source identities; absent occurrences do not prove completion.',
      );
    } catch {
      if (life.current.alive)
        setMessage(
          'STALE / UNAVAILABLE — current plan, contact or staff evidence could not be verified. No replacement or retry is authorized.',
        );
    } finally {
      life.current.pending = false;
      if (life.current.alive) setBusy(false);
    }
  }
  let data: ReturnType<typeof inspectMaintenanceRequirements> | undefined,
    comparison: ReturnType<typeof compareMaintenanceRequirements> | undefined;
  if (snapshot)
    try {
      data = inspectMaintenanceRequirements(snapshot);
      if (before) comparison = compareMaintenanceRequirements(before, snapshot);
    } catch {
      data = undefined;
    }
  async function continueReview() {
    if (!snapshot || !onContinue) return;
    try {
      const target = maintenanceRequirementsDestination(snapshot);
      await onContinue(target.job_id, target.step);
    } catch {
      setMessage(
        'Exact maintenance handoff unavailable. No action was executed.',
      );
    }
  }
  return (
    <div className="maintenance-requirements-card">
      <h3>Maintenance requirements</h3>
      <p>
        Recorded channel preferences are not purpose consent or an atomic
        consent-at-send check. No renewal, enrollment, message or scheduling
        execution.
      </p>
      <div className="maintenance-requirements-actions">
        <button type="button" disabled={busy} onClick={() => void read(true)}>
          Capture maintenance reference
        </button>
        <button type="button" disabled={busy} onClick={() => void read(false)}>
          Read current maintenance requirements
        </button>
      </div>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {snapshot && !data && (
        <p role="alert">
          STALE — captured requirements withheld. Read current sources; no
          command is retried.
        </p>
      )}
      {data && (
        <>
          <dl>
            <dt>Exact plan / revision</dt>
            <dd>
              {data.plan.id} / {data.plan.revision}
            </dd>
            <dt>Plan name / recorded recurrence</dt>
            <dd>
              {data.plan.name} / {data.plan.cadence} / {data.plan.interval_days}{' '}
              days
            </dd>
            <dt>Job / property</dt>
            <dd>
              {snapshot!.identity.job_id} / {snapshot!.identity.location_id}
            </dd>
            <dt>Original correction receipt</dt>
            <dd>
              {data.receipt.state} · {data.receipt.observed} · source{' '}
              {data.receipt.source_id ?? 'UNAVAILABLE'} · result{' '}
              {data.receipt.result_id ?? 'UNAVAILABLE'}
            </dd>
            <dt>Recorded channel</dt>
            <dd>
              {data.recorded_channel.channel} · {data.recorded_channel.state} ·
              reference {data.recorded_channel.reference?.id ?? 'UNAVAILABLE'}
            </dd>
            <dt>Review window</dt>
            <dd>
              {data.window.from} → {data.window.through} · captured at{' '}
              {data.window.as_of}
            </dd>
          </dl>
          <ul aria-label="Unverified maintenance authority requirements">
            {Object.entries(data.requirements).map(([key, value]) => (
              <li key={key}>
                <strong>{key}</strong>: {value}
              </li>
            ))}
          </ul>
          <p>
            Send, renewal, enrollment, scheduling and billing: BLOCKED.{' '}
            {data.coverage}; counts are not complete history. Physical
            completion UNVERIFIED.
          </p>
          <h4>Exact recorded occurrences ({data.occurrences.length})</h4>
          {data.occurrences.length ? (
            <ul className="maintenance-occurrences">
              {data.occurrences.map((r) => (
                <li key={r.id}>
                  <strong>
                    {r.due_on} · {r.kind} · {r.planning_status}
                  </strong>
                  <p>Occurrence {r.id}</p>
                  <p>
                    Plan {r.source.plan_id} / revision {r.source.plan_revision}{' '}
                    / native index {r.source.occurrence_index ?? 'UNAVAILABLE'}
                  </p>
                  {r.source.report_id && (
                    <p>
                      Report {r.source.report_id} / published version{' '}
                      {r.source.report_version} / finding {r.source.finding_id}
                    </p>
                  )}
                  <p>
                    Exact visits:{' '}
                    {r.exact_visits.length
                      ? r.exact_visits.map((v) => v.id).join(', ')
                      : 'None observed; no completion inferred'}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              No available occurrences in this exact review window. Coverage may
              be incomplete.
            </p>
          )}
          {comparison && (
            <section aria-label="Maintenance reference differences">
              <h4>Same-session reference → current</h4>
              <p>
                Reference revision {comparison.before_plan.revision} → current
                revision {comparison.current_plan.revision}. Observed
                differences only.
              </p>
              <ul>
                {comparison.fields.map((f) => (
                  <li key={f.field}>
                    <strong>
                      {f.field}: {f.state}
                    </strong>{' '}
                    — {f.before} → {f.current}
                  </li>
                ))}
              </ul>
              <p>
                Recorded channel reference changed:{' '}
                {String(comparison.recorded_channel_changed)}. This does not
                establish current sending consent.
              </p>
              <ul>
                {comparison.occurrences.map((r) => (
                  <li key={r.id}>
                    {r.state} · {r.id}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {onContinue && (
            <button type="button" onClick={() => void continueReview()}>
              Continue exact maintenance review
            </button>
          )}
        </>
      )}
    </div>
  );
}
