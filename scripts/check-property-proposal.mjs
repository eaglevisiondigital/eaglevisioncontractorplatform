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
  ![
    'LOCAL_PROPOSAL_UNAPPLIED',
    'DEVELOPMENT_APPLIED_FEATURES_DISABLED',
  ].includes(m.status) ||
  m.hostedExecutionAuthorized !== false ||
  m.publicRpcEnabled !== false ||
  m.sha256 !== digest ||
  JSON.stringify(tables) !== JSON.stringify(m.privateTables) ||
  /create table public\.|create policy|create role|alter role/i.test(sql)
)
  throw Error('Property proposal integrity/scope mismatch');

const review = JSON.parse(
  readFileSync('docs/PROPERTY_MIGRATION_REVIEW.json', 'utf8'),
);
if (
  review.migrations.length !== 1 ||
  review.migrations[0].file !== m.formalMigration ||
  review.migrations[0].sha256 !== digest ||
  readFileSync('supabase/migrations/' + m.formalMigration, 'utf8') !== sql ||
  /create(?: or replace)? function public\./i.test(sql)
)
  throw Error('Formal property migration/source or exposure drift');

const applied = review.status === 'DEVELOPMENT_APPLIED_PROPERTY_DISABLED';
if (
  applied !== (m.status === 'DEVELOPMENT_APPLIED_FEATURES_DISABLED') ||
  (applied &&
    (review.developmentExecution?.featuresEnabled !== false ||
      review.developmentExecution?.fileSha256 !== digest ||
      review.developmentExecution?.result !== 'APPLIED_VERIFIED'))
)
  throw Error('Property proposal/execution state differs');
console.log(
  `Property SQL integrity PASS: ${tables.length} private tables; ${applied ? 'development applied; features disabled' : 'unapplied'}; no replay or activation authority`,
);
