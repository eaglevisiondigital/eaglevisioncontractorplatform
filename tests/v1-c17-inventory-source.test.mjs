import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  cycle25SourcePorts as actualPorts,
  admitCycle33V1C17Compatibility as legacy,
  cycle33V1C17Compatibility as old,
} from '../scripts/cycle25-source-lineage.mjs';
import {
  inventoryAuthor as author,
  inventoryParent as parent,
  inventoryPath as path,
  inventoryDoc as doc,
  admitC17InventorySuccessor as actualAdmit,
  validateFocusedReport,
} from '../scripts/v1-c17-inventory-source.mjs';
// Original bd8 controls use their exact historical current-read fixture.
// The actual retained consumer below still reads the real current filesystem.
const p = {
  ...actualPorts,
  read: (f) =>
    f === path ? actualPorts.git(author, path) : actualPorts.read(f),
};
const admit = (a, b, c, ports = {}) =>
  actualAdmit(a, b, c, { read: p.read, ...ports });
const current = () => p.git(author, path),
  previous = () => p.git(parent, path),
  corrupt = (b) => Buffer.concat([b, Buffer.from('\n// unknown\n')]);
test('exact complete reviewed test successor remains source-only', () => {
  assert.deepEqual(admit(path, current(), previous()), {
    path,
    source_commit: author,
    module: 'c17-field-inventory-compatibility',
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  });
});
const modes = [
  'wrong-path',
  'missing-author',
  'wrong-parent',
  'merge-parent',
  'extra-delta',
  'missing-delta',
  'old-mode',
  'author-mode',
  'doc-mode',
  'wrong-before',
  'current-drift',
  'initial-read-drift',
  'doc-drift',
  'late-endpoint',
  'late-doc',
  'field-drift',
];
for (const mode of modes)
  test(`denies ${mode} without replacing old C17 pins`, () => {
    let targetReads = 0,
      docReads = 0;
    const ports = {
      type: (c) =>
        c === author && mode === 'missing-author' ? 'blob' : p.type(c),
      parent: (c) =>
        c === author && ['wrong-parent', 'merge-parent'].includes(mode)
          ? mode === 'wrong-parent'
            ? '0'.repeat(40)
            : `${parent} ${parent}`
          : p.parent(c),
      delta: (c) =>
        mode === 'extra-delta'
          ? p.delta(c) + '\nM\tsrc/App.tsx'
          : mode === 'missing-delta'
            ? ''
            : p.delta(c),
      mode: (c, f) =>
        (mode === 'old-mode' && c === parent && f === path) ||
        (mode === 'author-mode' && c === author && f === path) ||
        (mode === 'doc-mode' && c === author && f === doc)
          ? '100755'
          : p.mode(c, f),
      read: (f) => {
        if (f === path) targetReads++;
        if (f === doc) docReads++;
        return (f === path && mode === 'initial-read-drift') ||
          (f === doc && mode === 'doc-drift') ||
          (f === path && mode === 'late-endpoint' && targetReads > 1) ||
          (f === doc && mode === 'late-doc' && docReads > 1) ||
          (f === 'src/lib/workflows/field-workspace.ts' &&
            mode === 'field-drift')
          ? corrupt(p.read(f))
          : p.read(f);
      },
    };
    assert.throws(() =>
      admit(
        mode === 'wrong-path' ? 'src/App.tsx' : path,
        mode === 'current-drift' ? corrupt(current()) : current(),
        mode === 'wrong-before' ? corrupt(previous()) : previous(),
        ports,
      ),
    );
  });
test('actual retained C17 consumer admits only the reviewed current source and test', async () => {
  const { validateCycle17Manifest } =
    await import('../scripts/check-cycle17-integrity.mjs');
  assert.equal(
    validateCycle17Manifest(
      JSON.parse(
        readFileSync('docs/program/CYCLE17_DELIVERY_INDEX.json', 'utf8'),
      ),
    ).packages,
    6,
  );
});

test('endpoint mutation during final doc read is denied', () => {
  let docReads = 0,
    changed = false;
  assert.throws(() =>
    admit(path, current(), previous(), {
      read: (f) => {
        if (f === doc && ++docReads === 2) changed = true;
        return f === path && changed ? corrupt(p.read(f)) : p.read(f);
      },
    }),
  );
});

