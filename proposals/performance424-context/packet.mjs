// Qualify the entire new packet in an exact disposable AFTER frame.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  realpathSync,
  lstatSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir, devNull } from 'node:os';
import { pathToFileURL } from 'node:url';
const bindings = {
  'proposals/performance424-context/evidence.json':
    'e01a366940f30761b276403ba42b0994c6602857337be0545df549cc5fc04ea3',
  'proposals/performance424-context/qualify.mjs':
    '199abc42fe8bd75eb3d6ea89ce77c0e3b41ab4f89cf0d35d730a7cebfc3062a6',
  'proposals/performance424-context/measure.mjs':
    'e31fc25d1c91d64e1a03b8a115a56b9a78fd9b224d40980a9fceb8a69b45ae34',
  'proposals/performance424-context/inputs.fixture.ts':
    'aa0ffd16effa462d57db44179589cc5ec59d7ea0e6d6675124b930dbc338d599',
  'proposals/performance424-context/regress.mjs':
    'e678d02ad504a438e092b85887aefb9d02cfb0fa32e3746dd01c33817b726081',
  'proposals/performance424-context/hosted-ten.json':
    'eb1e789835253c3369eb89ee27ed776d3a9611f863c0f81a3d377fe1ef961e8b',
  'tests/workflows/performance424-context.test.ts':
    'f766c4857445ebeaa74c243c91e8614a15b7e4a00b06e96d1d4f7f7faeecda46',
};
const hash = (b) => createHash('sha256').update(b).digest('hex');
const environment = {
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_GLOBAL: devNull,
};
const git = (...a) =>
  execFileSync('git', ['--no-replace-objects', ...a], {
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
export function verifyPacketFiles(read = readFileSync) {
  const bytes = new Map();
  for (const [p, digest] of Object.entries(bindings)) {
    let prefix = '';
    for (const part of p.split('/')) {
      prefix = prefix ? prefix + '/' + part : part;
      assert(
        !lstatSync(prefix).isSymbolicLink(),
        'Regular packet source required',
      );
    }
    const info = lstatSync(p);
    assert(info.isFile() && (info.mode & 0o777) === 0o644);
    const captured = Buffer.from(read(p));
    assert.equal(
      hash(captured),
      digest,
      'Exact reviewed packet bytes required before import',
    );
    bytes.set(p, captured);
  }
  return bytes;
}
export async function qualifyAfterPacket() {
  const bytes = verifyPacketFiles();
  const { verifyInputs, currentContext, classifyFrame } = await import(
    'data:text/javascript;base64,' +
      bytes
        .get('proposals/performance424-context/qualify.mjs')
        .toString('base64')
  );
  const reviewed = verifyInputs(),
    observed = classifyFrame();
  const gitDir = git('rev-parse', '--absolute-git-dir').toString().trim();
  const root = mkdtempSync(join(tmpdir(), 'propel-performance424-after-'));
  try {
    const archive = join(root, 'source.tar');
    git('archive', '--format=tar', '--output', archive, currentContext.context);
    execFileSync('tar', ['-xf', archive, '-C', root], { env: environment });
    writeFileSync(
      join(root, currentContext.optimizationPath),
      reviewed.authored,
    );
    for (const name of ['helper', 'cycle9', 'cycle24'])
      execFileSync('git', ['apply', '-'], {
        cwd: root,
        env: environment,
        input: reviewed.patches[name],
        stdio: 'pipe',
      });
    for (const [p, content] of bytes) {
      const dest = join(root, p);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content, { mode: 0o644 });
    }
    // Explicit local Git metadata pointer, never a credential/provider source.
    writeFileSync(join(root, '.git'), 'gitdir: ' + gitDir + '\n', {
      mode: 0o600,
    });
    symlinkSync(
      realpathSync('node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    const output = join(root, 'report.json');
    execFileSync(
      process.execPath,
      [
        'node_modules/vitest/vitest.mjs',
        'run',
        'tests/workflows/performance424-context.test.ts',
        '--configLoader',
        'runner',
        '--maxWorkers=1',
        '--reporter=json',
        '--outputFile=' + output,
      ],
      {
        cwd: root,
        env: { ...environment, GIT_DIR: gitDir, GIT_WORK_TREE: root },
        stdio: 'pipe',
        maxBuffer: 2 * 1024 * 1024,
        timeout: 90000,
        killSignal: 'SIGKILL',
      },
    );
    const report = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(report.numPassedTests, 16);
    assert.equal(report.numFailedTests, 0);
    assert.equal(report.numPendingTests, 0);
    return {
      context: currentContext.context,
      frame: 'EXACT_AFTER',
      packetCases: 16,
      failed: 0,
      canonicalChanges: false,
      admissionAuthorized: false,
      integrationAuthorized: false,
    };
  } finally {
    try {
      const terminal = classifyFrame();
      assert.equal(terminal.kind, observed.kind);
      for (const [p, b] of observed.snapshots)
        assert.deepEqual(terminal.snapshots.get(p), b);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(JSON.stringify(await qualifyAfterPacket(), null, 2));
