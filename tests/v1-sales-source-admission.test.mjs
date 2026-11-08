import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  admitSalesSuccessor,
  validateSalesPublishedSource,
  validateHistoryWorkflow,
  trackedSnapshot,
  validateTap,
  ports,
  publisher,
  author,
  predecessor,
  nativePath,
  oldFiles,
  authored,
} from '../scripts/v1-sales-source-admission.mjs';
const pkg = () =>
  JSON.parse(readFileSync('docs/program/CYCLE8_DELIVERY_INDEX.json'))
    .packages[2];
const current = () => ports.read(nativePath);
const previous = () => ports.git(predecessor, nativePath);
const bad = (b) =>
  Buffer.concat([Buffer.from(b), Buffer.from('\n// unknown source\n')]);
const hash = (b) => createHash('sha256').update(b).digest('hex');
const modes = [
  'wrong-path',
  'wrong-publisher',
  'forged-native-pin',
  'forged-companion-pin',
  'missing-publisher',
  'wrong-publisher-parent',
  'wrong-publisher-delta',
  'old-native-mode',
  'old-companion-mode',
  'missing-author',
  'wrong-author-parent',
  'merge-author-parent',
  'extra-author-delta',
  'missing-author-companion',
  'new-native-mode',
  'new-companion-mode',
  'wrong-predecessor',
  'unknown-native',
  'original-companion-drift',
  'new-test-drift',
  'new-doc-drift',
  'new-workflow-drift',
  'late-authored-workflow',
  'late-original-companion',
  'late-native-through-doc',
  'wrong-logical-baseline',
  'initial-native-drift',
];
test('exact complete Sales successor retains source-only false-authority receipt', () => {
  const r = admitSalesSuccessor(nativePath, current(), previous(), pkg());
  assert.deepEqual(r, {
    path: nativePath,
    source_commit: author,
    original_publisher: publisher,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  });
});
test('literal historical Sales bytes remain valid with original metadata', () => {
  const old = previous();
  assert.equal(
    validateSalesPublishedSource(oldFiles[0], old, pkg(), {
      read: (f) => (f === nativePath ? old : ports.read(f)),
    }),
    undefined,
  );
});
for (const mode of modes)
  test('rejects ' + mode + ' without changing original pins', () => {
    const meta = pkg();
    let value = current(),
      original = previous(),
      path = nativePath,
      workflowReads = 0,
      companionReads = 0,
      docReads = 0,
      endpointChanged = false;
    if (mode === 'wrong-path') path = 'src/lib/workflows/unknown-sales.ts';
    if (mode === 'wrong-publisher') meta.head_commit = '0'.repeat(40);
    if (mode === 'wrong-logical-baseline') meta.parent_commit = '0'.repeat(40);
    if (mode === 'forged-native-pin') meta.owned_files[0].sha256 = hash(value);
    if (mode === 'forged-companion-pin')
      meta.owned_files[1].sha256 = '0'.repeat(64);
    if (mode === 'wrong-predecessor') original = bad(original);
    if (mode === 'unknown-native') value = bad(value);
    const p = {
      type: (c) =>
        (c === publisher && mode === 'missing-publisher') ||
        (c === author && mode === 'missing-author')
          ? 'blob'
          : ports.type(c),
      parent: (c) =>
        c === publisher && mode === 'wrong-publisher-parent'
          ? '0'.repeat(40)
          : c === author && mode === 'wrong-author-parent'
            ? '0'.repeat(40)
            : c === author && mode === 'merge-author-parent'
              ? predecessor + ' ' + publisher
              : ports.parent(c),
      delta: (c) =>
        c === publisher && mode === 'wrong-publisher-delta'
          ? ports.delta(c) + '\nM\tsrc/App.tsx'
          : c === author && mode === 'extra-author-delta'
            ? ports.delta(c) + '\nM\tsrc/App.tsx'
            : c === author && mode === 'missing-author-companion'
              ? 'M\t' + nativePath
              : ports.delta(c),
      mode: (c, f) =>
        (c === publisher &&
          ((mode === 'old-native-mode' && f === nativePath) ||
            (mode === 'old-companion-mode' && f === oldFiles[1].path))) ||
        (c === author &&
          ((mode === 'new-native-mode' && f === nativePath) ||
            (mode === 'new-companion-mode' && f === authored[1])))
          ? '100755'
          : ports.mode(c, f),
      read: (f) => {
        if (f === authored[3]) workflowReads++;
        if (f === oldFiles[1].path) companionReads++;
        if (
          f === oldFiles[4].path &&
          ++docReads === 2 &&
          mode === 'late-native-through-doc'
        )
          endpointChanged = true;
        if (
          f === nativePath &&
          (mode === 'initial-native-drift' || endpointChanged)
        )
          return bad(ports.read(f));
        if (mode === 'original-companion-drift' && f === oldFiles[1].path)
          return bad(ports.read(f));
        if (
          (mode === 'new-test-drift' && f === authored[1]) ||
          (mode === 'new-doc-drift' && f === authored[2]) ||
          (mode === 'new-workflow-drift' && f === authored[3])
        )
          return bad(ports.read(f));
        if (
          (mode === 'late-authored-workflow' &&
            f === authored[3] &&
            workflowReads > 1) ||
          (mode === 'late-original-companion' &&
            f === oldFiles[1].path &&
            companionReads > 1)
        )
          return bad(ports.read(f));
        return ports.read(f);
      },
    };
    const pattern =
      /original C8|historical publisher|five original|exact Sales native|Sales predecessor|sole-a415|authored bundle|successor denied|Sales companions|Fresh authored|Fresh original|Final fresh/;
    assert.throws(
      () =>
        mode.startsWith('forged-') ||
        mode === 'wrong-publisher' ||
        mode === 'wrong-logical-baseline'
          ? validateSalesPublishedSource(meta.owned_files[0], value, meta, p)
          : admitSalesSuccessor(path, value, original, meta, p),
      pattern,
    );
  });
