import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { validateCycle21Browser } from './check-cycle21.mjs';

const directory = resolve(
  process.env.CYCLE21_ARTIFACT_DIR ?? 'artifacts/cycle21',
);
const screenshots = resolve(directory, 'screenshots');
const sha = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const states = [
  'task-corrected',
  'cost-reviewed',
  'plan-corrected',
  'published-requirements',
  'owner-source',
  'stale-plan',
  'immutable-published',
  'published-versions',
  'withdrawn-review',
];
const projects = ['desktop', 'tablet', 'mobile'];
const brands = ['straight-edge', 'cunningham', 'roofing-example'];
const expected = new Set(
  states.flatMap((state) =>
    projects.flatMap((project) =>
      brands.map((brand) => `${state}-${project}-${brand}`),
    ),
  ),
);
for (const state of ['editable-task', 'editable-material', 'editable-plan'])
  expected.add(`${state}-desktop-straight-edge`);
const captures = readdirSync(screenshots)
  .filter((name) => name.endsWith('.json'))
  .map((name) => {
    const path = resolve(screenshots, name),
      capture = json(path);
    const id = capture.screenshot_id,
      png = resolve(screenshots, `${id}.png`);
    if (
      capture.schema !== 'propel-cycle21-browser-capture-v1' ||
      !expected.delete(id) ||
      sha(png) !== capture.screenshot_sha256
    )
      throw Error('Exact unique screenshot identity and PNG hash required');
    for (const source of capture.source_files)
      if (sha(source.path) !== source.sha256)
        throw Error(`Capture source changed: ${source.path}`);
    return { ...capture, companion_sha256: sha(path) };
  });
if (expected.size || captures.length !== 84)
  throw Error(
    'All 81 matrix and 3 supplemental exact captured states required',
  );
const pngs = readdirSync(screenshots).filter((name) => name.endsWith('.png'));
if (
  pngs.length !== captures.length ||
  pngs.some(
    (name) =>
      !captures.some((capture) => `${capture.screenshot_id}.png` === name),
  )
)
  throw Error('No unbound PNG files permitted');
const reports = [
  'browser-results.json',
  'browser-off-results.json',
  'browser-development-collection.json',
  'browser-production-collection.json',
  'browser-selection-collection.json',
].map((name) => {
  const path = resolve(directory, name);
  if (!existsSync(path)) throw Error(`Actual report required: ${name}`);
  return { path: name, sha256: sha(path) };
});
if (existsSync(resolve(directory, 'browser-editable-capture-results.json')))
  reports.push({
    path: 'browser-editable-capture-results.json',
    sha256: sha(resolve(directory, 'browser-editable-capture-results.json')),
  });
const execution = [
  ['development', 'browser-results.json'],
  ['production', 'browser-off-results.json'],
].map(([mode, name]) =>
  validateCycle21Browser(json(resolve(directory, name)), mode),
);
const protectedManifest = json('docs/program/CYCLE4_PROTECTED_SOURCE.json');
const protectedFiles = protectedManifest.files.map((entry) => {
  const actual = sha(entry.path);
  if (actual !== entry.sha256)
    throw Error(`Protected source changed: ${entry.path}`);
  return { path: entry.path, sha256: actual };
});
const design = json('docs/program/DESIGN_SYSTEM_CONTRACT.json');
const locks = design.locks.map((entry) => {
  const actual = sha(entry.path);
  if (actual !== entry.sha256)
    throw Error(`Design lock changed: ${entry.path}`);
  return { path: entry.path, sha256: actual };
});
const bindings = design.bindings.map((entry) => {
  if (!readFileSync(entry.source.path, 'utf8').includes(entry.source.anchor))
    throw Error(`Design binding changed: ${entry.id}`);
  return {
    id: entry.id,
    source: entry.source,
    source_sha256: sha(entry.source.path),
  };
});
mkdirSync(directory, { recursive: true });
const manifest = {
  schema: 'propel-cycle21-browser-capture-manifest-v1',
  source_commit: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  working_tree_dirty: !!execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
  }).trim(),
  reports,
  execution,
  screenshots: captures.sort((a, b) =>
    a.screenshot_id.localeCompare(b.screenshot_id),
  ),
  protected_files: protectedFiles,
  design_locks: locks,
  design_bindings: bindings,
  limits: [
    'Actual local Chromium emulation only; not physical-device acceptance.',
    'Capture inventory does not grant visual approval, customer approval, physical completion or operational authority.',
  ],
  visual_approval: 'PENDING',
  release: 'NOT_READY_NOT_AUTHORIZED',
};
writeFileSync(
  resolve(directory, 'browser-capture-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    captures: captures.length,
    protected_files: protectedFiles.length,
    design_locks: locks.length,
    design_bindings: bindings.length,
    reports: reports.length,
  }),
);
