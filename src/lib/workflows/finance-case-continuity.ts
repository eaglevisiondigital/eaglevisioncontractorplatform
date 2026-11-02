import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  financialCaseworkEnabled,
  readFinancialCasework,
  openFinancialCaseworkJob,
  assertFinancialCaseworkCurrent,
  compareFinancialCaseworkReview,
  type FinancialCaseworkReview,
  type FinancialCaseworkDetail,
} from './financial-casework';
import type { OperatingJobSection } from './operating-navigation';

// Existing C13 admission and C12 canonical verification remain authoritative.
export const financeCaseContinuityEnabled = financialCaseworkEnabled;
export const readFinanceCaseContinuity = readFinancialCasework;
export type FinanceCaseSourceKind =
  'requirement' | 'invoice' | 'event' | 'posting' | 'expense';
export interface FinanceCaseSourceIdentity {
  kind: FinanceCaseSourceKind;
  id: string;
}
const denied = () =>
  Error(
    'Exact current inspected financial case source required; UNKNOWN is read-only, never replay',
  );
interface Item {
  kind: FinanceCaseSourceKind;
  id: string;
  label: string;
  status: string;
  invoice_id: string | null;
  related_ids: string[];
  amount_minor: string | null;
  currency: string;
  meaning: string;
}
/** Index existing allowlisted sources, not a financial verifier or calculation.
 * Unlinked source rows expose identities only, never inferred job amounts. */
export function financialCaseSourceItems(detail: FinancialCaseworkDetail) {
  assertFinancialCaseworkCurrent(detail);
  const job = detail.job,
    items: Item[] = job.invoice.requirements.map((r) => ({
      kind: 'requirement',
      id: r.id,
      label: r.id,
      status: r.status,
      invoice_id: null,
      related_ids: [job.target.version_id],
      amount_minor: null,
      currency: job.currency,
      meaning: r.detail,
    }));
  for (const id of job.source.expense_ids)
    items.push({
      kind: 'expense',
      id,
      label: 'Recorded internal cost source',
      status: 'RECORDED_ID_ONLY',
      invoice_id: null,
      related_ids: [],
      amount_minor: null,
      currency: job.currency,
      meaning:
        'An internal expense reference is not bank payment, capture, refund or a job-invoice foreign key. Aggregate costing remains in the original canonical workflow.',
    });
  for (const invoice of job.financial.invoices) {
    const linked = invoice.linkage === 'LINKED';
    const related = [
      invoice.contract_id,
      invoice.offer_id,
      invoice.issued_version_id,
    ].filter((id): id is string => id !== null);
    items.push({
      kind: 'invoice',
      id: invoice.invoice_id,
      label: 'Canonical invoice source',
      status: invoice.verification,
      invoice_id: invoice.invoice_id,
      related_ids: related,
      amount_minor: invoice.summary?.balance_minor ?? null,
      currency: job.currency,
      meaning: `${invoice.linkage}. ${invoice.missing_evidence.join(' ')} The original invoice-readiness workflow remains ${job.invoice.overall}; no issuance or payment authority.`,
    });
    for (const event of invoice.events)
      items.push({
        kind: 'event',
        id: event.id,
        label: event.kind,
        status: invoice.verification,
        invoice_id: invoice.invoice_id,
        related_ids: [
          event.authorization_id,
          ...(event.adjusts_event_id ? [event.adjusts_event_id] : []),
          ...invoice.ledger
            .filter((p) => p.event_id === event.id)
            .map((p) => p.id),
        ],
        amount_minor:
          linked && invoice.verification === 'RECONCILED_SYNTHETIC_ONLY'
            ? event.amount_minor
            : null,
        currency: job.currency,
        meaning:
          'Existing canonical event and exact posting references only. Provider authentication and bank settlement remain UNKNOWN.',
      });
    for (const posting of invoice.ledger)
      items.push({
        kind: 'posting',
        id: posting.id,
        label: `${posting.debit_account} → ${posting.credit_account}`,
        status: invoice.verification,
        invoice_id: invoice.invoice_id,
        related_ids: posting.event_id ? [posting.event_id] : [],
        amount_minor:
          linked && invoice.verification === 'RECONCILED_SYNTHETIC_ONLY'
            ? posting.amount_minor
            : null,
        currency: job.currency,
        meaning:
          'An existing posting is read through the unchanged canonical verifier. This view cannot correct or append a ledger entry.',
      });
  }
  for (const event of job.financial.unlinked_events)
    items.push({
      kind: 'event',
      id: event.id,
      label: event.kind,
      status: 'UNKNOWN_UNLINKED',
      invoice_id: event.invoice_id,
      related_ids: [],
      amount_minor: null,
      currency: job.currency,
      meaning:
        'No exact invoice/contract/original-offer/issued-version/job proof admits this event as a job amount.',
    });
  for (const posting of job.financial.unlinked_ledger)
    items.push({
      kind: 'posting',
      id: posting.id,
      label: 'Unlinked canonical posting',
      status: 'UNKNOWN_UNLINKED',
      invoice_id: posting.invoice_id,
      related_ids: posting.event_id ? [posting.event_id] : [],
      amount_minor: null,
      currency: job.currency,
      meaning:
        'This exact posting is unlinked; no balance or job financial association is inferred.',
    });
  assertFinancialCaseworkCurrent(detail);
  return freezePrototype(items);
}
const selections = new WeakMap<
  object,
  { detail: FinancialCaseworkDetail; uncertain: boolean }
