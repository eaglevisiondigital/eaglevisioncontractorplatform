import { useCallback, useState } from 'react';
import type { PropertyRepository } from '../../lib/property';
import { useResource, useTask } from '../forms-state';
import { ResourceStatus } from '../forms';
import { Field, Money, Percent } from '../phase3/fields';
import { unbilledRows, type Disposition } from '../../domain/property/unbilled';
import { materialPrice, type Pricing } from '../../domain/materials/import';
import { formatMinor } from '../../domain/estimating/calculation';
export function UnbilledReview({
  repo,
  org,
}: {
  repo: PropertyRepository;
  org: string;
}) {
  const data = useResource(
    useCallback(
      async () => ({
        jobs: await repo.estimates.jobs(org),
        decisions: repo.read(org).decisions,
      }),
      [repo, org],
    ),
  );
  const task = useTask(),
    [expenseId, setExpenseId] = useState(''),
    [disposition, setDisposition] = useState<Disposition>('deferred'),
    [reason, setReason] = useState(''),
    [description, setDescription] = useState(
      'Additional materials subject to customer approval',
    ),
    [pricing, setPricing] = useState<Pricing>({
      mode: 'pass_through',
      value: 0,
    }),
    [scope, setScope] = useState(''),
    [presentation, setPresentation] = useState<'itemized' | 'package'>(
      'itemized',
    );
  if (!data.data || data.loading || data.error)
    return <ResourceStatus {...data} />;
  const jobs = data.data.jobs,
    rows = jobs.flatMap((job) => unbilledRows(job).map((r) => ({ ...r, job }))),
    row = rows.find((x) => x.expense.id === expenseId) ?? rows[0];
  const history = data.data.decisions.filter(
    (d) => d.expense_id === row?.expense.id,
  );
  let price = 0,
    error = '';
  try {
    if (row) price = materialPrice(row.net_minor, pricing).price_minor;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Invalid markup';
  }
  return (
    <section aria-label="Unbilled material review">
      <h3>Purchased materials & supplemental scope</h3>
      <p>
        Compare approved purchases with the immutable original material budget
        and approved changes. Reviews append to history. Proposals do not change
        customer balances or post material cost again.
      </p>
      {row ? (
        <>
          <Field label="Purchased material to review">
            <select
              value={row.expense.id}
              onChange={(e) => setExpenseId(e.target.value)}
            >
              {rows.map((r) => (
                <option key={r.expense.id} value={r.expense.id}>
                  {r.job.name} · {r.expense.description} · {r.expense.reference}
                </option>
              ))}
            </select>
          </Field>
          <div className="job-metrics">
            <div>
              <span>Actual purchase</span>
              <strong>
                {formatMinor(
                  row.expense.amount_minor,
                  row.job.baseline.currency,
                )}
              </strong>
            </div>
            <div>
              <span>After linked approved credits</span>
              <strong>
                {formatMinor(row.net_minor, row.job.baseline.currency)}
              </strong>
            </div>
            <div>
              <span>Original source quantity</span>
              <strong>
                {row.job.baseline.lines.find(
                  (l) => l.id === row.expense.estimate_line_id,
                )?.quantity_milli
                  ? `${row.job.baseline.lines.find((l) => l.id === row.expense.estimate_line_id)!.quantity_milli / 1000} ${row.expense.unit}`
                  : 'Manual match needed'}
              </strong>
            </div>
          </div>
          <ul>
            {row.flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p>
            Candidate source matches: {row.matches.length}. Receipt attachments
            remain subject to existing private document gates.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void task.run(async () => {
                await repo.decide(
                  org,
                  row.job.id,
                  row.expense.id,
                  history.length,
                  {
                    disposition,
                    reason,
                    scope_line_id: scope || null,
                    pricing,
                    presentation,
                    description,
                  },
                );
                data.reload();
              }, 'Append-only material review saved; any billing remains a proposal');
            }}
          >
            <div className="p3-grid">
              <Field label="Material billing classification">
                <select
                  value={disposition}
                  onChange={(e) =>
                    setDisposition(e.target.value as Disposition)
                  }
                >
                  <option value="absorbed">Absorbed by contractor</option>
                  <option value="included">
                    Already included in customer scope
                  </option>
                  <option value="proposed">
                    Proposed additional customer billing
                  </option>
                  <option value="deferred">Needs further review</option>
                </select>
              </Field>
              <Field label="Existing authorized scope">
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                >
                  <option value="">Select after review</option>
                  {row.job.baseline.lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.description}
                    </option>
                  ))}
                  {row.job.changes
                    .filter((c) => c.status === 'approved')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.description}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Supplemental pricing">
                <select
                  value={pricing.mode}
                  onChange={(e) =>
                    setPricing({
                      mode: e.target.value as Pricing['mode'],
                      value: 0,
                    })
                  }
                >
                  <option value="pass_through">Cost pass-through</option>
                  <option value="percent">Percentage markup on cost</option>
                  <option value="fixed">Fixed dollar markup</option>
                </select>
              </Field>
              {pricing.mode === 'percent' ? (
                <Percent
                  label="Markup percentage · not gross margin"
                  value={pricing.value}
                  onChange={(n) => setPricing({ ...pricing, value: n })}
                />
              ) : pricing.mode === 'fixed' ? (
                <Money
                  label="Fixed markup"
                  value={pricing.value}
                  currency={row.job.baseline.currency}
                  onChange={(n) => setPricing({ ...pricing, value: n })}
                />
              ) : null}
              <Field label="Customer presentation">
                <select
                  value={presentation}
                  onChange={(e) =>
                    setPresentation(e.target.value as typeof presentation)
                  }
                >
                  <option value="itemized">Itemized materials</option>
                  <option value="package">Materials package</option>
                </select>
              </Field>
            </div>
            <Field label="Scope review rationale">
              <textarea
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <Field label="Supplemental customer description">
              <textarea
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <p>
              Proposed selling price{' '}
              {formatMinor(price, row.job.baseline.currency)} · tax and customer
              authorization require review.
            </p>
            {error && <p role="alert">{error}</p>}
            <button
              disabled={
                task.busy || !!error || history.some((d) => !!d.change_id)
              }
            >
              Record contractor review
            </button>
          </form>
          <h4>Immutable review history & invoice drafts</h4>
          {history.map((d) => (
            <div className="finding-card" key={d.id}>
              <strong>
                Review {d.revision} · {d.disposition}
              </strong>
              <p>{d.reason}</p>
              {d.change_id && (
                <>
                  <p>
                    Existing change order {d.change_id.slice(0, 8)} ·{' '}
                    {formatMinor(d.selling_minor, row.job.baseline.currency)}
                  </p>
                  <p>
                    Supplemental invoice draft: {d.description} ·{' '}
                    {d.presentation} · awaiting customer authorization. This is
                    not an issued invoice or payable balance.
                  </p>
                </>
              )}
            </div>
          ))}
        </>
      ) : (
        <p>
          No approved material purchases to review. Submit and approve a
          material expense in Jobs first.
        </p>
      )}
      {task.message && <p role="status">{task.message}</p>}
    </section>
  );
}
