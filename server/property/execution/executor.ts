import type { acceptanceJournal } from '../acceptance-journal.ts';
import {
  digest,
  isUuid,
  requireFrozen,
  resolveReferences,
  canonical,
  type FrozenP1,
  type P1Company,
} from './package.ts';
import type { P1Actors, RpcReply } from './callers.ts';
import type { CleanupResult } from './safety.ts';
export interface P1Control {
  ready(): Promise<void>;
  activate(): Promise<void>;
  check(): Promise<void>;
  close(): Promise<CleanupResult>;
  signal?: AbortSignal;
}
export interface P1Verification {
  /** Fresh target/history/catalog/ACL/Auth/713 row and actor/resource checks; throw on drift. */
  before(): Promise<void>;
  /** Independent original-row/provenance/financial checks, exact57 rows/114 audit events after cleanup. */
  after(
    receipts: ReadonlyMap<string, ReadonlyMap<string, { id: string } | string>>,
  ): Promise<void>;
}
export interface ExecutionResult {
  status: 'VERIFIED' | 'STOPPED';
  stoppedAt:
    | 'PREFLIGHT'
    | 'AUTH'
    | 'ACTIVATION'
    | 'RPC_OR_ASSERTION'
    | 'CLEANUP'
    | 'RECONCILIATION'
    | null;
  fixtureSteps: number;
  assertionProbes: number;
  cleanup: CleanupResult | null;
  financialAndOriginalRowsVerified: boolean;
  // Never promote cases based on RPC counts alone. Case-specific evidence remains reviewable.
  companyEvidence: {
    organization: string;
    fixtureIds: string[];
    probeIds: string[];
  }[];
}
const successful = (r: RpcReply) =>
  r.status >= 200 && r.status < 300 && !r.code;