>();
function identity(input: FinanceCaseSourceIdentity) {
  const p = prototypeFields(input, ['kind', 'id']);
  if (
    Reflect.ownKeys(p).length !== 2 ||
    typeof p.kind !== 'string' ||
    !['requirement', 'invoice', 'event', 'posting', 'expense'].includes(
      p.kind,
    ) ||
    typeof p.id !== 'string' ||
    !p.id ||
    p.id.length > 200
  )
    throw denied();
  return p as unknown as FinanceCaseSourceIdentity;
}
export function inspectFinanceCaseSource(
  review: FinancialCaseworkReview,
  jobId: string,
  input: FinanceCaseSourceIdentity,
) {
  assertFinancialCaseworkCurrent(review);
  const selected = identity(input),
    detail = openFinancialCaseworkJob(review, jobId),
    matches = financialCaseSourceItems(detail).filter(
      (item) => item.kind === selected.kind && item.id === selected.id,
    );
  const result = freezePrototype({
    mode: 'EXACT_FINANCIAL_CASE_SOURCE' as const,
    status:
      matches.length === 1
        ? ('EXACT_RECORDED_SOURCE' as const)
        : ('UNKNOWN' as const),
    identity: { ...selected },
    target: { ...detail.job.target },
    source_job_revision: detail.job.source.job_revision,
    source_sha256: detail.source_sha256,
    item: matches.length === 1 ? matches[0] : null,
    invoice_readiness: detail.job.invoice.overall,
    canonical_coverage: detail.job.financial.coverage,
    authority: 'STAFF_READ_ONLY_NO_FINANCIAL_EXECUTION' as const,
  });
  assertFinancialCaseworkCurrent(detail);
  selections.set(result, { detail, uncertain: false });
  return result;
}
export type FinanceCaseSelection = ReturnType<typeof inspectFinanceCaseSource>;
export function assertFinanceCaseSelectionCurrent(
  selection: FinanceCaseSelection,
) {
  const record = selections.get(selection);
  if (!record || record.uncertain) throw denied();
  try {
    assertFinancialCaseworkCurrent(record.detail);
  } catch {
    record.uncertain = true;
    throw denied();
  }
}
/** Explicitly read current sources before comparing. A retained exact identity is
 * never replaced by a nearby event, posting, newer invoice or another job. */
export function compareFinanceCaseSelection(
  selection: FinanceCaseSelection,
  current: FinancialCaseworkReview,
) {
  const record = selections.get(selection);
  if (!record) throw denied();
  const sourceComparison = compareFinancialCaseworkReview(
    record.detail,
    current,
  );
  const detail = openFinancialCaseworkJob(current, selection.target.job_id!);
  const matches = financialCaseSourceItems(detail).filter(
    (item) =>
      item.kind === selection.identity.kind &&
      item.id === selection.identity.id,
  );
  const item = matches.length === 1 ? matches[0] : null;
  assertFinancialCaseworkCurrent(current);
  return freezePrototype({
    status: !item
      ? ('UNKNOWN_SELECTED_SOURCE_MISSING' as const)
      : JSON.stringify(item) !== JSON.stringify(selection.item) ||
          sourceComparison.status === 'SOURCE_CHANGED'
        ? ('SOURCE_CHANGED_REINSPECTION_REQUIRED' as const)
        : sourceComparison.status === 'CURRENT_REVIEWED_SOURCE'
          ? ('MATCHING_CURRENT_SOURCE' as const)
          : ('UNKNOWN' as const),
    selected_identity: { ...selection.identity },
    job_id: selection.target.job_id,
    reviewed_revision: selection.source_job_revision,
    current_revision: detail.job.source.job_revision,
    source_changes: sourceComparison.changes,
    reviewed_status: selection.item?.status ?? 'UNKNOWN',
    current_status: item?.status ?? 'UNKNOWN',
    replacement: null,
    meaning:
      'Comparison is read-only. Inspect the current exact source again before navigation. No original correction hold is reset and no missing item is substituted.',
  });
}
export function navigateFinanceCaseSelection(
  selection: FinanceCaseSelection,
  callback: (jobId: string, section?: OperatingJobSection) => void,
) {
  const record = selections.get(selection);
  if (!record || typeof callback !== 'function')
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  try {
    assertFinanceCaseSelectionCurrent(selection);
    if (selection.status !== 'EXACT_RECORDED_SOURCE') throw denied();
    const jobId = record.detail.job.target.job_id!;
    assertFinanceCaseSelectionCurrent(selection);
    callback(jobId, 'finance');
    return freezePrototype({
      status: 'LOCAL_FINANCE_REVIEW_REQUESTED' as const,
    });
  } catch {
    record.uncertain = true;
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  }
}
