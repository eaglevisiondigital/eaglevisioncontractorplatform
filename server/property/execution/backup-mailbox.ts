import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/** Local encrypted-message spool only, no cloud sync, SSH command, listener or secrets.
 * Independent transfer must copy encrypted files to/from a separate device. Never
 * point both ends at the same disk and claim machine-loss protection.
 */
export function backupMailbox(outbox: string, inbox: string) {
  for (const root of [outbox, inbox]) {
    if (!existsSync(root)) {
      mkdirSync(root, { mode: 0o700, recursive: true });
      chmodSync(root, 0o700);
    }
    const s = lstatSync(root);
    if (!s.isDirectory() || s.isSymbolicLink() || s.mode & 0o077)
      throw Error('Private encrypted mailbox directory required');
  }
  const send = (kind: 'custody' | 'heartbeat', packet: string) => {
    if (packet.length > 65536) throw Error('Encrypted message too large');
    const name = randomUUID() + '.json';
    const fd = openSync(
      join(outbox, name),
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeFileSync(fd, JSON.stringify({ kind, packet }));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    const directory = openSync(outbox, constants.O_RDONLY);
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
    return name;
  };
  return {
    heartbeat: (packet: string) => {
      send('heartbeat', packet);
    },
    exchange: async (packet: string): Promise<unknown> => {
      const name = send('custody', packet);
      const started = performance.now();
      while (performance.now() - started < 9000) {
        const path = join(inbox, name);
        if (existsSync(path)) {
          const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
          try {
            const s = fstatSync(fd);
            if (!s.isFile() || s.mode & 0o077 || s.size > 4096)
              throw Error('Unsafe backup receipt');
            return JSON.parse(readFileSync(fd, 'utf8'));
          } finally {
            closeSync(fd);
          }
        }
        await delay(50);
      }
      throw Error('Backup receipt absent; no retry');
    },
  };
}
