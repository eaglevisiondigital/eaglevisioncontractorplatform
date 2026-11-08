import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  admitFieldSuccessor,
  validateFieldPublishedSource,
  validateCandidateProfile,
  validateTap,
  trackedSnapshot,
  ports,
  publisher,
  author,
  predecessor,
  nativePath,
  oldFiles,
  authored,
  paths,
  fieldControlCount,
  fieldControlIdentitySha256,
} from '../scripts/v1-field-source-admission.mjs';
import { validateCycle16Manifest } from '../scripts/check-cycle16-integrity.mjs';
import { readCycle13File } from '../scripts/check-cycle13-integrity.mjs';
const pkg = () =>
  JSON.parse(readFileSync('docs/program/CYCLE16_DELIVERY_INDEX.json'))
    .packages[0];
const current = () => Buffer.from(ports.read(nativePath));
const previous = () => Buffer.from(ports.git(predecessor, nativePath));
const bad = (bytes) =>
  Buffer.concat([Buffer.from(bytes), Buffer.from('\n// unreviewed source\n')]);
const sameLength = (bytes) => {
  const b = Buffer.from(bytes);
  b[0] ^= 1;
  return b;
};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
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
  'old-published-blob',
  'same-length-old-blob',
  'missing-author',
  'wrong-author-parent',
  'merge-author-parent',
  'extra-author-delta',
  'missing-author-companion',
  'new-native-mode',
  'new-companion-mode',
  'wrong-predecessor',
  'predecessor-mode',
  'predecessor-companion-drift',
  'unknown-native',
  'same-length-unknown-native',
  'original-companion-drift',
  'new-test-drift',
  'new-doc-drift',
  'new-workflow-drift',
  'late-authored-workflow',
  'late-original-companion',
  'late-native-through-old-doc',
  'late-native-through-new-doc',
  'wrong-logical-baseline',
  'initial-native-drift',
  'mutated-current-buffer',
  'mutated-previous-buffer',
];
const titles = [
  'exact complete daily Field successor returns source-only false-authority receipt',
  'literal historical Field native remains valid with all original companions',
  'rejects wrong-path while preserving original Field pins',
  'rejects wrong-publisher while preserving original Field pins',
  'rejects forged-native-pin while preserving original Field pins',
  'rejects forged-companion-pin while preserving original Field pins',
  'rejects missing-publisher while preserving original Field pins',
  'rejects wrong-publisher-parent while preserving original Field pins',
  'rejects wrong-publisher-delta while preserving original Field pins',
  'rejects old-native-mode while preserving original Field pins',
  'rejects old-companion-mode while preserving original Field pins',
  'rejects old-published-blob while preserving original Field pins',
  'rejects same-length-old-blob while preserving original Field pins',
  'rejects missing-author while preserving original Field pins',
  'rejects wrong-author-parent while preserving original Field pins',
  'rejects merge-author-parent while preserving original Field pins',
  'rejects extra-author-delta while preserving original Field pins',
  'rejects missing-author-companion while preserving original Field pins',
  'rejects new-native-mode while preserving original Field pins',
  'rejects new-companion-mode while preserving original Field pins',
  'rejects wrong-predecessor while preserving original Field pins',
  'rejects predecessor-mode while preserving original Field pins',
  'rejects predecessor-companion-drift while preserving original Field pins',
  'rejects unknown-native while preserving original Field pins',
  'rejects same-length-unknown-native while preserving original Field pins',
  'rejects original-companion-drift while preserving original Field pins',
  'rejects new-test-drift while preserving original Field pins',
  'rejects new-doc-drift while preserving original Field pins',
  'rejects new-workflow-drift while preserving original Field pins',
  'rejects late-authored-workflow while preserving original Field pins',
  'rejects late-original-companion while preserving original Field pins',
  'rejects late-native-through-old-doc while preserving original Field pins',
  'rejects late-native-through-new-doc while preserving original Field pins',
  'rejects wrong-logical-baseline while preserving original Field pins',
  'rejects initial-native-drift while preserving original Field pins',
  'rejects mutated-current-buffer while preserving original Field pins',
  'rejects mutated-previous-buffer while preserving original Field pins',
  'every original package field and extra key is denied before Git or equality',
  'forged endpoint metadata cannot exploit the legacy equality branch',
  'equal historical Field native cannot bypass any current original companion',
  'legacy final old-doc read cannot conceal a changed native buffer',
  'exact source-only candidate and same-tree carrier facts are accepted',
  'unknown313 and316 parentage cannot enter the standalone source profile',
  'extra modified files cannot enter the six-path standalone profile',
  'wrong carrier parents or source tree cannot enter standalone evidence',
  'candidate identifiers must be complete actual-shaped source identities',
  'exact control titles and explicit zero counters are accepted',
  'renamed or duplicate control title cannot be masked by matching counts',
  'SKIP or TODO annotations are denied with zero summary counters',
  'missing or duplicate zero counters deny the report',
  'missing row or not-ok result cannot be replaced by a passing summary',
  'assume-unchanged cannot hide same-length tracked source mutation',
  'untracked source additions cannot enter clean source evidence',
  'working tree symlinks and executable-mode changes cannot hide behind index flags',
  'actual original C16 consumer admits only the complete reviewed bundle',
  'actual original C16 consumer rejects forged current-hash metadata before equality',
  'actual original C16 consumer preserves an injected workflow denial',
  'published Field successor cannot conceal initially changed buffers during companion reads',
  'initial input capture precedes every supplied package callback',
];
test(titles[0], () =>
  assert.deepEqual(
    admitFieldSuccessor(nativePath, current(), previous(), pkg()),
    {
      path: nativePath,
      source_commit: author,
      original_publisher: publisher,
      authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
      business_authority: false,
      restore_adapter: false,
    },
  ),
);
test(titles[1], () => {
  const old = previous();
  assert.equal(
    validateFieldPublishedSource(oldFiles[0], old, pkg(), {
      read: (f) => (f === nativePath ? old : ports.read(f)),
    }),
    undefined,
  );
});
for (const mode of modes)
  test('rejects ' + mode + ' while preserving original Field pins', () => {
    const meta = pkg();
    let path = nativePath,
      value = current(),
      prior = previous(),
      workflowReads = 0,
      companionReads = 0,
      docReads = 0,
      newDocReads = 0,
      changed = false,
      mutated = false;
    if (mode === 'wrong-path') path = 'src/lib/workflows/unknown-field.ts';
    if (mode === 'wrong-publisher') meta.head_commit = '0'.repeat(40);
    if (mode === 'wrong-logical-baseline') meta.parent_commit = '0'.repeat(40);
    if (mode === 'forged-native-pin') meta.owned_files[0].sha256 = hash(value);
    if (mode === 'forged-companion-pin')
      meta.owned_files[1].sha256 = '0'.repeat(64);
    if (mode === 'wrong-predecessor') prior = bad(prior);
    if (mode === 'unknown-native') value = bad(value);
    if (mode === 'same-length-unknown-native') value = sameLength(value);
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
            (mode === 'new-companion-mode' && f === authored[1]))) ||
        (c === predecessor && mode === 'predecessor-mode' && f === nativePath)
          ? '100755'
          : ports.mode(c, f),
      git: (c, f) =>
        c === publisher &&
        f === oldFiles[1].path &&
        mode === 'old-published-blob'
          ? bad(ports.git(c, f))
          : c === publisher &&
              f === oldFiles[1].path &&
              mode === 'same-length-old-blob'
            ? sameLength(ports.git(c, f))
            : c === predecessor &&
                f === oldFiles[1].path &&
                mode === 'predecessor-companion-drift'
              ? bad(ports.git(c, f))
              : ports.git(c, f),
      read: (f) => {
        if (f === authored[3]) workflowReads++;
        if (f === oldFiles[1].path) companionReads++;
        if (
          f === oldFiles[4].path &&
          ++docReads === 2 &&
          mode === 'late-native-through-old-doc'
        )
          changed = true;
        if (
          f === authored[2] &&
          ++newDocReads === 2 &&
          mode === 'late-native-through-new-doc'
        )
          changed = true;
        if (
          f === authored[2] &&
          mode === 'mutated-current-buffer' &&
          !mutated
        ) {
          value[0] ^= 1;
          mutated = true;
        }
        if (
          f === authored[2] &&
          mode === 'mutated-previous-buffer' &&
          !mutated
        ) {
          prior[0] ^= 1;
          mutated = true;
        }
        if (f === nativePath && (changed || mode === 'initial-native-drift'))
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
    assert.throws(
      () =>
        mode.startsWith('forged-') ||
        mode === 'wrong-publisher' ||
        mode === 'wrong-logical-baseline'
          ? validateFieldPublishedSource(meta.owned_files[0], value, meta, p)
          : admitFieldSuccessor(path, value, prior, meta, p),
      /Literal original Field|original C16|historical Field|five original|exact daily Field|Field predecessor|sole311|Field authored bundle|successor denied|Field companions|Field endpoint|supplied buffers/,
    );
  });
