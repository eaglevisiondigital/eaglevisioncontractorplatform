import {
  constants,
  openSync,
  closeSync,
  readSync,
  writeSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  realpathSync,
  opendirSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const PROC_ROOT = '/proc';
const MAX_PID = 2147483647;
const MAX_READ = 65536;
const MAX_PROCESSES = 128;
const MAX_THREADS = 128;
const MAX_SAMPLES = 2701;
const MAX_DURATION_MS = 45 * 60 * 1000;
const MAX_OUTPUT = 16 * 1024 * 1024;
const FINAL_RESERVE = 1024;
const OUTPUT_NAME = 'foundation568-process-cpu.jsonl';
const SIGNED_FIELDS = new Set([5, 6, 7, 8, 16, 17, 18, 19, 24, 38, 39, 44, 52]);

function fault(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function inputText(value, code) {
  if (typeof value !== 'string' && !Buffer.isBuffer(value)) throw fault(code);
  const size = Buffer.isBuffer(value) ? value.length : Buffer.byteLength(value);
  if (size > MAX_READ) throw fault('READ_LIMIT');
  const text = Buffer.isBuffer(value) ? value.toString('latin1') : value;
  if (text.includes('\0') || text.includes('\r')) throw fault(code);
  return text;
}

function unsigned(text, maximum, code, minimum = 0) {
  if (!/^(0|[1-9][0-9]*)$/.test(text) || text.length > 20) throw fault(code);
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw fault(code);
  return value;
}

export function parsePidArgument(value) {
  if (typeof value !== 'string') throw fault('PID_INVALID');
  return unsigned(value, MAX_PID, 'PID_INVALID', 1);
}

// The stat comm field may contain spaces and parentheses. It is discarded,
// never returned. Unselected uint64 fields remain strings (e.g. RLIM_INFINITY).
export function parseStat(value, expectedPid, expectedStartTicks) {
  const text = inputText(value, 'STAT_INVALID');
  if (
    !Number.isSafeInteger(expectedPid) ||
    expectedPid < 1 ||
    expectedPid > MAX_PID
  )
    throw fault('STAT_INVALID');
  const first = /^([1-9][0-9]*) \(/.exec(text);
  const end = text.lastIndexOf(') ');
  if (!first || end < first[0].length || !text.endsWith('\n'))
    throw fault('STAT_INVALID');
  const pid = unsigned(first[1], MAX_PID, 'STAT_INVALID', 1);
  if (pid !== expectedPid) throw fault('PID_IDENTITY_CHANGED');
  const fields = text.slice(end + 2, -1).split(' ');
  if (fields.length !== 50 || !/^[RSDZTWtXxKPI]$/.test(fields[0]))
    throw fault('STAT_INVALID');
  for (let index = 1; index < fields.length; index++) {
    const field = index + 3;
    const token = fields[index];
    if (!/^(0|-?[1-9][0-9]*)$/.test(token) || token.length > 20)
      throw fault('STAT_INVALID');
    const number = BigInt(token);
    const signed = SIGNED_FIELDS.has(field);
    if (
      number < (signed ? -(1n << 63n) : 0n) ||
      number > (signed ? (1n << 63n) - 1n : (1n << 64n) - 1n)
    )
      throw fault('STAT_INVALID');
  }
  const at = (field) =>
    unsigned(fields[field - 3], Number.MAX_SAFE_INTEGER, 'STAT_INVALID');
  const ppid = unsigned(fields[1], MAX_PID, 'STAT_INVALID');
  const exited = fields[0] === 'Z' || fields[0] === 'X' || fields[0] === 'x';
  const threadCount = unsigned(
    fields[17],
    MAX_THREADS,
    'THREAD_LIMIT',
    exited ? 0 : 1,
  );
  const startTicks = at(22);
  if (expectedStartTicks !== undefined) {
    if (!Number.isSafeInteger(expectedStartTicks) || expectedStartTicks < 0)
      throw fault('STAT_INVALID');
    if (startTicks !== expectedStartTicks) throw fault('PID_IDENTITY_CHANGED');
  }
  return Object.freeze({
    pid,
    ppid,
    startTicks,
    userTicks: at(14),
    systemTicks: at(15),
    reapedChildUserTicks: at(16),
    reapedChildSystemTicks: at(17),
    threadCount,
    exited,
  });
}

export function parseStatus(value, expectedPid) {
  const text = inputText(value, 'STATUS_INVALID');
  if (
    !Number.isSafeInteger(expectedPid) ||
    expectedPid < 1 ||
    expectedPid > MAX_PID
  )
    throw fault('STATUS_INVALID');
  if (!text.endsWith('\n')) throw fault('STATUS_INVALID');
  const selected = new Map();
  const wanted = new Set([
    'Tgid',
    'Pid',
    'PPid',
    'Threads',
    'voluntary_ctxt_switches',
    'nonvoluntary_ctxt_switches',
  ]);
  for (const line of text.slice(0, -1).split('\n')) {
    const match = /^([A-Za-z][A-Za-z0-9_]*):[ \t]*(.*)$/.exec(line);
    if (!match) throw fault('STATUS_INVALID');
    if (!wanted.has(match[1])) continue;
    if (selected.has(match[1])) throw fault('STATUS_INVALID');
    selected.set(match[1], match[2]);
  }
  if (selected.size !== wanted.size) throw fault('STATUS_INVALID');
  const get = (key, maximum = Number.MAX_SAFE_INTEGER, minimum = 0) =>
    unsigned(selected.get(key), maximum, 'STATUS_INVALID', minimum);
  if (
    get('Pid', MAX_PID, 1) !== expectedPid ||
    get('Tgid', MAX_PID, 1) !== expectedPid
  )
    throw fault('PID_IDENTITY_CHANGED');
  const threads = get('Threads', MAX_PID, 1);
  if (threads > MAX_THREADS) throw fault('THREAD_LIMIT');
  return Object.freeze({
    pid: expectedPid,
    ppid: get('PPid', MAX_PID),
    threadCount: threads,
    voluntarySwitches: get('voluntary_ctxt_switches'),
    involuntarySwitches: get('nonvoluntary_ctxt_switches'),
  });
}

export function parseChildren(value) {
  const text = inputText(value, 'CHILDREN_INVALID');
  if (!/^[0-9 \t\n]*$/.test(text)) throw fault('CHILDREN_INVALID');
  const stripped = text.trim();
  if (!stripped) return Object.freeze([]);
  const tokens = stripped.split(/[ \t\n]+/);
  if (tokens.length > MAX_PROCESSES) throw fault('PROCESS_LIMIT');
  const ids = tokens.map((token) =>
    unsigned(token, MAX_PID, 'CHILDREN_INVALID', 1),
  );
  if (new Set(ids).size !== ids.length) throw fault('CHILDREN_INVALID');
  return Object.freeze(ids);
}

export function assertCounterProgress(previous, current) {
  if (previous === undefined) return;
  if (
    previous.pid !== current.pid ||
    previous.startTicks !== current.startTicks
  )
    throw fault('PID_IDENTITY_CHANGED');
  for (const key of [
    'userTicks',
    'systemTicks',
    'reapedChildUserTicks',
    'reapedChildSystemTicks',
    'voluntarySwitches',
    'involuntarySwitches',
  ]) {
    if (
      !Number.isSafeInteger(previous[key]) ||
      previous[key] < 0 ||
      !Number.isSafeInteger(current[key]) ||
      current[key] < 0
    )
      throw fault('COUNTER_INVALID');
    if (current[key] < previous[key]) throw fault('COUNTER_REGRESSION');
  }
}

function gone(error) {
  return error?.code === 'ENOENT' || error?.code === 'ESRCH';
}

function readBounded(path, budget) {
  budget();
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const bytes = Buffer.alloc(MAX_READ);
    let size = 0;
    while (size < MAX_READ) {
      budget();
      const count = readSync(fd, bytes, size, MAX_READ - size, null);
      if (count === 0) return bytes.subarray(0, size);
      size += count;
    }
    // One-byte overrun probe; every read syscall is at most64KiB.
    const extra = Buffer.alloc(1);
    if (readSync(fd, extra, 0, 1, null) !== 0) throw fault('READ_LIMIT');
    return bytes;
  } finally {
    closeSync(fd);
  }
}

function statFor(pid, startTicks, budget) {
  return parseStat(
    readBounded(`${PROC_ROOT}/${pid}/stat`, budget),
    pid,
    startTicks,
  );
}

function threadIds(pid, budget) {
  budget();
  const directory = opendirSync(`${PROC_ROOT}/${pid}/task`);
  const ids = [];
  try {
    let entry;
    while ((entry = directory.readSync()) !== null) {
      budget();
      if (ids.length === MAX_THREADS) throw fault('THREAD_LIMIT');
      if (!entry.isDirectory()) throw fault('PROC_SHAPE_INVALID');
      ids.push(parsePidArgument(entry.name));
    }
  } finally {
    directory.closeSync();
  }
  return ids;
}

function captureTree(rootPid, rootStart, previous, budget) {
  const queue = [{ pid: rootPid, startTicks: rootStart }];
  const queued = new Set([rootPid]);
  for (const row of previous.values()) {
    if (row.pid === rootPid) continue;
    queue.push({ pid: row.pid, startTicks: row.startTicks });
    queued.add(row.pid);
  }
  const rows = new Map();
  let partial = false;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    budget();
    const item = queue[cursor];
    let first, status, last;
    const children = new Set();
    try {
      first = statFor(item.pid, item.startTicks, budget);
      if (first.exited) {
        if (item.pid === rootPid) throw fault('ROOT_GONE');
        partial = true;
        continue;
      }
      if (
        item.parent !== undefined &&
        (first.ppid !== item.parent || first.startTicks < item.parentStart)
      ) {
        partial = true;
        continue;
      }
      status = parseStatus(
        readBounded(`${PROC_ROOT}/${item.pid}/status`, budget),
        item.pid,
      );
      for (const tid of threadIds(item.pid, budget)) {
        try {
          for (const child of parseChildren(
            readBounded(
              `${PROC_ROOT}/${item.pid}/task/${tid}/children`,
              budget,
            ),
          )) {
            if (!children.has(child) && children.size === MAX_PROCESSES)
              throw fault('PROCESS_LIMIT');
            children.add(child);
          }
        } catch (error) {
          if (!gone(error)) throw error;
          partial = true;
        }
      }
      last = statFor(item.pid, first.startTicks, budget);
      if (last.exited) {
        if (item.pid === rootPid) throw fault('ROOT_GONE');
        partial = true;
        continue;
      }
    } catch (error) {
      if (error.code === 'PID_IDENTITY_CHANGED')
        throw fault(
          item.pid === rootPid
            ? 'ROOT_IDENTITY_CHANGED'
            : 'DESCENDANT_IDENTITY_CHANGED',
        );
      if (gone(error) || error.code === 'ROOT_GONE') {
        if (item.pid === rootPid) throw fault('ROOT_GONE');
        partial = true;
        continue;
      }
      throw error;
    }
    if (status.ppid !== last.ppid) {
      partial = true;
      if (item.pid === rootPid) throw fault('ROOT_SAMPLE_RACE');
      continue;
    }
    const row = Object.freeze({
      pid: last.pid,
      ppid: last.ppid,
      startTicks: last.startTicks,
      userTicks: last.userTicks,
      systemTicks: last.systemTicks,
      reapedChildUserTicks: last.reapedChildUserTicks,
      reapedChildSystemTicks: last.reapedChildSystemTicks,
      voluntarySwitches: status.voluntarySwitches,
      involuntarySwitches: status.involuntarySwitches,
    });
    assertCounterProgress(previous.get(item.pid), row);
    rows.set(item.pid, row);
    for (const child of children) {
      if (child === item.pid || child === rootPid)
        throw fault('PROC_SHAPE_INVALID');
      if (child === process.pid) throw fault('OBSERVER_IN_TREE');
      if (queued.has(child)) continue;
      if (queue.length === MAX_PROCESSES) throw fault('PROCESS_LIMIT');
      const old = previous.get(child);
      queue.push({
        pid: child,
        startTicks: old?.startTicks,
        parent: item.pid,
        parentStart: first.startTicks,
      });
      queued.add(child);
    }
  }
  try {
    if (statFor(rootPid, rootStart, budget).exited) throw fault('ROOT_GONE');
  } catch (error) {
    if (gone(error)) throw fault('ROOT_GONE');
    if (error.code === 'PID_IDENTITY_CHANGED')
      throw fault('ROOT_IDENTITY_CHANGED');
    throw error;
  }
  return { rows, partial };
}

function canonicalDirectory(path) {
  if (
    typeof path !== 'string' ||
    !isAbsolute(path) ||
    resolve(path) !== path ||
    realpathSync(path) !== path
  )
    throw fault('OUTPUT_CONFIG_INVALID');
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw fault('OUTPUT_CONFIG_INVALID');
  return info;
}

function inside(parent, child) {
  const rel = relative(parent, child);
  return (
    rel !== '' && rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel)
  );
}

