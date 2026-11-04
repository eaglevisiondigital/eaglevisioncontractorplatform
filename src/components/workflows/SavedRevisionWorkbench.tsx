import { useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import { captureOperatingSources } from '../../lib/workflows/operating-center-runtime';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import {
  readSavedSourceExercise,
  executeSavedSourceExercise,
  savedSourceExercises,
  type SavedSourceExercise,
} from '../../lib/workflows/saved-revision-exercise';
import { resolveSavedWorkbenchSelection } from '../../lib/workflows/saved-workbench-selection';
import { SharedRecordSearch } from './SharedRecordSearch';
import { FieldSavedRevisions } from './FieldSavedRevisions';
import { CostSavedRevisions } from './CostSavedRevisions';
import { ServiceRevisionReview } from './ServiceRevisionReview';
import { MaintenanceSavedRevisions } from './MaintenanceSavedRevisions';
import { PrioritySavedRevisions } from './PrioritySavedRevisions';
import './saved-revision-workbench.css';
const tabs = [
  ['field', 'Work-order revisions'],
  ['finance', 'Time and materials'],
  ['customer', 'Service documentation'],
  ['maintenance', 'Maintenance revisions'],
  ['priorities', 'Recorded priorities'],
] as const;
type Tab = (typeof tabs)[number][0];
type PanelProps = SavedRevisionPanelProps & { onSourcesSaved?: () => void };
export type SavedWorkbenchPanels = Readonly<
  Record<Tab, ComponentType<PanelProps>>
>;
interface Props extends SavedRevisionPanelProps {
  reviewPanels?: SavedWorkbenchPanels;
  taskActions?: Partial<SavedWorkbenchPanels>;
}
const exerciseLabels: Record<SavedSourceExercise, string> = {
  'visit-draft': 'Save synthetic visit draft revision',
  'time-record': 'Record synthetic reviewed time',
  'time-correction': 'Save synthetic time correction',
  'material-review': 'Review synthetic material evidence',
  'plan-revision': 'Save synthetic maintenance plan revision',
  'report-revision': 'Append synthetic published report version',
};
export function SavedRevisionWorkbench(props: Props) {
  let admitted = false;
  if (
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: props.enabled ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    })
  )
    try {
      const c = captureOperatingSources(props.sources, {
        enabled: true,
        confirmed: true,
      });
      c.check();
      admitted =
        props.selectedJobId === undefined ||
        c.entries.some((e) => e.target.job_id === props.selectedJobId);
    } catch {
      /* Denial withholds all retained private evidence. */
    }
  const [binding, setBinding] = useState({
    sources: props.sources,
    hint: props.selectedJobId,
    admitted,
    epoch: 0,
  });
  if (
    binding.sources !== props.sources ||
    binding.hint !== props.selectedJobId ||
    binding.admitted !== admitted
  ) {
    setBinding({
      sources: props.sources,
      hint: props.selectedJobId,
      admitted,
      epoch: binding.epoch + 1,
    });
    return null;
  }
  return admitted ? (
    <Workbench key={binding.epoch} {...props} />
  ) : (
    <section aria-label="Saved source workbench">
      <p role="status">
        Saved source review is off or current authorized evidence is
        unavailable.
      </p>
    </section>
  );
}
function Workbench({
  sources,
  selectedJobId,
  reviewPanels,
  taskActions,
}: Props) {
  const [job, setJob] = useState(selectedJobId ?? ''),
    [tab, setTab] = useState<Tab>('field'),
    [visited, setVisited] = useState<Tab[]>(['field']),
    [searchRevision, setSearchRevision] = useState(0),
    [message, setMessage] = useState(
      'Select one exact job. Saved review selections remain local and do not authorize actions.',
    );
  const panels: SavedWorkbenchPanels = reviewPanels ?? {
    field: FieldSavedRevisions,
    finance: CostSavedRevisions,
    customer: ServiceRevisionReview,
    maintenance: MaintenanceSavedRevisions,
    priorities: PrioritySavedRevisions,
  };
  return (
    <section
      className="saved-revision-workbench"
      aria-label="Saved source workbench"
    >
      <header>
        <p className="srw-eyebrow">SOURCE CONTINUITY · STAFF REVIEW</p>
        <h2>Saved work, one job context</h2>
        <p>
          Compare recorded changes without replacing history. Review adoption
          never completes work, posts costs, issues an invoice or permits a
          message.
        </p>
      </header>
      <div className="srw-context">
        <strong>{job ? 'Retained job' : 'No job selected'}</strong>
        {job && <code>{job}</code>}
        <span>Local review only</span>
      </div>
      <SharedRecordSearch
        key={searchRevision}
        sources={sources}
        enabled
        selectedJobId={job || undefined}
        onSelectJob={(id) => {
          const selected = resolveSavedWorkbenchSelection(sources, id);
          setJob(selected.job_id);
          setMessage('Exact job retained across all five review panels.');
        }}
      />
      <p role="status">{message}</p>
      <nav className="srw-tabs" aria-label="Saved source review sections">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => {
              setTab(id);
              setVisited((previous) => [...new Set([...previous, id])]);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {tabs.map(([id]) => {
        const Panel = panels[id];
        const Actions = taskActions?.[id];
        const panelProps: PanelProps = {
          sources,
          enabled: true,
          selectedJobId: job || undefined,
          onSelectJob: (id, section) => {
            const selected = resolveSavedWorkbenchSelection(
              sources,
              id,
              section,
            );
            setJob(selected.job_id);
            if (selected.tab) {
              setTab(selected.tab);
              setVisited((previous) => [
                ...new Set([...previous, selected.tab!]),
              ]);
            }
            setMessage(
              'Exact authorized property job retained across the original review panels.',
            );
          },
          onSourcesSaved: () => {
            setSearchRevision((n) => n + 1);
            setMessage(
              'Exact canonical source saved; read updates explicitly. Original holds remain unchanged.',
            );
          },
          onContinue: (id, destination) => {
            const current = captureOperatingSources(sources, {
              enabled: true,
              confirmed: true,
            });
            current.check();
            if (id !== job) throw Error('Exact retained job required');
            const map = {
              field: 'field',
              finance: 'finance',
              invoice: 'finance',
              customer: 'customer',
              maintenance: 'maintenance',
              priorities: 'priorities',
            } as const;
            if (destination === 'advanced')
              throw Error('Use existing advanced review navigation');
            const next = map[destination];
            setTab(next);
            setVisited((previous) => [...new Set([...previous, next])]);
            current.check();
          },
        };
        return visited.includes(id) ? (
          <div key={`${job}:${id}`} hidden={tab !== id}>
            <Panel {...panelProps} />
            {Actions && <Actions {...panelProps} />}
          </div>
        ) : null;
      })}
      {job && (
        <SourceExercise
          key={job}
          sources={sources}
          enabled
          selectedJobId={job}
          onSaved={() => {
            setSearchRevision((n) => n + 1);
            setMessage(
              'Canonical synthetic source saved. Retained snapshots are unchanged; explicitly read and compare updates in each panel.',
            );
          }}
        />
      )}
      <p className="srw-limit">
        Refresh loses this same-tab review. Historical absence does not
        establish repair, resolution or payment. Availability, consent and
        physical completion retain their separate UNKNOWN gates.
      </p>
    </section>
  );
}
function SourceExercise({
  sources,
  selectedJobId,
  onSaved,
}: SavedRevisionPanelProps & { onSaved: () => void }) {
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('No source changes performed.'),
    [done, setDone] = useState<SavedSourceExercise[]>([]),
    [unknown, setUnknown] = useState(false);
  const pending = useRef(false),
    live = useRef({ active: true }),
    gate = useRef({ enabled: true, confirmed: true });
  useLayoutEffect(() => {
    const current = live.current;
    current.active = true;
    const admission = gate.current;
    admission.enabled = true;
    admission.confirmed = true;
    return () => {
      current.active = false;
      admission.enabled = false;
      admission.confirmed = false;
    };
  }, []);
  async function run(kind: SavedSourceExercise) {
    if (pending.current || !confirmed || unknown || !selectedJobId) return;
    pending.current = true;
    setBusy(true);
    const bound = live.current;
    try {
      const view = await readSavedSourceExercise(
        sources,
        selectedJobId,
        gate.current,
      );
      if (!bound.active) throw Error('Selection changed');
      await executeSavedSourceExercise(view, kind, true);
      if (bound.active) {
        setDone((rows) => [...rows, kind]);
        setMessage(
          'Exact disposable source saved; no operational authority granted.',
        );
        onSaved();
      }
    } catch {
      if (bound.active) {
        setUnknown(true);
        setMessage(
          'Source exercise unavailable or outcome UNKNOWN. No retry or automatic continuation. Existing saved evidence remains read-only.',
        );
      }
    } finally {
      pending.current = false;
      if (bound.active) {
        setBusy(false);
        setConfirmed(false);
      }
    }
  }
  return (
    <details className="srw-exercise">
      <summary>Disposable saved-source exercise</summary>
      <p>
        Engineering demonstration only. These explicit controls use the original
        synthetic repository methods. They do not dispatch, post labor, purchase
        materials, send a report or verify physical work.
      </p>
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || unknown}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I confirm this disposable source exercise only.
      </label>
      <div className="srw-exercise-actions">
        {savedSourceExercises.map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={!confirmed || busy || unknown || done.includes(kind)}
            onClick={() => void run(kind)}
          >
            {exerciseLabels[kind]}
          </button>
        ))}
      </div>
      <p role="status" aria-live="polite">
        {busy ? 'Saving exact synthetic evidence…' : message}
      </p>
    </details>
  );
}
