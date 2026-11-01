// Offline inventory only: no credentials, network, application imports or writes.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const requiredFeatureIds = Object.freeze([
  'SEC-001',
  'SEC-002',
  'CRM-001',
  'EST-001',
  'EST-002',
  'SAL-001',
  'FLD-001',
  'FLD-002',
  'FIN-001',
  'FIN-002',
  'CUS-001',
  'CUS-002',
  'GRO-001',
  'GRO-002',
  'AI-001',
  'INT-001',
  'UX-001',
  'OPS-001',
]);
const sourceRoots = [
  'src',
  'server',
  'netlify',
  'scripts',
  'tests',
  'supabase',
  'recovery',
  'public',
  '.github/workflows',
];
const rootFiles = [
  'package.json',
  'package-lock.json',
  'index.html',
  'vite.config.ts',
  'vitest.config.ts',
  'playwright.config.ts',
  'tsconfig.json',
  'eslint.config.js',
  'netlify.toml',
];
const extensions = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.mjs',
  '.js',
  '.sql',
  '.py',
  '.css',
  '.json',
  '.toml',
  '.yml',
  '.yaml',
  '.lock',
  '.html',
  '.png',
  '.svg',
  '.ico',
  '.zip',
  '.command',
]);
const ignoredDirectories = new Set([
  'node_modules',
  'dist',
  'artifacts',
  'test-results',
  '__pycache__',
  'venv',
]);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => {
  throw Error(message);
};

