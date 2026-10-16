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
const bundleSha256 = createHash('sha256')
  .update(JSON.stringify(migrations))
  .digest('hex');
const reviewed = JSON.parse(readFileSync('docs/MIGRATION_BUNDLE.json', 'utf8'));
if (
  JSON.stringify(migrations) !== JSON.stringify(reviewed.migrations) ||
  bundleSha256 !== reviewed.bundleSha256
)
  throw new Error(
    'Migration bundle drift. Re-review changes, regenerate the offline bundle and obtain fresh action authorization.',
  );
console.log(
  `Reviewed migration bundle matches ${migrations.length} files; no hosted action performed.`,
);
