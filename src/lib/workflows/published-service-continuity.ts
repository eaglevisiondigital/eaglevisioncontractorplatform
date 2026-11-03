import { sampleCompanies } from '../../domain/platform';
import type { PublishedReport } from '../../domain/property/inspections';
import {
  parsePropertyReportPage,
  projectPublishedHistory,
  reportUuid,
  type PropertyReportPage,
} from '../../domain/property/report-page';
import { freezePrototype } from '../program/prototype-source';
import {
  readServiceRevisionReview,
  assertServiceRevisionCurrent,
  type ServiceRevisionRead,
} from './service-revision-review';
import {
  evidenceFields,
  evidenceList,
  evidenceLiteral,
  evidenceNumber,
  evidenceText,
  type EvidenceRecipe,
  type EvidenceIdentity,
} from './saved-evidence-runtime';
import type { SavedRevisionSnapshot } from './saved-revision-runtime';
const sourceKeys = [
  'organization_id',
  'customer_id',
  'location_id',
  'estimate_id',
  'version_id',
  'job_id',
] as const;
function uuid(v: unknown) {
  if (!reportUuid(v)) throw Error('Exact published source UUID required');
  return v;
}
function organization(v: unknown) {
  const id = evidenceText(v, 200);
  if (!reportUuid(id) && !sampleCompanies.some((c) => c.id === id))
    throw Error('Exact canonical organization identity required');
  return id;
}
function hash(v: unknown) {
  if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v))
    throw Error('Exact published source SHA-256 required');
  return v;
}
function source(value: unknown): EvidenceIdentity {
  const p = evidenceFields(value, sourceKeys);
  return {
    organization_id: organization(p.organization_id),
    customer_id: uuid(p.customer_id),
    location_id: uuid(p.location_id),
    estimate_id: uuid(p.estimate_id),
    version_id: uuid(p.version_id),
    job_id: uuid(p.job_id),
  };
}
function reference(value: unknown, owner: EvidenceIdentity) {
  const p = evidenceFields(value, [
    'organization_id',
    'customer_id',
    'location_id',
    'report_id',
    'published_version',
    'kind',
  ]);
  if (
    p.organization_id !== owner.organization_id ||
    p.customer_id !== owner.customer_id ||
    p.location_id !== owner.location_id
  )
    throw Error('Exact published report ownership required');
  return {
    organization_id: owner.organization_id,
    customer_id: owner.customer_id,
    location_id: owner.location_id,
    report_id: uuid(p.report_id),
    published_version: evidenceNumber(p.published_version, 1),
    kind: evidenceLiteral(p.kind, 'report'),
  };
}
/** Admit own data before the existing parser touches any field. The original
 * parser remains the authority for published enums/dates/limits/safe content. */
