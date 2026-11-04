// Read-only standard GitHub-runner package-source diagnostics. No APT or writes.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateUbuntuSources } from './cycle30-chromium-dependencies.mjs';
const source = readFileSync('/etc/apt/sources.list.d/ubuntu.sources', 'utf8');
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
                /^(?:Types|Suites|Components|Architectures)$/i.test(m[1]) &&
                /^[A-Za-z0-9 -]{1,160}$/.test(m[2])
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
let validation = 'PASS';
try {
  validateUbuntuSources(source);
} catch (e) {
  validation = e.message;
}
console.log(
  JSON.stringify(
    {
      source_sha256: createHash('sha256').update(source).digest('hex'),
      validation,
      stanzas: rows,
    },
    null,
    2,
  ),
);
