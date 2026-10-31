import { BackOfficeText } from '../property/back-office-copy';
import type { Operations } from '../../lib/operations';
import { PropertyJobReview } from '../property/PropertyJobReview';
import { useState, useCallback } from 'react';
import type { Phase3Repository } from '../../lib/phase3';
import type { CompanyProfile } from '../../domain/platform';
import {
  jobFinancials,
  costCategories,
  purchaseMatches,
  type Job,
  type Expense,
  type ChangeOrder,
} from '../../domain/jobs/financials';
import { formatMinor } from '../../domain/estimating/calculation';
import { MaterialImport } from './MaterialImport';
import type { EstimateBundle } from '../../domain/estimating/types';
import { useResource, useTask } from '../forms-state';
import { FieldsForm, ResourceStatus } from '../forms';
import { Field, Money, Percent } from './fields';
export function Jobs({
  repo,
  company,
  canManage,
  operations,
  admin,
  initialJobId = '',
}: {
  repo: Phase3Repository;
  operations: Operations;
  company: CompanyProfile;
  canManage: boolean;
  admin: boolean;
  initialJobId?: string;
}) {
  const task = useTask();
  const [jobId, setJobId] = useState(initialJobId);
  const data = useResource(
    useCallback(
      async () =>
        canManage
          ? { jobs: await repo.jobs(company.id), labels: [] }
          : { jobs: [], labels: (await repo.workforce(company.id)).jobs },
      [repo, company.id, canManage],
    ),
  );
  const job = jobId
    ? data.data?.jobs.find((j) => j.id === jobId)
    : data.data?.jobs[0];
  return (
    <article className="p3-workspace">
      <div className="section-title">
        <div>
          <span className="eyebrow">
            <BackOfficeText text="JOB CONTROL" />
          </span>
          <h2>
            {canManage
              ? 'Job financial dashboard'
              : 'Field expense submissions'}
          </h2>
        </div>
        <button className="secondary" onClick={data.reload}>
          <BackOfficeText text="Refresh job costs" />
        </button>
      </div>
      <p>
        {canManage
          ? 'Original budget, committed purchases, paid expenses and the cost still to come. Profit remains projected until costs are complete.'
          : 'Record a purchase against an assigned job. Management review is required before it affects internal costs.'}
      </p>
      <ResourceStatus {...data} />
      {canManage ? (
        <>
          {data.data?.jobs.length ? (
            <>
              <Field label="Financial job">
                <select
                  value={job?.id ?? ''}
                  onChange={(e) => setJobId(e.target.value)}
                >
                  {data.data.jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name}
                    </option>
                  ))}
                </select>
              </Field>
              {job && (
                <JobDetail
                  key={`${job.id}-${job.lock_revision}`}
                  job={job}
                  repo={repo}
                  company={company}
                  admin={admin}
                  refresh={data.reload}
                />
              )}
            </>
          ) : (
            <p>
              No jobs yet. Internally issue an estimate, then explicitly approve
              its job baseline. This does not represent customer acceptance.
            </p>
          )}
        </>
      ) : (
        <FieldExpenses
          repo={repo}
          org={company.id}
          jobs={data.data?.labels ?? []}
        />
      )}
      {admin && operations.sample && (
        <PropertyJobReview operations={operations} company={company} />
      )}
      {task.message && <p role="status">{task.message}</p>}
    </article>
  );
}
function JobDetail({
  job,
  repo,
  company,
  admin,
  refresh,
}: {
  job: Job;
  repo: Phase3Repository;
  company: CompanyProfile;
  admin: boolean;
  refresh: () => void;
}) {
  const task = useTask();
  const [projection, setProjection] = useState(() =>
    structuredClone(job.projection),
  );
  const [importBundle, setImportBundle] = useState<EstimateBundle>();
  const [authorizations, setAuthorizations] = useState<Record<string, string>>(
    {},
  );
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  let projectionError = '';
  let preview;
  try {
    preview = jobFinancials({ ...job, projection });
  } catch (e) {
    projectionError = e instanceof Error ? e.message : 'Check forecast';
    preview = jobFinancials(job);
  }
  const money = (n: number) => formatMinor(n, job.baseline.currency);
  const pending = job.expenses.filter(
    (e) => !job.events.some((r) => r.submission_id === e.id),
  );
  const originalHours = job.baseline.lines
    .filter((l) => l.kind === 'labor' && l.unit === 'hour')
    .reduce((s, l) => s + l.quantity_milli / 1000, 0);
  return (
    <>
      <div className="p3-notice">
        <strong>Immutable original baseline</strong>
        <p>
          Source version {job.baseline.issued_version_id.slice(0, 8)} · internal
          management approval. Original values are retained through estimate
          revisions and job adjustments.
        </p>
      </div>
      <div className="job-metrics">
        <div>
          <span>
            <BackOfficeText text="Original estimate revenue · before tax" />
          </span>
          <strong>{money(job.baseline.revenue_minor)}</strong>
        </div>
        <div>
          <span>
            <BackOfficeText text="Revised authorized scope value" />
          </span>
          <strong>{money(preview.revised_revenue_minor)}</strong>
        </div>
        <div>
          <span>
            <BackOfficeText text="Projected total economic cost" />
          </span>
          <strong>{money(preview.projected_cost_minor)}</strong>
        </div>
        <div className={preview.profit_erosion ? 'metric-warning' : ''}>
          <span>
            {preview.complete
              ? 'Recorded contribution · review completeness'
              : 'Projected contribution · incomplete costs'}
          </span>
          <strong>{money(preview.projected_profit_minor)}</strong>
          <small>
            {(preview.projected_margin_bps / 100).toFixed(2)}
            <BackOfficeText text="% before unallocated overhead / taxes" />
          </small>
        </div>
      </div>
      <h3>
        <BackOfficeText text="Original budget versus actual & forecast" />
      </h3>
      <div
        className="p3-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Scrollable financial comparison"
      >
        <table className="p3-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Original</th>
              <th>With approved changes</th>
              <th>Paid / approved labor</th>
              <th>Committed, unpaid</th>
              <th>Remaining forecast</th>
              <th>Projected cost</th>
            </tr>
          </thead>
          <tbody>
            {preview.categories.map((c) => (
              <tr key={c.category}>
                <th scope="row">
                  {c.category}
                  {c.overrun && (
                    <span className="cost-warning">
                      <BackOfficeText text="Over threshold" />
                    </span>
                  )}
                </th>
                <td>{money(c.original_minor)}</td>
                <td>{money(c.budget_minor)}</td>
                <td>{money(c.paid_minor)}</td>
                <td>{money(c.committed_remaining_minor)}</td>
                <td>{money(c.remaining_minor)}</td>
                <td>
                  <strong>{money(c.projected_minor)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        Purchase exposure = paid + outstanding commitments; a matched invoice
        and its payment are not counted twice. Remaining forecast excludes both.
        “Paid” for labor means prepared wage cost, not evidence of payroll
        disbursement.
      </p>
      {preview.profit_erosion && (
        <p role="status" className="p3-notice">
          Projected margin erosion exceeds the configured threshold.
        </p>
      )}
      <details>
        <summary>
          <BackOfficeText text="Update remaining costs & warning thresholds" />
        </summary>
        <div className="form-grid">
          {costCategories.map((category) => (
            <Money
              key={category}
              label={`Remaining ${category}`}
              currency={job.baseline.currency}
              value={projection.remaining[category]}
              onChange={(n) =>
                setProjection({
                  ...projection,
                  remaining: { ...projection.remaining, [category]: n },
                })
              }
            />
          ))}
          <Percent
            label="Cost overrun threshold %"
            value={projection.overrun_bps}
            onChange={(n) => setProjection({ ...projection, overrun_bps: n })}
          />
          <Percent
            label="Margin erosion threshold · percentage points"
            value={projection.erosion_bps}
            onChange={(n) => setProjection({ ...projection, erosion_bps: n })}
          />
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={projection.costs_complete}
            onChange={(e) =>
              setProjection({ ...projection, costs_complete: e.target.checked })
            }
          />
          Management confirms all job costs are recorded; outstanding
          commitments and reviews must also be cleared.
        </label>
        <button
          disabled={task.busy || !!projectionError}
          onClick={() =>
            void task.run(async () => {
              await repo.projection(company.id, job, projection);
              refresh();
            }, 'Forecast saved')
          }
        >
          <BackOfficeText text="Save job forecast" />
        </button>
      </details>
      {projectionError && <p role="alert">{projectionError}</p>}
      <h3>
        <BackOfficeText text="Labor cost & hours" />
      </h3>
      <div className="p3-totals">
        <span>
          <BackOfficeText text="Original labor hours " />
          <strong>{originalHours.toFixed(2)}</strong>
        </span>
        <span>
          <BackOfficeText text="Prepared actual hours" />{' '}
          <strong>{((job.labor?.seconds ?? 0) / 3600).toFixed(2)}</strong>
        </span>
        <span>
          <BackOfficeText text="Billable / unbilled hours" />{' '}
          <strong>
            {((job.labor?.billable_seconds ?? 0) / 3600).toFixed(2)} /{' '}
            {(
              ((job.labor?.seconds ?? 0) - (job.labor?.billable_seconds ?? 0)) /
              3600
            ).toFixed(2)}
          </strong>
        </span>
      </div>
      <p>
        Cash wages / contractor time fees: {money(job.labor?.cash_minor ?? 0)} ·
        Employer burden: {money(job.labor?.burden_minor ?? 0)} · Imputed
        economic labor: {money(job.labor?.imputed_minor ?? 0)} · Potential labor
        billing value: {money(job.labor?.billing_minor ?? 0)}
      </p>
      <p className="muted">
        Only approved, locked payroll-preparation records contribute labor
        costs. Potential billing value never changes authorized customer
        charges. Invoice-costed contractors contribute through reviewed
        subcontractor invoices, with no time-based cash fee.
      </p>
      <div className="section-title">
        <h3>
          <BackOfficeText text="Purchase & expense history" />
        </h3>
        <button
          className="secondary"
          onClick={() =>
            void task.run(
              async () =>
                setImportBundle(
                  await repo.sourceEstimate(
                    company.id,
                    job.baseline.issued_version_id,
                  ),
                ),
              'Purchase review opened',
            )
          }
        >
          <BackOfficeText
            text={
              repo.sample ? 'Import receipt example' : 'Review receipt imports'
            }
          />
        </button>
      </div>
      {job.expenses.map((e) => {
        const review = job.events.find((r) => r.submission_id === e.id);
        const matches = purchaseMatches(e, job.baseline);
        return (
          <div className="expense-record" key={e.id}>
            <div className="section-title">
              <strong>{e.description}</strong>
              <strong>
                {e.kind === 'credit' ? '−' : ''}
                {money(e.amount_minor)}
              </strong>
            </div>
            <p>
              {e.supplier} · {e.reference} · linked purchase {e.purchase_key} ·{' '}
              {e.category} / {e.kind}
            </p>
            <p>
              {e.submitted_at.slice(0, 10)} ·{' '}
              {review?.decision ?? 'Awaiting management review'} ·{' '}
              {e.estimate_line_id
                ? 'Manually matched to original budget'
                : matches.length
                  ? `${matches.length} candidate match · manual review required`
                  : 'Unplanned purchase or substitution'}{' '}
              · {e.document_ids.length} clean attachments
            </p>
            {admin && !review && (
              <div className="button-row">
                <button
                  onClick={() =>
                    void task.run(async () => {
                      await repo.reviewExpense(
                        company.id,
                        job.id,
                        e.id,
                        'approved',
                        'Management reviewed supplier evidence and duplicate matching',
                      );
                      refresh();
                    }, 'Expense approved')
                  }
                >
                  <BackOfficeText text="Approve expense" />
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    void task.run(async () => {
                      await repo.reviewExpense(
                        company.id,
                        job.id,
                        e.id,
                        'rejected',
                        'Management rejected this submission',
                      );
                      refresh();
                    }, 'Expense rejected')
                  }
                >
                  <BackOfficeText text="Reject expense" />
                </button>
              </div>
            )}
          </div>
        );
      })}
      {preview.anomalies.length > 0 && (
        <details>
          <summary>
            <BackOfficeText text="Purchase variance warnings (" />
            {preview.anomalies.length})
          </summary>
          <ul>
            {preview.anomalies.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </details>
      )}
      <p>
        {pending.length} expenses await review. Returns and credits are separate
        immutable adjustments linked to an approved purchase.
      </p>
      <details>
        <summary>
          <BackOfficeText text="Record expense, commitment or credit" />
        </summary>
        <ExpenseForm repo={repo} org={company.id} job={job} onSaved={refresh} />
      </details>
      {importBundle && (
        <MaterialImport
          repo={repo}
          org={company.id}
          bundle={importBundle}
          onApplied={() => {}}
          onClose={() => setImportBundle(undefined)}
          purchaseJobId={job.id}
          purchaseLines={job.baseline.lines}
          onExpense={async (review, batchId, batchLock, kind) => {
            await repo.recordPurchasedMaterials(
              company.id,
              job,
              importBundle,
              review,
              kind ?? 'payment',
              batchId,
              batchLock,
            );
            refresh();
          }}
        />
      )}
      <h3>
        <BackOfficeText text="Scope changes & customer billing" />
      </h3>
      <p>
        Internal expenses and proposed additions do not increase billing.
        Management must verify the required customer authorization before
        approving a change order.
      </p>
      {job.changes.map((c) => (
        <div className="expense-record" key={c.id}>
          <strong>{c.description}</strong>
          <p>
            {c.status} · proposed revenue {money(c.revenue_minor)} · expected
            cost {money(c.cost_minor)}
          </p>
          {c.status === 'approved' ? (
            <p>Authorization reference: {c.authorization_reference}</p>
          ) : (
            c.status === 'proposed' &&
            admin && (
              <>
                <Field label={`Authorization reference for ${c.description}`}>
                  <input
                    value={authorizations[c.id] ?? ''}
                    onChange={(e) =>
                      setAuthorizations({
                        ...authorizations,
                        [c.id]: e.target.value,
                      })
                    }
                  />
                </Field>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={!!confirmed[c.id]}
                    onChange={(e) =>
                      setConfirmed({ ...confirmed, [c.id]: e.target.checked })
                    }
                  />
                  I verified the required customer authorization for this exact
                  scope and price.
                </label>
                <button
                  disabled={!confirmed[c.id] || !authorizations[c.id]?.trim()}
                  onClick={() =>
                    void task.run(async () => {
                      await repo.approveChange(
                        company.id,
                        job.id,
                        c.id,
                        authorizations[c.id],
                      );
                      refresh();
                    }, 'Change order approved; authorized scope value updated')
                  }
                >
                  <BackOfficeText text="Approve authorized change order" />
                </button>
              </>
            )
          )}
        </div>
      ))}
      <details>
        <summary>
          <BackOfficeText text="Add internal scope or propose a billable addition" />
        </summary>
        <FieldsForm
          initial={{
            status: 'internal',
            revenue_minor: 0,
            cost_minor: 0,
            category: 'materials',
          }}
          fields={[
            {
              name: 'description',
              label: 'Change description',
              required: true,
              maxLength: 1000,
            },
            {
              name: 'status',
              label: 'Change status',
              type: 'select',
              options: [
                { value: 'internal', label: 'Internal expense scope' },
                { value: 'proposed', label: 'Proposed customer addition' },
              ],
            },
            {
              name: 'category',
              label: 'Change cost category',
              type: 'select',
              options: costCategories.map((value) => ({ value, label: value })),
            },
            {
              name: 'revenue_minor',
              label: `Proposed selling amount (${job.baseline.currency} minor units; internal must be zero)`,
              type: 'number',
              min: 0,
              required: true,
            },
            {
              name: 'cost_minor',
              label: `Expected change cost (${job.baseline.currency} minor units)`,
              type: 'number',
              min: 0,
              required: true,
            },
          ]}
          submitLabel="Save change proposal"
          onSubmit={(v) =>
            task
              .run(async () => {
                await repo.proposeChange(company.id, job.id, {
                  description: String(v.description),
                  status: v.status as ChangeOrder['status'],
                  category: v.category as ChangeOrder['category'],
                  revenue_minor: Number(v.revenue_minor),
                  cost_minor: Number(v.cost_minor),
                });
                refresh();
              }, 'Proposal saved; customer billing unchanged')
              .then(() => {})
          }
        />
      </details>
      {admin && (
        <details>
          <summary>
            <BackOfficeText text="Assign employee to this job" />
          </summary>
          <Assignment repo={repo} org={company.id} jobId={job.id} />
        </details>
      )}
      {task.message && <p role="status">{task.message}</p>}
    </>
  );
}
function ExpenseForm({
  repo,
  org,
  job,
  onSaved,
}: {
  repo: Phase3Repository;
  org: string;
  job: Pick<Job, 'id' | 'baseline'>;
  onSaved: () => void;
}) {
  const task = useTask();
  const docs = useResource(
    useCallback(() => repo.cleanDocuments(org), [repo, org]),
  );
  return (
    <>
      <p>
        Use the same purchase link key for a PO, invoice and receipt that
        represent one purchase. Use a distinct supplier document reference for
        each record. No bank or card transaction is created.
      </p>
      <FieldsForm
        initial={{ category: 'materials', kind: 'payment', amount_minor: 0 }}
        fields={[
          {
            name: 'purchase_key',
            label: 'Purchase link key',
            required: true,
            maxLength: 160,
          },
          {
            name: 'supplier',
            label: 'Supplier / payee',
            required: true,
            maxLength: 200,
          },
          {
            name: 'reference',
            label: 'Unique supplier document reference',
            required: true,
            maxLength: 200,
          },
          {
            name: 'description',
            label: 'Expense description',
            required: true,
            maxLength: 500,
          },
          {
            name: 'category',
            label: 'Expense category',
            type: 'select',
            options: costCategories
              .filter((c) => c !== 'labor')
              .map((value) => ({ value, label: value })),
          },
          {
            name: 'kind',
            label: 'Expense record type',
            type: 'select',
            options: [
              { value: 'commitment', label: 'Committed purchase / PO' },
              { value: 'payment', label: 'Paid expense / receipt' },
              { value: 'credit', label: 'Return / credit adjustment' },
            ],
          },
          {
            name: 'amount_minor',
            label: `Expense amount (${job.baseline.currency} minor units)`,
            type: 'number',
            min: 1,
            required: true,
          },
          {
            name: 'estimate_line_id',
            label: 'Manual original budget match',
            type: 'select',
            options: [
              { value: '', label: 'Unplanned / ambiguous; review required' },
              ...job.baseline.lines.map((l) => ({
                value: l.id,
                label: `${l.description} · ${l.unit}`,
              })),
            ],
          },
          {
            name: 'document_id',
            label: 'Existing clean invoice or receipt',
            type: 'select',
            options: [
              { value: '', label: 'No clean attachment' },
              ...(docs.data ?? []).map((d) => ({
                value: d.id,
                label: d.display_name,
              })),
            ],
          },
          {
            name: 'labor_worker_id',
            label:
              'Invoice-costed contractor worker ID (required for subcontractors)',
          },
          {
            name: 'adjusts_expense_id',
            label: 'Original approved expense ID (required for credits)',
          },
        ]}
        submitLabel="Submit for expense review"
        onSubmit={(v) =>
          task
            .run(async () => {
              await repo.submitExpense(org, job.id, {
                purchase_key: String(v.purchase_key),
                supplier: String(v.supplier),
                reference: String(v.reference),
                description: String(v.description),
                category: v.category as Expense['category'],
                kind: v.kind as Expense['kind'],
                amount_minor: Number(v.amount_minor),
                estimate_line_id: String(v.estimate_line_id) || null,
                quantity_milli: null,
                unit: null,
                unit_cost_minor: null,
                document_ids: v.document_id ? [String(v.document_id)] : [],
                material_approval_id: null,
                adjusts_expense_id: String(v.adjusts_expense_id) || null,
                labor_worker_id: String(v.labor_worker_id) || null,
              });
              onSaved();
            }, 'Expense submitted; management approval pending')
            .then(() => {})
        }
      />
      {task.message && <p role="status">{task.message}</p>}
    </>
  );
}
function FieldExpenses({
  repo,
  org,
  jobs,
}: {
  repo: Phase3Repository;
  org: string;
  jobs: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState('');
  const id = selected || jobs[0]?.id;
  return jobs.length ? (
    <>
      <Field label="Assigned expense job">
        <select value={id} onChange={(e) => setSelected(e.target.value)}>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>
      </Field>
      <ExpenseForm
        key={id}
        repo={repo}
        org={org}
        job={{
          id,
          baseline: {
            issued_version_id: '',
            revenue_minor: 0,
            costs: {
              materials: 0,
              labor: 0,
              subcontractors: 0,
              equipment: 0,
              other: 0,
            },
            lines: [],
            currency: 'USD',
          },
        }}
        onSaved={() => {}}
      />
    </>
  ) : (
    <p>No jobs assigned. Ask a company administrator to grant job access.</p>
  );
}
function Assignment({
  repo,
  org,
  jobId,
}: {
  repo: Phase3Repository;
  org: string;
  jobId: string;
}) {
  const data = useResource(
    useCallback(() => repo.operations.listMembers(org), [repo, org]),
  );
  const task = useTask();
  return (
    <>
      <FieldsForm
        fields={[
          {
            name: 'user_id',
            label: 'Assigned employee',
            type: 'select',
            options: (data.data ?? [])
              .filter((m) => m.active)
              .map((m) => ({
                value: m.user_id,
                label: `${m.role} · ${m.staff_type} · ${m.user_id.slice(-12)}`,
              })),
          },
          {
            name: 'active',
            label: 'Grant active job assignment',
            type: 'checkbox',
          },
        ]}
        initial={{ active: true }}
        submitLabel="Save job assignment"
        onSubmit={(v) =>
          task
            .run(async () => {
              await repo.assignJob(org, jobId, String(v.user_id), !!v.active);
            }, 'Assignment saved')
            .then(() => {})
        }
      />
      {task.message && <p role="status">{task.message}</p>}
    </>
  );
}