for (const n of [8, 9])
  test('C' + n + ' workflow changes only full-history checkout', () => {
    const f = '.github/workflows/cycle' + n + '-integration.yml';
    assert.equal(validateHistoryWorkflow(f, readFileSync(f)), undefined);
  });
test('workflow budget or selector drift is denied rather than admitted', () => {
  const f = '.github/workflows/cycle8-integration.yml';
  assert.throws(
    () =>
      validateHistoryWorkflow(
        f,
        Buffer.concat([
          readFileSync(f),
          Buffer.from('\n# unknown selector/budget\n'),
        ]),
      ),
    /Only exact full-history/,
  );
});
const titles = [
  'exact complete Sales successor retains source-only false-authority receipt',
  'literal historical Sales bytes remain valid with original metadata',
  ...modes.map((m) => 'rejects ' + m + ' without changing original pins'),
  'C8 workflow changes only full-history checkout',
  'C9 workflow changes only full-history checkout',
  'workflow budget or selector drift is denied rather than admitted',
  'exact control title identities and zero summaries are accepted',
  'renamed control identity is denied despite unchanged counts',
  'SKIP and TODO result annotations are denied with zero summaries',
  'missing zero failure counter cannot be accepted',
  'duplicate zero summary cannot mask report ambiguity',
  'missing passing row cannot be replaced by the summary',
  'assume-unchanged cannot hide a mutated tracked source byte',
  'untracked source additions cannot enter clean-source evidence',
  'actual original C8 consumer admits only the complete reviewed Sales bundle',
  'equal historical native cannot bypass any changed current original companion',
  'changed or extra original package metadata is denied before equality',
];
const tap = () =>
  'TAP version 13\n' +
  titles.map((t, i) => 'ok ' + (i + 1) + ' - ' + t + '\n').join('') +
  '1..43\n# tests 43\n# pass 43\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
