import { documentHash } from '../../domain/release/preview';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import { readOperatingSelection } from './operating-selection';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readSalesDesk,
  prepareSalesDesk,
  reconcileSalesDesk,
  type SalesDeskConfirmation,
} from './sales-desk';
import {
  readCompletionReview,
  openCompletionSource,
} from './completion-review';
import type { JourneyAdmission } from './journey-runtime';
export interface ServiceDeskInput {
  query: string;
  status: string;
  page: number;
}
function pin(input: ServiceDeskInput) {
  const p = prototypeFields(input, ['query', 'status', 'page']);
  if (
    Object.keys(p).length !== 3 ||
    typeof p.query !== 'string' ||
    p.query.length > 100 ||
    typeof p.status !== 'string' ||
    p.status.length > 100 ||
    typeof p.page !== 'number' ||
    !Number.isSafeInteger(p.page) ||
    p.page < 0 ||
    p.page > 10000
  )
    throw Error('Bounded literal request search and page required');
  return { query: p.query, status: p.status, page: p.page };
}
interface Binding {
  sources: OperatingSources;
  capture: ReturnType<typeof captureOperatingSources>;
  input: ServiceDeskInput;
  signature: string;
  gate: JourneyAdmission;
}
const views = new WeakMap<object, Binding>();
function current(b: Binding) {
  if (JSON.stringify(pin(b.input)) !== b.signature)
    throw Error('Original request filters changed');
  b.capture.check();
}
/** Group actual existing intake IDs, not a fabricated request or duplicate business store. */
export async function readServiceDesk(
  sources: OperatingSources,
  input: ServiceDeskInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const selected = pin(input),
    capture = captureOperatingSources(sources, gate),
    b: Binding = {
      sources,
      capture,
      input,
      signature: JSON.stringify(selected),
      gate,
    };
  async function rows(query: string) {
    const first = await readOperatingSelection(
      sources,
      { query, page: 0, page_size: 10 },
      gate,
    );
    current(b);
    const found = [...first.rows];
    for (let page = 1; found.length < first.matching; page++) {
      if (page > 2) throw Error('Bounded handle coverage required');
      const next = await readOperatingSelection(
        sources,
        { query, page, page_size: 10 },
        gate,
      );
      current(b);
      if (next.matching !== first.matching) throw Error('Source count changed');
      found.push(...next.rows);
    }
    return found;
  }
  const all = await rows(''),
    matched = selected.query ? await rows(selected.query) : all;
  current(b);
  const matching = new Set(matched.map((r) => r.job_id));
  const groups = new Map<
    string,
    {
      request: {
        id: string;
        organization_id: string;
        customer_id: string;
        location_id: string;
        summary: string;
        status: string;
        category: string;
        preferred_appointment: string;
        created_at: string;
        updated_at: string;
      };
      customer_label: string;
      property_label: string;
      total_job_handles: number;
      jobs: typeof all;
    }
  >();
  for (const row of all) {
    const actual = sources.operations.syntheticIntakeRequest(
        row.organization_id,
        row.customer_id,
        row.location_id,
        row.lead.id,
      ),
      key = JSON.stringify([
        row.organization_id,
        row.customer_id,
        row.location_id,
        actual.id,
      ]);
    let group = groups.get(key);
    if (!group) {
      group = {
        request: {
          id: actual.id,
          organization_id: actual.organization_id,
          customer_id: row.customer_id,
          location_id: row.location_id,
          summary: actual.summary,
          status: actual.status,
          category: actual.service_category,
          preferred_appointment: actual.preferred_appointment,
          created_at: actual.created_at,
          updated_at: actual.updated_at,
        },
        customer_label: row.customer_label,
        property_label: row.property_label,
        total_job_handles: 0,
        jobs: [],
      };
      groups.set(key, group);
    }
    group.total_job_handles++;
    if (matching.has(row.job_id)) group.jobs.push(row);
  }
  const available = [...groups.values()],
    filtered = available.filter(
      (g) =>
        g.jobs.length > 0 &&
        (!selected.status || g.request.status === selected.status),
    );
  const body = {
    mode: 'LOCAL_SOURCE_SERVICE_REQUEST_DESK' as const,
    organization_id: capture.organization_id,
    query: selected.query,
    status: selected.status,
    page: selected.page,
    page_size: 2,
    available_requests: available.length,
    available_job_handles: all.length,
    matching_requests: filtered.length,
    matching_job_handles: filtered.reduce((n, g) => n + g.jobs.length, 0),
    status_options: [...new Set(available.map((g) => g.request.status))].sort(),
    requests: filtered.slice(selected.page * 2, (selected.page + 1) * 2),
    coverage: 'PREPARED_AUTHORIZED_SOURCE_HANDLES_ONLY' as const,
    history_completeness: 'UNKNOWN' as const,
    genuine_customer_approval: 'UNVERIFIED' as const,
    contract_execution: 'BLOCKED' as const,
  };
  const sha256 = await documentHash(body);
  current(b);
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  views.set(view, b);
  return view;
}
export type ServiceDeskView = Awaited<ReturnType<typeof readServiceDesk>>;
export function assertServiceDeskCurrentNow(view: ServiceDeskView) {
  const b = views.get(view);
  if (!b) throw Error('Exact retained service desk required');
  current(b);
}
interface DetailBinding {
  parent: Binding;
  entry: Binding['capture']['entries'][number];
  sales: Awaited<ReturnType<typeof readSalesDesk>>;
  completion: Awaited<ReturnType<typeof readCompletionReview>>;
}
const details = new WeakMap<object, DetailBinding>();
const attempts = new WeakMap<object, Set<string>>();
function attemptKey(b: DetailBinding) {
  const t = b.entry.target;
  return JSON.stringify([
    t.organization_id,
    t.customer_id,
    t.location_id,
    t.job_id,
    t.estimate_id,
    t.version_id,
  ]);
}
function detailCurrent(b: DetailBinding) {
  current(b.parent);
}
/** Staff readiness and customer-safe documentation are separately projected and labeled. */
export async function openServiceDeskJob(view: ServiceDeskView, jobId: string) {
  const b = views.get(view);
  if (!b) throw Error('Exact retained service desk required');
  current(b);
  if (typeof jobId !== 'string' || !jobId || jobId.length > 200)
    throw Error('Primitive exact job required');
  const matches = view.requests
    .flatMap((group) => group.jobs.map((job) => ({ group, job })))
    .filter((x) => x.job.job_id === jobId);
  if (matches.length !== 1)
    throw Error('Select one exact visible request/job source');
  const entry = b.capture.entries.find((e) => e.target.job_id === jobId);
  if (!entry) throw Error('Original exact handle unavailable');
  const sales = await readSalesDesk(
    entry,
    {
      intake_request_id: entry.intake_request_id,
      offer_id: entry.offer_id,
      receipt_id: entry.receipt_id,
      visit_id: entry.scheduled_visit_id,
      worker_id: entry.worker_id,
      review_note:
        'Explicit staff review of this existing request and exact issued scope.',
    },
    b.gate,
  );
  current(b);
  const completion = await readCompletionReview(
    entry,
    { report_id: entry.report_id, published_version: entry.published_version },
    b.gate,
  );
  current(b);
  const binding: DetailBinding = { parent: b, entry, sales, completion };
  const body = {
    mode: 'LOCAL_SERVICE_REQUEST_SOURCE_REVIEW' as const,
    staff: {
      request: matches[0].group.request,
      source: sales.source,
      receipt: sales.receipt,
      offer: sales.offer,
      appointment: sales.appointment,
      association:
        'EXPLICIT_STAFF_SELECTION_NO_RECORDED_ESTIMATE_LEAD_FK' as const,
      preparation: attempts.get(b.sources.operations)?.has(attemptKey(binding))
        ? ('READ_ONLY_PREVIOUS_ATTEMPT' as const)
        : ('EXPLICIT_REVIEW_REQUIRED' as const),
      genuine_customer_approval: 'UNVERIFIED' as const,
      contract_execution: 'BLOCKED' as const,
    },
    customer_safe: completion,
  };
  const sha256 = await documentHash(body);
  detailCurrent(binding);
  const detail = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  details.set(detail, binding);
  return detail;
}
export type ServiceDeskDetail = Awaited<ReturnType<typeof openServiceDeskJob>>;
export function assertServiceDeskDetailCurrentNow(detail: ServiceDeskDetail) {
  const b = details.get(detail);
  if (!b) throw Error('Exact retained request detail required');
  detailCurrent(b);
}
/** Existing guarded engine only; never auto-prepare, issue, sign, send, create jobs or collect. */
export async function prepareServiceDeskReview(
  detail: ServiceDeskDetail,
  input: SalesDeskConfirmation,
) {
  const b = details.get(detail);
  if (!b) throw Error('Exact retained source review required');
  detailCurrent(b);
  let claimed = attempts.get(b.parent.sources.operations);
  if (!claimed) {
    claimed = new Set();
    attempts.set(b.parent.sources.operations, claimed);
  }
  const key = attemptKey(b);
  if (claimed.has(key))
    throw Error('UNKNOWN/prior preparation is exact read only; no replay');
  // Validate own-data confirmation before consuming the session hold; the existing engine validates every section.
  const own = prototypeFields(input, [
      'confirmed',
      'association_confirmed',
      'checks',
    ]),
    checks = prototypeFields(own.checks, [
      'scope',
      'preference',
      'terms',
      'boundaries',
    ]);
  if (
    Object.keys(own).length !== 3 ||
    own.confirmed !== true ||
    own.association_confirmed !== true ||
    Object.keys(checks).length !== 4 ||
    Object.values(checks).some((v) => v !== true)
  )
    throw Error('Explicit complete source review required');
  const confirmation = JSON.stringify({
    confirmed: own.confirmed,
    association_confirmed: own.association_confirmed,
    checks,
  });
  claimed.add(key);
  const prepared = await prepareSalesDesk(b.sales, input);
  detailCurrent(b);
  const final = prototypeFields(input, [
    'confirmed',
    'association_confirmed',
    'checks',
  ]);
  if (
    JSON.stringify({
      confirmed: final.confirmed,
      association_confirmed: final.association_confirmed,
      checks: prototypeFields(final.checks, [
        'scope',
        'preference',
        'terms',
        'boundaries',
      ]),
    }) !== confirmation
  )
    throw Error('Staff confirmation changed');
  preparedBindings.set(prepared, { detail: b, held: false });
  return prepared;
}
const preparedBindings = new WeakMap<
  object,
  { detail: DetailBinding; held: boolean }
>();
export async function inspectServiceDeskPreparation(
  packet: Awaited<ReturnType<typeof prepareServiceDeskReview>>,
) {
  const b = preparedBindings.get(packet),
    unknown = {
      status: 'UNKNOWN' as const,
      replacement: null,
      replay: 'FORBIDDEN' as const,
    };
  if (!b || b.held) return unknown;
  try {
    detailCurrent(b.detail);
    const result = await reconcileSalesDesk(packet);
    detailCurrent(b.detail);
    if (result.status !== 'CURRENT_REVIEW_ONLY') {
      b.held = true;
      return unknown;
    }
    return result;
  } catch {
    b.held = true;
    return unknown;
  }
}
/** Exact read-only customer-safe source navigation, separate from staff preparation content. */
export async function openServiceDeskReport(detail: ServiceDeskDetail) {
  const b = details.get(detail);
  if (!b) throw Error('Exact retained request detail required');
  detailCurrent(b);
  const report = await openCompletionSource(b.completion);
  detailCurrent(b);
  return report;
}
