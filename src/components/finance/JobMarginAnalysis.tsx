import './job-margin-analysis.css';
import { useCallback, useMemo } from 'react';
import type { MarginScope } from '../../domain/jobs/margin-analysis';
import type { LocalJobMarginReader } from '../../lib/job-margin-analysis';
import { formatMinor } from '../../domain/estimating/calculation';
import { useResource } from '../forms-state';
import { ResourceStatus } from '../forms';

/** Isolated internal read component; no App route or financial action is registered. */
export function JobMarginAnalysis({
  reader,
  scope,
  actor,
}: {
  reader: LocalJobMarginReader;
  scope: MarginScope;
  actor: string;
}) {
  const identity = useMemo(
    () => ({ reader, key: crypto.randomUUID() }),
    [reader],
  );
  return (
    <MarginSnapshot
      key={JSON.stringify([identity.key, scope, actor])}
      reader={reader}
      scope={scope}
      actor={actor}
    />
  );
}
function MarginSnapshot({
  reader,
  scope,
  actor,
}: {
  reader: LocalJobMarginReader;
  scope: MarginScope;
  actor: string;
}) {
  const data = useResource(
    useCallback(() => reader.read(scope, actor), [reader, scope, actor]),
  );
  const result = data.loading || data.error ? undefined : data.data;
  const money = (n: number) => formatMinor(n, scope.currency);
  return (
    <section
      className="job-margin-analysis"
      aria-label="Local job margin analysis"
    >
      <h2>Job cost variance</h2>
      <p>
        Local synthetic read only · current owner/admin. Source coverage is
        limited to this exact job snapshot.
      </p>
      <button className="secondary" onClick={data.reload}>
        Refresh exact cost evidence
      </button>
      <ResourceStatus {...data} />
      {result && (
        <>
          <p role="status">
            {result.status === 'PARTIAL'
              ? 'Partial cost coverage'
              : result.status === 'UNKNOWN'
                ? 'UNKNOWN — totals withheld'
                : 'Management-declared costs complete'}
          </p>
          <p>{result.authority}</p>
          <dl>
            <dt>Issued source version</dt>
            <dd>{result.scope.issuedVersionId}</dd>
            <dt>Job revision</dt>
            <dd>{result.scope.jobRevision}</dd>
            <dt>Currency</dt>
            <dd>{result.scope.currency}</dd>
          </dl>
          {result.reasons.length > 0 && (
            <ul>
              {result.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          {result.totals && (
            <>
              <dl>
                <dt>Projected contribution</dt>
                <dd>{money(result.totals.projectedContributionMinor)}</dd>
                <dt>Projected margin</dt>
                <dd>
                  {result.totals.projectedMarginBps === null
                    ? 'Unavailable — no supported revenue denominator'
                    : `${(result.totals.projectedMarginBps / 100).toFixed(2)}%`}
                </dd>
              </dl>
              <div
                className="p3-table-wrap"
                tabIndex={0}
                role="region"
                aria-label="Scrollable job cost variance"
              >
                <table className="p3-table">
                  <caption>
                    Exact baseline versus approved costs and forecast ·{' '}
                    {scope.currency}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Category</th>
                      <th scope="col">Budget with approved changes</th>
                      <th scope="col">Recorded expense / locked labor</th>
                      <th scope="col">Unpaid commitments</th>
                      <th scope="col">Remaining forecast</th>
                      <th scope="col">Projected cost</th>
                      <th scope="col">Variance above / below budget</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.categories.map((row) => (
                      <tr key={row.category}>
                        <th scope="row">
                          {row.category}
                          {row.overrun && ' · over threshold'}
                        </th>
                        <td>{money(row.budgetMinor)}</td>
                        <td>{money(row.recordedMinor)}</td>
                        <td>{money(row.unpaidCommitmentMinor)}</td>
                        <td>{money(row.forecastMinor)}</td>
                        <td>{money(row.projectedMinor)}</td>
                        <td>{money(row.varianceMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p>
            Expense sources: {result.source.expenseIds.length} · review events:{' '}
            {result.source.reviewEventIds.length} · labor entries:{' '}
            {result.source.laborEntryIds.length} · locked periods:{' '}
            {result.source.lockedPeriodIds.length}
          </p>
          <p>
            Available records do not prove all purchases, work or overhead were
            captured. No amounts are sent, posted or corrected.
          </p>
        </>
      )}
    </section>
  );
}
