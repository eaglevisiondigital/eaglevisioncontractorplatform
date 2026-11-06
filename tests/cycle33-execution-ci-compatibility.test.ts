import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Ports = {
  read: (path: string) => Buffer;
  git: (commit: string, path: string) => Buffer;
  type: (commit: string) => string;
  parent: (commit: string) => string;
  delta: (commit: string) => string;
  mode: (commit: string, path: string) => string;
};
const source: {
  cycle25SourcePorts: Ports;
  cycle33ExecutionCiCompatibility: {
    commit: string;
    parent: string;
    published: string;
    path: string;
    sha256: string;
    blob: string;
    published_sha256: string;
    published_blob: string;
  };
  admitCycle33ExecutionCiCompatibility: (
    file: { path: string; sha256: string; blob: string },
    current: Buffer,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const consumer: {
  validateCycle22Manifest: (
    manifest: unknown,
    ports?: Partial<Ports>,
  ) => unknown;
} = await import(new URL('../scripts/check-cycle22.mjs', import.meta.url).href);
const p = source.cycle25SourcePorts,
  fixed = source.cycle33ExecutionCiCompatibility,
  metadata = {
    path: fixed.path,
    sha256: fixed.published_sha256,
    blob: fixed.published_blob,
  },
  current = () => p.git(fixed.commit, fixed.path),
  manifest = () =>
    JSON.parse(
      readFileSync('docs/program/CYCLE22_SOURCE_MANIFEST.json', 'utf8'),
    );

describe('exact one-file Cycle22 independent test compatibility', () => {
  it('pins the literal reviewed commit, original metadata and unchanged source parent', () => {
    expect(Object.isFrozen(fixed)).toBe(true);
    expect(fixed).toEqual({
      commit: '649c2399fa954fdc50a1c6a1eab592c0f5b0ae18',
      parent: 'eec71f86a39d58d6019b4af196b040f9269ae96d',
      published: 'b8e0cade3ae7de9773ce11cc0ab2cbae5274cd69',
      path: 'tests/cycle22-independent-integration-review.test.ts',
      sha256:
        'd92940efc89b03c013608835e15f3babcfbaf212b8b4d3b7e8daa028cb92707b',
      blob: 'abb7472204298bc93e0bb7df80abd44518be94a2',
      published_sha256:
        '49fa5cf5d861c39518d8ffb26bf00d46f0c935a4fec6768dd15dcc323a35602b',
      published_blob: '7c1d67d95fe772a1d17070cc2e90a281c65988ab',
    });
    expect(p.parent(fixed.commit)).toBe(fixed.parent);
    expect(p.delta(fixed.commit)).toBe(`M\t${fixed.path}`);
  });
  it('admits only the exact current test without runtime or restoration authority', () => {
    expect(
      source.admitCycle33ExecutionCiCompatibility(metadata, current()),
    ).toEqual({
      module: 'cycle22-independent-review-test-compatibility',
      source_commit: fixed.commit,
      path: fixed.path,
      authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
      business_authority: false,
      restore_adapter: false,
    });
  });
  it.each([
    'src/lib/workflows/cost-coverage-path.ts',
    '../private',
    'docs/program/CYCLE22_INDEPENDENT_REVIEW.json',
  ])('rejects every other path: %s', (path) => {
    expect(() =>
      source.admitCycle33ExecutionCiCompatibility(
        { ...metadata, path },
        current(),
      ),
    ).toThrow('metadata');
  });
  it.each(['sha256', 'blob'] as const)(
    'rejects changed historical %s',
    (key) => {
      expect(() =>
        source.admitCycle33ExecutionCiCompatibility(
          { ...metadata, [key]: '0'.repeat(key === 'sha256' ? 64 : 40) },
          current(),
        ),
      ).toThrow('metadata');
    },
  );
  it('never replaces the historical metadata with the corrected test hash', () => {
    expect(() =>
      source.admitCycle33ExecutionCiCompatibility(
        { ...metadata, sha256: fixed.sha256 },
        current(),
      ),
    ).toThrow('metadata');
  });
  it.each(['type', 'parent', 'delta'] as const)(
    'rejects changed commit %s evidence',
    (key) => {
      expect(() =>
        source.admitCycle33ExecutionCiCompatibility(metadata, current(), {
          [key]: () => 'unreviewed',
        }),
      ).toThrow('test-only');
    },
  );
  it.each(['published', 'parent', 'commit'] as const)(
    'rejects changed %s file mode',
    (key) => {
      const mode = (commit: string, path: string) =>
        commit === fixed[key] ? '120000' : p.mode(commit, path);
      expect(() =>
        source.admitCycle33ExecutionCiCompatibility(metadata, current(), {
          mode,
        }),
      ).toThrow('test-only');
    },
  );
  it('rejects an unrelated additional modified source in the author delta', () => {
    expect(() =>
      source.admitCycle33ExecutionCiCompatibility(metadata, current(), {
        delta: () => `M\t${fixed.path}\nM\tsrc/App.tsx`,
      }),
    ).toThrow('test-only');
  });
  it('rejects a wrong reviewed Git object even when supplied current bytes match it', () => {
    const forged = Buffer.from('unreviewed'),
      git = (commit: string, path: string) =>
        commit === fixed.commit ? forged : p.git(commit, path);
    expect(() =>
      source.admitCycle33ExecutionCiCompatibility(metadata, forged, { git }),
    ).toThrow('Fresh exact');
  });
  it('rejects altered supplied current bytes and never admits unchanged predecessor bytes', () => {
    for (const bytes of [
      Buffer.concat([current(), Buffer.from('\n')]),
      p.git(fixed.parent, fixed.path),
    ])
      expect(() =>
        source.admitCycle33ExecutionCiCompatibility(metadata, bytes),
      ).toThrow('Fresh exact');
  });
  it.each(['published', 'parent'] as const)(
    'rejects altered original %s bytes',
    (key) => {
      const git = (commit: string, path: string) =>
        commit === fixed[key] ? Buffer.from('unreviewed') : p.git(commit, path);
      expect(() =>
        source.admitCycle33ExecutionCiCompatibility(metadata, current(), {
          git,
        }),
      ).toThrow('Immutable original');
    },
  );
  it('rereads the actual current file after a prior successful admission', () => {
    let drift = false;
    const read = (path: string) =>
      path === fixed.path && drift ? Buffer.from('unreviewed') : p.read(path);
    expect(
      source.admitCycle33ExecutionCiCompatibility(metadata, current(), {
        read,
      }),
    ).toHaveProperty('source_commit', fixed.commit);
    drift = true;
    expect(() =>
      source.admitCycle33ExecutionCiCompatibility(metadata, current(), {
        read,
      }),
    ).toThrow('Fresh exact');
  });
  it('cannot restore a missing current test from immutable Git evidence', () => {
    expect(() =>
      source.admitCycle33ExecutionCiCompatibility(metadata, current(), {
        read: () => {
          throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        },
      }),
    ).toThrow('missing');
  });
  it('preserves every original independent metadata byte and admits the exact C22 preflight', () => {
    const bytes = readFileSync('docs/program/CYCLE22_SOURCE_MANIFEST.json');
    expect(bytes).toEqual(
      p.git(fixed.parent, 'docs/program/CYCLE22_SOURCE_MANIFEST.json'),
    );
    expect(consumer.validateCycle22Manifest(manifest(), p)).toMatchObject({
      packages: 5,
      author_files: 25,
      independent_files: 2,
    });
  });
  it('the C22 consumer rejects current test drift without a historical-file fallback', () => {
    const read = (path: string) =>
      path === fixed.path ? Buffer.from('unreviewed') : p.read(path);
    expect(() =>
      consumer.validateCycle22Manifest(manifest(), { ...p, read }),
    ).toThrow('Exact published Cycle22 bytes/blob required');
  });
  it.each(['sha256', 'blob'] as const)(
    'the C22 consumer rejects changed independent %s metadata',
    (key) => {
      const m = manifest(),
        entry = m.independent_files.find(
          (file: { path: string }) => file.path === fixed.path,
        );
      entry[key] = '0'.repeat(key === 'sha256' ? 64 : 40);
      expect(() => consumer.validateCycle22Manifest(m, p)).toThrow(
        'Exact published Cycle22 bytes/blob required',
      );
    },
  );
});
