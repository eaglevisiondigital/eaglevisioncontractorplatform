// Offline CI evidence only. Never business-state restoration or authority.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const sourceCommit = '5f74b8ff5385560330cb94717c17338ed0c10f44';
const configHash =
  'd15e9c4d8f4984878a5cf60bb50e853a1c4fbc9b3de98f380850cd375e553078';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function cases(report) {
  const found = [];
  function walk(suite) {
    for (const nested of suite.suites ?? []) walk(nested);
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests ?? [])
        found.push({
          key: JSON.stringify([
            spec.file,
            spec.line,
            spec.column,
            spec.title,
            test.projectId,
          ]),
          file: spec.file,
          title: spec.title,
          project: test.projectId,
          test,
        });
  }
  walk(report);
  return found;
}
function unique(rows) {
  const set = new Set(rows.map((r) => r.key));
  if (set.size !== rows.length) throw Error('Duplicate original case');
  return set;
}
function same(a, b) {
  return a.size === b.size && [...a].every((key) => b.has(key));
}
// Existing test bodies set these budgets; --list cannot observe setTimeout calls.
// Each finite override is bound to the exact original file/title, never a new budget.
const originalBodyBudgets = [
  [
    'repair-draft.spec.ts',
    'all companies review exact published evidence, prepare one repair draft, edit scope and navigate both directions',
    90000,
  ],
  [
    'repair-readiness.spec.ts',
    'three companies review saved scope, explicit measurements and pricing; saved changes invalidate confirmations without issuance',
    120000,
  ],
  [
    'contractor-design.spec.ts',
    'populated contractor concept preserves triage, scheduling and exact published navigation across three brands',
    120000,
  ],
  [
    'contractor-design.spec.ts',
    '/preview/contractor-design repair editing, six-section review and stale evidence · ',
    120000,
  ],
  [
    'contractor-design.spec.ts',
    '/preview repair editing, six-section review and stale evidence · ',
    120000,
  ],
  [
    'contractor-design.spec.ts',
    'polished labels, selectors and navigation retain source values across all brands',
    90000,
  ],
  [
    'contractor-phase-b.spec.ts',
    'approved cards match reference pixels and preserve complete module navigation across three companies',
    120000,
  ],
  [
    'contractor-phase-b.spec.ts',
    'promoted property operations share CRM data and retain customer/connected/control-plane isolation',
    90000,
  ],
  [
    'maintenance-center.spec.ts',
    'all companies manually triage, schedule one draft and open exact immutable sources with private coordination',
    60000,
  ],
  [
    'cycle23-source-consistency.spec.ts',
    'task lineage and financial requirements follow recorded canonical changes / ',
    150000,
  ],
  [
    'cycle23-source-consistency.spec.ts',
    'published lineage and occurrence requirements preserve exact source identities / ',
    150000,
  ],
  [
    'cycle23-source-consistency.spec.ts',
    'mode continuity retains source context and original UNKNOWN custody / ',
    150000,
  ],
  [
    'cycle24-native-actions.spec.ts',
    'native action journey preserves one exact source context / ',
    150000,
  ],
];
function originalBudget(row, declared) {
  if (!Number.isSafeInteger(declared) || declared <= 0)
    throw Error('Exact declared original budget required');
  const match = originalBodyBudgets.filter(
    ([file, title]) =>
      file === row.file &&
      (title.endsWith(' / ') || title.endsWith(' · ')
        ? row.title.startsWith(title) &&
          (title.endsWith(' · ')
            ? ['sample-property', 'sample-construction', 'sample-roofing']
            : ['straight-edge', 'cunningham', 'roofing-example']
          ).includes(row.title.slice(title.length))
        : row.title === title),
  );
  if (match.length > 1) throw Error('Ambiguous original budget');
  return match.length ? match[0][2] : declared;
}