test(titles[32], () =>
  assert.deepEqual(validateTap(tap()), {
    passed: 43,
    scope: 'SOURCE_ONLY_NOT_WHOLE_FOUNDATION',
  }),
);
test(titles[33], () =>
  assert.throws(
    () =>
      validateTap(tap().replace(/^ok 1 - .+$/m, 'ok 1 - unrelated control')),
    /literal passing/,
  ),
);
test(titles[34], () => {
  for (const annotation of ['SKIP', 'TODO'])
    assert.throws(
      () =>
        validateTap(
          tap().replace(
            /^ok 1 - (.+)$/m,
            'ok 1 - $1 # ' + annotation + ' controlled',
          ),
        ),
      /literal passing/,
    );
});
test(titles[35], () =>
  assert.throws(
    () => validateTap(tap().replace('# fail 0\n', '')),
    /zero-error summary/,
  ),
);
test(titles[36], () =>
  assert.throws(() => validateTap(tap() + '# todo 0\n'), /zero-error summary/),
);
test(titles[37], () =>
  assert.throws(
    () => validateTap(tap().replace(/^ok 43 - .+\n/m, '')),
    /literal passing/,
  ),
);
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'propel-sales-source-fixture-')),
    env = {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    };
  for (const key of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_COMMON_DIR',
    'GIT_INDEX_FILE',
    'GIT_CONFIG_COUNT',
  ])
    delete env[key];
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '--no-replace-objects',
        '-c',
        'core.excludesFile=/dev/null',
        '-C',
        root,
        ...args,
      ],
      { env, encoding: 'utf8' },
    ).trim();
  try {
    git('init', '-q');
    writeFileSync(join(root, 'source.txt'), 'original synthetic source\n');
    git('add', '.');
    git(
      '-c',
      'user.name=Synthetic fixture',
      '-c',
      'user.email=source@example.invalid',
      'commit',
      '-qm',
      'synthetic fixture',
    );
    return run(root, git);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test(titles[38], () =>
  fixture((root, git) => {
    git('update-index', '--assume-unchanged', 'source.txt');
    writeFileSync(join(root, 'source.txt'), 'unknown source\n');
    assert.equal(git('status', '--porcelain'), '');
    assert.throws(() => trackedSnapshot(root), /Every tracked byte/);
  }),
);
test(titles[39], () =>
  fixture((root) => {
    writeFileSync(join(root, 'unknown.json'), '{}');
    assert.throws(() => trackedSnapshot(root), /Clean source/);
  }),
);

test(titles[40], () => {
  const output = execFileSync(
    process.execPath,
    ['scripts/check-cycle8-integrity.mjs'],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 },
  );
  assert.match(
    output,
    /Cycle8: 6 exact draft packages \/ 30 disjoint source files PASS/,
  );
});

test(titles[41], () => {
  const old = previous();
  for (const companion of oldFiles.slice(1))
    assert.throws(
      () =>
        validateSalesPublishedSource(oldFiles[0], old, pkg(), {
          read: (f) =>
            f === nativePath
              ? old
              : f === companion.path
                ? bad(ports.read(f))
                : ports.read(f),
        }),
      /Current original Sales companions required before equality/,
    );
});

test(titles[42], () => {
  for (const change of [
    { status: 'UNREVIEWED_STATUS' },
    { focused_new_tests: 0 },
    { extra_source_field: true },
    { package: 'Unknown package' },
    { owner: 'Unknown owner' },
  ]) {
    let consulted = false;
    assert.throws(
      () =>
        validateSalesPublishedSource(
          oldFiles[0],
          previous(),
          { ...pkg(), ...change },
          {
            type: (commit) => {
              consulted = true;
              return ports.type(commit);
            },
          },
        ),
      /Exact original C8 Sales publisher/,
    );
    assert.equal(consulted, false);
  }
});
