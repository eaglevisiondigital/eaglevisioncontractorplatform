import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { expect, it } from 'vitest';
type Spec = {
  module: string;
  commit: string | null;
  permitted: readonly string[];
  modified: readonly string[];
  added: readonly string[];
};
type Ports = {
  git: (c: string, p: string) => Buffer;
  parent: (c: string) => string;
  type: (c: string) => string;
  mode: (c: string, p: string) => string;
  delta: (c: string) => string;
  read: (p: string) => Buffer;
};
const lib: {
  cycle27Parent: string;
  cycle27Authors: readonly Spec[];
  cycle25SourcePorts: Ports;
  validateCycle27ForwardSpec: (s: Spec, p?: Ports) => unknown;
  inspectCycle27Sources: (
    p?: Partial<Ports> & { requireCombined?: boolean },
  ) => {
    complete_combined: boolean;
    business_authority: boolean;
    restore_adapter: boolean;
  };
  admitCycle25Source: (
    p: string,
    c: Buffer,
    b: Buffer,
    ports?: Partial<Ports>,
  ) => unknown;
  cycle25Parent: string;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
it('verifies every sole-parent disjoint author and exact combined native bytes without business authority', () => {
  const paths = lib.cycle27Authors.flatMap((s) => [...s.permitted]);
  expect(new Set(paths).size).toBe(paths.length);
  for (const s of lib.cycle27Authors)
    expect(lib.validateCycle27ForwardSpec(s)).toMatchObject({
      source_commit: s.commit,
    });
  expect(lib.inspectCycle27Sources({ requireCombined: true })).toMatchObject({
    complete_combined: true,
    business_authority: false,
    restore_adapter: false,
  });
});
it('keeps f810 original bytes distinct from implemented successors', () => {
  const p = {
    read: (s: string) => lib.cycle25SourcePorts.git(lib.cycle27Parent, s),
  };
  expect(lib.inspectCycle27Sources(p).complete_combined).toBe(false);
  expect(() =>
    lib.inspectCycle27Sources({ ...p, requireCombined: true }),
  ).toThrow('absent');
});
it.each(['', '0'.repeat(40), 'x'.repeat(40)])(
  'rejects unpublished or invalid source pin %s',
  (commit) => {
    expect(() =>
      lib.validateCycle27ForwardSpec({ ...lib.cycle27Authors[0], commit }),
    ).toThrow();
  },
);
it.each(['tree', 'blob'])('rejects %s as source commit', (type) => {
  expect(() =>
    lib.validateCycle27ForwardSpec(lib.cycle27Authors[0], {
      ...lib.cycle25SourcePorts,
      type: () => type,
    }),
  ).toThrow();
});
it.each(['a'.repeat(40), lib.cycle27Parent + ' ' + 'a'.repeat(40)])(
  'rejects changed or merged parent %s',
  (parent) => {
    expect(() =>
      lib.validateCycle27ForwardSpec(lib.cycle27Authors[0], {
        ...lib.cycle25SourcePorts,
        parent: () => parent,
      }),
    ).toThrow('parent');
  },
);
it.each(['100755', '120000', '160000'])(
  'rejects executable, symlink or submodule source mode %s',
  (mode) => {
    expect(() =>
      lib.validateCycle27ForwardSpec(lib.cycle27Authors[0], {
        ...lib.cycle25SourcePorts,
        mode: () => mode,
      }),
    ).toThrow('Regular');
  },
);
it('rejects an extra protected delta, shared engine, extra private path and duplicated ownership', () => {
  const s = lib.cycle27Authors[0],
    p = lib.cycle25SourcePorts;
  expect(() =>
    lib.validateCycle27ForwardSpec(s, {
      ...p,
      delta: (c) => p.delta(c) + '\nM\tsupabase/migrations/protected.sql',
    }),
  ).toThrow('delta');
  for (const modified of [
    [],
    ['src/lib/phase3.ts'],
    [...s.modified, ...s.modified],
  ])
    expect(() => lib.validateCycle27ForwardSpec({ ...s, modified })).toThrow(
      'owned',
    );
  expect(() =>
    lib.validateCycle27ForwardSpec({
      ...s,
      added: [...s.added, '.staging/private'],
    }),
  ).toThrow('exact');
});
it('rejects partial native installation and a changed author regression test', () => {
  const s = lib.cycle27Authors[0],
    p = lib.cycle25SourcePorts;
  expect(() =>
    lib.inspectCycle27Sources({
      read: (path) =>
        path === s.modified[0] ? p.git(lib.cycle27Parent, path) : p.read(path),
    }),
  ).toThrow('Partial');
  expect(() =>
    lib.inspectCycle27Sources({
      read: (path) =>
        path === s.added[1] ? Buffer.from('removed assertions') : p.read(path),
    }),
  ).toThrow('author test');
});
it('does not admit same-content unrelated current bytes or a substituted previous-generation parent', () => {
  const s = lib.cycle27Authors[4],
    path = s.modified[0],
    p = lib.cycle25SourcePorts,
    old = p.git(lib.cycle25Parent, path);
  expect(() =>
    lib.admitCycle25Source(path, Buffer.from('unreviewed'), old),
  ).toThrow('fixed Cycle27');
  expect(() =>
    lib.admitCycle25Source(path, p.read(path), old, {
      git: (c, f) =>
        c === lib.cycle27Parent
          ? Buffer.from('substituted parent')
          : p.git(c, f),
    }),
  ).toThrow('original reviewed');
});
it('admits only fixed direct C27 scoped CSS through the retained C25 endpoint when C26 left it unchanged', () => {
  const path = 'src/components/workflows/owner-action-verification.css',
    p = lib.cycle25SourcePorts;
  expect(
    lib.admitCycle25Source(path, p.read(path), p.git(lib.cycle25Parent, path)),
  ).toMatchObject({ authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE' });
  expect(() =>
    lib.admitCycle25Source(
      path,
      Buffer.from('unreviewed css'),
      p.git(lib.cycle25Parent, path),
    ),
  ).toThrow('fixed Cycle27');
});

const readiness: { checkCycle27Readiness: (p?: Ports) => unknown } =
  await import(new URL('../scripts/check-cycle27.mjs', import.meta.url).href);
it('requires exact independently reviewed readiness without operational permission', () => {
  expect(readiness.checkCycle27Readiness()).toMatchObject({
    implementation_authorized: false,
    restore_adapter: false,
    operational_ready: false,
    physical_recovery: 'NOT_RUN',
  });
  expect(() =>
    readiness.checkCycle27Readiness({
      ...lib.cycle25SourcePorts,
      read: () => Buffer.from('implementation accepted'),
    }),
  ).toThrow('reviewed readiness');
});

it('immutable Git object buffers cannot be poisoned by a caller', () => {
  const path = 'src/lib/workflows/task-receipt-reconciliation.ts',
    p = lib.cycle25SourcePorts;
  const first = p.git(lib.cycle27Parent, path);
  first.fill(0);
  expect(p.git(lib.cycle27Parent, path)).toEqual(
    execFileSync('git', ['show', `${lib.cycle27Parent}:${path}`]),
  );
});
it('warm immutable Git facts never cache mutable files or source admission', () => {
  const p = lib.cycle25SourcePorts,
    s = lib.cycle27Authors[0];
  expect(
    lib.inspectCycle27Sources({ requireCombined: true }).complete_combined,
  ).toBe(true);
  expect(() =>
    lib.inspectCycle27Sources({
      read: (path) =>
        path === s.modified[0]
          ? Buffer.from('changed after warm cache')
          : p.read(path),
    }),
  ).toThrow('fixed Cycle27');
  mkdirSync('artifacts/cycle27', { recursive: true });
  const dir = mkdtempSync('artifacts/cycle27/fresh-read-'),
    path = dir + '/source.txt';
  try {
    writeFileSync(path, 'before');
    expect(p.read(path).toString()).toBe('before');
    writeFileSync(path, 'after');
    expect(p.read(path).toString()).toBe('after');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('raw object facts ignore replacement refs and shallow traversal in a disposable repository', () => {
  mkdirSync('artifacts/cycle27', { recursive: true });
  const dir = mkdtempSync('artifacts/cycle27/git-context-');
  const script = `import {execFileSync} from 'node:child_process';import{writeFileSync}from'node:fs';import assert from'node:assert/strict';
 const {cycle25SourcePorts:p}=await import(${JSON.stringify(new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href)});
 const g=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();g('init','-q');
 const tree=execFileSync('git',['mktree'],{input:'',encoding:'utf8'}).trim();
 const commit=(parent,note)=>execFileSync('git',['hash-object','-w','-t','commit','--stdin'],{input:'tree '+tree+'\\n'+(parent?'parent '+parent+'\\n':'')+'author Synthetic <synthetic@example.invalid> 1 +0000\\ncommitter Synthetic <synthetic@example.invalid> 1 +0000\\n\\n'+note+'\\n',encoding:'utf8'}).trim();
 const a=commit('', 'a'),b=commit(a,'b'),replacement=commit('','replacement');
 assert.equal(p.parent(b),a);g('replace',b,replacement);assert.equal(p.parent(b),a);
 const cold=commit(a,'cold');g('replace',cold,replacement);writeFileSync('.git/shallow',cold+'\\n');
 assert.equal(p.parent(cold),a);assert.equal(p.delta(cold),'');assert.equal(p.type(cold),'commit');
 `;
  try {
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: dir,
      stdio: 'pipe',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
