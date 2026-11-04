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
  filterCostCoverageActionSources,
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
    [query, setQuery] = useState(''),
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
        setQuery('');
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
  const filtered =
    view && current
      ? filterCostCoverageActionSources(view, { query, kind: 'all' })
      : undefined;
  const selected = view?.original.rows.find((row) => row.key === selection);
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
          <label htmlFor={`${id}-query`}>
            Search original cost action sources
          </label>
          <input
            id={`${id}-query`}
            type="search"
            value={query}
            maxLength={200}
            disabled={busy}
            onChange={(e) => setQuery(e.target.value)}
          />
          <p>
            {filtered?.matching} matching of {filtered?.available} available
            sources. Search does not change the exact selected source.
          </p>
          {selected && !filtered?.rows.includes(selected) && (
            <p>
              Retained exact selection outside these results: {selected.kind} ·{' '}
              {selected.id}
            </p>
          )}
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
            {selected && !filtered?.rows.includes(selected) && (
              <option value={selected.key}>
                {selected.kind} · {selected.id} · retained exact selection
              </option>
            )}
            {filtered?.rows.map((row) => (
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
          <dl className="cost-source-facts">
            <dt>Recorded expense</dt>
            <dd>
              {result.recorded_source.expense
                ? `${result.recorded_source.expense.id} · ${result.recorded_source.expense.amount_minor} ${result.recorded_source.currency} minor units · ${result.recorded_source.expense.kind}`
                : 'Not selected or exact link unavailable'}
            </dd>
            <dt>Recorded quantity and unit</dt>
            <dd>
              {result.recorded_source.expense
                ? `${result.recorded_source.expense.quantity_milli ?? 'UNKNOWN'} thousandths · ${result.recorded_source.expense.unit ?? 'UNKNOWN unit'}`
                : 'Not applicable'}
            </dd>
            <dt>Exact estimate line</dt>
            <dd>
              {result.recorded_source.expense?.estimate_line_id ??
                'UNKNOWN / not recorded'}
            </dd>
            <dt>Original review events</dt>
            <dd>
              {result.recorded_source.review_events
                .map((row) => `${row.id} · ${row.decision} · ${row.created_at}`)
                .join('; ') || 'None recorded'}
            </dd>
            <dt>Adjustment source</dt>
            <dd>
              {result.recorded_source.expense?.adjusts_expense_id ??
                'None recorded'}{' '}
              · {result.recorded_source.adjustment_link}
            </dd>
            <dt>Adjusting expenses</dt>
            <dd>
              {result.recorded_source.adjusting_expense_ids.join(', ') ||
                'None recorded'}
            </dd>
            <dt>Operational receipt</dt>
            <dd>
              {result.recorded_source.durable_receipt}. Provider settlement:{' '}
              {result.recorded_source.provider_settlement}.
            </dd>
          </dl>
          <p>
            Canonical revenue {result.canonical_totals.revised_revenue_minor};
            projected cost {result.canonical_totals.projected_cost_minor};
            projected profit {result.canonical_totals.projected_profit_minor}{' '}
            {result.canonical_totals.currency} minor units. Copied job totals
            are not allocations to this source or proof of settlement.
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
              {result.labor.recorded_review ?? 'UNKNOWN'} · corrects{' '}
              {result.labor.corrects_id ?? 'none recorded'} · correcting entries{' '}
              {result.labor.correcting_entry_ids.join(', ') || 'none recorded'}.
              Available job locked periods:{' '}
              {result.recorded_source.available_locked_period_ids.join(', ') ||
                'none recorded'}
              ; no per-entry period allocation is inferred.
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
