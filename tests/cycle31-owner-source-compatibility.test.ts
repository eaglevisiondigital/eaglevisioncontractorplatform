import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

interface FileEvidence {
  path: string;
  sha256: string;
  blob: string;
}
interface SourceManifest {
  release: string;
  packages: {
    module: string;
    head_commit: string;
    owned_files: FileEvidence[];
  }[];
}
interface Ports {
  read: (path: string) => Buffer;
  git: (commit: string, path: string) => Buffer;
}
const checker: {
  validateCycle21Manifest: (
    manifest: SourceManifest,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
} = await import(new URL('../scripts/check-cycle21.mjs', import.meta.url).href);
const lineage: {
  cycle25SourcePorts: Pick<Ports, 'git'>;
  cycle32BusySource: unknown;
  validateCycle32BusySpec: (spec: unknown) => Record<string, unknown>;
  admitCycle32BusyForward: (
    path: string,
    current: Buffer,
    previous: Buffer,
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const ownerPath = 'src/components/workflows/RecordedOwnerActions.tsx';
const originalAuthor = '161f1c59d864d60aa0f45820eb6417864519baf2';
const parent = 'b0faaa447e8e18cd78a00e5cfbfd6dc67eff3fd9';
const reviewedAuthor = '9f85556e28875a53976b55567f3a14e942ba3995';
const manifestPath = 'docs/program/CYCLE21_SOURCE_MANIFEST.json';
const manifestBytes = readFileSync(manifestPath);
const original = lineage.cycle25SourcePorts.git(originalAuthor, ownerPath);
const reviewed = lineage.cycle25SourcePorts.git(reviewedAuthor, ownerPath);
const manifest = (): SourceManifest => JSON.parse(manifestBytes.toString());
const owner = (value: SourceManifest) =>
  value.packages.find((p) => p.module === 'recorded-owner-actions')!;
const ownerFile = (value: SourceManifest) =>
  owner(value).owned_files.find((file) => file.path === ownerPath)!;
const readWith =
  (path: string, bytes: Buffer): Ports['read'] =>
  (candidate) =>
    candidate === path ? bytes : readFileSync(candidate);
const hash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const blob = (bytes: Buffer) =>
  createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
const exactError = `Exact published Cycle21 bytes/blob required: ${ownerPath}`;
const retainedCheckers = await Promise.all(
  [22, 23].map(async (cycle) => {
    const retained: Record<
      string,
      (value: unknown, ports?: Partial<Ports>) => Record<string, unknown>
    > = await import(
      new URL(`../scripts/check-cycle${cycle}.mjs`, import.meta.url).href
    );
    return {
      cycle,
      validate: retained[`validateCycle${cycle}Manifest`],
      manifest: JSON.parse(
        readFileSync(`docs/program/CYCLE${cycle}_SOURCE_MANIFEST.json`, 'utf8'),
      ) as unknown,
    };
  }),
);

it('the actual current source reaches the fixed reviewed endpoint without changing original evidence', () => {
  // Advance only this current-file expectation to the exact reviewed endpoint.
  // Original C31 author/manifest/hash/blob and all denial cases remain unchanged.
  const current = readFileSync(ownerPath);
  const originalBusyAuthor = 'ec63030de8c0faceebd1ec9a645e9ea0dcf76383';
  const currentAuthor = current.equals(
    lineage.cycle25SourcePorts.git(originalBusyAuthor, ownerPath),
  )
    ? originalBusyAuthor
    : '5aa6728003c9b820e50d34505c465104440783d7';
  expect(
    lineage.validateCycle32BusySpec(lineage.cycle32BusySource),
  ).toMatchObject({ source_commit: originalBusyAuthor });
  expect(
    lineage.admitCycle32BusyForward(ownerPath, current, reviewed),
  ).toMatchObject({
    source_commit: originalBusyAuthor,
    ...(currentAuthor !== originalBusyAuthor
      ? { cycle33_forward: { source_commit: currentAuthor } }
      : {}),
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
  });
  expect(current).toEqual(
    lineage.cycle25SourcePorts.git(currentAuthor, ownerPath),
  );
  expect(reviewed).toEqual(
    lineage.cycle25SourcePorts.git(
      '7b377aeffac11855a5dfdfaa86719078e70a5260',
      ownerPath,
    ),
  );
  expect(original).toEqual(lineage.cycle25SourcePorts.git(parent, ownerPath));
  expect(original.equals(reviewed)).toBe(false);
  expect(ownerFile(manifest())).toMatchObject({
    sha256: hash(original),
    blob: blob(original),
  });
  expect(checker.validateCycle21Manifest(manifest())).toEqual({
    packages: 5,
    author_files: 25,
    independent_files: 2,
    retained_author_files: 448,
    protected_files: 128,
    design_locks: 5,
    design_bindings: 13,
    authority: 'LOCAL_SOURCE_EVIDENCE_ONLY',
  });
  expect(readFileSync(manifestPath)).toEqual(manifestBytes);
});

it('the original unchanged owner component remains accepted as historical source', () => {
  expect(
    checker.validateCycle21Manifest(manifest(), {
      read: readWith(ownerPath, original),
    }),
  ).toMatchObject({
    author_files: 25,
    authority: 'LOCAL_SOURCE_EVIDENCE_ONLY',
  });
});

it('a manifest cannot replace the original SHA with the reviewed current SHA', () => {
  const value = manifest();
  ownerFile(value).sha256 = hash(reviewed);
  expect(() => checker.validateCycle21Manifest(value)).toThrow(exactError);
});

it('a manifest cannot replace the original blob with the reviewed current blob', () => {
  const value = manifest();
  ownerFile(value).blob = blob(reviewed);
  expect(() => checker.validateCycle21Manifest(value)).toThrow(exactError);
});

it('the reviewed source cannot be relabelled as the original author head', () => {
  const value = manifest();
  owner(value).head_commit = reviewedAuthor;
  expect(() => checker.validateCycle21Manifest(value)).toThrow(
    'Exact Cycle21 author/branch/head/PR/count required',
  );
});

it('unknown current owner bytes are rejected even after exact admission was warmed', () => {
  checker.validateCycle21Manifest(manifest());
  expect(() =>
    checker.validateCycle21Manifest(manifest(), {
      read: readWith(
        ownerPath,
        Buffer.concat([reviewed, Buffer.from('\n// unreviewed edit\n')]),
      ),
    }),
  ).toThrow(exactError);
});

it('an arbitrary predecessor edit cannot impersonate the reviewed correction', () => {
  expect(() =>
    checker.validateCycle21Manifest(manifest(), {
      read: readWith(
        ownerPath,
        Buffer.concat([original, Buffer.from('\n// unknown successor\n')]),
      ),
    }),
  ).toThrow(exactError);
});

it('substituted published Git bytes cannot bypass original SHA and blob binding', () => {
  expect(() =>
    checker.validateCycle21Manifest(manifest(), {
      git: (commit, path) =>
        commit === originalAuthor && path === ownerPath
          ? reviewed
          : lineage.cycle25SourcePorts.git(commit, path),
    }),
  ).toThrow(exactError);
});

it('a different Cycle21 component receives no owner-render exception', () => {
  const path = 'src/components/workflows/CostCorrectionReview.tsx';
  expect(() =>
    checker.validateCycle21Manifest(manifest(), {
      read: readWith(
        path,
        Buffer.concat([readFileSync(path), Buffer.from('\n// unknown edit\n')]),
      ),
    }),
  ).toThrow(`Exact published Cycle21 bytes/blob required: ${path}`);
});

it('a changed owner library receives no component-only exception', () => {
  const path = 'src/lib/workflows/recorded-owner-actions.ts';
  expect(() =>
    checker.validateCycle21Manifest(manifest(), {
      read: readWith(
        path,
        Buffer.concat([readFileSync(path), Buffer.from('\n// unknown edit\n')]),
      ),
    }),
  ).toThrow(`Exact published Cycle21 bytes/blob required: ${path}`);
});

it('a repeated component path cannot replace another exact owned source', () => {
  const value = manifest();
  owner(value).owned_files[0] = { ...ownerFile(value) };
  expect(() => checker.validateCycle21Manifest(value)).toThrow(
    'Duplicate, overlapping or unknown Cycle21 source path',
  );
});

it('source compatibility does not admit a release authorization claim', () => {
  const value = manifest();
  value.release = 'READY_AUTHORIZED';
  expect(() => checker.validateCycle21Manifest(value)).toThrow(
    'Exact five Cycle21 packages, support seed, Main draft and closed release required',
  );
});

it.each(retainedCheckers)(
  'Cycle $cycle actual retained-author chain accepts only the exact current reviewed source',
  ({ validate, manifest: value }) => {
    expect(validate(value)).toMatchObject({ packages: 5, author_files: 25 });
  },
);

it.each(retainedCheckers)(
  'Cycle $cycle rejects unknown current owner bytes through its actual retained chain',
  ({ validate, manifest: value }) => {
    expect(() =>
      validate(value, {
        read: readWith(
          ownerPath,
          Buffer.concat([reviewed, Buffer.from('\n// unreviewed edit\n')]),
        ),
      }),
    ).toThrow(exactError);
  },
);

it.each(retainedCheckers)(
  'Cycle $cycle cannot rewrite original published owner evidence to match the new source',
  ({ validate, manifest: value }) => {
    const previous = manifest();
    ownerFile(previous).sha256 = hash(reviewed);
    ownerFile(previous).blob = blob(reviewed);
    expect(() =>
      validate(value, {
        read: readWith(manifestPath, Buffer.from(JSON.stringify(previous))),
      }),
    ).toThrow(exactError);
  },
);

it.each(retainedCheckers)(
  'Cycle $cycle cannot substitute another retained component beside the admitted owner',
  ({ validate, manifest: value }) => {
    const path = 'src/components/workflows/CostCorrectionReview.tsx';
    expect(() =>
      validate(value, {
        read: readWith(
          path,
          Buffer.concat([
            readFileSync(path),
            Buffer.from('\n// unknown edit\n'),
          ]),
        ),
      }),
    ).toThrow(`Exact published Cycle21 bytes/blob required: ${path}`);
  },
);

it.each(retainedCheckers)(
  'Cycle $cycle rechecks its current owner bytes after prior-manifest admission',
  ({ cycle, validate, manifest: value }) => {
    const retainedRead = cycle === 22 ? 2 : 3;
    let ownerReads = 0;
    expect(() =>
      validate(value, {
        read: (path) => {
          if (path === ownerPath && ++ownerReads === retainedRead)
            return Buffer.concat([
              reviewed,
              Buffer.from('\n// changed after prior check\n'),
            ]);
          return readFileSync(path);
        },
      }),
    ).toThrow(`Retained author source changed: ${ownerPath}`);
    expect(ownerReads).toBe(retainedRead);
  },
);
