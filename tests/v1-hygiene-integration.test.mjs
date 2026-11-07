import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  admitHygiene,
  trackedSnapshot,
  validateTap,
  ports,
  author,
  parent,
} from '../scripts/v1-hygiene-integration.mjs';
const bad = (b) =>
  Buffer.concat([Buffer.from(b), Buffer.from('\n// unknown\n')]);
test('exact original hygiene bundle is source-only admission', () =>
  assert.deepEqual(admitHygiene(), {
    source_commit: author,
    source_only: true,
    business_authority: false,
    restoration: false,
  }));
for (const mode of [
  'missing-author',
  'wrong-parent',
  'merge-parent',
  'extra-delta',
  'executable',
  'ignore-drift',
  'doc-drift',
  'late-workflow',
])
  test(`rejects ${mode} instead of broadening original source controls`, () => {
    let workflowReads = 0;
    assert.throws(() =>
      admitHygiene({
        type: (c) =>
          c === author && mode === 'missing-author' ? 'blob' : ports.type(c),
        parent: (c) =>
          c === author && mode === 'wrong-parent'
            ? '0'.repeat(40)
            : c === author && mode === 'merge-parent'
              ? `${ports.parent(c)} ${parent}`
              : ports.parent(c),
        delta: (c) =>
          mode === 'extra-delta'
            ? ports.delta(c) + '\nM\tsrc/App.tsx'
            : ports.delta(c),
        mode: (c, f) =>
          c === author && f === '.gitignore' && mode === 'executable'
            ? '100755'
            : ports.mode(c, f),
        read: (f) => {
          if (f === '.github/workflows/v1-finance-artifact-hygiene.yml')
            workflowReads++;
          if (f === '.gitignore' && mode === 'ignore-drift')
            return Buffer.concat([ports.read(f), Buffer.from('\n/src/\n')]);
          if (
            f === 'docs/program/V1_FINANCE_ARTIFACT_HYGIENE.md' &&
            mode === 'doc-drift'
          )
            return bad(ports.read(f));
          if (
            f === '.github/workflows/v1-finance-artifact-hygiene.yml' &&
            mode === 'late-workflow' &&
            workflowReads > 1
          )
            return bad(ports.read(f));
          return ports.read(f);
        },
      }),
    );
  });
