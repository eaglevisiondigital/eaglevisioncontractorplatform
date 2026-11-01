import { spawnSync } from 'node:child_process';
const python = process.env.PROPEL_RECOVERY_PYTHON ?? 'python3';
const result = spawnSync(
  python,
  [
    '-B',
    '-m',
    'unittest',
    'discover',
    '-s',
    'recovery/monterey',
    '-p',
    'test_*.py',
  ],
  { stdio: 'inherit' },
);
if (result.error)
  console.error(
    'Recovery test runtime unavailable; use the reviewed isolated Python environment.',
  );
process.exit(result.status ?? 1);
