// Public source provenance only. Never business-state recovery or runtime authority.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cycle25SourcePorts } from './cycle25-source-lineage.mjs';
import { admitNextNative } from './v1-next-native-source.mjs';
export const inventoryParent = '337da476aa6061dba626aff343f0e6045331ac82';
export const inventoryAuthor = 'bd8f150c1a347fd172cf5922d67e2664af59f14b';
export const inventoryPath = 'tests/cycle17-integration.test.ts';
export const inventoryDoc = 'docs/program/V1_C17_FIELD_INVENTORY.md';
const predecessor =
  '6e68a895ce33c1bcda2ffb5a660aa27f9abf0f89a33c12439c9baf6a31a74589';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const same = (a, b) => Buffer.from(a).equals(Buffer.from(b));
const fail = (m) => {
  throw Error(m);
};
export function admitC17InventorySuccessor(
  path,
  current,
  previous,
  supplied = {},
) {
  if (path !== inventoryPath)
    fail('Only the exact C17 independent test may evolve');
  const p = { ...cycle25SourcePorts, ...supplied };
  if (
    p.type(inventoryAuthor) !== 'commit' ||
    p.parent(inventoryAuthor) !== inventoryParent ||
    p.delta(inventoryAuthor) !==
      ['M\t' + inventoryPath, 'A\t' + inventoryDoc].sort().join('\n')
  )
    fail('Exact sole337 M1/A1 C17 test author required');
  if (
    p.mode(inventoryParent, path) !== '100644' ||
    p.mode(inventoryAuthor, path) !== '100644' ||
    p.mode(inventoryAuthor, inventoryDoc) !== '100644'
  )
    fail('Regular exact CI source required');
  if (
    hash(previous) !== predecessor ||
    !same(previous, p.git(inventoryParent, path))
  )
    fail('Exact immutable b947/337 predecessor required');
  if (
    same(current, previous) ||
    !same(current, p.git(inventoryAuthor, path)) ||
    !same(p.read(path), current) ||
    !same(p.read(inventoryDoc), p.git(inventoryAuthor, inventoryDoc))
  )
    fail('Complete exact current C17 test/doc bundle required');
  const field = 'src/lib/workflows/field-workspace.ts';
  admitNextNative(
    field,
    p.read(field),
    p.git('523afd4ef17d5502b6e0e39a4df86bdaa7bba23b', field),
    p,
  );
  if (!same(p.read(inventoryDoc), p.git(inventoryAuthor, inventoryDoc)))
    fail('Final fresh C17 doc required');
  if (!same(p.read(path), current)) fail('Final fresh C17 endpoint required');
  return {
    path,
    source_commit: inventoryAuthor,
    module: 'c17-field-inventory-compatibility',
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  };
}
const directory = 'artifacts/cycle33/v1-c17-inventory';
const append = [
  'CURRENT_BUILD_STATE.md',
  'DECISIONS.md',
  'docs/PROGRAM_DELIVERY_STATUS.md',
  'docs/FEATURE_ACCEPTANCE_REGISTER.md',
];
const roots = [
  'scripts/cycle25-source-lineage.mjs',
  'scripts/v1-c17-inventory-source.mjs',
  'tests/v1-c17-inventory-source.test.mjs',
  '.github/workflows/v1-c17-inventory-review.yml',
  'docs/program/V1_C17_SOURCE_ADMISSION.md',
  'docs/program/V1_C17_SOURCE_MANIFEST.json',
  ...append,
];
const git = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
function identity() {
  const m = JSON.parse(
    readFileSync('docs/program/V1_C17_SOURCE_MANIFEST.json'),
  );
  if (
    JSON.stringify(m) !==
    JSON.stringify({
      schema: 'propel-v1-c17-source-successor-v1',
      parent: inventoryParent,
      author: inventoryAuthor,
      modified: inventoryPath,
      added: inventoryDoc,
      root_files: roots,
      old_predecessor_sha256: predecessor,
      authority: 'SOURCE_ONLY_NOT_OPERATIONAL_ACCEPTANCE',
    })
  )
    fail('Exact finite C17 manifest required');
  if (git('status', '--porcelain', '--untracked-files=normal'))
    fail('Clean exact CI candidate required');
  const checkout = git('rev-parse', 'HEAD'),
    candidate = process.env.CANDIDATE_HEAD || checkout;
  if (!/^[a-f0-9]{40}$/.test(candidate)) fail('Exact candidate SHA required');
  git('merge-base', '--is-ancestor', inventoryParent, candidate);
  if (git('rev-list', '--merges', `${inventoryParent}..${candidate}`))
    fail('Nonmerge source composition required');
  const tree = git('rev-parse', 'HEAD^{tree}');
  if (tree !== git('rev-parse', `${candidate}^{tree}`))
    fail('Exact same-tree candidate required');
  if (
    candidate !== checkout &&
    git('rev-list', '--parents', '-n', '1', checkout)
      .split(' ')
      .slice(1)
      .sort()
      .join(' ') !== [inventoryParent, candidate].sort().join(' ')
  )
    fail('Exact original base/candidate carrier required');
  const expected = [inventoryPath, inventoryDoc, ...roots].sort();
  if (
    git('diff', '--name-only', inventoryParent, 'HEAD')
      .split('\n')
      .sort()
      .join('\n') !== expected.join('\n')
  )
    fail('Exact finite test-only composition required');
  for (const path of append) {
    const base = execFileSync('git', [
      '--no-replace-objects',
      'show',
      `${inventoryParent}:${path}`,
    ]);
    if (!readFileSync(path).subarray(0, base.length).equals(base))
      fail('Original register prefix changed');
  }
  admitC17InventorySuccessor(
    inventoryPath,
    readFileSync(inventoryPath),
    execFileSync('git', [
      '--no-replace-objects',
      'show',
      `${inventoryParent}:${inventoryPath}`,
    ]),
  );
  const files = {};
  for (const row of git('ls-tree', '-r', 'HEAD').split('\n')) {
    const [entry, path] = row.split('\t'),
      [mode, kind, object] = entry.split(' ');
    if (kind !== 'blob') fail('Tracked blob required');
    let full = process.cwd();
    for (const part of path.split('/')) {
      full = resolve(full, part);
      if (lstatSync(full).isSymbolicLink()) fail('Tracked symlink forbidden');
    }
    if (!lstatSync(full).isFile()) fail('Regular source required');
    const bytes = readFileSync(full);
    if (
      createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex') !== object
    )
      fail('Every tracked byte must equal HEAD');
    if (expected.includes(path) && mode !== '100644')
      fail('Regular changed source required');
    files[path] = hash(bytes);
  }
  return {
    candidate,
    checkout,
    tree,
    parent: inventoryParent,
    files,
    business_authority: false,
    operational_acceptance: false,
  };
}
function bind() {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    `${directory}/before.json`,
    JSON.stringify({ ...identity(), started_epoch_ms: Date.now() }, null, 2) +
      '\n',
  );
}
function before() {
  const b = JSON.parse(readFileSync(`${directory}/before.json`));
  const { started_epoch_ms, ...rest } = b;
  if (
    !Number.isFinite(started_epoch_ms) ||
    JSON.stringify(rest) !== JSON.stringify(identity())
  )
    fail('Exact complete source changed');
  return b;
}
function final() {
  const b = before();
  writeFileSync(
    `${directory}/final.json`,
    JSON.stringify({ ...b, unchanged: true }, null, 2) + '\n',
  );
}
function controls() {
  const text = readFileSync(`${directory}/controls.tap`, 'utf8');
  for (const [name, count] of [
    ['tests', 31],
    ['pass', 31],
    ['fail', 0],
    ['cancelled', 0],
    ['skipped', 0],
    ['todo', 0],
  ]) {
    const matches = [
      ...text.matchAll(new RegExp('^# ' + name + ' (\\d+)$', 'gm')),
    ];
    if (matches.length !== 1 || Number(matches[0][1]) !== count)
      fail('Exact unique31-case TAP summary required');
  }
  const passed = [...text.matchAll(/^ok (\d+) - (.+)$/gm)];
  if (
    passed.length !== 31 ||
    passed.some((m, i) => Number(m[1]) !== i + 1) ||
    new Set(passed.map((m) => m[2])).size !== 31 ||
    [...text.matchAll(/^1\.\.31$/gm)].length !== 1 ||
    /^not ok /m.test(text) ||
    /# (?:SKIP|TODO)\b/i.test(text)
  )
    fail('Exact31 distinct successful controls required');
  before();
}
export function validateFocusedReport(
  r,
  root = process.cwd(),
  minimumStartTime = 0,
) {
  const name =
    'the combined admission retains all thirty exact reviewed source/test blobs without overlapping ownership';
  if (
    r.success !== true ||
    r.numTotalTests !== 45 ||
    r.numPassedTests !== 1 ||
    r.numFailedTests !== 0 ||
    r.numPendingTests !== 44 ||
    r.numTotalTestSuites !== 1 ||
    r.numPassedTestSuites !== 1 ||
    ['numFailedTestSuites', 'numPendingTestSuites', 'numTodoTests'].some(
      (k) => r[k] !== 0,
    ) ||
    (Object.hasOwn(r, 'numRuntimeErrorTestSuites') &&
      r.numRuntimeErrorTestSuites !== 0) ||
    !Array.isArray(r.testResults) ||
    r.testResults.length !== 1 ||
    !Number.isFinite(r.startTime) ||
    r.startTime < minimumStartTime
  )
    fail(
      'Exactly one original focused case and44 unselected with no errors required',
    );
  const f = r.testResults[0];
  if (
    f.name !== resolve(root, inventoryPath) ||
    f.status !== 'passed' ||
    f.message !== '' ||
    !Array.isArray(f.assertionResults) ||
    f.assertionResults.length !== 45
  )
    fail('Exact original C17 file required');
  const ids = new Set();
  let passed = 0;
  for (const a of f.assertionResults) {
    if (
      typeof a.fullName !== 'string' ||
      !a.fullName ||
      ids.has(a.fullName) ||
      !Array.isArray(a.failureMessages) ||
      a.failureMessages.length
    )
      fail('Original unique case identities required');
    ids.add(a.fullName);
    if (a.fullName === name) {
      if (
        a.status !== 'passed' ||
        !Number.isFinite(a.duration) ||
        a.duration < 0 ||
        a.duration > 30000
      )
        fail('Original30s focused assertion required');
      passed++;
    } else if (a.status !== 'skipped')
      fail('Other44 cases must remain unselected');
  }
  if (
    passed !== 1 ||
    hash(JSON.stringify([...ids].sort())) !==
      '4edc73bf8a00d7fa9c86da30ea5db5a2275ad4fb54717e21514f79e8b60a3a40'
  )
    fail('Original focused identities changed');
  return { passed: 1, unselected: 44, full480_pass: false };
}
function focused() {
  const b = before(),
    bytes = readFileSync(`${directory}/focused.json`),
    r = JSON.parse(bytes);
  const result = validateFocusedReport(r, process.cwd(), b.started_epoch_ms);
  writeFileSync(
    `${directory}/focused-verification.json`,
    JSON.stringify(
      { ...result, report_sha256: hash(bytes), source: b },
      null,
      2,
    ) + '\n',
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const c = process.argv[2];
  if (c === 'bind') bind();
  else if (c === 'final') final();
  else if (c === 'focused') focused();
  else if (c === 'controls') controls();
  else fail('Finite CI command required');
  console.log(`C17 source ${c} PASS; no operational authority`);
}