function fixture(ignore, run) {
  const root = mkdtempSync(join(tmpdir(), 'propel-hygiene-source-control-'));
  const git = (...args) =>
    execFileSync(
      'git',
      ['-c', 'core.excludesFile=/dev/null', '-C', root, ...args],
      { encoding: 'utf8' },
    ).trim();
  try {
    git('init', '-q');
    mkdirSync(join(root, 'src'));
    writeFileSync(
      join(root, 'src/example.ts'),
      'export const synthetic = true;\n',
    );
    writeFileSync(join(root, '.gitignore'), ignore);
    git('add', '.');
    git(
      '-c',
      'user.name=Synthetic source fixture',
      '-c',
      'user.email=source@example.invalid',
      'commit',
      '-qm',
      'Synthetic source fixture',
    );
    mkdirSync(join(root, 'artifacts/finance'), { recursive: true });
    return run(root, git);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test('original ignore omission leaves generated PNG dirty without altering source', () =>
  fixture(ports.git(parent, '.gitignore'), (root) => {
    writeFileSync(
      join(root, 'artifacts/finance/job-margin-fixture.png'),
      'synthetic artifact',
    );
    assert.throws(() => trackedSnapshot(root), /Clean source/);
  }));
test('exact new rule permits generated artifact while tracked code stays bound', () =>
  fixture(ports.read('.gitignore'), (root) => {
    writeFileSync(
      join(root, 'artifacts/finance/job-margin-fixture.png'),
      'synthetic artifact',
    );
    assert.deepEqual(Object.keys(trackedSnapshot(root)).sort(), [
      '.gitignore',
      'src/example.ts',
    ]);
  }));
test('assume-unchanged cannot conceal canonical tracked byte mutation', () =>
  fixture(ports.read('.gitignore'), (root, git) => {
    git('update-index', '--assume-unchanged', 'src/example.ts');
    writeFileSync(
      join(root, 'src/example.ts'),
      'export const synthetic = false;\n',
    );
    assert.equal(git('status', '--porcelain'), '');
    assert.throws(() => trackedSnapshot(root), /Every tracked byte/);
  }));
test('untracked non-PNG finance JSON remains visible and blocks clean-source acceptance', () =>
  fixture(ports.read('.gitignore'), (root) => {
    writeFileSync(join(root, 'artifacts/finance/unknown.json'), '{}');
    assert.throws(() => trackedSnapshot(root), /Clean source/);
  }));
test('tracked symlink is rejected even when its target is inside the fixture', () =>
  fixture(ports.read('.gitignore'), (root, git) => {
    symlinkSync('src/example.ts', join(root, 'alias.ts'));
    git('add', 'alias.ts');
    git(
      '-c',
      'user.name=Synthetic source fixture',
      '-c',
      'user.email=source@example.invalid',
      'commit',
      '-qm',
      'Synthetic symlink negative',
    );
    assert.throws(() => trackedSnapshot(root), /Regular tracked blob/);
  }));
const expectedNames = [
  'exact original hygiene bundle is source-only admission',
  'rejects missing-author instead of broadening original source controls',
  'rejects wrong-parent instead of broadening original source controls',
  'rejects merge-parent instead of broadening original source controls',
  'rejects extra-delta instead of broadening original source controls',
  'rejects executable instead of broadening original source controls',
  'rejects ignore-drift instead of broadening original source controls',
  'rejects doc-drift instead of broadening original source controls',
  'rejects late-workflow instead of broadening original source controls',
  'original ignore omission leaves generated PNG dirty without altering source',
  'exact new rule permits generated artifact while tracked code stays bound',
  'assume-unchanged cannot conceal canonical tracked byte mutation',
  'untracked non-PNG finance JSON remains visible and blocks clean-source acceptance',
  'tracked symlink is rejected even when its target is inside the fixture',
  'real zero TODO summary is accepted without treating it as a result annotation',
  'result TODO annotation is denied despite zero summary counters',
  'duplicate zero summary cannot mask inconsistent report structure',
  'inflated summary cannot replace a missing passing control',
  'primary ignore endpoint mutation during final doc read is denied',
];
const tap = () =>
  'TAP version 13\n' +
  expectedNames.map((name, i) => `ok ${i + 1} - ${name}\n`).join('') +
  '1..19\n# tests 19\n# pass 19\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
test('real zero TODO summary is accepted without treating it as a result annotation', () =>
  assert.deepEqual(validateTap(tap()), {
    passed: 19,
    scope: 'SOURCE_ONLY_NOT_WHOLE_FOUNDATION',
  }));
test('result TODO annotation is denied despite zero summary counters', () => {
  const original = tap(),
    mutated = original.replace(/^ok 1 - (.+)$/m, 'ok 1 - $1 # TODO pending');
  assert.notEqual(mutated, original);
  assert.throws(() => validateTap(mutated));
});
test('duplicate zero summary cannot mask inconsistent report structure', () => {
  assert.throws(() => validateTap(tap() + '# todo 0\n'));
});
test('inflated summary cannot replace a missing passing control', () => {
  assert.throws(() => validateTap(tap().replace(/^ok 19 - .+\n/m, '')));
});

test('primary ignore endpoint mutation during final doc read is denied', () => {
  let reads = 0,
    changed = false;
  assert.throws(
    () =>
      admitHygiene({
        read: (f) => {
          if (
            f === 'docs/program/V1_FINANCE_ARTIFACT_HYGIENE.md' &&
            ++reads === 2
          )
            changed = true;
          return f === '.gitignore' && changed
            ? bad(ports.read(f))
            : ports.read(f);
        },
      }),
    /Final fresh primary ignore endpoint/,
  );
});
