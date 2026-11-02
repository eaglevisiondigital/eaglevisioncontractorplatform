import { sampleCompanies } from '../domain/platform';
import { uuidPattern } from '../domain/intake';
import { documentHash, type ReleasePreview } from '../domain/release/preview';
import {
  projectSyntheticFinancialExport,
  type SyntheticFinancialExportInput,
} from '../domain/finance/export';
import type { CommunicationContext } from '../../server/communications/preparation';
import type { PropertyRepository } from './property';
import type { Operations } from './operations';
import {
  completionReviewGuard,
  type CompletionReviewAdmission,
} from './job-cost-completion';

type Immutable<T> = T extends object
  ? { readonly [K in keyof T]: Immutable<T[K]> }
  : T;
const denied = () =>
  new Error('Exact controlled integration evidence unavailable');
function freeze<T>(value: T): Immutable<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value as Immutable<T>;
}
function fields(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw denied();
  const actual = Reflect.ownKeys(value),
    descriptors = Object.getOwnPropertyDescriptors(value),
    result: Record<string, unknown> = {};
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    throw denied();
  for (const key of keys) {
    if (!descriptors[key] || !('value' in descriptors[key])) throw denied();
    result[key] = descriptors[key].value;
  }
  return result;
}
function text(value: unknown, max = 120) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value) ||
    new TextDecoder().decode(new TextEncoder().encode(value)) !== value
  )
    throw denied();
  return value;
}
function uuid(value: unknown) {
  const id = text(value);
  if (!uuidPattern.test(id)) throw denied();
  return id;
}
function revision(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw denied();
  return value as number;
}
function access(
  operations: Operations,
  organizationId: string,
  actor: string,
  admission: CompletionReviewAdmission,
) {
  completionReviewGuard(admission)();
  if (
    !operations.sample ||
    !sampleCompanies.some((company) => company.id === organizationId)
  )
    throw denied();
  const members = operations
    .syntheticMemberships(organizationId)
    .filter((member) => member.user_id === actor);
  if (
    members.length !== 1 ||
    !members[0].active ||
    !['owner', 'admin'].includes(members[0].role)
  )
    throw denied();
  return members[0].role;
}
const authority = {
  externalWrite: false,
  financialExecution: false,
  calendarWrite: false,
  dispatch: false,
  communicate: false,
  hosted: false,
} as const;
const records = new WeakMap<
  object,
  {
    capture: () => unknown | Promise<unknown>;
    fingerprint: string;
    finalCheck: () => void;
    atomic: boolean;
  }
>();
async function retain<T>(
  body: T,
  capture: () => unknown | Promise<unknown>,
  initial: unknown,
  finalCheck: () => void,
  atomic = true,
) {
  const fingerprint = JSON.stringify(initial),
    reviewHash = await documentHash(body);
  if (atomic && JSON.stringify(capture()) !== fingerprint) throw denied();
  finalCheck();
  const result = freeze({ ...body, reviewHash });
  records.set(result, { capture, fingerprint, finalCheck, atomic });
  return result;
}

