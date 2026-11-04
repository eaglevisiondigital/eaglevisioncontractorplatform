import { useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  readMaintenanceRevisionRequirements,
  inspectMaintenanceRevisionRequirements,
  selectMaintenanceRevisionRequirements,
  compareMaintenanceOccurrenceContinuity,
  maintenanceRevisionDestination,
  type MaintenanceRevisionSnapshot,
} from '../../lib/workflows/maintenance-revision-requirements';
import { MaintenanceRequirementsReview } from './MaintenanceRequirementsReview';
import './maintenance-revision-requirements.css';
type Props = SavedRevisionPanelProps & { onSourcesSaved?: () => void };
export function MaintenanceRevisionRequirements(props: Props) {
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
      className="maintenance-revision-requirements"
      aria-label="Maintenance revision requirements"
    >
      <Requirements
        key={context.epoch}
        {...props}
        selectedJobId={props.selectedJobId}
      />
      <MaintenanceRequirementsReview {...props} />
    </section>
  );
}
function Requirements({
  sources,
  selectedJobId,
  onContinue,
}: Props & { selectedJobId: string }) {
  const [snapshot, setSnapshot] = useState<MaintenanceRevisionSnapshot>(),
    [before, setBefore] = useState<MaintenanceRevisionSnapshot>(),
    [selected, setSelected] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      'Inspect an exact original occurrence and the missing current requirements. Recorded preferences never permit sending.',
    ),
    life = useRef({ alive: true, pending: false }),
    gate = useRef({ enabled: true, confirmed: true });
  useLayoutEffect(() => {
    const l = life.current,
      g = gate.current;
    l.alive = true;
    g.enabled = true;
    return () => {
      l.alive = false;
      g.enabled = false;
    };
  }, []);
  async function read() {
    if (life.current.pending) return;
    life.current.pending = true;
    setBusy(true);
    const prior = snapshot;
    setSnapshot(undefined);
    try {
      const next = await readMaintenanceRevisionRequirements(
        sources,
        selectedJobId,
        gate.current,
      );
      if (life.current.alive) {
        setBefore(prior);
        setSnapshot(next);
        setMessage(
          'Current occurrence requirements read. Retained selections are never moved to replacement occurrences.',
        );
      }
    } catch {
      if (life.current.alive)
        setMessage(
          'STALE / UNAVAILABLE — current maintenance, contact or staff sources could not be verified. No replay.',
        );
    } finally {
      life.current.pending = false;
      if (life.current.alive) setBusy(false);
    }
  }
  let data:
      ReturnType<typeof inspectMaintenanceRevisionRequirements> | undefined,
    detail:
      ReturnType<typeof selectMaintenanceRevisionRequirements> | undefined,
    continuity:
      ReturnType<typeof compareMaintenanceOccurrenceContinuity> | undefined;
  if (snapshot)
    try {
      data = inspectMaintenanceRevisionRequirements(snapshot);
    } catch {
      /* Withhold stale source. */
    }
  if (snapshot && data && selected) {
    try {
      detail = selectMaintenanceRevisionRequirements(snapshot, selected);
    } catch {
      /* No selected-ID fallback. */
    }
    if (before)
      try {
        continuity = compareMaintenanceOccurrenceContinuity(
          before,
          snapshot,
          selected,
        );
      } catch {
        /* A reference does not establish a new relationship. */
      }
  }
  async function open() {
    if (!snapshot || !selected || !onContinue) return;
    try {
      const target = maintenanceRevisionDestination(snapshot, selected);
      await onContinue(target.job_id, target.step);
    } catch {
      setMessage(
        'Exact maintenance handoff denied. No replacement, renewal or message executed.',
      );
    }
  }
  return (
    <div className="maintenance-revision-panel">
      <h3>Occurrence revision requirements</h3>
      <p>
        Same-session source review only. No renewal agreement, recipient,
        sender, suppression or atomic consent authority is created.
      </p>
      <button type="button" disabled={busy} onClick={() => void read()}>
        Read occurrence revision requirements
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {snapshot && !data && (
        <p role="alert">STALE — requirements withheld until a current read.</p>
      )}
      {data && (
        <>
          <dl>
            <dt>Exact plan / current revision</dt>
            <dd>
              {data.plan.id} / {data.plan.revision} · {data.plan.name}
            </dd>
            <dt>Original receipt</dt>
            <dd>
              {data.receipt.state} · {data.receipt.observed}
            </dd>
            <dt>Recorded channel evidence</dt>
            <dd>
              {data.recorded_channel.state} ·{' '}
              {data.recorded_channel.reference?.id ?? 'UNAVAILABLE'}
            </dd>
          </dl>
          <label>
            Exact recorded occurrence
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Choose an exact occurrence ID</option>
              {data.occurrences.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.due_on} · {r.kind} · {r.id}
                </option>
              ))}
            </select>
          </label>
          {selected && !detail && (
            <p role="alert">
              Selected occurrence NOT IN CURRENT REVIEW. Choose explicitly; no
              completion or replacement is inferred.
            </p>
          )}
          {continuity && (
            <p role="status">
              {continuity.continuity} · source revision{' '}
              {continuity.previous_plan_revision} →{' '}
              {continuity.current_plan_revision}; contact reference changed{' '}
              {String(continuity.contact_reference_changed)}. No source
              replacement.
            </p>
          )}
          {detail && (
            <section aria-label="Selected occurrence requirement matrix">
              <h4>Exact occurrence requirement matrix</h4>
              <p>Occurrence {detail.selected.id}</p>
              <p>
                Plan revision {detail.selected.source.plan_revision} ·{' '}
                {detail.selected.visit_consistency} · original planning class{' '}
                {detail.selected.planning_status}
              </p>
              {detail.selected.review_reasons.length > 0 && (
                <ul aria-label="Occurrence review conflicts">
                  {detail.selected.review_reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
              <dl>
                {detail.checks.map((c) => (
                  <div key={c.requirement}>
                    <dt>
                      {c.requirement} · {c.state}
                    </dt>
                    <dd>{c.reference}</dd>
                  </div>
                ))}
              </dl>
              <p>
                Send / renew / schedule / bill: BLOCKED. Physical completion
                UNVERIFIED. CAPTURED_NOT_ATOMIC.
              </p>
              {onContinue && (
                <button type="button" onClick={() => void open()}>
                  Open exact occurrence maintenance review
                </button>
              )}
            </section>
          )}
          <p>
            Available local occurrences only; no complete-history claim.
            Original UNKNOWN holds and no replay remain unchanged.
          </p>
        </>
      )}
    </div>
  );
}
