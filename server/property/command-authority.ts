import { uuidPattern } from '../../src/domain/intake';
import { canonical } from './command-custody';
/** Unwired test-service claim request contract, not proof of Auth or SQLite custody. */
export const authoritySteps = [
  'execute',
  'reserve',
  'claim',
  'finish',
  'review_intent',
  'append_review',
] as const;
export type AuthorityStep = (typeof authoritySteps)[number];
export interface ClaimRequest {
  capability: string;
  step: AuthorityStep;
  args: unknown[];
  tx: { pid: number; backend_start: string; transaction_id: string };
}
export function validateClaimRequest(v: unknown): asserts v is ClaimRequest {
  const exact = (o: unknown, keys: string[]) =>
    !!o &&
    typeof o === 'object' &&
    !Array.isArray(o) &&
    Object.keys(o).sort().join(',') === keys.sort().join(',');
  if (!exact(v, ['capability', 'step', 'args', 'tx']))
    throw Error('Exact server claim request required.');
  const r = v as ClaimRequest;
  if (
    typeof r.capability !== 'string' ||
    !uuidPattern.test(r.capability) ||
    !authoritySteps.includes(r.step) ||
    !Array.isArray(r.args) ||
    !exact(r.tx, ['pid', 'backend_start', 'transaction_id']) ||
    !Number.isSafeInteger(r.tx.pid) ||
    r.tx.pid < 1 ||
    typeof r.tx.backend_start !== 'string' ||
    !Number.isFinite(Date.parse(r.tx.backend_start)) ||
    typeof r.tx.transaction_id !== 'string' ||
    !/^[1-9][0-9]{0,18}$/.test(r.tx.transaction_id) ||
    BigInt(r.tx.transaction_id) > 9223372036854775807n ||
    Buffer.byteLength(canonical(r), 'utf8') > 2097152
  )
    throw Error('Bounded exact server transaction/operation required.');
}
