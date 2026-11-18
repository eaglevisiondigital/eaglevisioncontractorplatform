// Finite UNAPPLIED controls: no helper installer main, package install or network execution.
// The actual observer main executes with synthetic OS ports.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  mkdirSync,
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

function denied(m) {
  assert.throws(() => m.verifyCurrentPhysicalFrame(), /Exact joint/);
}
const helper = manifest.ciSourceProjection.path;

// All coordinated cases target an ALREADY LOADED, pinned TCB context only.
// They make no claim against replacement of the full trusted verifier/bootstrap.
test(
  'supplement coordinated loaded F and manifest cannot rebind captured TCB',
  options,
  () =>
    withImage((m) => {
      m.verifyCurrentPhysicalFrame();
      const path = folder + 'manifest.json';
      const changed = JSON.parse(readFileSync(path));
      changed.classification = 'UNREVIEWED_COHERENT_REBIND';
      const bytes = Buffer.from(JSON.stringify(changed, null, 2) + '\n');
      writeFileSync(path, bytes);
      const fpath = folder + 'current-fixture.mjs';
      const original = readFileSync(fpath, 'utf8');
      writeFileSync(
        fpath,
        original.replace(
          /const manifestSeal =\s*'[a-f0-9]{64}';/,
          "const manifestSeal = '" + hash(bytes) + "';",
        ) + '\n// unreviewed-source-rebind\n',
      );
      denied(m);
    }),
);
test(
  'supplement coordinated helper observer and CI manifest row deny in captured TCB',
  options,
  () =>
    withImage((m) => {
      m.verifyCurrentPhysicalFrame();
      const actual = readFileSync(helper, 'utf8');
      assert.equal(actual.split('libgbm1').length, 2);
      const changedHelper = Buffer.from(actual.replace('libgbm1', 'libgbm2'));
      const nextSha = hash(changedHelper);
      writeFileSync(helper, changedHelper);
      const path = 'scripts/cycle32-runner-mirror-probe.mjs';
      const observer = readFileSync(path, 'utf8').replace(
        manifest.ciSourceProjection.currentSHA256,
        nextSha,
      );
      writeFileSync(path, observer);
      const changed = JSON.parse(readFileSync(folder + 'manifest.json'));
      changed.ciSourceProjection.currentSHA256 = nextSha;
      changed.ciSourceProjection.currentOid = createHash('sha1')
        .update('blob ' + changedHelper.length + '\0')
        .update(changedHelper)
        .digest('hex');
      changed.ciHelperContext.actualSHA256 = nextSha;
      const row = changed.ciScopeRows.find((r) => r.kind === 'actual-observer');
      row.afterText = observer;
      row.afterSHA256 = hash(Buffer.from(observer));
      writeFileSync(
        folder + 'manifest.json',
        JSON.stringify(changed, null, 2) + '\n',
      );
      assert.throws(
        () => m.readPublicCiFixture(resolve(helper)),
        /Exact joint/,
      );
    }),
);
test(
  'supplement CI inventory read callback withdraws current proof before old bytes output',
  options,
  () =>
    withImage(async (m) => {
      const target = 'scripts/cycle32-runner-mirror-probe.mjs';
      let hit = false;
      await assert.rejects(
        m.qualifyInvoiceGuardProposal({
          read: (path, encoding) => {
            const bytes = readFileSync(path, encoding);
            if (resolve(String(path)) === resolve(target)) {
              hit = true;
              writeFileSync(
                'src/App.tsx',
                Buffer.concat([
                  readFileSync('src/App.tsx'),
                  Buffer.from('\n// proof withdrawn during CHECK read\n'),
                ]),
              );
            }
            return bytes;
          },
        }),
        /Exact (?:joint dashboard\/invoice context|sealed invoice guard proposal) required/,
      );
      assert.equal(hit, true);
    }),
);
test(
  'supplement TEST API rejects financial P1 SQL and Auth paths',
  options,
  () =>
    withImage((m) => {
      for (const path of [
        'src/App.tsx',
        'tests/property-p1-executor.test.ts',
        'server/invoices/commercial-drafts.proposed.sql',
        'server/customer/broker-auth.ts',
      ])
        assert.throws(
          () => m.readPublicCiFixture(resolve(path)),
          /Exact joint/,
        );
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
