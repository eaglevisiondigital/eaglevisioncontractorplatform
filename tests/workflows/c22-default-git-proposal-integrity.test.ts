import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const proposal: {
  prepareArchive: () => string;
  checkArchive: (root: string) => void;
  assertProposalInputs: (frame?: Buffer, patch?: Buffer) => unknown;
  runControl: (root: string, name: string) => unknown;
} = await import(
  new URL(
    '../../proposals/c22-default-git-history/qualify.mjs',
    import.meta.url,
  ).href
);
const packet = 'proposals/c22-default-git-history';
let archive: string;
beforeAll(() => {
  archive = proposal.prepareArchive();
});
afterAll(() => {
  if (archive) {
    try {
      proposal.checkArchive(archive);
    } finally {
      rmSync(archive, { recursive: true, force: true });
    }
  }
});
it('rejects coordinated metadata baseline, target and patch-hash rebinding', () => {
  const frame = JSON.parse(
    readFileSync(join(packet, 'source-frame.json'), 'utf8'),
  );
  frame.baseline = '1'.repeat(40);
  frame.checker.path = 'scripts/check-cycle21.mjs';
  frame.patch_sha256 = '2'.repeat(64);
  expect(() =>
    proposal.assertProposalInputs(
      Buffer.from(JSON.stringify(frame)),
      Buffer.from('replacement patch'),
    ),
  ).toThrow(/Exact literal-sealed source frame required/);
});
it('rejects a substituted patch with unchanged original metadata', () => {
  expect(() =>
    proposal.assertProposalInputs(undefined, Buffer.from('replacement patch')),
  ).toThrow(/Exact literal-sealed patch required/);
});
it('denies unknown executable companion bytes before candidate execution', () => {
  const target = join(archive, 'scripts/check-cycle21.mjs'),
    original = readFileSync(target);
  try {
    writeFileSync(
      target,
      Buffer.concat([
        original,
        Buffer.from('\nthrow Error("UNKNOWN_COMPANION_EXECUTED");\n'),
      ]),
    );
    expect(() =>
      proposal.runControl(archive, 'natural-retained-source'),
    ).toThrow(/Original tracked blob changed: scripts\/check-cycle21.mjs/);
  } finally {
    writeFileSync(target, original);
  }
});
it('denies an unknown executable companion mode before candidate execution', () => {
  const target = join(archive, 'scripts/check-cycle21.mjs'),
    original = lstatSync(target).mode & 0o777;
  try {
    chmodSync(target, 0o755);
    expect(() =>
      proposal.runControl(archive, 'natural-retained-source'),
    ).toThrow(/Original tracked mode changed: scripts\/check-cycle21.mjs/);
  } finally {
    chmodSync(target, original);
  }
});
it('denies a symlink ancestor before candidate execution', () => {
  const source = join(archive, 'scripts'),
    retained = join(archive, 'scripts-retained');
  renameSync(source, retained);
  try {
    symlinkSync('scripts-retained', source, 'dir');
    expect(() =>
      proposal.runControl(archive, 'natural-retained-source'),
    ).toThrow(/Source symlink forbidden/);
  } finally {
    unlinkSync(source);
    renameSync(retained, source);
  }
});

it('ignores poisoned external Git config and Node options without network or hooks', () => {
  const temporary = mkdtempSync(
    join(realpathSync(tmpdir()), 'propel-c22-env-poison-'),
  );
  const config = join(temporary, 'forbid-file.gitconfig');
  writeFileSync(config, '[protocol "file"]\n  allow = never\n');
  const poison = {
    GIT_CONFIG_NOSYSTEM: '0',
    GIT_CONFIG_GLOBAL: config,
    GIT_CONFIG_SYSTEM: config,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'protocol.file.allow',
    GIT_CONFIG_VALUE_0: 'never',
    GIT_ALLOW_PROTOCOL: 'https',
    NODE_OPTIONS: '--invalid-c22-qualifier-poison-option',
  };
  const original = Object.fromEntries(
    Object.keys(poison).map((key) => [key, process.env[key]]),
  );
  let isolated: string | undefined;
  try {
    Object.assign(process.env, poison);
    isolated = proposal.prepareArchive();
    expect(proposal.runControl(isolated, 'copied-history-buffer')).toEqual({
      control: 'copied-history-buffer',
      passed: true,
      canonicalApplied: false,
    });
  } finally {
    try {
      if (isolated) proposal.checkArchive(isolated);
    } finally {
      if (isolated) rmSync(isolated, { recursive: true, force: true });
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(temporary, { recursive: true, force: true });
    }
  }
});
