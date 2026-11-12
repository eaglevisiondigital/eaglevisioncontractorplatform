import type { GatewaySql } from '../payments/postgres-store';

// Unwired source proposal. The supplied connection must independently enforce the
// reviewed SQL authority; these caller expectations never authenticate an actor.
export interface DraftIdentity {
  invoiceId: string;
  customerId: string;
  locationId: string | null;
  sourceVersionId: string;
}
export interface DraftWrite extends DraftIdentity {
  commandId: string;
  expectedRevision: number;
  title: string;
  memo: string;
}
export interface CommercialDraft extends DraftIdentity {
  organizationId: string;
  revision: number;
  title: string;
  memo: string;
  currency: string;
  amountMinor: number;
  sourceHash: string;
  sourceCurrent: boolean;
  state: 'draft';
  receipt: {
    id: string;
    invoiceId: string;
    organizationId: string;
    customerId: string;
    sourceVersionId: string;
    commandId: string;
    revision: number;
    requestHash: string;
    actorId: string;
  };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (value: unknown): value is string =>
  typeof value === 'string' && uuid.test(value);
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
function keys(v: Record<string, unknown>, expected: string[]) {
  return (
    Object.keys(v).length === expected.length &&
    Object.keys(v).every((key) => expected.includes(key))
  );
}
function identity(v: DraftIdentity) {
  if (
    ![v.invoiceId, v.customerId, v.sourceVersionId].every(isId) ||
    (v.locationId !== null && !isId(v.locationId))
  )
    throw Error('Exact invoice draft identity required');
}
export class CommercialDraftUnknownError extends Error {
  constructor() {
    super(
      'Invoice draft outcome UNKNOWN; exact receipt read required. Do not retry.',
    );
  }
}
/** No credentials, route, connection factory, retries or production activation.
 * Session-local holds are convenience safeguards, NOT independent durable custody.
 * Holds do not survive process loss; independent custody remains UNVERIFIED.
 */
export class CommercialDraftClient {
  private readonly attempted = new Set<string>();
  private readonly uncertain = new Map<string, DraftWrite>();
  constructor(
    private readonly sql: GatewaySql,
    private readonly organizationId: string,
  ) {
    if (!isId(organizationId)) throw Error('Exact organization required');
  }
  private decode(value: unknown, expected: DraftIdentity): CommercialDraft {
    if (
      !record(value) ||
      !keys(value, [
        'invoiceId',
        'organizationId',
        'customerId',
        'locationId',
        'sourceVersionId',
        'revision',
        'title',
        'memo',
        'currency',
        'amountMinor',
        'sourceHash',
        'sourceCurrent',
        'state',
        'receipt',
      ]) ||
      value.organizationId !== this.organizationId ||
      value.invoiceId !== expected.invoiceId ||
      value.customerId !== expected.customerId ||
      value.locationId !== expected.locationId ||
      value.sourceVersionId !== expected.sourceVersionId ||
      value.state !== 'draft' ||
      typeof value.revision !== 'number' ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 1 ||
      typeof value.title !== 'string' ||
      value.title.trim().length < 1 ||
      value.title.length > 200 ||
      typeof value.memo !== 'string' ||
      value.memo.length > 2000 ||
      value.currency !== 'USD' ||
      typeof value.amountMinor !== 'number' ||
      !Number.isSafeInteger(value.amountMinor) ||
      value.amountMinor < 0 ||
      value.amountMinor > 9_000_000_000_000 ||
      typeof value.sourceHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.sourceHash) ||
      typeof value.sourceCurrent !== 'boolean' ||
      !record(value.receipt) ||
      !keys(value.receipt, [
        'id',
        'invoiceId',
        'organizationId',
        'customerId',
        'sourceVersionId',
        'commandId',
        'revision',
        'requestHash',
        'actorId',
      ]) ||
      typeof value.receipt.id !== 'string' ||
      !uuid.test(value.receipt.id) ||
      value.receipt.invoiceId !== expected.invoiceId ||
      value.receipt.organizationId !== this.organizationId ||
      value.receipt.customerId !== expected.customerId ||
      value.receipt.sourceVersionId !== expected.sourceVersionId ||
      typeof value.receipt.commandId !== 'string' ||
      !uuid.test(value.receipt.commandId) ||
      value.receipt.id !== value.receipt.commandId ||
      value.receipt.revision !== value.revision ||
      typeof value.receipt.requestHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.receipt.requestHash) ||
      typeof value.receipt.actorId !== 'string' ||
      !uuid.test(value.receipt.actorId)
    )
      throw new CommercialDraftUnknownError();
    return structuredClone(value) as unknown as CommercialDraft;
  }
  private async write(action: 'create' | 'save', input: DraftWrite) {
    const v = Object.freeze({ ...input });
    identity(v);
    if (
      !isId(v.commandId) ||
      !Number.isSafeInteger(v.expectedRevision) ||
      (action === 'create'
        ? v.expectedRevision !== 0
        : v.expectedRevision < 1) ||
      typeof v.title !== 'string' ||
      !v.title.trim() ||
      v.title.length > 200 ||
      typeof v.memo !== 'string' ||
      v.memo.length > 2000
    )
      throw Error('Valid draft command required');
    if (
      this.attempted.has(v.commandId) ||
      this.uncertain.has(v.invoiceId) ||
      [...this.uncertain.values()].some(
        (held) => held.sourceVersionId === v.sourceVersionId,
      )
    )
      throw new CommercialDraftUnknownError();
    // Reserve before any await. Even a thrown query may have committed remotely.
    this.attempted.add(v.commandId);
    this.uncertain.set(v.invoiceId, v);
    try {
      const r = await this.sql.query<{ result: unknown }>(
        action === 'create'
          ? 'select private.commercial_invoice_draft_create($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::text,$8::text) result'
          : 'select private.commercial_invoice_draft_save($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::uuid,$6::uuid,$7::uuid,$8::text,$9::text) result',
        action === 'create'
          ? [
              this.organizationId,
              v.invoiceId,
              v.commandId,
              v.customerId,
              v.locationId,
              v.sourceVersionId,
              v.title,
              v.memo,
            ]
          : [
              this.organizationId,
              v.invoiceId,
              v.commandId,
              v.expectedRevision,
              v.customerId,
              v.locationId,
              v.sourceVersionId,
              v.title,
              v.memo,
            ],
      );
      if (r.rows.length !== 1) throw new CommercialDraftUnknownError();
      const draft = this.decode(r.rows[0].result, v);
      if (
        !draft.sourceCurrent ||
        draft.receipt.commandId !== v.commandId ||
        draft.revision !== v.expectedRevision + 1 ||
        draft.title !== v.title ||
        draft.memo !== v.memo
      )
        throw new CommercialDraftUnknownError();
      this.uncertain.delete(v.invoiceId);
      return draft;
    } catch {
      throw new CommercialDraftUnknownError();
    }
  }
  create(input: DraftWrite) {
    return this.write('create', input);
  }
  save(input: DraftWrite) {
    return this.write('save', input);
  }
  async read(input: DraftIdentity, commandId: string | null = null) {
    const v = Object.freeze({ ...input });
    identity(v);
    if (commandId !== null && !isId(commandId))
      throw Error('Exact command required');
    const original = this.uncertain.get(v.invoiceId);
    if (
      original &&
      (original.customerId !== v.customerId ||
        original.locationId !== v.locationId ||
        original.sourceVersionId !== v.sourceVersionId)
    )
      throw new CommercialDraftUnknownError();
    try {
      const r = await this.sql.query<{ result: unknown }>(
        'select private.commercial_invoice_draft_read($1::uuid,$2::uuid,$3::uuid) result',
        [this.organizationId, v.invoiceId, commandId],
      );
      if (r.rows.length !== 1) throw new CommercialDraftUnknownError();
      const draft = this.decode(r.rows[0].result, v);
      if (commandId !== null && draft.receipt.commandId !== commandId)
        throw new CommercialDraftUnknownError();
      const held = this.uncertain.get(v.invoiceId);
      if (
        held &&
        commandId === held.commandId &&
        draft.revision === held.expectedRevision + 1 &&
        draft.title === held.title &&
        draft.memo === held.memo
      )
        this.uncertain.delete(v.invoiceId);
      return draft;
    } catch {
      throw new CommercialDraftUnknownError();
    }
  }
}
