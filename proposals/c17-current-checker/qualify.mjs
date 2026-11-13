// UNAPPLIED checker qualification only. All mutations stay inside a disposable clone.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const author = '76ee5226c52a850d5f692c8aac965d0487e0f544';
const parent = '2c63cfd8175fe23d6c7f80a7879af9c73b27dceb';
const path = 'tests/cycle17-integration.test.ts';
const note = 'docs/program/V1_C17_FIELD_CLOSEOUT_SOURCE.md';
const checker = 'scripts/v1-c17-inventory-source.mjs';
const tests = 'tests/v1-c17-inventory-source.test.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const git = (...a) => execFileSync('git', ['--no-replace-objects', ...a]);
export function qualify() {
  assert.equal(
    git('show', '-s', '--format=%P', author).toString().trim(),
    parent,
  );
  assert.equal(
    git(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      author,
    )
      .toString()
      .trim(),
    `A\t${note}\nM\t${path}`,
  );
  for (const p of [path, note])
    assert.equal(
      git('ls-tree', author, '--', p).toString().split(' ')[0],
      '100644',
    );
  assert.equal(
    sha(git('diff', '--binary', parent, author, '--', path)),
    '0e309234f1186dcaeac6a6a2234fe825526666b9efb1016df405efeb382a297a',
  );
  assert.equal(
    sha(git('show', `${author}:${path}`)),
    '46747ffb4188b925fa2a64250be069a32e126fc72befac8918028f7594840d9a',
  );
  assert.equal(
    sha(git('show', `${author}:${note}`)),
    'd059a93942fe871a4af17d2f6ba207ee520c22a25d252b00300b68cd9b8537d4',
  );
  for (const [p, h] of [
    [
      checker,
      'e0ffeb3ba80b74474c0864ada76d531dcbb0e8c4d3f1ca299c0d59c5e3648f9e',
    ],
    [tests, '6e4ea84eaf1511a09c863a139adb06f947a2a9ee7539730cf2047e2c8c8b841c'],
  ]) {
    assert(lstatSync(p).isFile() && !lstatSync(p).isSymbolicLink());
    assert.equal(
      sha(readFileSync(p)),
      h,
      'Canonical admission stays unapplied',
    );
  }
  const patch = resolve('proposals/c17-current-checker/admission.patch');
  assert.equal(
    sha(readFileSync(patch)),
    '9688a87aa6d0f3bc8b3cbcf5b034d925a8389aae2dc0e3935c1f2a62bd144aa2',
  );
  const temp = mkdtempSync(join(tmpdir(), 'propel-c17-checker-'));
  try {
    execFileSync('git', [
      'clone',
      '--quiet',
      '--shared',
      '--no-checkout',
      process.cwd(),
      temp,
    ]);
    execFileSync('git', ['checkout', '--quiet', '--detach', author], {
      cwd: temp,
    });
    execFileSync('git', ['apply', patch], { cwd: temp });
    assert.equal(
      sha(readFileSync(join(temp, checker))),
      '076b4d234531d7c26524f1ef4e648f4c08145aabb691662643437f81b3863386',
    );
    assert.equal(
      sha(readFileSync(join(temp, tests))),
      '31045c49e82efe2fbcd86d56ba5d16ed98259dbf8a9b6619b4e1b77b02a0b448',
    );
    const extra = 'tests/v1-c17-field-closeout-source.test.mjs';
    assert.equal(
      sha(readFileSync(join(temp, extra))),
      'df616e9e4f192393e7fe30faed5a4b4394c12ddcb2ac4b0e94d65f9a00399cc2',
    );
    const old = git('show', `${author}:${checker}`).toString();
    const proposed = readFileSync(join(temp, checker), 'utf8');
    assert.equal(
      proposed.slice(proposed.indexOf('const directory =')),
      old.slice(old.indexOf('const directory =')),
      'Original CLI and strict31 controls remain byte-exact',
    );
    for (const [file, count] of [
      [tests, 31],
      [extra, 17],
    ]) {
      const r = spawnSync(
        process.execPath,
        ['--test', '--test-reporter=tap', file],
        { cwd: temp, encoding: 'utf8', maxBuffer: 1024 * 1024 },
      );
      assert.equal(r.status, 0, r.stdout + '\n' + r.stderr);
      for (const line of [
        `# tests ${count}`,
        `# pass ${count}`,
        '# fail 0',
        '# skipped 0',
      ])
        assert(r.stdout.split('\n').includes(line), line);
    }
    return {
      author,
      parent,
      passed: 48,
      failed: 0,
      skipped: 0,
      originalCases: 31,
      newCases: 17,
      admissionApplied: false,
      businessAuthority: false,
    };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(JSON.stringify(qualify(), null, 2));
