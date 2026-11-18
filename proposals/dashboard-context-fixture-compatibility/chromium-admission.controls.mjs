// Finite UNAPPLIED CI-source scope controls; no installer/main/network execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  mkdirSync,
  chmodSync,
  symlinkSync,
  realpathSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir, devNull } from 'node:os';
const producer = process.cwd();
const folder = 'proposals/dashboard-context-fixture-compatibility/';
const manifest = JSON.parse(readFileSync(folder + 'manifest.json'));
const hash = (b) => createHash('sha256').update(b).digest('hex');
const options = { concurrency: false, timeout: 30000 };
const gitEnv = {
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_COUNT: '0',
  GIT_ATTR_NOSYSTEM: '1',
  GIT_ALLOW_PROTOCOL: 'file',
  GIT_NO_LAZY_FETCH: '1',
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
};
function git(cwd, ...args) {
  return execFileSync(
    'git',
    [
      '--no-replace-objects',
      '-c',
      'core.hooksPath=' + devNull,
      '-c',
      'core.fsmonitor=false',
      '-c',
      'credential.helper=',
      ...args,
    ],
    { cwd, env: gitEnv, stdio: ['ignore', 'pipe', 'pipe'] },
  );
}
// Exact changed payload bytes only; no source ignore/cleanup during qualification.
const delta = [
  ...new Set([
    ...git(producer, 'diff', '--name-only', manifest.base)
      .toString()
      .trim()
      .split('\n'),
    folder + 'chromium-admission.controls.mjs',
  ]),
].filter(Boolean);
async function withImage(fn, { before = false } = {}) {
  const image = mkdtempSync(
    join(realpathSync(tmpdir()), 'chromium565-control-'),
  );
  try {
    git(
      producer,
      'clone',
      '--shared',
      '--no-hardlinks',
      '--no-checkout',
      producer,
      image,
    );
    git(image, 'switch', '--detach', manifest.base);
    for (const path of delta) {
      mkdirSync(dirname(join(image, path)), { recursive: true });
      writeFileSync(join(image, path), readFileSync(join(producer, path)), {
        mode: 0o644,
      });
    }
    if (before) {
      for (const pin of Object.values(manifest.targets))
        writeFileSync(
          join(image, pin.path),
          git(image, 'show', manifest.base + ':' + pin.path),
        );
      for (const pin of manifest.ciScopeRows)
        writeFileSync(join(image, pin.path), pin.beforeText);
    }
    process.chdir(image);
    const m = await import(
      pathToFileURL(join(image, folder + 'current-fixture.mjs')).href
    );
    return await fn(m, image);
  } finally {
    process.chdir(producer);
    rmSync(image, { recursive: true, force: true });
  }
}
function change(path, fn) {
  const bytes = readFileSync(path);
  try {
    fn(bytes);
  } finally {
    writeFileSync(path, bytes);
    chmodSync(path, 0o644);
  }
}
function denied(m) {
  assert.throws(() => m.verifyCurrentPhysicalFrame(), /Exact joint/);
}
const helper = manifest.ciSourceProjection.path;

