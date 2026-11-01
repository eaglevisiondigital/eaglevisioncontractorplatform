import type { CustomerPortalPreviewModel } from '../../lib/customer-preview';
import { sampleCompanies } from '../platform';
import { documentHash } from '../release/preview';
import {
  projectPublishedHistory,
  reportUuid,
  type ReportBoundary,
} from './report-page';
import type { PublishedReport } from './inspections';

export interface PropertyPassportAdmission {
  /** Explicit local laboratory admission only. Omission is OFF, never Auth. */
  enabled?: boolean;
}
interface PassportSource extends ReportBoundary {
  report_id: string;
  published_version: number;
}
export interface PassportReportReference extends PassportSource {
  kind: 'report';
}
export interface PassportFindingReference extends PassportSource {
  kind: 'finding';
  finding_id: string;
  /** Zero-based position in the exact published report's findings. */
  source_index: number;
}
export interface PassportChecklistReference extends PassportSource {
  kind: 'checklist';
  /** Published checklist IDs do not exist; position is local to this version. */
  source_index: number;
}
export type PassportEvidenceReference =
  | PassportReportReference
  | PassportFindingReference
  | PassportChecklistReference;

interface PassportObservation {
  reference: PassportFindingReference;
  category: string;
  location: string;
  severity: PublishedReport['findings'][number]['severity'];
  observation: string;
  recommendation: string;
}
interface PassportChecklistEvidence {
  reference: PassportChecklistReference;
  label: string;
  recorded_completed: boolean;
}
interface PassportReport {
  reference: PassportReportReference;
  visited_on: string;
  published_at: string;
  phase: PublishedReport['phase'];
  summary: string;
  observations: PassportObservation[];
  checklist: PassportChecklistEvidence[];
}
interface PassportSnapshot extends ReportBoundary {
  format: 'synthetic-property-service-evidence-v1';
  synthetic_only: true;
  coverage: 'available-published-inspections-only';
  history_completeness: 'UNKNOWN';
  physical_proof_of_work: 'UNVERIFIED';
  reports_available: number;
  reports: PassportReport[];
}
type Immutable<T> = T extends object
  ? { readonly [K in keyof T]: Immutable<T[K]> }
  : T;
export type PropertyPassportSnapshot = Immutable<PassportSnapshot>;
export type PropertyPassportFoundation = Immutable<{
  snapshot: PassportSnapshot;
  integrity: { algorithm: 'SHA-256'; sha256: string };
}>;
export type PropertyPassportEvidence = Immutable<
  | { status: 'AVAILABLE'; evidence: PassportReport }
  | { status: 'AVAILABLE'; evidence: PassportObservation }
  | { status: 'AVAILABLE'; evidence: PassportChecklistEvidence }
  | { status: 'UNKNOWN'; evidence: null }
>;

function freeze<T>(value: T): Immutable<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value as Immutable<T>;
}

function admit(
  model: CustomerPortalPreviewModel,
  admission: PropertyPassportAdmission,
) {
  if (
    admission.enabled !== true ||
    !model.repo.operations.sample ||
    !sampleCompanies.some((company) => company.id === model.company.id)
  )
    throw Error('Synthetic Property Passport foundation disabled');
}

function publishedSnapshot(
  model: CustomerPortalPreviewModel,
  boundary: ReportBoundary,
): PassportSnapshot {
  const { organization_id, customer_id, location_id } = boundary;
  if (
    organization_id !== model.company.id ||
    !reportUuid(customer_id) ||
    !reportUuid(location_id)
  )
    throw Error('Exact customer property unavailable');
  const data = model.read(); // Existing active synthetic customer/property selection.
  if (
    data.context.organization_id !== organization_id ||
    data.context.customer_id !== customer_id ||
    data.context.location_id !== location_id ||
    data.context.reports !== true
  )
    throw Error('Exact customer property unavailable');
  model.repo.operations.syntheticProperty(
    organization_id,
    customer_id,
    location_id,
  );
  if (
    data.reports.length > 500 ||
    new Set(data.reports.map((report) => report.id)).size !==
      data.reports.length
  )
    throw Error('Ambiguous published history');
  // The shared projection retains enum values after coercive validation. Admit
  // primitives first so no object can cross this detached snapshot/hash boundary.
  for (const report of data.reports) {
    if (
      typeof report.phase !== 'string' ||
      !['before', 'during', 'after'].includes(report.phase) ||
      !Array.isArray(report.findings) ||
      report.findings.some(
        (finding) =>
          typeof finding.severity !== 'string' ||
          !['low', 'moderate', 'urgent'].includes(finding.severity),
      )
    )
      throw Error('Invalid published evidence enums');
  }
  // Reuse the strict published allowlist; never copy visits, CRM records or reviews.
  const history = projectPublishedHistory(data.reports, {
    organization_id,
    customer_id,
    location_id,
  });
  const reports = history.map((report): PassportReport => {
    const source: PassportSource = {
      organization_id,
      customer_id,
      location_id,
      report_id: report.id,
      published_version: report.version,
    };
    return {
      reference: { ...source, kind: 'report' },
      visited_on: report.snapshot.visited_on,
      published_at: report.published_at,
      phase: report.snapshot.phase,
      summary: report.snapshot.summary,
      observations: report.snapshot.findings.map((finding, source_index) => ({
        reference: {
          ...source,
          kind: 'finding',
          finding_id: finding.id,
          source_index,
        },
        category: finding.category,
        location: finding.location,
        severity: finding.severity,
        observation: finding.description,
        recommendation: finding.recommendation,
      })),
      checklist: report.snapshot.checklist.map((item, source_index) => ({
        reference: { ...source, kind: 'checklist', source_index },
        label: item.label,
        recorded_completed: item.completed,
      })),
    };
  });
  return {
    format: 'synthetic-property-service-evidence-v1',
    organization_id,
    customer_id,
    location_id,
    synthetic_only: true,
    coverage: 'available-published-inspections-only',
    history_completeness: 'UNKNOWN',
    physical_proof_of_work: 'UNVERIFIED',
    reports_available: reports.length,
    reports,
  };
}

