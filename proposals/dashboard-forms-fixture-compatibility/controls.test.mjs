import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  chmodSync,
  symlinkSync,
  renameSync,
  realpathSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root = process.cwd(),
  directory = 'proposals/dashboard-forms-fixture-compatibility/';
const parent = '5bf90478a853e34cfdb18cc6ed3a2b1c7ace25d5';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const owned = [],
  options = { concurrency: false, timeout: 30000 };
const packetFiles = [
  'README.md',
  'manifest.json',
  'current-fixture.mjs',
  'original-tests.txt',
  'historical-forms.ts.txt',
  'source-tests.proposed.txt',
  'fixture.patch',
  'controls.test.mjs',
];
const rows = execFileSync('git', ['ls-tree', '-rz', parent])
  .toString()
  .split('\0')
  .filter(Boolean)
  .map((row) => {
    const [left, path] = row.split('\t');
    return { path, mode: left.split(' ')[0], data: readFileSync(path) };
  });
assert.equal(rows.length, 2531);
function image() {
  const target = mkdtempSync(
    join(realpathSync(tmpdir()), 'propel-dashboard-fixture-'),
  );
  owned.push(target);
  for (const file of rows) {
    const path = join(target, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.data, {
      mode: file.mode === '100755' ? 0o755 : 0o644,
    });
  }
  for (const file of packetFiles) {
    const path = join(target, directory, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, readFileSync(directory + file), { mode: 0o644 });
  }
  return target;
}
async function load(target) {
  process.chdir(target);
  try {
    return await import(
      pathToFileURL(join(target, directory, 'current-fixture.mjs')).href
    );
  } finally {
    process.chdir(root);
  }
}
function change(target, path) {
  const file = join(target, path);
  writeFileSync(
    file,
    Buffer.concat([
      readFileSync(file),
      Buffer.from('\n// controlled unknown source\n'),
    ]),
  );
}
after(() => {
  process.chdir(root);
  for (const path of owned) rmSync(path, { recursive: true, force: true });
});

test(
  'qualifies only exact528 and projects only the sealed historical forms read',
  options,
  async () => {
    const target = image(),
      fixture = await load(target),
      frame = fixture.verifyCurrentDashboardFrame();
    assert.equal(frame.parent, parent);
    assert.equal(frame.tree, '7a86790dfb4164503348eefe0fdc5dd6f4f683a6');
    assert.equal(frame.files, 2531);
    assert.equal(frame.sourceAdmissionAuthorized, false);
    assert.equal(
      hash(fixture.dashboardSource('src/components/forms.tsx')),
      'f081edbdc36dad14c18bf75f25ac6267d1cb03d98124fece0618642193366e6a',
    );
    assert.equal(
      fixture.dashboardSource('src/App.tsx'),
      readFileSync(join(target, 'src/App.tsx'), 'utf8'),
    );
  },
);
test(
  'direct current forms retain approved hints/required selection and original shared behavior',
  options,
  async () => {
    const target = image(),
      fixture = await load(target);
    fixture.verifyCurrentDashboardFrame();
    const current = readFileSync(
        join(target, 'src/components/forms.tsx'),
        'utf8',
      ),
      historical = readFileSync(
        join(target, directory, 'historical-forms.ts.txt'),
        'utf8',
      );
    assert.equal(
      hash(current),
      '28dbd7d7e265a808779ed693e0c8c5de999e7465f3fbcf8d896df8acacb09f7d',
    );
    assert.ok(current.includes('const formId = useId();'));
    assert.equal(current.split('aria-describedby=').length - 1, 4);
    assert.equal(current.split('required={f.required}').length - 1, 3);
    const submit = (text) =>
      text.slice(
        text.indexOf('  function submit('),
        text.indexOf('  return ('),
      );
    assert.equal(submit(current), submit(historical));
    assert.equal(
      current.slice(current.indexOf('export function ResourceStatus')),
      historical.slice(historical.indexOf('export function ResourceStatus')),
    );
  },
);
test(
  'fresh exact proposed header qualifies without changing original test bodies or budgets',
  options,
  async () => {
    const target = image(),
      fixture = await load(target),
      original = readFileSync(
        join(target, directory, 'original-tests.txt'),
        'utf8',
      ),
      proposed = fixture.proposedTestBytes().toString();
    assert.equal(
      proposed.slice(proposed.indexOf('describe(')),
      original.slice(original.indexOf('describe(')),
    );
    assert.ok(
      proposed.includes(
        "const parent = '8f9cab9a6b42c057a12f1923bf35a514abc068b1';",
      ),
    );
    writeFileSync(
      join(target, 'tests/propel-dashboard-parity-source.test.ts'),
      proposed,
    );
    assert.equal(fixture.verifyCurrentDashboardFrame().header, 'proposed');
    assert.equal(
      fixture.dashboardSource('src/components/forms.tsx'),
      readFileSync(join(target, directory, 'historical-forms.ts.txt'), 'utf8'),
    );
    assert.ok(
      readFileSync(join(target, 'vite.config.ts'), 'utf8').includes(
        'testTimeout: 30000',
      ),
    );
    assert.ok(
      readFileSync(join(target, 'vite.config.ts'), 'utf8').includes(
        'hookTimeout: 30000',
      ),
    );
  },
);
for (const path of [
  'src/components/forms.tsx',
  'src/App.tsx',
  'src/components/CompanyOperations.tsx',
  'server/invoices/commercial-drafts.proposed.sql',
  'tests/invoice-guard-admission-proposal.test.ts',
  'tests/database/property.test.ts',
  'tests/helpers/property-p1-fixture.ts',
  'src/styles.css',
])
  test(
    'denies unknown current source before any historical projection: ' + path,
    options,
    async () => {
      const target = image(),
        fixture = await load(target);
      change(target, path);
      assert.throws(
        () => fixture.dashboardSource('src/components/forms.tsx'),
        /Exact approved/,
      );
    },
  );
