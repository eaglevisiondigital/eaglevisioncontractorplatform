import {
  estimateUnits,
  type EstimateLine,
} from '../../domain/estimating/types';
import { documentHash } from '../../domain/release/preview';
import {
  assertPrototypeSourceCurrent,
  assertPrototypeSourceCurrentNow,
  freezePrototype,
  prototypeFields,
  type PrototypeAdmission,
  type PrototypeSource,
} from './prototype-source';

export type TranscriptLineSuggestion = Pick<
  EstimateLine,
  'kind' | 'description' | 'quantity_milli' | 'unit' | 'catalog_item_id'
>;
export interface VoiceEstimateInput {
  transcript: string;
}
function confirm(gate: PrototypeAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (p.enabled !== true || p.confirmed !== true)
    throw Error('Explicit enabled and confirmed transcript review required');
}
function transcript(input: VoiceEstimateInput) {
  const p = prototypeFields(input, ['transcript']);
  if (
    typeof p.transcript !== 'string' ||
    !p.transcript.trim() ||
    p.transcript.length > 2000 ||
    [...p.transcript].some(
      (char) => char.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(char),
    )
  )
    throw Error('Bounded nonempty synthetic transcript required');
  return p.transcript;
}
function clauses(source: PrototypeSource, text: string) {
  return [...text.matchAll(/[^;\n]+/g)]
    .filter((match) => match[0].trim())
    .map((match) => {
      const literal = match[0].trim();
      const start = (match.index ?? 0) + match[0].indexOf(literal);
      const span = {
        start,
        end: start + literal.length,
        literal,
        offset_unit: 'UTF-16' as const,
      };
      const parsed = /^(\d+(?:\.\d{1,3})?)\s+([a-z_]+)\s+(.+)$/.exec(literal);
      let warning: string | null = null;
      let suggestion: TranscriptLineSuggestion | null = null;
      let matches: typeof source.snapshot.catalog = [];
      if (!parsed)
        warning =
          'Use an explicit quantity, canonical unit and exact catalog name; no inference applied.';
      else {
        const [whole, fractional = ''] = parsed[1].split('.');
        const quantity =
          Number(whole) * 1000 + Number(fractional.padEnd(3, '0'));
        matches = source.snapshot.catalog.filter(
          (item) => item.name === parsed[3],
        );
        if (
          !Number.isSafeInteger(quantity) ||
          quantity <= 0 ||
          quantity > 1_000_000_000
        )
          warning = 'Quantity is invalid or outside this local review bound.';
        else if (!estimateUnits.some((unit) => unit === parsed[2]))
          warning = 'Unit is not an existing canonical estimate unit.';
        else if (matches.length !== 1)
          warning = matches.length
            ? 'Ambiguous exact catalog name; keep candidates separate for manual selection.'
            : 'No exact active catalog name; no fuzzy substitution applied.';
        else if (matches[0].unit !== parsed[2])
          warning =
            'Spoken unit differs from the exact catalog unit; no conversion inferred.';
        else
          suggestion = {
            kind: matches[0].kind,
            description: matches[0].description,
            quantity_milli: quantity,
            unit: matches[0].unit,
            catalog_item_id: matches[0].id,
          };
      }
      return {
        span,
        exact_catalog_candidates: matches.map((item) => item.id),
        suggestion,
        warning,
        price_evidence: 'NOT_PROJECTED' as const,
        application: 'MANUAL_EXISTING_EDITOR_ONLY' as const,
      };
    });
}
function projection(source: PrototypeSource, text: string) {
  return {
    mode: 'synthetic-transcript-review-only' as const,
    source_sha256: source.sha256,
    target: { ...source.snapshot.target },
    estimate_lock_revision: source.snapshot.estimate.lock_revision,
    clauses: clauses(source, text),
    recognition: 'NONE' as const,
    audio: 'NOT_CAPTURED' as const,
    total: 'NOT_CALCULATED' as const,
    authority: {
      autosave: false,
      issue: false,
      microphone: false,
      network: false,
      customer_delivery: false,
      financial: false,
    },
  };
}
function result(body: ReturnType<typeof projection>, sha256: string) {
  return freezePrototype({ snapshot: body, sha256 });
}
export type VoiceEstimateReview = ReturnType<typeof result>;
const holds = new Set<string>();
const bindings = new WeakMap<
  VoiceEstimateReview,
  { source: PrototypeSource; gate: PrototypeAdmission }
>();
function key(source: PrototypeSource) {
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
/** Literal parser only. No recognition service, model, issue/save command or external action. */
export async function prepareVoiceEstimate(
  source: PrototypeSource,
  input: VoiceEstimateInput,
  gate: PrototypeAdmission = {},
): Promise<VoiceEstimateReview> {
  confirm(gate);
  const text = transcript(input);
  await assertPrototypeSourceCurrent(source);
  confirm(gate);
  const exact = key(source);
  if (holds.has(exact))
    throw Error('Existing or UNKNOWN transcript review; no replay');
  holds.add(exact);
  const body = projection(source, text);
  const sha256 = await documentHash(body);
  await assertPrototypeSourceCurrent(source);
  confirm(gate);
  assertPrototypeSourceCurrentNow(source);
  confirm(gate);
  const review = result(body, sha256);
  bindings.set(review, { source, gate });
  return review;
}
export async function inspectVoiceEstimate(review: VoiceEstimateReview) {
  const binding = bindings.get(review);
  if (!binding) throw Error('Unknown transcript review');
  confirm(binding.gate);
  if ((await documentHash(review.snapshot)) !== review.sha256)
    throw Error('Transcript integrity mismatch');
  await assertPrototypeSourceCurrent(binding.source);
  confirm(binding.gate);
  assertPrototypeSourceCurrentNow(binding.source);
  confirm(binding.gate);
  return freezePrototype({ status: 'CURRENT' as const, replacement: null });
}
