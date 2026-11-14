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
  '1d3438c34656e732c0352dab02477ea449ed4e4abd92714156c3ec62ff75e70a'
)
  throw Error('Reviewed guard fixture helper required');
const { createGuardHistoricalRead } = await import(
  'data:text/javascript;base64,' + bytes.toString('base64')
);
export const createHistoricalRead = createGuardHistoricalRead;