export interface ControlledAccountingTarget {
  organizationId: string;
  customerId: string;
  propertyId: string | null;
  invoiceId: string;
  contractId: string;
  issuedVersionId: string;
  currency: string;
  asOf: string;
}
export interface ControlledAccountAliases {
  receivable: string;
  sales: string;
  tax_payable: string;
  sandbox_clearing: string;
}
export interface ControlledSourceDeclaration {
  coverage: 'complete' | 'partial' | 'unknown';
  outcome: 'known' | 'unknown';
}
function accountingTarget(input: ControlledAccountingTarget) {
  const source = fields(input, [
    'organizationId',
    'customerId',
    'propertyId',
    'invoiceId',
    'contractId',
    'issuedVersionId',
    'currency',
    'asOf',
  ]);
  text(source.organizationId);
  for (const key of [
    'customerId',
    'invoiceId',
    'contractId',
    'issuedVersionId',
  ])
    uuid(source[key]);
  if (source.propertyId !== null) uuid(source.propertyId);
  if (!/^[A-Z]{3}$/.test(text(source.currency, 3))) throw denied();
  const asOf = text(source.asOf, 24);
  if (
    !Number.isFinite(Date.parse(asOf)) ||
    new Date(asOf).toISOString() !== asOf
  )
    throw denied();
  return source as unknown as ControlledAccountingTarget;
}
/** Controlled local mapping, deliberately not an external provider's import/API schema. */
export async function reviewControlledAccountingMapping(
  preview: ReleasePreview,
  operations: Operations,
  input: ControlledAccountingTarget,
  actor: string,
  aliasInput: ControlledAccountAliases,
  sourceInput: ControlledSourceDeclaration,
  admission: CompletionReviewAdmission = { enabled: false, confirmed: false },
) {
  completionReviewGuard(admission)();
  const target = accountingTarget(input),
    aliases = fields(aliasInput, [
      'receivable',
      'sales',
      'tax_payable',
      'sandbox_clearing',
    ]) as unknown as ControlledAccountAliases;
  for (const value of Object.values(aliases))
    if (!/^[A-Za-z0-9][A-Za-z0-9 _./-]{0,79}$/.test(text(value, 80)))
      throw denied();
  if (new Set(Object.values(aliases)).size !== 4) throw denied();
  const declaration = fields(sourceInput, [
    'coverage',
    'outcome',
  ]) as unknown as ControlledSourceDeclaration;
  if (
    !['complete', 'partial', 'unknown'].includes(declaration.coverage) ||
    !['known', 'unknown'].includes(declaration.outcome)
  )
    throw denied();
  const role = access(operations, target.organizationId, actor, admission);
  const check = () => {
    if (
      access(operations, target.organizationId, actor, admission) !== role ||
      JSON.stringify(accountingTarget(input)) !== JSON.stringify(target) ||
      JSON.stringify(
        fields(aliasInput, [
          'receivable',
          'sales',
          'tax_payable',
          'sandbox_clearing',
        ]),
      ) !== JSON.stringify(aliases) ||
      JSON.stringify(fields(sourceInput, ['coverage', 'outcome'])) !==
        JSON.stringify(declaration)
    )
      throw denied();
  };
  const capture = () => {
    if (
      preview.organizationId !== target.organizationId ||
      preview.version.organization_id !== target.organizationId ||
      preview.version.id !== target.issuedVersionId ||
      preview.version.status !== 'issued' ||
      preview.version.payload.customer_id !== target.customerId ||
      preview.version.payload.location_id !== target.propertyId
    )
      throw denied();
    const workspace = preview.read('staff');
    if (workspace.internal_test !== true) throw denied();
    const invoices = workspace.release_invoices.filter(
      (row) => row.id === target.invoiceId,
    );
    if (invoices.length > 1) throw denied();
    const invoice = invoices[0] ?? null;
    const contracts = workspace.release_contracts.filter(
      (row) => row.id === target.contractId,
    );
    if (
      contracts.length !== 1 ||
      contracts[0].organization_id !== target.organizationId ||
      contracts[0].customer_id !== target.customerId ||
      !workspace.release_offers.some(
        (offer) =>
          offer.id === contracts[0].offer_id &&
          offer.version_id === target.issuedVersionId &&
          offer.organization_id === target.organizationId &&
          offer.customer_id === target.customerId,
      )
    )
      throw denied();
    return {
      version: structuredClone(preview.version),
      contract: contracts[0],
      invoice,
      events: workspace.release_payment_events.filter(
        (row) => row.invoice_id === target.invoiceId,
      ),
      ledger: workspace.release_ledger_entries.filter(
        (row) => row.invoice_id === target.invoiceId,
      ),
    };
  };
  const snapshot = capture();
  const exportInput: SyntheticFinancialExportInput = {
    syntheticFixture: true,
    scope: {
      organizationId: target.organizationId,
      customerId: target.customerId,
      propertyId: target.propertyId,
      invoiceId: target.invoiceId,
      currency: target.currency,
      asOf: target.asOf,
    },
    source: {
      kind: 'release-preview',
      reference: `controlled-source-${target.invoiceId}`,
      observedAt: target.asOf,
      coverage: declaration.coverage,
      outcome: declaration.outcome,
      contractId: target.contractId,
      eventIds: snapshot.events.map((event) => event.id),
      ledgerEntryIds: snapshot.ledger.map((row) => row.id),
    },
    invoice: snapshot.invoice,
    events: snapshot.events,
    ledgerEntries: snapshot.ledger,
  };
  const exported = await projectSyntheticFinancialExport(exportInput, {
    enabled: true,
  });
  check();
  const packet = exported.packet;
  const rows =
    packet.status === 'RECONCILED_SYNTHETIC_ONLY'
      ? packet.ledgerEntries.map((row) => ({
          sourceLedgerId: row.id,
          sourceEventId: row.event_id,
          eventKind:
            packet.events.find((event) => event.id === row.event_id)?.kind ??
            null,
          adjustsEventId:
            packet.events.find((event) => event.id === row.event_id)
              ?.adjusts_event_id ?? null,
          amountMinor: row.amount_minor,
          currency: packet.scope.currency,
          debitAlias: aliases[row.debit_account],
          creditAlias: aliases[row.credit_account],
        }))
      : [];
  return retain(
    {
      kind: 'controlled-accounting-mapping' as const,
      mode: 'local-synthetic-review-only' as const,
      target,
      status: packet.status,
      summary: packet.summary,
      rows,
      sourceExportId: packet.id,
      sourceIntegrity: packet.integrity,
      aliasMeaning:
        'Human-controlled local aliases, not validated external account IDs or chart approval.',
      externalCustomerId: null,
      externalInvoiceId: null,
      externalProviderSchema: 'UNVERIFIED' as const,
      merchantSettlement: 'UNKNOWN' as const,
      accountantApproval: 'UNVERIFIED' as const,
      genuineAuthentication: 'UNVERIFIED' as const,
      authority,
    },
    capture,
    snapshot,
    check,
  );
}

