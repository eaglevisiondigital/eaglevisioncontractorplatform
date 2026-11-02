import type { Phase3Repository } from '../phase3';
import { LocalJobMarginReader } from '../job-margin-analysis';
import { readProfitGuardReview } from '../profit-guard';
import {
  completionReviewGuard,
  type CompletionReviewAdmission,
} from '../job-cost-completion';
import { documentHash, ReleasePreview } from '../../domain/release/preview';
import { projectRevisionScope } from '../../domain/estimating/revision-packet';
import { customerPreview } from '../../domain/estimating/customer-preview';
import {
  readPrototypeSource,
  assertPrototypeSourceCurrentNow,
  freezePrototype,
  prototypeFields,
  type PrototypeTarget,
  type PrototypeSource,
} from '../program/prototype-source';
import {
  reviewControlledAccountingMapping,
  type ControlledAccountAliases,
} from '../controlled-integration-contracts';
import {
  verifyProcurementReview,
  type ProcurementReview,
} from '../program/procurement-review';

export interface FinanceReleaseSelection {
  preview: ReleasePreview;
  offer_id: string | null;
  decision_id: string | null;
  contract_id: string | null;
  signature_id: string | null;
  invoice_id: string | null;
  as_of: string;
}
export interface FinanceWorkflowSelection {
  job_revision: number;
  currency: string;
  release: FinanceReleaseSelection | null;
  accounting_aliases: ControlledAccountAliases | null;
  procurement: ProcurementReview | null;
}
const denied = () =>
  new Error('Exact current Finance workflow source required');
const changed = () => new Error('Finance workflow source changed');
const targetKeys = [
  'organization_id',
  'actor_id',
  'customer_id',
  'location_id',
  'estimate_id',
  'version_id',
  'job_id',
] as const;
function targetInput(input: PrototypeTarget): PrototypeTarget {
  const t = prototypeFields(input, targetKeys);
  if (
    Reflect.ownKeys(t).length !== targetKeys.length ||
    targetKeys.some(
      (key) =>
        typeof t[key] !== 'string' ||
        !(t[key] as string).length ||
        (t[key] as string).length > 200,
    )
  )
    throw denied();
  return t as unknown as PrototypeTarget;
}
function own(input: unknown, keys: readonly string[]) {
  const value = prototypeFields(input, keys);
  if (Reflect.ownKeys(value).length !== keys.length) throw denied();
  return value;
}
function releaseInput(input: FinanceReleaseSelection | null) {
  if (input === null) return null;
  const value = own(input, [
    'preview',
    'offer_id',
    'decision_id',
    'contract_id',
    'signature_id',
    'invoice_id',
    'as_of',
  ]);
  if (
    !(value.preview instanceof ReleasePreview) ||
    typeof value.as_of !== 'string' ||
    !Number.isFinite(Date.parse(value.as_of)) ||
    new Date(value.as_of).toISOString() !== value.as_of
  )
    throw denied();
  for (const key of [
    'offer_id',
    'decision_id',
    'contract_id',
    'signature_id',
    'invoice_id',
  ])
    if (
      value[key] !== null &&
      (typeof value[key] !== 'string' ||
        !(value[key] as string).length ||
        (value[key] as string).length > 200)
    )
      throw denied();
  return value as unknown as FinanceReleaseSelection;
}
function selectionInput(input: FinanceWorkflowSelection) {
  const value = own(input, [
    'job_revision',
    'currency',
    'release',
    'accounting_aliases',
    'procurement',
  ]);
  if (
    !Number.isSafeInteger(value.job_revision) ||
    Number(value.job_revision) < 1 ||
    typeof value.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(value.currency)
  )
    throw denied();
  const release = releaseInput(value.release as FinanceReleaseSelection | null);
  const aliases =
    value.accounting_aliases === null
      ? null
      : own(value.accounting_aliases, [
          'receivable',
          'sales',
          'tax_payable',
          'sandbox_clearing',
        ]);
  if (
    aliases &&
    Object.values(aliases).some(
      (alias) =>
        typeof alias !== 'string' || !alias.trim() || alias.length > 80,
    )
  )
    throw denied();
  if (
    value.procurement !== null &&
    (typeof value.procurement !== 'object' || !value.procurement)
  )
    throw denied();
  return {
    job_revision: value.job_revision as number,
    currency: value.currency,
    release,
    accounting_aliases: aliases as ControlledAccountAliases | null,
    procurement: value.procurement as ProcurementReview | null,
  };
}
function selectionIdentity(selection: ReturnType<typeof selectionInput>) {
  const release = selection.release
    ? {
        offer_id: selection.release.offer_id,
        decision_id: selection.release.decision_id,
        contract_id: selection.release.contract_id,
        signature_id: selection.release.signature_id,
        invoice_id: selection.release.invoice_id,
        as_of: selection.release.as_of,
      }
    : null;
  return JSON.stringify({
    job_revision: selection.job_revision,
    currency: selection.currency,
    release,
    accounting_aliases: selection.accounting_aliases,
  });
}