let cursor = 2 + modes.length;
test(titles[cursor++], () => {
  for (const key of Object.keys(pkg()).filter((k) => k !== 'owned_files')) {
    const meta = pkg();
    meta[key] = typeof meta[key] === 'number' ? -1 : 'UNREVIEWED';
    let consulted = false;
    assert.throws(
      () =>
        validateFieldPublishedSource(oldFiles[0], previous(), meta, {
          type: () => {
            consulted = true;
            return 'commit';
          },
        }),
      /Exact original C16 Field package/,
    );
    assert.equal(consulted, false);
  }
  for (const change of [
    { extra_source_field: true },
    {
      owned_files: pkg().owned_files.map((f, i) =>
        i ? f : { ...f, extra: true },
      ),
    },
  ]) {
    let consulted = false;
    assert.throws(
      () =>
        validateFieldPublishedSource(
          oldFiles[0],
          previous(),
          { ...pkg(), ...change },
          {
            type: () => {
              consulted = true;
              return 'commit';
            },
          },
        ),
      /Exact original C16 Field package/,
    );
    assert.equal(consulted, false);
  }
});
test(titles[cursor++], () => {
  let consulted = false;
  assert.throws(
    () =>
      validateFieldPublishedSource(
        { ...oldFiles[0], sha256: hash(current()) },
        current(),
        pkg(),
        {
          type: () => {
            consulted = true;
            return 'commit';
          },
        },
      ),
    /Literal original Field endpoint/,
  );
  assert.equal(consulted, false);
});
test(titles[cursor++], () => {
  const old = previous();
  for (const f of oldFiles.slice(1))
    assert.throws(
      () =>
        validateFieldPublishedSource(oldFiles[0], old, pkg(), {
          read: (path) =>
            path === nativePath
              ? old
              : path === f.path
                ? bad(ports.read(path))
                : ports.read(path),
        }),
      /Current original Field companions required before equality/,
    );
});
test(titles[cursor++], () => {
  const old = previous();
  let changed = false,
    count = 0;
  assert.throws(
    () =>
      validateFieldPublishedSource(oldFiles[0], old, pkg(), {
        read: (f) => {
          if (f === oldFiles[4].path && ++count === 2) changed = true;
          return f === nativePath ? (changed ? bad(old) : old) : ports.read(f);
        },
      }),
    /Final fresh original Field endpoint/,
  );
});
const facts = () => ({
  candidate: 'c'.repeat(40),
  checkout: 'c'.repeat(40),
  tree: 'd'.repeat(40),
  candidate_tree: 'd'.repeat(40),
  candidate_parents: author,
  checkout_parents: author,
  delta: paths
    .map(
      (f) =>
        (f === 'scripts/check-cycle16-integrity.mjs' ? 'M' : 'A') + '\t' + f,
    )
    .sort()
    .join('\n'),
});
test(titles[cursor++], () => {
  assert.equal(validateCandidateProfile(facts()), undefined);
  assert.equal(
    validateCandidateProfile({
      ...facts(),
      checkout: 'e'.repeat(40),
      checkout_parents: author + ' ' + 'c'.repeat(40),
    }),
    undefined,
  );
});
test(titles[cursor++], () => {
  for (const parent of [
    '112110e30bd7b0400b96f75e26d12bffd70bea57',
    '676e12fd14f75f754a19bf5606a935456853a783',
    predecessor,
  ])
    assert.throws(
      () => validateCandidateProfile({ ...facts(), candidate_parents: parent }),
      /sole312/,
    );
});
test(titles[cursor++], () =>
  assert.throws(
    () =>
      validateCandidateProfile({
        ...facts(),
        delta: facts().delta + '\nM\tsrc/App.tsx',
      }),
    /six admission-only/,
  ),
);
test(titles[cursor++], () => {
  assert.throws(
    () =>
      validateCandidateProfile({
        ...facts(),
        checkout: 'e'.repeat(40),
        checkout_parents: predecessor + ' ' + 'c'.repeat(40),
      }),
    /same-tree carrier/,
  );
  assert.throws(
    () =>
      validateCandidateProfile({ ...facts(), candidate_tree: 'f'.repeat(40) }),
    /source identities/,
  );
});
test(titles[cursor++], () => {
  for (const candidate of ['', author.slice(0, 7), '--help'])
    assert.throws(
      () => validateCandidateProfile({ ...facts(), candidate }),
      /source identities/,
    );
});
const tap = () =>
  'TAP version 13\n' +
  titles.map((t, i) => 'ok ' + (i + 1) + ' - ' + t + '\n').join('') +
  '1..' +
  titles.length +
  '\n# tests ' +
  titles.length +
  '\n# pass ' +
  titles.length +
  '\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
