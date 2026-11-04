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
  if (owners.length !== 1)
    throw Error('No finite Cycle27 owner for replacement');
  const spec = owners[0],
    result = validateCycle27ForwardSpec(spec, ports);
  if (
    !Buffer.from(ports.git(cycle27Parent, path)).equals(Buffer.from(previous))
  )
    throw Error('Cycle27 exact parent must retain original reviewed source');
  if (!Buffer.from(current).equals(Buffer.from(ports.git(spec.commit, path))))
    throw Error('Current source differs from fixed Cycle27 author');
  return result;
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