function assertWorkspace(
  c: P1Company,
  probe: P1Company['probes'][number],
  value: unknown,
  now: number,
  receipts: ReadonlyMap<string, { id: string } | string>,
) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Projection object required');
  const v = value as Record<string, unknown>;
  if (!('success' in probe.expect))
    throw Error('Projection expectation absent');
  for (const k of probe.expect.forbiddenKeys ?? [])
    if (Object.hasOwn(v, k)) throw Error('Private projection leak');
  for (const k of probe.expect.requiredKeys ?? [])
    if (!Object.hasOwn(v, k)) throw Error('Missing authorized projection');
  const allowed =
    probe.id === 'owner-workspace'
      ? [
          'plans',
          'visits',
          'reports',
          'comparisons',
          'material_reviews',
          'supplemental_drafts',
        ]
      : probe.id === 'field-private-costs'
        ? ['plans', 'visits']
        : ['plans', 'visits', 'reports', 'comparisons'];
  if (canonical(Object.keys(v).sort()) !== canonical(allowed.sort()))
    throw Error('Unexpected workspace projection keys');
  for (const rows of Object.values(v))
    if (
      !Array.isArray(rows) ||
      rows.some(
        (x) =>
          !x ||
          typeof x !== 'object' ||
          x.organization_id !== c.organization_id,
      )
    )
      throw Error('Foreign workspace row');
  if (probe.id !== 'owner-workspace') return;
  for (const [k, n] of Object.entries(probe.expect.counts ?? {}))
    if (!Array.isArray(v[k]) || v[k].length !== n)
      throw Error('Workspace record count mismatch');
  const receipt = (step: string) => {
    const r = receipts.get(step);
    return typeof r === 'object' ? r.id : r;
  };
  for (const cadence of ['weekly', 'monthly']) {
    const planStep = c.steps.find((s) => s.id === cadence + '-plan')!;
    const expectedPlan = planStep.args.p as Record<string, unknown>;
    const stored = (v.plans as Record<string, unknown>[]).find(
      (x) => x.id === receipt(planStep.id),
    );
    if (!stored || stored.organization_id !== c.organization_id)
      throw Error('Plan tenant/receipt mismatch');
    for (const [k, x] of Object.entries(expectedPlan))
      if (canonical(stored[k]) !== canonical(x))
        throw Error('Plan recurrence/resource mismatch');
    for (let i = 0; i < 2; i++) {
      const prefix = cadence + '-' + i;
      const visit = (v.visits as Record<string, unknown>[]).find(
        (x) => x.id === receipt(prefix + '-visit'),
      );
      const input = c.steps.find((s) => s.id === prefix + '-save')!.args.p as {
        summary: string;
        checklist: { label: string; completed: boolean }[];
        findings: Record<string, unknown>[];
      };
      const expectedSnapshot = {
        summary: input.summary,
        visited_on: c.dates[cadence][i],
        phase: 'before',
        checklist: input.checklist.map((x) => ({
          label: x.label,
          completed: x.completed,
        })),
        findings: input.findings
          .filter((x) => x.customer_visible === true)
          .map((x) =>
            Object.fromEntries(
              [
                'id',
                'category',
                'location',
                'severity',
                'description',
                'recommendation',
              ].map((k) => [k, x[k]]),
            ),
          ),
        media: [],
      };
      const report = (v.reports as Record<string, unknown>[]).find(
        (x) => x.id === receipt(prefix + '-publish'),
      );
      if (
        !visit ||
        visit.organization_id !== c.organization_id ||
        visit.plan_id !== receipt(planStep.id) ||
        visit.visited_on !== c.dates[cadence][i] ||
        visit.status !== 'published' ||
        visit.lock_revision !== 4 ||
        canonical(visit.content) !== canonical(input) ||
        !report ||
        report.organization_id !== c.organization_id ||
        report.version !== 1 ||
        report.visit_id !== visit.id ||
        report.customer_id !== expectedPlan.customer_id ||
        report.location_id !== expectedPlan.location_id ||
        canonical(report.snapshot) !== canonical(expectedSnapshot)
      )
        throw Error('Immutable report/source/date/finding mismatch');
    }
  }
  const comparisons = v.comparisons as {
    snapshot: { quotes: Record<string, unknown>[] };
  }[];
  const expected = c.steps.find((s) => s.id === 'four-vendors')!.args.p as {
    quotes: unknown[];
  };
  if (canonical(comparisons[0]?.snapshot.quotes) !== canonical(expected.quotes))
    throw Error('Quote source snapshot changed');
  for (const [i, q] of comparisons[0].snapshot.quotes.entries()) {
    if (
      Date.parse(String(q.quoted_at)) > now ||
      Date.parse(String(q.expires_at)) <= now
    )
      throw Error('Quotation expired');
    const line = (
      q.lines as { pack_quantity_milli: number; pack_price_minor: number }[]
    )[0];
    const packs =
      (BigInt(c.requirements[0].quantity_milli) +
        BigInt(line.pack_quantity_milli) -
        1n) /
      BigInt(line.pack_quantity_milli);
    const goods = packs * BigInt(line.pack_price_minor);
    const total =
      q.shipping_minor === null
        ? null
        : Number(
            goods +
              (goods * BigInt(Number(q.tax_bps)) + 5000n) / 10000n +
              BigInt(Number(q.shipping_minor)) +
              BigInt(Number(q.pickup_minor)),
          );
    if (total !== c.comparison.vendors[i].total_minor)
      throw Error('Independent acquisition arithmetic mismatch');
  }
  const drafts = v.supplemental_drafts as {
    status: string;
    selling_minor: number;
  }[];
  if (
    drafts[0].status !== 'awaiting_customer_authorization' ||
    drafts[0].selling_minor !== c.expected.supplemental_selling_minor
  )
    throw Error('Supplemental draft became payable or changed price');
  const dispositions = (v.material_reviews as { disposition: string }[])
    .map((x) => x.disposition)
    .sort();
  if (
    canonical(dispositions) !==
    canonical(['absorbed', 'deferred', 'included', 'proposed'])
  )
    throw Error('Material decision mismatch');
  if (JSON.stringify(v.reports).includes('INTERNAL'))
    throw Error('Report private-note leak');
}
/** Library only. No automatic login, credential lookup, feature activation on import, or CLI execution path. */
export async function executeP1(options: {
  frozen: FrozenP1;
  actors: P1Actors;
  journal: ReturnType<typeof acceptanceJournal>;
  control: P1Control;
  verification: P1Verification;
  signal: AbortSignal;
  now?: () => number;
}): Promise<ExecutionResult> {
  const { frozen, actors, journal, control, verification } = options,
    now = options.now ?? Date.now;
  const signal = control.signal
    ? AbortSignal.any([options.signal, control.signal])
    : options.signal;
  requireFrozen(frozen);
  const result: ExecutionResult = {
    status: 'STOPPED',
    stoppedAt: 'PREFLIGHT',
    fixtureSteps: 0,
    assertionProbes: 0,
    cleanup: null,
    financialAndOriginalRowsVerified: false,
    companyEvidence: [],
  };
  let pending = false;
  const receipts = new Map<string, Map<string, { id: string } | string>>();
  const guard = async () => {
    if (signal.aborted) throw Error('Execution interrupted');
    await control.check();
  };
  try {
    // A frozen quote is not perpetually current. Never regenerate it or start
    // fixture writes when its reviewed validity no longer covers the window.
    for (const c of frozen.plan.companies) {
      const quote = c.steps.find((s) => s.id === 'four-vendors')!.args.p as {
        quotes: { quoted_at: string; expires_at: string }[];
      };
      if (
        quote.quotes.some(
          (q) =>
            !Number.isFinite(Date.parse(q.quoted_at)) ||
            !Number.isFinite(Date.parse(q.expires_at)) ||
            Date.parse(q.quoted_at) > now() ||
            Date.parse(q.expires_at) <= now() + 1800000,
        )
      )
        throw Error('Frozen quotation validity requires review');
    }
    await verification.before();
    result.stoppedAt = 'AUTH';
    await actors.verifyAll();
    await control.ready();
    if (signal.aborted) throw Error('Execution interrupted');
    // Atomic global reservation prevents two processes or a later process from replaying this package.
    journal.reserveRun();
    result.stoppedAt = 'ACTIVATION';
    await control.activate();
    result.stoppedAt = 'RPC_OR_ASSERTION';
    for (const c of frozen.plan.companies) {
      const ids = new Map<string, { id: string } | string>();
      receipts.set(c.organization_id, ids);
      const evidence = {
        organization: c.organization_id,
        fixtureIds: [] as string[],
        probeIds: [] as string[],
      };
      result.companyEvidence.push(evidence);
      const invoke = async (
        role: string,
        rpc: string,
        args: Record<string, unknown>,
        signedOut = false,
      ) => {
        await guard();
        const actor = actors.get(c.organization_id, role);
        if (!signedOut) await actor.verify();
        await guard(); // No stale success after identity/lock/network wait.
        const abort = AbortSignal.any([signal, AbortSignal.timeout(12000)]);
        return actor.rpc(rpc, args, abort);
      };
      const probe = async (p: P1Company['probes'][number]) => {
        const args = resolveReferences(p.args, ids) as Record<string, unknown>;
        if (p.actor === 'assigned-field-signed-out-same-jwt')
          await actors.get(c.organization_id, p.actor).signOut();
        const mutating = p.rpc !== 'property_workspace',
          key = 'probe-' + p.id;
        const hash = digest({ probe: p, resolvedArgs: args });
        if (mutating) {
          await guard();
          journal.begin(c.organization_id, key, hash);
          pending = true;
        }
        const reply = await invoke(
          p.actor,
          p.rpc,
          args,
          p.actor === 'assigned-field-signed-out-same-jwt',
        );
        if ('success' in p.expect) {
          if (!successful(reply)) throw Error('Authorized workspace failed');
          assertWorkspace(c, p, reply.data, now(), ids);
        } else {
          if (
            !reply.code ||
            ![400, 403, 409].includes(reply.status) ||
            !p.expect.codes.includes(reply.code)
          )
            throw Error('Expected SQL denial missing');
          if (mutating) {
            journal.denied(c.organization_id, key, hash, reply.code);
            pending = false;
          }
        }
        evidence.probeIds.push(p.id);
        result.assertionProbes++;
      };
      for (const step of c.steps) {
        await guard();
        const args = resolveReferences(step.args, ids) as Record<
          string,
          unknown
        >;
        const hash = digest({ stepSha256: digest(step), resolvedArgs: args });
        // Prechecking the actor before reserving avoids manufacturing UNKNOWN on an auth failure.
        await actors.get(c.organization_id, step.actor).verify();
        await guard();
        journal.begin(c.organization_id, step.id, hash);
        pending = true;
        const reply = await invoke(step.actor, step.rpc, args);
        if (!successful(reply))
          throw Error('Fixture response failed; no retry');
        const id =
          typeof reply.data === 'string'
            ? reply.data
            : (reply.data as { id?: unknown })?.id;
        if (!isUuid(id)) throw Error('Fixture UUID receipt missing; UNKNOWN');
        journal.complete(c.organization_id, step.id, hash, id);
        pending = false;
        ids.set(step.id, typeof reply.data === 'string' ? id : { id });
        evidence.fixtureIds.push(step.id);
        result.fixtureSteps++;
        for (const p of c.probes.filter((p) => p.after === step.id))
          await probe(p);
      }
      for (const p of c.probes.filter((p) => p.after === 'all-positive-steps'))
        await probe(p);
    }
    if (result.fixtureSteps !== 75 || result.assertionProbes !== 69)
      throw Error('Execution budget mismatch');
  } catch {
    // Only sanitized counts/receipts escape; raw provider/SQL exceptions can carry sensitive data.
    result.status = 'STOPPED';
  } finally {
    try {
      result.cleanup = await control.close();
    } catch {
      /* Independent containment remains required. */
    }
  }
  if (result.cleanup?.status !== 'VERIFIED') result.stoppedAt = 'CLEANUP';
  if (
    !pending &&
    result.fixtureSteps === 75 &&
    result.assertionProbes === 69 &&
    result.cleanup?.status === 'VERIFIED'
  ) {
    try {
      result.stoppedAt = 'RECONCILIATION';
      await verification.after(receipts);
      result.financialAndOriginalRowsVerified = true;
      result.status = 'VERIFIED';
      result.stoppedAt = null;
    } catch {
      /* Never promote a failed reconciliation. */
    }
  }
  return result;
}
