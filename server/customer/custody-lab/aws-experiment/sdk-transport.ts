/** Isolated AWS mechanics transport. No CLI, provider chain, account probe or resource bootstrap. */
import {
  DynamoDBClient,
  DescribeTableCommand,
  DeleteTableCommand,
  TransactWriteItemsCommand,
  TransactGetItemsCommand,
} from '@aws-sdk/client-dynamodb';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  GetObjectRetentionCommand,
  GetObjectLegalHoldCommand,
  GetObjectLockConfigurationCommand,
  GetBucketVersioningCommand,
  GetPublicAccessBlockCommand,
  GetBucketOwnershipControlsCommand,
  GetBucketEncryptionCommand,
  GetBucketPolicyCommand,
  GetBucketLocationCommand,
  ListObjectVersionsCommand,
  DeleteObjectCommand,
  DeleteBucketCommand,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import type { HttpHandlerOptions } from '@smithy/types';
import { HttpResponse, HttpRequest } from '@smithy/protocol-http';
import { Agent } from 'node:https';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { canonical } from '../../../property/command-custody';
import { bindPackage, digest, LIMITS, type ExperimentPackage } from './package';
import { ExperimentLimits } from './limits';
import { observedAbsence, boundedUtf8Body } from './provider';
import { guardRequest, requestHash, mutationOperations } from './sdk-guard';
import type { ExperimentTransport, Request } from './runner';
export interface WireHandler {
  handle(
    request: HttpRequest,
    options?: HttpHandlerOptions,
  ): Promise<{ response: HttpResponse }>;
  destroy?(): void;
}
/** Explicit short-lived values supplied only after separate authorization. Never loaded here. */
export interface TemporaryCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}
export interface TransportOptions {
  credentials: Record<Request['role'], TemporaryCredentials>;
  now: () => number;
  authorized: (role: Request['role']) => boolean;
  /** Offline tests supply an in-memory Smithy HTTP handler. No SDK.send stubs. */
  wireFactory: () => WireHandler;
}
const commands = {
  DescribeTable: DescribeTableCommand,
  DeleteTable: DeleteTableCommand,
  TransactWriteItems: TransactWriteItemsCommand,
  TransactGetItems: TransactGetItemsCommand,
  PutObject: PutObjectCommand,
  GetObject: GetObjectCommand,
  GetObjectRetention: GetObjectRetentionCommand,
  GetObjectLegalHold: GetObjectLegalHoldCommand,
  GetObjectLockConfiguration: GetObjectLockConfigurationCommand,
  GetBucketVersioning: GetBucketVersioningCommand,
  GetPublicAccessBlock: GetPublicAccessBlockCommand,
  GetBucketOwnershipControls: GetBucketOwnershipControlsCommand,
  GetBucketEncryption: GetBucketEncryptionCommand,
  GetBucketPolicy: GetBucketPolicyCommand,
  GetBucketLocation: GetBucketLocationCommand,
  ListObjectVersions: ListObjectVersionsCommand,
  DeleteObject: DeleteObjectCommand,
  DeleteBucket: DeleteBucketCommand,
};
const RPC_MS = 30_000;
function credentials(v: TemporaryCredentials, now: number) {
  if (
    !v ||
    Object.keys(v).sort().join() !==
      'accessKeyId,expiration,secretAccessKey,sessionToken' ||
    typeof v.accessKeyId !== 'string' ||
    !/^ASIA[A-Z0-9]{16}$/.test(v.accessKeyId) ||
    typeof v.secretAccessKey !== 'string' ||
    v.secretAccessKey.length !== 40 ||
    typeof v.sessionToken !== 'string' ||
    v.sessionToken.length < 16 ||
    v.sessionToken.length > 4096 ||
    !(v.expiration instanceof Date) ||
    !Number.isFinite(v.expiration.getTime()) ||
    v.expiration.getTime() <= now ||
    v.expiration.getTime() > now + 3600000
  )
    throw Error('Explicit live temporary credentials required');
  return Object.freeze({ ...v, expiration: new Date(v.expiration) });
}
async function wireBytes(
  body: unknown,
  max: number,
  signal: AbortSignal,
): Promise<Buffer> {
  if (body === undefined) return Buffer.alloc(0);
  if (typeof body === 'string' || body instanceof Uint8Array) {
    const b =
      typeof body === 'string'
        ? Buffer.from(body)
        : Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    if (b.length > max) throw Error('Wire byte limit');
    return b;
  }
  const stream = body as AsyncIterable<Uint8Array> & { destroy?: () => void };
  if (!stream?.[Symbol.asyncIterator])
    throw Error('Bounded wire stream required');
  const abort = () => stream.destroy?.();
  signal.addEventListener('abort', abort, { once: true });
  try {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const c of stream) {
      if (signal.aborted || !(c instanceof Uint8Array))
        throw Error('Wire canceled');
      size += c.length;
      if (size > max) throw Error('Wire byte limit');
      chunks.push(Buffer.from(c));
    }
    return Buffer.concat(chunks);
  } finally {
    signal.removeEventListener('abort', abort);
    stream.destroy?.();
  }
}
function normalized(value: unknown): unknown {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime()))
      throw Error('Invalid provider timestamp');
    return value.toISOString();
  }
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype)
      throw Error('Unexpected provider value');
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k, v]) => k !== '$metadata' && v !== undefined)
        .map(([k, v]) => [k, normalized(v)]),
    );
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return value;
  throw Error('Invalid provider value');
}
export class SdkExperimentTransport implements ExperimentTransport {
  private readonly pkg: ExperimentPackage;
  private readonly creds: TransportOptions['credentials'];
  private readonly options: TransportOptions;
  constructor(
    pkg: ExperimentPackage,
    private readonly limits: ExperimentLimits,
    options: TransportOptions,
  ) {
    if (
      !options ||
      typeof options.now !== 'function' ||
      typeof options.authorized !== 'function' ||
      typeof options.wireFactory !== 'function'
    )
      throw Error('Explicit reviewed transport configuration required');
    this.options = Object.freeze({ ...options });
    this.pkg = bindPackage(pkg.bindings);
    if (
      digest(pkg) !== digest(this.pkg) ||
      limits.state().spec !== digest(pkg) ||
      limits.state().start !== Date.parse(pkg.bindings.start) ||
      limits.state().end !== Date.parse(pkg.bindings.end)
    )
      throw Error('Exact package/journal required');
    this.creds = Object.fromEntries(
      (['runner', 'reviewer', 'admin'] as const).map((role) => [
        role,
        credentials(options.credentials[role], options.now()),
      ]),
    ) as TransportOptions['credentials'];
  }
  async invoke(
    original: Request,
    externalSignal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    // Snapshot all mutable input before the first await. Never log private credentials/errors.
    const r = structuredClone(original),
      now = this.options.now();
    let dispatched = false;
    try {
      guardRequest(this.pkg, r, now);
      if (externalSignal?.aborted || !this.options.authorized(r.role))
        throw Error('Current authority required');
      const credential = credentials(this.creds[r.role], now);
      const ticket = this.limits.dispatch(r.budgetId!, requestHash(r), {
        phase: r.role === 'admin' ? 'cleanup' : r.role,
        mutation: mutationOperations.has(r.operation),
        service: r.service,
        bytes: Buffer.byteLength(canonical(r.input)) + r.maxResponseBytes + 512,
      });
      dispatched = true;
      const deadline = Math.min(
        ticket.deadline,
        credential.expiration.getTime(),
        now + RPC_MS,
      );
      const controller = new AbortController();
      const cancel = () => controller.abort();
      externalSignal?.addEventListener('abort', cancel, { once: true });
      if (externalSignal?.aborted) controller.abort();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let wire: WireHandler | undefined;
      const assertLive = () => {
        if (
          controller.signal.aborted ||
          this.options.now() >= deadline ||
          !this.options.authorized(r.role)
        )
          throw Error('SDK response/authority UNKNOWN');
        guardRequest(this.pkg, r, this.options.now());
        this.limits.assertDispatchedLive(r.budgetId!, requestHash(r));
      };
      const host =
        r.service === 'dynamodb'
          ? 'dynamodb.us-east-1.amazonaws.com'
          : 's3.us-east-1.amazonaws.com';
      let sent = false;
      const gate: WireHandler = {
        handle: async (req) => {
          assertLive();
          if (
            sent ||
            req.protocol !== 'https:' ||
            req.hostname !== host ||
            (req.port !== undefined && req.port !== 443) ||
            req.username ||
            req.password
          )
            throw Error('Single fixed HTTPS endpoint required');
          sent = true;
          const body = await wireBytes(
            req.body,
            Buffer.byteLength(canonical(r.input)) + 512,
            controller.signal,
          );
          if (r.service === 'dynamodb') {
            const expected =
              r.operation === 'TransactWriteItems'
                ? {
                    ...r.input,
                    ClientRequestToken: digest(r.input).slice(0, 36),
                  }
                : r.input;
            if (
              canonical(JSON.parse(body.toString('utf8'))) !==
              canonical(expected)
            )
              throw Error('SDK changed exact transaction');
          } else if (
            !['/' + this.pkg.bucket, '/' + this.pkg.bucket + '/'].includes(
              req.path,
            ) &&
            !req.path.startsWith('/' + this.pkg.bucket + '/')
          )
            throw Error('Wrong evidence wire path');
          if (
            r.operation === 'PutObject' &&
            (!body.equals(Buffer.from(String(r.input.Body))) ||
              req.headers['if-none-match'] !== '*' ||
              req.headers['x-amz-checksum-sha256'] !== r.input.ChecksumSHA256 ||
              req.headers['x-amz-server-side-encryption'] !== 'AES256')
          )
            throw Error('SDK changed evidence protections');
          assertLive();
          wire = this.options.wireFactory();
          if (
            !wire ||
            typeof wire.handle !== 'function' ||
            typeof wire.destroy !== 'function'
          )
            throw Error('Explicit reviewed wire handler required');
          const response = (
            await wire.handle(new HttpRequest({ ...req, body }), {
              abortSignal: controller.signal,
            })
          ).response;
          if (response.statusCode >= 300 && response.statusCode < 400)
            throw Error('Redirect denied');
          const bytes = await wireBytes(
            response.body,
            r.maxResponseBytes,
            controller.signal,
          );
          assertLive();
          return {
            response: new HttpResponse({
              ...response,
              body: Readable.from([bytes]),
            }),
          };
        },
        destroy: () => wire?.destroy?.(),
      };
      const cfg = {
        region: 'us-east-1',
        endpoint: 'https://' + host,
        credentials: {
          ...credential,
          expiration: new Date(credential.expiration),
        },
        maxAttempts: 1,
        defaultsMode: 'standard' as const,
        requestHandler: gate,
        logger: { debug() {}, info() {}, warn() {}, error() {} },
        retryMode: 'standard' as const,
      };
      const client =
        r.service === 'dynamodb'
          ? new DynamoDBClient({ ...cfg, accountIdEndpointMode: 'disabled' })
          : new S3Client({
              ...cfg,
              forcePathStyle: true,
              followRegionRedirects: false,
              useArnRegion: false,
              useAccelerateEndpoint: false,
              useDualstackEndpoint: false,
              useFipsEndpoint: false,
              disableS3ExpressSessionAuth: true,
              requestChecksumCalculation: 'WHEN_REQUIRED',
              responseChecksumValidation: 'WHEN_SUPPORTED',
            });
      const C = commands[r.operation as keyof typeof commands];
      if (!C) throw Error('Unsupported SDK command');
      const input =
        r.operation === 'TransactWriteItems'
          ? { ...r.input, ClientRequestToken: digest(r.input).slice(0, 36) }
          : r.input;
      // The finite guard validates each input before this union's SDK constructor boundary.
      const command = new (
        C as unknown as new (
          input: Record<string, unknown>,
        ) => DescribeTableCommand
      )(input);
      const pending = (async () => {
        try {
          const result = await (client as DynamoDBClient).send(
            command as DescribeTableCommand,
            { abortSignal: controller.signal },
          );
          assertLive();
          const raw = result as unknown as Record<string, unknown>;
          if (r.operation === 'GetObject') {
            const body = await boundedUtf8Body(
              raw.Body as AsyncIterable<Uint8Array>,
              LIMITS.objectBytes,
            );
            const hash = createHash('sha256').update(body).digest('base64');
            if (
              raw.ChecksumSHA256 !== hash ||
              raw.VersionId !== r.input.VersionId ||
              raw.ServerSideEncryption !== 'AES256'
            )
              throw Error('Object checksum/version/encryption mismatch');
            raw.Body = body;
            if (
              !(raw.LastModified instanceof Date) ||
              !Number.isFinite(raw.LastModified.getTime())
            )
              throw Error('Object timestamp UNKNOWN');
          }
          if (
            r.operation === 'PutObject' &&
            (typeof raw.VersionId !== 'string' ||
              !raw.VersionId ||
              raw.VersionId === 'null' ||
              raw.ChecksumSHA256 !== r.input.ChecksumSHA256 ||
              raw.ServerSideEncryption !== 'AES256')
          )
            throw Error('Upload acknowledgment incomplete');
          if (
            r.operation === 'DeleteObject' &&
            raw.VersionId !== r.input.VersionId
          )
            throw Error('Deletion version UNKNOWN');
          if (r.operation === 'GetObjectRetention') {
            const t = (raw.Retention as { RetainUntilDate?: unknown })
              ?.RetainUntilDate;
            if (!(t instanceof Date) || !Number.isFinite(t.getTime()))
              throw Error('Retention timestamp UNKNOWN');
          }
          assertLive();
          const value = normalized(raw) as Record<string, unknown>;
          if (Buffer.byteLength(canonical(value)) > r.maxResponseBytes)
            throw Error('Normalized response bound');
          return value;
        } catch (error) {
          assertLive();
          return observedAbsence(r.operation, error);
        } finally {
          client.destroy();
          this.limits.settleTransport(r.budgetId!);
        }
      })();
      try {
        const stop = new Promise<never>((_, reject) => {
          const abort = () => reject(Error('SDK acknowledgment UNKNOWN'));
          controller.signal.addEventListener('abort', abort, { once: true });
          timer = setTimeout(
            () => {
              controller.abort();
            },
            Math.max(0, deadline - this.options.now()),
          );
        });
        return await Promise.race([pending, stop]);
      } finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener('abort', cancel);
        controller.abort();
        gate.destroy?.();
      }
    } catch {
      this.limits.quarantine('cleanup');
      if (dispatched) {
        try {
          this.limits.finish(r.budgetId!, false);
        } catch {
          /* runner also marks the same exact ticket UNKNOWN; never change it to observed */
        }
      }
      throw Error('AWS experiment UNKNOWN; exact reconciliation only');
    }
  }
}

/** Constructing this handler makes no call. Use only after separate exact AWS execution authorization. */
export function createAwsHttpsHandler(): WireHandler {
  return new NodeHttpHandler({
    connectionTimeout: 5000,
    requestTimeout: RPC_MS,
    httpsAgent: new Agent({
      keepAlive: false,
      maxSockets: 2,
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    }),
  });
}
