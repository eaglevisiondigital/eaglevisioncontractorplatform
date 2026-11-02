import { useEffect, useRef, useState } from 'react';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  advancedHandoffKinds,
  type AdvancedHandoffInput,
  type AdvancedRequirements,
} from '../../lib/workflows/advanced-handoffs';
import type { SyncSourceReference } from '../../lib/workflows/sync-admission-review';
import { tradeEditions } from '../../lib/program/trade-editions';
import {
  readExternalProposalSource,
  externalProposalReferences,
  reviewExternalProposalLifecycle,
  externalProposalState,
  cancelExternalProposal,
  revokeExternalProposal,
  prepareExternalProposalHandoff,
  inspectExternalProposalLifecycle,
  selectExternalProposalJob,
  type ExternalWorkflowReference,
  type ExternalProposalInput,
  type ExternalProposalView,
  type ExternalProposalHandoff,
  type ExternalProposalConfirmation,
} from '../../lib/workflows/external-proposal-lifecycle';
import './external-proposal-lifecycle.css';

export interface ExternalProposalLifecycleProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
const modes = {
  offline: 'Offline field operations',
  voice: 'Voice-to-Estimate',
  receptionist: 'AI receptionist',
  storm_network: 'Storm Mode and Contractor Network',
  accounting: 'Accounting requirements',
  procurement: 'Procurement requirements',
  trade: 'Trade edition context',
} as const;
const sourceLabels = {
  organization_id: 'Company reference',
  customer_id: 'Customer reference',
  location_id: 'Property reference',
  job_id: 'Job reference',
  estimate_id: 'Estimate reference',
  issued_version_id: 'Issued version reference',
  source_sha256: 'Canonical source SHA-256',
  saved_lock_revision: 'Saved lock revision',
} as const;
const workflowLabels = {
  plan_id: 'Plan reference',
  plan_revision: 'Plan revision',
  scheduled_visit_id: 'Scheduled visit reference',
  scheduled_visit_revision: 'Scheduled visit revision',
  published_visit_id: 'Published visit reference',
  published_visit_revision: 'Published visit revision',
} as const;
const emptySource = (): SyncSourceReference => ({
  organization_id: null,
  customer_id: null,
  location_id: null,
  job_id: null,
  estimate_id: null,
  issued_version_id: null,
  source_sha256: null,
  saved_lock_revision: null,
});
const emptyWorkflow = (): ExternalWorkflowReference => ({
  plan_id: null,
  plan_revision: null,
  scheduled_visit_id: null,
  scheduled_visit_revision: null,
  published_visit_id: null,
  published_visit_revision: null,
});
function syntheticMs(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    ? Date.parse(`${value}:00Z`)
    : NaN;
}
export function ExternalProposalLifecycle({
  sources,
  enabled = false,
  onSelectJob,
}: ExternalProposalLifecycleProps) {
  const admitted =
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: enabled ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    });
  let check: (() => void) | null = null;
  if (admitted)
    try {
      check = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      }).check;
    } catch {
      /* Denied source stays withheld. */
    }
  const [binding, bind] = useState({ sources, admitted, check, generation: 0 });
  let stale = false;
  try {
    binding.check?.();
  } catch {
    stale = true;
  }
  if (
    binding.sources !== sources ||
    binding.admitted !== admitted ||
    stale ||
    Boolean(binding.check) !== Boolean(check)
  ) {
    bind({ sources, admitted, check, generation: binding.generation + 1 });
    return null;
  }
  return admitted && check ? (
    <Proposal
      key={binding.generation}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="external-proposal-lifecycle"
      aria-label="External proposal lifecycle"
    >
      <h2>External proposal lifecycle</h2>
      <p>
        {admitted
          ? 'UNKNOWN — current authorized sources are unavailable. Previous evidence is withheld.'
          : 'External proposal lifecycle is off. Explicit development HTTP loopback admission is required.'}
      </p>
    </section>
  );
}
function Proposal({ sources, onSelectJob }: ExternalProposalLifecycleProps) {
  const [job, setJob] = useState(sources.entries[0].target.job_id!),
    [kind, setKind] = useState<AdvancedHandoffInput['kind']>('offline'),
    [note, setNote] = useState(
      'Review this exact source; no external action is authorized.',
    ),
    [edition, setEdition] =
      useState<AdvancedHandoffInput['edition']>('property_services'),
    [source, setSource] = useState<AdvancedRequirements>(),
    [label, setLabel] = useState('local-proposal-001'),
    [reference, setReference] = useState<SyncSourceReference>(emptySource),
    [workflow, setWorkflow] =
      useState<ExternalWorkflowReference>(emptyWorkflow),
    [now, setNow] = useState('2026-12-28T09:00'),
    [expires, setExpires] = useState('2026-12-28T10:00'),
    [expiryConfirmed, setExpiryConfirmed] = useState(false),
    [view, setView] = useState<ExternalProposalView>(),
    [packet, setPacket] = useState<ExternalProposalHandoff>(),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>(),
    [status, setStatus] = useState('No local proposal review started');
  const life = useRef({ active: true }),
    gate = useRef({ enabled: true, confirmed: true }),
    pending = useRef(false),
    operation = useRef(0),
    original = useRef<AdvancedHandoffInput | undefined>(undefined),
    proposal = useRef<ExternalProposalInput | undefined>(undefined),
    clock = useRef({ now_ms: syntheticMs('2026-12-28T09:00') }),
    confirmation = useRef<ExternalProposalConfirmation | undefined>(undefined),
    sourceHeading = useRef<HTMLHeadingElement>(null),
    resultHeading = useRef<HTMLHeadingElement>(null),
    handoffHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const l = life.current,
      g = gate.current;
    l.active = true;
    g.enabled = true;
    return () => {
      l.active = false;
      g.enabled = false;
      if (confirmation.current) confirmation.current.confirmed = false;
    };
  }, []);
  useEffect(() => {
    if (packet) handoffHeading.current?.focus();
    else if (view) resultHeading.current?.focus();
    else if (source) sourceHeading.current?.focus();
  }, [source, view, packet]);
  function invalidate() {
    if (original.current) original.current.note = '';
    if (confirmation.current) confirmation.current.confirmed = false;
    operation.current++;
    setSource(undefined);
    setView(undefined);
    setPacket(undefined);
    setConfirmed(false);
    setExpiryConfirmed(false);
    setReference(emptySource());
    setWorkflow(emptyWorkflow());
    setError(undefined);
    setStatus(
      'Previous view withdrawn; existing lifecycle holds are not reset.',
    );
  }
  async function task<T>(read: () => Promise<T>, apply: (v: T) => void) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    const id = ++operation.current;
    try {
      const value = await read();
      if (life.current.active && id === operation.current) apply(value);
    } catch {
      if (life.current.active && id === operation.current) {
        setPacket(undefined);
        setError(
          'UNKNOWN or terminal review — exact sources, expiry, confirmation or original preparation are unavailable. No retry, renewal or replacement was performed.',
        );
      }
    } finally {
      if (life.current.active) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  function load() {
    if (pending.current) return;
    invalidate();
    const input: AdvancedHandoffInput = {
      job_id: job,
      kind,
      note,
      review_on: '2026-12-28',
      manual_priority: 'normal',
      edition,
    };
    original.current = input;
    void task(
      () => readExternalProposalSource(sources, input, gate.current),
      (v) => {
        externalProposalReferences(v);
        setSource(v);
        setStatus('Exact source read; proposal review not started.');
      },
    );
  }
  function copy() {
    if (!source || busy || view) return;
    try {
      const refs = externalProposalReferences(source);
      setReference(refs.source);
      setWorkflow(refs.workflow);
    } catch {
      setSource(undefined);
      setError('UNKNOWN — exact original references are unavailable.');
    }
  }
  function review() {
    if (!source || pending.current || view || !expiryConfirmed) return;
    const input: ExternalProposalInput = {
      proposal: { external_reference: label, source: { ...reference } },
      workflow: { ...workflow },
      review_expires_at_ms: syntheticMs(expires),
    };
    proposal.current = input;
    clock.current.now_ms = syntheticMs(now);
    void task(
      () => reviewExternalProposalLifecycle(source, input, clock.current),
      (v) => {
        setStatus(externalProposalState(v).status);
        setView(v);
        setConfirmed(false);
      },
    );
  }
  function advance() {
    if (!view) return;
    clock.current.now_ms = syntheticMs(now);
    try {
      setStatus(externalProposalState(view).status);
    } catch {
      setPacket(undefined);
      setStatus('UNKNOWN');
      setError(
        'UNKNOWN — synthetic clock rollback or invalid time cannot renew a review.',
      );
    }
  }
  function stop(action: 'cancel' | 'revoke') {
    if (!view || !confirmed) return;
    try {
      const c = {
        confirmed: true,
        reviewed_lifecycle_sha256: view.integrity.sha256,
      };
      setStatus(
        (action === 'cancel'
          ? cancelExternalProposal(view, c)
          : revokeExternalProposal(view, c)
        ).status,
      );
    } catch {
      setError('Terminal or UNKNOWN review cannot be renewed or replaced.');
    }
  }
  function prepare() {
    if (!view || !confirmed || pending.current) return;
    const c = { confirmed, reviewed_lifecycle_sha256: view.integrity.sha256 };
    confirmation.current = c;
    void task(
      () => prepareExternalProposalHandoff(view, c),
      (v) => {
        setStatus(externalProposalState(view).status);
        setPacket(v);
      },
    );
  }
  function navigate() {
    if (!view || busy) return;
    try {
      onSelectJob?.(selectExternalProposalJob(view));
    } catch {
      setPacket(undefined);
      setError('UNKNOWN — exact original job navigation is unavailable.');
    }
  }
  let current = true,
    state: ReturnType<typeof externalProposalState> | undefined;
  try {
    if (source) externalProposalReferences(source);
    if (view) state = externalProposalState(view);
  } catch {
    current = false;
  }
  const canStop =
      current &&
      state &&
      ['REVIEWED', 'QUARANTINED', 'PENDING', 'PREPARED'].includes(state.status),
    canPrepare = current && state?.status === 'REVIEWED',
    locked = Boolean(view);
  return (
    <section
      className="external-proposal-lifecycle"
      aria-label="External proposal lifecycle"
    >
      <header>
        <div>
          <span className="external-proposal-lifecycle-eyebrow">
            Advanced reviews · same-tab control
          </span>
          <h2>External proposal lifecycle</h2>
          <p>
            Compare exact existing sources, set one local review expiry and
            separately delegate to the original review-only handoff.
          </p>
        </div>
        <span className="external-proposal-lifecycle-pill">
          No operational authority
        </span>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <label>
          Proposal source job
          <select
            value={job}
            disabled={busy}
            onChange={(e) => {
              invalidate();
              setJob(e.target.value);
            }}
          >
            {sources.entries.map((e) => (
              <option key={e.target.job_id} value={e.target.job_id!}>
                Job {e.target.job_id} · property {e.target.location_id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Proposal review mode
          <select
            value={kind}
            disabled={busy}
            onChange={(e) => {
              invalidate();
              setKind(e.target.value as AdvancedHandoffInput['kind']);
            }}
          >
            {advancedHandoffKinds.map((k) => (
              <option key={k} value={k}>
                {modes[k]}
              </option>
            ))}
          </select>
        </label>
        {kind === 'trade' && (
          <label>
            Human-selected trade edition
            <select
              value={edition}
              disabled={busy}
              onChange={(e) => {
                invalidate();
                setEdition(e.target.value as AdvancedHandoffInput['edition']);
              }}
            >
              {tradeEditions.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Literal staff review note
          <textarea
            maxLength={1000}
            value={note}
            disabled={busy}
            onChange={(e) => {
              invalidate();
              setNote(e.target.value);
            }}
          />
        </label>
        <button type="submit" disabled={busy}>
          Read exact proposal source
        </button>
      </form>
      {busy && (
        <p role="status">
          Checking original sources and retained review controls…
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {!current && (
        <p role="alert">
          UNKNOWN — original source, proposal, confirmation or clock changed.
          Prior evidence is withheld. A new view, label or deadline cannot reset
          the hold.
        </p>
      )}
      {current && source && (
        <section
          className="external-proposal-lifecycle-card"
          aria-label="Exact external proposal source"
        >
          <h3 ref={sourceHeading} tabIndex={-1}>
            Exact source and missing requirements
          </h3>
          <p>
            {source.company.name} · {modes[source.kind]}
          </p>
          <dl>
            <dt>Original job / issued version</dt>
            <dd>
              {source.source.job_id} · {source.source.issued_version_id}
            </dd>
            <dt>Exact source SHA-256 / saved lock revision</dt>
            <dd>
              {source.source.source_sha256} · revision{' '}
              {source.source.saved_lock_revision}
            </dd>
            <dt>Original recorded report / published version</dt>
            <dd>
              {source.source.report_id} · version{' '}
              {source.source.published_version}
            </dd>
          </dl>
          <ul>
            {source.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
          <p>
            Catalog relationship: {source.catalog_links.state}. Existing engine
            attempt: {source.prior_attempt}.
          </p>
          <p>
            Current consent, availability, original invoice/contract mapping,
            supplier bids, physical conditions and licensing remain UNKNOWN or
            unverified. Mode selection creates no missing evidence.
          </p>
          <button
            type="button"
            className="secondary"
            disabled={busy || locked}
            onClick={copy}
          >
            Use exact source references
          </button>
          <fieldset disabled={busy || locked}>
            <legend>Untrusted human proposal · no imported content</legend>
            <label>
              External proposal label
              <input
                value={label}
                maxLength={80}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <div className="external-proposal-lifecycle-grid">
              {(Object.keys(sourceLabels) as (keyof SyncSourceReference)[]).map(
                (key) => (
                  <label key={key}>
                    {sourceLabels[key]}
                    <input
                      value={reference[key] ?? ''}
                      maxLength={200}
                      type={key === 'saved_lock_revision' ? 'number' : 'text'}
                      min={key === 'saved_lock_revision' ? 0 : undefined}
                      step={key === 'saved_lock_revision' ? 1 : undefined}
                      onChange={(e) =>
                        setReference({
                          ...reference,
                          [key]:
                            e.target.value === ''
                              ? null
                              : key === 'saved_lock_revision'
                                ? Number(e.target.value)
                                : e.target.value,
                        })
                      }
                    />
                  </label>
                ),
              )}
            </div>
            <div className="external-proposal-lifecycle-grid">
              {(
                Object.keys(
                  workflowLabels,
                ) as (keyof ExternalWorkflowReference)[]
              ).map((key) => (
                <label key={key}>
                  {workflowLabels[key]}
                  <input
                    value={workflow[key] ?? ''}
                    maxLength={200}
                    type={key.endsWith('_revision') ? 'number' : 'text'}
                    min={key.endsWith('_revision') ? 0 : undefined}
                    step={key.endsWith('_revision') ? 1 : undefined}
                    onChange={(e) =>
                      setWorkflow({
                        ...workflow,
                        [key]:
                          e.target.value === ''
                            ? null
                            : key.endsWith('_revision')
                              ? Number(e.target.value)
                              : e.target.value,
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <label>
              Reviewer-set local review expiry (UTC)
              <input
                type="datetime-local"
                value={expires}
                onChange={(e) => {
                  setExpiryConfirmed(false);
                  setExpires(e.target.value);
                }}
              />
            </label>
          </fieldset>
          <label>
            Proposed synthetic review clock (UTC)
            <input
              type="datetime-local"
              value={now}
              disabled={busy && !view}
              onChange={(e) => {
                if (!view) setExpiryConfirmed(false);
                setNow(e.target.value);
              }}
            />
          </label>
          <p className="external-proposal-lifecycle-notice">
            This explicitly supplied synthetic test clock is not genuine
            operational time or an expiry guarantee. The reviewer deadline is
            fixed within24 hours; rollback never renews authority. No automatic
            clock or background execution.
          </p>
          {!view && (
            <>
              <label className="external-proposal-lifecycle-check">
                <input
                  type="checkbox"
                  checked={expiryConfirmed}
                  disabled={busy}
                  onChange={(e) => setExpiryConfirmed(e.target.checked)}
                />
                I set this local review expiry against the synthetic clock.
              </label>
              <button
                type="button"
                disabled={busy || !expiryConfirmed}
                onClick={review}
              >
                Review controlled proposal
              </button>
            </>
          )}
          {view && (
            <button type="button" className="secondary" onClick={advance}>
              Apply synthetic review time
            </button>
          )}
        </section>
      )}
      {current && view && state && (
        <section
          className="external-proposal-lifecycle-card"
          aria-label="Retained external proposal comparison"
        >
          <h3 ref={resultHeading} tabIndex={-1}>
            Retained proposal lifecycle comparison
          </h3>
          <p role="status">
            Local lifecycle: {state.status} · {view.reference_status}
          </p>
          <p>
            {view.comparison.external_reference} · original comparison{' '}
            {view.comparison.integrity.sha256}
          </p>
          <p>
            Fixed reviewer expiry:{' '}
            {new Date(view.review_expires_at_ms).toISOString()} · observed
            synthetic time: {new Date(state.synthetic_now_ms).toISOString()}
          </p>
          <div
            role="region"
            tabIndex={0}
            aria-label="Exact source and workflow revision differences"
            className="external-proposal-lifecycle-table"
          >
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Expected existing source</th>
                  <th>Human proposal</th>
                  <th>Comparison</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...view.comparison.differences,
                  ...view.workflow_differences,
                ].map((d) => (
                  <tr key={d.field}>
                    <th>{d.field}</th>
                    <td>{d.expected ?? 'MISSING'}</td>
                    <td>{d.proposed ?? 'MISSING'}</td>
                    <td>{d.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Missing, foreign, conflicting and multi-target references remain
            quarantined. Exact matching is source comparison only; no import,
            synchronization or execution permission.
          </p>
          <h4>Immutable prior review evidence</h4>
          <ol>
            {state.events.map((e, i) => (
              <li key={i}>
                {e.status} · synthetic{' '}
                {new Date(e.synthetic_at_ms).toISOString()} · {e.meaning}
              </li>
            ))}
          </ol>
          <label className="external-proposal-lifecycle-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => {
                if (confirmation.current)
                  confirmation.current.confirmed = e.target.checked;
                setConfirmed(e.target.checked);
              }}
            />
            I confirm this exact local lifecycle action.
          </label>
          <div className="external-proposal-lifecycle-actions">
            <button
              type="button"
              disabled={busy || !confirmed || !canPrepare}
              onClick={prepare}
            >
              Prepare original review handoff
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!confirmed || !canStop}
              onClick={() => stop('cancel')}
            >
              Cancel local proposal
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!confirmed || !canStop}
              onClick={() => stop('revoke')}
            >
              Revoke local proposal
            </button>
          </div>
          <p>
            Cancellation or revocation withdraws this local review only. It does
            not undo original records or reset original C11/C10 preparation
            holds.
          </p>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() =>
              void task(
                () => inspectExternalProposalLifecycle(view),
                (v) => setStatus(v.status),
              )
            }
          >
            Inspect retained original evidence
          </button>
          <p role="status">{status}</p>
          <button
            type="button"
            className="secondary"
            disabled={busy || !onSelectJob}
            onClick={navigate}
          >
            Display existing exact job workflow
          </button>
        </section>
      )}
      {current && view && packet && (
        <section
          className="external-proposal-lifecycle-card"
          aria-label="Original existing review handoff evidence"
        >
          <h3 tabIndex={-1} ref={handoffHeading}>
            Original review-only handoff evidence
          </h3>
          <p>
            Original C11 hash {packet.original_handoff.integrity.sha256} ·
            original engine{' '}
            {
              packet.original_handoff.existing_handoff.canonical_reference
                .engine
            }
          </p>
          <p>
            Current lifecycle: {state?.status}. Prior immutable evidence does
            not renew authority.
          </p>
          <dl>
            {packet.original_handoff.existing_handoff.evidence.facts.map(
              (f, i) => (
                <div key={i}>
                  <dt>{f.label}</dt>
                  <dd>
                    {f.value === null
                      ? 'UNKNOWN / unavailable'
                      : String(f.value)}
                  </dd>
                </div>
              ),
            )}
          </dl>
          {packet.original_handoff.existing_handoff.evidence.clauses.map(
            (c, i) => (
              <article key={i}>
                <p>Literal typed text: {String(c.literal)}</p>
                <p>Warning: {String(c.warning)}</p>
                <p>Staff suggestion: {String(c.suggestion)}</p>
              </article>
            ),
          )}
          {packet.original_handoff.existing_handoff.evidence.checklist.map(
            (c, i) => (
              <p key={i}>
                {String(c.section)} · {String(c.prompt)} · {String(c.status)}
              </p>
            ),
          )}
          <p>
            No import, sync, save, recipient, provider, purchase, dispatch,
            message, contract, financial or hosted action. Operational readiness
            remains false.
          </p>
        </section>
      )}
      <footer>
        Same-tab review controls only; no durable custody, genuine
        authentication, operational expiry or connected capability. Voice
        remains literal typed text; no microphone/model/recipient/callback
        executes. All seven original engines and independent release gates
        remain intact. Release1.0 NOT READY / NOT AUTHORIZED.
      </footer>
    </section>
  );
}
