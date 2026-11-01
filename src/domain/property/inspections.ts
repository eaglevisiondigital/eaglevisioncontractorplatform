import { Temporal } from '@js-temporal/polyfill';
export interface Finding {
  id: string;
  category: string;
  location: string;
  severity: 'low' | 'moderate' | 'urgent';
  description: string;
  recommendation: string;
  customer_visible: boolean;
}
export interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
  completed: boolean;
}
export interface VisitContent {
  summary: string;
  internal_notes: string;
  checklist: ChecklistItem[];
  findings: Finding[];
}
export interface InspectionPlan {
  id: string;
  revision: number;
  organization_id: string;
  customer_id: string;
  location_id: string;
  job_id: string | null;
  name: string;
  cadence: 'once' | 'weekly' | 'monthly' | 'custom';
  interval_days: number;
  timezone: string;
  starts_on: string;
  checklist: ChecklistItem[];
}
export interface Visit {
  id: string;
  organization_id: string;
  plan_id: string;
  visited_on: string;
  phase: 'before' | 'during' | 'after';
  revision: number;
  status: 'draft' | 'submitted' | 'published';
  content: VisitContent;
}
export interface PublishedReport {
  id: string;
  organization_id: string;
  customer_id: string;
  location_id: string;
  visit_id: string;
  visited_on: string;
  phase: Visit['phase'];
  version: number;
  published_at: string;
  summary: string;
  findings: Omit<Finding, 'customer_visible'>[];
  checklist: { label: string; completed: boolean }[];
}
const text = (s: string, max: number) => {
  if (typeof s !== 'string' || s.trim().length < 1 || s.length > max)
    throw Error('Invalid inspection text');
  return s.trim();
};
export function validateVisit(c: VisitContent) {
  text(c.summary, 2000);
  if (
    typeof c.internal_notes !== 'string' ||
    c.internal_notes.length > 4000 ||
    !Array.isArray(c.checklist) ||
    c.checklist.length > 100 ||
    !Array.isArray(c.findings) ||
    c.findings.length > 100
  )
    throw Error('Inspection limits');
  for (const key of ['checklist', 'findings'] as const)
    if (new Set(c[key].map((x) => x.id)).size !== c[key].length)
      throw Error('Duplicate inspection item');
  for (const x of c.checklist) {
    text(x.id, 100);
    text(x.label, 200);
    if (typeof x.completed !== 'boolean' || typeof x.required !== 'boolean')
      throw Error('Checklist value');
  }
  for (const x of c.findings) {
    text(x.id, 100);
    text(x.description, 1000);
    text(x.recommendation, 1000);
    text(x.category, 100);
    text(x.location, 200);
    if (
      !['low', 'moderate', 'urgent'].includes(x.severity) ||
      typeof x.customer_visible !== 'boolean'
    )
      throw Error('Finding value');
  }
  return structuredClone(c);
}
export function publishVisit(
  plan: InspectionPlan,
  visit: Visit,
  version: number,
): PublishedReport {
  if (
    plan.organization_id !== visit.organization_id ||
    plan.id !== visit.plan_id ||
    visit.status !== 'submitted' ||
    !Number.isSafeInteger(version) ||
    version < 1
  )
    throw Error('Submitted current inspection required');
  const c = validateVisit(visit.content);
  if (c.checklist.some((x) => x.required && !x.completed))
    throw Error('Complete required checklist items');
  return {
    id: crypto.randomUUID(),
    organization_id: plan.organization_id,
    customer_id: plan.customer_id,
    location_id: plan.location_id,
    visit_id: visit.id,
    visited_on: visit.visited_on,
    phase: visit.phase,
    version,
    published_at: new Date().toISOString(),
    summary: c.summary,
    findings: c.findings
      .filter((x) => x.customer_visible)
      .map((x) => ({
        id: x.id,
        description: x.description,
        recommendation: x.recommendation,
        severity: x.severity,
        category: x.category,
        location: x.location,
      })),
    checklist: c.checklist.map((x) => ({
      label: x.label,
      completed: x.completed,
    })),
  };
}
/** Anchor monthly recurrence to the original day; February cannot shift later visits. */
export function occurrence(
  plan: Pick<
    InspectionPlan,
    'starts_on' | 'cadence' | 'interval_days' | 'timezone'
  >,
  index: number,
) {
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index > 10000 ||
    !['once', 'weekly', 'monthly', 'custom'].includes(plan.cadence) ||
    !Number.isInteger(plan.interval_days) ||
    plan.interval_days < 1 ||
    plan.interval_days > 365
  )
    throw Error('Invalid recurrence');
  const start = Temporal.PlainDate.from(plan.starts_on);
  start.toZonedDateTime({ timeZone: plan.timezone, plainTime: '09:00' });
  if (plan.cadence === 'once' && index > 0) return null;
  return (
    plan.cadence === 'monthly'
      ? start.add({ months: index })
      : start.add({
          days:
            index *
            (plan.cadence === 'weekly'
              ? 7
              : plan.cadence === 'custom'
                ? plan.interval_days
                : 0),
        })
  ).toString();
}
