import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import type { PriorityLiveCallback } from '../../lib/workflows/priority-actions';
import {
  recordedCostRequirementsEnabled,
  readRecordedCostRequirements,
  assertRecordedCostRequirementsCurrent,
  type RecordedCostRequirementsRead,
} from '../../lib/workflows/recorded-cost-requirements';
import {
  validateCostCoverageAction,
  continueCostCoverageAction,
  type CostCoverageActionInput,
  type CostCoverageActionValidation,
} from '../../lib/workflows/cost-coverage-actions';
import './cost-coverage-actions.css';

/** Additive action slot; Main retains the original C23 panel and native forms. */
export function CostCoverageActions(props: SavedRevisionPanelProps) {
  const enabled = recordedCostRequirementsEnabled(props.enabled),
    [binding, setBinding] = useState({
      sources: props.sources,
      job: props.selectedJobId,
      enabled,
      generation: 0,
    });
  if (
    binding.sources !== props.sources ||
    binding.job !== props.selectedJobId ||
    binding.enabled !== enabled
  ) {
    setBinding({
      sources: props.sources,
      job: props.selectedJobId,
      enabled,
      generation: binding.generation + 1,
    });
    return null;
  }
  if (!enabled) return <p>Cost coverage actions are OFF.</p>;
  if (!props.selectedJobId) return <p>Select an authorized existing job.</p>;
  return (
    <ActionForm
      key={binding.generation}
      {...props}
      selectedJobId={props.selectedJobId}
    />
  );
}
function ActionForm({
  sources,
  selectedJobId,
  onContinue,
}: SavedRevisionPanelProps & { selectedJobId: string }) {
  const id = useId(),
    [view, setView] = useState<RecordedCostRequirementsRead>(),
    [selection, setSelection] = useState(''),
    [result, setResult] = useState<CostCoverageActionValidation>(),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      'Select one recorded source and verify its original action requirements.',
    ),
    gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ active: true, pending: false }),
    lease = useRef<PriorityLiveCallback>({
      current: onContinue,
      generation: 0,
    });
  useLayoutEffect(() => {
    const g = gate.current,
      l = life.current;
    g.enabled = true;
    g.confirmed = true;
    l.active = true;
    return () => {
      g.enabled = false;
      g.confirmed = false;
      l.active = false;
    };
  }, [sources, selectedJobId]);
  useLayoutEffect(() => {
    const l = lease.current;
    l.current = onContinue;
    l.generation++;
    return () => {
      l.current = undefined;
      l.generation++;
    };
  }, [onContinue]);
  let current = true;
  try {
    if (view) assertRecordedCostRequirementsCurrent(view);
  } catch {
    current = false;
  }
  function input(): CostCoverageActionInput {
    const row = view?.original.rows.find((r) => r.key === selection);
    if (!view || !row) throw Error('Select exact source');
    return {
      kind: row.kind,
      id: row.id,
      expected_job_revision: view.original.original.costs.evidence.job_revision,
      purpose:
        row.kind === 'invoice_requirement'
          ? 'invoice_preparation'
          : 'cost_review',
    };
  }
  async function run(action: 'load' | 'verify' | 'open') {
    if (life.current.pending) return;
    life.current.pending = true;
    setBusy(true);
    try {
      if (action === 'load') {
        const read = await readRecordedCostRequirements(
          sources,
          selectedJobId,
          gate.current,
        );
        if (!life.current.active) return;
        setView(read);
        setSelection('');
        setResult(undefined);
        setConfirmed(false);
        setMessage(
          'Original current source options loaded. Choose the exact requirement to verify.',
        );
      } else if (view) {
        const next = validateCostCoverageAction(view, input());
        if (action === 'verify') {
          setResult(next);
          setConfirmed(false);
          setMessage(
            'Original review requirements verified; independent financial gates remain.',
          );
        } else if (onContinue) {
          const response = await continueCostCoverageAction(
            view,
            input(),
            confirmed,
            onContinue,
            lease.current,
          );
          if (life.current.active) {
            setResult(undefined);
            setConfirmed(false);
            setMessage(response.status);
          }
        }
      }
    } catch {
      if (life.current.active) {
        setResult(undefined);
        setConfirmed(false);
        setMessage(
          'UNKNOWN or stale source. Recheck the original exact source; no action was replayed.',
        );
      }
    } finally {
      life.current.pending = false;
      if (life.current.active) setBusy(false);
    }
  }
  return (
    <section
      className="cost-coverage-actions"
      aria-label="Cost action requirements"
    >
      <h3>Verify a cost or invoice preparation action</h3>
      <button type="button" disabled={busy} onClick={() => void run('load')}>
        Load original cost action sources
      </button>
      {!current && (
        <p role="alert">
          Exact source or staff access changed. Recheck the original source; an
          UNKNOWN action cannot be replayed.
        </p>
      )}
      <p role="status">{busy ? 'Checking original requirements…' : message}</p>
      {view && current && (
        <>
          <label htmlFor={`${id}-source`}>
            Exact recorded cost action source
          </label>
          <select
            id={`${id}-source`}
            value={selection}
            disabled={busy}
            onChange={(e) => {
              setSelection(e.target.value);
              setResult(undefined);
              setConfirmed(false);
            }}
          >
            <option value="">Choose an exact recorded source</option>
            {view.original.rows.map((row) => (
              <option key={row.key} value={row.key}>
                {row.kind} · {row.id} · {row.status}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !selection}
            onClick={() => void run('verify')}
          >
            Verify selected cost action
          </button>
        </>
      )}
      {result && current && (
        <div className="cost-action-result">
          <h4>{result.action.replaceAll('_', ' ')}</h4>
          <p>
            Source {result.source.id} · job revision {result.job_revision} ·
            destination {result.destination}
          </p>
          <p>
            Cost coverage: {result.cost_coverage} · canonical projected margin:{' '}
            {result.canonical_margin} basis points · invoice prerequisites:{' '}
            {result.invoice_overall}
          </p>
          {result.category && (
            <p>
              Original {result.category.category} projected cost:{' '}
              {result.category.projected_minor} minor units. Category total is
              not a source allocation.
            </p>
          )}
          {result.labor && (
            <p>
              {result.labor.requirement} · submitted{' '}
              {String(result.labor.submitted)} · review{' '}
              {result.labor.recorded_review ?? 'UNKNOWN'}
            </p>
          )}
          {result.invoice_requirement && (
            <p>
              {result.invoice_requirement.status}:{' '}
              {result.invoice_requirement.detail}
            </p>
          )}
          <ul>
            {result.financial_exceptions.map((r) => (
              <li key={r.id}>
                {r.title} · {r.status}: {r.suggested_review}
              </li>
            ))}
          </ul>
          <p>{result.limits}</p>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{' '}
            Open only this exact original review; financial execution remains
            closed.
          </label>
          <button
            type="button"
            disabled={busy || !confirmed || !onContinue}
            onClick={() => void run('open')}
          >
            Open verified original cost review
          </button>
        </div>
      )}
    </section>
  );
}
