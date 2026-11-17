import { createHash } from 'node:crypto';
import { isProxy } from 'node:util/types';
export interface ReaderScope {
  login: string;
  owner: string;
  userId: string;
  sessionId: string;
  organizationId: string;
  customerId: string;
  locationId: string;
  invoiceId: string;
  sourceVersionId: string;
  sourceHash: string;
  revision: number;
  issuanceReceiptId: string;
  reviewId: string;
  expiresAt: number;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function readerScope(value: ReaderScope): Readonly<ReaderScope> {
  if (
    !value ||
    isProxy(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw Error('Exact private scope required');
  const keys = [
    'login',
    'owner',
    'userId',
    'sessionId',
    'organizationId',
    'customerId',
    'locationId',
    'invoiceId',
    'sourceVersionId',
    'sourceHash',
    'revision',
    'issuanceReceiptId',
    'reviewId',
    'expiresAt',
  ];
  const d = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(d).length !== keys.length ||
    keys.some((k) => !d[k] || !('value' in d[k]))
  )
    throw Error('Exact private scope required');
  const b = Object.fromEntries(
    keys.map((k) => [k, d[k].value]),
  ) as unknown as ReaderScope;
  for (const k of [
    'userId',
    'sessionId',
    'organizationId',
    'customerId',
    'locationId',
    'invoiceId',
    'sourceVersionId',
    'issuanceReceiptId',
    'reviewId',
  ] as const)
    if (
      typeof b[k] !== 'string' ||
      !uuid.test(b[k]) ||
      b[k] === '00000000-0000-0000-0000-000000000000'
    )
      throw Error('Exact private scope required');
  for (const k of ['login', 'owner'] as const)
    if (
      typeof b[k] !== 'string' ||
      !/^[a-z][a-z0-9_]{0,62}$/.test(b[k]) ||
      b[k].startsWith('pg_') ||
      [
        'public',
        'postgres',
        'ev_test',
        'anon',
        'authenticated',
        'service_role',
        'authenticator',
        'supabase_admin',
      ].includes(b[k])
    )
      throw Error('Restricted principal required');
  if (
    b.login === b.owner ||
    !Number.isSafeInteger(b.revision) ||
    b.revision < 1 ||
    !Number.isSafeInteger(b.expiresAt) ||
    b.expiresAt <= 0 ||
    typeof b.sourceHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(b.sourceHash)
  )
    throw Error('Exact private scope required');
  return Object.freeze(b);
}
/** Renderer returns SQL DATA only; no connection, file output or installer. */
export function renderReaderSQL(
  template: string,
  grants: string,
  input: ReaderScope,
) {
  if (
    createHash('sha256').update(template).digest('hex') !==
      '303741983f5f72ee0fefabbf71d7dd57b0e5bf1b0f265ab389d5fbeb318afe93' ||
    createHash('sha256').update(grants).digest('hex') !==
      'abbca46667c9d9b44839395428f15d9d336e244fe0bd7a5c42217cf8aeb850c5'
  )
    throw Error('Exact reviewed SQL templates required');
  const b = readerScope(input);
  const values: Record<string, string> = {
    LOGIN: b.login,
    OWNER: b.owner,
    USER: b.userId,
    SESSION: b.sessionId,
    ORG: b.organizationId,
    CUSTOMER: b.customerId,
    LOCATION: b.locationId,
    INVOICE: b.invoiceId,
    VERSION: b.sourceVersionId,
    HASH: b.sourceHash,
    REVISION: String(b.revision),
    ISSUE: b.issuanceReceiptId,
    REVIEW: b.reviewId,
    UNTIL: String(b.expiresAt),
  };
  const replace = (s: string) =>
    s.replace(/__([A-Z]+)__/g, (_, k: string) => {
      if (!Object.hasOwn(values, k)) throw Error('Unknown binding');
      return values[k];
    });
  const sql = replace(template),
    runtimeGrants = replace(grants);
  if (/__[A-Z]+__/.test(sql + runtimeGrants)) throw Error('Incomplete binding');
  const hash = (s: string) => createHash('sha256').update(s).digest('hex');
  const body = (tag: string) => {
    const p = sql.split('$' + tag + '$');
    if (p.length !== 3) throw Error('Exact template required');
    return hash(p[1]);
  };
  return Object.freeze({
    sql,
    runtimeGrants,
    bodyHashes: Object.freeze({
      commercial_customer_invoice_authorize: body('authorize'),
      commercial_customer_invoice_read_issued: body('issued'),
    }),
  });
}
