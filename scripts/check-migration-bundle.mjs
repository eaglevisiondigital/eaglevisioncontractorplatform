import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const allMigrations = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((file) => ({
    file,
    sha256: createHash('sha256')
      .update(readFileSync(`supabase/migrations/${file}`))
      .digest('hex'),
  }));
// Historical manifests bind only the thirteen installed files; customer forward scope is checked separately.
const migrations = allMigrations.slice(0, 13);
const reviewed = JSON.parse(readFileSync('docs/MIGRATION_BUNDLE.json', 'utf8'));
if (
  JSON.stringify(migrations.slice(0, reviewed.migrations.length)) !==
    JSON.stringify(reviewed.migrations) ||
  createHash('sha256')
    .update(JSON.stringify(migrations.slice(0, reviewed.migrations.length)))
    .digest('hex') !== reviewed.bundleSha256
)
  throw new Error(
    'Migration bundle drift. Re-review changes, regenerate the offline bundle and obtain fresh action authorization.',
  );
const pending = JSON.parse(
  readFileSync('docs/PROVIDER_MIGRATION_REVIEW.json', 'utf8'),
);
const developmentApplied =
  pending.status === 'DEVELOPMENT_APPLIED_PROVIDER_DISABLED';
if (
  (!developmentApplied && pending.status !== 'PENDING_REVIEW_NOT_AUTHORIZED') ||
  pending.approvedHistoricalBundleSha256 !== reviewed.bundleSha256 ||
  createHash('sha256')
    .update(JSON.stringify(pending.migrations))
    .digest('hex') !== pending.pendingBundleSha256 ||
  JSON.stringify(
    migrations.slice(
      reviewed.migrations.length,
      reviewed.migrations.length + pending.migrations.length,
    ),
  ) !== JSON.stringify(pending.migrations)
)
  throw new Error('Unreviewed forward migration drift');
if (
  developmentApplied &&
  (pending.migrations.length !== 1 ||
    pending.developmentExecution?.result !== 'APPLIED_VERIFIED' ||
    pending.developmentExecution?.scope !== 'development-schema-only' ||
    pending.developmentExecution?.providersEnabled !== false ||
    pending.developmentExecution?.migrationVersion !==
      pending.migrations[0].file.split('_')[0] ||
    pending.developmentExecution?.fileSha256 !== pending.migrations[0].sha256 ||
    pending.developmentExecution?.bundleSha256 !== pending.pendingBundleSha256)
)
  throw new Error('Development execution record does not match reviewed bytes');
console.log(
  `Reviewed migration bundle matches ${reviewed.migrations.length} original files; ${pending.migrations.length} separately reviewed provider migration(s) ${developmentApplied ? 'recorded DEVELOPMENT APPLIED / PROVIDERS DISABLED' : 'UNAPPLIED / NOT AUTHORIZED'}; offline integrity check only, no hosted action performed.`,
);

const property = JSON.parse(
  readFileSync('docs/PROPERTY_MIGRATION_REVIEW.json', 'utf8'),
);
const historical = migrations.slice(
  0,
  reviewed.migrations.length + pending.migrations.length,
);
const hash = (v) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');
const propertyApplied =
  property.status === 'DEVELOPMENT_APPLIED_PROPERTY_DISABLED';
if (
  (!propertyApplied && property.status !== 'PENDING_REVIEW_NOT_AUTHORIZED') ||
  property.hostedExecutionAuthorized !== false ||
  property.activationAuthorized !== false ||
  property.scope !== 'development-schema-only-default-disabled' ||
  property.migrations.length !== 1 ||
  property.originalNineBundleSha256 !== reviewed.bundleSha256 ||
  property.appliedProviderBundleSha256 !== pending.pendingBundleSha256 ||
  JSON.stringify(historical) !==
    JSON.stringify(property.historicalMigrations) ||
  hash(historical) !== property.historicalBundleSha256 ||
  JSON.stringify(
    migrations.slice(
      historical.length,
      historical.length + property.migrations.length,
    ),
  ) !== JSON.stringify(property.migrations) ||
  hash(property.migrations) !== property.pendingBundleSha256 ||
  hash(migrations.slice(0, historical.length + property.migrations.length)) !==
    property.fullProposedBundleSha256 ||
  JSON.stringify(property.seeds) !== '[]' ||
  JSON.stringify(property.roles) !== '[]' ||
  property.featureRows !== 0 ||
  property.workloadGrants !== 0 ||
  property.storageChanges !== 0 ||
  JSON.stringify(property.publicWrappers) !== '[]'
)
  throw Error('Unreviewed property migration drift or activation metadata');
