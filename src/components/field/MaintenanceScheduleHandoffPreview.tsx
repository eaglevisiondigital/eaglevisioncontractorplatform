import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompanyProfile } from '../../domain/platform';
import { maintenanceKey } from '../../domain/property/maintenance';
import type { PropertyRepository } from '../../lib/property';
import { prepareMaintenanceExamples } from '../../lib/maintenance-examples';
import {
  MaintenanceScheduleHandoff,
  type HandoffOutcome,
  type ScheduleCandidate,
  type ScheduleReview,
} from '../../lib/maintenance-schedule-handoff';
import { MaintenancePlanHistory } from './MaintenancePlanHistory';
import { useResource } from '../forms-state';
import './maintenance-schedule-handoff.css';

export function MaintenanceScheduleHandoffPreview({
  company,
  repo,
}: {
  company: CompanyProfile;
  repo: PropertyRepository;
}) {
  const actor = company.id + '-owner';
  const [handoff] = useState(
    () => new MaintenanceScheduleHandoff(repo, company.id, actor),
  );
  const data = useResource(
    useCallback(async () => {
      await repo.initialize(company);
      await repo.refreshContexts(company.id);
      return handoff.candidates();
    }, [repo, company, handoff]),
  );
  const [selected, setSelected] = useState<ScheduleCandidate | null>(null),
    [planId, setPlanId] = useState(''),
    [date, setDate] = useState('2026-11-27');
  const [review, setReview] = useState<ScheduleReview | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [outcome, setOutcome] = useState<HandoffOutcome | null>(null);
  const [existing, setExisting] = useState<ReturnType<
    MaintenanceScheduleHandoff['inspectExisting']
  > | null>(null);
  const [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [exampleTried, setExampleTried] = useState(false),
    [lostAcknowledgment, setLostAcknowledgment] = useState(false);
  const busyGuard = useRef(false),
    exampleGuard = useRef(false),
    reviewFocus = useRef<HTMLElement>(null),
    resultFocus = useRef<HTMLElement>(null);
  useEffect(() => {
    if (review) reviewFocus.current?.focus();
  }, [review]);
  useEffect(() => {
    if (!data.loading && !data.error && (outcome || existing))
      resultFocus.current?.focus();
  }, [outcome, existing, data.loading, data.error]);
  const clear = () => {
    setReview(null);
    setConfirmed(false);
    setError('');
  };
  const choose = (candidate: ScheduleCandidate) => {
    setSelected(candidate);
    setPlanId(candidate.plans[0]?.id ?? '');
    setDate(candidate.record.follow_up_on || '2026-11-27');
    clear();
    setExisting(null);
    setOutcome(null);
    setMessage('');
    try {
      setOutcome(handoff.retained(candidate.source));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Exact retained state unavailable.',
      );
    }
  };
  const input = () => {
    const plan = selected?.plans.find((p) => p.id === planId);
    if (!selected || !plan)
      throw Error('Select an exact same-property inspection plan.');
    return {
      source: selected.source,
      plan_id: plan.id,
      plan_revision: plan.revision,
      date,
    };
  };
  function inspect() {
    try {
      if (!selected) return;
      setExisting(handoff.inspectExisting(outcome?.source ?? selected.source));
      setError('');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Exact linked draft unavailable.',
      );
    }
  }
  function reviewCurrent() {
    try {
      setReview(handoff.review(input()));
      setConfirmed(false);
      setError('');
    } catch (e) {
      setReview(null);
      setError(e instanceof Error ? e.message : 'Current review unavailable.');
    }
  }
  async function prepare() {
    if (busyGuard.current || !review) return;
    busyGuard.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await handoff.prepare(review, input(), confirmed);
      setOutcome(
        lostAcknowledgment
          ? { ...result, status: 'unknown', visit: null }
          : result,
      );
      setConfirmed(false);
      data.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scheduling outcome unknown.');
      setReview(null);
      setConfirmed(false);
    } finally {
      busyGuard.current = false;
      setBusy(false);
    }
  }
  function reconcile() {
    try {
      if (!selected) return;
      setOutcome(handoff.reconcile(outcome?.source ?? selected.source));
      setError('');
      data.reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Exact reconciliation unavailable.',
      );
    }
  }
  async function examples() {
    if (exampleGuard.current) return;
    exampleGuard.current = true;
    setExampleTried(true);
    setBusy(true);
    setError('');
    try {
      await prepareMaintenanceExamples(repo, company.id, actor);
      data.reload();
      setMessage(
        'Existing synthetic published findings prepared. No follow-up inspection has been created by this control.',
      );
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : 'Source example outcome unknown.') +
          ' No automatic retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  const ready = !data.loading && !data.error && !!data.data;
  return (
    <section className="maintenance-handoff" aria-labelledby="handoff-heading">
      <div className="handoff-heading">
        <div>
          <span className="field-eyebrow">
            EXACT SOURCE / EXPLICIT NEXT STEP
          </span>
          <h2 id="handoff-heading">Maintenance → inspection draft</h2>
          <p>
            Review one published finding, then deliberately prepare its existing
            follow-up workflow.
          </p>
        </div>
        <span className="field-badge">Separate local handoff flag</span>
        <button
          className="secondary"
          disabled={busy || data.loading}
          onClick={() => {
            setSelected(null);
            setOutcome(null);
            setExisting(null);
            clear();
            data.reload();
          }}
        >
          Reload current maintenance sources
        </button>
      </div>
      <p className="handoff-boundary">
        Staff preview only. This creates an inspection draft, not dispatch,
        repair completion, customer authorization or financial work. Session
        memory is not durable recovery custody.
      </p>
      {data.loading ? (
        <p role="status">Loading existing maintenance sources…</p>
      ) : !ready ? (
        <div role="alert">
          <h3>Maintenance handoff unavailable</h3>
          <p>
            Current source and staff verification did not complete. No
            scheduling action is available.
          </p>
          <button
            className="secondary"
            onClick={() => {
              setSelected(null);
              setOutcome(null);
              setExisting(null);
              clear();
              data.reload();
            }}
          >
            Reload current sources
          </button>
        </div>
      ) : (
        <>
          <div className="handoff-columns">
            <div>
              <h3>Published findings</h3>
              <p className="handoff-count">
                {data.data!.length} available exact source records
              </p>
              {!data.data!.length ? (
                <div className="handoff-empty">
                  <h4>No published findings available</h4>
                  <p>
                    Existing reports are required. A missing record is not
                    evidence of repair.
                  </p>
                </div>
              ) : (
                <ul className="handoff-sources">
                  {data.data!.map((c) => (
                    <li key={maintenanceKey(c.source)}>
                      <span className="handoff-source-status">
                        {c.record.scheduled_visit_id
                          ? 'Existing linked inspection'
                          : c.record.review === 'reviewed'
                            ? 'Staff reviewed · reopen in maintenance'
                            : 'Pending staff review'}
                      </span>
                      <h4>{c.property_label}</h4>
                      <p>{c.customer_name}</p>
                      <p>{c.observation}</p>
                      <small>
                        {c.report.visited_on} · report v
                        {c.source.report_version} · {c.severity}
                      </small>
                      <button
                        className="secondary"
                        aria-pressed={
                          selected &&
                          maintenanceKey(selected.source) ===
                            maintenanceKey(c.source)
                            ? true
                            : false
                        }
                        onClick={() => choose(c)}
                        disabled={busy}
                      >
                        Review exact finding
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              {!selected ? (
                <div className="handoff-empty">
                  <h3>Select a published finding</h3>
                  <p>
                    Review the original report and current maintenance/plan
                    revisions before any draft preparation.
                  </p>
                </div>
              ) : (
                <section
                  className="handoff-editor"
                  aria-labelledby="handoff-source-heading"
                >
                  <h3 id="handoff-source-heading">
                    Exact finding & proposed follow-up
                  </h3>
                  <p>
                    <b>{selected.property_label}</b>
                    <br />
                    {selected.customer_name}
                  </p>
                  <dl>
                    <dt>Report / published version</dt>
                    <dd>
                      {selected.source.report_id} / v
                      {selected.source.report_version}
                    </dd>
                    <dt>Finding ID</dt>
                    <dd>{selected.source.finding_id}</dd>
                    <dt>Customer / property</dt>
                    <dd>
                      {selected.source.customer_id} /{' '}
                      {selected.source.location_id}
                    </dd>
                    <dt>Maintenance revision</dt>
                    <dd>{selected.record.revision}</dd>
                    <dt>Follow-up responsibility</dt>
                    <dd>{selected.responsibility}</dd>
                  </dl>
                  <p>
                    <b>Observed:</b> {selected.observation}
                  </p>
                  <p>
                    <b>Recommended:</b> {selected.recommendation}
                  </p>
                  {selected.record.scheduled_visit_id ? (
                    <button
                      className="secondary"
                      onClick={inspect}
                      disabled={busy}
                    >
                      Inspect exact existing draft
                    </button>
                  ) : outcome ? (
                    <p>
                      A scheduling attempt is retained. Preparation cannot be
                      replayed or moved to another date/revision.
                    </p>
                  ) : (
                    <>
                      <label>
                        Same-property inspection plan
                        <select
                          value={planId}
                          onChange={(e) => {
                            setPlanId(e.target.value);
                            clear();
                          }}
                          disabled={busy}
                        >
                          {selected.plans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · revision {p.revision} · {p.timezone}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Proposed inspection date
                        <input
                          type="date"
                          value={date}
                          onChange={(e) => {
                            setDate(e.target.value);
                            clear();
                          }}
                          disabled={busy}
                        />
                      </label>
                      <button
                        onClick={reviewCurrent}
                        disabled={busy || !selected.plans.length}
                      >
                        Review current scheduling evidence
                      </button>
                    </>
                  )}
                  {selected.plans.find((p) => p.id === planId) && (
                    <MaintenancePlanHistory
                      key={JSON.stringify([
                        selected.source,
                        planId,
                        selected.plans.find((p) => p.id === planId)!.revision,
                      ])}
                      repo={repo}
                      org={company.id}
                      actor={actor}
                      source={selected.source}
                      recordRevision={selected.record.revision}
                      plan={selected.plans.find((p) => p.id === planId)!}
                      proposedDate={date}
                    />
                  )}
                  {review && !outcome && (
                    <section
                      className="handoff-review"
                      ref={reviewFocus}
                      tabIndex={-1}
                      aria-labelledby="handoff-review-heading"
                    >
                      <h4 id="handoff-review-heading">
                        Current source & draft review
                      </h4>
                      <dl>
                        <dt>Original source visit / revision</dt>
                        <dd>
                          {review.source_visit.id} /{' '}
                          {review.source_visit.revision}
                        </dd>
                        <dt>Original source plan / revision</dt>
                        <dd>
                          {review.source_plan.id} /{' '}
                          {review.source_plan.revision}
                        </dd>
                        <dt>Selected plan / revision</dt>
                        <dd>
                          {review.selected_plan.id} /{' '}
                          {review.selected_plan.revision}
                        </dd>
                        <dt>Proposed date / timezone</dt>
                        <dd>
                          {review.date} / {review.selected_plan.timezone}
                        </dd>
                        <dt>Reviewed maintenance revision</dt>
                        <dd>{review.candidate.record.revision}</dd>
                      </dl>
                      <p>
                        The draft will contain the selected plan’s blank
                        checklist and no copied finding or private follow-up
                        note.
                      </p>
                      <label className="handoff-confirm">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          onChange={(e) => setConfirmed(e.target.checked)}
                          disabled={busy}
                        />
                        I reviewed this exact source, property, saved plan
                        revision and date. Prepare one local inspection draft.
                      </label>
                      <button
                        onClick={() => void prepare()}
                        disabled={busy || !confirmed}
                      >
                        {busy
                          ? 'Preparing exact draft…'
                          : 'Confirm & prepare inspection draft'}
                      </button>
                    </section>
                  )}
                </section>
              )}
            </div>
          </div>
          {outcome && (
            <section
              className="handoff-result"
              ref={resultFocus}
              tabIndex={-1}
              aria-labelledby="handoff-result-heading"
            >
              <h3 id="handoff-result-heading">
                {outcome.status === 'prepared'
                  ? 'Exact follow-up draft verified'
                  : 'Scheduling outcome UNKNOWN'}
              </h3>
              <p>
                {outcome.status === 'prepared'
                  ? 'The existing maintenance record and new inspection draft match the reviewed source, plan, date and revisions.'
                  : 'No retry, replacement, new date or revised-plan attempt is permitted. Inspect only the exact retained target.'}
              </p>
              <p>
                Target date: {outcome.date} · plan {outcome.selected_plan_id} /
                revision {outcome.selected_plan_revision}
              </p>
              {outcome.visit && (
                <>
                  <dl>
                    <dt>Inspection draft ID / revision</dt>
                    <dd>
                      {outcome.visit.source.visit_id} /{' '}
                      {outcome.visit.source.visit_revision}
                    </dd>
                    <dt>Recorded status</dt>
                    <dd>{outcome.visit.status}</dd>
                    <dt>Property</dt>
                    <dd>{outcome.visit.property_label}</dd>
                  </dl>
                  <p>
                    No dispatch, publication, repair or financial authorization
                    occurred. Reload the read-only schedule above to inspect
                    this retained visit there.
                  </p>
                  <button className="secondary" onClick={inspect}>
                    Inspect exact prepared source & draft
                  </button>
                </>
              )}
              <button className="secondary" onClick={reconcile}>
                Reconcile exact target · read only
              </button>
            </section>
          )}
          {existing && (
            <section
              className="handoff-result"
              ref={resultFocus}
              tabIndex={-1}
              aria-labelledby="handoff-existing-heading"
            >
              <h3 id="handoff-existing-heading">
                Existing source & inspection draft
              </h3>
              <dl>
                <dt>Inspection visit / revision</dt>
                <dd>
                  {existing.row.source.visit_id} /{' '}
                  {existing.row.source.visit_revision}
                </dd>
                <dt>Inspection date / status</dt>
                <dd>
                  {existing.row.date} / {existing.row.status}
                </dd>
                <dt>Original report / version</dt>
                <dd>
                  {existing.report.id} / v{existing.report.version}
                </dd>
                <dt>Original finding</dt>
                <dd>{existing.finding_id}</dd>
              </dl>
              <p>
                {existing.row.property_label} · {existing.row.customer_name}
              </p>
              <p>
                This is a read-only record inspection. Its status does not
                establish repair or dispatch.
              </p>
            </section>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="handoff-alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <details className="handoff-development">
        <summary>Development-only handoff examples</summary>
        <p>
          Use actual existing source workflows to prepare synthetic reports.
          Lost acknowledgement simulation hides the UI result; reconciliation
          must still inspect the exact repository state.
        </p>
        <button
          className="secondary"
          onClick={() => void examples()}
          disabled={busy || !ready || exampleTried}
        >
          Prepare synthetic source reports
        </button>
        <label className="handoff-confirm">
          <input
            type="checkbox"
            checked={lostAcknowledgment}
            onChange={(e) => setLostAcknowledgment(e.target.checked)}
            disabled={busy || !!outcome}
          />
          Simulate lost local acknowledgement display
        </label>
      </details>
    </section>
  );
}
