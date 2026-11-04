import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import type { PriorityLiveCallback } from '../../lib/workflows/priority-actions';
import {
  recordedCostRequirementsEnabled,
  readRecordedCostRequirements,
  assertRecordedCostRequirementsCurrent,
  inspectRecordedCostCategory,
  inspectRecordedCostRequirement,
  inspectRecordedCostSource,
  continueRecordedCostSource,
  type RecordedCostRequirementsRead,
} from '../../lib/workflows/recorded-cost-requirements';
import type { CostCoverageSource } from '../../lib/workflows/cost-coverage-path';
import { CostCorrectionReview } from './CostCorrectionReview';
import './recorded-cost-requirements.css';
type Props = SavedRevisionPanelProps & {
  onSourcesSaved?: () => void | Promise<void>;
};
export function RecordedCostRequirements(props: Props) {
  const enabled = recordedCostRequirementsEnabled(props.enabled),
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
      className="recorded-cost-requirements"
      aria-label="Recorded cost requirements"
    >
      <h2>Recorded costs to financial requirements</h2>
      <p>
        Inspect canonical category totals, original labor references and the
        exact financial requirements that still need review.
      </p>
      {!enabled ? (
        <p>Recorded cost requirements are OFF.</p>
      ) : (
        <>
          <CostCorrectionReview {...props} />
          {props.selectedJobId ? (
            <Requirements
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
function Requirements({
  sources,
  selectedJobId,
  onContinue,
}: Props & { selectedJobId: string }) {
  const [view, setView] = useState<RecordedCostRequirementsRead>(),
    [category, setCategory] = useState('labor'),
    [requirement, setRequirement] = useState(''),
    [source, setSource] = useState<CostCoverageSource>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      'Read current recorded cost requirements after saving source evidence.',
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
    if (view) assertRecordedCostRequirementsCurrent(view);
  } catch {
    current = false;
  }
  async function run(navigate = false) {
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
      if (navigate && view && source && onContinue) {
        const result = await continueRecordedCostSource(
          view,
          source,
          onContinue,
          lease.current,
        );
        if (live()) {
          setMessage(result.status);
          setSource(undefined);
        }
      } else if (!navigate) {
        const next = await readRecordedCostRequirements(
          sources,
          selectedJobId,
          gate.current,
        );
        if (!live()) throw Error('Context changed');
        setView(next);
        setSource(undefined);
        setRequirement('');
        setMessage(
          'Exact canonical amounts and financial requirements loaded. No posting, issuance or completeness inferred.',
        );
      }
    } catch {
      if (live())
        setError(
          'Current source, membership or original outcome is stale, revoked or UNKNOWN. No substitute or replay was used.',
        );
    } finally {
      life.current.pending = false;
      if (live()) setBusy(false);
    }
  }
  let selected: ReturnType<typeof inspectRecordedCostCategory> | undefined,
    detail: ReturnType<typeof inspectRecordedCostRequirement> | undefined;
  if (view && current)
    try {
      selected = inspectRecordedCostCategory(view, category);
      if (requirement)
        detail = inspectRecordedCostRequirement(view, requirement);
    } catch {
      current = false;
    }
  function inspect(row: CostCoverageSource) {
    if (!view) return;
    try {
      setSource(
        inspectRecordedCostSource(view, { kind: row.kind, id: row.id }),
      );
      setError('');
    } catch {
      setSource(undefined);
      setError(
        'Exact source is unavailable. Details and navigation are withheld.',
      );
    }
  }
  return (
    <section aria-label="Canonical cost requirement drill-down">
      <h3>Category and source review</h3>
      <button type="button" disabled={busy} onClick={() => void run()}>
        Read recorded cost requirements
      </button>
      <p role="status">
        {busy ? 'Checking exact canonical sources…' : message}
      </p>
      {(error || !current) && (
        <p role="alert">
          {error ||
            'Sources or staff access changed. A fresh read does not renew an UNKNOWN action.'}
        </p>
      )}
      {view && current && (
        <>
          <p>
            {view.original.context.customer_label} ·{' '}
            {view.original.context.property_label} · job{' '}
            {view.original.context.job_id}
          </p>
          <p>
            Cost coverage: {view.coverage} · Invoice requirements:{' '}
            {view.invoice_overall} · Financial evidence:{' '}
            {view.financial_coverage}
          </p>
          <p>{view.limits}</p>
          <div className="recorded-cost-selectors">
            <label htmlFor={`${id}-category`}>
              Canonical cost category
              <select
                id={`${id}-category`}
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setSource(undefined);
                }}
              >
                {view.categories.map((c) => (
                  <option key={c.category} value={c.category}>
                    {c.category}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`${id}-requirement`}>
              Original financial requirement
              <select
                id={`${id}-requirement`}
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
              >
                <option value="">Choose a requirement</option>
                {view.requirements.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.kind} · {r.status}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {selected && (
            <section
              className="recorded-cost-detail"
              aria-label="Canonical category detail"
            >
              <h4>{selected.category} · canonical amounts</h4>
              <dl>
                {[
                  ['Budget', selected.budget_minor],
                  ['Recorded paid-cost aggregate', selected.paid_minor],
                  [
                    'Outstanding commitment',
                    selected.committed_remaining_minor,
                  ],
                  ['Staff projected remaining', selected.remaining_minor],
                  ['Projected cost', selected.projected_minor],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      {value} {view.original.original.costs.evidence.currency}{' '}
                      minor units
                    </dd>
                  </div>
                ))}
              </dl>
              <p>
                Canonical overrun flag: {String(selected.overrun)}. These are
                original category totals, not an allocation to individual source
                entries or proof of payment.
              </p>
              <ul>
                {view.original.rows
                  .filter((r) => selected.source_keys.includes(r.key))
                  .map((r) => (
                    <li key={r.key}>
                      <span>
                        {r.kind} · {r.id} · {r.status}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Inspect exact category source: ${r.key}`}
                        onClick={() => inspect(r)}
                      >
                        Inspect exact category source
                      </button>
                    </li>
                  ))}
              </ul>
              {selected.source_keys.length === 0 && (
                <p>
                  No recorded source rows in this category. Absence does not
                  prove zero cost.
                </p>
              )}
              {selected.category === 'labor' && (
                <>
                  <h4>Original labor coverage references</h4>
                  <p>
                    Locked periods:{' '}
                    {view.locked_period_ids.join(', ') || 'none available'}. No
                    period is opened or posted here.
                  </p>
                  <ul>
                    {view.labor.map((t) => (
                      <li key={t.entry_id}>
                        {t.entry_id} · {t.requirement} · review{' '}
                        {t.recorded_review ?? 'not recorded'} · corrects{' '}
                        {t.corrects_id ?? 'none'} · correcting entries{' '}
                        {t.correcting_entry_ids.join(', ') || 'none recorded'}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
          {detail && (
            <section
              className="recorded-cost-detail"
              aria-label="Original financial requirement detail"
            >
              <h4>{detail.title}</h4>
              <p>
                {detail.kind} · {detail.status} · {detail.id}
              </p>
              <p>{detail.observation}</p>
              <p>Suggested staff review: {detail.suggested_review}</p>
              <p>
                This original requirement is independent of a source review. It
                is not resolved by opening this detail.
              </p>
            </section>
          )}
          <details className="recorded-cost-detail">
            <summary>Exact invoice and event evidence</summary>
            {view.invoices.map((invoice) => (
              <section key={invoice.invoice_id}>
                <h4>Invoice {invoice.invoice_id}</h4>
                <p>
                  {invoice.linkage} · {invoice.verification} · contract{' '}
                  {invoice.contract_id} · offer {invoice.offer_id ?? 'UNKNOWN'}{' '}
                  · issued source {invoice.issued_version_id ?? 'UNKNOWN'}
                </p>
                <p>
                  Event IDs:{' '}
                  {invoice.events.map((e) => e.id).join(', ') ||
                    'none recorded; not zero payment proof'}
                </p>
                <p>
                  Ledger posting IDs:{' '}
                  {invoice.ledger.map((e) => e.id).join(', ') ||
                    'none recorded'}
                </p>
                {invoice.missing_evidence.map((text, i) => (
                  <p key={i}>{text}</p>
                ))}
              </section>
            ))}
            {view.invoices.length === 0 && (
              <p>
                No canonical invoice is available for the exact source. No
                invoice or debt is created.
              </p>
            )}
            <p>
              Unlinked event IDs:{' '}
              {view.unlinked_events.map((e) => e.id).join(', ') ||
                'none available'}
            </p>
            <p>
              Unlinked posting IDs:{' '}
              {view.unlinked_ledger.map((e) => e.id).join(', ') ||
                'none available'}
            </p>
          </details>
          {source && (
            <section
              className="recorded-cost-detail"
              aria-label="Inspected recorded cost requirement source"
            >
              <h4>{source.title}</h4>
              <p>
                {source.id} · {source.status}
              </p>
              <ul>
                {source.facts.map((fact, i) => (
                  <li key={i}>{fact}</li>
                ))}
              </ul>
              <button
                type="button"
                disabled={busy || !onContinue}
                onClick={() => void run(true)}
              >
                Open original exact cost review
              </button>
            </section>
          )}
        </>
      )}
    </section>
  );
}
