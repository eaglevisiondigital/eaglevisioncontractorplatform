import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  sha,
  frame,
  packet,
  qualify,
  source,
  target,
  after,
  // @ts-expect-error Offline proposal qualification has no declaration file.
} from '../../proposals/cycle24-collector-signature/qualify.mjs';

const canonicalMode = frame();

it('binds exact complete-history435 without applying the collector proposal', () => {
  expect(source).toBe('78c57bc8e5919026b0df4d273d7cb1c7059fdbb7');
  expect(frame()).toBe(canonicalMode);
  expect(target).toBe('scripts/collect-cycle24-browser.mjs');
});
it('materializes only the exact collector successor in a disposable full-source archive', () => {
  expect(qualify()).toMatchObject({
    proposed: true,
    status: null,
    canonicalChanged: false,
    applicationAuthorized: false,
  });
  expect(frame()).toBe(canonicalMode);
});
it('keeps the original collector available as the explicit before control', () => {
  expect(qualify({ proposed: false })).toMatchObject({
    proposed: false,
    status: null,
    canonicalChanged: false,
  });
});
it('rejects a valid comment mutation of the patch without executing checker code', () => {
  expect(() =>
    packet((p: string) =>
      p.endsWith('.patch')
        ? Buffer.concat([readFileSync(p), Buffer.from('\n# unknown\n')])
        : readFileSync(p),
    ),
  ).toThrow('Exact collector patch required');
});
it('rejects coordinated evidence rebinding even when the patch is unchanged', () => {
  expect(() =>
    packet((p: string) =>
      p.endsWith('.json')
        ? Buffer.from(
            JSON.stringify({
              ...JSON.parse(readFileSync(p, 'utf8')),
              after: '0'.repeat(64),
            }),
          )
        : readFileSync(p),
    ),
  ).toThrow('Exact proposal evidence required');
});
it('retains the complete original artifact checks outside the two source-admission hooks', () => {
  const patch = packet().toString();
  expect(patch).toContain('admitOperatingSignatureSource');
  expect(patch).toContain("'--no-replace-objects'");
  expect(patch).toContain('EXACT_OPERATING_SIGNATURE_M1');
  expect(after).toBe(
    'f1113308f7517ce654827503f0341fd0bf2951a286fd23e3b783387728fa5c7a',
  );
  for (const invariant of [
    '63',
    '126',
    'trusted_events',
    'stats?.unexpected',
    'source_files?.length',
    'Executed checkout differs',
  ])
    expect(
      patch
        .split('\n')
        .filter((s: string) => s.startsWith('-') && !s.startsWith('---'))
        .join('\n'),
    ).not.toContain(invariant);
});

it.each([
  'scripts/operating-source-signature-admission.mjs',
  'src/lib/workflows/operating-center-runtime.ts',
  'docs/program/CYCLE24_RUNTIME_FILES.json',
  'scripts/cycle25-source-lineage.mjs',
])(
  'denies unknown current %s before importing/executing collector code',
  (path) => {
    expect(() =>
      qualify({
        mutate: (root: string) => {
          const p = join(root, path);
          writeFileSync(
            p,
            Buffer.concat([readFileSync(p), Buffer.from('\n ')]),
          );
        },
      }),
    ).toThrow();
  },
);
it('denies helper plus collector literal rebinding before any executable import', () => {
  expect(() =>
    qualify({
      mutate: (root: string) => {
        const p = join(
          root,
          'scripts/operating-source-signature-admission.mjs',
        );
        writeFileSync(
          p,
          Buffer.concat([readFileSync(p), Buffer.from('\n// unknown\n')]),
        );
        const c = join(root, target);
        writeFileSync(
          c,
          readFileSync(c, 'utf8').replace(
            '38fd3d784b10dd634f6b03a5995a4ce4392eb2924865349d1414328701113978',
            sha(readFileSync(p)),
          ),
        );
      },
    }),
  ).toThrow();
});
it('denies source-helper symlink substitution before importing executable bytes', () => {
  expect(() =>
    qualify({
      mutate: (root: string) => {
        const p = join(
          root,
          'scripts/operating-source-signature-admission.mjs',
        );
        unlinkSync(p);
        symlinkSync(
          join(
            process.cwd(),
            'scripts/operating-source-signature-admission.mjs',
          ),
          p,
        );
      },
    }),
  ).toThrow();
});