export interface ControlledCalendarTarget {
  organizationId: string;
  customerId: string;
  propertyId: string;
  planId: string;
  planRevision: number;
  visitId: string;
  visitRevision: number;
}
function calendarTarget(input: ControlledCalendarTarget) {
  const value = fields(input, [
    'organizationId',
    'customerId',
    'propertyId',
    'planId',
    'planRevision',
    'visitId',
    'visitRevision',
  ]);
  text(value.organizationId);
  for (const key of ['customerId', 'propertyId', 'planId', 'visitId'])
    uuid(value[key]);
  revision(value.planRevision);
  revision(value.visitRevision);
  return value as unknown as ControlledCalendarTarget;
}
/** Existing date-only inspection evidence never becomes a booking or timed appointment. */
export async function reviewControlledCalendarMapping(
  repository: PropertyRepository,
  input: ControlledCalendarTarget,
  actor: string,
  admission: CompletionReviewAdmission = { enabled: false, confirmed: false },
) {
  completionReviewGuard(admission)();
  const target = calendarTarget(input),
    operations = repository.operations;
  const role = access(operations, target.organizationId, actor, admission);
  const check = () => {
    if (
      access(operations, target.organizationId, actor, admission) !== role ||
      JSON.stringify(calendarTarget(input)) !== JSON.stringify(target)
    )
      throw denied();
    operations.syntheticProperty(
      target.organizationId,
      target.customerId,
      target.propertyId,
    );
  };
  const capture = () => {
    check();
    const state = repository.read(target.organizationId),
      plans = state.plans.filter((plan) => plan.id === target.planId),
      visits = state.visits.filter((visit) => visit.id === target.visitId);
    if (plans.length !== 1 || visits.length !== 1) throw denied();
    const plan = plans[0],
      visit = visits[0];
    if (
      plan.organization_id !== target.organizationId ||
      plan.customer_id !== target.customerId ||
      plan.location_id !== target.propertyId ||
      plan.revision !== target.planRevision ||
      visit.organization_id !== target.organizationId ||
      visit.plan_id !== plan.id ||
      visit.revision !== target.visitRevision ||
      !/^\d{4}-\d{2}-\d{2}$/.test(visit.visited_on)
    )
      throw denied();
    return { plan, visit };
  };
  const snapshot = capture();
  return retain(
    {
      kind: 'controlled-calendar-mapping' as const,
      mode: 'local-synthetic-review-only' as const,
      target,
      proposal: {
        sourceKind: 'inspection-visit' as const,
        sourceDate: snapshot.visit.visited_on,
        sourceTimezone: snapshot.plan.timezone,
        sourceCadence: snapshot.plan.cadence,
        sourceVisitStatus: snapshot.visit.status,
        externalEventId: null,
        startInstant: null,
        endInstant: null,
        availability: 'UNKNOWN' as const,
        meaning:
          'Date-only evidence; no timed booking, technician availability, dispatch or execution authority.',
      },
      providerSchema: 'UNVERIFIED' as const,
      genuineAuthentication: 'UNVERIFIED' as const,
      authority,
    },
    capture,
    snapshot,
    check,
  );
}