if (
  propertyApplied &&
  (property.developmentExecution?.result !== 'APPLIED_VERIFIED' ||
    property.developmentExecution?.scope !== 'development-schema-only' ||
    property.developmentExecution?.migrationVersion !== '20261017005322' ||
    property.developmentExecution?.reviewedCommit !== 'd9836b4' ||
    property.developmentExecution?.featuresEnabled !== false ||
    property.developmentExecution?.mediaEnabled !== false ||
    property.developmentExecution?.providersEnabled !== false ||
    property.developmentExecution?.fileSha256 !==
      property.migrations[0].sha256 ||
    property.developmentExecution?.bundleSha256 !==
      property.pendingBundleSha256 ||
    property.migrations[0].sha256 !==
      'c345bdf178c9339dba7ba2707c74233bcfae9a2d2b59abf148f4b7ffff35780c' ||
    property.pendingBundleSha256 !==
      '0fadce830aa3c08ecfd9b715f282272687eee845a0fc6ce635fad3a5a7190fe9')
)
  throw Error(
    'Property execution record differs from approved bytes or dormant scope',
  );
console.log(
  `One separately inventoried property migration is ${propertyApplied ? 'recorded DEVELOPMENT APPLIED / FEATURES DISABLED' : 'UNAPPLIED / NOT AUTHORIZED'}; ten historical files preserved. Offline integrity is not replay or activation authority.`,
);

const p0 = JSON.parse(
  readFileSync('docs/PROPERTY_P0_MIGRATION_REVIEW.json', 'utf8'),
);
const installed = migrations.slice(0, 11),
  proposed = migrations.slice(11);
const p0Applied = p0.status === 'DEVELOPMENT_APPLIED_P0_DISABLED';
if (
  (!p0Applied && p0.status !== 'LOCAL_ONLY_NOT_AUTHORIZED') ||
  p0.hostedExecutionAuthorized !== false ||
  p0.activationAuthorized !== false ||
  hash(installed) !== p0.installedBundleSha256 ||
  JSON.stringify(proposed) !== JSON.stringify(p0.migrations) ||
  hash(proposed) !== p0.proposedBundleSha256 ||
  hash(migrations) !== p0.fullProposedBundleSha256 ||
  p0.featureRows !== 0 ||
  p0.reportAccessRows !== 0 ||
  JSON.stringify(p0.publicWrappers) !==
    JSON.stringify([
      'property_command',
      'property_workspace',
      'property_reports',
    ]) ||
  p0.migrations.length !== 2 ||
  JSON.stringify(p0.seeds) !== '[]' ||
  JSON.stringify(p0.roles) !== '[]'
)
  throw Error('Unreviewed P0 forward proposals or activation');
if (
  p0Applied &&
  (p0.developmentExecution?.result !== 'APPLIED_VERIFIED' ||
    p0.developmentExecution?.scope !== 'development-schema-only' ||
    p0.developmentExecution?.reviewedCommit !== '7e472b7' ||
    p0.developmentExecution?.historyCount !== 13 ||
    p0.developmentExecution?.featuresEnabled !== false ||
    p0.developmentExecution?.customerMappingsCreated !== 0 ||
    p0.developmentExecution?.reportLeasesCreated !== 0 ||
    p0.developmentExecution?.mediaEnabled !== false ||
    p0.developmentExecution?.providersEnabled !== false ||
    p0.developmentExecution?.bundleSha256 !== p0.proposedBundleSha256 ||
    p0.proposedBundleSha256 !==
      '5349a3b175a55bd6f360819c7942fc74f69d9a29c1765a058e20df1319df6dea' ||
    JSON.stringify(p0.developmentExecution?.migrationVersions) !==
      JSON.stringify(['20261017024327', '20261017024328']) ||
    JSON.stringify(p0.migrations) !==
      JSON.stringify([
        {
          file: '20261017024327_property_connected_readiness.sql',
          sha256:
            '6bb0b9bf22ec1079d7aa5f74c6e33e14534cc54e30e9034c33949f786cfd3ac9',
        },
        {
          file: '20261017024328_property_duplicate_index_cleanup.sql',
          sha256:
            '3603fe0482f46b9733a0321cd9009cb1f291993fcbede7132e1bdf721776fdfc',
        },
      ]))
)
  throw Error('P0 applied record differs from exact approved dormant scope');
console.log(
  p0Applied
    ? 'Two P0 migrations recorded DEVELOPMENT APPLIED / FEATURES DISABLED; thirteen installed files preserved. Offline integrity is not replay or activation authority.'
    : 'Two P0 forward proposals LOCAL ONLY / NOT AUTHORIZED; eleven installed files preserved.',
);

const { verifyCustomerMigration } = await import('./customer-migration.mjs');
verifyCustomerMigration();
console.log(
  'One pending customer migration verified; thirteen historical files unchanged; hosted execution NOT AUTHORIZED.',
);
