/** Read-only numeric diagnostics plus native dynamic test custody. No argv/env. */
import { createHash } from 'node:crypto';
import { availableParallelism, freemem, loadavg, totalmem } from 'node:os';
import { readFileSync, readdirSync } from 'node:fs';
import { relative } from 'node:path';
import { binding, writeJson } from './cycle33-foundation-evidence.mjs';

export function resourceSnapshot() {
  let processes = null,
    resident_bytes = null;
  try {
    const pids = readdirSync('/proc').filter((s) => /^\d+$/.test(s));
    processes = pids.length;
    // Aggregate only memory numbers. Never open cmdline, environ, fd or private files.
    resident_bytes = pids.slice(0, 1024).reduce((n, pid) => {
      try {
        const m = /^VmRSS:\s+(\d+) kB$/m.exec(
          readFileSync(`/proc/${pid}/status`, 'utf8'),
        );
        return n + Number(m?.[1] ?? 0) * 1024;
      } catch {
        return n;
      }
    }, 0);
  } catch {
    /* Non-Linux diagnostics remain explicit null, never guessed. */
  }
  return {
    at_ms: Date.now(),
    cpu_count: availableParallelism(),
    load: loadavg(),
    memory_free: freemem(),
    memory_total: totalmem(),
    processes,
    resident_bytes,
    sampled_process_limit: 1024,
    resident_sample_truncated: processes === null ? null : processes > 1024,
    observer_cpu: process.cpuUsage(),
    observer_memory: process.memoryUsage(),
  };
}
export function classifyErrors(errors = []) {
  return errors.map((error) => {
    const message = typeof error.message === 'string' ? error.message : '';
    const timeout = /^Test timed out in ([0-9]{1,9})ms\./.exec(message);
    return {
      class: [
        'Error',
        'AssertionError',
        'TimeoutError',
        'TypeError',
        'RangeError',
      ].includes(error.name)
        ? error.name
        : 'UNCLASSIFIED',
      classification: timeout
        ? 'EXPLICIT_TEST_TIMEOUT'
        : error.name === 'AssertionError'
          ? 'ASSERTION_FAILURE'
          : 'OTHER_RECORDED_ERROR',
      timeout_ms: timeout ? Number(timeout[1]) : null,
      message_sha256: createHash('sha256').update(message).digest('hex'),
    };
  });
}
const key = (m) => relative(process.cwd(), m.moduleId).replaceAll('\\', '/');
function row(test, fallback) {
  const names = [test.name];
  let parent = test.parent;
  while (parent.type !== 'module') {
    names.unshift(parent.name);
    parent = parent.parent;
  }
  const diagnostic = test.diagnostic();
  return {
    id: test.id,
    fullName: test.fullName,
    jsonName: names.join(' '),
    mode: test.options.mode ?? 'run',
    timeout: test.options.timeout ?? fallback,
    status: test.result().state,
    retry: diagnostic?.retryCount ?? 0,
    repeat: diagnostic?.repeatCount ?? 0,
    errors: test.result().errors?.length ?? 0,
    error_evidence: classifyErrors(test.result().errors),
    duration_ms: diagnostic?.duration ?? null,
  };
}
export default class FoundationReporter {
  onInit(ctx) {
    this.ctx = ctx;
    this.prefix = `artifacts/foundation/application-${ctx.config.shard.index}`;
    this.data = {
      schema: 'propel-foundation-runtime-v1',
      binding: binding(),
      reason: 'NOT_TERMINAL',
      errors: null,
      config: {
        testTimeout: ctx.config.testTimeout,
        hookTimeout: ctx.config.hookTimeout,
        maxWorkers: ctx.config.maxWorkers,
        retry: ctx.config.retry ?? 0,
        shard: ctx.config.shard,
      },
      modules: [],
      samples: [resourceSnapshot()],
    };
    this.save();
  }
  save() {
    writeJson(this.prefix + '/observations.json', this.data);
  }
  onTestModuleCollected(module) {
    this.data.modules.push({
      file: key(module),
      collected_at_ms: Date.now(),
      collected: [...module.children.allTests()].map((t) =>
        row(t, this.ctx.config.testTimeout),
      ),
      results: [],
      ended: false,
      errors: null,
    });
    this.data.samples.push(resourceSnapshot());
    this.save();
  }
  onTestCaseResult(test) {
    if (test.result().state !== 'failed') return;
    const record = this.data.modules.find((m) => m.file === key(test.module));
    if (!record) throw Error('Missing original failure collection');
    record.failed_cases ??= [];
    record.failed_cases.push(row(test, this.ctx.config.testTimeout));
    this.save();
  }
  onTestModuleEnd(module) {
    const record = this.data.modules.find((m) => m.file === key(module));
    if (!record) throw Error('Missing original native collection');
    record.results = [...module.children.allTests()].map((t) =>
      row(t, this.ctx.config.testTimeout),
    );
    record.ended = true;
    record.errors = module.errors().length;
    record.ended_at_ms = Date.now();
    this.save();
  }
  onTestRunEnd(modules, errors, reason) {
    this.data.reason = reason;
    this.data.errors = errors.length;
    this.data.samples.push(resourceSnapshot());
    this.save();
  }
}
