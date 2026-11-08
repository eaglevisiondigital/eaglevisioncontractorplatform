// Source-control regression fixtures only, never genuine operational evidence.
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import {
  validateTapReport,
  validateBrowserReport,
  summarizeDefaultUnit,
  validateSourceProfile,
  validateNativeCollection,
  validateNativeReport,
  validateCaptureMetadata,
  decodePNG,
} from '../scripts/v1-field-intake-integration.mjs';
import {
  ports,
  nativePath,
  author,
  predecessor,
  admitFieldSuccessor,
  validateFieldPublishedSource,
} from '../scripts/v1-field-source-admission.mjs';
import {
  admitFieldInventorySource,
  fieldInventoryPath,
  fieldInventoryAuthor,
  fieldInventoryParent,
  fieldInventoryDoc,
} from '../scripts/v1-c16-field-inventory-source.mjs';
import {
  admitCycle33V1C16TestCompatibility,
  cycle33V1C16TestCompatibility,
} from '../scripts/cycle25-source-lineage.mjs';

const old = cycle33V1C16TestCompatibility;
const metadata = { path: old.path, sha256: old.published_sha256 };
function inventory() {
  return {
    current: Buffer.from(ports.read(fieldInventoryPath)),
    previous: Buffer.from(ports.git(old.commit, old.path)),
  };
}
test('inventory final endpoint callback cannot substitute either captured input', () => {
  for (const input of ['current', 'previous']) {
    const f = inventory();
    let count = 0;
    assert.throws(
      () =>
        admitFieldInventorySource(metadata, f.current, f.previous, {
          read(path) {
            const bytes = ports.read(path);
            if (path === fieldInventoryPath && ++count === 3) f[input][0] ^= 1;
            return bytes;
          },
        }),
      /Final exact inventory/,
    );
  }
});
test('historical C16 argument remains exact through current-forward validation', () => {
  const current = Buffer.from(ports.git(old.commit, old.path));
  assert.throws(
    () =>
      admitCycle33V1C16TestCompatibility(metadata, current, {
        read(path) {
          const bytes = ports.read(path);
          if (path === old.path) current[0] ^= 1;
          return bytes;
        },
      }),
    /Fresh exact reviewed/,
  );
});
test('direct Field final endpoint callback cannot substitute captured input', () => {
  const current = Buffer.from(ports.read(nativePath));
  let count = 0;
  const pkg = JSON.parse(ports.read('docs/program/CYCLE16_DELIVERY_INDEX.json'))
    .packages[0];
  assert.throws(
    () =>
      admitFieldSuccessor(
        nativePath,
        current,
        ports.git(predecessor, nativePath),
        pkg,
        {
          read(path) {
            const bytes = ports.read(path);
            if (path === nativePath && ++count === 3) current[0] ^= 1;
            return bytes;
          },
        },
      ),
    /Final fresh Field/,
  );
});
test('legacy Field final endpoint callback cannot substitute captured input', () => {
  const current = Buffer.from(ports.git(predecessor, nativePath));
  const original = Buffer.from(current);
  const pkg = JSON.parse(ports.read('docs/program/CYCLE16_DELIVERY_INDEX.json'))
    .packages[0];
  assert.throws(
    () =>
      validateFieldPublishedSource(pkg.owned_files[0], current, pkg, {
        read(path) {
          if (path === nativePath) {
            current[0] ^= 1;
            return original;
          }
          return ports.read(path);
        },
      }),
    /Final fresh original Field/,
  );
});
test('new inventory and historical input retain distinct exact source receipts', () => {
  const f = inventory();
  assert.equal(
    admitFieldInventorySource(metadata, f.current, f.previous).source_commit,
    '77ff8d00c4659ab8d5054805f7c59e7752c11419',
  );
  assert.equal(
    admitCycle33V1C16TestCompatibility(metadata, f.previous).source_commit,
    old.commit,
  );
  assert.equal(author, 'd977c78991aefed65f28fb643c30f92e5ecc6f7c');
});
for (const kind of ['wrong path', 'zero pin', 'new pin', 'extra metadata'])
  test(`inventory denies ${kind} without replacing the historical pin`, () => {
    const f = inventory(),
      m = { ...metadata };
    if (kind === 'wrong path')
      m.path = 'src/lib/workflows/daily-field-guide.ts';
    if (kind === 'zero pin') m.sha256 = '0'.repeat(64);
    if (kind === 'new pin')
      m.sha256 =
        'bce39cd515190a1c93c7841ec3aea25f0acc7f140dc711eb31b7624d455abdba';
    if (kind === 'extra metadata') m.approved = true;
    assert.throws(
      () => admitFieldInventorySource(m, f.current, f.previous),
      /immutable original/,
    );
  });
