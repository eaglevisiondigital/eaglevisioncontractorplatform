import { calculateEstimate } from '../estimating/calculation';
import type {
  CatalogItem,
  EstimateBundle,
  TaxPolicy,
  EstimateUnit,
} from '../estimating/types';
import type { PublishedReport } from './inspections';
import type { RepairProvenance } from './repair-draft';
import { uuidPattern } from '../intake';

export const repairReviewSections = [
  { id: 'scope', label: 'Scope & source evidence' },
  { id: 'measurements', label: 'Quantities & measurements' },
  { id: 'resources', label: 'Materials & labor' },
  { id: 'pricing', label: 'Pricing & profitability' },
  { id: 'tax', label: 'Tax applicability' },
  { id: 'terms', label: 'Terms & completeness' },
] as const;
export type RepairReviewSection = (typeof repairReviewSections)[number]['id'];
export interface RepairReadinessEvidence {
  finding: PublishedReport['findings'][number];
  visited_on: string;
  suggested_scope: string;
  job_baseline_version_id: string | null;
}
export interface RepairReadinessContext {
  bundle: EstimateBundle;
  origin: RepairProvenance;
  evidence: RepairReadinessEvidence;
  policy: TaxPolicy | null;
  catalog: CatalogItem[];
  as_of: string;
}
export interface RepairMeasurement {
  line_id: string;
  quantity_milli: number;
  unit: EstimateUnit;
  basis: 'measured' | 'placeholder';
  reference: string;
}
export interface RepairReadinessInput {
  decision: 'confirmed' | 'needs_review';
  attested: boolean;
  note: string;
  measurements: RepairMeasurement[];
}
export interface RepairReadinessRequest {
  request_id: string;
  draft_version_id: string;
  lock_revision: number;
  expected_sequence: number;
  snapshot: string;
  section: RepairReviewSection;
  input: RepairReadinessInput;
}
export interface RepairReadinessReview {
  sequence: number;
  request: RepairReadinessRequest;
  actor: string;
  recorded_at: string;
  policy_id: string | null;
  policy_version: number | null;
  calculation: {
    engine_version: 1;
    currency: string;
    total_minor: number;
    cost_minor: number;
    gross_profit_minor: number;
    profit_margin_bps: number;
  };
}
/** Exact comparison token, not a signature or independent measurement attestation. */
export function repairReadinessSnapshot(c: RepairReadinessContext) {
  return JSON.stringify({
    bundle: c.bundle,
    origin: c.origin,
    evidence: c.evidence,
    policy: c.policy,
    catalog: [...c.catalog].sort((a, b) => a.id.localeCompare(b.id)),
    as_of: c.as_of,
  });
}
export function evaluateRepairReadiness(
  c: RepairReadinessContext,
  history: RepairReadinessReview[],
) {
  const { bundle: b, origin: o, evidence: e, policy, catalog } = c,
    p = b.version.payload;
  if (
    b.estimate.organization_id !== o.source.organization_id ||
    b.version.organization_id !== o.source.organization_id ||
    b.estimate.id !== o.estimate_id ||
    b.version.estimate_id !== o.estimate_id ||
    b.version.id !== o.draft_version_id ||
    b.estimate.current_version_id !== o.draft_version_id ||
    b.version.status !== 'draft' ||
    b.estimate.status !== 'draft' ||
    b.version.payload.customer_id !== o.source.customer_id ||
    b.estimate.customer_id !== o.source.customer_id ||
    p.location_id !== o.source.location_id ||
    e.finding.id !== o.source.finding_id ||
    p.lines.filter((l) => l.id === o.line_id).length !== 1 ||
    (policy &&
      (policy.organization_id !== o.source.organization_id ||
        policy.id !== p.tax_policy_id)) ||
    catalog.some((i) => i.organization_id !== o.source.organization_id) ||
    new Set(catalog.map((i) => i.id)).size !== catalog.length
  )
    throw Error('Exact repair readiness context unavailable.');
  const validPolicy =
    !!policy &&
    policy.active &&
    policy.status === 'reviewed' &&
    Number.isSafeInteger(policy.policy_version) &&
    policy.policy_version > 0;
  const calculation = calculateEstimate(p, validPolicy ? policy.rate_bps : 0);
  const snapshot = repairReadinessSnapshot(c);
  const blockers: Record<RepairReviewSection, string[]> = {
    scope: [],
    measurements: [],
    resources: [],
    pricing: [],
    tax: [],
    terms: [],
  };
  const warnings: Record<RepairReviewSection, string[]> = {
    scope: [],
    measurements: [],
    resources: [],
    pricing: [],
    tax: [],
    terms: [],
  };
  const sourceLine = p.lines.find((l) => l.id === o.line_id)!;
  if (
    sourceLine.description.trim() === e.suggested_scope.trim() ||
    sourceLine.description.trim() === e.finding.description.trim()
  )
    blockers.scope.push(
      'Replace suggested/observed wording with a contractor-defined proposed repair scope.',
    );
  if (
    p.project.description.trim().length < 8 ||
    p.project.description ===
      'Proposed scope only; all quantities and pricing require contractor review.'
  )
    blockers.scope.push(
      'Describe the proposed work and boundaries in Scope description.',
    );
  if (p.lines.some((l) => l.unit_cost_minor <= 0))
    blockers.resources.push(
      'Every scope line needs a reviewed positive unit cost; zero or missing costs remain outstanding.',
    );
  if (!p.lines.some((l) => l.kind === 'material' || l.kind === 'product'))
    warnings.resources.push(
      'No separate materials recorded. Explain packaged service scope, allowances or why materials are not needed.',
    );
  if (!p.lines.some((l) => l.kind === 'labor'))
    warnings.resources.push(
      'No separate labor recorded. Explain included labor/hours/rates or why labor is not needed.',
    );
  for (const l of p.lines) {
    if (l.kind === 'labor' && !['hour', 'day', 'lump_sum'].includes(l.unit))
      warnings.resources.push(
        'Review labor units and explain any non-hour/day/lump-sum basis.',
      );
    if (l.kind === 'allowance')
      warnings.resources.push(
        'Allowance amounts and assumptions need explicit contractor judgment.',
      );
    if (l.catalog_item_id) {
      const item = catalog.find((i) => i.id === l.catalog_item_id);
      if (!item || !item.active)
        blockers.resources.push(
          'A referenced company catalog item is missing or inactive.',
        );
      else if (
        item.description !== l.description ||
        item.unit !== l.unit ||
        item.unit_cost_minor !== l.unit_cost_minor ||
        item.kind !== l.kind
      )
        warnings.resources.push(
          'Catalog description, unit, kind or cost differs. Document and review the substitution or override.',
        );
    }
  }
  if (
    calculation.lines.some((l) => l.unit_price_minor <= 0) ||
    calculation.total_minor <= 0
  )
    blockers.pricing.push(
      'Zero or missing selling prices/totals require contractor pricing review.',
    );
  if (calculation.gross_profit_minor <= 0)
    warnings.pricing.push(
      'Estimated gross profit is zero or negative. Review the cost, discount and selling-price assumptions.',
    );
  if (JSON.stringify(calculation) !== JSON.stringify(b.version.calculation))
    blockers.pricing.push(
      'Current calculation differs from the saved draft. Save again before confirming pricing.',
    );
  if (!validPolicy)
    blockers.tax.push(
      'Select an active reviewed company tax policy; tax applicability is unverified, including zero-tax treatment.',
    );
  if (
    validPolicy &&
    JSON.stringify(b.version.tax_policy_snapshot) !== JSON.stringify(policy)
  )
    blockers.tax.push(
      'Tax policy version or configuration changed. Save the draft against the current policy.',
    );
  if (p.terms.trim().length < 8)
    blockers.terms.push('Add project terms for contractor review.');
  if (p.expires_on < c.as_of)
    blockers.terms.push('The draft expiration date has passed.');
  const sections = repairReviewSections.map((section) => {
    const last = [...history]
      .reverse()
      .find((r) => r.request.section === section.id);
    const current = !!last && last.request.snapshot === snapshot;
    const confirmed = current && last.request.input.decision === 'confirmed';
    const messages = [...blockers[section.id]];
    if (section.id === 'measurements' && !confirmed)
      messages.push(
        'All saved quantities remain unmeasured/placeholder until staff records matching measured quantities, units and supporting references.',
      );
    return {
      ...section,
      blockers: messages,
      warnings: [...new Set(warnings[section.id])],
      confirmed: confirmed && messages.length === 0,
      stale: !!last && !current,
      last: last ? structuredClone(last) : null,
    };
  });
  return {
    snapshot,
    sequence: history.at(-1)?.sequence ?? 0,
    calculation,
    validPolicy,
    ready: sections.every((s) => s.confirmed),
    confirmed: sections.filter((s) => s.confirmed).length,
    sections,
    history: structuredClone(history),
    origin: structuredClone(o),
    evidence: structuredClone(e),
    lines: structuredClone(p.lines),
    policy: policy ? structuredClone(policy) : null,
    currency: p.currency,
    draft_version_id: b.version.id,
    lock_revision: b.version.lock_revision,
  };
}
export function recordRepairReadiness(
  c: RepairReadinessContext,
  history: RepairReadinessReview[],
  actor: string,
  request: RepairReadinessRequest,
) {
  const current = evaluateRepairReadiness(c, history);
  if (
    !request ||
    Object.keys(request).sort().join(',') !==
      'draft_version_id,expected_sequence,input,lock_revision,request_id,section,snapshot' ||
    !uuidPattern.test(request.request_id) ||
    !repairReviewSections.some((s) => s.id === request.section) ||
    request.draft_version_id !== current.draft_version_id ||
    request.lock_revision !== current.lock_revision ||
    request.snapshot !== current.snapshot
  )
    throw Error(
      'Draft, source, policy or calculation changed. Reload readiness; old review cannot carry forward.',
    );
  const old = history.find((r) => r.request.request_id === request.request_id);
  if (old) {
    if (
      old.actor !== actor ||
      JSON.stringify(old.request) !== JSON.stringify(request)
    )
      throw Error('Readiness request key reused with different evidence.');
    return { review: structuredClone(old), duplicate: true };
  }
  if (
    !Number.isSafeInteger(request.expected_sequence) ||
    request.expected_sequence < 0 ||
    request.expected_sequence !== current.sequence ||
    current.sequence >= Number.MAX_SAFE_INTEGER
  )
    throw Error('Readiness review changed. Reload before recording.');
  const input = request.input;
  if (
    !input ||
    Object.keys(input).sort().join(',') !==
      'attested,decision,measurements,note' ||
    !['confirmed', 'needs_review'].includes(input.decision) ||
    typeof input.attested !== 'boolean' ||
    input.attested !== (input.decision === 'confirmed') ||
    typeof input.note !== 'string' ||
    input.note.trim().length < 8 ||
    input.note.length > 1000 ||
    !Array.isArray(input.measurements) ||
    input.measurements.length > c.bundle.version.payload.lines.length
  )
    throw Error(
      'Explicit consistent review decision and a supporting note are required.',
    );
  if (request.section !== 'measurements' && input.measurements.length)
    throw Error('Measurement evidence belongs only to quantity review.');
  if (input.decision === 'confirmed') {
    const section = current.sections.find((s) => s.id === request.section)!;
    if (section.confirmed)
      throw Error(
        'This section is already confirmed for the exact saved state.',
      );
    if (request.section === 'measurements') {
      if (
        input.measurements.length !== c.bundle.version.payload.lines.length ||
        new Set(input.measurements.map((m) => m.line_id)).size !==
          input.measurements.length
      )
        throw Error(
          'Provide one exact measurement per saved line, including options.',
        );
      for (const l of c.bundle.version.payload.lines) {
        const m = input.measurements.find((m) => m.line_id === l.id);
        if (
          !m ||
          Object.keys(m).sort().join(',') !==
            'basis,line_id,quantity_milli,reference,unit' ||
          m.basis !== 'measured' ||
          m.quantity_milli !== l.quantity_milli ||
          m.unit !== l.unit ||
          typeof m.reference !== 'string' ||
          m.reference.trim().length < 8 ||
          m.reference.length > 300
        )
          throw Error(
            'Placeholder, missing or contradictory measurements cannot be confirmed.',
          );
      }
    } else if (section.blockers.length)
      throw Error(
        'Resolve outstanding items before confirming this review section.',
      );
  }
  const last = [...history]
    .reverse()
    .find((r) => r.request.section === request.section);
  if (
    last?.request.snapshot === current.snapshot &&
    JSON.stringify(last.request.input) === JSON.stringify(input)
  )
    throw Error('Identical readiness evidence already recorded.');
  return {
    duplicate: false,
    review: {
      sequence: current.sequence + 1,
      request: structuredClone(request),
      actor,
      recorded_at: new Date().toISOString(),
      policy_id: c.policy?.id ?? null,
      policy_version: c.policy?.policy_version ?? null,
      calculation: {
        engine_version: current.calculation.engine_version,
        currency: current.calculation.currency,
        total_minor: current.calculation.total_minor,
        cost_minor: current.calculation.cost_minor,
        gross_profit_minor: current.calculation.gross_profit_minor,
        profit_margin_bps: current.calculation.profit_margin_bps,
      },
    } satisfies RepairReadinessReview,
  };
}
