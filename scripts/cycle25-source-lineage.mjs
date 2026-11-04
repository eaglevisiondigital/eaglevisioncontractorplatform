// Build/test source lineage only. Never imported by the application or used to
// restore business state, authorize staff, resolve receipts or replay commands.
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const cycle25Parent = '31e2bf5b05f6befac1c24314a31d2eabe65c5219';
export const cycle25Branch = 'codex/program-cycle-twenty-five-integration';
// Actual source pins replace null only after the bounded author commit exists.
// Missing pins never admit changed bytes; no arbitrary ancestry/hash acceptance.
export const cycle25Authors = Object.freeze(
  [
    {
      module: 'field-task-continuity',
      owner: '/root/cycle25_field_growth_resume',
      branch: 'codex/cycle25-field-task-continuity',
      commit: 'd003c81c602fac907bba44b26f9af5f8753f9eb0',
      cases: 20,
      permitted: [
        'src/lib/workflows/task-receipt-reconciliation.ts',
        'src/components/workflows/TaskReceiptActions.tsx',
        'src/components/workflows/task-receipt-actions.css',
      ],
      modified: [
        'src/components/workflows/TaskReceiptActions.tsx',
        'src/components/workflows/task-receipt-actions.css',
        'src/lib/workflows/task-receipt-reconciliation.ts',
      ],
      added: [
        'docs/program/CYCLE25_FIELD_TASK_CONTINUITY.md',
        'tests/cycle25-field-task-continuity.test.ts',
      ],
    },
    {
      module: 'native-cost-reconciliation',
      owner: '/root/cycle25_finance_intelligence_resume',
      branch: 'codex/cycle25-native-cost-reconciliation',
      commit: '23d1dceac734419fb85221eb46d079f4b641b4cb',
      cases: 22,
      nativeCorrection: {
        commit: '249925491c3fdf3191329596409d7a6f31582019',
        path: 'src/components/workflows/cost-coverage-actions.css',
      },
      permitted: [
        'src/lib/workflows/cost-coverage-actions.ts',
        'src/components/workflows/CostCoverageActions.tsx',
        'src/components/workflows/cost-coverage-actions.css',
      ],
      modified: [
        'src/components/workflows/CostCoverageActions.tsx',
        'src/components/workflows/cost-coverage-actions.css',
        'src/lib/workflows/cost-coverage-actions.ts',
      ],
      added: [
        'docs/program/CYCLE25_NATIVE_COST_RECONCILIATION.md',
        'tests/cycle25-native-cost-reconciliation.test.ts',
      ],
    },
    {
      module: 'service-evidence-continuity',
      owner: '/root/cycle25_customer_advanced_resume',
      branch: 'codex/cycle25-service-evidence-continuity',
      commit: 'c95d44b2cae0440dc0a85fa07abd47df6c4a2d2a',
      cases: 31,
      permitted: [
        'src/lib/workflows/service-request-actions.ts',
        'src/components/workflows/ServiceRequestActions.tsx',
        'src/components/workflows/service-request-actions.css',
      ],
      modified: [
        'src/components/workflows/ServiceRequestActions.tsx',
        'src/lib/workflows/service-request-actions.ts',
      ],
      added: [
        'docs/program/CYCLE25_SERVICE_EVIDENCE_CONTINUITY.md',
        'tests/cycle25-service-evidence-continuity.test.ts',
      ],
      testCommit: '093f948d872e7a5ba2143f46c1d07263e3fe531d',
    },
    {
      module: 'maintenance-consistency',
      owner: '/root/cycle25_field_growth_resume',
      branch: 'codex/cycle25-maintenance-consistency',
      commit: 'ae5b89503fc80487e3bb026e1bbc6eea29aef147',
      cases: 21,
      permitted: [
        'src/lib/workflows/plan-cancellation-review.ts',
        'src/components/workflows/MaintenanceCancellationActions.tsx',
        'src/components/workflows/maintenance-cancellation-actions.css',
      ],
      modified: [
        'src/components/workflows/MaintenanceCancellationActions.tsx',
        'src/components/workflows/maintenance-cancellation-actions.css',
        'src/lib/workflows/plan-cancellation-review.ts',
      ],
      added: [
        'docs/program/CYCLE25_MAINTENANCE_CONSISTENCY.md',
        'tests/cycle25-maintenance-consistency.test.ts',
      ],
    },
    {
      module: 'owner-action-continuity',
      owner: '/root/cycle25_finance_intelligence_resume',
      branch: 'codex/cycle25-owner-action-continuity',
      commit: '1faaad5baa4ffa1f077e39bd59e4f9c4760a7291',
      cases: 25,
      nativeCorrection: {
        commit: '603f8d5ce8b07497e5fe3c3a1a852ee849a16408',
        path: 'src/components/workflows/owner-action-verification.css',
      },
      permitted: [
        'src/lib/workflows/owner-action-verification.ts',
        'src/components/workflows/OwnerActionVerification.tsx',
        'src/components/workflows/owner-action-verification.css',
      ],
      modified: [
        'src/components/workflows/OwnerActionVerification.tsx',
        'src/components/workflows/owner-action-verification.css',
        'src/lib/workflows/owner-action-verification.ts',
      ],
      added: [
        'docs/program/CYCLE25_OWNER_ACTION_CONTINUITY.md',
        'tests/cycle25-owner-action-continuity.test.ts',
      ],
    },
    {
      module: 'advanced-source-admission',
      owner: '/root/cycle25_customer_advanced_resume',
      branch: 'codex/cycle25-advanced-source-admission',
      commit: 'c47b449573070371e51c46971439adc9b6ef0e81',
      cases: 37,
      permitted: [
        'src/lib/workflows/offline-source-admission.ts',
        'src/lib/workflows/offline-source-protocol.ts',
      ],
      modified: ['src/lib/workflows/offline-source-admission.ts'],
      added: [
        'docs/program/CYCLE25_ADVANCED_SOURCE_ADMISSION.md',
        'tests/cycle25-advanced-source-admission.test.ts',
      ],
    },
  ].map((s) =>
    Object.freeze({
      ...s,
      permitted: Object.freeze(s.permitted),
      modified: Object.freeze(s.modified),
      added: Object.freeze(s.added),
      ...(s.nativeCorrection
        ? { nativeCorrection: Object.freeze(s.nativeCorrection) }
        : {}),
    }),
  ),
);

