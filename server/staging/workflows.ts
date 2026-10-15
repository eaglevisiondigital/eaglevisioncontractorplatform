import { validateManifest, type StagingManifest } from './acceptance.ts';
export const workflowModules = [
  'estimates',
  'supplier-imports',
  'job-expenses',
  'timekeeping',
  'labor-costing',
  'payroll-preparation',
] as const;
export const requiredWorkflowRpcs: Record<
  (typeof workflowModules)[number],
  readonly string[]
> = {
  estimates: [
    'create_estimate',
    'save_estimate',
    'issue_estimate',
    'revise_estimate',
  ],
  'supplier-imports': [
    'begin_material_import',
    'approve_and_apply_material_import',
  ],
  'job-expenses': [
    'approve_job',
    'submit_job_expense',
    'review_job_expense',
    'begin_job_material_import',
    'record_reviewed_purchase',
  ],
  timekeeping: ['record_time', 'submit_time', 'review_time', 'time_clock'],
  'labor-costing': ['job_labor_summary'],
  'payroll-preparation': ['prepare_payroll'],
};
// Only internal preparation RPCs; no arbitrary URL, table writes, delivery or execution.
const allowedRpcs = new Set([
  'create_estimate',
  'save_estimate',
  'issue_estimate',
  'revise_estimate',
  'begin_material_import',
  'approve_and_apply_material_import',
  'apply_material_import',
  'approve_job',
  'submit_job_expense',
  'review_job_expense',
  'begin_job_material_import',
  'record_reviewed_purchase',
  'record_time',
  'submit_time',
  'review_time',
  'time_clock',
  'prepare_payroll',
  'job_labor_summary',
  'update_job_projection',
  'propose_job_change',
  'approve_job_change',
]);
interface Step {
  id: string;
  rpc: string;
  args: Record<string, unknown>;
  tokenEnv: string;
  expect:
    | { errorCode: string }
    | {
        assertions: {
          path: string;
          equals?: unknown;
          type?: 'uuid' | 'integer' | 'array';
        }[];
      };
}
export interface WorkflowScenario {
  companyId: string;
  module: (typeof workflowModules)[number];
  steps: Step[];
}
function pathValue(value: unknown, path: string): unknown {
  for (const key of path.split('.').filter(Boolean)) {
    if (
      ['__proto__', 'prototype', 'constructor'].includes(key) ||
      !value ||
      typeof value !== 'object' ||
      !Object.hasOwn(value, key)
    )
      throw new Error('Missing assertion/reference');
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
// References are exact {"$ref":"step.path"} objects, never interpolation or code.
function resolve(value: unknown, results: Record<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((v) => resolve(v, results));
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (Object.keys(o).length === 1 && typeof o.$ref === 'string')
      return pathValue(results, o.$ref);
    return Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, resolve(v, results)]),
    );
  }
  return value;
}
export async function runConnectedWorkflows(
  manifest: StagingManifest,
  scenarios: WorkflowScenario[],
  key: string,
  env: Record<string, string | undefined>,
  writeApproval: string,
  transport: typeof fetch = fetch,
) {
  validateManifest(manifest);
  if (
    writeApproval !== manifest.approvalReference ||
    !key.startsWith('sb_publishable_')
  )
    throw new Error('Explicit isolated synthetic-write approval required');
  if (!Array.isArray(scenarios) || scenarios.length > 100)
    throw new Error('Invalid scenarios');
  for (const company of manifest.companies)
    for (const module of workflowModules)
      if (
        !scenarios.some(
          (s) =>
            s.companyId === company.organizationId &&
            s.module === module &&
            s.steps.some((step) => 'assertions' in step.expect),
        )
      )
        throw new Error('Incomplete three-company workflow coverage');
  for (const company of manifest.companies)
    for (const module of workflowModules) {
      const positive = scenarios
        .filter(
          (s) => s.companyId === company.organizationId && s.module === module,
        )
        .flatMap((s) => s.steps)
        .filter((step) => 'assertions' in step.expect);
      if (
        requiredWorkflowRpcs[module].some(
          (rpc) => !positive.some((step) => step.rpc === rpc),
        )
      )
        throw new Error('Incomplete positive workflow RPC coverage');
    }
  // Validate entire plan before the first request/mutation.
  const ids = new Set<string>();
  for (const s of scenarios) {
    if (
      !manifest.companies.some((c) => c.organizationId === s.companyId) ||
      !workflowModules.includes(s.module) ||
      !s.steps.length ||
      s.steps.length > 100
    )
      throw new Error('Invalid scenario');
    for (const step of s.steps) {
      if (
        !/^[a-z][a-z0-9_]{0,60}$/.test(step.id) ||
        ids.has(step.id) ||
        !allowedRpcs.has(step.rpc) ||
        step.args.p_org !== s.companyId ||
        !/^EV_STAGE_[A-Z_]+_JWT$/.test(step.tokenEnv) ||
        !env[step.tokenEnv] ||
        ('assertions' in step.expect
          ? !step.expect.assertions.length ||
            step.expect.assertions.some(
              (a) =>
                typeof a.path !== 'string' ||
                Object.hasOwn(a, 'equals') === Object.hasOwn(a, 'type') ||
                (a.type !== undefined &&
                  !['uuid', 'integer', 'array'].includes(a.type)),
            )
          : !/^[0-9A-Z]{5}$/.test(step.expect.errorCode))
      )
        throw new Error('Unsafe workflow step');
      ids.add(step.id);
    }
  }
  const tokens = [
    ...new Set(
      scenarios.flatMap((s) => s.steps.map((step) => env[step.tokenEnv]!)),
    ),
  ];
  for (const token of tokens) {
    const auth = await transport(
      `${manifest.supabaseUrl.replace(/\/$/, '')}/auth/v1/user`,
      {
        headers: { apikey: key, Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!auth.ok || !((await auth.json()) as { id?: string }).id)
      throw new Error('Unverified workflow actor');
  }
  const results: Record<string, unknown> = Object.create(null);
  let passed = 0;
  for (const scenario of scenarios)
    for (const step of scenario.steps) {
      validateManifest(manifest);
      const args = resolve(step.args, results) as Record<string, unknown>;
      if (args.p_org !== scenario.companyId)
        throw new Error('Resolved tenant mismatch');
      const r = await transport(
        `${manifest.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${step.rpc}`,
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
          headers: {
            apikey: key,
            Authorization: `Bearer ${env[step.tokenEnv]}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(args),
        },
      );
      const body: unknown = r.status === 204 ? null : await r.json();
      if ('errorCode' in step.expect) {
        if (r.ok || (body as { code?: string })?.code !== step.expect.errorCode)
          throw new Error(`Workflow denial failed: ${step.id}`);
      } else {
        if (!r.ok) throw new Error(`Workflow RPC failed: ${step.id}`);
        for (const assertion of step.expect.assertions) {
          const actual = pathValue(body, assertion.path);
          const valid =
            assertion.type === 'uuid'
              ? typeof actual === 'string' &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                  actual,
                )
              : assertion.type === 'integer'
                ? Number.isSafeInteger(actual)
                : assertion.type === 'array'
                  ? Array.isArray(actual)
                  : JSON.stringify(actual) ===
                    JSON.stringify(resolve(assertion.equals, results));
          if (!valid) throw new Error(`Workflow assertion failed: ${step.id}`);
        }
      }
      results[step.id] = body;
      passed++;
    }
  return { passed }; // No supplier/payroll bodies/tokens in report.
}
