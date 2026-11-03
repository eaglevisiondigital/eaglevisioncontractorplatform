import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import type { PriorityLiveCallback } from '../../lib/workflows/priority-actions';
import {
  costCoveragePathEnabled,
  readCostCoveragePath,
  assertCostCoveragePathCurrent,
  inspectCostCoverageSource,
  continueCostCoverageSource,
  type CostCoveragePathRead,
  type CostCoverageSource,
} from '../../lib/workflows/cost-coverage-path';
import { CostCorrectionReview } from './CostCorrectionReview';
import './cost-coverage-path.css';
type Props = SavedRevisionPanelProps & {
  onSourcesSaved?: () => void | Promise<void>;
};
export function CostCoveragePath(props: Props) {
  const enabled = costCoveragePathEnabled(props.enabled),
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
    <section aria-label="Cost coverage path" className="cost-coverage-path">
      <h2>Cost coverage and invoice path</h2>
      <p>
        Trace exact recorded sources into the existing review. Missing labor
        evidence and incomplete invoice requirements remain explicit.
      </p>
      {!enabled ? (
        <p>Cost coverage path is OFF.</p>
      ) : (
        <>
          <CostCorrectionReview {...props} />
          {props.selectedJobId ? (
            <SourcePath
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
function SourcePath({
  sources,
  selectedJobId,
  onContinue,
}: Props & { selectedJobId: string }) {
  const [view, setView] = useState<CostCoveragePathRead>(),
    [selected, setSelected] = useState<CostCoverageSource>(),
    [query, setQuery] = useState(''),
    [kind, setKind] = useState('all'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      'Read the current cost path after saving a source.',
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
    if (view) assertCostCoveragePathCurrent(view);
  } catch {
    current = false;
  }
  async function read() {
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
      const next = await readCostCoveragePath(
        sources,
        selectedJobId,
        gate.current,
      );
      if (!live()) throw Error('Context changed');
      setView(next);
      setSelected(undefined);
      setMessage(
        'Exact current time, material events and invoice requirements loaded; no posting or completeness was inferred.',
      );
    } catch {
      if (live())
        setError(
          'Current source, membership or original navigation outcome is unavailable or UNKNOWN. No replacement or retry was used.',
        );
    } finally {
      life.current.pending = false;
      if (live()) setBusy(false);
    }
  }
  function inspect(row: CostCoverageSource) {
    if (!view) return;
    try {
      setSelected(
        inspectCostCoverageSource(view, { kind: row.kind, id: row.id }),
      );
      setError('');
    } catch {
      setSelected(undefined);
      setError(
        'Exact source changed or was withdrawn. Read current sources again.',
      );
    }
  }
  async function navigate() {
    if (!view || !selected || !onContinue || life.current.pending) return;
    life.current.pending = true;
    setBusy(true);
    const serial = ++life.current.generation,
      live = () =>
        life.current.alive &&
        life.current.generation === serial &&
        gate.current.enabled;
    try {
      const result = await continueCostCoverageSource(
        view,
        selected,
        onContinue,
        lease.current,
      );
      if (live()) {
        setMessage(result.status);
        setSelected(undefined);
      }
    } catch {
      if (live())
        setError(
          'Exact continuation is withheld or UNKNOWN. It was not replayed.',
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
              (kind === 'all' || row.kind === kind) &&
              (!literal ||
                [row.id, row.title, row.status, ...row.references, ...row.facts]
                  .join(' ')
                  .toLowerCase()
                  .includes(literal)),
          )
        : [];
  return (
    <section
      aria-label="Recorded cost source path"
      className="cost-coverage-sources"
    >
      <h3>From recorded evidence to the next review</h3>
      <button type="button" onClick={() => void read()} disabled={busy}>
        Read current cost coverage path
      </button>
      <p role="status">
        {busy ? 'Rechecking exact source and workflow state…' : message}
      </p>
      {(error || !current) && (
        <p role="alert">
          {error ||
            'Sources or access changed. Retained details and links are withheld; a fresh read cannot renew an UNKNOWN action.'}
        </p>
      )}
      {view && current && (
        <>
          <p>
            Job {view.context.job_id} · {view.context.customer_label} ·{' '}
            {view.context.property_label}
          </p>
          <div className="cost-coverage-status">
            <p>
              <strong>Original cost coverage:</strong> {view.coverage}
            </p>
            <p>
              <strong>Invoice review:</strong> {view.invoice_status} · no
              issuance authority
            </p>
            <p>{view.limits}</p>
            {view.missing_evidence.map((text, index) => (
              <p key={index}>{text}</p>
            ))}
          </div>
          <div className="cost-coverage-filters">
            <label htmlFor={`${id}-query`}>
              Search recorded cost sources
              <input
                id={`${id}-query`}
                maxLength={200}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label htmlFor={`${id}-kind`}>
              Source kind
              <select
                id={`${id}-kind`}
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                {[
                  'all',
                  'time',
                  'material',
                  'material_review',
                  'invoice_requirement',
                ].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p>
            {rows.length} matching / {view.rows.length} available current source
            rows
          </p>
          {rows.length === 0 && (
            <p>
              No matching source rows. Absence does not prove zero cost, payment
              or complete work.
            </p>
          )}
          <ul className="cost-coverage-rows">
            {rows.map((row) => (
              <li key={row.key}>
                <strong>{row.title}</strong>
                <p>
                  {row.status} · {row.id}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Inspect recorded cost source: ${row.key}`}
                  onClick={() => inspect(row)}
                >
                  Inspect recorded cost source
                </button>
              </li>
            ))}
          </ul>
          {selected && (
            <section
              aria-label="Exact cost source detail"
              className="cost-coverage-detail"
            >
              <h4>{selected.title}</h4>
              <p>
                {selected.kind} · {selected.id} · {selected.status}
              </p>
              <ul>
                {selected.facts.map((fact, index) => (
                  <li key={index}>{fact}</li>
                ))}
              </ul>
              <p>
                Exact related sources:{' '}
                {selected.references.join(', ') || 'none recorded'}
              </p>
              <p>
                Existing review: {selected.destination}. Navigation is not
                permission to execute.
              </p>
              <button
                type="button"
                disabled={busy || !onContinue}
                onClick={() => void navigate()}
              >
                Open existing exact cost review
              </button>
            </section>
          )}
        </>
      )}
    </section>
  );
}
