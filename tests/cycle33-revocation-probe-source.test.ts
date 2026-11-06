import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';

type Ports = {
  read: (path: string) => Buffer;
  git: (commit: string, path: string) => Buffer;
  type: (commit: string) => string;
  parent: (commit: string) => string;
  delta: (commit: string) => string;
  mode: (commit: string, path: string) => string;
};
type File = { path: string; sha256: string; blob: string };
type Probe = {
  commit: string;
  parent: string;
  published: string;
  path: string;
  published_sha256: string;
  published_blob: string;
  sha256: string;
  blob: string;
};
type Admission = (
  path: string,
  current: Buffer,
  previous: Buffer,
  ports?: Partial<Ports>,
) => Record<string, unknown>;
const s: {
  cycle25SourcePorts: Ports;
  cycle33ExecutionParent: string;
  cycle33V1Parent: string;
  cycle33V1RevocationProbe: Readonly<Probe>;
  admitCycle33V1RevocationProbe: (
    file: File,
    current: Buffer,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
  admitCycle33ExecutionSource: Admission;
  admitCycle33V1Source: Admission;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const p = s.cycle25SourcePorts,
  f = s.cycle33V1RevocationProbe,
  hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex'),
  blob = (bytes: Buffer) =>
    createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex'),
  original = () => p.git(f.published, f.path),
  reviewed = () => p.git(f.commit, f.path),
  metadata = (): File => ({
    path: f.path,
    sha256: f.published_sha256,
    blob: f.published_blob,
  }),
  admit = (ports?: Partial<Ports>, current = reviewed(), file = metadata()) =>
    s.admitCycle33V1RevocationProbe(file, current, ports),
  missing = () => {
    throw Object.assign(Error('Missing exact source'), { code: 'ENOENT' });
  },
  unknown = Buffer.from('unreviewed probe bytes');

it('pins only the literal reviewed M1 test successor and immutable original metadata', () => {
  expect(Object.isFrozen(f)).toBe(true);
  expect(f).toEqual({
    commit: '2784c9ab0d0f52f1bd653651081c005ac3da239d',
    parent: '038b64acad56e436a016905dfec87aef86dcfbc8',
    published: '98e4c39f3135b0b8177e2cc50980c1814fdcb2ff',
    path: 'tests/cycle33-execution-cost-selection.test.ts',
    published_sha256:
      '3882009f942e219c632b063edd7368082181038e23f781d5b086561c885b1b0e',
    published_blob: 'c0a706fbc81c2a5638c919a0af49b8e992a22a9c',
    sha256: '38dc796f3028f6afe7d570273e7192c5bce3a3946315dce7239ac96734362d61',
    blob: '484a3925307294fe0257faeb738a38c1c6953ba5',
  });
});

it('uses real Git to prove sole-parent M1, regular modes and both immutable raw byte identities', () => {
  expect(p.parent(f.commit)).toBe(f.parent);
  expect(p.delta(f.commit)).toBe(`M\t${f.path}`);
  for (const commit of [f.published, f.parent, f.commit]) {
    expect(p.type(commit)).toBe('commit');
    expect(p.mode(commit, f.path)).toBe('100644');
  }
  expect(hash(original())).toBe(f.published_sha256);
  expect(blob(original())).toBe(f.published_blob);
  expect(p.git(f.parent, f.path)).toEqual(original());
  expect(hash(reviewed())).toBe(f.sha256);
  expect(blob(reviewed())).toBe(f.blob);
  expect(p.read(f.path)).toEqual(reviewed());
});

it('restores every original assertion and case byte while preserving native sources and original budgets', () => {
  const restored = reviewed()
    .toString()
    .replace(
      "          if (key === 'kind') captures++;\n          if (key === 'id' && captures === 1 && !revoked) revoked = revoke(f);",
      "          if (key === 'kind' && ++captures === 2) revoked = revoke(f);",
    )
    .replace('    expect(captures).toBe(1);\n', '');
  expect(Buffer.from(restored)).toEqual(original());
  expect(reviewed().toString()).toContain('    expect(captures).toBe(1);');
  for (const path of [
    'src/lib/workflows/recorded-cost-requirements.ts',
    'src/lib/workflows/cost-coverage-path.ts',
    'src/lib/program/prototype-source.ts',
    'vite.config.ts',
    'package.json',
    'package-lock.json',
  ])
    expect(p.git(f.commit, path)).toEqual(p.git(f.parent, path));
  expect(p.git(f.commit, 'vite.config.ts').toString()).toContain(
    'testTimeout: 30000',
  );
});

it('admits only actual reviewed current test bytes with a six-field source-only result', () => {
  expect(admit()).toEqual({
    module: 'single-capture-revocation-test-probe',
    source_commit: f.commit,
    path: f.path,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  });
});

for (const [name, patch] of [
  ['wrong path', { path: 'tests/cycle33-v1-source-admission.test.ts' }],
  ['unknown original SHA', { sha256: '0'.repeat(64) }],
  ['replacement SHA instead of original', { sha256: f.sha256 }],
  ['unknown original blob', { blob: '0'.repeat(40) }],
  ['replacement blob instead of original', { blob: f.blob }],
] as const)
  it(`rejects ${name} without updating historical metadata`, () => {
    expect(() => admit({}, reviewed(), { ...metadata(), ...patch })).toThrow(
      'Exact original revocation probe metadata required',
    );
  });

it('rejects absent original metadata', () => {
  expect(() => admit({}, reviewed(), null as never)).toThrow(
    'Exact original revocation probe metadata required',
  );
});

for (const commit of [f.published, f.parent, f.commit])
  it(`rejects a non-commit object for ${commit}`, () => {
    expect(() =>
      admit({ type: (c) => (c === commit ? 'tree' : p.type(c)) }),
    ).toThrow('Exact sole-parent regular M1 revocation test author required');
  });

for (const parent of ['0'.repeat(40), `${f.parent} ${f.parent}`])
  it(`rejects non-exact author parent ${parent}`, () => {
    expect(() =>
      admit({ parent: (c) => (c === f.commit ? parent : p.parent(c)) }),
    ).toThrow('Exact sole-parent regular M1 revocation test author required');
  });

for (const delta of [
  '',
  `A\t${f.path}`,
  `M\t${f.path}\nM\tsrc/lib/workflows/recorded-cost-requirements.ts`,
  `M\t${f.path}\nA\ttests/unreviewed-extra.test.ts`,
  'M\ttests/foreign.test.ts',
])
  it(`rejects non-exact M1 delta ${JSON.stringify(delta)}`, () => {
    expect(() =>
      admit({ delta: (c) => (c === f.commit ? delta : p.delta(c)) }),
    ).toThrow('Exact sole-parent regular M1 revocation test author required');
  });

for (const commit of [f.published, f.parent, f.commit])
  for (const mode of ['100755', '120000'])
    it(`rejects nonregular test mode ${mode} at ${commit}`, () => {
      expect(() =>
        admit({
          mode: (c, path) =>
            c === commit && path === f.path ? mode : p.mode(c, path),
        }),
      ).toThrow('Exact sole-parent regular M1 revocation test author required');
    });

for (const commit of [f.published, f.parent])
  it(`rejects altered immutable test bytes at ${commit}`, () => {
    expect(() =>
      admit({
        git: (c, path) =>
          c === commit && path === f.path ? unknown : p.git(c, path),
      }),
    ).toThrow('Immutable original revocation test bytes required');
  });

it('does not admit the unchanged old test as the reviewed new probe', () => {
  expect(() =>
    admit({
      git: (c, path) =>
        c === f.commit && path === f.path ? original() : p.git(c, path),
    }),
  ).toThrow('Fresh exact reviewed revocation probe required');
});

it('rejects reviewed bytes that remove an original privacy assertion', () => {
  expect(() =>
    admit({
      git: (c, path) =>
        c === f.commit && path === f.path
          ? Buffer.from(
              reviewed()
                .toString()
                .replace('    expect(result).toBeUndefined();\n', ''),
            )
          : p.git(c, path),
    }),
  ).toThrow('Every original revocation assertion and case must remain');
});

it('rejects unknown supplied current bytes even when disk remains reviewed', () => {
  expect(() => admit({}, unknown)).toThrow(
    'Fresh exact reviewed revocation probe required',
  );
});

it('rejects current on-disk drift from the reviewed test', () => {
  expect(() =>
    admit({ read: (path) => (path === f.path ? unknown : p.read(path)) }),
  ).toThrow('Fresh exact reviewed revocation probe required');
});

it('rejects a missing current test instead of restoring historical evidence', () => {
  expect(() =>
    admit({ read: (path) => (path === f.path ? missing() : p.read(path)) }),
  ).toThrow('Missing exact source');
});

it('rechecks the exact test after the first successful current read', () => {
  let reads = 0;
  expect(() =>
    admit({
      read: (path) =>
        path === f.path && ++reads === 2 ? unknown : p.read(path),
    }),
  ).toThrow('Final fresh revocation probe required');
  expect(reads).toBe(2);
});

it('rejects agreed but fabricated historical, supplied and on-disk current bytes', () => {
  expect(() =>
    admit(
      {
        git: (c, path) =>
          c === f.commit && path === f.path ? unknown : p.git(c, path),
        read: (path) => (path === f.path ? unknown : p.read(path)),
      },
      unknown,
    ),
  ).toThrow('Every original revocation assertion and case must remain');
});

const costPath = 'src/lib/workflows/cost-coverage-path.ts';
for (const route of [
  {
    label: 'original execution Finance consumer',
    invoke: s.admitCycle33ExecutionSource,
    parent: s.cycle33ExecutionParent,
    original_commit: '98e4c39f3135b0b8177e2cc50980c1814fdcb2ff',
    module: 'cost-selection-current-authority',
    denied: 'Exact current Cycle33 execution source required',
    other: 'docs/program/CYCLE33_EXECUTION_COST_SELECTION.md',
    other_denied: 'Exact current Cycle33 execution source required',
    final_read: 6,
    final_denied: 'Exact current Cycle33 execution companion required',
  },
  {
    label: 'original V1 Finance companion consumer',
    invoke: s.admitCycle33V1Source,
    parent: s.cycle33V1Parent,
    original_commit: 'ad2830e5677539ea2c4922377b7a184386e4a9e1',
    module: 'recorded-time-kind-review',
    denied: 'Exact immutable original V1 companion required',
    other: 'docs/program/CYCLE33_RECORDED_TIME_KIND_REVIEW.md',
    other_denied: 'Exact current reviewed V1 companion required',
    final_read: 3,
    final_denied: 'Exact immutable original V1 companion required',
  },
]) {
  const invoke = (ports?: Partial<Ports>, current = p.read(costPath)) =>
    route.invoke(costPath, current, p.git(route.parent, costPath), ports);

  it(`${route.label}: retains the exact original six-field source result`, () => {
    expect(invoke()).toEqual({
      module: route.module,
      source_commit: route.original_commit,
      path: costPath,
      authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
      business_authority: false,
      restore_adapter: false,
    });
  });

  it(`${route.label}: rejects unknown probe bytes with the original route error`, () => {
    expect(() =>
      invoke({ read: (path) => (path === f.path ? unknown : p.read(path)) }),
    ).toThrow(route.denied);
  });

  it(`${route.label}: rejects missing probe bytes without a replacement`, () => {
    expect(() =>
      invoke({ read: (path) => (path === f.path ? missing() : p.read(path)) }),
    ).toThrow();
  });

  it(`${route.label}: never permits a native replacement through test admission`, () => {
    expect(() => invoke({}, unknown)).toThrow(
      route.label === 'original execution Finance consumer'
        ? 'Exact current Cycle33 execution source required'
        : 'Fresh exact reviewed V1 source required',
    );
  });

  it(`${route.label}: rejects another companion without applying the probe exception`, () => {
    expect(() =>
      invoke({
        read: (path) => (path === route.other ? unknown : p.read(path)),
      }),
    ).toThrow(route.other_denied);
  });

  it(`${route.label}: preserves final fresh probe checks through the original chain`, () => {
    let reads = 0;
    expect(() =>
      invoke({
        read: (path) =>
          path === f.path && ++reads === route.final_read
            ? unknown
            : p.read(path),
      }),
    ).toThrow(route.final_denied);
    expect(reads).toBe(route.final_read);
  });
}

it('does not offer the test successor to a different original execution owner', () => {
  const path = 'src/lib/workflows/task-receipt-reconciliation.ts',
    companion = 'tests/cycle33-execution-task-continuity.test.ts';
  expect(() =>
    s.admitCycle33ExecutionSource(
      path,
      p.read(path),
      p.git(s.cycle33ExecutionParent, path),
      { read: (path) => (path === companion ? unknown : p.read(path)) },
    ),
  ).toThrow('Exact current Cycle33 execution companion required');
});
