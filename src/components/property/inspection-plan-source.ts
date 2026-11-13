import type { PropertyRepository, PropertyState } from '../../lib/property';
type Context = PropertyState['contexts'][number];

/** Existing local create-plan control admission, never a writer or genuine Auth.
 * The pinned context reader can over-associate jobs by customer; exact issued
 * property evidence is therefore required independently before the original writer.
 */
export async function requireInspectionPlanSource(
  repo: PropertyRepository,
  org: string,
  selected: Context,
  stillCurrent: () => boolean,
) {
  const context = Object.freeze({ ...selected });
  const requireCurrent = () => {
    if (!repo.operations.sample || !stillCurrent())
      throw Error('Current local inspection-plan context required');
    const matches = repo
      .read(org)
      .contexts.filter(
        (c) =>
          c.customer_id === context.customer_id &&
          c.location_id === context.location_id &&
          c.job_id === context.job_id,
      );
    if (
      matches.length !== 1 ||
      JSON.stringify(matches[0]) !== JSON.stringify(context)
    )
      throw Error('Property context changed; review again');
    repo.operations.syntheticEstimateCrm(
      org,
      context.customer_id,
      context.location_id,
    );
  };
  const authority = async () => {
    requireCurrent();
    const access = await repo.operations.companyAccess(org);
    requireCurrent();
    if (!access.crm || !access.estimates)
      throw Error('Current contractor planning access required');
  };
  await authority();
  let jobSource: string | undefined;
  if (context.job_id !== null) {
    const job = repo.estimates.syntheticJob(org, context.job_id);
    if (!job || job.organization_id !== org)
      throw Error('Exact job source unavailable; relationship UNKNOWN');
    jobSource = JSON.stringify(job.baseline);
    const source = await repo.estimates.sourceEstimate(
      org,
      job.baseline.issued_version_id,
    );
    requireCurrent();
    if (
      source.estimate.organization_id !== org ||
      source.version.organization_id !== org ||
      source.version.id !== job.baseline.issued_version_id ||
      source.version.estimate_id !== source.estimate.id ||
      source.version.status !== 'issued' ||
      source.version.payload.customer_id !== context.customer_id ||
      source.version.payload.location_id !== context.location_id
    )
      throw Error(
        'Issued job source does not establish this exact property; relationship UNKNOWN',
      );
  }
  await authority();
  if (context.job_id !== null) {
    const currentJob = repo.estimates.syntheticJob(org, context.job_id);
    if (
      !currentJob ||
      currentJob.id !== context.job_id ||
      currentJob.organization_id !== org ||
      JSON.stringify(currentJob.baseline) !== jobSource
    )
      throw Error('Job source changed; relationship UNKNOWN');
  }
  requireCurrent();
  return context;
}
