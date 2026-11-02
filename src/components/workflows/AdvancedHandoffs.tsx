import { useEffect, useRef, useState } from 'react';
import {
  tradeEditions,
  type TradeEdition,
} from '../../lib/program/trade-editions';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  advancedHandoffKinds,
  assertAdvancedHandoffCurrentNow,
  assertAdvancedRequirementsCurrentNow,
  prepareAdvancedHandoff,
  readAdvancedHandoffRequirements,
  reconcileAdvancedHandoff,
  type AdvancedHandoff,
  type AdvancedHandoffConfirmation,
  type AdvancedHandoffInput,
  type AdvancedRequirements,
} from '../../lib/workflows/advanced-handoffs';
import './advanced-handoffs.css';
export interface AdvancedHandoffsProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
const labels = {
  offline: 'Offline field review',
  voice: 'Voice-to-Estimate literal review',
  receptionist: 'AI receptionist review',
  storm_network: 'Storm Mode and Contractor Network',
  accounting: 'Accounting requirements review',
  procurement: 'Procurement source review',
  trade: 'Trade edition context',
} as const;
export function AdvancedHandoffs({
  sources,
  enabled = false,
  onSelectJob,
}: AdvancedHandoffsProps) {
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
      /* Unavailable sources never reach presentation reads. */
    }
  const [binding, bind] = useState({ sources, admitted, check, generation: 0 });
  let changed = false;
  try {
    binding.check?.();
  } catch {
    changed = true;
  }
  if (
    binding.sources !== sources ||
    binding.admitted !== admitted ||
    changed ||
    Boolean(binding.check) !== Boolean(check)
  ) {
    bind({ sources, admitted, check, generation: binding.generation + 1 });
    return null;
  }
  return admitted && check ? (
    <Handoffs
      key={binding.generation}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="advanced-handoffs"
      aria-label="Advanced review handoff preparation"
    >
      <h2>Prepare a source-bound review handoff</h2>
      <p>
        {admitted
          ? 'Current authorized sources are unavailable. Previous advanced evidence is withheld.'
          : 'Advanced handoff review is off. Explicit local source confirmation is required.'}
      </p>
    </section>
  );
}
const display = (value: string | number | boolean | null) =>
  value === null ? 'Not recorded' : String(value);
