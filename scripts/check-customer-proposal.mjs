import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const p = JSON.parse(
    readFileSync('docs/CUSTOMER_PORTAL_PROPOSAL.json', 'utf8'),
  ),
  sql = readFileSync(p.sqlFile, 'utf8'),
  workflow = readFileSync(p.workflowSqlFile, 'utf8');
if (
  p.status !== 'FORMAL_LOCAL_MIGRATION_PREPARED_NOT_AUTHORIZED' ||
  p.hostedApplied !== false ||
  p.clientExecutionGrants !== 0 ||
  p.clientTablePolicies !== 0 ||
  p.mutationsExposed !== 0 ||
  p.provisioningCommands !== 0 ||
  p.maximumLeaseMinutes !== 15 ||
  p.productionConsentOrDecisionWriter !== false ||
  p.sqlSha256 !== createHash('sha256').update(sql).digest('hex') ||
  p.workflowSqlSha256 !== createHash('sha256').update(workflow).digest('hex') ||
  p.workflowStatus !== 'FORMAL_LOCAL_MIGRATION_PREPARED_NOT_AUTHORIZED' ||
  p.decisionIsFinancialConsent !== false ||
  p.proposalBundleDefinition !==
    'SHA256(schema bytes followed by workflow bytes)' ||
  p.proposalBundleSha256 !==
    createHash('sha256').update(sql).update(workflow).digest('hex') ||
  /(?:insert\s+into|update|delete\s+from)\s+public\./i.test(
    sql + '\n' + workflow,
  ) ||
  /\bgrant\s|create\s+policy\b/i.test(sql + '\n' + workflow) ||
  readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'))
    .length !== 14
)
  throw Error(
    'Customer portal proposal/exposure/history drift; independent review required',
  );
console.log(
  'Customer discovery/estimate proposal integrity PASS; default-deny publication/review evidence, zero client execution grants; LOCAL pending migration; no hosted execution or activation authority.',
);
