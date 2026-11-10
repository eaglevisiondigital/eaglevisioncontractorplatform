import { afterEach, expect, it, vi } from 'vitest';
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  readFileSync,
  lstatSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  bindPackage,
  digest,
  LIMITS,
  syntheticManifest,
  type Bindings,
} from '../../server/customer/custody-lab/aws-experiment/package';
import {
  permitted,
  validatePackage,
} from '../../server/customer/custody-lab/aws-experiment/validation';
import { ExperimentLimits } from '../../server/customer/custody-lab/aws-experiment/limits';
import {
  observedAbsence,
  boundedUtf8Body,
} from '../../server/customer/custody-lab/aws-experiment/provider';
import {
  SyntheticExperiment,
  type Request,
  type ExperimentTransport,
} from '../../server/customer/custody-lab/aws-experiment/runner';
import {
  createCustodyFixture,
  runFixtureWrite,
} from '../fixtures/customer-custody/sqlite';
import {
  expectedFence,
  spendPlan,
  readPlan,
} from '../../server/customer/custody-lab/protocol';
const E = '35e58593-769c-45c1-8cd6-694f51b30a96',
  A = '0'.repeat(12);
const bindings: Bindings = {
  account: A,
  experiment: E,
  start: '2026-11-11T00:00:00.000Z',
  end: '2026-11-11T02:00:00.000Z',
  principals: {
    admin: `arn:aws:iam::${A}:user/fixture-admin`,
    runner: `arn:aws:iam::${A}:user/fixture-runner`,
    reviewer: `arn:aws:iam::${A}:user/fixture-reviewer`,
  },
};
const stop: (() => void)[] = [];
afterEach(() => {
  for (const close of stop.splice(0).reverse()) close();
});
function setup() {
  const p = bindPackage(bindings);
  let time = Date.parse(bindings.start) + 1000;
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'propel-aws-package-'));
  const journal = new ExperimentLimits(
    root,
    digest(p),
    Date.parse(bindings.start),
    Date.parse(bindings.end),
    () => time,
    true,
  );
  stop.push(() => {
    journal.close();
    rmSync(root, { force: true, recursive: true });
  });
  const fixture = createCustodyFixture();
  stop.push(() => fixture.close());
  fixture.fence(expectedFence(p.manifest.cases[0].binding));
  const objects = new Map<
    string,
    {
      Key: string;
      VersionId: string;
      Body: string;
      LastModified: string;
      until: string;
      legal: string;
      Metadata: unknown;
    }
  >();
  const calls: Request[] = [];
  let wrongPin = false,
    tableExists = true,
    bucketExists = true;
  const tableId = '11111111-1111-4111-8111-111111111111';
  function authorized(request: Request) {
    const v = {
      'aws:CurrentTime': new Date(time).toISOString(),
      'aws:SecureTransport': true,
      'aws:ResourceTag/Experiment': E,
      's3:prefix': String(request.input.Prefix ?? ''),
      's3:if-none-match': String(request.input.IfNoneMatch ?? ''),
      's3:x-amz-server-side-encryption': String(
        request.input.ServerSideEncryption ?? '',
      ),
    };
    const permission = p.permissions[request.role];
    if (
      request.service === 'dynamodb' &&
      request.operation.startsWith('Transact')
    ) {
      const items = request.input.TransactItems as Record<
        string,
        { Key?: { pk: { S: string } }; Item?: { pk: { S: string } } }
      >[];
      for (const item of items) {
        const [kind, value] = Object.entries(item)[0];
        const action =
          kind === 'Get'
            ? 'GetItem'
            : kind === 'Put'
              ? 'PutItem'
              : 'ConditionCheckItem';
        if (
          !permitted([permission], {
            action: `dynamodb:${action}`,
            resource: p.tableArn,
            values: {
              ...v,
              'dynamodb:EnclosingOperation': request.operation,
              'dynamodb:LeadingKeys': (value.Key ?? value.Item)!.pk.S,
            },
          })
        )
          throw Error('Offline IAM denied');
      }
    } else {
      const action =
        request.service === 'dynamodb'
          ? `dynamodb:${request.operation}`
          : `s3:${request.operation === 'DeleteObject' ? 'DeleteObjectVersion' : request.operation === 'GetObject' ? 'GetObjectVersion' : request.operation === 'ListObjectVersions' ? 'ListBucketVersions' : request.operation === 'GetObjectLockConfiguration' ? 'GetBucketObjectLockConfiguration' : request.operation === 'GetPublicAccessBlock' ? 'GetBucketPublicAccessBlock' : request.operation === 'GetBucketEncryption' ? 'GetEncryptionConfiguration' : request.operation === 'HeadBucket' ? 'ListBucket' : request.operation}`;
      const resource = request.input.Key
        ? `${p.bucketArn}/${request.input.Key}`
        : request.service === 'dynamodb'
          ? p.tableArn
          : p.bucketArn;
      if (
        !permitted(
          request.service === 's3'
            ? [permission, p.resources.bucketPolicy]
            : [permission],
          { action, resource, values: v },
        )
      )
        throw Error('Offline IAM denied');
    }
  }
  const transport: ExperimentTransport = {
    async invoke(request) {
      calls.push(request);
      authorized(request);
      if (request.service === 'dynamodb') {
        if (request.operation === 'DeleteTable') {
          tableExists = false;
          return {};
        }
        if (request.operation === 'DescribeTable' && !tableExists)
          return { ErrorCode: 'ResourceNotFoundException', HttpStatus: 400 };
        if (request.operation === 'DescribeTable')
          return {
            Table: {
              TableArn: p.tableArn,
              TableId: wrongPin
                ? '22222222-2222-4222-8222-222222222222'
                : tableId,
              TableStatus: 'ACTIVE',
              KeySchema: p.resources.table.KeySchema,
              AttributeDefinitions: p.resources.table.AttributeDefinitions,
              ProvisionedThroughput: p.resources.table.ProvisionedThroughput,
            },
          };
        if (request.operation === 'TransactWriteItems') {
          runFixtureWrite(
            fixture.db,
            request.input as unknown as Parameters<typeof runFixtureWrite>[1],
          );
          return {};
        }
        if (request.operation === 'TransactGetItems') {
          const rows = await fixture.port.read(
            request.input as unknown as ReturnType<typeof readPlan>,
          );
          return { Responses: rows.map((v) => (v ? { Item: v } : {})) };
        }
      }
      if (request.operation === 'HeadBucket')
        return bucketExists
          ? {}
          : { ErrorCode: 'NoSuchBucket', HttpStatus: 404 };
      if (request.operation === 'DeleteBucket') {
        if (objects.size) throw Error('Bucket not empty');
        bucketExists = false;
        return {};
      }
      if (request.operation === 'GetBucketVersioning')
        return { Status: 'Enabled' };
      if (request.operation === 'GetPublicAccessBlock')
        return p.resources.publicAccess;
      if (request.operation === 'GetBucketOwnershipControls')
        return p.resources.ownership;
      if (request.operation === 'GetBucketEncryption')
        return p.resources.encryption;
      if (request.operation === 'GetBucketPolicy')
        return { Policy: JSON.stringify(p.resources.bucketPolicy) };
      if (request.operation === 'GetBucketLocation')
        return { LocationConstraint: null };
      const key = String(request.input.Key ?? ''),
        id = String(request.input.VersionId ?? '');
      if (request.operation === 'PutObject') {
        if (objects.has(key)) throw Error('Conditional upload denied');
        const value = {
          Key: key,
          VersionId: `version-${objects.size + 1}`,
          Body: String(request.input.Body),
          LastModified: new Date(time).toISOString(),
          until: new Date(time + 86400000).toISOString(),
          legal: 'OFF',
          Metadata: request.input.Metadata,
        };
        objects.set(key, value);
        return { VersionId: value.VersionId };
      }
      if (request.operation === 'GetObjectLockConfiguration')
        return p.resources.lock;
      if (request.operation === 'ListObjectVersions' && !bucketExists)
        return { ErrorCode: 'NoSuchBucket', HttpStatus: 404 };
      if (request.operation === 'ListObjectVersions') {
        const rows = [...objects.values()]
          .map(({ Key, VersionId }) => ({ Key, VersionId }))
          .sort((a, b) => a.Key.localeCompare(b.Key));
        const start = request.input.KeyMarker
          ? rows.findIndex((r) => r.Key === request.input.KeyMarker) + 1
          : 0;
        const slice = rows.slice(
            start,
            start + Number(request.input.MaxKeys ?? 10),
          ),
          truncated = start + slice.length < rows.length;
        return {
          Versions: slice,
          DeleteMarkers: [],
          IsTruncated: truncated,
          ...(truncated
            ? {
                NextKeyMarker: slice.at(-1)!.Key,
                NextVersionIdMarker: slice.at(-1)!.VersionId,
              }
            : {}),
        };
      }
      const object = objects.get(key);
      if (!object || object.VersionId !== id)
        throw Error('Unknown original version');
      if (request.operation === 'DeleteObject') {
        if (time < Date.parse(object.until) || object.legal !== 'OFF')
          throw Error('Retained version deletion denied');
        objects.delete(key);
        return {};
      }
      if (request.operation === 'GetObject')
        return {
          Body: object.Body,
          VersionId: object.VersionId,
          LastModified: object.LastModified,
          Metadata: object.Metadata,
          ChecksumSHA256: createHash('sha256')
            .update(object.Body)
            .digest('base64'),
        };
      if (request.operation === 'GetObjectRetention')
        return {
          Retention: { Mode: 'GOVERNANCE', RetainUntilDate: object.until },
        };
      if (request.operation === 'GetObjectLegalHold')
        return { LegalHold: { Status: object.legal } };
      throw Error('Unsupported offline fixture API');
    },
  };
  const pins = { tableId, packageHash: digest(p) },
    runner = new SyntheticExperiment(p, pins, journal, transport, () => time);
  return {
    p,
    root,
    journal,
    fixture,
    calls,
    objects,
    transport,
    pins,
    runner,
    setTime: (t: number) => {
      time = t;
    },
    now: () => time,
    setWrongPin: (v: boolean) => {
      wrongPin = v;
    },
  };
}
it('compiles three small exact permission/trust policies and valid fixed-cost resources', () => {
  const p = bindPackage(bindings);
  expect(validatePackage(p)).toEqual({
    offlineValid: true,
    awsValidated: false,
    executionAuthorized: false,
  });
  expect(p.bucket.length).toBeLessThanOrEqual(63);
  expect(p.resources.table.ProvisionedThroughput).toEqual({
    ReadCapacityUnits: 30,
    WriteCapacityUnits: 10,
  });
  expect(p.resources.publicAccess.PublicAccessBlockConfiguration).toEqual({
    BlockPublicAcls: true,
    IgnorePublicAcls: true,
    BlockPublicPolicy: true,
    RestrictPublicBuckets: true,
  });
  expect(
    p.resources.lock.ObjectLockConfiguration.Rule.DefaultRetention,
  ).toEqual({ Mode: 'GOVERNANCE', Days: 1 });
  for (const role of ['admin', 'runner', 'reviewer'] as const) {
    expect(JSON.stringify(p.permissions[role]).length).toBeLessThan(10240);
    expect(p.trust[role].Statement[0].Principal).toEqual({
      AWS: bindings.principals[role],
    });
    expect(
      p.permissions[role].Statement.flatMap((s) => s.Action).some((a) =>
        a.startsWith('iam:'),
      ),
    ).toBe(false);
  }
});
it.each([
  'dynamodb:PutItem',
  'dynamodb:ConditionCheckItem',
  'dynamodb:GetItem',
])('requires bounded leading keys and enclosing operation for %s', (action) => {
  const p = bindPackage(bindings),
    key =
      action === 'dynamodb:PutItem'
        ? `claim#${p.manifest.cases[0].binding.reference.organization_id}#test`
        : `fence#${p.manifest.cases[0].binding.reference.organization_id}`;
  const good = {
    action,
    resource: p.tableArn,
    values: {
      'aws:CurrentTime': '2026-11-11T00:01:00Z',
      'aws:ResourceTag/Experiment': E,
      'dynamodb:LeadingKeys': key,
      'dynamodb:EnclosingOperation':
        action === 'dynamodb:GetItem'
          ? 'TransactGetItems'
          : 'TransactWriteItems',
    },
  };
  expect(permitted([p.permissions.runner], good)).toBe(true);
  for (const values of [
    { ...good.values, 'dynamodb:LeadingKeys': 'foreign' },
    { ...good.values, 'dynamodb:LeadingKeys': undefined },
    { ...good.values, 'dynamodb:EnclosingOperation': undefined },
    { ...good.values, 'dynamodb:EnclosingOperation': 'PutItem' },
  ])
    expect(permitted([p.permissions.runner], { ...good, values })).toBe(false);
});
it.each([
  'dynamodb:DeleteTable',
  'dynamodb:UpdateTable',
  'dynamodb:UpdateItem',
  'dynamodb:DeleteItem',
  'dynamodb:Scan',
  'dynamodb:BatchWriteItem',
  'iam:PutRolePolicy',
  'sts:AssumeRole',
  's3:DeleteObjectVersion',
  's3:BypassGovernanceRetention',
])('runner excludes administrative/bypass action %s', (action) => {
  const p = bindPackage(bindings);
  expect(
    permitted([p.permissions.runner], {
      action,
      resource: action.startsWith('s3:') ? `${p.bucketArn}/${E}/x` : p.tableArn,
      values: { 'aws:CurrentTime': '2026-11-11T00:01:00Z' },
    }),
  ).toBe(false);
});
it('trust rejects missing MFA, wrong principal/external ID, expired window and self reviewer', () => {
  const p = bindPackage(bindings),
    ctx = {
      action: 'sts:AssumeRole',
      resource: 'unused',
      principal: bindings.principals.runner,
      values: {
        'aws:CurrentTime': '2026-11-11T00:01:00Z',
        'aws:MultiFactorAuthPresent': true,
        'sts:ExternalId': E,
      },
    };
  expect(permitted([p.trust.runner], ctx)).toBe(true);
  expect(
    permitted([p.trust.runner], {
      ...ctx,
      principal: bindings.principals.admin,
    }),
  ).toBe(false);
  for (const values of [
    { ...ctx.values, 'aws:MultiFactorAuthPresent': false },
    { ...ctx.values, 'sts:ExternalId': 'other' },
    { ...ctx.values, 'aws:CurrentTime': bindings.end },
  ])
    expect(permitted([p.trust.runner], { ...ctx, values })).toBe(false);
  expect(() =>
    bindPackage({
      ...bindings,
      principals: {
        ...bindings.principals,
        reviewer: bindings.principals.runner,
      },
    }),
  ).toThrow();
});
it('uses original349 protocol and interpreter to produce only synthetic read-only evidence', async () => {
  const f = setup();
  expect(await f.runner.run(0, 'worker-a')).toEqual({
    outcome: 'RECEIPT_MATCHED',
    writes_allowed: false,
  });
  expect(await f.runner.review(0)).toEqual({
    outcome: 'RECEIPT_MATCHED',
    writes_allowed: false,
  });
  expect(
    f.calls.filter((c) => c.operation === 'TransactWriteItems'),
  ).toHaveLength(3);
  expect(f.calls.every((c) => c.maxAttempts === 1)).toBe(true);
});
it('allows one worker to process distinct preallocated cases sequentially but denies consumed identity', async () => {
  const f = setup();
  await f.runner.run(0, 'worker-a');
  await f.runner.run(1, 'worker-a');
  await expect(f.runner.run(0, 'worker-a')).rejects.toThrow(/UNKNOWN/);
  const before = f.calls.filter(
    (c) => c.operation === 'TransactWriteItems',
  ).length;
  await expect(f.runner.run(2, 'worker-b')).rejects.toThrow(/UNKNOWN/);
  expect(
    f.calls.filter((c) => c.operation === 'TransactWriteItems').length,
  ).toBe(before); // Describe is read-only; no further transaction mutation.
});
it('rejects omitted/altered conditions before even an injected transport can see them', async () => {
  for (const change of ['omitted', 'altered']) {
    const f = setup(),
      plan = spendPlan(f.p.manifest.cases[0].binding);
    if (change === 'omitted')
      delete (
        plan.TransactItems[1] as { Put: { ConditionExpression?: string } }
      ).Put.ConditionExpression;
    else
      (
        plan.TransactItems[1] as { Put: { ConditionExpression: string } }
      ).Put.ConditionExpression = 'attribute_exists(#pk)';
    const call = Reflect.get(f.runner, 'call').bind(f.runner) as (
      role: string,
      service: string,
      op: string,
      input: unknown,
    ) => Promise<unknown>;
    await expect(
      call('runner', 'dynamodb', 'TransactWriteItems', plan),
    ).rejects.toThrow(/conditions/);
    expect(f.calls).toHaveLength(0);
  }
});
it('target drift causes durable quarantine of fresh cases', async () => {
  const f = setup();
  f.setWrongPin(true);
  await expect(f.runner.run(0, 'a')).rejects.toThrow(/UNKNOWN/);
  expect(f.journal.state().blocked).toBe(1);
  f.setWrongPin(false);
  await expect(f.runner.run(1, 'b')).rejects.toThrow(/UNKNOWN/);
  expect(
    f.calls.filter((c) => c.operation === 'TransactWriteItems'),
  ).toHaveLength(0);
});
it('binds the journal and immutable pins to the exact package', () => {
  const f = setup();
  const original = f.pins.packageHash;
  f.pins.packageHash = 'd'.repeat(64);
  expect(f.runner.package.hashes).toEqual(f.p.hashes);
  expect(() => {
    f.runner.package.bindings.account = '9'.repeat(12);
  }).toThrow();
  expect(
    () =>
      new SyntheticExperiment(
        f.p,
        { tableId: f.pins.tableId, packageHash: original },
        new ExperimentLimits(
          f.root,
          'e'.repeat(64),
          Date.parse(bindings.start),
          Date.parse(bindings.end),
          f.now,
          false,
        ),
        f.transport,
        f.now,
      ),
  ).toThrow();
});
it('independently verifies conditional S3 upload, original version, checksum and one-day retention', async () => {
  const f = setup(),
    bytes = Buffer.from('{"synthetic":true}'),
    e = await f.runner.evidence(bytes);
  expect(await f.runner.verifyEvidence(e)).toEqual({
    verified: true,
    executionAuthorized: false,
  });
  const put = f.calls.find((c) => c.operation === 'PutObject')!;
  expect(put.input.IfNoneMatch).toBe('*');
  expect(put.input.ChecksumAlgorithm).toBe('SHA256');
  await expect(f.runner.evidence(bytes)).rejects.toThrow(/UNKNOWN/);
  expect(f.journal.state().blocked).toBe(1);
});
it.each(['hash', 'version', 'short', 'legal', 'default'] as const)(
  'denies %s evidence without reviving claim authority',
  async (kind) => {
    const f = setup(),
      e = await f.runner.evidence(Buffer.from('{"synthetic":true}')),
      o = f.objects.get(e.key)!;
    if (kind === 'hash') o.Body = 'tampered';
    if (kind === 'version') o.VersionId = 'other';
    if (kind === 'short') o.until = new Date(f.now() + 1000).toISOString();
    if (kind === 'legal') o.legal = 'ON';
    if (kind === 'default')
      vi.spyOn(f.transport, 'invoke').mockImplementation(async (r) =>
        r.operation === 'GetObjectLockConfiguration'
          ? { ObjectLockConfiguration: { ObjectLockEnabled: 'Disabled' } }
          : kind === 'default' && r.operation === 'GetObject'
            ? {
                Body: o.Body,
                VersionId: o.VersionId,
                LastModified: o.LastModified,
              }
            : r.operation === 'GetObjectRetention'
              ? { Retention: { Mode: 'GOVERNANCE', RetainUntilDate: o.until } }
              : { LegalHold: { Status: 'OFF' } },
      );
    await expect(f.runner.verifyEvidence(e)).rejects.toThrow(/UNKNOWN/);
    expect(f.journal.state().blocked).toBe(1);
  },
);
it('S3 policy separately denies absent conditional header, missing encryption and retention bypass', () => {
  const p = bindPackage(bindings),
    ctx = {
      action: 's3:PutObject',
      resource: `${p.bucketArn}/${E}/x`,
      values: {
        'aws:CurrentTime': '2026-11-11T00:01:00Z',
        'aws:SecureTransport': true,
        'aws:ResourceTag/Experiment': E,
        's3:if-none-match': '*',
        's3:x-amz-server-side-encryption': 'AES256',
      },
    };
  expect(permitted([p.permissions.runner, p.resources.bucketPolicy], ctx)).toBe(
    true,
  );
  for (const values of [
    { ...ctx.values, 's3:if-none-match': undefined },
    { ...ctx.values, 's3:x-amz-server-side-encryption': undefined },
    { ...ctx.values, 'aws:SecureTransport': false },
  ])
    expect(
      permitted([p.permissions.runner, p.resources.bucketPolicy], {
        ...ctx,
        values,
      }),
    ).toBe(false);
});
it('cleanup schedules actual delayed retention, not a fixed experiment-start deletion time', async () => {
  const f = setup(),
    e = await f.runner.evidence(Buffer.from('{"synthetic":true}')),
    o = f.objects.get(e.key)!;
  o.until = new Date(Date.parse(f.p.cleanupEnd) + 86400000).toISOString();
  f.setTime(Date.parse(bindings.end) + 1000);
  const plan = await f.runner.cleanupPlan();
  expect(plan.deletes).toHaveLength(0);
  expect(plan.pending).toHaveLength(1);
  expect(plan.additionalAuthorizationRequired).toBe(true);
  expect(plan.cleanupComplete).toBe(false);
  expect(plan.nextRetentionExpiry).toBe(o.until);
});
it('cleanup includes retained versions and delete markers and never bypasses retention', async () => {
  const f = setup(),
    e = await f.runner.evidence(Buffer.from('{"synthetic":true}'));
  f.setTime(Date.parse(bindings.start) + 25 * 60 * 60 * 1000);
  const plan = await f.runner.cleanupPlan();
  expect(plan.deletes).toEqual([{ Key: e.key, VersionId: e.versionId }]);
  expect(plan.cleanupComplete).toBe(false);
  expect(f.calls.filter((c) => c.operation.startsWith('Delete'))).toHaveLength(
    0,
  );
});
it('cleanup refuses unexpected bucket data and incomplete pagination', async () => {
  for (const data of [
    { Versions: [{ Key: 'foreign', VersionId: 'v1' }], IsTruncated: false },
    { Versions: [], DeleteMarkers: [], IsTruncated: true },
  ]) {
    const f = setup();
    f.setTime(Date.parse(bindings.end) + 1);
    vi.spyOn(f.transport, 'invoke').mockResolvedValue(data);
    await expect(f.runner.cleanupPlan()).rejects.toThrow(/UNKNOWN/);
    expect(
      f.calls.filter((c) => c.operation.startsWith('Delete')),
    ).toHaveLength(0);
  }
});
it('global journal denies excess workers, clock rollback and pending calls after restart', () => {
  const f = setup(),
    release = f.journal.worker('a');
  f.journal.worker('b');
  expect(() => f.journal.worker('c')).toThrow(/Worker/);
  release();
  f.journal.worker('a');
  f.journal.reserve('dynamodb', 1, true, 'runner');
  const reopened = new ExperimentLimits(
    f.root,
    digest(f.p),
    Date.parse(bindings.start),
    Date.parse(bindings.end),
    f.now,
    false,
  );
  stop.push(() => reopened.close());
  expect(reopened.state().blocked).toBe(1);
  expect(() => reopened.reserve('dynamodb', 1, true, 'runner')).toThrow();
  f.setTime(Date.parse(bindings.start));
  expect(() => reopened.reserve('s3', 1, false, 'reviewer')).toThrow();
});
it('manifest is deterministic and source has no credential lookup, SDK import or network default', () => {
  expect(digest(syntheticManifest(E))).toBe(digest(syntheticManifest(E)));
  const source = readFileSync(
    new URL(
      '../../server/customer/custody-lab/aws-experiment/runner.ts',
      import.meta.url,
    ),
    'utf8',
  );
  expect(source).not.toMatch(
    /process\.env|from ['"]@aws-sdk|fetch\(|https\.request|AssumeRoleCommand/,
  );
  expect(LIMITS.cases).toBe(24);
});
it('accepts a maximum 64KiB evidence body while bounding its larger response envelope', async () => {
  const f = setup(),
    body = Buffer.from(JSON.stringify({ data: 'x'.repeat(65525) }));
  expect(body.length).toBe(65536);
  const e = await f.runner.evidence(body);
  expect(await f.runner.verifyEvidence(e)).toEqual({
    verified: true,
    executionAuthorized: false,
  });
  await expect(
    f.runner.evidence(Buffer.from('x'.repeat(65537))),
  ).rejects.toThrow(/UNKNOWN/);
});
it('cannot release a reacquired worker using a stale release callback', () => {
  const f = setup(),
    old = f.journal.worker('one');
  old();
  f.journal.worker('one');
  expect(() => old()).toThrow(/released/);
  f.journal.worker('two');
  expect(() => f.journal.worker('three')).toThrow(/Worker/);
});
it.each(['dynamodb', 's3'] as const)(
  'persistent %s request and byte counters stop before transport',
  (service) => {
    const f = setup(),
      db = new DatabaseSync(f.journal.path);
    stop.push(() => db.close());
    db.prepare(`update limits set ${service}=?`).run(LIMITS[service] - 1);
    const id = f.journal.reserve(service, 1, false, 'reviewer');
    f.journal.finish(id, true);
    expect(() => f.journal.reserve(service, 1, false, 'reviewer')).toThrow(
      /limit/,
    );
    db.prepare(
      `update limits set ${service}=0,${service === 's3' ? 'sbytes' : 'dbytes'}=?`,
    ).run(LIMITS.bytes - 1);
    const last = f.journal.reserve(service, 1, false, 'reviewer');
    f.journal.finish(last, true);
    expect(() => f.journal.reserve(service, 1, false, 'reviewer')).toThrow(
      /limit/,
    );
  },
);
it('binds an independently initialized journal to the reviewed package before any RPC', () => {
  const f = setup(),
    root = mkdtempSync(join(realpathSync(tmpdir()), 'propel-wrong-journal-'));
  const wrong = new ExperimentLimits(
    root,
    'd'.repeat(64),
    Date.parse(bindings.start),
    Date.parse(bindings.end),
    f.now,
    true,
  );
  stop.push(() => {
    wrong.close();
    rmSync(root, { recursive: true, force: true });
  });
  expect(
    () => new SyntheticExperiment(f.p, f.pins, wrong, f.transport, f.now),
  ).toThrow(/journal/);
  expect(f.calls).toHaveLength(0);
});
it('full-bucket pagination covers every actual version before proposing deletions', async () => {
  const f = setup();
  for (let i = 0; i < 12; i++)
    await f.runner.evidence(Buffer.from(JSON.stringify({ synthetic: i })));
  f.setTime(Date.parse(bindings.start) + 25 * 60 * 60 * 1000);
  const plan = await f.runner.cleanupPlan();
  expect(plan.deletes).toHaveLength(12);
  const lists = f.calls.filter((c) => c.operation === 'ListObjectVersions');
  expect(lists).toHaveLength(2);
  expect(
    lists.every((c) => c.input.Prefix === '' && c.input.MaxKeys === 10),
  ).toBe(true);
});
it('cleanup remains incomplete for retained versions and delete markers, even when another version expired', async () => {
  const f = setup(),
    e = await f.runner.evidence(Buffer.from('{"synthetic":true}'));
  const base = f.transport.invoke.bind(f.transport);
  vi.spyOn(f.transport, 'invoke').mockImplementation((r) =>
    r.operation === 'ListObjectVersions'
      ? Promise.resolve({
          Versions: [{ Key: e.key, VersionId: e.versionId }],
          DeleteMarkers: [{ Key: e.key, VersionId: 'marker-version' }],
          IsTruncated: false,
        })
      : base(r),
  );
  f.setTime(Date.parse(bindings.end) + 1);
  const pending = await f.runner.cleanupPlan();
  expect(pending.cleanupComplete).toBe(false);
  expect(pending.deletes).toHaveLength(0);
  f.setTime(Date.parse(bindings.start) + 25 * 60 * 60 * 1000);
  const expired = await f.runner.cleanupPlan();
  expect(expired.deletes).toHaveLength(2);
  expect(expired.cleanupComplete).toBe(false);
});
it('deletes only after fresh retention checks and requires positive absence proof for both resources', async () => {
  const f = setup(),
    e = await f.runner.evidence(Buffer.from('{"synthetic":true}'));
  f.setTime(Date.parse(bindings.end) + 1);
  await f.runner.retireTable({ packageHash: digest(f.p), ...e });
  expect((await f.runner.verifyCleanup()).cleanupComplete).toBe(false);
  f.setTime(Date.parse(bindings.start) + 25 * 60 * 60 * 1000);
  const plan = await f.runner.cleanupPlan();
  const done = await f.runner.cleanupVersions(digest(plan));
  expect(done.cleanupComplete).toBe(false);
  const final = await f.runner.verifyCleanup();
  expect(final.cleanupComplete).toBe(true);
  expect(final.iamTeardownStillRequired).toBe(true);
  expect(
    f.calls
      .filter((c) => c.operation === 'DeleteObject')
      .every(
        (c) =>
          c.input.VersionId === e.versionId &&
          c.input.BypassGovernanceRetention === undefined,
      ),
  ).toBe(true);
});
it('never infers resource absence from HeadBucket or generic access/transport errors', () => {
  expect(() =>
    observedAbsence('HeadBucket', {
      name: 'NoSuchBucket',
      $metadata: { httpStatusCode: 404 },
    }),
  ).toThrow(/UNKNOWN/);
  expect(() =>
    observedAbsence('ListObjectVersions', {
      name: 'AccessDenied',
      $metadata: { httpStatusCode: 403 },
    }),
  ).toThrow();
  expect(
    observedAbsence('ListObjectVersions', {
      name: 'NoSuchBucket',
      $metadata: { httpStatusCode: 404 },
    }),
  ).toEqual({ ErrorCode: 'NoSuchBucket', HttpStatus: 404 });
});
it('bounds provider streams and destroys an oversized response without reading the remainder', async () => {
  let consumed = 0,
    destroyed = false;
  const stream = {
    async *[Symbol.asyncIterator]() {
      consumed++;
      yield Buffer.from('1234');
      consumed++;
      yield Buffer.from('5678');
      consumed++;
      yield Buffer.from('9');
    },
    destroy() {
      destroyed = true;
    },
  };
  await expect(boundedUtf8Body(stream, 5)).rejects.toThrow(/limit/);
  expect(consumed).toBe(2);
  expect(destroyed).toBe(true);
});
it('offline compiler emits reproducible unbound templates/hashes and never overwrites an existing package', () => {
  const outputs = [0, 1].map(() =>
    mkdtempSync(join(realpathSync(tmpdir()), 'propel-package-output-')),
  );
  for (const path of outputs)
    stop.push(() => rmSync(path, { recursive: true, force: true }));
  const results = outputs.map((path) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        ['scripts/prepare-aws-custody-package.mjs', '--template-output', path],
        { cwd: new URL('../..', import.meta.url), encoding: 'utf8', env: {} },
      ),
    ),
  );
  expect(results[0]).toEqual(results[1]);
  expect(results[0].executionAuthorized).toBe(false);
  const policy = readFileSync(
    join(outputs[0], 'permission-runner.json'),
    'utf8',
  );
  expect(policy).toContain('${ACCOUNT_ID}');
  expect(policy).not.toContain(A);
  expect(lstatSync(join(outputs[0], 'HASHES.json')).mode & 0o777).toBe(0o600);
  expect(() =>
    execFileSync(
      process.execPath,
      [
        'scripts/prepare-aws-custody-package.mjs',
        '--template-output',
        outputs[0],
      ],
      { cwd: new URL('../..', import.meta.url), stdio: 'ignore', env: {} },
    ),
  ).toThrow();
});
