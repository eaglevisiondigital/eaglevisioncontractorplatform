import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

type Ports = {
  read: (path: string) => Buffer;
  git: (commit: string, path: string) => Buffer;
};
type Author = {
  module: string;
  path: string;
  predecessor: string;
  added: readonly { path: string }[];
  original_companions: readonly { path: string }[];
};
type Index = {
  packages: {
    head_commit: string;
    owned_files: { path: string; sha256: string; blob?: string }[];
  }[];
};
const source: {
  cycle25SourcePorts: Ports;
  cycle33V1Authors: readonly Author[];
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const c22: {
  cycle22Parent: string;
  validateCycle22Manifest: (
    manifest: unknown,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
} = await import(new URL('../scripts/check-cycle22.mjs', import.meta.url).href);
const c23: {
  cycle23Parent: string;
  validateCycle23Manifest: (
    manifest: unknown,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
} = await import(new URL('../scripts/check-cycle23.mjs', import.meta.url).href);
const p = source.cycle25SourcePorts,
  targets = source.cycle33V1Authors.filter((a) =>
    [
      'published-history-filter-currentness',
      'addon-job-filter-currentness',
    ].includes(a.module),
  ),
  consumers = [
    {
      cycle: 22,
      parent: c22.cycle22Parent,
      validate: c22.validateCycle22Manifest,
      retained: 473,
    },
    {
      cycle: 23,
      parent: c23.cycle23Parent,
      validate: c23.validateCycle23Manifest,
      retained: 498,
    },
  ];
function scoped(
  consumer: (typeof consumers)[number],
  changeRead?: (path: string, bytes: Buffer) => Buffer,
  changeGit?: (commit: string, path: string, bytes: Buffer) => Buffer,
  afterImmutableManifests = false,
) {
  let ownRetainedPass = false;
  const reads = new Map<string, number>();
  const ports: Ports = {
    read(path) {
      const bytes = p.read(path);
      if (!ownRetainedPass) return bytes;
      reads.set(path, (reads.get(path) ?? 0) + 1);
      return changeRead?.(path, bytes) ?? bytes;
    },
    git(commit, path) {
      const bytes = p.git(commit, path);
      if (
        commit === consumer.parent &&
        path ===
          (afterImmutableManifests
            ? 'docs/program/DESIGN_SYSTEM_CONTRACT.json'
            : 'docs/program/CYCLE16_DELIVERY_INDEX.json')
      )
        ownRetainedPass = true;
      return ownRetainedPass
        ? (changeGit?.(commit, path, bytes) ?? bytes)
        : bytes;
    },
  };
  return { ports, reads, reached: () => ownRetainedPass };
}
function manifest(cycle: number) {
  return JSON.parse(
    readFileSync(`docs/program/CYCLE${cycle}_SOURCE_MANIFEST.json`, 'utf8'),
  ) as unknown;
}
for (const consumer of consumers) {
  it(`C${consumer.cycle}: actual retained consumer admits both exact V1 publications without changing source inventory`, () => {
    const state = scoped(consumer),
      result = consumer.validate(manifest(consumer.cycle), state.ports);
    expect(state.reached()).toBe(true);
    expect(result.retained_author_files).toBe(consumer.retained);
    expect(result.protected_files).toBe(128);
    expect(result.design_locks).toBe(5);
    expect(result.design_bindings).toBe(13);
    for (const a of targets) expect(state.reads.get(a.path)).toBeGreaterThan(0);
  });
  for (const a of targets) {
    it(`C${consumer.cycle}: ${a.module} rejects unknown current native bytes through the original retained-source denial`, () => {
      const state = scoped(consumer, (path, bytes) =>
        path === a.path ? Buffer.from('unreviewed') : bytes,
      );
      expect(() =>
        consumer.validate(manifest(consumer.cycle), state.ports),
      ).toThrow(`Retained author source changed: ${a.path}`);
      expect(state.reached()).toBe(true);
    });
    it(`C${consumer.cycle}: ${a.module} rejects changed current new companions instead of treating Git evidence as restoration`, () => {
      for (const f of a.added) {
        const state = scoped(consumer, (path, bytes) =>
          path === f.path ? Buffer.from('unreviewed') : bytes,
        );
        expect(() =>
          consumer.validate(manifest(consumer.cycle), state.ports),
        ).toThrow(`Retained author source changed: ${a.path}`);
      }
    });
    it(`C${consumer.cycle}: ${a.module} preserves both immutable original companions`, () => {
      for (const f of a.original_companions) {
        const state = scoped(consumer, (path, bytes) =>
          path === f.path ? Buffer.from('unreviewed') : bytes,
        );
        expect(() =>
          consumer.validate(manifest(consumer.cycle), state.ports),
        ).toThrow(`Retained author source changed: ${a.path}`);
      }
    });
    it(`C${consumer.cycle}: ${a.module} rejects forged original published Git bytes even when current native bytes are genuine`, () => {
      const state = scoped(consumer, undefined, (commit, path, bytes) =>
        commit === a.predecessor && path === a.path
          ? Buffer.from('unreviewed')
          : bytes,
      );
      expect(() =>
        consumer.validate(manifest(consumer.cycle), state.ports),
      ).toThrow(`Retained author source changed: ${a.path}`);
    });
    it(`C${consumer.cycle}: ${a.module} never broadens admission to an unreviewed published head/hash/blob`, () => {
      const index =
        a.module === 'addon-job-filter-currentness'
          ? 'docs/program/CYCLE16_DELIVERY_INDEX.json'
          : 'docs/program/CYCLE21_SOURCE_MANIFEST.json';
      for (const field of ['head', 'hash', 'blob'] as const) {
        const state = scoped(
          consumer,
          (path, bytes) => {
            if (path !== index) return bytes;
            const value = JSON.parse(bytes.toString()) as Index,
              author = value.packages.find(
                (row) => row.head_commit === a.predecessor,
              )!,
              file = author.owned_files.find((file) => file.path === a.path)!;
            if (field === 'head') author.head_commit = 'f'.repeat(40);
            else if (field === 'hash') file.sha256 = 'f'.repeat(64);
            else file.blob = 'f'.repeat(40);
            return Buffer.from(JSON.stringify(value));
          },
          undefined,
          true,
        );
        expect(() =>
          consumer.validate(manifest(consumer.cycle), state.ports),
        ).toThrow(`Retained author source changed: ${a.path}`);
      }
    });
  }
  it(`C${consumer.cycle}: unrelated retained source edits keep the original fail-closed boundary`, () => {
    const path = 'src/components/workflows/AddonReadinessGuide.tsx',
      state = scoped(consumer, (file, bytes) =>
        file === path ? Buffer.from('unreviewed') : bytes,
      );
    expect(() =>
      consumer.validate(manifest(consumer.cycle), state.ports),
    ).toThrow(`Retained author source changed: ${path}`);
  });
}
