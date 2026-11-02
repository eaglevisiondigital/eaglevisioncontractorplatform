import { useEffect, useRef, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import { growthWorkflowEnabled } from '../../lib/workflows/growth-workflow';
import {
  readMaintenanceDesk,
  reconcileMaintenanceDesk,
  openMaintenanceDeskSource,
  prepareMaintenanceDeskReview,
  reconcileMaintenanceDeskPreparation,
  maintenanceDeskAttemptState,
  reviewMaintenanceConsentPreflight,
  reconcileMaintenanceConsentPreflight,
  type MaintenanceDeskInput,
  type MaintenanceDeskView,
  type MaintenanceConsentReview,
  type MaintenanceConsentInput,
} from '../../lib/workflows/maintenance-desk';
import type { MaintenanceVisitProposal } from '../../lib/maintenance-renewal-planning';
import './maintenance-desk.css';

export interface MaintenanceDeskProps {
  sources: LocalJourney;
  enabled?: boolean;
}
export function MaintenanceDesk(props: MaintenanceDeskProps) {
  const key = JSON.stringify([
    props.sources.target,
    props.sources.day,
    props.enabled,
  ]);
  const [context, setContext] = useState({
    sources: props.sources,
    key,
    epoch: 0,
  });
  if (context.sources !== props.sources || context.key !== key) {
    setContext({ sources: props.sources, key, epoch: context.epoch + 1 });
    return null;
  }
  const enabled =
    typeof window !== 'undefined' &&
    growthWorkflowEnabled({
      development: import.meta.env.DEV,
      flag: props.enabled === true ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    });
  return enabled ? (
    <Desk key={context.epoch} {...props} />
  ) : (
    <section
      className="maintenance-desk"
      role="region"
      aria-label="Maintenance and renewal planning"
    >
      <h2>Maintenance desk is off</h2>
      <p>No recurring enrollment, scheduling or communication is enabled.</p>
    </section>
  );
}
function Desk({ sources }: MaintenanceDeskProps) {
  const [from, setFrom] = useState(sources.day),
    [through, setThrough] = useState(
      Temporal.PlainDate.from(sources.day).add({ days: 28 }).toString(),
    ),
    [asOf, setAsOf] = useState(sources.day + 'T12:00:00.000Z'),
    [channel, setChannel] = useState<'email' | 'sms'>('email'),
    [lead, setLead] = useState(7),
    [overdue, setOverdue] = useState(3),
    [query, setQuery] = useState(''),
    [kind, setKind] = useState<MaintenanceDeskInput['kind']>('all'),
    [readiness, setReadiness] =
      useState<MaintenanceDeskInput['readiness']>('all'),
    [confirmed, setConfirmed] = useState(false),
    [view, setView] = useState<MaintenanceDeskView | null>(null),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [selected, setSelected] = useState(''),
    [reviewConfirmed, setReviewConfirmed] = useState(false),
    [attempts, setAttempts] = useState<Record<string, string>>({}),
    [proposal, setProposal] = useState<MaintenanceVisitProposal | null>(null),
    [purpose, setPurpose] = useState<MaintenanceConsentInput['purpose']>(
      'recurring_maintenance',
    ),
    [consentConfirmed, setConsentConfirmed] = useState(false),
    [consentReview, setConsentReview] =
      useState<MaintenanceConsentReview | null>(null),
    [detail, setDetail] = useState<
      MaintenanceDeskView['maintenance_findings'][number] | null
    >(null),
    [hasRetained, setHasRetained] = useState(false);
  const live = useRef(true),
    pending = useRef(false),
    epoch = useRef(0),
    gates = useRef<{ enabled: boolean; confirmed: boolean }[]>([]),
    activeGate = useRef<{ enabled: boolean; confirmed: boolean } | null>(null),
    retained = useRef<MaintenanceDeskView | null>(null),
    heading = useRef<HTMLHeadingElement>(null),
    sourceHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    live.current = true;
    const registered = gates.current;
    return () => {
      live.current = false;
      for (const gate of registered) gate.confirmed = false;
    };
  }, []);
  useEffect(() => {
    if (view) heading.current?.focus();
  }, [view]);
  useEffect(() => {
    if (detail) sourceHeading.current?.focus();
  }, [detail]);
  function invalidate() {
    epoch.current++;
    if (activeGate.current) activeGate.current.confirmed = false;
    setConfirmed(false);
    setReviewConfirmed(false);
    setConsentConfirmed(false);
    setView(null);
    setSelected('');
    setProposal(null);
    setConsentReview(null);
    setDetail(null);
    setError('');
    setStatus('');
  }
  const candidate = view?.candidates.find(
    (row) => row.selection.candidate_key === selected,
  );
  function choose(key: string) {
    epoch.current++;
    if (activeGate.current) activeGate.current.confirmed = false;
    setSelected(key);
    setReviewConfirmed(false);
    setConsentConfirmed(false);
    setProposal(null);
    setConsentReview(null);
    setStatus('');
  }
  async function load() {
    if (!confirmed || pending.current || unknown) return;
    const token = ++epoch.current,
      gate = { enabled: true, confirmed: true };
    gates.current.push(gate);
    activeGate.current = gate;
    pending.current = true;
    setBusy(true);
    setError('');
    setView(null);
    try {
      const result = await readMaintenanceDesk(
        sources,
        {
          window: { from, through, as_of: asOf, channel },
          lead_days: lead,
          overdue_days: overdue,
          query,
          kind,
          readiness,
        },
        gate,
      );
      if (live.current && token === epoch.current) {
        retained.current = result;
        setHasRetained(true);
        setView(result);
        setAttempts(
          Object.fromEntries(
            result.candidates.map((row) => [
              row.selection.candidate_key,
              maintenanceDeskAttemptState(result, row),
            ]),
          ),
        );
        setStatus(
          'Available recurring and published-source evidence loaded. No enrollment or messages are enabled.',
        );
      }
    } catch {
      if (live.current && token === epoch.current) {
        setUnknown(true);
        setError(
          'Desk evidence is UNKNOWN or changed. No proposal, schedule or message was applied. Only exact retained read reconciliation is available.',
        );
      }
    } finally {
      pending.current = false;
      activeGate.current = null;
      if (live.current) setBusy(false);
    }
  }
  async function prepare() {
    if (!view || !candidate || !reviewConfirmed || pending.current || unknown)
      return;
    const token = ++epoch.current,
      gate = { enabled: true, confirmed: true },
      key = candidate.selection.candidate_key;
    gates.current.push(gate);
    activeGate.current = gate;
    pending.current = true;
    setBusy(true);
    setAttempts((value) => ({ ...value, [key]: 'PENDING' }));
    setError('');
    try {
      const result = await prepareMaintenanceDeskReview(view, candidate, gate);
      if (live.current && token === epoch.current) {
        setProposal(result);
        setAttempts((value) => ({ ...value, [key]: 'PREPARED' }));
        setStatus(
          'Immutable staff planning proposal prepared. No visit, agreement or message was created.',
        );
      }
    } catch {
      if (live.current) {
        setAttempts((value) => ({ ...value, [key]: 'UNKNOWN' }));
        if (token === epoch.current)
          setError(
            'Preparation is UNKNOWN or already retained. No new attempt will be made; use exact read reconciliation.',
          );
      }
    } finally {
      pending.current = false;
      activeGate.current = null;
      if (live.current) setBusy(false);
    }
  }
  async function reconcileProposal() {
    if (!view || !candidate || pending.current) return;
    pending.current = true;
    setBusy(true);
    const token = ++epoch.current;
    const result = await reconcileMaintenanceDeskPreparation(view, candidate);
    if (live.current && token === epoch.current) {
      if (
        result.status === 'EXACT_PREPARED_REVIEW_ONLY' &&
        'proposal' in result
      ) {
        setProposal(result.proposal);
        setStatus(
          'The exact retained planning snapshot is available; it grants no scheduling or message authority.',
        );
      } else {
        setView(null);
        setSelected('');
        setProposal(null);
        setDetail(null);
        setUnknown(true);
        setError(
          'Exact preparation remains UNKNOWN; no replacement or replay was performed.',
        );
      }
    }
    pending.current = false;
    if (live.current) setBusy(false);
  }
  async function preflight() {
    if (
      !view ||
      !candidate ||
      !consentConfirmed ||
      pending.current ||
      unknown ||
      consentReview
    )
      return;
    const token = ++epoch.current,
      gate = { enabled: true, confirmed: true };
    gates.current.push(gate);
    activeGate.current = gate;
    pending.current = true;
    setBusy(true);
    const result = await reviewMaintenanceConsentPreflight(
      view,
      candidate,
      {
        recipient_customer_id: view.source.customer_id,
        channel: view.window.channel,
        purpose,
        expected_source_sha256: view.source.source_sha256,
        expected_consent_id: view.consent.reference?.id ?? null,
      },
      gate,
    );
    if (live.current && token === epoch.current) {
      setConsentReview(result);
      if (!('integrity' in result)) {
        setView(null);
        setSelected('');
        setDetail(null);
        setProposal(null);
        setUnknown(true);
        setError(
          'Exact preflight source binding is UNKNOWN. Prior evidence is withheld; no replacement or replay occurred.',
        );
      }
      setStatus(
        'Consent-at-send currentness is UNKNOWN; decision BLOCKED. No recipient endpoint or sender exists.',
      );
    }
    pending.current = false;
    activeGate.current = null;
    if (live.current) setBusy(false);
  }
  async function verify() {
    if (!retained.current || pending.current) return;
    pending.current = true;
    setBusy(true);
    const token = ++epoch.current;
    const result = await reconcileMaintenanceDesk(retained.current);
    if (live.current && token === epoch.current) {
      if (result.status === 'CAPTURED_NOT_ATOMIC')
        setStatus(
          'Exact retained planning evidence matches captured available sources. Current consent remains UNKNOWN.',
        );
      else {
        setUnknown(true);
        setView(null);
        setDetail(null);
        setProposal(null);
        setError(
          'Exact desk source is UNKNOWN. No automatic refresh, replacement or replay occurred.',
        );
      }
    }
    pending.current = false;
    if (live.current) setBusy(false);
  }
  async function inspect(
    item: MaintenanceDeskView['maintenance_findings'][number],
  ) {
    if (!view || pending.current) return;
    pending.current = true;
    setBusy(true);
    const token = ++epoch.current;
    try {
      await openMaintenanceDeskSource(view, item.source);
      if (live.current && token === epoch.current) setDetail(item);
    } catch {
      if (live.current && token === epoch.current) {
        setUnknown(true);
        setView(null);
        setError(
          'Exact published maintenance source is UNKNOWN. No replacement report was selected.',
        );
      }
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  return (
    <section
      className="maintenance-desk"
      role="region"
      aria-label="Maintenance and renewal planning"
    >
      <header className="md-header">
        <div>
          <p className="md-eyebrow">GROWTH / EXACT-SOURCE PLANNING</p>
          <h2>Maintenance and renewal planning</h2>
        </div>
        <span className="md-badge">Staff review · no delivery</span>
      </header>
      <p className="md-boundary">
        Review the selected property's recurring opportunities and original
        published findings. Contact-v1 is historical channel evidence, not
        service-renewal or marketing consent.
      </p>
      <div className="md-fields">
        <label>
          Planning from
          <input
            type="date"
            value={from}
            onChange={(e) => {
              invalidate();
              setFrom(e.target.value);
            }}
            disabled={unknown}
          />
        </label>
        <label>
          Planning through
          <input
            type="date"
            value={through}
            onChange={(e) => {
              invalidate();
              setThrough(e.target.value);
            }}
            disabled={unknown}
          />
        </label>
        <label>
          As-of instant (UTC)
          <input
            type="text"
            value={asOf}
            onChange={(e) => {
              invalidate();
              setAsOf(e.target.value);
            }}
            disabled={unknown}
          />
        </label>
        <label>
          Contact channel
          <select
            value={channel}
            onChange={(e) => {
              invalidate();
              setChannel(e.target.value as 'email' | 'sms');
            }}
            disabled={unknown}
          >
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
        </label>
        <label>
          Review days ahead
          <input
            type="number"
            min="0"
            max="30"
            value={Number.isFinite(lead) ? lead : ''}
            onChange={(e) => {
              invalidate();
              setLead(e.target.valueAsNumber);
            }}
            disabled={unknown}
          />
        </label>
        <label>
          Overdue review days
          <input
            type="number"
            min="0"
            max="93"
            value={Number.isFinite(overdue) ? overdue : ''}
            onChange={(e) => {
              invalidate();
              setOverdue(e.target.valueAsNumber);
            }}
            disabled={unknown}
          />
        </label>
        <label>
          Search available planning evidence
          <input
            type="search"
            value={query}
            maxLength={200}
            onChange={(e) => {
              invalidate();
              setQuery(e.target.value);
            }}
            disabled={unknown}
          />
        </label>
        <label>
          Occurrence type
          <select
            value={kind}
            onChange={(e) => {
              invalidate();
              setKind(e.target.value as MaintenanceDeskInput['kind']);
            }}
            disabled={unknown}
          >
            <option value="all">All available types</option>
            <option value="inspection_occurrence">Inspection recurrence</option>
            <option value="staff_follow_up">Staff follow-up</option>
          </select>
        </label>
        <label>
          Staff planning readiness
          <select
            value={readiness}
            onChange={(e) => {
              invalidate();
              setReadiness(e.target.value as MaintenanceDeskInput['readiness']);
            }}
            disabled={unknown}
          >
            <option value="all">All available candidates</option>
            <option value="preparable">Can prepare staff proposal</option>
            <option value="blocked">Blocked / requires review</option>
          </select>
        </label>
      </div>
      <p>
        Dates, as-of time and calendar-day horizons are explicit synthetic
        review inputs. They do not set policy, enrollment or a message schedule.
      </p>
      <label className="md-check">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={unknown}
          onChange={(e) => {
            invalidate();
            setConfirmed(e.target.checked);
          }}
        />
        I confirm this exact local maintenance planning review.
      </label>
      <button
        disabled={!confirmed || busy || unknown}
        onClick={() => void load()}
      >
        Review maintenance opportunities
      </button>
      {busy && (
        <p role="status">
          Checking current plans, exact published sources and captured channel
          evidence…
        </p>
      )}
      {error && (
        <p role="alert" className="md-state">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {!view && !busy && !error && (
        <p className="md-state">
          Choose your review window and filters, then explicitly load available
          sources. No recurrence or message runs automatically.
        </p>
      )}
      {view && (
        <>
          <h3 ref={heading} tabIndex={-1}>
            Available maintenance review desk
          </h3>
          <p>
            {view.matching_count} matching of {view.available_count} available
            occurrence candidates. Historical coverage is incomplete; counts are
            not complete customer history.
          </p>
          <p>
            Staff review horizon: {view.review_policy.lead_days} days ahead /{' '}
            {view.review_policy.overdue_days} overdue. Renewal terms and
            agreement: UNKNOWN. No enrollment is inferred.
          </p>
          {!view.candidates.length && (
            <p className="md-state">
              No matching available occurrence candidates. Change the explicit
              filters for another read; missing rows do not prove completed
              maintenance.
            </p>
          )}
          <div className="md-cards">
            {view.candidates.map((row) => (
              <article className="md-card" key={row.selection.candidate_key}>
                <p className="md-eyebrow">
                  {row.selection.kind.replaceAll('_', ' ')}
                </p>
                <h4>
                  {row.plan_name} · {row.selection.due_on}
                </h4>
                <p>
                  {row.selection.timezone} ·{' '}
                  {row.planning_status.replaceAll('_', ' ')}
                </p>
                <p>
                  {row.can_prepare_visit_proposal
                    ? 'Eligible for staff planning review only'
                    : 'No staff proposal preparation from this evidence'}
                </p>
                {!!row.exact_visits.length && (
                  <p>
                    {row.exact_visits.length} exact recorded visit reference(s);
                    not proof of physical completion.
                  </p>
                )}
                <p>
                  Retained preparation:{' '}
                  {attempts[row.selection.candidate_key] ?? 'UNKNOWN'}
                </p>
                <button
                  disabled={busy}
                  onClick={() => choose(row.selection.candidate_key)}
                >
                  Review exact occurrence {row.selection.due_on}
                </button>
              </article>
            ))}
          </div>
          {candidate && (
            <article className="md-detail">
              <h3>Exact selected occurrence</h3>
              <p>
                {candidate.plan_name} · {candidate.selection.due_on} ·{' '}
                {candidate.selection.timezone}
              </p>
              <p>
                Plan {candidate.selection.source.plan_id} · revision{' '}
                {candidate.selection.source.plan_revision}; finding{' '}
                {candidate.selection.source.finding_id ??
                  'Not a finding-specific occurrence'}
              </p>
              <p>
                Source report{' '}
                {candidate.selection.source.report_id ?? 'Plan recurrence only'}{' '}
                · version {candidate.selection.source.report_version ?? 'N/A'}
              </p>
              <label className="md-check">
                <input
                  type="checkbox"
                  checked={reviewConfirmed}
                  onChange={(e) => {
                    epoch.current++;
                    if (activeGate.current)
                      activeGate.current.confirmed = false;
                    setReviewConfirmed(e.target.checked);
                  }}
                />
                I confirm this exact source for an unsaved staff visit proposal.
              </label>
              <button
                disabled={
                  !reviewConfirmed ||
                  busy ||
                  unknown ||
                  !candidate.can_prepare_visit_proposal ||
                  attempts[selected] !== 'NOT_PREPARED'
                }
                onClick={() => void prepare()}
              >
                Prepare exact staff planning proposal
              </button>
              <button
                disabled={busy || attempts[selected] === 'NOT_PREPARED'}
                onClick={() => void reconcileProposal()}
              >
                Reconcile exact retained preparation
              </button>
              {proposal && (
                <div className="md-state">
                  <h4>Immutable staff planning snapshot</h4>
                  <p>Identity {proposal.id}</p>
                  <p>
                    Plan {proposal.snapshot.selection.source.plan_id} · due{' '}
                    {proposal.snapshot.selection.due_on}
                  </p>
                  <p>SHA-256 {proposal.sha256}</p>
                  <p>
                    Scheduling, messages and billing BLOCKED. No visit,
                    agreement, recipient or provider request was created.
                  </p>
                </div>
              )}
              <h4>Consent-at-send architecture review</h4>
              <p>
                Exact customer reference {view.source.customer_id} · channel{' '}
                {view.window.channel}. No recipient endpoint is resolved.
              </p>
              <label>
                Requested communication purpose
                <select
                  value={purpose}
                  onChange={(e) => {
                    epoch.current++;
                    if (activeGate.current)
                      activeGate.current.confirmed = false;
                    setPurpose(
                      e.target.value as MaintenanceConsentInput['purpose'],
                    );
                    setConsentReview(null);
                    setConsentConfirmed(false);
                  }}
                >
                  <option value="recurring_maintenance">
                    Recurring maintenance
                  </option>
                  <option value="service_follow_up">Service follow-up</option>
                  <option value="marketing">Marketing</option>
                </select>
              </label>
              <label className="md-check">
                <input
                  type="checkbox"
                  checked={consentConfirmed}
                  onChange={(e) => {
                    epoch.current++;
                    if (activeGate.current)
                      activeGate.current.confirmed = false;
                    setConsentConfirmed(e.target.checked);
                  }}
                />
                Check this exact customer/channel/purpose boundary without
                sending.
              </label>
              <button
                disabled={
                  !consentConfirmed || busy || unknown || !!consentReview
                }
                onClick={() => void preflight()}
              >
                Review consent-at-send boundary
              </button>
              {consentReview && (
                <div className="md-state">
                  <h4>Decision BLOCKED · current consent UNKNOWN</h4>
                  <p>
                    Historical contact-v1 evidence does not authorize this
                    purpose. Current contact reference is unavailable; no atomic
                    current-consent reader, sender or recipient resolver exists.
                  </p>
                  {'missing_gates' in consentReview && (
                    <ul>
                      {consentReview.missing_gates.map((gate) => (
                        <li key={gate}>
                          {gate.replaceAll('_', ' ')} · unverified
                        </li>
                      ))}
                    </ul>
                  )}
                  <p>
                    Send: disabled · recipient: none · provider request: none.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (pending.current || !consentReview) return;
                      pending.current = true;
                      setBusy(true);
                      const token = ++epoch.current;
                      void reconcileMaintenanceConsentPreflight(consentReview)
                        .then((result) => {
                          if (live.current && token === epoch.current) {
                            if (
                              'historical_binding' in result &&
                              result.historical_binding ===
                                'MATCHED_CAPTURE_ONLY'
                            )
                              setStatus(
                                'Exact historical capture matches the available read; current consent remains UNKNOWN and BLOCKED. No packet or send was created.',
                              );
                            else {
                              setView(null);
                              setSelected('');
                              setConsentReview(null);
                              setDetail(null);
                              setUnknown(true);
                              setError(
                                'Exact historical consent binding is UNKNOWN or unavailable. Prior review evidence is withheld; no replacement or replay occurred.',
                              );
                            }
                          }
                        })
                        .finally(() => {
                          pending.current = false;
                          if (live.current) setBusy(false);
                        });
                    }}
                  >
                    Check exact retained consent review
                  </button>
                </div>
              )}
            </article>
          )}
          <h3>Published maintenance source findings</h3>
          <p>
            {view.maintenance_findings.length} text-matching of{' '}
            {view.available_findings_count} available published findings.
            Date/type/readiness filters above apply to occurrences; factual
            source findings retain their original identity.
          </p>
          {!view.maintenance_findings.length && (
            <p className="md-state">
              No matching published finding in the authorized available source.
            </p>
          )}
          <div className="md-cards">
            {view.maintenance_findings.map((item) => (
              <article className="md-card" key={JSON.stringify(item.source)}>
                <h4>
                  {item.category} · {item.location}
                </h4>
                <p>
                  <strong>Factual observation:</strong> {item.observation}
                </p>
                <p>
                  <strong>Maintenance recommendation:</strong>{' '}
                  {item.recommendation}
                </p>
                <p>
                  Reported severity {item.reported_severity}; manual priority{' '}
                  {item.manual_priority}. Physical completion UNVERIFIED.
                </p>
                <button disabled={busy} onClick={() => void inspect(item)}>
                  Inspect published finding source
                </button>
              </article>
            ))}
          </div>
          <p>
            Planning channel evidence:{' '}
            {view.consent.observed_channel_state.replaceAll('_', ' ')} ·
            CAPTURED NOT ATOMIC. Current channel authority UNKNOWN. Purpose,
            suppression, sender and enrollment remain UNVERIFIED.
          </p>
        </>
      )}
      {hasRetained && (
        <button disabled={busy} onClick={() => void verify()}>
          Check exact retained maintenance source
        </button>
      )}
      {detail && (
        <article className="md-detail">
          <h3 tabIndex={-1} ref={sourceHeading}>
            Exact published maintenance source
          </h3>
          <p>
            Report {detail.source.report_id} · published version{' '}
            {detail.source.report_version}
          </p>
          <p>
            Finding {detail.source.finding_id} · maintenance revision{' '}
            {detail.source.maintenance_revision}
          </p>
          <p>
            Property {detail.source.location_id} · job {detail.source.job_id} ·
            plan {detail.source.plan_id}
          </p>
          <p>{detail.observation}</p>
          <p>Recommendation: {detail.recommendation}</p>
          <p>
            Immutable source documentation does not prove repair completion or
            renewal agreement.
          </p>
        </article>
      )}
    </section>
  );
}
