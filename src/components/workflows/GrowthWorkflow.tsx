import { useEffect, useRef, useState } from 'react';
import type { PropertyRepository } from '../../lib/property';
import type { PrototypeTarget } from '../../lib/program/prototype-source';
import type { ReminderWindow } from '../../lib/growth-reminders';
import type { GrowthOpportunityInput } from '../../lib/growth-opportunity-review';
import {
  readGrowthWorkflow,
  verifyGrowthWorkflow,
  openGrowthWorkflowSource,
  prepareGrowthWorkflowProposal,
  prepareGrowthWorkflowOpportunity,
  growthWorkflowEnabled,
  type GrowthWorkflowView,
  type GrowthWorkflowSource,
} from '../../lib/workflows/growth-workflow';
import './growth-workflow.css';

export interface GrowthWorkflowProps {
  repo: PropertyRepository;
  target: PrototypeTarget;
  window: ReminderWindow;
  enabled?: boolean;
  onSource?: (source: GrowthWorkflowSource) => void;
}
export function GrowthWorkflow(props: GrowthWorkflowProps) {
  const key = JSON.stringify([props.target, props.window, props.enabled]);
  const [binding, setBinding] = useState({
    repo: props.repo,
    key,
    generation: 0,
  });
  if (binding.repo !== props.repo || binding.key !== key) {
    setBinding({ repo: props.repo, key, generation: binding.generation + 1 });
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
    <GrowthReview key={binding.generation} {...props} />
  ) : (
    <section className="growth-workflow">
      <h2>Growth workflow is off</h2>
      <p>No reminders or enrollment are enabled.</p>
    </section>
  );
}
function GrowthReview({
  repo,
  target,
  window: query,
  onSource,
}: GrowthWorkflowProps) {
  const [confirmed, setConfirmed] = useState(false),
    [view, setView] = useState<GrowthWorkflowView | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState('');
  const [proposal, setProposal] = useState<Awaited<
      ReturnType<typeof prepareGrowthWorkflowProposal>
    > | null>(null),
    [opportunity, setOpportunity] = useState<Awaited<
      ReturnType<typeof prepareGrowthWorkflowOpportunity>
    > | null>(null);
  const [purpose, setPurpose] =
      useState<GrowthOpportunityInput['purpose']>('reputation'),
    [note, setNote] = useState('');
  const live = useRef(true),
    epoch = useRef(0),
    pending = useRef(false),
    admission = useRef({ enabled: true, confirmed: false }),
    activeRequest = useRef<GrowthOpportunityInput | null>(null),
    result = useRef<HTMLElement>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      admission.current.confirmed = false;
      if (activeRequest.current)
        activeRequest.current.synthetic_transcript = '';
    };
  }, []);
  useEffect(() => {
    if (proposal || opportunity) result.current?.focus();
  }, [proposal, opportunity]);
  const invalidate = (value: boolean) => {
    epoch.current++;
    admission.current.confirmed = value;
    if (activeRequest.current) activeRequest.current.synthetic_transcript = '';
    setConfirmed(value);
    setView(null);
    setProposal(null);
    setOpportunity(null);
    setError('');
    setStatus('');
  };
  async function task<T>(work: () => Promise<T>, accept: (value: T) => void) {
    if (pending.current) return;
    const token = ++epoch.current;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await work();
      if (live.current && token === epoch.current) accept(value);
    } catch {
      if (live.current && token === epoch.current) {
        setView(null);
        setProposal(null);
        setOpportunity(null);
        setError(
          'Exact Growth evidence is unavailable or changed. No reminder, visit, enrollment or financial action was performed.',
        );
      }
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  function load() {
    if (!confirmed || pending.current) return;
    setProposal(null);
    setOpportunity(null);
    setView(null);
    const gate = { enabled: true, confirmed: true };
    admission.current = gate;
    void task(
      () => readGrowthWorkflow(repo, target, query, gate),
      (value) => {
        setView(value);
        setStatus(
          'Planning evidence captured. Current channel authority remains UNKNOWN.',
        );
      },
    );
  }
  return (
    <section
      className="growth-workflow"
      aria-labelledby="growth-workflow-title"
    >
      <div className="gw-heading">
        <div>
          <p className="gw-eyebrow">FINDING / RECURRENCE / STAFF REVIEW</p>
          <h2 id="growth-workflow-title">Maintenance opportunities</h2>
          <p>
            Connect published observations with their exact recurring plan and a
            separate staff follow-up review.
          </p>
        </div>
        <span className="gw-badge">Planning only</span>
      </div>
      <p className="gw-boundary">
        Recorded channel preferences are captured, not atomic current consent.
        Reminders, scheduling, enrollment and billing remain blocked.
      </p>
      <p>
        Window {query.from} → {query.through} · as of {query.as_of} ·{' '}
        {query.channel}. Staff-review horizon: 7 days ahead / 3 days overdue.
      </p>
      <div className="gw-controls">
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => invalidate(event.target.checked)}
          />{' '}
          I confirm this local maintenance planning review.
        </label>
        <button disabled={!confirmed || busy} onClick={load}>
          {busy ? 'Reviewing…' : 'Load maintenance opportunities'}
        </button>
      </div>
      {busy && (
        <p role="status">
          Checking exact property, plan, finding and captured channel evidence…
        </p>
      )}
      {error && (
        <p role="alert" className="gw-state">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {!view && !busy && !error && (
        <p className="gw-state">
          Load the selected job's available published findings and recurrence
          sources.
        </p>
      )}
      {view && (
        <>
          <div className="gw-status">
            <strong>
              Channel:{' '}
              {view.consent.observed_channel_state.replaceAll('_', ' ')}
            </strong>
            <span>CAPTURED NOT ATOMIC · current authority UNKNOWN</span>
            <span>
              Renewal terms UNKNOWN · purpose and suppression UNVERIFIED
            </span>
          </div>
          <h3>Published maintenance observations</h3>
          {!view.maintenance_opportunities.length && (
            <p className="gw-state">
              No published maintenance finding is linked to this job. Absence is
              not repair evidence.
            </p>
          )}
          <div className="gw-grid">
            {view.maintenance_opportunities.map((item) => (
              <article
                className="gw-card"
                key={`${item.source.report_id}:${item.source.report_version}:${item.source.finding_id}`}
              >
                <h4>
                  {item.category} · {item.location}
                </h4>
                <p>
                  Reported severity {item.reported_severity} · manual priority{' '}
                  {item.manual_priority}
                </p>
                <p>{item.observation}</p>
                <p>
                  <strong>Maintenance recommendation:</strong>{' '}
                  {item.recommendation}
                </p>
                <p>
                  Staff review {item.staff_review} · follow-up{' '}
                  {item.follow_up_on ?? 'not recorded'}
                </p>
                <p>
                  Report {item.source.report_id} · published version{' '}
                  {item.source.report_version}
                </p>
                <details>
                  <summary>Exact finding source</summary>
                  <p>Finding {item.source.finding_id}</p>
                  <p>Plan {item.source.plan_id}</p>
                  <p>Job {item.source.job_id}</p>
                  <p>Maintenance revision {item.source.maintenance_revision}</p>
                </details>
                {onSource && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void task(
                        () => openGrowthWorkflowSource(view, item.source),
                        (value) => onSource(value.source),
                      )
                    }
                  >
                    Open published finding
                  </button>
                )}
              </article>
            ))}
          </div>
          <h3>Recurring visit planning</h3>
          <p>
            Dates describe recorded recurrence or staff follow-up. They do not
            establish a renewal agreement or appointment.
          </p>
          {!view.candidates.length && (
            <p className="gw-state">
              No exact job-linked recurrence candidate is available in this
              window.
            </p>
          )}
          <div className="gw-grid">
            {view.candidates.map((row) => (
              <article className="gw-card" key={row.selection.candidate_key}>
                <h4>
                  {row.selection.due_on} · {row.selection.timezone}
                </h4>
                <p>
                  {row.selection.kind === 'inspection_occurrence'
                    ? 'Recorded plan occurrence'
                    : 'Recorded staff follow-up'}{' '}
                  · {row.planning_status.replaceAll('_', ' ')}
                </p>
                <p>
                  Plan {row.selection.source.plan_id} · revision{' '}
                  {row.selection.source.plan_revision}
                </p>
                <p>
                  Exact visits recorded: {row.exact_visits.length}. Physical
                  completion remains unverified.
                </p>
                <button
                  disabled={busy || !row.can_prepare_visit_proposal}
                  onClick={() =>
                    void task(
                      () => prepareGrowthWorkflowProposal(view, row.selection),
                      setProposal,
                    )
                  }
                >
                  Prepare staff visit proposal
                </button>
                <p>Message / scheduling / billing: BLOCKED</p>
              </article>
            ))}
          </div>
          <button
            disabled={busy}
            onClick={() =>
              void task(
                () => verifyGrowthWorkflow(view),
                (value) => {
                  if (value.status === 'UNKNOWN') {
                    setView(null);
                    setProposal(null);
                    setOpportunity(null);
                    setError(
                      'Current evidence is UNKNOWN. No action was replayed.',
                    );
                  } else
                    setStatus(
                      'Matching available sources captured; current channel consent remains non-atomic and UNKNOWN.',
                    );
                },
              )
            }
          >
            Inspect captured evidence
          </button>
          <details className="gw-opportunity">
            <summary>Optional local opportunity review</summary>
            <p>
              Typed synthetic review text only. No call, message, customer
              response or new lead is created.
            </p>
            <label>
              Review purpose
              <select
                value={purpose}
                onChange={(event) => {
                  setPurpose(
                    event.target.value as GrowthOpportunityInput['purpose'],
                  );
                  setOpportunity(null);
                  if (activeRequest.current)
                    activeRequest.current.synthetic_transcript = '';
                }}
              >
                <option value="reputation">Reputation review</option>
                <option value="referral">Referral review</option>
                <option value="lead_recovery">Lead recovery review</option>
                <option value="receptionist">
                  Synthetic receptionist intake review
                </option>
              </select>
            </label>
            <label>
              Synthetic review note
              <textarea
                value={note}
                maxLength={2000}
                onChange={(event) => {
                  setNote(event.target.value);
                  setOpportunity(null);
                  if (activeRequest.current)
                    activeRequest.current.synthetic_transcript = '';
                }}
              />
            </label>
            <button
              disabled={busy || !note.trim()}
              onClick={() => {
                const request = { purpose, synthetic_transcript: note };
                activeRequest.current = request;
                void task(
                  () => prepareGrowthWorkflowOpportunity(view, request),
                  setOpportunity,
                );
              }}
            >
              Prepare local opportunity review
            </button>
          </details>
        </>
      )}
      {(proposal || opportunity) && (
        <section
          className="gw-result"
          tabIndex={-1}
          ref={result}
          aria-labelledby="gw-result-title"
        >
          <h3 id="gw-result-title">Immutable staff planning preview</h3>
          {proposal && (
            <>
              <p>Proposal {proposal.proposal.id}</p>
              <p>
                Due {proposal.proposal.snapshot.selection.due_on} · exact plan{' '}
                {proposal.proposal.snapshot.selection.source.plan_id}
              </p>
              <p>
                Renewal terms UNKNOWN · no agreement, enrollment or appointment
                created.
              </p>
            </>
          )}
          {opportunity && (
            <>
              <p>Review {opportunity.opportunity.id}</p>
              <p>
                {opportunity.opportunity.snapshot.recommendation.replaceAll(
                  '_',
                  ' ',
                )}
              </p>
              <p>
                Literal signals only; source words never authorize an action.
              </p>
            </>
          )}
          <p>
            Consent CAPTURED NOT ATOMIC · current channel authority UNKNOWN.
          </p>
          <p>Sending, scheduling, billing and financial execution: BLOCKED.</p>
        </section>
      )}
    </section>
  );
}
