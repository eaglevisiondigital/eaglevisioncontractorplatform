import { expect, it } from 'vitest';
const { validateUbuntuSources, dependencyCommands, fonts } = await import(
  new URL('../scripts/cycle30-chromium-dependencies.mjs', import.meta.url).href
);
const valid =
  'Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu/\nSuites: noble noble-updates noble-backports\nComponents: main universe restricted multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg';
it('permits only signed native Ubuntu24.04 source fields', () =>
  expect(validateUbuntuSources(valid)).toBe(true));
it.each([
  'http://evil.example/ubuntu/',
  'http://archive.ubuntu.com.evil/ubuntu/',
  'https://packages.microsoft.com/ubuntu/24.04/prod',
])('denies unreviewed archive %s', (uri) =>
  expect(() =>
    validateUbuntuSources(
      valid.replace('http://azure.archive.ubuntu.com/ubuntu/', uri),
    ),
  ).toThrow(),
);
it.each([
  '\nTrusted: yes',
  '\nAllow-Insecure: yes',
  '\nSigned-By: /tmp/key',
  '\nURIs: http://archive.ubuntu.com/ubuntu/',
  '\nTypes: deb-src',
])('denies trust bypass and duplicate fields %s', (s) =>
  expect(() => validateUbuntuSources(valid + s)).toThrow(),
);
it('denies absent signature key and wrong suite', () => {
  expect(() =>
    validateUbuntuSources(valid.replace('Signed-By:', 'Key:')),
  ).toThrow();
  expect(() =>
    validateUbuntuSources(
      valid.replace('noble noble-updates noble-backports', 'jammy'),
    ),
  ).toThrow();
});
it('installs only nine demonstrated missing fonts without changing repository configuration', () => {
  const commands = dependencyCommands();
  expect(commands).toHaveLength(2);
  expect(fonts).toHaveLength(9);
  expect(commands[0]).toEqual([
    'apt-get',
    '-o',
    'Dir::Etc::sourcelist=/etc/apt/sources.list.d/ubuntu.sources',
    '-o',
    'Dir::Etc::sourceparts=-',
    'update',
  ]);
  expect(commands[1].slice(-9)).toEqual(fonts);
  expect(commands.flat().join(' ')).not.toMatch(
    /unauthenticated|insecure|allow-weak|trusted=yes/,
  );
});
