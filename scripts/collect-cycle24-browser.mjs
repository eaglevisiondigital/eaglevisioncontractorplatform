import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { devices } from '@playwright/test';
import { sampleCompanies } from '../src/domain/platform.ts';
import {
  assertCycle24ExecutionCommit,
  cycle24CriticalSources,
  cycle24RuntimeCommit,
  validateCycle24CriticalSources,
} from './check-cycle24.mjs';
import {
  admitCycle25Source,
  cycle25SourcePorts,
} from './cycle25-source-lineage.mjs';

const directory = resolve(
  process.env.CYCLE24_ARTIFACT_DIR ?? 'artifacts/cycle24',
);
const cycle25Evidence = directory === resolve('artifacts/cycle25');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const inventoryPath = 'docs/program/CYCLE24_RUNTIME_FILES.json';
const inventory = json(inventoryPath);
const projects = {
  desktop: devices['Desktop Chrome'].viewport,
  tablet: devices['iPad Mini'].viewport,
  mobile: devices['iPhone 13'].viewport,
};
const states = [
  'task-receipt',
  'cost-action',
  'owner-action',
  'service-request-review',
  'service-request-saved',
  'stale-owner',
  'maintenance-terminal',
];
const executionCommits = new Set();
const admittedSources = new Map();
const verifiedCommits = new Set();
// Git object IDs are immutable. Cache only their content digests; current files
// and every evidence row are still checked independently below.
const gitHashes = new Map();
function gitHash(commit, path) {
  const key = `${commit}:${path}`;
  if (!gitHashes.has(key))
    gitHashes.set(key, sha(execFileSync('git', ['show', key])));
  return gitHashes.get(key);
}
function binding(item) {
  if (
    !/^[a-f0-9]{40}$/.test(item.source_commit) ||
    item.inventory_sha256 !== sha(readFileSync(inventoryPath)) ||
    item.source_files?.length !== 76 ||
    item.release !== 'NOT_READY_NOT_AUTHORIZED'
  )
    throw Error('Exact frozen runtime binding required');
  if (!verifiedCommits.has(item.source_commit)) {
    assertCycle24ExecutionCommit(item.source_commit);
    for (const path of cycle24CriticalSources)
      if (
        gitHash(item.source_commit, path) !==
        gitHash(cycle24RuntimeCommit, path)
      )
        throw Error('Executed commit changes critical frozen source');
    verifiedCommits.add(item.source_commit);
  }
  executionCommits.add(item.source_commit);
  const pending = new Set(inventory.paths);
  for (const f of item.source_files) {
    if (!pending.has(f.path))
      throw Error('Unrequested capture source forbidden');
    const current = cycle25SourcePorts.read(f.path);
    if (!pending.delete(f.path) || f.sha256 !== sha(current))
      throw Error('Capture source missing, changed or substituted');
    if (f.sha256 !== gitHash(cycle24RuntimeCommit, f.path)) {
      const admission = admitCycle25Source(
        f.path,
        current,
        execFileSync('git', ['show', `${cycle24RuntimeCommit}:${f.path}`]),
      );
      admittedSources.set(f.path, admission);
    }
    if (f.sha256 !== gitHash(item.source_commit, f.path))
      throw Error('Executed checkout differs from frozen runtime');
  }
  if (pending.size) throw Error('Incomplete runtime binding');
}
function report(mode) {
  const production = mode === 'production',
    file = production ? 'browser-off-results.json' : 'browser-results.json';
  const r = json(resolve(directory, file));
  const pending = new Set(
    Object.keys(projects).flatMap((p) =>
      (production
        ? ['production keeps native actions closed']
        : sampleCompanies.map(
            (c) =>
              `native action journey preserves one exact source context / ${c.slug}`,
          )
      ).map((title) => JSON.stringify([p, title])),
    ),
  );
  const total = pending.size,
    port = cycle25Evidence
      ? production
        ? 4435
        : 4425
      : production
        ? 4434
        : 4424;
  if (
    r.errors?.length ||
    r.stats?.expected !== total ||
    r.stats?.unexpected !== 0 ||
    r.stats?.flaky !== 0 ||
    r.stats?.skipped !== 0 ||
    r.config?.workers !== 1 ||
    r.config?.fullyParallel !== false ||
    r.config?.webServer?.url !== `http://127.0.0.1:${port}` ||
    r.config?.webServer?.reuseExistingServer !== false ||
    r.config.projects.length !== 3 ||
    r.config.projects.some((p) => p.retries !== 0 || p.repeatEach !== 1)
  )
    throw Error('Complete finite nonflaky browser PASS required');
  function walk(suites) {
    for (const suite of suites) {
      for (const spec of suite.specs ?? [])
        for (const t of spec.tests ?? []) {
          if (
            !pending.delete(JSON.stringify([t.projectName, spec.title])) ||
            t.expectedStatus !== 'passed' ||
            t.status !== 'expected' ||
            t.results.length !== 1 ||
            t.results[0].status !== 'passed' ||
            t.results[0].retry !== 0
          )
            throw Error('Missing, repeated, failed or retried browser case');
        }
      walk(suite.suites ?? []);
    }
  }
  walk(r.suites);
  if (pending.size) throw Error('Browser scenario omitted');
  return { cases: total, sha256: sha(readFileSync(resolve(directory, file))) };
}
const development = report('development'),
  production = report('production');
