// Offline two-input proposal qualification only. No writer, installer or clock override.
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const directory = 'proposals/native-quote-fixture-expiry';
const identityHash =
  '7ad75aa28e1b9897ee9c902d4d98a431573ec16ef46336c7151d0bfb3c92e25c';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = () => {
  throw Error('Exact unapplied two-quote fixture proposal required');
};
export function qualifyNativeQuoteFixture({
  read = readFileSync,
  stat = lstatSync,
} = {}) {
  const checked = (path, hash) => {
    let prefix = '';
    for (const segment of path.split('/')) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      if (stat(prefix).isSymbolicLink()) fail();
    }
    const mode = stat(path);
    if (!mode.isFile() || (mode.mode & 0o111) !== 0) fail();
    const bytes = Buffer.from(read(path));
    if (digest(bytes) !== hash) fail();
    return bytes;
  };
  const identity = JSON.parse(
    checked(`${directory}/identity.json`, identityHash),
  );
  const original = execFileSync(
    'git',
    ['--no-replace-objects', 'cat-file', 'commit', identity.base],
    { encoding: 'utf8' },
  );
  if (original !== identity.baseRawCommit) fail();
  checked(`${directory}/fixture-expiry.patch`, identity.patchSHA256);
  checked(identity.unchangedSql.path, identity.unchangedSql.sha256);
  const previous = "quote_expires_at: '2026-11-16T12:00:00Z'";
  const replacement =
    'quote_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()';
  const projection = Object.entries(identity.files).map(([path, pin]) => {
    const before = checked(path, pin.beforeSHA256).toString('utf8');
    if (before.split(previous).length !== 2) fail();
    const after = before.replace(previous, replacement);
    if (digest(after) !== pin.afterSHA256) fail();
    return Object.freeze({ path, content: after, sha256: pin.afterSHA256 });
  });
  return Object.freeze({
    classification: identity.classification,
    base: identity.base,
    patchSHA256: identity.patchSHA256,
    projection: Object.freeze(projection),
    sourceAuthorApproval: false,
    operationalReady: false,
  });
}
