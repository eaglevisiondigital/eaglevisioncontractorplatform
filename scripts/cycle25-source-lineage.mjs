// Build/test source lineage only. Never imported by the application or used to
// restore business state, authorize staff, resolve receipts or replay commands.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
  execFileSync('git', ['--no-replace-objects', ...args], {
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
// Git object answers are immutable at a full object ID. Cache only successful
// object reads; copied buffers prevent callers mutating the cache. Current file
// reads, per-row metadata, source admission and business authority are NEVER cached.
const immutableGitObjects = new Map();
function objectGit(commit, ...args) {
  if (!/^[a-f0-9]{40}$/.test(commit)) return git(...args);
  const key = JSON.stringify([process.cwd(), commit, ...args]);
  if (!immutableGitObjects.has(key))
    immutableGitObjects.set(key, Buffer.from(git(...args)));
  return Buffer.from(immutableGitObjects.get(key));
}
export const cycle25SourcePorts = {
  git: (commit, path) => objectGit(commit, 'show', `${commit}:${path}`),
  parent: (commit) =>
    objectGit(commit, 'cat-file', 'commit', commit)
      .toString()
      .split('\n\n')[0]
      .split('\n')
      .filter((line) => line.startsWith('parent '))
      .map((line) => line.slice(7))
      .join(' '),
  type: (commit) =>
    objectGit(commit, 'cat-file', '-t', commit).toString().trim(),
  mode: (commit, path) =>
    objectGit(commit, 'ls-tree', commit, '--', path).toString().split(/\s+/)[0],
  delta: (commit) => {
    const parent = cycle25SourcePorts.parent(commit);
    if (!/^[a-f0-9]{40}$/.test(parent))
      throw Error('Exact raw single parent required');
    return objectGit(
      commit,
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      parent,
      commit,
    )
      .toString()
      .trim()
      .split('\n')
      .sort()
      .join('\n');
  },
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
  if (
    owners.length === 0 &&
    cycle33ExecutionAuthors.some((a) => a.modified.includes(path))
  )
    return admitCycle33ExecutionSource(path, current, original, ports);
  if (
    owners.length === 0 &&
    path === 'src/lib/workflows/offline-source-protocol.ts'
  )
    return admitCycle33NextSource(path, current, original, ports);
  if (
    owners.length === 0 &&
    cycle33Authors.some((s) => s.modified.includes(path)) &&
    !cycle30Authors.some((s) => s.modified.includes(path))
  )
    return { ...admitCycle33Forward(path, current, original, ports), path };
  if (
    owners.length === 0 &&
    cycle32Authors.some((s) => s.modified.includes(path))
  )
    return {
      ...admitCycle32Forward(path, current, original, ports),
      path,
      authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    };
  if (
    owners.length === 0 &&
    cycle30Authors.some((s) => s.modified.includes(path))
  )
    return {
      ...admitCycle30Forward(path, current, original, ports),
      path,
      authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    };
  if (
    owners.length === 0 &&
    cycle31Authors.some((s) => s.modified.includes(path))
  )
    return {
      ...admitCycle31Forward(path, current, original, ports),
      path,
      authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    };
  if (owners.length !== 1)
    throw Error(`Unreviewed source replacement: ${path}`);
  const spec = owners[0],
    result = validateCycle25ForwardSpec(spec, ports);
  if (
    !Buffer.from(original).equals(Buffer.from(ports.git(cycle25Parent, path)))
  )
    throw Error('Original immutable Cycle24 bytes must match exact parent');
  const endpoint = Buffer.from(
    ports.git(spec.nativeCorrection?.commit ?? spec.commit, path),
  );
  const forward = Buffer.from(current).equals(endpoint)
    ? null
    : cycle26Authors.some((s) => s.modified.includes(path))
      ? admitCycle26Forward(path, current, endpoint, ports)
      : {
          cycle27_forward: admitCycle27Forward(path, current, endpoint, ports),
        };
  return {
    ...result,
    ...(forward ? { cycle26_forward: forward } : {}),
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

// Six finite Cycle26 corrections to the existing owners. These pins identify
// reviewed Git source only, never a restart journal or business-state authority.
export const cycle26Parent = 'af95671f70bae6585b39e299ba00ca201f8e6512';
export const cycle26Authors = Object.freeze(
  [
    [
      'task-reconciliation',
      '/root/cycle25_field_growth_resume',
      'codex/cycle26-task-reconciliation',
      'c897c51dc77fe7c29307ee74bc4cf6d729099784',
      22,
      [
        'src/lib/workflows/task-receipt-reconciliation.ts',
        'src/components/workflows/TaskReceiptActions.tsx',
      ],
    ],
    [
      'financial-coverage',
      '/root/cycle25_finance_intelligence_resume',
      'codex/cycle26-financial-coverage',
      '6031e03eff0dfe31c1b8a8cfea4dc5bd92321c51',
      14,
      [
        'src/lib/workflows/cost-coverage-actions.ts',
        'src/components/workflows/CostCoverageActions.tsx',
      ],
    ],
    [
      'service-continuity',
      '/root/cycle26_customer_offline',
      'codex/cycle26-service-continuity',
      'e316aca99b77084dfde36ed7253a5a20f1712874',
      15,
      [
        'src/lib/workflows/service-request-actions.ts',
        'src/components/workflows/ServiceRequestActions.tsx',
      ],
    ],
    [
      'maintenance-revalidation',
      '/root/cycle25_field_growth_resume',
      'codex/cycle26-maintenance-revalidation',
      '4259fc1fb7aef9edb2c8beb0cfac5af0c185ec01',
      27,
      [
        'src/lib/workflows/plan-cancellation-review.ts',
        'src/components/workflows/MaintenanceCancellationActions.tsx',
      ],
    ],
    [
      'owner-source-navigation',
      '/root/cycle25_finance_intelligence_resume',
      'codex/cycle26-owner-source-navigation',
      'd534ce82281096c58273c5cf908456f46f610ecf',
      12,
      [
        'src/lib/workflows/owner-action-verification.ts',
        'src/components/workflows/OwnerActionVerification.tsx',
      ],
    ],
    [
      'offline-ambiguity',
      '/root/cycle26_customer_offline',
      'codex/cycle26-offline-ambiguity',
      'c403f16e55a7154eeeae772edf70b0cdf7a6bdef',
      23,
      ['src/lib/workflows/offline-source-admission.ts'],
    ],
  ].map(([module, owner, branch, commit, cases, paths]) =>
    Object.freeze({
      module,
      owner,
      branch,
      commit,
      cases,
      permitted: Object.freeze([...paths]),
      modified: Object.freeze([...paths]),
      added: Object.freeze([
        `docs/program/CYCLE26_${module.toUpperCase().replaceAll('-', '_')}.md`,
        `tests/cycle26-${module}.test.ts`,
      ]),
    }),
  ),
);

export function validateCycle26ForwardSpec(spec, ports = cycle25SourcePorts) {
  if (
    !spec ||
    !/^[a-f0-9]{40}$/.test(spec.commit ?? '') ||
    spec.commit === '0'.repeat(40) ||
    ports.type(spec.commit) !== 'commit' ||
    ports.parent(spec.commit) !== cycle26Parent
  )
    throw Error('Exact single-parent Cycle26 source commit required');
  if (
    !Array.isArray(spec.modified) ||
    !spec.modified.length ||
    new Set(spec.modified).size !== spec.modified.length ||
    spec.modified.some((p) => !spec.permitted.includes(p))
  )
    throw Error('Only explicitly owned Cycle26 native paths may change');
  const added = [
    `docs/program/CYCLE26_${spec.module.toUpperCase().replaceAll('-', '_')}.md`,
    `tests/cycle26-${spec.module}.test.ts`,
  ];
  if (JSON.stringify([...spec.added].sort()) !== JSON.stringify(added.sort()))
    throw Error('Only exact Cycle26 new test and document allowed');
  const expected = [
    ...spec.modified.map((p) => `M\t${p}`),
    ...spec.added.map((p) => `A\t${p}`),
  ]
    .sort()
    .join('\n');
  if (ports.delta(spec.commit) !== expected)
    throw Error('Exact bounded Cycle26 delta required');
  for (const p of [...spec.modified, ...spec.added])
    if (ports.mode(spec.commit, p) !== '100644')
      throw Error('Regular non-executable Cycle26 source required');
  return { source_commit: spec.commit, module: spec.module, owner: spec.owner };
}

function admitCycle26Forward(path, current, originalCycle25, ports) {
  const owners = cycle26Authors.filter((s) => s.modified.includes(path));
  if (owners.length !== 1)
    throw Error('No finite Cycle26 owner for replacement');
  const spec = owners[0],
    result = validateCycle26ForwardSpec(spec, ports);
  if (
    !Buffer.from(ports.git(cycle26Parent, path)).equals(
      Buffer.from(originalCycle25),
    )
  )
    throw Error('Cycle26 exact parent must retain original Cycle25 source');
  const endpoint = Buffer.from(ports.git(spec.commit, path));
  if (Buffer.from(current).equals(endpoint)) return result;
  return {
    ...result,
    cycle27_forward: admitCycle27Forward(path, current, endpoint, ports),
  };
}

export function inspectCycle26Sources({
  requireCombined = false,
  ...supplied
} = {}) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    rows = [],
    owned = new Set();
  for (const spec of cycle26Authors) {
    for (const path of spec.permitted) {
      if (owned.has(path)) throw Error('Overlapping Cycle26 source ownership');
      owned.add(path);
    }
    let count = 0;
    for (const path of spec.modified) {
      const current = Buffer.from(ports.read(path)),
        base = Buffer.from(ports.git(cycle26Parent, path));
      if (!current.equals(base)) {
        admitCycle26Forward(path, current, base, ports);
        count++;
      }
    }
    if (count && count !== spec.modified.length)
      throw Error('Partial Cycle26 package forbidden');
    if (requireCombined && !count)
      throw Error('Combined Cycle26 package absent');
    if (count)
      for (const path of spec.added)
        if (
          !Buffer.from(ports.read(path)).equals(
            Buffer.from(ports.git(spec.commit, path)),
          )
        )
          throw Error('Exact Cycle26 author test/document required');
    rows.push({
      module: spec.module,
      commit: spec.commit,
      state: count ? 'EXACT_SUCCESSOR_PRESENT' : 'BASELINE_UNCHANGED',
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

// Reviewed finite Cycle27 native successors only. Metadata is build evidence,
// never a business store, receipt, restoration adapter or authorization owner.
export const cycle27Parent = 'f81081b3ce8fca63443a9f03e8bfcd5aa4daa4b6';
export const cycle27Authors = Object.freeze(
  [
    [
      'task-custody',
      '/root/cycle25_field_growth_resume',
      '81ca1d0d39d507734b062965e55b84003f655da6',
      11,
      [
        'src/lib/workflows/task-receipt-reconciliation.ts',
        'src/components/workflows/TaskReceiptActions.tsx',
      ],
    ],
    [
      'cost-completeness',
      '/root/cycle25_finance_intelligence_resume',
      '09569d2458f51f2b67d637d2ade1943071992240',
      12,
      [
        'src/lib/workflows/cost-coverage-actions.ts',
        'src/components/workflows/CostCoverageActions.tsx',
      ],
    ],
    [
      'request-authority',
      '/root/cycle27_customer_offline',
      'e42119427eabe0660226e425caf93d26e00da7df',
      26,
      ['src/lib/workflows/service-request-actions.ts'],
    ],
    [
      'maintenance-consent',
      '/root/cycle25_field_growth_resume',
      '9db377e8bc9a9c3a541ab4bb773dc4c91dba4ff3',
      11,
      [
        'src/lib/workflows/plan-cancellation-review.ts',
        'src/components/workflows/MaintenanceCancellationActions.tsx',
      ],
    ],
    [
      'owner-navigation',
      '/root/cycle25_finance_intelligence_resume',
      '74b97a7ccd8082581331b5fe91695ccfbf8fb342',
      15,
      [
        'src/lib/workflows/owner-action-verification.ts',
        'src/components/workflows/OwnerActionVerification.tsx',
        'src/components/workflows/owner-action-verification.css',
      ],
    ],
    [
      'offline-reconciliation',
      '/root/cycle27_customer_offline',
      'e35aca2f1f0bcae361e4e01a05b37f8305907871',
      24,
      ['src/lib/workflows/offline-source-admission.ts'],
    ],
  ].map(([module, owner, commit, cases, paths]) =>
    Object.freeze({
      module,
      owner,
      branch: `codex/cycle27-${module}`,
      commit,
      cases,
      permitted: Object.freeze([...paths]),
      modified: Object.freeze([...paths]),
      added: Object.freeze([
        `docs/program/CYCLE27_${module.toUpperCase().replaceAll('-', '_')}.md`,
        `tests/cycle27-${module}.test.ts`,
      ]),
    }),
  ),
);
export function validateCycle27ForwardSpec(spec, ports = cycle25SourcePorts) {
  if (
    !spec ||
    !/^[a-f0-9]{40}$/.test(spec.commit ?? '') ||
    spec.commit === '0'.repeat(40) ||
    ports.type(spec.commit) !== 'commit' ||
    ports.parent(spec.commit) !== cycle27Parent
  )
    throw Error('Exact single-parent Cycle27 source commit required');
  if (
    !Array.isArray(spec.modified) ||
    !spec.modified.length ||
    new Set(spec.modified).size !== spec.modified.length ||
    spec.modified.some((p) => !spec.permitted.includes(p))
  )
    throw Error('Only explicitly owned Cycle27 native paths may change');
  const added = [
    `docs/program/CYCLE27_${spec.module.toUpperCase().replaceAll('-', '_')}.md`,
    `tests/cycle27-${spec.module}.test.ts`,
  ];
  if (JSON.stringify([...spec.added].sort()) !== JSON.stringify(added.sort()))
    throw Error('Only exact Cycle27 new test and document allowed');
  const expected = [
    ...spec.modified.map((p) => `M\t${p}`),
    ...spec.added.map((p) => `A\t${p}`),
  ]
    .sort()
    .join('\n');
  if (ports.delta(spec.commit) !== expected)
    throw Error('Exact bounded Cycle27 delta required');
  for (const p of [...spec.modified, ...spec.added])
    if (ports.mode(spec.commit, p) !== '100644')
      throw Error('Regular non-executable Cycle27 source required');
  return { source_commit: spec.commit, module: spec.module, owner: spec.owner };
}

function admitCycle27Forward(path, current, previous, ports) {
  const owners = cycle27Authors.filter((s) => s.modified.includes(path));
  if (
    owners.length === 0 &&
    cycle28Authors.some((s) => s.modified.includes(path))
  )
    return admitCycle28Forward(path, current, previous, ports);
  if (owners.length !== 1)
    throw Error('No finite Cycle27 owner for replacement');
  const spec = owners[0],
    result = validateCycle27ForwardSpec(spec, ports);
  if (
    !Buffer.from(ports.git(cycle27Parent, path)).equals(Buffer.from(previous))
  )
    throw Error('Cycle27 exact parent must retain original reviewed source');
  const endpoint = Buffer.from(ports.git(spec.commit, path));
  if (Buffer.from(current).equals(endpoint)) return result;
  try {
    if (!cycle28Authors.some((s) => s.modified.includes(path))) {
      if (cycle29Authors.some((s) => s.modified.includes(path)))
        return {
          ...result,
          cycle29_forward: admitCycle29Forward(path, current, endpoint, ports),
        };
      if (cycle30Authors.some((s) => s.modified.includes(path)))
        return {
          ...result,
          cycle30_forward: admitCycle30Forward(path, current, endpoint, ports),
        };
      if (cycle31Authors.some((s) => s.modified.includes(path)))
        return {
          ...result,
          cycle31_forward: admitCycle31Forward(path, current, endpoint, ports),
        };
      throw Error('Current source differs from fixed Cycle27 author');
    }
    return {
      ...result,
      cycle28_forward: admitCycle28Forward(path, current, endpoint, ports),
    };
  } catch (cause) {
    // A descendant rejection retains this original caller's denial context.
    throw new Error(
      `Current source differs from fixed Cycle27 lineage: ${cause instanceof Error ? cause.message : 'descendant admission rejected'}`,
      { cause },
    );
  }
}
export function inspectCycle27Sources({
  requireCombined = false,
  ...supplied
} = {}) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    rows = [],
    owned = new Set();
  for (const spec of cycle27Authors) {
    for (const path of spec.permitted) {
      if (owned.has(path)) throw Error('Overlapping Cycle27 source ownership');
      owned.add(path);
    }
    if (!spec.commit) {
      if (requireCombined) throw Error('Unpublished Cycle27 source package');
      continue;
    }
    let count = 0;
    for (const path of spec.modified) {
      const current = Buffer.from(ports.read(path)),
        base = Buffer.from(ports.git(cycle27Parent, path));
      if (!current.equals(base)) {
        admitCycle27Forward(path, current, base, ports);
        count++;
      }
    }
    if (count && count !== spec.modified.length)
      throw Error('Partial Cycle27 package forbidden');
    if (requireCombined && !count)
      throw Error('Combined Cycle27 package absent');
    if (count)
      for (const path of spec.added)
        if (
          !Buffer.from(ports.read(path)).equals(
            Buffer.from(ports.git(spec.commit, path)),
          )
        )
          throw Error('Exact Cycle27 author test/document required');
    rows.push({
      module: spec.module,
      commit: spec.commit,
      state: count ? 'EXACT_SUCCESSOR_PRESENT' : 'BASELINE_UNCHANGED',
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

// Finite Cycle28 source-only successors; never runtime custody or restoration.
export const cycle28Parent = '5f74b8ff5385560330cb94717c17338ed0c10f44';
export const cycle28Authors = Object.freeze(
  [
    [
      'task-custody',
      '/root/cycle25_field_growth_resume',
      '0eb504895ff6adabf4c6c1727dba360f1b61c2d9',
      10,
      [
        'src/lib/workflows/task-receipt-reconciliation.ts',
        'src/components/workflows/TaskReceiptActions.tsx',
      ],
    ],
    [
      'cost-readiness',
      '/root/cycle25_finance_intelligence_resume',
      '9577069c3788a7baf7202f55e496e66352ad298e',
      15,
      ['src/components/workflows/CostCoverageActions.tsx'],
    ],
    [
      'request-provenance',
      '/root/cycle28_customer_offline',
      '670030d42153cc595f52b4605307f1738edb82be',
      19,
      ['src/components/workflows/ServiceRequestActions.tsx'],
    ],
    [
      'consent-renewal',
      '/root/cycle25_field_growth_resume',
      '9a6822b7267eb97170883914533271c166fb7d62',
      8,
      ['src/components/workflows/MaintenanceCancellationActions.tsx'],
    ],
    [
      'current-priorities',
      '/root/cycle25_finance_intelligence_resume',
      '44064cac9f4cde8c746ef080b3e613aff94ff410',
      15,
      ['src/components/workflows/OwnerActionVerification.tsx'],
    ],
    [
      'unknown-diagnostics',
      '/root/cycle28_customer_offline',
      '621aa4059c289b785ae56cfb30ae61740476f812',
      25,
      ['src/lib/workflows/offline-source-admission.ts'],
    ],
  ].map(([module, owner, commit, cases, paths]) =>
    Object.freeze({
      module,
      owner,
      branch: `codex/cycle28-${module}`,
      commit,
      cases,
      permitted: Object.freeze([...paths]),
      modified: Object.freeze([...paths]),
      added: Object.freeze([
        `docs/program/CYCLE28_${module.toUpperCase().replaceAll('-', '_')}.md`,
        `tests/cycle28-${module}.test.ts`,
      ]),
    }),
  ),
);
export function validateCycle28ForwardSpec(spec, ports = cycle25SourcePorts) {
  if (
    !spec ||
    !/^[a-f0-9]{40}$/.test(spec.commit ?? '') ||
    spec.commit === '0'.repeat(40) ||
    ports.type(spec.commit) !== 'commit' ||
    ports.parent(spec.commit) !== cycle28Parent
  )
    throw Error('Exact single-parent Cycle28 source commit required');
  if (
    !Array.isArray(spec.modified) ||
    !spec.modified.length ||
    new Set(spec.modified).size !== spec.modified.length ||
    spec.modified.some((p) => !spec.permitted.includes(p))
  )
    throw Error('Only explicitly owned Cycle28 native paths may change');
  const added = [
    `docs/program/CYCLE28_${spec.module.toUpperCase().replaceAll('-', '_')}.md`,
    `tests/cycle28-${spec.module}.test.ts`,
  ];
  if (JSON.stringify([...spec.added].sort()) !== JSON.stringify(added.sort()))
    throw Error('Only exact Cycle28 new test and document allowed');
  const expected = [
    ...spec.modified.map((p) => `M\t${p}`),
    ...spec.added.map((p) => `A\t${p}`),
  ]
    .sort()
    .join('\n');
  if (ports.delta(spec.commit) !== expected)
    throw Error('Exact bounded Cycle28 delta required');
  for (const p of [...spec.modified, ...spec.added])
    if (ports.mode(spec.commit, p) !== '100644')
      throw Error('Regular non-executable Cycle28 source required');
  return { source_commit: spec.commit, module: spec.module, owner: spec.owner };
}

function admitCycle28Forward(path, current, previous, ports) {
  const owners = cycle28Authors.filter((s) => s.modified.includes(path));
  if (owners.length !== 1)
    throw Error('No finite Cycle28 owner for replacement');
  const spec = owners[0],
    result = validateCycle28ForwardSpec(spec, ports);
  if (
    !Buffer.from(ports.git(cycle28Parent, path)).equals(Buffer.from(previous))
  )
    throw Error('Cycle28 exact parent must retain original reviewed source');
  const endpoint = Buffer.from(ports.git(spec.commit, path));
  if (Buffer.from(current).equals(endpoint)) return result;
  if (cycle29Authors.some((s) => s.modified.includes(path)))
    return {
      ...result,
      cycle29_forward: admitCycle29Forward(path, current, endpoint, ports),
    };
  if (cycle32Authors.some((s) => s.modified.includes(path)))
    return {
      ...result,
      cycle32_forward: admitCycle32Forward(path, current, endpoint, ports),
    };
  if (cycle33Authors.some((s) => s.modified.includes(path)))
    return {
      ...result,
      cycle33_forward: admitCycle33Forward(path, current, endpoint, ports),
    };
  throw Error(
    'Current source differs from fixed Cycle27 lineage (fixed Cycle28 author required)',
  );
}
export function inspectCycle28Sources({
  requireCombined = false,
  ...supplied
} = {}) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    rows = [],
    owned = new Set();
  for (const spec of cycle28Authors) {
    for (const path of spec.permitted) {
      if (owned.has(path)) throw Error('Overlapping Cycle28 source ownership');
      owned.add(path);
    }
    if (!spec.commit) {
      if (requireCombined) throw Error('Unpublished Cycle28 source package');
      continue;
    }
    let count = 0;
    for (const path of spec.modified) {
      const current = Buffer.from(ports.read(path)),
        base = Buffer.from(ports.git(cycle28Parent, path));
      if (!current.equals(base)) {
        admitCycle28Forward(path, current, base, ports);
        count++;
      }
    }
    if (count && count !== spec.modified.length)
      throw Error('Partial Cycle28 package forbidden');
    if (requireCombined && !count)
      throw Error('Combined Cycle28 package absent');
    if (count)
      for (const path of spec.added)
        if (
          !Buffer.from(ports.read(path)).equals(
            Buffer.from(ports.git(spec.commit, path)),
          )
        )
          throw Error('Exact Cycle28 author test/document required');
    rows.push({
      module: spec.module,
      commit: spec.commit,
      state: count ? 'EXACT_SUCCESSOR_PRESENT' : 'BASELINE_UNCHANGED',
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

// Five exact Cycle29 native corrections; Offline is separate coverage-only evidence.
export const cycle29Parent = '067b08b1c3f2e2e2bd259639c636eb13a2c079d4';
export const cycle29Authors = Object.freeze(
  [
    {
      module: 'task-continuity',
      owner: '/root/cycle29_field_growth',
      commit: '598f0fab3e453ae83c2458733140923fef081086',
      permitted: ['src/components/workflows/TaskReceiptActions.tsx'],
      modified: ['src/components/workflows/TaskReceiptActions.tsx'],
      added: [
        'docs/program/CYCLE29_FIELD_TASK_NAVIGATION.md',
        'tests/cycle29-task-navigation.test.ts',
        'tests/program/cycle29-task-navigation-browser.mjs',
      ],
    },
    {
      module: 'cost-continuity',
      owner: '/root/cycle25_finance_intelligence_resume',
      commit: '9eaca7692767590e263c53b3757e8f3a4221b408',
      permitted: ['src/lib/workflows/cost-coverage-actions.ts'],
      modified: ['src/lib/workflows/cost-coverage-actions.ts'],
      added: [
        'docs/program/CYCLE29_COST_CONTINUITY.md',
        'tests/cycle29-cost-continuity.test.ts',
      ],
    },
    {
      module: 'service-continuity',
      owner: '/root/cycle28_customer_offline',
      commit: '180c4e271efe23ff0bed73a0692afdad81f1050f',
      permitted: ['src/components/workflows/ServiceRequestActions.tsx'],
      modified: ['src/components/workflows/ServiceRequestActions.tsx'],
      added: [
        'docs/program/CYCLE29_SERVICE_CONTINUITY.md',
        'tests/cycle29-service-continuity.test.ts',
      ],
    },
    {
      module: 'maintenance-selection',
      owner: '/root/cycle29_field_growth',
      commit: '8bca73931aace63c4d20858944e0fada431fe303',
      permitted: [
        'src/components/workflows/MaintenanceCancellationActions.tsx',
      ],
      modified: ['src/components/workflows/MaintenanceCancellationActions.tsx'],
      added: [
        'docs/program/CYCLE29_MAINTENANCE_SELECTION.md',
        'tests/program/cycle29-maintenance-clear-browser.mjs',
      ],
    },
    {
      module: 'owner-currentness',
      owner: '/root/cycle25_finance_intelligence_resume',
      commit: '1a226d540578810b14fdbbbc170de206745c418c',
      permitted: ['src/lib/workflows/owner-action-verification.ts'],
      modified: ['src/lib/workflows/owner-action-verification.ts'],
      added: [
        'docs/program/CYCLE29_OWNER_CURRENTNESS.md',
        'tests/cycle29-owner-currentness.test.ts',
      ],
    },
  ].map((s) =>
    Object.freeze({
      ...s,
      permitted: Object.freeze(s.permitted),
      modified: Object.freeze(s.modified),
      added: Object.freeze(s.added),
    }),
  ),
);

export function validateCycle29ForwardSpec(spec, ports = cycle25SourcePorts) {
  const fixed = cycle29Authors.find((s) => s.module === spec?.module);
  if (
    !fixed ||
    spec.commit !== fixed.commit ||
    !/^[a-f0-9]{40}$/.test(spec.commit ?? '') ||
    ports.type(spec.commit) !== 'commit' ||
    ports.parent(spec.commit) !== cycle29Parent
  )
    throw Error('Exact fixed single-parent Cycle29 author required');
  for (const field of ['permitted', 'modified', 'added'])
    if (JSON.stringify(spec[field]) !== JSON.stringify(fixed[field]))
      throw Error('Exact bounded Cycle29 ownership required');
  const expected = [
    ...spec.modified.map((p) => `M\t${p}`),
    ...spec.added.map((p) => `A\t${p}`),
  ]
    .sort()
    .join('\n');
  if (ports.delta(spec.commit) !== expected)
    throw Error('Exact bounded Cycle29 delta required');
  for (const path of [...spec.modified, ...spec.added])
    if (ports.mode(spec.commit, path) !== '100644')
      throw Error('Regular non-executable Cycle29 source required');
  return { source_commit: spec.commit, module: spec.module, owner: spec.owner };
}
function admitCycle29Forward(path, current, previous, ports) {
  const owners = cycle29Authors.filter((s) => s.modified.includes(path));
  if (owners.length !== 1) throw Error('No finite Cycle29 source owner');
  const spec = owners[0],
    result = validateCycle29ForwardSpec(spec, ports);
  if (
    !Buffer.from(ports.git(cycle29Parent, path)).equals(Buffer.from(previous))
  )
    throw Error('Exact Cycle29 parent source required');
  const endpoint = Buffer.from(ports.git(spec.commit, path));
  if (
    !endpoint.equals(Buffer.from(current)) &&
    cycle30Authors.some((s) => s.modified.includes(path))
  )
    return {
      ...result,
      cycle30_forward: admitCycle30Forward(path, current, endpoint, ports),
    };
  if (!endpoint.equals(Buffer.from(current)))
    throw Error(
      'Current source differs from fixed Cycle27 lineage (fixed Cycle28/Cycle29 author required)',
    );
  return result;
}
export function inspectCycle29Sources({
  requireCombined = false,
  ...supplied
} = {}) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    rows = [],
    owned = new Set();
  for (const spec of cycle29Authors) {
    validateCycle29ForwardSpec(spec, ports);
    let count = 0;
    for (const path of spec.modified) {
      if (owned.has(path)) throw Error('Overlapping Cycle29 source ownership');
      owned.add(path);
      const current = Buffer.from(ports.read(path)),
        base = Buffer.from(ports.git(cycle29Parent, path));
      if (!current.equals(base)) {
        admitCycle29Forward(path, current, base, ports);
        count++;
      }
    }
    if (count && count !== spec.modified.length)
      throw Error('Partial Cycle29 package forbidden');
    if (requireCombined && !count)
      throw Error('Combined Cycle29 package absent');
    if (count)
      for (const path of spec.added)
        if (
          !Buffer.from(ports.read(path)).equals(
            Buffer.from(ports.git(spec.commit, path)),
          )
        )
          throw Error('Exact Cycle29 author test/document required');
    rows.push({
      module: spec.module,
      commit: spec.commit,
      state: count ? 'EXACT_SUCCESSOR_PRESENT' : 'BASELINE_UNCHANGED',
    });
  }
  return {
    packages: rows,
    complete_combined:
      rows.length === 5 &&
      rows.every((r) => r.state === 'EXACT_SUCCESSOR_PRESENT'),
    business_authority: false,
    restore_adapter: false,
  };
}

export const cycle30Parent = 'b0faaa447e8e18cd78a00e5cfbfd6dc67eff3fd9';
export const cycle30Authors = Object.freeze(
  [
    {
      module: 'maintenance-date',
      owner: '/root/cycle30_field_growth',
      commit: 'eba615b9d2260f472a09e58fcfcfeb09d0879a03',
      modified: ['src/components/workflows/MaintenanceCancellationActions.tsx'],
      added: [
        'docs/program/CYCLE30_MAINTENANCE_DATE.md',
        'tests/cycle30-maintenance-date.test.ts',
        'tests/program/cycle30-maintenance-date-browser.mjs',
      ],
    },
    {
      module: 'customer-source',
      owner: '/root/cycle28_customer_offline',
      commit: 'f00b07ed47c648c1ef77eb91a0137a55b439fac9',
      modified: ['src/lib/workflows/service-request-actions.ts'],
      added: [
        'docs/program/CYCLE30_CUSTOMER_SOURCE_AUDIT.md',
        'tests/cycle30-customer-source-audit.test.ts',
      ],
    },
    {
      module: 'owner-render',
      owner: '/root/cycle25_finance_intelligence_resume',
      commit: '9f85556e28875a53976b55567f3a14e942ba3995',
      modified: ['src/components/workflows/RecordedOwnerActions.tsx'],
      added: [
        'docs/program/CYCLE30_OWNER_SOURCE_AUDIT.md',
        'tests/cycle30-owner-source-audit.test.ts',
      ],
    },
  ].map((s) =>
    Object.freeze({
      ...s,
      permitted: Object.freeze([...s.modified]),
      modified: Object.freeze(s.modified),
      added: Object.freeze(s.added),
    }),
  ),
);
export function validateCycle30ForwardSpec(spec, ports = cycle25SourcePorts) {
  const fixed = cycle30Authors.find((s) => s.module === spec?.module);
  if (
    !fixed ||
    spec.commit !== fixed.commit ||
    !/^[a-f0-9]{40}$/.test(spec.commit ?? '') ||
    ports.type(spec.commit) !== 'commit' ||
    ports.parent(spec.commit) !== cycle30Parent
  )
    throw Error('Exact fixed single-parent Cycle30 author required');
  for (const field of ['permitted', 'modified', 'added'])
    if (JSON.stringify(spec[field]) !== JSON.stringify(fixed[field]))
      throw Error('Exact bounded Cycle30 ownership required');
  const expected = [
    ...spec.modified.map((p) => `M\t${p}`),
    ...spec.added.map((p) => `A\t${p}`),
  ]
    .sort()
    .join('\n');
  if (ports.delta(spec.commit) !== expected)
    throw Error('Exact bounded Cycle30 delta required');
  for (const path of [...spec.modified, ...spec.added])
    if (ports.mode(spec.commit, path) !== '100644')
      throw Error('Regular non-executable Cycle30 source required');
  return { source_commit: spec.commit, module: spec.module, owner: spec.owner };
}
function admitCycle30Forward(path, current, previous, ports) {
  const owners = cycle30Authors.filter((s) => s.modified.includes(path));
  if (owners.length !== 1) throw Error('No finite Cycle30 source owner');
  const spec = owners[0],
    result = validateCycle30ForwardSpec(spec, ports);
  if (
    !Buffer.from(ports.git(cycle30Parent, path)).equals(Buffer.from(previous))
  )
    throw Error('Exact Cycle30 parent source required');
  const endpoint = Buffer.from(ports.git(spec.commit, path));
  if (!endpoint.equals(Buffer.from(current))) {
    if (spec.module === 'owner-render') {
      try {
        return {
          ...result,
          cycle32_busy_forward: admitCycle32BusyForward(
            path,
            current,
            endpoint,
            ports,
          ),
        };
      } catch {
        // Preserve the original denial boundary; no other descendant is admitted.
      }
    }
    if (cycle33Authors.some((s) => s.modified.includes(path))) {
      try {
        return {
          ...result,
          cycle33_forward: admitCycle33Forward(path, current, endpoint, ports),
        };
      } catch (cause) {
        throw new Error(
          `Current source differs from fixed Cycle30 author: ${cause instanceof Error ? cause.message : 'descendant admission rejected'}`,
          { cause },
        );
      }
    }
    throw Error('Current source differs from fixed Cycle30 author');
  }
  return result;
}
export function inspectCycle30Sources({
  requireCombined = false,
  ...supplied
} = {}) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    rows = [],
    owned = new Set();
  for (const spec of cycle30Authors) {
    validateCycle30ForwardSpec(spec, ports);
    let count = 0;
    for (const path of spec.modified) {
      if (owned.has(path)) throw Error('Overlapping Cycle30 source ownership');
      owned.add(path);
      const current = Buffer.from(ports.read(path)),
        base = Buffer.from(ports.git(cycle30Parent, path));
      if (!current.equals(base)) {
        admitCycle30Forward(path, current, base, ports);
        count++;
      }
    }
    if (count && count !== spec.modified.length)
      throw Error('Partial Cycle30 package forbidden');
    if (requireCombined && !count)
      throw Error('Combined Cycle30 package absent');
    if (count)
      for (const path of spec.added)
        if (
          !Buffer.from(ports.read(path)).equals(
            Buffer.from(ports.git(spec.commit, path)),
          )
        )
          throw Error('Exact Cycle30 author test/document required');
    rows.push({
      module: spec.module,
      commit: spec.commit,
      state: count ? 'EXACT_SUCCESSOR_PRESENT' : 'BASELINE_UNCHANGED',
    });
  }
  return {
    packages: rows,
    complete_combined:
      rows.length === 3 &&
      rows.every((r) => r.state === 'EXACT_SUCCESSOR_PRESENT'),
    business_authority: false,
    restore_adapter: false,
  };
}

export const cycle31Parent = '353923ce2c6677ae3d5026ac46cf214b2a549aa3';
export const cycle31Authors = Object.freeze([
  Object.freeze({
    module: 'maintenance-proposal-input',
    owner: '/root/cycle30_field_growth',
    commit: '1538060250fc34654414dac6b29621bf44fabd98',
    permitted: Object.freeze(['src/lib/workflows/plan-cancellation-review.ts']),
    modified: Object.freeze(['src/lib/workflows/plan-cancellation-review.ts']),
    added: Object.freeze([
      'docs/program/CYCLE31_MAINTENANCE_PROPOSAL_INPUT.md',
      'tests/cycle31-maintenance-proposal-input.test.ts',
    ]),
  }),
  Object.freeze({
    module: 'owner-navigation-runtime',
    owner: '/root/cycle25_finance_intelligence_resume',
    commit: '4dc82f93b4cc156ff3f9a4fb46aa3fefa2c93517',
    permitted: Object.freeze(['src/lib/workflows/recorded-owner-actions.ts']),
    modified: Object.freeze(['src/lib/workflows/recorded-owner-actions.ts']),
    added: Object.freeze([
      'docs/program/CYCLE31_OWNER_NAVIGATION_RUNTIME.md',
      'tests/cycle31-owner-navigation-runtime.test.ts',
    ]),
  }),
]);
export function validateCycle31ForwardSpec(spec, ports = cycle25SourcePorts) {
  const fixed = cycle31Authors.find((s) => s.module === spec?.module);
  if (
    !fixed ||
    spec.commit !== fixed.commit ||
    !/^[a-f0-9]{40}$/.test(spec.commit ?? '') ||
    ports.type(spec.commit) !== 'commit' ||
    ports.parent(spec.commit) !== cycle31Parent
  )
    throw Error('Exact fixed single-parent Cycle31 author required');
  for (const field of ['permitted', 'modified', 'added'])
    if (JSON.stringify(spec[field]) !== JSON.stringify(fixed[field]))
      throw Error('Exact bounded Cycle31 ownership required');
  const expected = [
    ...spec.modified.map((p) => `M\t${p}`),
    ...spec.added.map((p) => `A\t${p}`),
  ]
    .sort()
    .join('\n');
  if (ports.delta(spec.commit) !== expected)
    throw Error('Exact bounded Cycle31 delta required');
  for (const path of [...spec.modified, ...spec.added])
    if (ports.mode(spec.commit, path) !== '100644')
      throw Error('Regular non-executable Cycle31 source required');
  return { source_commit: spec.commit, module: spec.module, owner: spec.owner };
}
function admitCycle31Forward(path, current, previous, ports) {
  const owners = cycle31Authors.filter((s) => s.modified.includes(path));
  if (owners.length !== 1) throw Error('No finite Cycle31 source owner');
  const spec = owners[0],
    result = validateCycle31ForwardSpec(spec, ports);
  if (
    !Buffer.from(ports.git(cycle31Parent, path)).equals(Buffer.from(previous))
  )
    throw Error('Exact Cycle31 parent source required');
  const endpoint = Buffer.from(ports.git(spec.commit, path));
  if (!endpoint.equals(Buffer.from(current)))
    throw Error('Current source differs from fixed Cycle31 author');
  return result;
}
export function inspectCycle31Sources({
  requireCombined = false,
  ...supplied
} = {}) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    rows = [],
    owned = new Set();
  for (const spec of cycle31Authors) {
    validateCycle31ForwardSpec(spec, ports);
    let count = 0;
    for (const path of spec.modified) {
      if (owned.has(path)) throw Error('Overlapping Cycle31 source ownership');
      owned.add(path);
      const current = Buffer.from(ports.read(path)),
        base = Buffer.from(ports.git(cycle31Parent, path));
      if (!current.equals(base)) {
        admitCycle31Forward(path, current, base, ports);
        count++;
      }
    }
    if (count && count !== spec.modified.length)
      throw Error('Partial Cycle31 package forbidden');
    if (requireCombined && !count)
      throw Error('Combined Cycle31 package absent');
    if (count)
      for (const path of spec.added)
        if (
          !Buffer.from(ports.read(path)).equals(
            Buffer.from(ports.git(spec.commit, path)),
          )
        )
          throw Error('Exact Cycle31 author test/document required');
    rows.push({
      module: spec.module,
      commit: spec.commit,
      state: count ? 'EXACT_SUCCESSOR_PRESENT' : 'BASELINE_UNCHANGED',
    });
  }
  return {
    packages: rows,
    complete_combined:
      rows.length === 2 &&
      rows.every((r) => r.state === 'EXACT_SUCCESSOR_PRESENT'),
    business_authority: false,
    restore_adapter: false,
  };
}

// Finite build-only admission. These pins do not restore business state or grant
// any application, staff, financial, provider or operational authority.
export const cycle32Parent = '43e622b16aa952f5dc2fe7ae9f96260b47682c2e';
export const cycle32Authors = Object.freeze(
  [
    {
      module: 'task-input-binding',
      owner: '/root/cycle30_field_growth',
      commit: '452d57049e60c5228718fc7647346faab7ac4409',
      permitted: ['src/lib/workflows/task-correction-review.ts'],
      modified: ['src/lib/workflows/task-correction-review.ts'],
      added: [
        'docs/program/CYCLE32_TASK_INPUT_BINDING.md',
        'tests/cycle32-task-input-binding.test.ts',
      ],
    },
    {
      module: 'profit-guard-completeness',
      owner: '/root/cycle25_finance_intelligence_resume',
      commit: '8fec4897bb116c3234e521be2b23260b9f2e503f',
      permitted: ['src/lib/profit-guard.ts'],
      modified: ['src/lib/profit-guard.ts'],
      added: [
        'docs/program/CYCLE32_PROFIT_GUARD_COMPLETENESS.md',
        'tests/cycle32-profit-guard-completeness.test.ts',
      ],
    },
    {
      module: 'owner-filter-navigation',
      owner: '/root/cycle25_finance_intelligence_resume',
      commit: '34cae8398fc135b55452e86bdb3b62a8b76d13d6',
      permitted: ['src/components/workflows/OwnerActionVerification.tsx'],
      modified: ['src/components/workflows/OwnerActionVerification.tsx'],
      added: [
        'docs/program/CYCLE32_OWNER_FILTER_NAVIGATION.md',
        'tests/cycle32-owner-filter-navigation.test.ts',
      ],
    },
    {
      module: 'voice-input-continuity',
      owner: '/root/cycle32_customer_advanced',
      commit: '243a6c79ea9324552ac549c31a280608604453d6',
      nativeCorrection: {
        commit: '6447d881c2011ce178694bd87bbb303b862b1bb9',
      },
      permitted: ['src/lib/program/voice-estimate.ts'],
      modified: ['src/lib/program/voice-estimate.ts'],
      added: [
        'docs/program/CYCLE32_VOICE_INPUT_CONTINUITY.md',
        'tests/cycle32-voice-input-continuity.test.ts',
      ],
    },
  ].map((s) =>
    Object.freeze({
      ...s,
      ...(s.nativeCorrection
        ? { nativeCorrection: Object.freeze(s.nativeCorrection) }
        : {}),
      permitted: Object.freeze(s.permitted),
      modified: Object.freeze(s.modified),
      added: Object.freeze(s.added),
    }),
  ),
);

export function validateCycle32ForwardSpec(spec, ports = cycle25SourcePorts) {
  const fixed = cycle32Authors.find((s) => s.module === spec?.module);
  if (
    !fixed ||
    spec.commit !== fixed.commit ||
    spec.owner !== fixed.owner ||
    !/^[a-f0-9]{40}$/.test(spec.commit ?? '') ||
    ports.type(spec.commit) !== 'commit' ||
    ports.parent(spec.commit) !== cycle32Parent
  )
    throw Error('Exact fixed single-parent Cycle32 author required');
  for (const field of ['permitted', 'modified', 'added', 'nativeCorrection'])
    if (JSON.stringify(spec[field]) !== JSON.stringify(fixed[field]))
      throw Error('Exact bounded Cycle32 ownership and correction required');
  const expected = [
    ...fixed.modified.map((p) => `M\t${p}`),
    ...fixed.added.map((p) => `A\t${p}`),
  ]
    .sort()
    .join('\n');
  if (ports.delta(fixed.commit) !== expected)
    throw Error('Exact bounded Cycle32 author delta required');
  for (const path of fixed.modified)
    if (ports.mode(cycle32Parent, path) !== '100644')
      throw Error('Regular non-executable Cycle32 baseline required');
  for (const path of [...fixed.modified, ...fixed.added])
    if (ports.mode(fixed.commit, path) !== '100644')
      throw Error('Regular non-executable Cycle32 source required');
  if (fixed.nativeCorrection) {
    const correction = fixed.nativeCorrection.commit;
    if (
      ports.type(correction) !== 'commit' ||
      ports.parent(correction) !== fixed.commit
    )
      throw Error('Exact direct-parent Cycle32 correction required');
    const correctionDelta = [...fixed.modified, ...fixed.added]
      .map((p) => `M\t${p}`)
      .sort()
      .join('\n');
    if (ports.delta(correction) !== correctionDelta)
      throw Error('Exact bounded Cycle32 correction delta required');
    for (const path of [...fixed.modified, ...fixed.added])
      if (ports.mode(correction, path) !== '100644')
        throw Error('Regular non-executable Cycle32 correction required');
  }
  return {
    source_commit: fixed.commit,
    native_correction: fixed.nativeCorrection?.commit ?? null,
    module: fixed.module,
    owner: fixed.owner,
  };
}

export function admitCycle32Forward(
  path,
  current,
  previous,
  ports = cycle25SourcePorts,
) {
  const owners = cycle32Authors.filter((s) => s.modified.includes(path));
  if (owners.length !== 1) throw Error('No finite Cycle32 source owner');
  const spec = owners[0],
    result = validateCycle32ForwardSpec(spec, ports);
  if (
    !Buffer.from(ports.git(cycle32Parent, path)).equals(Buffer.from(previous))
  )
    throw Error('Exact Cycle32 parent source required');
  const endpoint = Buffer.from(
    ports.git(spec.nativeCorrection?.commit ?? spec.commit, path),
  );
  if (!endpoint.equals(Buffer.from(current)))
    throw Error('Current source differs from fixed Cycle32 author');
  for (const added of spec.added)
    if (
      !Buffer.from(ports.read(added)).equals(
        Buffer.from(
          ports.git(spec.nativeCorrection?.commit ?? spec.commit, added),
        ),
      )
    )
      throw Error('Exact Cycle32 author test/document required');
  return result;
}

export function inspectCycle32Sources({
  requireCombined = false,
  ...supplied
} = {}) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    rows = [],
    owned = new Set();
  for (const spec of cycle32Authors) {
    validateCycle32ForwardSpec(spec, ports);
    for (const path of [...spec.modified, ...spec.added]) {
      if (owned.has(path)) throw Error('Overlapping Cycle32 source ownership');
      owned.add(path);
    }
    let count = 0;
    for (const path of spec.modified) {
      const current = Buffer.from(ports.read(path)),
        base = Buffer.from(ports.git(cycle32Parent, path));
      if (!current.equals(base)) {
        admitCycle32Forward(path, current, base, ports);
        count++;
      }
    }
    if (count && count !== spec.modified.length)
      throw Error('Partial Cycle32 package forbidden');
    if (!count) {
      for (const path of spec.added) {
        let present = false;
        try {
          ports.read(path);
          present = true;
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
        if (present) throw Error('Partial Cycle32 package forbidden');
      }
      if (requireCombined) throw Error('Combined Cycle32 package absent');
    }
    rows.push({
      module: spec.module,
      commit: spec.commit,
      native_correction: spec.nativeCorrection?.commit ?? null,
      state: count ? 'EXACT_SUCCESSOR_PRESENT' : 'BASELINE_UNCHANGED',
    });
  }
  return {
    packages: rows,
    complete_combined:
      rows.length === 4 &&
      rows.every((r) => r.state === 'EXACT_SUCCESSOR_PRESENT'),
    business_authority: false,
    restore_adapter: false,
  };
}

// One measured post-CI presentation correction. The original C30 author and the
// original four C32 packages remain immutable; this admits no business authority.
export const cycle32BusyParent = '7b377aeffac11855a5dfdfaa86719078e70a5260';
export const cycle32BusySource = Object.freeze({
  module: 'owner-busy-render',
  owner: '/root/cycle28_independent_review',
  commit: 'ec63030de8c0faceebd1ec9a645e9ea0dcf76383',
  modified: Object.freeze([
    'src/components/workflows/RecordedOwnerActions.tsx',
  ]),
  added: Object.freeze([
    'tests/cycle32-owner-busy-state.test.ts',
    'tests/program/cycle32-owner-busy-state.spec.ts',
    'tests/program/playwright.cycle32-owner-busy.config.ts',
    'docs/program/CYCLE32_OWNER_BUSY_RENDER.md',
  ]),
});
export function validateCycle32BusySpec(spec, ports = cycle25SourcePorts) {
  if (
    JSON.stringify(spec) !== JSON.stringify(cycle32BusySource) ||
    typeof spec.commit !== 'string' ||
    !/^[a-f0-9]{40}$/.test(spec.commit) ||
    ports.type(spec.commit) !== 'commit' ||
    ports.parent(spec.commit) !== cycle32BusyParent
  )
    throw Error('Exact single-parent Cycle32 busy-render author required');
  const expected = [
    ...spec.modified.map((p) => `M\t${p}`),
    ...spec.added.map((p) => `A\t${p}`),
  ]
    .sort()
    .join('\n');
  if (ports.delta(spec.commit) !== expected)
    throw Error('Exact bounded Cycle32 busy-render delta required');
  for (const path of [...spec.modified, ...spec.added])
    if (ports.mode(spec.commit, path) !== '100644')
      throw Error('Regular non-executable Cycle32 busy-render source required');
  return { source_commit: spec.commit, module: spec.module, owner: spec.owner };
}
export function admitCycle32BusyForward(
  path,
  current,
  previous,
  supplied = {},
) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    spec = cycle32BusySource;
  const result = validateCycle32BusySpec(spec, ports);
  if (
    path !== spec.modified[0] ||
    !Buffer.from(previous).equals(
      Buffer.from(ports.git(cycle32BusyParent, path)),
    ) ||
    !Buffer.from(previous).equals(
      Buffer.from(ports.git('9f85556e28875a53976b55567f3a14e942ba3995', path)),
    )
  )
    throw Error('Exact original C30 and Cycle32 busy-render baseline required');
  const endpoint = Buffer.from(ports.git(spec.commit, path));
  const forward = Buffer.from(current).equals(endpoint)
    ? undefined
    : admitCycle33Forward(path, current, endpoint, ports);
  for (const companion of spec.added)
    if (
      !Buffer.from(ports.read(companion)).equals(
        Buffer.from(ports.git(spec.commit, companion)),
      )
    )
      throw Error('Exact Cycle32 busy-render author companion required');
  return {
    ...result,
    ...(forward ? { cycle33_forward: forward } : {}),
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
  };
}
export function inspectCycle32BusySources({
  requirePresent = false,
  ...supplied
} = {}) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    spec = cycle32BusySource,
    path = spec.modified[0];
  validateCycle32BusySpec(spec, ports);
  const current = Buffer.from(ports.read(path)),
    base = Buffer.from(ports.git(cycle32BusyParent, path));
  const present = !current.equals(base);
  if (present) admitCycle32BusyForward(path, current, base, ports);
  if (requirePresent && !present)
    throw Error('Combined Cycle32 busy-render correction absent');
  return {
    module: spec.module,
    source_commit: spec.commit,
    present,
    business_authority: false,
    restore_adapter: false,
  };
}

// Five finite, reviewed C33 author packages. Source evidence only; never a
// business-state writer, restoration adapter, operational receipt or authority.
export const cycle33Parent = '0597bb3330f22d69f68a67098e950693e0648172';
export const cycle33Authors = Object.freeze(
  [
    {
      module: 'field-task-receipt-context',
      commit: '9c29d34e129af32c9b586990dc582b799b57f2bc',
      owner: '/root',
      cases: 51,
      nativeCorrection: { commit: '12cf06da7fb4dea1600e6ca1481f4ca8c2c98188' },
      permitted: ['src/lib/workflows/task-receipt-reconciliation.ts'],
      modified: ['src/lib/workflows/task-receipt-reconciliation.ts'],
      added: [
        'docs/program/CYCLE33_TASK_RECEIPT_CONTEXT.md',
        'tests/cycle33-task-receipt-context.test.ts',
      ],
    },
    {
      module: 'customer-selection-privacy',
      commit: '26c49ff8a78712ae6ad5e3afbc491ce8b608760f',
      owner: '/root/cycle28_independent_review',
      cases: 12,
      permitted: ['src/lib/workflows/service-request-actions.ts'],
      modified: ['src/lib/workflows/service-request-actions.ts'],
      added: [
        'docs/program/CYCLE33_CUSTOMER_SELECTION_PRIVACY.md',
        'tests/cycle33-customer-selection-privacy.test.ts',
      ],
    },
    {
      module: 'maintenance-input-continuity',
      commit: 'de81936d42c9279940f3a8466581d1321de84636',
      owner: '/root/cycle28_independent_review',
      cases: 12,
      permitted: ['src/lib/workflows/maintenance-plan-correction.ts'],
      modified: ['src/lib/workflows/maintenance-plan-correction.ts'],
      added: [
        'docs/program/CYCLE33_MAINTENANCE_INPUT_CONTINUITY.md',
        'tests/cycle33-maintenance-input-continuity.test.ts',
      ],
    },
    {
      module: 'sync-proposal-privacy',
      commit: '2bd1060982bc4a7d7b1c30b0329888b419ade027',
      owner: '/root/cycle28_independent_review',
      cases: 12,
      permitted: ['src/lib/workflows/sync-admission-review.ts'],
      modified: ['src/lib/workflows/sync-admission-review.ts'],
      added: [
        'docs/program/CYCLE33_SYNC_PROPOSAL_PRIVACY.md',
        'tests/cycle33-sync-proposal-privacy.test.ts',
      ],
    },
    {
      module: 'owner-continuity',
      commit: '5aa6728003c9b820e50d34505c465104440783d7',
      owner: '/root/cycle25_finance_intelligence_resume',
      cases: 14,
      permitted: ['src/components/workflows/RecordedOwnerActions.tsx'],
      modified: ['src/components/workflows/RecordedOwnerActions.tsx'],
      added: [
        'docs/program/CYCLE33_OWNER_CONTINUITY.md',
        'tests/cycle33-owner-continuity.test.ts',
        'tests/program/cycle33-owner-continuity.spec.ts',
        'tests/program/playwright.cycle33-owner-continuity.config.ts',
      ],
    },
  ].map((s) =>
    Object.freeze({
      ...s,
      ...(s.nativeCorrection
        ? { nativeCorrection: Object.freeze(s.nativeCorrection) }
        : {}),
      permitted: Object.freeze(s.permitted),
      modified: Object.freeze(s.modified),
      added: Object.freeze(s.added),
    }),
  ),
);
export function validateCycle33ForwardSpec(spec, supplied = {}) {
  const ports = { ...cycle25SourcePorts, ...supplied };
  const fixed = cycle33Authors.find((s) => s.module === spec?.module);
  if (
    !fixed ||
    JSON.stringify(spec) !== JSON.stringify(fixed) ||
    ports.type(fixed.commit) !== 'commit' ||
    ports.parent(fixed.commit) !== cycle33Parent
  )
    throw Error('Exact fixed single-parent Cycle33 author required');
  const expected = [
    ...fixed.modified.map((p) => `M\t${p}`),
    ...fixed.added.map((p) => `A\t${p}`),
  ]
    .sort()
    .join('\n');
  if (ports.delta(fixed.commit) !== expected)
    throw Error('Exact bounded Cycle33 author delta required');
  for (const path of fixed.modified)
    if (ports.mode(cycle33Parent, path) !== '100644')
      throw Error('Regular Cycle33 baseline required');
  for (const path of [...fixed.modified, ...fixed.added])
    if (ports.mode(fixed.commit, path) !== '100644')
      throw Error('Regular Cycle33 source required');
  if (fixed.nativeCorrection) {
    const correction = fixed.nativeCorrection.commit;
    if (
      ports.type(correction) !== 'commit' ||
      ports.parent(correction) !== fixed.commit ||
      ports.delta(correction) !==
        [...fixed.modified, ...fixed.added]
          .map((p) => `M\t${p}`)
          .sort()
          .join('\n')
    )
      throw Error('Exact direct-child Cycle33 correction required');
    for (const path of [...fixed.modified, ...fixed.added])
      if (ports.mode(correction, path) !== '100644')
        throw Error('Regular Cycle33 correction source required');
  }
  return {
    source_commit: fixed.commit,
    native_correction: fixed.nativeCorrection?.commit ?? null,
    module: fixed.module,
    owner: fixed.owner,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
  };
}
export function admitCycle33Forward(path, current, previous, supplied = {}) {
  const ports = { ...cycle25SourcePorts, ...supplied };
  const owners = cycle33Authors.filter((s) => s.modified.includes(path));
  if (owners.length !== 1) throw Error('No finite Cycle33 source owner');
  const spec = owners[0],
    result = validateCycle33ForwardSpec(spec, ports);
  if (
    !Buffer.from(previous).equals(Buffer.from(ports.git(cycle33Parent, path)))
  )
    throw Error('Exact Cycle33 parent source required');
  if (
    !Buffer.from(current).equals(
      Buffer.from(
        ports.git(spec.nativeCorrection?.commit ?? spec.commit, path),
      ),
    )
  ) {
    const endpoint = ports.git(
      spec.nativeCorrection?.commit ?? spec.commit,
      path,
    );
    if (
      !Buffer.from(endpoint).equals(
        Buffer.from(ports.git(cycle33NextParent, path)),
      )
    )
      throw Error('Current source differs from fixed Cycle33 author');
    let reviewed_followup;
    try {
      reviewed_followup = cycle33ExecutionAuthors.some((a) =>
        a.modified.includes(path),
      )
        ? admitCycle33ExecutionSource(path, current, endpoint, ports)
        : admitCycle33NextSource(path, current, endpoint, ports);
    } catch (cause) {
      throw new Error(
        `Current source differs from fixed Cycle33 author: ${cause instanceof Error ? cause.message : 'Source admission rejected'}`,
        { cause },
      );
    }
    for (const companion of spec.added)
      if (
        !Buffer.from(ports.read(companion)).equals(
          Buffer.from(
            ports.git(spec.nativeCorrection?.commit ?? spec.commit, companion),
          ),
        )
      )
        throw Error('Exact Cycle33 author companion required');
    return { ...result, reviewed_followup };
  }
  // Every current companion is read on every admission; immutable Git caching
  // never substitutes a historical file for the current working tree.
  for (const companion of spec.added)
    if (
      !Buffer.from(ports.read(companion)).equals(
        Buffer.from(
          ports.git(spec.nativeCorrection?.commit ?? spec.commit, companion),
        ),
      )
    )
      throw Error('Exact Cycle33 author companion required');
  return result;
}

// Exact separately reviewed next-execution endpoints. Build/test evidence only;
// no business record, current authority, receipt custody or restore capability.
export const cycle33NextParent = '39b5b1977f2e18c1c7d534667260ce5ed05660f3';
export const cycle33NextAuthors = Object.freeze([
  Object.freeze({
    module: 'maintenance-review-custody',
    owner: '/root/cycle33_independent_review',
    commit: 'b1f3ecb49c8f8ad6cac3cd9e88a1e6aa8c1a2995',
    modified: Object.freeze([
      'src/lib/workflows/maintenance-plan-correction.ts',
    ]),
    added: Object.freeze([
      'tests/cycle33-maintenance-review-custody.test.ts',
      'docs/program/CYCLE33_MAINTENANCE_REVIEW_CUSTODY.md',
    ]),
  }),
  Object.freeze({
    module: 'offline-protocol-admission',
    owner: '/root/cycle25_finance_intelligence_resume',
    commit: '14989f2080b856c1d90e55dfd6ac1dfbf4fd2515',
    modified: Object.freeze(['src/lib/workflows/offline-source-protocol.ts']),
    added: Object.freeze([
      'tests/cycle33-next-offline-protocol-admission.test.ts',
      'docs/program/CYCLE33_NEXT_OFFLINE_PROTOCOL_ADMISSION.md',
    ]),
  }),
]);
export function admitCycle33NextSource(path, current, previous, supplied = {}) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    owners = cycle33NextAuthors.filter((s) => s.modified.includes(path));
  if (owners.length !== 1)
    throw Error('No fixed reviewed Cycle33 next source owner');
  const spec = owners[0];
  if (
    ports.type(spec.commit) !== 'commit' ||
    ports.parent(spec.commit) !== cycle33NextParent ||
    ports.delta(spec.commit) !==
      [
        ...spec.modified.map((p) => `M\t${p}`),
        ...spec.added.map((p) => `A\t${p}`),
      ]
        .sort()
        .join('\n')
  )
    throw Error('Exact single-parent bounded Cycle33 next author required');
  if (
    !Buffer.from(previous).equals(
      Buffer.from(ports.git(cycle33NextParent, path)),
    )
  )
    throw Error('Exact original Cycle33 next predecessor required');
  for (const p of spec.modified)
    if (ports.mode(cycle33NextParent, p) !== '100644')
      throw Error('Regular original Cycle33 next source required');
  for (const p of [...spec.modified, ...spec.added])
    if (ports.mode(spec.commit, p) !== '100644')
      throw Error('Regular reviewed Cycle33 next source required');
  if (!Buffer.from(current).equals(Buffer.from(ports.git(spec.commit, path))))
    throw Error(
      'Current source differs from fixed reviewed Cycle33 next author',
    );
  for (const p of spec.added)
    if (
      !Buffer.from(ports.read(p)).equals(Buffer.from(ports.git(spec.commit, p)))
    )
      throw Error('Exact current Cycle33 next companion required');
  return {
    module: spec.module,
    source_commit: spec.commit,
    path,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  };
}
export function inspectCycle33Sources({
  requireCombined = false,
  ...supplied
} = {}) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    rows = [],
    owned = new Set();
  for (const spec of cycle33Authors) {
    validateCycle33ForwardSpec(spec, ports);
    for (const path of [...spec.modified, ...spec.added]) {
      if (owned.has(path)) throw Error('Overlapping Cycle33 source ownership');
      owned.add(path);
    }
    const path = spec.modified[0],
      current = Buffer.from(ports.read(path));
    const present = !current.equals(
      Buffer.from(ports.git(cycle33Parent, path)),
    );
    if (present)
      admitCycle33Forward(path, current, ports.git(cycle33Parent, path), ports);
    else {
      for (const companion of spec.added) {
        let exists = false;
        try {
          ports.read(companion);
          exists = true;
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
        if (exists) throw Error('Partial Cycle33 package forbidden');
      }
      if (requireCombined) throw Error('Combined Cycle33 package absent');
    }
    rows.push({
      module: spec.module,
      source_commit: spec.commit,
      state: present ? 'EXACT_SUCCESSOR_PRESENT' : 'BASELINE_UNCHANGED',
    });
  }
  return {
    packages: rows,
    complete_combined:
      rows.length === 5 &&
      rows.every((r) => r.state === 'EXACT_SUCCESSOR_PRESENT'),
    business_authority: false,
    restore_adapter: false,
  };
}

// Literal independently reviewed child authors of the accepted exact762 tree.
// Existing author pins and companions remain immutable. This is not data custody.
export const cycle33ExecutionParent =
  '762e6fa590d3ef9366052db0df34bb02485973c3';
export const cycle33ExecutionAuthors = Object.freeze([
  Object.freeze({
    module: 'task-continuity-input-custody',
    owner: '/root/cycle25_finance_intelligence_resume',
    commit: '192c07796de9562735d53fd3ea9db728ac98ce57',
    modified: Object.freeze([
      'src/lib/workflows/task-receipt-reconciliation.ts',
    ]),
    added: Object.freeze([
      'tests/cycle33-execution-task-continuity.test.ts',
      'docs/program/CYCLE33_EXECUTION_TASK_CONTINUITY.md',
    ]),
  }),
  Object.freeze({
    module: 'owner-comparison-input-custody',
    owner: '/root/cycle33_independent_review',
    commit: '65841565f72b42a485b51e4b804837b53da63cfe',
    modified: Object.freeze(['src/lib/workflows/priority-saved-revisions.ts']),
    added: Object.freeze([
      'tests/cycle33-owner-comparison-input-custody.test.ts',
      'docs/program/CYCLE33_OWNER_COMPARISON_INPUT_CUSTODY.md',
    ]),
  }),
  Object.freeze({
    module: 'service-lineage-handle-capture',
    owner: '/root/cycle33_independent_review',
    commit: '86416efaafc5f968bce8aa61c911371b576ddd7c',
    modified: Object.freeze(['src/lib/workflows/service-source-review.ts']),
    added: Object.freeze([
      'tests/cycle33-service-lineage-handle-capture.test.ts',
      'docs/program/CYCLE33_SERVICE_LINEAGE_HANDLE_CAPTURE.md',
    ]),
  }),
  Object.freeze({
    module: 'cost-selection-current-authority',
    owner: '/root/cycle25_finance_intelligence_resume',
    commit: '98e4c39f3135b0b8177e2cc50980c1814fdcb2ff',
    modified: Object.freeze(['src/lib/workflows/cost-coverage-path.ts']),
    added: Object.freeze([
      'tests/cycle33-execution-cost-selection.test.ts',
      'docs/program/CYCLE33_EXECUTION_COST_SELECTION.md',
    ]),
  }),
]);
export function admitCycle33ExecutionSource(
  path,
  current,
  previous,
  supplied = {},
) {
  const ports = { ...cycle25SourcePorts, ...supplied };
  const owners = cycle33ExecutionAuthors.filter((a) =>
    a.modified.includes(path),
  );
  if (owners.length !== 1)
    throw Error('No fixed Cycle33 execution source owner');
  const spec = owners[0];
  if (
    ports.type(spec.commit) !== 'commit' ||
    ports.parent(spec.commit) !== cycle33ExecutionParent ||
    ports.delta(spec.commit) !==
      [
        ...spec.modified.map((p) => 'M\t' + p),
        ...spec.added.map((p) => 'A\t' + p),
      ]
        .sort()
        .join('\n')
  )
    throw Error(
      'Exact single-parent bounded Cycle33 execution author required',
    );
  if (
    !Buffer.from(previous).equals(
      Buffer.from(ports.git(cycle33ExecutionParent, path)),
    )
  )
    throw Error('Exact Cycle33 execution predecessor required');
  for (const p of spec.modified)
    if (ports.mode(cycle33ExecutionParent, p) !== '100644')
      throw Error('Regular original Cycle33 execution source required');
  for (const p of [...spec.modified, ...spec.added])
    if (ports.mode(spec.commit, p) !== '100644')
      throw Error('Regular reviewed Cycle33 execution source required');
  if (!Buffer.from(current).equals(Buffer.from(ports.git(spec.commit, path))))
    throw Error('Exact current Cycle33 execution source required');
  for (const p of spec.added)
    if (
      !Buffer.from(ports.read(p)).equals(Buffer.from(ports.git(spec.commit, p)))
    )
      throw Error('Exact current Cycle33 execution companion required');
  return {
    module: spec.module,
    source_commit: spec.commit,
    path,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  };
}
/** Original manifests keep their hashes/blob IDs. Validate original metadata and
 * the exact current successor separately; never substitute historical bytes. */
export function admitCycle33ExecutionPublished(file, current, supplied = {}) {
  const ports = { ...cycle25SourcePorts, ...supplied };
  if (!cycle33ExecutionAuthors.some((a) => a.modified.includes(file?.path)))
    throw Error('No fixed published Cycle33 execution predecessor');
  const previous = Buffer.from(ports.git(cycle33ExecutionParent, file.path));
  if (
    createHash('sha256').update(previous).digest('hex') !== file.sha256 ||
    createHash('sha1')
      .update('blob ' + previous.length + '\0')
      .update(previous)
      .digest('hex') !== file.blob
  )
    throw Error(
      'Exact original published Cycle33 execution hash/blob required',
    );
  return admitCycle33ExecutionSource(file.path, current, previous, ports);
}

// One reviewed test-only correction; historical independent evidence is immutable.
export const cycle33ExecutionCiCompatibility = Object.freeze({
  commit: '649c2399fa954fdc50a1c6a1eab592c0f5b0ae18',
  parent: 'eec71f86a39d58d6019b4af196b040f9269ae96d',
  published: 'b8e0cade3ae7de9773ce11cc0ab2cbae5274cd69',
  path: 'tests/cycle22-independent-integration-review.test.ts',
  sha256: 'd92940efc89b03c013608835e15f3babcfbaf212b8b4d3b7e8daa028cb92707b',
  blob: 'abb7472204298bc93e0bb7df80abd44518be94a2',
  published_sha256:
    '49fa5cf5d861c39518d8ffb26bf00d46f0c935a4fec6768dd15dcc323a35602b',
  published_blob: '7c1d67d95fe772a1d17070cc2e90a281c65988ab',
});
export function admitCycle33ExecutionCiCompatibility(
  file,
  current,
  supplied = {},
) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    fixed = cycle33ExecutionCiCompatibility;
  if (
    file?.path !== fixed.path ||
    file.sha256 !== fixed.published_sha256 ||
    file.blob !== fixed.published_blob
  )
    throw Error('Exact historical Cycle22 independent test metadata required');
  if (
    ports.type(fixed.commit) !== 'commit' ||
    ports.parent(fixed.commit) !== fixed.parent ||
    ports.delta(fixed.commit) !== `M\t${fixed.path}` ||
    [fixed.published, fixed.parent, fixed.commit].some(
      (commit) => ports.mode(commit, fixed.path) !== '100644',
    )
  )
    throw Error('Exact sole-parent regular test-only correction required');
  const published = Buffer.from(ports.git(fixed.published, fixed.path)),
    original = Buffer.from(ports.git(fixed.parent, fixed.path)),
    reviewed = Buffer.from(ports.git(fixed.commit, fixed.path));
  if (
    createHash('sha256').update(published).digest('hex') !==
      fixed.published_sha256 ||
    createHash('sha1')
      .update(`blob ${published.length}\0`)
      .update(published)
      .digest('hex') !== fixed.published_blob ||
    !original.equals(published)
  )
    throw Error('Immutable original Cycle22 independent test bytes required');
  if (
    createHash('sha256').update(reviewed).digest('hex') !== fixed.sha256 ||
    createHash('sha1')
      .update(`blob ${reviewed.length}\0`)
      .update(reviewed)
      .digest('hex') !== fixed.blob ||
    !Buffer.from(current).equals(reviewed) ||
    !Buffer.from(ports.read(fixed.path)).equals(reviewed)
  )
    throw Error('Fresh exact reviewed Cycle22 test correction required');
  return {
    module: 'cycle22-independent-review-test-compatibility',
    source_commit: fixed.commit,
    path: fixed.path,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  };
}
