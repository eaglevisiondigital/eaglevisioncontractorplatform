// Read-only standard GitHub-runner package-source diagnostics. No APT or writes.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  validateUbuntuSources,
  validateUbuntuMirrors,
} from './cycle30-chromium-dependencies.mjs';
const source = readFileSync('/etc/apt/sources.list.d/ubuntu.sources', 'utf8');
const vocabulary = {
  types: ['deb', 'deb-src'],
  suites: ['noble', 'noble-updates', 'noble-backports', 'noble-security'],
  components: ['main', 'universe', 'restricted', 'multiverse'],
  architectures: ['amd64'],
};
const expectedKey = '/usr/share/keyrings/ubuntu-archive-keyring.gpg';
const rows = source
  .trim()
  .split(/\n\s*\n/)
  .map((p, index) => {
    const fields = p
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#'))
      .map((l) => /^([A-Za-z-]+):\s*(.*)$/.exec(l));
    return {
      index,
      comment_only: fields.length === 0,
      fields: fields.map((m) =>
        m
          ? {
              name: m[1],
              // Only known nonsecret package vocabulary is emitted; other values are hashes.
              value:
                vocabulary[m[1].toLowerCase()]?.includes(m[2]) ||
                (vocabulary[m[1].toLowerCase()] &&
                  m[2]
                    .split(/\s+/)
                    .every((t) => vocabulary[m[1].toLowerCase()].includes(t)))
                  ? m[2]
                  : undefined,
              value_sha256: createHash('sha256').update(m[2]).digest('hex'),
              expected_key: /^signed-by$/i.test(m[1])
                ? m[2].trim() === expectedKey
                : undefined,
              direct_ubuntu_uri: /^uris$/i.test(m[1])
                ? /^https?:\/\/(?:azure\.archive|archive|security)\.ubuntu\.com\/ubuntu\/?$/.test(
                    m[2],
                  )
                : undefined,
              runner_mirror_file: /^uris$/i.test(m[1])
                ? m[2] === 'mirror+file:/etc/apt/apt-mirrors.txt'
                : undefined,
            }
          : { malformed_field: true },
      ),
    };
  });
let mirrorText;
if (source.includes('mirror+file:/etc/apt/apt-mirrors.txt'))
  mirrorText = readFileSync('/etc/apt/apt-mirrors.txt', 'utf8');
let mirrorValidation = 'NOT_REFERENCED';
if (mirrorText !== undefined) {
  try {
    validateUbuntuMirrors(mirrorText);
    mirrorValidation = 'PASS';
  } catch (e) {
    mirrorValidation = e.message;
  }
}
let validation = 'PASS';
try {
  validateUbuntuSources(source, mirrorText);
} catch (e) {
  validation = e.message;
}
console.log(
  JSON.stringify(
    {
      source_sha256: createHash('sha256').update(source).digest('hex'),
      validation,
      mirror_validation: mirrorValidation,
      mirror_sha256:
        mirrorText === undefined
          ? undefined
          : createHash('sha256').update(mirrorText).digest('hex'),
      stanzas: rows,
    },
    null,
    2,
  ),
);