validateCycle24CriticalSources();
const captures = [],
  keyboard = [];
let trustedEvents = 0;
for (const [project, viewport] of Object.entries(projects))
  for (const company of sampleCompanies) {
    let job;
    for (const state of states) {
      const id = `${state}-${project}-${company.slug}`,
        png = resolve(directory, 'screenshots', id + '.png'),
        metadata = resolve(directory, 'screenshots', id + '.json'),
        m = json(metadata);
      binding(m);
      if (
        m.schema !== 'propel-cycle24-browser-capture-v1' ||
        m.screenshot_id !== id ||
        m.company_id !== company.id ||
        m.brand !== company.slug ||
        m.project !== project ||
        JSON.stringify(m.viewport) !== JSON.stringify(viewport) ||
        m.visual_approval !== 'PENDING' ||
        m.physical_device_acceptance !== 'UNVERIFIED' ||
        m.screenshot_sha256 !== sha(readFileSync(png)) ||
        !/^[a-f0-9-]{36}$/.test(m.source_records?.job)
      )
        throw Error('Exact branded source-bound screenshot required');
      job ??= m.source_records.job;
      if (m.source_records.job !== job)
        throw Error('Screenshot lost job context');
      captures.push({
        id,
        png: png.slice(process.cwd().length + 1),
        png_sha256: m.screenshot_sha256,
        metadata_sha256: sha(readFileSync(metadata)),
      });
    }
    const path = resolve(
        directory,
        'keyboard',
        `${project}-${company.slug}.json`,
      ),
      k = json(path);
    binding(k);
    if (
      k.schema !== 'propel-cycle24-keyboard-v1' ||
      k.company_id !== company.id ||
      k.brand !== company.slug ||
      k.project !== project ||
      k.start_job !== job ||
      k.end_job !== job ||
      k.skipped !== 0 ||
      k.retries !== 0 ||
      k.outside_requests?.length !== 0 ||
      k.steps?.length < 25 ||
      k.steps.length !== k.events?.length ||
      k.events.some(
        (e, i) =>
          e.trusted !== true ||
          e.key !== (k.steps[i].key === 'Space' ? ' ' : 'Enter'),
      )
    )
      throw Error('Actual trusted keyboard and retained context required');
    trustedEvents += k.events.length;
    keyboard.push({
      project,
      brand: company.slug,
      events: k.events.length,
      sha256: sha(readFileSync(path)),
    });
  }
const actual = readdirSync(resolve(directory, 'screenshots'));
if (
  actual.length !== 126 ||
  actual.filter((f) => f.endsWith('.png')).length !== 63 ||
  readdirSync(resolve(directory, 'keyboard')).length !== 9
)
  throw Error('Extra or missing screenshot/keyboard artifacts');
if (executionCommits.size !== 1)
  throw Error('Mixed executed checkout evidence forbidden');
const value = {
  schema: 'propel-cycle24-browser-validation-v1',
  runtime_commit: cycle24RuntimeCommit,
  executed_commits: [...executionCommits],
  runtime_files: 76,
  admitted_source_forwards: [...admittedSources.values()],
  source_scope: 'C24_BASELINE_PLUS_EXACT_ADMITTED_C25_NATIVE_FORWARDS',
  critical_sources_checked_now_and_in_execution_commit: cycle24CriticalSources,
  capture_inventory_limit: '76_SCOPED_FILES_NOT_COMPLETE_TRANSITIVE_RUNTIME',
  development,
  production,
  screenshots: captures,
  keyboard,
  trusted_events: trustedEvents,
  visual_approval: 'PENDING',
  physical_recovery: 'UNVERIFIED_NOT_RUN',
  release: 'NOT_READY_NOT_AUTHORIZED',
};
writeFileSync(
  resolve(directory, 'browser-validation.json'),
  JSON.stringify(value, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    development: development.cases,
    production: production.cases,
    screenshots: captures.length,
    keyboard_journeys: keyboard.length,
    trusted_events: trustedEvents,
    runtime_files: 76,
  }),
);
