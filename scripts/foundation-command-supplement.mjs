// Original-command CI evidence only. Never business-state custody or restoration.
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { availableParallelism } from 'node:os';

export const subjectHead = '523afd4ef17d5502b6e0e39a4df86bdaa7bba23b';
const subjectTree = 'd76ed41befc7de66fe9ac2683e6b09f3efddb1bb';
// Existing body-local overrides at exact523. --list has not executed those
// bodies; preserve their literal declaration positions rather than widening all.
const originalRuntimeBudgets = Object.freeze({
  'contractor-design.spec.ts:68:1': 120000,
  'contractor-design.spec.ts:191:5': 120000,
  'contractor-design.spec.ts:577:1': 90000,
  'contractor-phase-b.spec.ts:89:1': 120000,
  'contractor-phase-b.spec.ts:155:1': 90000,
  'cycle23-source-consistency.spec.ts:425:3': 150000,
  'cycle23-source-consistency.spec.ts:609:3': 150000,
  'cycle23-source-consistency.spec.ts:870:3': 150000,
  'cycle24-native-actions.spec.ts:299:3': 150000,
  'maintenance-center.spec.ts:39:1': 60000,
  'repair-draft.spec.ts:6:1': 90000,
  'repair-readiness.spec.ts:59:1': 120000,
});
const hash = (b) => createHash('sha256').update(b).digest('hex');
const fail = (m) => {
  throw Error(m);
};
const json = (p) => JSON.parse(readFileSync(p));
const save = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
function paths() {
  const root = process.cwd();
  return {
    subject: resolve(root, 'subject'),
    controller: resolve(root, 'controller'),
    output: resolve(root, 'subject/artifacts/cycle33/foundation-supplement'),
  };
}
const git = (cwd, ...args) =>
  execFileSync('git', ['--no-replace-objects', '-C', cwd, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
function binder(mode, p) {
  execFileSync(
    process.execPath,
    ['scripts/check-v1-pilot-candidate.mjs', mode],
    {
      cwd: p.subject,
      env: { ...process.env, CANDIDATE_HEAD: subjectHead },
      stdio: 'inherit',
    },
  );
}
function controller(p) {
  const head = git(p.controller, 'rev-parse', 'HEAD');
  if (
    !/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? '') ||
    head !== process.env.GITHUB_SHA
  )
    fail('Actual controller checkout identity required');
  const files = {};
  for (const path of [
    'scripts/foundation-command-supplement.mjs',
    '.github/workflows/foundation-command-supplement.yml',
  ]) {
    const b = readFileSync(resolve(p.controller, path));
    if (
      !b.equals(
        execFileSync('git', [
          '--no-replace-objects',
          '-C',
          p.controller,
          'show',
          `HEAD:${path}`,
        ]),
      )
    )
      fail('Controller bytes must equal its Git object');
    files[path] = hash(b);
  }
  return { head, tree: git(p.controller, 'rev-parse', 'HEAD^{tree}'), files };
}
function bind(p) {
  if (
    git(p.subject, 'rev-parse', 'HEAD') !== subjectHead ||
    git(p.subject, 'rev-parse', 'HEAD^{tree}') !== subjectTree
  )
    fail('Exact original523 subject required');
  binder('bind', p);
  mkdirSync(p.output, { recursive: true });
  const original = json(
    resolve(p.subject, 'artifacts/cycle33/v1-pilot/before.json'),
  );
  if (Object.keys(original.files).length !== 2152)
    fail('Exact2152 original source files required');
  save(resolve(p.output, 'context.json'), {
    subject: original,
    controller: controller(p),
    github_sha: process.env.GITHUB_SHA,
    run_id: process.env.GITHUB_RUN_ID,
    event: process.env.GITHUB_EVENT_NAME,
    node: process.version,
    available_parallelism: availableParallelism(),
    runner_os: process.env.RUNNER_OS,
    image_os: process.env.ImageOS,
    image_version: process.env.ImageVersion,
    scope:
      'SUPPLEMENTARY_COMMANDS_AT523_NOT_WHOLE_FOUNDATION_OR_CONTROLLER_ACCEPTANCE',
    recovery_repeated: false,
  });
}
function command(p, name, args, extra = {}) {
  const stdout = openSync(resolve(p.output, `${name}.stdout.txt`), 'w'),
    stderr = openSync(resolve(p.output, `${name}.stderr.txt`), 'w');
  let r;
  try {
    r = spawnSync(args[0], args.slice(1), {
      cwd: p.subject,
      env: { ...process.env, ...extra },
      stdio: ['ignore', stdout, stderr],
    });
  } finally {
    closeSync(stdout);
    closeSync(stderr);
  }
  save(resolve(p.output, `${name}.command.json`), {
    command: args,
    status: r.status,
    signal: r.signal,
    spawn_error: r.error?.code ?? null,
    stdout_sha256: hash(readFileSync(resolve(p.output, `${name}.stdout.txt`))),
    stderr_sha256: hash(readFileSync(resolve(p.output, `${name}.stderr.txt`))),
  });
  if (r.error || r.signal || r.status !== 0)
    fail(`Original ${name} command did not complete successfully`);
}
export function browserCases(report) {
  const result = new Map();
  function visit(s, inherited = '') {
    const file = s.file ?? inherited;
    for (const spec of s.specs ?? [])
      for (const test of spec.tests ?? []) {
        if (
          !Number.isInteger(spec.line) ||
          spec.line < 1 ||
          !Number.isInteger(spec.column) ||
          spec.column < 1 ||
          typeof spec.title !== 'string' ||
          !spec.title.trim() ||
          typeof test.projectName !== 'string' ||
          !test.projectName ||
          !Number.isFinite(test.timeout) ||
          test.timeout <= 0
        )
          fail('Complete finite original case identity and timeout required');
        if (
          typeof file !== 'string' ||
          file.startsWith('/') ||
          file.split('/').some((x) => !x || x === '.' || x === '..')
        )
          fail('Finite browser source path required');
        const id = JSON.stringify([
          test.projectName,
          file,
          spec.line,
          spec.column,
          spec.title,
        ]);
        if (result.has(id)) fail('Duplicate browser assertion identity');
        result.set(id, { file, spec, test });
      }
    for (const child of s.suites ?? []) visit(child, file);
  }
  for (const s of report.suites ?? []) visit(s);
  if (!result.size) fail('Nonempty original browser collection required');
  return result;
}
export function validateDefaultBrowserReports(
  collection,
  actual,
  inventory,
  subject,
  controllerHead,
) {
  const expected = browserCases(collection),
    observed = browserCases(actual),
    files = new Set();
  if (
    expected.size !== observed.size ||
    !Array.isArray(collection.errors) ||
    !Array.isArray(actual.errors) ||
    collection.errors?.length !== 0 ||
    actual.errors?.length !== 0 ||
    actual.stats?.unexpected !== 0 ||
    actual.stats?.flaky !== 0
  )
    fail('Complete original browser outcomes required');
  const projects = [
    'desktop',
    'tablet',
    'mobile',
    'desktop-journey',
    'tablet-journey',
    'mobile-journey',
  ];
  for (const r of [collection, actual]) {
    if (
      !Array.isArray(r.config?.projects) ||
      r.config.projects.length !== 6 ||
      JSON.stringify(r.config.projects.map((x) => x.name).sort()) !==
        JSON.stringify([...projects].sort())
    )
      fail('Original six projects required');
    for (const p of r.config.projects)
      if (p.timeout !== 30000 || p.retries !== 0 || p.repeatEach !== 1)
        fail('Original default project budgets and retry policy required');
  }
  if (
    !Number.isInteger(collection.config.workers) ||
    collection.config.workers < 1 ||
    actual.config.workers !== collection.config.workers
  )
    fail('Original default worker allocation must remain unchanged');
  if (
    actual.config.metadata?.gitCommit?.hash !== subject ||
    actual.config.metadata?.ci?.commitHash !== controllerHead
  )
    fail('Separate subject and controller report provenance required');
  let passed = 0,
    skipped = 0,
    expectedFailures = 0;
  const seenProjects = new Set();
  for (const [id, before] of expected) {
    const now = observed.get(id);
    const originalBudget =
      originalRuntimeBudgets[
        `${before.file}:${before.spec.line}:${before.spec.column}`
      ] ?? before.test.timeout;
    if (
      !now ||
      now.spec.ok !== true ||
      !inventory.includes(`tests/browser/${now.file}`) ||
      now.test.timeout !== originalBudget ||
      now.test.expectedStatus !== before.test.expectedStatus
    )
      fail('Exact original browser identity and declarations required');
    files.add(`tests/browser/${now.file}`);
    seenProjects.add(now.test.projectName);
    if (
      now.test.projectName.endsWith('-journey') !==
      (now.file === 'cycle6-journey.spec.ts')
    )
      fail('Original journey project filters required');
    const t = now.test;
    if (t.expectedStatus === 'skipped') {
      if (
        t.status !== 'skipped' ||
        !Array.isArray(t.results) ||
        t.results.length > 1 ||
        t.results.some(
          (r) =>
            r.status !== 'skipped' ||
            r.retry !== 0 ||
            !Number.isFinite(r.duration) ||
            r.duration < 0 ||
            !Array.isArray(r.errors) ||
            r.errors.length,
        )
      )
        fail('Declared skips must remain separately reported');
      skipped++;
      continue;
    }
    if (
      !['passed', 'failed'].includes(t.expectedStatus) ||
      t.status !== 'expected' ||
      !Array.isArray(t.results) ||
      t.results.length !== 1
    )
      fail('Original single-attempt outcome required');
    const r = t.results[0];
    if (
      r.status !== t.expectedStatus ||
      r.retry !== 0 ||
      !Number.isFinite(r.duration) ||
      r.duration < 0 ||
      r.duration > t.timeout ||
      !Array.isArray(r.errors) ||
      (t.expectedStatus === 'passed' && r.errors.length)
    )
      fail('Original assertion and time budget must pass');
    if (t.expectedStatus === 'passed') passed++;
    else expectedFailures++;
  }
  if (
    seenProjects.size !== 6 ||
    files.size !== inventory.length ||
    inventory.length !== 32 ||
    passed + expectedFailures !== actual.stats.expected ||
    skipped !== actual.stats.skipped
  )
    fail('Complete32-file outcome rollup required');
  return {
    collected: expected.size,
    passed,
    declared_skipped: skipped,
    declared_expected_failures: expectedFailures,
    source_files: files.size,
    full_foundation_pass: false,
    operational_acceptance: false,
  };
}
function browser(p) {
  const context = json(resolve(p.output, 'context.json'));
  const collection = json(resolve(p.output, 'default-collection.json'));
  const actual = json(resolve(p.output, 'default-browser.json'));
  const inventory = Object.keys(context.subject.files).filter((x) =>
    /^tests\/browser\/.*\.spec\.ts$/.test(x),
  );
  const proof = validateDefaultBrowserReports(
    collection,
    actual,
    inventory,
    subjectHead,
    context.controller.head,
  );
  if (
    !Number.isFinite(Date.parse(actual.stats.startTime)) ||
    Date.parse(actual.stats.startTime) < context.subject.started_epoch_ms
  )
    fail('Stale supplementary browser result');
  save(resolve(p.output, 'default-browser-verification.json'), {
    ...proof,
    source: context.subject,
    controller: context.controller,
    collection_sha256: hash(
      readFileSync(resolve(p.output, 'default-collection.json')),
    ),
    report_sha256: hash(
      readFileSync(resolve(p.output, 'default-browser.json')),
    ),
  });
}
function final(p) {
  binder('final', p);
  const context = json(resolve(p.output, 'context.json'));
  if (JSON.stringify(context.controller) !== JSON.stringify(controller(p)))
    fail('Controller changed during original-command execution');
  const result = json(
    resolve(p.subject, 'artifacts/cycle33/v1-pilot/final.json'),
  );
  if (JSON.stringify(context.subject.files) !== JSON.stringify(result.files))
    fail('Original subject source changed');
  save(resolve(p.output, 'final-source.json'), {
    subject: result,
    controller: context.controller,
    unchanged: true,
    full_foundation_pass: false,
    recovery_repeated: false,
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const p = paths(),
    mode = process.argv[2];
  if (mode === 'bind') bind(p);
  else if (mode === 'staging')
    command(p, 'staging', ['npm', 'run', 'staging:plan']);
  else if (mode === 'collect')
    command(
      p,
      'collection',
      ['npx', 'playwright', 'test', '--list', '--reporter=json'],
      {
        PLAYWRIGHT_JSON_OUTPUT_FILE: resolve(
          p.output,
          'default-collection.json',
        ),
      },
    );
  else if (mode === 'browser') {
    command(
      p,
      'browser',
      ['npm', 'run', 'test:browser', '--', '--reporter=json'],
      {
        PLAYWRIGHT_JSON_OUTPUT_FILE: resolve(p.output, 'default-browser.json'),
      },
    );
    browser(p);
  } else if (mode === 'final') final(p);
  else fail('Finite original-command supplement mode required');
  console.log(
    `Original523 ${mode} evidence complete; no operational authority.`,
  );
}
