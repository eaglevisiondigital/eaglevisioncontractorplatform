import type { Phase3Repository } from '../phase3';
import {
  costCategories,
  type CostCategory,
} from '../../domain/jobs/financials';
import {
  detached,
  projectLocalJobMargin,
} from '../../domain/jobs/margin-analysis';
import { documentHash } from '../../domain/release/preview';
import {
  completionReviewGuard,
  projectJobCostCompletion,
  type CompletionReviewAdmission,
} from '../job-cost-completion';
import {
  readJobReview,
  inspectJobReview,
  type JobReviewSelection,
} from './job-review';
import {
  readPrototypeSource,
  assertPrototypeSourceCurrentNow,
  freezePrototype,
  prototypeFields,
  type PrototypeTarget,
} from '../program/prototype-source';

export interface FinanceDeskSelection {
  job_review: JobReviewSelection;
  remaining: Record<CostCategory, number>;
  excludes_unpaid_commitments: true;
  input_revision: number;
}
const denied = () =>
  Error(
    'Exact confirmed Finance desk source and additional remaining-cost proposal required',
  );
function own(value: unknown, keys: readonly string[]) {
  const result = prototypeFields(value, keys);
  if (Reflect.ownKeys(result).length !== keys.length) throw denied();
  return result;
}
function input(value: FinanceDeskSelection) {
  const p = own(value, [
    'job_review',
    'remaining',
    'excludes_unpaid_commitments',
    'input_revision',
  ]);
  const remaining = own(p.remaining, costCategories);
  if (
    p.excludes_unpaid_commitments !== true ||
    !Number.isSafeInteger(p.input_revision) ||
    Number(p.input_revision) < 1 ||
    Object.values(remaining).some(
      (v) =>
        !Number.isSafeInteger(v) ||
        Number(v) < 0 ||
        Number(v) > 9_000_000_000_000,
    )
  )
    throw denied();
  const review = own(p.job_review, [
    'finance',
    'time',
    'material',
    'input_revision',
  ]);
  const finance = own(review.finance, [
    'job_revision',
    'currency',
    'release',
    'accounting_aliases',
    'procurement',
  ]);
  const release =
    finance.release === null
      ? null
      : own(finance.release, [
          'preview',
          'offer_id',
          'decision_id',
          'contract_id',
          'signature_id',
          'invoice_id',
          'as_of',
        ]);
  // Existing JobReview validates the exact contract. This detached fingerprint rejects
  // executable nested values without serializing trusted repository/preview objects.
  const identity = JSON.stringify(
    detached({
      ...p,
      remaining,
      job_review: {
        ...review,
        finance: {
          ...finance,
          release: release ? { ...release, preview: undefined } : null,
          procurement: undefined,
        },
      },
    }),
  );
  return {
    identity,
    remaining: freezePrototype(
      remaining as unknown as Record<CostCategory, number>,
    ),
    revision: p.input_revision as number,
    jobReview: p.job_review as JobReviewSelection,
    preview: release?.preview,
    procurement: finance.procurement,
  };
}
const records = new WeakMap<
  object,
  {
    check: () => void;
    access: () => void;
    jobReview: Awaited<ReturnType<typeof readJobReview>>;
  }
>();