const git = (...args) =>
  execFileSync('git', args, {
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
export const cycle25SourcePorts = {
  git: (commit, path) => git('show', `${commit}:${path}`),
  parent: (commit) =>
    git('show', '--no-patch', '--format=%P', commit).toString().trim(),
  type: (commit) => git('cat-file', '-t', commit).toString().trim(),
  mode: (commit, path) =>
    git('ls-tree', commit, '--', path).toString().split(/\s+/)[0],
  delta: (commit) =>
    git(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      commit,
    )
      .toString()
      .trim()
      .split('\n')
      .sort()
      .join('\n'),
  read: (path) => {
    if (
      typeof path !== 'string' ||
      path.startsWith('/') ||
      path.split('/').some((s) => !s || s === '.' || s === '..')
    )
      throw Error('Finite source path required');
    let p = process.cwd();
    for (const s of path.split('/')) {
      p = resolve(p, s);
      if (lstatSync(p).isSymbolicLink())
        throw Error('Source symlink forbidden');
    }
    if (!lstatSync(p).isFile()) throw Error('Regular source required');
    return readFileSync(p);
  },
};

/** Injected ports are trusted offline test fixtures, not runtime capabilities. */
export function validateCycle25ForwardSpec(spec, ports = cycle25SourcePorts) {
  if (
    !spec ||
    typeof spec.commit !== 'string' ||
    !/^[a-f0-9]{40}$/.test(spec.commit) ||
    spec.commit === '0'.repeat(40) ||
    ports.type(spec.commit) !== 'commit' ||
    ports.parent(spec.commit) !== cycle25Parent
  )
    throw Error('Exact single-parent published Cycle25 source commit required');
  if (
    !Array.isArray(spec.modified) ||
    !spec.modified.length ||
    new Set(spec.modified).size !== spec.modified.length ||
    spec.modified.some((p) => !spec.permitted.includes(p))
  )
    throw Error('Only explicitly owned native source paths may change');
  const test = `tests/cycle25-${spec.module}.test.ts`,
    doc = `docs/program/CYCLE25_${spec.module.toUpperCase().replaceAll('-', '_')}.md`;
  if (
    !Array.isArray(spec.added) ||
    JSON.stringify([...spec.added].sort()) !==
      JSON.stringify([test, doc].sort())
  )
    throw Error('Only exact new test and package document allowed');
  const expected = [
    ...spec.modified.map((p) => `M\t${p}`),
    ...spec.added.map((p) => `A\t${p}`),
  ]
    .sort()
    .join('\n');
  if (ports.delta(spec.commit) !== expected)
    throw Error('Exact bounded source delta required');
  for (const path of [...spec.modified, ...spec.added])
    if (ports.mode(spec.commit, path) !== '100644')
      throw Error('Regular non-executable source files required');
  if (spec.testCommit) {
    if (
      !/^[a-f0-9]{40}$/.test(spec.testCommit) ||
      ports.type(spec.testCommit) !== 'commit' ||
      ports.parent(spec.testCommit) !== spec.commit ||
      ports.delta(spec.testCommit) !== `M\t${test}` ||
      ports.mode(spec.testCommit, test) !== '100644'
    )
      throw Error('Exact direct-child new-test-only correction required');
    for (const path of [...spec.modified, doc])
      if (
        !Buffer.from(ports.git(spec.testCommit, path)).equals(
          Buffer.from(ports.git(spec.commit, path)),
        )
      )
        throw Error('Test correction cannot change native source or document');
  }
  if (spec.nativeCorrection) {
    const fix = spec.nativeCorrection;
    if (
      !/^[a-f0-9]{40}$/.test(fix.commit) ||
      !spec.modified.includes(fix.path) ||
      !fix.path.endsWith('.css') ||
      ports.type(fix.commit) !== 'commit' ||
      ports.parent(fix.commit) !== spec.commit ||
      ports.delta(fix.commit) !== `M\t${fix.path}` ||
      ports.mode(fix.commit, fix.path) !== '100644'
    )
      throw Error(
        'Exact direct-child scoped accessibility correction required',
      );
    for (const path of [...spec.modified, ...spec.added])
      if (
        path !== fix.path &&
        !Buffer.from(ports.git(fix.commit, path)).equals(
          Buffer.from(ports.git(spec.commit, path)),
        )
      )
        throw Error(
          'Accessibility correction cannot change native logic/tests/docs',
        );
  }
  return {
    source_commit: spec.commit,
    native_correction: spec.nativeCorrection?.commit ?? null,
    module: spec.module,
    owner: spec.owner,
  };
}

export function admitCycle25Source(path, current, original, supplied = {}) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    owners = cycle25Authors.filter((s) => s.modified.includes(path));
  if (owners.length !== 1)
    throw Error(`Unreviewed source replacement: ${path}`);
  const spec = owners[0],
    result = validateCycle25ForwardSpec(spec, ports);
  if (
    !Buffer.from(original).equals(Buffer.from(ports.git(cycle25Parent, path)))
  )
    throw Error('Original immutable Cycle24 bytes must match exact parent');
  if (
    !Buffer.from(current).equals(
      Buffer.from(
        ports.git(spec.nativeCorrection?.commit ?? spec.commit, path),
      ),
    )
  )
    throw Error('Current source differs from exact published successor');
  return {
    ...result,
    path,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
  };
}

export function inspectCycle25Sources({
  requireCombined = false,
  ...supplied
} = {}) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    rows = [],
    owned = new Set();
  for (const spec of cycle25Authors) {
    for (const path of spec.permitted) {
      if (owned.has(path)) throw Error('Overlapping source ownership');
      owned.add(path);
    }
    if (!spec.commit) {
      if (requireCombined) throw Error('Unpublished source package');
      continue;
    }
    let forward = 0;
    for (const path of spec.modified) {
      const actual = Buffer.from(ports.read(path)),
        base = Buffer.from(ports.git(cycle25Parent, path));
      if (!actual.equals(base)) {
        admitCycle25Source(path, actual, base, ports);
        forward++;
      }
    }
    if (forward !== 0 && forward !== spec.modified.length)
      throw Error('Partial package replacement forbidden');
    if (requireCombined && !forward)
      throw Error('Combined source package absent');
    if (forward)
      for (const path of spec.added)
        if (
          !Buffer.from(ports.read(path)).equals(
            Buffer.from(
              ports.git(
                path.startsWith('tests/')
                  ? (spec.testCommit ?? spec.commit)
                  : spec.commit,
                path,
              ),
            ),
          )
        )
          throw Error('Exact new author test/document required');
    rows.push({
      module: spec.module,
      commit: spec.commit,
      state: forward ? 'EXACT_SUCCESSOR_PRESENT' : 'BASELINE_UNCHANGED',
    });
  }
  return {
    packages: rows,
    complete_combined:
      rows.length === 6 &&
      rows.every((r) => r.state === 'EXACT_SUCCESSOR_PRESENT'),
    business_authority: false,
    restore_adapter: false,
  };
}
