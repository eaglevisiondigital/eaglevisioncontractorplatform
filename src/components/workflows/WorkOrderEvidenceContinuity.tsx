import { useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import { FieldSavedRevisions } from './FieldSavedRevisions';
import { SavedEvidenceControls } from './SavedEvidenceControls';
import { workOrderEvidenceRecipe } from '../../lib/workflows/work-order-evidence-continuity';
import {
  readSavedSourceExercise,
  readSavedDraftEdit,
  executeSavedDraftEdit,
  type SavedSourceExerciseView,
} from '../../lib/workflows/saved-revision-exercise';
import './work-order-evidence-continuity.css';
/** Same original workspace and custody; file bytes never restore records. */
export type WorkOrderEvidenceContinuityProps = SavedRevisionPanelProps & {
  onSourcesSaved?: () => void;
};
export function WorkOrderEvidenceContinuity(
  props: WorkOrderEvidenceContinuityProps,
) {
  const allowed =
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: props.enabled ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    });
  const [context, setContext] = useState({
    sources: props.sources,
    job: props.selectedJobId,
    allowed,
    epoch: 0,
  });
  if (
    context.sources !== props.sources ||
    context.job !== props.selectedJobId ||
    context.allowed !== allowed
  ) {
    setContext({
      sources: props.sources,
      job: props.selectedJobId,
      allowed,
      epoch: context.epoch + 1,
    });
    return null;
  }
  return (
    <section
      className="work-order-evidence-continuity"
      aria-label="Work order evidence continuity"
    >
      <FieldSavedRevisions {...props} />
      {allowed && props.selectedJobId && (
        <DraftVisitEditor
          key={context.epoch}
          {...props}
          selectedJobId={props.selectedJobId}
        />
      )}
      <SavedEvidenceControls {...props} recipe={workOrderEvidenceRecipe} />
    </section>
  );
}
function DraftVisitEditor({
  sources,
  selectedJobId,
  onSourcesSaved,
}: WorkOrderEvidenceContinuityProps & { selectedJobId: string }) {
  const [view, setView] = useState<SavedSourceExerciseView>(),
    [draft, setDraft] = useState<ReturnType<typeof readSavedDraftEdit>>(),
    [summary, setSummary] = useState(''),
    [checklist, setChecklist] = useState<
      { id: string; label: string; completed: boolean }[]
    >([]),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      'No draft loaded. This explicit disposable edit uses the original one-use visit-draft custody.',
    );
  const gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ alive: true, pending: false, serial: 0 }),
    heading = useRef<HTMLHeadingElement>(null);
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
      l.serial++;
    };
  }, []);
  async function load() {
    const l = life.current;
    if (l.pending) return;
    l.pending = true;
    const token = ++l.serial;
    setBusy(true);
    setConfirmed(false);
    try {
      const next = await readSavedSourceExercise(
          sources,
          selectedJobId,
          gate.current,
        ),
        saved = readSavedDraftEdit(next);
      if (!l.alive || token !== l.serial) return;
      setView(next);
      setDraft(saved);
      setSummary(saved.summary);
      setChecklist(
        saved.checklist.map((c) => ({
          id: c.id,
          label: c.label,
          completed: c.completed,
        })),
      );
      setMessage(
        saved.can_edit
          ? 'Current original draft loaded. Confirm the exact summary and checklist edit.'
          : 'Original visit-draft attempt is already retained or UNKNOWN; no new save is permitted.',
      );
      heading.current?.focus();
    } catch {
      if (l.alive && token === l.serial) {
        setView(undefined);
        setDraft(undefined);
        setMessage(
          'UNKNOWN — exact current draft unavailable. No retry or replacement is authorized.',
        );
      }
    } finally {
      l.pending = false;
      if (l.alive && token === l.serial) setBusy(false);
    }
  }
  async function save() {
    const l = life.current;
    if (!view || !confirmed || l.pending) return;
    l.pending = true;
    const token = ++l.serial;
    setBusy(true);
    try {
      await executeSavedDraftEdit(view, { summary, checklist }, true);
      if (l.alive && token === l.serial) {
        setView(undefined);
        setDraft(undefined);
        setConfirmed(false);
        setMessage(
          'SYNTHETIC_SOURCE_SAVED — original draft revision advanced. Read saved field updates and prepare a new evidence file explicitly. No publication or physical completion is implied.',
        );
        try {
          onSourcesSaved?.();
        } catch {
          setMessage(
            'SYNTHETIC_SOURCE_SAVED — presentation search refresh unavailable. No action may be retried.',
          );
        }
      }
    } catch {
      if (l.alive && token === l.serial) {
        setView(undefined);
        setDraft(undefined);
        setConfirmed(false);
        setMessage(
          'UNKNOWN — stale, duplicate, revoked or uncertain edit. Original custody remains held; no retry, replay or new ID.',
        );
      }
    } finally {
      l.pending = false;
      if (l.alive && token === l.serial) setBusy(false);
    }
  }
  let current = false;
  if (view)
    try {
      current = readSavedDraftEdit(view).can_edit;
    } catch {
      /* Old form withheld after a current-source change. */
    }
  return (
    <section
      className="work-order-draft-editor"
      aria-label="Local draft visit editor"
      aria-busy={busy}
    >
      <h3 tabIndex={-1} ref={heading}>
        Local draft visit editor
      </h3>
      <p>
        Edits the actual existing synthetic draft summary and recorded checklist
        only. Original notes, findings, checklist IDs and required flags remain
        unchanged. No task store, dispatch or publication.
      </p>
      <button
        type="button"
        disabled={busy || Boolean(view)}
        onClick={() => void load()}
      >
        Load current draft visit
      </button>
      <p role="status">{message}</p>
      {view && draft && !current && (
        <p role="alert">
          Current draft changed or original attempt is held. Previous editable
          content is withheld.
        </p>
      )}
      {view && draft && current && (
        <>
          <p>
            Original visit <code>{draft.visit_id}</code> · saved revision{' '}
            {draft.revision}
          </p>
          <label>
            Saved draft observation summary
            <textarea
              value={summary}
              maxLength={2000}
              disabled={busy}
              onChange={(e) => {
                setSummary(e.target.value);
                setConfirmed(false);
              }}
            />
          </label>
          <fieldset>
            <legend>Original recorded checklist</legend>
            {checklist.map((c, i) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={c.completed}
                  disabled={busy}
                  onChange={(e) => {
                    setChecklist(
                      checklist.map((x, n) =>
                        n === i ? { ...x, completed: e.target.checked } : x,
                      ),
                    );
                    setConfirmed(false);
                  }}
                />
                {c.label} · recorded checked state
              </label>
            ))}
          </fieldset>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I reviewed this exact saved draft revision and confirm the local
            summary/checklist edit only.
          </label>
          <button
            type="button"
            disabled={
              !confirmed ||
              busy ||
              !summary.trim() ||
              summary !== summary.trim()
            }
            onClick={() => void save()}
          >
            Save exact local draft revision
          </button>
        </>
      )}
    </section>
  );
}
