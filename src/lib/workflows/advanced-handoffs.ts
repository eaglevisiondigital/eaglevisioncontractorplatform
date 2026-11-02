import { documentHash } from '../../domain/release/preview';
import { capacityDay } from '../../domain/field/crew-capacity';
import {
  assertPrototypeSourceCurrentNow,
  freezePrototype,
  prototypeFields,
  readPrototypeSource,
} from '../program/prototype-source';
import {
  prepareTradeEdition,
  inspectTradeEdition,
  tradeEditions,
  type TradeEditionReview,
  type TradeEdition,
} from '../program/trade-editions';
import {
  prepareOperatingAddon,
  reconcileOperatingAddon,
  operatingAddonKinds,
  type OperatingAddonReview,
  type OperatingAddonInput,
} from './operating-addons';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
export const advancedHandoffKinds = [...operatingAddonKinds, 'trade'] as const;
export interface AdvancedHandoffInput {
  job_id: string;
  kind: (typeof advancedHandoffKinds)[number];
  note: string;
  review_on: string;
  manual_priority: OperatingAddonInput['manual_priority'];
  edition: TradeEdition;
}
function pin(input: AdvancedHandoffInput) {
  const p = prototypeFields(input, [
    'job_id',
    'kind',
    'note',
    'review_on',
    'manual_priority',
    'edition',
  ]);
  if (
    Object.keys(p).length !== 6 ||
    typeof p.job_id !== 'string' ||
    !p.job_id ||
    p.job_id.length > 200 ||
    !advancedHandoffKinds.includes(p.kind as AdvancedHandoffInput['kind']) ||
    typeof p.note !== 'string' ||
    !p.note.trim() ||
    p.note.length > 1000 ||
    typeof p.review_on !== 'string' ||
    !['low', 'normal', 'high', 'urgent'].includes(
      p.manual_priority as string,
    ) ||
    !tradeEditions.includes(p.edition as TradeEdition)
  )
    throw Error('Explicit bounded primitive handoff context required');
  capacityDay(p.review_on, 'America/Chicago');
  return p as unknown as AdvancedHandoffInput;
}
interface Binding {
  sources: OperatingSources;
  capture: ReturnType<typeof captureOperatingSources>;
  entry: ReturnType<typeof captureOperatingSources>['entries'][number];
  input: AdvancedHandoffInput;
  pinned: AdvancedHandoffInput;
  signature: string;
  gate: JourneyAdmission;
  source: Awaited<ReturnType<typeof readPrototypeSource>>;
}
const requirements = new WeakMap<object, Binding>();
type Hold = { status: 'PENDING' | 'UNKNOWN' | 'PREPARED' };
const holds = new WeakMap<object, Map<string, Hold>>();
const key = (b: Binding) =>
  JSON.stringify([b.capture.organization_id, b.pinned.job_id, b.pinned.kind]);
