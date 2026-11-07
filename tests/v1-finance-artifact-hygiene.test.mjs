import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const parent = '337da476aa6061dba626aff343f0e6045331ac82',
  root = realpathSync(fileURLToPath(new URL('../', import.meta.url))),
  sourcePath = 'tests/browser/job-margin.spec.ts',
  source = readFileSync(join(root, sourcePath), 'utf8'),
  rule = '/artifacts/finance/*.png',
  templates = [...source.matchAll(/path: `(artifacts\/finance\/[^`]+)`/g)].map(
    (match) => match[1],
  ),
  families = [
    'job-margin',
    'job-margin-warnings',
    'job-cost-completion',
    'job-cost-completion-detail',
  ],
  options = { timeout: 30_000 };
const environment = { ...process.env };
for (const name of [
  'GIT_DIR',
  'GIT_COMMON_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_CONFIG_COUNT',
])
  delete environment[name];
environment.GIT_CONFIG_GLOBAL = '/dev/null';
environment.GIT_CONFIG_NOSYSTEM = '1';
let fixture;
before(() => {
  fixture = mkdtempSync(join(tmpdir(), 'propel-finance-ignore-'));
  execFileSync('git', ['init', '--quiet', fixture], { env: environment });
  writeFileSync(
    join(fixture, '.gitignore'),
    readFileSync(join(root, '.gitignore')),
  );
});
after(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});
function ignored(path) {
  return spawnSync(
    'git',
    [
      '--no-replace-objects',
      '-c',
      'core.excludesFile=/dev/null',
      '-c',
      'core.ignoreCase=false',
      '-C',
      fixture,
      'check-ignore',
      '--no-index',
      '--verbose',
      '--',
      path,
    ],
    { env: environment, encoding: 'utf8' },
  );
}
function expectIgnored(path) {
  const result = ignored(path);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`:${rule}\t${path}`), result.stdout);
}

test(
  'only the finite root PNG rule is appended to the original ignore bytes',
  options,
  () => {
    const original = execFileSync(
      'git',
      ['--no-replace-objects', '-C', root, 'show', `${parent}:.gitignore`],
      { env: environment },
    );
    assert.deepEqual(
      readFileSync(join(root, '.gitignore')),
      Buffer.concat([original, Buffer.from(`\n${rule}\n`)]),
    );
  },
);
test(
  'all four original awaited screenshot templates remain source-exact',
  options,
  () => {
    assert.equal(
      execFileSync(
        'git',
        ['--no-replace-objects', '-C', root, 'show', `${parent}:${sourcePath}`],
        { env: environment, encoding: 'utf8' },
      ),
      source,
    );
    assert.deepEqual(
      templates,
      families.map(
        (family) =>
          `artifacts/finance/${family}-\${info.project.name}-\${company}.png`,
      ),
    );
    assert.equal(
      [
        ...source.matchAll(
          /await (?:page|panel)\.screenshot\(\{\s*path: `artifacts\/finance\//g,
        ),
      ].length,
      4,
    );
  },
);
for (const [index, family] of families.entries())
  test(`ignores original ${family} screenshot path`, options, () => {
    const path = templates[index]
      .replace('${info.project.name}', 'desktop')
      .replace('${company}', 'sample-property');
    expectIgnored(path);
  });
for (const path of [
  'src/components/Finance.tsx',
  'artifacts/finance/records.json',
  'artifacts/finance/receipt.png.json',
  'artifacts/finance/report.svg',
  'artifacts/finance/report.pdf',
  'artifacts/finance/nested/job-margin.png',
  'nested/artifacts/finance/job-margin.png',
  'artifacts/finances/job-margin.png',
])
  test(`does not ignore ${path}`, options, () => {
    const result = ignored(path);
    assert.equal(result.status, 1, result.stderr + result.stdout);
    assert.equal(result.stdout, '');
  });
test(
  'a PNG-named symlink is a name match, not protection of its target',
  options,
  () => {
    mkdirSync(join(fixture, 'artifacts/finance'), { recursive: true });
    writeFileSync(join(fixture, 'synthetic-target.json'), '{}\n');
    symlinkSync(
      join(fixture, 'synthetic-target.json'),
      join(fixture, 'artifacts/finance/synthetic-link.png'),
    );
    expectIgnored('artifacts/finance/synthetic-link.png');
    assert.equal(ignored('synthetic-target.json').status, 1);
  },
);
test(
  'Git refuses to traverse a directory symlink for ignore evidence',
  options,
  () => {
    mkdirSync(join(fixture, 'synthetic-directory'));
    writeFileSync(join(fixture, 'synthetic-directory/image.png'), 'synthetic');
    symlinkSync(
      join(fixture, 'synthetic-directory'),
      join(fixture, 'artifacts/finance/synthetic-directory-link'),
      'dir',
    );
    const result = ignored(
      'artifacts/finance/synthetic-directory-link/image.png',
    );
    assert.equal(result.status, 128);
    assert.match(result.stderr, /beyond a symbolic link/);
  },
);
test(
  'a PNG-named directory also matches: this rule is not a file-type fence',
  options,
  () => {
    mkdirSync(join(fixture, 'artifacts/finance/synthetic-folder.png'));
    writeFileSync(
      join(fixture, 'artifacts/finance/synthetic-folder.png/record.json'),
      '{}\n',
    );
    const result = ignored(
      'artifacts/finance/synthetic-folder.png/record.json',
    );
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes(`:${rule}\t`), result.stdout);
  },
);
