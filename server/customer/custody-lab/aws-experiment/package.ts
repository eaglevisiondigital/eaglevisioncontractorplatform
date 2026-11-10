import { createHash } from 'node:crypto';
import { canonical } from '../../../property/command-custody';
import { custodyKeys, type CustodyBinding } from '../protocol';

export const BASELINE = '6d80235110f87a2e24b7f988bdf0d238b36c8f58';
export const EVIDENCE_LABELS = Object.freeze({
  'acceptance-class': 'aws-mechanics-only',
  'independent-administration': 'unverified',
  'rollback-resistance': 'unverified',
  'independent-recovery': 'unverified',
  'genuine-auth-revocation': 'unverified',
  'operational-acceptance': 'not-run',
});
export const LIMITS = Object.freeze({
  workers: 2,
  cases: 24,
  dynamodb: 10000,
  s3: 2000,
  bytes: 10 * 1024 * 1024,
  objectBytes: 64 * 1024,
  responseBytes: 512 * 1024,
  windowMs: 2 * 60 * 60 * 1000,
});
export const digest = (v: unknown) =>
  createHash('sha256').update(canonical(v)).digest('hex');
export interface Bindings {
  account: string;
  experiment: string;
  start: string;
  end: string;
  principals: { admin: string; runner: string; reviewer: string };
}
export interface Statement {
  Sid: string;
  Effect: 'Allow' | 'Deny';
  Action: string[];
  Resource?: string[];
  Principal?: '*' | { AWS: string };
  Condition?: Record<string, Record<string, unknown>>;
}
export interface Policy {
  Version: '2012-10-17';
  Statement: Statement[];
}
const policy = (Statement: Statement[]): Policy => ({
  Version: '2012-10-17',
  Statement,
});
const uuid = (e: string, n: number) => {
  const h = digest({ e, n });
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export function syntheticManifest(experiment: string) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      experiment,
    )
  )
    throw Error('Exact synthetic experiment UUID required');
  const organization = uuid(experiment, 1),
    user = uuid(experiment, 2);
  const cases = Array.from({ length: LIMITS.cases }, (_, index) => {
    const n = 100 + index * 20;
    const binding: CustodyBinding = {
      reference: {
        schema: 'customer-request-v2',
        organization_id: organization,
        customer_id: uuid(experiment, 3),
        location_id: uuid(experiment, 4),
        version_id: uuid(experiment, n),
        publication_id: uuid(experiment, n + 1),
        request_id: uuid(experiment, n + 2),
        user_id: user,
        scope_sha256: digest({ experiment, index, scope: true }),
        request_sha256: digest({ experiment, index, synthetic: true }),
        acknowledgment: 'review-only-v2',
        choice: 'request_changes_review',
      },
      principal: uuid(experiment, n + 3),
      session_id: uuid(experiment, n + 4),
      consumer: {
        pid: 1000 + index,
        backend_start: '2026-11-10T00:00:00.000Z',
        transaction_id: String(4294967300 + index),
      },
      target_sha256: digest({ BASELINE, experiment, syntheticTarget: true }),
      epoch: 1,
      revision: 1,
    };
    const r = binding.reference;
    const receipt = {
      organization_id: r.organization_id,
      customer_id: r.customer_id,
      location_id: r.location_id,
      version_id: r.version_id,
      publication_id: r.publication_id,
      request_id: r.request_id,
      scope_sha256: r.scope_sha256,
      request_sha256: r.request_sha256,
      choice: r.choice,
      note: 'Fictional acceptance only',
      id: uuid(experiment, n + 5),
      estimate_id: uuid(experiment, n + 6),
      version_number: 1,
      recorded_at: '2026-11-10T00:00:01.000Z',
    };
    return {
      index,
      binding,
      status: {
        reference: r,
        outcome: 'confirmed',
        custody: 'claimed-v2',
        receipt,
        replay_allowed: false,
        financial_execution: false,
      },
    };
  });
  return {
    schema: 'propel-aws-experiment-v1',
    baseline: BASELINE,
    experiment,
    limits: LIMITS,
    cases,
    operationalReady: false,
  };
}
export function bindPackage(input: Bindings) {
  const b = structuredClone(input);
  if (
    (Array.isArray(b) ? 'ARRAY' : Object.keys(b).sort().join()) !==
      'account,end,experiment,principals,start' ||
    typeof b.account !== 'string' ||
    !/^\d{12}$/.test(b.account)
  )
    throw Error('Exact private account binding required');
  const start = Date.parse(b.start),
    end = Date.parse(b.end);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    new Date(start).toISOString() !== b.start ||
    new Date(end).toISOString() !== b.end ||
    end <= start ||
    end - start > LIMITS.windowMs
  )
    throw Error('Exact UTC window required');
  if (
    (Array.isArray(b.principals)
      ? 'ARRAY'
      : Object.keys(b.principals).sort().join()) !== 'admin,reviewer,runner' ||
    Object.values(b.principals).some(
      (p) =>
        typeof p !== 'string' ||
        !new RegExp(
          `^arn:aws:iam::${b.account}:user/[A-Za-z0-9+=,.@_/-]+$`,
        ).test(p),
    ) ||
    b.principals.reviewer === b.principals.runner ||
    b.principals.reviewer === b.principals.admin
  )
    throw Error(
      'Exact existing MFA-user principals; separate reviewer required',
    );
  const manifest = syntheticManifest(b.experiment),
    table = 'propel_disposable_custody',
    region = 'us-east-1';
  const bucket = `propel-custody-${b.account}-${b.experiment.replaceAll('-', '')}`;
  const tableArn = `arn:aws:dynamodb:${region}:${b.account}:table/${table}`,
    bucketArn = `arn:aws:s3:::${bucket}`,
    objects = `${bucketArn}/${b.experiment}/*`;
  const roles = Object.fromEntries(
    ['admin', 'runner', 'reviewer'].map((role) => [
      role,
      `propel-custody-${b.experiment}-${role}`,
    ]),
  ) as Record<keyof Bindings['principals'], string>;
  const cleanupEnd = new Date(start + 48 * 60 * 60 * 1000).toISOString(),
    tableEnd = new Date(start + 24 * 60 * 60 * 1000).toISOString();
  const window = {
    DateGreaterThanEquals: { 'aws:CurrentTime': b.start },
    DateLessThan: { 'aws:CurrentTime': b.end },
  };
  const cleanupWindow = {
    DateGreaterThanEquals: { 'aws:CurrentTime': b.end },
    DateLessThan: { 'aws:CurrentTime': cleanupEnd },
  };
  const keys = [
    ...new Set(
      manifest.cases.flatMap((c) => Object.values(custodyKeys(c.binding))),
    ),
  ];
  const fences = keys.filter((k) => k.startsWith('fence#'));
  const org = manifest.cases[0].binding.reference.organization_id,
    user = manifest.cases[0].binding.reference.user_id;
  const writePatterns = [
    `claim#${org}#*`,
    `source#${org}#${user}#*`,
    `ack#${org}#*`,
    `hold#claim#${org}#*`,
    `hold#source#${org}#${user}#*`,
  ];
  const readPatterns = [...fences, ...writePatterns];
  const allow = (
    Sid: string,
    Action: string[],
    Resource: string[],
    Condition: Statement['Condition'] = window,
  ): Statement => ({ Sid, Effect: 'Allow', Action, Resource, Condition });
  const data = (op: string, leading: string[]) => ({
    ...window,
    StringEquals: { 'aws:ResourceTag/Experiment': b.experiment },
    'ForAnyValue:StringEquals': { 'dynamodb:EnclosingOperation': [op] },
    'ForAllValues:StringLike': { 'dynamodb:LeadingKeys': leading },
    Null: { 'dynamodb:LeadingKeys': 'false' },
  });
  const s3read = [
    's3:GetObjectVersion',
    's3:GetObjectRetention',
    's3:GetObjectLegalHold',
  ];
  const s3configRead = [
    's3:GetBucketLocation',
    's3:GetBucketVersioning',
    's3:GetBucketPublicAccessBlock',
    's3:GetBucketOwnershipControls',
    's3:GetEncryptionConfiguration',
    's3:GetBucketObjectLockConfiguration',
    's3:GetBucketPolicy',
  ];
  const admin = policy([
    allow(
      'CreateExactTable',
      ['dynamodb:CreateTable', 'dynamodb:TagResource'],
      [tableArn],
      {
        ...window,
        StringEquals: { 'aws:RequestTag/Experiment': b.experiment },
      },
    ),
    allow(
      'ReadExactTable',
      ['dynamodb:DescribeTable', 'dynamodb:ListTagsOfResource'],
      [tableArn],
      {
        DateGreaterThanEquals: { 'aws:CurrentTime': b.start },
        DateLessThan: { 'aws:CurrentTime': cleanupEnd },
      },
    ),
    allow(
      'FixtureFenceOnly',
      ['dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:GetItem'],
      [tableArn],
      {
        ...window,
        'ForAllValues:StringEquals': { 'dynamodb:LeadingKeys': fences },
        Null: {
          'dynamodb:LeadingKeys': 'false',
          'dynamodb:EnclosingOperation': 'true',
        },
      },
    ),
    allow(
      'CreateConfigureExactBucket',
      [
        's3:CreateBucket',
        's3:PutBucketTagging',
        's3:PutBucketVersioning',
        's3:PutBucketObjectLockConfiguration',
        's3:PutBucketPublicAccessBlock',
        's3:PutBucketOwnershipControls',
        's3:PutEncryptionConfiguration',
        's3:PutBucketPolicy',
      ],
      [bucketArn],
    ),
    allow('InspectExactBucket', s3configRead, [bucketArn], {
      DateGreaterThanEquals: { 'aws:CurrentTime': b.start },
      DateLessThan: { 'aws:CurrentTime': cleanupEnd },
    }),
    allow(
      'EnumerateVersions',
      ['s3:ListBucketVersions', 's3:ListBucket'],
      [bucketArn],
      cleanupWindow,
    ),
    allow('InspectRetainedVersions', s3read, [objects], cleanupWindow),
    allow('DeleteExactTable', ['dynamodb:DeleteTable'], [tableArn], {
      StringEquals: { 'aws:ResourceTag/Experiment': b.experiment },
      DateGreaterThanEquals: { 'aws:CurrentTime': b.end },
      DateLessThan: { 'aws:CurrentTime': tableEnd },
    }),
    allow(
      'DeleteExpiredVersions',
      ['s3:DeleteObjectVersion'],
      [objects],
      cleanupWindow,
    ),
    allow('DeleteEmptyBucket', ['s3:DeleteBucket'], [bucketArn], cleanupWindow),
  ]);
  const runner = policy([
    allow('PinTable', ['dynamodb:DescribeTable'], [tableArn]),
    allow(
      'ConditionalMarkerWrites',
      ['dynamodb:PutItem'],
      [tableArn],
      data('TransactWriteItems', writePatterns),
    ),
    allow(
      'OriginalFenceConditions',
      ['dynamodb:ConditionCheckItem'],
      [tableArn],
      data('TransactWriteItems', readPatterns),
    ),
    allow(
      'AtomicOriginalReads',
      ['dynamodb:GetItem'],
      [tableArn],
      data('TransactGetItems', readPatterns),
    ),
    allow('AppendEvidence', ['s3:PutObject'], [objects], {
      ...window,
      StringEquals: {
        's3:x-amz-server-side-encryption': 'AES256',
        's3:if-none-match': '*',
      },
    }),
  ]);
  const reviewer = policy([
    allow('PinTable', ['dynamodb:DescribeTable'], [tableArn], {
      DateGreaterThanEquals: { 'aws:CurrentTime': b.start },
      DateLessThan: { 'aws:CurrentTime': tableEnd },
    }),
    allow('ReadOriginalSnapshot', ['dynamodb:GetItem'], [tableArn], {
      ...data('TransactGetItems', readPatterns),
      DateLessThan: { 'aws:CurrentTime': tableEnd },
    }),
    allow('InspectBucket', s3configRead, [bucketArn], {
      DateGreaterThanEquals: { 'aws:CurrentTime': b.start },
      DateLessThan: { 'aws:CurrentTime': cleanupEnd },
    }),
    allow('ReadExactVersions', s3read, [objects], {
      DateGreaterThanEquals: { 'aws:CurrentTime': b.start },
      DateLessThan: { 'aws:CurrentTime': cleanupEnd },
    }),
    allow('EnumerateEvidence', ['s3:ListBucketVersions'], [bucketArn], {
      DateGreaterThanEquals: { 'aws:CurrentTime': b.start },
      DateLessThan: { 'aws:CurrentTime': cleanupEnd },
      StringLike: { 's3:prefix': `${b.experiment}/*` },
    }),
  ]);
  const trust = Object.fromEntries(
    (Object.keys(roles) as (keyof typeof roles)[]).map((role) => [
      role,
      policy([
        {
          Sid: 'OnlyBoundMfaPrincipal',
          Effect: 'Allow',
          Principal: { AWS: b.principals[role] },
          Action: ['sts:AssumeRole'],
          Condition: {
            Bool: { 'aws:MultiFactorAuthPresent': 'true' },
            DateGreaterThanEquals: { 'aws:CurrentTime': b.start },
            DateLessThan: {
              'aws:CurrentTime': role === 'runner' ? b.end : cleanupEnd,
            },
            StringEquals: { 'sts:ExternalId': b.experiment },
          },
        },
      ]),
    ]),
  ) as Record<keyof typeof roles, Policy>;
  const deny = (
    Sid: string,
    Action: string[],
    Resource: string[],
    Condition?: Statement['Condition'],
  ): Statement => ({
    Sid,
    Effect: 'Deny',
    Principal: '*',
    Action,
    Resource,
    ...(Condition ? { Condition } : {}),
  });
  const bucketPolicy = policy([
    deny('TlsOnly', ['s3:*'], [bucketArn, objects], {
      Bool: { 'aws:SecureTransport': 'false' },
    }),
    deny(
      'NoRetentionBypass',
      [
        's3:BypassGovernanceRetention',
        's3:PutObjectRetention',
        's3:PutObjectLegalHold',
      ],
      [objects],
    ),
    deny('RequireConditionalPut', ['s3:PutObject'], [objects], {
      StringNotEquals: { 's3:if-none-match': '*' },
    }),
    deny('RequireSseS3', ['s3:PutObject'], [objects], {
      StringNotEquals: { 's3:x-amz-server-side-encryption': 'AES256' },
    }),
  ]);
  const resources = {
    table: {
      TableName: table,
      AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
      BillingMode: 'PROVISIONED',
      ProvisionedThroughput: { ReadCapacityUnits: 30, WriteCapacityUnits: 10 },
      TableClass: 'STANDARD',
      Tags: [{ Key: 'Experiment', Value: b.experiment }],
      DeletionProtectionEnabled: false,
    },
    bucket: { Bucket: bucket, ObjectLockEnabledForBucket: true },
    expectedOwner: b.account,
    ownership: {
      OwnershipControls: {
        Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }],
      },
    },
    publicAccess: {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true,
      },
    },
    encryption: {
      ServerSideEncryptionConfiguration: {
        Rules: [
          { ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
        ],
      },
    },
    versioning: { VersioningConfiguration: { Status: 'Enabled' } },
    lock: {
      ObjectLockConfiguration: {
        ObjectLockEnabled: 'Enabled',
        Rule: { DefaultRetention: { Mode: 'GOVERNANCE', Days: 1 } },
      },
    },
    bucketPolicy,
  };
  return {
    bindings: b,
    region,
    table,
    tableArn,
    bucket,
    bucketArn,
    prefix: `${b.experiment}/`,
    roles,
    roleMaxSessionDuration: 3600,
    window,
    cleanupEnd,
    tableEnd,
    manifest,
    permissions: { admin, runner, reviewer },
    trust,
    resources,
    hashes: {
      manifest: digest(manifest),
      permissions: digest({ admin, runner, reviewer }),
      trust: digest(trust),
      resources: digest(resources),
    },
    executionAuthorized: false as const,
  };
}
export type ExperimentPackage = ReturnType<typeof bindPackage>;
