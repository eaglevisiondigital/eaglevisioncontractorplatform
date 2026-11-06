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
  if (
    owners.length === 0 &&
    cycle33V1Authors.some((a) => a.published && a.path === path)
  ) {
    try {
      return admitCycle33V1Source(path, current, original, ports);
    } catch (cause) {
      throw new Error(`Unreviewed source replacement: ${path}`, { cause });
    }
  }
  if (
    owners.length === 0 &&
    path === 'src/lib/workflows/recorded-cost-requirements.ts'
  ) {
    try {
      return admitCycle33V1ContinuationSource(path, current, original, ports);
    } catch (cause) {
      throw new Error(`Unreviewed source replacement: ${path}`, { cause });
    }
  }
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
  if (
    !endpoint.equals(Buffer.from(current)) &&
    path === cycle33OwnerRequirementAuthor.path
  ) {
    try {
      return {
        ...result,
        owner_requirement_forward: admitCycle33OwnerRequirementSource(
          path,
          current,
          endpoint,
          ports,
        ),
      };
    } catch (cause) {
      throw new Error(
        'Current source differs from fixed Cycle27 lineage (fixed Cycle28/Cycle29 author required)',
        { cause },
      );
    }
  }
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
  if (!endpoint.equals(Buffer.from(current))) {
    if (path === 'src/lib/workflows/plan-cancellation-review.ts') {
      try {
        admitCycle33V1Source(path, current, endpoint, ports);
        return result;
      } catch (cause) {
        throw new Error('Current source differs from fixed Cycle31 author', {
          cause,
        });
      }
    }
    throw Error('Current source differs from fixed Cycle31 author');
  }
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
  if (!endpoint.equals(Buffer.from(current))) {
    if (path === 'src/lib/workflows/task-correction-review.ts') {
      try {
        admitCycle33V1Source(path, current, endpoint, ports);
      } catch (cause) {
        throw new Error('Current source differs from fixed Cycle32 author', {
          cause,
        });
      }
    } else throw Error('Current source differs from fixed Cycle32 author');
  }
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
  if (!Buffer.from(current).equals(Buffer.from(ports.git(spec.commit, path)))) {
    if (path === 'src/lib/workflows/cost-coverage-path.ts') {
      try {
        admitCycle33V1Source(
          path,
          current,
          ports.git(spec.commit, path),
          ports,
        );
      } catch (cause) {
        throw new Error('Exact current Cycle33 execution source required', {
          cause,
        });
      }
    } else throw Error('Exact current Cycle33 execution source required');
  }
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

