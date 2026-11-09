import type {
  EstimateBundle,
  EstimateInput,
  EstimateLine,
} from '../../domain/estimating/types';
import { blankLine } from '../../domain/estimating/calculation';
import type { Phase3Repository } from '../../lib/phase3';
import {
  readPrototypeSource,
  assertPrototypeSourceCurrentNow,
  prototypeFields,
  type PrototypeTarget,
  type PrototypeAdmission,
} from '../../lib/program/prototype-source';
import {
  prepareVoiceEstimate,
  inspectVoiceEstimate,
  type VoiceEstimateInput,
} from '../../lib/program/voice-estimate';

export interface VoiceDraftContext {
  target: PrototypeTarget;
  input: VoiceEstimateInput;
  gate: PrototypeAdmission;
}
const prepared = new WeakSet<object>(); // Original ephemeral handles, not business state.

function confirmed(gate: PrototypeAdmission) {
  const value = prototypeFields(gate, ['enabled', 'confirmed']);
  if (value.enabled !== true || value.confirmed !== true)
    throw Error('Explicit local draft review confirmation required');
}
/** No writer: bind the native literal review to an existing editable draft/form. */
export async function prepareVoiceDraftReview(
  repo: Phase3Repository,
  context: VoiceDraftContext,
  bundle: EstimateBundle,
  liveDraft: () => EstimateInput,
  gate: PrototypeAdmission,
) {
  confirmed(context.gate);
  confirmed(gate);
  const originalText = prototypeFields(context.input, [
    'transcript',
  ]).transcript;
  if (typeof originalText !== 'string')
    throw Error('Literal transcript required');
  structuredClone(context.input);
  const targetKeys = [
    'organization_id',
    'actor_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ];
  const originalTarget = prototypeFields(
    context.target,
    targetKeys,
  ) as unknown as PrototypeTarget;
  repo.readSyntheticPrototypeSources(originalTarget);
  const targetBinding = JSON.stringify(originalTarget);
  const expected = JSON.stringify(liveDraft());
  const target: PrototypeTarget = {
    ...originalTarget,
    version_id: bundle.version.id,
    job_id: null, // A revision never replaces the original issued job baseline.
  };
  const check = () => {
    confirmed(context.gate);
    confirmed(gate);
    const liveTarget = prototypeFields(
      context.target,
      targetKeys,
    ) as unknown as PrototypeTarget;
    repo.readSyntheticPrototypeSources(liveTarget);
    if (
      prototypeFields(context.input, ['transcript']).transcript !==
        originalText ||
      JSON.stringify(liveTarget) !== targetBinding ||
      JSON.stringify(liveDraft()) !== expected
    )
      throw Error('Original transcript, confirmation or working draft changed');
    repo.readSyntheticPrototypeSources(originalTarget);
    const current = repo.readSyntheticPrototypeSources(target).bundle;
    const form = liveDraft();
    if (
      bundle.estimate.id !== originalTarget.estimate_id ||
      bundle.version.organization_id !== originalTarget.organization_id ||
      current.version.status !== 'draft' ||
      current.estimate.current_version_id !== bundle.version.id ||
      JSON.stringify(current.version) !== JSON.stringify(bundle.version) ||
      form.customer_id !== originalTarget.customer_id ||
      form.location_id !== originalTarget.location_id
    )
      throw Error('Exact current editable customer/property draft required');
  };
  check();
  const source = await readPrototypeSource(repo, target, gate);
  check();
  const review = await prepareVoiceEstimate(source, context.input, gate);
  check();
  const result = Object.freeze({
    review,
    originalText,
    expected,
    check: () => {
      check();
      assertPrototypeSourceCurrentNow(source);
    },
    catalog: () => {
      check();
      assertPrototypeSourceCurrentNow(source);
      return repo.readSyntheticPrototypeSources(target).catalog;
    },
  });
  prepared.add(result);
  return result;
}
export type VoiceDraftReview = Awaited<
  ReturnType<typeof prepareVoiceDraftReview>
>;

/** Build editor lines only after explicit selection; existing Save remains separate. */
export async function selectedVoiceDraftLines(
  state: VoiceDraftReview,
  selected: readonly number[],
  confirmed: boolean,
): Promise<EstimateLine[]> {
  if (!prepared.has(state))
    throw Error('Original prepared voice draft review required');
  state.check();
  if (
    !confirmed ||
    !selected.length ||
    new Set(selected).size !== selected.length
  )
    throw Error(
      'Review and explicitly confirm selected scope and catalog pricing',
    );
  await inspectVoiceEstimate(state.review);
  state.check();
  const catalog = state.catalog();
  const lines = selected.map((index) => {
    if (!Number.isSafeInteger(index) || index < 0)
      throw Error('Exact literal clause required');
    const suggestion = state.review.snapshot.clauses[index]?.suggestion;
    if (!suggestion)
      throw Error(
        'Missing quantity or exact catalog match; manual review required',
      );
    const items = catalog.filter(
      (item) => item.id === suggestion.catalog_item_id && item.active,
    );
    if (items.length !== 1) throw Error('Original catalog source changed');
    const item = items[0];
    return {
      ...blankLine(item.kind),
      ...suggestion,
      unit_cost_minor: item.unit_cost_minor,
      unit_price_minor: item.unit_price_minor,
      markup_bps: item.markup_bps,
    };
  });
  state.check();
  return lines;
}
