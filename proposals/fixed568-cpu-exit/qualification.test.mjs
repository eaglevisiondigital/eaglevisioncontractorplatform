import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const source = JSON.parse(
  readFileSync(new URL('./source.json', import.meta.url)),
);
const proposed = readFileSync(
  new URL('./observer.proposed.mjs', import.meta.url),
  'utf8',
);
const workflow = readFileSync(
  new URL(
    '../../.github/workflows/foundation537-isolated-unit-candidate.yml',
    import.meta.url,
  ),
  'utf8',
);
const marker =
  '          cat > "$DIAGNOSTIC_DIR/observer.mjs" <<\'CPU_OBSERVER\'\n';
const begin = workflow.indexOf(marker) + marker.length,
  end = workflow.indexOf('          CPU_OBSERVER', begin);
assert.ok(begin >= marker.length && end > begin);
const original =
  workflow
    .slice(begin, end)
    .split('\n')
    .filter((_, i, a) => i < a.length - 1)
    .map((l) => (l ? l.slice(10) : ''))
    .join('\n') + '\n';
assert.equal(sha(original), source.beforeObserver);
assert.equal(sha(proposed), source.afterObserver);
const old = await import(
  'data:text/javascript;base64,' + Buffer.from(original).toString('base64')
);
const next = await import(
  'data:text/javascript;base64,' + Buffer.from(proposed).toString('base64')
);
const root = 900001,
  child = 900002;
assert.notEqual(process.pid, root);
assert.notEqual(process.pid, child);
function stat(pid = root, fields = {}) {
  const v = Array(50).fill('0');
  Object.assign(v, {
    0: 'R',
    1: '1',
    11: '5',
    12: '6',
    13: '3',
    14: '4',
    17: '1',
    19: '100',
    22: '18446744073709551615',
  });
  for (const [k, value] of Object.entries(fields)) v[Number(k) - 3] = value;
  return pid + ' (FICTIONAL )\nname) ' + v.join(' ') + '\n';
}
const dead = (pid = root, state = 'Z') =>
  stat(pid, { 3: state, 4: '0', 5: '-1', 6: '-1', 20: '0' });
function status(pid, ppid) {
  return (
    'Name:\tFICTIONAL\nState:\tR\nTgid:\t' +
    pid +
    '\nPid:\t' +
    pid +
    '\nPPid:\t' +
    ppid +
    '\nThreads:\t1\nvoluntary_ctxt_switches:\t7\nnonvoluntary_ctxt_switches:\t8\n'
  );
}
const code = (fn, expected) =>
  assert.throws(fn, (e) => e.code === expected && e.message === expected);
for (const state of ['Z', 'X', 'x'])
  test('negative-first: original rejects kernel exit shape ' + state, () =>
    code(() => old.parseStat(dead(root, state), root, 100), 'STAT_INVALID'),
  );
for (const state of ['Z', 'X', 'x'])
  test(
    'proposed parses exit shape without leaking discarded fields ' + state,
    () => {
      const row = next.parseStat(dead(root, state), root, 100);
      assert.equal(row.exited, true);
      assert.equal(row.threadCount, 0);
      assert.equal(row.ppid, 0);
      assert.ok(Object.isFrozen(row));
      assert.ok(!JSON.stringify(row).includes('FICTIONAL'));
      assert.ok(!Object.hasOwn(row, 'comm'));
      assert.ok(!Object.hasOwn(row, 'session'));
    },
  );
test('live selected counters and raw own/reaped separation stay byte-equivalent', () =>
  assert.deepEqual(
    next.parseStat(stat(), root, 100),
    old.parseStat(stat(), root, 100),
  ));
for (const state of ['R', 'S', 'D', 'T', 't', 'P', 'I'])
  test('zero threads remain denied for live state ' + state, () =>
    code(
      () => next.parseStat(stat(root, { 3: state, 20: '0' }), root, 100),
      'THREAD_LIMIT',
    ),
  );
for (const [name, text, pid, start, expected] of [
  ['missing', '', root, 100, 'STAT_INVALID'],
  ['truncated', stat().slice(0, -1), root, 100, 'STAT_INVALID'],
  ['reused pid', dead(child), root, 100, 'PID_IDENTITY_CHANGED'],
  ['reused start', dead(), root, 101, 'PID_IDENTITY_CHANGED'],
  [
    'unsafe counter',
    stat(root, { 14: '9007199254740992' }),
    root,
    100,
    'STAT_INVALID',
  ],
  ['negative CPU', stat(root, { 16: '-1' }), root, 100, 'STAT_INVALID'],
  ['negative parent', stat(root, { 4: '-1' }), root, 100, 'STAT_INVALID'],
  ['thread limit', stat(root, { 20: '129' }), root, 100, 'THREAD_LIMIT'],
])
  test('preserved denial: ' + name, () =>
    code(() => next.parseStat(text, pid, start), expected),
  );
