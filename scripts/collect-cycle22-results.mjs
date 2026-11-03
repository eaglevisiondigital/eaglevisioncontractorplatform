import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  validateCycle22Manifest,
  validateCycle22Results,
} from './check-cycle22.mjs';
import {
  validateCycle22Browser,
  collectCycle22Browser,
} from './collect-cycle22-browser.mjs';
import { validateCycle22Keyboard } from './cycle22-keyboard-check.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function raw(path) {
  const bytes = readFileSync(path);
  return { path, sha256: hash(bytes), report: JSON.parse(bytes) };
}
export function collectCycle22Application(
  path = resolve(
    process.env.CYCLE22_ARTIFACT_DIR ?? 'artifacts/cycle22',
    'application-results.json',
  ),
  manifestPath = 'docs/program/CYCLE22_SOURCE_MANIFEST.json',
) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  validateCycle22Manifest(manifest, { requireIndependent: true });
  const data = raw(path);
  return {
    path: data.path,
    sha256: data.sha256,
    ...validateCycle22Results(data.report, manifest),
  };
}
export function collectCycle22BrowserSelection(
  root = process.env.CYCLE22_ARTIFACT_DIR ?? 'artifacts/cycle22',
) {
  const result = { kind: 'COLLECTION_ONLY_NOT_BROWSER_PASS' };
  mkdirSync(root, { recursive: true });
  for (const [mode, config] of [
    ['development', 'playwright.cycle22.config.ts'],
    ['production', 'playwright.cycle22-off.config.ts'],
  ]) {
    const run = spawnSync(
      'node_modules/.bin/playwright',
      ['test', '-c', config, '--list', '--reporter=json'],
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, env: process.env },
    );
    if (run.status !== 0)
      throw Error(
        run.stderr || run.error?.message || 'Browser collection failed',
      );
    const report = JSON.parse(run.stdout),
      validation = validateCycle22Browser(report, mode, { collection: true }),
      path = resolve(root, `browser-${mode}-collection.json`);
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
    result[mode] = { ...validation, path, sha256: hash(readFileSync(path)) };
  }
  writeFileSync(
    resolve(root, 'browser-selection-collection.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}
export function collectCycle22Complete(
  root = process.env.CYCLE22_ARTIFACT_DIR ?? 'artifacts/cycle22',
) {
  const application = collectCycle22Application(
      resolve(root, 'application-results.json'),
    ),
    browser = [];
  for (const [mode, name] of [
    ['development', 'browser-results.json'],
    ['production', 'browser-off-results.json'],
  ]) {
    const data = raw(resolve(root, name));
    browser.push({
      path: data.path,
      sha256: data.sha256,
      ...validateCycle22Browser(data.report, mode),
    });
  }
  const keyboardData = raw(resolve(root, 'keyboard-results.json'));
  const keyboard = {
    path: keyboardData.path,
    sha256: keyboardData.sha256,
    ...validateCycle22Keyboard(keyboardData.report),
  };
  const result = {
    schema: 'propel-cycle22-local-results-v1',
    application,
    browser,
    keyboard,
    captures: collectCycle22Browser(resolve(root)),
    operational_ready: false,
    release: 'NOT_READY_NOT_AUTHORIZED',
  };
  writeFileSync(
    resolve(root, 'checked-results.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const mode = process.argv[2] ?? '--complete';
  if (
    process.argv.length > 3 ||
    !['--application', '--collect-browser', '--complete'].includes(mode)
  )
    throw Error('Exact bounded results mode required');
  const result =
    mode === '--application'
      ? collectCycle22Application()
      : mode === '--collect-browser'
        ? collectCycle22BrowserSelection()
        : collectCycle22Complete();
  console.log(JSON.stringify(result));
}
