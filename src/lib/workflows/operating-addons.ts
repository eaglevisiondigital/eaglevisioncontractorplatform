import { documentHash } from '../../domain/release/preview';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  prototypeFields,
  freezePrototype,
  readPrototypeSource,
} from '../program/prototype-source';
import { prepareVoiceEstimate } from '../program/voice-estimate';
import { prepareStormNetworkReview } from '../program/storm-network-review';
import { prepareGrowthOpportunity } from '../growth-opportunity-review';
import { reviewOperationsExperiments } from '../operations-experiments';
import { readFieldWorkOrders } from '../field-work-orders';
import { readFinanceWorkflow } from './finance-workflow';
import { capacityDay } from '../../domain/field/crew-capacity';

export const operatingAddonKinds = [
  'offline',
  'voice',
  'receptionist',
  'storm_network',
  'accounting',
  'procurement',
] as const;
export interface OperatingAddonInput {
  job_id: string;
  kind: (typeof operatingAddonKinds)[number];
  note: string;
  review_on: string;
  manual_priority: 'low' | 'normal' | 'high' | 'urgent';
}
function pin(input: OperatingAddonInput) {
  const p = prototypeFields(input, [
    'job_id',
    'kind',
    'note',
    'review_on',
    'manual_priority',
  ]);
  if (
    Object.keys(p).length !== 5 ||
    typeof p.job_id !== 'string' ||
    !p.job_id ||
    p.job_id.length > 200 ||
    !operatingAddonKinds.includes(p.kind as OperatingAddonInput['kind']) ||
    typeof p.note !== 'string' ||
    !p.note.trim() ||
    p.note.length > 2000 ||
    !['low', 'normal', 'high', 'urgent'].includes(
      p.manual_priority as string,
    ) ||
    typeof p.review_on !== 'string'
  )
    throw Error('Exact primitive addon review fields required');
  capacityDay(p.review_on, 'America/Chicago');
  return p as unknown as OperatingAddonInput;
}
type Attempt = { status: 'PENDING' | 'UNKNOWN' | 'PREPARED' };
// Finite session uncertainty hold only, not a business store or durable command journal.
const attempts = new WeakMap<object, Map<string, Attempt>>();
const retained = new WeakMap<
  object,
  { check: () => void; signature: string }
>();
/** Explicit source-bound composition of existing addon engines. No new parser,
 * accounting adapter, offline store, network discovery or telephony provider. */
