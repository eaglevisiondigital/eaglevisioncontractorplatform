import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { join } from 'node:path';
import {
  createImage,
  inspectImage,
  inspectPacket,
  parent,
  probeGuard,
  runC27,
  target,
  changePermission,
} from './qualify.mjs';
const directory = 'proposals/c27-output-fixture-correction/';
function withImage(options, callback) {
  const fixture = createImage(options);
  try {
    return callback(fixture.image);
  } finally {
    fixture.remove();
  }
}
test('negative-first original C27 cases reproduce checkout contamination without a cleanup bypass', () =>
  withImage({}, (image) => {
    const run = runC27(image, { onlyTwo: true });
    assert.equal(run.exit, 0);
    assert.equal(run.passed, 2);
    assert.equal(run.skipped, 18);
    const snapshot = inspectImage(image);
    assert.deepEqual(snapshot.bodyMismatches, []);
    assert.deepEqual(snapshot.modeMismatches, []);
    assert.deepEqual(snapshot.unknown, ['artifacts', 'artifacts/cycle27']);
    assert.equal(probeGuard(image).status, 'DENIED');
  }));
test('negative-first physical permission drift still denies', () =>
  withImage({}, (image) => {
    changePermission(image);
    assert.deepEqual(inspectImage(image).modeMismatches, ['README.md']);
    assert.equal(probeGuard(image).status, 'DENIED');
  }));
test('negative-first unexpected source still denies', () =>
  withImage({}, (image) => {
    writeFileSync(
      join(image, 'unreviewed-c27-source.mjs'),
      'export const unknown=true;',
    );
    assert.deepEqual(inspectImage(image).unknown, [
      'unreviewed-c27-source.mjs',
    ]);
    assert.equal(probeGuard(image).status, 'DENIED');
  }));
test('clean exact528 source qualifies in a fresh separate image', () =>
  withImage({}, (image) => {
    const snapshot = inspectImage(image);
    assert.equal(snapshot.sourceFiles, 2531);
    assert.deepEqual(snapshot.bodyMismatches, []);
    assert.deepEqual(snapshot.modeMismatches, []);
    assert.deepEqual(snapshot.unknown, []);
    const result = probeGuard(image);
    assert.equal(result.status, 'PASS');
    assert.equal(result.admissionAuthorized, false);
    const hostile = mkdtempSync(
      join(realpathSync(tmpdir()), 'c27-hostile-git-'),
    );
    const marker = join(hostile, 'external-helper-executed');
    const helper = join(hostile, 'helper');
    const config = join(hostile, 'config');
    writeFileSync(
      helper,
      '#!/bin/sh\nprintf executed > "' + marker + '"\nexit 1\n',
    );
    chmodSync(helper, 0o700);
    writeFileSync(
      config,
      '[core]\nfsmonitor = ' +
        helper +
        '\n[credential]\nhelper = ' +
        helper +
        '\n',
    );
    try {
      const code = `const m=await import(${JSON.stringify(pathToFileURL(resolve(directory + 'qualify.mjs')).href)});const owned=m.createImage();try{console.log(JSON.stringify({status:m.probeGuard(owned.image).status,sourceFiles:m.inspectImage(owned.image).sourceFiles}));}finally{owned.remove();}`;
      const child = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', code],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: {
            ...process.env,
            GIT_DIR: join(hostile, 'not-the-source-repository'),
            GIT_WORK_TREE: hostile,
            GIT_OBJECT_DIRECTORY: join(hostile, 'foreign-objects'),
            GIT_INDEX_FILE: join(hostile, 'foreign-index'),
            GIT_CONFIG_GLOBAL: config,
            GIT_CONFIG_SYSTEM: config,
            GIT_CONFIG_COUNT: '3',
            GIT_CONFIG_KEY_0: 'core.fsmonitor',
            GIT_CONFIG_VALUE_0: helper,
            GIT_CONFIG_KEY_1: 'core.hooksPath',
            GIT_CONFIG_VALUE_1: hostile,
            GIT_CONFIG_KEY_2: 'credential.helper',
            GIT_CONFIG_VALUE_2: helper,
            GIT_TEMPLATE_DIR: hostile,
            GIT_ALLOW_PROTOCOL: 'ext:file',
          },
        },
      );
      assert.equal(child.status, 0, child.stderr);
      assert.deepEqual(JSON.parse(child.stdout), {
        status: 'PASS',
        sourceFiles: 2531,
      });
      assert.equal(existsSync(marker), false);
    } finally {
      rmSync(hostile, { recursive: true, force: true });
    }
  }));
