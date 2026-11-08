// Build/test evidence only. Never application authority, custody, or restoration.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  lstatSync,
  existsSync,
  readdirSync,
  openSync,
  closeSync,
} from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  trackedSnapshot,
  ports,
  admitFieldSuccessor,
  nativePath,
  predecessor,
} from './v1-field-source-admission.mjs';
import { browserCases } from './foundation-command-supplement.mjs';

export const base = '676e12fd14f75f754a19bf5606a935456853a783';
export const compositionParent = 'be62e1b2e26d7799ec6f9984b8b4a6db44955b21';
export const directory = 'artifacts/cycle33/v1-field-intake';
export const verificationPaths = Object.freeze([
  'scripts/v1-field-intake-integration.mjs',
  'docs/program/V1_FIELD_INTAKE_MANIFEST.json',
  'tests/program/playwright.v1-field-intake.config.ts',
  '.github/workflows/v1-field-intake-integration.yml',
]);
export const mainPaths = Object.freeze([
  'scripts/check-cycle16-integrity.mjs',
  'scripts/check-cycle22.mjs',
  'scripts/check-cycle23.mjs',
  'scripts/cycle25-source-lineage.mjs',
  'scripts/v1-field-source-admission.mjs',
  'scripts/v1-c16-field-inventory-source.mjs',
  'scripts/v1-default-unit-reporter.mjs',
  'tests/v1-field-intake-source.test.mjs',
  'tests/v1-default-unit-reporter.test.mjs',
  'docs/program/V1_FIELD_INTAKE_FOUNDATION_GAPS.json',
  'CURRENT_BUILD_STATE.md',
  'DECISIONS.md',
  'docs/PROGRAM_DELIVERY_STATUS.md',
  'docs/FEATURE_ACCEPTANCE_REGISTER.md',
  'docs/program/V1_INTEGRATION_SCORECARD.json',
  'docs/program/V1_FOUNDATION_COVERAGE_RECONCILIATION.json',
  ...verificationPaths,
  'docs/program/V1_FIELD_INTAKE_VALIDATION.md',
  'docs/program/V1_FIRST_PILOT_WRITER_INVENTORY.md',
]);
const jobs = ['core', 'default-unit', 'recovery-staging', 'default-browser'];
const fixedControlInventories = Object.freeze({
  'field-source': {
    count: 59,
    sha256: '7d570f10dbf9efa08a10eec37b0dd6c9d95f2e14857fde131d324836a3ac5868',
  },
  'main-source': {
    count: 53,
    sha256: 'c0d75d62205bd5a931dee999d8459caf4fc8d325383e9d555af94b7cddb7d437',
  },
  reporter: {
    count: 15,
    sha256: '3a9dcf85ac1f6725daebcf9eb4c3de5c4a837a129a756436bd1af40d78bfa814',
  },
});
const nativeIdentitySha256 =
  '759c73fdf8f2e3d9771abd9729e9acc59be6bb77cc0e4e14b28c5db2ff56d6d5';
const defaultBudgetIdentitySha256 =
  'd83bae2a202009d54ab4dcb9b4d31e27a66367dfc0dbf93242bf7a3c04776191';
