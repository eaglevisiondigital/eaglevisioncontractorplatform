import { useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import {
  prepareSavedEvidence,
  openSavedEvidence,
  reconcileSavedEvidence,
  assertSavedEvidenceAccess,
  type EvidenceRecipe,
  type SavedEvidenceFile,
} from '../../lib/workflows/saved-evidence-runtime';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
/** Same existing job/source host. File bytes confer no source or execution authority. */
export function SavedEvidenceControls<P>(
  props: SavedRevisionPanelProps & { recipe: EvidenceRecipe<P> },
) {
  const allowed =
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: props.enabled ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    });
  const [binding, setBinding] = useState({
    sources: props.sources,
    job: props.selectedJobId,
    recipe: props.recipe,
    allowed,
    epoch: 0,
  });
  if (
    binding.sources !== props.sources ||
    binding.job !== props.selectedJobId ||
    binding.recipe !== props.recipe ||
    binding.allowed !== allowed
  ) {
    setBinding({
      sources: props.sources,
      job: props.selectedJobId,
      recipe: props.recipe,
      allowed,
      epoch: binding.epoch + 1,
    });
    return null;
  }
  return allowed && props.selectedJobId ? (
    <Controls
      key={binding.epoch}
      {...props}
      selectedJobId={props.selectedJobId}
    />
  ) : (
    <p role="status">
      Saved evidence files are off or an exact job is required.
    </p>
  );
}
function Controls<P>({
  sources,
  selectedJobId,
  recipe,
}: SavedRevisionPanelProps & {
  selectedJobId: string;
  recipe: EvidenceRecipe<P>;
}) {
  const [file, setFile] = useState<SavedEvidenceFile<P>>(),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState('No evidence file prepared or opened.'),
    [error, setError] = useState('');
  const gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ alive: true, pending: false, serial: 0 });
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
  let access = true;
  if (file)
    try {
      assertSavedEvidenceAccess(file);
    } catch {
      access = false;
    }
  async function run(action: 'download' | 'open' | 'reconcile', input?: File) {
    const l = life.current;
    if (l.pending || !l.alive) return;
    l.pending = true;
    const serial = ++l.serial;
    setBusy(true);
    setError('');
    try {
      if (action === 'reconcile') {
        if (!file) throw Error('Exact opened file required');
        const result = await reconcileSavedEvidence(file);
        if (l.alive && serial === l.serial)
          setStatus(
            result.status + ' — no record restored or action authorized.',
          );
      } else {
        let next: SavedEvidenceFile<P>;
        if (action === 'open') {
          if (!input || input.size > 1048576)
            throw Error('Bounded original evidence file required');
          const text = new TextDecoder('utf-8', { fatal: true }).decode(
            await input.arrayBuffer(),
          );
          if (!l.alive || serial !== l.serial)
            throw Error('Withdrawn file read');
          next = await openSavedEvidence(
            sources,
            selectedJobId,
            recipe,
            text,
            gate.current,
          );
        } else
          next = await prepareSavedEvidence(
            sources,
            selectedJobId,
            recipe,
            gate.current,
          );
        if (!l.alive || serial !== l.serial) throw Error('Withdrawn file read');
        assertSavedEvidenceAccess(next);
        setFile(next);
        if (action === 'download') {
          const url = URL.createObjectURL(
            new Blob([next.text], { type: 'application/json' }),
          );
          try {
            const a = document.createElement('a');
            a.href = url;
            a.download = `propel-${recipe.kind}-${next.envelope.sha256}.json`;
            a.click();
          } finally {
            URL.revokeObjectURL(url);
          }
          setStatus(
            'FILE_PREPARED_NOT_CONFIRMED_SAVED — download requested; filesystem durability is not established by this page.',
          );
        } else
          setStatus(
            'HISTORICAL_EVIDENCE_ONLY — file reopened; reconcile exact current source separately.',
          );
      }
    } catch {
      if (l.alive && serial === l.serial) {
        setError(
          'UNKNOWN — file, ownership or current source could not be verified. No import, restore, retry or operational action.',
        );
        setFile(undefined);
      }
    } finally {
      l.pending = false;
      if (l.alive && serial === l.serial) setBusy(false);
    }
  }
  return (
    <section
      className="saved-evidence-controls"
      aria-label={recipe.title + ' files'}
    >
      <h3>{recipe.title} · saved evidence</h3>
      <p>
        Historical content only. A file digest is not a signature, approval,
        current authority or canonical record restoration.
      </p>
      <button
        type="button"
        disabled={busy || !access}
        onClick={() => void run('download')}
      >
        Download {recipe.title.toLowerCase()} evidence
      </button>
      <label>
        Open {recipe.title.toLowerCase()} evidence file
        <input
          type="file"
          accept="application/json,.json"
          disabled={busy || !access}
          onChange={(event) => {
            const f = event.target.files?.[0];
            event.target.value = '';
            if (f) void run('open', f);
          }}
        />
      </label>
      <button
        type="button"
        disabled={busy || !file}
        onClick={() => void run('reconcile')}
      >
        Reconcile exact saved {recipe.title.toLowerCase()} source
      </button>
      <p role="status">
        {busy
          ? 'Checking exact saved evidence…'
          : access
            ? status
            : 'UNKNOWN — current source access revoked; saved evidence withheld.'}
      </p>
      {error && <p role="alert">{error}</p>}
      {file && access && (
        <details>
          <summary>Opened historical evidence</summary>
          <code>{file.envelope.sha256}</code>
          <pre>{JSON.stringify(file.envelope.payload, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}
