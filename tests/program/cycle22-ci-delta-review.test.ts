import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  readFileSync,
  lstatSync,
  readdirSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { devNull, tmpdir } from 'node:os';
import { join } from 'node:path';
import { sampleCompanies } from '../../src/domain/platform';
import {
  prepareOperatingSources,
  captureOperatingSources,
} from '../../src/lib/workflows/operating-center-runtime';

type CommandResult = {
  status: number | null;
  stdout: string;
  signal?: string;
};
type CommandPort = (
  file: string,
  args: string[],
  options: { cwd: string; env: Record<string, string>; timeout: number },
) => CommandResult;
const history: {
  publicHistoryFetchArgs: readonly string[];
  ensureTestGitHistory: (options: {
    environment: Record<string, unknown>;
    cwd?: string;
    run: CommandPort;
  }) => { status: string; fetches: number };
} = await import(
  new URL('../../scripts/test-git-history.mjs', import.meta.url).href
);
const sourceCompatibility: {
  admitCycle33ExecutionCiCompatibility: (
    file: { path: string; sha256: string; blob: string },
    current: Buffer,
  ) => Record<string, unknown>;
} = await import(
  new URL('../../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);

const fixtureRoots: string[] = [];
beforeEach(() => {
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const root of fixtureRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const environment = () => ({
  CI: 'true',
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'eaglevisiondigital/eaglevisioncontractorplatform',
});
function probe(mode: 'normal' | 'late-fetch' | 'late-head' | 'lost-fetch') {
  const checkout = realpathSync(
    mkdtempSync(join(tmpdir(), 'propel-independent-public-history-')),
  );
  fixtureRoots.push(checkout);
  mkdirSync(join(checkout, '.git'), { mode: 0o700 });
  writeFileSync(
    join(checkout, '.git', 'config'),
    '[core]\n\trepositoryformatversion = 0\n',
  );
  let clock = 0,
    shallowReads = 0,
    headReads = 0,
    fetches = 0,
    home = '';
  const calls: string[][] = [];
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  const run: CommandPort = (file, args, options) => {
    expect(file).toBe('git');
    expect(options.timeout).toBeGreaterThan(0);
    expect(options.timeout).toBeLessThanOrEqual(25000);
    calls.push(args);
    home = options.env.HOME;
    expect(lstatSync(home).isDirectory()).toBe(true);
    expect(lstatSync(home).isSymbolicLink()).toBe(false);
    expect(lstatSync(home).mode & 0o777).toBe(0o700);
    expect(readdirSync(home)).toEqual([]);
    expect(options.env.XDG_CONFIG_HOME).toBe(home);
    expect(options.env.NETRC).toBe(devNull);
    expect(options.env.GIT_CEILING_DIRECTORIES).toBe(home);
    if (args.includes('config')) {
      expect(options.cwd).toBe(home);
      expect(args[args.indexOf('--file') + 1]).toBe(
        join(checkout, '.git', 'config'),
      );
      expect(args).toContain('--no-includes');
      expect(args).toContain('--name-only');
    } else expect(options.cwd).toBe(checkout);
    if (args.includes('--is-shallow-repository'))
      return { status: 0, stdout: shallowReads++ ? 'false\n' : 'true\n' };
    if (args.includes('config'))
      return { status: 0, stdout: 'core.repositoryformatversion\n' };
    if (args.includes('--verify')) {
      if (headReads++ && mode === 'late-head') clock = 25001;
      return { status: 0, stdout: 'c'.repeat(40) + '\n' };
    }
    if (args.includes('fetch')) {
      fetches++;
      expect(args).toEqual(history.publicHistoryFetchArgs);
      if (mode === 'late-fetch') clock = 25001;
      return mode === 'lost-fetch'
        ? { status: null, stdout: '', signal: 'SIGKILL' }
        : { status: 0, stdout: '' };
    }
    throw Error('Unexpected independent fixture command');
  };
  return {
    run,
    cwd: checkout,
    calls,
    fetches: () => fetches,
    home: () => home,
  };
}

it('independent history normal acknowledgment uses an empty child home, not ambient credential values', () => {
  const p = probe('normal'),
    env = environment(),
    forbiddenHome = vi.fn(() => '/never-read-ambient-home');
  Object.defineProperty(env, 'HOME', { get: forbiddenHome });
  expect(
    history.ensureTestGitHistory({ environment: env, cwd: p.cwd, run: p.run }),
  ).toEqual({ status: 'PUBLIC_TEST_HISTORY_AVAILABLE', fetches: 1 });
  expect(p.fetches()).toBe(1);
  expect(forbiddenHome).not.toHaveBeenCalled();
  expect(existsSync(p.home())).toBe(false);
  expect(p.calls.some((args) => args.includes('--get'))).toBe(false);
  expect(p.calls.some((args) => args.includes('get-url'))).toBe(false);
});
it.each(['late-fetch', 'late-head'] as const)(
  'independent late successful acknowledgment case %#: %s fails the original total deadline',
  (mode) => {
    const p = probe(mode);
    expect(() =>
      history.ensureTestGitHistory({
        environment: environment(),
        cwd: p.cwd,
        run: p.run,
      }),
    ).toThrow('Public test Git-history precondition failed');
    expect(p.fetches()).toBe(1);
    expect(existsSync(p.home())).toBe(false);
    if (mode === 'late-fetch') expect(p.calls.at(-1)).toContain('fetch');
  },
);
it('independent uncertain fetch acknowledgment stops before any postcondition continuation and cleans its home', () => {
  const p = probe('lost-fetch');
  expect(() =>
    history.ensureTestGitHistory({
      environment: environment(),
      cwd: p.cwd,
      run: p.run,
    }),
  ).toThrow('Public test Git-history precondition failed');
  expect(p.fetches()).toBe(1);
  expect(p.calls.at(-1)).toContain('fetch');
  expect(existsSync(p.home())).toBe(false);
});
it('independent include denial audits names from the isolated cwd before any ordinary repository command', () => {
  const p = probe('normal');
  const run: CommandPort = (...args) => {
    const result = p.run(...args);
    return args[1].includes('config')
      ? { status: 0, stdout: 'include.path\n' }
      : result;
  };
  expect(() =>
    history.ensureTestGitHistory({
      environment: environment(),
      cwd: p.cwd,
      run,
    }),
  ).toThrow('Public test Git-history precondition failed');
  expect(p.calls).toHaveLength(1);
  expect(p.calls[0]).toContain('config');
  expect(p.fetches()).toBe(0);
  expect(existsSync(p.home())).toBe(false);
});
it.each([
  ['CI', 'false'],
  ['GITHUB_ACTIONS', 'false'],
  ['GITHUB_REPOSITORY', 'other/repository'],
] as const)(
  'independent exact-environment gate case %#: %s denies all Git calls',
  (key, value) => {
    const env = { ...environment(), [key]: value },
      run = vi.fn<CommandPort>();
    expect(history.ensureTestGitHistory({ environment: env, run })).toEqual({
      status: 'NOT_APPLICABLE',
      fetches: 0,
    });
    expect(run).not.toHaveBeenCalled();
  },
);

it('independent retained C13 correction changes only the ambiguous locator to the exact original consent label', () => {
  const path = 'tests/program/cycle13-navigation.spec.ts';
  const before = execFileSync(
    'git',
    ['show', `ff673f41078002a6e741a450bba899d01d50ec77:${path}`],
    { encoding: 'utf8' },
  );
  const current = readFileSync(path, 'utf8');
  const exact = `    await page
      .getByLabel(
        'I confirm this disposable multi-job simulation; no dispatch, contract, invoice, payment or message is authorized.',
        { exact: true },
      )
      .check();`;
  expect(current).toContain(exact);
  expect(
    current.replace(exact, "    await page.getByRole('checkbox').check();"),
  ).toBe(before);
});

it('independent memo precondition retains deep current-source detection when the root prop reference stays identical', async () => {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[0], gate),
    root = sources,
    capture = captureOperatingSources(sources, gate),
    job = sources.estimates.syntheticJob(
      sources.company.id,
      sources.entries[0].target.job_id!,
    )!;
  await sources.estimates.projection(sources.company.id, job, {
    ...job.projection,
    remaining: {
      ...job.projection.remaining,
      other: job.projection.remaining.other + 1,
    },
  });
  expect(sources).toBe(root);
  expect(() => capture.check()).toThrow();
});
it('independent memo precondition denies current membership revocation without relying on changed props', async () => {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[1], gate),
    root = sources,
    capture = captureOperatingSources(sources, gate),
    memberships = sources.operations.syntheticMemberships.bind(
      sources.operations,
    ),
    actor = sources.entries[0].target.actor_id;
  vi.spyOn(sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      memberships(org).map((member) =>
        member.user_id === actor ? { ...member, active: false } : member,
      ),
  );
  expect(sources).toBe(root);
  expect(() => capture.check()).toThrow();
  expect(() => captureOperatingSources(sources, gate)).toThrow();
});

it('independent original fifty-case record and test remain exact rather than being overwritten by the CI delta review', () => {
  const path = 'tests/cycle22-independent-integration-review.test.ts',
    manifest = JSON.parse(
      readFileSync('docs/program/CYCLE22_SOURCE_MANIFEST.json', 'utf8'),
    ) as {
      independent_files: { path: string; sha256: string; blob: string }[];
    },
    file = manifest.independent_files.find((entry) => entry.path === path);
  expect(file).toEqual({
    path,
    sha256: '49fa5cf5d861c39518d8ffb26bf00d46f0c935a4fec6768dd15dcc323a35602b',
    blob: '7c1d67d95fe772a1d17070cc2e90a281c65988ab',
  });
  // Preserve the actual original evidence bytes and independently require the
  // exact reviewed test successor; neither historical metadata nor current
  // source is replaced, normalized or admitted by an arbitrary hash list.
  expect(
    sha(
      execFileSync('git', [
        '--no-replace-objects',
        'show',
        `b8e0cade3ae7de9773ce11cc0ab2cbae5274cd69:${path}`,
      ]),
    ),
  ).toBe('49fa5cf5d861c39518d8ffb26bf00d46f0c935a4fec6768dd15dcc323a35602b');
  expect(
    sourceCompatibility.admitCycle33ExecutionCiCompatibility(
      file!,
      readFileSync(path),
    ),
  ).toEqual({
    module: 'cycle22-independent-review-test-compatibility',
    source_commit: '649c2399fa954fdc50a1c6a1eab592c0f5b0ae18',
    path,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  });
  expect(
    sha(readFileSync('docs/program/CYCLE22_INDEPENDENT_REVIEW.json')),
  ).toBe('dcc7ee4e599ffa31bbc40005fb248780a051c67668ae10ab0fe7f22217a3d079');
});
it('independent delta source admission pins every reviewed correction byte and retains the frozen Foundation workflow', () => {
  const review = JSON.parse(
    readFileSync('docs/program/CYCLE22_CI_DELTA_REVIEW.json', 'utf8'),
  ) as {
    status: string;
    reviewed_correction_commit: string;
    reviewed_files: { path: string; sha256: string }[];
  };
  expect(review.status).toBe('CLEAR_LOCAL_CI_DELTA_ONLY');
  expect(review.reviewed_correction_commit).toBe(
    '1eff2018d43da47d06c0fcd8370562d404c52f95',
  );
  expect(review.reviewed_files.map((file) => file.path)).toEqual([
    'scripts/test-git-history.mjs',
    'tests/setup/git-history.ts',
    'vite.config.ts',
    'tests/program/test-git-history.test.ts',
    'src/components/workflows/DailyWorkbench.tsx',
    'tests/program/cycle22-daily-pane-render-guards.test.ts',
    'tests/program/cycle13-navigation.spec.ts',
    'tests/program/cycle22-daily-clock-retention.spec.ts',
    'tests/program/playwright.cycle22-clock.config.ts',
  ]);
  for (const file of review.reviewed_files) {
    const stat = lstatSync(file.path);
    expect(stat.isFile()).toBe(true);
    expect(stat.isSymbolicLink()).toBe(false);
    expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(sha(readFileSync(file.path))).toBe(file.sha256);
    expect(
      sha(
        execFileSync('git', [
          'show',
          `${review.reviewed_correction_commit}:${file.path}`,
        ]),
      ),
    ).toBe(file.sha256);
  }
  expect(sha(readFileSync('.github/workflows/ci.yml'))).toBe(
    'df337433bfde1768ccbe396326793559f21113aa7c24e37fbd5955c4c29f87be',
  );
});