const focusedNames = [
  'field ambiguous navigation cannot replay through a fresh same canonical wrapper',
  'finance ambiguous navigation cannot replay through a fresh same canonical wrapper',
  'customer ambiguous navigation cannot replay through a fresh same canonical wrapper',
  'growth ambiguous navigation cannot replay through a fresh same canonical wrapper',
  'intelligence ambiguous navigation cannot replay through a fresh same canonical wrapper',
  'advanced ambiguous navigation cannot replay through a fresh same canonical wrapper',
  'customer clean pre-dispatch callback withdrawal permits a later explicit navigation without relabeling UNKNOWN',
  'advanced clean pre-dispatch callback withdrawal permits a later explicit navigation without relabeling UNKNOWN',
  'brand 0 Field and Customer retain one exact job/report/version and original control source without business writes',
  'brand 1 Field and Customer retain one exact job/report/version and original control source without business writes',
  'brand 2 Field and Customer retain one exact job/report/version and original control source without business writes',
  'brand 0 financial case evidence and owner priority resolve the same canonical portfolio job without new calculation or authority',
  'brand 1 financial case evidence and owner priority resolve the same canonical portfolio job without new calculation or authority',
  'brand 2 financial case evidence and owner priority resolve the same canonical portfolio job without new calculation or authority',
  'brand 0 maintenance and add-on direct controls retain canonical property/job/source with no consent or provider execution',
  'brand 1 maintenance and add-on direct controls retain canonical property/job/source with no consent or provider execution',
  'brand 2 maintenance and add-on direct controls retain canonical property/job/source with no consent or provider execution',
  'field retained currentness and callback withdraw after staff revocation even if membership is restored',
  'finance retained currentness and callback withdraw after staff revocation even if membership is restored',
  'customer retained currentness and callback withdraw after staff revocation even if membership is restored',
  'growth retained currentness and callback withdraw after staff revocation even if membership is restored',
  'intelligence retained currentness and callback withdraw after staff revocation even if membership is restored',
  'advanced retained currentness and callback withdraw after staff revocation even if membership is restored',
  'field same-company wrong-property source substitution is terminal after source restoration',
  'finance same-company wrong-property source substitution is terminal after source restoration',
  'customer same-company wrong-property source substitution is terminal after source restoration',
  'growth same-company wrong-property source substitution is terminal after source restoration',
  'intelligence same-company wrong-property source substitution is terminal after source restoration',
  'advanced same-company wrong-property source substitution is terminal after source restoration',
  'field foreign approved company cannot borrow the retained property/job/source by restoring labels',
  'finance foreign approved company cannot borrow the retained property/job/source by restoring labels',
  'customer foreign approved company cannot borrow the retained property/job/source by restoring labels',
  'growth foreign approved company cannot borrow the retained property/job/source by restoring labels',
  'intelligence foreign approved company cannot borrow the retained property/job/source by restoring labels',
  'advanced foreign approved company cannot borrow the retained property/job/source by restoring labels',
  'field stays OFF before getters in production or outside explicit HTTP loopback',
  'finance stays OFF before getters in production or outside explicit HTTP loopback',
  'customer stays OFF before getters in production or outside explicit HTTP loopback',
  'growth stays OFF before getters in production or outside explicit HTTP loopback',
  'intelligence stays OFF before getters in production or outside explicit HTTP loopback',
  'advanced stays OFF before getters in production or outside explicit HTTP loopback',
  'six workspaces reuse the exact original navigation identities and render without source preparation while OFF',
  'the combined admission retains all thirty exact reviewed source/test blobs without overlapping ownership',
  'Cycle16 closeout preserves child cancellations separately from actual successful combined-source coverage',
  'the local visual review cannot read remote/private image paths or replace a linked output, and valid writes leave only the exact atomic output',
];
const focusName =
  'the combined admission retains all thirty exact reviewed source/test blobs without overlapping ownership';
function fixture() {
  return {
    success: true,
    startTime: 100,
    numTotalTests: 45,
    numPassedTests: 1,
    numFailedTests: 0,
    numPendingTests: 44,
    numTodoTests: 0,
    numTotalTestSuites: 1,
    numPassedTestSuites: 1,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    testResults: [
      {
        name: resolve(path),
        status: 'passed',
        message: '',
        assertionResults: focusedNames.map((fullName) => ({
          fullName,
          status: fullName === focusName ? 'passed' : 'skipped',
          failureMessages: [],
          duration: 1,
        })),
      },
    ],
  };
}
test('focused report proves only one original case and44 unselected', () => {
  assert.deepEqual(validateFocusedReport(fixture()), {
    passed: 1,
    unselected: 44,
    full480_pass: false,
  });
});
const reportMutations = [
  [
    'array-like files',
    (r) => {
      r.testResults = { 0: r.testResults[0], length: 1 };
    },
  ],
  [
    'renamed identity',
    (r) => {
      r.testResults[0].assertionResults[0].fullName = 'invented';
    },
  ],
  [
    'duplicate identity',
    (r) => {
      r.testResults[0].assertionResults[1] =
        r.testResults[0].assertionResults[0];
    },
  ],
  [
    'skipped focused case',
    (r) => {
      r.testResults[0].assertionResults.find(
        (a) => a.fullName === focusName,
      ).status = 'pending';
    },
  ],
  [
    'unselected case execution',
    (r) => {
      r.testResults[0].assertionResults.find(
        (a) => a.fullName !== focusName,
      ).status = 'passed';
    },
  ],
  [
    'budget overrun',
    (r) => {
      r.testResults[0].assertionResults.find(
        (a) => a.fullName === focusName,
      ).duration = 30001;
    },
  ],
  [
    'hidden failure',
    (r) => {
      r.testResults[0].assertionResults[0].failureMessages = ['failure'];
    },
  ],
  [
    'todo count',
    (r) => {
      r.numTodoTests = 1;
    },
  ],
  [
    'stale start',
    (r) => {
      r.startTime = 99;
    },
  ],
];
for (const [name, mutate] of reportMutations)
  test(`focused report rejects ${name}`, () => {
    const r = fixture();
    mutate(r);
    assert.throws(() => validateFocusedReport(r, process.cwd(), 100));
  });

test('original b947 companion validates before successor authority is consulted', () => {
  let consulted = false;
  assert.throws(
    () =>
      legacy({ path, sha256: old.published_sha256 }, current(), {
        type: (c) => {
          if (c === author) consulted = true;
          return p.type(c);
        },
        read: (f) =>
          f === old.companion.path ? corrupt(p.read(f)) : p.read(f),
      }),
    /Exact current C17 compatibility companion/,
  );
  assert.equal(consulted, false);
});
test('original b947 companion is freshly checked after successor validation', () => {
  let reads = 0;
  assert.throws(
    () =>
      legacy({ path, sha256: old.published_sha256 }, current(), {
        read: (f) =>
          f === old.companion.path && ++reads > 1
            ? corrupt(p.read(f))
            : p.read(f),
      }),
    /Final fresh original C17 compatibility companion/,
  );
});