const originalPolicyFiles = [
  'vite.config.ts',
  'playwright.config.ts',
  'tests/program/playwright.cycle16.config.ts',
  'tests/program/playwright.cycle16-off.config.ts',
  'tests/program/cycle16-field.spec.ts',
  'tests/program/cycle16-default-off.spec.ts',
  'tests/program/cycle16-browser-helpers.ts',
  'recovery/monterey/requirements.lock',
  'scripts/test-recovery.mjs',
  'scripts/foundation-command-supplement.mjs',
];
const appendOnly = [
  'CURRENT_BUILD_STATE.md',
  'DECISIONS.md',
  'docs/PROGRAM_DELIVERY_STATUS.md',
  'docs/FEATURE_ACCEPTANCE_REGISTER.md',
  'docs/program/V1_FIRST_PILOT_WRITER_INVENTORY.md',
];
const overlaps = [
  'scripts/check-cycle16-integrity.mjs',
  'scripts/v1-field-source-admission.mjs',
];
const nativeFiles = [
  'tests/cycle16-daily-field-guide.test.ts',
  'tests/v1-daily-field-final-authority.test.ts',
  'tests/cycle16-integration.test.ts',
  'tests/cycle22-validation.test.ts',
  'tests/cycle23-validation.test.ts',
  'tests/cycle33-v1-coordinated-source-admission.test.ts',
  'tests/cycle33-v1-c16-test-compatibility.test.ts',
  'tests/program/cycle16-feature-evidence.test.ts',
];
const chain = [
  [
    '12ae7eebcb790c4b17c7c2991e24bcf40fd14bcd',
    base,
    'd977c78991aefed65f28fb643c30f92e5ecc6f7c',
  ],
  [
    'f8c784bb6b4546989c1abea0ea26f716117f5da8',
    '12ae7eebcb790c4b17c7c2991e24bcf40fd14bcd',
    '9b2864feda8f766bec84f7e710fe0be5c534bf45',
  ],
  [
    compositionParent,
    'f8c784bb6b4546989c1abea0ea26f716117f5da8',
    '77ff8d00c4659ab8d5054805f7c59e7752c11419',
  ],
];
const hash = (b) => createHash('sha256').update(b).digest('hex');
const same = (a, b) => Buffer.from(a).equals(Buffer.from(b));
const sorted = (a) => [...a].sort();
const eq = (a, b, message) => assert.deepEqual(a, b, message);
const finite = (n, maximum) =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= maximum;
const git = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
const blob = (commit, path) =>
  execFileSync('git', ['--no-replace-objects', 'show', commit + ':' + path], {
    maxBuffer: 32 * 1024 * 1024,
  });
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const save = (p, value) =>
  writeFileSync(p, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const caseKey = (c) => c.file + ':' + c.api_name;
const jobDirectory = (job) => {
  assert.ok(jobs.includes(job), 'Finite evidence job required');
  return directory + '/' + job;
};
function readRegular(path) {
  assert.equal(typeof path, 'string');
  assert.ok(
    !isAbsolute(path) &&
      !path.split('/').some((x) => !x || x === '.' || x === '..'),
    'Finite relative artifact path required',
  );
  let full = process.cwd();
  for (const part of path.split('/')) {
    full = resolve(full, part);
    assert.equal(
      lstatSync(full).isSymbolicLink(),
      false,
      'Artifact symlinks forbidden',
    );
  }
  assert.ok(lstatSync(full).isFile(), 'Regular artifact required');
  return readFileSync(full);
}
function artifactFiles(path) {
  if (!existsSync(path)) return [];
  assert.ok(
    !lstatSync(path).isSymbolicLink() && lstatSync(path).isDirectory(),
    'Regular artifact directory required',
  );
  return readdirSync(path).flatMap((name) => {
    const p = path + '/' + name,
      s = lstatSync(p);
    assert.equal(s.isSymbolicLink(), false, 'Artifact symlinks forbidden');
    return s.isDirectory()
      ? artifactFiles(p)
      : s.isFile()
        ? [p]
        : (() => {
            throw Error('Regular artifact entry required');
          })();
  });
}
export function validateManifest(m) {
  assert.equal(m?.schema, 'propel-v1-field-intake-integration-v1');
  assert.equal(m.base, base);
  assert.equal(m.composition_parent, compositionParent);
  eq(m.main_files, mainPaths, 'Exact fixed Main22 paths required');
  eq(m.append_only, appendOnly);
  eq(m.allowed_source_overlaps, overlaps);
  eq(
    m.intake,
    {
      included: false,
      decision: 'EXCLUDED_BY_ROOT',
      composition: null,
      files: [],
    },
    'Only fixed Field-only scope is admitted; future intake requires separate review',
  );
  assert.equal(m.expected_tracked_files, 2224);
  assert.ok(
    Array.isArray(m.author_bundles) && m.author_bundles.length === 3,
    'Exactly three reviewed source bundles required',
  );
  eq(
    m.author_bundles.map((a) => [a.author, a.composition]),
    chain.map(([composition, , author]) => [author, composition]),
  );
  eq(sorted(Object.keys(m.native.files)), sorted(nativeFiles));
  assert.equal(m.native.count, 306);
  assert.ok(Array.isArray(m.native.cases) && m.native.cases.length === 306);
  assert.equal(new Set(m.native.cases.map(caseKey)).size, 306);
  assert.ok(
    m.native.cases.every(
      (c) =>
        nativeFiles.includes(c.file) &&
        typeof c.api_name === 'string' &&
        c.api_name.trim(),
    ),
  );
  eq(
    [
      m.native.test_timeout_ms,
      m.native.hook_timeout_ms,
      m.native.max_workers,
      m.native.retry,
    ],
    [30000, 30000, 2, 0],
  );
  assert.equal(
    m.native.collection,
    'VITEST_RUNTIME_NO_STATIC_PARSE_NOT_CASE_EXECUTION',
  );
  assert.equal(m.native.identities_sha256, nativeIdentitySha256);
  assert.equal(
    hash(JSON.stringify(sorted(m.native.cases.map(caseKey)))),
    nativeIdentitySha256,
    'Literal runtime-native identities required',
  );
  eq(
    sorted(Object.keys(m.original_policies.files)),
    sorted(originalPolicyFiles),
    'Finite original policy source paths required',
  );
  assert.equal(
    hash(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(
            m.original_policies.default_browser_body_budgets,
          ).sort(),
        ),
      ),
    ),
    defaultBudgetIdentitySha256,
    'Original twelve finite body budgets required',
  );
  assert.equal(m.original_policies.node, '24.22.2');
  assert.equal(m.original_policies.python, '3.13.16');
  eq(
    [
      m.original_policies.default_unit_job_minutes,
      m.original_policies.default_browser_job_minutes,
      m.original_policies.recovery_staging_job_minutes,
    ],
    [45, 45, 15],
  );
  assert.equal(m.original_policies.default_unit_max_workers, 4);
  eq(m.protected, {
    hashes: 128,
    design_files: 5,
    design_bindings: 13,
    features: 25,
  });
  eq(
    [m.authority, m.full_foundation_pass, m.release],
    [
      'SOURCE_AND_TEST_EVIDENCE_ONLY_NOT_OPERATIONAL_ACCEPTANCE',
      false,
      'NOT_READY_NOT_AUTHORIZED',
    ],
  );
  assert.ok(Array.isArray(m.control_gates) && m.control_gates.length === 3);
  eq(
    m.control_gates.map((g) => g.key),
    ['field-source', 'main-source', 'reporter'],
  );
  eq(
    m.control_gates.map((g) => g.file),
    [
      'tests/v1-field-source-admission.test.mjs',
      'tests/v1-field-intake-source.test.mjs',
      'tests/v1-default-unit-reporter.test.mjs',
    ],
  );
  for (const g of m.control_gates)
    assert.ok(
      Array.isArray(g.titles) &&
        g.titles.length > 0 &&
        new Set(g.titles).size === g.titles.length &&
        g.titles.every((t) => typeof t === 'string' && t.trim()),
      'Root must freeze literal control identities before execution',
    );
  for (const gate of m.control_gates) {
    assert.equal(
      gate.titles.length,
      fixedControlInventories[gate.key].count,
      'Exact reviewed control count required',
    );
    assert.equal(
      hash(JSON.stringify(sorted(gate.titles))),
      fixedControlInventories[gate.key].sha256,
      'Exact reviewed literal control identity hash required',
    );
  }
  return m;
}
export function validateSourceProfile(facts, m) {
  validateManifest(m);
  for (const key of ['candidate', 'checkout', 'tree', 'candidate_tree'])
    assert.match(
      facts[key] ?? '',
      /^[a-f0-9]{40}$/,
      'Exact source SHA required',
    );
  assert.equal(
    facts.tree,
    facts.candidate_tree,
    'Candidate/carrier tree mismatch',
  );
  const parent = compositionParent;
  assert.match(parent ?? '', /^[a-f0-9]{40}$/);
  assert.equal(
    facts.candidate_parent,
    parent,
    'Exact finite Main foot parent required',
  );
  assert.ok(
    Array.isArray(facts.checkout_parents),
    'Actual checkout parent list required',
  );
  if (facts.checkout === facts.candidate)
    eq(facts.checkout_parents, [compositionParent]);
  if (facts.checkout !== facts.candidate)
    eq(
      sorted(facts.checkout_parents),
      sorted([base, facts.candidate]),
      'Exact original316/candidate carrier required',
    );
  eq(
    facts.composition_chain,
    chain.map(([commit, parent]) => ({ commit, parent })),
    'Only three exact reviewed composition commits allowed',
  );
  eq(
    sorted(facts.main_delta_paths),
    sorted(mainPaths),
    'Exact Main22 foot paths required',
  );
  return {
    candidate: facts.candidate,
    checkout: facts.checkout,
    tree: facts.tree,
    base,
    whole_foundation: false,
    operational_acceptance: false,
  };
}
function sourceIdentity() {
  const m = validateManifest(
    json('docs/program/V1_FIELD_INTAKE_MANIFEST.json'),
  );
  const candidate = process.env.CANDIDATE_HEAD || git('rev-parse', 'HEAD');
  assert.match(candidate, /^[a-f0-9]{40}$/);
  assert.equal(git('cat-file', '-t', candidate), 'commit');
  const checkout = git('rev-parse', 'HEAD'),
    tree = git('rev-parse', 'HEAD^{tree}');
  if (process.env.GITHUB_ACTIONS === 'true') {
    assert.equal(process.version, 'v24.22.2');
    assert.equal(process.env.CANDIDATE_HEAD, candidate);
    assert.equal(
      process.env.GITHUB_SHA,
      checkout,
      'Actual provider checkout required',
    );
  }
  const parent = compositionParent;
  const facts = {
    candidate,
    checkout,
    tree,
    candidate_tree: git('rev-parse', candidate + '^{tree}'),
    candidate_parent: git('show', '--no-patch', '--format=%P', candidate),
    checkout_parents: git('show', '--no-patch', '--format=%P', checkout).split(
      ' ',
    ),
    composition_chain: chain.map(([commit]) => ({
      commit,
      parent: git('show', '--no-patch', '--format=%P', commit),
    })),
    main_delta_paths: git(
      'diff',
      '--name-only',
      '--no-renames',
      parent,
      candidate,
    ).split('\n'),
  };
  validateSourceProfile(facts, m);
  git('merge-base', '--is-ancestor', base, candidate);
  eq(
    git('rev-list', '--reverse', base + '..' + candidate).split('\n'),
    [...chain.map(([c]) => c), candidate],
    'Exact finite nonmerge ancestry required',
  );
  const allowed = new Set(mainPaths);
  for (const [i, s] of m.author_bundles.entries()) {
    assert.equal(s.author, chain[i][2]);
    assert.equal(s.composition, chain[i][0]);
    assert.equal(
      git('show', '--no-patch', '--format=%P', s.author),
      s.author_parent,
    );
    eq(
      git(
        'diff-tree',
        '--no-commit-id',
        '--name-status',
        '--no-renames',
        '-r',
        s.author,
      )
        .split('\n')
        .sort(),
      s.files.map((f) => f.delta + '\t' + f.path).sort(),
    );
    eq(
      git(
        'diff-tree',
        '--no-commit-id',
        '--name-status',
        '--no-renames',
        '-r',
        s.composition,
      )
        .split('\n')
        .sort(),
      s.files.map((f) => f.delta + '\t' + f.path).sort(),
    );
    for (const f of s.files) {
      allowed.add(f.path);
      assert.equal(ports.mode(s.author, f.path), '100644');
      assert.equal(ports.mode(s.composition, f.path), '100644');
      assert.equal(hash(blob(s.author, f.path)), f.sha256);
      eq(blob(s.composition, f.path), blob(s.author, f.path));
      if (!overlaps.includes(f.path))
        eq(
          readRegular(f.path),
          blob(s.author, f.path),
          'Complete exact reviewed authored bundle required',
        );
    }
  }
  eq(
    git('diff', '--name-only', '--no-renames', base, candidate)
      .split('\n')
      .sort(),
    [...allowed]
      .filter((f) => {
        try {
          return !same(blob(base, f), blob(candidate, f));
        } catch {
          return true;
        }
      })
      .sort(),
    'Only finite reviewed author/Main source paths allowed',
  );
  for (const f of mainPaths) assert.equal(ports.mode('HEAD', f), '100644');
  for (const f of appendOnly)
    assert.ok(
      readFileSync(f).subarray(0, blob(base, f).length).equals(blob(base, f)),
      'Append-only original316 prefix required',
    );
  for (const [f, pin] of Object.entries({
    ...m.native.files,
    ...m.original_policies.files,
  }))
    assert.equal(
      hash(readRegular(f)),
      pin,
      'Original source/config/budget bytes required',
    );
  const protectedSources = json(
      'docs/program/CYCLE4_PROTECTED_SOURCE.json',
    ).files,
    design = json('docs/program/DESIGN_SYSTEM_CONTRACT.json'),
    features = json('docs/FEATURE_ACCEPTANCE_EVIDENCE.json').features,
    scorecard = json('docs/program/V1_INTEGRATION_SCORECARD.json').features;
  eq(
    [
      protectedSources.length,
      design.locks.length,
      design.bindings.length,
      features.length,
      scorecard.length,
    ],
    [128, 5, 13, 25, 25],
  );
  for (const f of [...protectedSources, ...design.locks])
    assert.equal(hash(readRegular(f.path)), f.sha256);
  const baseline = JSON.parse(
    blob(base, 'docs/FEATURE_ACCEPTANCE_EVIDENCE.json'),
  ).features;
  eq(features, baseline, 'All25 baseline records remain immutable');
  eq(
    scorecard.map(({ id, local, hosted, release }) => ({
      id,
      local,
      hosted,
      release,
    })),
    baseline.map(({ id, local, hosted, release }) => ({
      id,
      local,
      hosted,
      release,
    })),
    'All25 scorecard IDs/statuses stay original',
  );
  const filesBefore = trackedSnapshot();
  const pkg = json('docs/program/CYCLE16_DELIVERY_INDEX.json').packages[0];
  const field = admitFieldSuccessor(
    nativePath,
    ports.read(nativePath),
    ports.git(predecessor, nativePath),
    pkg,
  );
  eq(field, {
    path: nativePath,
    source_commit: 'd977c78991aefed65f28fb643c30f92e5ecc6f7c',
    original_publisher: '7eee0b4527646c470d3604b6d21ac7578d073fee',
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  });
  return { manifest: m, facts, field, filesBefore };
}
// Imported lazily only by actual CLI binding; pure report validators perform no source or test execution.
async function identity() {
  const first = sourceIdentity();
  const inventory = await import('./v1-c16-field-inventory-source.mjs');
  const file = json('docs/program/CYCLE16_DELIVERY_INDEX.json')
    .independent_files[0];
  const receipt = inventory.admitFieldInventorySource(
    file,
    readFileSync(file.path),
    blob('8e634b247e09ee589d3a797f5fbfb4651c7146e5', file.path),
  );
  assert.equal(
    receipt.source_commit,
    '77ff8d00c4659ab8d5054805f7c59e7752c11419',
  );
  assert.equal(receipt.business_authority, false);
  assert.equal(receipt.restore_adapter, false);
  assert.equal(
    git('rev-parse', 'HEAD'),
    first.facts.checkout,
    'Source callbacks cannot change checkout metadata',
  );
  assert.equal(
    git('rev-parse', 'HEAD^{tree}'),
    first.facts.tree,
    'Source callbacks cannot change source tree',
  );
  const files = trackedSnapshot();
  assert.equal(
    Object.keys(files).length,
    2224,
    'Exact fixed Field-only tracked source inventory required',
  );
  eq(
    files,
    first.filesBefore,
    'No source callback may change any tracked byte',
  );
  return {
    ...validateSourceProfile(first.facts, first.manifest),
    manifest_sha256: hash(
      readFileSync('docs/program/V1_FIELD_INTAKE_MANIFEST.json'),
    ),
    files,
    source_admissions: { field: first.field, inventory: receipt },
    intake_included: first.manifest.intake.included,
    operational_acceptance: false,
  };
}

