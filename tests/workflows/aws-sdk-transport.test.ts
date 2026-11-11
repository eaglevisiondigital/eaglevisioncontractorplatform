import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import https from 'node:https';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { HttpResponse, type HttpRequest } from '@smithy/protocol-http';
import {
  SdkExperimentTransport,
  type TemporaryCredentials,
  type WireHandler,
} from '../../server/customer/custody-lab/aws-experiment/sdk-transport';
import {
  guardRequest,
  requestHash,
} from '../../server/customer/custody-lab/aws-experiment/sdk-guard';
import {
  bindPackage,
  digest,
  EVIDENCE_LABELS,
  LIMITS,
} from '../../server/customer/custody-lab/aws-experiment/package';
import { ExperimentLimits } from '../../server/customer/custody-lab/aws-experiment/limits';
import {
  SyntheticExperiment,
  type Request,
} from '../../server/customer/custody-lab/aws-experiment/runner';
import {
  holdPlan,
  spendPlan,
  readPlan,
} from '../../server/customer/custody-lab/protocol';
const dirs: string[] = [],
  journals: ExperimentLimits[] = [];
beforeEach(() => {
  vi.spyOn(https, 'request').mockImplementation(() => {
    throw Error('NETWORK FORBIDDEN');
  });
  vi.spyOn(http, 'request').mockImplementation(() => {
    throw Error('NETWORK FORBIDDEN');
  });
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw Error('NETWORK FORBIDDEN');
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const x of journals.splice(0)) x.close();
  for (const x of dirs.splice(0)) rmSync(x, { recursive: true, force: true });
});
const bindings = {
  account: '0'.repeat(12),
  experiment: '35e58593-769c-45c1-8cd6-694f51b30a96',
  start: '2026-11-11T00:00:00.000Z',
  end: '2026-11-11T02:00:00.000Z',
  principals: {
    admin: 'arn:aws:iam::' + '0'.repeat(12) + ':user/a',
    runner: 'arn:aws:iam::' + '0'.repeat(12) + ':user/r',
    reviewer: 'arn:aws:iam::' + '0'.repeat(12) + ':user/v',
  },
};
const response = (
  body: string,
  statusCode = 200,
  headers: Record<string, string> = {},
) => ({
  response: new HttpResponse({
    statusCode,
    headers,
    body: Readable.from([Buffer.from(body)]),
  }),
});
function setup() {
  const p = bindPackage(bindings),
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'propel-sdk-test-')));
  dirs.push(dir);
  let time = Date.parse(bindings.start) + 1,
    allowed = true;
  const limits = new ExperimentLimits(
    dir,
    digest(p),
    Date.parse(bindings.start),
    Date.parse(bindings.end),
    () => time,
    true,
  );
  journals.push(limits);
  const fake: TemporaryCredentials = {
    accessKeyId: 'ASIA' + 'A'.repeat(16),
    secretAccessKey: 'A'.repeat(40),
    sessionToken: 'FICTIONAL_SYNTHETIC_TOKEN',
    expiration: new Date(time + 3600000),
  };
  const creds = {
    runner: { ...fake },
    reviewer: { ...fake },
    admin: { ...fake },
  };
  const calls: HttpRequest[] = [];
  let reply: (
    r: HttpRequest,
    o?: Parameters<WireHandler['handle']>[1],
  ) => ReturnType<WireHandler['handle']> = async () => response('{}');
  const options = {
    credentials: creds,
    now: () => time,
    authorized: () => allowed,
    wireFactory: () => ({
      handle: async (
        r: HttpRequest,
        o?: Parameters<WireHandler['handle']>[1],
      ) => {
        calls.push(r);
        return reply(r, o);
      },
      destroy: vi.fn(),
    }),
  };
  const transport = new SdkExperimentTransport(p, limits, options);
  function req(
    operation = 'TransactWriteItems',
    input: Record<string, unknown> = holdPlan(p.manifest.cases[0].binding),
    role: Request['role'] = 'runner',
    service: Request['service'] = 'dynamodb',
  ): Request {
    return {
      service,
      operation,
      input,
      role,
      maxAttempts: 1,
      maxResponseBytes: 4096,
    };
  }
  function ticket(r: Request) {
    const id = limits.reserve(
      r.service,
      Buffer.byteLength(JSON.stringify(r.input)) + r.maxResponseBytes + 512,
      [
        'TransactWriteItems',
        'PutObject',
        'DeleteObject',
        'DeleteBucket',
        'DeleteTable',
      ].includes(r.operation),
      r.role === 'admin' ? 'cleanup' : r.role,
      requestHash(r),
    );
    return { ...r, budgetId: id };
  }
  async function send(r: Request) {
    const t = ticket(r);
    const v = await transport.invoke(t);
    limits.finish(t.budgetId!, true);
    return v;
  }
  return {
    p,
    dir,
    limits,
    creds,
    transport,
    options,
    calls,
    req,
    ticket,
    send,
    setReply: (f: typeof reply) => {
      reply = f;
    },
    setTime: (n: number) => {
      time = n;
    },
    getTime: () => time,
    revoke: () => {
      allowed = false;
    },
  };
}
function evidence(f: ReturnType<typeof setup>) {
  const Body = '{"synthetic":true}',
    sha = createHash('sha256').update(Body).digest('hex');
  return {
    Bucket: f.p.bucket,
    ExpectedBucketOwner: bindings.account,
    Key: f.p.prefix + sha + '.json',
    Body,
    ServerSideEncryption: 'AES256',
    IfNoneMatch: '*',
    ChecksumSHA256: Buffer.from(sha, 'hex').toString('base64'),
    ChecksumAlgorithm: 'SHA256',
    Metadata: EVIDENCE_LABELS,
  };
}
it('real SDK serializes and signs the exact original conditional transaction with a deterministic token', async () => {
  const f = setup();
  expect(await f.send(f.req())).toEqual({});
  expect(f.calls).toHaveLength(1);
  const r = f.calls[0],
    body = JSON.parse(String(r.body));
  expect(body.TransactItems).toEqual(
    holdPlan(f.p.manifest.cases[0].binding).TransactItems,
  );
  expect(body.ClientRequestToken).toBe(
    digest(holdPlan(f.p.manifest.cases[0].binding)).slice(0, 36),
  );
  expect(r.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
  expect(r.hostname).toBe('dynamodb.us-east-2.amazonaws.com');
  expect(r.protocol).toBe('https:');
  expect(r.headers.authorization).toContain('/us-east-2/dynamodb/aws4_request');
  expect(https.request).not.toHaveBeenCalled();
  expect(http.request).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it('supports original atomic reads without adding claim identity', async () => {
  const f = setup();
  f.setReply(async () => response('{"Responses":[]}'));
  expect(
    await f.send(
      f.req(
        'TransactGetItems',
        readPlan(f.p.manifest.cases[0].binding),
        'reviewer',
      ),
    ),
  ).toEqual({ Responses: [] });
  expect(JSON.parse(String(f.calls[0].body))).toEqual(
    readPlan(f.p.manifest.cases[0].binding),
  );
});
it('supports S3 conditional upload with exact checksum, version and encryption', async () => {
  const f = setup(),
    i = evidence(f);
  f.setReply(async () =>
    response('', 200, {
      'x-amz-version-id': 'version-1',
      'x-amz-checksum-sha256': i.ChecksumSHA256,
      'x-amz-server-side-encryption': 'AES256',
    }),
  );
  const v = await f.send(f.req('PutObject', i, 'runner', 's3'));
  expect(v.VersionId).toBe('version-1');
  expect(f.calls[0].headers['if-none-match']).toBe('*');
  expect(f.calls[0].hostname).toBe('s3.us-east-2.amazonaws.com');
  expect(f.calls[0].headers.authorization).toContain(
    '/us-east-2/s3/aws4_request',
  );
  expect(f.calls[0].path).toContain('/' + f.p.bucket + '/');
});
it('normalizes downloaded Date and validates streaming SHA256/version before returning text', async () => {
  const f = setup(),
    i = evidence(f);
  f.setReply(async () =>
    response(i.Body, 200, {
      'x-amz-version-id': 'version-1',
      'x-amz-checksum-sha256': i.ChecksumSHA256,
      'x-amz-server-side-encryption': 'AES256',
      'last-modified': 'Wed, 11 Nov 2026 00:00:00 GMT',
      'content-length': String(Buffer.byteLength(i.Body)),
    }),
  );
  const v = await f.send(
    f.req(
      'GetObject',
      {
        Bucket: i.Bucket,
        ExpectedBucketOwner: i.ExpectedBucketOwner,
        Key: i.Key,
        VersionId: 'version-1',
        ChecksumMode: 'ENABLED',
      },
      'reviewer',
      's3',
    ),
  );
  expect(v.Body).toBe(i.Body);
  expect(v.LastModified).toBe(bindings.start);
});
it('normalizes actual SDK retention timestamps rather than accepting arbitrary strings', async () => {
  const f = setup(),
    i = evidence(f);
  f.setReply(async () =>
    response(
      '<Retention><Mode>GOVERNANCE</Mode><RetainUntilDate>2026-11-12T00:00:00.000Z</RetainUntilDate></Retention>',
    ),
  );
  const v = await f.send(
    f.req(
      'GetObjectRetention',
      {
        Bucket: i.Bucket,
        ExpectedBucketOwner: i.ExpectedBucketOwner,
        Key: i.Key,
        VersionId: 'version-1',
      },
      'reviewer',
      's3',
    ),
  );
  expect(v.Retention).toEqual({
    Mode: 'GOVERNANCE',
    RetainUntilDate: '2026-11-12T00:00:00.000Z',
  });
});
it.each([
  'foreign-key',
  'missing-condition',
  'changed-condition',
  'extra-operation',
  'extra-token',
])('rejects %s before any send', async (kind) => {
  const f = setup(),
    r = f.req('TransactWriteItems', spendPlan(f.p.manifest.cases[0].binding));
  const items = r.input.TransactItems as Record<
    string,
    Record<string, unknown>
  >[];
  if (kind === 'foreign-key') items[1].Put.Item = { pk: { S: 'foreign' } };
  if (kind === 'missing-condition') delete items[1].Put.ConditionExpression;
  if (kind === 'changed-condition')
    items[1].Put.ConditionExpression = 'attribute_exists(pk)';
  if (kind === 'extra-operation') r.operation = 'Scan';
  if (kind === 'extra-token') r.input.ClientRequestToken = 'replacement';
  await expect(f.transport.invoke(f.ticket(r))).rejects.toThrow('UNKNOWN');
  expect(f.calls).toHaveLength(0);
});
it.each([
  'ListBuckets',
  'CreateBucket',
  'PutObjectRetention',
  'HeadBucket',
  'CopyObject',
])('rejects unexpected S3 %s', async (op) => {
  const f = setup();
  await expect(
    f.transport.invoke(
      f.ticket(
        f.req(
          op,
          { Bucket: f.p.bucket, ExpectedBucketOwner: bindings.account },
          'reviewer',
          's3',
        ),
      ),
    ),
  ).rejects.toThrow('UNKNOWN');
  expect(f.calls).toHaveLength(0);
});
it('rejects reviewer writes and runner fence mutation', async () => {
  const f = setup();
  expect(() =>
    guardRequest(f.p, { ...f.ticket(f.req()), role: 'reviewer' }, f.getTime()),
  ).toThrow();
  expect(() =>
    guardRequest(
      f.p,
      {
        ...f.ticket(
          f.req('PutItem', {
            TableName: f.p.table,
            Item: { pk: { S: 'fence#x' } },
          }),
        ),
        role: 'runner',
      },
      f.getTime(),
    ),
  ).toThrow();
  expect(f.calls).toHaveLength(0);
});
it('rejects unreserved and reused tickets', async () => {
  const f = setup(),
    r = f.ticket(f.req());
  await f.transport.invoke(r);
  await expect(f.transport.invoke(r)).rejects.toThrow('UNKNOWN');
  expect(f.calls).toHaveLength(1);
});
it('never loads credentials or sends when explicit temporary credentials are missing', () => {
  const f = setup();
  expect(
    () =>
      new SdkExperimentTransport(f.p, f.limits, {
        ...f.options,
        credentials: undefined as never,
      }),
  ).toThrow();
  expect(
    () =>
      new SdkExperimentTransport(f.p, f.limits, {
        ...f.options,
        credentials: { ...f.creds, runner: (() => f.creds.runner) as never },
      }),
  ).toThrow();
  expect(f.calls).toHaveLength(0);
});
it('copies explicit credentials and immutable request before asynchronous signing', async () => {
  const f = setup(),
    r = f.ticket(f.req());
  const promise = f.transport.invoke(r);
  (r.input.TransactItems as unknown[]).length = 0;
  f.creds.runner.secretAccessKey = 'mutated';
  expect(await promise).toEqual({});
  expect(JSON.parse(String(f.calls[0].body)).TransactItems.length).toBe(3);
});
it.each([301, 307, 500, 503, 429])(
  'never retries or follows status %s',
  async (status) => {
    const f = setup();
    f.setReply(async () =>
      response(
        '{"__type":"InternalServerError","message":"synthetic"}',
        status,
        { location: 'https://attacker.invalid/' },
      ),
    );
    await expect(f.send(f.req())).rejects.toThrow('UNKNOWN');
    expect(f.calls).toHaveLength(1);
    expect(f.limits.state().blocked).toBe(1);
  },
);
it('revocation after asynchronous signing prevents the original wire send', async () => {
  const f = setup(),
    r = f.ticket(f.req());
  const p = f.transport.invoke(r);
  f.revoke();
  await expect(p).rejects.toThrow('UNKNOWN');
  expect(f.calls).toHaveLength(0);
});
it('expired data authority and credentials deny without a request', async () => {
  const f = setup(),
    r = f.ticket(f.req());
  f.setTime(Date.parse(bindings.end));
  await expect(f.transport.invoke(r)).rejects.toThrow('UNKNOWN');
  expect(f.calls).toHaveLength(0);
});
it('timeouts quarantine the exact ticket and ignore a late success rather than infer noncommit', async () => {
  vi.useFakeTimers();
  const f = setup(),
    r = f.ticket(f.req());
  let done!: (v: ReturnType<typeof response>) => void;
  f.setReply(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  const p = f.transport.invoke(r);
  const checked = expect(p).rejects.toThrow('UNKNOWN');
  await vi.advanceTimersByTimeAsync(30001);
  await checked;
  expect(f.calls).toHaveLength(1);
  expect(f.limits.state().blocked).toBe(1);
  done(response('{}'));
  await vi.advanceTimersByTimeAsync(1);
  await expect(f.transport.invoke(r)).rejects.toThrow('UNKNOWN');
  expect(f.calls).toHaveLength(1);
});
it('explicit cancellation aborts once and retains UNKNOWN even when wire ignores abort', async () => {
  const f = setup(),
    r = f.ticket(f.req()),
    controller = new AbortController();
  let done!: (v: ReturnType<typeof response>) => void;
  f.setReply(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  const p = f.transport.invoke(r, controller.signal);
  const rejected = expect(p).rejects.toThrow('UNKNOWN');
  while (!f.calls.length) await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await rejected;
  done(response('{}'));
  await new Promise((resolve) => setImmediate(resolve));
  expect(f.limits.state().blocked).toBe(1);
  expect(f.calls).toHaveLength(1);
});
it('shared journal enforces two in-flight requests across SDK instances and all roles', async () => {
  const f = setup(),
    peerLimits = new ExperimentLimits(
      f.dir,
      digest(f.p),
      Date.parse(bindings.start),
      Date.parse(bindings.end),
      f.getTime,
    );
  journals.push(peerLimits);
  const peer = new SdkExperimentTransport(f.p, peerLimits, f.options);
  const ends: ((v: ReturnType<typeof response>) => void)[] = [];
  f.setReply(() => new Promise((resolve) => ends.push(resolve)));
  const a = f.transport.invoke(f.ticket(f.req())),
    b = peer.invoke(
      f.ticket(
        f.req(
          'TransactGetItems',
          readPlan(f.p.manifest.cases[1].binding),
          'reviewer',
        ),
      ),
    );
  const settled = Promise.allSettled([a, b]);
  await vi.waitFor(() => expect(f.calls.length).toBe(2), { timeout: 1000 });
  await expect(
    peer.invoke(
      f.ticket(f.req('DescribeTable', { TableName: f.p.table }, 'reviewer')),
    ),
  ).rejects.toThrow('UNKNOWN');
  expect(f.calls).toHaveLength(2);
  ends.forEach((e) => e(response('{}')));
  await settled;
});
it('runner reviewer and cleanup entrypoints share the original two operation leases', async () => {
  const f = setup();
  let ends: (() => void)[] = [];
  const fake = {
    invoke: () =>
      new Promise<Record<string, unknown>>((resolve) =>
        ends.push(() => resolve({})),
      ),
  };
  const runner = new SyntheticExperiment(
    f.p,
    {
      packageHash: digest(f.p),
      tableId: '11111111-1111-4111-8111-111111111111',
    },
    f.limits,
    fake,
    f.getTime,
  );
  const a = runner.preflight(),
    b = runner.review(0);
  await expect(runner.verifyCleanup()).rejects.toThrow('Worker limit');
  ends.forEach((e) => e());
  await Promise.allSettled([a, b]);
  ends = [];
});
it('forbids invalid S3 checksums, absent upload version and byte overflows', async () => {
  const f = setup(),
    i = evidence(f);
  f.setReply(async () =>
    response('', 200, {
      'x-amz-checksum-sha256': i.ChecksumSHA256,
      'x-amz-server-side-encryption': 'AES256',
    }),
  );
  await expect(f.send(f.req('PutObject', i, 'runner', 's3'))).rejects.toThrow(
    'UNKNOWN',
  );
  expect(f.limits.state().blocked).toBe(1);
});
it('bounded raw response rejects oversized wire bytes before SDK parsing', async () => {
  const f = setup();
  f.setReply(async () => response('x'.repeat(4097)));
  await expect(f.send(f.req())).rejects.toThrow('UNKNOWN');
  expect(f.calls).toHaveLength(1);
});
it('explicit named provider absence is distinct from generic HTTP status', async () => {
  const f = setup();
  f.setReply(async () =>
    response('{"__type":"ResourceNotFoundException"}', 400),
  );
  expect(
    await f.send(f.req('DescribeTable', { TableName: f.p.table }, 'reviewer')),
  ).toEqual({ ErrorCode: 'ResourceNotFoundException', HttpStatus: 400 });
});
it('a missing retention timestamp is UNKNOWN, never a deletable object', async () => {
  const f = setup(),
    i = evidence(f);
  f.setReply(async () =>
    response('<Retention><Mode>GOVERNANCE</Mode></Retention>'),
  );
  await expect(
    f.send(
      f.req(
        'GetObjectRetention',
        {
          Bucket: i.Bucket,
          ExpectedBucketOwner: i.ExpectedBucketOwner,
          Key: i.Key,
          VersionId: 'v',
        },
        'reviewer',
        's3',
      ),
    ),
  ).rejects.toThrow('UNKNOWN');
});
it('old request budgets and total data limits deny SDK dispatch without new calls', async () => {
  const f = setup();
  expect(() =>
    f.limits.reserve('s3', LIMITS.bytes, false, 'reviewer', 'a'.repeat(64)),
  ).toThrow('Byte limit');
  const r = f.ticket(f.req());
  f.limits.quarantine('cleanup');
  await expect(f.transport.invoke(r)).rejects.toThrow('UNKNOWN');
  expect(f.calls).toHaveLength(0);
});
it.each(['phase', 'mutation', 'service', 'bytes'])(
  'ticket binding rejects forged %s metadata before wire',
  async (field) => {
    const f = setup(),
      r = f.req(),
      hash = requestHash(r),
      charge =
        Buffer.byteLength(JSON.stringify(r.input)) + r.maxResponseBytes + 512;
    const id = f.limits.reserve(
      field === 'service' ? 's3' : 'dynamodb',
      field === 'bytes' ? 0 : charge,
      field !== 'mutation',
      field === 'phase' ? 'reviewer' : 'runner',
      hash,
    );
    await expect(f.transport.invoke({ ...r, budgetId: id })).rejects.toThrow(
      'UNKNOWN',
    );
    expect(f.calls).toHaveLength(0);
  },
);
it('a read-only ticket cannot bypass a quarantined mutation', async () => {
  const f = setup(),
    r = f.req();
  const id = f.limits.reserve(
    'dynamodb',
    4096,
    false,
    'reviewer',
    requestHash(r),
  );
  f.limits.quarantine('cleanup');
  await expect(f.transport.invoke({ ...r, budgetId: id })).rejects.toThrow(
    'UNKNOWN',
  );
  expect(f.calls).toHaveLength(0);
});
it('quarantine during signing prevents a second admitted mutation from sending', async () => {
  const f = setup(),
    r = f.ticket(f.req());
  const p = f.transport.invoke(r);
  f.limits.quarantine('cleanup');
  await expect(p).rejects.toThrow('UNKNOWN');
  expect(f.calls).toHaveLength(0);
});
it('a response arriving after shared quarantine cannot be accepted as a known success', async () => {
  const f = setup();
  let done!: (v: ReturnType<typeof response>) => void;
  f.setReply(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  const p = f.transport.invoke(f.ticket(f.req()));
  const rejected = expect(p).rejects.toThrow('UNKNOWN');
  await vi.waitFor(() => expect(f.calls.length).toBe(1), { timeout: 1000 });
  f.limits.quarantine('cleanup');
  done(response('{}'));
  await rejected;
  expect(f.limits.state().blocked).toBe(1);
});
it('an invalid injected wire factory never falls back to actual HTTPS', async () => {
  const f = setup();
  const sdk = new SdkExperimentTransport(f.p, f.limits, {
    ...f.options,
    wireFactory: () => undefined as never,
  });
  await expect(sdk.invoke(f.ticket(f.req()))).rejects.toThrow('UNKNOWN');
  expect(f.calls).toHaveLength(0);
  expect(https.request).not.toHaveBeenCalled();
});
it('caller changes to options cannot replace the reviewed offline handler', async () => {
  const f = setup();
  f.options.wireFactory = undefined as never;
  expect(await f.send(f.req())).toEqual({});
  expect(f.calls).toHaveLength(1);
  expect(https.request).not.toHaveBeenCalled();
});
it.each(['wrong-sha', 'wrong-version', 'invalid-time', 'not-encrypted'])(
  'download rejects %s despite a successful HTTP response',
  async (kind) => {
    const f = setup(),
      i = evidence(f);
    f.setReply(async () =>
      response(i.Body, 200, {
        'x-amz-version-id': kind === 'wrong-version' ? 'different' : 'v',
        'x-amz-checksum-sha256':
          kind === 'wrong-sha'
            ? Buffer.alloc(32).toString('base64')
            : i.ChecksumSHA256,
        'x-amz-server-side-encryption':
          kind === 'not-encrypted' ? 'aws:kms' : 'AES256',
        'last-modified':
          kind === 'invalid-time' ? 'invalid' : 'Wed, 11 Nov 2026 00:00:00 GMT',
      }),
    );
    await expect(
      f.send(
        f.req(
          'GetObject',
          {
            Bucket: i.Bucket,
            ExpectedBucketOwner: i.ExpectedBucketOwner,
            Key: i.Key,
            VersionId: 'v',
            ChecksumMode: 'ENABLED',
          },
          'reviewer',
          's3',
        ),
      ),
    ).rejects.toThrow('UNKNOWN');
  },
);
it.each([
  [
    'GetObjectLegalHold',
    '<LegalHold><Status>OFF</Status></LegalHold>',
    'LegalHold',
  ],
  [
    'GetObjectLockConfiguration',
    '<ObjectLockConfiguration><ObjectLockEnabled>Enabled</ObjectLockEnabled><Rule><DefaultRetention><Mode>GOVERNANCE</Mode><Days>1</Days></DefaultRetention></Rule></ObjectLockConfiguration>',
    'ObjectLockConfiguration',
  ],
  [
    'GetBucketVersioning',
    '<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>',
    'Status',
  ],
  [
    'GetPublicAccessBlock',
    '<PublicAccessBlockConfiguration><BlockPublicAcls>true</BlockPublicAcls><IgnorePublicAcls>true</IgnorePublicAcls><BlockPublicPolicy>true</BlockPublicPolicy><RestrictPublicBuckets>true</RestrictPublicBuckets></PublicAccessBlockConfiguration>',
    'PublicAccessBlockConfiguration',
  ],
  [
    'GetBucketOwnershipControls',
    '<OwnershipControls><Rule><ObjectOwnership>BucketOwnerEnforced</ObjectOwnership></Rule></OwnershipControls>',
    'OwnershipControls',
  ],
  [
    'GetBucketEncryption',
    '<ServerSideEncryptionConfiguration><Rule><ApplyServerSideEncryptionByDefault><SSEAlgorithm>AES256</SSEAlgorithm></ApplyServerSideEncryptionByDefault></Rule></ServerSideEncryptionConfiguration>',
    'ServerSideEncryptionConfiguration',
  ],
  ['GetBucketPolicy', '{"Version":"2012-10-17","Statement":[]}', 'Policy'],
  [
    'GetBucketLocation',
    '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">us-east-2</LocationConstraint>',
    'LocationConstraint',
  ],
  [
    'ListObjectVersions',
    '<ListVersionsResult><IsTruncated>false</IsTruncated><Versions><Key>key</Key><VersionId>v</VersionId><LastModified>2026-11-11T00:00:00.000Z</LastModified></Versions></ListVersionsResult>',
    'IsTruncated',
  ],
])('real SDK supports approved read-only %s', async (op, xml, key) => {
  const f = setup(),
    i = evidence(f);
  f.setReply(async () => response(xml));
  const input =
    op === 'GetObjectLegalHold'
      ? {
          Bucket: i.Bucket,
          ExpectedBucketOwner: i.ExpectedBucketOwner,
          Key: i.Key,
          VersionId: 'v',
        }
      : op === 'ListObjectVersions'
        ? {
            Bucket: i.Bucket,
            ExpectedBucketOwner: i.ExpectedBucketOwner,
            Prefix: f.p.prefix,
            MaxKeys: 10,
          }
        : { Bucket: i.Bucket, ExpectedBucketOwner: i.ExpectedBucketOwner };
  const v = await f.send(f.req(op, input, 'reviewer', 's3'));
  expect(Object.hasOwn(v, key)).toBe(true);
  if (op === 'GetBucketLocation')
    expect(v.LocationConstraint).toBe('us-east-2');
  expect(f.calls).toHaveLength(1);
});
it.each(['DeleteObject', 'DeleteBucket', 'DeleteTable'])(
  'cleanup %s uses fresh explicit authority and shares the original counters',
  async (op) => {
    const f = setup(),
      i = evidence(f);
    f.setTime(Date.parse(bindings.start) + 25 * 3600000);
    const fresh = {
      ...f.options,
      credentials: Object.fromEntries(
        Object.entries(f.creds).map(([k, v]) => [
          k,
          { ...v, expiration: new Date(f.getTime() + 60000) },
        ]),
      ) as typeof f.creds,
    };
    const sdk = new SdkExperimentTransport(f.p, f.limits, fresh);
    f.setReply(async () =>
      response(
        op === 'DeleteTable' ? '{}' : '',
        op === 'DeleteTable' ? 200 : 204,
        op === 'DeleteObject' ? { 'x-amz-version-id': 'v' } : {},
      ),
    );
    const input =
      op === 'DeleteTable'
        ? { TableName: f.p.table }
        : op === 'DeleteObject'
          ? {
              Bucket: i.Bucket,
              ExpectedBucketOwner: i.ExpectedBucketOwner,
              Key: i.Key,
              VersionId: 'v',
            }
          : { Bucket: i.Bucket, ExpectedBucketOwner: i.ExpectedBucketOwner };
    if (op === 'DeleteTable') {
      await expect(
        sdk.invoke(f.ticket(f.req(op, input, 'admin', 'dynamodb'))),
      ).rejects.toThrow('UNKNOWN');
      expect(f.calls).toHaveLength(0);
    } else {
      const v = await sdk.invoke(f.ticket(f.req(op, input, 'admin', 's3')));
      expect(v).toBeDefined();
      expect(f.calls).toHaveLength(1);
      expect(f.limits.state().s3).toBe(1);
    }
  },
);
it('explicit NoSuchBucket XML is positive absence, generic 404 is UNKNOWN', async () => {
  const f = setup();
  f.setReply(async () =>
    response(
      '<Error><Code>NoSuchBucket</Code><Message>synthetic</Message></Error>',
      404,
    ),
  );
  expect(
    await f.send(
      f.req(
        'ListObjectVersions',
        {
          Bucket: f.p.bucket,
          ExpectedBucketOwner: bindings.account,
          Prefix: f.p.prefix,
          MaxKeys: 1,
        },
        'reviewer',
        's3',
      ),
    ),
  ).toEqual({ ErrorCode: 'NoSuchBucket', HttpStatus: 404 });
});
it('cleanup never renews expired active runner authority', async () => {
  const f = setup();
  f.setTime(Date.parse(bindings.end) + 1);
  const fresh = {
    ...f.options,
    credentials: Object.fromEntries(
      Object.entries(f.creds).map(([k, v]) => [
        k,
        { ...v, expiration: new Date(f.getTime() + 60000) },
      ]),
    ) as typeof f.creds,
  };
  const sdk = new SdkExperimentTransport(f.p, f.limits, fresh);
  const r = f.req();
  const id = f.limits.reserve(
    'dynamodb',
    4096,
    false,
    'reviewer',
    requestHash(r),
  );
  await expect(sdk.invoke({ ...r, budgetId: id })).rejects.toThrow('UNKNOWN');
  expect(f.calls).toHaveLength(0);
});
it('a valid wire result cannot be recorded as acknowledged after admission expires', async () => {
  const f = setup(),
    r = f.ticket(f.req());
  await f.transport.invoke(r);
  f.setTime(Date.parse(bindings.end));
  expect(() => f.limits.finish(r.budgetId!, true)).toThrow(
    'Late acknowledgment UNKNOWN',
  );
  expect(f.limits.state().blocked).toBe(1);
  await expect(f.transport.invoke(r)).rejects.toThrow('UNKNOWN');
  expect(f.calls).toHaveLength(1);
});
it('independent OS processes share the two-wire cap and a lost process leaves durable quarantine', async () => {
  const { spawn } = await import('node:child_process');
  const { execFileSync } = await import('node:child_process');
  const { pathToFileURL } = await import('node:url');
  const f = setup(),
    out = realpathSync(mkdtempSync(join(tmpdir(), 'propel-sdk-child-bundle-')));
  dirs.push(out);
  execFileSync(
    process.execPath,
    ['scripts/prepare-aws-custody-package.mjs', '--template-output', out],
    { stdio: 'pipe' },
  );
  const { readFileSync } = await import('node:fs');
  expect(JSON.parse(readFileSync(join(out, 'HASHES.json'), 'utf8'))).toEqual(
    JSON.parse(
      readFileSync(
        'server/customer/custody-lab/aws-experiment/OHIO_TEMPLATE_HASHES.json',
        'utf8',
      ),
    ),
  );
  const code = `const {ExperimentLimits}=await import(process.argv[1]);const b=JSON.parse(process.argv[2]);const l=new ExperimentLimits(b.dir,b.spec,b.start,b.end,()=>b.time);process.send({kind:'ready'});process.on('message',m=>{try{if(m.kind==='dispatch'){l.dispatch(m.id,m.hash,m.expected);process.send({kind:'dispatched'});}else{l.close();process.exit(0);}}catch{process.send({kind:'denied'});}});`;
  const children: ReturnType<typeof spawn>[] = [];
  function wait(child: ReturnType<typeof spawn>, kind: string) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(Error('Owned child deadline'));
      }, 5000);
      const message = (m: unknown) => {
        if ((m as { kind?: string }).kind === kind) {
          cleanup();
          resolve();
        }
      };
      const exit = () => {
        cleanup();
        reject(Error('Owned child exited before evidence'));
      };
      function cleanup() {
        clearTimeout(timer);
        child.removeListener('message', message);
        child.removeListener('exit', exit);
      }
      child.on('message', message);
      child.on('exit', exit);
    });
  }
  try {
    for (let i = 0; i < 2; i++) {
      const c = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          code,
          pathToFileURL(join(out, 'experiment.mjs')).href,
          JSON.stringify({
            dir: f.dir,
            spec: digest(f.p),
            start: Date.parse(bindings.start),
            end: Date.parse(bindings.end),
            time: f.getTime(),
          }),
        ],
        { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
      );
      children.push(c);
      await wait(c, 'ready');
    }
    for (const c of children) {
      const r = f.ticket(
        f.req(
          'TransactGetItems',
          readPlan(f.p.manifest.cases[0].binding),
          'reviewer',
        ),
      );
      const promise = wait(c, 'dispatched');
      c.send!({
        kind: 'dispatch',
        id: r.budgetId,
        hash: requestHash(r),
        expected: {
          phase: 'reviewer',
          mutation: false,
          service: 'dynamodb',
          bytes:
            Buffer.byteLength(JSON.stringify(r.input)) +
            r.maxResponseBytes +
            512,
        },
      });
      await promise;
    }
    const third = f.ticket(
      f.req(
        'TransactGetItems',
        readPlan(f.p.manifest.cases[1].binding),
        'reviewer',
      ),
    );
    expect(() =>
      f.limits.dispatch(third.budgetId!, requestHash(third), {
        phase: 'reviewer',
        mutation: false,
        service: 'dynamodb',
        bytes:
          Buffer.byteLength(JSON.stringify(third.input)) +
          third.maxResponseBytes +
          512,
      }),
    ).toThrow('Original live request ticket required');
    const dead = children[0];
    const killed = new Promise<void>((resolve) =>
      dead.once('exit', (_code, signal) => {
        expect(signal).toBe('SIGKILL');
        resolve();
      }),
    );
    expect(dead.kill('SIGKILL')).toBe(true);
    await killed;
    const reopened = new ExperimentLimits(
      f.dir,
      digest(f.p),
      Date.parse(bindings.start),
      Date.parse(bindings.end),
      f.getTime,
    );
    journals.push(reopened);
    expect(reopened.state().blocked).toBe(1);
    expect(() =>
      reopened.reserve('dynamodb', 4096, true, 'runner', 'a'.repeat(64)),
    ).toThrow('Experiment limit or quarantine');
    expect(f.calls).toHaveLength(0);
  } finally {
    await Promise.all(
      children.map(
        (c) =>
          new Promise<void>((resolve) => {
            if (c.exitCode !== null || c.signalCode !== null) {
              resolve();
              return;
            }
            c.once('exit', () => resolve());
            c.kill('SIGKILL');
          }),
      ),
    );
  }
});
it('fresh tickets cannot replay an acknowledged mutation even if AWS would idempotently acknowledge it', async () => {
  const f = setup();
  await f.send(f.req());
  const peerLimits = new ExperimentLimits(
    f.dir,
    digest(f.p),
    Date.parse(bindings.start),
    Date.parse(bindings.end),
    f.getTime,
  );
  journals.push(peerLimits);
  const peer = new SdkExperimentTransport(f.p, peerLimits, f.options);
  const original = f.req();
  original.maxResponseBytes = 8192;
  await expect(peer.invoke(f.ticket(original))).rejects.toThrow('UNKNOWN');
  expect(f.calls).toHaveLength(1);
  expect(f.limits.state().blocked).toBe(1);
  const read = f.ticket(
    f.req(
      'TransactGetItems',
      readPlan(f.p.manifest.cases[0].binding),
      'reviewer',
    ),
  );
  expect(await peer.invoke(read)).toEqual({});
  expect(f.calls).toHaveLength(2);
});
it('conditional evidence upload cannot be repeated with a replacement ticket or response budget', async () => {
  const f = setup(),
    i = evidence(f);
  f.setReply(async () =>
    response('', 200, {
      'x-amz-version-id': 'v',
      'x-amz-checksum-sha256': i.ChecksumSHA256,
      'x-amz-server-side-encryption': 'AES256',
    }),
  );
  await f.send(f.req('PutObject', i, 'runner', 's3'));
  const next = f.req('PutObject', i, 'runner', 's3');
  next.maxResponseBytes = 8192;
  await expect(f.transport.invoke(f.ticket(next))).rejects.toThrow('UNKNOWN');
  expect(f.calls).toHaveLength(1);
});
it('an altered mutation-marker index is denied rather than repaired or treated as one-use custody', async () => {
  const f = setup();
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(join(f.dir, 'aws-experiment-counters.sqlite'));
  try {
    db.exec(
      'drop index no_mutation_replay;create unique index no_mutation_replay on calls(intent_hash) where mutation=1 and dispatched=0',
    );
  } finally {
    db.close();
  }
  expect(
    () =>
      new ExperimentLimits(
        f.dir,
        digest(f.p),
        Date.parse(bindings.start),
        Date.parse(bindings.end),
        f.getTime,
      ),
  ).toThrow('Exact permanent mutation marker required');
  expect(f.calls).toHaveLength(0);
});

it('an old-region or tampered region package cannot construct an SDK transport', () => {
  const f = setup();
  for (const region of ['us-east-1', 'us-west-2'])
    expect(
      () =>
        new SdkExperimentTransport(
          { ...f.p, region } as never,
          f.limits,
          f.options,
        ),
    ).toThrow('Exact package/journal required');
  expect(f.calls).toHaveLength(0);
});
