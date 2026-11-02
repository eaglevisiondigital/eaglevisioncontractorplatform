import { Phase3Repository } from '../phase3';
import { documentHash } from '../../domain/release/preview';
import {
  prepareCopilotReview,
  inspectCopilotReview,
  type CopilotReview,
} from '../program/business-copilot';
import {
  prepareVoiceEstimate,
  inspectVoiceEstimate,
  type VoiceEstimateReview,
} from '../program/voice-estimate';
import {
  prepareTradeEdition,
  inspectTradeEdition,
  tradeEditions,
  type TradeEdition,
  type TradeEditionReview,
} from '../program/trade-editions';
import {
  prepareProcurementReview,
  verifyProcurementReview,
  type ProcurementInput,
  type ProcurementReview,
} from '../program/procurement-review';
import {
  readPrototypeSource,
  assertPrototypeSourceCurrentNow,
  prototypeFields,
  freezePrototype,
  type PrototypeTarget,
  type PrototypeAdmission,
  type PrototypeSource,
} from '../program/prototype-source';

export interface IntelligenceAdvancedInput {
  transcript: string;
  edition: TradeEdition;
  catalog_item_ids: string[];
  procurement: ProcurementInput | null;
}
export interface IntelligenceWorkflowInput {
  review_on: string;
  advanced: IntelligenceAdvancedInput | null;
}
const keys = [
  'organization_id',
  'actor_id',
  'customer_id',
  'location_id',
  'estimate_id',
  'version_id',
  'job_id',
] as const;
const denied = () =>
  new Error('Exact confirmed local Intelligence workflow source required');