export function validateTapReport(text, titles) {
  assert.equal(typeof text, 'string');
  assert.ok(
    Array.isArray(titles) &&
      titles.length > 0 &&
      new Set(titles).size === titles.length,
    'Frozen literal TAP titles required',
  );
  for (const [name, value] of Object.entries({
    tests: titles.length,
    pass: titles.length,
    fail: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
  }))
    eq(
      [...text.matchAll(new RegExp('^# ' + name + ' (\\d+)$', 'gm'))].map((m) =>
        Number(m[1]),
      ),
      [value],
      'Strict zero-error TAP summary required',
    );
  const rows = [...text.matchAll(/^ok (\d+) - (.+)$/gm)];
  eq(
    rows.map((r) => Number(r[1])),
    titles.map((_, i) => i + 1),
    'Complete ordered TAP rows required',
  );
  eq(
    sorted(rows.map((r) => r[2])),
    sorted(titles),
    'Exact literal TAP control identities required',
  );
  eq(
    [...text.matchAll(/^1\.\.(\d+)$/gm)].map((m) => Number(m[1])),
    [titles.length],
  );
  assert.equal([...text.matchAll(/^TAP version 13$/gm)].length, 1);
  assert.ok(
    !/^not ok |^ok[^\n]*#\s*(?:SKIP|TODO)\b/im.test(text),
    'No failed or annotated TAP case permitted',
  );
  return {
    passed: titles.length,
    identities_sha256: hash(JSON.stringify(sorted(titles))),
    scope: 'CONTROLLED_SOURCE_REPORT_TESTS_NOT_APPLICATION_ACCEPTANCE',
  };
}
function nativePolicy(m) {
  return m.native;
}
function validateNativePolicy(policy) {
  assert.ok(
    Number.isSafeInteger(policy?.count) && policy.count > 0,
    'Nonempty supplied literal identity policy required',
  );
  assert.ok(
    policy.files &&
      typeof policy.files === 'object' &&
      !Array.isArray(policy.files) &&
      Object.keys(policy.files).length > 0,
  );
  assert.equal(
    policy.test_timeout_ms,
    30000,
    'Original native case budget cannot be widened',
  );
  for (const [key, value] of Object.entries({
    hook_timeout_ms: 30000,
    max_workers: 2,
    retry: 0,
  }))
    if (Object.hasOwn(policy, key))
      assert.equal(
        policy[key],
        value,
        'Original optional execution policy required',
      );
  assert.ok(
    Array.isArray(policy.cases) && policy.cases.length === policy.count,
  );
  assert.equal(new Set(policy.cases.map(caseKey)).size, policy.count);
  assert.ok(
    policy.cases.every(
      (c) =>
        Object.hasOwn(policy.files, c.file) &&
        typeof c.api_name === 'string' &&
        c.api_name.trim(),
    ),
    'Supplied literal file/case identities required',
  );
}
export function validateNativeCollection(report, policy, root = process.cwd()) {
  validateNativePolicy(policy);
  assert.ok(Array.isArray(report), 'Real runtime collection array required');
  const rows = report.map((c) => {
    assert.ok(
      c &&
        typeof c.file === 'string' &&
        typeof c.name === 'string' &&
        c.name.trim(),
    );
    assert.ok(c.file.startsWith(resolve(root) + '/'));
    const file = relative(root, c.file).replaceAll('\\', '/');
    assert.ok(
      Object.hasOwn(policy.files, file),
      'Only selected native files allowed',
    );
    return { file, api_name: c.name };
  });
  assert.equal(rows.length, policy.count);
  assert.equal(new Set(rows.map(caseKey)).size, policy.count);
  eq(
    sorted(rows.map(caseKey)),
    sorted(policy.cases.map(caseKey)),
    'Exact runtime-collected native identities required',
  );
  return {
    collected: rows.length,
    files: Object.keys(policy.files).length,
    identities_sha256: hash(JSON.stringify(sorted(rows.map(caseKey)))),
    case_execution: false,
    structural_validation_only: true,
    requires_source_binding: true,
  };
}
export function validateNativeReport(r, policy, root = process.cwd()) {
  validateNativePolicy(policy);
  assert.equal(r?.success, true, 'Native report must succeed');
  for (const [key, value] of Object.entries({
    numTotalTests: policy.count,
    numPassedTests: policy.count,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
  }))
    assert.equal(r[key], value, 'Strict native counter ' + key);
  if (Object.hasOwn(r, 'numRuntimeErrorTestSuites'))
    assert.equal(r.numRuntimeErrorTestSuites, 0);
  for (const key of ['unhandledErrors', 'errors'])
    if (Object.hasOwn(r, key))
      eq(r[key], [], 'No native runtime errors permitted');
  assert.ok(
    Number.isSafeInteger(r.numTotalTestSuites) &&
      r.numTotalTestSuites >= Object.keys(policy.files).length,
  );
  assert.equal(r.numPassedTestSuites, r.numTotalTestSuites);
  assert.ok(Array.isArray(r.testResults), 'Real native file array required');
  assert.equal(r.testResults.length, Object.keys(policy.files).length);
  const ids = [],
    files = [];
  for (const f of r.testResults) {
    assert.equal(typeof f.name, 'string');
    assert.ok(f.name.startsWith(resolve(root) + '/'));
    const file = relative(root, f.name).replaceAll('\\', '/');
    assert.ok(Object.hasOwn(policy.files, file));
    files.push(file);
    assert.equal(f.status, 'passed');
    assert.equal(f.message, '');
    assert.ok(
      Array.isArray(f.assertionResults) && f.assertionResults.length > 0,
    );
    for (const a of f.assertionResults) {
      assert.equal(a.status, 'passed');
      eq(a.failureMessages, []);
      assert.ok(
        Array.isArray(a.ancestorTitles) &&
          a.ancestorTitles.every((t) => typeof t === 'string'),
      );
      assert.equal(typeof a.title, 'string');
      assert.ok(a.title.trim());
      eq(
        a.fullName,
        [...a.ancestorTitles, a.title].join(' '),
        'Original JSON literal fullName required',
      );
      assert.ok(
        finite(a.duration, policy.test_timeout_ms),
        'Original native case budget required',
      );
      ids.push(file + ':' + [...a.ancestorTitles, a.title].join(' > '));
    }
  }
  eq(sorted(files), sorted(Object.keys(policy.files)));
  assert.equal(new Set(ids).size, policy.count);
  eq(
    sorted(ids),
    sorted(policy.cases.map(caseKey)),
    'Exact literal native file/case identities required',
  );
  return {
    passed: policy.count,
    failed: 0,
    skipped: 0,
    todo: 0,
    files: files.length,
    identities_sha256: hash(JSON.stringify(sorted(ids))),
    structural_validation_only: true,
    requires_source_binding: true,
    whole_foundation: false,
  };
}
function realBrowserArrays(report) {
  assert.ok(Array.isArray(report?.suites), 'Real browser suite array required');
  function visit(s) {
    if (Object.hasOwn(s, 'specs'))
      assert.ok(Array.isArray(s.specs), 'Real spec array required');
    if (Object.hasOwn(s, 'suites'))
      assert.ok(Array.isArray(s.suites), 'Real child suite array required');
    for (const x of s.specs ?? [])
      assert.ok(Array.isArray(x.tests), 'Real browser test array required');
    for (const c of s.suites ?? []) visit(c);
  }
  for (const s of report.suites) visit(s);
  assert.ok(Array.isArray(report.errors), 'Real browser errors array required');
  return browserCases(report);
}
export function validateBrowserReport(
  r,
  expected,
  source,
  mode,
  { collection = false, ci = process.env.GITHUB_ACTIONS === 'true' } = {},
) {
  const rows = realBrowserArrays(r);
  eq(r.errors, []);
  assert.equal(rows.size, expected.count);
  assert.ok(Array.isArray(r.config?.projects));
  eq(sorted(r.config.projects.map((p) => p.name)), sorted(expected.projects));
  assert.equal(r.config.workers, expected.workers);
  for (const p of r.config.projects) {
    assert.equal(p.timeout, expected.timeout_ms);
    assert.equal(p.retries, 0);
    assert.equal(p.repeatEach, 1);
  }
  const metadata = r.config.metadata;
  assert.ok(metadata && typeof metadata === 'object');
  eq(
    [
      metadata.schema,
      metadata.candidate,
      metadata.source_checkout,
      metadata.source_tree,
      metadata.mode,
      metadata.operational_acceptance,
    ],
    [
      'propel-v1-field-intake-browser-v1',
      source.candidate,
      source.checkout,
      source.tree,
      mode,
      false,
    ],
  );
  if (Object.hasOwn(metadata, 'gitCommit'))
    assert.equal(
      metadata.gitCommit?.hash,
      source.checkout,
      'Any Git metadata must match actual checkout',
    );
  if (Object.hasOwn(metadata, 'ci'))
    assert.equal(
      metadata.ci?.commitHash,
      source.checkout,
      'Any CI metadata must match actual checkout',
    );
  if (ci)
    assert.equal(
      metadata.ci?.commitHash,
      source.checkout,
      'Actual CI report source required',
    );
  const ids = [];
  for (const [id, { file, spec, test }] of rows) {
    assert.equal(file, expected.file);
    ids.push(id);
    assert.equal(test.timeout, expected.timeout_ms);
    assert.equal(test.expectedStatus, 'passed');
    assert.ok(Array.isArray(test.annotations));
    assert.ok(
      !test.annotations.some((a) =>
        ['skip', 'fixme', 'fail', 'slow'].includes(a.type),
      ),
    );
    if (collection) {
      eq(test.results, []);
      continue;
    }
    assert.equal(spec.ok, true);
    assert.equal(test.status, 'expected');
    assert.ok(Array.isArray(test.results));
    assert.equal(test.results.length, 1);
    const result = test.results[0];
    assert.equal(result.status, 'passed');
    assert.equal(result.retry, 0);
    assert.ok(finite(result.duration, expected.timeout_ms));
    eq(result.errors, []);
    assert.ok(!result.error);
    assert.ok(Array.isArray(result.attachments));
    assert.ok(
      Number.isFinite(Date.parse(result.startTime)) &&
        Date.parse(result.startTime) >= source.started_epoch_ms,
    );
  }
  assert.equal(new Set(ids).size, expected.count);
  eq(
    sorted(ids),
    sorted(expected.cases),
    'Exact literal browser identities required',
  );
  if (!collection) {
    eq(
      [r.stats.expected, r.stats.unexpected, r.stats.skipped, r.stats.flaky],
      [expected.count, 0, 0, 0],
    );
    assert.ok(Date.parse(r.stats.startTime) >= source.started_epoch_ms);
  }
  return {
    mode,
    collected: ids.length,
    passed: collection ? null : ids.length,
    case_execution: !collection,
    identities_sha256: hash(JSON.stringify(sorted(ids))),
    whole_foundation: false,
  };
}
export function validateDefaultBrowserReports(
  collection,
  actual,
  inventory,
  source,
  budgets,
  { ci = process.env.GITHUB_ACTIONS === 'true' } = {},
) {
  const expected = realBrowserArrays(collection),
    observed = realBrowserArrays(actual);
  eq(collection.errors, []);
  eq(actual.errors, []);
  assert.equal(expected.size, observed.size);
  assert.equal(actual.stats.unexpected, 0);
  assert.equal(actual.stats.flaky, 0);
  const projects = [
    'desktop',
    'tablet',
    'mobile',
    'desktop-journey',
    'tablet-journey',
    'mobile-journey',
  ];
  for (const report of [collection, actual]) {
    assert.ok(Array.isArray(report.config?.projects));
    eq(sorted(report.config.projects.map((p) => p.name)), sorted(projects));
    for (const p of report.config.projects)
      eq([p.timeout, p.retries, p.repeatEach], [30000, 0, 1]);
  }
  assert.ok(
    Number.isSafeInteger(collection.config.workers) &&
      collection.config.workers > 0,
  );
  assert.equal(
    actual.config.workers,
    collection.config.workers,
    'Original default allocation must remain unchanged',
  );
  for (const report of [collection, actual]) {
    const metadata = report.config.metadata ?? {};
    if (Object.hasOwn(metadata, 'gitCommit'))
      assert.equal(metadata.gitCommit?.hash, source.checkout);
    if (Object.hasOwn(metadata, 'ci'))
      assert.equal(metadata.ci?.commitHash, source.checkout);
    if (ci) {
      assert.equal(metadata.gitCommit?.hash, source.checkout);
      assert.equal(metadata.ci?.commitHash, source.checkout);
    }
  }
  let passed = 0,
    skipped = 0,
    expectedFailures = 0;
  const files = new Set();
  for (const [id, before] of expected) {
    const now = observed.get(id);
    assert.ok(now, 'Exact browser identity required');
    assert.equal(now.spec.ok, true);
    assert.ok(inventory.includes('tests/browser/' + now.file));
    assert.equal(
      now.test.projectName.endsWith('-journey'),
      now.file === 'cycle6-journey.spec.ts',
    );
    const budget =
      budgets[
        before.file + ':' + before.spec.line + ':' + before.spec.column
      ] ?? before.test.timeout;
    assert.equal(
      now.test.timeout,
      budget,
      'Original declaration-local budget required',
    );
    assert.equal(now.test.expectedStatus, before.test.expectedStatus);
    files.add('tests/browser/' + now.file);
    const t = now.test;
    assert.ok(Array.isArray(t.results));
    if (t.expectedStatus === 'skipped') {
      assert.equal(t.status, 'skipped');
      assert.ok(t.results.length <= 1);
      for (const r of t.results) {
        assert.equal(r.status, 'skipped');
        assert.equal(r.retry, 0);
        assert.ok(finite(r.duration, budget));
        eq(r.errors, []);
      }
      skipped++;
      continue;
    }
    assert.ok(['passed', 'failed'].includes(t.expectedStatus));
    assert.equal(t.status, 'expected');
    assert.equal(t.results.length, 1);
    const r = t.results[0];
    assert.equal(r.status, t.expectedStatus);
    assert.equal(r.retry, 0);
    assert.ok(finite(r.duration, budget));
    assert.ok(Array.isArray(r.errors));
    if (t.expectedStatus === 'passed') {
      eq(r.errors, []);
      assert.ok(!r.error);
      passed++;
    } else expectedFailures++;
  }
  eq(
    sorted([...files]),
    sorted(inventory),
    'Every actually collected default source file required',
  );
  assert.equal(passed + expectedFailures, actual.stats.expected);
  assert.equal(skipped, actual.stats.skipped);
  return {
    collected: expected.size,
    passed,
    declared_skipped: skipped,
    declared_expected_failures: expectedFailures,
    source_files: files.size,
    workers: actual.config.workers,
    whole_foundation: false,
    operational_acceptance: false,
  };
}
export function validateCaptureMetadata(metadata, brand, project, checkout) {
  eq(
    sorted(Object.keys(metadata ?? {})),
    sorted(['schema', 'brand', 'viewport', 'source', 'approval', 'release']),
  );
  eq(
    metadata,
    {
      schema: 'propel-cycle16-capture-v1',
      brand,
      viewport: project,
      source: checkout,
      approval: 'PENDING',
      release: 'NOT_READY_NOT_AUTHORIZED',
    },
    'Exact original capture source metadata required',
  );
  return { source: checkout, brand, project, approval: false };
}
export async function decodePNG(bytes) {
  assert.ok(
    Buffer.isBuffer(bytes) &&
      bytes.length >= 45 &&
      bytes.length <= 25 * 1024 * 1024,
    'Finite complete PNG required',
  );
  eq(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  eq(
    bytes.subarray(-12),
    Buffer.from('0000000049454e44ae426082', 'hex'),
    'Complete PNG IEND required',
  );
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  assert.ok(
    width > 0 && height > 0 && width * height <= 40000000,
    'Finite PNG dimensions required',
  );
  const { default: sharp } = await import('sharp');
  const decoded = await sharp(bytes, {
    failOn: 'warning',
    limitInputPixels: 40000000,
  })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  eq(
    [
      decoded.info.width,
      decoded.info.height,
      decoded.info.channels,
      decoded.data.length,
    ],
    [width, height, 4, width * height * 4],
  );
  return {
    sha256: hash(bytes),
    bytes: bytes.length,
    width,
    height,
    decoded: true,
  };
}

async function bind(job) {
  const d = jobDirectory(job);
  mkdirSync(d, { recursive: true });
  writeFileSync(
    d + '/before-status-porcelain.txt',
    execFileSync('git', ['status', '--porcelain', '--untracked-files=all']),
    { flag: 'wx' },
  );
  if (job === 'core')
    assert.equal(
      artifactFiles('artifacts/cycle16').filter((f) => /\.(png|json)$/.test(f))
        .length,
      0,
      'Fresh original Field capture paths required; preserve prior files separately',
    );
  if (job === 'default-browser')
    assert.equal(
      artifactFiles('artifacts').filter((f) => f.endsWith('.png')).length,
      0,
      'Fresh current-job default PNG paths required; never reuse old images',
    );
  const source = await identity();
  save(d + '/before.json', {
    job,
    source,
    started_epoch_ms: Date.now(),
    node: process.version,
    runner: {
      platform: process.platform,
      os: process.env.RUNNER_OS ?? null,
      image: process.env.ImageOS ?? null,
      image_version: process.env.ImageVersion ?? null,
    },
    full_foundation_pass: false,
  });
}
async function binding(job) {
  const b = json(jobDirectory(job) + '/before.json');
  assert.equal(b.job, job);
  assert.ok(Number.isFinite(b.started_epoch_ms));
  eq(
    await identity(),
    b.source,
    'Complete before/current committed source identity required',
  );
  return b;
}
async function final(job) {
  const d = jobDirectory(job);
  mkdirSync(d, { recursive: true });
  const raw = execFileSync('git', [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
  ]);
  writeFileSync(d + '/final-status-porcelain.txt', raw, { flag: 'wx' });
  try {
    const b = await binding(job);
    save(d + '/final.json', {
      ...b,
      unchanged: true,
      raw_status_bytes: raw.length,
    });
    assert.equal(raw.length, 0, 'Raw final dirty inventory must be empty');
  } catch (error) {
    save(d + '/final-failure.json', {
      classification: 'SOURCE_FINAL_FAILED_NOT_CLEAN_ACCEPTANCE',
      message: error.message,
      raw_status_bytes: raw.length,
      full_foundation_pass: false,
    });
    throw error;
  }
}
function command(job, name, args, extra = {}) {
  const d = jobDirectory(job);
  assert.ok(/^[a-z0-9-]+$/.test(name));
  const out = openSync(d + '/' + name + '.stdout', 'wx'),
    err = openSync(d + '/' + name + '.stderr', 'wx');
  let result;
  try {
    result = spawnSync(args[0], args.slice(1), {
      env: { ...process.env, ...extra },
      stdio: ['ignore', out, err],
    });
  } finally {
    closeSync(out);
    closeSync(err);
  }
  save(d + '/' + name + '.command.json', {
    command: args,
    exit_code: result.status,
    signal: result.signal,
    spawn_error: result.error?.code ?? null,
    stdout_sha256: hash(readFileSync(d + '/' + name + '.stdout')),
    stderr_sha256: hash(readFileSync(d + '/' + name + '.stderr')),
  });
  assert.ok(
    !result.error && !result.signal && result.status === 0,
    'Original ' + name + ' command failed; preserve its raw evidence',
  );
}
async function runControls() {
  const b = await binding('core'),
    m = validateManifest(json('docs/program/V1_FIELD_INTAKE_MANIFEST.json')),
    proofs = [];
  for (const gate of m.control_gates) {
    command('core', gate.key, [
      'node',
      '--test',
      '--test-concurrency=1',
      '--test-timeout=30000',
      '--test-reporter=tap',
      gate.file,
    ]);
    const bytes = readRegular(
      jobDirectory('core') + '/' + gate.key + '.stdout',
    );
    proofs.push({
      ...validateTapReport(bytes.toString(), gate.titles),
      gate: gate.key,
      sha256: hash(bytes),
    });
  }
  save(jobDirectory('core') + '/controls-verification.json', {
    source: b.source,
    gates: proofs,
    full_foundation_pass: false,
  });
}
async function collectNative() {
  await binding('core');
  const m = validateManifest(
      json('docs/program/V1_FIELD_INTAKE_MANIFEST.json'),
    ),
    p = nativePolicy(m),
    output = jobDirectory('core') + '/native-collection.json';
  assert.ok(!existsSync(output));
  command('core', 'native-collection', [
    'npx',
    '--no-install',
    'vitest',
    'list',
    '--no-static-parse',
    ...Object.keys(p.files),
    '--maxWorkers=2',
    '--retry=0',
    '--json=' + output,
  ]);
  save(
    jobDirectory('core') + '/native-collection-verification.json',
    validateNativeCollection(json(output), p),
  );
}
async function runNative() {
  const b = await binding('core'),
    m = validateManifest(json('docs/program/V1_FIELD_INTAKE_MANIFEST.json')),
    p = nativePolicy(m),
    d = jobDirectory('core');
  validateNativeCollection(json(d + '/native-collection.json'), p);
  assert.ok(!existsSync(d + '/native.json'));
  command('core', 'native', [
    'npx',
    '--no-install',
    'vitest',
    'run',
    ...Object.keys(p.files),
    '--maxWorkers=2',
    '--retry=0',
    '--reporter=json',
    '--outputFile=' + d + '/native.json',
  ]);
  const bytes = readRegular(d + '/native.json');
  save(d + '/native-verification.json', {
    ...validateNativeReport(JSON.parse(bytes), p),
    sha256: hash(bytes),
    source: b.source,
  });
}
async function browser(mode, collection) {
  const b = await binding('core'),
    m = validateManifest(json('docs/program/V1_FIELD_INTAKE_MANIFEST.json')),
    d = jobDirectory('core');
  assert.ok(['field', 'off'].includes(mode));
  const name = mode + (collection ? '-collection' : ''),
    output = d + '/' + name + '.json';
  assert.ok(!existsSync(output));
  const args = [
    'npx',
    '--no-install',
    'playwright',
    'test',
    '-c',
    m.browser.config,
    '--workers=' + m.browser[mode].workers,
  ];
  if (collection) args.push('--list', '--reporter=json');
  command('core', name, args, {
    V1_FIELD_INTAKE_BROWSER_MODE: mode,
    ...(collection ? { PLAYWRIGHT_JSON_OUTPUT_FILE: resolve(output) } : {}),
  });
  const bytes = readRegular(output);
  save(d + '/' + name + '-verification.json', {
    ...validateBrowserReport(
      JSON.parse(bytes),
      m.browser[mode],
      { ...b.source, started_epoch_ms: b.started_epoch_ms },
      mode,
      { collection },
    ),
    sha256: hash(bytes),
    source: b.source,
  });
}
async function screenshots() {
  const b = await binding('core'),
    m = validateManifest(json('docs/program/V1_FIELD_INTAKE_MANIFEST.json')),
    pairs = [],
    expected = [];
  for (const id of m.browser.field.cases) {
    const [project, , , , title] = JSON.parse(id);
    assert.ok(title.startsWith('daily field guide / '));
    const brand = title.slice('daily field guide / '.length);
    assert.match(brand, /^[a-z0-9-]+$/);
    const stem =
      'artifacts/cycle16/field-daily-evidence-' + project + '-' + brand;
    const png = readRegular(stem + '.png'),
      metadata = json(stem + '.json');
    validateCaptureMetadata(metadata, brand, project, b.source.checkout);
    pairs.push({
      path: stem + '.png',
      ...(await decodePNG(png)),
      capture_metadata_path: stem + '.json',
      capture_metadata_sha256: hash(readRegular(stem + '.json')),
      source_checkout: b.source.checkout,
      source_tree: b.source.tree,
      whole_job_source_hash: hash(JSON.stringify(b.source.files)),
      source_binding: 'WHOLE_CLEAN_JOB_BEFORE_FINAL_NOT_CAPTURE_TIME',
      visual_approval: false,
    });
    expected.push(stem + '.png');
  }
  eq(
    artifactFiles('artifacts/cycle16')
      .filter((f) => f.endsWith('.png'))
      .sort(),
    expected.sort(),
    'Exact9 original Field PNGs required',
  );
  assert.equal(pairs.length, 9);
  save(jobDirectory('core') + '/screenshot-source-pairs.json', {
    pairs,
    source: b.source,
    source_binding: 'WHOLE_CLEAN_JOB_BEFORE_FINAL_NOT_CAPTURE_TIME',
    visual_approval: false,
    full_foundation_pass: false,
  });
}
async function defaultUnit() {
  await binding('default-unit');
  assert.ok(!existsSync(jobDirectory('default-unit') + '/results.json'));
  command('default-unit', 'npm-test', [
    'npm',
    'test',
    '--',
    '--reporter=default',
    '--reporter=./scripts/v1-default-unit-reporter.mjs',
    '--reporter=json',
    '--outputFile.json=' + jobDirectory('default-unit') + '/results.json',
  ]);
}
export function summarizeDefaultUnit(
  events,
  report,
  source = null,
  root = process.cwd(),
) {
  assert.ok(
    Array.isArray(events),
    'Actual incremental observer records required',
  );
  assert.ok(events.length > 0);
  eq(
    events.map((e) => e.sequence),
    events.map((_, i) => i),
    'Complete incremental sequence required',
  );
  const start = events.filter((e) => e.kind === 'observer_start');
  assert.equal(start.length, 1);
  eq(
    [
      start[0].config.test_timeout,
      start[0].config.hook_timeout,
      start[0].config.max_workers,
      start[0].config.retry,
    ],
    [30000, 30000, 4, 0],
    'Original default unit policy required',
  );
  if (source) {
    eq(
      [start[0].checkout, start[0].tree],
      [source.checkout, source.tree],
      'Actual default-unit source metadata required',
    );
    const runs = events.filter((e) => e.kind === 'run_start');
    assert.ok(runs.length <= 1);
    if (runs.length) {
      assert.ok(Array.isArray(runs[0].specifications));
      eq(
        sorted(runs[0].specifications.map((x) => x.file)),
        sorted(
          Object.keys(source.files).filter((f) =>
            /^tests\/.+\.test\.ts$/.test(f),
          ),
        ),
        'Actual complete default file collection required',
      );
    }
  }
  const endings = events.filter((e) => e.kind === 'run_end');
  assert.ok(endings.length <= 1);
  const caseEvents = events.filter((e) => e.kind === 'case_result');
  const result = {
    classification: 'PARTIAL_OBSERVATIONS_FINAL_REPORT_MISSING',
    observer_records: events.length,
    case_result_events: caseEvents.length,
    observed_failed_cases: caseEvents
      .filter((e) => e.case?.result?.state === 'failed')
      .map((e) => e.case),
    ready_without_result: events
      .filter(
        (e) =>
          e.kind === 'case_ready' &&
          !caseEvents.some((x) => x.case.id === e.case.id),
      )
      .map((e) => e.case),
    final_observation_present: endings.length === 1,
    json_report_present: Boolean(report),
    command_complete: false,
    full_foundation_pass: false,
  };
  if (!report || endings.length !== 1) return result;
  assert.ok(
    Array.isArray(report.testResults) && report.testResults.length > 0,
    'Nonempty actual default file outcomes required',
  );
  const rows = report.testResults.flatMap((f) => {
    assert.ok(Array.isArray(f.assertionResults));
    return f.assertionResults;
  });
  assert.equal(rows.length, report.numTotalTests);
  if (report.success !== false)
    assert.ok(
      rows.length > 0,
      'A zero-case report cannot prove a successful default command',
    );
  if (source && endings[0].reason !== 'interrupted') {
    const starts = events.filter((e) => e.kind === 'run_start');
    assert.equal(
      starts.length,
      1,
      'Exactly one full run_start is required for completed source-bound outcomes',
    );
    assert.ok(Array.isArray(starts[0].specifications));
    const eligible = Object.keys(source.files)
      .filter((f) => /^tests\/.+\.test\.ts$/.test(f))
      .sort();
    assert.ok(
      eligible.length > 0,
      'Nonempty source-bound default inventory required',
    );
    eq(
      sorted(starts[0].specifications.map((x) => x.file)),
      eligible,
      'Full source-bound run_start inventory required',
    );
    const physicalFiles = report.testResults.map((file) => {
      assert.ok(
        typeof file.name === 'string' &&
          file.name.startsWith(resolve(root) + '/'),
      );
      return relative(root, file.name).replaceAll('\\', '/');
    });
    assert.equal(
      new Set(physicalFiles).size,
      physicalFiles.length,
      'Duplicate physical JSON files cannot prove complete outcomes',
    );
    eq(
      sorted(physicalFiles),
      eligible,
      'Every source-bound physical JSON file is required, including zero-case collection-error files',
    );
  }
  for (const key of [
    'numTotalTests',
    'numPassedTests',
    'numFailedTests',
    'numPendingTests',
    'numTodoTests',
    'numFailedTestSuites',
    'numPendingTestSuites',
  ])
    assert.ok(
      Number.isSafeInteger(report[key]) && report[key] >= 0,
      'Actual finite default-unit counters required',
    );
  const statusCounts = {
    passed: 0,
    failed: 0,
    skipped: 0,
    pending: 0,
    todo: 0,
  };
  for (const row of rows) {
    assert.ok(
      Object.hasOwn(statusCounts, row.status),
      'Known actual default-unit status required',
    );
    statusCounts[row.status]++;
    assert.ok(Array.isArray(row.failureMessages));
  }
  assert.equal(statusCounts.passed, report.numPassedTests);
  assert.equal(statusCounts.failed, report.numFailedTests);
  assert.equal(
    statusCounts.skipped + statusCounts.pending,
    report.numPendingTests,
  );
  assert.equal(statusCounts.todo, report.numTodoTests);
  if (report.success === true) {
    assert.equal(report.numFailedTests, 0);
    assert.equal(report.numFailedTestSuites, 0);
    if (Object.hasOwn(report, 'numRuntimeErrorTestSuites'))
      assert.equal(report.numRuntimeErrorTestSuites, 0);
    eq(endings[0].module_errors, []);
    eq(endings[0].unhandled_errors, []);
  }
  const actualIds = report.testResults.flatMap((f) => {
    assert.ok(
      typeof f.name === 'string' && f.name.startsWith(resolve(root) + '/'),
    );
    return f.assertionResults.map((a) => {
      assert.ok(Array.isArray(a.ancestorTitles) && typeof a.title === 'string');
      return (
        relative(root, f.name).replaceAll('\\', '/') +
        ':' +
        [...a.ancestorTitles, a.title].join(' > ')
      );
    });
  });
  eq(
    sorted(actualIds),
    sorted(endings[0].cases.map((c) => c.file + ':' + c.full_name)),
    'Final observer and JSON identities must agree',
  );
  assert.equal(
    new Set(endings[0].cases.map((c) => c.file + ':' + c.full_name)).size,
    endings[0].cases.length,
  );
  assert.ok(
    ['passed', 'failed', 'interrupted'].includes(endings[0].reason),
    'Known actual final observer reason required',
  );
  assert.equal(
    typeof report.success,
    'boolean',
    'Actual JSON success boolean required',
  );
  if (endings[0].reason !== 'interrupted')
    assert.equal(
      report.success,
      endings[0].reason === 'passed',
      'Observer terminal reason and JSON success must agree',
    );
  const jsonCases = new Map(
    report.testResults.flatMap((f) =>
      f.assertionResults.map((a) => [
        relative(root, f.name).replaceAll('\\', '/') +
          ':' +
          [...a.ancestorTitles, a.title].join(' > '),
        a,
      ]),
    ),
  );
  for (const observed of [
    ...endings[0].cases,
    ...caseEvents.map((event) => event.case),
  ]) {
    const expected = jsonCases.get(observed.file + ':' + observed.full_name);
    assert.ok(expected, 'Every observer case must exist in JSON');
    assert.ok(
      observed.result && Array.isArray(observed.result.errors),
      'Explicit observer state/errors required',
    );
    let state = observed.result.state;
    if (state === 'skipped' && observed.options?.mode === 'todo')
      state = 'todo';
    assert.equal(
      state,
      expected.status,
      'Observer per-case state and JSON status must agree',
    );
    if (
      ['skipped', 'todo', 'pending'].includes(state) ||
      (state === 'passed' && observed.options?.fails !== true)
    )
      assert.equal(
        observed.result.errors.length,
        0,
        'Passing/skipped/pending observer case cannot conceal errors',
      );
    const failures = observed.result.errors.map((error) => {
      assert.ok(
        error && typeof error.message === 'string',
        'Actual serialized observer error required',
      );
      assert.ok(
        error.stack === undefined ||
          error.stack === null ||
          typeof error.stack === 'string',
      );
      return error.stack || error.message;
    });
    eq(
      failures,
      expected.failureMessages,
      'Observer case errors and JSON failure messages must agree',
    );
  }
  if (endings[0].reason === 'interrupted')
    return {
      ...result,
      classification: 'FINAL_INTERRUPTED_OBSERVATION_NOT_COMPLETE',
      reported_total: report.numTotalTests,
      reported_failed: report.numFailedTests,
    };
  return {
    ...result,
    classification:
      report.success === true
        ? 'ACTUAL_DEFAULT_COMMAND_COMPLETED_SEPARATE_SKIPS_RECORDED'
        : 'ACTUAL_DEFAULT_COMMAND_FAILED',
    command_complete: true,
    reported_success: report.success === true,
    reported_total: report.numTotalTests,
    reported_passed: report.numPassedTests,
    reported_failed: report.numFailedTests,
    reported_pending: report.numPendingTests,
    reported_todo: report.numTodoTests,
    reported_files: report.testResults.length,
    final_reason: endings[0].reason,
    final_module_errors: endings[0].module_errors,
    final_unhandled_errors: endings[0].unhandled_errors,
    declarations_preserved: endings[0].cases.map((c) => ({
      file: c.file,
      name: c.full_name,
      options: c.options,
      state: c.result?.state,
    })),
  };
}
async function inspectDefaultUnit() {
  const d = jobDirectory('default-unit'),
    path = d + '/events.ndjson';
  if (!existsSync(path) || lstatSync(path).size === 0) {
    save(d + '/outcome.json', {
      classification: 'INCREMENTAL_OBSERVER_MISSING_UNKNOWN',
      full_foundation_pass: false,
    });
    return;
  }
  const lines = readRegular(path).toString().trimEnd().split('\n'),
    events = [];
  let incompleteTail = false;
  for (const [i, line] of lines.entries()) {
    try {
      events.push(JSON.parse(line));
    } catch {
      assert.equal(
        i,
        lines.length - 1,
        'Only a torn final partial line may be preserved',
      );
      incompleteTail = true;
    }
  }
  const result = summarizeDefaultUnit(
    events,
    existsSync(d + '/results.json') ? json(d + '/results.json') : null,
    json(d + '/before.json').source,
  );
  save(d + '/outcome.json', {
    ...result,
    ...(incompleteTail
      ? {
          classification: 'TORN_INCREMENTAL_RECORD_PARTIAL',
          command_complete: false,
        }
      : {}),
    incomplete_tail: incompleteTail,
  });
}
async function recoveryStaging() {
  const d = jobDirectory('recovery-staging');
  await binding('recovery-staging');
  const failures = [];
  let observedPython = null,
    observedPackages = null;
  try {
    command('recovery-staging', 'python-version', ['python', '--version']);
    observedPython = readRegular(d + '/python-version.stdout')
      .toString()
      .trim();
    assert.equal(observedPython, 'Python 3.13.16');
    command('recovery-staging', 'python-packages', [
      'python',
      '-c',
      "import json; from importlib.metadata import version; print(json.dumps({p:version(p) for p in ['cryptography','cffi','pycparser']}))",
    ]);
    observedPackages = json(d + '/python-packages.stdout');
    eq(observedPackages, {
      cryptography: '50.0.2',
      cffi: '2.1.1',
      pycparser: '3.11',
    });
    command('recovery-staging', 'recovery', ['npm', 'run', 'test:recovery']);
  } catch (error) {
    failures.push({
      command: 'original-recovery-environment-or-tests',
      message: error.message,
    });
  }
  try {
    await binding('recovery-staging');
    command('recovery-staging', 'staging-plan', ['npm', 'run', 'staging:plan']);
  } catch (error) {
    failures.push({ command: 'original-staging-plan', message: error.message });
  }
  save(d + '/outcome.json', {
    observed_python: observedPython,
    observed_packages: observedPackages,
    operational_lock_sha256: hash(
      readRegular('recovery/monterey/requirements.lock'),
    ),
    failures,
    synthetic_unit_fixtures_only: true,
    physical_recovery_acceptance: false,
    hosted_actions: 'NONE',
    full_foundation_pass: false,
  });
  assert.equal(
    failures.length,
    0,
    'Preserved original recovery/staging command failure',
  );
}
async function defaultBrowser(collection) {
  const b = await binding('default-browser'),
    m = validateManifest(json('docs/program/V1_FIELD_INTAKE_MANIFEST.json')),
    d = jobDirectory('default-browser');
  const inventory = Object.keys(b.source.files)
    .filter((f) => /^tests\/browser\/.+\.spec\.ts$/.test(f))
    .sort();
  save(
    d +
      (collection
        ? '/source-inventory.json'
        : '/executed-source-inventory.json'),
    inventory,
  );
  const output = d + (collection ? '/collection.json' : '/browser.json');
  assert.ok(!existsSync(output));
  const args = collection
    ? ['npx', '--no-install', 'playwright', 'test', '--list', '--reporter=json']
    : ['npm', 'run', 'test:browser', '--', '--reporter=line,json'];
  command(
    'default-browser',
    collection ? 'collection' : 'original-browser',
    args,
    { PLAYWRIGHT_JSON_OUTPUT_FILE: resolve(output) },
  );
  if (!collection) {
    const proof = validateDefaultBrowserReports(
      json(d + '/collection.json'),
      json(output),
      inventory,
      { ...b.source, started_epoch_ms: b.started_epoch_ms },
      m.original_policies.default_browser_body_budgets,
    );
    save(d + '/verification.json', {
      ...proof,
      source: b.source,
      collection_sha256: hash(readRegular(d + '/collection.json')),
      report_sha256: hash(readRegular(output)),
    });
  }
}
async function currentImages(job) {
  const b = await binding(job),
    images = [];
  for (const path of artifactFiles('artifacts').filter((p) =>
    p.endsWith('.png'),
  )) {
    images.push({
      path,
      ...(await decodePNG(readRegular(path))),
      source_checkout: b.source.checkout,
      source_tree: b.source.tree,
      source_binding: 'WHOLE_CLEAN_JOB_BEFORE_FINAL_NOT_CAPTURE_TIME',
      capture_time_source_metadata: 'NOT_SUPPLIED_BY_ORIGINAL_DEFAULT_TEST',
      visual_approval: false,
    });
  }
  save(jobDirectory(job) + '/all-current-image-source-pairs.json', {
    images,
    source: b.source,
    full_foundation_pass: false,
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [operation, argument] = process.argv.slice(2);
  if (operation === 'bind') await bind(argument);
  else if (operation === 'final') await final(argument);
  else if (operation === 'controls') await runControls();
  else if (operation === 'collect-native') await collectNative();
  else if (operation === 'native') await runNative();
  else if (operation === 'collect-browser') await browser(argument, true);
  else if (operation === 'browser') await browser(argument, false);
  else if (operation === 'screenshots') await screenshots();
  else if (operation === 'default-unit') await defaultUnit();
  else if (operation === 'inspect-default-unit') await inspectDefaultUnit();
  else if (operation === 'recovery-staging') await recoveryStaging();
  else if (operation === 'collect-default-browser') await defaultBrowser(true);
  else if (operation === 'default-browser') await defaultBrowser(false);
  else if (operation === 'current-images') await currentImages(argument);
  else throw Error('Finite integration evidence operation required');
  console.log(
    operation +
      ' evidence recorded; no whole Foundation or operational acceptance.',
  );
}
