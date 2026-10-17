import {
  mkdirSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  readFileSync,
  existsSync,
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
  const name = (organization: string, step: string) => {
    if (!uuid(organization) || !/^[a-z0-9-]{1,80}$/.test(step))
      throw Error('Invalid journal identity');
    return join(root, organization + '-' + step);
  };
  const create = (file: string, value: unknown) => {
    const fd = openSync(file, 'wx', 0o600);
    try {
      writeFileSync(fd, canonical(value) + '\n');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
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
      !uuid(result.resultId)
    )
      throw Error('Journal result mismatch');
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
      resultId,
    });
  };
  return { begin, read, complete };
}
