import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
export const digest = (value) =>
  createHash('sha256').update(value).digest('hex');
export function compileCustomerMigration() {
  const body = [
    'server/customer/schema.proposed.sql',
    'server/customer/workflow.proposed.sql',
  ]
    .map((p) =>
      readFileSync(p, 'utf8')
        .replace(/^begin;\n/m, '')
        .replace(/^commit;\n?/m, '')
        .replace(/^-- LOCAL REVIEW.*\n/m, ''),
    )
    .join('\n');
  return (
    "-- Customer authorization release readiness. LOCAL PENDING OWNER REVIEW; no hosted execution or activation authorized.\n-- Depends on the thirteen immutable historical migrations. All new client access and capabilities remain disabled.\nbegin;\nset local lock_timeout='2s';\nset local statement_timeout='30s';\n" +
    body +
    '\ncommit;\n'
  );
}
export function verifyCustomerMigration() {
  const m = JSON.parse(
    readFileSync('docs/CUSTOMER_AUTHORIZATION_MIGRATION_REVIEW.json', 'utf8'),
  );
  const all = readdirSync('supabase/migrations')
    .filter((p) => p.endsWith('.sql'))
    .sort()
    .map((file) => ({
      file,
      sha256: digest(readFileSync('supabase/migrations/' + file)),
    }));
  if (
    m.status !== 'LOCAL_PREPARED_NOT_AUTHORIZED' ||
    m.hostedApplied !== false ||
    m.hostedExecutionAuthorized !== false ||
    m.capabilitiesEnabled !== false ||
    m.newClientExecutionGrants !== 0 ||
    m.newClientPolicies !== 0 ||
    m.existingAclsChanged !== false ||
    [m.featureRows, m.mappings, m.leases, m.storageChanges].some(
      (x) => x !== 0,
    ) ||
    JSON.stringify(m.seeds) !== '[]' ||
    JSON.stringify(m.roles) !== '[]' ||
    JSON.stringify(all.slice(0, 13)) !== JSON.stringify(m.dependencies) ||
    digest(JSON.stringify(m.dependencies)) !== m.installedBundleSha256 ||
    JSON.stringify(all.slice(13)) !== JSON.stringify(m.migrations) ||
    m.migrations.length !== 1 ||
    digest(JSON.stringify(m.migrations)) !== m.pendingBundleSha256 ||
    readFileSync('supabase/migrations/' + m.migrations[0].file, 'utf8') !==
      compileCustomerMigration()
  )
    throw Error(
      'Customer forward migration/scope drift; never execute without separate exact review',
    );
  return m;
}
