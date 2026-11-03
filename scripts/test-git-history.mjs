import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { devNull, tmpdir } from 'node:os';
import {
  mkdtempSync,
  chmodSync,
  lstatSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

export const publicTestRepository =
  'https://github.com/eaglevisiondigital/eaglevisioncontractorplatform.git';
export const publicTestRefspec =
  '+refs/heads/*:refs/remotes/propel-test-history/*';
export const historyBudgetMs = 25000;

const settings = [
  'credential.helper=',
  'credential.interactive=false',
  'core.askPass=',
  `core.hooksPath=${devNull}`,
  'core.fsmonitor=false',
  'http.extraHeader=',
  'http.https://github.com/.extraHeader=',
  `http.${publicTestRepository}.extraHeader=`,
  `http.${publicTestRepository}.extraHeader=Authorization:`,
  'http.followRedirects=false',
  'http.sslVerify=true',
  'http.proxy=',
  'http.cookieFile=',
  'http.saveCookies=false',
  'http.emptyAuth=false',
  'http.proactiveAuth=none',
  'http.delegation=none',
  'http.maxRetries=0',
];
const gitOptions = settings.flatMap((value) => ['-c', value]);
export const publicHistoryFetchArgs = Object.freeze([
  ...gitOptions,
  'fetch',
  '--quiet',
  '--atomic',
  '--unshallow',
  '--no-tags',
  '--no-write-fetch-head',
  '--no-recurse-submodules',
  '--no-auto-maintenance',
  '--no-write-commit-graph',
  '--refmap=',
  '--',
  publicTestRepository,
  publicTestRefspec,
]);
const fail = () =>
  Error(
    'Public test Git-history precondition failed; no retry or source-guard bypass is permitted',
  );
function own(environment, key) {
  const descriptor = Object.getOwnPropertyDescriptor(environment, key);
  if (!descriptor) return undefined;
  if (!Object.hasOwn(descriptor, 'value')) throw fail();
  return descriptor.value;
}
function publicEnvironment(environment, isolatedHome) {
  const result = {
    // Intentional subprocess-only isolation. Never change process.env or the
    // user's shell HOME; libcurl must not fall back to a real user's netrc.
    HOME: isolatedHome,
    XDG_CONFIG_HOME: isolatedHome,
    NETRC: devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: devNull,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_COUNT: '0',
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never',
    GIT_ALLOW_PROTOCOL: 'https',
    GIT_PROTOCOL_FROM_USER: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_CEILING_DIRECTORIES: isolatedHome,
    GIT_DISCOVERY_ACROSS_FILESYSTEM: '0',
    GIT_HTTP_MAX_RETRIES: '0',
    GIT_HTTP_MAX_RETRY_TIME: '0',
    GIT_HTTP_RETRY_AFTER: '0',
  };
  for (const key of [
    'PATH',
    'SystemRoot',
    'SYSTEMROOT',
    'WINDIR',
    'TMPDIR',
    'TMP',
    'TEMP',
  ]) {
    const value = own(environment, key);
    if (value !== undefined) {
      if (typeof value !== 'string' || value.includes('\0')) throw fail();
      result[key] = value;
    }
  }
  return Object.freeze(result);
}
/** Inspect names only, never configuration values, origin URL or credentials.
 * Includes, URL rewrites, partial clones, helper overrides and custom HTTP
 * configuration fail closed before the first checkout metadata probe. Normal checkout's scoped
 * authorization header is allowed only because the fixed command clears it. */
function assertCheckoutKeys(output) {
  const allowed = [
    /^core\.(repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode)$/,
    /^remote\.origin\.(url|fetch)$/,
    /^branch\.[a-z0-9_./-]+\.(remote|merge)$/,
    /^gc\.auto$/,
    /^http\.extraheader$/,
    /^http\.https:\/\/github\.com\/\.extraheader$/,
    /^http\.https:\/\/github\.com\/eaglevisiondigital\/eaglevisioncontractorplatform\.git\.extraheader$/,
  ];
  const keys = output === '' ? [] : output.trimEnd().split('\n');
  if (
    keys.length > 200 ||
    keys.some((key) => !allowed.some((pattern) => pattern.test(key)))
  )
    throw fail();
}
/** Test metadata only. The injected command port is a trusted offline fixture,
 * never an application adapter, URL override or credential capability. */
export function ensureTestGitHistory({
  environment = process.env,
  cwd = process.cwd(),
  run = spawnSync,
} = {}) {
  const matches = () =>
    own(environment, 'CI') === 'true' &&
    own(environment, 'GITHUB_ACTIONS') === 'true' &&
    own(environment, 'GITHUB_REPOSITORY') ===
      'eaglevisiondigital/eaglevisioncontractorplatform';
  if (!matches())
    return Object.freeze({ status: 'NOT_APPLICABLE', fetches: 0 });
  const started = performance.now();
  let isolatedHome,
    prepared,
    rejected = false;
  try {
    isolatedHome = mkdtempSync(join(tmpdir(), 'propel-public-test-git-'));
    isolatedHome = realpathSync(isolatedHome);
    chmodSync(isolatedHome, 0o700);
    function assertEmptyHome() {
      const stat = lstatSync(isolatedHome);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        (stat.mode & 0o777) !== 0o700 ||
        readdirSync(isolatedHome).length
      )
        throw fail();
    }
    assertEmptyHome();
    const env = publicEnvironment(environment, isolatedHome);
    prepared = (() => {
      if (
        typeof cwd !== 'string' ||
        !isAbsolute(cwd) ||
        typeof run !== 'function'
      )
        throw fail();
      const checkout = resolve(cwd),
        gitDirectory = join(checkout, '.git'),
        localConfig = join(gitDirectory, 'config');
      // Git startup follows includes even for --local --no-includes. Require
      // the ordinary Actions checkout layout without discovering any paths.
      // Audit its known config from the empty non-repository child directory.
      for (const path of [checkout, gitDirectory]) {
        const stat = lstatSync(path);
        if (
          !stat.isDirectory() ||
          stat.isSymbolicLink() ||
          realpathSync(path) !== path
        )
          throw fail();
      }
      const configStat = lstatSync(localConfig);
      if (
        !configStat.isFile() ||
        configStat.isSymbolicLink() ||
        configStat.size > 65536
      )
        throw fail();
      function execute(args, commandCwd = checkout) {
        const timeout = Math.floor(
          historyBudgetMs - (performance.now() - started),
        );
        if (timeout < 1) throw fail();
        let result;
        try {
          result = run('git', [...args], {
            cwd: commandCwd,
            env,
            encoding: 'utf8',
            timeout,
            killSignal: 'SIGKILL',
            maxBuffer: 65536,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        } catch {
          throw fail();
        }
        if (
          performance.now() - started >= historyBudgetMs ||
          !result ||
          result.status !== 0 ||
          result.error ||
          result.signal ||
          typeof result.stdout !== 'string'
        )
          throw fail();
        return result.stdout;
      }
      function shallow() {
        const value = execute([
          ...gitOptions,
          'rev-parse',
          '--is-shallow-repository',
        ]).trim();
        if (!['true', 'false'].includes(value)) throw fail();
        return value === 'true';
      }
      assertCheckoutKeys(
        execute(
          [
            ...gitOptions,
            'config',
            '--file',
            localConfig,
            '--no-includes',
            '--name-only',
            '--list',
          ],
          isolatedHome,
        ),
      );
      if (!shallow())
        return Object.freeze({
          status: 'FULL_HISTORY_ALREADY_PRESENT',
          fetches: 0,
        });
      const head = execute([
        ...gitOptions,
        'rev-parse',
        '--verify',
        'HEAD',
      ]).trim();
      if (!/^[a-f0-9]{40}$/.test(head)) throw fail();
      if (!matches()) throw fail();
      assertEmptyHome();
      execute(publicHistoryFetchArgs); // Exactly one attempt. A failed/unknown ACK stops here.
      assertEmptyHome();
      if (
        !matches() ||
        shallow() ||
        execute([...gitOptions, 'rev-parse', '--verify', 'HEAD']).trim() !==
          head
      )
        throw fail();
      return Object.freeze({
        status: 'PUBLIC_TEST_HISTORY_AVAILABLE',
        fetches: 1,
      });
    })();
  } catch {
    rejected = true;
  } finally {
    if (isolatedHome)
      try {
        rmSync(isolatedHome, { recursive: true, force: true });
      } catch {
        rejected = true;
      }
  }
  if (rejected || !prepared || performance.now() - started >= historyBudgetMs)
    throw fail();
  return prepared;
}
