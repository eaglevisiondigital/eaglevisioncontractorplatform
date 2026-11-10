import { createHash } from 'node:crypto';
import {
  customerRequestReference,
  customerRequestStatus,
  type CustomerRequestReference,
} from '../../../src/lib/customer-requests';
import type { CustomerConsumerTransaction } from '../request-gateway';
import { canonical } from '../../property/command-custody';
import { reportUuid } from '../../../src/domain/property/report-page';

/** OFFLINE protocol laboratory only. No SDK, transport, credentials or execution permit. */
export interface CustodyBinding {
  reference: CustomerRequestReference;
  principal: string;
  session_id: string;
  consumer: CustomerConsumerTransaction;
  target_sha256: string;
  epoch: number;
  revision: number;
}
export type Attribute = { S: string } | { N: string } | { BOOL: boolean };
export type Item = Record<string, Attribute>;
type Condition = {
  TableName: 'propel_disposable_custody';
  ConditionExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues?: Item;
};
export type WritePlan = {
  TransactItems: (
    | { ConditionCheck: Condition & { Key: Item } }
    | { Put: Condition & { Item: Item } }
  )[];
};
export type ReadPlan = {
  TransactItems: {
    Get: { TableName: 'propel_disposable_custody'; Key: Item };
  }[];
};
const table = 'propel_disposable_custody' as const;
const hash = (v: unknown) =>
  createHash('sha256').update(canonical(v)).digest('hex');
const positive = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
function exact(v: unknown, names: string[]) {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(v)) ||
    Object.keys(v).sort().join() !== names.sort().join()
  )
    throw Error('Exact custody identity required');
}
export function custodyBinding(input: CustodyBinding): CustodyBinding {
  const b = structuredClone(input);
  exact(b, [
    'reference',
    'principal',
    'session_id',
    'consumer',
    'target_sha256',
    'epoch',
    'revision',
  ]);
  b.reference = customerRequestReference(b.reference);
  if (b.reference.acknowledgment !== 'review-only-v2')
    throw Error('Original v2 claim required');
  const ids = [
    'organization_id',
    'customer_id',
    'location_id',
    'version_id',
    'publication_id',
    'request_id',
    'user_id',
  ] as const;
  if (
    ids.some((k) => b.reference[k] !== b.reference[k].toLowerCase()) ||
    ![b.principal, b.session_id].every(
      (v) => reportUuid(v) && v === v.toLowerCase(),
    ) ||
    typeof b.target_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(b.target_sha256) ||
    !positive(b.epoch) ||
    !positive(b.revision)
  )
    throw Error('Exact custody identity required');
  exact(b.consumer, ['pid', 'backend_start', 'transaction_id']);
  if (
    !positive(b.consumer.pid) ||
    b.consumer.pid > 2147483647 ||
    typeof b.consumer.backend_start !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(
      b.consumer.backend_start,
    ) ||
    !Number.isFinite(Date.parse(b.consumer.backend_start)) ||
    typeof b.consumer.transaction_id !== 'string' ||
    !/^[1-9]\d{0,19}$/.test(b.consumer.transaction_id) ||
    BigInt(b.consumer.transaction_id) > 9223372036854775807n
  )
    throw Error('Exact original consumer transaction required');
  return b;
}
const s = (v: string): Attribute => ({ S: v });
export function custodyKeys(input: CustodyBinding) {
  const b = custodyBinding(input),
    r = b.reference;
  return {
    fence: `fence#${r.organization_id}`,
    claim: `claim#${r.organization_id}#${r.request_id}`,
    // Original broker admission uniqueness is org/user/version, NOT publication or epoch.
    source: `source#${r.organization_id}#${r.user_id}#${r.version_id}`,
    ack: `ack#${r.organization_id}#${r.request_id}`,
  };
}
export function expectedFence(input: CustodyBinding): Item {
  const b = custodyBinding(input);
  return {
    pk: s(custodyKeys(b).fence),
    target: s(b.target_sha256),
    epoch: { N: String(b.epoch) },
    revision: { N: String(b.revision) },
    active: { BOOL: true },
  };
}
function check(item: Item) {
  const names: Record<string, string> = {},
    values: Item = {};
  const clauses = Object.keys(item)
    .sort()
    .map((k, i) => {
      names[`#k${i}`] = k;
      values[`:v${i}`] = item[k];
      return `#k${i} = :v${i}`;
    });
  return {
    ConditionCheck: {
      TableName: table,
      Key: { pk: item.pk },
      ConditionExpression: clauses.join(' AND '),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    },
  };
}
function put(item: Item) {
  return {
    Put: {
      TableName: table,
      Item: item,
      ConditionExpression: 'attribute_not_exists(#pk)',
      ExpressionAttributeNames: { '#pk': 'pk' },
    },
  };
}
function claimItems(input: CustodyBinding) {
  const b = custodyBinding(input),
    keys = custodyKeys(b),
    digest = s(hash(b));
  return {
    claim: { pk: s(keys.claim), digest },
    source: { pk: s(keys.source), digest },
  };
}
/** Single-region conditional marker transaction, no TTL or ClientRequestToken retry window. */
export function spendPlan(input: CustodyBinding): WritePlan {
  const b = custodyBinding(input),
    items = claimItems(b);
  return {
    TransactItems: [
      check(expectedFence(b)),
      put(items.claim),
      put(items.source),
    ],
  };
}
function receiptDigest(b: CustodyBinding, value: unknown) {
  const result = customerRequestStatus(value, b.reference);
  if (
    result.outcome !== 'confirmed' ||
    result.custody !== 'claimed-v2' ||
    !result.receipt
  )
    throw Error('Original confirmed claimed receipt required');
  return hash(result.receipt);
}
export function ackPlan(input: CustodyBinding, value: unknown): WritePlan {
  const b = custodyBinding(input),
    items = claimItems(b);
  return {
    TransactItems: [
      check(expectedFence(b)),
      check(items.claim),
      check(items.source),
      put({
        pk: s(custodyKeys(b).ack),
        digest: s(hash(b)),
        receipt: s(receiptDigest(b, value)),
      }),
    ],
  };
}
export function readPlan(input: CustodyBinding): ReadPlan {
  return {
    TransactItems: Object.values(custodyKeys(input)).map((pk) => ({
      Get: { TableName: table, Key: { pk: s(pk) } },
    })),
  };
}
function observations(b: CustodyBinding, rows: unknown[]) {
  if (!Array.isArray(rows) || rows.length !== 4)
    throw Error('Atomic custody snapshot required');
  const items = claimItems(b);
  if (
    canonical(rows[0]) !== canonical(expectedFence(b)) ||
    canonical(rows[1]) !== canonical(items.claim) ||
    canonical(rows[2]) !== canonical(items.source)
  )
    throw Error('Missing, stale or conflicting custody; quarantine writers');
  return rows[3];
}
export interface OfflineCustodyPort {
  write(plan: WritePlan): Promise<void>;
  read(plan: ReadPlan): Promise<unknown[]>;
}
/** No canonical writer callback. Every observation explicitly denies execution authority.
 * The supplied current() is a disposable fixture, NOT genuine Auth/session validation.
 * Before an external marker commits, UNKNOWN hold is INSTANCE ONLY. No durable
 * pre-dispatch hold/global quarantine is implemented; never bind this lab to a writer. */
