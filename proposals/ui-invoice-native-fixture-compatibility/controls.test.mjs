import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  cpSync,
  readFileSync,
  writeFileSync,
  rmSync,
  chmodSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
const root = process.cwd();
const directory = 'proposals/ui-invoice-native-fixture-compatibility/';
const manifest = JSON.parse(readFileSync(directory + 'physical-frame.json'));
let image;
before(() => {
  image = mkdtempSync(join(tmpdir(), 'ui-invoice-controls-'));
  execFileSync('git', ['clone', '--shared', '--no-hardlinks', root, image], {
    stdio: 'pipe',
  });
  execFileSync(
    'git',
    ['-C', image, 'switch', '--detach', manifest.nativeAuthor.commit],
    {
      stdio: 'pipe',
    },
  );
  cpSync(
    'proposals/ui-invoice-fixture-compatibility',
    join(image, 'proposals/ui-invoice-fixture-compatibility'),
    { recursive: true },
  );
  cpSync(directory, join(image, directory), { recursive: true });
});
after(() => rmSync(image, { recursive: true, force: true }));
function run(code) {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {readFileSync,writeFileSync,renameSync} from 'node:fs'; const m=await import('./${directory}current-fixture.mjs'); ${code}`,
    ],
    { cwd: image, encoding: 'utf8' },
  );
  return result;
}
function modify(path, callback, code = 'm.verifyCurrentPhysicalFrame();') {
  const original = readFileSync(join(image, path));
  try {
    writeFileSync(join(image, path), callback(original));
    return run(code);
  } finally {
    writeFileSync(join(image, path), original);
  }
}
const denied = (result) => {
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /Exact sealed invoice guard proposal required/);
};
test('qualifies only the finite actual native-author frame and unchanged historical guard', () => {
  const r = run(
    'const q=await m.qualifyInvoiceGuardProposal(); console.log(JSON.stringify({frame:m.verifyCurrentPhysicalFrame(),parent:q.check().sourceAuthor,authorized:q.admissionAuthorized}));',
  );
  assert.equal(r.status, 0, r.stderr);
  const value = JSON.parse(r.stdout);
  assert.equal(value.frame.context, 'native-author');
  assert.equal(value.parent, '5f0f17dc9766411b260d5b53fd2db5a925adc80f');
  assert.equal(value.authorized, false);
});
test('retains all original39 case bodies and literal budgets byte-exact', () => {
  const before = readFileSync(directory + 'original-tests.txt', 'utf8');
  const after = readFileSync(directory + 'source-tests.proposed.txt', 'utf8');
  const marker = "\nconst dir = 'proposals/invoice-guard-admission/';";
  assert.equal(
    after.slice(after.indexOf(marker)),
    before.slice(before.indexOf(marker)),
  );
  assert.equal(
    (after.match(/it\(/g) ?? []).length,
    (before.match(/it\(/g) ?? []).length,
  );
  assert.equal(after.includes('timeout'), before.includes('timeout'));
});
for (const path of [
  'server/invoices/commercial-drafts.proposed.sql',
  'server/invoices/commercial-draft-client.ts',
  'server/payments/response-json.ts',
  'server/customer/broker-auth.ts',
  'supabase/migrations/20260922000001_phase1_foundation.sql',
  'src/main.tsx',
  'src/components/WorkspaceNavigation.tsx',
]) {
  // The migration name is resolved from the sealed inventory, not guessed from host output.
  const actual = path.startsWith('supabase/migrations/')
    ? Object.keys(manifest.rows).find(
        (p) => p.startsWith('supabase/migrations/') && p.endsWith('.sql'),
      )
    : path;
  test(`denies unknown current physical bytes before qualification at ${actual}`, () => {
    denied(
      modify(actual, (b) =>
        Buffer.concat([b, Buffer.from('\n// unauthorized edit\n')]),
      ),
    );
  });
}
test('denies coordinated current financial edits and rebinding manifest bytes', () => {
  const path = directory + 'physical-frame.json';
  denied(
    modify(path, (b) =>
      Buffer.from(
        b
          .toString()
          .replace(
            manifest.rows['server/payments/response-json.ts'].oid,
            'a'.repeat(40),
          ),
      ),
    ),
  );
});
test('denies missing current source without substituting historical data', () => {
  const path = join(image, 'src/components/WorkspaceNavigation.tsx');
  const bytes = readFileSync(path);
  try {
    unlinkSync(path);
    denied(run('m.verifyCurrentPhysicalFrame();'));
  } finally {
    writeFileSync(path, bytes);
  }
});
test('denies a wrong current source mode', () => {
  const path = join(image, 'src/components/WorkspaceNavigation.tsx');
  try {
    chmodSync(path, 0o755);
    denied(run('m.verifyCurrentPhysicalFrame();'));
  } finally {
    chmodSync(path, 0o644);
  }
});
test('denies a symlink current source', () => {
  const path = join(image, 'src/components/WorkspaceNavigation.tsx');
  const bytes = readFileSync(path);
  try {
    unlinkSync(path);
    symlinkSync(join(image, 'src/main.tsx'), path);
    denied(run('m.verifyCurrentPhysicalFrame();'));
  } finally {
    unlinkSync(path);
    writeFileSync(path, bytes);
  }
});
test('denies unknown source companions', () => {
  const path = join(image, 'src/unreviewed-ui.ts');
  try {
    writeFileSync(path, 'export const bad = true;');
    denied(run('m.verifyCurrentPhysicalFrame();'));
  } finally {
    unlinkSync(path);
  }
});
test('does not execute an altered canonical qualifier', () => {
  denied(
    modify(
      'proposals/invoice-guard-admission/qualify.mjs',
      (b) =>
        Buffer.concat([
          Buffer.from("throw Error('UNREVIEWED_QUALIFIER_EXECUTED');\n"),
          b,
        ]),
      'await m.qualifyInvoiceGuardProposal();',
    ),
  );
});
test('rechecks physical source after cached module import and before helper output', () => {
  const path = 'src/components/WorkspaceNavigation.tsx';
  const bytes = readFileSync(join(image, path));
  try {
    denied(
      run(
        `const q=await m.qualifyInvoiceGuardProposal(); writeFileSync('${path}', 'unknown late withdrawal'); q.check();`,
      ),
    );
  } finally {
    writeFileSync(join(image, path), bytes);
  }
});
for (const path of [
  directory + 'current-fixture.mjs',
  directory + 'physical-frame.json',
  'proposals/invoice-guard-admission/qualify.mjs',
  directory + 'historical/DECISIONS.md',
]) {
  test(`rechecks cached fixture TCB before output at ${path}`, () => {
    const bytes = readFileSync(join(image, path));
    try {
      denied(
        run(
          `const q=await m.qualifyInvoiceGuardProposal(); writeFileSync('${path}', 'unknown cached withdrawal'); q.check();`,
        ),
      );
    } finally {
      writeFileSync(join(image, path), bytes);
    }
  });
}
test('rejects physical root replacement even with identical source bytes', () => {
  const moved = image + '-moved';
  const result = run(
    `renameSync(process.cwd(), '${moved}'); try {m.verifyCurrentPhysicalFrame();} finally {renameSync('${moved}', '${image}');}`,
  );
  assert.notEqual(result.status, 0);
});
test('binds the proposed header to the exact wrapper before importing it', () => {
  const payload = readFileSync(directory + 'source-tests.proposed.txt', 'utf8');
  const helper = readFileSync(directory + 'current-fixture.mjs');
  assert.ok(
    payload.includes(createHash('sha256').update(helper).digest('hex')),
  );
  assert.ok(
    payload.indexOf('readFileSync(fixture)') <
      payload.indexOf("return 'data:text/javascript;base64,'"),
  );
});

test('rejects unknown executable companions inside the fixture namespace', () => {
  const path = join(image, directory + 'historical/unknown.mjs');
  try {
    writeFileSync(path, "throw Error('UNREVIEWED_EXECUTED');");
    denied(run('m.verifyCurrentPhysicalFrame();'));
  } finally {
    unlinkSync(path);
  }
});
test('the actual proposed header denies an altered wrapper before evaluation', () => {
  const payload = readFileSync(directory + 'source-tests.proposed.txt', 'utf8');
  const start = payload.indexOf('await (async () => {');
  const end = payload.indexOf('})()', start) + 5;
  const expression = payload.slice(start, end);
  const path = join(image, directory + 'current-fixture.mjs');
  const bytes = readFileSync(path);
  try {
    writeFileSync(
      path,
      'globalThis.UNREVIEWED_WRAPPER_EXECUTED=true;\n' + bytes,
    );
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import {readFileSync} from 'node:fs'; import {createHash} from 'node:crypto'; import {resolve} from 'node:path'; import {pathToFileURL} from 'node:url'; try {const url=${expression};await import(url);} catch (error) {console.log(JSON.stringify({error:error.message,executed:globalThis.UNREVIEWED_WRAPPER_EXECUTED===true}));}`,
      ],
      { cwd: image, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      error: 'Exact sealed invoice guard proposal required',
      executed: false,
    });
  } finally {
    writeFileSync(path, bytes);
  }
});