test(
  'finite complete afterimage qualifies default canonical guard while current helper read stays actual',
  options,
  () =>
    withImage(async (m) => {
      assert.equal(m.verifyCurrentPhysicalFrame().phase, 'after');
      const q = await m.qualifyInvoiceGuardProposal();
      assert.ok(q.check());
      assert.equal(
        hash(q.readCurrent(helper)),
        manifest.ciSourceProjection.currentSHA256,
      );
      assert.equal(
        hash(m.readPublicCiFixture(resolve(helper))),
        manifest.ciSourceProjection.historicalSHA256,
      );
    }),
);
test('fresh exact565 preparation phase is distinct and coherent', options, () =>
  withImage(
    (m) => {
      assert.equal(m.verifyCurrentPhysicalFrame().phase, 'before');
    },
    { before: true },
  ),
);
test(
  'all financial P1 SQL Auth ports and raw Git proof mechanisms remain unchanged',
  options,
  () => {
    const old = JSON.parse(
      git(producer, 'show', manifest.base + ':' + folder + 'manifest.json'),
    );
    for (const key of [
      'overlays',
      'currentOverlayOids',
      'fixtureMetadataForwards',
      'p1TestHistoricalScopeAmendment',
      'readerIntegration',
      'c27HistoricalProof',
      'nativeAuthor',
    ])
      assert.deepEqual(manifest[key], old[key]);
    assert.equal(manifest.knownReadBase, old.base);
    const oldBody = git(
      producer,
      'show',
      manifest.base + ':' + folder + 'current-fixture.mjs',
    ).toString();
    const body = readFileSync(folder + 'current-fixture.mjs', 'utf8');
    const start = 'const gitEnvironment = Object.freeze({',
      end = 'const artifacts = new Set([';
    assert.equal(
      body.slice(body.indexOf(start), body.indexOf(end)),
      oldBody.slice(oldBody.indexOf(start), oldBody.indexOf(end)),
    );
    assert.equal(manifest.ciSourceProjection.newFinancialMetadataReadPorts, 0);
    assert.equal(manifest.ciSourceProjection.newP1SqlAuthReadPorts, 0);
  },
);
test(
  'C32 original assertions budgets and real observer all other bytes remain exact',
  options,
  () => {
    const row = manifest.ciScopeRows.find((r) => r.kind === 'c32-test');
    const actual = readFileSync(row.path, 'utf8');
    const marker = 'const { classifyMirrorText';
    assert.equal(
      actual.slice(actual.indexOf(marker)),
      row.beforeText.slice(row.beforeText.indexOf(marker)),
    );
    const observer = manifest.ciScopeRows.find(
      (r) => r.kind === 'actual-observer',
    );
    assert.equal(
      readFileSync(observer.path, 'utf8').replace(
        manifest.ciSourceProjection.currentSHA256,
        manifest.ciSourceProjection.historicalSHA256,
      ),
      observer.beforeText,
    );
    assert.equal(
      readFileSync(folder + 'controls.test.mjs').compare(
        git(
          producer,
          'show',
          manifest.base + ':' + folder + 'controls.test.mjs',
        ),
      ),
      0,
    );
    for (const id of Object.keys(manifest.targets))
      assert.equal(
        readFileSync(folder + id + '.original.txt').compare(
          git(
            producer,
            'show',
            manifest.base + ':' + folder + id + '.original.txt',
          ),
        ),
        0,
      );
  },
);
for (const path of [
  'server/invoices/commercial-drafts.proposed.sql',
  'src/App.tsx',
  'tests/property-p1-executor.test.ts',
])
  test('denies unknown protected current bytes ' + path, options, () =>
    withImage((m) =>
      change(path, (b) => {
        writeFileSync(path, Buffer.concat([b, Buffer.from('\n// unknown\n')]));
        denied(m);
      }),
    ),
  );
for (const path of ['unknown-source.txt', 'artifacts/cycle32/unknown'])
  test('denies unknown source or generated directory ' + path, options, () =>
    withImage((m) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, 'unknown');
      denied(m);
    }),
  );
