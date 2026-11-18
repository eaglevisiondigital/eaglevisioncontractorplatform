import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const reviewedObserverSHA256 =
  '1ba1ff514b60abaef520fe91853529ef8115a3335da4d45874e065c1d1dae873';
function extractObserver(workflow) {
  const fail = () => {
    throw Error('Exact reviewed CPU observer required');
  };
  if (typeof workflow !== 'string' || Buffer.byteLength(workflow) > 262144)
    fail();
  const lines = workflow.split('\n');
  const starts = lines.flatMap((line, i) =>
    /^ {10}cat > "\$DIAGNOSTIC_DIR\/[A-Za-z0-9._-]+" <<'CPU_OBSERVER'$/.test(
      line,
    )
      ? [i]
      : [],
  );
  const ends = lines.flatMap((line, i) =>
    line === '          CPU_OBSERVER' ? [i] : [],
  );
  if (starts.length !== 1 || ends.length !== 1 || ends[0] <= starts[0]) fail();
  const body =
    lines
      .slice(starts[0] + 1, ends[0])
      .map((line) => {
        if (line === '') return '';
        if (!line.startsWith('          ')) fail();
        return line.slice(10);
      })
      .join('\n') + '\n';
  if (
    createHash('sha256').update(body).digest('hex') !== reviewedObserverSHA256
  )
    fail();
  return body;
}
const workflow = readFileSync(
  new URL(
    '../.github/workflows/foundation537-isolated-unit-candidate.yml',
    import.meta.url,
  ),
  'utf8',
);
const observerBody = extractObserver(workflow);
const {
  parsePidArgument,
  parseStat,
  parseStatus,
  parseChildren,
  assertCounterProgress,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(observerBody).toString('base64')
);

function statText({
  pid = 123,
  comm = 'PRIVATE (name) ) with spaces',
  fields = {},
} = {}) {
  const values = Array(50).fill('0');
  values[0] = 'R';
  values[1] = '1';
  values[11] = '5';
  values[12] = '6';
  values[13] = '3';
  values[14] = '4';
  values[17] = '1';
  values[19] = '100';
  values[22] = '18446744073709551615'; // Unselected normal RLIM_INFINITY.
  for (const [number, value] of Object.entries(fields))
    values[Number(number) - 3] = value;
  return `${pid} (${comm}) ${values.join(' ')}\n`;
}

function statusText(fields = {}) {
  const values = {
    Name: 'PRIVATE_USER_AND_COMMAND',
    State: 'R (running)',
    Tgid: '123',
    Pid: '123',
    PPid: '1',
    Uid: '1000\t1000\t1000\t1000',
    Threads: '1',
    voluntary_ctxt_switches: '7',
    nonvoluntary_ctxt_switches: '8',
    ...fields,
  };
  return Object.entries(values)
    .map(([key, value]) => `${key}:\t${value}\n`)
    .join('');
}

const denies = (fn, code) =>
  assert.throws(fn, (error) => error.code === code && error.message === code);

// Negative-first: unsupported CLI forms must never become a proc path.
for (const value of [
  '',
  '0',
  '-1',
  '+1',
  '01',
  '1.0',
  '1e3',
  ' 1',
  '1\n',
  '../1',
  '2147483648',
  '9007199254740993',
  123,
  undefined,
])
  test(`rejects noncanonical PID ${JSON.stringify(value)}`, () =>
    denies(() => parsePidArgument(value), 'PID_INVALID'));

test('rejects malformed or truncated stat without exposing comm', () => {
  for (const value of [
    statText().slice(0, -1),
    statText().replace(') R ', ') ? '),
    statText().replace(/ 0\n$/, '\n'),
    statText() + '0\n',
    statText().replace('123 (', '0123 ('),
    statText().replace('123 (', '123 ['),
    statText({ fields: { 10: '+1' } }),
    statText({ fields: { 10: '01' } }),
    statText({ fields: { 10: '-1' } }),
    statText({ fields: { 10: '18446744073709551616' } }),
    statText({ comm: 'PRIVATE\0SECRET' }),
  ])
    denies(() => parseStat(value, 123), 'STAT_INVALID');
});

