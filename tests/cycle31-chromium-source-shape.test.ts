import { expect, it } from 'vitest';
const { validateUbuntuSources, validateUbuntuMirrors } = await import(
  new URL('../scripts/cycle30-chromium-dependencies.mjs', import.meta.url).href
);
const mirrors =
  'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\nhttps://archive.ubuntu.com/ubuntu/\tpriority:2\nhttps://security.ubuntu.com/ubuntu/\tpriority:3\n';
const stanza =
  'Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble noble-updates noble-backports\nComponents: main universe restricted multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg';
const hosted =
  '# Ubuntu comments only\n\n# Cloud image comments only\n\n' +
  stanza +
  '\n\n' +
  stanza.replace('noble noble-updates noble-backports', 'noble-security');
it('accepts actual hosted two comment blocks and two signed mirror-file stanzas', () =>
  expect(validateUbuntuSources(hosted, mirrors)).toBe(true));
it.each(['', '# comment only\n\n# another comment'])(
  'does not treat comment-only files as signed sources: %s',
  (s) => expect(() => validateUbuntuSources(s, mirrors)).toThrow(),
);
it('requires independently validated mirror content for the exact referenced file', () =>
  expect(() => validateUbuntuSources(hosted)).toThrow());
it.each([
  'mirror+file:/tmp/mirrors',
  'mirror+https://evil.example/list',
  'file:/etc/apt/apt-mirrors.txt',
])('denies unreviewed mirror reference %s', (s) =>
  expect(() =>
    validateUbuntuSources(
      stanza.replace('mirror+file:/etc/apt/apt-mirrors.txt', s),
      mirrors,
    ),
  ).toThrow(),
);
it.each([
  'http://evil.example/ubuntu/',
  'http://azure.archive.ubuntu.com.evil/ubuntu/',
  'https://user:password@archive.ubuntu.com/ubuntu/',
  'file:/tmp/ubuntu',
])('denies mirror substitution %s', (uri) =>
  expect(() =>
    validateUbuntuMirrors(
      mirrors.replace('http://azure.archive.ubuntu.com/ubuntu/', uri),
    ),
  ).toThrow(),
);
it.each([
  mirrors.split('\n').slice(0, 2).join('\n'),
  mirrors + mirrors.split('\n')[0],
  mirrors.replace('priority:2', 'priority:1'),
  mirrors.replace('priority:3', 'priority:4'),
  mirrors.replace('priority:1', 'priority:1 trusted=yes'),
])('denies missing, duplicate, extra or option-bearing mirror targets', (s) =>
  expect(() => validateUbuntuMirrors(s)).toThrow(),
);
it.each(['\nTrusted: yes', '\nAllow-Insecure: yes', '\nSigned-By: /tmp/key'])(
  'comments do not hide untrusted source fields %s',
  (s) => expect(() => validateUbuntuSources(hosted + s, mirrors)).toThrow(),
);
it('retains exact signature key and noble suite validation', () => {
  expect(() =>
    validateUbuntuSources(
      hosted.replaceAll(
        '/usr/share/keyrings/ubuntu-archive-keyring.gpg',
        '/tmp/key',
      ),
      mirrors,
    ),
  ).toThrow();
  expect(() =>
    validateUbuntuSources(
      hosted.replaceAll('noble-security', 'jammy-security'),
      mirrors,
    ),
  ).toThrow();
});