function own(value: unknown, allowed: readonly string[]) {
  const fields = prototypeFields(value, allowed);
  if (Reflect.ownKeys(fields).length !== allowed.length) throw denied();
  return fields;
}
function text(value: unknown, limit = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    throw denied();
  return value;
}
function targetInput(input: PrototypeTarget): PrototypeTarget {
  const fields = own(input, keys);
  for (const key of keys)
    if (!(key === 'job_id' && fields[key] === null)) text(fields[key]);
  return fields as unknown as PrototypeTarget;
}
function array(input: unknown, limit: number): unknown[] {
  if (
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    input.length > limit
  )
    throw denied();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(input).length !== input.length + 1) throw denied();
  return Array.from({ length: input.length }, (_, index) => {
    const descriptor = descriptors[index];
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw denied();
    return descriptor.value;
  });
}
function procurementInput(
  input: ProcurementInput | null,
): ProcurementInput | null {
  if (input === null) return null;
  const fields = own(input, ['kind', 'selections']);
  if (
    !['purchase-review', 'subcontractor-scope-review'].includes(
      fields.kind as string,
    )
  )
    throw denied();
  const selections = array(fields.selections, 50).map((row) => {
    const value = own(row, [
      'line_id',
      'catalog_item_id',
      'quantity_milli',
      'bid_minor',
    ]);
    text(value.line_id);
    text(value.catalog_item_id);
    if (
      !Number.isSafeInteger(value.quantity_milli) ||
      Number(value.quantity_milli) <= 0 ||
      (value.bid_minor !== null &&
        (!Number.isSafeInteger(value.bid_minor) || Number(value.bid_minor) < 0))
    )
      throw denied();
    return value as unknown as ProcurementInput['selections'][number];
  });
  if (!selections.length) throw denied();
  return { kind: fields.kind as ProcurementInput['kind'], selections };
}
function inputValue(
  input: IntelligenceWorkflowInput,
): IntelligenceWorkflowInput {
  const fields = own(input, ['review_on', 'advanced']);
  const date = text(fields.review_on, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw denied();
  if (fields.advanced === null) return { review_on: date, advanced: null };
  const advanced = own(fields.advanced, [
    'transcript',
    'edition',
    'catalog_item_ids',
    'procurement',
  ]);
  const transcript = text(advanced.transcript, 2000);
  if (!tradeEditions.some((edition) => edition === advanced.edition))
    throw denied();
  const catalog = array(advanced.catalog_item_ids, 20).map((id) => text(id));
  if (new Set(catalog).size !== catalog.length) throw denied();
  return {
    review_on: date,
    advanced: {
      transcript,
      edition: advanced.edition as TradeEdition,
      catalog_item_ids: catalog,
      procurement: procurementInput(
        advanced.procurement as ProcurementInput | null,
      ),
    },
  };
}
function admit(
  repo: Phase3Repository,
  target: PrototypeTarget,
  gate: PrototypeAdmission,
) {
  const fields = own(gate, ['enabled', 'confirmed']);
  if (
    fields.enabled !== true ||
    fields.confirmed !== true ||
    !(repo instanceof Phase3Repository) ||
    !repo.sample ||
    !repo.operations.sample
  )
    throw denied();
  const members = repo.operations
    .syntheticMemberships(target.organization_id)
    .filter((member) => member.user_id === target.actor_id);
  if (
    members.length !== 1 ||
    !members[0].active ||
    !['owner', 'admin'].includes(members[0].role)
  )
    throw denied();
  repo.operations.syntheticProperty(
    target.organization_id,
    target.customer_id,
    target.location_id,
  );
  return `${members[0].role}:${members[0].staff_type}`;
}
function sourceKey(target: PrototypeTarget) {
  // One source-estimate journey hold; new actor/version/property/job-null selectors cannot bypass it.
  return JSON.stringify([target.organization_id, target.estimate_id]);
}

interface Attempt {
  status: 'PENDING' | 'UNKNOWN' | 'PREPARED';
  phase: string;
}
// Session-only execution holds, never a business store or durable command custody.
const attempts = new Map<string, Attempt>();
const retained = new WeakMap<
  object,
  {
    source: PrototypeSource;
    gate: PrototypeAdmission;
    current: () => void;
    access: () => void;
    copilot: CopilotReview;
    voice: VoiceEstimateReview | null;
    trade: TradeEditionReview | null;
    procurement: ProcurementReview | null;
  }
>();

/** Actual same-source explainable review; no model, action executor, parser or engine duplication. */
export async function prepareIntelligenceWorkflow(
  repo: Phase3Repository,
  inputTarget: PrototypeTarget,
  value: IntelligenceWorkflowInput,
  gate: PrototypeAdmission = {},
) {
  const target = targetInput(inputTarget),
    input = inputValue(value);
  const role = admit(repo, target, gate);
  repo.readSyntheticPrototypeSources(target); // Actual admission before consuming the one session attempt.
  const identity = JSON.stringify(input),
    key = sourceKey(target);
  if (attempts.has(key))
    throw Error(
      'Existing, pending or UNKNOWN Intelligence workflow; exact read-only inspection only',
    );
  const attempt: Attempt = { status: 'PENDING', phase: 'SOURCE_READ' };
  attempts.set(key, attempt); // Synchronous and before first await; no revised-version bypass.
  try {
    const source = await readPrototypeSource(repo, target, gate);
    const access = () => {
      if (admit(repo, target, gate) !== role) throw denied();
    };
    const current = () => {
      access();
      const selected = targetInput(inputTarget);
      if (
        keys.some((field) => selected[field] !== target[field]) ||
        JSON.stringify(inputValue(value)) !== identity
      )
        throw denied();
      assertPrototypeSourceCurrentNow(source);
    };
    current();
    attempt.phase = 'COPILOT_PREPARATION';
    const copilot = await prepareCopilotReview(
      source,
      { review_on: input.review_on },
      gate,
    );
    current();
    await inspectCopilotReview(copilot);
    current();
    let voice: VoiceEstimateReview | null = null,
      trade: TradeEditionReview | null = null,
      procurement: ProcurementReview | null = null;
    let advanced: {
      status: string;
      voice: VoiceEstimateReview;
      trade: TradeEditionReview;
      procurement: { status: string; review: ProcurementReview | null };
      meaning: string;
    } | null = null;
    if (input.advanced) {
      attempt.phase = 'LITERAL_TRANSCRIPT_REVIEW';
      voice = await prepareVoiceEstimate(
        source,
        { transcript: input.advanced.transcript },
        gate,
      );
      current();
      await inspectVoiceEstimate(voice);
      current();
      attempt.phase = 'HUMAN_SELECTED_TRADE_REVIEW';
      trade = await prepareTradeEdition(
        source,
        {
          edition: input.advanced.edition,
          catalog_item_ids: input.advanced.catalog_item_ids,
        },
        gate,
      );
      current();
      await inspectTradeEdition(trade);
      current();
      let procurementStatus = 'NOT_REQUESTED';
      if (input.advanced.procurement) {
        for (const row of input.advanced.procurement.selections)
          if (
            !source.snapshot.estimate.lines.some(
              (line) => line.id === row.line_id && line.included,
            ) ||
            !source.snapshot.catalog.some(
              (item) => item.id === row.catalog_item_id,
            )
          )
            throw denied();
        const missingAssociation = input.advanced.procurement.selections.some(
          (row) =>
            source.snapshot.estimate.lines.find(
              (line) => line.id === row.line_id,
            )!.catalog_item_id !== row.catalog_item_id,
        );
        if (missingAssociation)
          procurementStatus = 'UNKNOWN_NO_RECORDED_SCOPE_CATALOG_ASSOCIATION';
        else {
          attempt.phase = 'EXACT_PROCUREMENT_REVIEW';
          procurement = await prepareProcurementReview(
            source,
            input.advanced.procurement,
            gate,
          );
          current();
          if ((await verifyProcurementReview(procurement)) !== 'CURRENT')
            throw denied();
          current();
          procurementStatus = 'PREPARED_LOCAL_REVIEW_ONLY';
        }
      }
      advanced = {
        status: 'LOCAL_REVIEW_ONLY',
        voice,
        trade,
        procurement: { status: procurementStatus, review: procurement },
        meaning:
          'Literal synthetic text, explicit edition and catalog choices only. Suggestions never modify issued scope, create an estimate, approve a supplier or execute an action.',
      };
    }
    attempt.phase = 'FINAL_SOURCE_CHECKPOINT';
    const body = {
      mode: 'LOCAL_SYNTHETIC_INTELLIGENCE_WORKFLOW' as const,
      audience: 'CURRENT_SYNTHETIC_OWNER_ADMIN_ONLY' as const,
      target,
      source_sha256: source.sha256,
      saved_version: {
        id: source.snapshot.estimate.version_id,
        number: source.snapshot.estimate.version_number,
        lock_revision: source.snapshot.estimate.lock_revision,
        status: source.snapshot.estimate.status,
      },
      job_revision: source.snapshot.job?.lock_revision ?? null,
      copilot,
      advanced,
      model: 'NONE' as const,
      microphone: 'NOT_CAPTURED' as const,
      review_date_meaning:
        'Human-selected review context only; not a deadline, calendar booking or availability evidence.',
      history_coverage: 'UNKNOWN' as const,
      genuine_authentication: 'UNVERIFIED' as const,
      custody: 'SESSION_ONLY_NO_REFRESH_OR_CRASH_DURABILITY' as const,
      authority: {
        save: false,
        issue: false,
        contract: false,
        dispatch: false,
        purchase_order: false,
        communicate: false,
        financial: false,
        microphone: false,
        network: false,
        hosted: false,
      },
    };
    const sha256 = await documentHash(body);
    current(); // Terminal synchronous source and original confirmation fence.
    const result = freezePrototype({ ...body, sha256 });
    retained.set(result, {
      source,
      gate,
      current,
      access,
      copilot,
      voice,
      trade,
      procurement,
    });
    attempt.status = 'PREPARED';
    attempt.phase = 'REVIEW_ONLY';
    return result;
  } catch (error) {
    attempt.status = 'UNKNOWN';
    throw error;
  }
}
export type IntelligenceWorkflowReview = Awaited<
  ReturnType<typeof prepareIntelligenceWorkflow>
>;
/** Current authorized metadata only; no continuation, reset, replacement or retry. */
export function readIntelligenceWorkflowAttempt(
  repo: Phase3Repository,
  inputTarget: PrototypeTarget,
  gate: PrototypeAdmission = {},
) {
  const target = targetInput(inputTarget);
  admit(repo, target, gate);
  const attempt = attempts.get(sourceKey(target));
  return freezePrototype({
    status: attempt?.status ?? 'NOT_STARTED',
    phase: attempt?.phase ?? 'NONE',
    retry: false,
    replacement: null,
  });
}
/** Exact retained review inspection only. Uncertain or copied evidence never replays preparation. */
export async function inspectIntelligenceWorkflow(
  review: IntelligenceWorkflowReview,
) {
  const binding = retained.get(review);
  if (!binding)
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  try {
    binding.current();
    await inspectCopilotReview(binding.copilot);
    binding.current();
    if (binding.voice) {
      await inspectVoiceEstimate(binding.voice);
      binding.current();
    }
    if (binding.trade) {
      await inspectTradeEdition(binding.trade);
      binding.current();
    }
    if (binding.procurement) {
      if ((await verifyProcurementReview(binding.procurement)) !== 'CURRENT')
        throw denied();
      binding.current();
    }
    const { sha256, ...body } = review;
    if ((await documentHash(body)) !== sha256) throw denied();
    binding.current();
    return freezePrototype({
      status: 'CURRENT_LOCAL_SOURCE' as const,
      replacement: null,
    });
  } catch (error) {
    try {
      binding.access();
    } catch {
      return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
    }
    return freezePrototype({
      status:
        error instanceof Error && error.message === 'Stale prototype source'
          ? ('STALE' as const)
          : ('UNKNOWN' as const),
      replacement: null,
    });
  }
}
