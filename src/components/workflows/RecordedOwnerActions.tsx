import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import type { PriorityLiveCallback } from '../../lib/workflows/priority-actions';
import {
  recordedOwnerActionsEnabled,
  readRecordedOwnerActions,
  compareRecordedOwnerActions,
  recordedOwnerActionCards,
  inspectRecordedOwnerAction,
  continueRecordedOwnerAction,
  type RecordedOwnerActionReview,
  type RecordedOwnerActionInspection,
} from '../../lib/workflows/recorded-owner-actions';
import './recorded-owner-actions.css';
export function RecordedOwnerActions(props: SavedRevisionPanelProps) {
  const enabled = recordedOwnerActionsEnabled(props.enabled),
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
      className="recorded-owner-actions"
      aria-label="Recorded owner actions"
    >
      <h2>Owner action center</h2>
      <p>
        Current recorded priorities, with exact source explanations. Suggestions
        never authorize work, financial actions or customer communications.
      </p>
      {!enabled ? (
        <p>Recorded owner actions are OFF.</p>
      ) : props.selectedJobId ? (
        <OwnerReview
          key={binding.generation}
          {...props}
          selectedJobId={props.selectedJobId}
        />
      ) : (
        <p>Select an authorized job in the existing workspace.</p>
      )}
    </section>
  );
}
function OwnerReview({
  sources,
  selectedJobId,
  onContinue,
}: SavedRevisionPanelProps & { selectedJobId: string }) {
  const [view, setView] = useState<RecordedOwnerActionReview>(),
    [previous, setPrevious] = useState<RecordedOwnerActionReview>(),
    [source, setSource] = useState<RecordedOwnerActionInspection>(),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(''),
    [area, setArea] = useState('all'),
    [changed, setChanged] = useState(false),
    [message, setMessage] = useState(
      'Read recorded priorities. Refresh after an explicit source save.',
    ),
    [error, setError] = useState(''),
    [expanded, setExpanded] = useState<string[]>([]);
  const gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ alive: true, pending: false, generation: 0 }),
    lease = useRef<PriorityLiveCallback>({
      current: onContinue,
      generation: 0,
    }),
    container = useRef<HTMLDivElement>(null),
    pendingFocus = useRef<
      | {
          token: string;
          origin: Element;
          generation: number;
        }
      | undefined
    >(undefined),
    id = useId();
  useLayoutEffect(() => {
    const value = lease.current;
    value.current = onContinue;
    value.generation++;
    return () => {
      value.current = undefined;
      value.generation++;
    };
  }, [onContinue]);
  useLayoutEffect(() => {
    const g = gate.current,
      l = life.current,
      callback = lease.current;
    g.enabled = true;
    g.confirmed = true;
    l.alive = true;
    return () => {
      g.enabled = false;
      g.confirmed = false;
      l.alive = false;
      l.generation++;
      callback.current = undefined;
      callback.generation++;
    };
  }, []);
  useLayoutEffect(() => {
    const owned = pendingFocus.current;
    if (!owned) return;
    if (busy) {
      const cancel = () => {
        pendingFocus.current = undefined;
      };
      const moved = (event: FocusEvent) => {
        if (event.target !== document.body && event.target !== owned.origin)
          cancel();
      };
      const hidden = () => {
        if (document.hidden) cancel();
      };
      document.addEventListener('focusin', moved);
      document.addEventListener('pointerdown', cancel, true);
      document.addEventListener('visibilitychange', hidden);
      return () => {
        document.removeEventListener('focusin', moved);
        document.removeEventListener('pointerdown', cancel, true);
        document.removeEventListener('visibilitychange', hidden);
      };
    }
    pendingFocus.current = undefined;
    const root = container.current;
    if (
      !life.current.alive ||
      life.current.generation !== owned.generation ||
      document.hidden ||
      !root?.isConnected ||
      !root.getClientRects().length ||
      (document.activeElement !== document.body &&
        document.activeElement !== owned.origin)
    )
      return;
    const buttons = [
      ...root.querySelectorAll<HTMLButtonElement>('button[data-owner-focus]'),
    ];
    const target =
      buttons.find(
        (button) =>
          button.dataset.ownerFocus === owned.token && !button.disabled,
      ) ??
      buttons.find(
        (button) => button.dataset.ownerFocus === 'read' && !button.disabled,
      );
    target?.focus();
  }, [busy]);
  let access = true;
  let cards: ReturnType<typeof recordedOwnerActionCards> = [];
  let changes: ReturnType<typeof compareRecordedOwnerActions> | undefined;
  try {
    if (view && !busy) {
      cards = recordedOwnerActionCards(view);
      if (previous)
        changes = compareRecordedOwnerActions(previous, view, {
          query,
          area,
          changed_only: changed,
        });
    }
  } catch {
    access = false;
  }
  async function run(mode: 'read' | 'inspect' | 'continue', key?: string) {
    if (life.current.pending) return;
    life.current.pending = true;
    setBusy(true);
    setError('');
    const generation = ++life.current.generation;
    const focused = document.activeElement;
    pendingFocus.current =
      focused instanceof HTMLElement &&
      container.current?.contains(focused) &&
      focused.dataset.ownerFocus
        ? { token: focused.dataset.ownerFocus, origin: focused, generation }
        : undefined;
    const live = () =>
      life.current.alive &&
      life.current.generation === generation &&
      gate.current.enabled;
    // A fresh read/inspection must not re-expose the earlier inspection after
    // rejection. This clears presentation only, never original native custody.
    if (mode === 'read' || mode === 'inspect') setSource(undefined);
    try {
      if (mode === 'read') {
        const next = await readRecordedOwnerActions(
          sources,
          selectedJobId,
          gate.current,
        );
        if (!live()) throw Error('Context changed');
        setPrevious(view);
        setView(next);
        setSource(undefined);
        setMessage(
          'Fresh canonical sources read. Original evidence ordering is preserved; absence never proves completion.',
        );
      } else if (mode === 'inspect' && view && key) {
        const next = await inspectRecordedOwnerAction(view, key);
        if (!live()) throw Error('Context changed');
        setSource(next);
        setMessage(
          'Exact source inspected. A separate action opens its existing local review.',
        );
      } else if (mode === 'continue' && view && source && onContinue) {
        const result = await continueRecordedOwnerAction(
          view,
          source,
          onContinue,
          lease.current,
        );
        if (!live()) throw Error('Context changed');
        setSource(undefined);
        setMessage(result.status);
      }
    } catch {
      if (live())
        setError(
          'Exact source is stale, revoked, missing or UNKNOWN. No alternate source, replay or execution was used.',
        );
    } finally {
      life.current.pending = false;
      if (live()) setBusy(false);
    }
  }
  return (
    <div className="recorded-owner-review" ref={container}>
      <button
        type="button"
        data-owner-focus="read"
        onClick={() => void run('read')}
        disabled={busy}
      >
        Read current owner priorities
      </button>
      <p role="status">
        {busy ? 'Verifying exact current source state…' : message}
      </p>
      {(error || !access) && (
        <p role="alert">
          {error ||
            'Recorded sources changed. Details and navigation are withheld; read current priorities again.'}
        </p>
      )}
      {!busy && view && access && (
        <>
          <p>
            {view.snapshot.identity.organization_id} · job{' '}
            {view.snapshot.identity.job_id} · saved revision{' '}
            {view.snapshot.evidence.job_revision}
          </p>
          <p>
            {cards.length} available priorities for this selected job. Available
            sources are not complete company history.
          </p>
          {cards.length === 0 && (
            <p>
              No priorities were produced by the available exact sources. This
              does not prove completion.
            </p>
          )}
          <ol className="recorded-owner-cards">
            {cards.map((card) => (
              <li key={card.key}>
                <div className="recorded-owner-label">
                  Priority {card.rank} · {card.area} · {card.review_band}
                </div>
                <h3>{card.context.job}</h3>
                <p>{card.recorded_fact}</p>
                <p>
                  <strong>Suggested human review:</strong>{' '}
                  {card.suggested_human_review}
                </p>
                <details
                  open={expanded.includes(card.key)}
                  onToggle={(event) => {
                    const open = event.currentTarget.open;
                    setExpanded((previous) =>
                      open
                        ? previous.includes(card.key)
                          ? previous
                          : [...previous, card.key]
                        : previous.includes(card.key)
                          ? previous.filter((key) => key !== card.key)
                          : previous,
                    );
                  }}
                >
                  <summary
                    onClick={(event) => {
                      // Capture the user's disclosure intent before a queued
                      // native toggle can race the pending private-DOM omission.
                      event.preventDefault();
                      setExpanded((previous) =>
                        previous.includes(card.key)
                          ? previous.filter((key) => key !== card.key)
                          : [...previous, card.key],
                      );
                    }}
                  >
                    Why this priority and exact source
                  </summary>
                  <ul>
                    {card.order_reasons.map((reason, index) => (
                      <li key={index}>{reason}</li>
                    ))}
                  </ul>
                  <p>
                    {card.source.kind} · {card.source.id} · version{' '}
                    {card.source.version ?? 'not recorded'} · revision{' '}
                    {card.source.revision ?? 'not recorded'}
                  </p>
                  {card.missing_evidence.map((item, index) => (
                    <p key={index}>
                      {item.status} · {item.detail}
                    </p>
                  ))}
                </details>
                <button
                  type="button"
                  disabled={busy}
                  data-owner-focus={`inspect:${card.key}`}
                  aria-label={`Inspect owner priority source: ${card.key}`}
                  onClick={() => void run('inspect', card.key)}
                >
                  Inspect owner priority source
                </button>
              </li>
            ))}
          </ol>
          {source && (
            <section
              className="recorded-owner-inspection"
              aria-label="Exact owner priority source"
            >
              <h3>Inspected source</h3>
              <p>{source.recorded_fact}</p>
              <p>
                {source.source.kind} · {source.source.id} · job {source.job_id}
              </p>
              <p>
                Existing review: {source.step}. Navigation does not renew held
                actions.
              </p>
              <button
                type="button"
                disabled={busy || !onContinue}
                data-owner-focus="continue"
                onClick={() => void run('continue')}
              >
                Open exact owner priority review
              </button>
            </section>
          )}
          {previous && (
            <section aria-label="Recorded priority changes">
              <h3>Changes since the previous read</h3>
              <p>
                Original source/card identity only. A missing priority is not a
                resolved issue.
              </p>
              <div className="recorded-owner-filters">
                <label htmlFor={`${id}-query`}>
                  Literal source search
                  <input
                    id={`${id}-query`}
                    value={query}
                    maxLength={200}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label htmlFor={`${id}-area`}>
                  Area
                  <select
                    id={`${id}-area`}
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                  >
                    {['all', 'finance', 'field', 'documentation', 'scope'].map(
                      (value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={changed}
                    onChange={(e) => setChanged(e.target.checked)}
                  />
                  Show changed rows only
                </label>
              </div>
              <p>
                {changes?.matching ?? 0} matching / {changes?.available ?? 0}{' '}
                available source rows
              </p>
              {!changes?.rows.length && <p>No rows match these filters.</p>}
              <ul>
                {changes?.rows.map((row) => (
                  <li key={row.identity}>
                    <strong>{row.status}</strong> ·{' '}
                    {(row.current ?? row.before)?.recorded_fact}
                    <p>{(row.current ?? row.before)?.source.id}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