test(
  'denies helper full historical revert even though old literal would match',
  options,
  () =>
    withImage((m) =>
      change(helper, () => {
        writeFileSync(
          helper,
          git(
            producer,
            'show',
            manifest.ciSourceProjection.historicalCommit + ':' + helper,
          ),
        );
        denied(m);
      }),
    ),
);
test(
  'denies missing current helper instead of falling back to historical body',
  options,
  () =>
    withImage((m) =>
      change(helper, () => {
        rmSync(helper);
        assert.throws(() => m.readPublicCiFixture(resolve(helper)));
      }),
    ),
);
test('denies current helper special permission bits', options, () =>
  withImage((m) => {
    chmodSync(helper, 0o1644);
    denied(m);
  }),
);
test('denies current helper symlink even to exact bytes', options, () =>
  withImage((m, image) => {
    const target = join(dirname(image), image.split('/').pop() + '-helper');
    writeFileSync(target, readFileSync(helper));
    try {
      rmSync(helper);
      symlinkSync(target, helper);
      denied(m);
    } finally {
      rmSync(target);
    }
  }),
);
for (const row of manifest.ciScopeRows)
  test('denies mixed C32 or observer endpoint ' + row.kind, options, () =>
    withImage((m) => {
      writeFileSync(row.path, row.beforeText);
      denied(m);
    }),
  );
test('denies mixed financial header endpoint', options, () =>
  withImage((m) => {
    const p = manifest.targets.invoice.path;
    writeFileSync(p, git(producer, 'show', manifest.base + ':' + p));
    denied(m);
  }),
);
test(
  'denies captured coherent phase withdrawal after successful physical proof',
  options,
  () =>
    withImage((m) => {
      m.verifyCurrentPhysicalFrame();
      for (const row of manifest.ciScopeRows)
        writeFileSync(row.path, row.beforeText);
      for (const pin of Object.values(manifest.targets))
        writeFileSync(
          pin.path,
          git(producer, 'show', manifest.base + ':' + pin.path),
        );
      denied(m);
    }),
);
for (const path of [
  folder + 'manifest.json',
  folder + 'current-fixture.mjs',
  folder + 'chromium-admission.controls.mjs',
])
  test('denies cached trusted-file late withdrawal ' + path, options, () =>
    withImage((m) => {
      m.verifyCurrentPhysicalFrame();
      change(path, (b) => {
        writeFileSync(path, Buffer.concat([b, Buffer.from('\n')]));
        assert.throws(
          () => m.readPublicCiFixture(resolve(helper)),
          /Exact joint/,
        );
      });
    }),
  );