function page(
  value: unknown,
  owner: EvidenceIdentity,
  visitId: string,
): PropertyReportPage {
  const p = evidenceFields(value, [
    'organization_id',
    'customer_id',
    'location_id',
    'reports',
    'media',
    'mode',
    'report_only',
  ]);
  const reports = evidenceList(p.reports, 1);
  if (reports.length !== 1)
    throw Error('One exact published report per source required');
  const admitted = reports.map((value) => {
    const r = evidenceFields(value, [
        'id',
        'version',
        'published_at',
        'snapshot',
      ]),
      s = evidenceFields(r.snapshot, [
        'summary',
        'visited_on',
        'phase',
        'findings',
        'checklist',
        'media',
      ]);
    return {
      id: uuid(r.id),
      version: evidenceNumber(r.version, 1),
      published_at: evidenceText(r.published_at, 100),
      snapshot: {
        summary: evidenceText(s.summary, 2000),
        visited_on: evidenceText(s.visited_on, 10),
        phase: evidenceText(s.phase, 10),
        findings: evidenceList(s.findings, 100).map((value) => {
          const f = evidenceFields(value, [
            'id',
            'category',
            'location',
            'severity',
            'description',
            'recommendation',
          ]);
          return {
            id: evidenceText(f.id, 100),
            category: evidenceText(f.category, 100),
            location: evidenceText(f.location, 200),
            severity: evidenceText(f.severity, 20),
            description: evidenceText(f.description, 1000),
            recommendation: evidenceText(f.recommendation, 1000),
          };
        }),
        checklist: evidenceList(s.checklist, 100).map((value) => {
          const c = evidenceFields(value, ['label', 'completed']);
          if (typeof c.completed !== 'boolean')
            throw Error('Recorded checklist boolean required');
          return { label: evidenceText(c.label, 200), completed: c.completed };
        }),
        media: evidenceList(s.media, 0),
      },
    };
  });
  const target = {
    organization_id: owner.organization_id,
    customer_id: owner.customer_id,
    location_id: owner.location_id,
  };
  if (
    p.organization_id !== target.organization_id ||
    p.customer_id !== target.customer_id ||
    p.location_id !== target.location_id
  )
    throw Error('Exact published page ownership required');
  const body = {
    ...target,
    reports: admitted,
    media: evidenceList(p.media, 0) as never[],
    mode: evidenceLiteral(p.mode, 'internal-development'),
    report_only: evidenceLiteral(p.report_only, true),
  };
  // Synthetic company IDs are the canonical approved literals, not UUIDs. Reuse
  // the original local history projection (same strict report validator) without
  // inventing replacement tenant IDs to satisfy the connected page boundary.
  if (reportUuid(target.organization_id))
    return parsePropertyReportPage(body, target);
  const published = projectPublishedHistory(
    admitted.map(
      (r) =>
        ({
          ...target,
          id: r.id,
          version: r.version,
          published_at: r.published_at,
          visit_id: visitId,
          summary: r.snapshot.summary,
          visited_on: r.snapshot.visited_on,
          phase: r.snapshot.phase,
          findings: r.snapshot.findings,
          checklist: r.snapshot.checklist,
        }) as PublishedReport,
    ),
    target,
  );
  return { ...body, reports: published };
}
export function parsePublishedServiceEvidence(
  value: unknown,
  expected: EvidenceIdentity,
) {
  const p = evidenceFields(value, [
      'format',
      'source',
      'request_id',
      'request_job_link',
      'property_label',
      'issued_source_sha256',
      'scope',
      'source_anchor',
      'reports',
      'physical_completion',
      'customer_acceptance',
      'warranty',
      'delivery',
      'history_completeness',
    ]),
    owner = source(p.source),
    scope = evidenceFields(p.scope, ['name', 'description', 'lines']);
  const lines = evidenceList(scope.lines, 500).map((value) => {
    const l = evidenceFields(value, [
      'id',
      'description',
      'quantity_milli',
      'unit',
    ]);
    const id = evidenceText(l.id, 100);
    if (!id) throw Error('Exact issued scope line required');
    return {
      id,
      description: evidenceText(l.description, 2000),
      quantity_milli: evidenceNumber(l.quantity_milli),
      unit: evidenceText(l.unit, 100),
    };
  });
  if (new Set(lines.map((l) => l.id)).size !== lines.length)
    throw Error('Ambiguous issued scope lines');
  const reports = evidenceList(p.reports, 500).map((value) => {
    const r = evidenceFields(value, [
        'reference',
        'visit_id',
        'plan_id',
        'sha256',
        'report_page',
      ]),
      ref = reference(r.reference, owner),
      published = page(r.report_page, owner, uuid(r.visit_id)),
      row = published.reports[0];
    if (row.id !== ref.report_id || row.version !== ref.published_version)
      throw Error('Exact report ID/version reference required');
    return {
      reference: ref,
      visit_id: uuid(r.visit_id),
      plan_id: uuid(r.plan_id),
      sha256: hash(r.sha256),
      report_page: published,
    };
  });
  if (
    !reports.length ||
    new Set(reports.map((r) => r.reference.report_id)).size !==
      reports.length ||
    new Set(
      reports.map((r) =>
        JSON.stringify([r.visit_id, r.reference.published_version]),
      ),
    ).size !== reports.length
  )
    throw Error(
      'Unique available published report/version provenance required',
    );
  if (JSON.stringify(owner) !== JSON.stringify(source(expected)))
    throw Error('Payload must match exact evidence envelope ownership');
  for (const visit of new Set(reports.map((r) => r.visit_id))) {
    const versions = reports
      .filter((r) => r.visit_id === visit)
      .map((r) => r.reference.published_version)
      .sort((a, b) => a - b);
    if (versions.some((v, i) => v !== i + 1))
      throw Error('Published version history has a missing sibling');
  }
  const anchor = reference(p.source_anchor, owner);
  if (
    !reports.some(
      (r) =>
        r.reference.report_id === anchor.report_id &&
        r.reference.published_version === anchor.published_version,
    )
  )
    throw Error(
      'Original exact source anchor must remain in published history',
    );
  return freezePrototype({
    format: evidenceLiteral(p.format, 'published-service-evidence-v1'),
    source: owner,
    request_id: uuid(p.request_id),
    request_job_link: evidenceLiteral(
      p.request_job_link,
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    ),
    property_label: evidenceText(p.property_label, 1000),
    issued_source_sha256: hash(p.issued_source_sha256),
    scope: {
      name: evidenceText(scope.name, 2000),
      description: evidenceText(scope.description, 4000),
      lines,
    },
    source_anchor: anchor,
    reports,
    physical_completion: evidenceLiteral(p.physical_completion, 'UNVERIFIED'),
    customer_acceptance: evidenceLiteral(p.customer_acceptance, 'UNVERIFIED'),
    warranty: evidenceLiteral(p.warranty, 'UNVERIFIED'),
    delivery: evidenceLiteral(p.delivery, 'NOT_SENT'),
    history_completeness: evidenceLiteral(p.history_completeness, 'UNKNOWN'),
  });
}
export type PublishedServiceEvidence = ReturnType<
  typeof parsePublishedServiceEvidence