// One separately reviewed native currentness correction. Existing C29 author
// identity and companions stay immutable; this is build/test evidence only.
export const cycle33OwnerRequirementAuthor = Object.freeze({
  commit: '14734003b472c2633bf8e87526c6a4260696d914',
  parent: '2b8406d10b96ffa7f06a8ef5ae1835538b313d30',
  predecessor: '1a226d540578810b14fdbbbc170de206745c418c',
  path: 'src/lib/workflows/owner-action-verification.ts',
  predecessor_sha256:
    '3457d010c8e965afb2915271d0a83f2e0988172567aa3d92d3be44aaabf0cf77',
  sha256: '2f68502ebb1c6cb7944941a92b64b0d26e3c4916bfc7342ecdb4167ad861f5ad',
  added: Object.freeze([
    Object.freeze({
      path: 'tests/cycle33-owner-requirement-input-continuity.test.ts',
      sha256:
        'b5df7ce10d24328e34055b310909034e4fb9a8bc941ab033ef06397057e22531',
    }),
    Object.freeze({
      path: 'docs/program/CYCLE33_OWNER_REQUIREMENT_INPUT_CONTINUITY.md',
      sha256:
        'dfbb6be6a0f5ecc1a828c29d214640c800868b1fbdb3c2275d253e315c2c5ab4',
    }),
  ]),
});
export function admitCycle33OwnerRequirementSource(
  path,
  current,
  previous,
  supplied = {},
) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    fixed = cycle33OwnerRequirementAuthor,
    original = cycle29Authors.find((s) => s.module === 'owner-currentness'),
    hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  if (
    path !== fixed.path ||
    original?.commit !== fixed.predecessor ||
    original.modified.length !== 1 ||
    original.modified[0] !== fixed.path
  )
    throw Error('Exact reviewed owner requirement source path required');
  validateCycle29ForwardSpec(original, ports);
  if (
    ports.type(fixed.commit) !== 'commit' ||
    ports.parent(fixed.commit) !== fixed.parent ||
    ports.delta(fixed.commit) !==
      [`M\t${fixed.path}`, ...fixed.added.map((p) => `A\t${p.path}`)]
        .sort()
        .join('\n') ||
    [fixed.predecessor, fixed.parent, fixed.commit].some(
      (commit) => ports.mode(commit, path) !== '100644',
    ) ||
    fixed.added.some((p) => ports.mode(fixed.commit, p.path) !== '100644')
  )
    throw Error('Exact single-parent regular M1/A2 owner author required');
  const predecessor = Buffer.from(ports.git(fixed.predecessor, path)),
    parent = Buffer.from(ports.git(fixed.parent, path)),
    reviewed = Buffer.from(ports.git(fixed.commit, path));
  if (
    hash(predecessor) !== fixed.predecessor_sha256 ||
    !parent.equals(predecessor) ||
    !Buffer.from(previous).equals(predecessor)
  )
    throw Error('Exact immutable C29 owner predecessor required');
  if (
    hash(reviewed) !== fixed.sha256 ||
    !Buffer.from(current).equals(reviewed) ||
    !Buffer.from(ports.read(path)).equals(reviewed)
  )
    throw Error('Fresh exact reviewed owner requirement source required');
  for (const companion of fixed.added) {
    const reviewedCompanion = Buffer.from(
      ports.git(fixed.commit, companion.path),
    );
    if (
      hash(reviewedCompanion) !== companion.sha256 ||
      !Buffer.from(ports.read(companion.path)).equals(reviewedCompanion)
    )
      throw Error('Exact current owner requirement companion required');
  }
  for (const companion of original.added)
    if (
      !Buffer.from(ports.read(companion)).equals(
        Buffer.from(ports.git(fixed.predecessor, companion)),
      )
    )
      throw Error('Exact original C29 owner companion required');
  return {
    module: 'owner-requirement-input-continuity',
    source_commit: fixed.commit,
    path,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  };
}

