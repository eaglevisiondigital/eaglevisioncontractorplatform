import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import type { PriorityLiveCallback } from '../../lib/workflows/priority-actions';
import {
  verifiedOwnerBriefingEnabled,
  readVerifiedOwnerBriefing,
  assertVerifiedOwnerBriefingCurrent,
  compareVerifiedOwnerBriefing,
  assertVerifiedOwnerComparisonCurrent,
  inspectVerifiedOwnerDifference,
  inspectVerifiedOwnerPriority,
  continueVerifiedOwnerPriority,
  type VerifiedOwnerBriefingRead,
  type VerifiedOwnerBriefingComparison,
} from '../../lib/workflows/verified-owner-briefing';
import { RecordedOwnerActions } from './RecordedOwnerActions';
import './verified-owner-briefing.css';
type Props = SavedRevisionPanelProps & {
  onSourcesSaved?: () => void | Promise<void>;
};
type Inspection = Awaited<ReturnType<typeof inspectVerifiedOwnerPriority>>;
export function VerifiedOwnerBriefing(props: Props) {
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
  return (
    <section
      className="verified-owner-briefing"
      aria-label="Verified owner briefing"
    >
      <h2>Owner briefing · what changed in recorded sources</h2>
      <p>
        Keep the original priority order, inspect current facts and compare two
        explicit reads. A missing suggestion never proves completed work.
      </p>
      {!enabled ? (
        <p>Verified owner briefing is OFF.</p>
      ) : (
        <>
          <RecordedOwnerActions {...props} />
          {props.selectedJobId ? (
            <Briefing
              key={binding.generation}
              {...props}
              selectedJobId={props.selectedJobId}
            />
          ) : (
            <p>Select an authorized job in the existing workspace.</p>
          )}
        </>
      )}
    </section>
  );
}
function Briefing({
  sources,
  selectedJobId,
  onContinue,
}: Props & { selectedJobId: string }) {
  const [view, setView] = useState<VerifiedOwnerBriefingRead>(),
    [before, setBefore] = useState<VerifiedOwnerBriefingRead>(),
    [comparison, setComparison] = useState<VerifiedOwnerBriefingComparison>(),
    [source, setSource] = useState<Inspection>(),
    [filter, setFilter] = useState('all'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      'Read current sources to retain an explicit local comparison reference.',
    ),
    [error, setError] = useState(''),
    id = useId(),
    gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ alive: true, pending: false, generation: 0 }),
    lease = useRef<PriorityLiveCallback>({
      current: onContinue,
      generation: 0,
    });
  useLayoutEffect(() => {
    const l = lease.current;
    l.current = onContinue;
    l.generation++;
    return () => {
      l.current = undefined;
      l.generation++;
    };
  }, [onContinue]);
  useLayoutEffect(() => {
    const g = gate.current,
      l = life.current,
      c = lease.current;
    g.enabled = true;
    g.confirmed = true;
    l.alive = true;
    return () => {
      g.enabled = false;
      g.confirmed = false;
      l.alive = false;
      l.generation++;
      c.current = undefined;
      c.generation++;
    };
  }, []);
  let current = true;
  try {
    if (view) assertVerifiedOwnerBriefingCurrent(view);
    if (comparison) assertVerifiedOwnerComparisonCurrent(comparison);
  } catch {
    current = false;
  }
  async function run(mode: 'read' | 'inspect' | 'continue', key?: string) {
    if (life.current.pending) return;
    life.current.pending = true;
    setBusy(true);
    setError('');
    const serial = ++life.current.generation,
      live = () =>
        life.current.alive &&
        life.current.generation === serial &&
        gate.current.enabled;
    try {
      if (mode === 'read') {
        const next = await readVerifiedOwnerBriefing(
            sources,
            selectedJobId,
            gate.current,
          ),
          nextComparison = before
            ? compareVerifiedOwnerBriefing(before, next)
            : undefined;
        if (!live()) throw Error('Context changed');
        setView(next);
        if (!before) setBefore(next);
        setComparison(nextComparison);
        setSource(undefined);
        setMessage(
          nextComparison
            ? 'Exact original source differences loaded. Changed, absent and UNKNOWN records are not completed actions.'
            : 'First explicit read retained. Save a source through its original controls, then read again to compare.',
        );
      } else if (mode === 'inspect' && view && key) {
        const inspected = comparison
          ? await inspectVerifiedOwnerDifference(comparison, key)
          : await inspectVerifiedOwnerPriority(view, key);
        if (!live()) throw Error('Context changed');
        setSource(inspected);
        setMessage(
          'Exact current source inspected. Navigation remains a separate review-only action.',
        );
      } else if (mode === 'continue' && view && source && onContinue) {
        const result = await continueVerifiedOwnerPriority(
          view,
          source,
          onContinue,
          lease.current,
        );
        if (live()) {
          setMessage(result.status);
          setSource(undefined);
        }
      }
    } catch {
      if (live())
        setError(
          'Current records, earlier reference, membership or outcome are stale, unavailable or UNKNOWN. No substitute, completion inference or replay was used.',
        );
    } finally {
      life.current.pending = false;
      if (live()) setBusy(false);
    }
  }
  function pin() {
    if (!view) return;
    try {
      assertVerifiedOwnerBriefingCurrent(view);
      setBefore(view);
      setComparison(undefined);
      setSource(undefined);
      setMessage(
        'Current original read retained as the next local comparison reference. This does not restore or change business state.',
      );
    } catch {
      setError(
        'Current exact source required before retaining a comparison reference.',
      );
    }
  }
  const rows = comparison?.rows.filter(
    (row) =>
      filter === 'all' ||
      (filter === 'changes'
        ? row.status !== 'UNCHANGED'
        : row.recorded_state.includes('UNKNOWN')),
  );
  return (
    <section aria-label="Verified priority source comparison">
      <h3>Explicit before and current review</h3>
      <div className="verified-owner-controls">
        <button type="button" disabled={busy} onClick={() => void run('read')}>
          Read verified owner briefing
        </button>
        <button
          type="button"
          disabled={busy || !view || !current}
          onClick={pin}
        >
          Use current read as comparison reference
        </button>
      </div>
      <p role="status">
        {busy
          ? 'Verifying exact original priorities and source state…'
          : message}
      </p>
      {(error || !current) && (
        <p role="alert">
          {error ||
            'Sources or access changed. Old details and navigation are withheld; re-reading cannot renew an UNKNOWN action.'}
        </p>
      )}
      {view && current && (
        <>
          <p>
            Job {view.original.original.snapshot.identity.job_id} · customer{' '}
            {view.original.original.snapshot.identity.customer_id} · property{' '}
            {view.original.original.snapshot.identity.location_id}
          </p>
          <p>
            Original ranking is unchanged. These are available selected-job
            records, not complete history, authorized actions or durable restart
            state.
          </p>
          {comparison ? (
            <>
              <label htmlFor={`${id}-filter`}>
                Source comparison view
                <select
                  id={`${id}-filter`}
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                >
                  <option value="all">All original source differences</option>
                  <option value="changes">Changed or not present</option>
                  <option value="unknown">UNKNOWN current evidence</option>
                </select>
              </label>
              <p>
                {rows!.length} matching / {comparison.rows.length} exact source
                rows
              </p>
              {rows!.length === 0 && (
                <p>
                  No matching differences. Unchanged sources do not establish
                  physical completion or approval.
                </p>
              )}
              <ol className="verified-owner-differences">
                {rows!.map((row) => (
                  <li key={`${row.source.kind}:${row.key}`}>
                    <h4>
                      Original priority {row.original_rank} · {row.status}
                    </h4>
                    <p>
                      {row.source.kind} · {row.source.id} · revision{' '}
                      {row.source.revision ?? 'not recorded'} · version{' '}
                      {row.source.version ?? 'not recorded'}
                    </p>
                    <div className="verified-owner-pair">
                      <section aria-label={`Earlier recorded fact: ${row.key}`}>
                        <h5>Earlier recorded fact</h5>
                        <p>
                          {row.before_fact ??
                            'Not present in the earlier available read.'}
                        </p>
                      </section>
                      <section aria-label={`Current recorded fact: ${row.key}`}>
                        <h5>Current recorded fact</h5>
                        <p>
                          {row.current_fact ??
                            'NOT PRESENT / UNKNOWN. No completion or resolution is inferred.'}
                        </p>
                      </section>
                    </div>
                    <p>{row.recorded_state}</p>
                    <ul>
                      {row.facts.map((fact, i) => (
                        <li key={i}>{fact}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      disabled={busy || !row.can_inspect}
                      aria-label={`Inspect exact current difference: ${row.key}`}
                      onClick={() => void run('inspect', row.key)}
                    >
                      Inspect exact current difference
                    </button>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <ol className="verified-owner-differences">
              {view.rows.map((row) => (
                <li key={row.key}>
                  <h4>
                    Original priority {row.rank} · {row.area}
                  </h4>
                  <p>{row.recorded_fact}</p>
                  <p>
                    {row.source.kind} · {row.source.id} · {row.state}
                  </p>
                  <ul>
                    {row.facts.map((fact, i) => (
                      <li key={i}>{fact}</li>
                    ))}
                  </ul>
                  <p>Suggested human review: {row.suggested_human_review}</p>
                  <button
                    type="button"
                    disabled={
                      busy || row.state === 'UNKNOWN_SOURCE_UNAVAILABLE'
                    }
                    aria-label={`Inspect exact current briefing source: ${row.key}`}
                    onClick={() => void run('inspect', row.key)}
                  >
                    Inspect exact current briefing source
                  </button>
                </li>
              ))}
            </ol>
          )}
          {source && (
            <section
              className="verified-owner-source"
              aria-label="Inspected verified owner source"
            >
              <h4>Inspected exact source</h4>
              <p>
                {source.source.kind} · {source.source.id} · job {source.job_id}
              </p>
              <p>{source.recorded_fact}</p>
              <p>
                Existing destination: {source.step}. This is a suggestion, not
                permission to act.
              </p>
              <button
                type="button"
                disabled={busy || !onContinue}
                onClick={() => void run('continue')}
              >
                Open original verified source review
              </button>
            </section>
          )}
        </>
      )}
    </section>
  );
}