test('original selected-counter monotonicity still applies', () => {
  const row = {
    ...next.parseStat(stat(), root, 100),
    voluntarySwitches: 7,
    involuntarySwitches: 8,
  };
  code(
    () => next.assertCounterProgress(row, { ...row, userTicks: 4 }),
    'COUNTER_REGRESSION',
  );
  code(
    () => next.assertCounterProgress(row, { ...row, startTicks: 101 }),
    'PID_IDENTITY_CHANGED',
  );
});
let harnessSerial = 0;
async function captureHarness(body, options = {}) {
  const events = [],
    fds = new Map(),
    opens = new Map();
  let fd = 0;
  const paths = new Map([
    ['/proc/' + root + '/stat', options.rootStats || [stat()]],
    ['/proc/' + root + '/status', [status(root, 1)]],
    ['/proc/' + root + '/task/' + root + '/children', [String(child)]],
    [
      '/proc/' + child + '/stat',
      options.childStats || [stat(child, { 4: String(root), 22: '101' })],
    ],
    ['/proc/' + child + '/status', [status(child, root)]],
    ['/proc/' + child + '/task/' + child + '/children', ['']],
  ]);
  const ports = {
    constants: { O_RDONLY: 0, O_NOFOLLOW: 1 },
    openSync(path, flags) {
      assert.equal(flags, 1);
      events.push(['open', path]);
      assert.ok(paths.has(path), 'only scoped numeric fixture paths');
      const values = paths.get(path),
        n = opens.get(path) || 0;
      opens.set(path, n + 1);
      const value = values[Math.min(n, values.length - 1)];
      if (value instanceof Error) throw value;
      const id = ++fd;
      fds.set(id, { bytes: Buffer.from(value), offset: 0 });
      return id;
    },
    readSync(id, bytes, offset, length, position) {
      assert.equal(position, null);
      const item = fds.get(id);
      assert.ok(item);
      const n = item.bytes.copy(
        bytes,
        offset,
        item.offset,
        item.offset + length,
      );
      item.offset += n;
      return n;
    },
    closeSync(id) {
      assert.ok(fds.delete(id));
    },
    opendirSync(path) {
      events.push(['directory', path]);
      const pid =
        path === '/proc/' + root + '/task'
          ? root
          : path === '/proc/' + child + '/task'
            ? child
            : null;
      assert.ok(pid);
      let sent = false;
      return {
        readSync() {
          if (sent) return null;
          sent = true;
          return { name: String(pid), isDirectory: () => true };
        },
        closeSync() {},
      };
    },
  };
  const key = '__fixed568NumericFixture' + ++harnessSerial;
  globalThis[key] = Object.freeze(ports);
  const fsImport = /import \{[\s\S]*?\} from 'node:fs';/;
  assert.equal(
    body.match(fsImport)?.[0],
    original.match(fsImport)?.[0],
    'exact original fs import only',
  );
  const bound =
    body.replace(
      fsImport,
      'const {constants,openSync,closeSync,readSync,writeSync,fsyncSync,fstatSync,lstatSync,realpathSync,opendirSync}=globalThis[' +
        JSON.stringify(key) +
        '];',
    ) + '\nexport {captureTree};\n';
  const module = await import(
    'data:text/javascript;base64,' + Buffer.from(bound).toString('base64')
  );
  return {
    run(previous = new Map()) {
      try {
        return module.captureTree(root, 100, previous, () => {});
      } finally {
        assert.equal(fds.size, 0);
        delete globalThis[key];
      }
    },
    events,
  };
}
test('controlled live tree retains only pinned root and child numeric rows', async () => {
  const h = await captureHarness(proposed);
  const r = h.run();
  assert.equal(r.partial, false);
  assert.deepEqual([...r.rows.keys()], [root, child]);
  assert.equal(r.rows.get(child).ppid, root);
});
test('negative-first: unchanged capture rejects exited child shape', async () => {
  const h = await captureHarness(original, { childStats: [dead(child)] });
  code(() => h.run(), 'STAT_INVALID');
});
test('exited child at first read is partial, never visited or counted', async () => {
  const h = await captureHarness(proposed, { childStats: [dead(child)] });
  const r = h.run();
  assert.equal(r.partial, true);
  assert.deepEqual([...r.rows.keys()], [root]);
  assert.ok(
    !h.events.some(
      ([, p]) =>
        p === '/proc/' + child + '/status' || p === '/proc/' + child + '/task',
    ),
  );
});
test('child exit at final stat withdraws its row', async () => {
  const h = await captureHarness(proposed, {
    childStats: [stat(child, { 4: String(root), 22: '100' }), dead(child)],
  });
  const r = h.run();
  assert.equal(r.partial, true);
  assert.deepEqual([...r.rows.keys()], [root]);
});
for (const err of ['ENOENT', 'ESRCH'])
  test('missing child ' + err + ' remains partial without retry', async () => {
    const error = Object.assign(new Error(err), { code: err });
    const h = await captureHarness(proposed, { childStats: [error] });
    const r = h.run();
    assert.equal(r.partial, true);
    assert.deepEqual([...r.rows.keys()], [root]);
    assert.equal(
      h.events.filter(([, p]) => p === '/proc/' + child + '/stat').length,
      1,
    );
  });
