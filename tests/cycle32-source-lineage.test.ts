import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Spec = {
  module: string;
  owner: string;
  commit: string;
  nativeCorrection?: { commit: string };
  permitted: readonly string[];
  modified: readonly string[];
  added: readonly string[];
};
type Ports = {
  git: (commit: string, path: string) => Buffer;
  read: (path: string) => Buffer;
  parent: (commit: string) => string;
  type: (commit: string) => string;
  mode: (commit: string, path: string) => string;
  delta: (commit: string) => string;
};
type Evidence = { path: string; sha256: string; blob: string };
const source: {
  cycle25Parent: string;
  cycle32Parent: string;
  cycle32Authors: readonly Spec[];
  cycle25SourcePorts: Ports;
  validateCycle32ForwardSpec: (spec: Spec, ports?: Ports) => unknown;
  admitCycle32Forward: (
    path: string,
    current: Buffer,
    previous: Buffer,
    ports?: Ports,
  ) => Record<string, unknown>;
  admitCycle25Source: (
    path: string,
    current: Buffer,
    previous: Buffer,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
  inspectCycle32Sources: (
    ports?: Partial<Ports> & { requireCombined?: boolean },
  ) => Record<string, unknown>;
  inspectCycle28Sources: (
    ports?: Partial<Ports> & { requireCombined?: boolean },
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const legacy: {
  validateCycle21PublishedSource: (
    file: Evidence,
    commit: string,
    current: Buffer,
    published: Buffer,
    ports?: Partial<Ports>,
  ) => void;
  validateCycle21Manifest: (
    value: unknown,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
} = await import(new URL('../scripts/check-cycle21.mjs', import.meta.url).href);
const ports = source.cycle25SourcePorts;
const baselineRead = (path: string) => {
  if (source.cycle32Authors.some((s) => s.added.includes(path)))
    throw Object.assign(new Error('Absent from original parent'), {
      code: 'ENOENT',
    });
  return ports.git(source.cycle32Parent, path);
};
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const blob = (bytes: Buffer) =>
  createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
function commits(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, v]) =>
    key === 'source_commit' && typeof v === 'string' ? [v] : commits(v),
  );
}

it('admits only four exact Git authors and the exact Voice correction, with no business or restoration authority', () => {
  expect(source.cycle32Parent).toBe('43e622b16aa952f5dc2fe7ae9f96260b47682c2e');
  expect(source.cycle32Authors.map((s) => s.commit)).toEqual([
    '452d57049e60c5228718fc7647346faab7ac4409',
    '8fec4897bb116c3234e521be2b23260b9f2e503f',
    '34cae8398fc135b55452e86bdb3b62a8b76d13d6',
    '243a6c79ea9324552ac549c31a280608604453d6',
  ]);
  const paths = source.cycle32Authors.flatMap((s) => [
    ...s.modified,
    ...s.added,
  ]);
  expect(new Set(paths).size).toBe(12);
  expect(source.inspectCycle32Sources({ requireCombined: true })).toMatchObject(
    {
      complete_combined: true,
      business_authority: false,
      restore_adapter: false,
    },
  );
});
it('retains optional exact-parent inspection without claiming a combined implementation', () => {
  expect(
    source.inspectCycle32Sources({ read: baselineRead }).complete_combined,
  ).toBe(false);
  expect(() =>
    source.inspectCycle32Sources({
      read: baselineRead,
      requireCombined: true,
    }),
  ).toThrow('absent');
});
it('preserves the original C25 to C28 Intelligence chain and reaches the C32 author exactly once', () => {
  const spec = source.cycle32Authors[2],
    path = spec.modified[0];
  const result = source.admitCycle25Source(
    path,
    ports.read(path),
    ports.git(source.cycle25Parent, path),
  );
  expect(result).toMatchObject({
    path,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
  });
  expect(commits(result)).toContain('44064cac9f4cde8c746ef080b3e613aff94ff410');
  expect(commits(result).filter((c) => c === spec.commit)).toHaveLength(1);
  expect(source.inspectCycle28Sources({ requireCombined: true })).toMatchObject(
    {
      complete_combined: true,
    },
  );
});

describe.each(source.cycle32Authors)(
  '$module exact source boundary',
  (spec) => {
    const path = spec.modified[0];
    it('binds actual raw Git baseline and actual fixed endpoint through both native and legacy entry points', () => {
      expect(source.validateCycle32ForwardSpec(spec)).toMatchObject({
        source_commit: spec.commit,
        native_correction: spec.nativeCorrection?.commit ?? null,
      });
      expect(
        source.admitCycle32Forward(
          path,
          ports.read(path),
          ports.git(source.cycle32Parent, path),
        ),
      ).toMatchObject({ source_commit: spec.commit });
      if (spec.module !== 'owner-filter-navigation')
        expect(
          source.admitCycle25Source(
            path,
            ports.read(path),
            ports.git(source.cycle32Parent, path),
          ),
        ).toMatchObject({ source_commit: spec.commit, path });
    });
    it.each(['', '0'.repeat(40), 'a'.repeat(40)])(
      'rejects substituted or unpublished author %s',
      (commit) =>
        expect(() =>
          source.validateCycle32ForwardSpec({ ...spec, commit }),
        ).toThrow('fixed'),
    );
    it.each(['a'.repeat(40), `${source.cycle32Parent} ${'b'.repeat(40)}`])(
      'rejects a different or merged author parent %s',
      (parent) =>
        expect(() =>
          source.validateCycle32ForwardSpec(spec, {
            ...ports,
            parent: (c) => (c === spec.commit ? parent : ports.parent(c)),
          }),
        ).toThrow('single-parent'),
    );
    it('rejects a non-commit author object', () => {
      expect(() =>
        source.validateCycle32ForwardSpec(spec, {
          ...ports,
          type: () => 'tree',
        }),
      ).toThrow('single-parent');
    });
    it.each(['100755', '120000', '160000'])(
      'rejects executable, symlink and submodule mode %s',
      (mode) =>
        expect(() =>
          source.validateCycle32ForwardSpec(spec, {
            ...ports,
            mode: () => mode,
          }),
        ).toThrow('Regular'),
    );
    it('rejects an extra protected change in the original author delta', () => {
      expect(() =>
        source.validateCycle32ForwardSpec(spec, {
          ...ports,
          delta: (c) => ports.delta(c) + '\nM\tREADME.md',
        }),
      ).toThrow('delta');
    });
    it.each(['permitted', 'modified', 'added'] as const)(
      'cannot widen fixed %s ownership',
      (field) =>
        expect(() =>
          source.validateCycle32ForwardSpec({
            ...spec,
            [field]: [...spec[field], 'README.md'],
          }),
        ).toThrow('ownership'),
    );
    it('cannot invent a correction chain or another owner', () => {
      expect(() =>
        source.validateCycle32ForwardSpec({
          ...spec,
          nativeCorrection: { commit: 'a'.repeat(40) },
        }),
      ).toThrow('correction');
      expect(() =>
        source.validateCycle32ForwardSpec({ ...spec, owner: '/root/unknown' }),
      ).toThrow('fixed');
    });
    it('rejects a substituted immutable baseline even when current bytes are exact', () => {
      expect(() =>
        source.admitCycle32Forward(
          path,
          ports.read(path),
          Buffer.concat([
            ports.git(source.cycle32Parent, path),
            Buffer.from('\n// different baseline'),
          ]),
        ),
      ).toThrow('parent source');
    });
    it('rereads current native bytes after immutable Git objects were warmed', () => {
      source.inspectCycle32Sources({ requireCombined: true });
      expect(() =>
        source.inspectCycle32Sources({
          read: (p) =>
            p === path
              ? Buffer.concat([ports.read(p), Buffer.from('\n// unreviewed')])
              : ports.read(p),
        }),
      ).toThrow('fixed');
    });
    it.each([0, 1])(
      'rejects missing or changed author evidence file %i',
      (i) => {
        const evidence = spec.added[i];
        expect(() =>
          source.inspectCycle32Sources({
            read: (p) =>
              p === evidence
                ? Buffer.from('changed')
                : spec.modified.includes(p)
                  ? ports.git(spec.nativeCorrection?.commit ?? spec.commit, p)
                  : ports.read(p),
          }),
        ).toThrow('test/document');
      },
    );
    it('does not accept copied evidence as a package with unchanged native source', () => {
      expect(() =>
        source.inspectCycle32Sources({
          read: (p) =>
            p === path ? ports.git(source.cycle32Parent, p) : ports.read(p),
        }),
      ).toThrow('Partial');
    });
  },
);

describe('exact two-step Voice chain', () => {
  const spec = source.cycle32Authors[3],
    correction = spec.nativeCorrection!.commit;
  it('rejects the first author endpoint after the final reviewed correction', () => {
    const path = spec.modified[0];
    expect(() =>
      source.admitCycle32Forward(
        path,
        ports.git(spec.commit, path),
        ports.git(source.cycle32Parent, path),
      ),
    ).toThrow('fixed');
  });
  it.each([source.cycle32Parent, `${spec.commit} ${'a'.repeat(40)}`])(
    'rejects skipped or merged correction parent %s',
    (parent) =>
      expect(() =>
        source.validateCycle32ForwardSpec(spec, {
          ...ports,
          parent: (c) => (c === correction ? parent : ports.parent(c)),
        }),
      ).toThrow('direct-parent'),
  );
  it('rejects a non-commit correction', () => {
    expect(() =>
      source.validateCycle32ForwardSpec(spec, {
        ...ports,
        type: (c) => (c === correction ? 'tree' : ports.type(c)),
      }),
    ).toThrow('direct-parent');
  });
  it('rejects any missing or extra file in the exact M/M/M correction delta', () => {
    expect(() =>
      source.validateCycle32ForwardSpec(spec, {
        ...ports,
        delta: (c) =>
          c === correction ? `M\t${spec.modified[0]}` : ports.delta(c),
      }),
    ).toThrow('correction delta');
  });
  it('rejects a symlink final correction file after regular first-author files', () => {
    expect(() =>
      source.validateCycle32ForwardSpec(spec, {
        ...ports,
        mode: (c, p) => (c === correction ? '120000' : ports.mode(c, p)),
      }),
    ).toThrow('Regular');
  });
  it('requires final corrected test and document, not first-author evidence', () => {
    expect(() =>
      source.inspectCycle32Sources({
        read: (p) =>
          spec.added.includes(p) ? ports.git(spec.commit, p) : ports.read(p),
      }),
    ).toThrow('test/document');
  });
});

const originalField = '4681fc9d76a31044eded27b6f3340c2cb0b2c89c';
const taskPath = 'src/lib/workflows/task-correction-review.ts';
const publishedTask = ports.git(originalField, taskPath);
const taskEvidence = {
  path: taskPath,
  sha256: sha(publishedTask),
  blob: blob(publishedTask),
};
it('keeps the original C21 task hash/blob and author while admitting only the exact source successor', () => {
  expect(publishedTask).toEqual(ports.git(source.cycle32Parent, taskPath));
  expect(() =>
    legacy.validateCycle21PublishedSource(
      taskEvidence,
      originalField,
      ports.read(taskPath),
      publishedTask,
    ),
  ).not.toThrow();
  expect(() =>
    legacy.validateCycle21PublishedSource(
      taskEvidence,
      originalField,
      publishedTask,
      publishedTask,
    ),
  ).not.toThrow();
});
it.each(['sha256', 'blob'] as const)(
  'cannot replace original task %s with the new native evidence',
  (field) => {
    const current = ports.read(taskPath);
    expect(() =>
      legacy.validateCycle21PublishedSource(
        {
          ...taskEvidence,
          [field]: field === 'sha256' ? sha(current) : blob(current),
        },
        originalField,
        current,
        publishedTask,
      ),
    ).toThrow(`Exact published Cycle21 bytes/blob required: ${taskPath}`);
  },
);
it('rejects another original author, a changed task and another native path', () => {
  expect(() =>
    legacy.validateCycle21PublishedSource(
      taskEvidence,
      source.cycle32Authors[0].commit,
      ports.read(taskPath),
      publishedTask,
    ),
  ).toThrow('Exact published');
  expect(() =>
    legacy.validateCycle21PublishedSource(
      taskEvidence,
      originalField,
      Buffer.concat([ports.read(taskPath), Buffer.from('\n// changed')]),
      publishedTask,
    ),
  ).toThrow('Exact published');
  const path = 'src/components/workflows/TaskCorrectionReview.tsx',
    original = ports.git(originalField, path);
  expect(() =>
    legacy.validateCycle21PublishedSource(
      { path, sha256: sha(original), blob: blob(original) },
      originalField,
      Buffer.concat([original, Buffer.from('\n// changed')]),
      original,
    ),
  ).toThrow('Exact published');
});
it('does not accept source-lineage admission for any unknown path', () => {
  expect(() =>
    source.admitCycle32Forward(
      'README.md',
      ports.read('README.md'),
      ports.read('README.md'),
    ),
  ).toThrow('finite');
});
it('actual C21/22/23 manifest validators preserve their original inventories and accept the bounded combined source', async () => {
  const originalManifest = readFileSync(
    'docs/program/CYCLE21_SOURCE_MANIFEST.json',
  );
  expect(
    legacy.validateCycle21Manifest(JSON.parse(originalManifest.toString())),
  ).toMatchObject({ packages: 5, author_files: 25, protected_files: 128 });
  for (const cycle of [22, 23]) {
    const checker: Record<
      string,
      (value: unknown, p?: Partial<Ports>) => Record<string, unknown>
    > = await import(
      new URL(`../scripts/check-cycle${cycle}.mjs`, import.meta.url).href
    );
    const validate = checker[`validateCycle${cycle}Manifest`];
    const manifest = JSON.parse(
      readFileSync(`docs/program/CYCLE${cycle}_SOURCE_MANIFEST.json`, 'utf8'),
    ) as unknown;
    expect(validate(manifest)).toMatchObject({ packages: 5, author_files: 25 });
    expect(() =>
      validate(manifest, {
        read: (p) =>
          p === taskPath
            ? Buffer.concat([ports.read(p), Buffer.from('\n// tampered')])
            : ports.read(p),
      }),
    ).toThrow(`Exact published Cycle21 bytes/blob required: ${taskPath}`);
  }
  expect(readFileSync('docs/program/CYCLE21_SOURCE_MANIFEST.json')).toEqual(
    originalManifest,
  );
});