// Literal reviewed V1 native successors. Build/test evidence only; never business restoration.
export const cycle33V1Parent = '8c0286e0e70133c8e0a0e0e478e89a3a6b8ddf55';
export const cycle33V1Authors = Object.freeze(
  [
    {
      module: 'recorded-time-kind-review',
      commit: 'ad2830e5677539ea2c4922377b7a184386e4a9e1',
      parent: '8c0286e0e70133c8e0a0e0e478e89a3a6b8ddf55',
      path: 'src/lib/workflows/cost-coverage-path.ts',
      predecessor: '98e4c39f3135b0b8177e2cc50980c1814fdcb2ff',
      predecessor_sha256:
        '70a8d82766f4807de28410f3bafbbe4a0a649d6d208785735e039182c52dfb33',
      sha256:
        'aab96531cf4ed2ef731331adaa085c4c5ba21151fe626068d09cbd3c96c8243e',
      cases: 14,
      added: [
        {
          path: 'docs/program/CYCLE33_RECORDED_TIME_KIND_REVIEW.md',
          sha256:
            '7557ee73c0d74316aa2f3b049562625ddcf2d79bad55726e79ab8fcec8cb1284',
        },
        {
          path: 'tests/cycle33-recorded-time-kind-review.test.ts',
          sha256:
            '0b074189feeb444a8d597962993a89bbb92dbbc764095572bf391aad26b43e0d',
        },
      ],
      original_companions: [
        {
          path: 'tests/cycle33-execution-cost-selection.test.ts',
          sha256:
            '3882009f942e219c632b063edd7368082181038e23f781d5b086561c885b1b0e',
        },
        {
          path: 'docs/program/CYCLE33_EXECUTION_COST_SELECTION.md',
          sha256:
            '5cd121198a8a0be08ebf71a1333039f945b1cf01970a938783fa8e81b41fd433',
        },
      ],
      published: null,
    },
    {
      module: 'published-history-filter-currentness',
      commit: 'b4b35f5323affacbedd433684f2085f8bf8628d2',
      parent: '8c0286e0e70133c8e0a0e0e478e89a3a6b8ddf55',
      path: 'src/lib/workflows/published-service-navigation.ts',
      predecessor: 'a9dd2e2844a1025adcc73ab48e16f5d0a77ba1e4',
      predecessor_sha256:
        '0c6fd950ee0a9362360af19b910c5401aef1d09fd09bf4678f412f7751c57dd9',
      sha256:
        '4ae84361f9ef34a4b64eeb11678bab2ed67f8a9f801fe9ea63d96dcf6c5d999a',
      cases: 17,
      added: [
        {
          path: 'docs/program/CYCLE33_PUBLISHED_HISTORY_FILTER_CURRENTNESS.md',
          sha256:
            'c97a993fb1c47b7de593ee2747ee9f39ac4bf5fdd29c7f38f7c461dc22d54b16',
        },
        {
          path: 'tests/cycle33-published-history-filter-currentness.test.ts',
          sha256:
            '7c85d94d145c8d9b900af32e12dd48213a5e3a817c581ef67d84615ca1e805ea',
        },
      ],
      original_companions: [
        {
          path: 'tests/cycle21-published-service-navigation.test.ts',
          sha256:
            '6ed2cf1d93b7be43a66b4885e6802ed04690f7e1e22f4e1a9d86e9e457355514',
        },
        {
          path: 'docs/program/CYCLE21_PUBLISHED_SERVICE_NAVIGATION.md',
          sha256:
            '7b40fd235960e59b9feaf30dec1427d68cf9b95b9a57e51c291c2c13970149f4',
        },
      ],
      published: {
        commit: 'a9dd2e2844a1025adcc73ab48e16f5d0a77ba1e4',
        sha256:
          '0c6fd950ee0a9362360af19b910c5401aef1d09fd09bf4678f412f7751c57dd9',
        blob: 'a8dc1104c110340005b70ef3e69300931ce9fb05',
        requires_blob: true,
      },
    },
    {
      module: 'addon-job-filter-currentness',
      commit: '99e112a7cf669dfde03fdd69dbdbce2e74ef2fd4',
      parent: '8c0286e0e70133c8e0a0e0e478e89a3a6b8ddf55',
      path: 'src/lib/workflows/addon-readiness-guide.ts',
      predecessor: 'fecfcf104e7f3988a53c85a77353824edfa6f85b',
      predecessor_sha256:
        'b3c6d6f20aa38d00f88a9987b30117f945c341cda5c591d16d5b8f671a5b60cf',
      sha256:
        'f6c2be0f5a14722190c4103e606ce9b2ef168b2630147f96baf5cb4fee76036a',
      cases: 17,
      added: [
        {
          path: 'docs/program/CYCLE33_ADDON_JOB_FILTER_CURRENTNESS.md',
          sha256:
            '726aabac5ae058ff53ac2b0a008ed235e45b048fd6ecf6e85b1d6a93eb1bed69',
        },
        {
          path: 'tests/cycle33-addon-job-filter-currentness.test.ts',
          sha256:
            '0df2b6dd6745617b9763b1bb62db372126120724dc9f75040764ff83c117cd22',
        },
      ],
      original_companions: [
        {
          path: 'tests/cycle16-addon-readiness-guide.test.ts',
          sha256:
            '65bddd7746711e5e75d9c06f7b08a8219eb9a8acc3abf907149fb36063cd5292',
        },
        {
          path: 'docs/program/CYCLE16_ADDON_READINESS_GUIDE.md',
          sha256:
            '16a76a96317d7dbac998a389fd9b30d34181d7d54754a45039dd5b9e91aff627',
        },
      ],
      published: {
        commit: 'fecfcf104e7f3988a53c85a77353824edfa6f85b',
        sha256:
          'b3c6d6f20aa38d00f88a9987b30117f945c341cda5c591d16d5b8f671a5b60cf',
        blob: '804819c35a5429e9433bd0379eb654b0b277262f',
        requires_blob: false,
      },
    },
    {
      module: 'maintenance-review-reference-custody',
      commit: '2edb76df29c36328f39a19277b287c8e9b16a940',
      parent: '8c0286e0e70133c8e0a0e0e478e89a3a6b8ddf55',
      path: 'src/lib/workflows/plan-cancellation-review.ts',
      predecessor: '1538060250fc34654414dac6b29621bf44fabd98',
      predecessor_sha256:
        '9d9b115e5dd068174e4abe604d0ae4e80eb1ebfd4106263548866130da1e8b3a',
      sha256:
        '9efab5226a57c15084fe726c6cc4576830dafe42db17993ceade53553f8e705d',
      cases: 21,
      added: [
        {
          path: 'docs/program/CYCLE33_MAINTENANCE_REVIEW_REFERENCE_CUSTODY.md',
          sha256:
            'e5a1e64827968e6b27472e2161f7ff561009ac6cc2194b33190faf16b512041e',
        },
        {
          path: 'tests/cycle33-maintenance-review-reference-custody.test.ts',
          sha256:
            'e8a5b1be434241fbabb043c37638ca48c4b53c590bda082ef7936c83ce4553f3',
        },
      ],
      original_companions: [
        {
          path: 'tests/cycle31-maintenance-proposal-input.test.ts',
          sha256:
            '15edfd41e18f8f67a074763c26977d1252bd839406888eab9651ad8bf189521e',
        },
        {
          path: 'docs/program/CYCLE31_MAINTENANCE_PROPOSAL_INPUT.md',
          sha256:
            'd9464a37a1830968b63c5c9f066f5d675546a996b915dd3d4e53c409a4c4c060',
        },
      ],
      published: null,
    },
    {
      module: 'task-display-reference-custody',
      commit: '15fabc063a74b3fce587f5dca8962428dc0b04ac',
      parent: '8c0286e0e70133c8e0a0e0e478e89a3a6b8ddf55',
      path: 'src/lib/workflows/task-correction-review.ts',
      predecessor: '452d57049e60c5228718fc7647346faab7ac4409',
      predecessor_sha256:
        '638cb1068fbd0ea3c8697c6ff5d19c3b7adfd8446d7cbd3fe28369577021a488',
      sha256:
        '6ff2d36bfc6bfdeda8b552e2a25f961c23f3e90abbf20690d6618c0f95e087a2',
      cases: 21,
      added: [
        {
          path: 'docs/program/CYCLE33_TASK_DISPLAY_REFERENCE_CUSTODY.md',
          sha256:
            'a5ba4785b564d4b50f0495915de3ceee868b66b9aebbe5b5f7714e65b7952006',
        },
        {
          path: 'tests/cycle33-task-display-reference-custody.test.ts',
          sha256:
            '8b0b19daa0d1005f0f3a22cc5e10eea702736a3e2470e35c980b1616a9c9de50',
        },
      ],
      original_companions: [
        {
          path: 'docs/program/CYCLE32_TASK_INPUT_BINDING.md',
          sha256:
            'c2be0d391330797b8f91bb6587bfb682e61aacaac7199cecab9b976a70c59378',
        },
        {
          path: 'tests/cycle32-task-input-binding.test.ts',
          sha256:
            'e0ae13969e30c7760d7112fe054fb036f254d7dc84a27aeb574ee75ed453a34e',
        },
      ],
      published: null,
    },
  ].map((a) =>
    Object.freeze({
      ...a,
      added: Object.freeze(a.added.map(Object.freeze)),
      original_companions: Object.freeze(
        a.original_companions.map(Object.freeze),
      ),
      published: a.published && Object.freeze(a.published),
    }),
  ),
);