function current(b: Binding) {
  b.capture.check();
  if (JSON.stringify(pin(b.input)) !== b.signature)
    throw Error('Original handoff input changed');
  assertPrototypeSourceCurrentNow(b.source);
}
const gaps = {
  offline: [
    'Offline capture is a session-only proposal, not durable storage.',
    'Authenticated synchronization and atomic crew assignment remain unavailable.',
  ],
  voice: [
    'Only the literal typed transcript is reviewed; no microphone or model runs.',
    'No price, quantity conversion or catalog identity is inferred; manual editor review remains required.',
  ],
  receptionist: [
    'Current purpose consent, suppression and sender authority remain unverified.',
    'No recipient is resolved and no call or message provider executes.',
  ],
  storm_network: [
    'Incident reported-on date is UNKNOWN; review date is not incident evidence.',
    'Conditions, contractor vetting, safety and legal acceptance remain unverified.',
  ],
  accounting: [
    'No operational accounting mapping/import/export is enabled.',
    'Missing original invoice, contract, signature or complete costs remain UNKNOWN.',
  ],
  procurement: [
    'Supplier bids and purchase matching remain UNKNOWN; no order is created.',
    'Manual selection cannot invent a recorded scope-to-catalog relationship.',
  ],
  trade: [
    'Edition is a human-selected review context; company industry/branding remain unchanged.',
    'Licensing, code compliance and physical completion remain unverified.',
  ],
} as const;
/** Step one reads actual sources and missing requirements without claiming any preparation. */
export async function readAdvancedHandoffRequirements(
  sources: OperatingSources,
  input: AdvancedHandoffInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const pinned = pin(input),
    capture = captureOperatingSources(sources, gate),
    entry = capture.entries.find((e) => e.target.job_id === pinned.job_id);
  if (!entry) throw Error('Exact admitted job required');
  const source = await readPrototypeSource(
      sources.estimates,
      entry.target,
      gate,
    ),
    b: Binding = {
      sources,
      capture,
      entry,
      input,
      pinned,
      signature: JSON.stringify(pinned),
      gate,
      source,
    };
  current(b);
  const lines = source.snapshot.estimate.lines
      .filter((l) => l.included)
      .map((l) => ({
        line_id: l.id,
        description: l.description,
        quantity_milli: l.quantity_milli,
        unit: l.unit,
        catalog_item_id: l.catalog_item_id,
      })),
    linked = lines.filter((l) => l.catalog_item_id !== null),
    catalogIds = new Set(source.snapshot.catalog.map((c) => c.id)),
    valid = linked.filter((l) => catalogIds.has(l.catalog_item_id!));
  const linkState = !linked.length
    ? ('MISSING_RECORDED_CATALOG_ASSOCIATION' as const)
    : valid.length === lines.length
      ? ('RECORDED_CURRENT_SCOPE_LINKS' as const)
      : ('UNKNOWN_PARTIAL_OR_INVALID_LINKS' as const);
  const invoiceRows = entry.release.read('staff').release_invoices.length;
  const body = {
    mode: 'LOCAL_ADVANCED_HANDOFF_REQUIREMENTS' as const,
    kind: pinned.kind,
    company: {
      id: sources.company.id,
      name: sources.company.name,
      industry: sources.company.industry,
    },
    source: {
      organization_id: entry.target.organization_id,
      customer_id: entry.target.customer_id,
      location_id: entry.target.location_id,
      job_id: entry.target.job_id!,
      estimate_id: entry.target.estimate_id,
      issued_version_id: entry.target.version_id,
      issued_version_number: source.snapshot.estimate.version_number,
      saved_lock_revision: source.snapshot.estimate.lock_revision,
      source_sha256: source.sha256,
      intake_request_id: entry.intake_request_id,
      receipt_id: entry.receipt_id,
      report_id: entry.report_id,
      published_version: entry.published_version,
    },
    review_context: { ...pinned },
    scope: lines,
    catalog_links: {
      state: linkState,
      included_lines: lines.length,
      recorded_links: linked.length,
      current_valid_links: valid.length,
      manual_association: 'NOT_CREATED' as const,
    },
    local_release_invoice_rows: invoiceRows,
    invoice_job_association: 'NOT_INFERRED' as const,
    gaps: [
      ...gaps[pinned.kind],
      ...(pinned.kind === 'procurement' ? [linkState] : []),
    ],
    prior_attempt: holds.get(sources.estimates)?.has(key(b))
      ? ('EXACT_READ_ONLY_PREVIOUS_ATTEMPT' as const)
      : ('NO_ATTEMPT_OBSERVED_IN_THIS_ADAPTER' as const),
    incident_reported_on: null,
    consent_at_send: 'UNKNOWN' as const,
    operational_ready: false as const,
    authority: {
      save: false,
      sync: false,
      dispatch: false,
      call: false,
      send: false,
      export: false,
      order: false,
      contract: false,
      payment: false,
      hosted: false,
    },
  };
  const sha256 = await documentHash(body);
  current(b);
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  requirements.set(view, b);
  return view;
}
export type AdvancedRequirements = Awaited<
  ReturnType<typeof readAdvancedHandoffRequirements>