test(
  'denies helper withdrawal across an injected qualifier read callback before historical output',
  options,
  () =>
    withImage(async (m) => {
      let hit = false;
      const original = readFileSync(helper);
      try {
        await assert.rejects(
          m.qualifyInvoiceGuardProposal({
            read: (path, encoding) => {
              const bytes = readFileSync(path, encoding);
              if (resolve(String(path)) === resolve(helper)) {
                hit = true;
                writeFileSync(
                  helper,
                  original.toString().replace('libgbm1', 'libgbm2'),
                );
              }
              return bytes;
            },
          }),
        );
        assert.equal(hit, true);
      } finally {
        writeFileSync(helper, original);
      }
    }),
);
test(
  'denies unknown CI read paths rather than exposing financial or Auth source',
  options,
  () =>
    withImage((m) => {
      for (const p of [
        'src/App.tsx',
        'server/invoices/commercial-drafts.proposed.sql',
        'tests/property-p1-executor.test.ts',
      ])
        assert.throws(() => m.readPublicCiFixture(resolve(p)), /Exact joint/);
    }),
);
test(
  'real observer uses actual e2b source and preserves unknown mirror denial',
  options,
  () =>
    withImage((m, image) => {
      m.verifyCurrentPhysicalFrame();
      const temp = mkdtempSync(
        join(realpathSync(tmpdir()), 'observer565-synthetic-'),
      );
      const preload = join(temp, 'preload.mjs');
      // Synthetic OS ports only; actual helper and observer files are never projected.
      writeFileSync(
        preload,
        `import fs from 'node:fs'; import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module'; import {createHash} from 'node:crypto'; import {resolve} from 'node:path';\nconst text='https://aws.archive.ubuntu.com/ubuntu/ priority:1\\nhttps://archive.ubuntu.com/ubuntu/ priority:2\\nhttps://security.ubuntu.com/ubuntu/ priority:3\\n';\nconst raw=fs.readFileSync;fs.readFileSync=function(path,...args){if(String(path)==='/etc/apt/apt-mirrors.txt')return text;return raw.call(this,path,...args)};\ncp.execFileSync=function(file,args){if(file!==process.execPath||args.length!==1||args[0]!==resolve('scripts/cycle31-ubuntu-source-probe.mjs'))throw Error('Unexpected child');return JSON.stringify({source_sha256:'0'.repeat(64),validation:'PASS',stanzas:[],mirror_sha256:createHash('sha256').update(text).digest('hex')})};syncBuiltinESMExports();\n`,
      );
      try {
        const result = JSON.parse(
          execFileSync(
            process.execPath,
            [
              '--import',
              pathToFileURL(preload).href,
              'scripts/cycle32-runner-mirror-probe.mjs',
            ],
            { cwd: image, env: gitEnv, encoding: 'utf8', timeout: 5000 },
          ),
        );
        assert.equal(result.status, 'READ_ONLY_OBSERVATION');
        assert.equal(
          result.hashes.validator,
          manifest.ciSourceProjection.currentSHA256,
        );
        assert.equal(
          result.current_mirror_validator,
          'REJECT_REVIEWED_MIRROR_OR_PRIORITY',
        );
        assert.equal(result.acceptance, false);
        assert.equal(result.mirror_observation.rows[0].target, 'UNRECOGNIZED');
      } finally {
        rmSync(temp, { recursive: true, force: true });
      }
    }),
);
test('denies native seed full historical revert', options, () =>
  withImage((m) => {
    const path = 'tests/helpers/property-p1-fixture.ts';
    writeFileSync(
      path,
      readFileSync(
        'proposals/ui-invoice-native-fixture-compatibility/historical/' + path,
      ),
    );
    denied(m);
  }),
);
test('denies manifest withdrawal across qualifier import await', options, () =>
  withImage(async (m) => {
    const path = folder + 'manifest.json',
      original = readFileSync(path);
    const pending = m.qualifyInvoiceGuardProposal();
    writeFileSync(path, Buffer.concat([original, Buffer.from('\n')]));
    try {
      await assert.rejects(pending, /Exact joint/);
    } finally {
      writeFileSync(path, original);
    }
  }),
);
for (const behavior of ['missing', 'wrong'])
  test(
    'denies ' + behavior + ' historical CI Git bytes without current fallback',
    options,
    () =>
      withImage((m, image) => {
        const temp = mkdtempSync(
          join(realpathSync(tmpdir()), 'ci565-git-failure-'),
        );
        const shim = join(temp, 'git');
        const realGit = execFileSync('/usr/bin/which', ['git'], {
          encoding: 'utf8',
        }).trim();
        const command =
          manifest.ciSourceProjection.historicalCommit + ':' + helper;
        writeFileSync(
          shim,
          '#!/bin/sh\ncase "$*" in *" show ' +
            command +
            '"*) ' +
            (behavior === 'missing' ? 'exit 1' : 'printf wrong; exit 0') +
            ';; esac\nexec ' +
            JSON.stringify(realGit) +
            ' "$@"\n',
          { mode: 0o755 },
        );
        try {
          const script = `const m=await import(${JSON.stringify(pathToFileURL(join(image, folder + 'current-fixture.mjs')).href)});try{m.readPublicCiFixture(${JSON.stringify(join(image, helper))});process.exitCode=9}catch(e){if(!String(e.message).includes('Exact joint'))throw e}`;
          execFileSync(
            process.execPath,
            ['--input-type=module', '-e', script],
            {
              cwd: image,
              env: { ...gitEnv, PATH: temp + ':' + gitEnv.PATH },
              timeout: 15000,
              stdio: ['ignore', 'pipe', 'pipe'],
            },
          );
        } finally {
          rmSync(temp, { recursive: true, force: true });
        }
      }),
  );
