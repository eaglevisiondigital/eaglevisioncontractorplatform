/** CI evidence only: never a business writer, credential reader or recovery port. */
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const applicationShards = 8;
export const browserShards = 3;
export const checkCommands = Object.freeze([
  'lint',
  'typecheck',
  'types:check',
  'migrations:check',
  'property:check',
  'customer:check',
  'customer:requests:check',
  'customer:broker:check',
  'features:check',
  'test',
  'test:recovery',
  'build',
]);
const requiredJobs = ['preflight', 'application', 'browser'];
const root = process.cwd();
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = () => {
  throw Error('Incomplete or changed native Foundation evidence');
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
export function requireUnion(parts, expected) {
  if (
    !Array.isArray(parts) ||
    !parts.length ||
    !Array.isArray(expected) ||
    !expected.length
  )
    fail();
  const all = parts.flat();
  if (
    all.some((s) => typeof s !== 'string' || !s) ||
    new Set(all).size !== all.length ||
    !same([...all].sort(), [...expected].sort())
  )
    fail();
  return all.length;
}
export function requireJobs(jobs) {
  if (
    !jobs ||
    !same(Object.keys(jobs).sort(), [...requiredJobs].sort()) ||
    requiredJobs.some((key) => jobs[key] !== 'success')
  )
    fail();
}
export function requireCheckScript(value) {
  const actual = checkCommands
    .map((s) => (s === 'test' ? 'npm test' : `npm run ${s}`))
    .join(' && ');
  if (value !== actual) fail();
}
function pathInRoot(path) {
  const name = relative(root, resolve(path)).replaceAll('\\', '/');
  if (!/^tests\/[a-zA-Z0-9_./-]+\.test\.ts$/.test(name) || name.includes('..'))
    fail();
  return name;
}
export function nativeFailureEvidence(result) {
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  let parsed,
    parsed_json = false;
  try {
    parsed = JSON.parse(stdout);
    parsed_json = true;
  } catch {
    /* Raw output is never retained. */
  }
  const allErrors = Array.isArray(parsed?.errors) ? parsed.errors : [];
  const tags = [];
  const combined = stdout + '\n' + stderr;
  for (const [tag, pattern] of [
    [
      'MISSING_GIT_OBJECT',
      /invalid object name|bad object|unknown revision|not a valid object name|could not get object info/i,
    ],
    [
      'SOURCE_GUARD',
      /inspectCycle25Sources|Exact single-parent|Unreviewed source|Original immutable|source-lineage/i,
    ],
    [
      'PUBLIC_HISTORY_PRECONDITION',
      /Public test Git-history precondition failed/,
    ],
    ['MODULE_NOT_FOUND', /Cannot find module|ERR_MODULE_NOT_FOUND/],
  ])
    if (pattern.test(combined)) tags.push(tag);
  return {
    schema: 'propel-native-collection-failure-v1',
    child_exit: Number.isInteger(result.status) ? result.status : null,
    child_signal: ['SIGKILL', 'SIGTERM', 'SIGABRT', 'SIGSEGV'].includes(
      result.signal,
    )
      ? result.signal
      : null,
    child_error_code: ['ENOENT', 'ENOBUFS', 'EACCES', 'ETIMEDOUT'].includes(
      result.error?.code,
    )
      ? result.error.code
      : null,
    stdout_bytes: Buffer.byteLength(stdout),
    stderr_bytes: Buffer.byteLength(stderr),
    stdout_sha256: sha(stdout),
    stderr_sha256: sha(stderr),
    parsed_json,
    native_error_count: allErrors.length,
    native_errors: allErrors.slice(0, 32).map((e) => ({
      class: ['Error', 'TypeError', 'AssertionError', 'TimeoutError'].includes(
        e?.name,
      )
        ? e.name
        : 'UNKNOWN',
      message_sha256: sha(typeof e?.message === 'string' ? e.message : ''),
      message_bytes:
        typeof e?.message === 'string' ? Buffer.byteLength(e.message) : 0,
      stack_sha256: sha(typeof e?.stack === 'string' ? e.stack : ''),
    })),
    native_errors_truncated: allErrors.length > 32,
    known_error_tags: tags,
    raw_stdout_or_stderr_retained: false,
    argv_or_environment_retained: false,
  };
}
function native(command, args, context) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error || result.signal) {
    writeJson(context.prefix + '/native-collection-failure.json', {
      ...nativeFailureEvidence(result),
      stage: context.stage,
      binding: context.binding,
    });
    fail();
  }
  return result.stdout;
}
export function binding() {
  const pkg = json('package.json');
  requireCheckScript(pkg.scripts.check);
  const fixed = [
    'package.json',
    'package-lock.json',
    'vite.config.ts',
    'playwright.config.ts',
    'tests/setup/git-history.ts',
    'scripts/test-git-history.mjs',
    'scripts/cycle33-foundation-evidence.mjs',
    'scripts/cycle33-foundation-reporter.mjs',
    '.github/workflows/ci.yml',
    'scripts/reconcile-cycle29-parent-browser.mjs',
    '.github/workflows/cycle33-foundation-runtime.yml',
  ];
  return {
    source: execFileSync('git', ['--no-replace-objects', 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    tree: execFileSync(
      'git',
      ['--no-replace-objects', 'rev-parse', 'HEAD^{tree}'],
      { encoding: 'utf8' },
    ).trim(),
    files: Object.fromEntries(fixed.map((p) => [p, sha(readFileSync(p))])),
  };
}
export function assertBinding(value) {
  if (
    !value ||
    !/^[a-f0-9]{40}$/.test(value.source) ||
    !/^[a-f0-9]{40}$/.test(value.tree) ||
    !same(value, binding())
  )
    fail();
}
export function browserCases(report) {
  if (
    !report ||
    !Array.isArray(report.suites) ||
    !Array.isArray(report.errors) ||
    report.errors.length
  )
    fail();
  const rows = [];
  function walk(suites) {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        for (const t of spec.tests ?? []) {
          if (
            typeof spec.id !== 'string' ||
            !spec.id ||
            typeof t.projectName !== 'string' ||
            typeof spec.file !== 'string' ||
            !Number.isInteger(spec.line) ||
            !Number.isInteger(t.timeout) ||
            t.timeout < 1 ||
            !['passed', 'skipped', 'failed'].includes(t.expectedStatus)
          )
            fail();
          rows.push({
            id: spec.id + '\0' + t.projectName,
            file: spec.file,
            line: spec.line,
            title: spec.title,
            project: t.projectName,
            timeout: t.timeout,
            expectedStatus: t.expectedStatus,
            status: t.status,
            results: t.results,
          });
        }
      }
      walk(suite.suites ?? []);
    }
  }
  walk(report.suites);
  if (!rows.length || new Set(rows.map((c) => c.id)).size !== rows.length)
    fail();
  return rows;
}
// Reuse the already reviewed finite original body-budget registry as data only.
// The exact hash is checked before AST parsing; no source is evaluated/imported.
const originalBudgetRegistry = 'scripts/reconcile-cycle29-parent-browser.mjs';
const originalBudgetRegistryHash =
  'ed9ea19e133ebb85f9e7f2a3e7ceeb4dd132f24e0ba7b73a9c7818d48b394a59';