// Finite independently reviewed native successors of the unchanged V1/C23 records.
// Source admission only: no business-state restoration or operational authority.
export const cycle33V1ContinuationParent =
  '6bf1f2be786e6d9c052d87e5f759a4312782be70';
export const cycle33V1ContinuationAuthors = Object.freeze(
  [
    {
      module: 'recorded-cost-selector-custody',
      commit: '5986df744d688d7ab2e72a7824b18e4568d1cb92',
      path: 'src/lib/workflows/recorded-cost-requirements.ts',
      predecessor: 'a3c8a39dd1b08ffdc68d1f7b9b29153ae50feb88',
      predecessor_sha256:
        '72b6a0b2f63e2d961f39f47fd3f903c30690cb5eec6e4196a892b75285ee9c71',
      sha256:
        'a07bd62f868f32743d7c81ad78a53dc76d8aa6c674b8b2e6b99aab43ea7bc1a4',
      cases: 22,
      added: [
        {
          path: 'tests/cycle33-recorded-cost-selector-custody.test.ts',
          sha256:
            'e78790aa2eb07b1876181e7b6b329640f67b2f1ca740ceb968c78a569c9040ba',
        },
        {
          path: 'docs/program/CYCLE33_RECORDED_COST_SELECTOR_CUSTODY.md',
          sha256:
            '76d7a8f891e47ac08b56961f8ba6434f754d0d39d87f6536d84bb822540637c6',
        },
      ],
      original_companions: [
        {
          path: 'src/components/workflows/RecordedCostRequirements.tsx',
          sha256:
            '7374d98abfb7751913e7c502835e608666a1644776dcf5e0c06056e9dca2b967',
        },
        {
          path: 'src/components/workflows/recorded-cost-requirements.css',
          sha256:
            '8369a7d02611e3ebd214a160a29ed754d374becdd6e6ea561079da1bb96a6b4e',
        },
        {
          path: 'tests/cycle23-recorded-cost-requirements.test.ts',
          sha256:
            '03a00b5966584b69642117f219497ff5e6eb0a774b0d4317cab6d5e48a7839e7',
        },
        {
          path: 'docs/program/CYCLE23_RECORDED_COST_REQUIREMENTS.md',
          sha256:
            'f59becfd5d4a5f30b59ea28a46c8f701d743ccda62eafe4ea3ceaa9d773d8d3c',
        },
      ],
      published: {
        commit: 'a3c8a39dd1b08ffdc68d1f7b9b29153ae50feb88',
        sha256:
          '72b6a0b2f63e2d961f39f47fd3f903c30690cb5eec6e4196a892b75285ee9c71',
        blob: 'ad8ee0ba15ab0a17f731eb7cde34b30ec4f537dc',
      },
    },
    {
      module: 'published-navigation-currentness',
      commit: '8c6334db676f214bc7abe1a4eeae70e9b547534a',
      path: 'src/lib/workflows/published-service-navigation.ts',
      predecessor: 'b4b35f5323affacbedd433684f2085f8bf8628d2',
      predecessor_sha256:
        '4ae84361f9ef34a4b64eeb11678bab2ed67f8a9f801fe9ea63d96dcf6c5d999a',
      sha256:
        '6cd3136bade409b4cbb91d42775c71c5c5e4f69110e55029b89711ed118a4083',
      cases: 29,
      added: [
        {
          path: 'tests/cycle33-published-navigation-currentness.test.ts',
          sha256:
            'cf0a24412cf5bf2d11d29761c36829e200ff0cd726e167d782b6300fff9cae0f',
        },
        {
          path: 'docs/program/CYCLE33_PUBLISHED_NAVIGATION_CURRENTNESS.md',
          sha256:
            'a67860ddd9ecb9f99ed65a926ddf783a4bfa122b73ab03cd402a434474a6e74b',
        },
      ],
      original_companions: cycle33V1Authors
        .filter((a) => a.commit === 'b4b35f5323affacbedd433684f2085f8bf8628d2')
        .flatMap((a) => [...a.added, ...a.original_companions]),
      published: null,
    },
    {
      module: 'task-read-currentness',
      commit: 'bd2e50e8f5dd972c9b2c9a29186e36fcc05dee53',
      path: 'src/lib/workflows/task-correction-review.ts',
      predecessor: '15fabc063a74b3fce587f5dca8962428dc0b04ac',
      predecessor_sha256:
        '6ff2d36bfc6bfdeda8b552e2a25f961c23f3e90abbf20690d6618c0f95e087a2',
      sha256:
        '6efa75671e51687d81a28a94ce744670475cc524d64c61e726e7916ee330e564',
      cases: 30,
      added: [
        {
          path: 'tests/cycle33-task-read-currentness.test.ts',
          sha256:
            'b8c48f7298fc99ee7a25c1a2ccdebdc7bc655ab6b46d85e2fcf428b2bf085fe3',
        },
        {
          path: 'docs/program/CYCLE33_TASK_READ_CURRENTNESS.md',
          sha256:
            'cd918cc700083058d02d9dd5a1b06faf2dfdecc4509ad004bbed45547e787be4',
        },
      ],
      original_companions: cycle33V1Authors
        .filter((a) => a.commit === '15fabc063a74b3fce587f5dca8962428dc0b04ac')
        .flatMap((a) => [...a.added, ...a.original_companions]),
      published: null,
    },
  ].map((a) =>
    Object.freeze({
      ...a,
      parent: cycle33V1ContinuationParent,
      added: Object.freeze(a.added.map(Object.freeze)),
      original_companions: Object.freeze(
        a.original_companions.map(Object.freeze),
      ),
      published: a.published && Object.freeze(a.published),
    }),
  ),
);

