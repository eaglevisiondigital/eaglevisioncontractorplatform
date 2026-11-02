import { useEffect, useRef, useState } from 'react';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  advancedHandoffKinds,
  assertAdvancedRequirementsCurrentNow,
  type AdvancedHandoffInput,
  type AdvancedRequirements,
} from '../../lib/workflows/advanced-handoffs';
import {
  readSyncAdmissionSource,
  syncSourceReference,
  reviewSyncAdmission,
  assertSyncAdmissionCurrentNow,
  selectSyncAdmissionJob,
  prepareSyncReviewHandoff,
  inspectSyncReviewHandoff,
  type SyncSourceReference,
  type SyncReferenceProposal,
  type SyncAdmissionReview as Comparison,
  type SyncPreparationConfirmation,
  type SyncReviewHandoff,
} from '../../lib/workflows/sync-admission-review';
import './sync-admission-review.css';
export interface SyncAdmissionReviewProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
const labels = {
  offline: 'Offline field operations',
  voice: 'Voice-to-Estimate',
  receptionist: 'AI receptionist',
  storm_network: 'Storm Mode and Contractor Network',
  accounting: 'Accounting requirements',
  procurement: 'Procurement requirements',
  trade: 'Trade edition context',
} as const;
const fields = {
  organization_id: 'Company reference',
  customer_id: 'Customer reference',
  location_id: 'Property reference',
  job_id: 'Job reference',
  estimate_id: 'Estimate reference',
  issued_version_id: 'Issued version reference',
  source_sha256: 'Canonical source SHA-256',
  saved_lock_revision: 'Saved lock revision',
} as const;
const empty = (): SyncSourceReference => ({
  organization_id: null,
  customer_id: null,
  location_id: null,
  job_id: null,
  estimate_id: null,
  issued_version_id: null,
  source_sha256: null,
  saved_lock_revision: null,
});
export function SyncAdmissionReview({
  sources,
  enabled = false,
  onSelectJob,
}: SyncAdmissionReviewProps) {
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
      /* No unavailable source presentation. */
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
    <Review
      key={binding.generation}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="sync-admission-review"
      aria-label="External reference admission review"
    >
      <h2>External reference admission review</h2>
      <p>
        {admitted
          ? 'Current authorized sources are unavailable. Previous proposals are withheld.'
          : 'Reference admission review is off. Explicit local source confirmation is required.'}
      </p>
    </section>
  );
}
function Review({ sources, onSelectJob }: SyncAdmissionReviewProps) {
  const [jobId, setJobId] = useState(sources.entries[0].target.job_id!),
    [kind, setKind] = useState<AdvancedHandoffInput['kind']>('offline'),
    [note, setNote] = useState(
      'Review this exact source; no external action is authorized.',
    ),
    [requirements, setRequirements] = useState<AdvancedRequirements>(),
    [label, setLabel] = useState('local-review-001'),
    [reference, setReference] = useState<SyncSourceReference>(empty),
    [comparison, setComparison] = useState<Comparison>(),
    [confirmed, setConfirmed] = useState(false),
    [packet, setPacket] = useState<SyncReviewHandoff>(),
    [status, setStatus] = useState<string>(),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [error, setError] = useState<string>();
  const life = useRef({ active: true }),
    gate = useRef({ enabled: true, confirmed: true }),
    original = useRef<AdvancedHandoffInput | undefined>(undefined),
    proposal = useRef<SyncReferenceProposal | undefined>(undefined),
    confirmation = useRef<SyncPreparationConfirmation | undefined>(undefined),
    pending = useRef(false),
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
    if (comparison || packet) resultHeading.current?.focus();
  }, [comparison, packet]);
  function clearComparison() {
    if (proposal.current) proposal.current.external_reference = '';
    if (confirmation.current) confirmation.current.confirmed = false;
    setComparison(undefined);
    setPacket(undefined);
    setStatus(undefined);
    setConfirmed(false);
    setError(undefined);
  }
  function invalidate() {
    if (original.current) original.current.note = '';
    clearComparison();
    setRequirements(undefined);
    setReference(empty());
  }
  async function task<T>(read: () => Promise<T>, apply: (value: T) => void) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const value = await read();
      if (life.current.active) apply(value);
    } catch {
      if (life.current.active) {
        setComparison(undefined);
        setPacket(undefined);
        setStatus('UNKNOWN');
        setError(
          'UNKNOWN — exact sources, proposal or prior preparation are unavailable. No import, synchronization, retry or replacement was performed.',
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
      job_id: jobId,
      kind,
      note,
      review_on: '2026-12-28',
      manual_priority: 'normal',
      edition: 'property_services',
    };
    original.current = input;
    void task(
      () => readSyncAdmissionSource(sources, input, gate.current),
      (value) => {
        assertAdvancedRequirementsCurrentNow(value);
        if (original.current !== input) return;
        setRequirements(value);
        const held = value.prior_attempt === 'EXACT_READ_ONLY_PREVIOUS_ATTEMPT';
        setAttempted(held);
        attempt.current = held;
      },
    );
  }
  function copy() {
    if (!requirements || pending.current) return;
    try {
      clearComparison();
      setReference(syncSourceReference(requirements));
    } catch {
      setRequirements(undefined);
      setError('UNKNOWN — current exact source references are unavailable.');
    }
  }
  function compare() {
    if (!requirements || pending.current) return;
    clearComparison();
    const input: SyncReferenceProposal = {
      external_reference: label,
      source: { ...reference },
    };
    proposal.current = input;
    void task(
      () => reviewSyncAdmission(requirements, input),
      (value) => {
        assertSyncAdmissionCurrentNow(value);
        if (proposal.current !== input) return;
        setComparison(value);
      },
    );
  }
  function prepare() {
    if (!comparison || !confirmed || attempt.current || pending.current) return;
    attempt.current = true;
    setAttempted(true);
    const input = {
      confirmed: true,
      reviewed_comparison_sha256: comparison.integrity.sha256,
    };
    confirmation.current = input;
    void task(
      () => prepareSyncReviewHandoff(comparison, input),
      (value) => {
        assertSyncAdmissionCurrentNow(comparison);
        setPacket(value);
        setStatus('CURRENT_REVIEW_ONLY');
        setConfirmed(false);
      },
    );
  }
  function inspect() {
    if (!packet || pending.current) return;
    void task(
      () => inspectSyncReviewHandoff(packet),
      (value) => {
        setStatus(value.status);
        if (value.status === 'UNKNOWN') setPacket(undefined);
      },
    );
  }
  function navigate() {
    if (!comparison || pending.current) return;
    try {
      onSelectJob?.(selectSyncAdmissionJob(comparison));
    } catch {
      setComparison(undefined);
      setPacket(undefined);
      setError('UNKNOWN — current exact job navigation is unavailable.');
    }
  }
  let current = true;
  try {
    if (requirements) assertAdvancedRequirementsCurrentNow(requirements);
    if (comparison) assertSyncAdmissionCurrentNow(comparison);
  } catch {
    current = false;
  }
  return (
    <section
      className="sync-admission-review"
      aria-label="External reference admission review"
    >
      <header>
        <div>
          <span className="eyebrow">
            Advanced workflows · controlled reference comparison
          </span>
          <h2>External reference admission review</h2>
          <p>
            Compare a human-proposed external reference with one current
            canonical source. Exact matching remains review-only.
          </p>
        </div>
        <span className="sync-admission-badge">No network or import</span>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <label>
          Reference review job
          <select
            value={jobId}
            disabled={busy}
            onChange={(e) => {
              invalidate();
              setJobId(e.target.value);
            }}
          >
            {sources.entries.map((e, index) => (
              <option key={e.target.job_id} value={e.target.job_id!}>
                Job {index + 1} · issued version{' '}
                {e.issued.version.version_number} · {e.target.job_id!.slice(-8)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Advanced review mode
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
                {labels[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Human review context
          <input
            value={note}
            maxLength={1000}
            disabled={busy}
            onChange={(e) => {
              invalidate();
              setNote(e.target.value);
            }}
          />
        </label>
        <button type="submit" disabled={busy || !note.trim()}>
          Read current reference requirements
        </button>
      </form>
      {busy && (
        <p role="status">
          Checking exact source identity and current staff access…
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {!current && (
        <p role="alert">
          UNKNOWN — current source evidence is unavailable. Previous reference
          details are withheld.
        </p>
      )}
      {current && requirements && (
        <>
          <section
            className="sync-admission-source"
            aria-label="Canonical reference requirements"
          >
            <h3>Current canonical source</h3>
            <p>
              {requirements.company.name} · issued version{' '}
              {requirements.source.issued_version_number}
            </p>
            <dl>
              <dt>Exact job</dt>
              <dd>{requirements.source.job_id}</dd>
              <dt>Source SHA-256</dt>
              <dd>{requirements.source.source_sha256}</dd>
              <dt>Saved lock revision</dt>
              <dd>{requirements.source.saved_lock_revision}</dd>
            </dl>
            <p>
              {requirements.catalog_links.state} · invoice/job association NOT
              INFERRED · consent at send UNKNOWN.
            </p>
            <ul>
              {requirements.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </section>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              compare();
            }}
          >
            <fieldset disabled={busy}>
              <legend>Proposed reference · untrusted human input</legend>
              <p>
                A label identifies only this disposable local proposal. Do not
                enter credentials, contact details or private external
                documents.
              </p>
              <label>
                External reference label
                <input
                  value={label}
                  maxLength={80}
                  onChange={(e) => {
                    clearComparison();
                    setLabel(e.target.value);
                  }}
                />
              </label>
              <button type="button" className="secondary" onClick={copy}>
                Use current source references as proposal
              </button>
              <div className="sync-admission-fields">
                {(Object.keys(fields) as (keyof SyncSourceReference)[]).map(
                  (field) => (
                    <label key={field}>
                      {fields[field]}
                      <input
                        value={reference[field] ?? ''}
                        maxLength={200}
                        inputMode={
                          field === 'saved_lock_revision' ? 'numeric' : 'text'
                        }
                        onChange={(e) => {
                          clearComparison();
                          const value = e.target.value;
                          setReference({
                            ...reference,
                            [field]: !value
                              ? null
                              : field === 'saved_lock_revision'
                                ? Number(value)
                                : value,
                          });
                        }}
                      />
                    </label>
                  ),
                )}
              </div>
            </fieldset>
            <button type="submit" disabled={busy}>
              Inspect reference differences
            </button>
          </form>
        </>
      )}
      {current && comparison && (
        <section
          className="sync-admission-result"
          aria-label="Reference difference review"
        >
          <h3 tabIndex={-1} ref={resultHeading}>
            Reference difference review
          </h3>
          <p role="status">{comparison.reference_status}</p>
          <p>External label: {comparison.external_reference}</p>
          <div className="sync-admission-differences">
            {comparison.differences.map((d) => (
              <article key={d.field}>
                <h4>
                  {fields[d.field]} · {d.status}
                </h4>
                <dl>
                  <dt>Current canonical</dt>
                  <dd>{d.expected ?? 'Missing'}</dd>
                  <dt>Human proposal</dt>
                  <dd>{d.proposed ?? 'Missing'}</dd>
                </dl>
              </article>
            ))}
          </div>
          <p>
            No source mismatch is reconciled by text similarity or overwritten.
            External claims never establish consent, supplier identity, payment,
            availability or completion.
          </p>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={navigate}
          >
            Display canonical exact job workflow
          </button>
          <label className="sync-admission-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || attempted || !comparison.exact_reference}
              onChange={(e) => {
                if (confirmation.current)
                  confirmation.current.confirmed = false;
                setConfirmed(e.target.checked);
              }}
            />
            I reviewed this exact matching comparison and separately confirm
            preparation of the existing review-only handoff.
          </label>
          <button
            type="button"
            disabled={
              busy || attempted || !confirmed || !comparison.exact_reference
            }
            onClick={prepare}
          >
            Prepare existing review handoff
          </button>
          {attempted && (
            <p>
              Preparation attempt retained. No retry, new label or replacement
              can reopen an UNKNOWN outcome.
            </p>
          )}
        </section>
      )}
      {current && packet && (
        <section
          className="sync-admission-result"
          aria-label="Immutable reference review handoff"
        >
          <h3>Immutable existing-engine review handoff</h3>
          <p role="status">
            {status} · NOT SENT · NOT IMPORTED · NOT SYNCHRONIZED
          </p>
          <dl>
            <dt>Comparison SHA-256</dt>
            <dd>{packet.comparison.integrity.sha256}</dd>
            <dt>Existing handoff SHA-256</dt>
            <dd>{packet.existing_handoff.integrity.sha256}</dd>
            <dt>Packet SHA-256</dt>
            <dd>{packet.integrity.sha256}</dd>
          </dl>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={inspect}
          >
            Inspect exact existing handoff
          </button>
        </section>
      )}
      <footer>
        Disposable same-tab review only. Atomic network admission, import,
        synchronization, persistence and provider execution are NOT IMPLEMENTED.
        No dispatch, messages, orders, exports, contracts, payments or hosted
        writes. Original source gaps and independent release gates remain.
      </footer>
    </section>
  );
}
