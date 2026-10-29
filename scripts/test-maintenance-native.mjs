// Local disposable test runner ONLY. Never reads an application URL or credential.
import { spawn } from 'node:child_process';
import { access, mkdtemp, open, realpath, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const candidates = process.env.PG17_BIN
  ? [resolve(process.env.PG17_BIN)]
  : [
      '/opt/homebrew/opt/postgresql@17/bin',
      '/usr/local/opt/postgresql@17/bin',
      '/usr/lib/postgresql/17/bin',
    ];
const repairOnly = process.argv.slice(2).join(' ') === '--workstream=2b';
if (process.argv.length > 2 && !repairOnly)
  throw Error('Only --workstream=2b is supported.');
let bin;
for (const dir of candidates) {
  try {
    await access(join(dir, 'pg_ctl'));
    bin = dir;
    break;
  } catch {
    /* Try another local installation; no download. */
  }
}
if (!bin)
  throw Error(
    'PostgreSQL 17 binaries required. Set PG17_BIN to an existing local installation; no fallback/download.',
  );
let child,
  interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    interrupted = true;
    child?.kill(signal);
  });
function run(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    child = spawn(file, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      child = undefined;
      if (code === 0) resolve();
      else reject(Error(`Local test command exited ${code ?? signal}`));
    });
  });
}
const temp = await mkdtemp(
  join(await realpath('/tmp'), 'propel-maintenance-pg-'),
);
let started = false,
  log;
try {
  log = await open(join(temp, 'setup.log'), 'w', 0o600);
  // Version checked before cluster creation; this is not a Supabase CLI/database operation.
  await new Promise((resolve, reject) => {
    const p = spawn(join(bin, 'postgres'), ['--version'], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let text = '';
    p.stdout.on('data', (b) => (text += b));
    p.once('error', reject);
    p.once('exit', (code) =>
      code === 0 && /PostgreSQL\) 17\./.test(text)
        ? resolve()
        : reject(Error('Native PostgreSQL 17 required.')),
    );
  });
  if (interrupted) throw Error('Interrupted before test cluster creation.');
  await run(
    join(bin, 'initdb'),
    ['-D', join(temp, 'data'), '-U', 'ev_test', '--auth=trust', '--no-locale'],
    { stdio: ['ignore', log.fd, log.fd] },
  );
  if (interrupted) throw Error('Interrupted before test server start.');
  started = true; // Cleanup also covers an interrupted/partially completed start.
  await run(join(bin, 'pg_ctl'), [
    '-D',
    join(temp, 'data'),
    '-l',
    join(temp, 'server.log'),
    '-o',
    `-k ${temp} -h '' -p 55477`,
    '-w',
    'start',
  ]);
  console.log(
    'Disposable native PostgreSQL 17; TCP disabled; test-only synthetic data.',
  );
  await run(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      ...(repairOnly ? [] : ['tests/database/maintenance-persistence.test.ts']),
      'tests/database/repair-persistence.test.ts',
      '--maxWorkers=1',
    ],
    { env: { ...process.env, EV_TEST_PG_SOCKET: temp, EV_TEST_PG_CI: '' } },
  );
} finally {
  if (started)
    await run(join(bin, 'pg_ctl'), [
      '-D',
      join(temp, 'data'),
      '-m',
      'fast',
      '-w',
      'stop',
    ]);
  await log?.close();
  await rm(temp, { recursive: true, force: true });
}
if (interrupted) process.exitCode = 130;
