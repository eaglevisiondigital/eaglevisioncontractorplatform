// Finite public candidate provenance and report checks. No business-state writer.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync, mkdirSync } from 'node:fs';
import { relative } from 'node:path';
import {
  admitCycle33V1IntegrationPublished,
  cycle33V1IntegrationAuthors,
} from './cycle25-source-lineage.mjs';

const directory = 'artifacts/cycle33/v1-integrated/';
const manifestPath = 'docs/program/CYCLE33_V1_COMBINED_SOURCE_MANIFEST.json';
const manifest = JSON.parse(readFileSync(manifestPath));
const git = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => {
  throw Error(message);
};
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const parent = '67237bde592ace34487a353492cf01dc4e4fa204';
const authors = [
  '58c96bad25b314bcf11faf33020fc7bb2791a429',
  'e733774533bb4aab0a30782855aeb367c72089d0',
  '56fd0b03c777638c80e9e0b3c3d8274760391dc3',
  '2c0447d5d47bb6b6258f3481de494704de409b83',
  'f387c937b0d7d60f10549acab3884fc1b98975ac',
  '439a0901dcc15c76022647b59bb34eabfe6adb02',
];
const mainFiles = [
  'scripts/check-v1-integrated-candidate.mjs',
  '.github/workflows/cycle33-v1-integrated-candidate.yml',
  'docs/program/CYCLE33_V1_COMBINED_SOURCE_MANIFEST.json',
  'docs/program/CYCLE33_V1_COMBINED_VALIDATION.md',
  'CURRENT_BUILD_STATE.md',
  'DECISIONS.md',
  'docs/PROGRAM_DELIVERY_STATUS.md',
  'docs/FEATURE_ACCEPTANCE_REGISTER.md',
  'docs/program/CYCLE33_V1_D1_RETURN_FORM.md',
];
const appendFiles = mainFiles.slice(4);
const browserScopes = {
  'artifacts/cycle28/browser-results.json': { cases: 9, budget_ms: 150000 },
  'artifacts/cycle28/browser-off-results.json': { cases: 3, budget_ms: 150000 },
  'artifacts/cycle33/v1-dashboard/browser-results.json': {
    cases: 9,
    budget_ms: 90000,
  },
  'artifacts/cycle33/v1-dashboard/off-results.json': {
    cases: 6,
    budget_ms: 90000,
  },
};
function object(commit, path) {
  const bytes = readFileSync(path);
  return execFileSync(
    'git',
    ['--no-replace-objects', 'show', `${commit}:${path}`],
    { maxBuffer: bytes.length + 1024 },
  );
}
function inspect() {
  if (
    manifest.schema !== 'propel-v1-reviewed-combined-source-v1' ||
    manifest.parent !== parent ||
    manifest.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    manifest.authority !== 'PUBLIC_SOURCE_PROVENANCE_ONLY_NOT_BUSINESS_STATE' ||
    !equal(manifest.main_owned, mainFiles) ||
    !equal(manifest.append_only, appendFiles) ||
    !equal(manifest.browser_scopes, browserScopes) ||
    !equal(Object.keys(manifest.native_scopes), [
      'native-current.json',
      'retained.json',
    ]) ||
    !equal(
      manifest.authors.map((a) => a.source_commit),
      authors,
    ) ||
    manifest.operational_acceptance !== 'A01-A12_NOT_RUN' ||
    manifest.d1_roles !== 'ELEVEN_UNASSIGNED' ||
    manifest.full_foundation_pass !== false
  )
    fail('Exact finite reviewed candidate contract required');
  if (git('status', '--porcelain', '--untracked-files=all'))
    fail('Clean committed candidate required');
  const requested = process.env.CANDIDATE_HEAD ?? git('rev-parse', 'HEAD');
  if (
    !/^[a-f0-9]{40}$/.test(requested) ||
    git('cat-file', '-t', requested) !== 'commit'
  )
    fail('Exact requested source commit required');
  git('merge-base', '--is-ancestor', parent, requested);
  if (
    git('rev-list', '--merges', `${parent}..${requested}`) ||
    git('rev-parse', `${requested}^{tree}`) !== git('rev-parse', 'HEAD^{tree}')
  )
    fail('Non-merge author composition and exact carrier tree required');
  if (git('rev-parse', 'HEAD') !== requested) {
    const carrier = git('rev-list', '--parents', '-n', '1', 'HEAD')
      .split(' ')
      .slice(1);
    if (
      carrier.length !== 2 ||
      !carrier.includes(parent) ||
      !carrier.includes(requested)
    )
      fail('Only exact parent and requested source PR carrier permitted');
  }
  const expected = new Set(manifest.main_owned),
    append = new Set(manifest.append_only);
  const original = new Map();
  for (const author of manifest.authors) {
    const changed = new Set();
    for (const step of author.steps) {
      if (
        git('cat-file', '-t', step.commit) !== 'commit' ||
        !equal(
          git('rev-list', '--parents', '-n', '1', step.commit)
            .split(' ')
            .slice(1),
          step.parents,
        ) ||
        !equal(
          git('diff-tree', '--no-commit-id', '--name-status', '-r', step.commit)
            .split('\n')
            .sort(),
          step.delta,
        )
      )
        fail('Exact original author ancestry and delta required');
      for (const row of step.delta) {
        if (!/^[AM]\t[^\0]+$/.test(row))
          fail('No renamed or deleted author source');
        changed.add(row.slice(2));
      }
    }
    if (!equal([...changed].sort(), Object.keys(author.files).sort()))
      fail('Complete finite original author inventory required');
    for (const [path, digest] of Object.entries(author.files)) {
      if (
        original.has(path) ||
        git('ls-tree', author.source_commit, '--', path).split(/\s+/)[0] !==
          '100644'
      )
        fail('Disjoint regular author source required');
      const bytes = object(author.source_commit, path);
      if (hash(bytes) !== digest)
        fail('Immutable original author bytes required');
      const current = readFileSync(path);
      if (
        append.has(path)
          ? !current.subarray(0, bytes.length).equals(bytes)
          : !current.equals(bytes)
      )
        fail(
          'Exact author bytes or explicit append-only Main extension required',
        );
      expected.add(path);
      original.set(path, author.source_commit);
    }
  }
  for (const path of append) {
    if (!manifest.main_owned.includes(path))
      fail('Append-only path must be Main-owned');
    if (!original.has(path)) {
      const before = object(parent, path),
        current = readFileSync(path);
      if (!current.subarray(0, before.length).equals(before))
        fail('Original parent prefix must remain immutable');
    }
  }
  const actual = git('diff', '--name-only', parent, 'HEAD').split('\n');
  if (
    actual.length !== expected.size ||
    actual.some((path) => !expected.delete(path)) ||
    expected.size
  )
    fail('Exact reviewed combined file set required');
  const hashes = {};
  for (const row of git('ls-files', '--stage').split('\n')) {
    const m = /^(100(?:644|755)) ([0-9a-f]{40}) 0\t(.+)$/.exec(row);
    if (!m || !lstatSync(m[3]).isFile() || lstatSync(m[3]).isSymbolicLink())
      fail('Regular tracked source required');
    const bytes = readFileSync(m[3]);
    if (!bytes.equals(object('HEAD', m[3])))
      fail('Every current tracked byte must equal HEAD');
    hashes[m[3]] = hash(bytes);
  }
  const admissions = cycle33V1IntegrationAuthors.map((a) =>
    admitCycle33V1IntegrationPublished(
      {
        path: a.path,
        sha256: a.published_sha256,
        ...(a.requires_blob ? { blob: a.published_blob } : {}),
      },
      readFileSync(a.path),
    ),
  );
  return {
    source: git('rev-parse', 'HEAD'),
    requested_source: requested,
    tree: git('rev-parse', 'HEAD^{tree}'),
    parent,
    hashes,
    admissions,
    actual_files: actual.length,
    business_authority: false,
    restore_adapter: false,
    full_foundation_pass: false,
    release: manifest.release,
  };
}
function nativeReports() {
  if (
    !equal(Object.keys(manifest.native_scopes), [
      'native-current.json',
      'retained.json',
    ])
  )
    fail('Exact two native scopes required');
  const scopes = [];
  for (const [name, files] of Object.entries(manifest.native_scopes)) {
    const r = JSON.parse(readFileSync(directory + name)),
      n = Object.values(files).reduce((a, b) => a + b, 0),
      remaining = new Map(Object.entries(files));
    if (
      r.success !== true ||
      r.numTotalTests !== n ||
      r.numPassedTests !== n ||
      r.numFailedTests !== 0 ||
      r.numPendingTests !== 0 ||
      r.numTodoTests !== 0 ||
      r.numFailedTestSuites !== 0 ||
      r.numPendingTestSuites !== 0 ||
      (r.numRuntimeErrorTestSuites ?? 0) !== 0 ||
      n !== { 'native-current.json': 220, 'retained.json': 353 }[name] ||
      r.testResults.length !== remaining.size
    )
      fail('Complete unfiltered native scope required: ' + name);
    for (const suite of r.testResults) {
      const path = relative(process.cwd(), suite.name).replaceAll('\\', '/'),
        count = remaining.get(path),
        cases = suite.assertionResults;
      if (
        !remaining.delete(path) ||
        suite.status !== 'passed' ||
        (suite.message ?? '') !== '' ||
        cases.length !== count ||
        new Set(cases.map((a) => a.fullName)).size !== count ||
        cases.some(
          (a) =>
            a.status !== 'passed' || !a.fullName || a.failureMessages.length,
        )
      )
        fail('Exact passed original-budget case identities required');
    }
    if (remaining.size) fail('Missing native suite');
    scopes.push({
      name,
      cases: n,
      files: Object.keys(files).length,
      sha256: hash(readFileSync(directory + name)),
    });
  }
  writeFileSync(
    directory + 'native-verification.json',
    JSON.stringify(
      {
        source: git('rev-parse', 'HEAD'),
        scopes,
        full_foundation_pass: false,
        operational_acceptance: false,
        release: manifest.release,
      },
      null,
      2,
    ) + '\n',
  );
}
function browserReports() {
  if (!equal(manifest.browser_scopes, browserScopes))
    fail('Exact four browser scopes required');
  const flatten = (s) => [
    ...(s.specs ?? []).flatMap((x) =>
      x.tests.map((t) => ({ ...t, original_title: x.title })),
    ),
    ...(s.suites ?? []).flatMap(flatten),
  ];
  const scopes = [];
  const brands = ['straight-edge', 'cunningham', 'roofing-example'];
  const titles = [
    brands.map(
      (b) => 'native action journey preserves one exact source context / ' + b,
    ),
    ['production keeps native actions closed'],
    brands.map(
      (b) => 'unified V1 evidence categories and original gates / ' + b,
    ),
    [
      'production keeps the operating center and guided paths closed',
      'production does not expose the unified scorecard or owner-role review',
    ],
  ];
  let index = 0;
  for (const [path, expected] of Object.entries(manifest.browser_scopes)) {
    const r = JSON.parse(readFileSync(path)),
      tests = r.suites.flatMap(flatten);
    const identities = new Set(
      ['desktop', 'tablet', 'mobile'].flatMap((project) =>
        titles[index].map((title) => JSON.stringify([project, title])),
      ),
    );
    const head = git('rev-parse', 'HEAD');
    if (
      tests.length !== expected.cases ||
      r.config.workers !== 1 ||
      r.stats.expected !== expected.cases ||
      r.stats.skipped !== 0 ||
      r.stats.unexpected !== 0 ||
      r.stats.flaky !== 0 ||
      r.errors.length !== 0 ||
      (r.config.metadata?.gitCommit !== undefined
        ? r.config.metadata.gitCommit?.hash !== head
        : process.env.GITHUB_ACTIONS === 'true') ||
      (r.config.metadata?.ci !== undefined
        ? r.config.metadata.ci?.commitHash !== head
        : process.env.GITHUB_ACTIONS === 'true') ||
      !equal(r.config.projects.map((p) => p.name).sort(), [
        'desktop',
        'mobile',
        'tablet',
      ]) ||
      r.config.projects.some(
        (p) => p.retries !== 0 || p.timeout !== expected.budget_ms,
      ) ||
      tests.some(
        (t) =>
          !identities.delete(
            JSON.stringify([t.projectName, t.original_title]),
          ) ||
          t.timeout !== expected.budget_ms ||
          t.expectedStatus !== 'passed' ||
          t.status !== 'expected' ||
          t.results.length !== 1 ||
          t.results[0].status !== 'passed' ||
          t.results[0].retry !== 0 ||
          t.results[0].errors.length !== 0 ||
          !Number.isFinite(t.results[0].duration) ||
          t.results[0].duration > expected.budget_ms,
      ) ||
      identities.size !== 0
    )
      fail(
        'Exact unfiltered responsive/OFF assertions and original budgets required',
      );
    scopes.push({
      path,
      cases: tests.length,
      sha256: hash(readFileSync(path)),
      source_binding: r.config.metadata?.gitCommit
        ? 'CHECKED_OUT_GIT_METADATA'
        : 'LOCAL_CLEAN_JOB_BEFORE_AFTER_ONLY',
    });
    index++;
  }
  writeFileSync(
    directory + 'browser-verification.json',
    JSON.stringify(
      {
        source: git('rev-parse', 'HEAD'),
        scopes,
        visual_approval: false,
        physical_recovery_acceptance: false,
        operational_acceptance: false,
        release: manifest.release,
      },
      null,
      2,
    ) + '\n',
  );
}
mkdirSync(directory, { recursive: true });
const mode = process.argv[2];
if (mode === 'bind')
  writeFileSync(
    directory + 'binding.json',
    JSON.stringify(inspect(), null, 2) + '\n',
  );
else if (mode === 'final') {
  const before = JSON.parse(readFileSync(directory + 'binding.json')),
    after = inspect();
  if (!equal(before, after))
    fail('Actual source changed during bounded acceptance');
  writeFileSync(
    directory + 'final-binding.json',
    JSON.stringify({ ...after, unchanged: true }, null, 2) + '\n',
  );
} else if (mode === 'native') nativeReports();
else if (mode === 'browsers') browserReports();
else fail('Explicit bind, final, native or browsers mode required');
console.log(
  'V1 combined ' + mode + ': bounded evidence only; Release NOT AUTHORIZED.',
);
