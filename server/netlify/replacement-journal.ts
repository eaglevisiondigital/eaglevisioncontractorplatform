import {
  constants,
  openSync,
  closeSync,
  writeFileSync,
  readFileSync,
  fsyncSync,
  mkdirSync,
  lstatSync,
  realpathSync,
  readdirSync,
  fstatSync,
} from 'node:fs';
import { isAbsolute, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonical,
  fingerprint,
  isHash,
  requireThat,
} from './replacement-package.ts';

export type EventKind =
  | 'CREATE_SEND'
  | 'INITIAL_RESPONSE'
  | 'FILE_SEND'
  | 'FILE_RECEIPT'
  | 'FUNCTION_SEND'
  | 'FUNCTION_RECEIPT'
  | 'TERMINAL';
export interface JournalEvent {
  sequence: number;
  scope: string;
  previous: string;
  kind: EventKind;
  data: unknown;
  hash: string;
}
export interface JournalView {
  state: 'UNSTARTED' | 'UNKNOWN' | 'STOPPED' | 'VERIFIED_DRAFT';
  events: JournalEvent[];
}
export interface DraftJournal {
  readonly scope: string;
  inspect(): JournalView;
  start(approvalHash: string): void;
  append(kind: EventKind, data: unknown): void;
}
const locations = new WeakMap<DraftJournal, string>();
/** Production has one fixed custody location per reviewed target binding, never
 * a new path derived from an approval ID, a retry flag or an operator-selected ID. */
export function frozenJournalMatches(journal: DraftJournal, scope: string) {
  const expected = fileURLToPath(
    new URL(
      '../../.staging/action-d/replacement-execution/' + scope,
      import.meta.url,
    ),
  );
  return locations.get(journal) === expected;
}

/** Permanent attempt claim + append-only, file/directory-fsynced receipts. A new
 * process may inspect, never resume. No reset/delete/rebind interface. Trusted local
 * owner/directory custody is assumed, not rollback-proof disk or owner-proof auth. */
export function openDraftJournal(root: string, scope: string): DraftJournal {
  requireThat(isAbsolute(root) && isHash(scope), 'PRIVATE_JOURNAL_SCOPE');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  let active = false;
  const check = () => {
    const s = lstatSync(root);
    requireThat(
      s.isDirectory() &&
        !s.isSymbolicLink() &&
        realpathSync(root) === resolve(root) &&
        !(s.mode & 0o077) &&
        (!process.getuid || s.uid === process.getuid()),
      'PRIVATE_JOURNAL_DIRECTORY',
    );
  };
  const syncDir = () => {
    const fd = openSync(root, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  };
  const create = (name: string, data: unknown) => {
    check();
    const text = canonical(data) + '\n';
    requireThat(Buffer.byteLength(text) <= 32768, 'JOURNAL_BOUND');
    const fd = openSync(
      join(root, name),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeFileSync(fd, text);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    syncDir();
  };
  const read = (name: string): unknown => {
    const fd = openSync(
      join(root, name),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const s = fstatSync(fd);
      requireThat(
        s.isFile() &&
          s.nlink === 1 &&
          !(s.mode & 0o077) &&
          s.size <= 32768 &&
          (!process.getuid || s.uid === process.getuid()),
        'PRIVATE_JOURNAL_FILE',
      );
      return JSON.parse(readFileSync(fd, 'utf8'));
    } finally {
      closeSync(fd);
    }
  };
  const inspect = (): JournalView => {
    check();
    const names = readdirSync(root).sort();
    requireThat(
      names.length <= 129 &&
        names.every(
          (n) => n === 'attempt.json' || /^\d{3}\.event\.json$/.test(n),
        ),
      'JOURNAL_CONTENTS',
    );
    if (!names.includes('attempt.json')) {
      requireThat(names.length === 0, 'ORPHAN_JOURNAL');
      return { state: 'UNSTARTED', events: [] };
    }
    const claim = read('attempt.json') as Record<string, unknown>;
    requireThat(
      claim.scope === scope &&
        isHash(claim.approvalHash) &&
        claim.noReplay === true &&
        Object.keys(claim).length === 3,
      'JOURNAL_CLAIM',
    );
    const events: JournalEvent[] = [];
    let previous = fingerprint(claim);
    for (const name of names.filter((n) => n !== 'attempt.json')) {
      const e = read(name) as JournalEvent;
      requireThat(
        name === String(events.length).padStart(3, '0') + '.event.json' &&
          e.sequence === events.length &&
          e.scope === scope &&
          e.previous === previous &&
          [
            'CREATE_SEND',
            'INITIAL_RESPONSE',
            'FILE_SEND',
            'FILE_RECEIPT',
            'FUNCTION_SEND',
            'FUNCTION_RECEIPT',
            'TERMINAL',
          ].includes(e.kind),
        'JOURNAL_SEQUENCE',
      );
      const { hash, ...entry } = e;
      requireThat(hash === fingerprint(entry), 'JOURNAL_HASH');
      requireThat(
        !events.some((x) => x.kind === 'TERMINAL'),
        'JOURNAL_AFTER_TERMINAL',
      );
      previous = hash;
      events.push(e);
    }
    const terminal = events.at(-1);
    if (terminal?.kind === 'TERMINAL') {
      const state = (terminal.data as Record<string, unknown>)?.state;
      requireThat(
        ['UNKNOWN', 'STOPPED', 'VERIFIED_DRAFT'].includes(String(state)),
        'JOURNAL_TERMINAL',
      );
      return { state: state as JournalView['state'], events };
    }
    return { state: 'UNKNOWN', events };
  };
  check();
  syncDir();
  const journal: DraftJournal = {
    scope,
    inspect,
    start(approvalHash) {
      requireThat(
        !active && isHash(approvalHash) && inspect().state === 'UNSTARTED',
        'EXISTING_ATTEMPT_NO_REPLAY',
      );
      create('attempt.json', { scope, approvalHash, noReplay: true });
      active = true;
    },
    append(kind, data) {
      requireThat(active, 'READ_ONLY_RESTART');
      try {
        const view = inspect();
        requireThat(
          view.state === 'UNKNOWN' && view.events.length < 128,
          'JOURNAL_CLOSED',
        );
        const previous =
          view.events.at(-1)?.hash ?? fingerprint(read('attempt.json'));
        const entry = {
          sequence: view.events.length,
          scope,
          previous,
          kind,
          data,
        };
        create(String(entry.sequence).padStart(3, '0') + '.event.json', {
          ...entry,
          hash: fingerprint(entry),
        });
        if (kind === 'TERMINAL') active = false;
      } catch (error) {
        active = false;
        throw error;
      }
    },
  };
  locations.set(journal, root);
  return journal;
}
