// Test-process observer only. No browser hooks, application writes or retries.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { cpus, platform, release, totalmem } from 'node:os';
import { execFileSync } from 'node:child_process';
import { monitorEventLoopDelay } from 'node:perf_hooks';

export function summarizeTiming(test) {
  const steps = test.steps ?? [];
  const final = steps.filter(
    (s) =>
      s.title.includes('Open exact owner priority review') ||
      (s.title === 'Click' && s.line === 529),
  );
  return {
    project: test.project,
    status: test.status,
    duration_ms: test.duration_ms,
    budget_ms: test.budget_ms,
    final_navigation: final,
    slow_steps: steps
      .filter((s) => s.duration_ms >= 100)
      .sort((a, b) => b.duration_ms - a.duration_ms)
      .slice(0, 25),
    // A missing or incomplete observation never establishes application failure.
    attribution: 'UNRESOLVED_REQUIRES_SOURCE_AND_TRACE_REVIEW',
  };
}
export default class TimingReporter {
  rows = new Map();
  delay = monitorEventLoopDelay({ resolution: 20 });
  onBegin(config) {
    this.delay.enable();
    this.config = {
      workers: config.workers,
      config_file: config.configFile,
      version: config.version,
    };
    const hash = (p) =>
      createHash('sha256').update(readFileSync(p)).digest('hex');
    this.environment = {
      source_sha: execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim(),
      config_sha256: hash(config.configFile),
      test_sha256: hash('tests/browser/cycle21-canonical-corrections.spec.ts'),
      lock_sha256: hash('package-lock.json'),
      node: process.version,
      platform: platform(),
      release: release(),
      cpu_count: cpus().length,
      cpu_model: cpus()[0]?.model,
      total_memory_bytes: totalmem(),
      diagnostic_only: true,
      browser_or_application_injection: false,
    };
  }
  onTestBegin(test, result) {
    this.rows.set(result, {
      project: test.parent.project().name,
      title: test.title,
      budget_ms: test.timeout,
      retry: result.retry,
      steps: [],
    });
  }
  onStepEnd(_test, result, step) {
    this.rows.get(result)?.steps.push({
      title: step.title,
      category: step.category,
      start_ms: step.startTime.getTime() - result.startTime.getTime(),
      duration_ms: step.duration,
      line: step.location?.line,
      error: !!step.error,
    });
  }
  onTestEnd(_test, result) {
    Object.assign(this.rows.get(result), {
      status: result.status,
      duration_ms: result.duration,
    });
  }
  onEnd(result) {
    this.delay.disable();
    const tests = [...this.rows.values()];
    const output = resolve(
      process.env.CYCLE30_TIMING_OUTPUT ?? 'artifacts/cycle30/timing.json',
    );
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(
      output,
      JSON.stringify(
        {
          environment: this.environment,
          config: this.config,
          status: result.status,
          test_process_event_loop_ms: {
            mean: this.delay.mean / 1e6,
            max: this.delay.max / 1e6,
            p99: this.delay.percentile(99) / 1e6,
          },
          tests,
          summaries: tests.map(summarizeTiming),
        },
        null,
        2,
      ),
    );
  }
  printsToStdio() {
    return false;
  }
}
