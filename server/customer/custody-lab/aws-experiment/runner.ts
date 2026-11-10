import { createHash, randomUUID } from 'node:crypto';
import { canonical } from '../../../property/command-custody';
import {
  OfflineCustodyAttempt,
  holdPlan,
  spendPlan,
  ackPlan,
  readPlan,
  type OfflineCustodyPort,
} from '../protocol';
import {
  bindPackage,
  digest,
  LIMITS,
  EVIDENCE_LABELS,
  type ExperimentPackage,
} from './package';
import { ExperimentLimits } from './limits';

export interface Request {
  service: 'dynamodb' | 's3';
  operation: string;
  input: Record<string, unknown>;
  role: 'admin' | 'runner' | 'reviewer';
  maxAttempts: 1;
  maxResponseBytes: number;
  budgetId?: number;
}
/** Disposable synthetic transport only; never an application-facing adapter. */
export interface ExperimentTransport {
  invoke(request: Request): Promise<Record<string, unknown>>;
}
export interface Pins {
  tableId: string;
  packageHash: string;
}
function record(v: unknown): Record<string, unknown> {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.getPrototypeOf(v) !== Object.prototype
  )
    throw Error('Exact provider evidence required');
  return v as Record<string, unknown>;
}
function same(a: unknown, b: unknown) {
  return canonical(a) === canonical(b);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      if (
        Object.keys(value).length !== value.length ||
        Object.keys(value).some((key, index) => key !== String(index))
      )
        throw Error('Exact JSON array required');
    } else record(value);
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}
function version(v: unknown): string {
  if (typeof v !== 'string' || !v || v === 'null' || v.length > 1024)
    throw Error('Exact S3 version required');
  return v;
}
const mutate = new Set([
  'TransactWriteItems',
  'PutObject',
  'DeleteObject',
  'DeleteTable',
  'DeleteBucket',
]);
export class SyntheticExperiment {
  readonly package: ExperimentPackage;
  constructor(
    pkg: ExperimentPackage,
    pins: Pins,
    private readonly limits: ExperimentLimits,
    private readonly transport: ExperimentTransport,
    private readonly now: () => number,
  ) {
    const rebuilt = bindPackage(pkg.bindings);
    if (
      !same(pkg, rebuilt) ||
      pins.packageHash !== digest(pkg) ||
      !/^[a-f0-9-]{36}$/.test(pins.tableId)
    )
      throw Error('Reviewed private package and table identity required');
    const state = limits.state();
    if (
      state.spec !== pins.packageHash ||
      state.start !== Date.parse(pkg.bindings.start) ||
      state.end !== Date.parse(pkg.bindings.end)
    )
      throw Error('Reviewed journal binding required');
    this.pins = freeze(structuredClone(pins));
    this.package = freeze(rebuilt);
  }
  private readonly pins: Pins;
  private async checked<T>(
    work: () => Promise<T>,
    phase = 'runner',
    worker: string = randomUUID(),
  ) {
    const release = this.limits.worker(worker);
    try {
      return await work();
    } catch {
      this.limits.quarantine(phase);
      throw Error('Experiment UNKNOWN; durable quarantine; exact reads only');
    } finally {
      release();
    }
  }
  private async call(
    role: Request['role'],
    service: Request['service'],
    operation: string,
    input: Record<string, unknown>,
    responseBytes = 4096,
  ) {
    // Recompile from private bindings so mutation of a returned package cannot broaden a call.
    if (digest(this.package) !== this.pins.packageHash)
      throw Error('Package changed');
    const allowed =
      role === 'runner'
        ? [
            'DescribeTable',
            'TransactWriteItems',
            'TransactGetItems',
            'PutObject',
          ]
        : role === 'reviewer'
          ? [
              'DescribeTable',
              'TransactGetItems',
              'GetObject',
              'GetObjectRetention',
              'GetObjectLegalHold',
              'GetObjectLockConfiguration',
              'GetBucketVersioning',
              'GetPublicAccessBlock',
              'GetBucketOwnershipControls',
              'GetBucketEncryption',
              'GetBucketPolicy',
              'GetBucketLocation',
              'ListObjectVersions',
            ]
          : [
              'DescribeTable',
              'ListObjectVersions',
              'GetObjectRetention',
              'GetObjectLegalHold',
              'DeleteObject',
              'DeleteTable',
              'DeleteBucket',
            ];
    if (
      !allowed.includes(operation) ||
      responseBytes > LIMITS.responseBytes ||
      responseBytes < 0
    )
      throw Error('Operation outside disposable scope');
    if (service === 'dynamodb') {
      if (operation === 'DescribeTable' || operation === 'DeleteTable') {
        if (input.TableName !== this.package.table)
          throw Error('Table mismatch');
      } else if (
        !Array.isArray(input.TransactItems) ||
        input.TransactItems.some((v) =>
          Object.values(record(v)).some(
            (x) => record(x).TableName !== this.package.table,
          ),
        )
      )
        throw Error('Exact transaction table required');
      if (
        operation === 'TransactWriteItems' &&
        !this.package.manifest.cases.some((c) =>
          [
            holdPlan(c.binding),
            spendPlan(c.binding),
            ackPlan(c.binding, c.status),
          ].some((plan) => same(plan, input)),
        )
      )
        throw Error('Omitted or altered custody conditions');
      if (
        operation === 'TransactGetItems' &&
        !this.package.manifest.cases.some((c) =>
          same(readPlan(c.binding), input),
        )
      )
        throw Error('Exact original atomic read required');
    } else if (
      input.Bucket !== this.package.bucket ||
      input.ExpectedBucketOwner !== this.package.bindings.account ||
      (input.Key !== undefined &&
        (typeof input.Key !== 'string' ||
          !input.Key.startsWith(this.package.prefix)))
    )
      throw Error('Exact owned evidence bucket required');
    const request = {
      service,
      operation,
      input: freeze(structuredClone(input)),
      role,
      maxAttempts: 1 as const,
      maxResponseBytes: responseBytes,
    };
    const bytes = Buffer.byteLength(canonical(input)) + responseBytes + 512;
    const id = this.limits.reserve(
      service,
      bytes,
      mutate.has(operation),
      role === 'admin' ? 'cleanup' : role,
      digest(request),
    );
    try {
      const result = record(
        await this.transport.invoke({ ...request, budgetId: id }),
      );
      if (Buffer.byteLength(canonical(result)) > responseBytes)
        throw Error('Provider response limit');
      this.limits.finish(id, true);
      return result;
    } catch {
      this.limits.finish(id, false);
      throw Error('Experiment UNKNOWN; no automatic retry');
    }
  }
  private async pin(role: Request['role']) {
    const reply = await this.call(role, 'dynamodb', 'DescribeTable', {
      TableName: this.package.table,
    });
    const t = record(reply.Table),
      throughput = record(t.ProvisionedThroughput);
    if (
      t.TableArn !== this.package.tableArn ||
      t.TableId !== this.pins.tableId ||
      t.TableStatus !== 'ACTIVE' ||
      !same(t.KeySchema, this.package.resources.table.KeySchema) ||
      !same(
        t.AttributeDefinitions,
        this.package.resources.table.AttributeDefinitions,
      ) ||
      throughput.ReadCapacityUnits !== 30 ||
      throughput.WriteCapacityUnits !== 10 ||
      (t.GlobalSecondaryIndexes as unknown[] | undefined)?.length ||
      (t.LocalSecondaryIndexes as unknown[] | undefined)?.length ||
      (t.Replicas as unknown[] | undefined)?.length ||
      t.LatestStreamArn !== undefined ||
      record(t.SSEDescription ?? {}).KMSMasterKeyArn !== undefined
    )
      throw Error('Target drift; quarantine writes');
  }
  private async preflightCore() {
    await this.pin('reviewer');
    const owner = {
      Bucket: this.package.bucket,
      ExpectedBucketOwner: this.package.bindings.account,
    };
    const get = (operation: string) =>
      this.call('reviewer', 's3', operation, owner);
    const lock = await get('GetObjectLockConfiguration'),
      v = await get('GetBucketVersioning'),
      pub = await get('GetPublicAccessBlock'),
      ownership = await get('GetBucketOwnershipControls'),
      encryption = await get('GetBucketEncryption'),
      policy = await get('GetBucketPolicy'),
      location = await get('GetBucketLocation');
    const rules = record(encryption.ServerSideEncryptionConfiguration).Rules;
    if (
      !same(
        lock.ObjectLockConfiguration,
        this.package.resources.lock.ObjectLockConfiguration,
      ) ||
      v.Status !== 'Enabled' ||
      !same(
        pub.PublicAccessBlockConfiguration,
        this.package.resources.publicAccess.PublicAccessBlockConfiguration,
      ) ||
      !same(
        ownership.OwnershipControls,
        this.package.resources.ownership.OwnershipControls,
      ) ||
      !Array.isArray(rules) ||
      rules.length !== 1 ||
      record(record(rules[0]).ApplyServerSideEncryptionByDefault)
        .SSEAlgorithm !== 'AES256' ||
      record(record(rules[0]).ApplyServerSideEncryptionByDefault)
        .KMSMasterKeyID !== undefined ||
      record(rules[0]).BucketKeyEnabled === true ||
      !same(
        JSON.parse(String(policy.Policy)),
        this.package.resources.bucketPolicy,
      ) ||
      (location.LocationConstraint !== undefined &&
        location.LocationConstraint !== null)
    )
      throw Error('Independent bucket preflight mismatch');
    return {
      mechanicsPreflight: true,
      independentAdministrationAccepted: false,
      executionAuthorized: false,
    };
  }
  preflight() {
    return this.checked(() => this.preflightCore());
  }
  private port(): OfflineCustodyPort {
    const write = async (plan: Parameters<OfflineCustodyPort['write']>[0]) => {
      await this.pin('runner');
      await this.call(
        'runner',
        'dynamodb',
        'TransactWriteItems',
        plan as unknown as Record<string, unknown>,
      );
    };
    return {
      hold: write,
      write,
      read: async (plan) => {
        await this.pin('runner');
        return this.read(plan, 'runner');
      },
    };
  }
  private async read(
    plan: ReturnType<typeof readPlan>,
    role: 'runner' | 'reviewer',
  ) {
    const reply = await this.call(
      role,
      'dynamodb',
      'TransactGetItems',
      plan as unknown as Record<string, unknown>,
    );
    if (!Array.isArray(reply.Responses) || reply.Responses.length !== 6)
      throw Error('Atomic original snapshot required');
    return reply.Responses.map((v) => {
      const r = record(v);
      if (Object.keys(r).some((k) => k !== 'Item'))
        throw Error('Unexpected snapshot');
      return r.Item ?? null;
    });
  }
  /** The caller selects a preallocated case; this does NOT simulate customer authorization. */
  run(index: number, worker: string) {
    return this.checked(() => this.runCore(index), 'runner', worker);
  }
  private async runCore(index: number) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= LIMITS.cases)
      throw Error('Preallocated synthetic case required');
    await this.preflightCore();
    const c = structuredClone(this.package.manifest.cases[index]);
    const attempt = new OfflineCustodyAttempt(
      this.port(),
      c.binding,
      async () =>
        this.now() >= Date.parse(this.package.bindings.start) &&
        this.now() < Date.parse(this.package.bindings.end),
    );
    await attempt.spend();
    await attempt.acknowledge(c.status);
    return await attempt.reconcile(async () => c.status);
  }
  review(index: number) {
    return this.checked(() => this.reviewCore(index));
  }
  private async reviewCore(index: number) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= LIMITS.cases)
      throw Error('Exact case required');
    await this.pin('reviewer');
    const c = this.package.manifest.cases[index];
    const noWrite = async () => {
      throw Error('Reviewer is read-only');
    };
    const port: OfflineCustodyPort = {
      hold: noWrite,
      write: noWrite,
      read: (p) => this.read(p, 'reviewer'),
    };
    const attempt = new OfflineCustodyAttempt(
      port,
      c.binding,
      async () => true,
    );
    return attempt.reconcile(async () => c.status);
  }
  evidence(bytes: Uint8Array) {
    return this.checked(() => this.evidenceCore(bytes));
  }
  private async evidenceCore(bytes: Uint8Array) {
    if (bytes.byteLength > LIMITS.objectBytes)
      throw Error('Evidence size limit');
    const text = Buffer.from(bytes).toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(Buffer.from(bytes)))
      throw Error('UTF8 JSON evidence only');
    JSON.parse(text);
    await this.preflightCore();
    const sha = createHash('sha256').update(bytes).digest('hex'),
      key = `${this.package.prefix}${sha}.json`;
    const reply = await this.call('runner', 's3', 'PutObject', {
      Bucket: this.package.bucket,
      ExpectedBucketOwner: this.package.bindings.account,
      Key: key,
      Body: text,
      ServerSideEncryption: 'AES256',
      IfNoneMatch: '*',
      ChecksumSHA256: Buffer.from(sha, 'hex').toString('base64'),
      ChecksumAlgorithm: 'SHA256',
      Metadata: EVIDENCE_LABELS,
    });
    return {
      key,
      versionId: version(reply.VersionId),
      sha256: sha,
      bytes: bytes.byteLength,
    };
  }
  verifyEvidence(expected: {
    key: string;
    versionId: string;
    sha256: string;
    bytes: number;
  }) {
    return this.checked(() =>
      this.verifyEvidenceCore(structuredClone(expected)),
    );
  }
  private async verifyEvidenceCore(expected: {
    key: string;
    versionId: string;
    sha256: string;
    bytes: number;
  }) {
    if (
      !/^[a-f0-9]{64}$/.test(expected.sha256) ||
      expected.key !== `${this.package.prefix}${expected.sha256}.json` ||
      !Number.isSafeInteger(expected.bytes) ||
      expected.bytes < 0 ||
      expected.bytes > LIMITS.objectBytes
    )
      throw Error('Exact evidence reference required');
    const input = {
      Bucket: this.package.bucket,
      ExpectedBucketOwner: this.package.bindings.account,
      Key: expected.key,
      VersionId: version(expected.versionId),
    };
    const value = await this.call(
        'reviewer',
        's3',
        'GetObject',
        { ...input, ChecksumMode: 'ENABLED' },
        expected.bytes * 6 + 8192,
      ),
      retention = await this.call(
        'reviewer',
        's3',
        'GetObjectRetention',
        input,
      ),
      legal = await this.call('reviewer', 's3', 'GetObjectLegalHold', input);
    if (typeof value.Body !== 'string')
      throw Error('Bounded UTF8 evidence body required');
    const content = Buffer.from(value.Body, 'utf8');
    const modified = Date.parse(String(value.LastModified)),
      until = Date.parse(String(record(retention.Retention).RetainUntilDate));
    const lock = await this.call(
      'reviewer',
      's3',
      'GetObjectLockConfiguration',
      {
        Bucket: this.package.bucket,
        ExpectedBucketOwner: this.package.bindings.account,
      },
    );
    if (
      content.length !== expected.bytes ||
      createHash('sha256').update(content).digest('hex') !== expected.sha256 ||
      value.VersionId !== expected.versionId ||
      !same(value.Metadata, EVIDENCE_LABELS) ||
      value.ChecksumSHA256 !==
        Buffer.from(expected.sha256, 'hex').toString('base64') ||
      !Number.isFinite(modified) ||
      modified < Date.parse(this.package.bindings.start) ||
      modified > Date.parse(this.package.bindings.end) ||
      !Number.isFinite(until) ||
      until < modified + 24 * 60 * 60 * 1000 ||
      until <= this.now() ||
      !same(
        lock.ObjectLockConfiguration,
        this.package.resources.lock.ObjectLockConfiguration,
      ) ||
      record(retention.Retention).Mode !== 'GOVERNANCE' ||
      !Number.isFinite(
        Date.parse(String(record(retention.Retention).RetainUntilDate)),
      ) ||
      record(legal.LegalHold).Status !== 'OFF'
    )
      throw Error('Evidence mismatch');
    return { verified: true, executionAuthorized: false as const };
  }
  /** Read actual retention on EVERY version. A plan, not a permission to delete or a retention bypass. */
  cleanupPlan() {
    return this.checked(() => this.cleanupPlanCore(), 'cleanup');
  }
  private async cleanupPlanCore() {
    if (this.now() < Date.parse(this.package.bindings.end))
      throw Error('Mutation window still open');
    const versions: { Key: string; VersionId: string }[] = [],
      markers: { Key: string; VersionId: string }[] = [];
    let keyMarker: string | undefined, versionMarker: string | undefined;
    const cursors = new Set<string>();
    for (let page = 0; page < 100; page++) {
      const listed = await this.call(
        'admin',
        's3',
        'ListObjectVersions',
        {
          Bucket: this.package.bucket,
          ExpectedBucketOwner: this.package.bindings.account,
          Prefix: '',
          MaxKeys: 10,
          ...(keyMarker
            ? { KeyMarker: keyMarker, VersionIdMarker: versionMarker }
            : {}),
        },
        LIMITS.objectBytes,
      );
      for (const [name, destination] of [
        ['Versions', versions],
        ['DeleteMarkers', markers],
      ] as const) {
        const entries = listed[name] ?? [];
        if (!Array.isArray(entries))
          throw Error('Complete version inventory required');
        for (const raw of entries) {
          const v = record(raw);
          if (
            typeof v.Key !== 'string' ||
            !v.Key.startsWith(this.package.prefix)
          )
            throw Error('Foreign cleanup key');
          destination.push({ Key: v.Key, VersionId: version(v.VersionId) });
        }
      }
      if (listed.IsTruncated === false) break;
      if (
        listed.IsTruncated !== true ||
        typeof listed.NextKeyMarker !== 'string' ||
        typeof listed.NextVersionIdMarker !== 'string'
      )
        throw Error('Incomplete version pagination');
      keyMarker = listed.NextKeyMarker;
      versionMarker = listed.NextVersionIdMarker;
      const cursor = `${keyMarker}\0${versionMarker}`;
      if (cursors.has(cursor) || page === 99)
        throw Error('Repeated/unbounded inventory');
      cursors.add(cursor);
    }
    const deletes: { Key: string; VersionId: string }[] = [],
      pending: { Key: string; VersionId: string; until: string }[] = [];
    for (const v of versions) {
      const input = {
        Bucket: this.package.bucket,
        ExpectedBucketOwner: this.package.bindings.account,
        ...v,
      };
      const r = record(
          (await this.call('admin', 's3', 'GetObjectRetention', input))
            .Retention,
        ),
        h = record(
          (await this.call('admin', 's3', 'GetObjectLegalHold', input))
            .LegalHold,
        );
      const until = Date.parse(String(r.RetainUntilDate));
      if (
        r.Mode !== 'GOVERNANCE' ||
        !Number.isFinite(until) ||
        h.Status !== 'OFF'
      )
        throw Error('Retention/hold evidence unresolved; no cleanup');
      if (this.now() < until)
        pending.push({ ...v, until: new Date(until).toISOString() });
      else deletes.push(v);
    }
    return {
      deletes: pending.length ? [] : [...deletes, ...markers],
      pending,
      requiresSeparateCleanupApproval: true,
      executionAuthorized: false as const,
      cleanupComplete: false as const,
      nextRetentionExpiry: pending.length
        ? new Date(
            Math.max(...pending.map((v) => Date.parse(v.until))),
          ).toISOString()
        : null,
      additionalAuthorizationRequired: pending.some(
        (v) => Date.parse(v.until) >= Date.parse(this.package.cleanupEnd),
      ),
      versions,
    };
  }
  /** Consent hashes are review inputs, not an authorization issuer. Real role access remains external. */
  retireTable(reviewedArchive: {
    packageHash: string;
    key: string;
    versionId: string;
    sha256: string;
    bytes: number;
  }) {
    reviewedArchive = structuredClone(reviewedArchive);
    return this.checked(async () => {
      if (
        this.now() < Date.parse(this.package.bindings.end) ||
        this.now() >= Date.parse(this.package.tableEnd) ||
        reviewedArchive.packageHash !== this.pins.packageHash
      )
        throw Error('Reviewed retirement window required');
      // Independently reread exact evidence bytes; expired retention cannot serve as this gate.
      await this.verifyEvidenceCore(reviewedArchive);
      await this.pin('admin');
      await this.call('admin', 'dynamodb', 'DeleteTable', {
        TableName: this.package.table,
      });
      return {
        tableDeletionAcknowledged: true,
        cleanupComplete: false,
        executionAuthorized: false,
      };
    }, 'cleanup');
  }
  cleanupVersions(approvedPlanHash: string) {
    return this.checked(async () => {
      const plan = await this.cleanupPlanCore();
      if (plan.pending.length) return plan;
      if (digest(plan) !== approvedPlanHash)
        throw Error('Exact fresh reviewed cleanup plan required');
      for (const v of plan.deletes) {
        const input = {
          Bucket: this.package.bucket,
          ExpectedBucketOwner: this.package.bindings.account,
          ...v,
        };
        if (plan.versions.some((x) => same(x, v))) {
          const r = record(
              (await this.call('admin', 's3', 'GetObjectRetention', input))
                .Retention,
            ),
            h = record(
              (await this.call('admin', 's3', 'GetObjectLegalHold', input))
                .LegalHold,
            );
          const until = Date.parse(String(r.RetainUntilDate));
          if (
            r.Mode !== 'GOVERNANCE' ||
            !Number.isFinite(until) ||
            until > this.now() ||
            h.Status !== 'OFF'
          )
            throw Error('Retention changed; no deletion');
        }
        await this.call('admin', 's3', 'DeleteObject', input);
      }
      const remaining = await this.cleanupPlanCore();
      if (remaining.deletes.length || remaining.pending.length)
        return { ...remaining, cleanupComplete: false };
      await this.call('admin', 's3', 'DeleteBucket', {
        Bucket: this.package.bucket,
        ExpectedBucketOwner: this.package.bindings.account,
      });
      return {
        bucketDeletionAcknowledged: true,
        cleanupComplete: false,
        executionAuthorized: false,
      };
    }, 'cleanup');
  }
  verifyCleanup() {
    return this.checked(async () => {
      const t = await this.call('admin', 'dynamodb', 'DescribeTable', {
        TableName: this.package.table,
      });
      const b = await this.call('admin', 's3', 'ListObjectVersions', {
        Bucket: this.package.bucket,
        ExpectedBucketOwner: this.package.bindings.account,
        Prefix: '',
        MaxKeys: 1,
      });
      // A trusted future SDK shim must normalize ONLY these explicit provider errors.
      const tableAbsent =
        t.ErrorCode === 'ResourceNotFoundException' && t.HttpStatus === 400;
      const bucketAbsent =
        b.ErrorCode === 'NoSuchBucket' && b.HttpStatus === 404;
      return {
        tableAbsent,
        bucketAbsent,
        cleanupComplete: tableAbsent && bucketAbsent,
        iamTeardownStillRequired: true,
        executionAuthorized: false,
      };
    }, 'cleanup');
  }
}
