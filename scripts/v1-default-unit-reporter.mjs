// Incremental test evidence only. Never a business journal or recovery source.
import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

export const unitEvidenceDirectory =
  'artifacts/cycle33/v1-field-intake/default-unit';
export function openUnitEvidence(root = process.cwd()) {
  let directory = root;
  for (const part of unitEvidenceDirectory.split('/')) {
    directory = resolve(directory, part);
    if (existsSync(directory)) {
      if (
        lstatSync(directory).isSymbolicLink() ||
        !lstatSync(directory).isDirectory()
      )
        throw Error('Regular local unit-evidence directory required');
    } else mkdirSync(directory);
  }
  return openSync(
    resolve(directory, 'events.ndjson'),
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_APPEND |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
}
export function errorEvidence(error) {
  return {
    name: String(error?.name ?? 'Error'),
    message: String(error?.message ?? error),
    stack: typeof error?.stack === 'string' ? error.stack : null,
    code: typeof error?.code === 'string' ? error.code : null,
  };
}
export function caseEvidence(test, root) {
  return {
    id: test.id,
    file: relative(root, test.module.moduleId),
    full_name: test.fullName,
    location: test.location ?? null,
    options: test.options,
    result: {
      state: test.result().state,
      errors: (test.result().errors ?? []).map(errorEvidence),
    },
    diagnostic: test.diagnostic() ?? null,
  };
}

export default class DefaultUnitEvidenceReporter {
  constructor(options = {}) {
    this.sink = options.sink;
    this.root = options.root;
    this.sequence = 0;
    this.finished = false;
  }
  write(kind, value) {
    const record = {
      sequence: this.sequence++,
      utc: new Date().toISOString(),
      kind,
      ...value,
      observer: {
        pid: process.pid,
        cpu_microseconds: process.cpuUsage(),
        memory_bytes: process.memoryUsage(),
        resource_usage: process.resourceUsage(),
      },
    };
    if (this.sink) this.sink(record);
    else writeSync(this.fd, JSON.stringify(record) + '\n');
  }
  onInit(context) {
    this.root ??= context.config.root;
    if (!this.sink) {
      // A second execution must not overwrite the first run's partial evidence.
      this.fd = openUnitEvidence();
    }
    const git = (...args) =>
      execFileSync('git', ['--no-replace-objects', ...args], {
        encoding: 'utf8',
      }).trim();
    this.write('observer_start', {
      checkout: git('rev-parse', 'HEAD'),
      tree: git('rev-parse', 'HEAD^{tree}'),
      node: process.version,
      platform: process.platform,
      config: {
        test_timeout: context.config.testTimeout,
        hook_timeout: context.config.hookTimeout,
        max_workers: context.config.maxWorkers,
        configured_retry: context.config.retry ?? null,
        retry: context.config.retry ?? 0,
        retry_origin:
          context.config.retry === undefined
            ? 'PINNED_VITEST_5_0_5_DEFAULT'
            : 'EXPLICIT_CONFIG',
      },
      limits: [
        'Controller-process samples are not worker CPU or event-loop traces.',
        'Partial events never prove a complete collection or passing run.',
        'This reporter changes no assertions, timeouts, workers or retries.',
        'Fixture test evidence is not authentication or operational recovery.',
      ],
    });
  }
  onTestRunStart(specifications) {
    this.write('run_start', {
      specifications: specifications.map((s) => ({
        file: relative(this.root, s.moduleId),
        project: s.project.name,
      })),
    });
  }
  onTestModuleCollected(module) {
    this.write('module_collected', {
      file: relative(this.root, module.moduleId),
      cases: [...module.children.allTests()].map((t) =>
        caseEvidence(t, this.root),
      ),
      errors: module.errors().map(errorEvidence),
    });
  }
  onTestCaseReady(test) {
    this.write('case_ready', { case: caseEvidence(test, this.root) });
  }
  onTestCaseResult(test) {
    // Failure stacks are written now, rather than only at the end of the run.
    this.write('case_result', { case: caseEvidence(test, this.root) });
  }
  onTestModuleEnd(module) {
    this.write('module_end', {
      file: relative(this.root, module.moduleId),
      diagnostic: module.diagnostic(),
      errors: module.errors().map(errorEvidence),
    });
  }
  onTestRunEnd(modules, errors, reason) {
    if (this.finished) throw Error('Duplicate final unit observer outcome');
    this.finished = true;
    const cases = modules.flatMap((m) =>
      [...m.children.allTests()].map((t) => caseEvidence(t, this.root)),
    );
    const record = {
      reason,
      cases,
      unhandled_errors: errors.map(errorEvidence),
      module_errors: modules.flatMap((m) => m.errors().map(errorEvidence)),
      classification: 'ACTUAL_FINAL_OBSERVATION_NOT_AUTOMATIC_PASS',
    };
    this.write('run_end', record);
    if (!this.sink) {
      writeFileSync(
        `${unitEvidenceDirectory}/final-observation.json`,
        JSON.stringify(record, null, 2) + '\n',
        { flag: 'wx' },
      );
      closeSync(this.fd);
    }
  }
}
