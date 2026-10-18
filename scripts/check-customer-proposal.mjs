import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const p = JSON.parse(
    readFileSync('docs/CUSTOMER_PORTAL_PROPOSAL.json', 'utf8'),
  ),
  sql = readFileSync(p.sqlFile, 'utf8');
if (
  p.status !== 'LOCAL_PROPOSAL_NOT_AUTHORIZED_NOT_A_MIGRATION' ||
  p.hostedApplied !== false ||
  p.clientExecutionGrants !== 0 ||
  p.clientTablePolicies !== 0 ||
  p.mutationsExposed !== 0 ||
  p.provisioningCommands !== 0 ||
  p.maximumLeaseMinutes !== 15 ||
  p.productionConsentOrDecisionWriter !== false ||
  p.sqlSha256 !== createHash('sha256').update(sql).digest('hex') ||
  /\bgrant\s|create\s+policy\b/i.test(sql) ||
  readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'))
    .length !== 13
)
  throw Error(
    'Customer portal proposal/exposure/history drift; independent review required',
  );
console.log(
  'Customer discovery/estimate proposal integrity PASS; one default-deny authorization table, zero client execution grants; LOCAL ONLY, not migration or activation authority.',
);
