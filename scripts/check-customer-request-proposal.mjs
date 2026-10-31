// Offline integrity only; never loads configuration, credentials or hosted transports.
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const hash = (v) => createHash('sha256').update(v).digest('hex');
const review = JSON.parse(
  readFileSync('docs/CUSTOMER_REQUESTS_FORWARD_REVIEW.json', 'utf8'),
);
const files = readdirSync('supabase/migrations').sort();
if (
  files.length !== 14 ||
  review.dependencies.length !== 14 ||
  review.hostedApplied !== false ||
  review.hostedExecutionAuthorized !== false
)
  throw Error(
    'Fourteen unchanged dependencies and no hosted authority required',
  );
for (const [i, item] of review.dependencies.entries())
  if (
    item.file !== files[i] ||
    hash(readFileSync('supabase/migrations/' + item.file)) !== item.sha256
  )
    throw Error('Historical/customer14 dependency drift');
if (
  review.dependencies[13].sha256 !==
  'e3157e004c464fb2a4ab69e7a3a335a81d6bbbb0556d74234f3884f56d784ed1'
)
  throw Error('Pending fourteen changed');
if (hash(readFileSync(review.proposal.file)) !== review.proposal.sha256)
  throw Error('Customer request proposal changed; review hash required');
const sql = readFileSync(review.proposal.file, 'utf8').replace(/--[^\n]*/g, '');
if (
  /\bgrant\s+(execute|select|insert|update|delete|usage|all)\b/i.test(sql) ||
  /create\s+(?:or replace\s+)?function\s+private\.customer_capability/i.test(
    sql,
  ) ||
  /insert\s+into\s+private\.customer_request_principals/i.test(sql)
)
  throw Error(
    'Proposal must not activate capabilities, provision principals or grant runtime access',
  );
console.log(
  'Customer4B proposal/dependency integrity PASS; default-deny local review only. No hosted install, grants, principal provisioning or activation authority.',
);
