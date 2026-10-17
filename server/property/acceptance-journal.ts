import {
  mkdirSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  readFileSync,
  existsSync,
  lstatSync,
  constants,
} from 'node:fs';
import { join } from 'node:path';
import { canonical } from './p1-readiness.ts';
const sha = (s: string) => /^[a-f0-9]{64}$/.test(s);
const uuid = (s: string) =>
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(s);
/** Private local evidence only. This never authorizes or performs an RPC. */
export function acceptanceJournal(root: string, operationSha256: string) {
  if (!sha(operationSha256))
    throw Error('Exact reviewed operation hash required');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  if (
    !lstatSync(root).isDirectory() ||
    lstatSync(root).isSymbolicLink() ||
    lstatSync(root).mode & 0o077
  )
    throw Error('Private journal directory required');
  const syncDirectory = () => {
    const fd = openSync(root, 'r');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  };
  syncDirectory();
  const name = (organization: string, step: string) => {
    if (!uuid(organization) || !/^[a-z0-9-]{1,80}$/.test(step))
      throw Error('Invalid journal identity');
    return join(root, organization + '-' + step);
  };
  const create = (file: string, value: unknown) => {
    const fd = openSync(
      file,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeFileSync(fd, canonical(value) + '\n');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    syncDirectory();
  };
  const begin = (organization: string, step: string, payloadSha256: string) => {
    if (!sha(payloadSha256)) throw Error('Payload hash required');
    create(name(organization, step) + '.attempt.json', {
      operationSha256,
      payloadSha256,
      organization,
      step,
      state: 'ATTEMPTED',
    });
  };
  const read = (organization: string, step: string) => {
    const file = name(organization, step);
    if (!existsSync(file + '.attempt.json'))
      return { state: 'NOT_ATTEMPTED' as const };
    for (const suffix of ['.attempt.json', '.result.json']) {
      const p = file + suffix;
      if (
        existsSync(p) &&
        (!lstatSync(p).isFile() ||
          lstatSync(p).isSymbolicLink() ||
          lstatSync(p).mode & 0o077)
      )
        throw Error('Unsafe journal file');
    }
    const attempt = JSON.parse(readFileSync(file + '.attempt.json', 'utf8'));
    if (
      attempt.operationSha256 !== operationSha256 ||
      attempt.organization !== organization ||
      attempt.step !== step ||
      attempt.state !== 'ATTEMPTED' ||
      !sha(attempt.payloadSha256)
    )
      throw Error('Journal scope mismatch');
    if (!existsSync(file + '.result.json'))
      return {
        state: 'UNKNOWN' as const,
        payloadSha256: attempt.payloadSha256,
      };
    const result = JSON.parse(readFileSync(file + '.result.json', 'utf8'));
    if (
      result.operationSha256 !== operationSha256 ||
      result.payloadSha256 !== attempt.payloadSha256 ||
      // Legacy successful receipts omitted state. Unknown explicit states must
      // never be interpreted as successful outcomes merely because a UUID exists.
      ![undefined, 'RECORDED', 'DENIED'].includes(result.state) ||
      !(result.state === 'DENIED'
        ? /^[A-Z0-9]{5}$/.test(result.code)
        : uuid(result.resultId))
    )
      throw Error('Journal result mismatch');
    if (result.state === 'DENIED')
      return {
        state: 'DENIED' as const,
        code: result.code as string,
        payloadSha256: attempt.payloadSha256 as string,
      };
    return {
      state: 'RECORDED' as const,
      resultId: result.resultId as string,
      payloadSha256: attempt.payloadSha256 as string,
    };
  };
  const complete = (
    organization: string,
    step: string,
    payloadSha256: string,
    resultId: string,
  ) => {
    const r = read(organization, step);
    if (
      r.state !== 'UNKNOWN' ||
      r.payloadSha256 !== payloadSha256 ||
      !uuid(resultId)
    )
      throw Error('Matching attempt and UUID result required');
    create(name(organization, step) + '.result.json', {
      operationSha256,
      payloadSha256,
      state: 'RECORDED',
      resultId,
    });
  };
  const denied = (
    organization: string,
    step: string,
    payloadSha256: string,
    code: string,
  ) => {
    const r = read(organization, step);
    if (
      r.state !== 'UNKNOWN' ||
      r.payloadSha256 !== payloadSha256 ||
      !/^[A-Z0-9]{5}$/.test(code)
    )
      throw Error('Matching denied attempt required');
    create(name(organization, step) + '.result.json', {
      operationSha256,
      payloadSha256,
      state: 'DENIED',
      code,
    });
  };
  const reserveRun = () =>
    create(join(root, 'run-started.json'), {
      operationSha256,
      state: 'NO_REPLAY',
    });
  return { begin, read, complete, denied, reserveRun };
}
