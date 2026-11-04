import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import type { PriorityLiveCallback } from '../../lib/workflows/priority-actions';
import {
  verifiedOwnerBriefingEnabled,
  readVerifiedOwnerBriefing,
  assertVerifiedOwnerBriefingCurrent,
  assertVerifiedOwnerComparisonCurrent,
  type VerifiedOwnerBriefingRead,
} from '../../lib/workflows/verified-owner-briefing';
import {
  verifyOwnerActionRequirements,
  filterOwnerActionSources,
  compareOwnerActionRefresh,
  type OwnerActionRefresh,
  continueVerifiedOwnerAction,
  type OwnerActionSelection,
  type OwnerActionVerificationResult,
} from '../../lib/workflows/owner-action-verification';
import './owner-action-verification.css';

/** Small optional action slot alongside the retained C23 owner briefing. */
export function OwnerActionVerification(props: SavedRevisionPanelProps) {
  const enabled = verifiedOwnerBriefingEnabled(props.enabled),
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
  if (!enabled) return <p>Owner action verification is OFF.</p>;
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
    [view, setView] = useState<VerifiedOwnerBriefingRead>(),
    [selection, setSelection] = useState<OwnerActionSelection>(),
    [query, setQuery] = useState(''),
    [result, setResult] = useState<OwnerActionVerificationResult>(),
    [refresh, setRefresh] = useState<OwnerActionRefresh>(),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      'Select an original current priority and verify the requirements before opening its exact review.',
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
    if (view) assertVerifiedOwnerBriefingCurrent(view);
    if (refresh) assertVerifiedOwnerComparisonCurrent(refresh.comparison);
  } catch {
    current = false;
  }
  async function run(action: 'load' | 'verify' | 'open') {
    if (life.current.pending) return;
    life.current.pending = true;
    setBusy(true);
    try {
      if (action === 'load') {
        setResult(undefined);
        setConfirmed(false);
        const next = await readVerifiedOwnerBriefing(
          sources,
          selectedJobId,
          gate.current,
        );
        if (!life.current.active) return;
        const comparison = view
          ? compareOwnerActionRefresh(view, next, selection)
          : undefined;
        setView(next);
        setRefresh(comparison);
        setSelection(comparison?.selection ?? undefined);
        setResult(undefined);
        setConfirmed(false);
        setMessage(
          comparison
            ? `${comparison.status}. ${comparison.selection ? 'Exact unchanged source context retained; the broader source read may have changed. ' : ''}Previous verification and confirmation are cleared. Original current order is preserved.`
            : 'Original current priorities loaded in their original order.',
        );
      } else if (view && selection) {
        if (action === 'verify') {
          const next = await verifyOwnerActionRequirements(view, selection);
          if (!life.current.active) return;
          setResult(next);
          setConfirmed(false);
          setMessage(next.status);
        } else if (result?.inspection && onContinue) {
          const next = await continueVerifiedOwnerAction(
            view,
            selection,
            result.inspection,
            confirmed,
            onContinue,
            lease.current,
          );
          if (life.current.active) {
            setResult(undefined);
            setConfirmed(false);
            setMessage(next.status);
          }
        }
      }
    } catch {
      if (life.current.active) {
        setResult(undefined);
        setConfirmed(false);
        setMessage(
          'UNKNOWN or stale exact source. No source substitution, inferred completion or replay.',
        );
      }
    } finally {
      life.current.pending = false;
      if (life.current.active) setBusy(false);
    }
  }
  const filtered =
    view && current ? filterOwnerActionSources(view, { query }) : undefined;
  const selected = view?.rows.find((row) => row.key === selection?.key);
  return (
    <section
      className="owner-action-verification"
      aria-label="Owner action requirement verification"
    >
      <h3>Verify an original owner action</h3>
      <button type="button" disabled={busy} onClick={() => void run('load')}>
        Load original owner action sources
      </button>
      {view && (
        <button type="button" disabled={busy} onClick={() => void run('load')}>
          Refresh original owner action sources
        </button>
      )}
      {!current && (
        <p role="alert">
          Exact owner source or staff access changed. No replacement source or
          completed action is inferred.
        </p>
      )}
      <p role="status">
        {busy ? 'Checking exact source requirements…' : message}
      </p>
      {view && current && (
        <>
          <label htmlFor={`${id}-query`}>Search original owner sources</label>
          <input
            id={`${id}-query`}
            type="search"
            maxLength={200}
            value={query}
            disabled={busy}
            onChange={(event) => setQuery(event.target.value)}
          />
          <p>
            {filtered?.matching} matching of {filtered?.available} original
            priorities. Search preserves original order and never selects a
            source.
          </p>
          {selected && !filtered?.rows.includes(selected) && (
            <p>
              Retained exact selection outside results: {selected.source.kind} ·{' '}
              {selected.source.id}
            </p>
          )}
          <label htmlFor={`${id}-source`}>
            Exact recorded owner action source
          </label>
          <select
            id={`${id}-source`}
            value={selection?.key ?? ''}
            disabled={busy}
            onChange={(e) => {
              const row = view.rows.find((r) => r.key === e.target.value);
              setSelection(row ? { key: row.key, ...row.source } : undefined);
              setResult(undefined);
              setConfirmed(false);
            }}
          >
            <option value="">Choose an original priority</option>
            {selected && !filtered?.rows.includes(selected) && (
              <option value={selected.key}>
                {selected.rank} · {selected.source.kind} · {selected.source.id}{' '}
                · retained exact selection
              </option>
            )}
            {filtered?.rows.map((row) => (
              <option key={row.key} value={row.key}>
                {row.rank} · {row.source.kind} · {row.source.id}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !selection}
            onClick={() => void run('verify')}
          >
            Verify selected owner action
          </button>
        </>
      )}
      {refresh && current && (
        <div className="owner-refresh-comparison">
          <h4>Explicit previous and current source reads</h4>
          <p>
            {refresh.status.replaceAll('_', ' ')}. Refresh is not action
            renewal, completion or durable history. Verify the current exact
            selection again before navigation.
          </p>
          <ul>
            {refresh.comparison.rows.map((row) => (
              <li key={row.key}>
                <strong>
                  {row.status.replaceAll('_', ' ')} · {row.source.kind} ·{' '}
                  {row.source.id}
                </strong>
                <dl>
                  <dt>Previous recorded fact</dt>
                  <dd>
                    {row.before_fact ??
                      'Not present in the earlier available read'}
                  </dd>
                  <dt>Current recorded fact</dt>
                  <dd>
                    {row.current_fact ??
                      'Not present; completion remains UNKNOWN'}
                  </dd>
                  <dt>Original current / retained rank</dt>
                  <dd>{row.original_rank}; no reprioritization performed</dd>
                </dl>
                <p>{row.recorded_state}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result && current && (
        <div className="owner-action-result">
          <h4>{result.status.replaceAll('_', ' ')}</h4>
          {result.row && (
            <>
              <p>{result.row.recorded_fact}</p>
              <p>Current recorded workflow state: {result.row.state}</p>
              <h4>Original suggested human review</h4>
              <p role="region" aria-label="Original suggested human review">
                {result.row.suggested_human_review}
              </p>
              <p>
                Recommendations are not recorded actions. Opening this review
                neither completes the source nor grants operational authority.
              </p>
              <p>
                Original priority {result.row.rank} · {result.row.level} ·{' '}
                {result.row.area}
              </p>
              <h4>Original ordering reasons</h4>
              <ul>
                {result.row.order_reasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </>
          )}
          <ul>
            {result.facts.map((fact, i) => (
              <li key={i}>{fact}</li>
            ))}
          </ul>
          <h4>Independent original requirements</h4>
          {result.requirements.length ? (
            <ul>
              {result.requirements.map((r, i) => (
                <li key={`${r.code}:${i}`}>
                  {r.code} · {r.status}: {r.detail}
                </li>
              ))}
            </ul>
          ) : (
            <p>
              No additional requirement is listed in this available source. This
              does not prove completion or operational readiness.
            </p>
          )}
          <p>{result.limits}</p>
          {result.inspection && (
            <>
              <p>
                Exact original destination: {result.inspection.step} · source{' '}
                {result.inspection.source.id}
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{' '}
                Open only this original review; recommendations grant no
                operational authority.
              </label>
              <button
                type="button"
                disabled={busy || !confirmed || !onContinue}
                onClick={() => void run('open')}
              >
                Open verified original owner review
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
