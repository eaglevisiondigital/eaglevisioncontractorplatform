// UNAPPLIED source integration qualification. Only disposable clones are mutated.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  lstatSync,
  readFileSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { dirname, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const baseline = 'af318f9e939ca83a315784eb252bf192f246cfd5';
const author = 'df98d83c9a071c773f5f09b02c9bc66d223af734';
const evidenceSeal =
  'b4e91bc2c872c732c3291cfb5a520d3af9aaa6fc8c2ab2fe69744ac348c1aad1';
const patchSeal =
  '1d4aaf0f25a299613632274953523535f462af057b0850d0353afc92291e1388';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const environment = Object.freeze({
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_COUNT: '0',
  GIT_TERMINAL_PROMPT: '0',
  GIT_NO_LAZY_FETCH: '1',
  GIT_ALLOW_PROTOCOL: 'file',
  GIT_PROTOCOL_FROM_USER: '0',
  GIT_ATTR_NOSYSTEM: '1',
});
const git = (root, args, input) =>
  execFileSync(
    'git',
    [
      '--no-replace-objects',
      '--no-pager',
      '-c',
      `core.hooksPath=${devNull}`,
      '-c',
      'core.fsmonitor=false',
      '-c',
      `core.attributesFile=${devNull}`,
      '-c',
      'credential.helper=',
      '-c',
      'protocol.allow=never',
      '-c',
      'protocol.file.allow=always',
      ...args,
    ],
    {
      cwd: root,
      env: environment,
      input,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

function regular(path, mode = '100644') {
  const full = resolve(path);
  let ancestor = full;
  while (true) {
    assert(
      !lstatSync(ancestor).isSymbolicLink(),
      `Symlink source forbidden: ${ancestor}`,
    );
    if (ancestor === parse(ancestor).root) break;
    ancestor = dirname(ancestor);
  }
  const info = lstatSync(full);
  assert(info.isFile(), `Regular source required: ${path}`);
  assert.equal(
    info.mode & 0o111 ? '100755' : '100644',
    mode,
    'Exact Git mode required',
  );
  return readFileSync(full);
}

export function packet(
  evidence = regular(join(directory, 'evidence.json')),
  patch = regular(join(directory, 'integration.patch')),
) {
  assert.equal(
    sha(evidence),
    evidenceSeal,
    'Exact literal integration evidence required',
  );
  assert.equal(
    sha(patch),
    patchSeal,
    'Exact literal integration patch required',
  );
  const record = JSON.parse(evidence);
  assert.equal(record.launchParent, baseline);
  assert.equal(record.sourceAuthor, author);
  assert.equal(record.integrationAuthorized, false);
  assert.equal(record.operationalReady, false);
  return { record, patch };
}
function tree(root, commit) {
  return git(root, ['ls-tree', '-rz', '--full-tree', commit])
    .toString()
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const m = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
      assert(m, 'Only regular known Git objects required');
      return { mode: m[1], blob: m[2], path: m[3] };
    });
}
export function lineage(root = process.cwd()) {
  const { record, patch } = packet();
  for (const [commit, parent, paths, digest] of [
    [
      record.gatewayAuthor,
      record.gatewayParent,
      ['server/payments/sandbox.ts'],
      '73d4d530e4a560838477641e2c4298edee03fd4368645437ca9f113ab32ac294',
    ],
    [
      record.fixtureAuthor,
      record.gatewayAuthor,
      ['tests/nmi-two-merchant-token-boundary.test.ts'],
      'd67d40d9ba916bf776c3415ab0ecf2ff8de709f84cc356861c719e6144d13db0',
    ],
    [
      author,
      record.sourceParent,
      record.files
        .map((f) => f.path)
        .filter(
          (p) =>
            ![
              'server/payments/sandbox.ts',
              'tests/nmi-two-merchant-token-boundary.test.ts',
            ].includes(p),
        ),
      record.admissionPatchSha256,
    ],
  ]) {
    assert.equal(
      git(root, ['show', '-s', '--format=%P', commit]).toString().trim(),
      parent,
      'Exact sole author parent required',
    );
    assert.deepEqual(
      git(root, [
        'diff-tree',
        '--no-commit-id',
        '--name-status',
        '--no-renames',
        '-r',
        commit,
      ])
        .toString()
        .trim()
        .split('\n'),
      [...paths].sort().map((p) => 'M\t' + p),
    );
    assert.equal(
      sha(
        git(root, [
          'diff',
          '--no-ext-diff',
          '--no-textconv',
          '--no-color',
          '--binary',
          parent,
          commit,
        ]),
      ),
      digest,
      'Exact approved source-author patch required',
    );
  }
  assert.equal(
    git(root, ['show', '-s', '--format=%P', baseline]).toString().trim(),
    record.gatewayParent,
  );
  for (const f of record.files) {
    assert.equal(
      sha(git(root, ['show', `${baseline}:${f.path}`])),
      f.beforeSha256,
    );
    assert.equal(
      sha(git(root, ['show', `${author}:${f.path}`])),
      f.afterSha256,
    );
    for (const c of [baseline, author])
      assert.match(
        git(root, ['ls-tree', c, '--', f.path]).toString(),
        /^100644 blob /,
      );
  }
  assert.deepEqual(
    patch,
    git(root, [
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '--no-color',
      '--binary',
      baseline,
      author,
      '--',
      ...record.files.map((f) => f.path),
    ]),
  );
  return { record, patch };
}
export function checkFrame(root = process.cwd(), proposed = false) {
  const { record } = packet();
  const current = tree(root, baseline),
    authored = new Map(tree(root, author).map((f) => [f.path, f]));
  assert.equal(current.length, 2410);
  assert.equal(authored.size, 2410);
  const changes = new Map(record.files.map((f) => [f.path, f]));
  assert.equal(changes.size, 12);
  for (const file of current) {
    const next =
      proposed && changes.has(file.path) ? authored.get(file.path) : file;
    assert.equal(next.mode, file.mode);
    const bytes = regular(join(root, file.path), next.mode);
    assert.equal(
      createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex'),
      next.blob,
      `Exact ${proposed ? 'proposed' : 'canonical'} source required: ${file.path}`,
    );
  }
  assert.equal(
    sha(regular(join(root, record.preservedC22.path))),
    record.preservedC22.sha256,
  );
  return true;
}
export function prepareArchive(root = process.cwd()) {
  const { patch } = lineage(root);
  checkFrame(root);
  const archive = mkdtempSync(
    join(realpathSync(tmpdir()), 'propel-nmi-launch-'),
  );
  try {
    git(root, [
      'clone',
      '--quiet',
      '--local',
      '--shared',
      '--no-checkout',
      root,
      archive,
    ]);
    git(archive, ['checkout', '--quiet', '--detach', baseline]);
    git(archive, ['apply', '--check', '--whitespace=error', '-'], patch);
    git(archive, ['apply', '--whitespace=error', '-'], patch);
    assert.deepEqual(
      git(archive, ['diff', '--name-only']).toString().trim().split('\n'),
      packet().record.files.map((f) => f.path),
    );
    checkFrame(archive, true);
    checkFrame(root);
    symlinkSync(
      realpathSync(join(root, 'node_modules')),
      join(archive, 'node_modules'),
      'dir',
    );
    return archive;
  } catch (error) {
    rmSync(archive, { recursive: true, force: true });
    throw error;
  }
}
export async function proposedPorts(root) {
  checkFrame(root, true);
  const bytes = regular(
    join(root, 'scripts/payment-response-source-admission.mjs'),
  );
  const code = await import(
    'data:text/javascript;base64,' + bytes.toString('base64')
  );
  checkFrame(root, true);
  return {
    ...code,
    ports: {
      readCurrent: (p) => regular(join(root, p)),
      readOriginal: (c, p) => git(root, ['show', `${c}:${p}`]),
      metadata: (...a) => git(root, a),
      stat: (p) => lstatSync(join(root, p)),
    },
  };
}
function command(root, args) {
  checkFrame(root, true);
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    maxBuffer: 12 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stdout + '\n' + result.stderr);
  checkFrame(root, true);
  return result;
}
export function sourceChecks(root) {
  const checks = [
    ['scripts/check-payment-ack-admission.mjs'],
    ['scripts/check-cycle17-integrity.mjs'],
    ['scripts/check-cycle22.mjs', '--require-independent'],
    ['scripts/check-cycle24.mjs'],
  ];
  const results = checks.map((args) => ({
    command: args.join(' '),
    stdout: command(root, args).stdout.trim(),
  }));
  const ack = JSON.parse(results[0].stdout);
  assert.equal(ack.classification, 'DEVELOPMENT_SOURCE_ONLY');
  assert.equal(ack.operationalAcceptance, 'NOT_RUN');
  return results;
}
function vitest(root, files, output, expected, filter) {
  const args = [
    'node_modules/vitest/vitest.mjs',
    'run',
    ...files,
    '--maxWorkers=1',
    '--reporter=json',
    '--outputFile=' + join(root, output),
  ];
  if (filter) args.push('-t', filter);
  command(root, args);
  const report = JSON.parse(readFileSync(join(root, output)));
  assert.equal(report.success, true);
  assert.equal(report.numPassedTests, expected);
  assert.equal(report.numFailedTests, 0);
  assert.equal(report.numTodoTests, 0);
  if (!filter) assert.equal(report.numPendingTests, 0);
  assert.deepEqual(
    report.testResults
      .map((s) => relative(root, resolve(root, s.name)).split(sep).join('/'))
      .sort(),
    [...files].sort(),
  );
  return {
    passed: expected,
    failed: 0,
    filtered: filter ? report.numPendingTests : 0,
    reportSha256: sha(readFileSync(join(root, output))),
  };
}
export function regressions(root) {
  const source = vitest(
    root,
    [
      'tests/payment-ack-source-admission.test.ts',
      'tests/launch-invoice-payment-source.test.ts',
      'tests/invoice-caller-migration-source.test.ts',
      'tests/launch-caller-payment-integration.test.ts',
      'tests/invoice-checker-qualification-baseline.test.ts',
      'tests/invoice-caller-transition-proposal.test.ts',
    ],
    'source-results.json',
    72,
  );
  const financial = vitest(
    root,
    [
      'tests/nmi-two-merchant-token-boundary.test.ts',
      'tests/payments-refunds.test.ts',
    ],
    'financial-results.json',
    31,
  );
  const duplicate = vitest(
    root,
    ['tests/payments-sandbox.test.ts'],
    'duplicate-results.json',
    4,
    '^(replays a stored result without provider execution and blocks an uncertain prior attempt|binds nmi execution to immutable values across reservation waits|quarantines an NMI approval with zero transaction identity without replay|isolates two fictional capture scopes and rejects wrong-provider stored outcomes)$',
  );
  return { source, financial, duplicate };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert.deepEqual(process.argv.slice(2), ['--regressions']);
  const root = prepareArchive();
  try {
    console.log(
      JSON.stringify(
        {
          baseline,
          author,
          integrationPatchSha256: patchSeal,
          checks: sourceChecks(root),
          regressions: regressions(root),
          integrationAuthorized: false,
          operationalReady: false,
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      checkFrame(root, true);
      checkFrame(process.cwd());
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}
