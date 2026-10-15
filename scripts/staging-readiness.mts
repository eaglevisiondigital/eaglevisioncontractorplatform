import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  validateManifest,
  verifyConnectedIsolation,
  type StagingManifest,
} from '../server/staging/acceptance.ts';
import {
  runConnectedWorkflows,
  type WorkflowScenario,
} from '../server/staging/workflows.ts';
const mode = process.argv[2] ?? 'plan';
if (!['plan', 'validate', 'verify', 'workflows'].includes(mode))
  throw new Error(
    'Use plan, validate, verify or workflows. No migration/deployment mode exists.',
  );
const migrations = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((file) => ({
    file,
    sha256: createHash('sha256')
      .update(readFileSync(`supabase/migrations/${file}`))
      .digest('hex'),
  }));
const digest = createHash('sha256')
  .update(JSON.stringify(migrations))
  .digest('hex');
if (mode === 'plan')
  console.log(
    JSON.stringify(
      {
        mode: 'offline-only',
        migrations,
        bundleSha256: digest,
        hostedActions: 'NONE',
      },
      null,
      2,
    ),
  );
else {
  if (!process.env.EV_STAGING_MANIFEST)
    throw new Error(
      'Supply ignored EV_STAGING_MANIFEST path; never commit it.',
    );
  const manifest = validateManifest(
    JSON.parse(
      readFileSync(process.env.EV_STAGING_MANIFEST, 'utf8'),
    ) as StagingManifest,
  );
  if (mode === 'validate')
    console.log(
      'Manifest shape/expiry accepted. This is not environment approval or hosted evidence.',
    );
  else {
    if (process.env.EV_STAGING_READ_APPROVAL !== manifest.approvalReference)
      throw new Error('Explicit read-test approval reference required.');
    try {
      const report =
        mode === 'workflows'
          ? await runConnectedWorkflows(
              manifest,
              JSON.parse(
                readFileSync(process.env.EV_STAGING_SCENARIOS ?? '', 'utf8'),
              ) as WorkflowScenario[],
              process.env.EV_STAGING_PUBLISHABLE_KEY ?? '',
              process.env,
              process.env.EV_STAGING_WRITE_APPROVAL ?? '',
            )
          : await verifyConnectedIsolation(
              manifest,
              process.env.EV_STAGING_PUBLISHABLE_KEY ?? '',
              process.env,
            );
      console.log(
        JSON.stringify({
          passed: report.passed,
          scope:
            mode === 'workflows'
              ? 'operator-authored internal RPC assertions'
              : 'Auth/AAL2 + table SELECT isolation only',
          migrationBundle: digest,
          remaining:
            'RPC mutations, Storage, browser, worker and compliance acceptance',
        }),
      );
    } catch {
      console.error(
        'Connected acceptance failed. No response bodies or tokens logged. Inspect privately.',
      );
      process.exitCode = 1;
    }
  }
}
