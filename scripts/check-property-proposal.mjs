import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const m = JSON.parse(
  readFileSync('docs/PROPERTY_OPERATIONS_PROPOSAL.json', 'utf8'),
);
const sql = readFileSync('server/property/schema.proposed.sql', 'utf8');
const digest = createHash('sha256').update(sql).digest('hex');
const tables = [...sql.matchAll(/create table private\.([a-z_]+)/g)].map(
  (x) => x[1],
);
if (
  m.status !== 'LOCAL_PROPOSAL_UNAPPLIED' ||
  m.hostedExecutionAuthorized !== false ||
  m.publicRpcEnabled !== false ||
  m.sha256 !== digest ||
  JSON.stringify(tables) !== JSON.stringify(m.privateTables) ||
  /create table public\.|create policy|create role|alter role/i.test(sql)
)
  throw Error('Property proposal integrity/scope mismatch');
console.log(
  `Property SQL proposal integrity PASS: ${tables.length} private tables; unexposed/default-off; no hosted execution approval`,
);
