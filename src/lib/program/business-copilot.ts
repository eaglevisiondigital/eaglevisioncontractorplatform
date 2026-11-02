import { documentHash } from '../../domain/release/preview';
import {
  assertPrototypeSourceCurrent,
  assertPrototypeSourceCurrentNow,
  freezePrototype,
  prototypeFields,
  type PrototypeAdmission,
  type PrototypeSource,
} from './prototype-source';
export interface CopilotReviewInput {
  review_on: string;
}
function confirm(gate: PrototypeAdmission) {
  const fields = prototypeFields(gate, ['enabled', 'confirmed']);
  if (fields.enabled !== true || fields.confirmed !== true)
    throw Error('Explicit enabled and confirmed Copilot review required');
}
function day(input: CopilotReviewInput) {
  const p = prototypeFields(input, ['review_on']);
  if (
    typeof p.review_on !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(p.review_on) ||
    !Number.isFinite(Date.parse(`${p.review_on}T00:00:00Z`)) ||
    new Date(`${p.review_on}T00:00:00Z`).toISOString().slice(0, 10) !==
      p.review_on
  )
    throw Error('Valid explicit calendar review date required');
  return p.review_on;
}
function projection(source: PrototypeSource, reviewOn: string) {
  const s = source.snapshot;
  const cards: {
    kind:
      | 'source_documentation'
      | 'estimate_scope'
      | 'job_cost_coverage'
      | 'time_review';
    priority: 'High' | 'Normal';
    observation: string;
    suggested_review: string;
    evidence: string[];
  }[] = [
    {
      kind: 'source_documentation',
      priority: s.property_snapshot === 'UNKNOWN' ? 'High' : 'Normal',
      observation:
        s.property_snapshot === 'UNKNOWN'
          ? 'Historical property snapshot is unavailable.'
          : 'The selected estimate retains a recorded property snapshot.',
      suggested_review:
        'Review the exact property and estimate source before further preparation.',
      evidence: [s.target.location_id, s.estimate.version_id],
    },
    {
      kind: 'estimate_scope',
      priority: 'Normal',
      observation: `${s.estimate.lines.length} scope lines are recorded in the selected ${s.estimate.status} version.`,
      suggested_review:
        s.estimate.status === 'draft'
          ? 'Inspect the saved private draft; decide manually whether editing is needed.'
          : 'Inspect immutable issued scope; any revision requires the existing separate workflow.',
      evidence: [s.estimate.id, s.estimate.version_id],
    },
  ];
  if (s.job)
    cards.push({
      kind: 'job_cost_coverage',
      priority: s.job.coverage === 'PARTIAL' ? 'High' : 'Normal',
      observation:
        s.job.coverage === 'PARTIAL'
          ? 'Canonical job financials report partial cost coverage.'
          : 'Canonical job financials report complete submitted coverage; final costs remain unverified.',
      suggested_review:
        'Review existing job costs and coverage without posting or changing policy.',
      evidence: [s.job.id, s.job.issued_version_id],
    });
  const unsubmitted = s.time.filter((entry) => !entry.submitted);
  if (unsubmitted.length)
    cards.push({
      kind: 'time_review',
      priority: 'High',
      observation: `${unsubmitted.length} recorded time entries are not submitted.`,
      suggested_review:
        'Inspect exact existing time evidence; no time, payroll or assignment is posted.',
      evidence: unsubmitted.map((entry) => entry.id),
    });
  cards.sort(
    (a, b) => Number(b.priority === 'High') - Number(a.priority === 'High'),
  );
  return {
    mode: 'deterministic-local-staff-review' as const,
    review_on: reviewOn,
    date_meaning:
      'Human-selected review context; no deadline or actual availability claim.',
    target: { ...s.target },
    source_sha256: source.sha256,
    estimate_version: s.estimate.version_id,
    estimate_lock_revision: s.estimate.lock_revision,
    job_lock_revision: s.job?.lock_revision ?? null,
    cards,
    history_coverage: 'UNKNOWN' as const,
    model: 'NONE' as const,
    authority: {
      save: false,
      issue: false,
      dispatch: false,
      communicate: false,
      financial: false,
      hosted: false,
    },
  };
}
function freezeReview(body: ReturnType<typeof projection>, sha256: string) {
  return freezePrototype({ snapshot: body, sha256 });
}
export type CopilotReview = ReturnType<typeof freezeReview>;
const holds = new Set<string>();
function sourceKey(source: PrototypeSource) {
  const t = source.snapshot.target;
  return JSON.stringify([
    t.organization_id,
    t.customer_id,
    t.location_id,
    t.estimate_id,
    t.version_id,
    t.job_id,
  ]);
}
const attempts = new WeakMap<
  PrototypeSource,
  'PENDING' | 'UNKNOWN' | 'PREPARED'
>();
const retained = new WeakMap<
  CopilotReview,
  { source: PrototypeSource; gate: PrototypeAdmission }
>();
/** One explicit session-only review per exact admitted source. No engine/provider action. */
export async function prepareCopilotReview(
  source: PrototypeSource,
  input: CopilotReviewInput,
  gate: PrototypeAdmission = {},
): Promise<CopilotReview> {
  confirm(gate);
  const reviewOn = day(input);
  if (attempts.has(source))
    throw Error(
      'Existing or UNKNOWN review; exact read-only reconciliation only',
    );
  attempts.set(source, 'PENDING');
  try {
    await assertPrototypeSourceCurrent(source);
    confirm(gate);
    const exact = sourceKey(source);
    if (holds.has(exact))
      throw Error('Existing or UNKNOWN exact source review; no replay');
    holds.add(exact);
    const body = projection(source, reviewOn);
    const sha256 = await documentHash(body);
    await assertPrototypeSourceCurrent(source);
    confirm(gate);
    assertPrototypeSourceCurrentNow(source);
    confirm(gate);
    const result = freezeReview(body, sha256);
    retained.set(result, { source, gate });
    attempts.set(source, 'PREPARED');
    return result;
  } catch (error) {
    attempts.set(source, 'UNKNOWN');
    throw error;
  }
}
/** No automatic replacement, source substitution, command or retry. */
export async function inspectCopilotReview(review: CopilotReview) {
  const binding = retained.get(review);
  if (!binding) throw Error('Unknown Copilot review');
  confirm(binding.gate);
  if ((await documentHash(review.snapshot)) !== review.sha256)
    throw Error('Copilot integrity mismatch');
  await assertPrototypeSourceCurrent(binding.source);
  confirm(binding.gate);
  assertPrototypeSourceCurrentNow(binding.source);
  confirm(binding.gate);
  return freezePrototype({ status: 'CURRENT' as const, replacement: null });
}
