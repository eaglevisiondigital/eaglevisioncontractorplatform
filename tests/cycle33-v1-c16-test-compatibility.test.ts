import { createHash } from 'node:crypto';
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
  cycle33V1C16TestCompatibility: {
    commit: string;
    parent: string;
    published: string;
    path: string;
    sha256: string;
    blob: string;
    published_sha256: string;
    published_blob: string;
    index: string;
    index_sha256: string;
  };
  admitCycle33V1C16TestCompatibility: (
    file: { path: string; sha256: string },
    current: Buffer,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const consumer: {
  validateCycle16Manifest: (manifest: unknown, read?: Ports['read']) => unknown;
} = await import(
  new URL('../scripts/check-cycle16-integrity.mjs', import.meta.url).href
);
const p = source.cycle25SourcePorts,
  fixed = source.cycle33V1C16TestCompatibility,
  metadata = { path: fixed.path, sha256: fixed.published_sha256 },
  current = () => p.git(fixed.commit, fixed.path),
  manifest = () => JSON.parse(readFileSync(fixed.index, 'utf8')),
  hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex'),
  blob = (bytes: Buffer) =>
    createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex');

describe('finite C16 test-only successor preserves immutable original evidence', () => {
  it('pins the real original publisher, unchanged index and sole M1 author', () => {
    expect(Object.isFrozen(fixed)).toBe(true);
    expect(fixed).toEqual({
      commit: '8e634b247e09ee589d3a797f5fbfb4651c7146e5',
      parent: '3660a7e6e3d260f0cef54200f723074278f155d7',
      published: 'd62aa76ae03d64863c12dc92ce6f030e37974518',
      path: 'tests/cycle16-integration.test.ts',
      sha256:
        '4390f6bf0595f4cd7b34bba2d2364fba80748e0227a36dc28dd897f417e53fd5',
      blob: '0ce51ed8d35be7406f044896a6b89fa10d15cd39',
      published_sha256:
        'e92bf92bf96a87b7005ab715406ae424e2f2ccb4ec28da45a3cfc14412f4b247',
      published_blob: 'f5ba8b49ff15520dc6170fac1e2984d6f80b382d',
      index: 'docs/program/CYCLE16_DELIVERY_INDEX.json',
      index_sha256:
        '8cf7783a93dfb523b175bc793813ea28c3ab4dacbadc45453e09317d7da045be',
    });
    expect(p.parent(fixed.commit)).toBe(fixed.parent);
    expect(p.delta(fixed.commit)).toBe(`M\t${fixed.path}`);
    const original = p.git(fixed.published, fixed.path),
      index = p.git(fixed.parent, fixed.index);
    expect(hash(original)).toBe(fixed.published_sha256);
    expect(blob(original)).toBe(fixed.published_blob);
    expect(p.git(fixed.parent, fixed.path)).toEqual(original);
    expect(hash(current())).toBe(fixed.sha256);
    expect(blob(current())).toBe(fixed.blob);
    expect(hash(index)).toBe(fixed.index_sha256);
    expect(p.read(fixed.index)).toEqual(index);
    expect(JSON.parse(index.toString()).independent_review_commit).toBe(
      '9b73bdf733dec476a6ce7899ffd48d6a61140e8b',
    );
    expect(manifest().independent_files[0]).toEqual(metadata);
  });

  it('admits actual reviewed bytes with only source-lineage authority', () => {
    expect(
      source.admitCycle33V1C16TestCompatibility(metadata, current()),
    ).toEqual({
      module: 'cycle16-independent-review-test-compatibility',
      source_commit: fixed.commit,
      path: fixed.path,
      authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
      business_authority: false,
      restore_adapter: false,
    });
  });

  it.each([
    'src/lib/workflows/addon-readiness-guide.ts',
    'docs/program/CYCLE16_INTEGRATION_REVIEW.md',
    '../private',
  ])(
    'rejects another path rather than extending test admission: %s',
    (path) => {
      expect(() =>
        source.admitCycle33V1C16TestCompatibility(
          { ...metadata, path },
          current(),
        ),
      ).toThrow('Exact historical Cycle16 independent test metadata required');
    },
  );

  it.each(['0'.repeat(64), fixed.sha256, 'not-a-hash'])(
    'rejects replaced historical metadata, including the current hash: %s',
    (sha256) => {
      expect(() =>
        source.admitCycle33V1C16TestCompatibility(
          { ...metadata, sha256 },
          current(),
        ),
      ).toThrow('Exact historical Cycle16 independent test metadata required');
    },
  );

  it.each(['tree', 'blob'])(
    'rejects a non-commit reviewed object: %s',
    (type) => {
      expect(() =>
        source.admitCycle33V1C16TestCompatibility(metadata, current(), {
          type: (commit) => (commit === fixed.commit ? type : p.type(commit)),
        }),
      ).toThrow(
        'Exact sole-parent regular Cycle16 test-only correction required',
      );
    },
  );

  it('rejects a non-commit original publisher', () => {
    expect(() =>
      source.admitCycle33V1C16TestCompatibility(metadata, current(), {
        type: (commit) =>
          commit === fixed.published ? 'tree' : p.type(commit),
      }),
    ).toThrow(
      'Exact sole-parent regular Cycle16 test-only correction required',
    );
  });

  it('rejects any other parent rather than accepting ancestry', () => {
    expect(() =>
      source.admitCycle33V1C16TestCompatibility(metadata, current(), {
        parent: () => `${fixed.parent} ${fixed.published}`,
      }),
    ).toThrow(
      'Exact sole-parent regular Cycle16 test-only correction required',
    );
  });

  it.each([`A\t${fixed.path}`, `M\t${fixed.path}\nM\tsrc/App.tsx`, ''])(
    'rejects a different author delta: %s',
    (delta) => {
      expect(() =>
        source.admitCycle33V1C16TestCompatibility(metadata, current(), {
          delta: () => delta,
        }),
      ).toThrow(
        'Exact sole-parent regular Cycle16 test-only correction required',
      );
    },
  );

  it.each(['published', 'parent', 'commit'] as const)(
    'rejects executable or symlink %s test mode',
    (key) => {
      expect(() =>
        source.admitCycle33V1C16TestCompatibility(metadata, current(), {
          mode: (commit, path) =>
            commit === fixed[key] && path === fixed.path
              ? '120000'
              : p.mode(commit, path),
        }),
      ).toThrow(
        'Exact sole-parent regular Cycle16 test-only correction required',
      );
    },
  );

  it('rejects a non-regular historical index', () => {
    expect(() =>
      source.admitCycle33V1C16TestCompatibility(metadata, current(), {
        mode: (commit, path) =>
          commit === fixed.parent && path === fixed.index
            ? '100755'
            : p.mode(commit, path),
      }),
    ).toThrow(
      'Exact sole-parent regular Cycle16 test-only correction required',
    );
  });

  it.each(['published', 'parent'] as const)(
    'rejects changed immutable %s test bytes',
    (key) => {
      expect(() =>
        source.admitCycle33V1C16TestCompatibility(metadata, current(), {
          git: (commit, path) =>
            commit === fixed[key] && path === fixed.path
              ? Buffer.from('unreviewed original')
              : p.git(commit, path),
        }),
      ).toThrow('Immutable original Cycle16 independent test bytes required');
    },
  );

  it('rejects wrong author raw bytes even when supplied current bytes match them', () => {
    const forged = Buffer.from('unreviewed current test');
    expect(() =>
      source.admitCycle33V1C16TestCompatibility(metadata, forged, {
        git: (commit, path) =>
          commit === fixed.commit && path === fixed.path
            ? forged
            : p.git(commit, path),
      }),
    ).toThrow('Fresh exact reviewed Cycle16 test correction required');
  });

  it.each(['modified', 'original'] as const)(
    'rejects supplied %s bytes instead of the actual reviewed correction',
    (kind) => {
      const bytes =
        kind === 'modified'
          ? Buffer.concat([current(), Buffer.from('\n')])
          : p.git(fixed.published, fixed.path);
      expect(() =>
        source.admitCycle33V1C16TestCompatibility(metadata, bytes),
      ).toThrow('Fresh exact reviewed Cycle16 test correction required');
    },
  );

  it('rejects altered historical index Git bytes even if current index matches them', () => {
    const forged = Buffer.from('{}');
    expect(() =>
      source.admitCycle33V1C16TestCompatibility(metadata, current(), {
        git: (commit, path) =>
          commit === fixed.parent && path === fixed.index
            ? forged
            : p.git(commit, path),
        read: (path) => (path === fixed.index ? forged : p.read(path)),
      }),
    ).toThrow('Exact unchanged historical Cycle16 index required');
  });

  it('rejects changed current index bytes with historical Git evidence intact', () => {
    expect(() =>
      source.admitCycle33V1C16TestCompatibility(metadata, current(), {
        read: (path) =>
          path === fixed.index ? Buffer.from('{}') : p.read(path),
      }),
    ).toThrow('Exact unchanged historical Cycle16 index required');
  });

  it('cannot reconstruct a missing current index from its original Git bytes', () => {
    expect(() =>
      source.admitCycle33V1C16TestCompatibility(metadata, current(), {
        read: (path) => {
          if (path === fixed.index) throw Error('missing current index');
          return p.read(path);
        },
      }),
    ).toThrow('missing current index');
  });

  it('rereads the actual current test after an earlier successful admission', () => {
    let drift = false;
    const read = (path: string) =>
      path === fixed.path && drift ? Buffer.from('drift') : p.read(path);
    expect(
      source.admitCycle33V1C16TestCompatibility(metadata, current(), {
        read,
      }),
    ).toHaveProperty('source_commit', fixed.commit);
    drift = true;
    expect(() =>
      source.admitCycle33V1C16TestCompatibility(metadata, current(), {
        read,
      }),
    ).toThrow('Fresh exact reviewed Cycle16 test correction required');
  });

  it('cannot reconstruct a missing current test from reviewed Git bytes', () => {
    expect(() =>
      source.admitCycle33V1C16TestCompatibility(metadata, current(), {
        read: (path) => {
          if (path === fixed.path) throw Error('missing current test');
          return p.read(path);
        },
      }),
    ).toThrow('missing current test');
  });

  it('the actual C16 consumer preserves original metadata and admits the fixed M1 test', () => {
    expect(p.read(fixed.index)).toEqual(p.git(fixed.parent, fixed.index));
    expect(consumer.validateCycle16Manifest(manifest())).toEqual({
      packages: 6,
      author_files: 30,
      independent_files: 2,
      retained_author_files: 313,
    });
    expect(manifest().independent_files[0]).toEqual(metadata);
  });

  it('the C16 consumer denies current test drift instead of reading the original test', () => {
    const read = (path: string) =>
      path === fixed.path ? Buffer.from('drift') : p.read(path);
    expect(() => consumer.validateCycle16Manifest(manifest(), read)).toThrow(
      `Reviewed Cycle16 source changed: ${fixed.path}`,
    );
  });

  it('the C16 consumer denies a missing current test', () => {
    const read = (path: string) => {
      if (path === fixed.path) throw Error('missing current test');
      return p.read(path);
    };
    expect(() => consumer.validateCycle16Manifest(manifest(), read)).toThrow(
      'missing current test',
    );
  });

  it.each(['0'.repeat(64), fixed.sha256])(
    'the C16 consumer denies replacement independent hash metadata: %s',
    (sha256) => {
      const m = manifest();
      m.independent_files[0].sha256 = sha256;
      expect(() => consumer.validateCycle16Manifest(m)).toThrow(
        `Reviewed Cycle16 source changed: ${fixed.path}`,
      );
    },
  );

  it('the C16 consumer denies a different valid historical review pointer', () => {
    const m = manifest();
    m.independent_review_commit = fixed.published;
    expect(() => consumer.validateCycle16Manifest(m)).toThrow(
      `Reviewed Cycle16 source changed: ${fixed.path}`,
    );
  });

  it('the C16 consumer denies changed current index bytes', () => {
    const read = (path: string) =>
      path === fixed.index ? Buffer.from('{}') : p.read(path);
    expect(() => consumer.validateCycle16Manifest(manifest(), read)).toThrow(
      `Reviewed Cycle16 source changed: ${fixed.path}`,
    );
  });
});