export function admitCycle33V1ContinuationSource(
  path,
  current,
  previous,
  supplied = {},
) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    owners = cycle33V1ContinuationAuthors.filter((a) => a.path === path),
    hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  if (owners.length !== 1)
    throw Error('No literal reviewed V1 continuation owner');
  const a = owners[0];
  if (
    [a.predecessor, a.parent, a.commit].some(
      (c) => ports.type(c) !== 'commit' || ports.mode(c, path) !== '100644',
    ) ||
    ports.parent(a.commit) !== cycle33V1ContinuationParent ||
    ports.delta(a.commit) !==
      ['M\t' + a.path, ...a.added.map((f) => 'A\t' + f.path)]
        .sort()
        .join('\n') ||
    a.added.some((f) => ports.mode(a.commit, f.path) !== '100644') ||
    a.original_companions.some(
      (f) => ports.mode(a.predecessor, f.path) !== '100644',
    )
  )
    throw Error(
      'Exact sole-parent regular V1 continuation M1/A2 author required',
    );
  const old = Buffer.from(ports.git(a.predecessor, path)),
    base = Buffer.from(ports.git(a.parent, path)),
    reviewed = Buffer.from(ports.git(a.commit, path));
  if (
    hash(old) !== a.predecessor_sha256 ||
    !base.equals(old) ||
    !Buffer.from(previous).equals(old)
  )
    throw Error('Exact immutable V1 continuation predecessor required');
  if (
    hash(reviewed) !== a.sha256 ||
    !Buffer.from(current).equals(reviewed) ||
    !Buffer.from(ports.read(path)).equals(reviewed)
  )
    throw Error('Fresh exact reviewed V1 continuation source required');
  for (const [commit, files] of [
    [a.commit, a.added],
    [a.predecessor, a.original_companions],
  ])
    for (const f of files) {
      const bytes = Buffer.from(ports.git(commit, f.path));
      if (
        hash(bytes) !== f.sha256 ||
        !Buffer.from(ports.read(f.path)).equals(bytes)
      )
        throw Error('Exact current V1 continuation companion required');
    }
  if (!Buffer.from(ports.read(path)).equals(reviewed))
    throw Error('Final fresh V1 continuation source required');
  return {
    module: a.module,
    source_commit: a.commit,
    path,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  };
}
export function admitCycle33V1ContinuationPublished(
  file,
  current,
  publishedCommit,
  supplied = {},
) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    a = cycle33V1ContinuationAuthors.find(
      (a) => a.published && a.path === file?.path,
    ),
    hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  if (
    !a ||
    publishedCommit !== a.published.commit ||
    file.sha256 !== a.published.sha256 ||
    file.blob !== a.published.blob
  )
    throw Error('Exact immutable published V1 continuation metadata required');
  const bytes = Buffer.from(ports.git(a.published.commit, a.path));
  if (
    hash(bytes) !== a.published.sha256 ||
    createHash('sha1')
      .update('blob ' + bytes.length + '\0')
      .update(bytes)
      .digest('hex') !== a.published.blob
  )
    throw Error(
      'Exact immutable published V1 continuation bytes/blob required',
    );
  return admitCycle33V1ContinuationSource(a.path, current, bytes, ports);
}

