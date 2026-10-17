import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const migrations = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((file) => ({
    file,
    sha256: createHash('sha256')
      .update(readFileSync(`supabase/migrations/${file}`))
      .digest('hex'),
  }));
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
if (
  p0.status !== 'LOCAL_ONLY_NOT_AUTHORIZED' ||
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
console.log(
  'Two P0 forward proposals LOCAL ONLY / NOT AUTHORIZED; eleven installed files preserved.',
);
