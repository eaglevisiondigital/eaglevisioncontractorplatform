import { useEffect, useRef, useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { prototypeFields } from '../../lib/program/prototype-source';
import {
  readFollowUpReadiness,
  assertFollowUpReadinessCurrentNow,
  reconcileFollowUpReadiness,
  openFollowUpReadinessSource,
  inspectFollowUpReadinessRequirements,
  reconcileFollowUpReadinessRequirements,
  closeFollowUpReadinessReview,
  type FollowUpReadinessView,
  type FollowUpReadinessInput,
} from '../../lib/workflows/follow-up-readiness';
import {
  assertConsentCancellationReviewNow,
  consentCancellationStateNow,
  type ConsentCancellationView,
} from '../../lib/workflows/consent-cancellation-review';
import './follow-up-readiness.css';
export interface FollowUpReadinessProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
export function FollowUpReadiness({
  sources,
  enabled = false,
  onSelectJob,
}: FollowUpReadinessProps) {
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
      const root = prototypeFields(sources, [
        'company',
        'operations',
        'estimates',
        'property',
        'entries',
        'gate',
      ]);
      check = captureOperatingSources(
        sources,
        root.gate as OperatingSources['gate'],
      ).check;
    } catch {
      /* Admit before every source read. */
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
    <ReadinessDesk
      key={binding.epoch}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section className="follow-up-readiness" aria-label="Follow-up readiness">
      <h2>Follow-up readiness</h2>
      <p>
        {admitted
          ? 'Current authorized sources unavailable. Prior review withheld.'
          : 'Follow-up readiness is off. No consent writer, queue or sender enabled.'}
      </p>
    </section>
  );
}
function ReadinessDesk({ sources, onSelectJob }: FollowUpReadinessProps) {
  const [query, setQuery] = useState(''),
    [job, setJob] = useState(''),
    [customer, setCustomer] = useState(''),
    [property, setProperty] = useState(''),
    [from, setFrom] = useState('2026-12-28'),
    [through, setThrough] = useState('2027-01-25'),
    [asOf, setAsOf] = useState('2026-12-28T12:00:00.000Z'),
    [channel, setChannel] = useState<'email' | 'sms'>('email'),
    [purpose, setPurpose] =
      useState<FollowUpReadinessInput['purpose']>('service_follow_up'),
    [channelState, setChannelState] =
      useState<FollowUpReadinessInput['channel_state']>('all'),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [view, setView] = useState<FollowUpReadinessView | null>(null),
    [jobOptions, setJobOptions] = useState<FollowUpReadinessView['jobs']>([]),
    [selected, setSelected] = useState(''),
    [detail, setDetail] = useState<Awaited<
      ReturnType<typeof openFollowUpReadinessSource>
    > | null>(null),
    [proposedOn, setProposedOn] = useState(''),
    [planKind, setPlanKind] = useState<'follow_up' | 'renewal'>('follow_up'),
    [reviewConfirmed, setReviewConfirmed] = useState(false),
    [review, setReview] = useState<ConsentCancellationView | null>(null),
    [attempted, setAttempted] = useState<string[]>([]),
    [reviewClosed, setReviewClosed] = useState(false),
    [message, setMessage] = useState('');
  const archive = useRef(new Map<string, ConsentCancellationView>());
  const active = useRef(true),
    pending = useRef(false),
    generation = useRef(0),
    loadGate = useRef<{ enabled: boolean; confirmed: boolean } | null>(null),
    gates = useRef<{ enabled: boolean; confirmed: boolean }[]>([]),
    heading = useRef<HTMLHeadingElement>(null),
    sourceHeading = useRef<HTMLHeadingElement>(null),
    reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    active.current = true;
    const list = gates.current;
    return () => {
      active.current = false;
      list.forEach((g) => {
        g.confirmed = false;
      });
    };
  }, []);
  useEffect(() => {
    if (view) heading.current?.focus();
  }, [view]);
  useEffect(() => {
    if (detail) sourceHeading.current?.focus();
  }, [detail]);
  useEffect(() => {
    if (review) reviewHeading.current?.focus();
  }, [review]);
  function edit() {
    generation.current++;
    if (loadGate.current) loadGate.current.confirmed = false;
    setView(null);
    setDetail(null);
    setReview(null);
    setSelected('');
    setConfirmed(false);
    setReviewConfirmed(false);
    setMessage('');
  }
  function fail() {
    setUnknown(true);
    setView(null);
    setDetail(null);
    setReview(null);
    setMessage(
      'Follow-up sources, consent evidence or current staff UNKNOWN. Prior detail withheld; no message or replacement attempt.',
    );
  }
  async function load() {
    if (!confirmed || pending.current || unknown) return;
    pending.current = true;
    setBusy(true);
    const token = ++generation.current;
    const g = { enabled: true, confirmed: true };
    gates.current.push(g);
    loadGate.current = g;
    try {
      const result = await readFollowUpReadiness(
        sources,
        {
          window: { from, through, as_of: asOf, channel },
          lead_days: 14,
          overdue_days: 7,
          query,
          kind: 'all',
          readiness: 'all',
          job_id: job,
          customer_id: customer,
          location_id: property,
          purpose,
          channel_state: channelState,
        },
        g,
      );
      if (active.current && token === generation.current) {
        assertFollowUpReadinessCurrentNow(result);
        setView(result);
        setJobOptions(result.jobs);
        setDetail(null);
        setSelected('');
        setMessage(
          'Available maintenance sources loaded. Requested purpose is review context only; communication remains BLOCKED.',
        );
      }
    } catch {
      if (active.current && token === generation.current) fail();
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function open(key: string, navigate = false) {
    if (!view || pending.current || (navigate && (!detail || selected !== key)))
      return;
    pending.current = true;
    setBusy(true);
    const token = generation.current;
    try {
      const result = await openFollowUpReadinessSource(view, key);
      if (active.current && token === generation.current) {
        assertFollowUpReadinessCurrentNow(view);
        if (
          navigate &&
          detail?.job_id === result.job_id &&
          detail.organization_id === result.organization_id
        )
          onSelectJob?.(result.job_id);
        else {
          setSelected(key);
          setDetail(result);
          const prior = archive.current.get(key);
          setReview(prior ?? null);
          setReviewClosed(
            prior
              ? consentCancellationStateNow(prior) !== 'ACTIVE_LOCAL_REVIEW'
              : false,
          );
          setProposedOn('');
          setReviewConfirmed(false);
        }
      }
    } catch {
      if (active.current && token === generation.current) fail();
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function inspect() {
    if (
      !view ||
      !detail ||
      !reviewConfirmed ||
      pending.current ||
      !proposedOn ||
      attempted.includes(selected)
    )
      return;
    pending.current = true;
    setBusy(true);
    const token = generation.current;
    setAttempted((keys) => [...keys, selected]);
    const g = { enabled: true, confirmed: true };
    gates.current.push(g);
    try {
      const result = await inspectFollowUpReadinessRequirements(
        view,
        selected,
        { proposed_on: proposedOn, plan_kind: planKind },
        g,
      );
      if (active.current && token === generation.current) {
        assertFollowUpReadinessCurrentNow(view);
        assertConsentCancellationReviewNow(result);
        archive.current.set(selected, result);
        setReview(result);
        setDetail((previous) =>
          previous
            ? {
                ...previous,
                original_control_reference: {
                  requirements_sha256: result.original_requirements_sha256,
                  review_sha256: result.integrity.sha256,
                },
                original_control_status: consentCancellationStateNow(result),
              }
            : null,
        );
        setReviewConfirmed(false);
        setMessage(
          'Original C12 requirements retained. All original one-use holds apply; communication remains BLOCKED.',
        );
      }
    } catch {
      if (active.current && token === generation.current) {
        setReview(null);
        setMessage(
          'Original review or UNKNOWN hold already exists. No new date, purpose, view or control label can replace it.',
        );
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (!view || pending.current) return;
    pending.current = true;
    setBusy(true);
    const token = generation.current;
    try {
      const source = await reconcileFollowUpReadiness(view);
      const result = selected
        ? await reconcileFollowUpReadinessRequirements(view, selected)
        : null;
      if (active.current && token === generation.current) {
        if (source.status === 'UNKNOWN') fail();
        else {
          assertFollowUpReadinessCurrentNow(view);
          setMessage(
            'Exact source status ' +
              source.status +
              '. Original review ' +
              (result?.status ?? 'NOT_REVIEWED') +
              '. Read only; send BLOCKED.',
          );
          if (result?.status === 'UNKNOWN' && review) setReview(null);
        }
      }
    } catch {
      if (active.current && token === generation.current) fail();
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  function close(action: 'CANCEL' | 'REVOKE') {
    if (!view || !review || pending.current) return;
    try {
      const r = closeFollowUpReadinessReview(view, selected, action);
      setReviewClosed(true);
      setDetail((previous) =>
        previous ? { ...previous, original_control_status: r.status } : null,
      );
      setMessage(
        'Original C12 review ' +
          r.status +
          '. This withdraws only local review; no consent, enrollment or suppression was changed.',
      );
    } catch {
      fail();
    }
  }
  let current = view,
    currentReview = review;
  if (current)
    try {
      assertFollowUpReadinessCurrentNow(current);
    } catch {
      current = null;
    }
  if (currentReview)
    try {
      assertConsentCancellationReviewNow(currentReview);
    } catch {
      currentReview = null;
    }
  if (view && !current && !unknown) {
    fail();
    return null;
  }
  if (review && !currentReview) {
    setReview(null);
    setMessage(
      'Original review UNKNOWN; prior evidence withheld. Exact read only.',
    );
    return null;
  }
  const jobs = jobOptions,
    customers = [
      ...new Map(jobs.map((j) => [j.customer_id, j.customer_label])).entries(),
    ],
    properties = [
      ...new Map(jobs.map((j) => [j.location_id, j.property_label])).entries(),
    ];
  return (
    <section
      className="follow-up-readiness"
      aria-label="Follow-up readiness"
      aria-busy={busy}
    >
      <header>
        <div>
          <p className="fur-eyebrow">GROWTH · SOURCE-BOUND TRIAGE</p>
          <h2>Follow-up readiness</h2>
          <p>
            Find existing maintenance occurrences and inspect the evidence still
            needed for staff review.
          </p>
        </div>
        <span className="fur-badge">Communication BLOCKED</span>
      </header>
      <p className="fur-boundary">
        Recorded plan occurrences and staff follow-up dates are scheduling
        evidence only. Requested purpose and proposed dates are human review
        context. Historical contact-v1 preference never proves current consent,
        suppression clearance, recurring enrollment, renewal terms or sender
        authority. No sender, queue, provider, worker or message exists here.
      </p>
      <div className="fur-controls">
        <label>
          Literal follow-up search
          <input
            type="search"
            maxLength={200}
            value={query}
            disabled={busy || unknown}
            onChange={(e) => {
              edit();
              setQuery(e.target.value);
            }}
          />
        </label>
        <label>
          Requested purpose review
          <select
            value={purpose}
            disabled={busy || unknown}
            onChange={(e) => {
              edit();
              setPurpose(e.target.value as typeof purpose);
            }}
          >
            <option value="service_follow_up">Service follow-up</option>
            <option value="recurring_maintenance">Recurring maintenance</option>
            <option value="marketing">Marketing</option>
          </select>
        </label>
        <label>
          Review channel
          <select
            value={channel}
            disabled={busy || unknown}
            onChange={(e) => {
              edit();
              setChannel(e.target.value as typeof channel);
            }}
          >
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
        </label>
        <label>
          Observed historical channel evidence
          <select
            value={channelState}
            disabled={busy || unknown}
            onChange={(e) => {
              edit();
              setChannelState(e.target.value as typeof channelState);
            }}
          >
            <option value="all">All observed states</option>
            <option value="RECORDED_ALLOWED">Recorded allowed</option>
            <option value="RECORDED_DENIED">Recorded denied</option>
            <option value="UNKNOWN">Unknown</option>
          </select>
        </label>
        <label>
          Exact job filter
          <select
            value={job}
            disabled={busy || unknown}
            onChange={(e) => {
              edit();
              setJob(e.target.value);
            }}
          >
            <option value="">All admitted jobs</option>
            {jobs.map((j) => (
              <option key={j.job_id} value={j.job_id}>
                {j.job_title} · {j.job_id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Exact customer filter
          <select
            value={customer}
            disabled={busy || unknown}
            onChange={(e) => {
              edit();
              setCustomer(e.target.value);
            }}
          >
            <option value="">All admitted customers</option>
            {customers.map(([id, label]) => (
              <option key={id} value={id}>
                {label} · {id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Exact property filter
          <select
            value={property}
            disabled={busy || unknown}
            onChange={(e) => {
              edit();
              setProperty(e.target.value);
            }}
          >
            <option value="">All admitted properties</option>
            {properties.map(([id, label]) => (
              <option key={id} value={id}>
                {label} · {id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Review window from
          <input
            type="date"
            value={from}
            disabled={busy || unknown}
            onChange={(e) => {
              edit();
              setFrom(e.target.value);
            }}
          />
        </label>
        <label>
          Review window through
          <input
            type="date"
            value={through}
            disabled={busy || unknown}
            onChange={(e) => {
              edit();
              setThrough(e.target.value);
            }}
          />
        </label>
        <label>
          Review as-of instant (UTC)
          <input
            value={asOf}
            disabled={busy || unknown}
            onChange={(e) => {
              edit();
              setAsOf(e.target.value);
            }}
          />
        </label>
      </div>
      <label className="fur-check">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || unknown}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I confirm this is an available-source planning review, with no
        communication, enrollment or renewal authority.
      </label>
      <div className="fur-actions">
        <button
          disabled={!confirmed || busy || unknown}
          onClick={() => void load()}
        >
          {busy
            ? 'Checking exact follow-up sources…'
            : 'Load follow-up readiness'}
        </button>
        <button disabled={!current || busy} onClick={() => void reconcile()}>
          Reconcile original follow-up review
        </button>
      </div>
      <p role={unknown ? 'alert' : 'status'}>{message}</p>
      {current && (
        <>
          <h3 ref={heading} tabIndex={-1}>
            Available follow-up sources
          </h3>
          <p>
            {current.matching_occurrences} matching of{' '}
            {current.available_occurrences} available occurrences. Coverage:
            available admitted jobs only; history completeness UNKNOWN.
            Requested purpose: {current.requested_purpose.replaceAll('_', ' ')}.
            Current communication BLOCKED.
          </p>
          {current.rows.length === 0 ? (
            <p>
              No matching follow-up sources. Filters never create missing dates
              or consent evidence.
            </p>
          ) : (
            <div className="fur-grid">
              {current.rows.map((row) => (
                <article className="fur-card" key={row.key}>
                  <h4>{row.context.job_title}</h4>
                  <p>
                    {row.context.customer_label} · {row.context.property_label}
                  </p>
                  <p>
                    {row.plan_name} · {row.selection.kind.replaceAll('_', ' ')}
                  </p>
                  <dl>
                    <div>
                      <dt>Recorded opportunity date</dt>
                      <dd>
                        {row.recorded_due_on} ·{' '}
                        {row.date_basis.replaceAll('_', ' ')}
                      </dd>
                    </div>
                    <div>
                      <dt>Existing planning status</dt>
                      <dd>
                        {row.planning_status} · staff planning eligible{' '}
                        {String(row.staff_planning_eligible)}
                      </dd>
                    </div>
                    <div>
                      <dt>Historical channel observation</dt>
                      <dd>
                        {row.channel} ·{' '}
                        {row.observed_contact_v1.observed_channel_state}.
                        Current authority UNKNOWN.
                      </dd>
                    </div>
                    <div>
                      <dt>Purpose / suppression / enrollment</dt>
                      <dd>
                        {row.purpose_consent} / {row.suppression} /{' '}
                        {row.enrollment}
                      </dd>
                    </div>
                    <div>
                      <dt>Next missing evidence</dt>
                      <dd>
                        Exact original consent requirements review. Renewal
                        terms UNKNOWN.
                      </dd>
                    </div>
                  </dl>
                  <button
                    disabled={busy}
                    aria-label={
                      'Inspect exact follow-up source · ' +
                      row.context.job_title +
                      ' · ' +
                      row.recorded_due_on
                    }
                    onClick={() => void open(row.key)}
                  >
                    Inspect exact follow-up source
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {detail && current && (
        <section className="fur-card" aria-label="Exact follow-up source">
          <h3 ref={sourceHeading} tabIndex={-1}>
            Exact follow-up source
          </h3>
          <p>
            {detail.job_title}. Customer {detail.customer_id}; property{' '}
            {detail.location_id}; job {detail.job_id}.
          </p>
          <dl>
            <div>
              <dt>Original plan</dt>
              <dd>
                {detail.plan_reference.id} revision{' '}
                {detail.plan_reference.revision};{' '}
                {detail.plan_reference.cadence}; starts{' '}
                {detail.plan_reference.starts_on};{' '}
                {detail.plan_reference.timezone}
              </dd>
            </div>
            <div>
              <dt>Historical contact reference</dt>
              <dd>
                {detail.historical_contact_reference
                  ? detail.historical_contact_reference.id +
                    ' · ' +
                    detail.historical_contact_reference.recorded_at
                  : 'UNKNOWN / no exact reference'}
              </dd>
            </div>
            <div>
              <dt>Enrollment / suppression source</dt>
              <dd>
                {detail.enrollment} / {detail.suppression}. No exact source
                references exist in these readers.
              </dd>
            </div>
            <div>
              <dt>Original workflow control</dt>
              <dd>
                {detail.original_control_status}.{' '}
                {detail.original_control_reference?.review_sha256 ??
                  'No original control inspected'}
              </dd>
            </div>
          </dl>
          <pre>{JSON.stringify(detail.source, null, 2)}</pre>
          {onSelectJob && (
            <button disabled={busy} onClick={() => void open(selected, true)}>
              Display existing follow-up job workflow
            </button>
          )}
          <h4>Original consent requirements control</h4>
          <p>
            Explicitly inspect the existing C12/C10 blocked requirements. One
            original source-bound review only. Proposed date does not replace
            the recorded opportunity date.
          </p>
          <div className="fur-controls">
            <label>
              Human proposed follow-up date
              <input
                type="date"
                value={proposedOn}
                disabled={busy || attempted.includes(selected)}
                onChange={(e) => {
                  setReviewConfirmed(false);
                  setProposedOn(e.target.value);
                }}
              />
            </label>
            <label>
              Human planning kind
              <select
                value={planKind}
                disabled={busy || attempted.includes(selected)}
                onChange={(e) => {
                  setReviewConfirmed(false);
                  setPlanKind(e.target.value as typeof planKind);
                }}
              >
                <option value="follow_up">Follow-up proposal</option>
                <option value="renewal">
                  Renewal review proposal (terms UNKNOWN)
                </option>
              </select>
            </label>
          </div>
          <label className="fur-check">
            <input
              type="checkbox"
              checked={reviewConfirmed}
              disabled={busy || attempted.includes(selected)}
              onChange={(e) => setReviewConfirmed(e.target.checked)}
            />
            I confirm this explicit original workflow control is a blocked
            requirements review only, with no sending or consent mutation.
          </label>
          <button
            disabled={
              !reviewConfirmed ||
              !proposedOn ||
              busy ||
              attempted.includes(selected)
            }
            onClick={() => void inspect()}
          >
            Review original follow-up requirements
          </button>
        </section>
      )}
      {currentReview && current && (
        <section
          className="fur-card"
          aria-label="Original follow-up requirements"
        >
          <h3 ref={reviewHeading} tabIndex={-1}>
            Original follow-up requirements
          </h3>
          <p>
            Operational authority {currentReview.operational_authority}.
            Original recorded plan source {currentReview.envelope.plan_id},
            revision {currentReview.envelope.source_revision}. Proposed date{' '}
            {currentReview.envelope.proposed_on}; requested purpose{' '}
            {currentReview.envelope.purpose}.
          </p>
          <p>
            Observed historical channel {currentReview.observed.channel};
            current channel UNKNOWN. Purpose {currentReview.observed.purpose};
            suppression {currentReview.observed.suppression}; enrollment{' '}
            {currentReview.observed.enrollment}.
          </p>
          <h4>Next missing evidence from the original engine</h4>
          <ol>
            {currentReview.missing_gates.map((gate) => (
              <li key={gate}>{gate.replaceAll('_', ' ')}</li>
            ))}
          </ol>
          <p>
            Original requirements SHA-256{' '}
            {currentReview.original_requirements_sha256}. Immutable review
            SHA-256 {currentReview.integrity.sha256}. Review withdrawal never
            changes these historical requirements.
          </p>
          <div className="fur-actions">
            <button
              disabled={busy || reviewClosed}
              onClick={() => close('CANCEL')}
            >
              Cancel original follow-up review
            </button>
            <button
              disabled={busy || reviewClosed}
              onClick={() => close('REVOKE')}
            >
              Revoke original follow-up review
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