it('rejects both mixed critical-runtime directions and late withdrawal despite immutable Git cache', async () => {
  const helperPath = 'scripts/operating-source-signature-admission.mjs';
  expect(sha(readFileSync(helperPath))).toBe(
    '38fd3d784b10dd634f6b03a5995a4ce4392eb2924865349d1414328701113978',
  );
  const { admitOperatingSignatureSource } = await import(
    'data:text/javascript;base64,' + readFileSync(helperPath).toString('base64')
  );
  const result = qualify({
    inspect: (root: string) => {
      const code = readFileSync(join(root, target), 'utf8');
      const selected = code.slice(
        code.indexOf('function gitHash('),
        code.indexOf('function report('),
      );
      const runtime = 'src/lib/workflows/operating-center-runtime.ts';
      const old = execFileSync('git', [
        '--no-replace-objects',
        'show',
        '7a90da23c0a701001c79b605d94d2894cd9cc5a6:' + runtime,
      ]);
      const inventory = JSON.parse(
        readFileSync('docs/program/CYCLE24_RUNTIME_FILES.json', 'utf8'),
      );
      const item = {
        source_commit: source,
        inventory_sha256: sha(
          readFileSync('docs/program/CYCLE24_RUNTIME_FILES.json'),
        ),
        source_files: inventory.paths.map((path: string) => ({
          path,
          sha256: sha(readFileSync(path)),
        })),
        release: 'NOT_READY_NOT_AUTHORIZED',
      };
      let withdrawn = false;
      const context = {
        sha,
        execFileSync,
        readFileSync,
        inventoryPath: 'docs/program/CYCLE24_RUNTIME_FILES.json',
        inventory,
        gitHashes: new Map(),
        verifiedCommits: new Set(),
        executionCommits: new Set(),
        admittedSources: new Map(),
        cycle24RuntimeCommit: '7a90da23c0a701001c79b605d94d2894cd9cc5a6',
        cycle24CriticalSources: [
          'src/lib/workflows/saved-revision-runtime.ts',
          runtime,
          'src/lib/workflows/journey-runtime.ts',
          'src/App.tsx',
          'src/main.tsx',
        ],
        assertCycle24ExecutionCommit: (commit: string) => {
          expect(
            execFileSync('git', ['cat-file', '-t', commit]).toString().trim(),
          ).toBe('commit');
        },
        admitOperatingSignatureSource,
        admitCycle25Source: () => ({
          fixture: 'unexercised-original-forward-shape',
        }),
        cycle25SourcePorts: {
          read: (path: string) =>
            path === runtime && withdrawn ? old : readFileSync(path),
        },
      };
      const bind = runInNewContext(selected + '\nbinding;', context);
      expect(() => bind(item)).not.toThrow();
      withdrawn = true;
      expect(() => bind(item)).toThrow(
        'Current critical source differs from executed checkout',
      );
      withdrawn = false;
      expect(() =>
        bind({
          ...item,
          source_commit: '7a90da23c0a701001c79b605d94d2894cd9cc5a6',
        }),
      ).toThrow('Current critical source differs from executed checkout');
      return {
        lateWithdrawal: 'DENIED',
        currentOldExecutedM1: 'DENIED',
        currentM1ExecutedOld: 'DENIED',
      };
    },
  });
  expect(result.inspection).toEqual({
    lateWithdrawal: 'DENIED',
    currentOldExecutedM1: 'DENIED',
    currentM1ExecutedOld: 'DENIED',
  });
});