function safeFile(root, path, directory = false) {
  if (
    typeof path !== 'string' ||
    !path ||
    isAbsolute(path) ||
    path.includes('\\') ||
    path
      .split('/')
      .some(
        (p, index) =>
          !p ||
          p === '..' ||
          p === '.' ||
          (p.startsWith('.') && !(index === 0 && p === '.github')),
      )
  )
    fail('Public repository evidence path required');
  const base = realpathSync(root),
    full = resolve(base, path),
    rel = relative(base, full);
  if (rel.startsWith('..' + sep) || isAbsolute(rel))
    fail('Public repository evidence path required');
  let part = base;
  for (const segment of path.split('/')) {
    part = resolve(part, segment);
    if (lstatSync(part).isSymbolicLink())
      fail('Evidence links are not followed');
  }
  const stat = lstatSync(full);
  if (
    directory
      ? !stat.isDirectory()
      : !stat.isFile() || stat.size > 8 * 1024 * 1024
  )
    fail('Bounded evidence file required');
  return full;
}
function evidence(root, entry) {
  if (
    !entry ||
    typeof entry !== 'object' ||
    Array.isArray(entry) ||
    Object.keys(entry).sort().join(',') !== 'anchor,path' ||
    typeof entry.anchor !== 'string' ||
    !entry.anchor ||
    entry.anchor.length > 240
  )
    fail('Exact source anchor required');
  const content = readFileSync(safeFile(root, entry.path), 'utf8'),
    at = content.indexOf(entry.anchor);
  if (at < 0) fail(`Missing evidence anchor: ${entry.path}`);
  return {
    path: entry.path,
    line: content.slice(0, at).split('\n').length,
    sha256: sha(content),
  };
}
function strings(value, label, nonempty = true) {
  if (
    !Array.isArray(value) ||
    (nonempty && !value.length) ||
    value.some((v) => typeof v !== 'string' || !v.trim())
  )
    fail(`Invalid ${label}`);
}
/** Validates citations and declared limits; file presence NEVER proves test/hosted acceptance. */
export function validateFeatureEvidence(root, manifest) {
  if (
    !manifest ||
    manifest.schema !== 'propel-feature-evidence-v1' ||
    !/^[a-f0-9]{40}$/.test(manifest.sourceCommit) ||
    manifest.execution !== 'not_authorized' ||
    !Array.isArray(manifest.features)
  )
    fail('Unreleased evidence manifest required');
  for (const p of [
    'README.md',
    'AGENTS.md',
    'docs/PRODUCT_PROGRAM_2026.md',
    'docs/FEATURE_ACCEPTANCE_REGISTER.md',
  ])
    safeFile(root, p);
  const ids = new Set(),
    resolved = [];
  let declaredTables;
  function requireDeclaredTable(name) {
    if (!declaredTables) {
      declaredTables = new Set();
      for (const file of readdirSync(
        safeFile(root, 'supabase/migrations', true),
      ))
        if (file.endsWith('.sql')) {
          const sql = readFileSync(
            safeFile(root, 'supabase/migrations/' + file),
            'utf8',
          );
          for (const match of sql.matchAll(
            /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?((?:public|private)\.[a-z_][a-z_0-9]*)\s*\(/gi,
          ))
            declaredTables.add(match[1].toLowerCase());
        }
    }
    if (!declaredTables.has(name))
      fail('Qualified table reference is absent from local migration source');
  }
  for (const f of manifest.features) {
    if (!f || !/^[A-Z]{2,5}-\d{3}$/.test(f.id) || ids.has(f.id))
      fail('Unique stable feature ID required');
    ids.add(f.id);
    if (
      !/^A[0-8]$/.test(f.owner) ||
      !['approved', 'proposed', 'protected_gate'].includes(f.scope) ||
      !['verified', 'partial', 'none', 'unknown'].includes(f.local) ||
      !['blocked', 'not_accepted', 'unknown'].includes(f.hosted) ||
      f.release !== 'not_authorized'
    )
      fail('Separate scope/local/hosted/release states required');
    for (const key of ['capability', 'approval', 'next', 'date'])
      if (typeof f[key] !== 'string' || !f[key].trim())
        fail(`Missing feature ${key}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) fail('Evidence date required');
    strings(f.dataObjects, 'data objects', false);
    for (const object of f.dataObjects)
      if (/^[a-z_]+\.[a-z_0-9]+$/.test(object)) requireDeclaredTable(object);
    strings(f.routes, 'routes', false);
    strings(f.risks, 'risk limits');
    strings(f.dependencies, 'dependencies', false);
    if (
      !Array.isArray(f.sources) ||
      !f.sources.length ||
      !Array.isArray(f.tests) ||
      !Array.isArray(f.records)
    )
      fail('Source/test/record inventory required');
    if (
      (f.local === 'verified' || f.local === 'partial') &&
      (!f.tests.length || !f.records.length)
    )
      fail('Local milestone needs tests and retained validation record');
    const sources = f.sources.map((s) => evidence(root, s)),
      tests = f.tests.map((s) => evidence(root, s)),
      records = f.records.map((s) => evidence(root, s));
    if (!f.ci || !['retained_baseline', 'unknown'].includes(f.ci.state))
      fail('Current CI cannot be inferred from source inventory');
    if (
      f.ci.state === 'retained_baseline' &&
      (!/^[a-f0-9]{40}$/.test(f.ci.commit) ||
        !/^https:\/\/github\.com\/eaglevisiondigital\/eaglevisioncontractorplatform\/actions\/runs\/\d+$/.test(
          f.ci.url,
        ))
    )
      fail('Exact retained CI identity required');
    resolved.push({
      id: f.id,
      owner: f.owner,
      local: f.local,
      hosted: f.hosted,
      release: f.release,
      sources,
      tests,
      records,
    });
  }
  if (requiredFeatureIds.some((id) => !ids.has(id)))
    fail('Original product scope IDs must be preserved');
  const byId = new Map(manifest.features.map((f) => [f.id, f])),
    visiting = new Set(),
    visited = new Set();
  function visit(id) {
    if (!byId.has(id)) fail('Unknown dependency');
    if (visiting.has(id)) fail('Cyclic dependency');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of byId.get(id).dependencies) visit(dep);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of ids) visit(id);
  return {
    schema: manifest.schema,
    sourceCommit: manifest.sourceCommit,
    featureCount: ids.size,
    execution: 'not_authorized',
    currentCi: 'UNKNOWN; consult exact GitHub run',
    features: resolved,
  };
}
export function sourceOwner(path) {
  if (
    /^(recovery\/|server\/netlify\/|server\/property\/(execution\/|p1-|acceptance-)|scripts\/(property-p1|netlify|package-rehearsal|test-recovery)|tests\/(netlify|property-p1|property-acceptance|helpers\/p1))/.test(
      path,
    )
  )
    return 'A0';
  // Explicit review lanes precede keyword fallbacks. These are not access grants.
  if (
    /\.css$|^\.github\/workflows\/|^src\/(domain\/brand\.ts|components\/(PlatformBrand|CompanyLogo|WorkspaceNavigation))|ContractorBackOffice(Layout|Design)/.test(
      path,
    )
  )
    return 'A8';
  if (
    /^src\/domain\/estimating\/|^src\/components\/(Customers|CompanyOperations)\.tsx$|^server\/(contracts|communications)\/|^tests\/sales-contract|signatur/.test(
      path,
    )
  )
    return 'A2';
  if (/^tests\/program-finance/.test(path)) return 'A4';
  if (
    /^(server\/(payments|providers)\/|src\/domain\/jobs\/financials|tests\/(payments|payment-|provider-|database\/(payment-|provider-)))|\/(contracts|communications)\//.test(
      path,
    )
  )
    return /\/(contracts|communications)\//.test(path) ? 'A2' : 'A4';
  if (/material|supplier/.test(path)) return 'A7';
  if (
    /customer|portal|property\/(attention|history|comparison|inspection-comparison|report-page)|property-(attention|history|report-session)|inspection-(comparison|history)/i.test(
      path,
    )
  )
    return 'A5';
  if (
    /property|maintenance|repair-|workforce|payroll|jobs|field-schedul/.test(
      path,
    )
  )
    return 'A3';
  if (
    /estimat|intake|operations|Customers|CompanyOperations|release|signatur/.test(
      path,
    )
  )
    return 'A2';
  if (
    /\.css$|\/brand|branding|design|back-office|Logo|Brand|App\.tsx$|forms|WorkspaceNavigation|feature-evidence|program-|browser\/(shells|contractor)/.test(
      path,
    )
  )
    return 'A8';
  return 'A1';
}
/** Full path/hash inventory of public source roots. Hidden/private trees and links are excluded. */
export function inventorySources(root) {
  root = realpathSync(root);
  const files = [];
  function walk(path) {
    const full = resolve(root, path),
      stat = lstatSync(full);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const child of readdirSync(full).sort())
        if (!child.startsWith('.') && !ignoredDirectories.has(child))
          walk(path + '/' + child);
    } else if (stat.isFile() && extensions.has(extname(path))) {
      files.push({
        path,
        owner: sourceOwner(path),
        bytes: stat.size,
        sha256: sha(readFileSync(full)),
      });
    }
  }
  for (const path of [...sourceRoots, ...rootFiles]) {
    try {
      let part = root,
        linked = false;
      for (const segment of path.split('/')) {
        part = resolve(part, segment);
        if (lstatSync(part).isSymbolicLink()) linked = true;
      }
      if (!linked) walk(path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const counts = Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => [
      'A' + i,
      files.filter((f) => f.owner === 'A' + i).length,
    ]),
  );
  return {
    roots: sourceRoots,
    rootFiles,
    extensions: [...extensions].sort(),
    fileCount: files.length,
    counts,
    files,
  };
}
export function runFeatureEvidence(root, json = false) {
  const manifest = JSON.parse(
    readFileSync(
      safeFile(root, 'docs/FEATURE_ACCEPTANCE_EVIDENCE.json'),
      'utf8',
    ),
  );
  const validation = validateFeatureEvidence(root, manifest),
    inventory = inventorySources(root);
  if (json) return JSON.stringify({ validation, inventory }, null, 2);
  return `Feature evidence: ${validation.featureCount} records; ${inventory.fileCount} source files inventoried.\n${Object.entries(
    inventory.counts,
  )
    .map(([k, v]) => `${k}: ${v}`)
    .join(
      ' · ',
    )}\nSource citations validated; tests/CI/hosted acceptance are not inferred. Execution NOT AUTHORIZED.\n`;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--check', '--json'].includes(arg))) {
    console.error('Use --check or --json; inventory is read-only.');
    process.exitCode = 1;
  } else {
    try {
      process.stdout.write(
        runFeatureEvidence(process.cwd(), args.includes('--json')),
      );
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
