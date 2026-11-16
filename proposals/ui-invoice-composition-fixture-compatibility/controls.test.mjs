import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  cpSync,
  readFileSync,
  writeFileSync,
  rmSync,
  chmodSync,
  unlinkSync,
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = process.cwd();
const directory = 'proposals/ui-invoice-composition-fixture-compatibility/';
const historicalDirectory =
  'proposals/ui-invoice-native-fixture-compatibility/';
const manifest = JSON.parse(readFileSync(directory + 'physical-frame.json'));
let image;
before(() => {
  image = mkdtempSync(join(tmpdir(), 'ui520-composition-controls-'));
  execFileSync('git', ['clone', '--shared', '--no-hardlinks', root, image], {
    stdio: 'pipe',
  });
  execFileSync('git', ['-C', image, 'switch', '--detach', manifest.base], {
    stdio: 'pipe',
  });
  cpSync(directory, join(image, directory), { recursive: true });
  for (const path of Object.keys(manifest.uiPaths)) {
    mkdirSync(dirname(join(image, path)), { recursive: true });
    writeFileSync(
      join(image, path),
      readFileSync(directory + 'ui-after/' + path + '.txt'),
    );
    chmodSync(join(image, path), 0o644);
  }
});
after(() => rmSync(image, { recursive: true, force: true }));
function run(code) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {readFileSync,writeFileSync,unlinkSync,chmodSync} from 'node:fs';import {execFileSync} from 'node:child_process';const m=await import('./${directory}current-fixture.mjs');${code}`,
    ],
    { cwd: image, encoding: 'utf8' },
  );
}
function changes(rows, code = 'm.verifyCurrentPhysicalFrame();') {
  const saved = rows.map(([path]) => [path, readFileSync(join(image, path))]);
  try {
    for (const [path, body] of rows) writeFileSync(join(image, path), body);
    return run(code);
  } finally {
    for (const [path, body] of saved) writeFileSync(join(image, path), body);
  }
}
function denied(result) {
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /Exact sealed invoice guard proposal required/);
}
const baseBody = (path) => readFileSync(join(root, path));
test('qualifies only the exact520 plus eleven-path UI frame while preserving current native inputs', () => {
  const result = run(
    'const q=await m.qualifyInvoiceGuardProposal();console.log(JSON.stringify({frame:m.verifyCurrentPhysicalFrame(),parent:q.check().sourceAuthor,authorized:q.admissionAuthorized}));',
  );
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.frame.context, 'ui-composition');
  assert.equal(value.frame.files, 2510);
  assert.equal(value.parent, '5f0f17dc9766411b260d5b53fd2db5a925adc80f');
  assert.equal(value.authorized, false);
});
test('preserves520 original39 assertion tail and the original budgets exactly', () => {
  const before = readFileSync(directory + 'original-tests.txt', 'utf8');
  const after = readFileSync(directory + 'source-tests.proposed.txt', 'utf8');
  const marker = "\nconst dir = 'proposals/invoice-guard-admission/';";
  assert.equal(
    after.slice(after.indexOf(marker)),
    before.slice(before.indexOf(marker)),
  );
  assert.equal(
    createHash('sha256').update(before).digest('hex'),
    manifest.approved520.headerSha256,
  );
  assert.equal(
    manifest.rows['vite.config.ts'].oid,
    createHash('sha1')
      .update('blob ' + readFileSync('vite.config.ts').length + '\0')
      .update(readFileSync('vite.config.ts'))
      .digest('hex'),
  );
});
for (const path of [
  'src/components/forms.tsx',
  'src/components/CompanyOperations.tsx',
]) {
  test(`rejects a known older UI body mixed into the intended frame at ${path}`, () =>
    denied(changes([[path, baseBody(path)]])));
}
function rollbackUi(code) {
  const saved = Object.keys(manifest.uiPaths).map((path) => [
    path,
    readFileSync(join(image, path)),
  ]);
  try {
    for (const [path, pin] of Object.entries(manifest.uiPaths)) {
      if (pin.before === null) unlinkSync(join(image, path));
      else writeFileSync(join(image, path), baseBody(path));
    }
    return run(code);
  } finally {
    for (const [path, body] of saved) {
      writeFileSync(join(image, path), body);
      chmodSync(join(image, path), 0o644);
    }
  }
}
test('qualifies the exact approved520 frame as a fresh separate header-author stage', () => {
  const result = rollbackUi(
    'const q=await m.qualifyInvoiceGuardProposal();console.log(JSON.stringify({context:m.verifyCurrentPhysicalFrame().context,parent:q.check().sourceAuthor,authorized:q.admissionAuthorized}));',
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    context: 'approved520',
    parent: '5f0f17dc9766411b260d5b53fd2db5a925adc80f',
    authorized: false,
  });
});
test('rejects complete UI withdrawal after capturing the UI context instead of falling back to520', () => {
  const saved = Object.keys(manifest.uiPaths).map((path) => [
    path,
    readFileSync(join(image, path)),
  ]);
  try {
    denied(
      run(
        `const q=await m.qualifyInvoiceGuardProposal();const manifest=JSON.parse(readFileSync('${directory}physical-frame.json'));for(const [path,pin]of Object.entries(manifest.uiPaths)){if(pin.before===null)unlinkSync(path);else writeFileSync(path,execFileSync('git',['show',manifest.base+':'+path]));}q.check();`,
      ),
    );
  } finally {
    for (const [path, body] of saved) {
      writeFileSync(join(image, path), body);
      chmodSync(join(image, path), 0o644);
    }
  }
});
test('rejects a complete UI transition after capturing the approved520 context', () => {
  denied(
    rollbackUi(
      `const q=await m.qualifyInvoiceGuardProposal();const manifest=JSON.parse(readFileSync('${directory}physical-frame.json'));for(const path of Object.keys(manifest.uiPaths)){writeFileSync(path,readFileSync('${directory}ui-after/'+path+'.txt'));chmodSync(path,0o644);}q.check();`,
    ),
  );
});
test('rejects an unknown edit to an otherwise admitted UI path', () => {
  const path = 'src/components/forms.tsx';
  denied(
    changes([
      [
        path,
        Buffer.concat([
          readFileSync(join(image, path)),
          Buffer.from('\n// unknown UI edit\n'),
        ]),
      ],
    ]),
  );
});
test('rejects unknown source companions in the composed UI frame', () => {
  const path = join(image, 'src/unapproved-ui.ts');
  try {
    writeFileSync(path, 'export const unknown=true;');
    denied(run('m.verifyCurrentPhysicalFrame();'));
  } finally {
    unlinkSync(path);
  }
});
test('denies full native-input reversion while the approved UI afterimage remains present', () => {
  const rows = Object.keys(manifest.nativeAuthor.paths).map((path) => [
    path,
    readFileSync(join(image, historicalDirectory + 'historical/' + path)),
  ]);
  denied(changes(rows));
});
for (const path of [
  'tests/database/property.test.ts',
  'server/invoices/commercial-drafts.proposed.sql',
  'server/customer/broker-auth.ts',
]) {
  test(`denies unknown native, SQL or Auth source in the new exact frame at ${path}`, () =>
    denied(
      changes(
        [
          [
            path,
            Buffer.concat([
              readFileSync(join(image, path)),
              Buffer.from('\n// unapproved source\n'),
            ]),
          ],
        ],
        'await m.qualifyInvoiceGuardProposal();',
      ),
    ));
}
test('denies coordinated UI source edits and matching manifest rebinding', () => {
  const path = 'src/components/forms.tsx';
  const changed = Buffer.concat([
    readFileSync(join(image, path)),
    Buffer.from('\n// rebound UI source\n'),
  ]);
  const changedOid = createHash('sha1')
    .update('blob ' + changed.length + '\0')
    .update(changed)
    .digest('hex');
  const json = readFileSync(
    join(image, directory + 'physical-frame.json'),
    'utf8',
  ).replace(manifest.uiPaths[path].after.blob, changedOid);
  denied(
    changes(
      [
        [path, changed],
        [directory + 'physical-frame.json', Buffer.from(json)],
      ],
      'await m.qualifyInvoiceGuardProposal();',
    ),
  );
});
for (const path of [
  directory + 'physical-frame.json',
  directory + 'current-fixture.mjs',
  'scripts/invoice-caller-source-admission.mjs',
  historicalDirectory + 'current-fixture.mjs',
]) {
  test(`rechecks late manifest or helper withdrawal before output at ${path}`, () => {
    const body = readFileSync(join(image, path));
    try {
      denied(
        run(
          `const q=await m.qualifyInvoiceGuardProposal();writeFileSync('${path}','unknown late withdrawal');q.check();`,
        ),
      );
    } finally {
      writeFileSync(join(image, path), body);
    }
  });
}
test('rechecks the exact new UI source after a trusted helper metadata callback', () => {
  const path = 'src/components/forms.tsx';
  const body = readFileSync(join(image, path));
  try {
    const result = run(
      `const q=await m.qualifyInvoiceGuardProposal();let touched=false;try {q.helper.verifyInvoiceGuardFrame({readCurrent:q.readCurrent,metadata:(command,...args)=>{touched=true;writeFileSync('${path}','unknown callback UI withdrawal');return execFileSync('git',[command,...args]);}});}catch(error){console.log(JSON.stringify({touched}));throw error;}`,
    );
    denied(result);
    assert.equal(JSON.parse(result.stdout).touched, true);
  } finally {
    writeFileSync(join(image, path), body);
  }
});
test('the new proposed header authenticates its exact fixture bytes before evaluation', () => {
  const payload = readFileSync(directory + 'source-tests.proposed.txt', 'utf8');
  const start = payload.indexOf('await (async () => {');
  const end = payload.indexOf('})()', start) + 5;
  const expression = payload.slice(start, end);
  const path = join(image, directory + 'current-fixture.mjs');
  const body = readFileSync(path);
  try {
    writeFileSync(
      path,
      'globalThis.UNREVIEWED_COMPOSITION_FIXTURE=true;\n' + body,
    );
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';try{const url=${expression};await import(url);}catch(error){console.log(JSON.stringify({message:error.message,executed:globalThis.UNREVIEWED_COMPOSITION_FIXTURE===true}));}`,
      ],
      { cwd: image, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      message: 'Exact sealed invoice guard proposal required',
      executed: false,
    });
  } finally {
    writeFileSync(path, body);
  }
});

test('denies native-input full reversion in the fresh approved520 context as well', () => {
  const nativePaths = Object.keys(manifest.nativeAuthor.paths);
  const saved = nativePaths.map((path) => [
    path,
    readFileSync(join(image, path)),
  ]);
  try {
    const result = rollbackUi(
      `const manifest=JSON.parse(readFileSync('${directory}physical-frame.json'));for(const path of Object.keys(manifest.nativeAuthor.paths))writeFileSync(path,readFileSync('${historicalDirectory}historical/'+path));m.verifyCurrentPhysicalFrame();`,
    );
    denied(result);
  } finally {
    for (const [path, body] of saved) writeFileSync(join(image, path), body);
  }
});
