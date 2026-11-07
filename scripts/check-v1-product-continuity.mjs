// Source/report verification only; no business data, recovery authority or replay.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import {
  admitNextNative,
  nextAuthors,
  nextParent,
} from './v1-next-native-source.mjs';
const directory = 'artifacts/cycle33/v1-product-continuity';
const controller = '725829eac3261854c519652d296d054def216330';
const controllerFiles = [
  '.github/workflows/foundation-command-supplement.yml',
  'scripts/foundation-command-supplement.mjs',
  'tests/foundation-command-supplement.test.ts',
  'docs/program/V1_302_FOUNDATION_GAPS.md',
  'docs/program/V1_302_FOUNDATION_GAPS.json',
  'docs/program/V1_FOUNDATION_COMMAND_SUPPLEMENT.md',
];
const git = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
const hash = (b) => createHash('sha256').update(b).digest('hex');
const fail = (m) => {
  throw Error(m);
};
const append = [
  'CURRENT_BUILD_STATE.md',
  'DECISIONS.md',
  'docs/PROGRAM_DELIVERY_STATUS.md',
  'docs/FEATURE_ACCEPTANCE_REGISTER.md',
  'docs/program/SHARED_CONTRACTS.md',
];
const main = [
  ...append,
  '.github/workflows/v1-product-continuity.yml',
  'scripts/check-cycle17-integrity.mjs',
  'scripts/check-cycle22.mjs',
  'scripts/check-cycle23.mjs',
  'scripts/cycle25-source-lineage.mjs',
  'scripts/v1-next-native-source.mjs',
  'scripts/check-v1-product-continuity.mjs',
  'tests/v1-next-native-source.test.ts',
  'tests/v1-product-report-integrity.test.ts',
  'tests/program/playwright.v1-field-finance-continuity.config.ts',
  'tests/program/v1-field-finance-continuity.spec.ts',
  'docs/program/V1_FIRST_PILOT_OWNER_DECISIONS.md',
  'docs/program/V1_PRODUCT_CONTINUITY_MANIFEST.json',
  'docs/program/V1_PRODUCT_CONTINUITY_VALIDATION.md',
];
export const nativeFiles = Object.freeze({
  'tests/v1-next-native-source.test.ts': 42,
  'tests/v1-field-navigation-ack.test.ts': 19,
  'tests/v1-finance-retained-selection.test.ts': 27,
  'tests/foundation-command-supplement.test.ts': 26,
  'tests/v1-product-report-integrity.test.ts': 25,
});
const totalNative = Object.values(nativeFiles).reduce((a, b) => a + b, 0);
const screenshotsExpected = [
  'field-original',
  'field-destination',
  'finance-original',
  'finance-reverified',
].flatMap((state) =>
  ['desktop', 'tablet', 'mobile'].flatMap((view) =>
    ['straight-edge', 'cunningham', 'roofing-example'].map(
      (brand) => `${directory}/screenshots/${state}-${view}-${brand}.png`,
    ),
  ),
);
function manifest() {
  const m = JSON.parse(
    readFileSync('docs/program/V1_PRODUCT_CONTINUITY_MANIFEST.json'),
  );
  if (
    m.schema !== 'propel-v1-product-continuity-v1' ||
    m.parent !== nextParent ||
    m.authority !== 'PUBLIC_SOURCE_PROVENANCE_ONLY_NOT_BUSINESS_STATE' ||
    m.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    JSON.stringify(m.native_files) !== JSON.stringify(nativeFiles) ||
    JSON.stringify(m.screenshots) !== JSON.stringify(screenshotsExpected) ||
    JSON.stringify(m.authors) !==
      JSON.stringify(
        nextAuthors.map((a, i) => ({
          commit: a.commit,
          draft_pr: i === 0 ? 304 : 303,
          modified: a.modified,
          added: a.added,
        })),
      ) ||
    m.controller !== controller ||
    JSON.stringify(m.controller_files) !== JSON.stringify(controllerFiles)
  )
    fail('Exact finite continuity manifest required');
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
  git('merge-base', '--is-ancestor', nextParent, candidate);
  if (git('rev-list', '--merges', `${nextParent}..${candidate}`))
    fail('Non-merge composition required');
  if (head !== candidate) {
    const parents = git('rev-list', '--parents', '-n', '1', head)
      .split(' ')
      .slice(1);
    if (
      parents.length !== 2 ||
      !parents.includes(nextParent) ||
      !parents.includes(candidate)
    )
      fail('Exact original parent/candidate PR carrier required');
  }
  if (
    git('rev-parse', `${candidate}^{tree}`) !== git('rev-parse', 'HEAD^{tree}')
  )
    fail('PR carrier must have exact candidate tree');
  git('merge-base', '--is-ancestor', nextParent, 'HEAD');
  const allowed = new Set([
    ...main,
    ...controllerFiles,
    ...nextAuthors.flatMap((a) => [...a.modified, ...a.added]),
  ]);
  const changed = git('diff', '--name-only', nextParent, 'HEAD').split('\n');
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
      `${nextParent}:${p}`,
    ]);
    if (!readFileSync(p).subarray(0, base.length).equals(base))
      fail('Register prefix changed');
  }
  for (const a of nextAuthors)
    for (const path of a.modified)
      admitNextNative(
        path,
        readFileSync(path),
        execFileSync('git', [
          '--no-replace-objects',
          'show',
          `${nextParent}:${path}`,
        ]),
      );
  if (
    git('rev-list', '--parents', '-n', '1', controller) !==
    `${controller} ${nextParent}`
  )
    fail('Exact sole523 controller source required');
  const controllerDelta = git(
    'diff-tree',
    '--no-commit-id',
    '--name-status',
    '-r',
    controller,
  )
    .split('\n')
    .sort()
    .join('\n');
  if (
    controllerDelta !==
    controllerFiles
      .map((p) => 'A\t' + p)
      .sort()
      .join('\n')
  )
    fail('Exact six controller additions required');
  for (const path of controllerFiles) {
    let original = execFileSync('git', [
      '--no-replace-objects',
      'show',
      `${controller}:${path}`,
    ]);
    if (path === '.github/workflows/foundation-command-supplement.yml') {
      let text = original.toString();
      for (const name of [
        'controller-tests',
        'original-staging-plan',
        'original-default-browsers',
      ]) {
        const token = `  ${name}:\n`;
        if (text.split(token).length !== 2)
          fail('Exact controller job required');
        text = text.replace(
          token,
          token +
            "    if: >-\n      github.head_ref == 'codex/v1-foundation-gap-evidence' ||\n      github.ref == 'refs/heads/codex/v1-foundation-gap-evidence'\n",
        );
      }
      original = Buffer.from(text);
    }
    if (!readFileSync(path).equals(original))
      fail(
        'Exact controller source with only finite duplicate-run guards required',
      );
  }
  const result = {
    candidate,
    checkout: head,
    tree: git('rev-parse', 'HEAD^{tree}'),
    baseline: nextParent,
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
export const nativeIdentities = Object.freeze({
  'tests/foundation-command-supplement.test.ts':
    'ff747e3bce2b62aef1f4b0cfbc6fce27d95c0c7b289c1f35b5f4fa17943f67f2',
  'tests/v1-field-navigation-ack.test.ts':
    '287b4c1d9a60e586349fbbefc7813b1bd1c6c2a189764137ad9cd968760ae25d',
  'tests/v1-finance-retained-selection.test.ts':
    '8fbb9120041dfaf15331f89da14072bb62871bd5fb02802966b2900f3cdbda1c',
  'tests/v1-next-native-source.test.ts':
    '49eee61dab0916532134b1e845d422484af4394f404edf3a6abf1517465977ac',
  'tests/v1-product-report-integrity.test.ts':
    '23edfdaef21eb3040e7862ed93c02cadd111b066aab6a2a6c976e8a71902a424',
});
export function validateNativeReport(r, root = process.cwd()) {
  if (
    Object.hasOwn(r, 'numRuntimeErrorTestSuites') &&
    r.numRuntimeErrorTestSuites !== 0
  )
    fail('Runtime error count must be zero');
  if (
    r.success !== true ||
    r.numTotalTests !== totalNative ||
    r.numPassedTests !== totalNative ||
    r.numTotalTestSuites !== Object.keys(nativeFiles).length ||
    r.numPassedTestSuites !== Object.keys(nativeFiles).length ||
    [
      'numFailedTests',
      'numPendingTests',
      'numTodoTests',
      'numFailedTestSuites',
      'numPendingTestSuites',
    ].some((k) => r[k] !== 0) ||
    !Array.isArray(r.testResults) ||
    r.testResults.length !== Object.keys(nativeFiles).length
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
  if (expected.size || ids.size !== totalNative)
    fail('Incomplete native identities');
  return { cases: totalNative };
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
        `v1-field-finance-continuity.spec.ts:production keeps Field and Finance continuity controls OFF:${project}`,
      );
    else
      for (const brand of ['straight-edge', 'cunningham', 'roofing-example']) {
        expected.add(
          `v1-field-finance-continuity.spec.ts:ordinary Field void navigation retains exact job and destination focus / ${brand}:${project}`,
        );
        expected.add(
          `v1-field-finance-continuity.spec.ts:ordinary Finance material save retains exact time selection for fresh verification / ${brand}:${project}`,
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
      p.timeout !== 150000
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
          t.timeout !==
            (off || spec.title.startsWith('ordinary Field ')
              ? 90000
              : 150000) ||
          !Array.isArray(t.results) ||
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
          x.duration > t.timeout
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
export async function validateScreenshot(bytes) {
  if (
    !Buffer.isBuffer(bytes) ||
    !bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    !bytes
      .subarray(-12)
      .equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]))
  )
    fail('Complete PNG screenshot required');
  const { data, info } = await sharp(bytes, {
    failOn: 'warning',
    limitInputPixels: 40000000,
  })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    !Number.isSafeInteger(info.width) ||
    info.width < 1 ||
    !Number.isSafeInteger(info.height) ||
    info.height < 1 ||
    data.length !== info.width * info.height * info.channels
  )
    fail('Fully decoded PNG dimensions required');
  return { width: info.width, height: info.height };
}
async function browser() {
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
  const screenshots = [];
  for (const path of screenshotsExpected) {
    const bytes = readFileSync(path);
    const dimensions = await validateScreenshot(bytes);
    screenshots.push({ path, sha256: hash(bytes), ...dimensions });
  }
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
  else if (command === 'browser') await browser();
  else fail('Finite verification command required');
  console.log(
    `V1 product continuity ${command}: source-only verification PASS`,
  );
}