test('PID and starttick identity reuse is rejected', () => {
  denies(() => parseStat(statText({ pid: 124 }), 123), 'PID_IDENTITY_CHANGED');
  denies(
    () => parseStat(statText({ fields: { 22: '101' } }), 123, 100),
    'PID_IDENTITY_CHANGED',
  );
  denies(
    () => parseStat(statText({ fields: { 22: '99' } }), 123, 100),
    'PID_IDENTITY_CHANGED',
  );
});

test('all emitted counters reject unsafe or negative values including reaped children', () => {
  for (const field of [4, 14, 15, 16, 17, 22]) {
    denies(
      () =>
        parseStat(statText({ fields: { [field]: '9007199254740992' } }), 123),
      'STAT_INVALID',
    );
    denies(
      () => parseStat(statText({ fields: { [field]: '-1' } }), 123),
      'STAT_INVALID',
    );
  }
});

test('thread bounds are checked in stat and status', () => {
  for (const threads of ['0', '129'])
    denies(
      () => parseStat(statText({ fields: { 20: threads } }), 123),
      'THREAD_LIMIT',
    );
  denies(
    () => parseStatus(statusText({ Threads: '129' }), 123),
    'THREAD_LIMIT',
  );
  denies(
    () => parseStatus(statusText({ Threads: '0' }), 123),
    'STATUS_INVALID',
  );
});

test('status identity, duplicates, absence, malformed rows and unsafe counters deny', () => {
  denies(
    () => parseStatus(statusText({ Tgid: '124' }), 123),
    'PID_IDENTITY_CHANGED',
  );
  denies(
    () => parseStatus(statusText({ Pid: '124' }), 123),
    'PID_IDENTITY_CHANGED',
  );
  for (const value of [
    statusText() + 'Pid:\t123\n',
    statusText().replace('Pid:\t123\n', ''),
    statusText() + 'NO_COLON\n',
    statusText().slice(0, -1),
    statusText({ voluntary_ctxt_switches: '-1' }),
    statusText({ nonvoluntary_ctxt_switches: '9007199254740992' }),
    statusText({ PPid: '2147483648' }),
    statusText({ Name: 'PRIVATE\0SECRET' }),
  ])
    denies(() => parseStatus(value, 123), 'STATUS_INVALID');
});

test('children reject duplicates, traversal, noncanonical and out-of-range tokens', () => {
  for (const value of [
    '1 1',
    '0',
    '-1',
    '01',
    '1.0',
    '../2',
    '9007199254740992',
    '2 PRIVATE',
    '2\r3',
    '2\u001b3',
  ])
    denies(() => parseChildren(value), 'CHILDREN_INVALID');
  denies(
    () => parseChildren(Array.from({ length: 129 }, (_, i) => i + 1).join(' ')),
    'PROCESS_LIMIT',
  );
});

test('all pure parsers enforce bounded raw reads and fixed redacted failures', () => {
  const oversized = Buffer.alloc(65537, 65);
  for (const parse of [
    (value) => parseStat(value, 123),
    (value) => parseStatus(value, 123),
    parseChildren,
  ])
    denies(() => parse(oversized), 'READ_LIMIT');
  for (const parse of [
    (value) => parseStat(value, 123),
    (value) => parseStatus(value, 123),
    parseChildren,
  ]) {
    assert.throws(
      () => parse('PRIVATE_SECRET'),
      (error) =>
        !String(error).includes('PRIVATE_SECRET') &&
        !String(error).includes('/proc'),
    );
  }
});

test('same-identity CPU and main-thread context counters cannot regress', () => {
  const prior = {
    ...parseStat(statText(), 123),
    voluntarySwitches: 7,
    involuntarySwitches: 8,
  };
  for (const key of [
    'userTicks',
    'systemTicks',
    'reapedChildUserTicks',
    'reapedChildSystemTicks',
    'voluntarySwitches',
    'involuntarySwitches',
  ]) {
    denies(
      () => assertCounterProgress(prior, { ...prior, [key]: prior[key] - 1 }),
      'COUNTER_REGRESSION',
    );
    denies(
      () =>
        assertCounterProgress(prior, {
          ...prior,
          [key]: Number.MAX_SAFE_INTEGER + 1,
        }),
      'COUNTER_INVALID',
    );
  }
  denies(
    () => assertCounterProgress(prior, { ...prior, startTicks: 101 }),
    'PID_IDENTITY_CHANGED',
  );
  assert.doesNotThrow(() => assertCounterProgress(undefined, prior));
  assert.doesNotThrow(() =>
    assertCounterProgress(prior, {
      ...prior,
      userTicks: 6,
      voluntarySwitches: 10,
    }),
  );
});