function Handoffs({ sources, onSelectJob }: AdvancedHandoffsProps) {
  const [jobId, setJobId] = useState(sources.entries[0].target.job_id!),
    [kind, setKind] = useState<AdvancedHandoffInput['kind']>('offline'),
    [note, setNote] = useState(
      'Review this exact source; no operational action is authorized.',
    ),
    [reviewOn, setReviewOn] = useState('2026-12-28'),
    [priority, setPriority] =
      useState<AdvancedHandoffInput['manual_priority']>('normal'),
    [edition, setEdition] = useState<TradeEdition>('property_services'),
    [requirements, setRequirements] = useState<AdvancedRequirements>(),
    [handoff, setHandoff] = useState<AdvancedHandoff>(),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [error, setError] = useState<string>(),
    [status, setStatus] = useState<string>();
  const life = useRef({ active: true }),
    gate = useRef({ enabled: true, confirmed: true }),
    original = useRef<AdvancedHandoffInput | undefined>(undefined),
    confirmation = useRef<AdvancedHandoffConfirmation | undefined>(undefined),
    attempt = useRef(false),
    resultHeading = useRef<HTMLHeadingElement>(null);
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
    if (handoff) resultHeading.current?.focus();
  }, [handoff]);
  function invalidate() {
    if (original.current) original.current.note = '';
    if (confirmation.current) confirmation.current.confirmed = false;
    setRequirements(undefined);
    setHandoff(undefined);
    setConfirmed(false);
    setError(undefined);
    setStatus(undefined);
    setAttempted(false);
    attempt.current = false;
  }
  async function review() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setRequirements(undefined);
    setHandoff(undefined);
    setConfirmed(false);
    setStatus(undefined);
    const input: AdvancedHandoffInput = {
      job_id: jobId,
      kind,
      note,
      review_on: reviewOn,
      manual_priority: priority,
      edition,
    };
    original.current = input;
    try {
      const value = await readAdvancedHandoffRequirements(
        sources,
        input,
        gate.current,
      );
      if (!life.current.active || original.current !== input) return;
      assertAdvancedRequirementsCurrentNow(value);
      setRequirements(value);
      const held = value.prior_attempt === 'EXACT_READ_ONLY_PREVIOUS_ATTEMPT';
      setAttempted(held);
      attempt.current = held;
    } catch {
      if (life.current.active)
        setError(
          'UNKNOWN — current exact source or review input is unavailable. No substitute job, catalog association or authority was selected.',
        );
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  async function prepare() {
    if (!requirements || busy || attempt.current || !confirmed) return;
    attempt.current = true;
    setAttempted(true);
    setBusy(true);
    setError(undefined);
    const input: AdvancedHandoffConfirmation = {
      confirmed: true,
      reviewed_requirements_sha256: requirements.integrity.sha256,
    };
    confirmation.current = input;
    try {
      const result = await prepareAdvancedHandoff(requirements, input);
      if (!life.current.active) return;
      assertAdvancedHandoffCurrentNow(result);
      setHandoff(result);
      setStatus('CURRENT_REVIEW_ONLY');
      setConfirmed(false);
    } catch {
      if (life.current.active) {
        setError(
          'UNKNOWN — this exact job/mode preparation is held. No retry, new note, edition or container can reopen it. Only exact retained read-only evidence is permitted.',
        );
        setConfirmed(false);
      }
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  async function inspect() {
    if (!handoff || busy) return;
    setBusy(true);
    try {
      const result = await reconcileAdvancedHandoff(handoff);
      if (!life.current.active) return;
      if (result.status === 'CURRENT_REVIEW_ONLY')
        assertAdvancedHandoffCurrentNow(handoff);
      setStatus(result.status);
    } catch {
      if (life.current.active) setStatus('UNKNOWN');
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  function navigate() {
    if (!requirements || busy) return;
    try {
      assertAdvancedRequirementsCurrentNow(requirements);
      onSelectJob?.(requirements.source.job_id);
    } catch {
      setRequirements(undefined);
      setHandoff(undefined);
      setError('UNKNOWN — exact source-job navigation is unavailable.');
    }
  }
  return (
    <section
      className="advanced-handoffs"
      aria-label="Advanced review handoff preparation"
    >
      <div className="advanced-handoffs-heading">
        <span className="eyebrow">
          Advanced tools · requirements before handoff
        </span>
        <h2>Prepare a source-bound review handoff</h2>
        <p>
          Inspect current source requirements, then explicitly prepare
          existing-engine review evidence. Every execution, delivery and
          provider action remains blocked.
        </p>
      </div>
      <div className="advanced-handoffs-controls">
        <label>
          Advanced handoff job
          <select
            value={jobId}
            disabled={busy}
            onChange={(e) => {
              invalidate();
              setJobId(e.target.value);
            }}
          >
            {sources.entries.map((entry, i) => (
              <option key={entry.target.job_id} value={entry.target.job_id!}>
                Job {i + 1} · issued version{' '}
                {entry.issued.version.version_number}
              </option>
            ))}
          </select>
        </label>
        <label>
          Advanced handoff mode
          <select
            value={kind}
            disabled={busy}
            onChange={(e) => {
              invalidate();
              setKind(e.target.value as AdvancedHandoffInput['kind']);
            }}
          >
            {advancedHandoffKinds.map((mode) => (
              <option value={mode} key={mode}>
                {labels[mode]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Advanced review date
          <input
            type="date"
            value={reviewOn}
            disabled={busy}
            onChange={(e) => {
              invalidate();
              setReviewOn(e.target.value);
            }}
          />
        </label>
        <label>
          Manual advanced review priority
          <select
            value={priority}
            disabled={busy}
            onChange={(e) => {
              invalidate();
              setPriority(
                e.target.value as AdvancedHandoffInput['manual_priority'],
              );
            }}
          >
            {(['low', 'normal', 'high', 'urgent'] as const).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          Human trade review edition
          <select
            value={edition}
            disabled={busy}
            onChange={(e) => {
              invalidate();
              setEdition(e.target.value as TradeEdition);
            }}
          >
            {tradeEditions.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="advanced-handoffs-note">
        Literal review note or typed transcript
        <textarea
          value={note}
          maxLength={1000}
          disabled={busy}
          onChange={(e) => {
            invalidate();
            setNote(e.target.value);
          }}
        />
      </label>
      <button
        type="button"
        disabled={busy || !note.trim()}
        onClick={() => void review()}
      >
        Review advanced handoff requirements
      </button>
      {busy && (
        <p role="status">
          Checking exact sources and existing review evidence…
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {requirements && (
        <section
          className="advanced-handoffs-requirements"
          aria-label="Current advanced handoff requirements"
        >
          <h3>{labels[requirements.kind]}</h3>
          <p>
            {requirements.company.name} · original industry{' '}
            {requirements.company.industry}
          </p>
          <p>
            Review date {requirements.review_context.review_on}; incident
            reported-on date is not established.
          </p>
          <dl>
            <dt>Exact job</dt>
            <dd>{requirements.source.job_id}</dd>
            <dt>Issued estimate / version / saved revision</dt>
            <dd>
              {requirements.source.estimate_id} /{' '}
              {requirements.source.issued_version_number} ·{' '}
              {requirements.source.issued_version_id} /{' '}
              {requirements.source.saved_lock_revision}
            </dd>
            <dt>Source SHA-256</dt>
            <dd>{requirements.source.source_sha256}</dd>
            <dt>Recorded catalog association</dt>
            <dd>
              {requirements.catalog_links.state} ·{' '}
              {requirements.catalog_links.current_valid_links} current valid
              links across {requirements.catalog_links.included_lines} included
              lines. Manual association NOT CREATED.
            </dd>
            <dt>Prior local attempt</dt>
            <dd>{requirements.prior_attempt}</dd>
          </dl>
          <details>
            <summary>Exact available issued scope</summary>
            <ul>
              {requirements.scope.map((line) => (
                <li key={line.line_id}>
                  {line.description} · {line.quantity_milli / 1000} {line.unit}{' '}
                  · catalog {line.catalog_item_id ?? 'not recorded'}
                </li>
              ))}
            </ul>
          </details>
          <h4>Unmet operational requirements</h4>
          <ul>
            {requirements.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
          <button
            type="button"
            className="advanced-handoffs-secondary"
            disabled={busy}
            onClick={navigate}
          >
            Open handoff source job
          </button>
          <label className="advanced-handoffs-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || attempted}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I reviewed the exact source and missing requirements; prepare a
            local review handoff only.
          </label>
          <button
            type="button"
            disabled={busy || attempted || !confirmed}
            onClick={() => void prepare()}
          >
            Prepare confirmed advanced review handoff
          </button>
        </section>
      )}
      {handoff && (
        <section
          className="advanced-handoffs-result"
          aria-label="Immutable advanced review handoff"
        >
          <h3 tabIndex={-1} ref={resultHeading}>
            Immutable advanced review handoff
          </h3>
          <p role="status">
            {status} · Staff review only · NOT SENT · Execution BLOCKED
          </p>
          {status !== 'UNKNOWN' && (
            <>
              <dl>
                <dt>Existing canonical engine</dt>
                <dd>{handoff.canonical_reference.engine}</dd>
                <dt>Canonical evidence SHA-256</dt>
                <dd>{handoff.canonical_reference.sha256}</dd>
                <dt>Handoff SHA-256</dt>
                <dd>{handoff.integrity.sha256}</dd>
              </dl>
              <dl>
                {handoff.evidence.facts.map((fact, i) => (
                  <div key={`${fact.label}:${i}`}>
                    <dt>{fact.label}</dt>
                    <dd>{display(fact.value)}</dd>
                  </div>
                ))}
              </dl>
              {handoff.evidence.clauses.map((clause, i) => (
                <article key={i}>
                  <h4>Literal clause {i + 1}</h4>
                  <p>{display(clause.literal)}</p>
                  <p>Review warning: {display(clause.warning)}</p>
                  <p>
                    Existing-engine suggestion: {display(clause.suggestion)}
                  </p>
                </article>
              ))}
              {handoff.evidence.checklist.map((item) => (
                <article key={String(item.section)}>
                  <h4>Trade review section {display(item.section)}</h4>
                  <p>{display(item.prompt)}</p>
                  <p>
                    {display(item.status)} · No licensing or compliance claim.
                  </p>
                </article>
              ))}
            </>
          )}
          <button type="button" disabled={busy} onClick={() => void inspect()}>
            Inspect exact advanced review handoff
          </button>
        </section>
      )}
      <p className="advanced-handoffs-boundary">
        Local same-tab review only. No microphone, AI/provider call, recipient,
        message, sync, export, order, dispatch, contract or financial action.
        Refresh/process durability and genuine authentication are not
        established.
      </p>
    </section>
  );
}
