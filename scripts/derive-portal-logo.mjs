/** Deterministic matte extraction from owner-approved pixels, never generated artwork.
 * Preserve the original PNG/dimensions and every solid artwork pixel. Unmatte only
 * light edge pixels against their nearest solid ink; all white negative space clears. */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const source = 'public/brand/propel-contractor-suite.png';
const target = 'public/brand/propel-contractor-suite-transparent.png';
const original = readFileSync(source);
assert.equal(
  createHash('sha256').update(original).digest('hex'),
  'b77d8e9e9db486c32ea24031033e4bec758342a4a3418fb438cfad23e0629bb0',
);
const { data, info } = await sharp(original)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
assert.equal(info.width, 2172);
assert.equal(info.height, 724);
const out = Buffer.alloc(info.width * info.height * 4);
let solid = 0,
  clear = 0,
  edges = 0,
  unsupported = 0;
for (let y = 0; y < info.height; y++)
  for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 3,
      o = (y * info.width + x) * 4;
    const rgb = [data[i], data[i + 1], data[i + 2]],
      lo = Math.min(...rgb),
      hi = Math.max(...rgb);
    if (lo >= 240 && hi - lo <= 12) {
      clear++;
      continue;
    }
    if (lo <= 180) {
      out.set([...rgb, 255], o);
      solid++;
      continue;
    }
    let ink = null,
      dist = Infinity;
    for (let dy = -8; dy <= 8; dy++)
      for (let dx = -8; dx <= 8; dx++) {
        const nx = x + dx,
          ny = y + dy,
          d = dx * dx + dy * dy;
        if (
          nx < 0 ||
          ny < 0 ||
          nx >= info.width ||
          ny >= info.height ||
          d >= dist
        )
          continue;
        const j = (ny * info.width + nx) * 3,
          neighbor = [data[j], data[j + 1], data[j + 2]];
        if (Math.min(...neighbor) <= 180) {
          ink = neighbor;
          dist = d;
        }
      }
    if (!ink) {
      unsupported++;
      continue;
    }
    const v = ink.map((c) => 255 - c),
      w = rgb.map((c) => 255 - c);
    const leastSquares =
      w.reduce((n, c, k) => n + c * v[k], 0) / v.reduce((n, c) => n + c * c, 0);
    const alpha = Math.max(...w.map((c) => c / 255), Math.min(1, leastSquares));
    const a = Math.max(1, Math.round(alpha * 255));
    out.set(
      rgb.map((c) =>
        Math.round(
          Math.min(255, Math.max(0, (c - 255 * (1 - a / 255)) / (a / 255))),
        ),
      ),
      o,
    );
    out[o + 3] = a;
    edges++;
  }
assert.equal(
  unsupported,
  0,
  'Unmatched light artwork must be reviewed, not cleared',
);
await sharp(out, {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .png({ compressionLevel: 9 })
  .toFile(target);
assert(readFileSync(source).equals(original));
console.log(
  JSON.stringify({
    source,
    target,
    width: info.width,
    height: info.height,
    solidPixelsUnchanged: solid,
    clearPixels: clear,
    unmattedEdgePixels: edges,
    unsupportedLightPixelsCleared: unsupported,
    sha256: createHash('sha256').update(readFileSync(target)).digest('hex'),
  }),
);