test('valid stat discards space/parenthesis/newline comm and all address fields', () => {
  const parsed = parseStat(
    Buffer.from(statText({ comm: 'PRIVATE ) fake ( )\nSECRET' })),
    123,
    100,
  );
  assert.deepEqual(parsed, {
    pid: 123,
    ppid: 1,
    startTicks: 100,
    userTicks: 5,
    systemTicks: 6,
    reapedChildUserTicks: 3,
    reapedChildSystemTicks: 4,
    threadCount: 1,
    exited: false,
  });
  assert.ok(Object.isFrozen(parsed));
  assert.ok(!JSON.stringify(parsed).includes('PRIVATE'));
  assert.ok(!JSON.stringify(parsed).includes('SECRET'));
  assert.ok(!JSON.stringify(parsed).includes('18446744073709551615'));
});

test('raw reaped CPU stays separate from own CPU and is never summed', () => {
  const parsed = parseStat(
    statText({ fields: { 14: '50', 15: '60', 16: '900', 17: '800' } }),
    123,
  );
  assert.equal(parsed.userTicks, 50);
  assert.equal(parsed.systemTicks, 60);
  assert.equal(parsed.reapedChildUserTicks, 900);
  assert.equal(parsed.reapedChildSystemTicks, 800);
  assert.ok(!Object.hasOwn(parsed, 'totalCpu'));
});

test('safe numeric edges and zombie state stay explicit', () => {
  assert.equal(parsePidArgument('2147483647'), 2147483647);
  const parsed = parseStat(
    statText({
      fields: { 14: String(Number.MAX_SAFE_INTEGER), 3: 'Z', 4: '0' },
    }),
    123,
  );
  assert.equal(parsed.userTicks, Number.MAX_SAFE_INTEGER);
  assert.equal(parsed.exited, true);
  assert.equal(parsed.ppid, 0);
});

test('status returns only bounded numeric task counters with names and UIDs discarded', () => {
  const parsed = parseStatus(statusText(), 123);
  assert.deepEqual(parsed, {
    pid: 123,
    ppid: 1,
    threadCount: 1,
    voluntarySwitches: 7,
    involuntarySwitches: 8,
  });
  assert.ok(Object.isFrozen(parsed));
  assert.ok(!JSON.stringify(parsed).includes('PRIVATE'));
  assert.ok(!Object.hasOwn(parsed, 'Uid'));
});

test('children support empty and all128 bounded IDs without a proc override', () => {
  assert.deepEqual(parseChildren(' \t\n'), []);
  const expected = Array.from({ length: 128 }, (_, index) => index + 1);
  const result = parseChildren(expected.join(' ') + ' ');
  assert.deepEqual(result, expected);
  assert.ok(Object.isFrozen(result));
});

// Definition-only integrity controls; never execute the Linux observation loop.
test('loader rejects modified observer bytes before importing them', () => {
  assert.throws(
    () =>
      extractObserver(
        workflow.replace(
          "const PROC_ROOT = '/proc';",
          "const PROC_ROOT = '/unreviewed';",
        ),
      ),
    /Exact reviewed/,
  );
});
test('loader rejects missing or duplicate inline source boundaries', () => {
  assert.throws(
    () => extractObserver(workflow.replace("<<'CPU_OBSERVER'", "<<'OTHER'")),
    /Exact reviewed/,
  );
  assert.throws(
    () => extractObserver(workflow + '\n          CPU_OBSERVER\n'),
    /Exact reviewed/,
  );
});
test('loader rejects unknown oversized definition text', () => {
  assert.throws(() => extractObserver('x'.repeat(262145)), /Exact reviewed/);
});
