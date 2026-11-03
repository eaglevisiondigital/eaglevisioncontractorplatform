import { afterAll, expect, it, vi } from 'vitest';
import {
  execFileSync,
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
} from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  lstatSync,
  readdirSync,
  symlinkSync,
  realpathSync,
} from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
type Result = {
  status: number | null;
  stdout: string;
  error?: Error;
  signal?: string | null;
};
type Options = SpawnSyncOptionsWithStringEncoding;
type Run = (file: string, args: string[], options: Options) => Result;
const history: {
  publicTestRepository: string;
  publicTestRefspec: string;
  publicHistoryFetchArgs: readonly string[];
  historyBudgetMs: number;
  ensureTestGitHistory: (options?: {
    environment?: Record<string, string | undefined>;
    cwd?: string;
    run?: Run;
  }) => { status: string; fetches: number };
} = await import(
  new URL('../../scripts/test-git-history.mjs', import.meta.url).href
);
const roots: string[] = [];
afterAll(() =>
  roots.forEach((path) => rmSync(path, { recursive: true, force: true })),
);
const fakeCheckout = realpathSync(
  mkdtempSync(join(tmpdir(), 'propel-history-metadata-')),
);
roots.push(fakeCheckout);
mkdirSync(join(fakeCheckout, '.git'));
writeFileSync(
  join(fakeCheckout, '.git', 'config'),
  '[core]\nrepositoryformatversion = 0\n',
);
const ensure: typeof history.ensureTestGitHistory = (options = {}) =>
  history.ensureTestGitHistory({ cwd: fakeCheckout, ...options });
