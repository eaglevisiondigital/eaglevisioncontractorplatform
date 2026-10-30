import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const sha256 = (v: string | Uint8Array) =>
  createHash('sha256').update(v).digest('hex');
export const sha1 = (v: Uint8Array) =>
  createHash('sha1').update(v).digest('hex');
export const fingerprint = (v: unknown) => sha256(canonical(v));
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') {
    if (![Object.prototype, null].includes(Object.getPrototypeOf(v)))
      throw Error('NON_JSON_OBJECT');
    return (
      '{' +
      Object.entries(v)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => JSON.stringify(k) + ':' + canonical(x))
        .join(',') +
      '}'
    );
  }
  const s = JSON.stringify(v);
  if (s === undefined || (typeof v === 'number' && !Number.isFinite(v)))
    throw Error('NON_JSON_VALUE');
  return s;
}
export const requireThat: (v: unknown, code: string) => asserts v = (
  v,
  code,
) => {
  if (!v) throw Error(code);
};
export const isHash = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export const isDeployId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{24}$/.test(v);
export const review = JSON.parse(
  readFileSync(
    new URL(
      '../../docs/NETLIFY_REPLACEMENT_DRAFT_REVIEW.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const manifest = JSON.parse(
  readFileSync(
    new URL('../../docs/ACTION_D_ARTIFACTS.json', import.meta.url),
    'utf8',
  ),
);
export const reviewedContractSha256 =
  'a8e7cd70cc472399ffb4c532117734b1b9f9ef6c5b0ac4e4b4d6861a77497b9f';
function freezeJson(v: unknown) {
  if (v && typeof v === 'object') {
    for (const value of Object.values(v)) freezeJson(value);
    Object.freeze(v);
  }
}
freezeJson(review);
freezeJson(manifest);

export interface Artifact {
  path: string;
  bytes: number;
  sha256: string;
}
export interface PackageInput {
  binding: Uint8Array;
  body: Uint8Array;
  archive: Uint8Array;
  artifacts: Artifact[];
  contents: Record<string, Uint8Array>;
}
function copyInput(raw: PackageInput): PackageInput {
  return {
    binding: new Uint8Array(raw.binding),
    body: new Uint8Array(raw.body),
    archive: new Uint8Array(raw.archive),
    artifacts: structuredClone(raw.artifacts),
    contents: Object.fromEntries(
      Object.entries(raw.contents).map(([path, bytes]) => [
        path,
        new Uint8Array(bytes),
      ]),
    ),
  };
}
export interface PreparedPackage {
  readonly bindingSha256: string;
  readonly bodySha256: string;
  readonly packageSha256: string;
  readonly mode: 'frozen' | 'offline';
}
export interface PackageData {
  descriptor: PreparedPackage;
  siteId: string;
  siteName: string;
  teamId: string;
  originalId: string;
  api: string;
  host: string;
  body: Uint8Array;
  files: Record<string, { bytes: Uint8Array; sha1: string; sha256: string }>;
  functions: Record<
    string,
    { bytes: Uint8Array; sha256: string; config: unknown }
  >;
  paths: string[];
}
const packages = new WeakMap<PreparedPackage, PackageData>();
export function packageData(p: PreparedPackage) {
  const data = packages.get(p);
  requireThat(data, 'UNPREPARED_PACKAGE');
  // No mutable data or caller-owned Buffers cross an await boundary.
  return structuredClone(data);
}
export function executorFingerprint() {
  return fingerprint(
    [
      'replacement-package.ts',
      'replacement-journal.ts',
      'replacement-executor.ts',
    ].map((name) => ({
      name,
      sha256: sha256(readFileSync(new URL(name, import.meta.url))),
    })),
  );
}

function compact(raw: Uint8Array) {
  const result: number[] = [];
  let quoted = false,
    escaped = false;
  for (const c of raw) {
    if (quoted) {
      result.push(c);
      if (escaped) escaped = false;
      else if (c === 92) escaped = true;
      else if (c === 34) quoted = false;
    } else if (c === 34) {
      quoted = true;
      result.push(c);
    } else if (![32, 9, 13, 10].includes(c)) result.push(c);
  }
  requireThat(!quoted, 'INVALID_BODY_JSON');
  return Buffer.from(result);
}

/** No filesystem custody/credential loading and no network. Call only with already
 * approved custody inputs. This function is not an approval issuer. */
export function prepareFrozenPackage(raw: PackageInput): PreparedPackage {
  const input = copyInput(raw);
  requireThat(
    sha256(
      readFileSync(
        new URL(
          '../../docs/NETLIFY_REPLACEMENT_DRAFT_REVIEW.json',
          import.meta.url,
        ),
      ),
    ) === reviewedContractSha256,
    'REVIEW_CONTRACT_DRIFT',
  );
  requireThat(
    sha256(input.binding) === review.bindings.privateTargetBindingFileSha256,
    'PRIVATE_BINDING_DRIFT',
  );
  requireThat(
    sha256(compact(input.body)) === review.bindings.canonicalCreateBodySha256,
    'SEALED_BODY_DRIFT',
  );
  requireThat(
    sha256(input.archive) === review.bindings.archiveSha256,
    'ARCHIVE_DRIFT',
  );
  requireThat(
    canonical(input.artifacts) === canonical(manifest.files),
    'FILE_INVENTORY_DRIFT',
  );
  requireThat(
    fingerprint(input.artifacts) === review.bindings.fileManifestSha256,
    'FILE_MANIFEST_DRIFT',
  );
  return prepare(input, 'frozen');
}

/** Test-only package uses the SAME validation/state machine, but cannot select a
 * real API or site origin. Synthetic approvals are invalid for a frozen package. */
export function prepareOfflinePackage(input: PackageInput): PreparedPackage {
  return prepare(input, 'offline');
}
function prepare(
  raw: PackageInput,
  mode: PreparedPackage['mode'],
): PreparedPackage {
  const input = copyInput(raw);
  requireThat(
    input.body.length < 16384 && input.binding.length < 16384,
    'INPUT_BOUND',
  );
  const binding = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(input.binding),
  );
  const bodyBytes = compact(input.body);
  const body = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes),
  );
  requireThat(
    binding.site &&
      /^[a-f0-9-]{36}$/.test(binding.site.id) &&
      /^[a-z0-9-]{1,63}$/.test(binding.site.name) &&
      typeof binding.site.account_id === 'string' &&
      isDeployId(binding.originalDeployId),
    'TARGET_BINDING',
  );
  requireThat(
    binding.canonicalCreateBodySha256 === sha256(bodyBytes) &&
      binding.archiveSha256 === sha256(input.archive),
    'INPUT_HASH_BINDING',
  );
  requireThat(
    body.draft === true &&
      body.async === false &&
      Object.keys(body).sort().join(',') ===
        'async,draft,environment,files,functions,functions_config',
    'EXACT_DRAFT_BODY',
  );
  requireThat(
    input.artifacts.length === 14 &&
      Object.keys(input.contents).length === 14 &&
      new Set(input.artifacts.map((f) => f.path)).size === 14,
    'EXACT_14_ARTIFACTS',
  );
  const files: PackageData['files'] = {},
    functions: PackageData['functions'] = {};
  for (const f of input.artifacts) {
    requireThat(
      /^(dist\/[a-zA-Z0-9/_.-]+|netlify\.toml|\.netlify\/functions\/[a-z-]+\.(zip|json))$/.test(
        f.path,
      ) && !f.path.split('/').includes('..'),
      'ARTIFACT_PATH',
    );
    const bytes = input.contents[f.path];
    requireThat(
      bytes && bytes.length === f.bytes && sha256(bytes) === f.sha256,
      'ARTIFACT_BYTES',
    );
    if (f.path.startsWith('dist/') || f.path === 'netlify.toml') {
      const path = f.path.replace(/^dist\//, '');
      requireThat(body.files[path] === sha1(bytes), 'FILE_DIGEST_BINDING');
      files[path] = { bytes, sha1: sha1(bytes), sha256: f.sha256 };
    } else if (f.path.endsWith('.zip')) {
      const name = f.path
        .split('/')
        .at(-1)!
        .replace(/\.zip$/, '');
      requireThat(
        body.functions[name] === f.sha256 && body.functions_config[name],
        'FUNCTION_DIGEST_BINDING',
      );
      functions[name] = {
        bytes,
        sha256: f.sha256,
        config: body.functions_config[name],
      };
    } else
      requireThat(
        f.path === '.netlify/functions/manifest.json',
        'UNREVIEWED_ARTIFACT',
      );
  }
  requireThat(
    Object.keys(files).length === 9 &&
      Object.keys(body.files).length === 9 &&
      new Set(Object.values(files).map((f) => f.sha1)).size === 9,
    'EXACT_UNIQUE_FILES',
  );
  requireThat(
    Object.keys(functions).sort().join(',') ===
      'intake-profile,intake-submit,material-import,organization-context' &&
      Object.keys(body.functions).length === 4 &&
      Object.keys(body.functions_config).length === 4 &&
      new Set(Object.values(functions).map((f) => f.sha256)).size === 4,
    'EXACT_UNIQUE_FUNCTIONS',
  );
  requireThat(
    canonical(body.functions_config) ===
      canonical(review.create.redactedBody.functions_config),
    'FUNCTION_CONFIG_DRIFT',
  );
  requireThat(
    Array.isArray(body.environment) && body.environment.length === 3,
    'EXACT_ENVIRONMENT',
  );
  const env = body.environment.map((e: Record<string, unknown>) => ({
    ...e,
    value: '<SEALED_ORIGINAL>',
  }));
  requireThat(
    canonical(env) === canonical(review.create.redactedBody.environment) &&
      body.environment.every(
        (e: Record<string, unknown>) =>
          typeof e.value === 'string' &&
          e.value.length > 0 &&
          e.value !== '<SEALED_ORIGINAL>',
      ) &&
      body.environment[2].value === 'false',
    'ENVIRONMENT_BINDING',
  );
  if (mode === 'offline')
    requireThat(
      binding.site.name === 'synthetic-test' &&
        body.environment[0].value === 'https://synthetic.invalid' &&
        body.environment[1].value === 'synthetic-not-a-credential',
      'OFFLINE_ONLY_VALUES',
    );
  const descriptor: PreparedPackage = Object.freeze({
    mode,
    bindingSha256: sha256(input.binding),
    bodySha256: sha256(bodyBytes),
    packageSha256: fingerprint({
      archive: sha256(input.archive),
      artifacts: input.artifacts,
    }),
  });
  const api =
    mode === 'frozen'
      ? 'https://api.netlify.com/api/v1'
      : 'https://netlify-rehearsal.invalid/api/v1';
  const host =
    binding.site.name + (mode === 'frozen' ? '.netlify.app' : '.invalid');
  const paths = [
    '/',
    '/app',
    '/index.html',
    '/intake/unpublished-synthetic',
    '/internal-release',
    '/join',
    '/portal',
    '/portal/internal',
    '/preview',
    '/preview/release',
    '/super-admin',
    ...Object.keys(files)
      .filter((p) => p !== 'index.html')
      .map((p) => '/' + p),
    ...Object.keys(functions).flatMap((n) => [
      '/api/' + n,
      '/.netlify/functions/' + n,
    ]),
  ].sort();
  requireThat(
    paths.length === 27 && new Set(paths).size === 27,
    'EXACT_PERIMETER_PATHS',
  );
  packages.set(descriptor, {
    descriptor,
    siteId: binding.site.id,
    siteName: binding.site.name,
    teamId: binding.site.account_id,
    originalId: binding.originalDeployId,
    api,
    host,
    body: bodyBytes,
    files,
    functions,
    paths,
  });
  return descriptor;
}
