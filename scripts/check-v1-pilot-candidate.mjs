// Source/report verification only; no business data, recovery authority or replay.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  inspectPilotAuthor,
  pilotAuthors,
  pilotParent,
} from './v1-pilot-source-integrity.mjs';
const directory = 'artifacts/cycle33/v1-pilot';
const git = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
const hash = (b) => createHash('sha256').update(b).digest('hex');
const fail = (m) => {
  throw Error(m);
};
const main = [
  '.github/workflows/cycle13-integration.yml',
  '.github/workflows/v1-pilot-source-review.yml',
  'scripts/check-cycle13-integrity.mjs',
  'scripts/check-cycle22.mjs',
  'scripts/check-cycle23.mjs',
  'scripts/cycle25-source-lineage.mjs',
  'scripts/v1-pilot-source-integrity.mjs',
  'scripts/check-v1-pilot-candidate.mjs',
  'tests/v1-pilot-source-integrity.test.ts',
  'docs/program/V1_FIRST_PILOT_ACCEPTANCE.md',
  'docs/program/V1_FOUNDATION_COVERAGE_GAPS.md',
  'docs/program/V1_FOUNDATION_COVERAGE_GAPS.json',
  'docs/program/V1_PILOT_COMBINED_VALIDATION.md',
  'docs/program/V1_PILOT_SOURCE_MANIFEST.json',
  'CURRENT_BUILD_STATE.md',
  'DECISIONS.md',
  'docs/PROGRAM_DELIVERY_STATUS.md',
  'docs/FEATURE_ACCEPTANCE_REGISTER.md',
  'docs/program/CYCLE33_V1_D1_RETURN_FORM.md',
];
const append = main.slice(-5);
const nativeFiles = {
  'tests/cycle13-service-passport-desk.test.ts': 79,
  'tests/program-trade-editions.test.ts': 22,
  'tests/v1-passport-final-authority.test.ts': 24,
  'tests/v1-pilot-source-integrity.test.ts': 50,
  'tests/v1-trade-final-authority.test.ts': 16,
};
const screenshotsExpected = ['customer', 'advanced'].flatMap((mode) =>
  ['desktop', 'tablet', 'mobile'].flatMap((view) =>
    ['straight-edge', 'cunningham', 'roofing-example'].map(
      (brand) => `artifacts/cycle13/${mode}-${view}-${brand}.png`,
    ),
  ),
);
function manifest() {
  const m = JSON.parse(
    readFileSync('docs/program/V1_PILOT_SOURCE_MANIFEST.json'),
  );
  if (
    m.schema !== 'propel-v1-pilot-source-review-v1' ||
    m.parent !== pilotParent ||
    m.authority !== 'PUBLIC_SOURCE_PROVENANCE_ONLY_NOT_BUSINESS_STATE' ||
    m.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    JSON.stringify(m.native_files) !== JSON.stringify(nativeFiles) ||
    JSON.stringify(m.screenshots) !== JSON.stringify(screenshotsExpected) ||
    JSON.stringify(m.authors) !==
      JSON.stringify(
        pilotAuthors.map((a, i) => ({
          path: a.path,
          commit: a.commit,
          draft_pr: i === 0 ? 301 : 300,
        })),
      )
  )
    fail('Exact finite pilot manifest required');
  return m;
}
function source() {
  const paths = git('ls-files').split('\n');
  const files = {};
  for (const path of paths) {
    let p = process.cwd();
    for (const part of path.split('/')) {
      p = resolve(p, part);
      if (lstatSync(p).isSymbolicLink()) fail('Tracked symlink forbidden');
    }
    if (!lstatSync(p).isFile()) fail('Regular tracked source required');
    const bytes = readFileSync(path);
    const committed = execFileSync(
      'git',
      ['--no-replace-objects', 'show', `HEAD:${path}`],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    if (!bytes.equals(committed)) fail('Every tracked byte must equal HEAD');
    files[path] = hash(bytes);
  }
  return files;
}
function identity() {
  manifest();
  if (git('status', '--porcelain', '--untracked-files=normal'))
    fail('Clean candidate required');
  const head = git('rev-parse', 'HEAD'),
    candidate = process.env.CANDIDATE_HEAD || head;
  if (
    !/^[a-f0-9]{40}$/.test(candidate) ||
    git('cat-file', '-t', candidate) !== 'commit'
  )
    fail('Exact candidate commit required');
  git('merge-base', '--is-ancestor', pilotParent, candidate);
  if (git('rev-list', '--merges', `${pilotParent}..${candidate}`))
    fail('Non-merge composition required');
  if (head !== candidate) {
    const parents = git('rev-list', '--parents', '-n', '1', head)
      .split(' ')
      .slice(1);
    if (
      parents.length !== 2 ||
      !parents.includes(pilotParent) ||
      !parents.includes(candidate)
    )
      fail('Exact original parent/candidate PR carrier required');
  }
  if (
    git('rev-parse', `${candidate}^{tree}`) !== git('rev-parse', 'HEAD^{tree}')
  )
    fail('PR carrier must have exact candidate tree');
  git('merge-base', '--is-ancestor', pilotParent, 'HEAD');
  const allowed = new Set([
    ...main,
    ...pilotAuthors.flatMap((a) => [a.path, ...a.added]),
  ]);
  const changed = git('diff', '--name-only', pilotParent, 'HEAD').split('\n');
  if (
    changed.length !== allowed.size ||
    changed.some((p) => !allowed.delete(p)) ||
    allowed.size
  )
    fail('Exact finite combined delta required');
  for (const p of changed)
    if (git('ls-tree', 'HEAD', '--', p).split(/\s+/)[0] !== '100644')
      fail('Regular non-executable changed source required');
  for (const p of append) {
    const base = execFileSync('git', [
      '--no-replace-objects',
      'show',
      `${pilotParent}:${p}`,
    ]);
    if (!readFileSync(p).subarray(0, base.length).equals(base))
      fail('Register prefix changed');
  }
  for (const a of pilotAuthors)
    inspectPilotAuthor(a.path, readFileSync(a.path));
  const result = {
    candidate,
    checkout: head,
    tree: git('rev-parse', 'HEAD^{tree}'),
    baseline: pilotParent,
    files: source(),
    business_authority: false,
    restore_adapter: false,
  };
  return result;
}
function bind() {
  const result = { ...identity(), started_epoch_ms: Date.now() };
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    `${directory}/before.json`,
    JSON.stringify(result, null, 2) + '\n',
  );
  return result;
}
function checkBefore() {
  const before = JSON.parse(readFileSync(`${directory}/before.json`));
  const { started_epoch_ms, ...previous } = before;
  if (
    !Number.isFinite(started_epoch_ms) ||
    JSON.stringify(previous) !== JSON.stringify(identity())
  )
    fail('Exact complete source identity changed during verification');
  return before;
}
function final() {
  const before = checkBefore();
  writeFileSync(
    `${directory}/final.json`,
    JSON.stringify({ ...before, unchanged: true }, null, 2) + '\n',
  );
}
const nativeIdentities = {
  'tests/cycle13-service-passport-desk.test.ts':
    'd166bb738d3dae52708e9b786d4bcdb3910745525788e3ea217ea301859f877a',
  'tests/program-trade-editions.test.ts':
    'f27a34bf581f576e791fdd09034b17152d5129832d6b9fe897fa023284ae9354',
  'tests/v1-passport-final-authority.test.ts':
    '9b7aa97bc9b76f65f6ae83bcc0103ac20bd74e1825a6431dee63992f58da198c',
  'tests/v1-pilot-source-integrity.test.ts':
    '0ed2b9b61b2659e59a63cf12567aa6daba063add3400848e8f848935b21629d9',
  'tests/v1-trade-final-authority.test.ts':
    '6f917366f437d8c8a84e13c0caf7b4ca97e5b3e3e8f786bf12a92894db03c85d',
};
export function validateNativeReport(r, root = process.cwd()) {
  if (
    Object.hasOwn(r, 'numRuntimeErrorTestSuites') &&
    r.numRuntimeErrorTestSuites !== 0
  )
    fail('Runtime error count must be zero');
  if (
    r.success !== true ||
    r.numTotalTests !== 191 ||
    r.numPassedTests !== 191 ||
    r.numTotalTestSuites !== 5 ||
    r.numPassedTestSuites !== 5 ||
    [
      'numFailedTests',
      'numPendingTests',
      'numTodoTests',
      'numFailedTestSuites',
      'numPendingTestSuites',
    ].some((k) => r[k] !== 0) ||
    !Array.isArray(r.testResults) ||
    r.testResults.length !== 5
  )
    fail('Complete exact native collection required');
  const expected = new Map(Object.entries(nativeFiles)),
    ids = new Set();
  for (const f of r.testResults) {
    const path = f.name.replace(root + '/', '');
    if (
      !expected.has(path) ||
      f.status !== 'passed' ||
      f.message !== '' ||
      f.assertionResults.length !== expected.get(path)
    )
      fail('Exact native file/count required');
    expected.delete(path);
    for (const a of f.assertionResults) {
      const id = `${path}:${a.fullName}`;
      if (
        typeof a.fullName !== 'string' ||
        !a.fullName.trim() ||
        a.status !== 'passed' ||
        !Array.isArray(a.failureMessages) ||
        a.failureMessages.length ||
        !Number.isFinite(a.duration) ||
        a.duration < 0 ||
        a.duration > 30000 ||
        ids.has(id)
      )
        fail('Every original unique assertion must pass within budget');
      ids.add(id);
    }
    if (
      hash(JSON.stringify(f.assertionResults.map((a) => a.fullName).sort())) !==
      nativeIdentities[path]
    )
      fail('Exact original native identities required');
  }
  if (expected.size || ids.size !== 191) fail('Incomplete native identities');
  return { cases: 191 };
}
function native() {
  manifest();
  const before = checkBefore(),
    bytes = readFileSync(`${directory}/native.json`),
    r = JSON.parse(bytes);
  const result = validateNativeReport(r);
  if (!Number.isFinite(r.startTime) || r.startTime < before.started_epoch_ms)
    fail('Stale native report');
  writeFileSync(
    `${directory}/native-verification.json`,
    JSON.stringify(
      {
        ...result,
        report_sha256: hash(bytes),
        source: before,
        authority: false,
      },
      null,
      2,
    ) + '\n',
  );
}
export function validateBrowserReport(r, file, head, requireCI = false) {
  const off = file === 'off.json';
  if (!off && file !== 'browser.json') fail('Unknown browser scope');
  const expected = new Set();
  for (const project of ['desktop', 'tablet', 'mobile']) {
    if (off)
      expected.add(
        `cycle13-default-off.spec.ts:production operating center remains closed:${project}`,
      );
    else
      for (const brand of ['straight-edge', 'cunningham', 'roofing-example']) {
        expected.add(
          `cycle13-customer.spec.ts:actual service and Passport source continuity / ${brand}:${project}`,
        );
        expected.add(
          `cycle13-advanced.spec.ts:advanced exact references retain original controls / ${brand}:${project}`,
        );
      }
  }
  if (
    r.config.workers !== 1 ||
    !Array.isArray(r.errors) ||
    r.errors.length ||
    ['unexpected', 'flaky', 'skipped'].some((k) => r.stats[k] !== 0) ||
    r.stats.expected !== expected.size ||
    r.config.projects.length !== 3
  )
    fail('Exact complete browser collection required');
  const projects = new Set(['desktop', 'tablet', 'mobile']);
  for (const p of r.config.projects)
    if (
      !projects.delete(p.name) ||
      p.retries !== 0 ||
      p.repeatEach !== 1 ||
      p.timeout !== 90000
    )
      fail('Exact original project settings required');
  const metadata = r.config.metadata;
  if (
    requireCI &&
    (metadata?.gitCommit?.hash !== head || metadata?.ci?.commitHash !== head)
  )
    fail('Exact hosted report checkout identity required');
  if (
    !requireCI &&
    ((Object.hasOwn(metadata ?? {}, 'gitCommit') &&
      metadata?.gitCommit?.hash !== head) ||
      (Object.hasOwn(metadata ?? {}, 'ci') &&
        metadata?.ci?.commitHash !== head))
  )
    fail('Different report checkout identity');
  let cases = 0;
  function visit(s, inherited = '') {
    const path = s.file || inherited;
    for (const spec of s.specs || [])
      for (const t of spec.tests) {
        const id = `${path}:${spec.title}:${t.projectName}`;
        if (
          !expected.delete(id) ||
          spec.ok !== true ||
          t.status !== 'expected' ||
          t.expectedStatus !== 'passed' ||
          t.timeout !== 90000 ||
          t.results.length !== 1
        )
          fail('Exact original browser identity required');
        const x = t.results[0];
        if (
          x.status !== 'passed' ||
          x.retry !== 0 ||
          !Array.isArray(x.errors) ||
          x.errors.length ||
          !Number.isFinite(x.duration) ||
          x.duration < 0 ||
          x.duration > 90000
        )
          fail('Original single-attempt browser result required');
        cases++;
      }
    for (const child of s.suites || []) visit(child, path);
  }
  for (const s of r.suites) visit(s);
  if (expected.size || cases !== (off ? 3 : 18))
    fail('Browser identities incomplete');
  return {
    cases,
    report_git_identity: requireCI
      ? 'EXACT_HOSTED_CHECKOUT'
      : 'LOCAL_METADATA_UNVERIFIED',
  };
}
function browser() {
  manifest();
  const before = checkBefore(),
    summary = {};
  for (const file of ['browser.json', 'off.json']) {
    const bytes = readFileSync(`${directory}/${file}`),
      r = JSON.parse(bytes);
    const result = validateBrowserReport(
      r,
      file,
      before.checkout,
      process.env.GITHUB_ACTIONS === 'true',
    );
    if (
      !Number.isFinite(Date.parse(r.stats.startTime)) ||
      Date.parse(r.stats.startTime) < before.started_epoch_ms
    )
      fail('Stale browser report');
    summary[file] = { ...result, report_sha256: hash(bytes) };
  }
  const screenshots = screenshotsExpected.map((path) => {
    const bytes = readFileSync(path);
    if (
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      fail('Actual PNG screenshot required');
    return { path, sha256: hash(bytes) };
  });
  writeFileSync(
    `${directory}/browser-verification.json`,
    JSON.stringify(
      {
        summary,
        screenshots,
        source: before,
        binding: 'WHOLE_CLEAN_JOB_BEFORE_FINAL_NOT_CAPTURE_TIME',
        visual_approval: false,
        operational_acceptance: false,
      },
      null,
      2,
    ) + '\n',
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const command = process.argv[2];
  if (command === 'bind') bind();
  else if (command === 'final') final();
  else if (command === 'native') native();
  else if (command === 'browser') browser();
  else fail('Finite verification command required');
  console.log(`V1 pilot ${command}: source-only verification PASS`);
}
