// Fixed current-context disposable qualification; no operational or source admission.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  realpathSync,
  lstatSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, devNull } from 'node:os';
import { pathToFileURL } from 'node:url';
const expected = {
  classification: 'UNAPPLIED_CURRENT_CONTEXT_QUALIFICATION',
  context: '27300dbaff877d18ecb219a2c9000c96e7c3e8c8',
  optimizationAuthor: 'c50ce4521fbc264276734a9f8909b525c9a7c2f8',
  optimizationParent: 'af36a27e34b77bfef3700d7cd87fdb39c4dc50d5',
  optimizationPath: 'src/lib/workflows/operating-center-runtime.ts',
  originalSha256:
    '7a5272ae344400714dea1efe727a40c19a10c96ccfdf70f7321e127488bbd239',
  authoredSha256:
    'a789309d7f8710f2e3150f4cbc8f8acc5aee9c99633c7611e503db089bcd2544',
  proposal391: '608ce8b7071a555440bf1f7dccfddec9473c661a',
  separateApprovalPatches: {
    helper: '97852ab007d3d7600db597e53d420658a75f4e51c932cd25ce3a509d62396982',
    cycle9: '274c02512df50c1a751fec124db3e8e8c22474c2286a0e70e734c76f91a8c5be',
    cycle24: '60f719216eb985839602bbb97e1a3d5420b80579771583677622e7c5715ab447',
  },
  canonicalChanges: false,
  admissionAuthorized: false,
  integrationAuthorized: false,
  release: 'NOT_READY_NOT_AUTHORIZED',
};
const files = [
  [
    'scripts/check-cycle9-integrity.mjs',
    '1faf35bbe36cfa5ca543e568970dafd7d90b2a72c578126d572baa73829606c2',
    '484a6cf6b7282324f86e90e90d4ce947ba4eb722afa6ef33a6a2e8a03e5fff68',
  ],
  [
    'scripts/check-cycle24.mjs',
    '4ed8baec4e1b7abc3f3ff86cc88c590b3497c3bfb7ff2ac12fcc1c7e2f71562f',
    '4f95b11e4e1d45186c5607f1b0773cc379e1901d99f7944ce907bfdef5a9a68d',
  ],
  [
    'scripts/operating-source-signature-admission.mjs',
    null,
    '38fd3d784b10dd634f6b03a5995a4ce4392eb2924865349d1414328701113978',
  ],
];
const envBase = {
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_GLOBAL: devNull,
};
const hash = (b) => createHash('sha256').update(b).digest('hex');
const git = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    env: envBase,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
export function verifyInputs({
  evidence = JSON.parse(
    readFileSync('proposals/performance424-context/evidence.json', 'utf8'),
  ),
  original = git,
} = {}) {
  assert.deepEqual(evidence, expected, 'Exact current context required');
  const authored = original(
    'show',
    expected.optimizationAuthor + ':' + expected.optimizationPath,
  );
  assert.equal(hash(authored), expected.authoredSha256);
  assert.equal(
    hash(
      original(
        'show',
        expected.optimizationParent + ':' + expected.optimizationPath,
      ),
    ),
    expected.originalSha256,
  );
  assert.equal(
    hash(original('show', expected.context + ':' + expected.optimizationPath)),
    expected.originalSha256,
  );
  assert.equal(
    original('show', '--no-patch', '--format=%P', expected.optimizationAuthor)
      .toString()
      .trim(),
    expected.optimizationParent,
  );
  assert.equal(
    original(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      expected.optimizationAuthor,
    )
      .toString()
      .trim(),
    'M\t' + expected.optimizationPath,
  );
  for (const c of [expected.optimizationParent, expected.optimizationAuthor]) {
    const tree = original('ls-tree', c, '--', expected.optimizationPath)
      .toString()
      .trim();
    assert.match(tree, /^100644 blob [a-f0-9]{40}\t/);
    assert.equal(tree.split('\t')[1], expected.optimizationPath);
  }
  const patches = {};
  for (const [name, digest] of Object.entries(
    expected.separateApprovalPatches,
  )) {
    const bytes = original(
      'show',
      expected.proposal391 +
        ':proposals/operating-signature-admission/' +
        name +
        '.patch',
    );
    assert.equal(hash(bytes), digest, 'Exact reviewed separate patch required');
    patches[name] = bytes;
  }
  const helper = original(
    'show',
    expected.proposal391 +
      ':proposals/operating-signature-admission/helper.mjs',
  );
  assert.equal(hash(helper), files[2][2]);
  return { authored, patches, helper };
}
function currentFile(p, { read = readFileSync, stat = lstatSync } = {}) {
  let prefix = '';
  for (const part of p.split('/')) {
    prefix = prefix ? prefix + '/' + part : part;
    assert(!stat(prefix).isSymbolicLink(), 'Regular current context required');
  }
  const info = stat(p);
  assert(
    info.isFile() && (info.mode & 0o777) === 0o644,
    'Regular current context required',
  );
  return Buffer.from(read(p));
}
export function classifyFrame(ports) {
  const snapshots = new Map();
  const rows = [
    ...files,
    [
      expected.optimizationPath,
      expected.originalSha256,
      expected.authoredSha256,
    ],
  ];
  for (const [path] of rows) {
    try {
      snapshots.set(path, currentFile(path, ports));
    } catch (error) {
      if (error.code === 'ENOENT') snapshots.set(path, null);
      else throw error;
    }
  }
  const before = rows.every(([p, b]) =>
    b === null
      ? snapshots.get(p) === null
      : snapshots.get(p) !== null && hash(snapshots.get(p)) === b,
  );
  const after = rows.every(
    ([p, , a]) => snapshots.get(p) !== null && hash(snapshots.get(p)) === a,
  );
  assert(before !== after, 'Exact complete BEFORE or AFTER frame required');
  return { kind: before ? 'BEFORE' : 'AFTER', snapshots };
}
export function parseMode(value = 'critical') {
  assert(
    typeof value === 'string' && ['critical', 'full'].includes(value),
    'Exact critical or full mode required',
  );
  return value;
}
export async function qualify({
  fullCycle24 = false,
  inputs,
  framePorts,
} = {}) {
  assert(
    fullCycle24 === true || fullCycle24 === false,
    'Exact qualification mode required',
  );
  const reviewed = verifyInputs(inputs),
    observed = classifyFrame(framePorts);
  for (const [path, before] of files) {
    const tree = git('ls-tree', expected.context, '--', path).toString().trim();
    if (before === null) assert.equal(tree, '');
    else {
      assert.match(tree, /^100644 blob [a-f0-9]{40}\t/);
      assert.equal(tree.split('\t')[1], path);
      assert.equal(hash(git('show', expected.context + ':' + path)), before);
    }
  }
  const root = mkdtempSync(
    join(tmpdir(), 'propel-performance424-' + process.pid + '-'),
  );
  try {
    const env = {
      ...envBase,
      GIT_DIR: git('rev-parse', '--absolute-git-dir').toString().trim(),
      GIT_WORK_TREE: root,
      GIT_CEILING_DIRECTORIES: root,
    };
    const execute = (args, wallLimit = 45000) =>
      execFileSync(process.execPath, args, {
        cwd: root,
        env,
        stdio: 'pipe',
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        timeout: wallLimit,
        killSignal: 'SIGKILL',
      });
    const archive = join(root, 'source.tar');
    git('archive', '--format=tar', '--output', archive, expected.context);
    execFileSync('tar', ['-xf', archive, '-C', root], { env: envBase });
    symlinkSync(
      realpathSync('node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    writeFileSync(join(root, expected.optimizationPath), reviewed.authored);
    for (const name of ['helper', 'cycle9', 'cycle24'])
      execFileSync('git', ['apply', '-'], {
        cwd: root,
        env: envBase,
        input: reviewed.patches[name],
        stdio: 'pipe',
      });
    for (const [path, , after] of files) {
      const p = join(root, path);
      assert(lstatSync(p).isFile() && !lstatSync(p).isSymbolicLink());
      assert.equal(lstatSync(p).mode & 0o777, 0o644);
      assert.equal(hash(readFileSync(p)), after);
    }
    assert.equal(
      hash(readFileSync(join(root, expected.optimizationPath))),
      expected.authoredSha256,
    );
    assert.match(
      execute(['scripts/check-cycle9-integrity.mjs']),
      /Cycle9: 7 exact draft packages/,
    );
    // Import the validated private #391 checker clone after the complete candidate proof.
    const c24 = await import(
      pathToFileURL(join(root, 'scripts/check-cycle24.mjs')).href
    );
    const ports = {
      read: (p) => readFileSync(join(root, p)),
      git: (c, p) => git('show', c + ':' + p),
    };
    assert.equal(c24.validateCycle24CriticalSources(ports).critical_sources, 5);
    for (const path of [
      expected.optimizationPath,
      'src/lib/workflows/journey-runtime.ts',
    ])
      assert.throws(() =>
        c24.validateCycle24CriticalSources({
          ...ports,
          read: (p) =>
            p === path
              ? Buffer.concat([ports.read(p), Buffer.from('\nUNKNOWN')])
              : ports.read(p),
        }),
      );
    const runtime = join(root, expected.optimizationPath);
    writeFileSync(
      runtime,
      Buffer.concat([reviewed.authored, Buffer.from('\nUNKNOWN')]),
    );
    assert.throws(() => execute(['scripts/check-cycle9-integrity.mjs']));
    writeFileSync(runtime, reviewed.authored);
    const installed = join(root, files[2][0]);
    const mutants = [
      Buffer.concat([reviewed.helper, Buffer.from('\nUNKNOWN')]),
      Buffer.from(
        reviewed.helper
          .toString()
          .replace(expected.originalSha256, '0'.repeat(64)),
      ),
      Buffer.from('export const admitOperatingSignatureSource=()=>true;'),
      Buffer.from("throw Error('UNREVIEWED_HELPER_EXECUTED');"),
    ];
    for (const mutant of mutants) {
      writeFileSync(installed, mutant);
      for (const args of [
        ['scripts/check-cycle9-integrity.mjs'],
        [
          '--input-type=module',
          '-e',
          "await import('./scripts/check-cycle24.mjs')",
        ],
      ])
        assert.throws(
          () => execute(args),
          (e) =>
            String(e.stderr).includes(
              'Reviewed operating-signature helper required',
            ) && !String(e.stderr).includes('UNREVIEWED_HELPER_EXECUTED'),
        );
    }
    writeFileSync(installed, reviewed.helper);
    let full;
    if (fullCycle24) {
      const lines = execute(['scripts/check-cycle24.mjs'], 120000)
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));
      assert.equal(lines.length, 2);
      assert.equal(lines[0].packages, 6);
      assert.equal(lines[0].protected_files, 128);
      assert.equal(lines[0].operational_ready, false);
      assert.equal(lines[0].restore_adapter, false);
      assert.equal(lines[1].critical_sources, 5);
      assert.equal(lines[1].adapter_authorized, false);
      full = lines;
    }
    for (const [path, , after] of files)
      assert.equal(hash(readFileSync(join(root, path))), after);
    assert.equal(
      hash(readFileSync(join(root, expected.optimizationPath))),
      expected.authoredSha256,
    );
    return {
      observedFrame: observed.kind,
      context: expected.context,
      sourceAuthor: expected.optimizationAuthor,
      cycle9: 'PASS',
      cycle24Critical: 5,
      unknownRuntime: 'DENIED',
      unrelatedRuntime: 'DENIED',
      helperMutantsDenied: 4,
      canonicalChanges: false,
      admissionAuthorized: false,
      integrationAuthorized: false,
      ...(full ? { fullCycle24: full } : {}),
    };
  } finally {
    try {
      const terminal = classifyFrame(framePorts);
      assert.equal(
        terminal.kind,
        observed.kind,
        'Current frame changed during qualification',
      );
      for (const [path, bytes] of observed.snapshots)
        assert.deepEqual(
          terminal.snapshots.get(path),
          bytes,
          'Exact observed frame must remain current',
        );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

export const currentContext = Object.freeze({
  context: expected.context,
  optimizationAuthor: expected.optimizationAuthor,
  optimizationPath: expected.optimizationPath,
  originalSha256: expected.originalSha256,
  authoredSha256: expected.authoredSha256,
});
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(
    JSON.stringify(
      await qualify({ fullCycle24: parseMode(process.argv[2]) === 'full' }),
      null,
      2,
    ),
  );