export async function prepareOperatingAddon(
  sources: OperatingSources,
  input: OperatingAddonInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const capture = captureOperatingSources(sources, gate),
    p = pin(input),
    signature = JSON.stringify(p);
  const entry = capture.entries.find((e) => e.target.job_id === p.job_id);
  if (!entry) throw Error('Exact admitted addon job required');
  const current = () => {
    capture.check();
    if (JSON.stringify(pin(input)) !== signature)
      throw Error('Original addon input changed');
  };
  current();
  const key = JSON.stringify([capture.organization_id, p.job_id, p.kind]);
  let holds = attempts.get(sources.estimates);
  if (!holds) {
    holds = new Map();
    attempts.set(sources.estimates, holds);
  }
  if (holds.has(key))
    throw Error(
      'Existing or UNKNOWN addon review: exact read-only reconciliation only',
    );
  const attempt: Attempt = { status: 'PENDING' };
  holds.set(key, attempt);
  try {
    let evidence: unknown;
    if (p.kind === 'offline') {
      const model = await readFieldWorkOrders(
        sources.property,
        capture.organization_id,
        capture.actor_id,
      );
      current();
      const order = model.orders.find((o) => o.source.job_id === p.job_id),
        visit = order?.visits.find((v) => v.id === entry.scheduled_visit_id);
      if (!order || !visit)
        throw Error('Exact current field order/visit required');
      evidence = await reviewOperationsExperiments(
        sources.property,
        capture.organization_id,
        capture.actor_id,
        {
          day: visit.date,
          timezone: visit.timezone,
          booking: {
            order,
            worker_id: entry.worker_id,
            visit_id: visit.id,
            start: null,
            end: null,
          },
          other_windows: [],
          proposed_hours: [],
          route: [{ order, visit_id: visit.id }],
          capture: { order, visit_id: visit.id, note: p.note },
        },
        gate,
      );
    } else if (p.kind === 'voice') {
      const source = await readPrototypeSource(
        sources.estimates,
        entry.target,
        gate,
      );
      current();
      evidence = await prepareVoiceEstimate(
        source,
        { transcript: p.note },
        gate,
      );
    } else if (p.kind === 'storm_network') {
      evidence = await prepareStormNetworkReview(
        sources.estimates,
        entry.target,
        {
          incident_label: p.note.slice(0, 160),
          reported_on: null,
          manual_priority: p.manual_priority,
          conditions: ['CONDITION_NOT_YET_ASSESSED'],
          scope_line_ids: [],
          sharing_purpose: 'INTERNAL_COORDINATION_REVIEW',
        },
        gate,
      );
    } else if (p.kind === 'receptionist') {
      const review = await prepareGrowthOpportunity(
        sources.property,
        {
          organization_id: capture.organization_id,
          customer_id: entry.target.customer_id,
          location_id: entry.target.location_id,
        },
        capture.actor_id,
        {
          from: p.review_on,
          through: p.review_on,
          as_of: `${p.review_on}T12:00:00.000Z`,
          channel: 'email',
        },
        { purpose: 'receptionist', synthetic_transcript: p.note },
        gate,
      );
      current();
      // Historical contact-v1 cannot become atomic current or purpose-specific consent.
      evidence = {
        id: review.id,
        sha256: review.sha256,
        purpose: review.snapshot.purpose,
        intake_interpretation: review.snapshot.intake_interpretation,
        signals: review.snapshot.signals,
        recommendation: review.snapshot.recommendation,
        channel_currentness: 'UNKNOWN',
        purpose_consent: 'UNVERIFIED',
        suppression: 'UNVERIFIED',
        recipient: null,
        provider_request: null,
        authority: review.snapshot.authority,
      };
    } else if (p.kind === 'accounting') {
      const source = sources.estimates.readSyntheticPrototypeSources(
        entry.target,
      );
      evidence = await readFinanceWorkflow(
        sources.estimates,
        entry.target,
        {
          job_revision: source.job!.lock_revision,
          currency: source.bundle.version.calculation.currency,
          release: {
            preview: entry.release,
            offer_id: entry.offer_id,
            decision_id: entry.receipt_id,
            contract_id: null,
            signature_id: null,
            invoice_id: null,
            as_of: `${p.review_on}T12:00:00.000Z`,
          },
          accounting_aliases: null,
          procurement: null,
        },
        gate,
      );
    } else {
      const source = await readPrototypeSource(
        sources.estimates,
        entry.target,
        gate,
      );
      current();
      evidence = {
        source_sha256: source.sha256,
        scope: source.snapshot.estimate.lines
          .filter((l) => l.included)
          .map((l) => ({
            line_id: l.id,
            catalog_item_id: l.catalog_item_id,
            description: l.description,
            quantity_milli: l.quantity_milli,
            unit: l.unit,
          })),
        catalog_mapping: 'EXPLICIT_REVIEW_REQUIRED',
        supplier_bid: 'UNKNOWN',
        purchase_matching: 'UNKNOWN',
        recipient: null,
        provider_request: null,
        order: false,
        save: false,
      };
    }
    current();
    const snapshot = {
      mode: 'LOCAL_STAFF_ADDON_REVIEW_ONLY',
      kind: p.kind,
      target: { ...entry.target },
      intake_request_id: entry.intake_request_id,
      review_on: p.review_on,
      evidence,
      authority: {
        save: false,
        sync: false,
        dispatch: false,
        call: false,
        send: false,
        export: false,
        contract: false,
        financial: false,
        hosted: false,
      },
      genuine_authentication: 'UNVERIFIED',
      durable_custody: 'NOT_PROVIDED',
    } as const;
    const sha256 = await documentHash(snapshot);
    current();
    const result = freezePrototype({
      id: `operating-addon:${sha256}`,
      sha256,
      snapshot,
    });
    retained.set(result, { check: current, signature });
    attempt.status = 'PREPARED';
    return result;
  } catch (error) {
    attempt.status = 'UNKNOWN';
    throw error;
  }
}
export type OperatingAddonReview = Awaited<
  ReturnType<typeof prepareOperatingAddon>
>;
export async function reconcileOperatingAddon(view: OperatingAddonReview) {
  const record = retained.get(view);
  if (!record) return 'UNKNOWN' as const;
  try {
    record.check();
    if ((await documentHash(view.snapshot)) !== view.sha256)
      return 'UNKNOWN' as const;
    record.check();
    return 'CURRENT_LOCAL_REVIEW_ONLY' as const;
  } catch {
    return 'UNKNOWN' as const;
  }
}
