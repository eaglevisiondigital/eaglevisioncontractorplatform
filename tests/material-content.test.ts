import { it, expect } from 'vitest';
import sharp from 'sharp';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { SupplierContentValidator } from '../server/materials/validation';
import handler from '../netlify/functions/material-import.mts';
const validator = new SupplierContentValidator();
it.each(['png', 'jpeg', 'webp'] as const)(
  'fully decodes a bounded synthetic %s image',
  async (format) => {
    const bytes = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#fff' },
    })
      .toFormat(format)
      .toBuffer();
    await expect(
      validator.validate(bytes, `image/${format}`),
    ).resolves.toBeUndefined();
    await expect(
      validator.validate(
        bytes.subarray(0, Math.floor(bytes.length / 2)),
        `image/${format}`,
      ),
    ).rejects.toThrow();
  },
);
it('rejects an image pixel bomb after envelope validation', async () => {
  const bytes = await sharp({
    create: { width: 4000, height: 4000, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  await expect(validator.validate(bytes, 'image/png')).rejects.toThrow();
});
it('parses a synthetic quote PDF and rejects truncation', async () => {
  const doc = await PDFDocument.create();
  doc.addPage().drawText('Synthetic supplier quote: 12 panels x 68.25');
  const bytes = await doc.save();
  await expect(
    validator.validate(bytes, 'application/pdf'),
  ).resolves.toBeUndefined();
  await expect(
    validator.validate(bytes.subarray(0, bytes.length - 20), 'application/pdf'),
  ).rejects.toThrow();
});
it('rejects active PDF actions and embedded content', async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.catalog.set(
    PDFName.of('OpenAction'),
    doc.context.obj({
      S: PDFName.of('JavaScript'),
      JS: PDFString.of('app.alert("untrusted")'),
    }),
  );
  await expect(
    validator.validate(await doc.save(), 'application/pdf'),
  ).rejects.toThrow(/Active/);
});
it('rejects encrypted PDFs and excessive page counts', async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.context.trailerInfo.Encrypt = doc.context.register(
    doc.context.obj({ Filter: PDFName.of('Standard'), V: 1, R: 2 }),
  );
  await expect(
    validator.validate(await doc.save(), 'application/pdf'),
  ).rejects.toThrow();
  const many = await PDFDocument.create();
  for (let i = 0; i < 41; i++) many.addPage();
  await expect(
    validator.validate(await many.save(), 'application/pdf'),
  ).rejects.toThrow(/page/);
});
it('deployed ingestion fails closed and never claims successful extraction', async () => {
  const response = await handler();
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await response.json()).error).toContain('unavailable');
});
