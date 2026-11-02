import { documentHash } from '../../domain/release/preview';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import { readSalesWorkflow } from './sales-workflow';
import type { JourneyAdmission } from './journey-runtime';

export interface OperatingSelectionInput {
  query: string;
  page: number;
  page_size: number;
}
function pin(input: OperatingSelectionInput) {
  const p = prototypeFields(input, ['query', 'page', 'page_size']);
  if (
    Object.keys(p).length !== 3 ||
    typeof p.query !== 'string' ||
    p.query.length > 100 ||
    typeof p.page !== 'number' ||
    !Number.isSafeInteger(p.page) ||
    p.page < 0 ||
    p.page > 10000 ||
    typeof p.page_size !== 'number' ||
    ![2, 5, 10].includes(p.page_size)
  )
    throw Error('Literal query and bounded page required');
  return { query: p.query, page: p.page, page_size: p.page_size };
}
interface Binding {
  sources: OperatingSources;
  original: OperatingSelectionInput;
  signature: string;
  capture: ReturnType<typeof captureOperatingSources>;
  gate: JourneyAdmission;
  held: boolean;
}
const bindings = new WeakMap<object, Binding>();
function current(b: Binding) {
  if (b.held) throw Error('UNKNOWN is exact read only');
  if (JSON.stringify(pin(b.original)) !== b.signature)
    throw Error('Original selection changed');
  b.capture.check();
}
/** Literal search over admitted exact source handles, not a CRM clone or a complete company inventory. */
export async function readOperatingSelection(
  sources: OperatingSources,
  input: OperatingSelectionInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const selected = pin(input),
    capture = captureOperatingSources(sources, gate),
    signature = JSON.stringify(selected),
    b: Binding = {
      sources,
      original: input,
      signature,
      capture,
      gate,
      held: false,
    };
  const rows = [];
  for (const entry of capture.entries) {
    const t = entry.target,
      view = await readSalesWorkflow(
        sources.estimates,
        entry.release,
        {
          organization_id: t.organization_id,
          actor_id: t.actor_id,
          customer_id: t.customer_id,
          location_id: t.location_id,
          estimate_id: t.estimate_id,
          version_id: t.version_id,
          intake_request_id: entry.intake_request_id,
          offer_id: entry.offer_id,
          receipt_id: entry.receipt_id,
        },
        gate,
      );
    current(b);
    if (view.status !== 'current' || !view.evidence)
      throw Error(
        'Exact current issued scope and original preference unavailable',
      );
    const e = view.evidence,
      source = sources.estimates.readSyntheticPrototypeSources(t);
    if (!source.job || source.job.baseline.issued_version_id !== t.version_id)
      throw Error('Exact job baseline unavailable');
    rows.push({
      organization_id: t.organization_id,
      customer_id: t.customer_id,
      location_id: t.location_id,
      job_id: t.job_id!,
      estimate_id: t.estimate_id,
      issued_version_id: t.version_id,
      issued_version_number: e.source.version_number,
      customer_label: e.source.scope.customer.display_name,
      property_label: [
        e.source.scope.location?.address_line1,
        e.source.scope.location?.city,
      ]
        .filter(Boolean)
        .join(', '),
      job_label: e.source.scope.project.name,
      estimate_number: e.source.estimate_number,
      scope_summary: e.source.scope.project.description,
      lead: {
        id: e.lead.id,
        summary: e.lead.summary,
        status: e.lead.status,
        association: 'EXPLICIT_STAFF_SELECTION_NO_RECORDED_LEAD_FK' as const,
      },
      receipt: {
        id: e.receipt.id,
        offer_id: e.offer.id,
        decision: e.receipt.decision,
        authority: 'LOCAL_TEST_ONLY' as const,
      },
    });
  }
  rows.sort(
    (a, b) =>
      a.customer_label.localeCompare(b.customer_label) ||
      a.property_label.localeCompare(b.property_label) ||
      a.estimate_number.localeCompare(b.estimate_number) ||
      a.job_id.localeCompare(b.job_id),
  );
  const query = selected.query.trim().toLowerCase(),
    filtered = rows.filter((r) =>
      [
        r.customer_label,
        r.property_label,
        r.job_label,
        r.estimate_number,
        r.scope_summary,
        r.lead.summary,
        r.lead.id,
        r.customer_id,
        r.location_id,
        r.job_id,
        r.issued_version_id,
      ].some((v) => v.toLowerCase().includes(query)),
    );
  const body = {
    mode: 'LOCAL_OPERATING_SOURCE_SELECTION' as const,
    organization_id: capture.organization_id,
    query: selected.query,
    page: selected.page,
    page_size: selected.page_size,
    available: rows.length,
    matching: filtered.length,
    rows: filtered.slice(
      selected.page * selected.page_size,
      (selected.page + 1) * selected.page_size,
    ),
    coverage: 'EXPLICITLY_PREPARED_AUTHORIZED_SOURCE_HANDLES_ONLY' as const,
    crm_history_completeness: 'UNKNOWN' as const,
    authority: 'NAVIGATION_ONLY' as const,
  };
  const sha256 = await documentHash(body);
  current(b);
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  bindings.set(view, b);
  return view;
}
export type OperatingSelectionView = Awaited<
  ReturnType<typeof readOperatingSelection>
>;
export function assertOperatingSelectionCurrentNow(
  view: OperatingSelectionView,
) {
  const b = bindings.get(view);
  if (!b) throw Error('Exact original source selection required');
  current(b);
}
/** Re-read the exact visible source; no off-page selection, latest fallback or business command. */
export async function revalidateOperatingSelection(
  sources: OperatingSources,
  view: OperatingSelectionView,
  jobId: string,
) {
  const b = bindings.get(view);
  if (!b || b.sources !== sources)
    throw Error('Original operating selection required');
  try {
    current(b);
    if (typeof jobId !== 'string' || !jobId || jobId.length > 200)
      throw Error('Primitive job identity required');
    const rows = view.rows.filter((r) => r.job_id === jobId);
    if (rows.length !== 1) throw Error('Select an exact visible-page source');
    const refreshed = await readOperatingSelection(sources, b.original, b.gate);
    current(b);
    if (refreshed.integrity.sha256 !== view.integrity.sha256)
      throw Error('Source selection changed');
    const row = rows[0];
    return freezePrototype({
      job_id: row.job_id,
      customer_id: row.customer_id,
      location_id: row.location_id,
      issued_version_id: row.issued_version_id,
      source_sha256: view.integrity.sha256,
      authority: 'NAVIGATION_ONLY' as const,
    });
  } catch (error) {
    b.held = true;
    throw error;
  }
}
