import { useContext } from 'react';
import { BackOfficeConcept } from './back-office-presentation';
import { RepairDraftPanel } from './RepairDraftPanel';
import { useCallback, useState, useEffect, useRef } from 'react';
import type { CompanyProfile } from '../../domain/platform';
import type { PropertyRepository } from '../../lib/property';
import { prepareMaintenanceExamples } from '../../lib/maintenance-examples';
import {
  emptyMaintenanceFilters,
  filterMaintenance,
  maintenancePriorities,
  type MaintenanceItem,
  type MaintenanceSource,
} from '../../domain/property/maintenance';
import { useResource, useTask } from '../forms-state';
import { Field } from '../phase3/fields';
import { Jobs } from '../phase3/Jobs';
import { Estimates } from '../phase3/Estimates';
import './maintenance.css';

type Queue = Awaited<ReturnType<PropertyRepository['maintenance']>>;
type Work = Awaited<ReturnType<PropertyRepository['maintenanceWork']>>;
export function MaintenanceCenter({
  repo,
  company,
  onSource,
  onVisit,
}: {
  repo: PropertyRepository;
  company: CompanyProfile;
  onSource(source: MaintenanceSource): void;
  onVisit(id: string): void;
}) {
  const org = company.id,
    concept = useContext(BackOfficeConcept);
  const FilterContainer = concept ? 'details' : 'div';
  const resource = useResource(
    useCallback(async () => {
      repo.read(org); // Reject connected mode before looking up staff.
      const members = await repo.operations.listMembers(org);
      const actor = members.find(
        (m) =>
          m.organization_id === org &&
          m.active &&
          ['owner', 'admin'].includes(m.role),
      )?.user_id;
      if (!actor)
        throw Error('An active synthetic contractor reviewer is required.');
      const queue = await repo.maintenance(org, actor);
      return { ...queue, actor, plans: repo.read(org).plans };
    }, [repo, org]),
  );
  const [filters, setFilters] = useState({ ...emptyMaintenanceFilters });
  const [selected, setSelected] = useState('');
  const [simulatedError, setSimulatedError] = useState(false);
  const [work, setWork] = useState<{
    target: 'job' | 'estimate';
    value: Work;
  } | null>(null);
  const task = useTask();
  const data =
    !resource.loading && !resource.error && !simulatedError
      ? resource.data
      : undefined;
  function reload() {
    setSimulatedError(false);
    setWork(null);
    resource.reload();
  }
  const change = (key: keyof typeof filters, value: string) => {
    setSelected('');
    setFilters({ ...filters, [key]: value });
  };
  let items: MaintenanceItem[] = [],
    filterError = '';
  if (data)
    try {
      items = filterMaintenance(data.items, filters);
    } catch (e) {
      filterError = e instanceof Error ? e.message : 'Invalid filters.';
    }
  const selectedItem = items.find((i) => i.key === selected);
  if (data && work)
    return (
      <section aria-label="Linked contractor workflow">
        <button className="secondary" onClick={() => setWork(null)}>
          Back to maintenance queue
        </button>
        <p className="p3-notice">
          Existing plan-linked job and issued baseline. This is not a
          finding-specific repair estimate or work authorization.
        </p>
        {work.target === 'job' ? (
          <Jobs
            key={work.value.job_id}
            repo={repo.estimates}
            company={company}
            operations={repo.operations}
            canManage={true}
            admin={work.value.admin}
            initialJobId={work.value.job_id}
          />
        ) : (
          <Estimates
            key={work.value.bundle.version.id}
            repo={repo.estimates}
            company={company}
            canIssue={work.value.admin}
            initialBundle={work.value.bundle}
          />
        )}
      </section>
    );
  return (
    <section
      className="maintenance-center"
      aria-label="Maintenance & follow-up center"
      data-focused={concept && selectedItem ? 'true' : undefined}
    >
      <div className="section-title">
        <div>
          <span className="eyebrow">INTERNAL PROPERTY FOLLOW-UP</span>
          <h3>Maintenance & Follow-Up Center</h3>
        </div>
        <button className="secondary" onClick={reload} disabled={task.busy}>
          Reload maintenance queue
        </button>
      </div>
      <p>
        {concept ? (
          'Published findings for deliberate follow-up. Staff review never establishes repair completion or customer authority.'
        ) : (
          <>
            Review published concerns, plan a follow-up and keep internal
            coordination separate from inspection evidence. Review and
            scheduling never establish repair completion, customer approval or a
            financial obligation.
          </>
        )}
      </p>
      {resource.loading ? (
        <p role="status">Loading contractor maintenance evidence…</p>
      ) : !data ? (
        <p role="alert">
          {simulatedError
            ? 'Maintenance queue unavailable. This is a simulated error.'
            : 'Maintenance evidence or staff access is unavailable.'}{' '}
          Reload the queue before continuing.
        </p>
      ) : (
        <>
          <p className="muted">
            Synthetic reviewer: {data.actor}. Session-only triage; no dispatch
            or customer messages.
          </p>
          {concept && (
            <div className="concept-queue-summary" aria-label="Queue overview">
              {[
                [data.items.length, 'Published findings'],
                [
                  data.items.filter((i) => i.status === 'pending').length,
                  'Pending review',
                ],
                [
                  data.items.filter((i) => !i.record.assignee_id).length,
                  'Unassigned',
                ],
                [
                  data.items.filter((i) => i.scheduled_on).length,
                  'Inspection drafts',
                ],
              ].map(([count, label]) => (
                <div key={label}>
                  <strong>{count}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          )}
          {concept && selectedItem && (
            <div className="concept-finding-heading">
              <button className="secondary" onClick={() => setSelected('')}>
                ← Back to work queue
              </button>
              <p className="eyebrow">
                FINDING REVIEW / PUBLISHED v{selectedItem.source.report_version}
              </p>
              <h3>{selectedItem.property_label}</h3>
              <p>
                {selectedItem.customer_name} · {selectedItem.finding.location}
              </p>
              <p>
                <strong>{selectedItem.finding.description}</strong>
              </p>
              <span>
                Reported severity: {selectedItem.finding.severity} ·{' '}
                {selectedItem.report.visited_on} · Repair status undetermined
              </span>
              <button
                className="secondary"
                onClick={() => onSource(selectedItem.source)}
              >
                Open this published source
              </button>
            </div>
          )}
          <div className="maintenance-queue-content">
            <FilterContainer
              className={concept ? 'concept-filter-disclosure' : undefined}
            >
              {concept && <summary>Filter work queue</summary>}
              <div
                className="maintenance-filters"
                role="group"
                aria-label="Maintenance queue filters"
              >
                <Field label="Maintenance property">
                  <select
                    value={filters.property}
                    onChange={(e) => change('property', e.target.value)}
                  >
                    <option value="">All company properties</option>
                    {[
                      ...new Map(
                        data.items.map((i) => [
                          i.source.location_id,
                          i.property_label,
                        ]),
                      ).entries(),
                    ].map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Queue priority">
                  <select
                    value={filters.priority}
                    onChange={(e) => change('priority', e.target.value)}
                  >
                    <option value="">All priorities</option>
                    {maintenancePriorities.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Queue responsibility">
                  <select
                    value={filters.responsibility}
                    onChange={(e) => change('responsibility', e.target.value)}
                  >
                    <option value="">All responsibility</option>
                    <option value="unassigned">Unassigned</option>
                    {data.members.map((m) => (
                      <option value={m.user_id} key={m.user_id}>
                        {m.label} · {m.user_id}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Queue review status">
                  <select
                    value={filters.status}
                    onChange={(e) => change('status', e.target.value)}
                  >
                    <option value="">All review statuses</option>
                    {['pending', 'scheduled', 'reviewed'].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Follow-up date from">
                  <input
                    type="date"
                    value={filters.from}
                    onChange={(e) => change('from', e.target.value)}
                  />
                </Field>
                <Field label="Follow-up date to">
                  <input
                    type="date"
                    value={filters.to}
                    onChange={(e) => change('to', e.target.value)}
                  />
                </Field>
                <Field label="Attention needed">
                  <select
                    value={filters.attention}
                    onChange={(e) => change('attention', e.target.value)}
                  >
                    <option value="">All reported findings</option>
                    <option value="review">Needs staff review</option>
                    <option value="recurring">Recurring identifiers</option>
                  </select>
                </Field>
                <button
                  className="secondary"
                  onClick={() => setFilters({ ...emptyMaintenanceFilters })}
                >
                  Reset maintenance filters
                </button>
              </div>
            </FilterContainer>
            {filterError && (
              <p role="alert">{filterError} No queue results are displayed.</p>
            )}
            <p role="status">
              {items.length} of {data.items.length} published finding records
              shown. Available evidence only; missing reports may exist.
            </p>
            {!items.length && !filterError && (
              <p>
                {data.items.length
                  ? 'No maintenance findings match these filters.'
                  : 'No published concerns are available. Publish an inspection through the existing review workflow, or prepare the explicit synthetic examples below.'}
              </p>
            )}
            <div className="maintenance-grid">
              {items.map((item) => (
                <article
                  key={item.key}
                  className="maintenance-card"
                  data-maintenance-key={item.key}
                  data-report-id={item.source.report_id}
                  data-report-version={item.source.report_version}
                  data-priority={item.record.priority}
                >
                  <span className="badge">
                    {item.status} · priority {item.record.priority}
                  </span>
                  <h4>
                    {item.finding.category} · {item.finding.location}
                  </h4>
                  <p>
                    <strong>{item.property_label}</strong>
                    <br />
                    {item.customer_name}
                  </p>
                  <p>{item.finding.description}</p>
                  {concept ? (
                    <details className="concept-card-evidence">
                      <summary>
                        Published evidence · {item.report.visited_on} ·{' '}
                        {item.finding.severity}
                      </summary>{' '}
                      <p>Recommendation: {item.finding.recommendation}</p>
                      <p>
                        Reported severity: {item.finding.severity} · Inspection{' '}
                        {item.report.visited_on}
                      </p>
                      <p>
                        {item.recurring
                          ? 'Possible recurring identifier across ' +
                            item.inspection_dates +
                            ' inspection dates; physical continuity is unconfirmed.'
                          : 'No supported recurrence established in the available reports.'}
                      </p>
                      <p className="muted">
                        Report {item.source.report_id} · Published v
                        {item.source.report_version} · Finding{' '}
                        {item.source.finding_id}. Repair status undetermined.
                      </p>
                    </details>
                  ) : (
                    <>
                      {' '}
                      <p>Recommendation: {item.finding.recommendation}</p>
                      <p>
                        Reported severity: {item.finding.severity} · Inspection{' '}
                        {item.report.visited_on}
                      </p>
                      <p>
                        {item.recurring
                          ? 'Possible recurring identifier across ' +
                            item.inspection_dates +
                            ' inspection dates; physical continuity is unconfirmed.'
                          : 'No supported recurrence established in the available reports.'}
                      </p>
                      <p>
                        Responsible:{' '}
                        {item.record.assignee_id
                          ? (data.members.find(
                              (m) => m.user_id === item.record.assignee_id,
                            )?.label ??
                            'Inactive or unavailable staff — reassign responsibility')
                          : 'Unassigned'}{' '}
                        · Follow-up: {item.record.follow_up_on || 'Not set'}
                      </p>
                      {item.scheduled_on && (
                        <p>
                          Inspection draft prepared for {item.scheduled_on}. No
                          dispatch or work authorization.
                        </p>
                      )}
                      <p className="muted">
                        Report {item.source.report_id} · Published v
                        {item.source.report_version} · Finding{' '}
                        {item.source.finding_id}. Repair status undetermined.
                      </p>
                    </>
                  )}
                  {concept && (
                    <div className="concept-card-coordination">
                      {' '}
                      <p>
                        Responsible:{' '}
                        {item.record.assignee_id
                          ? (data.members.find(
                              (m) => m.user_id === item.record.assignee_id,
                            )?.label ??
                            'Inactive or unavailable staff — reassign responsibility')
                          : 'Unassigned'}{' '}
                        · Follow-up: {item.record.follow_up_on || 'Not set'}
                      </p>
                      {item.scheduled_on && (
                        <p>
                          Inspection draft prepared for {item.scheduled_on}. No
                          dispatch or work authorization.
                        </p>
                      )}
                    </div>
                  )}
                  {item.repair && (
                    <p>
                      Repair preparation: {item.repair.status} ·{' '}
                      {item.repair.draft_version_id ||
                        'Reconciliation required'}
                      . Contractor draft only; no customer approval.
                    </p>
                  )}
                  {item.repair && (
                    <p>
                      {item.repair.readiness
                        ? `Internal readiness: ${item.repair.readiness.confirmed}/6 sections for saved revision ${item.repair.readiness.revision}. Issuance remains blocked.`
                        : 'No current readiness confirmation available. Open the exact repair draft to review.'}
                    </p>
                  )}
                  <div className="maintenance-actions">
                    <button
                      onClick={() => setSelected(item.key)}
                      aria-pressed={selected === item.key}
                    >
                      Review finding
                    </button>
                    <button
                      className="secondary"
                      onClick={() => onSource(item.source)}
                    >
                      Open exact source inspection
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
          <div className="concept-selected-work">
            {selectedItem && (
              <MaintenanceEditor
                key={selectedItem.key + ':' + selectedItem.record.revision}
                item={selectedItem}
                members={data.members}
                plans={data.plans}
                busy={task.busy}
                onSave={(input) =>
                  void task.run(async () => {
                    await repo.saveMaintenance(
                      org,
                      data.actor,
                      selectedItem.source,
                      selectedItem.record.revision,
                      input,
                    );
                    resource.reload();
                  }, 'Internal review saved. Published evidence unchanged.')
                }
                onSchedule={(plan, date) =>
                  void task.run(async () => {
                    await repo.scheduleMaintenance(
                      org,
                      data.actor,
                      selectedItem.source,
                      selectedItem.record.revision,
                      plan,
                      date,
                    );
                    resource.reload();
                  }, 'Follow-up inspection draft prepared. No dispatch or repair authorized.')
                }
                onVisit={onVisit}
                onWork={(target) =>
                  void task.run(async () => {
                    const value = await repo.maintenanceWork(
                      org,
                      data.actor,
                      selectedItem.source,
                    );
                    setWork({ target, value });
                  }, 'Exact linked workflow opened.')
                }
              />
            )}
            {selectedItem && (
              <RepairDraftPanel
                key={
                  'repair:' +
                  selectedItem.key +
                  ':' +
                  selectedItem.record.revision
                }
                repo={repo}
                company={company}
                actor={data.actor}
                item={selectedItem}
                onSource={onSource}
                onChanged={resource.reload}
              />
            )}
          </div>
        </>
      )}
      {task.message && <p role="status">{task.message}</p>}
      <details className="maintenance-demo">
        <summary>Development-only maintenance examples & states</summary>
        <p>
          Explicit generated examples use existing CRM, inspection and
          publication workflows. No real data or customer access.
        </p>
        <button
          disabled={!data || task.busy}
          onClick={() =>
            data &&
            void task.run(async () => {
              await prepareMaintenanceExamples(repo, org, data.actor);
              resource.reload();
            }, 'Synthetic published maintenance examples prepared.')
          }
        >
          Prepare synthetic maintenance examples
        </button>
        <button
          className="secondary"
          disabled={task.busy}
          onClick={() => {
            setSelected('');
            setWork(null);
            setSimulatedError(true);
          }}
        >
          Simulate maintenance error
        </button>
      </details>
    </section>
  );
}

function MaintenanceEditor({
  item,
  members,
  plans,
  busy,
  onSave,
  onSchedule,
  onVisit,
  onWork,
}: {
  item: MaintenanceItem;
  members: Queue['members'];
  plans: ReturnType<PropertyRepository['read']>['plans'];
  busy: boolean;
  onSave(input: Parameters<PropertyRepository['saveMaintenance']>[4]): void;
  onSchedule(plan: { id: string; revision: number }, date: string): void;
  onVisit(id: string): void;
  onWork(target: 'job' | 'estimate'): void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus();
  }, []);
  const [edit, setEdit] = useState({
    priority: item.record.priority,
    assignee_id: item.record.assignee_id,
    follow_up_on: item.record.follow_up_on,
    review: item.record.review,
    note: '',
  });
  const [date, setDate] = useState(item.record.follow_up_on);
  const [planId, setPlanId] = useState(item.plan_id);
  const available = plans.filter(
    (p) =>
      p.customer_id === item.source.customer_id &&
      p.location_id === item.source.location_id,
  );
  const plan = available.find((p) => p.id === planId);
  return (
    <section
      ref={panel}
      tabIndex={-1}
      className="maintenance-editor"
      aria-label="Maintenance review"
    >
      <h3>Review · {item.finding.location}</h3>
      <p>
        {item.customer_name} · {item.property_label} · Triage revision{' '}
        {item.record.revision}. Staff review is not repair completion.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(edit);
        }}
      >
        <fieldset disabled={busy}>
          <legend>Internal coordination only</legend>
          <div className="maintenance-filters">
            <Field label="Manual priority">
              <select
                value={edit.priority}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    priority: e.target.value as typeof edit.priority,
                  })
                }
              >
                {maintenancePriorities.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Field>
            <Field label="Responsible staff">
              <select
                value={edit.assignee_id ?? ''}
                onChange={(e) =>
                  setEdit({ ...edit, assignee_id: e.target.value || null })
                }
              >
                <option value="">Unassigned</option>
                {edit.assignee_id &&
                  !members.some((m) => m.user_id === edit.assignee_id) && (
                    <option value={edit.assignee_id}>
                      Inactive staff — choose an active member
                    </option>
                  )}
                {members.map((m) => (
                  <option value={m.user_id} key={m.user_id}>
                    {m.label} · {m.user_id}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Internal follow-up date">
              <input
                type="date"
                value={edit.follow_up_on}
                onChange={(e) =>
                  setEdit({ ...edit, follow_up_on: e.target.value })
                }
              />
            </Field>
            <Field label="Staff review decision">
              <select
                value={edit.review}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    review: e.target.value as typeof edit.review,
                  })
                }
              >
                <option value="pending">Pending review</option>
                <option value="reviewed">Reviewed by staff</option>
              </select>
            </Field>
          </div>
          <Field label="Append internal follow-up note">
            <textarea
              maxLength={2000}
              value={edit.note}
              onChange={(e) => setEdit({ ...edit, note: e.target.value })}
            />
          </Field>
          <button>Save internal review</button>
        </fieldset>
      </form>
      <details>
        <summary>Internal follow-up notes ({item.record.notes.length})</summary>
        {item.record.notes.map((n) => (
          <p key={n.id}>
            {n.text}
            <br />
            <small>
              {n.author_id} · {n.recorded_at}
            </small>
          </p>
        ))}
        {!item.record.notes.length && (
          <p>No internal follow-up notes recorded.</p>
        )}
      </details>
      <details>
        <summary>Evidence & uncertainty</summary>
        <p>
          Exact finding {item.source.finding_id} in report{' '}
          {item.source.report_id} v{item.source.report_version}.
        </p>
        {item.uncertainties.map((u) => (
          <p key={u}>{u}</p>
        ))}
      </details>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (plan) onSchedule({ id: plan.id, revision: plan.revision }, date);
        }}
      >
        <fieldset
          disabled={
            busy ||
            !!item.record.scheduled_visit_id ||
            item.record.review === 'reviewed'
          }
        >
          <legend>Prepare an inspection draft · no dispatch</legend>
          <div className="maintenance-filters">
            <Field label="Follow-up inspection plan">
              <select
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
              >
                {available.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name} · revision {p.revision}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Draft inspection date">
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>
          <button disabled={!plan}>Prepare follow-up inspection draft</button>
        </fieldset>
      </form>
      {item.record.scheduled_visit_id && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => onVisit(item.record.scheduled_visit_id!)}
        >
          Open prepared inspection draft
        </button>
      )}
      {item.record.review === 'reviewed' && !item.record.scheduled_visit_id && (
        <p>
          Set review to Pending review and save before preparing a follow-up
          draft.
        </p>
      )}
      {item.job_id ? (
        <div className="maintenance-actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => onWork('job')}
          >
            Open linked job workflow
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => onWork('estimate')}
          >
            Open job’s issued baseline estimate
          </button>
        </div>
      ) : (
        <p>
          No job is explicitly linked to this inspection plan. No job or
          estimate will be created automatically.
        </p>
      )}
    </section>
  );
}
