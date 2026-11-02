import { documentHash } from '../domain/release/preview';
import type { ReportBoundary } from '../domain/property/report-page';
import { PropertyRepository } from './property';
import {
  readGrowthReminderReview,
  type ReminderWindow,
} from './growth-reminders';
export interface GrowthOpportunityInput {
  purpose: 'referral' | 'reputation' | 'lead_recovery' | 'receptionist';
  synthetic_transcript: string;
}
export interface OpportunityAdmission {
  enabled?: boolean;
  confirmed?: boolean;
}
function own(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw Error('Plain review fields required');
  const ds = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).some(
      (k) =>
        typeof k !== 'string' ||
        !keys.includes(k) ||
        !Object.hasOwn(ds[k], 'value'),
    )
  )
    throw Error('Own primitive review fields required');
  return Object.fromEntries(
    Object.entries(ds).map(([k, d]) => [k, d.value]),
  ) as Record<string, unknown>;
}
function admit(gate: OpportunityAdmission) {
  const p = own(gate, ['enabled', 'confirmed']);
  if (p.enabled !== true || p.confirmed !== true)
    throw Error('Explicit local opportunity confirmation required');
}
function text(v: unknown, max: number) {
  if (typeof v !== 'string' || !v.trim() || v.length > max)
    throw Error('Bounded review text required');
  return v;
}
function freeze<T>(v: T): Readonly<T> {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function sourceCheck(
  repo: PropertyRepository,
  b: ReportBoundary,
  actor: string,
) {
  if (!(repo instanceof PropertyRepository) || repo.operations.sample !== true)
    throw Error('Synthetic opportunity review only');
  const members = repo.operations
    .syntheticMemberships(b.organization_id)
    .filter((m) => m.user_id === actor);
  if (
    members.length !== 1 ||
    !members[0].active ||
    !['owner', 'admin'].includes(members[0].role)
  )
    throw Error('Current owner/admin opportunity reviewer required');
  repo.operations.syntheticProperty(
    b.organization_id,
    b.customer_id,
    b.location_id,
  );
  // Existing maintenance reader enforces current eligible staff without granting work authority.
  repo.maintenance(b.organization_id, actor);
  return JSON.stringify(repo.read(b.organization_id));
}
function request(value: GrowthOpportunityInput) {
  const p = own(value, ['purpose', 'synthetic_transcript']);
  if (
    !['referral', 'reputation', 'lead_recovery', 'receptionist'].includes(
      p.purpose as string,
    )
  )
    throw Error('Explicit supported review purpose required');
  const transcript = text(p.synthetic_transcript, 2000);
  // Literal observations only. Inbound words are never instructions or permission.
  const signals = Array.from(
    transcript.matchAll(
      /\b(inspection|estimate|maintenance|cancel|stop|urgent)\b/gi,
    ),
    (m) => ({
      kind: m[0].toLowerCase(),
      start: m.index,
      end: m.index + m[0].length,
    }),
  );
  return {
    purpose: p.purpose as GrowthOpportunityInput['purpose'],
    signals,
    transcript_length: transcript.length,
  };
}
const bindings = new WeakMap<
  object,
  {
    repo: PropertyRepository;
    boundary: ReportBoundary;
    actor: string;
    window: ReminderWindow;
    gate: OpportunityAdmission;
    fingerprint: string;
    property: string;
  }
>();
export async function prepareGrowthOpportunity(
  repo: PropertyRepository,
  boundary: ReportBoundary,
  actor: string,
  window: ReminderWindow,
  value: GrowthOpportunityInput,
  gate: OpportunityAdmission = {},
) {
  admit(gate);
  const b = own(boundary, ['organization_id', 'customer_id', 'location_id']),
    w = own(window, ['from', 'through', 'as_of', 'channel']);
  const target = {
    organization_id: text(b.organization_id, 100),
    customer_id: text(b.customer_id, 100),
    location_id: text(b.location_id, 100),
  };
  const query = {
    from: text(w.from, 10),
    through: text(w.through, 10),
    as_of: text(w.as_of, 100),
    channel: w.channel as ReminderWindow['channel'],
  };
  const who = text(actor, 100),
    proposed = request(value),
    property = sourceCheck(repo, target, who);
  const review = await readGrowthReminderReview(repo, target, who, query, {
    enabled: true,
  });
  const snapshot = {
    mode: 'SYNTHETIC_STAFF_REVIEW_ONLY' as const,
    boundary: target,
    reviewer_id: who,
    ...proposed,
    source_window: review.window,
    available_maintenance_sources: review.candidates.map((c) => ({
      key: c.key,
      kind: c.kind,
      due_on: c.due_on,
      source: { ...c.source },
    })),
    captured_channel: review.consent.observed_channel_state,
    channel_currentness: 'UNKNOWN' as const,
    consent_capture: 'CAPTURED_NOT_ATOMIC' as const,
    consent_reference: review.consent.reference,
    intake_interpretation: proposed.signals.length
      ? 'LITERAL_SIGNALS_ONLY'
      : 'UNKNOWN',
    cancellation_or_opt_out_signal: proposed.signals.some(
      (x) => x.kind === 'stop' || x.kind === 'cancel',
    ),
    consent_custody: 'UNVERIFIED',
    purpose_consent: 'UNVERIFIED',
    suppression: 'UNVERIFIED',
    enrollment: 'UNVERIFIED',
    recommendation: proposed.signals.some(
      (x) => x.kind === 'stop' || x.kind === 'cancel',
    )
      ? 'STAFF_REVIEW_OPT_OUT_NO_SEND'
      : 'STAFF_REVIEW_ONLY',
    history_completeness: 'UNKNOWN',
    recipient: null,
    provider_request: null,
    authority: {
      send: false,
      call: false,
      book: false,
      enroll: false,
      create_lead: false,
      financial: false,
      hosted: false,
    },
  };
  const fingerprint = JSON.stringify(review),
    sha256 = await documentHash(snapshot);
  const final = await readGrowthReminderReview(repo, target, who, query, {
    enabled: true,
  });
  admit(gate);
  if (
    sourceCheck(repo, target, who) !== property ||
    JSON.stringify(final) !== fingerprint
  )
    throw Error('Opportunity source changed; no replacement');
  const result = freeze({ id: `growth-review:${sha256}`, sha256, snapshot });
  bindings.set(result, {
    repo,
    boundary: target,
    actor: who,
    window: query,
    gate,
    fingerprint,
    property,
  });
  return result;
}
export type GrowthOpportunity = Awaited<
  ReturnType<typeof prepareGrowthOpportunity>
>;
export async function verifyGrowthOpportunity(
  value: GrowthOpportunity,
): Promise<'CAPTURED_NOT_ATOMIC' | 'STALE' | 'UNKNOWN'> {
  const b = bindings.get(value);
  if (!b) return 'UNKNOWN';
  try {
    admit(b.gate);
    if ((await documentHash(value.snapshot)) !== value.sha256) return 'UNKNOWN';
    const current = await readGrowthReminderReview(
      b.repo,
      b.boundary,
      b.actor,
      b.window,
      { enabled: true },
    );
    admit(b.gate);
    return sourceCheck(b.repo, b.boundary, b.actor) === b.property &&
      JSON.stringify(current) === b.fingerprint
      ? 'CAPTURED_NOT_ATOMIC'
      : 'STALE';
  } catch {
    return 'UNKNOWN';
  }
}
