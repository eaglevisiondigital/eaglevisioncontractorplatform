import { afterEach, expect, it } from 'vitest';
import {
  mkdtempSync,
  chmodSync,
  rmSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  linkSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  writeSavedEvidenceFile,
  readSavedEvidenceFile,
} from '../server/field-lab/saved-evidence-files';
const roots: string[] = [];
const gate = { enabled: true, test_only: true };
function folder() {
  const p = realpathSync(mkdtempSync(join(tmpdir(), 'propel-saved-evidence-')));
  chmodSync(p, 0o700);
  roots.push(p);
  return p;
}
afterEach(() => {
  for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true });
});
function text(kind = 'field') {
  const value = {
    schema: 'propel-local-saved-evidence-v1',
    kind,
    identity: {
      organization_id: 'sample-property',
      customer_id: 'customer',
      location_id: 'location',
      estimate_id: 'estimate',
      version_id: 'issued-version',
      job_id: 'job',
    },
    payload: {
      recorded_status: 'draft',
      physical_completion: 'UNVERIFIED',
      task: 'Recorded original task',
    },
  };
  return JSON.stringify({
    ...value,
    sha256: createHash('sha256').update(JSON.stringify(value)).digest('hex'),
  });
}
it.each(['field', 'finance', 'customer', 'maintenance', 'priorities'])(
  '%s file persists exact complete status bytes, duplicate is read-only and no restore authority',
  (kind) => {
    const root = folder(),
      source = text(kind),
      receipt = writeSavedEvidenceFile(root, source, gate);
    expect(receipt.status).toBe('LOCAL_FILE_SAVED');
    expect(receipt.durable_ack).toBe(true);
    expect(statSync(join(root, receipt.id + '.json')).mode & 0o077).toBe(0);
    const duplicate = writeSavedEvidenceFile(root, source, gate);
    expect(duplicate.status).toBe('EXISTING_FILE_READ_ONLY');
    expect(duplicate.durable_ack).toBe(false);
    const read = readSavedEvidenceFile(
      root,
      receipt.id,
      receipt.byte_sha256,
      gate,
    );
    expect(read.text).toBe(source);
    expect(read.canonical_restore).toBe(false);
    expect(read.authority).toBe(false);
  },
);
it('OFF precedes paths, getters and parsing', () => {
  let calls = 0;
  const p = new Proxy(
    {},
    {
      get() {
        calls++;
        throw Error('touch');
      },
    },
  );
  expect(() =>
    writeSavedEvidenceFile(p as never, p as never, {
      enabled: false,
      test_only: false,
    }),
  ).toThrow();
  expect(() =>
    readSavedEvidenceFile(p as never, p as never, p as never, {
      enabled: false,
      test_only: false,
    }),
  ).toThrow();
  expect(calls).toBe(0);
});
it('outside, unprivate and symlink directories are refused', () => {
  const root = folder();
  chmodSync(root, 0o755);
  expect(() => writeSavedEvidenceFile(root, text(), gate)).toThrow();
  chmodSync(root, 0o700);
  const link = root + '-link';
  symlinkSync(root, link);
  roots.push(link);
  expect(() => writeSavedEvidenceFile(link, text(), gate)).toThrow();
  expect(() => writeSavedEvidenceFile('/private/tmp', text(), gate)).toThrow();
});
it('unknown schema, digest mutation, whitespace and duplicate keys are refused', () => {
  const root = folder(),
    source = text();
  for (const v of [
    ' ' + source,
    source.replace('"draft"', '"done"'),
    source.replace('"field"', '"send"'),
    source.replace('{', '{"schema":"other",'),
  ])
    expect(() => writeSavedEvidenceFile(root, v, gate)).toThrow();
});
it('truncated retained file stays uncertain and is never overwritten by another write', () => {
  const root = folder(),
    source = text(),
    r = JSON.parse(source),
    path = join(root, r.sha256 + '.json');
  writeFileSync(path, source.slice(0, 90), { mode: 0o600 });
  const before = readFileSync(path);
  expect(() => writeSavedEvidenceFile(root, source, gate)).toThrow();
  expect(readFileSync(path)).toEqual(before);
});
it('symlink, hardlink and public file permissions are denied', () => {
  const root = folder(),
    source = text(),
    receipt = writeSavedEvidenceFile(root, source, gate),
    p = join(root, receipt.id + '.json');
  chmodSync(p, 0o644);
  expect(() =>
    readSavedEvidenceFile(root, receipt.id, receipt.byte_sha256, gate),
  ).toThrow();
  chmodSync(p, 0o600);
  const link = join(root, 'linked');
  linkSync(p, link);
  expect(() =>
    readSavedEvidenceFile(root, receipt.id, receipt.byte_sha256, gate),
  ).toThrow();
  rmSync(link);
  rmSync(p);
  writeFileSync(link, source, { mode: 0o600 });
  symlinkSync(link, p);
  expect(() => writeSavedEvidenceFile(root, source, gate)).toThrow();
});
it('wrong retained byte digest and invalid UTF8 fail exact read', () => {
  const root = folder(),
    source = text(),
    receipt = writeSavedEvidenceFile(root, source, gate),
    p = join(root, receipt.id + '.json');
  expect(() =>
    readSavedEvidenceFile(root, receipt.id, 'a'.repeat(64), gate),
  ).toThrow();
  writeFileSync(p, Buffer.from([0xff, 0xfe]), { mode: 0o600 });
  expect(() =>
    readSavedEvidenceFile(root, receipt.id, receipt.byte_sha256, gate),
  ).toThrow();
});
it('acknowledged full bytes survive actual child SIGKILL and independent reader process', async () => {
  const root = folder(),
    source = text(),
    module = pathToFileURL(
      resolve('server/field-lab/saved-evidence-files.ts'),
    ).href;
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {writeSavedEvidenceFile} from ${JSON.stringify(module)};console.log(JSON.stringify(writeSavedEvidenceFile(process.argv[1],process.argv[2],{enabled:true,test_only:true})));setInterval(()=>{},1000);`,
      root,
      source,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let result = '';
  try {
    const receipt = await new Promise<Record<string, unknown>>((yes, no) => {
      const timer = setTimeout(
        () => no(Error('Bounded child ACK missing')),
        10000,
      );
      child.stdout.on('data', (b) => {
        result += b.toString();
        if (result.includes('\n')) {
          clearTimeout(timer);
          try {
            yes(JSON.parse(result.trim()));
          } catch (e) {
            no(e);
          }
        }
      });
      child.on('error', no);
      child.on('exit', () => {
        if (!result) no(Error('Writer exited without ACK'));
      });
    });
    expect(receipt.durable_ack).toBe(true);
    const exit = new Promise<void>((yes) => child.once('exit', () => yes()));
    child.kill('SIGKILL');
    await exit;
    const read = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import {readSavedEvidenceFile} from ${JSON.stringify(module)};console.log(JSON.stringify(readSavedEvidenceFile(process.argv[1],process.argv[2],process.argv[3],{enabled:true,test_only:true})));`,
        root,
        String(receipt.id),
        String(receipt.byte_sha256),
      ],
      { encoding: 'utf8', timeout: 10000 },
    );
    expect(read.status).toBe(0);
    expect(JSON.parse(read.stdout).text).toBe(source);
    expect(JSON.parse(read.stdout).authority).toBe(false);
  } finally {
    child.kill('SIGKILL');
  }
});
