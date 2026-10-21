import sharp from 'sharp';
import type { ExtractionNormalizer } from './pipeline';
import { validateEnvelope } from './pipeline';

// Isolated-worker only: native decode requires externally enforced memory/CPU limits.
export class SupplierExtractionNormalizer implements ExtractionNormalizer {
  async normalize(bytes: Uint8Array, mime: string) {
    validateEnvelope(bytes, mime);
    if (!mime.startsWith('image/'))
      return { bytes: Uint8Array.from(bytes), mime };
    const image = sharp(bytes, {
      failOn: 'warning',
      limitInputPixels: 12_000_000,
    });
    const metadata = await image.metadata();
    if ((metadata.pages ?? 1) !== 1)
      throw new Error('Animated input prohibited');
    // Sharp drops metadata by default; autoOrient applies EXIF rotation before dropping it.
    const normalized = await image
      .autoOrient()
      .png()
      .timeout({ seconds: 10 })
      .toBuffer();
    validateEnvelope(normalized, 'image/png');
    return { bytes: normalized, mime: 'image/png' };
  }
}
