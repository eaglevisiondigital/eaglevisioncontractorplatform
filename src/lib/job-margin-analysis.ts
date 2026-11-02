import type { Phase3Repository, WorkforceData } from './phase3';
import {
  detached,
  projectLocalJobMargin,
  type MarginScope,
  type LaborCoverage,
  type MarginReviewInput,
} from '../domain/jobs/margin-analysis';
import type { Job } from '../domain/jobs/financials';
import { sampleCompanies } from '../domain/platform';

function coverage(workforce: WorkforceData, job: Job): LaborCoverage {
  const entries = workforce.entries.filter((e) => e.job_id === job.id);
  const ids = entries.map((e) => e.id);
  const periods = workforce.periods.filter(
    (p) =>
      p.status === 'locked' &&
      p.snapshot?.rows.some((r) => r.job_id === job.id),
  );
  const rows = periods.flatMap((p) =>
    p.snapshot!.rows.filter((r) => r.job_id === job.id),
  );
  if (
    new Set(ids).size !== ids.length ||
    new Set(periods.map((p) => p.id)).size !== periods.length ||
    workforce.reviews.some(
      (r) =>
        !['approved', 'rejected'].includes(r.decision) ||
        typeof r.decision !== 'string',
    ) ||
    entries.some(
      (e) => workforce.reviews.filter((r) => r.entry_id === e.id).length > 1,
    ) ||
    rows.some(
      (r) =>
        !entries.some(
          (e) =>
            e.id === r.entry_id &&
            e.worker_id === r.worker_id &&
            e.submitted &&
            e.ended_at &&
            workforce.reviews.some(
              (review) =>
                review.entry_id === e.id && review.decision === 'approved',
            ),
        ),
    ) ||
    entries.some(
      (e) =>
        !workforce.workers.some(
          (w) =>
            w.id === e.worker_id && w.organization_id === job.organization_id,
        ),
    )
  )
    throw Error('Invalid exact labor coverage');
  const posted = new Set(rows.map((r) => r.entry_id));
  const sums = {
    seconds: 0n,
    billable_seconds: 0n,
    cash_minor: 0n,
    burden_minor: 0n,
    imputed_minor: 0n,
    billing_minor: 0n,
  };
  for (const row of rows) {
    for (const key of [
      'regular_seconds',
      'overtime_seconds',
      'billable_seconds',
      'cash_minor',
      'burden_minor',
      'imputed_minor',
      'billing_minor',
    ] as const)
      if (!Number.isSafeInteger(row[key]))
        throw Error('Invalid locked labor amount');
    sums.seconds += BigInt(row.regular_seconds) + BigInt(row.overtime_seconds);
    for (const key of [
      'billable_seconds',
      'cash_minor',
      'burden_minor',
      'imputed_minor',
      'billing_minor',
    ] as const)
      sums[key] += BigInt(row[key]);
  }
  const laborMatches =
    new Set(rows.map((r) => r.entry_id)).size === rows.length &&
    job.labor &&
    Object.entries(sums).every(
      ([key, value]) => value === BigInt(job.labor![key as keyof typeof sums]),
    );
  return {
    status: laborMatches ? 'known' : 'unknown',
    currency: workforce.policy?.currency ?? null,
    unpostedApproved: entries.filter(
      (e) =>
        !posted.has(e.id) &&
        workforce.reviews.some(
          (r) => r.entry_id === e.id && r.decision === 'approved',
        ),
    ).length,
    unresolved: entries.filter(
      (e) =>
        !e.ended_at ||
        !e.submitted ||
        !workforce.reviews.some((r) => r.entry_id === e.id),
    ).length,
    entryIds: ids.sort(),
    lockedPeriodIds: periods.map((p) => p.id).sort(),
  };
}
/** Unwired, sample-only reader. Never falls back to a connected financial source. */
export class LocalJobMarginReader {
  constructor(
    readonly repo: Phase3Repository,
    readonly enabled = false,
  ) {}
  private access(org: string, actor: string) {
    if (this.enabled !== true) throw Error('Local margin analysis is disabled');
    if (!this.repo.sample || !sampleCompanies.some((c) => c.id === org))
      throw Error('Local synthetic sources only');
    const member = this.repo.operations
      .syntheticMemberships(org)
      .find((m) => m.user_id === actor);
    // Deliberately narrower than historical estimator projection access.
    if (!member?.active || !['owner', 'admin'].includes(member.role))
      throw Error('Current eligible synthetic financial staff required');
  }
  async read(
    scope: MarginScope,
    actor: string,
    review: MarginReviewInput | null = null,
  ) {
    const request = detached(scope),
      reviewInput = detached(review);
    this.access(request.organizationId, actor);
    const capture = async () => {
      const jobs = await this.repo.jobs(request.organizationId);
      this.access(request.organizationId, actor);
      if (jobs.filter((j) => j.id === request.jobId).length > 1)
        throw Error('Ambiguous exact job');
      const job = jobs.find((j) => j.id === request.jobId) ?? null;
      const issued = job
        ? (
            await this.repo.history(request.organizationId, request.estimateId)
          ).filter((v) => v.id === request.issuedVersionId)
        : [];
      this.access(request.organizationId, actor);
      if (issued.length > 1) throw Error('Ambiguous issued source');
      const workforce = job
        ? await this.repo.workforce(request.organizationId)
        : null;
      this.access(request.organizationId, actor);
      if (request.propertyId !== null)
        this.repo.operations.syntheticProperty(
          request.organizationId,
          request.customerId,
          request.propertyId,
        );
      else {
        let found = false;
        for (let page = 0; page < 100; page++) {
          const customers = await this.repo.operations.listCustomers(
            request.organizationId,
            '',
            '',
            page,
          );
          this.access(request.organizationId, actor);
          if (
            customers.rows.some(
              (c) =>
                c.id === request.customerId &&
                c.organization_id === request.organizationId,
            )
          ) {
            found = true;
            break;
          }
          if ((page + 1) * 10 >= customers.count) break;
        }
        if (!found) throw Error('Current CRM customer unavailable');
      }
      return detached({
        scope: request,
        review: reviewInput,
        job,
        issued: issued[0] ?? null,
        labor:
          job && workforce
            ? coverage(workforce, job)
            : {
                status: 'unknown' as const,
                currency: null,
                unpostedApproved: 0,
                unresolved: 0,
                entryIds: [],
                lockedPeriodIds: [],
              },
      });
    };
    const first = await capture();
    const final = await capture();
    this.access(request.organizationId, actor);
    if (JSON.stringify(first) !== JSON.stringify(final))
      throw Error('Job sources changed during read; refresh exact selection');
    return projectLocalJobMargin(final, { enabled: true });
  }
}
