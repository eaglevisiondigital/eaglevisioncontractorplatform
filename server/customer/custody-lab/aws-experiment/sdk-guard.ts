import { createHash } from 'node:crypto';
import { canonical } from '../../../property/command-custody';
import { holdPlan, spendPlan, ackPlan, readPlan } from '../protocol';
import {
  digest,
  EVIDENCE_LABELS,
  LIMITS,
  type ExperimentPackage,
} from './package';
import { permitted } from './validation';
import type { Request } from './runner';
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
export function requestHash(r: Request) {
  return digest(
    Object.fromEntries(Object.entries(r).filter(([key]) => key !== 'budgetId')),
  );
}
function fields(
  v: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
) {
  if (
    required.some((k) => !Object.hasOwn(v, k)) ||
    Object.keys(v).some((k) => !required.includes(k) && !optional.includes(k))
  )
    throw Error('Exact SDK input required');
}
export const mutationOperations = new Set([
  'TransactWriteItems',
  'PutObject',
  'DeleteObject',
  'DeleteTable',
  'DeleteBucket',
]);
/** Finite original plans and evidence API only. IAM cannot enforce these transaction expressions. */
export function guardRequest(p: ExperimentPackage, r: Request, now: number) {
  fields(r as unknown as Record<string, unknown>, [
    'service',
    'operation',
    'input',
    'role',
    'maxAttempts',
    'maxResponseBytes',
    'budgetId',
  ]);
  if (
    !['runner', 'reviewer', 'admin'].includes(r.role) ||
    r.maxAttempts !== 1 ||
    !Number.isSafeInteger(r.budgetId) ||
    !Number.isSafeInteger(r.maxResponseBytes) ||
    r.maxResponseBytes <= 0 ||
    r.maxResponseBytes > LIMITS.responseBytes
  )
    throw Error('Bounded original SDK request required');
  const i = r.input;
  let action: string,
    resource: string,
    context: Record<string, string | boolean | string[] | undefined> = {
      'aws:CurrentTime': new Date(now).toISOString(),
      'aws:SecureTransport': 'true',
      'aws:ResourceTag/Experiment': p.bindings.experiment,
    };
  if (r.service === 'dynamodb') {
    resource = p.tableArn;
    if (r.operation === 'DescribeTable' || r.operation === 'DeleteTable') {
      fields(i, ['TableName']);
      if (i.TableName !== p.table) throw Error('Exact table required');
      action = 'dynamodb:' + r.operation;
    } else if (
      r.operation === 'TransactWriteItems' ||
      r.operation === 'TransactGetItems'
    ) {
      const plans = p.manifest.cases.flatMap<unknown>((c) =>
        r.operation === 'TransactGetItems'
          ? [readPlan(c.binding)]
          : [
              holdPlan(c.binding),
              spendPlan(c.binding),
              ackPlan(c.binding, c.status),
            ],
      );
      if (!plans.some((plan) => equal(plan, i)))
        throw Error('Exact original conditions/keys required');
      const entries = i.TransactItems as Record<
        string,
        {
          Key?: Record<string, { S: string }>;
          Item?: Record<string, { S: string }>;
        }
      >[];
      context = {
        ...context,
        'dynamodb:EnclosingOperation': [r.operation],
        'dynamodb:LeadingKeys': entries.map((e) => {
          const x = Object.values(e)[0];
          return (x.Key || x.Item)!.pk.S;
        }),
      };
      // Check every underlying action independently (ConditionCheckItem is not PutItem).
      for (const e of entries) {
        const kind = Object.keys(e)[0];
        const a =
          kind === 'Get'
            ? 'GetItem'
            : kind === 'Put'
              ? 'PutItem'
              : 'ConditionCheckItem';
        const x = Object.values(e)[0];
        if (
          !permitted([p.permissions[r.role]], {
            action: 'dynamodb:' + a,
            resource,
            values: {
              ...context,
              'dynamodb:LeadingKeys': [(x.Key || x.Item)!.pk.S],
            },
          })
        )
          throw Error('DynamoDB permission denied');
      }
      return;
    } else throw Error('Unexpected DynamoDB operation');
  } else if (r.service === 's3') {
    if (i.Bucket !== p.bucket || i.ExpectedBucketOwner !== p.bindings.account)
      throw Error('Exact evidence owner required');
    const base = ['Bucket', 'ExpectedBucketOwner'],
      obj = [...base, 'Key', 'VersionId'];
    const config: Record<string, string> = {
      GetObjectLockConfiguration: 'GetBucketObjectLockConfiguration',
      GetBucketVersioning: 'GetBucketVersioning',
      GetPublicAccessBlock: 'GetBucketPublicAccessBlock',
      GetBucketOwnershipControls: 'GetBucketOwnershipControls',
      GetBucketEncryption: 'GetEncryptionConfiguration',
      GetBucketPolicy: 'GetBucketPolicy',
      GetBucketLocation: 'GetBucketLocation',
    };
    action = 's3:' + (config[r.operation] || r.operation);
    resource = p.bucketArn;
    if (Object.hasOwn(config, r.operation) || r.operation === 'DeleteBucket')
      fields(i, base);
    else if (r.operation === 'ListObjectVersions') {
      fields(
        i,
        [...base, 'Prefix', 'MaxKeys'],
        ['KeyMarker', 'VersionIdMarker'],
      );
      if (
        !['', p.prefix].includes(String(i.Prefix)) ||
        !Number.isSafeInteger(i.MaxKeys) ||
        Number(i.MaxKeys) < 1 ||
        Number(i.MaxKeys) > 10 ||
        ('KeyMarker' in i &&
          (!String(i.KeyMarker).startsWith(p.prefix) ||
            typeof i.VersionIdMarker !== 'string'))
      )
        throw Error('Bounded version listing required');
      action = 's3:ListBucketVersions';
      context['s3:prefix'] = String(i.Prefix);
    } else {
      if (
        typeof i.Key !== 'string' ||
        !new RegExp('^' + p.prefix + '[a-f0-9]{64}\\.json$').test(i.Key)
      )
        throw Error('Exact content-addressed key required');
      resource = p.bucketArn + '/' + i.Key;
      if (r.operation === 'PutObject') {
        fields(i, [
          ...base,
          'Key',
          'Body',
          'ServerSideEncryption',
          'IfNoneMatch',
          'ChecksumSHA256',
          'ChecksumAlgorithm',
          'Metadata',
        ]);
        if (
          typeof i.Body !== 'string' ||
          Buffer.byteLength(i.Body) > LIMITS.objectBytes ||
          i.ServerSideEncryption !== 'AES256' ||
          i.IfNoneMatch !== '*' ||
          i.ChecksumAlgorithm !== 'SHA256' ||
          !equal(i.Metadata, EVIDENCE_LABELS)
        )
          throw Error('Conditional immutable evidence required');
        JSON.parse(i.Body);
        const hash = createHash('sha256').update(i.Body).digest('hex');
        if (
          i.Key !== p.prefix + hash + '.json' ||
          i.ChecksumSHA256 !== Buffer.from(hash, 'hex').toString('base64')
        )
          throw Error('Evidence checksum mismatch');
        context = {
          ...context,
          's3:if-none-match': '*',
          's3:x-amz-server-side-encryption': 'AES256',
        };
      } else if (
        [
          'GetObject',
          'GetObjectRetention',
          'GetObjectLegalHold',
          'DeleteObject',
        ].includes(r.operation)
      ) {
        fields(i, r.operation === 'GetObject' ? [...obj, 'ChecksumMode'] : obj);
        if (
          typeof i.VersionId !== 'string' ||
          !i.VersionId ||
          i.VersionId === 'null' ||
          i.VersionId.length > 1024 ||
          (r.operation === 'GetObject' && i.ChecksumMode !== 'ENABLED')
        )
          throw Error('Exact retained version required');
        if (r.operation === 'GetObject') action = 's3:GetObjectVersion';
        if (r.operation === 'DeleteObject') action = 's3:DeleteObjectVersion';
      } else throw Error('Unexpected S3 operation');
    }
  } else throw Error('Unexpected service');
  if (
    !permitted(
      r.service === 's3'
        ? [p.permissions[r.role], p.resources.bucketPolicy]
        : [p.permissions[r.role]],
      { action, resource, values: context },
    )
  )
    throw Error('SDK role/time/bucket permission denied');
}
