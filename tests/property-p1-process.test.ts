import { fork } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
it('real independent cleanup process survives loss of its executor IPC channel and verifies containment', async () => {
  const root = mkdtempSync(join(tmpdir(), 'propel-cleanup-child-')),
    output = join(root, 'result.json');
  const child = fork(
    new URL('./helpers/p1-cleanup-child.mts', import.meta.url),
    [output],
    {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: ['--experimental-transform-types'],
    },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Child not ready')), 5000);
      child.once('message', () => {
        clearTimeout(timer);
        resolve();
      });
      child.once('exit', () => {
        clearTimeout(timer);
        reject(Error('Child exited early'));
      });
    });
    const exit = new Promise<number | null>((resolve) =>
      child.once('exit', resolve),
    );
    child.disconnect();
    expect(await exit).toBe(0);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({
      events: ['exact-tenant-deactivation', 'all-session-signout'],
      status: 'VERIFIED',
    });
  } finally {
    if (!child.killed) child.kill();
    rmSync(root, { recursive: true, force: true });
  }
});
it.each(['disconnect', 'SIGTERM', 'SIGINT', 'SIGHUP'] as const)(
  'production cleanup worker rejects unapproved initialization and closes safely on %s without hosted requests',
  async (stop) => {
    const child = fork(
      new URL(
        '../server/property/execution/cleanup-worker.mts',
        import.meta.url,
      ),
      [],
      {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        execArgv: ['--experimental-transform-types'],
      },
    );
    try {
      const answer = new Promise<unknown>((resolve, reject) => {
        const t = setTimeout(
          () => reject(Error('Worker bootstrap failed')),
          5000,
        );
        child.once('message', (m) => {
          clearTimeout(t);
          resolve(m);
        });
        child.once('exit', () => {
          clearTimeout(t);
          reject(Error('Worker failed to load'));
        });
      });
      child.send({
        id: 1,
        type: 'init',
        data: { operationHash: 'not-approved' },
      });
      expect(await answer).toMatchObject({
        id: 1,
        data: { error: 'STOP_CONTAINMENT_REQUIRED' },
      });
      const exit = new Promise<number | null>((resolve) =>
        child.once('exit', resolve),
      );
      if (stop === 'disconnect') child.disconnect();
      else child.kill(stop);
      expect(await exit).toBe(0);
    } finally {
      if (!child.killed) child.kill();
    }
  },
);
it('two real executor processes cannot reserve the same durable run after simultaneous start', async () => {
  const root = mkdtempSync(join(tmpdir(), 'propel-journal-race-')),
    org = crypto.randomUUID();
  const children = [0, 1].map(() =>
    fork(
      new URL('./helpers/p1-journal-child.mts', import.meta.url),
      [root, org],
      {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        execArgv: ['--experimental-transform-types'],
      },
    ),
  );
  try {
    await Promise.all(
      children.map(
        (c) =>
          new Promise<void>((resolve, reject) => {
            const t = setTimeout(
              () => reject(Error('Journal child unavailable')),
              5000,
            );
            c.once('message', () => {
              clearTimeout(t);
              resolve();
            });
            c.once('exit', () => {
              clearTimeout(t);
              reject(Error('Journal child exited early'));
            });
          }),
      ),
    );
    const answers = children.map(
      (c) =>
        new Promise<string>((resolve) =>
          c.once('message', (v) => resolve(String(v))),
        ),
    );
    const exits = children.map(
      (c) => new Promise((resolve) => c.once('exit', resolve)),
    );
    for (const c of children) c.send('GO');
    expect((await Promise.all(answers)).sort()).toEqual(['BLOCKED', 'UNKNOWN']);
    await Promise.all(exits);
    expect(readdirSync(root).sort()).toHaveLength(2);
  } finally {
    for (const c of children) if (!c.killed) c.kill();
    rmSync(root, { recursive: true, force: true });
  }
});
