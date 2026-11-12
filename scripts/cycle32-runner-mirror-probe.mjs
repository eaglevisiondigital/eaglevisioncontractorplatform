// Read-only disposable-runner observability. This never installs or trusts sources.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ubuntuMirrors,
  validateUbuntuMirrors,
} from './cycle30-chromium-dependencies.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const knownTargets = new Map([
  ['http://azure.archive.ubuntu.com/ubuntu/', 'azure-http'],
  ['https://azure.archive.ubuntu.com/ubuntu/', 'azure-https'],
  ['http://archive.ubuntu.com/ubuntu/', 'archive-http'],
  ['https://archive.ubuntu.com/ubuntu/', 'archive-https'],
  ['http://security.ubuntu.com/ubuntu/', 'security-http'],
  ['https://security.ubuntu.com/ubuntu/', 'security-https'],
]);
// Diagnostic disclosure only, never an APT allowlist. This one public candidate
// hashes to PR355's rejected target; only a new runner can observe its literal URI.
const observableTargets = new Set([
  ...knownTargets.keys(),
  'http://us-east-2.ec2.archive.ubuntu.com/ubuntu/',
]);

export function observableMirrorUri(value) {
  // Exact literals avoid URL normalization hiding credentials, ports, query data,
  // fragments, escaped characters, additional paths or private hostnames.
  return typeof value === 'string' && observableTargets.has(value)
    ? value
    : undefined;
}
const reviewed = Object.freeze({
  source_probe:
    'faee337a766c98ba22439992956f523e7b4c314ab2eb75a1e830e4c1e7320402',
  validator: '531b1f3b43e38975a456a8421fc7135991b89313e22e0f87daa5ecc673bf659f',
});
const sourceVocabulary = new Map([
  ['types', ['deb', 'deb-src']],
  ['suites', ['noble', 'noble-updates', 'noble-backports', 'noble-security']],
  ['components', ['main', 'universe', 'restricted', 'multiverse']],
  ['architectures', ['amd64']],
  ['uris', []],
  ['signed-by', []],
]);

export function redactSourceShape(source) {
  return {
    source_sha256: /^[a-f0-9]{64}$/.test(source.source_sha256 ?? '')
      ? source.source_sha256
      : null,
    validation: source.validation === 'PASS' ? 'PASS' : 'REJECTED',
    validation_sha256: digest(String(source.validation)),
    stanzas: source.stanzas.slice(0, 64).map((stanza) => ({
      index: Number.isSafeInteger(stanza.index) ? stanza.index : null,
      comment_only: stanza.comment_only === true,
      fields: stanza.fields.slice(0, 64).map((field) => {
        const name = typeof field.name === 'string' ? field.name : '';
        const id = name.toLowerCase();
        const vocabulary = sourceVocabulary.get(id);
        const tokens =
          typeof field.value === 'string'
            ? field.value.trim().split(/\s+/)
            : [];
        return {
          name: vocabulary ? id : 'UNRECOGNIZED',
          name_sha256: digest(name),
          value:
            tokens.length > 0 &&
            tokens.length <= 16 &&
            tokens.every((token) => vocabulary?.includes(token))
              ? tokens.join(' ')
              : undefined,
          value_sha256: /^[a-f0-9]{64}$/.test(field.value_sha256 ?? '')
            ? field.value_sha256
            : null,
          expected_key: field.expected_key === true,
          direct_ubuntu_uri: field.direct_ubuntu_uri === true,
          runner_mirror_file: field.runner_mirror_file === true,
        };
      }),
    })),
  };
}

