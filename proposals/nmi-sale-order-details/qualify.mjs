// Offline source qualification only. This module never supplies a live transport.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { resolve, join, dirname, parse } from 'node:path';
import { tmpdir, devNull } from 'node:os';
import ts from 'typescript';
export const source = '53a4705b72b584228b33988d1eae586ef10b44eb';
export const path = 'server/payments/sandbox.ts';
export const before =
  '828b355608e2fee5433dc2c29c3094e40c92c444409331e1b67183ed09e19feb';
export const after =
  '0c6bc1aa8e78ed7f6d86128e79055630cb41ec5281ed32a0bf7bbdc616a8ccc6';
export const patchHash =
  '73d4d530e4a560838477641e2c4298edee03fd4368645437ca9f113ab32ac294';
const evidenceHash =
  'fe6bd166681504652d09fae82946bb11ef8071475f82b210f0b29cb6a157fa5b';
const base = 'proposals/nmi-sale-order-details/';
export const sha = (b) => createHash('sha256').update(b).digest('hex');
const env = {
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_GLOBAL: devNull,
};
const git = (...a) =>
  execFileSync('git', ['--no-replace-objects', ...a], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
function regular(p, mode = 0o644) {
  const full = resolve(p);
  let parent = dirname(full);
  while (parent !== parse(parent).root) {
    assert(!lstatSync(parent).isSymbolicLink(), 'Symlink ancestor forbidden');
    parent = dirname(parent);
  }
  const s = lstatSync(full);
  assert(
    s.isFile() && !s.isSymbolicLink() && (s.mode & 0o777) === mode,
    'Exact regular source required',
  );
  return readFileSync(full);
}
let immutable;
function originals() {
  if (immutable) return immutable;
  const rows = git('ls-tree', '-r', source).toString().trim().split('\n');
  const blobs = execFileSync(
    'git',
    ['--no-replace-objects', 'cat-file', '--batch'],
    {
      env,
      input: rows.map((r) => r.split(' ')[2].split('\t')[0]).join('\n') + '\n',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  let offset = 0;
  immutable = new Map();
  for (const r of rows) {
    const [meta, p] = r.split('\t');
    const m = meta.split(' ')[0];
    assert(['100644', '100755'].includes(m));
    const end = blobs.indexOf(10, offset),
      size = Number(blobs.subarray(offset, end).toString().split(' ')[2]);
    immutable.set(p, {
      mode: m === '100755' ? 0o755 : 0o644,
      bytes: Buffer.from(blobs.subarray(end + 1, end + size + 1)),
    });
    offset = end + size + 2;
  }
  return immutable;
}
export function frame() {
  let mode;
  for (const [p, old] of originals()) {
    const actual = sha(regular(p, old.mode));
    if (p === path) {
      assert(
        [before, after].includes(actual),
        'Exact NMI source before/after required',
      );
      mode = actual === before ? 'before' : 'after';
    } else assert.equal(actual, sha(old.bytes), 'Unknown current source: ' + p);
  }
  return mode;
}
export function packet(read = (p) => regular(p)) {
  const p = read(base + 'correction.patch');
  assert.equal(sha(p), patchHash, 'Exact one-file order-field patch required');
  assert.equal(
    sha(read(base + 'evidence.json')),
    evidenceHash,
    'Exact documentation evidence required',
  );
  return p;
}
export function proposedBytes() {
  const old = originals().get(path).bytes;
  assert.equal(sha(old), before);
  const a = '          order_id: intent.idempotencyKey,';
  assert.equal(old.toString().split(a).length, 2);
  const next = Buffer.from(
    old
      .toString()
      .replace(
        a,
        '          order_details: { order_id: intent.idempotencyKey },',
      ),
  );
  assert.equal(sha(next), after);
  return next;
}
export function qualifyPatch() {
  const current = frame(),
    patch = packet(),
    root = mkdtempSync(join(tmpdir(), 'propel-nmi-order-'));
  try {
    const p = join(root, path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, originals().get(path).bytes);
    for (const args of [
      ['apply', '--check', '--whitespace=error', '-'],
      ['apply', '--whitespace=error', '-'],
    ])
      execFileSync('git', args, {
        cwd: root,
        input: patch,
        env,
        stdio: 'pipe',
        timeout: 15000,
      });
    assert.deepEqual(readFileSync(p), proposedBytes());
    return {
      canonicalMode: current,
      target: path,
      patchHash,
      applicationAuthorized: false,
    };
  } finally {
    try {
      assert.equal(frame(), current);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}
function compile(bytes) {
  const r = ts.transpileModule(bytes.toString(), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      strict: true,
    },
  });
  return r.outputText;
}
export async function load(mode) {
  assert(['before', 'after'].includes(mode), 'Exact compile mode required');
  const current = frame();
  packet();
  const decoder = regular('server/payments/response-json.ts');
  assert.equal(
    sha(decoder),
    '3d361bd32f9cc2ff82b9d4c1ad29ca0218199c11bc903a59ec5a644dd139c970',
  );
  const uri =
    'data:text/javascript;base64,' +
    Buffer.from(compile(decoder)).toString('base64');
  let code = compile(
    mode === 'before' ? originals().get(path).bytes : proposedBytes(),
  );
  assert.equal(code.split("'./response-json'").length, 2);
  code = code.replace("'./response-json'", JSON.stringify(uri));
  try {
    return await import(
      'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
    );
  } finally {
    assert.equal(
      frame(),
      current,
      'Source changed while compiling captured source',
    );
  }
}
