import { it, expect, afterEach, vi } from 'vitest';
import {
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { executionPackage } from './helpers/p1-execution';
import { p1Now } from './helpers/property-p1-fixture';
import { acceptanceJournal } from '../server/property/acceptance-journal';
import { executeP1 } from '../server/property/execution/executor';
import {
  loadP1Package,
  resolveReferences,
  digest,
} from '../server/property/execution/package';
import { inspectP1Recovery } from '../server/property/execution/recovery';
import type { P1Actors, RpcReply } from '../server/property/execution/callers';
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function setup() {
  const pkg = executionPackage();
  dirs.push(pkg.root);
  const journal = acceptanceJournal(join(pkg.root, 'journal'), pkg.hash);
  const control = {
    ready: vi.fn(async () => {}),
    activate: vi.fn(async () => {}),
    check: vi.fn(async () => {}),
    close: vi.fn(async () => ({
      status: 'VERIFIED' as const,
      deactivation: 'CONFIRMED' as const,
      sessions: 'CONFIRMED' as const,
      observation: null,
    })),
  };
  const verification = {
    before: vi.fn(async () => {}),
    after: vi.fn(async () => {}),
  };
  const queue: {
    org: string;
    role: string;
    rpc: string;
    args: unknown;
    reply: RpcReply;
  }[] = [];
  for (const c of pkg.plan.companies) {
    const ids = new Map(
      c.steps.map((s) => [
        s.id,
        s.rpc === 'property_command'
          ? { id: crypto.randomUUID() }
          : crypto.randomUUID(),
      ]),
    );
    const receipt = (key: string) => {
      const r = ids.get(key);
      return typeof r === 'object' ? r.id : r;
    };
    const plans = ['weekly', 'monthly'].map((cadence) => ({
      id: receipt(cadence + '-plan'),
      organization_id: c.organization_id,
      ...(c.steps.find((s) => s.id === cadence + '-plan')!.args.p as object),
    }));
    const visits = ['weekly', 'monthly'].flatMap((cadence) =>
      [0, 1].map((i) => ({
        id: receipt(cadence + '-' + i + '-visit'),
        organization_id: c.organization_id,
        plan_id: receipt(cadence + '-plan'),
        visited_on: c.dates[cadence][i],
        status: 'published',
        lock_revision: 4,
        content: c.steps.find((s) => s.id === cadence + '-' + i + '-save')!.args
          .p,
      })),
    );
    const reports = ['weekly', 'monthly'].flatMap((cadence) =>
      [0, 1].map((i) => {
        const input = c.steps.find((s) => s.id === cadence + '-' + i + '-save')!
          .args.p as {
          summary: string;
          checklist: { label: string; completed: boolean }[];
          findings: Record<string, unknown>[];
        };
        const binding = plans.find(
          (x) => x.id === receipt(cadence + '-plan'),
        ) as unknown as { customer_id: string; location_id: string };
        return {
          id: receipt(cadence + '-' + i + '-publish'),
          organization_id: c.organization_id,
          version: 1,
          visit_id: receipt(cadence + '-' + i + '-visit'),
          customer_id: binding.customer_id,
          location_id: binding.location_id,
          snapshot: {
            summary: input.summary,
            visited_on: c.dates[cadence][i],
            phase: 'before',
            checklist: input.checklist.map((x) => ({
              label: x.label,
              completed: x.completed,
            })),
            findings: input.findings
              .filter((x) => x.customer_visible)
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
          },
        };
      }),
    );
    const probe = (p: (typeof c.probes)[number]) => {
      const projection =
        p.id === 'owner-workspace'
          ? {
              plans,
              visits,
              reports,
              comparisons: [
                {
                  organization_id: c.organization_id,
                  snapshot: c.steps.find((s) => s.id === 'four-vendors')!.args
                    .p,
                },
              ],
              material_reviews: [
                'absorbed',
                'included',
                'deferred',
                'proposed',
              ].map((disposition) => ({
                disposition,
                organization_id: c.organization_id,
              })),
              supplemental_drafts: [
                {
                  organization_id: c.organization_id,
                  status: 'awaiting_customer_authorization',
                  selling_minor: c.expected.supplemental_selling_minor,
                },
              ],
            }
          : p.id === 'field-private-costs'
            ? { plans, visits }
            : {
                plans,
                visits,
                reports,
                comparisons: [
                  {
                    organization_id: c.organization_id,
                    snapshot: c.steps.find((s) => s.id === 'four-vendors')!.args
                      .p,
                  },
                ],
              };
      queue.push({
        org: c.organization_id,
        role: p.actor,
        rpc: p.rpc,
        args: resolveReferences(p.args, ids),
        reply:
          'success' in p.expect
            ? { status: 200, code: null, data: projection }
            : {
                status: p.expect.codes[0] === '23505' ? 409 : 403,
                code: p.expect.codes[0],
                data: null,
              },
      });
    };
    for (const s of c.steps) {
      queue.push({
        org: c.organization_id,
        role: s.actor,
        rpc: s.rpc,
        args: resolveReferences(s.args, ids),
        reply: { status: 200, code: null, data: ids.get(s.id) },
      });
      for (const p of c.probes.filter((p) => p.after === s.id)) probe(p);
    }
    for (const p of c.probes.filter((p) => p.after === 'all-positive-steps'))
      probe(p);
  }
  let calls = 0;
  const signouts: string[] = [];
  const actors: P1Actors = {
    verifyAll: vi.fn(async () => {}),
    get: (org, role) => ({
      verify: async () => ({
        userId: crypto.randomUUID(),
        aal: role === 'owner' ? 'aal2' : 'aal1',
        sessionId: crypto.randomUUID(),
      }),
      signOut: async () => {
        signouts.push(org + ':' + role);
      },
      rpc: async (name, args) => {
        const q = queue[calls++];
        expect({ org, role, name, args }).toEqual({
          org: q.org,
          role: q.role,
          name: q.rpc,
          args: q.args,
        });
        return q.reply;
      },
    }),
  };
  const options = {
    frozen: pkg.frozen,
    actors,
    journal,
    control,
    verification,
    signal: new AbortController().signal,
    now: () => p1Now,
  };
  return {
    ...pkg,
    journal,
    queue,
    control,
    verification,
    options,
    signouts,
    calls: () => calls,
  };
}
it('executes only75 exact fixture calls and69 interleaved probes with scoped references and durable receipts', async () => {
  const s = setup(),
    r = await executeP1(s.options);
  expect(r.status).toBe('VERIFIED');
  expect([r.fixtureSteps, r.assertionProbes, s.calls()]).toEqual([75, 69, 144]);
  expect(s.signouts).toHaveLength(3);
  expect(s.control.activate).toHaveBeenCalledTimes(1);
  expect(s.control.close).toHaveBeenCalledTimes(1);
  expect(s.verification.after).toHaveBeenCalledTimes(1);
  const states = inspectP1Recovery(s.frozen, s.journal);
  expect(states.filter((x) => x.state === 'RECORDED')).toHaveLength(75);
  expect(states.filter((x) => x.state === 'DENIED')).toHaveLength(54);
  for (const file of readdirSync(join(s.root, 'journal')))
    expect(readFileSync(join(s.root, 'journal', file), 'utf8')).not.toMatch(
      /password|access_token|refresh_token|Bearer|totp/,
    );
});
it('durable run reservation rejects a second executor, including a new journal instance after restart', async () => {
  const s = setup();
  expect((await executeP1(s.options)).status).toBe('VERIFIED');
  const r = await executeP1({
    ...s.options,
    journal: acceptanceJournal(join(s.root, 'journal'), s.hash),
  });
  expect(r.status).toBe('STOPPED');
  expect(s.control.activate).toHaveBeenCalledTimes(1);
  expect(s.calls()).toBe(144);
});
it.each([
  'transport',
  'missing receipt',
  'bad permission',
  'projection leak',
  'wrong price',
])(
  'stops on %s, performs containment, and never silently retries',
  async (mode) => {
    const s = setup();
    if (mode === 'transport')
      s.options.actors.get = () => ({
        verify: async () => ({
          userId: crypto.randomUUID(),
          aal: 'aal2',
          sessionId: crypto.randomUUID(),
        }),
        rpc: async () => {
          throw Error('Timeout after commit');
        },
        signOut: async () => {},
      });
    if (mode === 'missing receipt')
      s.queue[0].reply = { data: {}, code: null, status: 200 };
    if (mode === 'bad permission') {
      const q = s.queue.find((q) => q.reply.code)!;
      q.reply = { data: null, code: q.reply.code, status: 503 };
    }
    if (mode === 'projection leak') {
      const q = s.queue.find(
        (q) =>
          q.role === 'assigned-field' &&
          q.rpc === 'property_workspace' &&
          !q.reply.code,
      )!;
      q.reply.data = { payroll: 'sensitive' };
    }
    if (mode === 'wrong price') {
      const q = s.queue.find(
        (q) => q.role === 'owner' && q.rpc === 'property_workspace',
      )!;
      (q.reply.data as { supplemental_drafts: { selling_minor: number }[] })
        .supplemental_drafts[0].selling_minor++;
    }
    const r = await executeP1(s.options);
    expect(r.status).toBe('STOPPED');
    expect(s.control.close).toHaveBeenCalledTimes(1);
    expect(s.verification.after).not.toHaveBeenCalled();
    expect(s.calls()).toBeLessThan(144);
    if (['transport', 'missing receipt'].includes(mode))
      expect(inspectP1Recovery(s.frozen, s.journal)[0].state).toBe('UNKNOWN');
  },
);
it('failed preflight and interrupted supervision cannot activate or create fixtures', async () => {
  const s = setup();
  s.verification.before.mockRejectedValueOnce(
    Error('Original composite key drift'),
  );
  expect((await executeP1(s.options)).status).toBe('STOPPED');
  expect(s.control.activate).not.toHaveBeenCalled();
  expect(s.calls()).toBe(0);
  const abort = new AbortController();
  abort.abort();
  expect((await executeP1({ ...s.options, signal: abort.signal })).status).toBe(
    'STOPPED',
  );
  expect(s.control.activate).not.toHaveBeenCalled();
});
it('independent reconciliation or cleanup failure cannot become successful acceptance', async () => {
  const s = setup();
  s.verification.after.mockRejectedValueOnce(
    Error('Unauthorized receivable delta'),
  );
  expect((await executeP1(s.options)).status).toBe('STOPPED');
  const t = setup();
  t.control.close.mockResolvedValueOnce({
    status: 'CONTAINMENT_REQUIRED',
    deactivation: 'UNKNOWN',
    sessions: 'CONFIRMED',
    observation: null,
  } as never);
  expect((await executeP1(t.options)).status).toBe('STOPPED');
  expect(t.verification.after).not.toHaveBeenCalled();
});
it('package mutation, target substitution and unresolved foreign result paths fail closed', () => {
  const s = setup();
  expect(() => loadP1Package(s.root, 'b'.repeat(20), s.hash)).toThrow();
  writeFileSync(join(s.root, 'p1-plan.private.json'), '{}');
  expect(() => loadP1Package(s.root, 'a'.repeat(20), s.hash)).toThrow('hash');
  expect(() =>
    resolveReferences({ result: 'other-company-step', field: 'id' }, new Map()),
  ).toThrow();
  expect(() =>
    resolveReferences({ result: 'step', field: 'nested.token' }, new Map()),
  ).toThrow();
  expect(digest({ a: 1, b: 2 })).toBe(digest({ b: 2, a: 1 }));
});
it('journal rejects unsafe directories and corrupt receipts rather than recovering by replay', () => {
  const s = setup(),
    bad = join(s.root, 'open');
  mkdirSync(bad, { mode: 0o755 });
  expect(() => acceptanceJournal(bad, s.hash)).toThrow();
  const org = s.plan.companies[0].organization_id;
  s.journal.begin(org, 'x', 'a'.repeat(64));
  writeFileSync(join(s.root, 'journal', org + '-x.result.json'), '{');
  expect(() => s.journal.read(org, 'x')).toThrow();
});
it('interrupts an in-flight write without assuming database rollback or retrying it', async () => {
  const s = setup(),
    abort = new AbortController();
  s.options.actors.get = () => ({
    verify: async () => ({
      userId: crypto.randomUUID(),
      aal: 'aal2',
      sessionId: crypto.randomUUID(),
    }),
    signOut: async () => {},
    rpc: async (_name, _args, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(Error('Uncertain write')),
          { once: true },
        );
        setTimeout(() => abort.abort(), 10);
      }),
  });
  const result = await executeP1({ ...s.options, signal: abort.signal });
  expect(result.status).toBe('STOPPED');
  expect(result.stoppedAt).toBe('RPC_OR_ASSERTION');
  expect(inspectP1Recovery(s.frozen, s.journal)[0].state).toBe('UNKNOWN');
  expect(s.control.close).toHaveBeenCalledTimes(1);
});
it('does not activate an old frozen package after its reviewed quotation window expires', async () => {
  const s = setup();
  const r = await executeP1({
    ...s.options,
    now: () => Date.UTC(2026, 10, 17),
  });
  expect(r.status).toBe('STOPPED');
  expect(r.stoppedAt).toBe('PREFLIGHT');
  expect(s.control.activate).not.toHaveBeenCalled();
  expect(s.calls()).toBe(0);
});