export function admitCycle33V1Source(path, current, previous, supplied = {}) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    owners = cycle33V1Authors.filter((a) => a.path === path),
    hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  if (owners.length !== 1) throw Error('No literal reviewed V1 source owner');
  const a = owners[0];
  if (
    ports.type(a.commit) !== 'commit' ||
    ports.parent(a.commit) !== cycle33V1Parent ||
    a.parent !== cycle33V1Parent ||
    ports.delta(a.commit) !==
      ['M\t' + a.path, ...a.added.map((f) => 'A\t' + f.path)]
        .sort()
        .join('\n') ||
    [a.predecessor, cycle33V1Parent, a.commit].some(
      (c) => ports.mode(c, path) !== '100644',
    ) ||
    ports.type(a.predecessor) !== 'commit' ||
    a.added.some((f) => ports.mode(a.commit, f.path) !== '100644') ||
    a.original_companions.some(
      (f) => ports.mode(a.predecessor, f.path) !== '100644',
    )
  )
    throw Error('Exact sole-parent regular V1 M1/A2 author required');
  const old = Buffer.from(ports.git(a.predecessor, path)),
    base = Buffer.from(ports.git(cycle33V1Parent, path)),
    reviewed = Buffer.from(ports.git(a.commit, path));
  if (
    hash(old) !== a.predecessor_sha256 ||
    !old.equals(base) ||
    !Buffer.from(previous).equals(old)
  )
    throw Error('Exact immutable original V1 predecessor required');
  if (hash(reviewed) !== a.sha256)
    throw Error('Fresh exact reviewed V1 source required');
  let admitted = reviewed;
  if (!Buffer.from(current).equals(reviewed)) {
    const successor = cycle33V1ContinuationAuthors.find(
      (s) => s.path === path && s.predecessor === a.commit,
    );
    if (!successor || hash(current) !== successor.sha256)
      throw Error('Fresh exact reviewed V1 source required');
    admitCycle33V1ContinuationSource(path, current, reviewed, ports);
    admitted = Buffer.from(current);
  }
  if (!Buffer.from(ports.read(path)).equals(admitted))
    throw Error('Fresh exact reviewed V1 source required');
  for (const f of a.added) {
    const bytes = Buffer.from(ports.git(a.commit, f.path));
    if (
      hash(bytes) !== f.sha256 ||
      !Buffer.from(ports.read(f.path)).equals(bytes)
    )
      throw Error('Exact current reviewed V1 companion required');
  }
  for (const f of a.original_companions) {
    const bytes = Buffer.from(ports.git(a.predecessor, f.path));
    if (
      hash(bytes) !== f.sha256 ||
      !Buffer.from(ports.read(f.path)).equals(bytes)
    )
      throw Error('Exact immutable original V1 companion required');
  }
  if (!Buffer.from(ports.read(path)).equals(admitted))
    throw Error('Final fresh reviewed V1 source required');
  return {
    module: a.module,
    source_commit: a.commit,
    path,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  };
}
export function admitCycle33V1Published(
  file,
  current,
  publishedCommit,
  supplied = {},
) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    a = cycle33V1Authors.find((a) => a.published && a.path === file?.path),
    hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  if (
    !a ||
    publishedCommit !== a.published.commit ||
    file.sha256 !== a.published.sha256 ||
    (a.published.requires_blob
      ? file.blob !== a.published.blob
      : file.blob !== undefined && file.blob !== a.published.blob)
  )
    throw Error('Exact immutable published V1 metadata required');
  const bytes = Buffer.from(ports.git(a.published.commit, a.path));
  if (
    hash(bytes) !== a.published.sha256 ||
    createHash('sha1')
      .update('blob ' + bytes.length + '\0')
      .update(bytes)
      .digest('hex') !== a.published.blob
  )
    throw Error('Exact immutable published V1 bytes/blob required');
  return admitCycle33V1Source(a.path, current, bytes, ports);
}