export function classifyMirrorText(text) {
  if (typeof text !== 'string') throw Error('Mirror text required');
  const sha256 = digest(text);
  if (Buffer.byteLength(text, 'utf8') > 65536)
    return { status: 'BOUNDS_EXCEEDED', sha256, rows: [] };
  const rows = text
    .split('\n')
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => line && !line.startsWith('#'));
  if (
    rows.length > 64 ||
    rows.some(({ line }) => line.split(/\s+/).length > 16)
  )
    return { status: 'BOUNDS_EXCEEDED', sha256, rows: [] };
  return {
    status: 'OBSERVED_NOT_ACCEPTANCE',
    sha256,
    rows: rows.map(({ line, index }) => {
      const tokens = line.split(/\s+/);
      const priority = /^priority:[0-9]{1,3}$/.test(tokens[1] ?? '');
      return {
        index,
        row_sha256: digest(line),
        token_count: tokens.length,
        target: knownTargets.get(tokens[0]) ?? 'UNRECOGNIZED',
        observed_uri: observableMirrorUri(tokens[0]),
        target_sha256: digest(tokens[0]),
        priority: priority ? Number(tokens[1].slice('priority:'.length)) : null,
        priority_token_sha256:
          !priority && tokens[1] !== undefined ? digest(tokens[1]) : null,
        extra_token_count: Math.max(0, tokens.length - 2),
        extra_token_sha256: tokens.slice(2).map(digest),
      };
    }),
  };
}

export function observeMirrorValidation(text) {
  try {
    validateUbuntuMirrors(text);
    return 'PASS_EXISTING_VALIDATOR';
  } catch (error) {
    const messages = new Map([
      [
        'Exact three signed-Ubuntu mirror targets required',
        'REJECT_EXACT_THREE_TARGETS',
      ],
      [
        'Reviewed Ubuntu mirror and priority required',
        'REJECT_REVIEWED_MIRROR_OR_PRIORITY',
      ],
      [
        'Complete reviewed Ubuntu mirrors required',
        'REJECT_INCOMPLETE_TARGETS',
      ],
    ]);
    return messages.get(error.message) ?? 'REJECT_OTHER';
  }
}

function collect() {
  const sourceProbe = new URL(
    './cycle31-ubuntu-source-probe.mjs',
    import.meta.url,
  );
  const validator = new URL(
    './cycle30-chromium-dependencies.mjs',
    import.meta.url,
  );
  const hashes = {
    source_probe: digest(readFileSync(sourceProbe)),
    validator: digest(readFileSync(validator)),
  };
  if (JSON.stringify(hashes) !== JSON.stringify(reviewed))
    return { status: 'REVIEWED_DIAGNOSTIC_SOURCE_MISMATCH', hashes };
  // Reuse the original safe source vocabulary and validation, without APT or writes.
  const source = JSON.parse(
    execFileSync(process.execPath, [fileURLToPath(sourceProbe)], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 262144,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
  const mirrorText =
    source.mirror_sha256 === undefined
      ? undefined
      : readFileSync(ubuntuMirrors, 'utf8');
  return {
    status: 'READ_ONLY_OBSERVATION',
    hashes,
    source_shape: redactSourceShape(source),
    mirror_observation:
      mirrorText === undefined
        ? { status: 'NOT_REFERENCED' }
        : classifyMirrorText(mirrorText),
    mirror_matches_source_probe_snapshot:
      mirrorText === undefined
        ? null
        : digest(mirrorText) === source.mirror_sha256,
    current_mirror_validator:
      mirrorText === undefined
        ? 'NOT_REFERENCED'
        : observeMirrorValidation(mirrorText),
    original_pr237_mirror_contents:
      'NOT_RECORDED_NOT_RECOVERABLE_FROM_NEW_SAMPLE',
    acceptance: false,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let observation;
  try {
    observation = collect();
  } catch (error) {
    observation = {
      status: 'DIAGNOSTIC_UNAVAILABLE',
      error_sha256: digest(String(error.message)),
      acceptance: false,
    };
  }
  console.log(
    JSON.stringify(
      {
        schema: 'cycle32-read-only-runner-mirror-observation-v1',
        workflow_source: /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? '')
          ? process.env.GITHUB_SHA
          : 'UNAVAILABLE',
        run_id: /^[0-9]{1,20}$/.test(process.env.GITHUB_RUN_ID ?? '')
          ? process.env.GITHUB_RUN_ID
          : 'UNAVAILABLE',
        ...observation,
        acceptance: false,
      },
      null,
      2,
    ),
  );
}
