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
  lstatSync,
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
    if (after)
      for (const row of manifest.fixtureMetadataForwards.filter(
        (row) => row.phased,
      )) {
        const bytes = readFileSync(join(producer, row.path));
        assert.equal(hash(bytes), row.afterSHA256);
        writeFileSync(join(image, row.path), bytes);
      }
    if (after)
      for (const [path, pin] of Object.entries(
        manifest.readerIntegration.additions,
      )) {
        const bytes = readFileSync(join(producer, path));
        assert.equal(hash(bytes), pin.sha256);
        mkdirSync(join(image, path.substring(0, path.lastIndexOf('/'))), {
          recursive: true,
        });
        writeFileSync(join(image, path), bytes, { mode: 0o644 });
      }
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
for (const after of [false, true])
  test(
    'exact553 ' +
      (after ? 'proposed' : 'original') +
      ' pair preserves original bodies and budgets',
    options,
    () =>
      withImage(
        async (image, module) => {
          const frame = module.verifyCurrentPhysicalFrame();
          assert.equal(frame.phase, after ? 'after' : 'before');
          assert.equal(frame.admissionAuthorized, false);
          assert.equal(frame.files, after ? 2557 : 2546);
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
      ),
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
  'rejects historical C27 before-source instead of approved553 source',
  options,
  () =>
    withImage(async (image, module) => {
      writeFileSync(
        join(image, 'tests/cycle27-source-lineage.test.ts'),
        git(
          image,
          'show',
          'c60c09c1fe9edab55220840499e2525a6751a558:tests/cycle27-source-lineage.test.ts',
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
        for (const pin of Object.values(manifest.targets))
          writeFileSync(
            pin.path,
            git(image, 'show', manifest.base + ':' + pin.path),
          );
        for (const row of manifest.fixtureMetadataForwards.filter(
          (row) => row.phased,
        ))
          writeFileSync(
            row.path,
            git(image, 'show', manifest.base + ':' + row.path),
          );
        for (const path of Object.keys(manifest.readerIntegration.additions))
          rmSync(path);
        rmSync('proposals/commercial-customer-operating-reader', {
          recursive: true,
          force: true,
        });
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

test(
  'rejects a complete stale historical537 header pair on the P1 author',
  options,
  () =>
    withImage(async (image, module) => {
      for (const [id, pin] of Object.entries(manifest.targets))
        writeFileSync(pin.path, readFileSync(folder + id + '.original.txt'));
      deny(module);
    }),
);
test(
  'rejects withdrawing the exact approved P1 source to its original clock inputs',
  options,
  () =>
    withImage(async (image, module) => {
      writeFileSync(
        'tests/property-p1-executor.test.ts',
        git(
          image,
          'show',
          '9f9fe19994fb2a224730d3f8212ca8e4dcde44c3:tests/property-p1-executor.test.ts',
        ),
      );
      deny(module);
    }),
);

test(
  'scope amendment projects only the P1 TEST check while actual disk stays approved',
  options,
  () =>
    withImage(async (image, module) => {
      const path = manifest.p1TestHistoricalScopeAmendment.path;
      const q = await module.qualifyInvoiceGuardProposal();
      assert.equal(
        hash(readFileSync(path)),
        manifest.p1TestHistoricalScopeAmendment.currentSHA256,
      );
      assert.equal(
        hash(q.readCurrent(path)),
        manifest.p1TestHistoricalScopeAmendment.historicalSHA256,
      );
      assert.throws(() => module.dashboardSource(path), /Exact joint/);
      mutate(image, 'src/App.tsx');
      assert.throws(() => q.readCurrent(path), /Exact joint/);
    }),
);
test(
  'scope amendment denies a caller-injected old P1 body despite exact physical source',
  options,
  () =>
    withImage(async (image, module) => {
      const path = manifest.p1TestHistoricalScopeAmendment.path;
      const historical = git(
        image,
        'show',
        manifest.p1TestHistoricalScopeAmendment.historicalParent + ':' + path,
      );
      await assert.rejects(
        module.qualifyInvoiceGuardProposal({
          read: (p, enc) =>
            String(p).endsWith(path)
              ? enc
                ? historical.toString(enc)
                : historical
              : readFileSync(p, enc),
        }),
        /Exact (?:joint dashboard\/invoice context|sealed invoice guard proposal) required/,
      );
    }),
);

for (const row of manifest.fixtureMetadataForwards.filter((row) => row.phased))
  test('rejects partial phased metadata endpoint ' + row.path, options, () =>
    withImage(async (image, module) => {
      writeFileSync(row.path, readFileSync(join(producer, row.path)));
      deny(module);
    }),
  );
for (const row of manifest.fixtureMetadataForwards.filter((row) => !row.phased))
  test('rejects reverting fixed S output source ' + row.path, options, () =>
    withImage(async (image, module) => {
      writeFileSync(
        row.path,
        git(image, 'show', row.historicalRef + ':' + row.path),
      );
      deny(module);
    }),
  );
for (const row of manifest.fixtureMetadataForwards)
  test('rejects old injected callback body ' + row.path, options, () =>
    withImage(
      async (image, module) => {
        const old = git(image, 'show', row.historicalRef + ':' + row.path);
        await assert.rejects(
          module.qualifyInvoiceGuardProposal({
            read: (p, enc) =>
              String(p).endsWith(row.path)
                ? enc
                  ? old.toString(enc)
                  : old
                : readFileSync(p, enc),
          }),
          /Exact (?:joint dashboard\/invoice context|sealed invoice guard proposal) required/,
        );
      },
      { after: true },
    ),
  );
for (const drift of ['helper', 'manifest', 'current', 'mode', 'unknown-output'])
  test('cached five metadata readers reject ' + drift + ' drift', options, () =>
    withImage(
      async (image, module) => {
        const q = await module.qualifyInvoiceGuardProposal();
        for (const row of manifest.fixtureMetadataForwards)
          assert.equal(hash(q.readCurrent(row.path)), row.historicalSHA256);
        if (drift === 'helper') mutate(image, folder + 'current-fixture.mjs');
        if (drift === 'manifest') mutate(image, folder + 'manifest.json');
        if (drift === 'current')
          mutate(image, manifest.fixtureMetadataForwards[0].path);
        if (drift === 'mode')
          chmodSync(manifest.fixtureMetadataForwards[0].path, 0o1644);
        if (drift === 'unknown-output')
          writeFileSync('unreviewed-output.txt', 'unknown');
        for (const row of manifest.fixtureMetadataForwards)
          assert.throws(() => q.readCurrent(row.path), /Exact joint/);
      },
      { after: true },
    ),
  );
test('direct source reader rejects unknown and outside paths', options, () =>
  withImage(
    async (image, module) => {
      const q = await module.qualifyInvoiceGuardProposal();
      assert.throws(
        () => q.readCurrent('not-a-known-source.txt'),
        /Exact joint/,
      );
      assert.throws(
        () => q.readCurrent('../outside-source.txt'),
        /Exact joint/,
      );
    },
    { after: true },
  ),
);

for (const [path] of Object.entries(manifest.readerIntegration.additions))
  test('rejects changed reviewed reader payload ' + path, options, () =>
    withImage(
      async (image, module) => {
        mutate(image, path);
        deny(module);
      },
      { after: true },
    ),
  );
test(
  'reader addition modes reject effective sticky executable and symlink',
  options,
  () =>
    withImage(
      async (image, module) => {
        const path = 'proposals/commercial-customer-operating-reader/source.ts';
        const bytes = readFileSync(path);
        for (const mode of [0o1644, 0o755]) {
          chmodSync(path, mode);
          assert.equal(lstatSync(path).mode & 0o7777, mode);
          deny(module);
          chmodSync(path, 0o644);
        }
        rmSync(path);
        symlinkSync(join(image, 'src/App.tsx'), path);
        deny(module);
        rmSync(path);
        writeFileSync(path, bytes);
      },
      { after: true },
    ),
);
test('partial reader additions cannot masquerade as original553', options, () =>
  withImage(async (image, module) => {
    const path = Object.keys(manifest.readerIntegration.additions)[0];
    mkdirSync(path.substring(0, path.lastIndexOf('/')), { recursive: true });
    writeFileSync(path, readFileSync(join(producer, path)));
    deny(module);
  }),
);
test('complete additions without resealed headers deny', options, () =>
  withImage(async (image, module) => {
    for (const [path] of Object.entries(manifest.readerIntegration.additions)) {
      mkdirSync(path.substring(0, path.lastIndexOf('/')), { recursive: true });
      writeFileSync(path, readFileSync(join(producer, path)));
    }
    deny(module);
  }),
);
test('resealed headers without complete additions deny', options, () =>
  withImage(async (image, module) => {
    for (const [id, pin] of Object.entries(manifest.targets))
      writeFileSync(pin.path, readFileSync(folder + id + '.proposed.txt'));
    deny(module);
  }),
);
test('cached qualification rejects late reader withdrawal', options, () =>
  withImage(
    async (image, module) => {
      const q = await module.qualifyInvoiceGuardProposal();
      rmSync(Object.keys(manifest.readerIntegration.additions)[0]);
      assert.throws(() => q.check(), /Exact joint/);
    },
    { after: true },
  ),
);
test(
  'reader additions cannot become new financial source-read ports',
  options,
  () =>
    withImage(
      async (image, module) => {
        const q = await module.qualifyInvoiceGuardProposal();
        for (const path of Object.keys(manifest.readerIntegration.additions))
          assert.throws(() => q.readCurrent(path), /Exact joint/);
      },
      { after: true },
    ),
);

async function withBatchReply(mode, callback) {
  const owned = mkdtempSync(
    join(realpathSync(tmpdir()), 'reader-batch-reply-'),
  );
  const beforePath = process.env.PATH;
  const modeFile = join(owned, 'mode.json');
  const traceFile = join(owned, 'batches.jsonl');
  writeFileSync(modeFile, JSON.stringify(mode));
  const refs = [
    ...manifest.authors.map((author) => author.commit),
    manifest.nativeAuthor.commit,
  ];
  const program = String.raw`
const fs = require('node:fs');
const {spawnSync}=require('node:child_process');
const args=process.argv.slice(2);
const isBatch=args.at(-2)==='cat-file'&&args.at(-1)==='--batch';
if(!isBatch){const r=spawnSync('/usr/bin/git',args,{stdio:'inherit',env:process.env});process.exit(r.status??73);}
const input=fs.readFileSync(0);
if(input.toString()!==__REFS__.join('\n')+'\n')process.exit(74);
const r=spawnSync('/usr/bin/git',args,{input,env:process.env});
if(r.status!==0){process.stderr.write(r.stderr);process.exit(r.status??75);}
let out=Buffer.from(r.stdout);const mode=JSON.parse(fs.readFileSync(__MODE_FILE__,'utf8'));
fs.appendFileSync(__TRACE_FILE__,JSON.stringify({mode,input:input.toString()})+'\n');
const newline=out.indexOf(10);const fields=out.subarray(0,newline).toString().split(' ');const end=newline+1+Number(fields[2])+1;
if(mode==='missing')out=Buffer.from(fields[0]+' missing\n');
else if(mode==='wrong-type')out=Buffer.concat([Buffer.from(fields[0]+' blob '+fields[2]+'\n'),out.subarray(newline+1)]);
else if(mode==='wrong-oid')out=Buffer.concat([Buffer.from('0'.repeat(40)+' commit '+fields[2]+'\n'),out.subarray(newline+1)]);
else if(mode==='wrong-size')out=Buffer.concat([Buffer.from(fields[0]+' commit '+(Number(fields[2])+1)+'\n'),out.subarray(newline+1)]);
else if(mode==='oversized')out=Buffer.concat([Buffer.from(fields[0]+' commit 999999\n'),out.subarray(newline+1)]);
else if(mode==='corrupt-body')out[newline+1]^=1;
else if(mode==='duplicate-record')out=Buffer.concat([out.subarray(0,end),out]);
else if(mode==='reordered-records'){const n2=out.indexOf(10,end);const f2=out.subarray(end,n2).toString().split(' ');const e2=n2+1+Number(f2[2])+1;out=Buffer.concat([out.subarray(end,e2),out.subarray(0,end),out.subarray(e2)]);}
else if(mode==='extra-trailing')out=Buffer.concat([out,Buffer.from('\n')]);
else if(mode==='truncated')out=out.subarray(0,out.length-1);
else if(mode!=='valid')process.exit(76);
process.stdout.write(out);process.stderr.write(r.stderr);
`;
  writeFileSync(
    join(owned, 'git'),
    '#!' +
      process.execPath +
      '\n' +
      program
        .replace('__REFS__', JSON.stringify(refs))
        .replaceAll('__MODE_FILE__', JSON.stringify(modeFile))
        .replaceAll('__TRACE_FILE__', JSON.stringify(traceFile)),
    { mode: 0o755 },
  );
  try {
    process.env.PATH = owned + ':' + beforePath;
    await callback({ modeFile, traceFile });
  } finally {
    if (beforePath === undefined) delete process.env.PATH;
    else process.env.PATH = beforePath;
    rmSync(owned, { recursive: true, force: true });
  }
}
for (const mode of [
  'missing',
  'wrong-type',
  'wrong-oid',
  'wrong-size',
  'oversized',
  'corrupt-body',
  'duplicate-record',
  'reordered-records',
  'extra-trailing',
  'truncated',
])
  test('fresh commit batch rejects ' + mode, options, () =>
    withBatchReply(mode, () =>
      withImage(
        async (image, module) => {
          deny(module);
        },
        { after: true },
      ),
    ),
  );
test(
  'every complete physical proof performs a new fixed commit batch',
  options,
  () =>
    withBatchReply('valid', ({ traceFile }) =>
      withImage(
        async (image, module) => {
          module.verifyCurrentPhysicalFrame();
          module.verifyCurrentPhysicalFrame();
          const rows = readFileSync(traceFile, 'utf8')
            .trim()
            .split('\n')
            .map((row) => JSON.parse(row));
          assert.equal(rows.length, 2);
          assert.equal(rows[0].input, rows[1].input);
        },
        { after: true },
      ),
    ),
);
test('cached module rejects fresh commit metadata withdrawal', options, () =>
  withBatchReply('valid', ({ modeFile, traceFile }) =>
    withImage(
      async (image, module) => {
        module.verifyCurrentPhysicalFrame();
        writeFileSync(modeFile, JSON.stringify('corrupt-body'));
        deny(module);
        const rows = readFileSync(traceFile, 'utf8')
          .trim()
          .split('\n')
          .map((row) => JSON.parse(row));
        assert.equal(rows.length, 2);
      },
      { after: true },
    ),
  ),
);

test(
  'fresh native parent view rejects same-tree graft substitution',
  options,
  () =>
    withImage(
      async (image, module) => {
        module.verifyCurrentPhysicalFrame();
        const author = manifest.authors[0];
        const tree = git(image, 'show', '-s', '--format=%T', author.parent)
          .toString()
          .trim();
        const body =
          'tree ' +
          tree +
          '\nauthor Test <test@example.invalid> 1 +0000\ncommitter Test <test@example.invalid> 1 +0000\n\nsame tree graft control\n';
        const replacement = execFileSync(
          '/usr/bin/git',
          ['hash-object', '-w', '-t', 'commit', '--stdin'],
          { cwd: image, env: gitEnv, input: body },
        )
          .toString()
          .trim();
        const delta = git(
          image,
          'diff-tree',
          '--no-commit-id',
          '--name-status',
          '-r',
          author.commit,
        );
        mkdirSync(join(image, '.git/info'), { recursive: true });
        writeFileSync(
          join(image, '.git/info/grafts'),
          author.commit + ' ' + replacement + '\n',
        );
        assert.equal(
          git(image, 'show', '-s', '--format=%P', author.commit)
            .toString()
            .trim(),
          replacement,
        );
        assert.deepEqual(
          git(
            image,
            'diff-tree',
            '--no-commit-id',
            '--name-status',
            '-r',
            author.commit,
          ),
          delta,
        );
        deny(module);
      },
      { after: true },
    ),
);
test(
  'fresh native parent view rejects shallow parent withdrawal',
  options,
  () =>
    withImage(
      async (image, module) => {
        module.verifyCurrentPhysicalFrame();
        const author = manifest.authors[0];
        writeFileSync(join(image, '.git/shallow'), author.commit + '\n');
        assert.equal(
          git(image, 'show', '-s', '--format=%P', author.commit)
            .toString()
            .trim(),
          '',
        );
        deny(module);
      },
      { after: true },
    ),
);