// One independently reviewed test-only successor. The historical C16 index,
// publisher bytes and source pins remain immutable; this grants no runtime power.
export const cycle33V1C16TestCompatibility = Object.freeze({
  commit: '8e634b247e09ee589d3a797f5fbfb4651c7146e5',
  parent: '3660a7e6e3d260f0cef54200f723074278f155d7',
  published: 'd62aa76ae03d64863c12dc92ce6f030e37974518',
  path: 'tests/cycle16-integration.test.ts',
  sha256: '4390f6bf0595f4cd7b34bba2d2364fba80748e0227a36dc28dd897f417e53fd5',
  blob: '0ce51ed8d35be7406f044896a6b89fa10d15cd39',
  published_sha256:
    'e92bf92bf96a87b7005ab715406ae424e2f2ccb4ec28da45a3cfc14412f4b247',
  published_blob: 'f5ba8b49ff15520dc6170fac1e2984d6f80b382d',
  index: 'docs/program/CYCLE16_DELIVERY_INDEX.json',
  index_sha256:
    '8cf7783a93dfb523b175bc793813ea28c3ab4dacbadc45453e09317d7da045be',
});
export function admitCycle33V1C16TestCompatibility(
  file,
  current,
  supplied = {},
) {
  const ports = { ...cycle25SourcePorts, ...supplied },
    fixed = cycle33V1C16TestCompatibility,
    hash = (bytes) => createHash('sha256').update(bytes).digest('hex'),
    blob = (bytes) =>
      createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex');
  if (file?.path !== fixed.path || file.sha256 !== fixed.published_sha256)
    throw Error('Exact historical Cycle16 independent test metadata required');
  if (
    [fixed.published, fixed.parent, fixed.commit].some(
      (commit) => ports.type(commit) !== 'commit',
    ) ||
    ports.parent(fixed.commit) !== fixed.parent ||
    ports.delta(fixed.commit) !== `M\t${fixed.path}` ||
    [fixed.published, fixed.parent, fixed.commit].some(
      (commit) => ports.mode(commit, fixed.path) !== '100644',
    ) ||
    ports.mode(fixed.parent, fixed.index) !== '100644'
  )
    throw Error(
      'Exact sole-parent regular Cycle16 test-only correction required',
    );
  const published = Buffer.from(ports.git(fixed.published, fixed.path)),
    original = Buffer.from(ports.git(fixed.parent, fixed.path)),
    reviewed = Buffer.from(ports.git(fixed.commit, fixed.path)),
    index = Buffer.from(ports.git(fixed.parent, fixed.index));
  if (
    hash(published) !== fixed.published_sha256 ||
    blob(published) !== fixed.published_blob ||
    !original.equals(published)
  )
    throw Error('Immutable original Cycle16 independent test bytes required');
  if (
    hash(index) !== fixed.index_sha256 ||
    !Buffer.from(ports.read(fixed.index)).equals(index)
  )
    throw Error('Exact unchanged historical Cycle16 index required');
  if (
    hash(reviewed) !== fixed.sha256 ||
    blob(reviewed) !== fixed.blob ||
    !Buffer.from(current).equals(reviewed) ||
    !Buffer.from(ports.read(fixed.path)).equals(reviewed)
  )
    throw Error('Fresh exact reviewed Cycle16 test correction required');
  return {
    module: 'cycle16-independent-review-test-compatibility',
    source_commit: fixed.commit,
    path: fixed.path,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  };
}
