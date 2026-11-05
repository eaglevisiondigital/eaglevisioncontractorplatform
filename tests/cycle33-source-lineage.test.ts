import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
type Spec = {
  module: string;
  commit: string;
  owner: string;
  cases: number;
  permitted: readonly string[];
  modified: readonly string[];
  added: readonly string[];
  nativeCorrection?: { commit: string };
};
type Ports = {
  git: (commit: string, path: string) => Buffer;
  read: (path: string) => Buffer;
  type: (commit: string) => string;
  parent: (commit: string) => string;
  delta: (commit: string) => string;
  mode: (commit: string, path: string) => string;
};
const source: {
  cycle33Parent: string;
  cycle33Authors: readonly Spec[];
  cycle25SourcePorts: Ports;
  validateCycle33ForwardSpec: (spec: Spec, ports?: Partial<Ports>) => unknown;
  admitCycle33Forward: (
    path: string,
    current: Buffer,
    previous: Buffer,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
  inspectCycle33Sources: (
    ports?: Partial<Ports> & { requireCombined?: boolean },
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const ports = source.cycle25SourcePorts;
const originalManifest = readFileSync(
  'docs/program/CYCLE32_SOURCE_MANIFEST.json',
);
it('admits exactly five bounded source packages and preserves the original C32 manifest', () => {
  expect(source.cycle33Parent).toBe('0597bb3330f22d69f68a67098e950693e0648172');
  expect(source.cycle33Authors.map((s) => s.module)).toEqual([
    'field-task-receipt-context',
    'customer-selection-privacy',
    'maintenance-input-continuity',
    'sync-proposal-privacy',
    'owner-continuity',
  ]);
  expect(source.inspectCycle33Sources({ requireCombined: true })).toMatchObject(
    {
      complete_combined: true,
      business_authority: false,
      restore_adapter: false,
    },
  );
  expect(readFileSync('docs/program/CYCLE32_SOURCE_MANIFEST.json')).toEqual(
    originalManifest,
  );
});
describe.each(source.cycle33Authors)(
  '$module finite source admission',
  (spec) => {
    const path = spec.modified[0];
    const current = () =>
      ports.git(spec.nativeCorrection?.commit ?? spec.commit, path);
    const previous = () => ports.git(source.cycle33Parent, path);
    it('validates the exact original author and current whole companion bundle', () => {
      expect(source.validateCycle33ForwardSpec(spec)).toMatchObject({
        source_commit: spec.commit,
        authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
      });
      expect(
        source.admitCycle33Forward(path, current(), previous()),
      ).toMatchObject({ source_commit: spec.commit });
    });
    it('denies unknown source, baseline and unowned path substitutions', () => {
      expect(() =>
        source.admitCycle33Forward(
          path,
          Buffer.concat([current(), Buffer.from('\n')]),
          previous(),
        ),
      ).toThrow();
      expect(() =>
        source.admitCycle33Forward(
          path,
          current(),
          Buffer.concat([previous(), Buffer.from('\n')]),
        ),
      ).toThrow();
      expect(() =>
        source.admitCycle33Forward('src/App.tsx', current(), previous()),
      ).toThrow();
    });
    it.each([
      'commit',
      'owner',
      'module',
      'cases',
      'modified',
      'added',
    ] as const)('denies mutated %s author metadata', (field) => {
      const bad = {
        ...spec,
        [field]: Array.isArray(spec[field]) ? [] : 'unreviewed',
      };
      expect(() => source.validateCycle33ForwardSpec(bad as Spec)).toThrow();
    });
    it.each(['type', 'parent', 'delta', 'mode'] as const)(
      'denies altered %s Git evidence',
      (field) => {
        const replacement =
          field === 'parent'
            ? () => `${source.cycle33Parent} ${source.cycle33Parent}`
            : () => 'unreviewed';
        expect(() =>
          source.validateCycle33ForwardSpec(spec, { [field]: replacement }),
        ).toThrow();
      },
    );
    it('rereads each companion and denies any drift after an earlier success', () => {
      for (const companion of spec.added) {
        let drift = false;
        const supplied = {
          read: (p: string) =>
            p === companion && drift
              ? Buffer.from('unreviewed')
              : ports.read(p),
        };
        expect(
          source.admitCycle33Forward(path, current(), previous(), supplied),
        ).toMatchObject({ source_commit: spec.commit });
        drift = true;
        expect(() =>
          source.admitCycle33Forward(path, current(), previous(), supplied),
        ).toThrow('companion');
      }
    });
    it('denies a missing companion instead of treating historical evidence as current source', () => {
      expect(() =>
        source.admitCycle33Forward(path, current(), previous(), {
          read: (p) => {
            if (p === spec.added[0])
              throw Object.assign(new Error('missing'), { code: 'ENOENT' });
            return ports.read(p);
          },
        }),
      ).toThrow();
    });
  },
);
it('retains baseline-only inspection without claiming current combined evidence', () => {
  const read = (p: string) => {
    if (source.cycle33Authors.some((s) => s.added.includes(p)))
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return ports.git(source.cycle33Parent, p);
  };
  expect(source.inspectCycle33Sources({ read })).toMatchObject({
    complete_combined: false,
  });
  expect(() =>
    source.inspectCycle33Sources({ read, requireCombined: true }),
  ).toThrow('absent');
});
it('retains the immutable original published source hashes', () => {
  for (const name of [
    'CYCLE21_SOURCE_MANIFEST.json',
    'CYCLE22_SOURCE_MANIFEST.json',
    'CYCLE23_SOURCE_MANIFEST.json',
    'CYCLE32_SOURCE_MANIFEST.json',
  ]) {
    const path = `docs/program/${name}`;
    expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(
      createHash('sha256')
        .update(ports.git(source.cycle33Parent, path))
        .digest('hex'),
    );
  }
});

it('freezes nested correction metadata and denies an invented child endpoint', () => {
  const spec = source.cycle33Authors[0];
  expect(Object.isFrozen(spec.nativeCorrection)).toBe(true);
  expect(() =>
    source.validateCycle33ForwardSpec({
      ...spec,
      nativeCorrection: { commit: 'a'.repeat(40) },
    }),
  ).toThrow();
});

const legacyC11: {
  validateCycle11Manifest: (
    manifest: unknown,
    read?: (path: string) => Buffer,
  ) => Record<string, unknown>;
  validateCycle11PublishedSource: (
    file: { path: string; sha256: string },
    bytes: Buffer,
    read?: (path: string) => Buffer,
  ) => void;
} = await import(
  new URL('../scripts/check-cycle11-integrity.mjs', import.meta.url).href
);
const advancedSpec = source.cycle33Authors[3],
  advancedPath = advancedSpec.modified[0];
const advancedEvidence = {
  path: advancedPath,
  sha256: '274b74bd7da08e1e0bc2ccfc3f759f4ed0cdc0a3122ebd5302fb94b18be0b067',
};
it('legacy C11 full validator accepts only the exact reviewed Advanced successor without rewriting its index', () => {
  const bytes = readFileSync('docs/program/CYCLE11_DELIVERY_INDEX.json');
  expect(
    legacyC11.validateCycle11Manifest(JSON.parse(bytes.toString())),
  ).toEqual({ packages: 6, author_files: 34, independent_files: 2 });
  expect(readFileSync('docs/program/CYCLE11_DELIVERY_INDEX.json')).toEqual(
    bytes,
  );
});
it('legacy C11 continues accepting the exact immutable original Advanced source', () => {
  expect(() =>
    legacyC11.validateCycle11PublishedSource(
      advancedEvidence,
      ports.git('6108876998b891108964a4a9a7a58bef6e0b31ef', advancedPath),
    ),
  ).not.toThrow();
});
it('legacy C11 denies an unreviewed Advanced byte edit', () => {
  expect(() =>
    legacyC11.validateCycle11PublishedSource(
      advancedEvidence,
      Buffer.concat([ports.read(advancedPath), Buffer.from('\n')]),
    ),
  ).toThrow('Reviewed Cycle11 source changed');
});
it('legacy C11 denies relabeling the original Advanced hash to the current source hash', () => {
  expect(() =>
    legacyC11.validateCycle11PublishedSource(
      {
        ...advancedEvidence,
        sha256: createHash('sha256')
          .update(ports.read(advancedPath))
          .digest('hex'),
      },
      ports.read(advancedPath),
    ),
  ).toThrow();
});
it('legacy C11 rereads exact current Advanced companions after earlier admission', () => {
  let drift = false;
  const read = (p: string) =>
    p === advancedSpec.added[0] && drift
      ? Buffer.from('changed')
      : ports.read(p);
  expect(() =>
    legacyC11.validateCycle11PublishedSource(
      advancedEvidence,
      ports.read(advancedPath),
      read,
    ),
  ).not.toThrow();
  drift = true;
  expect(() =>
    legacyC11.validateCycle11PublishedSource(
      advancedEvidence,
      ports.read(advancedPath),
      read,
    ),
  ).toThrow();
});
it('legacy C11 never admits an unrelated runtime path through the Advanced forward', () => {
  expect(() =>
    legacyC11.validateCycle11PublishedSource(
      { ...advancedEvidence, path: 'src/App.tsx' },
      ports.read(advancedPath),
    ),
  ).toThrow();
});
