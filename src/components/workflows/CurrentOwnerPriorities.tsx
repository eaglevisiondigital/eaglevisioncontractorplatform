import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import type { PriorityLiveCallback } from '../../lib/workflows/priority-actions';
import {
  currentOwnerPrioritiesEnabled,
  readCurrentOwnerPriorities,
  assertCurrentOwnerPriorities,
  inspectCurrentOwnerPriority,
  continueCurrentOwnerPriority,
  type CurrentOwnerPrioritiesRead,
} from '../../lib/workflows/current-owner-priorities';
import { RecordedOwnerActions } from './RecordedOwnerActions';
import './current-owner-priorities.css';
type Props = SavedRevisionPanelProps & {
  onSourcesSaved?: () => void | Promise<void>;
};
type Inspection = Awaited<ReturnType<typeof inspectCurrentOwnerPriority>>;
export function CurrentOwnerPriorities(props: Props) {
  const enabled = currentOwnerPrioritiesEnabled(props.enabled),
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
      className="current-owner-priorities"
      aria-label="Current owner priorities"
    >
      <h2>What the recorded state means</h2>
      <p>
        Read the current task, cost, visit and publication facts behind the
        original priorities. Recommendations remain separate from authority.
      </p>
      {!enabled ? (
        <p>Current owner priorities are OFF.</p>
      ) : (
        <>
          <RecordedOwnerActions {...props} />
          {props.selectedJobId ? (
            <StateReview
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
function StateReview({
  sources,
  selectedJobId,
  onContinue,
}: Props & { selectedJobId: string }) {
  const [view, setView] = useState<CurrentOwnerPrioritiesRead>(),
    [source, setSource] = useState<Inspection>(),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      'Read the current recorded workflow state after an explicit source save.',
    ),
    [error, setError] = useState('');
  const gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ alive: true, pending: false, generation: 0 }),
    lease = useRef<PriorityLiveCallback>({
      current: onContinue,
      generation: 0,
    }),
    id = useId();
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
    if (view) assertCurrentOwnerPriorities(view);
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
        const next = await readCurrentOwnerPriorities(
          sources,
          selectedJobId,
          gate.current,
        );
        if (!live()) throw Error('Context changed');
        setView(next);
        setSource(undefined);
        setMessage(
          'Current original-ranked sources and exact recorded workflow facts loaded. No action is executed.',
        );
      } else if (mode === 'inspect' && view && key) {
        const next = await inspectCurrentOwnerPriority(view, key);
        if (!live()) throw Error('Context changed');
        setSource(next);
        setMessage(
          'Exact current workflow source inspected. Its existing review can be opened separately.',
        );
      } else if (mode === 'continue' && view && source && onContinue) {
        const result = await continueCurrentOwnerPriority(
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
          'Source state is stale, missing, revoked or UNKNOWN. No substitute source, execution or replay was used.',
        );
    } finally {
      life.current.pending = false;
      if (live()) setBusy(false);
    }
  }
  const literal = query.trim().toLowerCase(),
    rows =
      view && current
        ? view.rows.filter(
            (row) =>
              (filter === 'all' ||
                (filter === 'unknown'
                  ? row.state === 'UNKNOWN_SOURCE_UNAVAILABLE'
                  : row.level === filter)) &&
              (!literal ||
                [row.source.id, row.state, row.recorded_fact, ...row.facts]
                  .join(' ')
                  .toLowerCase()
                  .includes(literal)),
          )
        : [];
  return (
    <section
      aria-label="Recorded priority workflow state"
      className="current-owner-state"
    >
      <h3>Current workflow facts</h3>
      <button type="button" disabled={busy} onClick={() => void run('read')}>
        Read current priority workflow state
      </button>
      <p role="status">
        {busy
          ? 'Verifying original priorities and current source state…'
          : message}
      </p>
      {(error || !current) && (
        <p role="alert">
          {error ||
            'Recorded state changed or access was withdrawn. Old details and navigation are withheld. A missing card never means completed work.'}
        </p>
      )}
      {view && current && (
        <>
          <p>
            Job {view.original.snapshot.identity.job_id} ·{' '}
            {view.original.navigation.customer_id} · property{' '}
            {view.original.navigation.location_id}
          </p>
          <p>
            Original rank order is preserved. Available selected-job records are
            not complete history. Missing evidence, current consent, physical
            completion and financial authority remain UNKNOWN or unverified.
          </p>
          <div className="current-owner-filters">
            <label htmlFor={`${id}-query`}>
              Search recorded priority state
              <input
                id={`${id}-query`}
                value={query}
                maxLength={200}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label htmlFor={`${id}-filter`}>
              Recorded evidence view
              <select
                id={`${id}-filter`}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">All original priorities</option>
                <option value="evidence">Original evidence gaps</option>
                <option value="review">Original review suggestions</option>
                <option value="unknown">Unavailable exact sources</option>
              </select>
            </label>
          </div>
          <p>
            {rows.length} matching / {view.rows.length} original priority
            sources
          </p>
          {rows.length === 0 && (
            <p>
              No rows match. An empty result does not prove completion or
              absence of concerns.
            </p>
          )}
          <ol className="current-owner-state-cards">
            {rows.map((row) => (
              <li key={row.key}>
                <p className="current-owner-state-label">
                  Original priority {row.rank} · {row.area} · {row.state}
                </p>
                <h4>{row.recorded_fact}</h4>
                <p>
                  <strong>Suggested human review:</strong>{' '}
                  {row.suggested_human_review}
                </p>
                <p>
                  {row.source.kind} · {row.source.id} · revision{' '}
                  {row.source.revision ?? 'not recorded'} · version{' '}
                  {row.source.version ?? 'not recorded'}
                </p>
                <ul>
                  {row.facts.map((fact, index) => (
                    <li key={index}>{fact}</li>
                  ))}
                </ul>
                <details>
                  <summary>Why this priority remains a suggestion</summary>
                  <ul>
                    {row.order_reasons.map((reason, index) => (
                      <li key={index}>{reason}</li>
                    ))}
                  </ul>
                  {row.missing_evidence.map((item, index) => (
                    <p key={index}>
                      {item.status} · {item.detail}
                    </p>
                  ))}
                  <p>
                    No new policy, action approval, ranking or completion
                    judgment is created.
                  </p>
                </details>
                <button
                  type="button"
                  disabled={busy || row.state === 'UNKNOWN_SOURCE_UNAVAILABLE'}
                  aria-label={`Inspect current workflow source: ${row.key}`}
                  onClick={() => void run('inspect', row.key)}
                >
                  Inspect current workflow source
                </button>
              </li>
            ))}
          </ol>
          {source && (
            <section
              aria-label="Inspected current workflow source"
              className="current-owner-inspected"
            >
              <h4>Exact current source</h4>
              <p>
                {source.source.kind} · {source.source.id} · job {source.job_id}
              </p>
              <p>{source.recorded_fact}</p>
              <p>
                Existing review: {source.step}. Opening it neither executes nor
                renews a held action.
              </p>
              <button
                type="button"
                disabled={busy || !onContinue}
                onClick={() => void run('continue')}
              >
                Open exact workflow review
              </button>
            </section>
          )}
        </>
      )}
    </section>
  );
}