test('exited root stops through original ROOT_GONE channel', async () => {
  const h = await captureHarness(proposed, { rootStats: [dead()] });
  code(() => h.run(), 'ROOT_GONE');
});
test('root exit at final probe stops through original ROOT_GONE channel', async () => {
  const h = await captureHarness(proposed, {
    rootStats: [stat(), stat(), dead()],
  });
  code(() => h.run(), 'ROOT_GONE');
});
test('missing root stays ROOT_GONE', async () => {
  const h = await captureHarness(proposed, {
    rootStats: [Object.assign(new Error('ENOENT'), { code: 'ENOENT' })],
  });
  code(() => h.run(), 'ROOT_GONE');
});
test('reused root identity is fatal rather than classified as exit', async () => {
  const h = await captureHarness(proposed, {
    rootStats: [stat(root, { 22: '101' })],
  });
  code(() => h.run(), 'ROOT_IDENTITY_CHANGED');
});
test('reused descendant identity is fatal rather than omitted as exited', async () => {
  const prior = next.parseStat(
    stat(child, { 4: String(root), 22: '101' }),
    child,
  );
  const h = await captureHarness(proposed, { childStats: [dead(child)] });
  code(() => h.run(new Map([[child, prior]])), 'DESCENDANT_IDENTITY_CHANGED');
});
test('malformed descendant remains fatal, never an exit fallback', async () => {
  const h = await captureHarness(proposed, {
    childStats: ['PRIVATE_NOT_A_STAT'],
  });
  code(() => h.run(), 'STAT_INVALID');
  assert.equal(
    h.events.filter(([, p]) => p === '/proc/' + child + '/stat').length,
    1,
  );
});
test('reparented live discovery never expands the process scope', async () => {
  const h = await captureHarness(proposed, {
    childStats: [stat(child, { 4: '42', 22: '101' })],
  });
  const r = h.run();
  assert.equal(r.partial, true);
  assert.deepEqual([...r.rows.keys()], [root]);
  assert.ok(!h.events.some(([, p]) => p.includes('/42/')));
});
test('workflow unit command, exit precedence, limits and all nonobserver bytes are retained', () => {
  const patch = JSON.parse(
    readFileSync(new URL('./observer.patch.json', import.meta.url), 'utf8'),
  ).patch;
  assert.equal(sha(patch), source.patchSha256);
  const expectedWorkflow =
    workflow.slice(0, begin) +
    proposed
      .split('\n')
      .slice(0, -1)
      .map((l) => (l ? '          ' + l : ''))
      .join('\n') +
    '\n' +
    workflow.slice(end);
  assert.equal(
    sha(expectedWorkflow),
    source.paths['.github/workflows/foundation537-isolated-unit-candidate.yml']
      .after,
  );
  for (const marker of [
    'wait "$unit_pid"',
    'wait "$observer_pid"',
    'if [ "$unit_status" -ne 0 ]',
    'timeout-minutes: 45',
    '--maxWorkers',
  ])
    assert.equal(
      expectedWorkflow.split(marker).length,
      workflow.split(marker).length,
    );
  assert.ok(!patch.includes('run-fixed568-unit-supplement\n'));
});
