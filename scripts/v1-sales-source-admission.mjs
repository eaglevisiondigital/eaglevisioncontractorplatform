// Public source lineage only. Never application authority or business restoration.
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
import { cycle25SourcePorts } from './cycle25-source-lineage.mjs';
export const publisher = '5d441e50e63eeefe7407256041a8ff792ddbcf5f';
export const publisherParent = '5f711cb088d9e0a17966135a15b3f53849f4c3f4';
export const logicalBaseline = 'a20f11855388e7cf8283294a3775e1c86a2cc66e';
export const predecessor = 'a415bb4b35ff9e5727ce4f1a05a8f7f00def8bbc';
export const author = '76fc6f212d2391b000fc22280ad7dcb4d6582772';
export const nativePath = 'src/lib/workflows/sales-desk.ts';
export const oldFiles = Object.freeze([
  {
    path: nativePath,
    sha256: '2fc10612d72c4cf5060096bcce5b8191f52e4a575d760e15fbf0a8749ee2157c',
  },
  {
    path: 'src/components/workflows/SalesDesk.tsx',
    sha256: 'ebf3f63d80595d61043fa15675952465291374fb191b86bf31142d4530327bf3',
  },
  {
    path: 'src/components/workflows/sales-desk.css',
    sha256: '7b1558abd49556a46f667aee14d7bbe4b205676d86a3e27dbb67a74161b8c755',
  },
  {
    path: 'tests/cycle8-sales-desk.test.ts',
    sha256: '721f08b2d41976209d7e6b31535c10863ea35f339c0f52d6f7caef7f874216d2',
  },
  {
    path: 'docs/program/CYCLE8_SALES_DESK.md',
    sha256: '3697af0dedb8eaf17a9e2755938247beb9e57ce4f09515140b5af6616c1bb3c9',
  },
]);
export const authored = Object.freeze([
  nativePath,
  'tests/v1-sales-final-authority.test.ts',
  'docs/program/V1_SALES_FINAL_AUTHORITY.md',
  '.github/workflows/v1-sales-final-authority.yml',
]);
export const paths = Object.freeze([
  'scripts/v1-sales-source-admission.mjs',
  'scripts/check-cycle8-integrity.mjs',
  'tests/v1-sales-source-admission.test.mjs',
  '.github/workflows/v1-sales-source-admission.yml',
  '.github/workflows/cycle8-integration.yml',
  '.github/workflows/cycle9-integration.yml',
  'docs/program/V1_SALES_SOURCE_ADMISSION.md',
  'docs/program/V1_SALES_SOURCE_ADMISSION_MANIFEST.json',
]);
export const ports = cycle25SourcePorts;
export const salesControlCount = 43;
export const salesControlIdentitySha256 =
  '0a5f147f1cf79087c34523a53fa34d28c31452bb7059f0228302574fb84066e7';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const same = (a, b) => Buffer.from(a).equals(Buffer.from(b));
