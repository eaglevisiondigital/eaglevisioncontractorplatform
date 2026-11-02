import { useEffect, useRef, useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { prototypeFields } from '../../lib/program/prototype-source';
import type { FollowUpProposalInput } from '../../lib/workflows/follow-up-admission';
import {
  readConsentCancellationSources,
  assertConsentCancellationSourcesNow,
  prepareConsentCancellationReview,
  assertConsentCancellationReviewNow,
  consentCancellationStateNow,
  cancelConsentCancellationReview,
  reconcileConsentCancellationReview,
  openConsentCancellationSource,
  type ConsentCancellationSources,
  type ConsentCancellationView,
} from '../../lib/workflows/consent-cancellation-review';
import './consent-cancellation-review.css';
export interface ConsentCancellationReviewProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
export function ConsentCancellationReview({
  sources,
  enabled = false,
  onSelectJob,
}: ConsentCancellationReviewProps) {
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
      const f = prototypeFields(sources, [
        'company',
        'operations',
        'estimates',
        'property',
        'entries',
        'gate',
      ]);
      check = captureOperatingSources(
        sources,
        f.gate as OperatingSources['gate'],
      ).check;
    } catch {
      /* Withhold unauthorized sources. */
    }
  const [binding, setBinding] = useState({
    sources,
    admitted,
    check,
    epoch: 0,
  });
  let changed = false;
  if (admitted && check && binding.sources === sources)
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
    setBinding({ sources, admitted, check, epoch: binding.epoch + 1 });
    return null;
  }
  return admitted && check ? (
    <CancellationForm
      key={binding.epoch}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="consent-cancellation-review"
      aria-label="Consent cancellation review"
    >
      <h2>Consent cancellation review</h2>
      <p>
        {admitted
          ? 'Current source or staff unavailable. Prior review withheld.'
          : 'Consent cancellation review is off. No consent writer, outbox or sender connected.'}
      </p>
    </section>
  );
}
function CancellationForm({
  sources,
  onSelectJob,
}: ConsentCancellationReviewProps) {
  const [confirmed, setConfirmed] = useState(false),
    [desk, setDesk] = useState<ConsentCancellationSources | null>(null),
    [key, setKey] = useState(''),
    [purpose, setPurpose] =
      useState<FollowUpProposalInput['purpose']>('service_follow_up'),
    [minutes, setMinutes] = useState('30'),
    [finalConfirmed, setFinalConfirmed] = useState(false),
    [view, setView] = useState<ConsentCancellationView | null>(null),
    [hasRetained, setHasRetained] = useState(false),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [message, setMessage] = useState(''),
    [detail, setDetail] = useState<Awaited<
      ReturnType<typeof openConsentCancellationSource>
    > | null>(null);
  const active = useRef(true),
    pending = useRef(false),
    generation = useRef(0),
    gates = useRef<{ enabled: boolean; confirmed: boolean }[]>([]),
    retained = useRef<ConsentCancellationView | null>(null),
    heading = useRef<HTMLHeadingElement>(null),
    resultHeading = useRef<HTMLHeadingElement>(null),
    detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    active.current = true;
    const list = gates.current;
    return () => {
      active.current = false;
      list.forEach((g) => (g.confirmed = false));
    };
  }, []);
  useEffect(() => {
    if (desk) heading.current?.focus();
  }, [desk]);
  useEffect(() => {
    if (view) resultHeading.current?.focus();
  }, [view]);
  useEffect(() => {
    if (detail) detailHeading.current?.focus();
  }, [detail]);
  function gate() {
    const g = { enabled: true, confirmed: true };
    gates.current.push(g);
    return g;
  }
  function invalidate() {
    generation.current++;
    gates.current.slice(1).forEach((g) => (g.confirmed = false));
    setFinalConfirmed(false);
    setView(null);
    setDetail(null);
    if (pending.current) {
      setUnknown(true);
      setMessage(
        'Pending review changed / UNKNOWN. Exact read-only reconciliation only.',
      );
    } else setMessage('');
  }
  async function load() {
    if (!confirmed || pending.current || unknown || desk) return;
    pending.current = true;
    setBusy(true);
    const token = ++generation.current;
    try {
      const result = await readConsentCancellationSources(
        sources,
        {
          window: {
            from: '2026-12-28',
            through: '2027-01-25',
            as_of: '2026-12-28T12:00:00.000Z',
            channel: 'email',
          },
          lead_days: 14,
          overdue_days: 7,
          query: '',
          kind: 'all',
          readiness: 'all',
          job_id: '',
          customer_id: '',
          location_id: '',
        },
        gate(),
      );
      if (active.current && token === generation.current) {
        assertConsentCancellationSourcesNow(result);
        setDesk(result);
        setMessage(
          'Actual blocked maintenance records loaded. No permission to contact.',
        );
      }
    } catch {
      if (active.current && token === generation.current) {
        setUnknown(true);
        setMessage(
          'Current maintenance evidence unavailable / UNKNOWN. No communication occurred.',
        );
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function review() {
    if (
      !desk ||
      !key ||
      !finalConfirmed ||
      pending.current ||
      unknown ||
      hasRetained
    )
      return;
    pending.current = true;
    setBusy(true);
    const token = generation.current;
    try {
      const duration = Number(minutes);
      if (!Number.isSafeInteger(duration) || duration < 1 || duration > 60)
        throw Error('Review expiry must be 1–60 minutes');
      const candidate = desk.candidates.find((c) => c.key === key)!;
      const result = await prepareConsentCancellationReview(
        desk,
        {
          proposal: {
            candidate_key: key,
            proposed_on: candidate.selection.due_on,
            purpose,
            plan_kind: 'follow_up',
          },
          expires_at: Date.now() + duration * 60_000,
        },
        gate(),
      );
      if (active.current && token === generation.current) {
        assertConsentCancellationReviewNow(result);
        retained.current = result;
        setHasRetained(true);
        setView(result);
        setMessage(
          'One immutable actual blocked requirements review retained. Cancellation controls affect this same-tab review only.',
        );
      }
    } catch {
      if (active.current && token === generation.current) {
        setUnknown(true);
        setMessage(
          'Existing C11/C10 review or UNKNOWN. No new view, purpose, ID or time bypass.',
        );
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  function close(action: 'CANCEL' | 'REVOKE') {
    if (!view || pending.current) return;
    try {
      const r = cancelConsentCancellationReview(view, action);
      setMessage(
        'Local review state: ' +
          r.status +
          '. Original blocked evidence retained. Actual consent unchanged; no messages.',
      );
    } catch {
      setUnknown(true);
      setView(null);
      setDetail(null);
      setMessage(
        'Local withdrawal source UNKNOWN. Original one-use hold remains; no retry.',
      );
    }
  }
  async function reconcile() {
    if (!retained.current || pending.current) return;
    pending.current = true;
    setBusy(true);
    const token = generation.current;
    try {
      const r = await reconcileConsentCancellationReview(retained.current);
      if (active.current && token === generation.current) {
        if (r.status === 'UNKNOWN') {
          setUnknown(true);
          setView(null);
          setDetail(null);
        }
        setMessage(
          'Exact retained cancellation review: ' +
            r.status +
            '. Read only; actual communication BLOCKED.',
        );
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function open(navigate = false) {
    if (!view || pending.current || (navigate && !detail)) return;
    pending.current = true;
    setBusy(true);
    const token = generation.current;
    try {
      const r = await openConsentCancellationSource(view);
      if (active.current && token === generation.current) {
        assertConsentCancellationReviewNow(view);
        setDetail(r);
        if (
          navigate &&
          detail?.job_id === r.job_id &&
          detail.organization_id === r.organization_id
        )
          onSelectJob?.(r.job_id);
      }
    } catch {
      if (active.current && token === generation.current) {
        setUnknown(true);
        setView(null);
        setDetail(null);
        setMessage('Exact cancellation source UNKNOWN. Prior detail withheld.');
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  let currentDesk = desk,
    current = view,
    state = '';
  if (currentDesk)
    try {
      assertConsentCancellationSourcesNow(currentDesk);
    } catch {
      currentDesk = null;
    }
  if (current)
    try {
      assertConsentCancellationReviewNow(current);
      state = consentCancellationStateNow(current);
    } catch {
      current = null;
    }
  if (((desk && !currentDesk) || (view && !current)) && !unknown) {
    setUnknown(true);
    setView(null);
    setDetail(null);
    setMessage(
      'Current source, staff, input or clock changed / UNKNOWN. Prior review withheld.',
    );
    return null;
  }
  const candidate = currentDesk?.candidates.find((c) => c.key === key);
  return (
    <section
      className="consent-cancellation-review"
      aria-label="Consent cancellation review"
      aria-busy={busy}
    >
      <header>
        <div>
          <p className="ccr-eyebrow">GROWTH · BLOCKED SOURCE REVIEW</p>
          <h2>Consent cancellation review</h2>
          <p>
            Review actual maintenance evidence and withdraw a local review
            without changing real consent.
          </p>
        </div>
        <span className="ccr-badge">All communication BLOCKED</span>
      </header>
      <p className="ccr-boundary">
        Purpose consent, current channel, enrollment, suppression, sender
        authority and global atomic revocation remain unverified. Cancel and
        revoke below affect this same-tab review only. The browser has no
        consent writer, recipient resolver, sender, outbox or provider. Positive
        authority fixtures remain isolated in server tests.
      </p>
      <label className="ccr-check">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || unknown || Boolean(desk)}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I confirm this is an internal review of actual blocked maintenance
        evidence only.
      </label>
      <button
        disabled={!confirmed || busy || unknown || Boolean(desk)}
        onClick={() => void load()}
      >
        {busy
          ? 'Checking cancellation sources…'
          : 'Load cancellation review sources'}
      </button>
      <p role={unknown ? 'alert' : 'status'}>{message}</p>
      {currentDesk && (
        <>
          <h3 ref={heading} tabIndex={-1}>
            Actual source-bound maintenance records
          </h3>
          <p>
            {currentDesk.matching_occurrences} matching of{' '}
            {currentDesk.available_occurrences} available occurrences. Complete
            coverage UNKNOWN.
          </p>
          {!currentDesk.candidates.length ? (
            <p>
              No accessible matching opportunities. No permission to contact.
            </p>
          ) : (
            <div className="ccr-controls">
              <label>
                Exact maintenance opportunity
                <select
                  value={key}
                  disabled={busy || hasRetained || unknown}
                  onChange={(e) => {
                    invalidate();
                    setKey(e.target.value);
                  }}
                >
                  <option value="">Choose an exact recorded source</option>
                  {currentDesk.candidates.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.context.customer_label} · {c.context.property_label} ·{' '}
                      {c.plan_name} · {c.selection.due_on}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Proposed purpose
                <select
                  value={purpose}
                  disabled={busy || hasRetained || unknown}
                  onChange={(e) => {
                    invalidate();
                    setPurpose(
                      e.target.value as FollowUpProposalInput['purpose'],
                    );
                  }}
                >
                  <option value="service_follow_up">Service follow-up</option>
                  <option value="recurring_maintenance">
                    Recurring maintenance
                  </option>
                  <option value="marketing">Marketing</option>
                </select>
              </label>
              <label>
                Local review expiration in minutes (1–60)
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={minutes}
                  disabled={busy || hasRetained || unknown}
                  onChange={(e) => {
                    invalidate();
                    setMinutes(e.target.value);
                  }}
                />
              </label>
            </div>
          )}
          {candidate && (
            <article className="ccr-card">
              <h4>{candidate.plan_name}</h4>
              <p>
                {candidate.context.customer_label} ·{' '}
                {candidate.context.property_label}
              </p>
              <p>
                Job {candidate.context.job_id}. Plan{' '}
                {candidate.selection.source.plan_id}, revision{' '}
                {candidate.selection.source.plan_revision}. Recorded due date{' '}
                {candidate.selection.due_on}.
              </p>
              <label className="ccr-check">
                <input
                  type="checkbox"
                  checked={finalConfirmed}
                  disabled={busy || hasRetained || unknown}
                  onChange={(e) => {
                    invalidate();
                    setFinalConfirmed(e.target.checked);
                  }}
                />
                I confirm the exact source and proposed purpose. Cancellation is
                a local review action only.
              </label>
              <button
                disabled={!finalConfirmed || busy || hasRetained || unknown}
                onClick={() => void review()}
              >
                Review consent cancellation requirements
              </button>
            </article>
          )}
        </>
      )}
      {current && (
        <section
          className="ccr-card"
          aria-label="Immutable blocked cancellation review"
        >
          <h3 ref={resultHeading} tabIndex={-1}>
            Original blocked evidence and local withdrawal
          </h3>
          <p>
            Local review state: {state}. Operational authority: BLOCKED. Actual
            consent mutation: false.
          </p>
          <p>Review expires {new Date(current.expires_at).toISOString()}.</p>
          <p>
            Observed historical channel: {current.observed.channel}; current
            channel UNKNOWN. Purpose {current.observed.purpose}; suppression{' '}
            {current.observed.suppression}; enrollment{' '}
            {current.observed.enrollment}.
          </p>
          <h4>Missing actual authority</h4>
          <ul>
            {current.missing_gates.map((g) => (
              <li key={g}>{g.replaceAll('_', ' ')}</li>
            ))}
          </ul>
          <p>
            Original immutable blocked requirements SHA-256:{' '}
            {current.original_requirements_sha256}. Review SHA-256:{' '}
            {current.integrity.sha256}.
          </p>
          <p>
            Browser writer NOT CONNECTED. Separate participating fixture tests
            never establish genuine consent, global Auth atomicity or real
            consent at send.
          </p>
          <div className="ccr-actions">
            <button
              disabled={busy || state !== 'ACTIVE_LOCAL_REVIEW'}
              onClick={() => close('CANCEL')}
            >
              Cancel same-tab consent review
            </button>
            <button
              disabled={busy || state !== 'ACTIVE_LOCAL_REVIEW'}
              onClick={() => close('REVOKE')}
            >
              Revoke same-tab consent review
            </button>
            <button disabled={busy} onClick={() => void open()}>
              Open exact cancellation source
            </button>
          </div>
        </section>
      )}
      <div className="ccr-actions">
        <button
          disabled={!hasRetained || busy}
          onClick={() => void reconcile()}
        >
          Reconcile exact cancellation review
        </button>
      </div>
      {detail && current && (
        <section className="ccr-card" aria-label="Exact cancellation source">
          <h3 ref={detailHeading} tabIndex={-1}>
            Exact cancellation source
          </h3>
          <dl>
            {Object.entries(detail)
              .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k.replaceAll('_', ' ')}</dt>
                  <dd>{String(v)}</dd>
                </div>
              ))}
          </dl>
          {onSelectJob && (
            <button disabled={busy} onClick={() => void open(true)}>
              Display existing cancellation job workflow
            </button>
          )}
        </section>
      )}
    </section>
  );
}
