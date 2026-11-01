import { calculateEstimate } from '../../src/domain/estimating/calculation';
import type { TestDatabase } from '../database/engine';
import {
  validateRepairReservation,
  type RepairPersistence,
  type RepairReservationRequest,
  type ReadinessAppendCommand,
} from '../../server/property/repair-persistence';
import {
  recordRepairReadiness,
  evaluateRepairReadiness,
  type RepairReadinessContext,
  type RepairReadinessReview,
} from '../../src/domain/property/repair-readiness';
import type {
  EstimateInput,
  EstimateBundle,
} from '../../src/domain/estimating/types';

export interface NativeReadinessState {
  context: RepairReadinessContext;
  history: RepairReadinessReview[];
  actor: string;
}
/** JSONB object ordering has no evidentiary meaning. Preserve arrays and snapshot strings. */
function ordered<T>(value: T): T {
  if (Array.isArray(value)) return value.map(ordered) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, ordered(v)]),
    ) as T;
  return value;
}
function engineState(state: NativeReadinessState) {
  if (state.history.length > 1000)
    throw Error('Bounded readiness history required.');
  const version = state.context.bundle.version;
  const calculated = calculateEstimate(
    version.payload,
    version.tax_policy_snapshot?.rate_bps ?? 0,
  );
  // Never replace discrepant retained calculations merely to make review pass.
  if (
    JSON.stringify(ordered(calculated)) !==
    JSON.stringify(ordered(version.calculation))
  )
    throw Error('Retained calculation integrity mismatch.');
  version.calculation = calculated;
  state.history = state.history.map((r) => ({
    ...r,
    request: ordered(r.request),
  }));
  return state;
}
/** Trusted TEST service. Uses the disposable harness owner, never a client SQL grant.
 * Caller claims are test-fixture assertions, NOT authenticated JWT/HTTP acceptance.
 * No app import, URL, credentials, provider, operational endpoint or retry loop.
 */
export class NativeRepairService implements RepairPersistence {
  constructor(private readonly db: TestDatabase) {}
  private async call<T>(
    name:
      | 'reserve'
      | 'claim'
      | 'finish'
      | 'reconcile'
      | 'readiness_context'
      | 'append_review'
      | 'review_intent'
      | 'save_draft',
    args: unknown[],
  ) {
    const found = (
      await this.db.query<{ name: string; version: number }>(
        "select current_database() name,current_setting('server_version_num')::integer version",
      )
    ).rows[0];
    if (
      !/^ev_test_[a-f0-9]{32}$/.test(found.name) ||
      Math.floor(found.version / 10000) !== 17
    )
      throw Error('Disposable native repair fixture required.');
    const params = args.map(
      (_, i) =>
        `$${i + 1}${name === 'save_draft' && i === 1 ? '::integer' : '::jsonb'}`,
    );
    return (
      await this.db.query<{ value: T }>(
        `select maintenance_2b_test.${name}(${params.join(',')}) value`,
        args.map((a) => JSON.stringify(a)),
      )
    ).rows[0].value;
  }
  private async transaction<T>(work: () => Promise<T>) {
    await this.db.exec('begin');
    try {
      const result = await work();
      await this.db.exec('commit');
      return result;
    } catch (error) {
      await this.db.exec('rollback');
      throw error;
    }
  }
  async reserve(request: RepairReservationRequest) {
    validateRepairReservation(request);
    const copy = structuredClone(request);
    return this.transaction(() => this.call('reserve', [copy]));
  }
  async prepareOnce(request: RepairReservationRequest) {
    validateRepairReservation(request);
    const copy = structuredClone(request);
    // Commit the one-shot claim BEFORE the asynchronous target operation. A crash/failure
    // thereafter leaves attempting/UNKNOWN. No error handler clears it or repeats finish.
    await this.transaction(() => this.call('claim', [copy]));
    return this.transaction(() => this.call('finish', [copy]));
  }
  async reconcile(request: RepairReservationRequest) {
    validateRepairReservation(request);
    return this.transaction(() =>
      this.call<{ status: 'committed' | 'undetermined'; receipt?: unknown }>(
        'reconcile',
        [structuredClone(request)],
      ),
    );
  }
  async read(request: RepairReservationRequest) {
    validateRepairReservation(request);
    return engineState(
      await this.transaction(() =>
        this.call<NativeReadinessState>('readiness_context', [
          structuredClone(request),
        ]),
      ),
    );
  }
  async appendReadiness(command: ReadinessAppendCommand) {
    if (
      !command ||
      Object.keys(command).sort().join(',') !== 'reservation,review'
    )
      throw Error('Exact readiness append contract required.');
    validateRepairReservation(command.reservation);
    const copy = structuredClone(command);
    // Validate/retain intent before asynchronous append. A prior intent without a receipt
    // is an UNKNOWN hold. Exact committed duplicates are reads, never another append.
    const retained = await this.transaction(async () => {
      const state = engineState(
        await this.call<NativeReadinessState>('readiness_context', [
          copy.reservation,
        ]),
      );
      if (
        Buffer.byteLength(copy.review.snapshot, 'utf8') > 1048576 ||
        state.history.length >= 1000
      )
        throw Error('Bounded readiness evidence required.');
      const request = ordered(copy.review);
      recordRepairReadiness(state.context, state.history, state.actor, request);
      return this.call<{
        status: 'claimed' | 'committed';
        review?: RepairReadinessReview;
      }>('review_intent', [copy.reservation, request]);
    });
    if (retained.status === 'committed') return retained.review!;
    return this.transaction(async () => {
      const state = engineState(
        await this.call<NativeReadinessState>('readiness_context', [
          copy.reservation,
        ]),
      );
      const { review } = recordRepairReadiness(
        state.context,
        state.history,
        state.actor,
        ordered(copy.review),
      );
      return this.call<RepairReadinessReview>('append_review', [
        copy.reservation,
        state,
        review,
      ]);
    });
  }
  async reconcileReadiness(command: ReadinessAppendCommand) {
    const state = await this.read(command.reservation);
    const old = state.history.find(
      (r) => r.request.request_id === command.review.request_id,
    );
    if (!old) return { status: 'undetermined' as const };
    if (
      old.actor !== state.actor ||
      JSON.stringify(ordered(old.request)) !==
        JSON.stringify(ordered(command.review))
    )
      throw Error('Exact review request/actor required.');
    return { status: 'committed' as const, review: old };
  }

  save(
    request: RepairReservationRequest,
    revision: number,
    payload: EstimateInput,
  ) {
    validateRepairReservation(request);
    return this.transaction(() =>
      this.call<EstimateBundle>('save_draft', [
        structuredClone(request),
        revision,
        structuredClone(payload),
      ]),
    );
  }
  async readiness(request: RepairReservationRequest) {
    const state = await this.read(request);
    return evaluateRepairReadiness(state.context, state.history);
  }
}
