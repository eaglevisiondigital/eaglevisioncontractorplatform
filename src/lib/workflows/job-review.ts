import type { Phase3Repository } from '../phase3';
import { calculateEstimate } from '../../domain/estimating/calculation';
import { documentHash } from '../../domain/release/preview';
import { validateTime, type TimeEntry } from '../../domain/workforce/payroll';
import type { ProfitGuardTimeProposalInput } from '../profit-guard';
import {
  completionReviewGuard,
  type CompletionReviewAdmission,
} from '../job-cost-completion';
import {
  readPrototypeSource,
  assertPrototypeSourceCurrentNow,
  freezePrototype,
  prototypeFields,
  type PrototypeSource,
  type PrototypeTarget,
} from '../program/prototype-source';
import {
  prepareProcurementReview,
  type ProcurementReview,
} from '../program/procurement-review';
import {
  readFinanceWorkflow,
  verifyFinanceWorkflow,
  type FinanceWorkflowSelection,
} from './finance-workflow';

export interface JobMaterialProposal {
  line_id: string;
  quantity_milli: number;
  unit_cost_minor: number;
  catalog_item_id: string | null;
}
export interface JobReviewSelection {
  finance: FinanceWorkflowSelection;
  time: ProfitGuardTimeProposalInput | null;
  material: JobMaterialProposal | null;
  input_revision: number;
}
const denied = () =>
  Error('Exact current saved job and confirmed unsaved proposal required');
