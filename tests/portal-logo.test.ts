import { expect, it } from 'vitest';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const source = readFileSync('public/brand/propel-contractor-suite.png');
const derivative = readFileSync(
  'public/brand/propel-contractor-suite-transparent.png',
);
it('preserves the approved source and dimensions, adding a real alpha channel only to the portal derivative', async () => {
  expect(createHash('sha256').update(source).digest('hex')).toBe(
    'b77d8e9e9db486c32ea24031033e4bec758342a4a3418fb438cfad23e0629bb0',
  );
  expect(createHash('sha256').update(derivative).digest('hex')).toBe(
    'dd6e8161dc4be20b97ca10cdb58a191b2bb5d4b92c2e58a2c4dcceed500a9a27',
  );
  expect(await sharp(source).metadata()).toMatchObject({
    width: 2172,
    height: 724,
    hasAlpha: false,
  });
  expect(await sharp(derivative).metadata()).toMatchObject({
    width: 2172,
    height: 724,
    hasAlpha: true,
  });
});
it('retains every solid artwork pixel exactly and removes the off-white matte with decontaminated antialiased edges', async () => {
  const a = await sharp(source).raw().toBuffer(),
    b = await sharp(derivative).raw().toBuffer();
  let solid = 0,
    clear = 0,
    edges = 0,
    maxCompositeError = 0;
  for (let i = 0, j = 0; i < a.length; i += 3, j += 4) {
    const rgb = [a[i], a[i + 1], a[i + 2]],
      min = Math.min(...rgb),
      max = Math.max(...rgb),
      alpha = b[j + 3];
    if (min <= 180) {
      if (alpha !== 255 || rgb.some((v, c) => v !== b[j + c]))
        throw Error('Artwork pixel changed');
      solid++;
    }
    if (min >= 240 && max - min <= 12) {
      if (alpha !== 0) throw Error('Opaque background retained');
      clear++;
    }
    if (alpha > 0 && alpha < 255) edges++;
    for (let c = 0; c < 3; c++) {
      const diff = Math.abs(rgb[c] - ((b[j + c] * alpha) / 255 + 255 - alpha));
      maxCompositeError = Math.max(maxCompositeError, diff);
      if (alpha > 0 && diff > 1.01)
        throw Error(
          'Edge no longer reconstructs original white-matted artwork',
        );
    }
    if (alpha > 0 && Math.min(b[j], b[j + 1], b[j + 2]) >= 240)
      throw Error('White halo pixel retained');
  }
  expect({ solid, clear, edges }).toEqual({
    solid: 474732,
    clear: 1089752,
    edges: 8044,
  });
  expect(maxCompositeError).toBeLessThanOrEqual(15);
});
