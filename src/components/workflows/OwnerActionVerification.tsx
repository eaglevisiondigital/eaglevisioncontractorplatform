import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import type { PriorityLiveCallback } from '../../lib/workflows/priority-actions';
import {
  verifiedOwnerBriefingEnabled,
  readVerifiedOwnerBriefing,
  assertVerifiedOwnerBriefingCurrent,
  type VerifiedOwnerBriefingRead,
} from '../../lib/workflows/verified-owner-briefing';
import {
  verifyOwnerActionRequirements,
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
    [result, setResult] = useState<OwnerActionVerificationResult>(),
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
  } catch {
    current = false;
  }
  async function run(action: 'load' | 'verify' | 'open') {
    if (life.current.pending) return;
    life.current.pending = true;
    setBusy(true);
    try {
      if (action === 'load') {
        const next = await readVerifiedOwnerBriefing(
          sources,
          selectedJobId,
          gate.current,
        );
        if (!life.current.active) return;
        setView(next);
        setSelection(undefined);
        setResult(undefined);
        setConfirmed(false);
        setMessage(
          'Original current priorities loaded in their original order.',
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
  return (
    <section
      className="owner-action-verification"
      aria-label="Owner action requirement verification"
    >
      <h3>Verify an original owner action</h3>
      <button type="button" disabled={busy} onClick={() => void run('load')}>
        Load original owner action sources
      </button>
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
            {view.rows.map((row) => (
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
      {result && current && (
        <div className="owner-action-result">
          <h4>{result.status.replaceAll('_', ' ')}</h4>
          {result.row && <p>{result.row.recorded_fact}</p>}
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