test('unknown payload bytes never become a proposal through metadata rebinding', () => {
  assert.throws(
    () =>
      inspectPacket({
        read: (path) =>
          String(path).endsWith('source-tests.proposed.txt')
            ? Buffer.concat([
                readFileSync(path),
                Buffer.from('\n// altered test\n'),
              ])
            : readFileSync(path),
      }),
    /Exact unapplied C27/,
  );
});
test('unknown patch bytes deny before afterimage execution', () => {
  assert.throws(
    () =>
      inspectPacket({
        read: (path) =>
          String(path).endsWith('output-paths.patch')
            ? Buffer.concat([
                readFileSync(path),
                Buffer.from('\nunknown patch\n'),
              ])
            : readFileSync(path),
      }),
    /Exact unapplied C27/,
  );
});
test('all original assertion and raw-object script bytes remain exact outside declared setup edits', () => {
  const before = readFileSync(directory + 'original-tests.txt', 'utf8');
  let after = readFileSync(directory + 'source-tests.proposed.txt', 'utf8');
  const start = after.indexOf(
    '  const temporaryRoot = realpathSync(tmpdir());',
  );
  const end = after.indexOf('  const script = `', start);
  assert.ok(start >= 0 && end > start);
  after =
    after.slice(0, start) +
    "  mkdirSync('artifacts/cycle27', { recursive: true });\n  const dir = mkdtempSync('artifacts/cycle27/git-context-');\n" +
    after.slice(end);
  after = after
    .replace(
      "mkdirSync('test-results/cycle27', { recursive: true });",
      "mkdirSync('artifacts/cycle27', { recursive: true });",
    )
    .replace(
      "mkdtempSync('test-results/cycle27/fresh-read-')",
      "mkdtempSync('artifacts/cycle27/fresh-read-')",
    );
  after =
    before.slice(0, before.indexOf('type Spec =')) +
    after.slice(after.indexOf('type Spec ='));
  assert.equal(after, before);
  assert.equal(inspectPacket().parent, parent);
});
test('proposed setup preserves all20 original C27 cases, leaves no source artifacts, and honestly retains source-admission DENY', () =>
  withImage({ proposed: true }, (image) => {
    const run = runC27(image);
    assert.equal(run.exit, 0, run.stdout + run.stderr);
    assert.equal(run.passed, 20);
    assert.equal(run.failed, 0);
    assert.equal(run.skipped, 0);
    const snapshot = inspectImage(image);
    assert.deepEqual(snapshot.bodyMismatches, [target]);
    assert.deepEqual(snapshot.modeMismatches, []);
    assert.deepEqual(snapshot.unknown, []);
    assert.equal(snapshot.artifactsRootPresent, false);
    assert.equal(probeGuard(image).status, 'DENIED');
  }));
test('unsafe in-checkout temporary storage fails closed instead of being used by the raw Git fixture', () =>
  withImage({ proposed: true }, (image) => {
    mkdirSync(join(image, 'test-results'), { recursive: true });
    const run = runC27(image, { onlyTwo: true, unsafeTemporaryRoot: true });
    assert.notEqual(run.exit, 0);
    assert.equal(run.failed, 1);
    assert.ok(
      run.failureMessages.some((message) =>
        message.includes('outside-checkout temporary storage'),
      ),
    );
  }));
