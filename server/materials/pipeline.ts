import { createHash } from 'node:crypto';
import {
  validateExtraction,
  type Extraction,
} from '../../src/domain/materials/import';
export const MAX_SOURCE_BYTES = 3 * 1024 * 1024;
export const sourceMimeTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
] as const;
export interface QuarantineJob {
  organizationId: string;
  sourceId: string;
  objectKey: string;
  sha256: string;
  mime: string;
  size: number;
}
export interface ScanEvidence {
  verdict: 'clean' | 'infected' | 'unknown';
  sha256: string;
  engine: string;
  signatureVersion: string;
  scannedAt: string;
}
export interface ExtractionProvider {
  id: string;
  model: string;
  extract(bytes: Uint8Array, mime: string): Promise<unknown>;
}
export interface ApprovedScanner {
  id: string;
  approved: true;
  scan(bytes: Uint8Array): Promise<ScanEvidence>;
}
export interface ContentValidator {
  validate(bytes: Uint8Array, mime: string): Promise<void>;
}
export interface ExtractionNormalizer {
  normalize(
    bytes: Uint8Array,
    mime: string,
  ): Promise<{ bytes: Uint8Array; mime: string }>;
}
export interface QuarantineStore {
  checkpoint(job: QuarantineJob): Promise<void>;
  readQuarantined(job: QuarantineJob): Promise<Uint8Array>;
  // Atomic compare-and-set on org/source/digest. Clean object remains private and internal.
  releaseValidated(job: QuarantineJob, evidence: ScanEvidence): Promise<void>;
  saveExtraction(
    job: QuarantineJob,
    extraction: Extraction,
    provider: { id: string; model: string },
  ): Promise<void>;
  fail(job: QuarantineJob, code: string): Promise<void>;
}
export function validateEnvelope(bytes: Uint8Array, mime: string) {
  if (
    bytes.length < 8 ||
    bytes.length > MAX_SOURCE_BYTES ||
    !sourceMimeTypes.includes(mime as (typeof sourceMimeTypes)[number])
  )
    throw new Error('Unsupported or oversized source');
  const start = Buffer.from(bytes.subarray(0, 16));
  const matches =
    mime === 'application/pdf'
      ? start.toString().startsWith('%PDF-')
      : mime === 'image/png'
        ? start
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mime === 'image/jpeg'
          ? start[0] === 255 && start[1] === 216 && start[2] === 255
          : mime === 'image/webp'
            ? start.toString('ascii', 0, 4) === 'RIFF' &&
              start.toString('ascii', 8, 12) === 'WEBP'
            : !bytes.includes(0);
  if (!matches)
    throw new Error('File signature does not match its declared type');
}
export async function processQuarantined(
  input: QuarantineJob,
  deps: {
    store: QuarantineStore;
    scanner: ApprovedScanner;
    validator: ContentValidator;
    extractor: ExtractionProvider;
    normalizer?: ExtractionNormalizer;
  },
) {
  const job = Object.freeze({ ...input });
  try {
    if (!deps.scanner.approved) throw new Error('Scanner not approved');
    await deps.store.checkpoint(job);
    const bytes = Uint8Array.from(await deps.store.readQuarantined(job));
    validateEnvelope(bytes, job.mime);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (
      bytes.length !== job.size ||
      digest !== job.sha256 ||
      job.objectKey !== `${job.organizationId}/${job.sourceId}`
    )
      throw new Error('Source integrity mismatch');
    await deps.store.checkpoint(job);
    const evidence = Object.freeze({
      ...(await deps.scanner.scan(Uint8Array.from(bytes))),
    });
    if (
      evidence.verdict !== 'clean' ||
      evidence.sha256 !== digest ||
      !evidence.engine ||
      !evidence.signatureVersion ||
      !Number.isFinite(Date.parse(evidence.scannedAt)) ||
      Math.abs(Date.now() - Date.parse(evidence.scannedAt)) > 15 * 60 * 1000
    )
      throw new Error('No current clean malware verdict');
    // A magic number alone is insufficient: approved validator must fully decode images with pixel limits,
    // parse PDFs rejecting encryption/active content/embedded files, and bound literal CSV rows/columns.
    await deps.store.checkpoint(job);
    await deps.validator.validate(Uint8Array.from(bytes), job.mime);
    await deps.store.releaseValidated(job, evidence);
    await deps.store.checkpoint(job);
    // Images must be decoded/re-encoded without EXIF/GPS before leaving the worker.
    if (job.mime.startsWith('image/') && !deps.normalizer)
      throw new Error('Image normalization required');
    const normalized = deps.normalizer
      ? await deps.normalizer.normalize(Uint8Array.from(bytes), job.mime)
      : { bytes: Uint8Array.from(bytes), mime: job.mime };
    validateEnvelope(normalized.bytes, normalized.mime);
    await deps.store.checkpoint(job);
    const extraction = validateExtraction(
      await deps.extractor.extract(normalized.bytes, normalized.mime),
    );
    await deps.store.saveExtraction(job, extraction, {
      id: deps.extractor.id,
      model: deps.extractor.model,
    });
    return extraction;
  } catch {
    await deps.store.fail(job, 'processing_failed');
    throw new Error('Source processing failed; review status before retrying');
  }
}