function own(value: unknown, keys: readonly string[]) {
  const result = prototypeFields(value, keys);
  if (Reflect.ownKeys(result).length !== keys.length) throw denied();
  return result;
}
function selection(input: JobReviewSelection) {
  const p = own(input, ['finance', 'time', 'material', 'input_revision']);
  if (!Number.isSafeInteger(p.input_revision) || Number(p.input_revision) < 1)
    throw denied();
  const finance = own(p.finance, [
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
  const aliases =
    finance.accounting_aliases === null
      ? null
      : own(finance.accounting_aliases, [
          'receivable',
          'sales',
          'tax_payable',
          'sandbox_clearing',
        ]);
  // Do not invoke caller serializers while fingerprinting nested finance identity.
  if (
    !Number.isSafeInteger(finance.job_revision) ||
    Number(finance.job_revision) < 1 ||
    typeof finance.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(finance.currency) ||
    (aliases &&
      Object.values(aliases).some(
        (v) => typeof v !== 'string' || !v.trim() || v.length > 80,
      ))
  )
    throw denied();
  if (
    release &&
    (typeof release.as_of !== 'string' ||
      !Number.isFinite(Date.parse(release.as_of)) ||
      [
        'offer_id',
        'decision_id',
        'contract_id',
        'signature_id',
        'invoice_id',
      ].some(
        (k) =>
          release[k] !== null &&
          (typeof release[k] !== 'string' ||
            !(release[k] as string).length ||
            (release[k] as string).length > 200),
      ))
  )
    throw denied();
  const material =
    p.material === null
      ? null
      : own(p.material, [
          'line_id',
          'quantity_milli',
          'unit_cost_minor',
          'catalog_item_id',
        ]);
  if (
    material &&
    (typeof material.line_id !== 'string' ||
      !material.line_id ||
      material.line_id.length > 200 ||
      !Number.isSafeInteger(material.quantity_milli) ||
      Number(material.quantity_milli) < 1 ||
      Number(material.quantity_milli) > 1_000_000_000 ||
      !Number.isSafeInteger(material.unit_cost_minor) ||
      Number(material.unit_cost_minor) < 0 ||
      Number(material.unit_cost_minor) > 1_000_000_000 ||
      (material.catalog_item_id !== null &&
        (typeof material.catalog_item_id !== 'string' ||
          !material.catalog_item_id ||
          material.catalog_item_id.length > 200)))
  )
    throw denied();
  const time =
    p.time === null
      ? null
      : own(p.time, [
          'workerId',
          'startedAt',
          'endedAt',
          'task',
          'allocation',
          'overheadCenter',
        ]);
  if (
    time &&
    (['workerId', 'startedAt', 'endedAt', 'task'].some(
      (key) =>
        typeof time[key] !== 'string' ||
        !(time[key] as string).trim() ||
        (time[key] as string).length > 250,
    ) ||
      !['job', 'overhead'].includes(String(time.allocation)) ||
      (time.allocation === 'job'
        ? time.overheadCenter !== null
        : typeof time.overheadCenter !== 'string' ||
          !time.overheadCenter.trim() ||
          time.overheadCenter.length > 80))
  )
    throw denied();
  // Detached primitive proposal before any await. Never freeze or serialize the live engines.
  const proposal = freezePrototype({
    material: material as unknown as JobMaterialProposal | null,
    time: time as unknown as ProfitGuardTimeProposalInput | null,
    input_revision: p.input_revision as number,
  });
  return {
    proposal,
    finance: p.finance as FinanceWorkflowSelection,
    preview: release?.preview,
    procurement: finance.procurement,
    identity: JSON.stringify({
      ...proposal,
      finance: {
        ...finance,
        release: release ? { ...release, preview: undefined } : null,
        procurement: undefined,
        accounting_aliases: aliases,
      },
    }),
  };
}
const bindings = new WeakMap<
  object,
  {
    source: PrototypeSource;
    check: () => void;
    access: () => void;
    finance: Awaited<ReturnType<typeof readFinanceWorkflow>>;
    workforceCheck: (() => Promise<void>) | null;
  }
>();

/** Read-only staff composition. Proposals never enter actual/forecast/ledger records. */
export async function readJobReview(
  repo: Phase3Repository,
  inputTarget: PrototypeTarget,
  input: JobReviewSelection,
  gate: CompletionReviewAdmission = { enabled: false, confirmed: false },
) {
  completionReviewGuard(gate)();
  const chosen = selection(input),
    target = {
      ...own(inputTarget, [
        'organization_id',
        'actor_id',
        'customer_id',
        'location_id',
        'estimate_id',
        'version_id',
        'job_id',
      ]),
    } as unknown as PrototypeTarget;
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
  const assignments = () =>
    repo
      .syntheticJobAssignments(target.organization_id, target.actor_id)
      .filter((a) => a.job_id === target.job_id);
  const assignmentFingerprint = JSON.stringify(assignments());
  const check = () => {
    if (access() !== role) throw denied();
    const current = selection(input);
    if (
      JSON.stringify(own(inputTarget, Object.keys(target))) !==
        JSON.stringify(target) ||
      current.identity !== chosen.identity ||
      current.finance !== chosen.finance ||
      current.preview !== chosen.preview ||
      current.procurement !== chosen.procurement
    )
      throw denied();
    assertPrototypeSourceCurrentNow(source);
    if (JSON.stringify(assignments()) !== assignmentFingerprint)
      throw Error('Job assignment source changed');
  };
  check();
  const original = repo.readSyntheticPrototypeSources(target);
  if (!original.job || original.bundle.version.status !== 'issued')
    throw denied();
  const recorded = await readFinanceWorkflow(
    repo,
    inputTarget,
    chosen.finance,
    gate,
  );
  check();
  let material: {
    sourceLineId: string;
    description: string;
    unit: string;
    originalQuantityMilli: number;
    proposedQuantityMilli: number;
    originalUnitCostMinor: number;
    proposedUnitCostMinor: number;
    originalCostMinor: number;
    proposedCostMinor: number;
    catalogAssociation:
      'RECORDED_EXACT' | 'UNKNOWN_NO_RECORDED_SCOPE_CATALOG_ASSOCIATION';
    procurementReview: ProcurementReview | null;
    posting: 'UNSAVED_NOT_ACTUAL_COST';
  } | null = null;
  if (chosen.proposal.material) {
    const proposal = chosen.proposal.material;
    const lines = original.bundle.version.payload.lines.filter(
      (l) => l.id === proposal.line_id,
    );
    const line = lines[0],
      calc = original.bundle.version.calculation.lines.find(
        (l) => l.id === proposal.line_id,
      );
    if (
      lines.length !== 1 ||
      !line ||
      !['material', 'product'].includes(line.kind) ||
      !calc?.included ||
      proposal.catalog_item_id !== line.catalog_item_id
    )
      throw denied();
    const detached = structuredClone(original.bundle.version.payload);
    detached.lines = detached.lines.map((l) =>
      l.id === line.id
        ? {
            ...l,
            quantity_milli: proposal.quantity_milli,
            unit_cost_minor: proposal.unit_cost_minor,
            unit_price_minor: calc.unit_price_minor,
          }
        : l,
    );
    // Existing integer calculator only. Customer totals from this internal what-if are discarded.
    const canonical = calculateEstimate(
      detached,
      original.bundle.version.tax_policy_snapshot?.rate_bps ?? 0,
    ).lines.find((l) => l.id === line.id)!;
    let procurementReview: ProcurementReview | null = null;
    if (line.catalog_item_id) {
      procurementReview = await prepareProcurementReview(
        source,
        {
          kind: 'purchase-review',
          selections: [
            {
              line_id: line.id,
              catalog_item_id: line.catalog_item_id,
              quantity_milli: proposal.quantity_milli,
              bid_minor: canonical.cost_minor,
            },
          ],
        },
        gate,
      );
      check();
    }
    material = {
      sourceLineId: line.id,
      description: line.description,
      unit: line.unit,
      originalQuantityMilli: line.quantity_milli,
      proposedQuantityMilli: proposal.quantity_milli,
      originalUnitCostMinor: line.unit_cost_minor,
      proposedUnitCostMinor: proposal.unit_cost_minor,
      originalCostMinor: calc.cost_minor,
      proposedCostMinor: canonical.cost_minor,
      catalogAssociation: procurementReview
        ? 'RECORDED_EXACT'
        : 'UNKNOWN_NO_RECORDED_SCOPE_CATALOG_ASSOCIATION',
      procurementReview,
      posting: 'UNSAVED_NOT_ACTUAL_COST',
    };
  }
  let time: {
    workerId: string;
    jobId: string | null;
    allocation: 'job' | 'overhead';
    task: string;
    startedAt: string;
    endedAt: string;
    overheadCenter: string | null;
    validation: 'VALID_AGAINST_CAPTURED_ENTRIES';
    evidence: 'CAPTURED_NOT_ATOMIC';
    currentWorkerAndTimeCoverage: 'UNKNOWN';
    monetaryAllocation: null;
    approvedOverheadCenter: 'UNVERIFIED' | null;
    posting: 'UNSAVED_NOT_POSTED';
  } | null = null;
  let workforceCheck: (() => Promise<void>) | null = null;
  if (chosen.proposal.time) {
    const p = chosen.proposal.time;
    const before = await repo.workforce(target.organization_id);
    check();
    const footprint = JSON.stringify(before);
    const worker = original.workforce.workers.filter(
      (w) =>
        w.id === p.workerId &&
        w.active &&
        w.organization_id === target.organization_id,
    );
    const member = repo.operations
      .syntheticMemberships(target.organization_id)
      .filter((m) => m.user_id === worker[0]?.user_id && m.active);
    if (
      worker.length !== 1 ||
      member.length !== 1 ||
      !assignments().some((a) => a.active && a.user_id === worker[0].user_id)
    )
      throw denied();
    const entry: TimeEntry = {
      id: 'unsaved-job-review-time-proposal',
      worker_id: worker[0].id,
      job_id: p.allocation === 'job' ? target.job_id : null,
      overhead_center: p.overheadCenter,
      task: p.task,
      kind: 'work',
      started_at: p.startedAt,
      ended_at: p.endedAt,
      submitted: false,
      billable: false,
      corrects_id: null,
    };
    if (before.entries.some((e) => e.id === entry.id)) throw denied();
    validateTime([...before.entries, entry]);
    workforceCheck = async () => {
      const current = await repo.workforce(target.organization_id);
      check();
      if (JSON.stringify(current) !== footprint)
        throw Error('Captured workforce source changed');
    };
    await workforceCheck();
    check();
    time = {
      workerId: p.workerId,
      jobId: entry.job_id,
      allocation: p.allocation,
      task: p.task,
      startedAt: p.startedAt,
      endedAt: p.endedAt,
      overheadCenter: p.overheadCenter,
      validation: 'VALID_AGAINST_CAPTURED_ENTRIES',
      evidence: 'CAPTURED_NOT_ATOMIC',
      currentWorkerAndTimeCoverage: 'UNKNOWN',
      monetaryAllocation: null,
      approvedOverheadCenter: p.allocation === 'overhead' ? 'UNVERIFIED' : null,
      posting: 'UNSAVED_NOT_POSTED',
    };
  }
  const authority = {
    post_time: false,
    post_expense: false,
    payroll: false,
    purchase_order: false,
    create_invoice: false,
    contract: false,
    payment: false,
    ledger: false,
    send: false,
    hosted: false,
  } as const;
  const reportSnapshot = {
    label: 'Staff Job Review Reference — Not an Accounting Import' as const,
    audience: 'CURRENT_SYNTHETIC_OWNER_ADMIN_ONLY' as const,
    target: { ...target },
    input_revision: chosen.proposal.input_revision,
    source_sha256: source.sha256,
    currency: recorded.currency,
    recorded: {
      job_revision: recorded.job_revision,
      coverage: recorded.costReview.status,
      totals: recorded.costReview.completion.totals,
      profitability: recorded.costReview.profitability,
    },
    unsaved: {
      material: material
        ? {
            sourceLineId: material.sourceLineId,
            unit: material.unit,
            quantityMilli: material.proposedQuantityMilli,
            unitCostMinor: material.proposedUnitCostMinor,
            costMinor: material.proposedCostMinor,
            posting: material.posting,
          }
        : null,
      time: time
        ? {
            workerId: time.workerId,
            jobId: time.jobId,
            startedAt: time.startedAt,
            endedAt: time.endedAt,
            allocation: time.allocation,
            monetaryAllocation: null,
            currentWorkerAndTimeCoverage: time.currentWorkerAndTimeCoverage,
            posting: time.posting,
          }
        : null,
    },
    customer_issued_totals: { ...recorded.invoicePreparation.scope.totals },
    invoice: {
      status: recorded.invoicePreparation.status,
      overall: recorded.invoicePreparation.overall,
      reference: { ...recorded.invoicePreparation.reference },
    },
    authority,
  };
  const reportHash = await documentHash(reportSnapshot);
  check();
  const report = {
    snapshot: reportSnapshot,
    sha256: reportHash,
    jsonPreview: JSON.stringify(reportSnapshot, null, 2),
  };
  const body = {
    mode: 'LOCAL_SYNTHETIC_JOB_REVIEW' as const,
    audience: 'CURRENT_SYNTHETIC_OWNER_ADMIN_ONLY' as const,
    target,
    input_revision: chosen.proposal.input_revision,
    source_sha256: source.sha256,
    recorded,
    proposed: { material, time },
    invoiceRequirements: recorded.invoicePreparation,
    financialExport:
      recorded.invoicePreparation.reference.invoice_id === null
        ? {
            status: 'UNKNOWN',
            review: null,
            reason:
              'No exact existing invoice; no ledger/export rows invented.',
          }
        : recorded.accountingHandoff,
    report,
    authority,
    coverage: 'PROPOSALS_DO_NOT_CHANGE_RECORDED_COST_COVERAGE' as const,
    custody: 'SESSION_ONLY_NO_REFRESH_OR_CRASH_DURABILITY' as const,
  };
  const sha256 = await documentHash(body);
  check();
  if ((await verifyFinanceWorkflow(recorded)).status !== 'CURRENT_LOCAL_SOURCE')
    throw denied();
  check(); // No await after this original-input/current-source/current-role fence.
  const result = freezePrototype({ ...body, sha256 });
  bindings.set(result, {
    source,
    check,
    access: () => {
      if (access() !== role) throw denied();
    },
    finance: recorded,
    workforceCheck,
  });
  return result;
}
export type JobReviewResult = Awaited<ReturnType<typeof readJobReview>>;

/** Exact retained read only; never prepares a replacement or replays an operation. */
export async function inspectJobReview(review: JobReviewResult) {
  const b = bindings.get(review);
  if (!b)
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  try {
    b.access();
    const { sha256, ...body } = review;
    if ((await documentHash(body)) !== sha256) throw denied();
    b.check();
    if (b.workforceCheck) await b.workforceCheck();
    b.check();
    if (
      (await verifyFinanceWorkflow(b.finance)).status !== 'CURRENT_LOCAL_SOURCE'
    )
      throw denied();
    b.check();
    return freezePrototype({
      status: 'CURRENT_LOCAL_SOURCE' as const,
      replacement: null,
    });
  } catch (error) {
    try {
      b.access();
    } catch {
      return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
    }
    return freezePrototype({
      status:
        error instanceof Error &&
        [
          'Stale prototype source',
          'Job assignment source changed',
          'Captured workforce source changed',
        ].includes(error.message)
          ? ('STALE' as const)
          : ('UNKNOWN' as const),
      replacement: null,
    });
  }
}
