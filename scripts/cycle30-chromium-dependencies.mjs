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
export function validateUbuntuSources(text) {
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
    });
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
      p.URIs.split(/\s+/).some(
        (u) =>
          !/^https?:\/\/(?:azure\.archive|archive|security)\.ubuntu\.com\/ubuntu\/?$/.test(
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
  validateUbuntuSources(readFileSync(ubuntuSource, 'utf8'));
  for (const args of dependencyCommands())
    execFileSync('sudo', ['--', ...args], { stdio: 'inherit' });
}
