import { expect, it } from 'vitest';
import {
  readFileSync,
  lstatSync,
  readdirSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir, devNull } from 'node:os';
import { join, dirname } from 'node:path';
import {
  qualify,
  verifyInputs,
  classifyFrame,
  parseMode,
  // @ts-expect-error Build-time qualification JavaScript has no declaration file.
} from '../../proposals/performance424-context/qualify.mjs';
import {
  selectCase,
  verifyMeasurementSetup,
  // @ts-expect-error Build-time measurement JavaScript has no declaration file.
} from '../../proposals/performance424-context/measure.mjs';
import {
  targetCases,
  regressionPlan,
  // @ts-expect-error Build-time regression JavaScript has no declaration file.
} from '../../proposals/performance424-context/regress.mjs';
const original = (...a: string[]) =>
  execFileSync('git', ['--no-replace-objects', ...a], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
it('qualifies unchanged391 guard proposals against actual424 while keeping every admission flag false', async () => {
  expect(await qualify()).toMatchObject({
    context: '27300dbaff877d18ecb219a2c9000c96e7c3e8c8',
    sourceAuthor: 'c50ce4521fbc264276734a9f8909b525c9a7c2f8',
    cycle9: 'PASS',
    cycle24Critical: 5,
    unknownRuntime: 'DENIED',
    unrelatedRuntime: 'DENIED',
    helperMutantsDenied: 4,
    canonicalChanges: false,
    admissionAuthorized: false,
    integrationAuthorized: false,
  });
});
it('reuses actual authored runtime and separate immutable patches without regenerating their algorithms', () => {
  const r = verifyInputs();
  expect(hash(r.authored)).toBe(
    'a789309d7f8710f2e3150f4cbc8f8acc5aee9c99633c7611e503db089bcd2544',
  );
  for (const name of ['helper', 'cycle9', 'cycle24'])
    expect(r.patches[name]).toEqual(
      original(
        'show',
        '608ce8b7071a555440bf1f7dccfddec9473c661a:proposals/operating-signature-admission/' +
          name +
          '.patch',
      ),
    );
});
it.each([
  'context',
  'optimizationAuthor',
  'separateApprovalPatches',
  'admissionAuthorized',
  'integrationAuthorized',
])(
  'denies rebound %s metadata before inspecting source or executing code',
  (field) => {
    const evidence = JSON.parse(
      readFileSync('proposals/performance424-context/evidence.json', 'utf8'),
    );
    evidence[field] = field.endsWith('Authorized') ? true : 'UNKNOWN';
    let reads = 0;
    expect(() =>
      verifyInputs({
        evidence,
        original: () => {
          reads++;
          throw Error('Should not inspect');
        },
      }),
    ).toThrow('Exact current context required');
    expect(reads).toBe(0);
  },
);
it.each(['helper', 'cycle9', 'cycle24'])(
  'rejects unknown %s patch bytes before they can be applied or imported',
  (name) => {
    expect(() =>
      verifyInputs({
        original: (...a: string[]) =>
          a.some((x) => x.endsWith('/' + name + '.patch'))
            ? Buffer.from("throw Error('UNREVIEWED_EXECUTED');")
            : original(...a),
      }),
    ).toThrow('Exact reviewed separate patch required');
  },
);
it('allows only exact fixed case selectors, without invoking selector coercion hooks', () => {
  expect(selectCase('c25-concurrent').total).toBe(31);
  expect(selectCase('c28-sibling').total).toBe(19);
  let calls = 0;
  const value = {
    toString: () => {
      calls++;
      return 'c25-concurrent';
    },
  };
  for (const selector of [value, 'all', '--shard=2/8', undefined])
    expect(() => selectCase(selector)).toThrow(
      'Exact one of two measurement cases required',
    );
  expect(calls).toBe(0);
});
it('classifies only complete exact BEFORE or AFTER frames and rejects mixed or unknown substitutes', () => {
  const before = classifyFrame();
  expect(['BEFORE', 'AFTER']).toContain(before.kind);
  const old = (p: string) =>
    original('show', '27300dbaff877d18ecb219a2c9000c96e7c3e8c8:' + p);
  const fresh = verifyInputs();
  const mini = mkdtempSync(join(tmpdir(), 'propel-performance424-frame-test-'));
  try {
    for (const path of [
      'scripts/check-cycle9-integrity.mjs',
      'scripts/check-cycle24.mjs',
    ]) {
      const file = join(mini, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, old(path));
    }
    const runtime = join(mini, 'src/lib/workflows/operating-center-runtime.ts');
    mkdirSync(dirname(runtime), { recursive: true });
    writeFileSync(runtime, fresh.authored);
    for (const name of ['helper', 'cycle9', 'cycle24'])
      execFileSync('git', ['apply', '-'], {
        cwd: mini,
        env: {
          PATH: process.env.PATH,
          LC_ALL: 'C',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_SYSTEM: devNull,
          GIT_CONFIG_GLOBAL: devNull,
        },
        input: fresh.patches[name],
        stdio: 'pipe',
      });
    expect(
      classifyFrame({
        read: (p: string) => readFileSync(join(mini, p)),
        stat: (p: string) => lstatSync(join(mini, p)),
      }).kind,
    ).toBe('AFTER');
  } finally {
    rmSync(mini, { recursive: true, force: true });
  }
  const helper = 'scripts/operating-source-signature-admission.mjs';
  const fakeStat = (p: string) =>
    p === helper
      ? { isFile: () => true, isSymbolicLink: () => false, mode: 0o100644 }
      : lstatSync(p);
  expect(() =>
    classifyFrame({
      stat: fakeStat,
      read: (p: string) => (p === helper ? fresh.helper : old(p)),
    }),
  ).toThrow('Exact complete BEFORE or AFTER');
  expect(() =>
    classifyFrame({
      read: (p: string) =>
        p === 'src/lib/workflows/operating-center-runtime.ts'
          ? Buffer.from('UNKNOWN')
          : readFileSync(p),
    }),
  ).toThrow('Exact complete BEFORE or AFTER');
});
it('rejects altered or symlinked measurement setup before it can be imported', () => {
  expect(verifyMeasurementSetup()).toEqual(
    readFileSync('proposals/performance424-context/inputs.fixture.ts'),
  );
  expect(() =>
    verifyMeasurementSetup({
      read: () => Buffer.from("throw Error('UNREVIEWED_EXECUTED');"),
    }),
  ).toThrow('Reviewed measurement setup required');
  expect(() =>
    verifyMeasurementSetup({
      stat: () => ({
        isSymbolicLink: () => true,
        isFile: () => true,
        mode: 0o100644,
      }),
    }),
  ).toThrow('Reviewed measurement setup required');
});
it('rejects unknown CLI modes instead of silently running the default qualifier', () => {
  expect(parseMode()).toBe('critical');
  expect(parseMode('full')).toBe('full');
  for (const mode of ['FULL', 'unknown', {}, true])
    expect(() => parseMode(mode)).toThrow(
      'Exact critical or full mode required',
    );
});
it('removes its disposable candidate even when terminal source validation fails', async () => {
  const prefix = 'propel-performance424-' + process.pid + '-';
  const before = readdirSync(tmpdir()).filter((p) => p.startsWith(prefix));
  const source = classifyFrame();
  const expectedReads = [...source.snapshots.values()].filter(
    (v) => v !== null,
  ).length;
  let reads = 0;
  await expect(
    qualify({
      framePorts: {
        read: (p: string) =>
          ++reads > expectedReads
            ? Buffer.from('LATE_UNKNOWN')
            : readFileSync(p),
      },
    }),
  ).rejects.toThrow('Exact complete BEFORE or AFTER frame required');
  expect(readdirSync(tmpdir()).filter((p) => p.startsWith(prefix))).toEqual(
    before,
  );
});

it('binds exact captured hosted cases and native describe selectors without allowing a zero or broadened selection', () => {
  const target = targetCases(),
    plan = regressionPlan();
  expect(target.failures).toHaveLength(10);
  expect(plan.expected).toHaveLength(10);
  const regex = new RegExp(plan.pattern);
  for (const t of target.failures) {
    const native = [t.describe, t.title].filter(Boolean).join(' > ');
    expect(regex.test(native)).toBe(true);
    expect(regex.test('foreign > ' + native)).toBe(false);
    if (t.describe) expect(regex.test(t.title)).toBe(false);
  }
  expect(() => targetCases(Buffer.from('{}'))).toThrow(
    'Exact captured hosted ten required',
  );
});
