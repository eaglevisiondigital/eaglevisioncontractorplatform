import { useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import type { PriorityLiveCallback } from '../../lib/workflows/priority-actions';
import {
  recordedPriorityNavigationEnabled,
  recordedPriorityRecipe,
  readRecordedPriorityNavigation,
  assertRecordedPriorityNavigationCurrent,
  inspectRecordedPrioritySource,
  continueRecordedPrioritySource,
  type RecordedPriorityNavigation as NavigationView,
  type RecordedPriorityInspection,
} from '../../lib/workflows/recorded-priority-navigation';
import { PrioritySavedRevisions } from './PrioritySavedRevisions';
import { SavedEvidenceControls } from './SavedEvidenceControls';
import './recorded-priority-navigation.css';
export function RecordedPriorityNavigation(props: SavedRevisionPanelProps) {
  const enabled = recordedPriorityNavigationEnabled(props.enabled);
  const [binding, setBinding] = useState({
    sources: props.sources,
    job: props.selectedJobId,
    enabled,
    epoch: 0,
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
      epoch: binding.epoch + 1,
    });
    return null;
  }
  if (!enabled)
    return (
      <section
        className="recorded-priority-navigation"
        aria-label="Recorded priority navigation"
      >
        <p>Recorded priority navigation is OFF.</p>
      </section>
    );
  return (
    <section
      className="recorded-priority-navigation"
      aria-label="Recorded priority navigation"
    >
      <PrioritySavedRevisions {...props} />
      <SavedEvidenceControls {...props} recipe={recordedPriorityRecipe} />
      {props.selectedJobId && (
        <SourceNavigation
          key={binding.epoch}
          {...props}
          selectedJobId={props.selectedJobId}
        />
      )}
    </section>
  );
}
function SourceNavigation({
  sources,
  selectedJobId,
  onContinue,
}: SavedRevisionPanelProps & { selectedJobId: string }) {
  const [view, setView] = useState<NavigationView>(),
    [source, setSource] = useState<RecordedPriorityInspection>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      'Read the current exact priorities before inspecting a source.',
    ),
    [error, setError] = useState('');
  const gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ alive: true, pending: false, serial: 0 }),
    lease = useRef<PriorityLiveCallback>({
      current: onContinue,
      generation: 0,
    });
  useLayoutEffect(() => {
    const callbackLease = lease.current;
    callbackLease.current = onContinue;
    callbackLease.generation++;
    return () => {
      callbackLease.current = undefined;
      callbackLease.generation++;
    };
  }, [onContinue]);
  useLayoutEffect(() => {
    const g = gate.current,
      l = life.current,
      callbackLease = lease.current;
    g.enabled = true;
    g.confirmed = true;
    l.alive = true;
    return () => {
      g.enabled = false;
      g.confirmed = false;
      l.alive = false;
      l.serial++;
      callbackLease.current = undefined;
      callbackLease.generation++;
    };
  }, []);
  let access = true;
  try {
    if (view) assertRecordedPriorityNavigationCurrent(view);
  } catch {
    access = false;
  }
  async function run(mode: 'read' | 'inspect' | 'navigate', key?: string) {
    if (life.current.pending) return;
    life.current.pending = true;
    setBusy(true);
    setError('');
    const serial = ++life.current.serial;
    const live = () =>
      life.current.alive &&
      life.current.serial === serial &&
      gate.current.enabled;
    try {
      if (mode === 'read') {
        const next = await readRecordedPriorityNavigation(
          sources,
          selectedJobId,
          gate.current,
        );
        if (!live()) throw Error('Context changed');
        setView(next);
        setSource(undefined);
        setMessage(
          'Current original priorities loaded. Inspect exact recorded evidence before local navigation.',
        );
      } else if (mode === 'inspect' && view && key) {
        const next = await inspectRecordedPrioritySource(view, key);
        if (!live()) throw Error('Context changed');
        setSource(next);
        setMessage(
          'Exact source inspected. Continue opens the existing local review only.',
        );
      } else if (mode === 'navigate' && view && source && onContinue) {
        const result = await continueRecordedPrioritySource(
          view,
          source,
          onContinue,
          lease.current,
        );
        if (!live()) throw Error('Context changed');
        setMessage(result.status);
        setSource(undefined);
      }
    } catch {
      if (live())
        setError(
          'Exact source is unavailable, stale or UNKNOWN. No alternate source, execution or replay was used.',
        );
    } finally {
      life.current.pending = false;
      if (live()) setBusy(false);
    }
  }
  return (
    <section
      aria-label="Inspected priority source navigation"
      className="recorded-priority-links"
    >
      <h3>From recorded priority to exact review</h3>
      <p>
        Original evidence ordering and original local destinations. Suggestions
        do not authorize work, financial actions or customer messages.
      </p>
      <button
        type="button"
        disabled={busy || !access}
        onClick={() => void run('read')}
      >
        Read current priorities for navigation
      </button>
      <p role="status">
        {busy ? 'Rechecking exact recorded sources…' : message}
      </p>
      {(error || !access) && (
        <p role="alert">
          {error ||
            'Retained priority access changed; evidence and navigation are withheld.'}
        </p>
      )}
      {view && access && (
        <>
          <ul>
            {view.cards.map((card) => (
              <li key={card.key}>
                <strong>
                  {card.context.job} · {card.area}
                </strong>
                <p>{card.recorded_fact}</p>
                <p>{card.suggested_human_review}</p>
                <p>
                  Source {card.source.kind} · {card.source.id} · version{' '}
                  {card.source.version ?? 'not recorded'}
                </p>
                <button
                  type="button"
                  aria-label={`Inspect recorded priority source: ${card.key}`}
                  onClick={() => void run('inspect', card.key)}
                  disabled={busy}
                >
                  Inspect recorded priority source
                </button>
              </li>
            ))}
          </ul>
          {source && (
            <div className="recorded-priority-inspection">
              <h4>Exact inspected evidence</h4>
              <p>
                {source.source.kind} · {source.source.id} · revision{' '}
                {source.source.revision ?? 'not recorded'} · job {source.job_id}
              </p>
              <p>{source.recorded_fact}</p>
              <p>Existing local review: {source.step}</p>
              <button
                type="button"
                disabled={busy || !onContinue}
                onClick={() => void run('navigate')}
              >
                Open exact existing review
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