const fail = (m) => {
  throw Error(m);
};
const git = (...a) =>
  execFileSync('git', ['--no-replace-objects', ...a], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
export function validateSalesPackage(pkg, supplied = {}) {
  const p = { ...ports, ...supplied };
  if (
    pkg?.module !== 'sales-desk' ||
    pkg.component !== 'SalesDesk' ||
    pkg.doc !== 'CYCLE8_SALES_DESK' ||
    pkg.head_commit !== publisher ||
    pkg.parent_commit !== logicalBaseline ||
    pkg.draft_pr !== 50 ||
    pkg.branch !== 'codex/cycle8-sales-desk' ||
    pkg.package !== 'Sales booking-to-scope review' ||
    pkg.owner !== '/root/cycle8_sales_customer' ||
    pkg.focused_new_tests !== 34 ||
    pkg.status !== 'LOCAL_TESTED_DEFAULT_OFF_NOT_OPERATIONAL' ||
    Reflect.ownKeys(pkg).some((key) => typeof key !== 'string') ||
    JSON.stringify(Reflect.ownKeys(pkg).sort()) !==
      JSON.stringify(
        [
          'module',
          'component',
          'doc',
          'package',
          'owner',
          'branch',
          'head_commit',
          'draft_pr',
          'focused_new_tests',
          'parent_commit',
          'status',
          'owned_files',
        ].sort(),
      ) ||
    JSON.stringify(pkg.owned_files) !== JSON.stringify(oldFiles)
  )
    fail('Exact original C8 Sales publisher and five literal pins required');
  if (
    p.type(publisher) !== 'commit' ||
    p.parent(publisher) !== publisherParent ||
    p.delta(publisher) !==
      [
        'M\tdocs/program/CYCLE8_SALES_DESK.md',
        'M\tsrc/lib/workflows/sales-desk.ts',
        'M\ttests/cycle8-sales-desk.test.ts',
      ]
        .sort()
        .join('\n')
  )
    fail('Exact historical publisher direct-parent and M3 history required');
  for (const f of oldFiles)
    if (
      p.mode(publisher, f.path) !== '100644' ||
      hash(p.git(publisher, f.path)) !== f.sha256
    )
      fail('All five original regular published blobs required');
}
export function admitSalesSuccessor(
  path,
  current,
  previous,
  pkg,
  supplied = {},
) {
  const p = { ...ports, ...supplied };
  validateSalesPackage(pkg, p);
  if (path !== nativePath)
    fail('Only the exact Sales native endpoint may evolve');
  if (
    p.type(predecessor) !== 'commit' ||
    p.mode(predecessor, nativePath) !== '100644' ||
    hash(previous) !== oldFiles[0].sha256 ||
    !same(previous, p.git(publisher, nativePath)) ||
    !same(previous, p.git(predecessor, nativePath))
  )
    fail('Exact original C8 and a415 Sales predecessor required');
  if (
    p.type(author) !== 'commit' ||
    p.parent(author) !== predecessor ||
    p.delta(author) !==
      authored
        .map((f) => (f === nativePath ? 'M' : 'A') + '\t' + f)
        .sort()
        .join('\n')
  )
    fail('Only exact sole-a415 M1/A3 Sales author admitted');
  for (const f of authored)
    if (p.mode(author, f) !== '100644' || !same(p.read(f), p.git(author, f)))
      fail('Complete regular current Sales authored bundle required');
  if (!same(current, p.git(author, nativePath)) || same(current, previous))
    fail('Unknown or unchanged Sales native successor denied');
  for (const f of oldFiles.slice(1))
    if (!same(p.read(f.path), p.git(publisher, f.path)))
      fail('Original four Sales companions must remain exact');
  for (const f of authored)
    if (!same(p.read(f), p.git(author, f)))
      fail('Fresh authored Sales bundle required');
  for (const f of oldFiles.slice(1))
    if (!same(p.read(f.path), p.git(publisher, f.path)))
      fail('Fresh original Sales companions required');
  if (!same(p.read(nativePath), current))
    fail('Final fresh Sales endpoint required');
  return {
    path,
    source_commit: author,
    original_publisher: publisher,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  };
}
// Exact original C8 consumer entrypoint; original metadata precedes equality.
export function validateSalesPublishedSource(
  file,
  current,
  pkg,
  supplied = {},
) {
  validateSalesPackage(pkg, supplied);
  if (file?.path !== nativePath || file.sha256 !== oldFiles[0].sha256)
    fail('Literal original Sales endpoint metadata required');
  const p = { ...ports, ...supplied };
  for (const f of oldFiles.slice(1))
    if (!same(p.read(f.path), p.git(publisher, f.path)))
      fail('Current original Sales companions required before equality');
  if (hash(current) === oldFiles[0].sha256) {
    if (
      !same(current, p.git(publisher, nativePath)) ||
      !same(current, p.read(nativePath))
    )
      fail('Original Sales bytes required');
    return;
  }
  return admitSalesSuccessor(
    nativePath,
    current,
    p.git(predecessor, nativePath),
    pkg,
    p,
  );
}
export function validateHistoryWorkflow(path, bytes) {
  if (
    ![
      '.github/workflows/cycle8-integration.yml',
      '.github/workflows/cycle9-integration.yml',
    ].includes(path)
  )
    fail('Only two required history checkout adjustments allowed');
  const old = ports.git(author, path).toString(),
    needle = '      - uses: actions/checkout@v4\n';
  if (old.split(needle).length !== 2 || old.includes('fetch-depth:'))
    fail('Original shallow workflow required');
  if (
    bytes.toString() !==
    old.replace(needle, needle + '        with:\n          fetch-depth: 0\n')
  )
    fail('Only exact full-history checkout lines may change');
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
    for (const part of path.split('/')) {
      full = resolve(full, part);
      if (lstatSync(full).isSymbolicLink()) fail('Tracked symlink forbidden');
    }
    if (!lstatSync(full).isFile()) fail('Regular tracked source required');
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
const directory = 'artifacts/cycle33/v1-sales-source-admission';
function identity() {
  const manifest = JSON.parse(
    readFileSync('docs/program/V1_SALES_SOURCE_ADMISSION_MANIFEST.json'),
  );
  if (
    JSON.stringify(manifest) !==
    JSON.stringify({
      schema: 'propel-v1-sales-source-admission-v1',
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
    fail('Exact finite Sales source-admission manifest required');
  const checkout = git('rev-parse', 'HEAD'),
    candidate = process.env.CANDIDATE_HEAD || checkout;
  if (!/^[a-f0-9]{40}$/.test(candidate)) fail('Exact candidate SHA required');
  if (
    git('rev-list', '--parents', '-n', '1', candidate) !==
    candidate + ' ' + author
  )
    fail('Exact sole76fc candidate parent required');
  git('merge-base', '--is-ancestor', author, candidate);
  if (git('rev-list', '--merges', author + '..' + candidate))
    fail('Nonmerge Sales source composition required');
  const tree = git('rev-parse', 'HEAD^{tree}');
  if (tree !== git('rev-parse', candidate + '^{tree}'))
    fail('Exact candidate/carrier tree required');
  if (
    candidate !== checkout &&
    git('rev-list', '--parents', '-n', '1', checkout)
      .split(' ')
      .slice(1)
      .sort()
      .join(' ') !== [author, candidate].sort().join(' ')
  )
    fail('Exact original76fc/candidate carrier required');
  if (
    process.env.GITHUB_ACTIONS === 'true' &&
    process.env.GITHUB_SHA !== checkout
  )
    fail('Actual provider checkout required');
  if (
    git('diff', '--name-only', author, 'HEAD').split('\n').sort().join('\n') !==
    [...paths].sort().join('\n')
  )
    fail('Exact eight admission-only source paths required');
  for (const f of paths)
    if (ports.mode('HEAD', f) !== '100644')
      fail('Regular changed source required');
  for (const f of authored)
    if (!same(readFileSync(f), ports.git(author, f)))
      fail(
        'Runtime correction and original authored evidence must stay unchanged',
      );
  for (const f of paths.filter((f) =>
    /^\.github\/workflows\/cycle[89]-/.test(f),
  ))
    validateHistoryWorkflow(f, readFileSync(f));
  const pkg = JSON.parse(
    readFileSync('docs/program/CYCLE8_DELIVERY_INDEX.json'),
  ).packages[2];
  admitSalesSuccessor(
    nativePath,
    readFileSync(nativePath),
    ports.git(predecessor, nativePath),
    pkg,
  );
  return {
    candidate,
    checkout,
    tree,
    parent: author,
    files: trackedSnapshot(),
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
    fail('Complete Sales source identity changed');
  return b;
}
export function validateTap(text) {
  const expected = salesControlCount;
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
      fail('Exact forty-three-control zero-error summary required');
  }
  const rows = [...text.matchAll(/^ok (\d+) - (.+)$/gm)];
  if (
    rows.length !== expected ||
    rows.some((m, i) => Number(m[1]) !== i + 1) ||
    new Set(rows.map((m) => m[2])).size !== expected ||
    [...text.matchAll(/^1\.\.43$/gm)].length !== 1 ||
    hash(JSON.stringify(rows.map((m) => m[2]).sort())) !==
      salesControlIdentitySha256 ||
    /^not ok /m.test(text) ||
    /^ok[^\n]*# (?:SKIP|TODO)\b/im.test(text)
  )
    fail('Exact forty-three literal passing control identities required');
  return { passed: expected, scope: 'SOURCE_ONLY_NOT_WHOLE_FOUNDATION' };
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
  else fail('Finite source-admission command required');
  console.log('Sales source ' + command + ' PASS; no operational authority');
}