>;
/** Named safe fields only; actor, workforce, costs and internal visit content
 * never enter the complete-file DTO. The original C19 reader owns source checks. */
export function projectPublishedServiceEvidence(
  snapshot: SavedRevisionSnapshot<unknown>,
): PublishedServiceEvidence {
  const view = snapshot as ServiceRevisionRead;
  assertServiceRevisionCurrent(view);
  const identity = source(
      Object.fromEntries(sourceKeys.map((key) => [key, view.identity[key]])),
    ),
    e = view.evidence;
  return parsePublishedServiceEvidence(
    {
      format: 'published-service-evidence-v1',
      source: identity,
      request_id: e.request_id,
      request_job_link: e.request_job_link,
      property_label: e.property_label,
      issued_source_sha256: e.issued_source_sha256,
      scope: {
        name: e.scope.name,
        description: e.scope.description,
        lines: e.scope.lines.map((l) => ({
          id: l.id,
          description: l.description,
          quantity_milli: l.quantity_milli,
          unit: l.unit,
        })),
      },
      source_anchor: { ...e.selected.reference },
      reports: e.reports.map((r) => ({
        reference: { ...r.reference },
        visit_id: r.visit_id,
        plan_id: r.plan_id,
        sha256: r.sha256,
        report_page: {
          organization_id: identity.organization_id,
          customer_id: identity.customer_id,
          location_id: identity.location_id,
          reports: [
            {
              id: r.reference.report_id,
              version: r.reference.published_version,
              published_at: r.report.published_at,
              snapshot: {
                summary: r.report.summary,
                visited_on: r.report.visited_on,
                phase: r.report.phase,
                findings: r.report.observations.map((o) => ({
                  id: o.reference.finding_id,
                  category: o.category,
                  location: o.location,
                  severity: o.severity,
                  description: o.observation,
                  recommendation: o.recommendation,
                })),
                checklist: r.report.checklist.map((c) => ({
                  label: c.label,
                  completed: c.recorded_completed,
                })),
                media: [],
              },
            },
          ],
          media: [],
          mode: 'internal-development',
          report_only: true,
        },
      })),
      physical_completion: 'UNVERIFIED',
      customer_acceptance: 'UNVERIFIED',
      warranty: 'UNVERIFIED',
      delivery: 'NOT_SENT',
      history_completeness: 'UNKNOWN',
    },
    identity,
  );
}
/** Current canonical records must still contain every archived exact immutable
 * report, visit/plan/job link and issued source. New sibling versions may coexist. */
export function validatePublishedServiceEvidence(
  payload: PublishedServiceEvidence,
  snapshot: SavedRevisionSnapshot<unknown>,
) {
  const historical = parsePublishedServiceEvidence(
      payload,
      source(
        Object.fromEntries(
          sourceKeys.map((key) => [key, snapshot.identity[key]]),
        ),
      ),
    ),
    current = projectPublishedServiceEvidence(snapshot);
  const equal = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  if (
    !equal(historical.source, current.source) ||
    historical.request_id !== current.request_id ||
    historical.issued_source_sha256 !== current.issued_source_sha256 ||
    !equal(historical.scope, current.scope)
  )
    throw Error('Exact current service source/issued ownership required');
  for (const old of historical.reports) {
    const found = current.reports.filter(
      (r) => r.reference.report_id === old.reference.report_id,
    );
    if (found.length !== 1 || !equal(found[0], old))
      throw Error(
        'Archived published report missing, rewritten or provenance changed',
      );
  }
}
export const publishedServiceEvidenceRecipe: EvidenceRecipe<PublishedServiceEvidence> =
  Object.freeze({
    kind: 'customer',
    title: 'Published service',
    read: readServiceRevisionReview,
    project: projectPublishedServiceEvidence,
    parse: parsePublishedServiceEvidence,
    assertSource: validatePublishedServiceEvidence,
  });
