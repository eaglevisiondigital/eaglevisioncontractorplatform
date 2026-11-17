import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  chmodSync,
  symlinkSync,
  realpathSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir, devNull } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const producer = process.cwd(),
  folder = 'proposals/dashboard-context-fixture-compatibility/';
const manifest = JSON.parse(readFileSync(folder + 'manifest.json'));
const files = [
  'README.md',
  'manifest.json',
  'current-fixture.mjs',
  'dashboard.original.txt',
  'invoice.original.txt',
  'dashboard.proposed.txt',
  'invoice.proposed.txt',
  'dashboard.patch',
  'invoice-held.patch',
  'controls.test.mjs',
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const expectedHelper = readFileSync(
  folder + 'invoice.proposed.txt',
  'utf8',
).match(
  /createHash\('sha256'\)\.update\(fixtureBytes\)\.digest\('hex'\) !==\s*'([a-f0-9]{64})'/,
)?.[1];
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
const git = (cwd, ...args) =>
  execFileSync(
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
async function withImage(callback, { after = false } = {}) {
  assert.equal(
    hash(readFileSync(folder + 'current-fixture.mjs')),
    expectedHelper,
  );
  const image = mkdtempSync(join(realpathSync(tmpdir()), 'joint537-controls-'));
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
    mkdirSync(join(image, folder), { recursive: true });
    for (const name of files)
      writeFileSync(
        join(image, folder, name),
        readFileSync(join(producer, folder, name)),
        { mode: 0o644 },
      );
    if (after)
      for (const [id, pin] of Object.entries(manifest.targets))
        writeFileSync(
          join(image, pin.path),
          readFileSync(join(image, folder + id + '.proposed.txt')),
        );
    process.chdir(image);
    const module = await import(
      pathToFileURL(join(image, folder + 'current-fixture.mjs')).href
    );
    await callback(image, module);
  } finally {
    process.chdir(producer);
    rmSync(image, { recursive: true, force: true });
  }
}
const mutate = (image, path) =>
  writeFileSync(
    join(image, path),
    Buffer.concat([
      readFileSync(join(image, path)),
      Buffer.from('\n// controlled mutation\n'),
    ]),
  );
const deny = (module) =>
  assert.throws(() => module.verifyCurrentPhysicalFrame(), /Exact joint/);
test(
  'exact537 before and complete joint after preserve both original bodies and budgets',
  options,
  async () => {
    for (const after of [false, true])
      await withImage(
        async (image, module) => {
          const frame = module.verifyCurrentPhysicalFrame();
          assert.equal(frame.phase, after ? 'after' : 'before');
          assert.equal(frame.admissionAuthorized, false);
          assert.equal(frame.files, 2546);
          assert.equal(
            module.dashboardSource('src/components/forms.tsx'),
            readFileSync(manifest.historicalFormsPath, 'utf8'),
          );
          for (const [id, pin] of Object.entries(manifest.targets)) {
            const original = readFileSync(
                folder + id + '.original.txt',
                'utf8',
              ),
              proposed = readFileSync(folder + id + '.proposed.txt', 'utf8');
            assert.equal(
              proposed
                .replace(
                  folder + 'current-fixture.mjs',
                  pin.oldFolder + 'current-fixture.mjs',
                )
                .replace(expectedHelper, pin.oldHelper),
              original,
            );
          }
          assert.match(
            readFileSync('vite.config.ts', 'utf8'),
            /testTimeout: 30000/,
          );
          assert.match(
            readFileSync('vite.config.ts', 'utf8'),
            /hookTimeout: 30000/,
          );
          const q = await module.qualifyInvoiceGuardProposal();
          assert.equal(q.admissionAuthorized, false);
          assert.equal(
            q.check().sourceAuthor,
            q.helper.verifyInvoiceGuardFrame({ readCurrent: q.readCurrent })
              .sourceAuthor,
          );
        },
        { after },
      );
  },
);
for (const id of ['dashboard', 'invoice'])
  test('rejects one-sided ' + id + ' header substitution', options, () =>
    withImage(async (image, module) => {
      writeFileSync(
        join(image, manifest.targets[id].path),
        readFileSync(folder + id + '.proposed.txt'),
      );
      deny(module);
    }),
  );
for (const path of [
  'src/components/forms.tsx',
  'src/App.tsx',
  'proposals/dashboard-forms-fixture-compatibility/current-fixture.mjs',
  'proposals/approved-source-fixture-admission/physical-frame.json',
])
  test('rejects changed current or frozen source ' + path, options, () =>
    withImage(async (image, module) => {
      mutate(image, path);
      deny(module);
    }),
  );
test(
  'rejects exact533 C27 replacement rather than composing a second branch',
  options,
  () =>
    withImage(async (image, module) => {
      writeFileSync(
        join(image, 'tests/cycle27-source-lineage.test.ts'),
        git(
          image,
          'show',
          'a24c0c75852d740da41d0abd2cf283c4230b9349:tests/cycle27-source-lineage.test.ts',
        ),
      );
      deny(module);
    }),
);
test(
  'rejects missing source, symlinks and special permission bits',
  options,
  () =>
    withImage(async (image, module) => {
      const path = join(image, 'src/App.tsx'),
        bytes = readFileSync(path);
      rmSync(path);
      deny(module);
      writeFileSync(path, bytes);
      chmodSync(path, 0o1644);
      deny(module);
      rmSync(path);
      symlinkSync(join(image, 'src/components/forms.tsx'), path);
      deny(module);
    }),
);
for (const name of [
  'README.md',
  'controls.test.mjs',
  'manifest.json',
  'current-fixture.mjs',
  'dashboard.proposed.txt',
  'invoice-held.patch',
])
  test('rejects changed sealed companion ' + name, options, () =>
    withImage(async (image, module) => {
      module.verifyCurrentPhysicalFrame();
      mutate(image, folder + name);
      deny(module);
    }),
  );
test(
  'rejects unexpected source, packet companion and empty directory',
  options,
  () =>
    withImage(async (image, module) => {
      for (const path of ['unexpected.mjs', folder + 'unexpected.mjs']) {
        writeFileSync(path, 'export {};\n');
        deny(module);
        rmSync(path);
      }
      mkdirSync('unexpected-empty');
      deny(module);
    }),
);
test('cached qualification rejects later source withdrawal', options, () =>
  withImage(
    async (image, module) => {
      const q = await module.qualifyInvoiceGuardProposal();
      mutate(image, 'src/App.tsx');
      assert.throws(() => q.check(), /Exact joint/);
    },
    { after: true },
  ),
);
test(
  'captured complete after cannot withdraw to complete before',
  options,
  () =>
    withImage(
      async (image, module) => {
        module.verifyCurrentPhysicalFrame();
        for (const [id, pin] of Object.entries(manifest.targets))
          writeFileSync(pin.path, readFileSync(folder + id + '.original.txt'));
        deny(module);
      },
      { after: true },
    ),
);
test(
  'rejects late source mutation through an original qualifier read callback',
  options,
  () =>
    withImage(async (image, module) => {
      let changed = false;
      await assert.rejects(
        module.qualifyInvoiceGuardProposal({
          read: (path, encoding) => {
            const bytes = readFileSync(path, encoding);
            if (!changed) {
              changed = true;
              mutate(image, 'src/App.tsx');
            }
            return bytes;
          },
        }),
        /Exact (?:joint dashboard\/invoice context|sealed invoice guard proposal) required/,
      );
      assert.equal(changed, true);
    }),
);
test(
  'missing author objects and changing cwd cannot rebind the proof',
  options,
  () =>
    withImage(async (image, module) => {
      const alternates = join(image, '.git/objects/info/alternates'),
        bytes = readFileSync(alternates);
      writeFileSync(alternates, '');
      deny(module);
      writeFileSync(alternates, bytes);
      module.verifyCurrentPhysicalFrame();
      process.chdir(producer);
      try {
        deny(module);
      } finally {
        process.chdir(image);
      }
    }),
);
test(
  'coordinated helper and manifest replacement cannot rebind a loaded closure',
  options,
  () =>
    withImage(async (image, module) => {
      module.verifyCurrentPhysicalFrame();
      const path = folder + 'manifest.json',
        rewritten = JSON.parse(readFileSync(path));
      rewritten.classification = 'UNREVIEWED_REBIND';
      writeFileSync(path, JSON.stringify(rewritten, null, 2) + '\n');
      mutate(image, folder + 'current-fixture.mjs');
      deny(module);
    }),
);
for (const id of ['dashboard', 'invoice'])
  test(
    'actual proposed ' +
      id +
      ' guarded header rejects altered helper before evaluation',
    options,
    async () => {
      const proposed = readFileSync(folder + id + '.proposed.txt', 'utf8'),
        start = proposed.indexOf('await (async () => {'),
        end = proposed.indexOf('  })()', start);
      assert.ok(start > 0 && end > start);
      const marker = 'joint537_unreviewed_' + id;
      Reflect.deleteProperty(globalThis, marker);
      const altered =
        'globalThis[' +
        JSON.stringify(marker) +
        ']=true; export const unreviewed=true;';
      const prelude =
        "import { createHash } from 'node:crypto';\nconst readFileSync=()=>Buffer.from(" +
        JSON.stringify(altered) +
        ");\nconst pathToFileURL=()=>new URL('file:///unused');const resolve=()=>'/unused';\n";
      const executable = Buffer.from(
        prelude +
          'await import(' +
          proposed.slice(start, end + '  })()'.length) +
          ');\n',
      );
      try {
        await assert.rejects(
          import(
            'data:text/javascript;base64,' + executable.toString('base64')
          ),
          /Exact (?:approved dashboard\/forms source fixture|sealed invoice guard proposal) required/,
        );
        assert.equal(Reflect.get(globalThis, marker), undefined);
      } finally {
        Reflect.deleteProperty(globalThis, marker);
      }
    },
  );