/** Unwired, read-only and default OFF. SHA-256 binds detached safe facts, not
 * physical completion, measurement truth, warranty, approval or financial authority.
 * No archive, new IDs, persistence, issuance, network port or replay exists here. */
export async function createPropertyPassportFoundation(
  model: CustomerPortalPreviewModel,
  boundary: ReportBoundary,
  admission: PropertyPassportAdmission = {},
): Promise<PropertyPassportFoundation> {
  admit(model, admission);
  // Pin only the exact identity before await; discard any extra private input fields.
  const target = {
    organization_id: boundary.organization_id,
    customer_id: boundary.customer_id,
    location_id: boundary.location_id,
  };
  const snapshot = publishedSnapshot(model, target);
  const sha256 = await documentHash(snapshot);
  admit(model, admission);
  if (
    JSON.stringify(publishedSnapshot(model, target)) !==
    JSON.stringify(snapshot)
  )
    throw Error('Published evidence changed; snapshot unavailable');
  return freeze({ snapshot, integrity: { algorithm: 'SHA-256', sha256 } });
}

/** Resolve only the exact currently accessible source. Missing/denied/ambiguous
 * evidence stays UNKNOWN. No latest-version, similar-finding or positional fallback. */
export function readPropertyPassportEvidence(
  model: CustomerPortalPreviewModel,
  reference: PassportEvidenceReference,
  admission: PropertyPassportAdmission = {},
): PropertyPassportEvidence {
  admit(model, admission);
  try {
    const fields = [
      'organization_id',
      'customer_id',
      'location_id',
      'report_id',
      'published_version',
      'kind',
    ];
    if (reference.kind === 'finding') fields.push('finding_id', 'source_index');
    else if (reference.kind === 'checklist') fields.push('source_index');
    else if (reference.kind !== 'report') throw Error('Invalid evidence kind');
    if (
      Object.keys(reference).length !== fields.length ||
      !fields.every((field) => Object.hasOwn(reference, field)) ||
      !reportUuid(reference.report_id) ||
      !Number.isSafeInteger(reference.published_version) ||
      reference.published_version < 1
    )
      throw Error('Invalid evidence reference');
    const snapshot = publishedSnapshot(model, reference);
    const report = snapshot.reports.find(
      (report) =>
        report.reference.report_id === reference.report_id &&
        report.reference.published_version === reference.published_version,
    );
    if (!report) throw Error('Exact report unavailable');
    if (reference.kind === 'report')
      return freeze({ status: 'AVAILABLE', evidence: report });
    if (
      !Number.isSafeInteger(reference.source_index) ||
      reference.source_index < 0
    )
      throw Error('Invalid evidence position');
    if (reference.kind === 'finding') {
      const finding = report.observations[reference.source_index];
      if (finding && finding.reference.finding_id === reference.finding_id)
        return freeze({ status: 'AVAILABLE', evidence: finding });
    } else if (reference.kind === 'checklist') {
      const checklist = report.checklist[reference.source_index];
      if (checklist)
        return freeze({ status: 'AVAILABLE', evidence: checklist });
    }
  } catch {
    // No grant is inferred from a retained snapshot/reference or from read failure.
  }
  return freeze({ status: 'UNKNOWN', evidence: null });
}
