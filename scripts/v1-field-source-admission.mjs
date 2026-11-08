// Finite build/test source lineage only. Never runtime, custody or restoration.
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
export const publisher = '7eee0b4527646c470d3604b6d21ac7578d073fee';
export const publisherParent = '124a5d15e3ea755eb8a5e15f404e27b5dad3db25';
export const logicalBaseline = 'b4014771050b28d1ec1dffd0fa42cb3617a5fae9';
export const predecessor = 'd8d85760f9188d83a631328d9211421470002e8a';
export const author = 'd977c78991aefed65f28fb643c30f92e5ecc6f7c';
export const nativePath = 'src/lib/workflows/daily-field-guide.ts';
const originalPackage = {
  module: 'daily-field-guide',
  component: 'DailyFieldGuide',
  owner: '/root/cycle16_field_growth',
  branch: 'codex/cycle16-daily-field-guide',
  parent_commit: 'b4014771050b28d1ec1dffd0fa42cb3617a5fae9',
  head_commit: '7eee0b4527646c470d3604b6d21ac7578d073fee',
  draft_pr: 112,
  focused_new_tests: 37,
  status: 'LOCAL_TESTED_DEFAULT_OFF_NOT_OPERATIONAL',
  owned_files: [
    {
      path: 'src/lib/workflows/daily-field-guide.ts',
      sha256:
        '6fcaea74f19b422424e0b562d91fb94e1d9654b0598b20c6551d3ba405c5410d',
    },
    {
      path: 'src/components/workflows/DailyFieldGuide.tsx',
      sha256:
        '5076dc00bb511b46b957143698a8c8552a969a95dda1233ae40d2c3cc4ec99e6',
    },
    {
      path: 'src/components/workflows/daily-field-guide.css',
      sha256:
        '483138cdd86f115acb99560af22702b253c9834a3254bfa034045db8855f8546',
    },
    {
      path: 'tests/cycle16-daily-field-guide.test.ts',
      sha256:
        '6e5fe39b14417ee237ddf849b230d8cdf3affcb477b91e03fcc4bb7f5dd796f4',
    },
    {
      path: 'docs/program/CYCLE16_DAILY_FIELD_GUIDE.md',
      sha256:
        'd60f9ab484df2e6cf091bbea063a403ff6a1ceb8b7f118125651b419de68c26f',
    },
  ],
};
export const oldFiles = Object.freeze(
  originalPackage.owned_files.map(Object.freeze),
);
export const authored = Object.freeze([
  nativePath,
  'tests/v1-daily-field-final-authority.test.ts',
  'docs/program/V1_DAILY_FIELD_FINAL_AUTHORITY.md',
  '.github/workflows/v1-daily-field-final-authority.yml',
]);
export const paths = Object.freeze([
  'scripts/v1-field-source-admission.mjs',
  'scripts/check-cycle16-integrity.mjs',
  'tests/v1-field-source-admission.test.mjs',
  '.github/workflows/v1-field-source-admission.yml',
  'docs/program/V1_FIELD_SOURCE_ADMISSION.md',
  'docs/program/V1_FIELD_SOURCE_ADMISSION_MANIFEST.json',
]);
export const fieldControlCount = 59;
export const fieldControlIdentitySha256 =
  '7d570f10dbf9efa08a10eec37b0dd6c9d95f2e14857fde131d324836a3ac5868';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const same = (a, b) => Buffer.from(a).equals(Buffer.from(b));