const environment = () => ({
  CI: 'true',
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'eaglevisiondigital/eaglevisioncontractorplatform',
  PATH: process.env.PATH,
});
function fake({
  shallow = 'true',
  keys = 'core.repositoryformatversion\ncore.filemode\ngc.auto\nremote.origin.url\nremote.origin.fetch\nhttp.https://github.com/.extraheader\n',
  fetchResult = { status: 0, stdout: '' } as Result,
  after = 'false',
  head = 'a'.repeat(40),
  headAfter = head,
}: {
  shallow?: string;
  keys?: string;
  fetchResult?: Result;
  after?: string;
  head?: string;
  headAfter?: string;
} = {}) {
  const calls: { file: string; args: string[]; options: Options }[] = [];
  let probes = 0,
    heads = 0;
  const run: Run = (file, args, options) => {
    calls.push({ file, args, options });
    if (args.includes('--is-shallow-repository'))
      return { status: 0, stdout: (probes++ ? after : shallow) + '\n' };
    if (args.includes('config')) return { status: 0, stdout: keys };
    if (args.includes('--verify'))
      return { status: 0, stdout: (heads++ ? headAfter : head) + '\n' };
    if (args.includes('fetch')) return fetchResult;
    throw Error('Unexpected fixture command');
  };
  return {
    run,
    calls,
    fetches: () => calls.filter((c) => c.args.includes('fetch')),
  };
}
it.each([
  ['CI', 'false'],
  ['CI', 'TRUE'],
  ['CI', '1'],
  ['GITHUB_ACTIONS', 'false'],
  ['GITHUB_REPOSITORY', 'foreign/repository'],
] as const)(
  'nonmatching %s=%s performs no Git or network calls',
  (key, value) => {
    const env = environment(),
      f = fake();
    env[key] = value;
    expect(ensure({ environment: env, run: f.run })).toEqual({
      status: 'NOT_APPLICABLE',
      fetches: 0,
    });
    expect(f.calls).toHaveLength(0);
  },
);
it('an accessor cannot execute or invent a CI gate', () => {
  const env = environment(),
    getter = vi.fn(() => 'true'),
    f = fake();
  Object.defineProperty(env, 'CI', { get: getter });
  expect(() => ensure({ environment: env, run: f.run })).toThrow();
  expect(getter).not.toHaveBeenCalled();
  expect(f.calls).toHaveLength(0);
});
it('full history in the exact CI context audits key names first and performs no fetch', () => {
  const f = fake({ shallow: 'false' });
  expect(ensure({ environment: environment(), run: f.run })).toEqual({
    status: 'FULL_HISTORY_ALREADY_PRESENT',
    fetches: 0,
  });
  expect(f.calls).toHaveLength(2);
  expect(f.calls[0].args).toContain('--no-includes');
  expect(f.calls[0].args).toContain('--name-only');
  expect(f.calls[1].args).toContain('--is-shallow-repository');
});
it('the only fetch is the fixed anonymous public command and a separate all-heads namespace', () => {
  const f = fake();
  expect(ensure({ environment: environment(), run: f.run })).toEqual({
    status: 'PUBLIC_TEST_HISTORY_AVAILABLE',
    fetches: 1,
  });
  expect(f.fetches()).toHaveLength(1);
  expect(f.fetches()[0].args).toEqual(history.publicHistoryFetchArgs);
  expect(history.publicTestRepository).toBe(
    'https://github.com/eaglevisiondigital/eaglevisioncontractorplatform.git',
  );
  expect(history.publicTestRefspec).toBe(
    '+refs/heads/*:refs/remotes/propel-test-history/*',
  );
  expect(
    f.calls.some(
      (c) =>
        c.args.includes('remote') ||
        c.args.includes('get-url') ||
        c.args.includes('--get'),
    ),
  ).toBe(false);
  expect(f.calls.find((c) => c.args.includes('config'))?.args).toEqual(
    expect.arrayContaining([
      '--file',
      join(fakeCheckout, '.git', 'config'),
      '--no-includes',
      '--name-only',
      '--list',
    ]),
  );
});
it('secret environment, proxies, Git overrides and tracing are not passed to subprocesses', () => {
  const env = {
      ...environment(),
      GITHUB_TOKEN: 'PRIVATE_TOKEN',
      GH_TOKEN: 'PRIVATE_TOKEN',
      GIT_ASKPASS: 'private-helper',
      GIT_CONFIG_PARAMETERS: 'private-config',
      GIT_CONFIG_COUNT: '99',
      GIT_DIR: 'private-repository',
      GIT_TRACE: '1',
      HTTPS_PROXY: 'https://private-proxy.invalid',
      HOME: '/private-home',
    },
    f = fake();
  ensure({ environment: env, run: f.run });
  const child = f.fetches()[0].options.env!;
  expect(JSON.stringify(child)).not.toMatch(
    /PRIVATE_TOKEN|private-helper|private-config|private-repository|private-proxy|private-home/,
  );
  expect(child.GIT_TERMINAL_PROMPT).toBe('0');
  expect(child.GIT_CONFIG_GLOBAL).toBe(devNull);
  expect(child.GIT_CONFIG_SYSTEM).toBe(devNull);
  expect(child.GIT_ALLOW_PROTOCOL).toBe('https');
  expect(child.GIT_CONFIG_COUNT).toBe('0');
  expect(child.GIT_HTTP_MAX_RETRIES).toBe('0');
});
it('fetch clears generic and scoped authorization, helper, askpass, cookies and redirects', () => {
  const f = fake();
  ensure({ environment: environment(), run: f.run });
  const args = f.fetches()[0].args;
  expect(args).toEqual(
    expect.arrayContaining([
      'credential.helper=',
      'core.askPass=',
      'http.extraHeader=',
      'http.https://github.com/.extraHeader=',
      `http.${history.publicTestRepository}.extraHeader=`,
      `http.${history.publicTestRepository}.extraHeader=Authorization:`,
      'http.followRedirects=false',
      'http.cookieFile=',
      'http.sslVerify=true',
      '--atomic',
      '--no-write-fetch-head',
      '--no-tags',
      '--no-recurse-submodules',
      '--no-auto-maintenance',
      '--no-write-commit-graph',
      '--refmap=',
    ]),
  );
  expect(args).not.toEqual(
    expect.arrayContaining(['checkout', 'reset', 'merge', 'pull']),
  );
});
it.each(['TRUE', '', 'true\nfalse'])(
  'unknown shallow evidence case %# fails before a fetch',
  (shallow) => {
    const f = fake({ shallow });
    expect(() => ensure({ environment: environment(), run: f.run })).toThrow();
    expect(f.fetches()).toHaveLength(0);
  },
);
it.each([
  'url.https://elsewhere.invalid/.insteadof',
  'include.path',
  'includeif.gitdir:other.path',
  'credential.helper',
  'http.proxy',
  'http.https://private.invalid/.extraheader',
  'http.https://github.com/eaglevisiondigital/eaglevisioncontractorplatform.extraheader',
  'http.https://github.com/eaglevisiondigital/eaglevisioncontractorplatform.git/.extraheader',
  'extensions.worktreeconfig',
  'core.hookspath',
  'maintenance.auto',
])(
  'unreviewed configuration key case %# denies without reading values',
  (key) => {
    const f = fake({ keys: key + '\n' });
    expect(() => ensure({ environment: environment(), run: f.run })).toThrow();
    expect(f.fetches()).toHaveLength(0);
    expect(
      f.calls.every(
        (c) => !c.args.includes('--get') && !c.args.includes('--get-regexp'),
      ),
    ).toBe(true);
  },
);
it.each([
  { status: 1, stdout: '' },
  { status: null, stdout: '', signal: 'SIGKILL' },
  { status: 0, stdout: '', error: Error('PRIVATE timeout detail') },
])(
  'failed or uncertain fetch acknowledgment case %# has exactly one attempt and no postcondition continuation',
  (fetchResult) => {
    const f = fake({ fetchResult });
    expect(() => ensure({ environment: environment(), run: f.run })).toThrow(
      'Public test Git-history precondition failed',
    );
    expect(f.fetches()).toHaveLength(1);
    expect(f.calls.at(-1)?.args).toContain('fetch');
  },
);
it('subprocess exceptions are sanitized without credential or provider output', () => {
  const message = 'PRIVATE helper or origin details';
  try {
    ensure({
      environment: environment(),
      run: () => {
        throw Error(message);
      },
    });
    throw Error('Expected rejection');
  } catch (error) {
    expect(String(error)).not.toContain(message);
    expect(String(error)).toContain('precondition failed');
  }
});
it('a still-shallow postcondition fails closed without another attempt', () => {
  const f = fake({ after: 'true' });
  expect(() => ensure({ environment: environment(), run: f.run })).toThrow();
  expect(f.fetches()).toHaveLength(1);
});
it('changed HEAD after fetching fails closed and does not checkout a replacement', () => {
  const f = fake({ headAfter: 'b'.repeat(40) });
  expect(() => ensure({ environment: environment(), run: f.run })).toThrow();
  expect(f.fetches()).toHaveLength(1);
});
it('malformed initial HEAD prevents the fetch', () => {
  const f = fake({ head: 'not-a-commit' });
  expect(() => ensure({ environment: environment(), run: f.run })).toThrow();
  expect(f.fetches()).toHaveLength(0);
});
it('withdrawn exact CI context before the boundary prevents the fetch', () => {
  const env = environment(),
    f = fake(),
    run: Run = (...args) => {
      const r = f.run(...args);
      if (args[1].includes('--verify'))
        env.GITHUB_REPOSITORY = 'foreign/repository';
      return r;
    };
  expect(() => ensure({ environment: env, run })).toThrow();
  expect(f.fetches()).toHaveLength(0);
});
it('every Git command shares a single deadline no larger than25seconds', () => {
  const f = fake();
  ensure({ environment: environment(), run: f.run });
  const budgets = f.calls.map((c) => c.options.timeout!);
  expect(history.historyBudgetMs).toBe(25000);
  expect(budgets.every((n) => n > 0 && n <= 25000)).toBe(true);
  expect(budgets.every((n, i) => i === 0 || n <= budgets[i - 1])).toBe(true);
  expect(f.fetches()[0].options.killSignal).toBe('SIGKILL');
  expect(f.fetches()[0].options.stdio).toEqual(['ignore', 'pipe', 'pipe']);
});
it.each(['fetch', 'final-head'] as const)(
  'late successful %s acknowledgment still fails the original deadline without retry',
  (kind) => {
    const f = fake();
    let clock = 0,
      heads = 0;
    const timer = vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const run: Run = (file, args, options) => {
      const result = f.run(file, args, options);
      if (args.includes('--verify')) heads++;
      if (
        (kind === 'fetch' && args.includes('fetch')) ||
        (kind === 'final-head' && args.includes('--verify') && heads === 2)
      )
        clock = 25001;
      return result;
    };
    try {
      expect(() => ensure({ environment: environment(), run })).toThrow();
      expect(f.fetches()).toHaveLength(1);
    } finally {
      timer.mockRestore();
    }
  },
);
it('each invocation uses an empty private child home and never queries or changes the real user home', () => {
  const env = environment(),
    parentHome = process.env.HOME,
    getter = vi.fn(() => '/private-user-home'),
    f = fake();
  Object.defineProperty(env, 'HOME', { get: getter });
  let childHome = '';
  const run: Run = (file, args, options) => {
    childHome = String(options.env!.HOME);
    expect(childHome).not.toBe(parentHome);
    expect(options.env!.XDG_CONFIG_HOME).toBe(childHome);
    expect(options.env!.NETRC).toBe(devNull);
    expect(lstatSync(childHome).isSymbolicLink()).toBe(false);
    expect(lstatSync(childHome).mode & 0o777).toBe(0o700);
    expect(readdirSync(childHome)).toEqual([]);
    return f.run(file, args, options);
  };
  ensure({ environment: env, run });
  expect(getter).not.toHaveBeenCalled();
  expect(process.env.HOME).toBe(parentHome);
  expect(existsSync(childHome)).toBe(false);
});
it('failed fetch acknowledgment also cleans the isolated child home without another attempt', () => {
  const f = fake({ fetchResult: { status: 1, stdout: '' } });
  let childHome = '';
  const run: Run = (file, args, options) => {
    childHome = String(options.env!.HOME);
    return f.run(file, args, options);
  };
  expect(() => ensure({ environment: environment(), run })).toThrow();
  expect(f.fetches()).toHaveLength(1);
  expect(existsSync(childHome)).toBe(false);
});
it('unexpected child-home files before the fetch deny the attempt and are cleaned without reading them', () => {
  const f = fake();
  let home = '';
  const run: Run = (file, args, options) => {
    home = String(options.env!.HOME);
    const r = f.run(file, args, options);
    if (args.includes('config'))
      writeFileSync(join(home, '.netrc'), 'SYNTHETIC NOT A REAL CREDENTIAL');
    return r;
  };
  expect(() => ensure({ environment: environment(), run })).toThrow();
  expect(f.fetches()).toHaveLength(0);
  expect(existsSync(home)).toBe(false);
});
it('the explicit-file names-only audit rejects a malformed include before any checkout Git command can read it', () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), 'propel-include-history-')),
  );
  roots.push(root);
  const target = join(root, 'checkout'),
    included = join(root, 'synthetic-malformed.config');
  mkdirSync(target);
  const env = {
    PATH: process.env.PATH,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_SYSTEM: devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
  };
  execFileSync('git', ['init', '-b', 'main'], {
    cwd: target,
    env,
    stdio: 'ignore',
  });
  const config = join(target, '.git', 'config');
  writeFileSync(included, '[deliberately malformed synthetic config\n');
  writeFileSync(
    config,
    readFileSync(config, 'utf8') +
      `\n[include]\npath = ${JSON.stringify(included)}\n`,
  );
  const beforeConfig = readFileSync(config),
    beforeIncluded = readFileSync(included);
  // Demonstrate the native startup hazard using only this non-secret fixture.
  expect(
    spawnSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: target,
      env,
    }).status,
  ).toBe(128);
  const calls: { args: string[]; options: Options; result: Result }[] = [];
  const run: Run = (file, args, options) => {
    const result = spawnSync(file, args, options);
    calls.push({ args, options, result });
    return result;
  };
  expect(() =>
    ensure({ environment: environment(), cwd: target, run }),
  ).toThrow('Public test Git-history precondition failed');
  expect(calls).toHaveLength(1);
  expect(calls[0].args).toEqual(
    expect.arrayContaining([
      'config',
      '--file',
      config,
      '--no-includes',
      '--name-only',
      '--list',
    ]),
  );
  expect(calls[0].options.cwd).not.toBe(target);
  expect(calls[0].options.cwd).toBe(calls[0].options.env!.HOME);
  expect(calls[0].options.env!.GIT_CEILING_DIRECTORIES).toBe(
    calls[0].options.cwd,
  );
  expect(calls[0].result.status).toBe(0);
  expect(calls[0].result.stdout).toContain('include.path');
  expect(calls[0].result.stdout).not.toContain(included);
  expect(
    calls.every(
      (c) => !c.args.includes('rev-parse') && !c.args.includes('fetch'),
    ),
  ).toBe(true);
  expect(readFileSync(config)).toEqual(beforeConfig);
  expect(readFileSync(included)).toEqual(beforeIncluded);
});
it.each(['git-file', 'git-symlink', 'config-symlink'] as const)(
  'unsupported checkout metadata layout case %# denies before any Git invocation',
  (kind) => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), 'propel-history-layout-')),
    );
    roots.push(root);
    const target = join(root, 'checkout'),
      alternate = join(root, 'alternate');
    mkdirSync(target);
    mkdirSync(alternate);
    if (kind === 'git-file')
      writeFileSync(join(target, '.git'), 'gitdir: synthetic\n');
    else if (kind === 'git-symlink')
      symlinkSync(alternate, join(target, '.git'));
    else {
      mkdirSync(join(target, '.git'));
      writeFileSync(
        join(alternate, 'config'),
        '[core]\nrepositoryformatversion = 0\n',
      );
      symlinkSync(join(alternate, 'config'), join(target, '.git', 'config'));
    }
    const f = fake();
    expect(() =>
      ensure({ environment: environment(), cwd: target, run: f.run }),
    ).toThrow();
    expect(f.calls).toHaveLength(0);
  },
);
it('an actual local shallow fixture gains the exact old Git blob without changing the worktree, origin or FETCH_HEAD', () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), 'propel-test-history-')),
  );
  roots.push(root);
  const source = join(root, 'source'),
    target = join(root, 'shallow');
  mkdirSync(source);
  const env = {
    PATH: process.env.PATH,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_SYSTEM: devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ALLOW_PROTOCOL: 'file',
  };
  const git = (cwd: string, ...args: string[]) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Synthetic history fixture',
        '-c',
        'user.email=fixture@example.invalid',
        '-c',
        'commit.gpgsign=false',
        '-c',
        `core.hooksPath=${devNull}`,
        ...args,
      ],
      { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  git(source, 'init', '-b', 'main');
  writeFileSync(
    join(source, 'frozen-evidence.txt'),
    'Exact old source evidence\n',
  );
  writeFileSync(join(source, 'work.txt'), 'original\n');
  git(source, 'add', '.');
  git(source, 'commit', '-m', 'original evidence');
  const old = git(source, 'rev-parse', 'HEAD').trim();
  git(source, 'branch', 'evidence-source');
  rmSync(join(source, 'frozen-evidence.txt'));
  writeFileSync(join(source, 'work.txt'), 'current\n');
  git(source, 'add', '.');
  git(source, 'commit', '-m', 'current checkout');
  git(
    root,
    'clone',
    '--depth=1',
    '--single-branch',
    '--branch',
    'main',
    pathToFileURL(source).href,
    target,
  );
  expect(() => git(target, 'show', `${old}:frozen-evidence.txt`)).toThrow();
  expect(git(target, 'rev-parse', '--is-shallow-repository').trim()).toBe(
    'true',
  );
  writeFileSync(join(target, 'work.txt'), 'owner unsaved edit\n');
  writeFileSync(join(target, 'local-notes.txt'), 'owner untracked file\n');
  writeFileSync(
    join(target, '.git', 'FETCH_HEAD'),
    'original fetch-head sentinel\n',
  );
  git(
    target,
    'config',
    'remote.origin.url',
    'https://do-not-contact.invalid/private-fixture.git',
  );
  const before = {
    head: git(target, 'rev-parse', 'HEAD'),
    status: git(target, 'status', '--porcelain'),
    config: readFileSync(join(target, '.git', 'config')),
    fetchHead: readFileSync(join(target, '.git', 'FETCH_HEAD')),
    work: readFileSync(join(target, 'work.txt')),
    notes: readFileSync(join(target, 'local-notes.txt')),
  };
  let fetches = 0;
  const run: Run = (file, args, options) => {
    expect(file).toBe('git');
    if (args.includes('fetch')) {
      fetches++;
      expect(args).toEqual(history.publicHistoryFetchArgs);
      const mapped = args.map((v) =>
        v === history.publicTestRepository ? pathToFileURL(source).href : v,
      );
      return spawnSync(file, mapped, {
        ...options,
        env: { ...options.env, GIT_ALLOW_PROTOCOL: 'file' },
      });
    }
    return spawnSync(file, args, options);
  };
  expect(
    ensure({
      environment: environment(),
      cwd: target,
      run,
    }),
  ).toEqual({ status: 'PUBLIC_TEST_HISTORY_AVAILABLE', fetches: 1 });
  expect(fetches).toBe(1);
  expect(git(target, 'show', `${old}:frozen-evidence.txt`)).toBe(
    'Exact old source evidence\n',
  );
  expect(
    git(
      target,
      'rev-parse',
      'refs/remotes/propel-test-history/evidence-source',
    ).trim(),
  ).toBe(old);
  expect(git(target, 'rev-parse', '--is-shallow-repository').trim()).toBe(
    'false',
  );
  expect(git(target, 'rev-parse', 'HEAD')).toBe(before.head);
  expect(git(target, 'status', '--porcelain')).toBe(before.status);
  expect(readFileSync(join(target, '.git', 'config'))).toEqual(before.config);
  expect(readFileSync(join(target, '.git', 'FETCH_HEAD'))).toEqual(
    before.fetchHead,
  );
  expect(readFileSync(join(target, 'work.txt'))).toEqual(before.work);
  expect(readFileSync(join(target, 'local-notes.txt'))).toEqual(before.notes);
});
it('Vite adds only globalSetup and preserves the frozen Foundation workflow and existing validation budgets', () => {
  const original = execFileSync(
      'git',
      ['show', '36d805b5d8ca16f09697395c8a305b3e7d4318ef:vite.config.ts'],
      { encoding: 'utf8' },
    ),
    current = readFileSync('vite.config.ts', 'utf8');
  expect(
    current.replace("    globalSetup: ['tests/setup/git-history.ts'],\n", ''),
  ).toBe(original);
  expect(
    createHash('sha256')
      .update(readFileSync('.github/workflows/ci.yml'))
      .digest('hex'),
  ).toBe('df337433bfde1768ccbe396326793559f21113aa7c24e37fbd5955c4c29f87be');
});
it('an actual shallow pull-request merge checkout preserves detached HEAD while all-heads restores parent source history', () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), 'propel-pr-merge-history-')),
  );
  roots.push(root);
  const source = join(root, 'source'),
    target = join(root, 'target');
  mkdirSync(source);
  const env = {
    PATH: process.env.PATH,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_SYSTEM: devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ALLOW_PROTOCOL: 'file',
  };
  const git = (cwd: string, ...args: string[]) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        '-c',
        'commit.gpgsign=false',
        '-c',
        `core.hooksPath=${devNull}`,
        ...args,
      ],
      { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  git(source, 'init', '-b', 'main');
  writeFileSync(
    join(source, 'original.txt'),
    'Exact original merge-parent blob\n',
  );
  git(source, 'add', '.');
  git(source, 'commit', '-m', 'root');
  const old = git(source, 'rev-parse', 'HEAD').trim();
  git(source, 'checkout', '-b', 'feature');
  writeFileSync(join(source, 'feature.txt'), 'feature\n');
  git(source, 'add', '.');
  git(source, 'commit', '-m', 'feature');
  git(source, 'checkout', 'main');
  writeFileSync(join(source, 'base.txt'), 'base\n');
  git(source, 'add', '.');
  git(source, 'commit', '-m', 'base');
  git(source, 'checkout', '-b', 'merge-fixture');
  git(source, 'merge', '--no-ff', 'feature', '-m', 'pull merge');
  const merge = git(source, 'rev-parse', 'HEAD').trim();
  git(source, 'update-ref', 'refs/pull/7/merge', merge);
  git(source, 'checkout', 'main');
  git(source, 'branch', '-D', 'merge-fixture');
  git(
    root,
    'clone',
    '--depth=1',
    '--single-branch',
    '--branch',
    'main',
    pathToFileURL(source).href,
    target,
  );
  git(
    target,
    'fetch',
    '--depth=1',
    pathToFileURL(source).href,
    'refs/pull/7/merge',
  );
  git(target, 'checkout', '--detach', 'FETCH_HEAD');
  expect(
    git(source, 'for-each-ref', '--format=%(objectname)', 'refs/heads/'),
  ).not.toContain(merge);
  expect(() => git(target, 'show', `${old}:original.txt`)).toThrow();
  const status = git(target, 'status', '--porcelain'),
    head = git(target, 'rev-parse', 'HEAD');
  let fetches = 0;
  const run: Run = (file, args, options) => {
    if (args.includes('fetch')) {
      fetches++;
      expect(args).toEqual(history.publicHistoryFetchArgs);
      return spawnSync(
        file,
        args.map((v) =>
          v === history.publicTestRepository ? pathToFileURL(source).href : v,
        ),
        { ...options, env: { ...options.env, GIT_ALLOW_PROTOCOL: 'file' } },
      );
    }
    return spawnSync(file, args, options);
  };
  expect(
    ensure({
      environment: environment(),
      cwd: target,
      run,
    }),
  ).toEqual({ status: 'PUBLIC_TEST_HISTORY_AVAILABLE', fetches: 1 });
  expect(fetches).toBe(1);
  expect(git(target, 'branch', '--show-current').trim()).toBe('');
  expect(git(target, 'rev-parse', 'HEAD')).toBe(head);
  expect(git(target, 'status', '--porcelain')).toBe(status);
  expect(git(target, 'rev-parse', '--is-shallow-repository').trim()).toBe(
    'false',
  );
  expect(git(target, 'show', `${old}:original.txt`)).toBe(
    'Exact original merge-parent blob\n',
  );
});
