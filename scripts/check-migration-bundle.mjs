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
  JSON.stringify(migrations.slice(reviewed.migrations.length)) !==
    JSON.stringify(pending.migrations)
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