export interface ControlledCommunicationTarget {
  organizationId: string;
  customerId: string;
  propertyId: string | null;
  channel: 'email' | 'sms';
}
function communicationTarget(input: ControlledCommunicationTarget) {
  const value = fields(input, [
    'organizationId',
    'customerId',
    'propertyId',
    'channel',
  ]);
  text(value.organizationId);
  uuid(value.customerId);
  if (value.propertyId !== null) uuid(value.propertyId);
  if (!['email', 'sms'].includes(value.channel as string)) throw denied();
  return value as unknown as ControlledCommunicationTarget;
}
/** Source pointers for existing preparation requirements, never a recipient or send permission. */
export async function reviewControlledCommunicationMapping(
  operations: Operations,
  input: ControlledCommunicationTarget,
  actor: string,
  admission: CompletionReviewAdmission = { enabled: false, confirmed: false },
) {
  completionReviewGuard(admission)();
  const target = communicationTarget(input),
    role = access(operations, target.organizationId, actor, admission);
  const check = () => {
    if (
      access(operations, target.organizationId, actor, admission) !== role ||
      JSON.stringify(communicationTarget(input)) !== JSON.stringify(target)
    )
      throw denied();
    if (target.propertyId !== null)
      operations.syntheticProperty(
        target.organizationId,
        target.customerId,
        target.propertyId,
      );
  };
  check();
  let customerFound = false;
  for (let page = 0; page < 100; page++) {
    const result = await operations.listCustomers(
      target.organizationId,
      '',
      '',
      page,
    );
    check();
    if (
      result.rows.some(
        (customer) =>
          customer.organization_id === target.organizationId &&
          customer.id === target.customerId,
      )
    ) {
      customerFound = true;
      break;
    }
    if ((page + 1) * 10 >= result.count) break;
  }
  if (!customerFound) throw denied();
  const capture = async () => {
    const history = await operations.customerHistory(
      target.organizationId,
      target.customerId,
    );
    check();
    if (
      new Set(history.consents.map((row) => row.id)).size !==
      history.consents.length
    )
      throw denied();
    return history.consents
      .map((row) => {
        if (
          row.organization_id !== target.organizationId ||
          row.customer_id !== target.customerId ||
          typeof row.email_allowed !== 'boolean' ||
          typeof row.sms_allowed !== 'boolean' ||
          !Number.isFinite(Date.parse(row.recorded_at)) ||
          new Date(row.recorded_at).toISOString() !== row.recorded_at
        )
          throw denied();
        return {
          id: uuid(row.id),
          recordedAt: row.recorded_at,
          policyVersion: text(row.policy_version),
          emailAllowed: row.email_allowed,
          smsAllowed: row.sms_allowed,
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  };
  const before = await capture(),
    after = await capture();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw denied();
  const latestDate = [...before]
    .map((row) => row.recordedAt)
    .sort()
    .at(-1);
  const latest = before.filter((row) => row.recordedAt === latestDate);
  const flags = latest.map((row) =>
    target.channel === 'email' ? row.emailAllowed : row.smsAllowed,
  );
  const recordedPreference =
    flags.length === 0 || new Set(flags).size !== 1
      ? ('UNKNOWN' as const)
      : flags[0]
        ? ('RECORDED_ALLOWANCE_ONLY' as const)
        : ('RECORDED_OPT_OUT' as const);
  const requirements: (keyof CommunicationContext)[] = [
    'customerEmail',
    'contactVerified',
    'consent',
    'suppressed',
    'profile',
  ];
  return retain(
    {
      kind: 'controlled-communication-mapping' as const,
      mode: 'local-synthetic-review-only' as const,
      target,
      consentSourceIds: latest.map((row) => row.id),
      recordedPreference,
      currentConsentCoverage: 'UNKNOWN' as const,
      purposeConsent: 'UNVERIFIED' as const,
      sender: 'UNVERIFIED' as const,
      suppression: 'UNVERIFIED' as const,
      verifiedRecipient: null,
      externalContactId: null,
      channelPreparation:
        target.channel === 'email'
          ? ('EXISTING_EMAIL_PREPARATION_ONLY' as const)
          : ('UNVERIFIED_NO_SMS_PREPARATION_CONTRACT' as const),
      existingPreparationRequirements:
        target.channel === 'email' ? requirements : [],
      admission: 'NO_GO' as const,
      genuineAuthentication: 'UNVERIFIED' as const,
      authority,
    },
    capture,
    before,
    check,
    false,
  );
}

/** Only exact read-only comparison; no retry, replacement ID or external work. */
export async function reconcileControlledIntegrationReview(review: object) {
  const record = records.get(review);
  if (!record) return freeze({ status: 'UNKNOWN' as const, replacement: null });
  try {
    record.finalCheck();
    const source = await record.capture();
    record.finalCheck();
    if (JSON.stringify(source) !== record.fingerprint)
      return freeze({ status: 'STALE' as const, replacement: null });
    if (!record.atomic)
      return freeze({ status: 'UNKNOWN' as const, replacement: null });
    // Await completion cannot confer currentness: repeat the synchronous source checkpoint.
    if (JSON.stringify(record.capture()) !== record.fingerprint)
      return freeze({ status: 'STALE' as const, replacement: null });
    record.finalCheck();
    return freeze({
      status: 'CURRENT_LOCAL_SOURCE' as const,
      replacement: null,
    });
  } catch {
    return freeze({ status: 'UNKNOWN' as const, replacement: null });
  }
}