>;
export function assertAdvancedRequirementsCurrentNow(
  view: AdvancedRequirements,
) {
  const b = requirements.get(view);
  if (!b) throw Error('Exact original requirements required');
  current(b);
}
function field(value: unknown, name: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const d = Object.getOwnPropertyDescriptor(value, name);
  if (!d || !('value' in d)) throw Error('Own canonical evidence required');
  return d.value;
}
function path(value: unknown, ...names: string[]): unknown {
  return names.reduce((value, name) => field(value, name), value);
}
function primitive(value: unknown): string | number | boolean | null {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isSafeInteger(value))
  )
    return value;
  return 'UNKNOWN';
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 200)
    throw Error('Bounded canonical evidence required');
  return Array.from({ length: value.length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !('value' in d)) throw Error('Own canonical list required');
    return d.value;
  });
}
/** A named-field evidence projection, never an EstimateVersion/EstimateInput serializer. */
function projection(
  kind: AdvancedHandoffInput['kind'],
  result: OperatingAddonReview | TradeEditionReview,
) {
  const facts: { label: string; value: string | number | boolean | null }[] =
      [],
    clauses: {
      literal: string | number | boolean | null;
      warning: string | number | boolean | null;
      suggestion: string | number | boolean | null;
    }[] = [],
    checklist: {
      section: string | number | boolean | null;
      prompt: string | number | boolean | null;
      status: string | number | boolean | null;
    }[] = [];
  const add = (label: string, value: unknown) =>
    facts.push({ label, value: primitive(value) });
  if (kind === 'trade') {
    const body = field(result, 'snapshot');
    add('Selected review edition', field(body, 'edition'));
    add('Licensing', field(body, 'licensing'));
    add('Code compliance', field(body, 'code_compliance'));
    for (const row of list(field(body, 'checklist')))
      checklist.push({
        section: primitive(field(row, 'section')),
        prompt: primitive(field(row, 'prompt')),
        status: primitive(field(row, 'status')),
      });
  } else {
    const evidence = path(result, 'snapshot', 'evidence');
    if (kind === 'offline') {
      add('Recorded timing', path(evidence, 'booking', 'timing'));
      add(
        'Actual availability',
        path(evidence, 'booking', 'actual_availability'),
      );
      for (const name of [
        'status',
        'storage',
        'crash_durability',
        'synchronization',
        'replay',
      ])
        add(name, path(evidence, 'offline_capture', name));
    }
    if (kind === 'voice') {
      const body = field(evidence, 'snapshot');
      add('Recognition', field(body, 'recognition'));
      add('Audio', field(body, 'audio'));
      add('Total', field(body, 'total'));
      for (const clause of list(field(body, 'clauses')))
        clauses.push({
          literal: primitive(path(clause, 'span', 'literal')),
          warning: primitive(field(clause, 'warning')),
          suggestion: primitive(path(clause, 'suggestion', 'description')),
        });
    }
    if (kind === 'storm_network') {
      add('Incident reported on', path(evidence, 'triage', 'reported_on'));
      add('Human priority', path(evidence, 'triage', 'manual_priority'));
      add('Physical condition', path(evidence, 'triage', 'physical_condition'));
      add(
        'Partner discovery',
        path(evidence, 'sharing_preview', 'partner_discovery'),
      );
      add('Sharing delivery', path(evidence, 'sharing_preview', 'delivery'));
    }
    if (kind === 'receptionist') {
      for (const name of [
        'purpose',
        'channel_currentness',
        'purpose_consent',
        'suppression',
        'recipient',
        'provider_request',
      ])
        add(name, field(evidence, name));
      add('Recommendation', field(evidence, 'recommendation'));
    }
    if (kind === 'accounting') {
      add(
        'Invoice preparation',
        path(evidence, 'invoicePreparation', 'status'),
      );
      add(
        'Overall invoice readiness',
        path(evidence, 'invoicePreparation', 'overall'),
      );
      add(
        'Existing invoice',
        path(evidence, 'invoicePreparation', 'reference', 'invoice_id'),
      );
      add('Accounting handoff', path(evidence, 'accountingHandoff', 'status'));
      for (const item of list(
        path(evidence, 'invoicePreparation', 'requirements'),
      ))
        add(String(primitive(field(item, 'id'))), field(item, 'status'));
    }
    if (kind === 'procurement') {
      for (const name of [
        'catalog_mapping',
        'supplier_bid',
        'purchase_matching',
        'recipient',
        'provider_request',
        'order',
        'save',
      ])
        add(name, field(evidence, name));
    }
  }
  return { facts, clauses, checklist };
}
export interface AdvancedHandoffConfirmation {
  confirmed: boolean;
  reviewed_requirements_sha256: string;
}
function confirm(input: AdvancedHandoffConfirmation) {
  const p = prototypeFields(input, [
    'confirmed',
    'reviewed_requirements_sha256',
  ]);
  if (
    Object.keys(p).length !== 2 ||
    p.confirmed !== true ||
    typeof p.reviewed_requirements_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(p.reviewed_requirements_sha256)
  )
    throw Error('Explicit current requirements confirmation required');
  return {
    confirmed: true,
    reviewed_requirements_sha256: p.reviewed_requirements_sha256,
  };
}
interface Retained {
  binding: Binding;
  canonical: OperatingAddonReview | TradeEditionReview;
  confirmation: AdvancedHandoffConfirmation;
  signature: string;
  held: boolean;
}
const handoffs = new WeakMap<object, Retained>();
/** Step two holds the canonical repository/job/kind before the first await; no execution authority. */
export async function prepareAdvancedHandoff(
  view: AdvancedRequirements,
  input: AdvancedHandoffConfirmation,
) {
  const b = requirements.get(view);
  if (!b) throw Error('Exact original requirements required');
  current(b);
  const confirmed = confirm(input),
    signature = JSON.stringify(confirmed);
  if (confirmed.reviewed_requirements_sha256 !== view.integrity.sha256)
    throw Error('Exact reviewed requirements hash required');
  let claimed = holds.get(b.sources.estimates);
  if (!claimed) {
    claimed = new Map();
    holds.set(b.sources.estimates, claimed);
  }
  const exact = key(b);
  if (claimed.has(exact))
    throw Error('Prior/UNKNOWN handoff permits exact read only; no replay');
  const hold: Hold = { status: 'PENDING' };
  claimed.set(exact, hold);
  const stable = () => {
    current(b);
    if (JSON.stringify(confirm(input)) !== signature)
      throw Error('Review confirmation changed');
  };
  try {
    const p = b.pinned;
    const canonical =
      p.kind === 'trade'
        ? await prepareTradeEdition(
            b.source,
            { edition: p.edition, catalog_item_ids: [] },
            b.gate,
          )
        : await prepareOperatingAddon(
            b.sources,
            {
              job_id: p.job_id,
              kind: p.kind,
              note: p.note,
              review_on: p.review_on,
              manual_priority: p.manual_priority,
            },
            b.gate,
          );
    stable();
    const body = {
      mode: 'IMMUTABLE_ADVANCED_REVIEW_HANDOFF' as const,
      kind: p.kind,
      requirements: view,
      canonical_reference: {
        sha256: canonical.sha256,
        engine:
          p.kind === 'trade'
            ? ('EXISTING_TRADE_EDITION_ENGINE' as const)
            : ('EXISTING_OPERATING_ADDON_ENGINE' as const),
      },
      evidence: projection(p.kind, canonical),
      operational_ready: false as const,
      delivery: 'NOT_SENT' as const,
      persistence: 'SAME_TAB_REVIEW_ONLY' as const,
    };
    const sha256 = await documentHash(body);
    stable();
    const handoff = freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
    handoffs.set(handoff, {
      binding: b,
      canonical,
      confirmation: input,
      signature,
      held: false,
    });
    hold.status = 'PREPARED';
    return handoff;
  } catch (error) {
    hold.status = 'UNKNOWN';
    throw error;
  }
}
export type AdvancedHandoff = Awaited<
  ReturnType<typeof prepareAdvancedHandoff>