export function reconcileParentBrowser(shards) {
  if (!Array.isArray(shards) || shards.length !== 4)
    throw Error('All four original artifacts required');
  const numbers = new Set(),
    union = [],
    summaries = [];
  let inventory;
  for (const { source, list, results, hashes } of shards) {
    if (
      source.source_commit !== sourceCommit ||
      source.config_sha256 !== configHash ||
      source.shards !== 4 ||
      ![1, 2, 3, 4].includes(source.shard) ||
      numbers.has(source.shard) ||
      source.scope !== 'ORIGINAL_BROWSER_ONLY_NOT_FOUNDATION_PASS'
    )
      throw Error('Exact source, config and unique shard binding required');
    numbers.add(source.shard);
    if (list.errors?.length) throw Error('Original collection contains errors');
    const currentInventory = unique(cases(list));
    if (
      currentInventory.size !== 399 ||
      (inventory && !same(inventory, currentInventory))
    )
      throw Error('Exact complete original collection required');
    inventory = currentInventory;
    const declared = new Map(
      cases(list).map((row) => [row.key, row.test.timeout]),
    );
    const rows = cases(results),
      keys = unique(rows);
    if (
      !rows.length ||
      results.errors?.length ||
      results.config?.shard?.current !== source.shard ||
      results.config?.shard?.total !== 4 ||
      results.config?.workers !== 2 ||
      [...keys].some((key) => !inventory.has(key))
    )
      throw Error('Original collected shard and runner configuration required');
    const failed = [];
    let passed = 0;
    for (const row of rows) {
      if (
        row.test.timeout !== originalBudget(row, declared.get(row.key)) ||
        row.test.expectedStatus !== 'passed'
      )
        throw Error(
          'Exact original per-case budget and passed expectation required',
        );
      const attempts = row.test.results;
      if (
        !Array.isArray(attempts) ||
        attempts.length !== 1 ||
        attempts[0].retry !== 0
      )
        throw Error(
          'One original attempt, no retry or missing result required',
        );
      const result = attempts[0];
      if (row.test.status === 'expected' && result.status === 'passed')
        passed++;
      else if (
        row.test.status === 'unexpected' &&
        ['failed', 'timedOut', 'interrupted'].includes(result.status)
      )
        failed.push({
          file: row.file,
          title: row.title,
          project: row.project,
          status: result.status,
          duration_ms: result.duration,
          original_case_key: sha(row.key),
        });
      else throw Error('Skipped, flaky or contradictory original result');
    }
    if (
      results.stats?.expected !== passed ||
      results.stats?.unexpected !== failed.length ||
      results.stats?.skipped !== 0 ||
      results.stats?.flaky !== 0
    )
      throw Error('Result summary differs from original assertions');
    union.push(...rows);
    summaries.push({
      shard: source.shard,
      cases: rows.length,
      passed,
      failed,
      hashes,
    });
  }
  if (!same(unique(union), inventory))
    throw Error('Missing or extra original coverage');
  const failed = summaries.reduce((n, s) => n + s.failed.length, 0);
  return {
    schema: 'propel-cycle29-original-browser-reconciliation-v1',
    source_commit: sourceCommit,
    workflow_commit: 'f700139b48a22bb189e0ee1784f83cd11334a6b7',
    run_id: 41854921550,
    config_sha256: configHash,
    collected: inventory.size,
    passed: union.length - failed,
    failed,
    missing: 0,
    duplicate: 0,
    skipped: 0,
    retried: 0,
    all_four_passed: failed === 0,
    foundation_pass: false,
    outcome: failed
      ? 'ORIGINAL_FAILURES_RETAINED_COVERAGE_NOT_CLOSED'
      : 'SUPPLEMENTARY_BROWSER_ONLY_COMPLETE',
    shards: summaries.sort((a, b) => a.shard - b.shard),
    release: 'NOT_READY_NOT_AUTHORIZED',
  };
}
export function readParentBrowserArtifacts(directory) {
  return [1, 2, 3, 4].map((shard) => {
    const base = resolve(
      directory,
      `cycle28-c27-original-browser-${shard}`,
      'artifacts/foundation-browser',
    );
    const read = (name) => readFileSync(resolve(base, name));
    const raw = {
      source: read('source.json'),
      list: read('full-list.json'),
      results: read('results.json'),
    };
    return Object.fromEntries([
      ...Object.entries(raw).map(([key, bytes]) => [
        key,
        JSON.parse(bytes.toString('utf8')),
      ]),
      [
        'hashes',
        Object.fromEntries(
          Object.entries(raw).map(([key, bytes]) => [key, sha(bytes)]),
        ),
      ],
    ]);
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv.length !== 3)
    throw Error('Exact downloaded artifact directory required');
  console.log(
    JSON.stringify(
      reconcileParentBrowser(readParentBrowserArtifacts(process.argv[2])),
      null,
      2,
    ),
  );
}
