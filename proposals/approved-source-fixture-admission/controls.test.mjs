import test from 'node:test';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  lstatSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  chmodSync,
  renameSync,
  symlinkSync,
  realpathSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, devNull } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const producer = process.cwd(),
  folder = 'proposals/approved-source-fixture-admission/';
const manifest = JSON.parse(readFileSync(folder + 'physical-frame.json'));
const files = [
  'README.md',
  'physical-frame.json',
  'current-fixture.mjs',
  'original-tests.txt',
  'source-tests.proposed.txt',
  'fixture.patch',
  'controls.test.mjs',
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const expectedHelper = readFileSync(
  folder + 'source-tests.proposed.txt',
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
async function withImage(name, callback) {
  assert.equal(
    hash(readFileSync(folder + 'current-fixture.mjs')),
    expectedHelper,
  );
  const image = mkdtempSync(
    join(realpathSync(tmpdir()), 'approved-authors-fixture-'),
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
    git(image, 'switch', '--detach', manifest.contexts[name].commit);
    mkdirSync(join(image, folder), { recursive: true });
    for (const file of files)
      writeFileSync(
        join(image, folder, file),
        readFileSync(join(producer, folder, file)),
        { mode: 0o644 },
      );
    process.chdir(image);
    const module = await import(
      pathToFileURL(join(image, folder, 'current-fixture.mjs')).href
    );
    await callback(image, module);
  } finally {
    process.chdir(producer);
    rmSync(image, { recursive: true, force: true });
  }
}
function edit(image, path) {
  const file = join(image, path);
  writeFileSync(
    file,
    Buffer.concat([
      readFileSync(file),
      Buffer.from('\n// controlled source mutation\n'),
    ]),
  );
}
function installContext(image, name) {
  const currentHeader = readFileSync(
    join(image, 'tests/invoice-guard-admission-proposal.test.ts'),
  );
  for (const other of Object.values(manifest.contexts))
    for (const path of Object.keys(other.overrides))
      if (!Object.hasOwn(manifest.rows, path))
        rmSync(join(image, path), { force: true });
  for (const prefix of [
    'proposals/dashboard-forms-fixture-compatibility',
    'proposals/c27-output-fixture-correction',
  ])
    rmSync(join(image, prefix), { recursive: true, force: true });
  for (const path of [
    'tests/propel-dashboard-parity-source.test.ts',
    'tests/cycle27-source-lineage.test.ts',
  ])
    writeFileSync(
      join(image, path),
      git(image, 'show', manifest.base + ':' + path),
    );
  for (const path of Object.keys(manifest.contexts[name].overrides)) {
    const destination = join(image, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(
      destination,
      git(image, 'show', manifest.contexts[name].commit + ':' + path),
      { mode: 0o644 },
    );
  }
  writeFileSync(
    join(image, 'tests/invoice-guard-admission-proposal.test.ts'),
    currentHeader,
  );
}
for (const name of ['dashboard531', 'c27533'])
  test(
    'qualifies only the complete exact approved ' + name + ' frame',
    options,
    () =>
      withImage(name, async (image, module) => {
        const frame = module.verifyCurrentPhysicalFrame();
        assert.equal(frame.context, name);
        assert.equal(frame.files, 2539);
        assert.equal(frame.admissionAuthorized, false);
        const q = await module.qualifyInvoiceGuardProposal();
        assert.equal(q.admissionAuthorized, false);
        assert.equal(
          q.check().sourceAuthor,
          q.helper.verifyInvoiceGuardFrame({ readCurrent: q.readCurrent })
            .sourceAuthor,
        );
        if (name === 'c27533') {
          assert.equal(
            hash(readFileSync('tests/cycle27-source-lineage.test.ts')),
            '1df4852d4c78ea2d62beaabd49ee4771842ef1d586dfb0b0977c8d7319a90913',
          );
          assert.equal(
            hash(
              Buffer.from(
                q.readCurrent('tests/cycle27-source-lineage.test.ts', 'utf8'),
              ),
            ),
            'fa5190cda8ec498565a830022bc2c20bf79a3a1e01823d2d5453bb80d3e47fe5',
          );
        }
      }),
  );
test(
  'preserves every original39 assertion, pin and30-second budget exactly',
  options,
  () => {
    const original = readFileSync(folder + 'original-tests.txt', 'utf8'),
      proposed = readFileSync(folder + 'source-tests.proposed.txt', 'utf8');
    const marker = "\nconst dir = 'proposals/invoice-guard-admission/';";
    assert.equal(
      original.slice(original.indexOf(marker)),
      proposed.slice(proposed.indexOf(marker)),
    );
    assert.equal(
      hash(Buffer.from(original.slice(original.indexOf(marker)))),
      '51ad3788d5b7a8e622b654997122f96c10554b6375d26b6c5ef9245a6442247a',
    );
    assert.ok(
      readFileSync('vite.config.ts', 'utf8').includes('testTimeout: 30000'),
    );
    assert.ok(
      readFileSync('vite.config.ts', 'utf8').includes('hookTimeout: 30000'),
    );
    assert.equal(
      hash(readFileSync('tests/invoice-guard-admission-proposal.test.ts')),
      '682627ce0a9eabdf466b661f3d0177d83262c49ec00625c951be82d84762cf3f',
    );
  },
);
for (const [name, path] of [
  ['dashboard531', 'src/components/CompanyOperations.tsx'],
  ['dashboard531', 'src/App.tsx'],
  ['dashboard531', 'server/invoices/commercial-drafts.proposed.sql'],
  ['dashboard531', 'proposals/invoice-guard-admission/qualify.mjs'],
  [
    'dashboard531',
    'proposals/ui-invoice-composition-fixture-compatibility/current-fixture.mjs',
  ],
  [
    'dashboard531',
    'proposals/dashboard-forms-fixture-compatibility/current-fixture.mjs',
  ],
  ['c27533', 'proposals/c27-output-fixture-correction/qualify.mjs'],
  ['c27533', 'tests/database/property.test.ts'],
])
  test('denies mutated current source ' + path, options, () =>
    withImage(name, async (image, module) => {
      edit(image, path);
      assert.throws(() => module.verifyCurrentPhysicalFrame(), /Exact sealed/);
    }),
  );
test('denies missing source instead of historical fallback', options, () =>
  withImage('c27533', async (image, module) => {
    rmSync(join(image, 'tests/cycle27-source-lineage.test.ts'));
    assert.throws(() => module.verifyCurrentPhysicalFrame(), /Exact sealed/);
  }),
);
test('denies wrong permissions and symlink substitution', options, () =>
  withImage('dashboard531', async (image, module) => {
    const path = join(image, 'src/App.tsx');
    chmodSync(path, 0o664);
    assert.throws(() => module.verifyCurrentPhysicalFrame(), /Exact sealed/);
    chmodSync(path, 0o644);
    renameSync(path, path + '.saved');
    symlinkSync(path + '.saved', path);
    assert.throws(() => module.verifyCurrentPhysicalFrame(), /Exact sealed/);
  }),
);
for (const empty of [false, true])
  test(
    'denies unexpected ' + (empty ? 'empty directory' : 'source companion'),
    options,
    () =>
      withImage('dashboard531', async (image, module) => {
        const path = join(image, 'unreviewed-source');
        if (empty) mkdirSync(path);
        else writeFileSync(path, 'throw Error("never evaluate")');
        assert.throws(
          () => module.verifyCurrentPhysicalFrame(),
          /Exact sealed/,
        );
      }),
  );
test('denies a partial known-author mixture', options, () =>
  withImage('dashboard531', async (image, module) => {
    writeFileSync(
      join(image, 'tests/cycle27-source-lineage.test.ts'),
      git(
        image,
        'show',
        manifest.contexts.c27533.commit +
          ':tests/cycle27-source-lineage.test.ts',
      ),
    );
    assert.throws(() => module.verifyCurrentPhysicalFrame(), /Exact sealed/);
  }),
);
test(
  'denies the unapproved complete combined531/533 integration',
  options,
  () =>
    withImage('dashboard531', async (image, module) => {
      for (const path of Object.keys(manifest.contexts.c27533.overrides)) {
        const destination = join(image, path);
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(
          destination,
          git(image, 'show', manifest.contexts.c27533.commit + ':' + path),
          { mode: 0o644 },
        );
      }
      assert.throws(() => module.verifyCurrentPhysicalFrame(), /Exact sealed/);
    }),
);
for (const file of [
  'physical-frame.json',
  'current-fixture.mjs',
  'source-tests.proposed.txt',
  'fixture.patch',
])
  test('denies stale or rebound packet ' + file, options, () =>
    withImage('dashboard531', async (image, module) => {
      edit(image, folder + file);
      assert.throws(() => module.verifyCurrentPhysicalFrame(), /Exact sealed/);
    }),
  );
test(
  'cached qualification denies later helper or manifest withdrawal',
  options,
  () =>
    withImage('c27533', async (image, module) => {
      const q = await module.qualifyInvoiceGuardProposal();
      edit(image, folder + 'physical-frame.json');
      assert.throws(() => q.check(), /Exact sealed/);
    }),
);
test(
  'a captured complete frame cannot switch to the other complete known frame',
  options,
  () =>
    withImage('dashboard531', async (image, module) => {
      const q = await module.qualifyInvoiceGuardProposal();
      installContext(image, 'c27533');
      assert.throws(() => q.check(), /Exact sealed/);
    }),
);
test(
  'current proof rejects an old-body injection on the eighth C27 test port',
  options,
  () =>
    withImage('c27533', async (image, module) => {
      await assert.rejects(
        () =>
          module.qualifyInvoiceGuardProposal({
            read: (path, encoding) =>
              String(path).endsWith('tests/cycle27-source-lineage.test.ts')
                ? readFileSync(
                    'proposals/c27-output-fixture-correction/original-tests.txt',
                    encoding,
                  )
                : readFileSync(path, encoding),
          }),
        /Exact sealed/,
      );
    }),
);
test(
  'late current withdrawal inside a helper callback is denied',
  options,
  () =>
    withImage('c27533', async (image, module) => {
      const q = await module.qualifyInvoiceGuardProposal();
      let changed = false;
      assert.throws(
        () =>
          q.helper.verifyInvoiceGuardFrame({
            readCurrent: (path, encoding) => {
              if (!changed) {
                changed = true;
                edit(
                  image,
                  'proposals/c27-output-fixture-correction/README.md',
                );
              }
              return q.readCurrent(path, encoding);
            },
          }),
        /Exact sealed/,
      );
    }),
);
test(
  'missing immutable author objects deny without networking or cache fallback',
  options,
  () =>
    withImage('dashboard531', async (image, module) => {
      const path = join(image, '.git/objects/info/alternates'),
        before = readFileSync(path);
      try {
        writeFileSync(path, '');
        assert.throws(
          () => module.verifyCurrentPhysicalFrame(),
          /Exact sealed/,
        );
      } finally {
        writeFileSync(path, before);
      }
    }),
);
test(
  'changing process cwd cannot rebind a captured physical/Git source root',
  options,
  () =>
    withImage('dashboard531', async (image, module) => {
      module.verifyCurrentPhysicalFrame();
      process.chdir(producer);
      try {
        assert.throws(
          () => module.verifyCurrentPhysicalFrame(),
          /Exact sealed/,
        );
      } finally {
        process.chdir(image);
      }
    }),
);

test(
  'rejects actual sticky and reported setuid/setgid permission bits on exact source',
  options,
  () =>
    withImage('dashboard531', async (image, module) => {
      const path = join(image, 'src/App.tsx');
      // The managed macOS host strips setuid/setgid on chmod; sticky survives.
      chmodSync(path, 0o1644);
      assert.equal(lstatSync(path).mode & 0o7777, 0o1644);
      assert.throws(() => module.verifyCurrentPhysicalFrame(), /Exact sealed/);
      chmodSync(path, 0o644);
      const originalStat = fs.lstatSync;
      try {
        for (const special of [0o4000, 0o2000]) {
          fs.lstatSync = (value, ...args) => {
            const info = originalStat(value, ...args);
            return value === path
              ? Object.assign(Object.create(info), {
                  mode: info.mode | special,
                })
              : info;
          };
          syncBuiltinESMExports();
          assert.equal(lstatSync(path).mode & 0o7777, 0o644 | special);
          assert.throws(
            () => module.verifyCurrentPhysicalFrame(),
            /Exact sealed/,
          );
        }
      } finally {
        fs.lstatSync = originalStat;
        syncBuiltinESMExports();
      }
    }),
);

for (const companion of ['README.md', 'controls.test.mjs'])
  test(
    'denies mutated packet companion ' + companion + ' after module load',
    options,
    () =>
      withImage('dashboard531', async (image, module) => {
        module.verifyCurrentPhysicalFrame();
        edit(image, folder + companion);
        assert.throws(
          () => module.verifyCurrentPhysicalFrame(),
          /Exact sealed/,
        );
      }),
  );