test('denies an unexpected source companion', options, async () => {
  const target = image(),
    fixture = await load(target);
  writeFileSync(
    join(target, 'src/unknown-source.ts'),
    'throw Error("never execute")',
  );
  assert.throws(() => fixture.verifyCurrentDashboardFrame(), /Exact approved/);
});
test('denies an unexpected empty source directory', options, async () => {
  const target = image(),
    fixture = await load(target);
  mkdirSync(join(target, 'src/unknown-empty'));
  assert.throws(() => fixture.verifyCurrentDashboardFrame(), /Exact approved/);
});
test(
  'denies group-writable source and executable-mode substitution',
  options,
  async () => {
    const target = image(),
      fixture = await load(target),
      path = join(target, 'src/App.tsx');
    chmodSync(path, 0o664);
    assert.throws(
      () => fixture.verifyCurrentDashboardFrame(),
      /Exact approved/,
    );
    chmodSync(path, 0o755);
    assert.throws(
      () => fixture.verifyCurrentDashboardFrame(),
      /Exact approved/,
    );
  },
);
test(
  'denies a source symlink even if the bytes are preserved',
  options,
  async () => {
    const target = image(),
      fixture = await load(target),
      path = join(target, 'src/App.tsx');
    renameSync(path, path + '.saved');
    symlinkSync(path + '.saved', path);
    assert.throws(
      () => fixture.verifyCurrentDashboardFrame(),
      /Exact approved/,
    );
  },
);
for (const path of [
  'manifest.json',
  'historical-forms.ts.txt',
  'original-tests.txt',
  'source-tests.proposed.txt',
  'fixture.patch',
  'current-fixture.mjs',
  'controls.test.mjs',
  'README.md',
])
  test('denies packet substitution: ' + path, options, async () => {
    const target = image(),
      fixture = await load(target);
    change(target, directory + path);
    assert.throws(
      () => fixture.dashboardSource('src/components/forms.tsx'),
      /Exact approved/,
    );
  });
test(
  'cached readers deny later current source withdrawal',
  options,
  async () => {
    const target = image(),
      fixture = await load(target);
    fixture.dashboardSource('src/components/forms.tsx');
    change(target, 'src/App.tsx');
    assert.throws(
      () => fixture.dashboardSource('src/components/forms.tsx'),
      /Exact approved/,
    );
  },
);
test(
  'a captured original-header context cannot transition to the proposed header',
  options,
  async () => {
    const target = image(),
      fixture = await load(target);
    fixture.verifyCurrentDashboardFrame();
    writeFileSync(
      join(target, 'tests/propel-dashboard-parity-source.test.ts'),
      fixture.proposedTestBytes(),
    );
    assert.throws(
      () => fixture.verifyCurrentDashboardFrame(),
      /Exact approved/,
    );
  },
);
test(
  'the reader has no arbitrary path or alternate historical source port',
  options,
  async () => {
    const target = image(),
      fixture = await load(target);
    assert.throws(
      () => fixture.dashboardSource('../outside'),
      /Exact approved/,
    );
    assert.throws(
      () =>
        fixture.dashboardSource(
          'server/invoices/commercial-drafts.proposed.sql',
        ),
      /Exact approved/,
    );
  },
);
