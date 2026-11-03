import { useId, useLayoutEffect, useRef, useState } from 'react';
import { formatMinor } from '../../domain/estimating/calculation';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import {
  recordedCostContinuityEnabled,
  recordedCostRecipe,
  previewOrganizationLabor,
  confirmOrganizationLabor,
  reconcileOrganizationLabor,
  assertOrganizationLaborCurrent,
  assertOrganizationLaborAccess,
  type OrganizationLaborPreview,
} from '../../lib/workflows/recorded-cost-continuity';
import { CostSavedRevisions } from './CostSavedRevisions';
import { SavedEvidenceControls } from './SavedEvidenceControls';
import './recorded-cost-continuity.css';

export function RecordedCostContinuity(
  props: SavedRevisionPanelProps & {
    onSourcesSaved?: () => void | Promise<void>;
  },
) {
  const enabled = recordedCostContinuityEnabled(props.enabled);
  const [context, setContext] = useState({
    sources: props.sources,
    job: props.selectedJobId,
    enabled,
    epoch: 0,
  });
  if (
    context.sources !== props.sources ||
    context.job !== props.selectedJobId ||
    context.enabled !== enabled
  ) {
    setContext({
      sources: props.sources,
      job: props.selectedJobId,
      enabled,
      epoch: context.epoch + 1,
    });
    return null;
  }
  if (!enabled)
    return (
      <section
        className="recorded-cost-continuity"
        aria-label="Recorded cost continuity"
      >
        <p>Recorded cost continuity is OFF.</p>
      </section>
    );
  return (
    <section
      className="recorded-cost-continuity"
      aria-label="Recorded cost continuity"
    >
      <CostSavedRevisions {...props} />
      <SavedEvidenceControls {...props} recipe={recordedCostRecipe} />
      {props.selectedJobId && (
        <OrganizationPreparation
          key={context.epoch}
          {...props}
          selectedJobId={props.selectedJobId}
        />
      )}
    </section>
  );
}
function OrganizationPreparation({
  sources,
  selectedJobId,
  onSourcesSaved,
}: SavedRevisionPanelProps & {
  selectedJobId: string;
  onSourcesSaved?: () => void | Promise<void>;
}) {
  const [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [view, setView] = useState<OrganizationLaborPreview>(),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [held, setHeld] = useState(false),
    [status, setStatus] = useState(
      'Choose an ended UTC period; future time remains unposted and UNKNOWN.',
    ),
    [error, setError] = useState('');
  const gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ alive: true, pending: false, generation: 0 }),
    id = useId();
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
      l.generation++;
    };
  }, []);
  let access = true;
  try {
    if (view) {
      assertOrganizationLaborAccess(view);
      if (!held) assertOrganizationLaborCurrent(view);
    }
  } catch {
    access = false;
  }
  async function run(mode: 'preview' | 'confirm' | 'reconcile') {
    if (life.current.pending) return;
    life.current.pending = true;
    setBusy(true);
    setError('');
    const token = ++life.current.generation;
    const live = () =>
      life.current.alive &&
      life.current.generation === token &&
      gate.current.enabled;
    try {
      if (mode === 'preview') {
        const next = await previewOrganizationLabor(
          sources,
          selectedJobId,
          {
            start: new Date(`${start}T00:00:00.000Z`).toISOString(),
            end: new Date(`${end}T00:00:00.000Z`).toISOString(),
          },
          gate.current,
        );
        if (!live()) throw Error('Context changed');
        setView(next);
        setConfirmed(false);
        setStatus(
          'Preview covers every organization job, including jobs with no period entries. Review before locking internal labor preparation.',
        );
      } else if (view) {
        const result =
          mode === 'confirm'
            ? await confirmOrganizationLabor(view, confirmed, live)
            : await reconcileOrganizationLabor(view);
        if (!live()) throw Error('Context changed');
        setStatus(JSON.stringify(result));
        if (mode === 'confirm') {
          setHeld(true);
          setConfirmed(false);
          if (
            result.status === 'LOCKED_INTERNAL_PREPARATION' &&
            onSourcesSaved
          ) {
            assertOrganizationLaborAccess(view);
            await onSourcesSaved();
            if (!live())
              throw Error('Saved-source notification context changed');
            assertOrganizationLaborAccess(view);
          }
        }
      }
    } catch {
      if (live())
        setError(
          'Exact source unavailable or period invalid. No replacement, automatic replay, invoice or payment was performed.',
        );
    } finally {
      life.current.pending = false;
      if (live()) setBusy(false);
    }
  }
  function change(which: 'start' | 'end', value: string) {
    if (busy || held) return;
    (which === 'start' ? setStart : setEnd)(value);
    setView(undefined);
    setConfirmed(false);
  }
  return (
    <section
      aria-label="Organization labor preparation"
      className="recorded-cost-preparation"
    >
      <h3>Recorded time → internal job costs</h3>
      <p>
        Original estimating/workforce engine only. This is organization-wide
        internal preparation, not payroll disbursement, an invoice or financial
        execution. Missing, rejected and unposted time is never zero-cost proof.
      </p>
      <div className="recorded-cost-grid">
        <label htmlFor={`${id}-start`}>
          Period start · UTC midnight
          <input
            id={`${id}-start`}
            type="date"
            value={start}
            onChange={(e) => change('start', e.target.value)}
            disabled={busy || held}
          />
        </label>
        <label htmlFor={`${id}-end`}>
          Exclusive period end · UTC midnight
          <input
            id={`${id}-end`}
            type="date"
            value={end}
            onChange={(e) => change('end', e.target.value)}
            disabled={busy || held}
          />
        </label>
      </div>
      <button
        type="button"
        disabled={busy || held || !start || !end}
        onClick={() => void run('preview')}
      >
        Preview organization labor preparation
      </button>
      <p role="status">
        {busy ? 'Reading exact organization evidence…' : status}
      </p>
      {(error || !access) && (
        <p role="alert">
          {error ||
            'Saved preparation source changed; confirm is blocked. Retained evidence does not renew authority.'}
        </p>
      )}
      {view && access && (
        <>
          <p>
            Organization {view.organization_id} · {view.start} → {view.end}
          </p>
          <p>
            {view.jobs.length} affected jobs · {view.entries.length} recorded
            period entries · SHA-256 {view.source_sha256}
          </p>
          <ul>
            {view.jobs.map((job) => (
              <li key={job.id}>
                <strong>{job.name}</strong>
                <p>
                  {job.id} · saved revision {job.revision} ·{' '}
                  {job.entry_ids.length} included entries · aggregate loaded
                  labor {formatMinor(job.loaded_cost_minor, 'USD')}
                </p>
              </li>
            ))}
          </ul>
          <details>
            <summary>Inspect exact organization time references</summary>
            <ul>
              {view.entries.map((entry) => (
                <li key={entry.id}>
                  {entry.id} · job {entry.job_id ?? 'overhead'} ·{' '}
                  {entry.started_at} → {entry.ended_at ?? 'OPEN'} ·{' '}
                  {entry.review ?? 'UNREVIEWED'} ·{' '}
                  {entry.included_in_original_preparation
                    ? 'included by original engine'
                    : 'not included; no inferred zero cost'}
                </li>
              ))}
            </ul>
          </details>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={busy || held || !access}
            />
            I reviewed all affected jobs and time entries for this ended period
          </label>
          <button
            type="button"
            disabled={busy || held || !access || !confirmed}
            onClick={() => void run('confirm')}
          >
            Confirm organization labor preparation
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run('reconcile')}
          >
            Reconcile exact labor preparation
          </button>
          <p>
            No retry after UNKNOWN. Read-only reconciliation never unlocks,
            replays or repairs a preparation. Refresh the canonical saved-cost
            view separately after a successful lock.
          </p>
        </>
      )}
    </section>
  );
}