export class OfflineCustodyAttempt {
  private attempted = false;
  private claimed = false;
  private ackAttempted = false;
  private stopped = false;
  private readonly binding: CustodyBinding;
  constructor(
    private readonly port: OfflineCustodyPort,
    binding: CustodyBinding,
    private readonly current: () => Promise<boolean>,
  ) {
    this.binding = custodyBinding(binding);
  }
  get quarantined() {
    return this.stopped;
  }
  private async guard() {
    if (!(await this.current()))
      throw Error('Current authorization unavailable');
  }
  private unknown(): never {
    this.stopped = true;
    throw Error(
      'Custody UNKNOWN; quarantine further writes; exact read-only reconciliation only',
    );
  }
  async spend() {
    if (this.attempted || this.stopped) return this.unknown();
    this.attempted = true; // Synchronous one-use admission before ANY await.
    try {
      await this.guard();
      await this.port.write(spendPlan(this.binding));
      if (
        observations(
          this.binding,
          await this.port.read(readPlan(this.binding)),
        ) !== null
      )
        throw Error('Unexpected prior ACK; contradictory custody');
      await this.guard();
      if (this.stopped) return this.unknown();
      this.claimed = true;
      return {
        outcome: 'CLAIM_RECORDED' as const,
        writes_allowed: false as const,
      };
    } catch {
      return this.unknown();
    }
  }
  async acknowledge(value: unknown) {
    if (!this.claimed || this.ackAttempted || this.stopped)
      return this.unknown();
    this.ackAttempted = true;
    try {
      const plan = ackPlan(this.binding, value);
      await this.guard();
      await this.port.write(plan);
      const rows = await this.port.read(readPlan(this.binding));
      const ack = observations(this.binding, rows);
      if (
        canonical(ack) !==
        canonical(
          plan.TransactItems[3] && 'Put' in plan.TransactItems[3]
            ? plan.TransactItems[3].Put.Item
            : null,
        )
      )
        throw Error('ACK mismatch');
      await this.guard();
      if (this.stopped) return this.unknown();
      return {
        outcome: 'ACK_RECORDED' as const,
        writes_allowed: false as const,
      };
    } catch {
      return this.unknown();
    }
  }
  /** Reads NEVER reset an attempted/quarantined command, even after an exact receipt match. */
  async reconcile(readOriginal: () => Promise<unknown>) {
    try {
      await this.guard();
      const value = await readOriginal(),
        digest = receiptDigest(this.binding, value);
      const ack = observations(
        this.binding,
        await this.port.read(readPlan(this.binding)),
      );
      const expected = {
        pk: s(custodyKeys(this.binding).ack),
        digest: s(hash(this.binding)),
        receipt: s(digest),
      };
      if (canonical(ack) !== canonical(expected)) return this.unknown();
      await this.guard();
      return {
        outcome: 'RECEIPT_MATCHED' as const,
        writes_allowed: false as const,
      };
    } catch {
      return this.unknown();
    }
  }
}
