// Verified historical test inputs only. This grants no admission or execution.
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
const path = 'scripts/invoice-caller-source-admission.mjs';
let prefix = '';
for (const part of path.split('/')) {
  prefix = prefix ? prefix + '/' + part : part;
  if (lstatSync(prefix).isSymbolicLink())
    throw Error('Reviewed guard fixture helper required');
}
const info = lstatSync(path);
if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o644)
  throw Error('Reviewed guard fixture helper required');
const bytes = readFileSync(path);
if (
  createHash('sha256').update(bytes).digest('hex') !==
  'cf28a441f146c5e4d398eb0ea0b78a999dd0f744e19424c46f3e95de74229438'
)
  throw Error('Reviewed guard fixture helper required');
const { createGuardHistoricalRead } = await import(
  'data:text/javascript;base64,' + bytes.toString('base64')
);
export const createHistoricalRead = createGuardHistoricalRead;
