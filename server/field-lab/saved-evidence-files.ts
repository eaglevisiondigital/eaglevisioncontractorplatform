/** Disposable synthetic full-content evidence files ONLY. No business DB, restore,
 * network route, credential loader or command executor. Local owner/disk is trusted. */
import { createHash } from 'node:crypto';
import {
  openSync,
  closeSync,
  lstatSync,
  fstatSync,
  realpathSync,
  writeSync,
  readFileSync,
  fsyncSync,
  constants,
} from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { tmpdir } from 'node:os';
interface Gate {
  enabled?: boolean;
  test_only?: boolean;
}
const hash = (text: string) =>
  createHash('sha256').update(text, 'utf8').digest('hex');
function on(gate: Gate) {
  const d = Object.getOwnPropertyDescriptors(gate);
  if (
    Reflect.ownKeys(gate).length !== 2 ||
    d.enabled?.value !== true ||
    d.test_only?.value !== true
  )
    throw Error('Synthetic evidence file adapter is OFF');
}
function folder(root: string) {
  if (typeof root !== 'string')
    throw Error('Private disposable folder required');
  const p = resolve(root),
    s = lstatSync(p),
    temp = realpathSync(tmpdir());
  if (
    (!p.startsWith(temp + '/') && !p.startsWith('/private/tmp/')) ||
    !basename(p).startsWith('propel-saved-evidence-') ||
    p !== root ||
    realpathSync(p) !== p ||
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    (s.mode & 0o077) !== 0 ||
    (process.getuid && s.uid !== process.getuid())
  )
    throw Error('Owned private disposable evidence folder required');
  return p;
}
function digest(value: string) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw Error('Exact evidence digest required');
  return value;
}
function body(text: string) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 1048576)
    throw Error('Bounded canonical evidence bytes required');
  const r = JSON.parse(text);
  if (
    !r ||
    Object.getPrototypeOf(r) !== Object.prototype ||
    JSON.stringify(r) !== text ||
    Object.keys(r).join(',') !== 'schema,kind,identity,payload,sha256' ||
    r.schema !== 'propel-local-saved-evidence-v1' ||
    !['field', 'finance', 'customer', 'maintenance', 'priorities'].includes(
      r.kind,
    )
  )
    throw Error('Exact canonical evidence envelope required');
  const keys = [
    'organization_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ];
  if (
    !r.identity ||
    Object.keys(r.identity).join(',') !== keys.join(',') ||
    keys.some(
      (k) =>
        typeof r.identity[k] !== 'string' ||
        !r.identity[k] ||
        r.identity[k].length > 200,
    )
  )
    throw Error('Exact source reference fields required');
  const { sha256, ...value } = r;
  if (digest(sha256) !== hash(JSON.stringify(value)))
    throw Error('File content integrity mismatch');
  return {
    id: sha256 as string,
    byte_sha256: hash(text),
    bytes: Buffer.byteLength(text, 'utf8'),
  };
}
function existing(root: string, id: string, byteSha: string) {
  const p = join(root, digest(id) + '.json'),
    before = lstatSync(p);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    (before.mode & 0o077) !== 0 ||
    (process.getuid && before.uid !== process.getuid()) ||
    before.size > 1048576
  )
    throw Error('Private exact evidence file required');
  const fd = openSync(p, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const current = fstatSync(fd);
    if (
      current.ino !== before.ino ||
      current.dev !== before.dev ||
      current.size !== before.size ||
      current.nlink !== 1 ||
      (current.mode & 0o077) !== 0
    )
      throw Error('File changed during exact read');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
        readFileSync(fd),
      ),
      record = body(text),
      after = fstatSync(fd);
    if (
      record.id !== id ||
      record.byte_sha256 !== digest(byteSha) ||
      after.size !== current.size ||
      after.mtimeMs !== current.mtimeMs
    )
      throw Error('Exact retained evidence bytes unavailable');
    return {
      text,
      ...record,
      status: 'HISTORICAL_BYTES_PRESENT' as const,
      canonical_restore: false as const,
      authority: false as const,
    };
  } finally {
    closeSync(fd);
  }
}
export function readSavedEvidenceFile(
  root: string,
  id: string,
  byteSha: string,
  gate: Gate,
) {
  on(gate);
  return existing(folder(root), id, byteSha);
}
/** One immutable content-addressed write. Partial/lost ACK never overwrites/replays.
 * A duplicate only reads existing bytes and does NOT fabricate a fresh fsync ACK. */
export function writeSavedEvidenceFile(root: string, text: string, gate: Gate) {
  on(gate);
  const dir = folder(root),
    record = body(text),
    path = join(dir, record.id + '.json');
  let fd: number;
  try {
    fd = openSync(
      path,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_RDWR |
        constants.O_NOFOLLOW,
      0o600,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    existing(dir, record.id, record.byte_sha256);
    return {
      ...record,
      status: 'EXISTING_FILE_READ_ONLY' as const,
      durable_ack: false as const,
      canonical_restore: false as const,
      authority: false as const,
    };
  }
  try {
    const bytes = Buffer.from(text, 'utf8');
    let position = 0;
    while (position < bytes.length) {
      const n = writeSync(
        fd,
        bytes,
        position,
        bytes.length - position,
        position,
      );
      if (n < 1) throw Error('Evidence write outcome UNKNOWN');
      position += n;
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  const d = openSync(dir, constants.O_RDONLY);
  try {
    fsyncSync(d);
  } finally {
    closeSync(d);
  }
  existing(dir, record.id, record.byte_sha256);
  return {
    ...record,
    status: 'LOCAL_FILE_SAVED' as const,
    durable_ack: true as const,
    canonical_restore: false as const,
    authority: false as const,
  };
}