for (const commit of [
  fieldInventoryAuthor,
  fieldInventoryParent,
  old.commit,
  old.parent,
  old.published,
])
  test(`inventory rejects nonregular test source at ${commit}`, () => {
    const f = inventory();
    assert.throws(
      () =>
        admitFieldInventorySource(metadata, f.current, f.previous, {
          mode: (c, path) =>
            c === commit && path === fieldInventoryPath
              ? '120000'
              : ports.mode(c, path),
        }),
      /inventory history/,
    );
  });
for (const commit of [fieldInventoryAuthor, old.commit])
  test(`inventory rejects additional parent or author paths at ${commit}`, () => {
    const f = inventory();
    assert.throws(
      () =>
        admitFieldInventorySource(metadata, f.current, f.previous, {
          parent: (c) => (c === commit ? '0'.repeat(40) : ports.parent(c)),
        }),
      /inventory history/,
    );
    assert.throws(
      () =>
        admitFieldInventorySource(metadata, f.current, f.previous, {
          delta: (c) =>
            c === commit ? ports.delta(c) + '\nM\tsrc/App.tsx' : ports.delta(c),
        }),
      /inventory history/,
    );
  });
test('inventory rejects arbitrary changed current source', () => {
  const f = inventory();
  f.current[0] ^= 1;
  assert.throws(
    () => admitFieldInventorySource(metadata, f.current, f.previous),
    /exact reviewed/,
  );
});
for (const path of [
  fieldInventoryDoc,
  'docs/program/CYCLE16_DELIVERY_INDEX.json',
])
  test(`inventory rejects changed current companion ${path}`, () => {
    const f = inventory();
    assert.throws(
      () =>
        admitFieldInventorySource(metadata, f.current, f.previous, {
          read: (name) =>
            name === path
              ? Buffer.from('unreviewed companion')
              : ports.read(name),
        }),
      /Fresh exact inventory/,
    );
  });
test('inventory captures both supplied buffers before the first history callback', () => {
  for (const input of ['current', 'previous']) {
    const f = inventory();
    let altered = false;
    assert.throws(
      () =>
        admitFieldInventorySource(metadata, f.current, f.previous, {
          type(c) {
            if (!altered) {
              altered = true;
              f[input][0] ^= 1;
            }
            return ports.type(c);
          },
        }),
      /Final exact inventory/,
    );
  }
});
test('historical compatibility cannot hide a changed current forward note', () => {
  const f = inventory();
  assert.throws(
    () =>
      admitCycle33V1C16TestCompatibility(metadata, f.previous, {
        read: (path) =>
          path === fieldInventoryDoc
            ? Buffer.from('changed note')
            : ports.read(path),
      }),
    /Fresh exact reviewed/,
  );
});

// The following fixtures exercise evidence parsers only. They are never saved
// or counted as real application/native/browser execution.
function constructedTap() {
  return 'TAP version 13\nok 1 - exact one\nok 2 - exact two\n1..2\n# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
}
test('constructed TAP positive requires exact literal identities and zero counters', () => {
  assert.equal(
    validateTapReport(constructedTap(), ['exact one', 'exact two']).passed,
    2,
  );
});
for (const [name, change] of [
  ['failure counter', (s) => s.replace('# fail 0', '# fail 1')],
  [
    'duplicate identity',
    (s) => s.replace('ok 2 - exact two', 'ok 2 - exact one'),
  ],
  [
    'skipped annotation',
    (s) => s.replace('ok 2 - exact two', 'ok 2 - exact two # SKIP'),
  ],
  ['missing plan', (s) => s.replace('1..2\n', '')],
])
  test(`constructed TAP rejects ${name}`, () =>
    assert.throws(() =>
      validateTapReport(change(constructedTap()), ['exact one', 'exact two']),
    ));