test('rejects an unreviewed root test-runner companion', () => {
  const path = join(image, 'vitest.config.mjs');
  try {
    writeFileSync(path, "throw Error('UNREVIEWED_CONFIG_EXECUTED');");
    denied(run('m.verifyCurrentPhysicalFrame();'));
  } finally {
    unlinkSync(path);
  }
});

for (const path of [
  'tests/database/property.test.ts',
  'tests/helpers/property-p1-fixture.ts',
]) {
  test(`denies unknown native fixture bytes before projection at ${path}`, () => {
    denied(
      modify(
        path,
        (b) =>
          Buffer.concat([
            b,
            Buffer.from('\n// unapproved native fixture edit\n'),
          ]),
        'await m.qualifyInvoiceGuardProposal();',
      ),
    );
  });
}
test('denies reverting only one approved native fixture input', () => {
  const path = 'tests/helpers/property-p1-fixture.ts';
  denied(
    modify(path, () =>
      readFileSync(join(image, directory + 'historical/' + path)),
    ),
  );
});
test('denies a late native fixture withdrawal after cached qualification', () => {
  const path = 'tests/database/property.test.ts';
  const bytes = readFileSync(join(image, path));
  try {
    denied(
      run(
        `const q=await m.qualifyInvoiceGuardProposal(); writeFileSync('${path}','unknown native withdrawal');q.check();`,
      ),
    );
  } finally {
    writeFileSync(join(image, path), bytes);
  }
});
test('retains the entire old515 package byte-exact', () => {
  const hash = (bytes) =>
    createHash('sha1')
      .update('blob ' + bytes.length + '\0')
      .update(bytes)
      .digest('hex');
  for (const [path, pin] of Object.entries(manifest.unchanged515.files))
    assert.equal(hash(readFileSync(path)), pin.oid, path);
});

test('denies loss of actual native-author Git source identity before output', () => {
  denied(
    run(
      "const q=await m.qualifyInvoiceGuardProposal();renameSync('.git','.git-held');try {q.check();} finally {renameSync('.git-held','.git');}",
    ),
  );
});

test('does not fall back to the older511 context when both approved native inputs are reverted', () => {
  const paths = Object.keys(manifest.nativeAuthor.paths);
  const originals = new Map(
    paths.map((path) => [path, readFileSync(join(image, path))]),
  );
  try {
    for (const path of paths)
      writeFileSync(
        join(image, path),
        readFileSync(join(image, directory + 'historical/' + path)),
      );
    denied(run('m.verifyCurrentPhysicalFrame();'));
  } finally {
    for (const [path, bytes] of originals)
      writeFileSync(join(image, path), bytes);
  }
});
