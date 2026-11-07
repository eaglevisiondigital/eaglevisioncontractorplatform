// Source-only integration evidence. No business state, restoration or execution.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  lstatSync,
  realpathSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export const parent = 'a415bb4b35ff9e5727ce4f1a05a8f7f00def8bbc';
export const common = '337da476aa6061dba626aff343f0e6045331ac82';
export const author = 'a481d6b5ffdcdb82a68b69a2f4424e597939bbf0';
export const authorFiles = Object.freeze([
  '.gitignore',
  '.github/workflows/v1-finance-artifact-hygiene.yml',
  'tests/v1-finance-artifact-hygiene.test.mjs',
  'docs/program/V1_FINANCE_ARTIFACT_HYGIENE.md',
]);
const append = [
  'CURRENT_BUILD_STATE.md',
  'DECISIONS.md',
  'docs/PROGRAM_DELIVERY_STATUS.md',
  'docs/FEATURE_ACCEPTANCE_REGISTER.md',
];
const roots = [
  'scripts/v1-hygiene-integration.mjs',
  'tests/v1-hygiene-integration.test.mjs',
  '.github/workflows/v1-hygiene-integration.yml',
  'docs/program/V1_HYGIENE_INTEGRATION_MANIFEST.json',
  'docs/program/V1_HYGIENE_INTEGRATION_VALIDATION.md',
  'docs/program/V1_FIRST_PILOT_WRITER_INVENTORY.md',
  'docs/program/V1_INTEGRATION_SCORECARD.json',
  'docs/program/V1_FOUNDATION_COVERAGE_RECONCILIATION.json',
  ...append,
];
export const rootFiles = Object.freeze(roots);
const fail = (m) => {
  throw Error(m);
};
const hash = (b) => createHash('sha256').update(b).digest('hex');
const same = (a, b) => Buffer.from(a).equals(Buffer.from(b));
const git = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
export const ports = Object.freeze({
  read: (p) => readFileSync(p),
  git: (c, p) =>
    execFileSync('git', ['--no-replace-objects', 'show', `${c}:${p}`]),
  type: (c) => git('cat-file', '-t', c),
  parent: (c) =>
    git('rev-list', '--parents', '-n', '1', c).split(' ').slice(1).join(' '),
  delta: (c) =>
    git('diff-tree', '--no-commit-id', '--name-status', '-r', c)
      .split('\n')
      .sort()
      .join('\n'),
  mode: (c, p) => git('ls-tree', c, '--', p).split(/\s+/)[0],
});
export function admitHygiene(supplied = {}) {
  const p = { ...ports, ...supplied };
  if (
    p.type(author) !== 'commit' ||
    p.parent(author) !== common ||
    p.type(parent) !== 'commit'
  )
    fail('Exact hygiene author and verified parent required');
  const expected = authorFiles
    .map((f) => (f === '.gitignore' ? 'M' : 'A') + '\t' + f)
    .sort()
    .join('\n');
  if (p.delta(author) !== expected)
    fail('Exactly the reviewed hygiene M1/A3 bundle required');
  for (const f of authorFiles)
    if (p.mode(author, f) !== '100644' || !same(p.read(f), p.git(author, f)))
      fail('Complete regular exact hygiene bytes required');
  const base = p.git(parent, '.gitignore');
  if (
    !same(base, p.git(common, '.gitignore')) ||
    !same(
      p.read('.gitignore'),
      Buffer.concat([
        Buffer.from(base),
        Buffer.from('\n/artifacts/finance/*.png\n'),
      ]),
    )
  )
    fail('Only original exact finance PNG ignore append allowed');
  for (const f of authorFiles)
    if (!same(p.read(f), p.git(author, f)))
      fail('Hygiene bundle changed during verification');
  if (!same(p.read('.gitignore'), p.git(author, '.gitignore')))
    fail('Final fresh primary ignore endpoint required');
  return {
    source_commit: author,
    source_only: true,
    business_authority: false,
    restoration: false,
  };
}
export function trackedSnapshot(root = process.cwd()) {
  if (
    realpathSync(root) !==
    realpathSync(
      execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
      }).trim(),
    )
  )
    fail('Exact Git root required');
  const status = execFileSync(
    'git',
    ['-C', root, 'status', '--porcelain', '--untracked-files=normal'],
    { encoding: 'utf8' },
  ).trim();
  if (status) fail('Clean source including unignored additions required');
  const tree = execFileSync(
    'git',
    [
      '--no-replace-objects',
      '-C',
      root,
      'ls-tree',
      '-r',
      '--full-tree',
      'HEAD',
    ],
    { encoding: 'utf8' },
  ).trim();
  const files = {};
  for (const row of tree.split('\n')) {
    const [entry, path] = row.split('\t'),
      [mode, kind, object] = entry.split(' ');
    if (kind !== 'blob' || !['100644', '100755'].includes(mode))
      fail('Regular tracked blob required');
    let full = root;
    for (const part of path.split('/')) {
      full = resolve(full, part);
      if (lstatSync(full).isSymbolicLink()) fail('Tracked symlink forbidden');
    }
    if (!lstatSync(full).isFile()) fail('Regular tracked file required');
    const bytes = readFileSync(full);
    if (
      createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex') !== object
    )
      fail(
        'Every tracked byte must equal HEAD regardless of ignore/status flags',
      );
    files[path] = hash(bytes);
  }
  return files;
}
function scorecard() {
  const baseline = JSON.parse(
    readFileSync('docs/FEATURE_ACCEPTANCE_EVIDENCE.json'),
  );
  const s = JSON.parse(
    readFileSync('docs/program/V1_INTEGRATION_SCORECARD.json'),
  );
  const rows = baseline.features.map((f) => ({
    id: f.id,
    capability: f.capability,
    local: f.local,
    hosted: f.hosted,
    release: f.release,
    baseline_ci: f.ci,
  }));
  if (
    s.schema !== 'propel-v1-integration-scorecard-v1' ||
    s.authority !== 'REGISTER_PROJECTION_NOT_BUSINESS_STATE' ||
    s.source_baseline !== parent ||
    s.genuine_A01_A12 !== 'NOT_RUN' ||
    s.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    s.new_head_ci !== 'PENDING_PREPUBLICATION' ||
    JSON.stringify(s.features) !== JSON.stringify(rows)
  )
    fail(
      'Original25 feature identities/statuses and separate acceptance required',
    );
  if (rows.length !== 25) fail('All original25 records required');
}
function coverageGap() {
  const g = JSON.parse(
    readFileSync('docs/program/V1_FOUNDATION_COVERAGE_RECONCILIATION.json'),
  );
  const files = git('ls-tree', '-r', '--name-only', parent)
    .split('\n')
    .filter((p) => p.startsWith('tests/') && p.endsWith('.test.ts'));
  const c = g.default_unit_collection,
    scopes = g.verified_current_head_scopes;
  const known = new Set([
    ...Object.keys(scopes.C17.file_cases),
    ...Object.keys(scopes.postgresql.file_cases),
  ]);
  const outside = files.filter((f) => !known.has(f));
  if (
    g.source_head !== parent ||
    g.authority !== 'SOURCE_COVERAGE_INVENTORY_NOT_BUSINESS_STATE' ||
    c.file_count !== 414 ||
    JSON.stringify(c.files) !== JSON.stringify(files) ||
    c.config_sha256 !== hash(ports.git(parent, 'vite.config.ts')) ||
    c.test_timeout_ms !== 30000 ||
    c.hook_timeout_ms !== 30000 ||
    c.max_workers !== 4 ||
    Object.keys(scopes.C17.file_cases).length !== 12 ||
    Object.values(scopes.C17.file_cases).reduce((a, b) => a + b, 0) !== 480 ||
    Object.keys(scopes.postgresql.file_cases).length !== 23 ||
    Object.values(scopes.postgresql.file_cases).reduce((a, b) => a + b, 0) !==
      661 ||
    known.size !== 35 ||
    outside.length !== 379 ||
    JSON.stringify(g.default_files_outside_these_two_scopes) !==
      JSON.stringify(outside) ||
    g.outside_does_not_mean_globally_untested !== true ||
    g.separate_scopes_are_not_one_default_collection !== true ||
    g.genuine_A01_A12 !== 'NOT_RUN'
  )
    fail('Exact default-file gaps and separate audited scopes required');
}
function identity() {
  const m = JSON.parse(
    readFileSync('docs/program/V1_HYGIENE_INTEGRATION_MANIFEST.json'),
  );
  if (
    JSON.stringify(m) !==
    JSON.stringify({
      schema: 'propel-v1-hygiene-integration-v1',
      parent,
      common,
      author,
      author_files: authorFiles,
      root_files: roots,
      authority: 'SOURCE_ONLY_NOT_OPERATIONAL_ACCEPTANCE',
    })
  )
    fail('Exact finite integration manifest required');
  const checkout = git('rev-parse', 'HEAD'),
    candidate = process.env.CANDIDATE_HEAD || checkout;
  if (!/^[a-f0-9]{40}$/.test(candidate)) fail('Exact candidate SHA required');
  git('merge-base', '--is-ancestor', parent, candidate);
  git('merge-base', '--is-ancestor', common, parent);
  if (git('rev-list', '--merges', `${parent}..${candidate}`))
    fail('Nonmerge source composition required');
  const tree = git('rev-parse', 'HEAD^{tree}');
  if (tree !== git('rev-parse', `${candidate}^{tree}`))
    fail('Carrier tree must equal candidate');
  if (
    checkout !== candidate &&
    git('rev-list', '--parents', '-n', '1', checkout)
      .split(' ')
      .slice(1)
      .sort()
      .join(' ') !== [parent, candidate].sort().join(' ')
  )
    fail('Exact309/candidate PR carrier required');
  if (
    process.env.GITHUB_ACTIONS === 'true' &&
    process.env.GITHUB_SHA !== checkout
  )
    fail('Actual provider checkout required');
  const expected = [...authorFiles, ...roots].sort();
  if (
    git('diff', '--name-only', parent, 'HEAD').split('\n').sort().join('\n') !==
    expected.join('\n')
  )
    fail('Exact sixteen-path composition required');
  for (const f of expected)
    if (ports.mode('HEAD', f) !== '100644')
      fail('Regular changed source required');
  for (const f of append) {
    const base = ports.git(parent, f);
    if (!readFileSync(f).subarray(0, base.length).equals(base))
      fail('Original register prefix changed');
  }
  admitHygiene();
  scorecard();
  coverageGap();
  return {
    candidate,
    checkout,
    tree,
    parent,
    files: trackedSnapshot(),
    business_authority: false,
    operational_acceptance: false,
    restoration: false,
  };
}
const directory = 'artifacts/cycle33/v1-hygiene-integration';
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
  const { started_epoch_ms, ...old } = b;
  if (
    !Number.isFinite(started_epoch_ms) ||
    JSON.stringify(old) !== JSON.stringify(identity())
  )
    fail('Exact complete integration source changed');
  return b;
}
function final() {
  writeFileSync(
    `${directory}/final.json`,
    JSON.stringify({ ...before(), unchanged: true }, null, 2) + '\n',
  );
}
export function validateTap(text) {
  const expected = 19;
  for (const [name, n] of [
    ['tests', expected],
    ['pass', expected],
    ['fail', 0],
    ['cancelled', 0],
    ['skipped', 0],
    ['todo', 0],
  ]) {
    const matches = [
      ...text.matchAll(new RegExp('^# ' + name + ' (\\d+)$', 'gm')),
    ];
    if (matches.length !== 1 || Number(matches[0][1]) !== n)
      fail('Complete unique19-case zero-error summary required');
  }
  const rows = [...text.matchAll(/^ok (\d+) - (.+)$/gm)];
  if (
    rows.length !== expected ||
    rows.some((m, i) => Number(m[1]) !== i + 1) ||
    new Set(rows.map((m) => m[2])).size !== expected ||
    [...text.matchAll(/^1\.\.19$/gm)].length !== 1 ||
    hash(JSON.stringify(rows.map((m) => m[2]).sort())) !==
      '7ce37c9d37e0a22563780dc2633bda23587e03d619945db6f42d6ddb9e686d38' ||
    /^not ok /m.test(text) ||
    /^ok[^\n]*# (?:SKIP|TODO)\b/im.test(text)
  )
    fail('All nineteen distinct non-skipped controls required');
  return { passed: 19, scope: 'SOURCE_ONLY_NOT_WHOLE_FOUNDATION' };
}
function controls() {
  const bytes = readFileSync(`${directory}/controls.tap`);
  const result = validateTap(bytes.toString());
  writeFileSync(
    `${directory}/verification.json`,
    JSON.stringify(
      { ...result, sha256: hash(bytes), source: before() },
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
  else if (c === 'controls') controls();
  else fail('Finite integration evidence command required');
  console.log(`Hygiene integration ${c} PASS; no operational authority`);
}