function outputFile() {
  const temporary = process.env.RUNNER_TEMP;
  const directory = process.env.DIAGNOSTIC_DIR;
  const cwd = resolve(process.cwd());
  const captured = new Map([
    [temporary, canonicalDirectory(temporary)],
    [directory, canonicalDirectory(directory)],
    [cwd, canonicalDirectory(cwd)],
  ]);
  if (
    !inside(temporary, directory) ||
    directory === cwd ||
    inside(cwd, directory) ||
    inside(directory, cwd)
  )
    throw fault('OUTPUT_CONFIG_INVALID');
  const path = join(directory, OUTPUT_NAME);
  const fd = openSync(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  let bytesWritten = 0;
  const check = () => {
    if (process.cwd() !== cwd) throw fault('OUTPUT_CHANGED');
    for (const [name, before] of captured) {
      const now = canonicalDirectory(name);
      if (
        now.dev !== before.dev ||
        now.ino !== before.ino ||
        now.mode !== before.mode
      )
        throw fault('OUTPUT_CHANGED');
    }
    const file = fstatSync(fd),
      current = lstatSync(path);
    if (
      !file.isFile() ||
      current.isSymbolicLink() ||
      current.dev !== file.dev ||
      current.ino !== file.ino ||
      file.nlink !== 1 ||
      (file.mode & 0o7777) !== 0o600 ||
      file.size !== bytesWritten
    )
      throw fault('OUTPUT_CHANGED');
  };
  return {
    write(record, final = false) {
      check();
      const bytes = Buffer.from(JSON.stringify(record) + '\n');
      if (
        bytesWritten + bytes.length >
        MAX_OUTPUT - (final ? 0 : FINAL_RESERVE)
      )
        throw fault('OUTPUT_LIMIT');
      let offset = 0;
      while (offset < bytes.length) {
        const count = writeSync(fd, bytes, offset, bytes.length - offset);
        if (count === 0) throw fault('OUTPUT_FAILED');
        bytesWritten += count;
        offset += count;
      }
    },
    close() {
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    },
  };
}

const FIXED_FAILURES = new Set([
  'READ_LIMIT',
  'STAT_INVALID',
  'STATUS_INVALID',
  'CHILDREN_INVALID',
  'PID_INVALID',
  'PID_IDENTITY_CHANGED',
  'ROOT_IDENTITY_CHANGED',
  'DESCENDANT_IDENTITY_CHANGED',
  'PROCESS_LIMIT',
  'THREAD_LIMIT',
  'PROC_SHAPE_INVALID',
  'ROOT_SAMPLE_RACE',
  'DURATION_LIMIT',
  'CLOCK_INVALID',
  'OUTPUT_CONFIG_INVALID',
  'OUTPUT_CHANGED',
  'OUTPUT_LIMIT',
  'OUTPUT_FAILED',
  'OBSERVER_IN_TREE',
  'COUNTER_INVALID',
  'COUNTER_REGRESSION',
]);

async function observe() {
  if (
    process.platform !== 'linux' ||
    process.versions.node.split('.')[0] !== '24'
  )
    return 1;
  if (process.argv.length !== 3) return 1;
  let output;
  let exitCode = 1,
    status = 'OBSERVER_FAILED',
    samples = 0;
  let cancelled, wake;
  const onTerm = () => {
    cancelled = 'CANCELLED_SIGTERM';
    wake?.();
  };
  const onInt = () => {
    cancelled = 'CANCELLED_SIGINT';
    wake?.();
  };
  try {
    const rootPid = parsePidArgument(process.argv[2]);
    if (rootPid === process.pid) throw fault('PID_INVALID');
    output = outputFile();
    process.on('SIGTERM', onTerm);
    process.on('SIGINT', onInt);
    const started = performance.now(),
      startedUtc = Date.now();
    const budget = () => {
      const elapsed = performance.now() - started;
      if (!Number.isFinite(elapsed) || elapsed < 0)
        throw fault('CLOCK_INVALID');
      if (
        elapsed >= MAX_DURATION_MS ||
        Date.now() - startedUtc >= MAX_DURATION_MS
      )
        throw fault('DURATION_LIMIT');
    };
    let initial;
    try {
      initial = statFor(rootPid, undefined, budget);
    } catch (error) {
      if (gone(error)) throw fault('ROOT_GONE');
      throw error;
    }
    if (initial.exited) throw fault('ROOT_GONE');
    let previous = new Map();
    while (samples < MAX_SAMPLES) {
      if (cancelled) {
        status = cancelled;
        break;
      }
      budget();
      const sampleStarted = performance.now();
      const sampleUtc = new Date().toISOString();
      const captured = captureTree(
        rootPid,
        initial.startTicks,
        previous,
        budget,
      );
      output.write({
        status: captured.partial ? 'PARTIAL_SAMPLE' : 'SAMPLE',
        monotonicMs: sampleStarted,
        utc: sampleUtc,
        processes: [...captured.rows.values()].sort((a, b) => a.pid - b.pid),
      });
      previous = captured.rows;
      samples++;
      if (samples === MAX_SAMPLES) {
        status = 'SAMPLE_LIMIT';
        break;
      }
      await new Promise((done) => {
        const timer = setTimeout(
          done,
          Math.max(0, sampleStarted + 1000 - performance.now()),
        );
        wake = () => {
          clearTimeout(timer);
          done();
        };
        if (cancelled) wake();
      });
      wake = undefined;
    }
  } catch (error) {
    if (error.code === 'ROOT_GONE') {
      status = samples === 0 ? 'ROOT_MISSING_FIRST_SAMPLE' : 'ROOT_EXITED';
      exitCode = samples === 0 ? 1 : 0;
    } else
      status = FIXED_FAILURES.has(error.code) ? error.code : 'PROC_READ_FAILED';
  } finally {
    process.removeListener('SIGTERM', onTerm);
    process.removeListener('SIGINT', onInt);
    if (cancelled) {
      status = cancelled;
      exitCode = cancelled === 'CANCELLED_SIGTERM' ? 143 : 130;
    }
    if (output) {
      try {
        output.write(
          {
            status,
            monotonicMs: performance.now(),
            utc: new Date().toISOString(),
          },
          true,
        );
      } catch {
        exitCode = 1;
      }
      try {
        output.close();
      } catch {
        exitCode = 1;
      }
    }
  }
  return exitCode;
}

// Node24.2+ main detection also handles a CLI symlink without reading source.
// Older runtimes must not silently succeed without starting observation.
if (typeof import.meta.main !== 'boolean') process.exitCode = 1;
else if (import.meta.main) {
  try {
    process.exitCode = await observe();
  } catch {
    process.exitCode = 1;
  }
}
