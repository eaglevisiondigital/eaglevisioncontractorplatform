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
if (
  pending.status !== 'PENDING_REVIEW_NOT_AUTHORIZED' ||
  pending.approvedHistoricalBundleSha256 !== reviewed.bundleSha256 ||
  createHash('sha256')
    .update(JSON.stringify(pending.migrations))
    .digest('hex') !== pending.pendingBundleSha256 ||
  JSON.stringify(migrations.slice(reviewed.migrations.length)) !==
    JSON.stringify(pending.migrations)
)
  throw new Error('Unreviewed forward migration drift');
console.log(
  `Reviewed migration bundle matches ${reviewed.migrations.length} historical files; ${pending.migrations.length} forward migration(s) UNAPPLIED / NOT AUTHORIZED; no hosted action performed.`,
);
