import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { relative } from 'node:path';
import { validateCycle23Manifest } from './check-cycle23.mjs';
import { cycle23RuntimeSources } from './collect-cycle23-browser.mjs';
import {
  admitCycle25Source,
  admitCycle33ExecutionPublished,
} from './cycle25-source-lineage.mjs';

export const cycle24Parent = '7b8d8c1a6f03fa33321409aa15c46926a63e59ed';
export const cycle24Branch = 'codex/program-cycle-twenty-four-integration';
export const cycle24RuntimeCommit = '7a90da23c0a701001c79b605d94d2894cd9cc5a6';
export const cycle24CriticalSources = Object.freeze([
  'src/lib/workflows/saved-revision-runtime.ts',
  'src/lib/workflows/operating-center-runtime.ts',
  'src/lib/workflows/journey-runtime.ts',
  'src/App.tsx',
  'src/main.tsx',
]);
export function assertCycle24ExecutionCommit(commit) {
  if (
    typeof commit !== 'string' ||
    !/^[a-f0-9]{40}$/.test(commit) ||
    execFileSync('git', ['cat-file', '-t', commit], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim() !== 'commit'
  )
    throw Error('Executed source identity must be an actual Git commit');
}
// Filled from actual published, independently reviewed author heads only.
export const cycle24Authors = Object.freeze([
  {
    module: 'task-receipt-reconciliation',
    owner: '/root/cycle11_field_growth',
    branch: 'codex/cycle24-task-receipt-reconciliation',
    original_author_commit: '29e322e9b55b195f17890d7d5a4daf9f4641c7bc',
    head_commit: '29e322e9b55b195f17890d7d5a4daf9f4641c7bc',
    draft_pr: 168,
    cases: 54,
    files: [
      'docs/program/CYCLE24_TASK_RECEIPT_RECONCILIATION.md',
      'src/components/workflows/TaskReceiptActions.tsx',
      'src/components/workflows/task-receipt-actions.css',
      'src/lib/workflows/saved-revision-exercise.ts',
      'src/lib/workflows/task-receipt-reconciliation.ts',
      'tests/cycle24-task-receipt-reconciliation.test.ts',
    ],
  },
  {
    module: 'cost-coverage-actions',
    owner: '/root/cycle24_finance_intelligence',
    branch: 'codex/cycle24-cost-coverage-actions',
    original_author_commit: '660439228b66f19bd80b80cffb7ccda127bdf699',
    head_commit: '660439228b66f19bd80b80cffb7ccda127bdf699',
    draft_pr: 165,
    cases: 26,
    files: [
      'docs/program/CYCLE24_COST_COVERAGE_ACTIONS.md',
      'src/components/workflows/CostCoverageActions.tsx',
      'src/components/workflows/cost-coverage-actions.css',
      'src/lib/workflows/cost-coverage-actions.ts',
      'tests/cycle24-cost-coverage-actions.test.ts',
    ],
  },
  {
    module: 'service-request-actions',
    owner: '/root/cycle22_customer',
    branch: 'codex/cycle24-service-request-actions',
    original_author_commit: '26ab387632dcb96cc7f94b3ea8bde69a90eef3bf',
    head_commit: '621b8b586e6769fbb1bedc3e2d81cf8f73d4f018',
    draft_pr: 169,
    cases: 58,
    files: [
      'docs/program/CYCLE24_SERVICE_REQUEST_ACTIONS.md',
      'src/components/workflows/ServiceRequestActions.tsx',
      'src/components/workflows/service-request-actions.css',
      'src/lib/workflows/service-request-actions.ts',
      'tests/cycle24-service-request-actions.test.ts',
    ],
    dependency: {
      commit: '29e322e9b55b195f17890d7d5a4daf9f4641c7bc',
      path: 'src/lib/workflows/saved-revision-exercise.ts',
    },
  },
  {
    module: 'plan-cancellation-review',
    owner: '/root/cycle11_field_growth',
    branch: 'codex/cycle24-maintenance-cancellation',
    original_author_commit: 'd2eeeec8f2ca070a6ccf350273fa1cf7475905ca',
    head_commit: '8592f47858e49f1c74b30222d918c5b702307240',
    draft_pr: 167,
    cases: 43,
    files: [
      'docs/program/CYCLE24_PLAN_CANCELLATION_REVIEW.md',
      'src/components/workflows/MaintenanceCancellationActions.tsx',
      'src/components/workflows/maintenance-cancellation-actions.css',
      'src/lib/workflows/plan-cancellation-review.ts',
      'tests/cycle24-plan-cancellation-review.test.ts',
    ],
    corrections: [
      {
        commit: 'ae26767f81fdc775d91d46c4b98daf4484f4c319',
        modified: [
          'src/lib/workflows/plan-cancellation-review.ts',
          'tests/cycle24-plan-cancellation-review.test.ts',
        ],
      },
      {
        commit: '8592f47858e49f1c74b30222d918c5b702307240',
        modified: [
          'src/lib/workflows/plan-cancellation-review.ts',
          'tests/cycle24-plan-cancellation-review.test.ts',
        ],
      },
    ],
  },
  {
    module: 'owner-action-verification',
    owner: '/root/cycle24_finance_intelligence',
    branch: 'codex/cycle24-owner-action-verification',
    original_author_commit: '893d629d78014e324971e2b07d8b1b85ca6429ec',
    head_commit: '893d629d78014e324971e2b07d8b1b85ca6429ec',
    draft_pr: 166,
    cases: 27,
    files: [
      'docs/program/CYCLE24_OWNER_ACTION_VERIFICATION.md',
      'src/components/workflows/OwnerActionVerification.tsx',
      'src/components/workflows/owner-action-verification.css',
      'src/lib/workflows/owner-action-verification.ts',
      'tests/cycle24-owner-action-verification.test.ts',
    ],
  },
  {
    module: 'offline-source-admission',
    owner: '/root/cycle22_customer',
    branch: 'codex/cycle24-offline-source-admission',
    original_author_commit: 'cb6d6fc723903544cbb36c2213ca1395fcbac348',
    head_commit: 'cb6d6fc723903544cbb36c2213ca1395fcbac348',
    draft_pr: 170,
    cases: 40,
    files: [
      'docs/program/CYCLE24_OFFLINE_PROTOCOL.json',
      'docs/program/CYCLE24_OFFLINE_SOURCE_ADMISSION.md',
      'src/lib/workflows/offline-source-admission.ts',
      'src/lib/workflows/offline-source-protocol.ts',
      'tests/cycle24-offline-source-admission.test.ts',
    ],
  },
]);
export const cycle24Independent = Object.freeze({
  commit: '712e07cb3be8988b092aba9fad80d32b4662435b',
  cases: 54,
});
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const blob = (bytes) =>
  createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
const git = (commit, path) =>
  execFileSync('git', ['show', `${commit}:${path}`]);
const parent = (commit) =>
  execFileSync('git', ['show', '--no-patch', '--format=%P', commit], {
    encoding: 'utf8',
  }).trim();
const delta = (commit) =>
  execFileSync(
    'git',
    [
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      commit,
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .sort()
    .join('\n');
function read(path) {
  if (
    typeof path !== 'string' ||
    path.startsWith('/') ||
    path.split('/').some((s) => !s || s === '.' || s === '..')
  )
    throw Error('Finite relative source path required');
  let p = process.cwd();
  for (const segment of path.split('/')) {
    p = resolve(p, segment);
    if (lstatSync(p).isSymbolicLink()) throw Error('Source symlink forbidden');
  }
  if (!lstatSync(p).isFile()) throw Error('Regular source required');
  return readFileSync(p);
}
function verify(files, paths, head, ports, seen) {
  if (!Array.isArray(files) || files.length !== paths.length)
    throw Error('Exact source count required');
  const pending = new Set(paths);
  for (const f of files) {
    if (!f || !pending.has(f.path) || seen.has(f.path))
      throw Error('Overlapping, duplicate or unrequested source');
    const bytes = Buffer.from(ports.read(f.path)),
      original = Buffer.from(ports.git(head, f.path));
    if (sha(original) !== f.sha256 || blob(original) !== f.blob)
      throw Error(`Exact published bytes required: ${f.path}`);
    // Original C24 hashes stay original. A fixed bounded C25 author commit must
    // independently explain every changed current byte; never arbitrary ancestry.
    if (!bytes.equals(original))
      admitCycle25Source(f.path, bytes, original, ports);
    pending.delete(f.path);
    seen.add(f.path);
  }
}
export function validateCycle24Manifest(m, options = {}) {
  const p = { read, git, parent, delta, ...options };
  if (
    !m ||
    m.schema !== 'propel-cycle24-sources-v1' ||
    m.parent_commit !== cycle24Parent ||
    m.coordination_branch !== cycle24Branch ||
    m.coordination_draft_pr !== 163 ||
    m.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    m.operational_ready !== false ||
    m.restore_adapter !== false ||
    !Array.isArray(m.packages) ||
    cycle24Authors.length !== 6 ||
    m.packages.length !== 6
  )
    throw Error(
      'Exact six packages, parent, Main163 and closed release required',
    );
  if (
    sha(p.read('docs/program/CYCLE23_SOURCE_MANIFEST.json')) !==
    sha(p.git(cycle24Parent, 'docs/program/CYCLE23_SOURCE_MANIFEST.json'))
  )
    throw Error('Prior manifest changed');
  const seen = new Set();
  for (const [i, expected] of cycle24Authors.entries()) {
    const pack = m.packages[i];
    for (const field of [
      'module',
      'owner',
      'branch',
      'head_commit',
      'original_author_commit',
      'draft_pr',
      'cases',
    ])
      if (pack?.[field] !== expected[field])
        throw Error(`Exact author ${field} required`);
    if (
      pack.parent_commit !== cycle24Parent ||
      pack.base_branch !== cycle24Branch ||
      pack.status !== 'LOCAL_TESTED_DEFAULT_OFF_NOT_OPERATIONAL'
    )
      throw Error('Exact stack and defaultOFF required');
    if (p.parent(expected.original_author_commit) !== cycle24Parent)
      throw Error('Original exact single parent required');
    const originalDelta = expected.files
      .map(
        (f) =>
          `${f === 'src/lib/workflows/saved-revision-exercise.ts' ? 'M' : 'A'}\t${f}`,
      )
      .sort()
      .join('\n');
    if (p.delta(expected.original_author_commit) !== originalDelta)
      throw Error('Exact bounded original file delta required');
    if (expected.head_commit !== expected.original_author_commit) {
      if (expected.dependency) {
        if (p.parent(expected.head_commit) !== expected.original_author_commit)
          throw Error('Exact bounded dependency parent required');
        const d = expected.dependency;
        if (p.delta(expected.head_commit) !== `M\t${d.path}`)
          throw Error('Only exact dependency path may change');
        if (
          !Buffer.from(p.git(expected.head_commit, d.path)).equals(
            Buffer.from(p.git(d.commit, d.path)),
          ) ||
          !Buffer.from(p.read(d.path)).equals(
            Buffer.from(p.git(d.commit, d.path)),
          )
        )
          throw Error('Exact dependency-owner bytes required');
        for (const f of expected.files)
          if (
            !Buffer.from(p.git(expected.head_commit, f)).equals(
              Buffer.from(p.git(expected.original_author_commit, f)),
            )
          )
            throw Error('Original five consumer bytes changed');
      } else if (expected.corrections?.length) {
        let previous = expected.original_author_commit;
        for (const forward of expected.corrections) {
          if (p.parent(forward.commit) !== previous)
            throw Error('Exact reviewed correction parent required');
          const changed = forward.modified;
          if (
            p.delta(forward.commit) !==
            changed
              .map((f) => `M\t${f}`)
              .sort()
              .join('\n')
          )
            throw Error('Only demonstrated reviewed correction paths allowed');
          for (const f of expected.files)
            if (
              !changed.includes(f) &&
              !Buffer.from(p.git(forward.commit, f)).equals(
                Buffer.from(p.git(previous, f)),
              )
            )
              throw Error('Unmodified original author path changed');
          previous = forward.commit;
        }
        if (previous !== expected.head_commit)
          throw Error('Exact reviewed correction endpoint required');
      } else throw Error('Unreviewed author forward forbidden');
    }
    verify(pack.owned_files, expected.files, expected.head_commit, p, seen);
  }
  if (
    m.physical_recovery !== 'UNVERIFIED_NOT_RUN' ||
    m.architecture_implementation_authorized !== false ||
    m.customer_request_native_cas !== false ||
    m.customer_request_durable_receipt !== false ||
    m.maintenance_plan_cancellation !== 'UNSUPPORTED'
  )
    throw Error('Exact authority and unsupported-operation limits required');
  if (m.independent_status === 'CLEAR_LOCAL_SYNTHETIC_ONLY') {
    if (
      !cycle24Independent.commit ||
      m.independent_review_commit !== cycle24Independent.commit ||
      m.independent_cases !== cycle24Independent.cases
    )
      throw Error('Actual exact independent review required');
    verify(
      m.independent_files,
      [
        'tests/cycle24-independent-integration-review.test.ts',
        'docs/program/CYCLE24_INDEPENDENT_REVIEW.md',
        'docs/program/CYCLE24_INDEPENDENT_REVIEW.json',
        'tests/program/cycle24-callback-lease.spec.ts',
        'tests/program/playwright.cycle24-callback.config.ts',
      ],
      cycle24Independent.commit,
      p,
      seen,
    );
  } else if (
    m.independent_status !== 'PENDING' ||
    m.independent_review_commit !== null ||
    m.independent_files?.length !== 0 ||
    options.requireIndependent === true
  )
    throw Error('Independent acceptance remains pending');
  const runtimePaths = [
    ...new Set([
      ...cycle23RuntimeSources,
      ...cycle24Authors.flatMap((a) =>
        a.files.filter((f) => f.startsWith('src/')),
      ),
    ]),
  ].sort();
  if (m.runtime_commit !== cycle24RuntimeCommit || runtimePaths.length !== 76)
    throw Error('Exact frozen runtime required');
  verify(m.runtime_files, runtimePaths, cycle24RuntimeCommit, p, new Set());
  const inventory = JSON.parse(
    p.read('docs/program/CYCLE24_RUNTIME_FILES.json'),
  );
  if (
    inventory.parent_commit !== cycle24Parent ||
    inventory.authority !== 'SOURCE_BINDING_ONLY_NOT_RESTORATION' ||
    JSON.stringify(inventory.paths) !== JSON.stringify(runtimePaths)
  )
    throw Error('Complete finite runtime inventory required');
  return {
    packages: 6,
    admitted_files: seen.size,
    retained_author_files: 523,
    protected_files: 128,
    independent_status: m.independent_status,
    operational_ready: false,
    restore_adapter: false,
    current_source_scope:
      'IMMUTABLE_C24_BASELINE_PLUS_EXACT_BOUNDED_C25_FORWARDS',
  };
}
export function cycle24ApplicationSuites() {
  return Object.fromEntries([
    ...cycle24Authors.map((a) => [
      `tests/cycle24-${a.module}.test.ts`,
      a.cases,
    ]),
    ['tests/cycle24-preparer-compatibility.test.ts', 5],
    ['tests/cycle24-validation.test.ts', 23],
    [
      'tests/cycle24-independent-integration-review.test.ts',
      cycle24Independent.cases,
    ],
  ]);
}
export function validateCycle24ApplicationReport(report, cwd = process.cwd()) {
  const expected = cycle24ApplicationSuites(),
    pending = new Set(Object.keys(expected)),
    names = new Set();
  let count = 0;
  if (
    !report ||
    report.success !== true ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0 ||
    !Array.isArray(report.testResults)
  )
    throw Error('Complete actual application PASS required');
  for (const suite of report.testResults) {
    const path = relative(cwd, resolve(suite.name)).split('\\').join('/');
    if (
      !pending.delete(path) ||
      suite.status !== 'passed' ||
      suite.assertionResults?.length !== expected[path] ||
      expected[path] < 1
    )
      throw Error('Exact unique current suites and counts required');
    for (const result of suite.assertionResults) {
      if (
        result.status !== 'passed' ||
        typeof result.fullName !== 'string' ||
        !result.fullName.trim() ||
        names.has(result.fullName)
      )
        throw Error('Every unique assertion must actually pass');
      names.add(result.fullName);
      count++;
    }
  }
  if (
    pending.size ||
    report.numTotalTests !== count ||
    report.numPassedTests !== count
  )
    throw Error('No omitted, filtered or extra application cases');
  return {
    suites: Object.keys(expected).length,
    cases: count,
    status: 'PASS',
    authority: false,
  };
}
export function validateCycle24CriticalSources(ports = { read, git }) {
  for (const path of cycle24CriticalSources)
    if (
      !Buffer.from(ports.read(path)).equals(
        Buffer.from(ports.git(cycle24RuntimeCommit, path)),
      )
    )
      throw Error(`Critical frozen source changed: ${path}`);
  return { critical_sources: cycle24CriticalSources.length };
}
export function checkCycle24Preservation() {
  validateCycle24CriticalSources();
  const old = JSON.parse(read('docs/program/CYCLE23_SOURCE_MANIFEST.json'));
  validateCycle23Manifest(old, { requireIndependent: true });
  for (const pack of old.packages)
    for (const file of pack.owned_files)
      if (sha(read(file.path)) !== file.sha256) {
        try {
          admitCycle33ExecutionPublished(file, read(file.path));
        } catch (cause) {
          throw new Error('Cycle23 author changed', { cause });
        }
      }
  if (
    sha(read('.github/workflows/ci.yml')) !==
    'df337433bfde1768ccbe396326793559f21113aa7c24e37fbd5955c4c29f87be'
  )
    throw Error('Frozen Foundation changed');
  for (const [commit, names] of [
    [
      '3c587ac7febefdaf11945970918ced6e986d0950',
      ['CYCLE24_RESTART_READINESS.md', 'CYCLE24_RESTART_READINESS.json'],
    ],
    [
      'cade9c8d0456b65c435b03257a4fe917df901092',
      [
        'CYCLE24_RESTART_READINESS_REVIEW.md',
        'CYCLE24_RESTART_READINESS_REVIEW.json',
      ],
    ],
  ])
    for (const name of names) {
      const path = `docs/program/${name}`;
      if (!Buffer.from(read(path)).equals(Buffer.from(git(commit, path))))
        throw Error('Exact independently reviewed architecture bytes required');
    }
  const register = JSON.parse(
    read('docs/program/CYCLE24_RESTART_READINESS.json'),
  );
  const review = JSON.parse(
    read('docs/program/CYCLE24_RESTART_READINESS_REVIEW.json'),
  );
  if (
    register.implementation_authorized !== false ||
    register.operational_ready !== false ||
    register.schema_change_authorized !== false ||
    register.requirements.length !== 19 ||
    register.source_evidence.length !== 21 ||
    review.verdict !== 'CLEAR_AS_NO_GO_REGISTER_ONLY'
  )
    throw Error('Register cannot grant implementation authority');
  const ids = new Set(register.requirements.map((r) => r.id));
  const visiting = new Set(),
    done = new Set();
  function visit(id) {
    if (visiting.has(id)) throw Error('Dependency cycle');
    if (done.has(id)) return;
    const r = register.requirements.find((row) => row.id === id);
    if (
      !r ||
      r.status !== 'NOT_ACCEPTED' ||
      r.authority_granted !== false ||
      r.acceptance !== 'NOT_RUN_OPERATIONALLY'
    )
      throw Error('Unaccepted exact dependencies required');
    visiting.add(id);
    r.dependencies.forEach(visit);
    visiting.delete(id);
    done.add(id);
  }
  if (ids.size !== 19) throw Error('Nineteen unique dependencies required');
  ids.forEach(visit);
  for (const f of register.source_evidence) {
    const original = git(cycle24Parent, f.path);
    if (sha(original) !== f.sha256 || original.length !== f.bytes)
      throw Error('Exact original readiness reference required');
    if (f.path === 'src/lib/workflows/saved-revision-exercise.ts') {
      // The baseline reference stays immutable; current same-tab changes must
      // independently match the exact published Field owner, never a hash waiver.
      if (
        !Buffer.from(read(f.path)).equals(
          Buffer.from(git(cycle24Authors[0].head_commit, f.path)),
        )
      )
        throw Error('Exact Field-owned current custody source required');
    } else if (
      sha(read(f.path)) !== f.sha256 ||
      read(f.path).length !== f.bytes
    )
      throw Error('Readiness reference changed');
  }
  return {
    prior_author_files: 523,
    protected_files: 128,
    locks: 5,
    bindings: 13,
    readiness_requirements: done.size,
    critical_sources: cycle24CriticalSources.length,
    adapter_authorized: false,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const m = JSON.parse(read('docs/program/CYCLE24_SOURCE_MANIFEST.json'));
  console.log(
    JSON.stringify(validateCycle24Manifest(m, { requireIndependent: true })),
  );
  console.log(JSON.stringify(checkCycle24Preservation()));
  if (process.argv.includes('--application'))
    console.log(
      JSON.stringify(
        validateCycle24ApplicationReport(
          JSON.parse(read('artifacts/cycle24/application-results.json')),
        ),
      ),
    );
}