function sameTarget(a: PrototypeTarget, b: PrototypeTarget) {
  return targetKeys.every((key) => a[key] === b[key]);
}
const bindings = new WeakMap<
  object,
  {
    source: PrototypeSource;
    check: () => void;
    gate: CompletionReviewAdmission;
    access: () => void;
  }
>();

/** Existing cost engine -> exact issued scope -> invoice requirements review; no financial command. */
export async function readFinanceWorkflow(
  repo: Phase3Repository,
  inputTarget: PrototypeTarget,
  inputSelection: FinanceWorkflowSelection,
  gate: CompletionReviewAdmission = { enabled: false, confirmed: false },
) {
  completionReviewGuard(gate)();
  const target = targetInput(inputTarget),
    selection = selectionInput(inputSelection),
    identity = selectionIdentity(selection);
  const source = await readPrototypeSource(repo, target, gate);
  const membership = () => {
    completionReviewGuard(gate)();
    const rows = repo.operations
      .syntheticMemberships(target.organization_id)
      .filter((member) => member.user_id === target.actor_id);
    if (
      rows.length !== 1 ||
      !rows[0].active ||
      !['owner', 'admin'].includes(rows[0].role)
    )
      throw denied();
    return `${rows[0].role}:${rows[0].staff_type}`;
  };
  const role = membership();
  const access = () => {
    if (membership() !== role) throw denied();
  };
  const check = () => {
    access();
    const current = selectionInput(inputSelection);
    if (
      !sameTarget(targetInput(inputTarget), target) ||
      selectionIdentity(current) !== identity ||
      current.release?.preview !== selection.release?.preview ||
      current.procurement !== selection.procurement
    )
      throw denied();
    assertPrototypeSourceCurrentNow(source);
  };
  check();
  const original = repo.readSyntheticPrototypeSources(target),
    job = original.job;
  if (
    !job ||
    original.bundle.version.status !== 'issued' ||
    job.lock_revision !== selection.job_revision ||
    job.baseline.currency !== selection.currency ||
    original.bundle.version.calculation.currency !== selection.currency
  )
    throw denied();
  const safeScope = projectRevisionScope(
    original.bundle.version,
    target,
    'issued',
  );
  const scopeHash = await documentHash(safeScope);
  check();
  const costReview = await readProfitGuardReview(
    new LocalJobMarginReader(repo, true),
    {
      organizationId: target.organization_id,
      customerId: target.customer_id,
      propertyId: target.location_id,
      estimateId: target.estimate_id,
      issuedVersionId: target.version_id,
      jobId: job.id,
      jobRevision: selection.job_revision,
      currency: selection.currency,
    },
    target.actor_id,
    gate,
  );
  check();
  const captureRelease = () => {
    if (!selection.release) return null;
    const release = selection.release,
      preview = release.preview;
    if (
      preview.organizationId !== target.organization_id ||
      JSON.stringify(preview.version) !==
        JSON.stringify(
          repo.readSyntheticPrototypeSources(target).bundle.version,
        )
    )
      throw denied();
    return preview.read('staff');
  };
  const releaseSnapshot = captureRelease(),
    releaseFingerprint = JSON.stringify(releaseSnapshot);
  const checkAll = () => {
    check();
    if (JSON.stringify(captureRelease()) !== releaseFingerprint)
      throw changed();
  };
  function selected<
    T extends {
      id: string;
      organization_id: string;
      customer_id: string;
      created_at: string;
    },
  >(rows: readonly T[] | undefined, id: string | null) {
    if (id === null || !rows) return null;
    const matches = rows.filter((row) => row.id === id);
    if (matches.length > 1) throw denied();
    const row = matches[0] ?? null;
    if (
      row &&
      (row.organization_id !== target.organization_id ||
        row.customer_id !== target.customer_id ||
        !Number.isFinite(Date.parse(row.created_at)) ||
        row.created_at > selection.release!.as_of)
    )
      throw denied();
    return row;
  }
  const release = selection.release;
  const offer = selected(
    releaseSnapshot?.release_offers,
    release?.offer_id ?? null,
  );
  const decision = selected(
    releaseSnapshot?.release_decisions,
    release?.decision_id ?? null,
  );
  const contract = selected(
    releaseSnapshot?.release_contracts,
    release?.contract_id ?? null,
  );
  const signature = selected(
    releaseSnapshot?.release_signatures,
    release?.signature_id ?? null,
  );
  const invoice = selected(
    releaseSnapshot?.release_invoices,
    release?.invoice_id ?? null,
  );
  const expectedSellingScope = {
    ...customerPreview(original.bundle.version),
    internal_test: true,
  };
  if (
    (offer &&
      (offer.version_id !== target.version_id ||
        JSON.stringify(offer.snapshot) !==
          JSON.stringify(expectedSellingScope))) ||
    (decision &&
      (!offer ||
        decision.offer_id !== offer.id ||
        decision.decision !== 'accepted')) ||
    (contract &&
      (!offer ||
        !decision ||
        contract.offer_id !== offer.id ||
        JSON.stringify(contract.document.scope) !==
          JSON.stringify(expectedSellingScope))) ||
    (signature &&
      (!contract ||
        signature.contract_id !== contract.id ||
        signature.document_hash !== contract.document_hash)) ||
    (invoice &&
      (!contract ||
        !signature ||
        invoice.contract_id !== contract.id ||
        invoice.currency !== selection.currency ||
        invoice.total_minor !== safeScope.totals.total_minor ||
        JSON.stringify(invoice.snapshot) !==
          JSON.stringify(expectedSellingScope)))
  )
    throw denied();
  if (contract) {
    if (
      contract.document.internal_test !== true ||
      contract.document.terms !== contract.terms ||
      contract.document.legal_reference !== contract.legal_reference ||
      (await documentHash(contract.document)) !== contract.document_hash
    )
      throw denied();
    checkAll();
  }
  const invoicePreparation = {
    label: 'Invoice Preparation — Staff Review Only' as const,
    status: invoice
      ? ('EXISTING_SYNTHETIC_REFERENCE' as const)
      : ('UNKNOWN' as const),
    overall: 'NO_GO' as const,
    scope: safeScope,
    scope_sha256: scopeHash,
    issued: {
      estimate_id: target.estimate_id,
      version_id: target.version_id,
      version_number: original.bundle.version.version_number,
      saved_revision: original.bundle.version.lock_revision,
    },
    reference: {
      offer_id: offer?.id ?? null,
      decision_id: decision?.id ?? null,
      contract_id: contract?.id ?? null,
      signature_id: signature?.id ?? null,
      invoice_id: invoice?.id ?? null,
      invoice_number: invoice?.invoice_number ?? null,
    },
    relationship: {
      basis: 'EXACT_EXISTING_ISSUED_SCOPE' as const,
      direct_invoice_job_foreign_key: 'ABSENT' as const,
      meaning:
        'Local source-derived review only. Matching issued scope does not create a job-invoice business relation, contract or financial authority.',
    },
    requirements: [
      {
        id: 'ISSUED_SCOPE',
        status: 'RECORDED_LOCAL_SOURCE',
        detail:
          'Exact immutable issued version; canonical customer-safe scope and tax/discount totals.',
      },
      {
        id: 'SAVED_TAX_REVIEW',
        status: 'RECORDED_SYNTHETIC_REVIEW_ONLY',
        detail:
          'Saved tax snapshot is a local fixture review, not operational tax or legal acceptance.',
      },
      {
        id: 'COST_COVERAGE',
        status: costReview.status,
        detail:
          'Missing or partial cost/labor evidence is not complete profit or verified physical completion.',
      },
      {
        id: 'CUSTOMER_TEST_PREFERENCE',
        status: decision ? 'RECORDED_LOCAL_TEST' : 'UNKNOWN',
        detail: 'A local test preference is not genuine contractual approval.',
      },
      {
        id: 'CONTRACT',
        status: contract ? 'RECORDED_LOCAL_TEST' : 'UNKNOWN',
        detail:
          'Exact existing contract reference required; no contract is created.',
      },
      {
        id: 'SIGNATURE',
        status: signature ? 'RECORDED_LOCAL_TEST' : 'UNKNOWN',
        detail:
          'No genuine signature, legal acceptance or work authorization is established.',
      },
      {
        id: 'INVOICE',
        status: invoice ? 'EXISTING_SYNTHETIC_REFERENCE' : 'UNKNOWN',
        detail:
          'No invoice or receivable is created, issued or sent by this review.',
      },
      {
        id: 'LEGAL_TAX_AUTHORITY',
        status: 'UNVERIFIED',
        detail: 'Independent legal/tax and customer authority remain required.',
      },
      {
        id: 'PROVIDER_NMI_SETTLEMENT',
        status: 'UNVERIFIED',
        detail:
          'All eight NMI gates remain independent and unverified; no payment or settlement action.',
      },
    ],
  };
  let accountingHandoff: {
    status: string;
    review: Awaited<
      ReturnType<typeof reviewControlledAccountingMapping>
    > | null;
    reason: string;
  } = {
    status: 'NOT_REQUESTED',
    review: null,
    reason: 'No controlled accounting aliases selected.',
  };
  if (selection.accounting_aliases) {
    accountingHandoff =
      invoice && contract && release
        ? {
            status: 'CONTROLLED_SYNTHETIC_REVIEW_ONLY',
            review: await reviewControlledAccountingMapping(
              release.preview,
              repo.operations,
              {
                organizationId: target.organization_id,
                customerId: target.customer_id,
                propertyId: target.location_id,
                invoiceId: invoice.id,
                contractId: contract.id,
                issuedVersionId: target.version_id,
                currency: selection.currency,
                asOf: release.as_of,
              },
              target.actor_id,
              selection.accounting_aliases,
              { coverage: 'complete', outcome: 'known' },
              gate,
            ),
            reason:
              'Existing verified local export mapping only. External accounting schema, account IDs and settlement remain unverified.',
          }
        : {
            status: 'UNKNOWN',
            review: null,
            reason:
              'Exact existing invoice/contract source unavailable. No replacement or import is prepared.',
          };
    checkAll();
  }
  let procurementHandoff: {
    status: string;
    review_id: string | null;
    source_sha256: string | null;
    selections: {
      line_id: string;
      catalog_item_id: string;
      unit: string;
      quantity_milli: number;
      bid_minor: number | null;
    }[];
    current_admission: 'UNKNOWN';
    approval: 'BLOCKED';
  } = {
    status: 'NOT_REQUESTED',
    review_id: null,
    source_sha256: null,
    selections: [],
    current_admission: 'UNKNOWN',
    approval: 'BLOCKED',
  };
  if (selection.procurement) {
    const status = await verifyProcurementReview(selection.procurement);
    checkAll();
    if (status === 'CURRENT') {
      const p = selection.procurement.snapshot;
      if (
        !sameTarget(p.target, target) ||
        p.source_sha256 !== source.sha256 ||
        p.currency !== selection.currency ||
        p.existing_job_commitments?.job_id !== job.id ||
        p.existing_job_commitments.revision !== selection.job_revision
      )
        throw denied();
      procurementHandoff = {
        status: 'CAPTURED_EXISTING_REVIEW_ONLY',
        review_id: selection.procurement.id,
        source_sha256: p.source_sha256,
        selections: p.selections.map(
          ({ line_id, catalog_item_id, unit, quantity_milli, bid_minor }) => ({
            line_id,
            catalog_item_id,
            unit,
            quantity_milli,
            bid_minor,
          }),
        ),
        current_admission: 'UNKNOWN',
        approval: 'BLOCKED',
      };
    } else procurementHandoff = { ...procurementHandoff, status: 'UNKNOWN' };
  }
  const body = {
    mode: 'LOCAL_SYNTHETIC_FINANCE_WORKFLOW' as const,
    audience: 'CURRENT_SYNTHETIC_OWNER_ADMIN_ONLY' as const,
    target,
    job_revision: selection.job_revision,
    currency: selection.currency,
    source_sha256: source.sha256,
    costReview,
    invoicePreparation,
    accountingHandoff,
    procurementHandoff,
    genuine_authentication: 'UNVERIFIED' as const,
    workforce_currentness: 'UNKNOWN' as const,
    custody: 'SESSION_ONLY_NO_REFRESH_OR_CRASH_DURABILITY' as const,
    authority: {
      create_invoice: false,
      create_contract: false,
      sign: false,
      issue: false,
      send: false,
      payment: false,
      debt: false,
      job_change: false,
      purchase_order: false,
      post_expense: false,
      payroll: false,
      hosted: false,
    },
  };
  const sha256 = await documentHash(body);
  checkAll();
  const result = freezePrototype({ ...body, sha256 });
  bindings.set(result, { source, check: checkAll, gate, access });
  return result;
}
export type FinanceWorkflowReview = Awaited<
  ReturnType<typeof readFinanceWorkflow>
>;
/** Exact retained-session read only. UNKNOWN never creates/replays a financial command. */
export async function verifyFinanceWorkflow(review: FinanceWorkflowReview) {
  const binding = bindings.get(review);
  if (!binding)
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  try {
    completionReviewGuard(binding.gate)();
    const { sha256, ...body } = review;
    if ((await documentHash(body)) !== sha256) throw denied();
    binding.check();
    return freezePrototype({
      status: 'CURRENT_LOCAL_SOURCE' as const,
      replacement: null,
    });
  } catch (error) {
    try {
      completionReviewGuard(binding.gate)();
      binding.access();
    } catch {
      return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
    }
    return freezePrototype({
      status:
        error instanceof Error &&
        ['Stale prototype source', 'Finance workflow source changed'].includes(
          error.message,
        )
          ? ('STALE' as const)
          : ('UNKNOWN' as const),
      replacement: null,
    });
  }
}