test(titles[cursor++], () => {
  assert.equal(fieldControlCount, titles.length);
  assert.equal(
    fieldControlIdentitySha256,
    hash(JSON.stringify([...titles].sort())),
  );
  assert.deepEqual(validateTap(tap()), {
    passed: titles.length,
    scope: 'SOURCE_ONLY_NOT_WHOLE_FOUNDATION',
  });
});
test(titles[cursor++], () => {
  for (const text of [
    tap().replace(titles[0], 'unrelated control'),
    tap().replace(titles[1], titles[0]),
  ])
    assert.throws(() => validateTap(text), /literal passing/);
});
test(titles[cursor++], () => {
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
test(titles[cursor++], () => {
  for (const text of [tap().replace('# fail 0\n', ''), tap() + '# todo 0\n'])
    assert.throws(() => validateTap(text), /zero-error summary/);
});
test(titles[cursor++], () => {
  for (const text of [
    tap().replace(/^ok 1 - .+\n/m, ''),
    tap() + 'not ok 99 - hidden failure\n',
    tap() + '1..0\n',
    tap().replace('TAP version 13\n', ''),
  ])
    assert.throws(() => validateTap(text), /literal passing/);
});
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'propel-field-source-fixture-')),
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
test(titles[cursor++], () =>
  fixture((root, git) => {
    git('update-index', '--assume-unchanged', 'source.txt');
    writeFileSync(
      join(root, 'source.txt'),
      sameLength(readFileSync(join(root, 'source.txt'))),
    );
    assert.equal(git('status', '--porcelain'), '');
    assert.throws(() => trackedSnapshot(root), /Every tracked byte/);
  }),
);
test(titles[cursor++], () =>
  fixture((root) => {
    writeFileSync(join(root, 'unknown.json'), '{}');
    assert.throws(() => trackedSnapshot(root), /Clean source/);
  }),
);
test(titles[cursor++], () => {
  fixture((root, git) => {
    git('update-index', '--assume-unchanged', 'source.txt');
    rmSync(join(root, 'source.txt'));
    symlinkSync('missing-synthetic-source', join(root, 'source.txt'));
    assert.throws(() => trackedSnapshot(root), /symlink/);
  });
  fixture((root, git) => {
    git('config', 'core.filemode', 'false');
    git('update-index', '--assume-unchanged', 'source.txt');
    chmodSync(join(root, 'source.txt'), 0o755);
    assert.throws(() => trackedSnapshot(root), /source mode/);
  });
});
test(titles[cursor++], () => {
  const out = execFileSync(
    process.execPath,
    ['scripts/check-cycle16-integrity.mjs'],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 },
  );
  assert.match(out, /Cycle16 exact sources/);
  assert.match(out, /"author_files":30/);
});
test(titles[cursor++], () => {
  for (const sha256 of [hash(current()), '0'.repeat(64)]) {
    const m = JSON.parse(
      readFileSync('docs/program/CYCLE16_DELIVERY_INDEX.json'),
    );
    m.packages[0].owned_files[0].sha256 = sha256;
    assert.throws(
      () => validateCycle16Manifest(m),
      /Reviewed Cycle16 source changed: src\/lib\/workflows\/daily-field-guide\.ts/,
    );
  }
});
test(titles[cursor++], () => {
  const m = JSON.parse(
    readFileSync('docs/program/CYCLE16_DELIVERY_INDEX.json'),
  );
  assert.throws(
    () =>
      validateCycle16Manifest(m, (f) =>
        f === authored[3] ? bad(readFileSync(f)) : readCycle13File(f),
      ),
    /Reviewed Cycle16 source changed: src\/lib\/workflows\/daily-field-guide\.ts/,
  );
});
test(titles[cursor++], () => {
  const reviewed = current(),
    input = sameLength(reviewed);
  let substituted = false;
  assert.throws(
    () =>
      validateFieldPublishedSource(oldFiles[0], input, pkg(), {
        read: (f) => {
          if (f === oldFiles[1].path && !substituted) {
            input.set(reviewed);
            substituted = true;
          }
          return ports.read(f);
        },
      }),
    /Published Field input changed/,
  );
  assert.equal(substituted, true);
});
test(titles[cursor++], () => {
  const reviewed = current(),
    results = [];
  for (const boundary of [
    'published-type-callback',
    'direct-port-property-getter',
  ]) {
    const input = sameLength(reviewed);
    let reached = false;
    try {
      if (boundary === 'published-type-callback')
        validateFieldPublishedSource(oldFiles[0], input, pkg(), {
          type: (commit) => {
            input.set(reviewed);
            reached = true;
            return ports.type(commit);
          },
        });
      else
        admitFieldSuccessor(nativePath, input, previous(), pkg(), {
          get type() {
            input.set(reviewed);
            reached = true;
            return ports.type;
          },
        });
      results.push({ boundary, outcome: 'ACCEPTED', reached });
    } catch (error) {
      results.push({
        boundary,
        outcome: 'DENIED',
        message: error.message,
        reached,
      });
    }
  }
  assert.deepEqual(
    results.map((r) => r.outcome),
    ['DENIED', 'DENIED'],
  );
  assert.ok(results.every((r) => r.reached));
  assert.match(results[0].message, /Published Field input changed/);
  assert.match(
    results[1].message,
    /Unknown or unchanged Field native successor denied/,
  );
});
assert.equal(cursor, titles.length);
