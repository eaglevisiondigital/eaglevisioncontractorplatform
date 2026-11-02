import { useEffect, useRef, useState } from 'react';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import { advancedHandoffKinds } from '../../lib/workflows/advanced-handoffs';
import { tradeEditions } from '../../lib/program/trade-editions';
import {
  addonReviewModes,
  readAddonReviewDesk,
  inspectAddonReviewSource,
  assertAddonReviewDetailCurrentNow,
  type AddonReviewDetail,
  type AddonReviewInput,
} from '../../lib/workflows/addon-review-desk';
import {
  readSourceBoundAddons,
  assertSourceBoundAddonsCurrentNow,
  reviewSourceBoundAddons,
  sourceBoundAddonsState,
  prepareSourceBoundAddons,
  cancelSourceBoundAddons,
  revokeSourceBoundAddons,
  inspectSourceBoundAddons,
  selectSourceBoundAddonJob,
  type SourceBoundAddonRead,
  type SourceBoundReviewConfirmation,
} from '../../lib/workflows/source-bound-addons';
import type {
  ExternalProposalView,
  ExternalProposalHandoff,
  ExternalProposalConfirmation,
} from '../../lib/workflows/external-proposal-lifecycle';
import './source-bound-addons.css';
export interface SourceBoundAddonEntryProps {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string) => void;
}
export interface SourceBoundAddonsProps extends Omit<
  SourceBoundAddonEntryProps,
  'selectedJobId'
