// Frozen-source CI browser evidence only. Never executes application commands.
import { readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
export const manifest = JSON.parse(
  readFileSync(
    new URL('./cycle32-c12-browser-evidence.json', import.meta.url),
    'utf8',
  ),
);
export const shards = Object.freeze(['desktop', 'tablet', 'mobile', 'off']);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function requireShard(shard) {
  if (!shards.includes(shard))
    throw Error('Exact bounded browser shard required');
}
export function expectedRows(shard) {
  requireShard(shard);
  return shard === 'off'
    ? manifest.inventory.off
    : manifest.inventory.native.filter((row) => row.project === shard);
}
function identity(row) {
  return JSON.stringify([
    row.id,
    row.file,
    row.line,
    row.title,
    row.project,
    row.timeout,
  ]);
}
export function reportRows(report) {
  if (
    !report ||
    !Array.isArray(report.suites) ||
    !Array.isArray(report.errors) ||
    report.errors.length
  )
    throw Error('Complete error-free Playwright report required');
  const rows = [];
  function walk(suites) {
    for (const suite of suites) {
      if (suite.specs !== undefined && !Array.isArray(suite.specs))
        throw Error('Exact specification list required');
      for (const spec of suite.specs ?? []) {
        if (!Array.isArray(spec.tests) || !spec.tests.length)
          throw Error('Missing original specification execution');
        for (const test of spec.tests)
          rows.push({
            id: spec.id,
            file: spec.file,
            line: spec.line,
            title: spec.title,
            project: test.projectName,
            timeout: test.timeout,
            spec,
            test,
          });
      }
      if (suite.suites !== undefined) {
        if (!Array.isArray(suite.suites))
          throw Error('Exact nested suite list required');
        walk(suite.suites);
      }
    }
  }
  walk(report.suites);
  return rows;
}
export function validateReport(report, shard, mode = 'execution') {
  requireShard(shard);
  if (!['collection', 'execution'].includes(mode))
    throw Error('Exact evidence phase required');
  const config = report?.config,
    expected = expectedRows(shard),
    configPath = manifest.config[shard === 'off' ? 'off' : 'native'];
  if (
    !config ||
    config.workers !== 2 ||
    config.fullyParallel !== false ||
    !String(config.configFile)
      .replaceAll('\\', '/')
      .endsWith('/' + configPath) ||
    !String(config.rootDir).replaceAll('\\', '/').endsWith('/tests/program')
  )
    throw Error('Original config and two-worker execution required');
  if (
    !Array.isArray(config.projects) ||
    config.projects.length !== 3 ||
    new Set(config.projects.map((p) => p.name)).size !== 3 ||
    config.projects.some(
      (p) =>
        !['desktop', 'tablet', 'mobile'].includes(p.name) ||
        p.repeatEach !== 1 ||
        p.retries !== 0 ||
        p.timeout !== (shard === 'off' ? 30000 : 90000),
    )
  )
    throw Error(
      'Original projects, budgets, zero retries and one repetition required',
    );
  const expectedById = new Map(expected.map((row) => [identity(row), row])),
    rows = reportRows(report),
    seen = new Set();
  if (rows.length !== expected.length)
    throw Error('Missing or additional original browser cases');
  for (const row of rows) {
    const key = identity(row),
      test = row.test;
    if (!expectedById.has(key) || seen.has(key))
      throw Error('Duplicate, foreign or changed original browser identity');
    seen.add(key);
    if (
      test.projectId !== row.project ||
      test.expectedStatus !== 'passed' ||
      !Array.isArray(test.results)
    )
      throw Error('Original passing expectation and result list required');
    if (mode === 'collection') {
      if (test.results.length !== 0 || test.status !== 'skipped')
        throw Error('Collection must contain no executed results');
    } else {
      if (
        row.spec.ok !== true ||
        test.status !== 'expected' ||
        test.results.length !== 1
      )
        throw Error('Exactly one original passing attempt required');
      const result = test.results[0];
      if (
        result.status !== 'passed' ||
        result.retry !== 0 ||
        !Array.isArray(result.errors) ||
        result.errors.length ||
        result.error ||
        !Number.isFinite(result.duration) ||
        result.duration < 0 ||
        result.duration > row.timeout
      )
        throw Error(
          'Retry, failure, error or elapsed original-budget violation',
        );
    }
  }
  const stats = report.stats;
  if (
    !stats ||
    typeof stats.startTime !== 'string' ||
    !Number.isFinite(Date.parse(stats.startTime)) ||
    !Number.isFinite(stats.duration) ||
    stats.duration < 0 ||
    stats.expected !== (mode === 'execution' ? expected.length : 0) ||
    stats.skipped !== (mode === 'collection' ? expected.length : 0) ||
    stats.unexpected !== 0 ||
    stats.flaky !== 0
  )
    throw Error('Exact complete outcome totals required');
  return {
    shard,
    cases: expected.length,
    collection_only: mode === 'collection',
    all_pass: mode === 'execution',
    authority: manifest.authority,
  };
}
export function validateBinding(binding, shard) {
  requireShard(shard);
  if (
    !binding ||
    binding.source !== manifest.source ||
    binding.tree !== manifest.source_tree ||
    binding.shard !== shard ||
    binding.node !== manifest.node ||
    binding.platform !== 'linux' ||
    binding.ubuntu !== '24.04' ||
    !/^[a-f0-9]{40}$/.test(binding.diagnostics_source ?? '') ||
    !same(binding.hashes, manifest.hashes) ||
    binding.tracked_source_clean !== true
  )
    throw Error(
      'Exact frozen source, runtime and original byte binding required',
    );
  return true;
}
export function validateCombined(inputs) {
  if (
    !Array.isArray(inputs) ||
    inputs.length !== 4 ||
    new Set(inputs.map((x) => x.shard)).size !== 4
  )
    throw Error('All four distinct actual shard records required');
  const diagnostics = new Set();
  let total = 0;
  for (const input of inputs) {
    validateBinding(input.before, input.shard);
    validateBinding(input.after, input.shard);
    if (!same(input.before, input.after))
      throw Error('Source binding changed during browser execution');
    diagnostics.add(input.before.diagnostics_source);
    validateReport(input.collection, input.shard, 'collection');
    total += validateReport(input.report, input.shard).cases;
  }
  if (diagnostics.size !== 1 || total !== 51)
    throw Error('Exact shared diagnostics and complete 51-case union required');
  return {
    source: manifest.source,
    cases: total,
    all_four_original_shards_passed: true,
    foundation_pass: false,
    authority: manifest.authority,
  };
}
function capture(root, shard) {
  const git = (...args) =>
    execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const hashes = {};
  for (const [path, expected] of Object.entries(manifest.hashes)) {
    const file = resolve(root, path),
      stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o111)
      throw Error('Original regular nonexecutable source required');
    hashes[path] = hash(readFileSync(file));
    if (hashes[path] !== expected)
      throw Error('Original source byte mismatch: ' + path);
  }
  const os = readFileSync('/etc/os-release', 'utf8');
  const binding = {
    source: git('rev-parse', 'HEAD'),
    tree: git('rev-parse', 'HEAD^{tree}'),
    shard,
    diagnostics_source: execFileSync(
      'git',
      [
        '-C',
        resolve(dirname(fileURLToPath(import.meta.url)), '..'),
        'rev-parse',
        'HEAD',
      ],
      { encoding: 'utf8' },
    ).trim(),
    node: process.version,
    platform: process.platform,
    ubuntu:
      /^ID=ubuntu$/m.test(os) && /^VERSION_ID="24\.04"$/m.test(os)
        ? '24.04'
        : null,
    hashes,
    tracked_source_clean:
      git('status', '--porcelain', '--untracked-files=no') === '',
  };
  validateBinding(binding, shard);
  return binding;
}
function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [command, shard, rootArg] = process.argv.slice(2);
  if (command === 'combine') {
    const root = resolve(shard),
      inputs = shards.map((name) => {
        const dir = resolve(root, name);
        return {
          shard: name,
          before: read(resolve(dir, 'source-binding-before.json')),
          after: read(resolve(dir, 'source-binding-after.json')),
          collection: read(resolve(dir, 'collection.json')),
          report: read(resolve(dir, 'results.json')),
        };
      });
    console.log(JSON.stringify(validateCombined(inputs), null, 2));
  } else {
    requireShard(shard);
    const root = resolve(rootArg ?? '.'),
      dir = resolve(root, 'artifacts/cycle32-c12', shard);
    if (command === 'bind')
      write(resolve(dir, 'source-binding-before.json'), capture(root, shard));
    else if (command === 'collection') {
      const result = validateReport(
        read(resolve(dir, 'collection.json')),
        shard,
        'collection',
      );
      write(resolve(dir, 'collection-validation.json'), result);
      console.log(JSON.stringify(result));
    } else if (command === 'result') {
      const before = read(resolve(dir, 'source-binding-before.json')),
        after = capture(root, shard);
      write(resolve(dir, 'source-binding-after.json'), after);
      validateBinding(before, shard);
      if (!same(before, after))
        throw Error('Frozen original source changed during browser execution');
      const collection = read(resolve(dir, 'collection.json')),
        report = read(resolve(dir, 'results.json'));
      validateReport(collection, shard, 'collection');
      const result = validateReport(report, shard);
      write(resolve(dir, 'result-validation.json'), {
        ...result,
        source: manifest.source,
        report_sha256: hash(readFileSync(resolve(dir, 'results.json'))),
        collection_sha256: hash(readFileSync(resolve(dir, 'collection.json'))),
        foundation_pass: false,
      });
      console.log(JSON.stringify(result));
    } else throw Error('Exact bind/collection/result/combine command required');
  }
}