function constructedNative() {
  const file = 'tests/example.test.ts';
  const policy = {
    count: 1,
    files: { [file]: 'fixture-only' },
    cases: [{ file, api_name: 'original suite > original case' }],
    test_timeout_ms: 30000,
  };
  const report = {
    success: true,
    numTotalTests: 1,
    numPassedTests: 1,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    numTotalTestSuites: 1,
    numPassedTestSuites: 1,
    testResults: [
      {
        name: resolve(file),
        status: 'passed',
        message: '',
        assertionResults: [
          {
            title: 'original case',
            ancestorTitles: ['original suite'],
            fullName: 'original suite original case',
            status: 'passed',
            failureMessages: [],
            duration: 1,
          },
        ],
      },
    ],
  };
  return { file, policy, report };
}
test('constructed native report preserves API and producer full names separately', () => {
  const { file, policy, report } = constructedNative();
  assert.equal(
    validateNativeCollection(
      [{ file: resolve(file), name: 'original suite > original case' }],
      policy,
    ).collected,
    1,
  );
  assert.equal(validateNativeReport(report, policy).passed, 1);
});
for (const [name, change] of [
  [
    'missing literal identity',
    (r) => {
      r.testResults[0].assertionResults = [];
    },
  ],
  [
    'incorrect full name',
    (r) => {
      r.testResults[0].assertionResults[0].fullName = 'another source';
    },
  ],
  [
    'pending case',
    (r) => {
      r.testResults[0].assertionResults[0].status = 'pending';
    },
  ],
  [
    'runtime failure',
    (r) => {
      r.errors = ['unhandled fixture failure'];
    },
  ],
  [
    'exceeded original budget',
    (r) => {
      r.testResults[0].assertionResults[0].duration = 30001;
    },
  ],
])
  test(`constructed native report rejects ${name}`, () => {
    const { policy, report } = constructedNative();
    change(report);
    assert.throws(() => validateNativeReport(report, policy));
  });