> {
  selection: AddonReviewDetail;
}
function admitted(enabled: boolean) {
  return (
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: enabled ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    })
  );
}
export function SourceBoundAddonEntry({
  sources,
  enabled = false,
  selectedJobId,
  onSelectJob,
}: SourceBoundAddonEntryProps) {
  const allowed = admitted(enabled);
  let check: (() => void) | null = null;
  if (allowed)
    try {
      check = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      }).check;
    } catch {
      /* Withhold denied source. */
    }
  const [bound, setBound] = useState({
    sources,
    selectedJobId,
    allowed,
    check,
    generation: 0,
  });
  let stale = false;
  try {
    bound.check?.();
  } catch {
    stale = true;
  }
  if (
    bound.sources !== sources ||
    bound.selectedJobId !== selectedJobId ||
    bound.allowed !== allowed ||
    stale ||
    Boolean(bound.check) !== Boolean(check)
  ) {
    setBound({
      sources,
      selectedJobId,
      allowed,
      check,
      generation: bound.generation + 1,
    });
    return null;
  }
  return allowed && check ? (
    <Entry
      key={bound.generation}
      sources={sources}
      selectedJobId={selectedJobId}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="source-bound-addons"
      aria-label="Source-bound advanced entry"
    >
      <h2>Source-bound advanced entry</h2>
      <p>
        {allowed
          ? 'UNKNOWN — current authorized source is unavailable. Previous evidence is withheld.'
          : 'Source-bound advanced entry is off. Explicit development HTTP loopback admission is required.'}
      </p>
    </section>
  );
}
function Entry({
  sources,
  selectedJobId,
  onSelectJob,
}: SourceBoundAddonEntryProps) {
  const [input, setInput] = useState<AddonReviewInput>({
      query: '',
      job_id: selectedJobId ?? sources.entries[0].target.job_id!,
      kind: 'offline',
      edition: 'property_services',
    }),
    [selection, setSelection] = useState<AddonReviewDetail>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const gate = useRef({ enabled: true, confirmed: true }),
    active = useRef(true),
    generation = useRef({ value: 0 }),
    pending = useRef(false),
    original = useRef<AddonReviewInput | undefined>(undefined);
  useEffect(() => {
    const g = gate.current,
      sequence = generation.current;
    active.current = true;
    g.enabled = true;
    return () => {
      active.current = false;
      g.enabled = false;
      sequence.value++;
    };
  }, []);
  function change(value: AddonReviewInput) {
    if (original.current) original.current.query = '\u0000selection changed';
    generation.current.value++;
    setInput(value);
    setSelection(undefined);
    setError('');
  }
  async function inspect() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setSelection(undefined);
    setError('');
    const selected = { ...input },
      id = ++generation.current.value;
    original.current = selected;
    try {
      const view = await readAddonReviewDesk(sources, selected, gate.current);
      const row = view.rows.find((r) => r.reference.job_id === selected.job_id);
      if (!row) throw Error('Exact selected source unavailable');
      const detail = await inspectAddonReviewSource(view, row.reference);
      assertAddonReviewDetailCurrentNow(detail);
      if (active.current && id === generation.current.value)
        setSelection(detail);
    } catch {
      if (active.current && id === generation.current.value)
        setError(
          'UNKNOWN — the selected exact job, source or current access is unavailable. No fallback or proposal attempt.',
        );
    } finally {
      if (active.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <section
      className="source-bound-addons"
      aria-label="Source-bound advanced entry"
    >
      <header>
        <div>
          <h2>Advanced workflow handoff</h2>
          <p>
            Select the source once. Its exact job, mode and edition remain
            pinned in the review below.
          </p>
        </div>
        <span className="source-bound-addons-pill">Local review only</span>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void inspect();
        }}
      >
        <label>
          Advanced handoff job
          <select
            value={input.job_id}
            disabled={busy}
            onChange={(e) => change({ ...input, job_id: e.target.value })}
          >
            {sources.entries.map((e) => (
              <option value={e.target.job_id!} key={e.target.job_id}>
                Job {e.target.job_id} · property {e.target.location_id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Advanced handoff mode
          <select
            value={input.kind}
            disabled={busy}
            onChange={(e) =>
              change({
                ...input,
                kind: e.target.value as AddonReviewInput['kind'],
              })
            }
          >
            {advancedHandoffKinds.map((kind) => (
              <option key={kind} value={kind}>
                {addonReviewModes[kind]}
              </option>
            ))}
          </select>
        </label>
        {input.kind === 'trade' && (
          <label>
            Advanced handoff edition context
            <select
              value={input.edition}
              disabled={busy}
              onChange={(e) =>
                change({
                  ...input,
                  edition: e.target.value as AddonReviewInput['edition'],
                })
              }
            >
              {tradeEditions.map((edition) => (
                <option value={edition} key={edition}>
                  {edition}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" disabled={busy}>
          Inspect selected advanced source
        </button>
      </form>
      {busy && <p role="status">Inspecting the exact selected source…</p>}
      {error && <p role="alert">{error}</p>}
      {selection && (
        <SourceBoundAddons
          sources={sources}
          selection={selection}
          enabled
          onSelectJob={onSelectJob}
        />
      )}
    </section>
  );
}
export function SourceBoundAddons({
  sources,
  selection,
  enabled = false,
  onSelectJob,
}: SourceBoundAddonsProps) {
  const allowed = admitted(enabled);
  let check: (() => void) | null = null;
  if (allowed)
    try {
      const capture = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      });
      assertAddonReviewDetailCurrentNow(selection);
      check = () => {
        capture.check();
        assertAddonReviewDetailCurrentNow(selection);
      };
    } catch {
      /* Do not render denied selection. */
    }
  const [bound, setBound] = useState({
    sources,
    selection,
    allowed,
    check,
    generation: 0,
  });
  let stale = false;
  try {
    bound.check?.();
  } catch {
    stale = true;
  }
  if (
    bound.sources !== sources ||
    bound.selection !== selection ||
    bound.allowed !== allowed ||
    stale ||
    Boolean(bound.check) !== Boolean(check)
  ) {
    setBound({
      sources,
      selection,
      allowed,
      check,
      generation: bound.generation + 1,
    });
    return null;
  }
  return allowed && check ? (
    <Pinned
      key={bound.generation}
      sources={sources}
      selection={selection}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="source-bound-addons"
      aria-label="Pinned advanced workflow"
    >
      <h3>Pinned advanced workflow</h3>
      <p>
        {allowed
          ? 'UNKNOWN — current exact selection is unavailable. Previous evidence is withheld.'
          : 'Pinned advanced workflow is off. Explicit development HTTP loopback admission is required.'}
      </p>
    </section>
  );
}
function milliseconds(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    ? Date.parse(`${value}:00Z`)
    : NaN;
}
function Pinned({ sources, selection, onSelectJob }: SourceBoundAddonsProps) {
  const [read, setRead] = useState<SourceBoundAddonRead>(),
    [view, setView] = useState<ExternalProposalView>(),
    [packet, setPacket] = useState<ExternalProposalHandoff>(),
    [label, setLabel] = useState('pinned-review-001'),
    [now, setNow] = useState('2026-12-28T09:00'),
    [expires, setExpires] = useState('2026-12-28T10:00'),
    [reviewConfirmed, setReviewConfirmed] = useState(false),
    [prepareConfirmed, setPrepareConfirmed] = useState(false),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [attempted, setAttempted] = useState(false),
    [status, setStatus] = useState('Validating pinned source');
  const gate = useRef({ enabled: true, confirmed: true }),
    active = useRef(true),
    operation = useRef({ value: 0 }),
    pending = useRef(false),
    clock = useRef({ now_ms: milliseconds('2026-12-28T09:00') }),
    reviewInput = useRef<SourceBoundReviewConfirmation | undefined>(undefined),
    prepareInput = useRef<ExternalProposalConfirmation | undefined>(undefined),
    sourceHeading = useRef<HTMLHeadingElement>(null),
    reviewHeading = useRef<HTMLHeadingElement>(null),
    packetHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const g = gate.current,
      sequence = operation.current;
    active.current = true;
    g.enabled = true;
    const id = ++operation.current.value;
    void readSourceBoundAddons(sources, selection, g)
      .then((value) => {
        if (active.current && id === operation.current.value) {
          assertSourceBoundAddonsCurrentNow(value);
          setRead(value);
          setBusy(false);
          setStatus('PINNED_NOT_REVIEWED');
        }
      })
      .catch(() => {
        if (active.current && id === operation.current.value) {
          setError(
            'UNKNOWN — the inspected source pin changed or access was denied. No attempt was started.',
          );
          setBusy(false);
        }
      });
    return () => {
      active.current = false;
      g.enabled = false;
      sequence.value++;
      if (reviewInput.current) reviewInput.current.confirmed = false;
      if (prepareInput.current) prepareInput.current.confirmed = false;
    };
  }, [sources, selection]);
  useEffect(() => {
    if (packet) packetHeading.current?.focus();
    else if (view) reviewHeading.current?.focus();
    else if (read) sourceHeading.current?.focus();
  }, [read, view, packet]);
  async function task<T>(run: () => Promise<T>, apply: (value: T) => void) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const id = ++operation.current.value;
    try {
      const value = await run();
      if (active.current && id === operation.current.value) apply(value);
    } catch {
      if (active.current && id === operation.current.value) {
        setError(
          'UNKNOWN or terminal original review — no retry, renewal, reset or replacement. Use exact retained review inspection.',
        );
        setStatus('UNKNOWN');
        setPacket(undefined);
      }
    } finally {
      if (active.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  function review() {
    if (!read || !reviewConfirmed || view || busy) return;
    clock.current.now_ms = milliseconds(now);
    const input = {
      confirmed: reviewConfirmed,
      reviewed_source_sha256: read.integrity.sha256,
      external_reference: label,
      review_expires_at_ms: milliseconds(expires),
    };
    setAttempted(true);
    reviewInput.current = input;
    void task(
      () => reviewSourceBoundAddons(read, input, clock.current),
      (value) => {
        setView(value);
        setStatus(sourceBoundAddonsState(read).status);
        setPrepareConfirmed(false);
      },
    );
  }
  function prepare() {
    if (!read || !view || !prepareConfirmed || busy) return;
    const input = {
      confirmed: prepareConfirmed,
      reviewed_lifecycle_sha256: view.integrity.sha256,
    };
    prepareInput.current = input;
    void task(
      () => prepareSourceBoundAddons(read, input),
      (value) => {
        setPacket(value);
        setStatus(sourceBoundAddonsState(read).status);
      },
    );
  }
  function stop(kind: 'cancel' | 'revoke') {
    if (!read || !view || !prepareConfirmed || busy) return;
    try {
      const input = {
        confirmed: true,
        reviewed_lifecycle_sha256: view.integrity.sha256,
      };
      setStatus(
        (kind === 'cancel'
          ? cancelSourceBoundAddons(read, input)
          : revokeSourceBoundAddons(read, input)
        ).status,
      );
    } catch {
      setError(
        'UNKNOWN or terminal original review cannot be changed or replaced.',
      );
    }
  }
  function advance() {
    if (!read || !view || busy) return;
    clock.current.now_ms = milliseconds(now);
    try {
      setStatus(sourceBoundAddonsState(read).status);
    } catch {
      setStatus('UNKNOWN');
      setPacket(undefined);
      setError(
        'UNKNOWN — clock rollback or invalid time cannot renew this review.',
      );
    }
  }
  function inspect() {
    if (!read || busy) return;
    void task(
      () => inspectSourceBoundAddons(read),
      (value) => setStatus(value.status),
    );
  }
  function navigate() {
    if (!read || busy) return;
    try {
      onSelectJob?.(selectSourceBoundAddonJob(read));
    } catch {
      setError('UNKNOWN — exact pinned job navigation is unavailable.');
    }
  }
  let current = true,
    state: ReturnType<typeof sourceBoundAddonsState> | undefined;
  try {
    if (read) {
      assertSourceBoundAddonsCurrentNow(read);
      state = sourceBoundAddonsState(read);
    }
  } catch {
    current = false;
  }
  const canPrepare = current && state?.status === 'REVIEWED',
    canStop =
      current &&
      state &&
      ['REVIEWED', 'QUARANTINED', 'PENDING', 'PREPARED'].includes(state.status),
    locked = Boolean(view) || attempted;
  return (
    <section
      className="source-bound-addons"
      aria-label="Pinned advanced workflow"
      aria-busy={busy}
    >
      <header>
        <div>
          <h3 tabIndex={-1} ref={sourceHeading}>
            Pinned advanced workflow
          </h3>
          <p>
            Continue with the inspected source. Job, mode, edition and
            references are fixed; no second selection or source-copy step.
          </p>
        </div>
        <span className="source-bound-addons-pill">
          Original lifecycle controls
        </span>
      </header>
      {busy && (
        <p role="status">
          Checking pinned sources and original review evidence…
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {!current && (
        <p role="alert">
          UNKNOWN — the exact source, confirmation or original lifecycle is
          unavailable. Previous evidence is withheld.
        </p>
      )}
      {read && current && (
        <>
          <h4>
            {addonReviewModes[read.source.kind]} · {read.job_label}
          </h4>
          <p>
            {read.company.name} · {read.customer_label} · {read.property_label}
          </p>
          <dl>
            <dt>Fixed company / customer / property</dt>
            <dd>
              {read.source.organization_id} / {read.source.customer_id} /{' '}
              {read.source.location_id}
            </dd>
            <dt>Fixed job / estimate / issued version / lock revision</dt>
            <dd>
              {read.source.job_id} / {read.source.estimate_id} /{' '}
              {read.source.issued_version_id} /{' '}
              {read.source.saved_lock_revision}
            </dd>
            <dt>Canonical source SHA-256</dt>
            <dd>{read.source.source_sha256}</dd>
            <dt>Original report / published version</dt>
            <dd>
              {read.report.report_id} / {read.report.published_version}
            </dd>
            <dt>Fixed edition context / recorded industry</dt>
            <dd>
              {read.edition.human_selected_review_context} /{' '}
              {read.edition.company_industry}
            </dd>
          </dl>
          <div
            className="source-bound-addons-evidence"
            role="region"
            tabIndex={0}
            aria-label="Pinned original workflow references"
          >
            <dl>
              {Object.entries(read.references.workflow).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value ?? 'UNKNOWN'}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ul>
            {read.requirements.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
          <p>
            Catalog relationship: {read.catalog_links.state}. Physical
            completion, provider, consent, catalog/bid, storm/network and
            accounting acceptance remain UNKNOWN or unverified.
          </p>
          <fieldset disabled={busy || locked}>
            <legend>Explicit original review</legend>
            <label>
              Bound review label
              <input
                maxLength={80}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <label>
              Synthetic review expiry UTC
              <input
                type="datetime-local"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </label>
            <label className="source-bound-addons-check">
              <input
                type="checkbox"
                checked={reviewConfirmed}
                onChange={(e) => {
                  setReviewConfirmed(e.target.checked);
                  if (reviewInput.current)
                    reviewInput.current.confirmed = e.target.checked;
                }}
              />
              I reviewed this exact pinned source and set its fixed local review
              expiry.
            </label>
            <button
              type="button"
              disabled={busy || locked || !reviewConfirmed}
              onClick={review}
            >
              Review pinned source
            </button>
          </fieldset>
          <label>
            Synthetic review time UTC
            <input
              type="datetime-local"
              value={now}
              disabled={busy}
              onChange={(e) => setNow(e.target.value)}
            />
          </label>
          {view && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={advance}
            >
              Apply pinned synthetic review time
            </button>
          )}
          {view && (
            <article>
              <h4 tabIndex={-1} ref={reviewHeading}>
                Original pinned-source comparison
              </h4>
              <p>
                {view.reference_status} · {state?.status ?? status}
              </p>
              <p>Original lifecycle SHA-256: {view.integrity.sha256}</p>
              <p>
                {view.comparison.differences.length} original source fields and{' '}
                {view.workflow_differences.length} workflow fields compared by
                the unchanged original engine. Exact comparison grants no
                operational authority.
              </p>
              <label className="source-bound-addons-check">
                <input
                  type="checkbox"
                  checked={prepareConfirmed}
                  disabled={busy}
                  onChange={(e) => {
                    setPrepareConfirmed(e.target.checked);
                    if (prepareInput.current)
                      prepareInput.current.confirmed = e.target.checked;
                  }}
                />
                I confirm this exact original comparison for the selected local
                control.
              </label>
              <div className="source-bound-addons-actions">
                <button
                  type="button"
                  disabled={busy || !prepareConfirmed || !canPrepare}
                  onClick={prepare}
                >
                  Prepare original pinned handoff
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || !prepareConfirmed || !canStop}
                  onClick={() => stop('cancel')}
                >
                  Cancel pinned review
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || !prepareConfirmed || !canStop}
                  onClick={() => stop('revoke')}
                >
                  Revoke pinned review
                </button>
              </div>
            </article>
          )}
          {packet && (
            <article>
              <h4 tabIndex={-1} ref={packetHeading}>
                Original pinned handoff evidence
              </h4>
              <p>{packet.delivery} · operational ready: false</p>
              <p>
                Original canonical engine:{' '}
                {
                  packet.original_handoff.existing_handoff.canonical_reference
                    .engine
                }
              </p>
              <dl>
                {packet.original_handoff.existing_handoff.evidence.facts.map(
                  (fact, index) => (
                    <div key={`${fact.label}:${index}`}>
                      <dt>{fact.label}</dt>
                      <dd>
                        {fact.value === null ? 'UNKNOWN' : String(fact.value)}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
              <ul>
                {packet.original_handoff.existing_handoff.evidence.clauses.map(
                  (clause, index) => (
                    <li key={index}>
                      {String(clause.literal)} · {String(clause.warning)}
                    </li>
                  ),
                )}
              </ul>
            </article>
          )}
          {onSelectJob && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={navigate}
            >
              Open pinned existing job {read.job_label}
            </button>
          )}
        </>
      )}
      {read && (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={inspect}
        >
          Inspect exact retained pinned review
        </button>
      )}
      <p role="status">Original review status: {status}</p>
      <footer>
        Same-tab synthetic review only. No import, sync, dispatch, call,
        message, order, payment, physical verification or hosted authority.
        Expired, cancelled, revoked and UNKNOWN original holds cannot be reset
        by another entry or selection.
      </footer>
    </section>
  );
}
