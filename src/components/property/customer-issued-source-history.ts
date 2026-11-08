import { parseCustomerReview } from '../../domain/customer/review';
import { projectPublishedHistory } from '../../domain/property/report-page';
import type { CustomerPortalPreviewModel } from '../../lib/customer-preview';
type Data = ReturnType<CustomerPortalPreviewModel['read']>;

/** Reuse the original reader at disclosure time; retained props grant no access. */
export function readCustomerIssuedSourceHistory(
  read: () => Data,
  expected: Data,
  versionId: string,
) {
  const current = read();
  if (
    current.context.organization_id !== expected.context.organization_id ||
    current.context.customer_id !== expected.context.customer_id ||
    current.context.location_id !== expected.context.location_id ||
    JSON.stringify(
      current.reviews.filter((r) => r.version_id === versionId),
    ) !==
      JSON.stringify(expected.reviews.filter((r) => r.version_id === versionId))
  )
    throw Error('Original customer review changed');
  const original = customerIssuedSourceHistory(expected, versionId);
  const source = customerIssuedSourceHistory(current, versionId);
  if (JSON.stringify(source) !== JSON.stringify(original))
    throw Error('Original published source changed');
  return source;
}

/** Presentation over an already authorized customer read, never new authority. */
export function customerIssuedSourceHistory(data: Data, versionId: string) {
  if (!data.context.reports) throw Error('Published source UNKNOWN');
  const versions = data.reviews.filter((r) => r.version_id === versionId);
  if (versions.length !== 1) throw Error('Exact issued version UNKNOWN');
  const review = parseCustomerReview(versions[0], data.context, versionId);
  if (!review.source_report_id) return null;
  const reports = projectPublishedHistory(data.reports, data.context);
  const matches = reports.filter((r) => r.id === review.source_report_id);
  if (matches.length !== 1) throw Error('Exact published source UNKNOWN');
  const report = matches[0];
  const retained = data.history.filter((r) => r.id === report.id);
  if (
    retained.length !== 1 ||
    JSON.stringify(retained[0]) !== JSON.stringify(report) ||
    !report.snapshot.findings.some((f) => f.id === review.finding_id)
  )
    throw Error('Published version or finding changed; exact source UNKNOWN');
  return { reports: [report], findingId: review.finding_id };
}