const originalBudgetSources = Object.freeze({
  'repair-draft.spec.ts':
    '96147b01ce08a5d57521b2a02a874c767d95afc28fefa5c2246cd2232487aa9e',
  'repair-readiness.spec.ts':
    '00bc581fe92f6f6adb7f250d4f715baa2bebf3afb45df8434528816c722e7df1',
  'contractor-design.spec.ts':
    'd8b7d97bfd490de7b2d6a2d1ef43a8614823535c5de8094ae0d82f07cae1e151',
  'contractor-phase-b.spec.ts':
    '5cf4dcabca40bc310ad7090d2cbc333974cf62f6652df23ddb670c8a90784d38',
  'maintenance-center.spec.ts':
    '2f0f177c7fb7447771e4d02628b17c89f232b8b32f972700f9f7107eb7561911',
  'cycle23-source-consistency.spec.ts':
    '589aabdcaf2b809932118c81397cf99d9ce02da23225d36c13d5c266eb162cf4',
  'cycle24-native-actions.spec.ts':
    '3a40b18a96df8824ecf87b9fdc2154013ac25adcc4b71fd141e85e8e6140908f',
});
export function parseOriginalBodyBudgets(bytes) {
  if (sha(bytes) !== originalBudgetRegistryHash) fail();
  const source = ts.createSourceFile(
    'original-budget-registry.mjs',
    bytes.toString(),
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JS,
  );
  const declarations = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((s) => [...s.declarationList.declarations])
    .filter(
      (d) => ts.isIdentifier(d.name) && d.name.text === 'originalBodyBudgets',
    );
  if (
    declarations.length !== 1 ||
    !ts.isArrayLiteralExpression(declarations[0].initializer)
  )
    fail();
  return declarations[0].initializer.elements.map((row) => {
    if (
      !ts.isArrayLiteralExpression(row) ||
      row.elements.length !== 3 ||
      !ts.isStringLiteral(row.elements[0]) ||
      !ts.isStringLiteral(row.elements[1]) ||
      !ts.isNumericLiteral(row.elements[2])
    )
      fail();
    return [
      row.elements[0].text,
      row.elements[1].text,
      Number(row.elements[2].text),
    ];
  });
}
export function originalRuntimeTimeout(row, declared, read = readFileSync) {
  if (!Number.isSafeInteger(declared) || declared < 1) fail();
  const registry = parseOriginalBodyBudgets(read(originalBudgetRegistry));
  const matches = registry.filter(
    ([file, title]) =>
      file === row.file &&
      (title.endsWith(' / ') || title.endsWith(' · ')
        ? row.title.startsWith(title) &&
          (title.endsWith(' · ')
            ? ['sample-property', 'sample-construction', 'sample-roofing']
            : ['straight-edge', 'cunningham', 'roofing-example']
          ).includes(row.title.slice(title.length))
        : row.title === title),
  );
  if (matches.length > 1) fail();
  if (!matches.length) return declared;
  if (
    sha(read('tests/browser/' + row.file)) !== originalBudgetSources[row.file]
  )
    fail();
  return matches[0][2];
}
const browserIdentity = ({
  id,
  file,
  line,
  title,
  project,
  timeout,
  expectedStatus,
}) => ({
  id,
  file,
  line,
  title,
  project,
  timeout,
  runtime_timeout: originalRuntimeTimeout({ file, title }, timeout),
  expectedStatus,
});
export function validateBrowser(plan, report) {
  if (
    plan.kind !== 'browser' ||
    plan.count !== browserShards ||
    !Number.isInteger(plan.index) ||
    plan.index < 1 ||
    plan.index > browserShards
  )
    fail();
  const actual = browserCases(report),
    expected = plan.selected;
  if (
    !Array.isArray(expected) ||
    !expected.length ||
    report.stats.unexpected !== 0 ||
    report.stats.flaky !== 0 ||
    !same(report.config.shard, { current: plan.index, total: browserShards })
  )
    fail();
  const map = new Map(expected.map((c) => [c.id, c]));
  for (const c of actual) {
    const before = map.get(c.id);
    if (
      !before ||
      before.runtime_timeout !==
        originalRuntimeTimeout(before, before.timeout) ||
      c.timeout !== before.runtime_timeout ||
      !same(before, { ...browserIdentity(c), timeout: before.timeout })
    )
      fail();
    map.delete(c.id);
    if (c.expectedStatus === 'skipped') {
      if (
        c.status !== 'skipped' ||
        c.results.length !== 1 ||
        c.results[0].status !== 'skipped'
      )
        fail();
    } else if (
      c.expectedStatus !== 'passed' ||
      c.status !== 'expected' ||
      c.results.length !== 1 ||
      c.results[0].status !== 'passed' ||
      c.results[0].retry !== 0 ||
      c.results[0].errors?.length
    )
      fail();
  }
  if (
    map.size ||
    actual.length !== expected.length ||
    report.stats.expected + report.stats.skipped !== actual.length
  )
    fail();
  return {
    ids: actual.map((c) => c.id),
    passed: actual.filter((c) => c.expectedStatus === 'passed').length,
    declared_skipped: actual.filter((c) => c.expectedStatus === 'skipped')
      .length,
  };
}
export function validateApplication(plan, report, raw) {
  if (
    plan.kind !== 'application' ||
    plan.count !== applicationShards ||
    !Number.isInteger(plan.index) ||
    plan.index < 1 ||
    plan.index > applicationShards
  )
    fail();
  if (
    report.reason !== 'passed' ||
    report.errors !== 0 ||
    !same(report.binding, plan.binding) ||
    !same(report.config, {
      testTimeout: 30000,
      hookTimeout: 30000,
      maxWorkers: 4,
      retry: 0,
      shard: { index: plan.index, count: applicationShards },
    })
  )
    fail();
  if (
    raw.success !== true ||
    raw.numFailedTests !== 0 ||
    raw.numFailedTestSuites !== 0 ||
    (raw.numRuntimeErrorTestSuites !== undefined &&
      raw.numRuntimeErrorTestSuites !== 0) ||
    !Array.isArray(raw.testResults) ||
    !Array.isArray(report.modules)
  )
    fail();
  requireUnion([report.modules.map((m) => m.file)], plan.selected);
  requireUnion([raw.testResults.map((m) => pathInRoot(m.name))], plan.selected);
  let passed = 0,
    skipped = 0;
  const ids = [];
  for (const m of report.modules) {
    if (
      m.errors !== 0 ||
      m.ended !== true ||
      !Array.isArray(m.collected) ||
      !m.collected.length ||
      !Array.isArray(m.results)
    )
      fail();
    const expected = new Map(m.collected.map((c) => [c.id, c]));
    if (
      expected.size !== m.collected.length ||
      m.collected.some((c) => !['run', 'skip', 'todo'].includes(c.mode))
    )
      fail();
    const actualRaw = raw.testResults.find(
      (r) => pathInRoot(r.name) === m.file,
    );
    if (!actualRaw || actualRaw.assertionResults.length !== m.collected.length)
      fail();
    const bag = new Map();
    for (const c of m.results) {
      const before = expected.get(c.id);
      if (
        !before ||
        before.fullName !== c.fullName ||
        before.jsonName !== c.jsonName ||
        before.timeout !== c.timeout ||
        before.mode !== c.mode ||
        c.retry !== 0 ||
        c.repeat !== 0 ||
        c.errors !== 0
      )
        fail();
      expected.delete(c.id);
      ids.push(m.file + '\0' + c.id);
      if (before.mode === 'run') {
        if (c.status !== 'passed') fail();
        passed++;
      } else {
        if (c.status !== 'skipped') fail();
        skipped++;
      }
      // A multiset deliberately retains equal original Voice fullNames.
      const key =
        c.jsonName +
        '\0' +
        (c.status === 'skipped'
          ? c.mode === 'todo'
            ? 'todo'
            : 'skipped'
          : 'passed');
      bag.set(key, (bag.get(key) ?? 0) + 1);
    }
    if (expected.size) fail();
    for (const c of actualRaw.assertionResults) {
      const key = c.fullName + '\0' + c.status,
        n = bag.get(key) ?? 0;
      if (!n || c.failureMessages?.length) fail();
      if (n === 1) bag.delete(key);
      else bag.set(key, n - 1);
    }
    if (bag.size) fail();
  }
  requireUnion([ids], ids);
  if (
    raw.numTotalTests !== passed + skipped ||
    raw.numPassedTests !== passed ||
    raw.numPendingTests + raw.numTodoTests !== skipped
  )
    fail();
  return { ids, passed, declared_skipped: skipped };
}
export function requireSourceFiles(hashes, paths, read = readFileSync) {
  if (!hashes || typeof hashes !== 'object') fail();
  requireUnion([Object.keys(hashes)], paths);
  for (const [path, digest] of Object.entries(hashes))
    if (!/^[a-f0-9]{64}$/.test(digest) || sha(read(path)) !== digest) fail();
}
function checkSourceFiles(p) {
  requireSourceFiles(
    p.application_files,
    globSync('tests/**/*.test.ts').map((p) => p.replaceAll('\\', '/')),
  );
  requireSourceFiles(
    p.browser_files,
    globSync('tests/browser/**/*.spec.ts').map((p) => p.replaceAll('\\', '/')),
  );
}
async function plan(kind, index, prefix) {
  if (
    !['application', 'browser'].includes(kind) ||
    !Number.isInteger(index) ||
    index < 1 ||
    index > (kind === 'application' ? applicationShards : browserShards)
  )
    fail();
  const source = binding();
  let full, selected;
  if (kind === 'application') {
    const all = JSON.parse(
      native(
        process.execPath,
        ['node_modules/vitest/vitest.mjs', 'list', '--filesOnly', '--json'],
        { prefix, stage: 'VITEST_FILE_COLLECTION', binding: source },
      ),
    );
    full = all.map((p) => pathInRoot(p.file)).sort();
    requireUnion(
      [full],
      globSync('tests/**/*.test.ts')
        .map((p) => p.replaceAll('\\', '/'))
        .sort(),
    );
    const { BaseSequencer } = await import('vitest/node');
    const nativeSequencer = new BaseSequencer({
      config: { root, shard: { index, count: applicationShards } },
    });
    selected = (
      await nativeSequencer.shard(
        full.map((file) => ({ moduleId: resolve(file) })),
      )
    )
      .map((s) => pathInRoot(s.moduleId))
      .sort();
  } else {
    const args = [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--list',
      '--reporter=json',
    ];
    const all = JSON.parse(
      native(process.execPath, args, {
        prefix,
        stage: 'PLAYWRIGHT_FULL_COLLECTION',
        binding: source,
      }),
    );
    const shard = JSON.parse(
      native(process.execPath, [...args, `--shard=${index}/${browserShards}`], {
        prefix,
        stage: 'PLAYWRIGHT_SHARD_COLLECTION',
        binding: source,
      }),
    );
    full = browserCases(all).map(browserIdentity);
    selected = browserCases(shard).map(browserIdentity);
    writeJson(prefix + '/native-full-collection.json', all);
    writeJson(prefix + '/native-shard-collection.json', shard);
  }
  assertBinding(source);
  writeJson(prefix + '/plan.json', {
    schema: 'propel-foundation-coverage-v1',
    kind,
    index,
    count: kind === 'application' ? applicationShards : browserShards,
    binding: source,
    full,
    selected,
    browser_files: Object.fromEntries(
      globSync('tests/browser/**/*.spec.ts')
        .sort()
        .map((p) => [p, sha(readFileSync(p))]),
    ),
    application_files: Object.fromEntries(
      globSync('tests/**/*.test.ts')
        .sort()
        .map((p) => [p, sha(readFileSync(p))]),
    ),
  });
}
function validate(kind, prefix) {
  const p = json(prefix + '/plan.json');
  if (p.kind !== kind) fail();
  assertBinding(p.binding);
  checkSourceFiles(p);
  const result =
    kind === 'application'
      ? validateApplication(
          p,
          json(prefix + '/observations.json'),
          json(prefix + '/results.json'),
        )
      : validateBrowser(p, json(prefix + '/results.json'));
  writeJson(prefix + '/verified.json', {
    ...p,
    ...result,
    verdict: 'EXACT_SHARD_COMPLETE',
    report_sha256: sha(readFileSync(prefix + '/results.json')),
  });
}
export function validateCombined(reports, jobs) {
  requireJobs(jobs);
  if (
    !Array.isArray(reports) ||
    reports.length !== applicationShards + browserShards
  )
    fail();
  const seen = new Set();
  let output = {};
  for (const kind of ['application', 'browser']) {
    const count = kind === 'application' ? applicationShards : browserShards;
    const shards = reports.filter((r) => r.kind === kind);
    if (shards.length !== count) fail();
    for (const s of shards) {
      if (
        s.verdict !== 'EXACT_SHARD_COMPLETE' ||
        s.count !== count ||
        !Number.isInteger(s.index) ||
        s.index < 1 ||
        s.index > count ||
        seen.has(kind + s.index) ||
        !same(s.binding, reports[0].binding) ||
        !same(s.application_files, reports[0].application_files) ||
        !same(s.browser_files, reports[0].browser_files) ||
        !same(s.full, shards[0].full)
      )
        fail();
      seen.add(kind + s.index);
    }
    requireUnion(
      shards.map((r) =>
        kind === 'application' ? r.selected : r.selected.map((c) => c.id),
      ),
      kind === 'application' ? shards[0].full : shards[0].full.map((c) => c.id),
    );
    requireUnion(
      shards.map((r) => r.ids),
      shards.flatMap((r) => r.ids),
    );
    output[kind] = {
      files_or_cases: shards[0].full.length,
      passed: shards.reduce((n, r) => n + r.passed, 0),
      declared_skipped: shards.reduce((n, r) => n + r.declared_skipped, 0),
    };
  }
  return {
    verdict: 'COMPLETE_CURRENT_SOURCE_ORIGINAL_VERIFY_SCOPE_SUPPLEMENT',
    binding: reports[0].binding,
    jobs,
    native_postgres_coverage: 'SEPARATE_ORIGINAL_FOUNDATION_JOB_NOT_ADMITTED',
    ...output,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [mode, kind, index] = process.argv.slice(2);
  if (mode === 'plan')
    await plan(kind, Number(index), `artifacts/foundation/${kind}-${index}`);
  else if (mode === 'validate')
    validate(kind, `artifacts/foundation/${kind}-${index}`);
  else if (mode === 'combine') {
    const paths = globSync('artifacts/foundation/**/verified.json');
    const reports = paths.map((path) => {
      const prefix = dirname(path),
        verified = json(path),
        p = json(prefix + '/plan.json');
      checkSourceFiles(p);
      const actual =
        p.kind === 'application'
          ? validateApplication(
              p,
              json(prefix + '/observations.json'),
              json(prefix + '/results.json'),
            )
          : validateBrowser(p, json(prefix + '/results.json'));
      if (
        !same(verified, {
          ...p,
          ...actual,
          verdict: 'EXACT_SHARD_COMPLETE',
          report_sha256: sha(readFileSync(prefix + '/results.json')),
        })
      )
        fail();
      return verified;
    });
    const result = validateCombined(
      reports,
      json('artifacts/foundation/job-results.json'),
    );
    assertBinding(result.binding);
    writeJson('artifacts/foundation/combined.json', result);
    console.log(JSON.stringify(result));
  } else fail();
}
