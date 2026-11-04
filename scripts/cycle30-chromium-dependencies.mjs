// GitHub disposable Ubuntu runner prerequisites only. No application/provider IO.
import { readFileSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const ubuntuSource = '/etc/apt/sources.list.d/ubuntu.sources';
export const fonts = Object.freeze([
  'fonts-freefont-ttf',
  'fonts-ipafont-gothic',
  'fonts-tlwg-loma-otf',
  'fonts-unifont',
  'fonts-wqy-zenhei',
  'xfonts-cyrillic',
  'xfonts-encodings',
  'xfonts-scalable',
  'xfonts-utils',
]);
export const ubuntuMirrors = '/etc/apt/apt-mirrors.txt';
export function validateUbuntuMirrors(text) {
  const expected = new Map([
    ['1', 'http://azure.archive.ubuntu.com/ubuntu/'],
    ['2', 'https://archive.ubuntu.com/ubuntu/'],
    ['3', 'https://security.ubuntu.com/ubuntu/'],
  ]);
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (lines.length !== 3)
    throw Error('Exact three signed-Ubuntu mirror targets required');
  for (const line of lines) {
    const m = /^(\S+)[\t ]+priority:([123])$/.exec(line);
    if (!m || expected.get(m[2]) !== m[1])
      throw Error('Reviewed Ubuntu mirror and priority required');
    expected.delete(m[2]);
  }
  if (expected.size) throw Error('Complete reviewed Ubuntu mirrors required');
  return true;
}
export function validateUbuntuSources(text, mirrorText) {
  const paragraphs = text
    .trim()
    .split(/\n\s*\n/)
    .map((part) => {
      const fields = {};
      for (const line of part.split('\n')) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const m = /^([A-Za-z-]+):\s*(\S.*)$/.exec(line);
        if (!m || Object.hasOwn(fields, m[1]))
          throw Error('Exact single-valued source fields required');
        fields[m[1]] = m[2].trim();
      }
      return fields;
    })
    .filter((fields) => Object.keys(fields).length > 0);
  if (!paragraphs.length || paragraphs.length > 4)
    throw Error('Bounded Ubuntu sources required');
  for (const p of paragraphs) {
    if (
      Object.keys(p).some(
        (k) =>
          ![
            'Types',
            'URIs',
            'Suites',
            'Components',
            'Signed-By',
            'Architectures',
          ].includes(k),
      ) ||
      p.Types !== 'deb' ||
      p['Signed-By'] !== '/usr/share/keyrings/ubuntu-archive-keyring.gpg'
    )
      throw Error('Signed Ubuntu deb sources only');
    if (
      !p.URIs ||
      p.URIs.split(/\s+/).some((u) =>
        u === `mirror+file:${ubuntuMirrors}`
          ? !validateUbuntuMirrors(mirrorText ?? '')
          : !/^https?:\/\/(?:azure\.archive|archive|security)\.ubuntu\.com\/ubuntu\/?$/.test(
              u,
            ),
      )
    )
      throw Error('Official Ubuntu archive URI required');
    if (
      !p.Suites ||
      p.Suites.split(/\s+/).some(
        (s) =>
          ![
            'noble',
            'noble-updates',
            'noble-backports',
            'noble-security',
          ].includes(s),
      )
    )
      throw Error('Ubuntu24.04 suites required');
    if (
      !p.Components ||
      p.Components.split(/\s+/).some(
        (s) => !['main', 'restricted', 'universe', 'multiverse'].includes(s),
      ) ||
      (p.Architectures && p.Architectures !== 'amd64')
    )
      throw Error('Exact reviewed components/architecture required');
  }
  return true;
}
export function dependencyCommands() {
  const sourceOptions = [
    '-o',
    `Dir::Etc::sourcelist=${ubuntuSource}`,
    '-o',
    'Dir::Etc::sourceparts=-',
  ];
  return [
    ['apt-get', ...sourceOptions, 'update'],
    [
      'apt-get',
      ...sourceOptions,
      'install',
      '-y',
      '--no-install-recommends',
      ...fonts,
    ],
  ];
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const os = readFileSync('/etc/os-release', 'utf8');
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.RUNNER_OS !== 'Linux' ||
    !/^ID=ubuntu$/m.test(os) ||
    !/^VERSION_ID="24\.04"$/m.test(os)
  )
    throw Error('Disposable GitHub Ubuntu24.04 runner only');
  for (const p of [
    ubuntuSource,
    '/usr/share/keyrings/ubuntu-archive-keyring.gpg',
  ])
    if (!lstatSync(p).isFile() || lstatSync(p).isSymbolicLink())
      throw Error('Regular installed Ubuntu source/key required');
  const source = readFileSync(ubuntuSource, 'utf8');
  let mirrorText;
  if (source.includes(`mirror+file:${ubuntuMirrors}`)) {
    if (
      !lstatSync(ubuntuMirrors).isFile() ||
      lstatSync(ubuntuMirrors).isSymbolicLink()
    )
      throw Error('Regular installed Ubuntu mirror file required');
    mirrorText = readFileSync(ubuntuMirrors, 'utf8');
  }
  validateUbuntuSources(source, mirrorText);
  for (const args of dependencyCommands())
    execFileSync('sudo', ['--', ...args], { stdio: 'inherit' });
}
