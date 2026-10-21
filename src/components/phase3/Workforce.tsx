import { useState, useCallback } from 'react';
import type { Phase3Repository, WorkforceData } from '../../lib/phase3';
import type {
  Worker,
  TimeEntry,
  PayrollRow,
} from '../../domain/workforce/payroll';
import { payrollCsv, employerBoundary } from '../../domain/workforce/payroll';
import { formatMinor } from '../../domain/estimating/calculation';
import { useResource, useTask } from '../forms-state';
import { FieldsForm, ResourceStatus } from '../forms';
import { Field } from './fields';
export function Workforce({
  repo,
  org,
}: {
  repo: Phase3Repository;
  org: string;
}) {
  const data = useResource(useCallback(() => repo.workforce(org), [repo, org]));
  return (
    <article className="p3-workspace">
      <div className="section-title">
        <div>
          <span className="eyebrow">PEOPLE & PROJECT TIME</span>
          <h2>Workforce & labor</h2>
        </div>
        <button className="secondary" onClick={data.reload}>
          Refresh timesheets
        </button>
      </div>
      <ResourceStatus {...data} />
      {data.data && (
        <WorkforceView
          key={`${data.data.entries.length}-${data.data.reviews.length}-${data.data.periods.length}-${data.data.workers.length}-${data.data.entries
            .filter((e) => !e.ended_at)
            .map((e) => e.id)
            .join()}`}
          repo={repo}
          org={org}
          data={data.data}
          refresh={data.reload}
        />
      )}
    </article>
  );
}
function WorkforceView({
  repo,
  org,
  data,
  refresh,
}: {
  repo: Phase3Repository;
  org: string;
  data: WorkforceData;
  refresh: () => void;
}) {
  const task = useTask();
  const [tab, setTab] = useState<
    'clock' | 'timesheets' | 'workers' | 'payroll'
  >('clock');
  const [workerId, setWorkerId] = useState(data.workers[0]?.id ?? '');
  const worker = data.workers.find((w) => w.id === workerId);
  const [target, setTarget] = useState(
    data.jobs[0]?.id ?? 'overhead:Administration',
  );
  const [activity, setActivity] = useState('Project work');
  const [billable, setBillable] = useState(true);
  const [filterWorker, setFilterWorker] = useState('all');
  const open = data.entries.find(
    (e) => e.worker_id === workerId && !e.ended_at,
  );
  const timezone = data.policy?.timezone ?? 'UTC';
  const when = (value: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(value));
  const jobId = target.startsWith('overhead:') ? null : target;
  const overhead = target.startsWith('overhead:') ? target.slice(9) : null;
  const clock = (action: string) =>
    void task.run(async () => {
      await repo.clock(org, workerId, action, {
        job_id: jobId,
        overhead_center: overhead,
        task: activity,
        billable,
      });
      refresh();
    }, `Clock ${action} recorded`);
  return (
    <>
      <p className="muted">
        {data.policy
          ? `Employer timezone ${timezone} · workweek begins ${['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][data.policy.week_start]}. Overtime combines all jobs and approved overhead.`
          : 'Configure and review the employer workweek policy before recording time.'}
      </p>
      <div className="p3-tabs">
        {(
          [
            'clock',
            'timesheets',
            ...(data.payroll_admin ? ['workers', 'payroll'] : []),
          ] as ('clock' | 'timesheets' | 'workers' | 'payroll')[]
        ).map((t) => (
          <button
            key={t}
            className={tab === t ? 'active' : 'secondary'}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t === 'clock'
              ? 'Time clock'
              : t === 'timesheets'
                ? 'Timesheets'
                : t === 'workers'
                  ? 'Workers & rates'
                  : 'Payroll preparation'}
          </button>
        ))}
      </div>
      {tab === 'clock' ? (
        <section className="time-clock">
          <span className="eyebrow">
            {open ? 'ON THE CLOCK' : 'READY WHEN YOU ARE'}
          </span>
          <h3>
            {open
              ? open.kind === 'break'
                ? 'Unpaid break'
                : open.kind === 'break_paid'
                  ? 'Paid break'
                  : 'Working'
              : 'Start your next activity'}
          </h3>
          <p>
            {open
              ? `Started ${when(open.started_at)} · ${data.jobs.find((j) => j.id === open.job_id)?.name ?? open.overhead_center}`
              : 'Every segment belongs to a job or approved overhead center.'}
          </p>
          <div className="form-grid">
            <Field label="Clock worker">
              <select
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
              >
                {data.workers
                  .filter((w) => w.active)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.display_name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Clock job or overhead">
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {data.jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
                {(
                  (
                    data.policy as typeof data.policy & {
                      overhead_centers?: string[];
                    }
                  )?.overhead_centers ?? [
                    'Estimating',
                    'Purchasing',
                    'Scheduling',
                    'Bookkeeping',
                    'Administration',
                  ]
                ).map((c) => (
                  <option key={c} value={`overhead:${c}`}>
                    Overhead · {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Clock task">
              <input
                value={activity}
                maxLength={200}
                onChange={(e) => setActivity(e.target.value)}
              />
            </Field>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
            />
            Potentially billable work (does not authorize a customer charge)
          </label>
          <div className="clock-actions">
            {!open ? (
              <button
                disabled={task.busy || !worker || !data.policy}
                onClick={() => clock('start')}
              >
                Clock in
              </button>
            ) : (
              <>
                <button disabled={task.busy} onClick={() => clock('stop')}>
                  Clock out
                </button>
                {open.kind === 'work' ? (
                  <>
                    <button
                      className="secondary"
                      disabled={task.busy}
                      onClick={() => clock('break_paid')}
                    >
                      Start paid break
                    </button>
                    <button
                      className="secondary"
                      disabled={task.busy}
                      onClick={() => clock('break')}
                    >
                      Start unpaid break
                    </button>
                  </>
                ) : (
                  <button
                    className="secondary"
                    disabled={task.busy}
                    onClick={() => clock('resume')}
                  >
                    Resume work
                  </button>
                )}
                <button
                  className="secondary"
                  disabled={task.busy}
                  onClick={() => clock('switch')}
                >
                  Switch to selected job / task
                </button>
              </>
            )}
          </div>
          <p>
            Paid breaks contribute labor costs; unpaid breaks do not. Follow the
            reviewed employer break policy. Clock actions use server timestamps
            in connected mode.
          </p>
          <div className="p3-notice">
            <strong>Classification and economic cost are separate</strong>
            <p>
              Worker type is a company record, not legal proof of classification
              or overtime exemption. Owner and unpaid administrative time can
              carry imputed cost without creating payroll wages.
            </p>
          </div>
        </section>
      ) : tab === 'timesheets' ? (
        <>
          <div className="section-title">
            <h3>Employee timesheets</h3>
            <Field label="Filter timesheet worker">
              <select
                value={filterWorker}
                onChange={(e) => setFilterWorker(e.target.value)}
              >
                <option value="all">All authorized workers</option>
                {data.workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.display_name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="timesheet-list">
            {data.entries
              .filter(
                (e) => filterWorker === 'all' || e.worker_id === filterWorker,
              )
              .slice()
              .reverse()
              .map((e) => {
                const review = data.reviews.find((r) => r.entry_id === e.id);
                const locked = data.periods.some(
                  (p) =>
                    p.status === 'locked' &&
                    p.starts_at < (e.ended_at ?? '9999') &&
                    p.ends_at > e.started_at,
                );
                return (
                  <div className="time-record" key={e.id}>
                    <div className="section-title">
                      <strong>
                        {
                          data.workers.find((w) => w.id === e.worker_id)
                            ?.display_name
                        }{' '}
                        · {e.task}
                      </strong>
                      <span className="status">
                        {locked
                          ? 'Locked payroll'
                          : (review?.decision ??
                            (e.submitted ? 'Awaiting review' : 'Draft time'))}
                      </span>
                    </div>
                    <p>
                      {data.jobs.find((j) => j.id === e.job_id)?.name ??
                        e.overhead_center}{' '}
                      · {e.kind.replaceAll('_', ' ')} · {when(e.started_at)} →{' '}
                      {e.ended_at ? when(e.ended_at) : 'clock running'}
                    </p>
                    <p>
                      {e.ended_at
                        ? (
                            (Date.parse(e.ended_at) -
                              Date.parse(e.started_at)) /
                            3600000
                          ).toFixed(3)
                        : '—'}{' '}
                      hours ·{' '}
                      {e.billable
                        ? 'Potentially billable'
                        : 'Unbilled / overhead'}
                      {e.corrects_id &&
                        ` · correction of ${e.corrects_id.slice(0, 8)}`}
                    </p>
                    <div className="button-row">
                      {e.ended_at && !e.submitted && !locked && (
                        <button
                          onClick={() =>
                            void task.run(async () => {
                              await repo.submitTime(org, e.id);
                              refresh();
                            }, 'Time submitted')
                          }
                        >
                          Submit time
                        </button>
                      )}
                      {e.submitted &&
                        !review &&
                        !locked &&
                        data.review_worker_ids.includes(e.worker_id) && (
                          <>
                            <button
                              onClick={() =>
                                void task.run(async () => {
                                  await repo.reviewTime(
                                    org,
                                    e.id,
                                    'approved',
                                    'Supervisor reviewed job, timestamps and breaks',
                                  );
                                  refresh();
                                }, 'Time approved')
                              }
                            >
                              Approve time
                            </button>
                            <button
                              className="secondary"
                              onClick={() =>
                                void task.run(async () => {
                                  await repo.reviewTime(
                                    org,
                                    e.id,
                                    'rejected',
                                    'Supervisor requires a corrected time entry',
                                  );
                                  refresh();
                                }, 'Time rejected')
                              }
                            >
                              Reject time
                            </button>
                          </>
                        )}
                    </div>
                    {!e.ended_at && data.payroll_admin && (
                      <details>
                        <summary>Resolve missed clock-out</summary>
                        <FieldsForm
                          fields={[
                            {
                              name: 'ended_at',
                              label:
                                'Corrected clock-out timestamp with offset',
                              required: true,
                            },
                            {
                              name: 'reason',
                              label:
                                'Clock correction reason and supervisor evidence',
                              required: true,
                              maxLength: 950,
                            },
                          ]}
                          submitLabel="Approve clock correction"
                          onSubmit={(v) =>
                            task
                              .run(async () => {
                                await repo.resolveClock(
                                  org,
                                  e.worker_id,
                                  String(v.ended_at),
                                  String(v.reason),
                                );
                                refresh();
                              }, 'Clock correction recorded and approved')
                              .then(() => {})
                          }
                        />
                      </details>
                    )}
                    <small>Record ID: {e.id}</small>
                  </div>
                );
              })}
          </div>
          <details>
            <summary>Add manual time or audited correction</summary>
            <p>
              Enter ISO timestamps with an explicit offset, for example
              2026-10-12T08:00:00-05:00. Correct approved, unlocked time with a
              new record; locked periods require a payroll adjustment.
            </p>
            <FieldsForm
              initial={{ worker_id: workerId, kind: 'work', billable: false }}
              fields={[
                {
                  name: 'worker_id',
                  label: 'Timesheet worker',
                  type: 'select',
                  options: data.workers.map((w) => ({
                    value: w.id,
                    label: w.display_name,
                  })),
                },
                {
                  name: 'target',
                  label: 'Time job or overhead',
                  type: 'select',
                  options: [
                    ...data.jobs.map((j) => ({ value: j.id, label: j.name })),
                    ...[
                      'Estimating',
                      'Purchasing',
                      'Scheduling',
                      'Bookkeeping',
                      'Administration',
                    ].map((c) => ({
                      value: `overhead:${c}`,
                      label: `Overhead · ${c}`,
                    })),
                  ],
                },
                {
                  name: 'task',
                  label: 'Time task',
                  required: true,
                  maxLength: 200,
                },
                {
                  name: 'kind',
                  label: 'Time segment type',
                  type: 'select',
                  options: [
                    { value: 'work', label: 'Work' },
                    { value: 'break_paid', label: 'Paid break' },
                    { value: 'break', label: 'Unpaid break' },
                  ],
                },
                {
                  name: 'started_at',
                  label: 'Start timestamp with offset',
                  required: true,
                },
                {
                  name: 'ended_at',
                  label: 'End timestamp with offset',
                  required: true,
                },
                {
                  name: 'billable',
                  label: 'Potentially billable time',
                  type: 'checkbox',
                },
                {
                  name: 'corrects_id',
                  label: 'Approved time ID being corrected (optional)',
                },
              ]}
              submitLabel="Save manual time draft"
              onSubmit={(v) =>
                task
                  .run(async () => {
                    const t = String(v.target);
                    await repo.recordTime(org, String(v.worker_id), {
                      job_id: t.startsWith('overhead:') ? null : t,
                      overhead_center: t.startsWith('overhead:')
                        ? t.slice(9)
                        : null,
                      task: String(v.task),
                      kind: v.kind as TimeEntry['kind'],
                      started_at: String(v.started_at),
                      ended_at: String(v.ended_at),
                      billable: !!v.billable,
                      corrects_id: String(v.corrects_id) || null,
                    });
                    refresh();
                  }, 'Time draft saved')
                  .then(() => {})
              }
            />
          </details>
        </>
      ) : tab === 'workers' ? (
        <WorkerSettings repo={repo} org={org} data={data} refresh={refresh} />
      ) : (
        <PayrollPreparation
          repo={repo}
          org={org}
          data={data}
          refresh={refresh}
        />
      )}
      {task.message && <p role="status">{task.message}</p>}
    </>
  );
}
function WorkerSettings({
  repo,
  org,
  data,
  refresh,
}: {
  repo: Phase3Repository;
  org: string;
  data: WorkforceData;
  refresh: () => void;
}) {
  const members = useResource(
    useCallback(() => repo.operations.listMembers(org), [repo, org]),
  );
  const task = useTask();
  const [editing, setEditing] = useState<Worker | null>();
  return (
    <>
      <h3>Company worker profiles & effective rates</h3>
      <p>
        Rates are private to payroll administrators. Fully loaded estimates,
        actual cash rates, burden, billing value and imputed economic cost are
        distinct. Invoice-costed contractors cannot also generate time-based
        cash fees.
      </p>
      {data.workers.map((w) => {
        const rate = data.rates.filter((r) => r.worker_id === w.id).at(-1);
        return (
          <div className="expense-record" key={w.id}>
            <div className="section-title">
              <strong>{w.display_name}</strong>
              <button className="secondary" onClick={() => setEditing(w)}>
                Add effective rate / update worker
              </button>
            </div>
            <p>
              {w.worker_type} · cost source {w.cost_source} ·{' '}
              {w.active ? 'active' : 'inactive'}
            </p>
            {rate && (
              <p>
                Cash hourly {rate.cash_hour_minor} minor units · salary weekly{' '}
                {rate.salary_week_minor} · burden {rate.burden_bps / 100}% ·
                loaded estimate {rate.estimated_loaded_hour_minor} · billing{' '}
                {rate.billing_hour_minor} · imputed {rate.imputed_hour_minor} ·
                effective {rate.effective_from}
              </p>
            )}
          </div>
        );
      })}
      <button onClick={() => setEditing(null)}>Add worker profile</button>
      {editing !== undefined && (
        <FieldsForm
          key={editing?.id ?? 'new'}
          initial={
            editing
              ? { ...editing }
              : {
                  worker_type: 'w2_hourly',
                  cost_source: 'time',
                  active: true,
                  cash_hour_minor: 0,
                  salary_week_minor: 0,
                  burden_bps: 0,
                  estimated_loaded_hour_minor: 0,
                  billing_hour_minor: 0,
                  imputed_hour_minor: 0,
                  overtime_eligible: true,
                  effective_from: '2026-10-01T00:00:00Z',
                }
          }
          fields={[
            {
              name: 'user_id',
              label: 'Worker company member',
              type: 'select',
              options: (members.data ?? [])
                .filter((m) => m.active)
                .map((m) => ({
                  value: m.user_id,
                  label: `${m.role} · ${m.staff_type} · ${m.user_id.slice(-12)}`,
                })),
            },
            {
              name: 'display_name',
              label: 'Worker name',
              required: true,
              maxLength: 160,
            },
            {
              name: 'worker_type',
              label: 'Worker classification record',
              type: 'select',
              options: [
                'w2_hourly',
                'salaried',
                'contractor_1099',
                'owner',
                'other',
              ].map((value) => ({ value, label: value })),
            },
            {
              name: 'cost_source',
              label: 'Labor cash cost source',
              type: 'select',
              options: [
                { value: 'time', label: 'Approved time' },
                {
                  value: 'invoice',
                  label: 'Reviewed contractor invoice (no time cash)',
                },
                { value: 'imputed', label: 'Imputed only (no payroll wages)' },
              ],
            },
            { name: 'active', label: 'Active worker', type: 'checkbox' },
            {
              name: 'effective_from',
              label: 'Rate effective timestamp with offset',
              required: true,
            },
            ...[
              'cash_hour_minor',
              'salary_week_minor',
              'estimated_loaded_hour_minor',
              'billing_hour_minor',
              'imputed_hour_minor',
            ].map((name) => ({
              name,
              label: name.replaceAll('_', ' ') + ' · currency minor units',
              type: 'number' as const,
              min: 0,
              max: 1e9,
              required: true,
            })),
            {
              name: 'burden_bps',
              label: 'Employer burden basis points',
              type: 'number',
              min: 0,
              max: 100000,
              required: true,
            },
            {
              name: 'overtime_eligible',
              label: 'Overtime eligible under independently reviewed policy',
              type: 'checkbox',
            },
            {
              name: 'classification_review_reference',
              label: 'Classification and rate review reference',
              required: true,
              maxLength: 1000,
            },
          ]}
          submitLabel="Save worker & effective rate"
          onSubmit={(v) =>
            task
              .run(async () => {
                await repo.saveWorker(
                  org,
                  {
                    user_id: String(v.user_id),
                    display_name: String(v.display_name),
                    worker_type: v.worker_type as Worker['worker_type'],
                    cost_source: v.cost_source as Worker['cost_source'],
                    active: !!v.active,
                  },
                  {
                    effective_from: String(v.effective_from),
                    cash_hour_minor: Number(v.cash_hour_minor),
                    salary_week_minor: Number(v.salary_week_minor),
                    burden_bps: Number(v.burden_bps),
                    estimated_loaded_hour_minor: Number(
                      v.estimated_loaded_hour_minor,
                    ),
                    billing_hour_minor: Number(v.billing_hour_minor),
                    imputed_hour_minor: Number(v.imputed_hour_minor),
                    overtime_eligible: !!v.overtime_eligible,
                    classification_review_reference: String(
                      v.classification_review_reference,
                    ),
                  },
                  editing?.id,
                );
                setEditing(undefined);
                refresh();
              }, 'Effective worker rate saved')
              .then(() => {})
          }
        />
      )}
      <details>
        <summary>Employer workweek and overhead policy</summary>
        <p>
          After time exists, changing the workweek requires a reviewed versioned
          migration. This first implementation supports weekly overtime and does
          not claim jurisdiction-specific payroll compliance.
        </p>
        <FieldsForm
          initial={{
            timezone: 'America/Chicago',
            week_start: 7,
            overtime_after_seconds: 144000,
            overtime_multiplier_bps: 15000,
          }}
          fields={[
            {
              name: 'timezone',
              label: 'Employer IANA timezone',
              required: true,
            },
            {
              name: 'week_start',
              label: 'Workweek start ISO weekday (Monday 1, Sunday 7)',
              type: 'number',
              min: 1,
              max: 7,
              required: true,
            },
            {
              name: 'overtime_after_seconds',
              label: 'Weekly overtime threshold seconds (40 hours = 144000)',
              type: 'number',
              min: 1,
              max: 604800,
              required: true,
            },
            {
              name: 'overtime_multiplier_bps',
              label: 'Overtime multiplier basis points (1.5× = 15000)',
              type: 'number',
              min: 10000,
              max: 30000,
              required: true,
            },
            {
              name: 'review_reference',
              label: 'Employer policy compliance review reference',
              required: true,
            },
            {
              name: 'overhead_centers',
              label: 'Approved overhead centers (comma separated)',
              required: true,
            },
          ]}
          submitLabel="Save reviewed employer policy"
          onSubmit={(v) =>
            task
              .run(async () => {
                await repo.configureWorkforce(org, {
                  timezone: String(v.timezone),
                  week_start: Number(v.week_start),
                  overtime_after_seconds: Number(v.overtime_after_seconds),
                  overtime_multiplier_bps: Number(v.overtime_multiplier_bps),
                  review_reference: String(v.review_reference),
                  overhead_centers: String(v.overhead_centers)
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                });
                refresh();
              }, 'Employer policy saved')
              .then(() => {})
          }
        />
      </details>
      <details>
        <summary>Assign a time supervisor</summary>
        <FieldsForm
          initial={{ active: true }}
          fields={[
            {
              name: 'worker_id',
              label: 'Supervised worker',
              type: 'select',
              options: data.workers.map((w) => ({
                value: w.id,
                label: w.display_name,
              })),
            },
            {
              name: 'user_id',
              label: 'Supervisor member',
              type: 'select',
              options: (members.data ?? [])
                .filter((m) => m.active)
                .map((m) => ({
                  value: m.user_id,
                  label: `${m.role} · ${m.user_id.slice(-12)}`,
                })),
            },
            {
              name: 'active',
              label: 'Active supervisor assignment',
              type: 'checkbox',
            },
          ]}
          submitLabel="Save supervisor assignment"
          onSubmit={(v) =>
            task
              .run(async () => {
                await repo.assignSupervisor(
                  org,
                  String(v.worker_id),
                  String(v.user_id),
                  !!v.active,
                );
                refresh();
              }, 'Supervisor assignment saved')
              .then(() => {})
          }
        />
      </details>
      {task.message && <p role="status">{task.message}</p>}
    </>
  );
}
function PayrollPreparation({
  repo,
  org,
  data,
  refresh,
}: {
  repo: Phase3Repository;
  org: string;
  data: WorkforceData;
  refresh: () => void;
}) {
  const task = useTask();
  const [start, setStart] = useState('2026-10-04'),
    [end, setEnd] = useState('2026-10-11');
  const [deductions, setDeductions] = useState<Record<string, number>>({});
  const [snapshot, setSnapshot] = useState<{
    rows: PayrollRow[];
    deductions: Record<string, number>;
  }>();
  const [confirm, setConfirm] = useState(false);
  const zone = data.policy?.timezone ?? 'UTC';
  const summary = snapshot?.rows;
  const sum = (key: keyof PayrollRow) =>
    summary?.reduce((s, r) => s + Number(r[key]), 0) ?? 0;
  function download(rows: PayrollRow[], values: Record<string, number>) {
    const blob = new Blob(
      [payrollCsv(rows, values, data.policy?.currency ?? 'USD')],
      {
        type: 'text/csv;charset=utf-8',
      },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'payroll-preparation.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div className="p3-notice">
        <strong>Payroll preparation · execution disabled</strong>
        <p>
          Weekly overtime uses all approved jobs and overhead in the employer
          timezone. Deduction inputs are manual preparation data. No tax
          withholding, deposits, filings, bank transfer or payroll disbursement
          is calculated or executed. Classification, salary treatment and local
          wage rules require independent review.
        </p>
      </div>
      <div className="form-grid">
        <Field label="Pay period start · employer local date">
          <input
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setSnapshot(undefined);
              setConfirm(false);
            }}
          />
        </Field>
        <Field label="Pay period end exclusive · employer local date">
          <input
            type="date"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              setSnapshot(undefined);
              setConfirm(false);
            }}
          />
        </Field>
      </div>
      <p>Boundaries are midnight in {zone}; use complete employer workweeks.</p>
      <details>
        <summary>Manual deduction inputs</summary>
        {data.workers.map((w) => (
          <Field
            label={`Manual deduction minor units · ${w.display_name}`}
            key={w.id}
          >
            <input
              type="number"
              min={0}
              step={1}
              value={deductions[w.id] ?? 0}
              onChange={(e) => {
                setDeductions({
                  ...deductions,
                  [w.id]: Number(e.target.value),
                });
                setSnapshot(undefined);
                setConfirm(false);
              }}
            />
          </Field>
        ))}
      </details>
      <button
        disabled={task.busy}
        onClick={() =>
          void task.run(
            async () =>
              setSnapshot(
                await repo.payroll(
                  org,
                  employerBoundary(start, zone),
                  employerBoundary(end, zone),
                  deductions,
                  false,
                ),
              ),
            'Preparation preview calculated',
          )
        }
      >
        Prepare earnings preview
      </button>
      {summary && (
        <>
          <div className="job-metrics">
            <div>
              <span>Regular hours</span>
              <strong>{(sum('regular_seconds') / 3600).toFixed(2)}</strong>
            </div>
            <div>
              <span>Overtime hours</span>
              <strong>{(sum('overtime_seconds') / 3600).toFixed(2)}</strong>
            </div>
            <div>
              <span>Cash wage / fee preparation</span>
              <strong>
                {formatMinor(sum('cash_minor'), data.policy?.currency ?? 'USD')}
              </strong>
            </div>
            <div>
              <span>Imputed economic cost</span>
              <strong>
                {formatMinor(
                  sum('imputed_minor'),
                  data.policy?.currency ?? 'USD',
                )}
              </strong>
            </div>
          </div>
          <div
            className="p3-table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Scrollable financial comparison"
          >
            <table className="p3-table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Regular h</th>
                  <th>Overtime h</th>
                  <th>Cash minor</th>
                  <th>Burden minor</th>
                  <th>Imputed minor</th>
                </tr>
              </thead>
              <tbody>
                {data.workers.map((w) => {
                  const own = summary.filter((r) => r.worker_id === w.id);
                  const total = (k: keyof PayrollRow) =>
                    own.reduce((s, r) => s + Number(r[k]), 0);
                  return (
                    <tr key={w.id}>
                      <th>{w.display_name}</th>
                      <td>{(total('regular_seconds') / 3600).toFixed(2)}</td>
                      <td>{(total('overtime_seconds') / 3600).toFixed(2)}</td>
                      <td>{total('cash_minor')}</td>
                      <td>{total('burden_minor')}</td>
                      <td>{total('imputed_minor')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            className="secondary"
            onClick={() => download(summary, snapshot!.deductions)}
          >
            Export preparation CSV
          </button>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            I reviewed all time, effective rates and deduction inputs. Lock this
            preparation period and post its approved labor costs once.
          </label>
          <button
            disabled={!confirm || task.busy}
            onClick={() =>
              void task.run(async () => {
                await repo.payroll(
                  org,
                  employerBoundary(start, zone),
                  employerBoundary(end, zone),
                  deductions,
                  true,
                );
                refresh();
              }, 'Period locked; labor costs posted to jobs once')
            }
          >
            Lock payroll preparation period
          </button>
        </>
      )}
      <h3>Locked preparation periods</h3>
      {data.periods.map((p) => (
        <div className="expense-record" key={p.id}>
          <strong>
            {p.starts_at.slice(0, 10)} → {p.ends_at.slice(0, 10)} · {p.status}
          </strong>
          {p.snapshot && (
            <button
              className="secondary"
              onClick={() => download(p.snapshot!.rows, p.snapshot!.deductions)}
            >
              Export locked period CSV
            </button>
          )}
        </div>
      ))}
      <details>
        <summary>Record a later adjustment to locked payroll</summary>
        <p>
          This appends a financial correction; it never rewrites the original
          time or locked preparation. Hours and statutory payroll correction
          handling remain subject to provider review.
        </p>
        <FieldsForm
          initial={{ cash_minor: 0, burden_minor: 0, imputed_minor: 0 }}
          fields={[
            {
              name: 'source_period_id',
              label: 'Locked source period',
              type: 'select',
              options: data.periods
                .filter((p) => p.status === 'locked')
                .map((p) => ({
                  value: p.id,
                  label: `${p.starts_at.slice(0, 10)} — ${p.ends_at.slice(0, 10)}`,
                })),
            },
            {
              name: 'entry_id',
              label: 'Original time entry ID',
              required: true,
            },
            {
              name: 'effective_at',
              label: 'Later adjustment timestamp with offset',
              required: true,
            },
            ...['cash_minor', 'burden_minor', 'imputed_minor'].map((name) => ({
              name,
              label: name.replaceAll('_', ' ') + ' (signed minor units)',
              type: 'number' as const,
              required: true,
            })),
            {
              name: 'reason',
              label: 'Correction reason and review reference',
              required: true,
              maxLength: 1000,
            },
          ]}
          submitLabel="Append payroll adjustment"
          onSubmit={(v) =>
            task
              .run(async () => {
                await repo.adjustPayroll(org, {
                  source_period_id: String(v.source_period_id),
                  entry_id: String(v.entry_id),
                  effective_at: String(v.effective_at),
                  cash_minor: Number(v.cash_minor),
                  burden_minor: Number(v.burden_minor),
                  imputed_minor: Number(v.imputed_minor),
                  reason: String(v.reason),
                });
                refresh();
              }, 'Immutable payroll adjustment appended')
              .then(() => {})
          }
        />
      </details>
      {task.message && <p role="status">{task.message}</p>}
    </>
  );
}