/** Actual saved source -> existing canonical unsaved remaining-cost scenario. No writer. */
export async function readFinanceDesk(
  repo: Phase3Repository,
  originalTarget: PrototypeTarget,
  originalInput: FinanceDeskSelection,
  gate: CompletionReviewAdmission = { enabled: false, confirmed: false },
) {
  completionReviewGuard(gate)();
  const selected = input(originalInput);
  const target = detached(originalTarget);
  const source = await readPrototypeSource(repo, target, gate);
  const access = () => {
    completionReviewGuard(gate)();
    const members = repo.operations
      .syntheticMemberships(target.organization_id)
      .filter((m) => m.user_id === target.actor_id);
    if (
      members.length !== 1 ||
      !members[0].active ||
      !['owner', 'admin'].includes(members[0].role)
    )
      throw denied();
    return `${members[0].role}:${members[0].staff_type}`;
  };
  const role = access();
  const checkInput = () => {
    if (access() !== role) throw denied();
    const current = input(originalInput);
    if (
      current.identity !== selected.identity ||
      current.jobReview !== selected.jobReview ||
      current.preview !== selected.preview ||
      current.procurement !== selected.procurement ||
      JSON.stringify(detached(originalTarget)) !== JSON.stringify(target)
    )
      throw denied();
    assertPrototypeSourceCurrentNow(source);
  };
  checkInput();
  const original = repo.readSyntheticPrototypeSources(target);
  if (!original.job || original.bundle.version.status !== 'issued')
    throw denied();
  const recorded = await readJobReview(
    repo,
    originalTarget,
    selected.jobReview,
    gate,
  );
  checkInput();
  const releaseFingerprint =
    selected.jobReview.finance.release === null
      ? null
      : JSON.stringify(
          selected.jobReview.finance.release.preview.read('staff'),
        );
  const check = () => {
    checkInput();
    const release = selected.jobReview.finance.release;
    if (
      release &&
      (JSON.stringify(release.preview.read('staff')) !== releaseFingerprint ||
        JSON.stringify(release.preview.version) !==
          JSON.stringify(original.bundle.version))
    )
      throw Error('Finance release source changed');
  };
  check();
  const cost = recorded.recorded.costReview.completion;
  const proposedJob = structuredClone(original.job);
  // Replacement of remaining forecast only: recorded costs and net commitments stay exact.
  // Never append this proposal to a saved forecast or declare costs physically complete.
  proposedJob.projection = {
    ...proposedJob.projection,
    remaining: { ...selected.remaining },
    costs_complete: false,
  };
  const proposedMargin = projectLocalJobMargin(
    {
      scope: { ...recorded.recorded.costReview.scope },
      job: proposedJob,
      issued: original.bundle.version,
      labor:
        cost.status === 'UNKNOWN'
          ? {
              status: 'unknown',
              currency: null,
              unpostedApproved: 0,
              unresolved: 0,
              entryIds: [],
              lockedPeriodIds: [],
            }
          : {
              status: 'known',
              currency: original.job.baseline.currency,
              unpostedApproved: cost.coverage!.unpostedApprovedTime,
              unresolved: cost.coverage!.unresolvedTime,
              entryIds: [...cost.laborSource.entryIds],
              lockedPeriodIds: [...cost.laborSource.lockedPeriodIds],
            },
    },
    { enabled: true },
  );
  const proposedCompletion = projectJobCostCompletion(
    proposedMargin,
    proposedJob,
  );
  const accounting = recorded.recorded.accountingHandoff;
  const aliasInput = selected.jobReview.finance.accounting_aliases;
  const aliases = aliasInput === null ? null : detached(aliasInput);
  const procurement = recorded.recorded.procurementHandoff;
  const compatibility = {
    mode: 'EXISTING_RECORD_COMPATIBILITY_REVIEW_ONLY' as const,
    accounting: {
      status:
        recorded.invoiceRequirements.reference.invoice_id === null
          ? 'UNKNOWN'
          : accounting.status,
      selected_local_aliases: aliases,
      source_customer_id: target.customer_id,
      source_property_id: target.location_id,
      source_invoice_id: recorded.invoiceRequirements.reference.invoice_id,
      issued_version_id: target.version_id,
      currency: recorded.recorded.currency,
      retained_mapping: accounting.review,
      reason:
        recorded.invoiceRequirements.reference.invoice_id === null
          ? 'An exact existing invoice and contract are absent. No ledger, export or import rows can be prepared.'
          : accounting.reason,
      quickbooks: {
        status: 'UNVERIFIED' as const,
        external_realm_id: null,
        external_customer_id: null,
        external_invoice_id: null,
        external_account_mapping: 'UNVERIFIED' as const,
        external_tax_mapping: 'UNVERIFIED' as const,
        external_schema: 'UNVERIFIED' as const,
        accountant_approval: 'UNVERIFIED' as const,
        meaning:
          'Local account aliases are review labels only, never external IDs, a QuickBooks import schema or permission to connect.',
      },
      direct_invoice_job_foreign_key: 'ABSENT' as const,
      provider_refund: 'UNKNOWN' as const,
      merchant_settlement: 'UNKNOWN' as const,
    },
    procurement: {
      status:
        procurement.status === 'NOT_REQUESTED'
          ? 'UNKNOWN_NO_EXACT_EXISTING_REVIEW'
          : procurement.status,
      exact_existing_review: procurement,
      category_to_catalog_mapping: 'UNKNOWN_NO_AUTOMATIC_MAPPING' as const,
      meaning:
        'Category remaining-cost proposals are not catalog quantities, supplier quotes, purchase orders or expenses. An actual exact line/catalog review is separately required.',
    },
  };
  const body = {
    mode: 'LOCAL_SYNTHETIC_FINANCE_DESK' as const,
    audience: 'CURRENT_SYNTHETIC_OWNER_ADMIN_ONLY' as const,
    target,
    source_sha256: source.sha256,
    input_revision: selected.revision,
    recorded,
    scenario: {
      label:
        'Unsaved Remaining-Cost Proposal — Not Recorded or Approved' as const,
      meaning:
        'These values replace the saved remaining forecast in a detached scenario. Existing actual costs and net unpaid commitments are retained exactly and added once by the canonical engine.',
      source_job_revision: original.job.lock_revision,
      original_remaining: { ...original.job.projection.remaining },
      proposed_remaining: { ...selected.remaining },
      excludes_unpaid_commitments: true as const,
      saved_source_changed: false,
      completion: proposedCompletion,
      margin: proposedMargin,
      completeness: 'UNSAVED_PARTIAL_OR_UNKNOWN_NOT_FINAL_PROFIT' as const,
    },
    invoice: recorded.invoiceRequirements,
    compatibility,
    authority: {
      save_forecast: false,
      post_time: false,
      post_expense: false,
      create_invoice: false,
      ledger: false,
      payment: false,
      payroll: false,
      purchase_order: false,
      import: false,
      connect_provider: false,
      send: false,
      hosted: false,
    },
    workforce_currentness: 'UNKNOWN' as const,
    custody: 'SESSION_ONLY_NO_REFRESH_OR_CRASH_DURABILITY' as const,
  };
  const sha256 = await documentHash(body);
  check();
  if ((await inspectJobReview(recorded)).status !== 'CURRENT_LOCAL_SOURCE')
    throw denied();
  check(); // Original live input, exact source and eligible role after the final await.
  const result = freezePrototype({ ...body, sha256 });
  records.set(result, {
    check,
    access: () => {
      if (access() !== role) throw denied();
    },
    jobReview: recorded,
  });
  return result;
}
export type FinanceDeskReview = Awaited<ReturnType<typeof readFinanceDesk>>;

/** Exact session evidence only. No replay, new source or replacement review. */
export async function inspectFinanceDesk(review: FinanceDeskReview) {
  const record = records.get(review);
  if (!record)
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  try {
    record.access();
    const { sha256, ...body } = review;
    if ((await documentHash(body)) !== sha256) throw denied();
    record.check();
    if (
      (await inspectJobReview(record.jobReview)).status !==
      'CURRENT_LOCAL_SOURCE'
    )
      throw denied();
    record.check();
    return freezePrototype({
      status: 'CURRENT_LOCAL_SOURCE' as const,
      replacement: null,
    });
  } catch (error) {
    try {
      record.access();
    } catch {
      return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
    }
    return freezePrototype({
      status:
        error instanceof Error &&
        ['Stale prototype source', 'Finance release source changed'].includes(
          error.message,
        )
          ? ('STALE' as const)
          : ('UNKNOWN' as const),
      replacement: null,
    });
  }
}
