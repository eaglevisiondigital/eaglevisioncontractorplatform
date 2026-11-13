import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  chmodSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  git,
  inspect,
  qualify,
  regular,
} from '../../proposals/cycle9-helper428-admission/qualify.mjs';
const directory = 'proposals/cycle9-helper428-admission';
const patch = readFileSync(`${directory}/admission.patch`);
const record = JSON.parse(readFileSync(`${directory}/evidence.json`, 'utf8'));
const paths = [
  record.checker.path,
  ...record.unchanged.map((row: { path: string }) => row.path),
] as string[];
const checker = paths[0];
const helper = paths[1];
const runtime = paths[2];
const manifest = paths[3];
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const before = new Map(paths.map((path) => [path, regular(path)]));
const read =
  (map = before) =>
  (path: string) =>
    Buffer.from(map.get(path)!);
let temporary: string;
let after: Map<string, Buffer>;
beforeAll(() => {
  temporary = mkdtempSync(join(tmpdir(), 'propel-cycle9-controls-'));
  mkdirSync(join(temporary, 'scripts'));
  writeFileSync(join(temporary, checker), before.get(checker)!);
  execFileSync('git', ['apply', '-'], {
    cwd: temporary,
    input: patch,
    timeout: 30000,
  });
  after = new Map(before);
  after.set(checker, readFileSync(join(temporary, checker)));
});
afterAll(() => rmSync(temporary, { recursive: true, force: true }));
describe('Cycle9-only helper428 proposal', () => {
  it('binds actual428 BEFORE and exact disposable C9 AFTER without changing C24', () => {
    expect(inspect().frame).toBe('BEFORE');
    expect(sha(after.get(checker)!)).toBe(record.checker.proposedSha256);
    expect(inspect({ read: read(after) })).toEqual({
      frame: 'AFTER',
      canonicalChanged: false,
      admissionAuthorized: false,
    });
  });
  for (const [label, path] of [
    ['checker', checker],
    ['helper', helper],
    ['runtime', runtime],
    ['manifest', manifest],
    ['Cycle24', paths[4]],
  ] as const) {
    it(`denies unknown ${label} bytes`, () => {
      const map = new Map(before);
      map.set(
        path,
        Buffer.concat([map.get(path)!, Buffer.from('\n// UNKNOWN')]),
      );
      expect(() => inspect({ read: read(map) })).toThrow(/Exact/);
    });
  }
  it('denies the mixed old runtime with the newly authored helper', () => {
    const map = new Map(before);
    map.set(
      runtime,
      git('show', `af36a27e34b77bfef3700d7cd87fdb39c4dc50d5:${runtime}`),
    );
    expect(() => inspect({ read: read(map) })).toThrow(
      /Exact unchanged source/,
    );
  });
  it('denies a missing helper', () => {
    expect(() =>
      inspect({
        read: (path) => {
          if (path === helper)
            throw Object.assign(Error('missing helper'), { code: 'ENOENT' });
          return regular(path);
        },
      }),
    ).toThrow('missing helper');
  });
  it('rejects coordinated patch and evidence rebinding before any metadata execution', () => {
    const changed = Buffer.concat([patch, Buffer.from('\n// UNKNOWN')]);
    let calls = 0;
    expect(() =>
      inspect({
        patch: changed,
        record: { ...record, patchSha256: sha(changed) },
        metadata: () => {
          calls++;
          throw Error('UNREVIEWED');
        },
      }),
    ).toThrow(/Literal reviewed/);
    expect(calls).toBe(0);
  });
  it('rejects coordinated helper and checker hash substitution before execution', () => {
    const map = new Map(after);
    map.set(helper, Buffer.from("throw Error('UNREVIEWED_HELPER_EXECUTED');"));
    map.set(
      checker,
      Buffer.from(
        map
          .get(checker)!
          .toString()
          .replace(record.unchanged[0].sha256, sha(map.get(helper)!)),
      ),
    );
    expect(() => inspect({ read: read(map) })).toThrow(/Exact Cycle9/);
  });
  it('does not accept a rewritten historical manifest and matching evidence', () => {
    const map = new Map(before);
    const changed = Buffer.from(
      map
        .get(manifest)!
        .toString()
        .replace(record.historicalRuntimeSha256, record.unchanged[1].sha256),
    );
    map.set(manifest, changed);
    expect(() =>
      inspect({
        read: read(map),
        record: {
          ...record,
          historicalRuntimeSha256: record.unchanged[1].sha256,
        },
      }),
    ).toThrow(/Literal reviewed/);
  });
  for (const [label, intercept, result] of [
    [
      'parent',
      (args: string[]) =>
        args[0] === 'show' &&
        args[1] === '--no-patch' &&
        args[3] === record.parent,
      '0'.repeat(40),
    ],
    [
      'delta',
      (args: string[]) =>
        args[0] === 'diff-tree' && args.at(-1) === record.parent,
      `A\t${helper}\nM\t${checker}`,
    ],
    [
      'mode',
      (args: string[]) => args[0] === 'ls-tree' && args.at(-1) === helper,
      `120000 blob ${'1'.repeat(40)}\t${helper}`,
    ],
    [
      'parent blob',
      (args: string[]) =>
        args[0] === 'show' && args[1] === `${record.parent}:${runtime}`,
      'UNKNOWN',
    ],
  ] as const) {
    it(`denies forged ${label} metadata`, () => {
      expect(() =>
        inspect({
          metadata: (...args) =>
            intercept(args) ? Buffer.from(result) : git(...args),
        }),
      ).toThrow(/Exact/);
    });
  }
  for (const path of [runtime, helper, manifest]) {
    it(`rechecks ${path} after metadata callbacks`, () => {
      let withdrawn = false;
      expect(() =>
        inspect({
          read: (p) =>
            withdrawn && p === path ? Buffer.from('LATE_UNKNOWN') : regular(p),
          metadata: (...args) => {
            const value = git(...args);
            if (
              args[0] === 'show' &&
              args[1] === `af36a27e34b77bfef3700d7cd87fdb39c4dc50d5:${runtime}`
            )
              withdrawn = true;
            return value;
          },
        }),
      ).toThrow(/Exact unchanged source/);
    });
  }
  it('rejects a late known BEFORE-to-AFTER transition during metadata checks', () => {
    let changed = false;
    expect(() =>
      inspect({
        read: (path) => read(changed ? after : before)(path),
        metadata: (...args) => {
          const value = git(...args);
          changed = true;
          return value;
        },
      }),
    ).toThrow(/Source frame changed/);
  });
  it('requires regular0644 files and rejects symlinked ancestors', () => {
    const target = join(temporary, 'source');
    writeFileSync(target, 'source');
    expect(regular('source', temporary).toString()).toBe('source');
    chmodSync(target, 0o755);
    expect(() => regular('source', temporary)).toThrow(/Regular 0644/);
    chmodSync(target, 0o644);
    symlinkSync(target, join(temporary, 'link'));
    symlinkSync(join(temporary, 'scripts'), join(temporary, 'ancestor'));
    expect(() => regular('link', temporary)).toThrow(/symlinks/);
    expect(() =>
      regular('ancestor/check-cycle9-integrity.mjs', temporary),
    ).toThrow(/symlinks/);
  });
  it('does not allocate a disposable tree when final Git-directory resolution fails', () => {
    const bin = join(temporary, 'bin');
    const childTmp = join(temporary, 'child-tmp');
    mkdirSync(bin);
    mkdirSync(childTmp);
    writeFileSync(
      join(bin, 'git'),
      '#!/bin/sh\nif [ "$2" = "rev-parse" ]; then exit 73; fi\nexec /usr/bin/git "$@"\n',
      { mode: 0o755 },
    );
    expect(() =>
      execFileSync(process.execPath, [`${directory}/qualify.mjs`], {
        timeout: 30000,
        stdio: 'pipe',
        env: { PATH: `${bin}:${process.env.PATH}`, TMPDIR: childTmp },
      }),
    ).toThrow(/rev-parse/);
    expect(readdirSync(childTmp)).toEqual([]);
  });
  it('rejects unknown CLI selectors before qualification', () => {
    expect(() =>
      execFileSync(process.execPath, [`${directory}/qualify.mjs`, 'unknown'], {
        timeout: 30000,
        stdio: 'pipe',
        env: { PATH: process.env.PATH },
      }),
    ).toThrow();
  });
  it('proves actual428 rejection then exact proposed CLI PASS and fail-closed helper imports', async () => {
    expect(await qualify()).toEqual({
      original428: 'DENIED',
      proposedCycle9: 'PASS',
      helperMutantsDenied: 2,
      canonicalChanged: false,
      admissionAuthorized: false,
      cycle24Changed: false,
      frame: 'BEFORE',
    });
  }, 30000);
});