test('constructed capture metadata cannot substitute source or infer visual approval', () => {
  const meta = {
    schema: 'propel-cycle16-capture-v1',
    brand: 'brand',
    viewport: 'desktop',
    source: '1'.repeat(40),
    approval: 'PENDING',
    release: 'NOT_READY_NOT_AUTHORIZED',
  };
  assert.equal(
    validateCaptureMetadata(meta, 'brand', 'desktop', '1'.repeat(40)).approval,
    false,
  );
  assert.throws(() =>
    validateCaptureMetadata(
      { ...meta, source: '2'.repeat(40) },
      'brand',
      'desktop',
      '1'.repeat(40),
    ),
  );
  assert.throws(() =>
    validateCaptureMetadata(
      { ...meta, approval: 'APPROVED' },
      'brand',
      'desktop',
      '1'.repeat(40),
    ),
  );
});
test('synthetic PNG decoder requires complete bytes and actual pixels', async () => {
  const png = await sharp({
    create: { width: 16, height: 12, channels: 4, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  const decoded = await decodePNG(png);
  assert.equal(decoded.decoded, true);
  assert.equal(decoded.width, 16);
  await assert.rejects(() => decodePNG(png.subarray(0, png.length - 1)));
  await assert.rejects(() => decodePNG(Buffer.from('not a PNG')));
});

// Constructed default-report contradictions must never become completed success.
function constructedDefault() {
  const { file, report } = constructedNative();
  const item = {
    file,
    full_name: 'original suite > original case',
    options: {},
    result: { state: 'passed', errors: [] },
  };
  const events = [
    {
      sequence: 0,
      kind: 'observer_start',
      config: {
        test_timeout: 30000,
        hook_timeout: 30000,
        max_workers: 4,
        retry: 0,
      },
    },
    { sequence: 1, kind: 'case_result', case: { ...item, id: 'fixture-id' } },
    {
      sequence: 2,
      kind: 'run_end',
      reason: 'passed',
      cases: [item],
      module_errors: [],
      unhandled_errors: [],
    },
  ];
  return { report, events };
}
test('constructed default report preserves completed passing evidence', () => {
  const { report, events } = constructedDefault();
  const observed = summarizeDefaultUnit(events, report);
  assert.equal(observed.command_complete, true);
  assert.equal(observed.reported_success, true);
});
test('constructed default report preserves completed genuine failure', () => {
  const { report, events } = constructedDefault();
  report.success = false;
  report.numPassedTests = 0;
  report.numFailedTests = 1;
  report.numFailedTestSuites = 1;
  report.numPassedTestSuites = 0;
  report.testResults[0].status = 'failed';
  report.testResults[0].assertionResults[0].status = 'failed';
  report.testResults[0].assertionResults[0].failureMessages = [
    'fixture failure',
  ];
  events[1].case.result = {
    state: 'failed',
    errors: [{ message: 'fixture failure' }],
  };
  events[2].cases[0].result = {
    state: 'failed',
    errors: [{ message: 'fixture failure' }],
  };
  events[2].reason = 'failed';
  const observed = summarizeDefaultUnit(events, report);
  assert.equal(observed.command_complete, true);
  assert.equal(observed.reported_success, false);
});
for (const [name, change] of [
  [
    'observer final failed state',
    (events) => {
      events[2].cases[0].result = {
        state: 'failed',
        errors: [{ message: 'failure' }],
      };
    },
  ],
  [
    'observer incremental failed state',
    (events) => {
      events[1].case.result = {
        state: 'failed',
        errors: [{ message: 'failure' }],
      };
    },
  ],
  [
    'observer failed terminal reason',
    (events) => {
      events[2].reason = 'failed';
    },
  ],
  [
    'observer passing case errors',
    (events) => {
      events[2].cases[0].result = {
        state: 'passed',
        errors: [{ message: 'failure' }],
      };
    },
  ],
])
  test(`constructed default report rejects ${name} against successful JSON`, () => {
    const { report, events } = constructedDefault();
    change(events);
    assert.throws(() => summarizeDefaultUnit(events, report));
  });

function constructedSourceManifest() {
  const m = JSON.parse(
    readFileSync('docs/program/V1_FIELD_INTAKE_MANIFEST.json', 'utf8'),
  );
  const candidate = '1'.repeat(40),
    tree = '2'.repeat(40);
  const facts = {
    candidate,
    checkout: candidate,
    tree,
    candidate_tree: tree,
    candidate_parent: m.composition_parent,
    checkout_parents: [m.composition_parent],
    composition_chain: m.author_bundles.map((a, i) => ({
      commit: a.composition,
      parent: i ? m.author_bundles[i - 1].composition : m.base,
    })),
    main_delta_paths: [...m.main_files],
  };
  return { m, facts };
}
test('constructed source profile preserves the complete literal control inventories', () => {
  const { m, facts } = constructedSourceManifest();
  assert.equal(validateSourceProfile(facts, m).operational_acceptance, false);
});
for (const gate of ['field-source', 'main-source', 'reporter'])
  for (const change of ['missing', 'renamed', 'extra'])
    test(`constructed source profile rejects ${gate} ${change} literal identity`, () => {
      const { m, facts } = constructedSourceManifest();
      const item = m.control_gates.find((g) => g.key === gate);
      if (change === 'missing') item.titles.pop();
      if (change === 'renamed') item.titles[0] += ' changed';
      if (change === 'extra') item.titles.push('unreviewed extra control');
      assert.throws(() => validateSourceProfile(facts, m));
    });

function constructedSourceDefault(files, includeStart = true) {
  const { report, events } = constructedDefault();
  const source = {
    checkout: '1'.repeat(40),
    tree: '2'.repeat(40),
    files: Object.fromEntries(files.map((f) => [f, 'fixture-only'])),
  };
  Object.assign(events[0], { checkout: source.checkout, tree: source.tree });
  if (includeStart)
    events.splice(1, 0, {
      kind: 'run_start',
      specifications: files.map((file) => ({ file })),
    });
  events.forEach((e, i) => {
    e.sequence = i;
  });
  return { report, events, source };
}
test('constructed default completeness preserves exact source file collection', () => {
  const f = constructedSourceDefault(['tests/example.test.ts']);
  assert.equal(
    summarizeDefaultUnit(f.events, f.report, f.source).command_complete,
    true,
  );
});
test('constructed default completeness rejects a consistent subset of source files', () => {
  const f = constructedSourceDefault([
    'tests/example.test.ts',
    'tests/omitted.test.ts',
  ]);
  assert.throws(() => summarizeDefaultUnit(f.events, f.report, f.source));
});
test('constructed default completeness rejects a missing collection event', () => {
  const f = constructedSourceDefault(['tests/example.test.ts'], false);
  assert.throws(() => summarizeDefaultUnit(f.events, f.report, f.source));
});

// Constructed parser-only fixtures reproduce the hosted --list metadata shape.
// They execute no browser case and grant no source or operational authority.
function constructedBrowserCollection() {
  const source = {
    candidate: '1'.repeat(40),
    checkout: '2'.repeat(40),
    tree: '3'.repeat(40),
    started_epoch_ms: 1,
  };
  const file = 'cycle16-field.spec.ts';
  const title = 'daily field guide / fixture';
  const expected = {
    count: 1,
    projects: ['desktop'],
    workers: 2,
    timeout_ms: 90000,
    file,
    cases: [JSON.stringify(['desktop', file, 1, 1, title])],
  };
  const report = {
    errors: [],
    config: {
      workers: 2,
      projects: [
        { name: 'desktop', timeout: 90000, retries: 0, repeatEach: 1 },
      ],
      metadata: {
        schema: 'propel-v1-field-intake-browser-v1',
        candidate: source.candidate,
        source_checkout: source.checkout,
        source_tree: source.tree,
        mode: 'field',
        operational_acceptance: false,
      },
    },
    suites: [
      {
        file,
        specs: [
          {
            title,
            line: 1,
            column: 1,
            tests: [
              {
                projectName: 'desktop',
                timeout: 90000,
                expectedStatus: 'passed',
                annotations: [],
                results: [],
              },
            ],
          },
        ],
      },
    ],
  };
  return { source, expected, report };
}
function constructedBrowserExecution() {
  const f = constructedBrowserCollection();
  const spec = f.report.suites[0].specs[0];
  spec.ok = true;
  Object.assign(spec.tests[0], {
    status: 'expected',
    results: [
      {
        status: 'passed',
        retry: 0,
        duration: 1,
        errors: [],
        attachments: [],
        startTime: '2026-11-08T00:00:00.000Z',
      },
    ],
  });
  f.report.stats = {
    expected: 1,
    unexpected: 0,
    skipped: 0,
    flaky: 0,
    startTime: '2026-11-08T00:00:00.000Z',
  };
  return f;
}
test('constructed browser collection accepts explicit source without automatic CI metadata', () => {
  const f = constructedBrowserCollection();
  const result = validateBrowserReport(
    f.report,
    f.expected,
    f.source,
    'field',
    { collection: true, ci: true },
  );
  assert.equal(result.case_execution, false);
  assert.equal(result.passed, null);
  assert.equal(result.collected, 1);
});
test('constructed browser execution requires automatic CI source metadata', () => {
  const f = constructedBrowserExecution();
  assert.throws(
    () =>
      validateBrowserReport(f.report, f.expected, f.source, 'field', {
        ci: true,
      }),
    /Actual CI report source required/,
  );
  f.report.config.metadata.ci = { commitHash: f.source.checkout };
  assert.equal(
    validateBrowserReport(f.report, f.expected, f.source, 'field', { ci: true })
      .passed,
    1,
  );
});
test('constructed browser collection rejects every supplied source mismatch', () => {
  for (const [key, value] of [
    ['ci', null],
    ['ci', { commitHash: '4'.repeat(40) }],
    ['gitCommit', null],
    ['gitCommit', { hash: '4'.repeat(40) }],
    ['candidate', '4'.repeat(40)],
    ['source_checkout', '4'.repeat(40)],
    ['source_tree', '4'.repeat(40)],
  ]) {
    for (const collection of [true, false]) {
      const f = collection
        ? constructedBrowserCollection()
        : constructedBrowserExecution();
      if (!collection)
        f.report.config.metadata.ci = { commitHash: f.source.checkout };
      f.report.config.metadata[key] = value;
      assert.throws(() =>
        validateBrowserReport(f.report, f.expected, f.source, 'field', {
          collection,
          ci: true,
        }),
      );
    }
  }
});
