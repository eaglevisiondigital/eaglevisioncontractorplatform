import sharp from 'sharp';
import {
  PDFDocument,
  PDFDict,
  PDFArray,
  PDFName,
  PDFRawStream,
  PDFObject,
} from 'pdf-lib';
import { validateEnvelope, type ContentValidator } from './pipeline';
import { SupplierCsvValidator } from './csv';
const forbidden = new Set([
  'JS',
  'JavaScript',
  'OpenAction',
  'AA',
  'Launch',
  'EmbeddedFiles',
  'EmbeddedFile',
  'RichMedia',
  'XFA',
  'AcroForm',
  'SubmitForm',
  'ImportData',
  'GoToR',
]);
// Run in an isolated resource-limited worker after malware scanning, never in the browser.
export class SupplierContentValidator implements ContentValidator {
  async validate(bytes: Uint8Array, mime: string) {
    validateEnvelope(bytes, mime);
    if (mime === 'text/csv')
      return new SupplierCsvValidator().validate(bytes, mime);
    if (mime.startsWith('image/')) {
      const image = sharp(bytes, {
        failOn: 'warning',
        limitInputPixels: 12_000_000,
        limitInputChannels: 4,
      });
      const metadata = await image.metadata();
      const expected = mime.slice(6) === 'jpeg' ? 'jpeg' : mime.slice(6);
      if (
        metadata.format !== expected ||
        !metadata.width ||
        !metadata.height ||
        (metadata.pages ?? 1) !== 1
      )
        throw new Error('Unsupported image dimensions, animation or content');
      await image.timeout({ seconds: 10 }).raw().toBuffer();
      return;
    }
    if (mime !== 'application/pdf')
      throw new Error('Unsupported document format');
    const tail = Buffer.from(
      bytes.subarray(Math.max(0, bytes.length - 1024)),
    ).toString('latin1');
    if (!/%%EOF\s*$/.test(tail)) throw new Error('Truncated PDF');
    const doc = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    if (doc.isEncrypted || doc.getPageCount() < 1 || doc.getPageCount() > 40)
      throw new Error('Encrypted or excessive-page PDF');
    const objects = doc.context.enumerateIndirectObjects();
    if (objects.length > 20000) throw new Error('PDF object limit');
    const seen = new Set<PDFObject>();
    let visited = 0;
    const inspect = (value: PDFObject, depth = 0) => {
      if (depth > 40 || ++visited > 100000)
        throw new Error('PDF structure limits');
      if (seen.has(value)) return;
      seen.add(value);
      if (value instanceof PDFName && forbidden.has(value.decodeText()))
        throw new Error('Active or embedded PDF content');
      if (value instanceof PDFRawStream) inspect(value.dict, depth + 1);
      else if (value instanceof PDFDict)
        for (const [key, item] of value.entries()) {
          if (forbidden.has(key.decodeText()))
            throw new Error('Active or embedded PDF content');
          inspect(item, depth + 1);
        }
      else if (value instanceof PDFArray)
        for (const item of value.asArray()) inspect(item, depth + 1);
    };
    for (const [, object] of objects) inspect(object);
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0 ||
        width > 20000 ||
        height > 20000
      )
        throw new Error('Invalid PDF page dimensions');
    }
  }
}