const fail = (message) => {
  throw Error(message);
};
const git = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
export function readSource(path) {
  if (
    typeof path !== 'string' ||
    (!/^(docs\/program|scripts|src\/(lib|components)\/workflows|tests)\/[a-zA-Z0-9_./-]+$/.test(
      path,
    ) &&
      path !== authored[3]) ||
    path
      .split('/')
      .some(
        (p) =>
          !p ||
          p === '.' ||
          p === '..' ||
          (p.startsWith('.') && p !== '.github'),
      )
  )
    fail('Finite public Field source path required');
  let full = process.cwd();
  for (const segment of path.split('/')) {
    full = resolve(full, segment);
    if (lstatSync(full).isSymbolicLink())
      fail('Field source symlinks forbidden');
  }
  const stat = lstatSync(full);
  if (!stat.isFile() || (stat.mode & 0o111) !== 0)
    fail('Regular nonexecutable Field source required');
  return readFileSync(full);
}
export const ports = Object.freeze({
  read: readSource,
  git: (commit, path) =>
    execFileSync('git', ['--no-replace-objects', 'show', commit + ':' + path], {
      maxBuffer: 16 * 1024 * 1024,
    }),
  type: (commit) => git('cat-file', '-t', commit),
  parent: (commit) => git('show', '--no-patch', '--format=%P', commit),
  delta: (commit) =>
    git(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      commit,
    )
      .split('\n')
      .sort()
      .join('\n'),
  mode: (commit, path) => git('ls-tree', commit, '--', path).split(/\s+/)[0],
});
function exactKeys(value, expected) {
  return (
    value &&
    typeof value === 'object' &&
    Reflect.ownKeys(value).every((k) => typeof k === 'string') &&
    JSON.stringify(Reflect.ownKeys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}
export function validateFieldPackage(pkg, supplied = {}) {
  if (
    !exactKeys(pkg, Object.keys(originalPackage)) ||
    Object.keys(originalPackage).some(
      (key) => key !== 'owned_files' && pkg[key] !== originalPackage[key],
    ) ||
    !Array.isArray(pkg.owned_files) ||
    pkg.owned_files.length !== 5 ||
    pkg.owned_files.some(
      (f, i) =>
        !exactKeys(f, ['path', 'sha256']) ||
        f.path !== oldFiles[i].path ||
        f.sha256 !== oldFiles[i].sha256,
    )
  )
    fail('Exact original C16 Field package and five literal pins required');
  const p = { ...ports, ...supplied };
  if (
    [publisher, publisherParent, logicalBaseline].some(
      (c) => p.type(c) !== 'commit',
    ) ||
    p.parent(publisher) !== publisherParent ||
    p.delta(publisher) !==
      [
        'M\tsrc/components/workflows/DailyFieldGuide.tsx',
        'M\t' + nativePath,
        'M\ttests/cycle16-daily-field-guide.test.ts',
      ]
        .sort()
        .join('\n')
  )
    fail(
      'Exact historical Field publisher direct-parent and M3 history required',
    );
  for (const f of oldFiles)
    if (
      p.mode(publisher, f.path) !== '100644' ||
      hash(p.git(publisher, f.path)) !== f.sha256
    )
      fail('All five original regular Field published blobs required');
}
function originalCompanions(p, message) {
  for (const f of oldFiles.slice(1))
    if (
      p.mode(predecessor, f.path) !== '100644' ||
      hash(p.git(predecessor, f.path)) !== f.sha256 ||
      hash(p.read(f.path)) !== f.sha256
    )
      fail(message);
}
export function admitFieldSuccessor(
  path,
  current,
  previous,
  pkg,
  supplied = {},
) {
  const captured = Buffer.from(current),
    prior = Buffer.from(previous);
  const p = { ...ports, ...supplied };
  validateFieldPackage(pkg, p);
  if (path !== nativePath)
    fail('Only the exact daily Field native endpoint may evolve');
  if (
    p.type(predecessor) !== 'commit' ||
    p.mode(predecessor, nativePath) !== '100644' ||
    hash(prior) !== oldFiles[0].sha256 ||
    !same(prior, p.git(publisher, nativePath)) ||
    !same(prior, p.git(predecessor, nativePath))
  )
    fail('Exact original C16 and311 Field predecessor required');
  if (
    p.type(author) !== 'commit' ||
    p.parent(author) !== predecessor ||
    p.delta(author) !==
      authored
        .map((f) => (f === nativePath ? 'M' : 'A') + '\t' + f)
        .sort()
        .join('\n')
  )
    fail('Only exact sole311 M1/A3 Field author admitted');
  for (const f of authored)
    if (p.mode(author, f) !== '100644' || !same(p.read(f), p.git(author, f)))
      fail('Complete regular current Field authored bundle required');
  if (!same(captured, p.git(author, path)) || same(captured, prior))
    fail('Unknown or unchanged Field native successor denied');
  originalCompanions(p, 'Original four Field companions must remain exact');
  for (const f of authored)
    if (!same(p.read(f), p.git(author, f)))
      fail('Fresh Field authored bundle required');
  originalCompanions(p, 'Fresh original Field companions required');
  const finalEndpoint = Buffer.from(p.read(nativePath));
  if (
    !same(current, captured) ||
    !same(previous, prior) ||
    !same(finalEndpoint, captured)
  )
    fail('Final fresh Field endpoint and supplied buffers required');
  return {
    path,
    source_commit: author,
    original_publisher: publisher,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  };
}
export function validateFieldPublishedSource(
  file,
  current,
  pkg,
  supplied = {},
) {
  const captured = Buffer.from(current);
  if (
    !exactKeys(file, ['path', 'sha256']) ||
    file.path !== nativePath ||
    file.sha256 !== oldFiles[0].sha256
  )
    fail('Literal original Field endpoint metadata required');
  validateFieldPackage(pkg, supplied);
  const p = { ...ports, ...supplied };
  originalCompanions(
    p,
    'Current original Field companions required before equality',
  );
  if (hash(captured) === oldFiles[0].sha256) {
    if (!same(captured, p.git(publisher, nativePath)))
      fail('Original Field bytes required');
    originalCompanions(
      p,
      'Fresh original Field companions required before equality',
    );
    const finalEndpoint = Buffer.from(p.read(nativePath));
    if (!same(finalEndpoint, captured) || !same(current, captured))
      fail('Final fresh original Field endpoint required');
    return;
  }
  if (!same(current, captured))
    fail('Published Field input changed before successor admission');
  const result = admitFieldSuccessor(
    nativePath,
    captured,
    p.git(predecessor, nativePath),
    pkg,
    p,
  );
  if (!same(current, captured))
    fail('Published Field input changed during successor admission');
  return result;
}
export function trackedSnapshot(root = process.cwd()) {
  const at = (...a) =>
    execFileSync('git', ['--no-replace-objects', '-C', root, ...a], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }).trim();
  if (realpathSync(root) !== realpathSync(at('rev-parse', '--show-toplevel')))
    fail('Exact source Git root required');
  if (at('status', '--porcelain', '--untracked-files=normal'))
    fail('Clean source including unignored additions required');
  const files = {};
  for (const row of at('ls-tree', '-r', '--full-tree', 'HEAD').split('\n')) {
    const [entry, path] = row.split('\t'),
      [mode, kind, object] = entry.split(' ');
    if (kind !== 'blob' || !['100644', '100755'].includes(mode))
      fail('Regular tracked blob required');
    let full = root;
    for (const segment of path.split('/')) {
      full = resolve(full, segment);
      if (lstatSync(full).isSymbolicLink())
        fail('Tracked source symlink forbidden');
    }
    const stat = lstatSync(full);
    if (!stat.isFile() || Boolean(stat.mode & 0o111) !== (mode === '100755'))
      fail('Regular tracked source mode required');
    const bytes = readFileSync(full);
    if (
      createHash('sha1')
        .update('blob ' + bytes.length + '\0')
        .update(bytes)
        .digest('hex') !== object
    )
      fail('Every tracked byte must equal HEAD regardless of index flags');
    files[path] = hash(bytes);
  }
  return files;
}
export function validateCandidateProfile(facts) {
  const {
    candidate,
    checkout,
    tree,
    candidate_tree,
    candidate_parents,
    checkout_parents,
    delta,
  } = facts;
  if (
    !/^[a-f0-9]{40}$/.test(candidate ?? '') ||
    !/^[a-f0-9]{40}$/.test(checkout ?? '') ||
    !/^[a-f0-9]{40}$/.test(tree ?? '') ||
    tree !== candidate_tree
  )
    fail('Exact actual candidate/carrier source identities required');
  if (candidate_parents !== author)
    fail('Exact sole312 candidate parent required');
  if (
    checkout !== candidate &&
    checkout_parents.split(' ').sort().join(' ') !==
      [author, candidate].sort().join(' ')
  )
    fail('Exact original312/candidate same-tree carrier required');
  const expected = paths
    .map(
      (f) =>
        (f === 'scripts/check-cycle16-integrity.mjs' ? 'M' : 'A') + '\t' + f,
    )
    .sort()
    .join('\n');
  if (delta !== expected)
    fail('Exact six admission-only source paths required');
}
const directory = 'artifacts/cycle33/v1-field-source-admission';
function identity() {
  const manifest = JSON.parse(
    readFileSync('docs/program/V1_FIELD_SOURCE_ADMISSION_MANIFEST.json'),
  );
  if (
    JSON.stringify(manifest) !==
    JSON.stringify({
      schema: 'propel-v1-field-source-admission-v1',
      parent: author,
      runtime_author: author,
      predecessor,
      publisher,
      publisher_parent: publisherParent,
      logical_baseline: logicalBaseline,
      files: paths,
      authority: 'SOURCE_ONLY_NOT_OPERATIONAL_ACCEPTANCE',
    })
  )
    fail('Exact finite Field source-admission manifest required');
  const checkout = git('rev-parse', 'HEAD'),
    candidate = process.env.CANDIDATE_HEAD || checkout,
    tree = git('rev-parse', 'HEAD^{tree}');
  if (!/^[a-f0-9]{40}$/.test(candidate)) fail('Exact candidate SHA required');
  if (git('cat-file', '-t', candidate) !== 'commit')
    fail('Actual candidate Git commit required');
  validateCandidateProfile({
    candidate,
    checkout,
    tree,
    candidate_tree: git('rev-parse', candidate + '^{tree}'),
    candidate_parents: git('show', '--no-patch', '--format=%P', candidate),
    checkout_parents: git('show', '--no-patch', '--format=%P', checkout),
    delta: git('diff', '--name-status', '--no-renames', author, candidate)
      .split('\n')
      .sort()
      .join('\n'),
  });
  if (
    process.env.GITHUB_ACTIONS === 'true' &&
    process.env.GITHUB_SHA !== checkout
  )
    fail('Actual provider checkout required');
  for (const f of paths)
    if (ports.mode('HEAD', f) !== '100644')
      fail('Regular changed source required');
  const pkg = JSON.parse(readSource('docs/program/CYCLE16_DELIVERY_INDEX.json'))
    .packages[0];
  const admission = admitFieldSuccessor(
    nativePath,
    readSource(nativePath),
    ports.git(predecessor, nativePath),
    pkg,
  );
  const files = trackedSnapshot();
  if (Object.keys(files).length !== 2197)
    fail('Exact2197 tracked source files required');
  return {
    candidate,
    checkout,
    tree,
    parent: author,
    admission,
    files,
    business_authority: false,
    operational_acceptance: false,
    restore_adapter: false,
  };
}
function before() {
  const b = JSON.parse(readFileSync(directory + '/before.json')),
    { started_epoch_ms, ...old } = b;
  if (
    !Number.isFinite(started_epoch_ms) ||
    JSON.stringify(old) !== JSON.stringify(identity())
  )
    fail('Complete Field source identity changed');
  return b;
}
export function validateTap(text) {
  if (typeof text !== 'string') fail('Actual TAP text required');
  for (const [name, count] of [
    ['tests', fieldControlCount],
    ['pass', fieldControlCount],
    ['fail', 0],
    ['cancelled', 0],
    ['skipped', 0],
    ['todo', 0],
  ]) {
    const matches = [
      ...text.matchAll(new RegExp('^# ' + name + ' (\\d+)$', 'gm')),
    ];
    if (matches.length !== 1 || Number(matches[0][1]) !== count)
      fail('Exact Field control zero-error summary required');
  }
  const rows = [...text.matchAll(/^ok (\d+) - (.+)$/gm)],
    plans = [...text.matchAll(/^1\.\.(\d+)$/gm)];
  if (
    rows.length !== fieldControlCount ||
    rows.some((m, i) => Number(m[1]) !== i + 1) ||
    new Set(rows.map((m) => m[2])).size !== fieldControlCount ||
    plans.length !== 1 ||
    Number(plans[0][1]) !== fieldControlCount ||
    [...text.matchAll(/^TAP version 13$/gm)].length !== 1 ||
    hash(JSON.stringify(rows.map((m) => m[2]).sort())) !==
      fieldControlIdentitySha256 ||
    /^not ok /m.test(text) ||
    /^ok[^\n]*# (?:SKIP|TODO)\b/im.test(text)
  )
    fail('Exact literal passing Field control identities required');
  return {
    passed: fieldControlCount,
    scope: 'SOURCE_ONLY_NOT_WHOLE_FOUNDATION',
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const command = process.argv[2];
  if (command === 'bind') {
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      directory + '/before.json',
      JSON.stringify({ ...identity(), started_epoch_ms: Date.now() }, null, 2) +
        '\n',
    );
  } else if (command === 'controls') {
    const bytes = readFileSync(directory + '/controls.tap'),
      result = validateTap(bytes.toString());
    writeFileSync(
      directory + '/verification.json',
      JSON.stringify(
        { ...result, sha256: hash(bytes), source: before() },
        null,
        2,
      ) + '\n',
    );
  } else if (command === 'final')
    writeFileSync(
      directory + '/final.json',
      JSON.stringify({ ...before(), unchanged: true }, null, 2) + '\n',
    );
  else fail('Finite Field source-admission command required');
  console.log('Field source ' + command + ' PASS; no operational authority');
}