>;
export function assertAdvancedHandoffCurrentNow(view: AdvancedHandoff) {
  const b = handoffs.get(view);
  if (!b || b.held) throw Error('Exact original handoff required');
  current(b.binding);
  if (JSON.stringify(confirm(b.confirmation)) !== b.signature)
    throw Error('Original confirmation changed');
}
/** Reconcile the retained original engine object only. UNKNOWN never clears or creates a replacement. */
export async function reconcileAdvancedHandoff(view: AdvancedHandoff) {
  const b = handoffs.get(view),
    unknown = { status: 'UNKNOWN' as const, replacement: null, replay: false };
  if (!b || b.held) return unknown;
  try {
    assertAdvancedHandoffCurrentNow(view);
    const { integrity, ...body } = view;
    if ((await documentHash(body)) !== integrity.sha256)
      throw Error('Handoff integrity mismatch');
    const currentState =
      b.binding.pinned.kind === 'trade'
        ? (await inspectTradeEdition(b.canonical as TradeEditionReview))
            .status === 'CURRENT'
        : (await reconcileOperatingAddon(
            b.canonical as OperatingAddonReview,
          )) === 'CURRENT_LOCAL_REVIEW_ONLY';
    assertAdvancedHandoffCurrentNow(view);
    if (!currentState) throw Error('Canonical evidence unavailable');
    return {
      status: 'CURRENT_REVIEW_ONLY' as const,
      replacement: null,
      replay: false,
    };
  } catch {
    b.held = true;
    return unknown;
  }
}
