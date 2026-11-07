import { documentHash } from '../../domain/release/preview';
import {
  contractPreparationChecks,
  type ContractPreparationCheck,
} from '../sales-contract-preparation';
import {
  assertPrototypeSourceCurrentNow,
  freezePrototype,
  prototypeFields,
  readPrototypeSource,
  type PrototypeAdmission,
} from '../program/prototype-source';
import {
  readBookingScheduling,
  readBookingSchedulingSource,
  reconcileBookingScheduling,
} from './booking-scheduling';
import type { LocalJourney } from './journey-runtime';
import {
  prepareSalesWorkflowContract,
  readSalesWorkflow,
  verifySalesWorkflowReview,
  type SalesWorkflowTarget,
} from './sales-workflow';

export interface SalesDeskSelection {
  intake_request_id: string;
  offer_id: string;
  receipt_id: string;
  visit_id: string;
  worker_id: string;
  review_note: string;
}
export interface SalesDeskConfirmation {
  confirmed: boolean;
  association_confirmed: boolean;
  checks: Record<ContractPreparationCheck, boolean>;
}
function fields(value: unknown, names: readonly string[]) {
  const p = prototypeFields(value, names);
  if (Object.keys(p).length !== names.length)
    throw Error('Exact own named fields required');
  return p;
}
function text(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200)
    throw Error('Bounded primitive source or note required');
  return value;
}
function selection(value: SalesDeskSelection) {
  const p = fields(value, [
    'intake_request_id',
    'offer_id',
    'receipt_id',
    'visit_id',
    'worker_id',
    'review_note',
  ]);
  return Object.fromEntries(
    Object.entries(p).map(([k, v]) => [k, text(v)]),
  ) as unknown as SalesDeskSelection;
}
function admitted(gate: PrototypeAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (p.enabled !== true || p.confirmed !== true)
    throw Error('Sales desk is OFF without explicit local confirmation');
}
function confirmation(input: SalesDeskConfirmation) {
  const p = fields(input, ['confirmed', 'association_confirmed', 'checks']);
  const checks = fields(p.checks, Object.keys(contractPreparationChecks));
  if (
    p.confirmed !== true ||
    p.association_confirmed !== true ||
    Object.values(checks).some((v) => v !== true)
  )
    throw Error('Every exact staff review confirmation required');
  return JSON.stringify({
    confirmed: p.confirmed,
    association_confirmed: p.association_confirmed,
    checks,
  });
}
function refs(sources: LocalJourney) {
  const names = [
    'operations',
    'estimates',
    'property',
    'release',
    'target',
  ] as const;
  const result = {} as Pick<LocalJourney, (typeof names)[number]>;
  for (const name of names) {
    const d = Object.getOwnPropertyDescriptor(sources, name);
    if (!d || !('value' in d))
      throw Error('Actual shared source instances required');
    Object.assign(result, { [name]: d.value });
  }
  const t = fields(result.target, [
    'organization_id',
    'actor_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ]);
  for (const value of Object.values(t)) text(value);
  if (
    result.estimates.operations !== result.operations ||
    result.property.operations !== result.operations ||
    result.property.estimates !== result.estimates
  )
    throw Error('Same authoritative repositories required');
  return { ...result, target: { ...t } as unknown as LocalJourney['target'] };
}
function fingerprint(sources: LocalJourney, selected: SalesDeskSelection) {
  const r = refs(sources);
  return JSON.stringify({
    target: r.target,
    lead: r.operations.syntheticIntakeRequest(
      r.target.organization_id,
      r.target.customer_id,
      r.target.location_id,
      selected.intake_request_id,
    ),
    property: r.property.read(r.target.organization_id),
    release: r.release.read('staff'),
  });
}
interface ReadBinding {
  sources: LocalJourney;
  original: SalesDeskSelection;
  selected: SalesDeskSelection;
  signature: string;
  gate: PrototypeAdmission;
  references: ReturnType<typeof refs>;
  fingerprint: string;
  source: Awaited<ReturnType<typeof readPrototypeSource>>;
  salesTarget: SalesWorkflowTarget;
  sales: Awaited<ReturnType<typeof readSalesWorkflow>>;
  booking: Awaited<ReturnType<typeof readBookingScheduling>>;
}
const views = new WeakMap<object, ReadBinding>();
function checkNow(b: ReadBinding) {
  admitted(b.gate);
  const r = refs(b.sources);
  if (
    r.operations !== b.references.operations ||
    r.estimates !== b.references.estimates ||
    r.property !== b.references.property ||
    r.release !== b.references.release ||
    JSON.stringify(r.target) !== JSON.stringify(b.references.target) ||
    JSON.stringify(selection(b.original)) !== b.signature ||
    fingerprint(b.sources, b.selected) !== b.fingerprint
  )
    throw Error(
      'Exact source or original selection changed; UNKNOWN permits read only',
    );
  assertPrototypeSourceCurrentNow(b.source);
}
/** Read existing intake, recorded appointment, canonical issued scope and exact local preference. Never creates a booking or contract. */
export async function readSalesDesk(
  sources: LocalJourney,
  input: SalesDeskSelection,
  gate: PrototypeAdmission = {},
) {
  admitted(gate);
  const r = refs(sources),
    selected = selection(input),
    signature = JSON.stringify(selected),
    before = fingerprint(sources, selected);
  const salesTarget: SalesWorkflowTarget = {
    organization_id: r.target.organization_id,
    actor_id: r.target.actor_id,
    customer_id: r.target.customer_id,
    location_id: r.target.location_id,
    estimate_id: r.target.estimate_id,
    version_id: r.target.version_id,
    intake_request_id: selected.intake_request_id,
    offer_id: selected.offer_id,
    receipt_id: selected.receipt_id,
  };
  const source = await readPrototypeSource(r.estimates, r.target, gate);
  const sales = await readSalesWorkflow(
    r.estimates,
    r.release,
    salesTarget,
    gate,
  );
  if (sales.status !== 'current' || !sales.evidence || !sales.source_hash)
    throw Error(
      'Exact current issued scope and accepted LOCAL-TEST receipt required',
    );
  const bookingSource = await readBookingSchedulingSource(
    r.property,
    r.target,
    selected.visit_id,
    gate,
  );
  const booking = await readBookingScheduling(
    r.property,
    r.target,
    {
      source: bookingSource,
      source_visit_id: selected.visit_id,
      day: bookingSource.original_visit.date,
      timezone: bookingSource.original_visit.timezone,
      worker_id: selected.worker_id,
      review_note: selected.review_note,
      start: null,
      end: null,
      hours_start: null,
      hours_end: null,
    },
    gate,
  );
  const binding: ReadBinding = {
    sources,
    original: input,
    selected,
    signature,
    gate,
    references: r,
    fingerprint: before,
    source,
    salesTarget,
    sales,
    booking,
  };
  const body = {
    mode: 'LOCAL_SALES_DESK_REVIEW_ONLY' as const,
    target: { ...r.target },
    lead: sales.evidence.lead,
    source: sales.evidence.source,
    offer: sales.evidence.offer,
    receipt: sales.evidence.receipt,
    appointment: {
      visit_id: booking.original_visit.id,
      visit_revision: booking.original_visit.revision,
      plan_id: booking.original_visit.plan_id,
      plan_revision: booking.original_visit.plan_revision,
      date: booking.original_visit.date,
      timezone: booking.original_visit.timezone,
      worker_id: selected.worker_id,
      review_note: selected.review_note,
      availability: 'UNKNOWN' as const,
      booking_sha256: booking.integrity.sha256,
    },
    association:
      'EXPLICIT_STAFF_SELECTION_NOT_RECORDED_ESTIMATE_LEAD_FK' as const,
    genuine_customer_approval: 'UNVERIFIED' as const,
    authority: {
      book: false,
      assign: false,
      dispatch: false,
      contract: false,
      sign: false,
      deliver: false,
      financial: false,
    },
  };
  const sha256 = await documentHash(body);
  checkNow(binding);
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  views.set(view, binding);
  return view;
}
export type SalesDeskView = Awaited<ReturnType<typeof readSalesDesk>>;
type Preparation = Awaited<ReturnType<typeof prepareSalesWorkflowContract>>;
const claims = new WeakMap<object, Set<string>>();
interface PacketBinding {
  read: ReadBinding;
  preparation: Preparation;
  confirmation: SalesDeskConfirmation;
  confirmationSignature: string;
  held: boolean;
}
const packets = new WeakMap<object, PacketBinding>();
/** Claim before the first await. A second attempt, including after UNKNOWN, cannot prepare another packet. No business command is invoked. */
export async function prepareSalesDesk(
  view: SalesDeskView,
  input: SalesDeskConfirmation,
) {
  const b = views.get(view);
  if (!b) throw Error('Exact retained sales desk review required');
  checkNow(b);
  const confirmed = confirmation(input),
    key = JSON.stringify({
      organization_id: b.references.target.organization_id,
      customer_id: b.references.target.customer_id,
      location_id: b.references.target.location_id,
      estimate_id: b.references.target.estimate_id,
      version_id: b.references.target.version_id,
      job_id: b.references.target.job_id,
    });
  let claimed = claims.get(b.references.operations);
  if (!claimed) {
    claimed = new Set();
    claims.set(b.references.operations, claimed);
  }
  if (claimed.has(key))
    throw Error(
      'Sales desk preparation already attempted; exact read only, no replay',
    );
  claimed.add(key);
  const stable = () => {
    checkNow(b);
    if (confirmation(input) !== confirmed)
      throw Error('Staff confirmation changed');
    checkNow(b);
  };
  const preparation = await prepareSalesWorkflowContract(
    b.references.estimates,
    b.references.release,
    b.salesTarget,
    {
      enabled: true,
      confirmed: true,
      association_confirmed: true,
      reviewed_source_hash: b.sales.source_hash!,
      checks: { scope: true, preference: true, terms: true, boundaries: true },
    },
  );
  stable();
  if (
    (await reconcileBookingScheduling(b.booking)).status !==
    'CURRENT_REVIEW_ONLY'
  )
    throw Error('Recorded appointment review is UNKNOWN');
  stable();
  const body = {
    mode: 'LOCAL_BOOKING_TO_CONTRACT_PREPARATION' as const,
    created_at: preparation.preparation.prepared_at,
    reviewer_id: b.references.target.actor_id,
    review: view,
    preparation,
    limits: {
      genuine_customer_approval: 'UNVERIFIED' as const,
      contract_execution: 'BLOCKED' as const,
      booking: 'UNCHANGED' as const,
      dispatch: 'BLOCKED' as const,
      persistence: 'SAME_TAB_MEMORY_ONLY' as const,
    },
  };
  const sha256 = await documentHash(body);
  stable();
  const packet = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  packets.set(packet, {
    read: b,
    preparation,
    confirmation: input,
    confirmationSignature: confirmed,
    held: false,
  });
  return packet;
}
export type SalesDeskPacket = Awaited<ReturnType<typeof prepareSalesDesk>>;
/** Exact retained read only. Once UNKNOWN, later apparent source recovery never clears its hold. */
export async function reconcileSalesDesk(packet: SalesDeskPacket) {
  const unknown = {
    status: 'UNKNOWN' as const,
    replay: false,
    replacement: null,
  };
  const b = packets.get(packet);
  if (!b || b.held) return unknown;
  try {
    checkNow(b.read);
    if (confirmation(b.confirmation) !== b.confirmationSignature)
      throw Error('Review withdrawn');
    const { integrity, ...content } = packet;
    if ((await documentHash(content)) !== integrity.sha256)
      throw Error('Packet integrity mismatch');
    if (
      (await verifySalesWorkflowReview(
        b.read.references.estimates,
        b.read.references.release,
        b.read.salesTarget,
        b.preparation,
      )) !== 'current'
    )
      throw Error('Exact contract preparation not current');
    if (
      (await reconcileBookingScheduling(b.read.booking)).status !==
      'CURRENT_REVIEW_ONLY'
    )
      throw Error('Booking review not current');
    checkNow(b.read);
    if (confirmation(b.confirmation) !== b.confirmationSignature)
      throw Error('Review withdrawn');
    checkNow(b.read);
    return {
      status: 'CURRENT_REVIEW_ONLY' as const,
      replay: false,
      replacement: null,
    };
  } catch {
    b.held = true;
    return unknown;
  }
}
