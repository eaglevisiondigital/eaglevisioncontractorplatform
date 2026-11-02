import {
  readFileSync,
  lstatSync,
  mkdirSync,
  writeFileSync,
  openSync,
  closeSync,
  renameSync,
  rmSync,
  constants,
  fstatSync,
  fsyncSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  readVisualInventory,
  validateVisualInventory,
} from './cycle13-visual-comparison.mjs';

const scopes = ['operating-panels', 'advanced-panels'];
const brands = ['straight-edge', 'cunningham', 'roofing-example'];
const viewports = ['desktop', 'tablet', 'mobile'];
const ownData = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype &&
  Reflect.ownKeys(value).every(
    (key) =>
      typeof key === 'string' &&
      Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'),
  );
const exact = (value, keys) =>
  ownData(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((k) => Object.hasOwn(value, k));
const escape = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const fail = (message) => {
  throw Error(`Cycle14 visual evidence: ${message}`);
};
export const visualReviewPath = 'artifacts/cycle14/owner-visual-review.html';
/** Trusted local artifact output only; never follows a prior file/link in place. */
export function writeOwnerVisualOutput(root, path, contents) {
  if (
    !['artifacts/cycle14/visual-manifest.json', visualReviewPath].includes(
      path,
    ) ||
    typeof contents !== 'string' ||
    Buffer.byteLength(contents) > 192 * 1024 * 1024
  )
    fail('bounded exact output required');
  const base = resolve(root),
    rootStat = lstatSync(base);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory())
    fail('regular output root required');
  for (const part of ['artifacts', 'artifacts/cycle14']) {
    const directory = resolve(base, part);
    try {
      const stat = lstatSync(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        fail('regular output directory required');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      mkdirSync(directory);
    }
  }
  const absolute = resolve(base, path);
  const validate = () => {
    try {
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1)
        fail('regular single-link output required');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  };
  validate();
  const temporary = `${absolute}.${randomUUID()}.tmp`;
  const fd = openSync(
    temporary,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.nlink !== 1)
        fail('exclusive regular output required');
      writeFileSync(fd, contents);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    validate();
    renameSync(temporary, absolute);
    const dir = openSync(
      resolve(base, 'artifacts/cycle14'),
      constants.O_RDONLY,
    );
    try {
      fsyncSync(dir);
    } finally {
      closeSync(dir);
    }
  } finally {
    rmSync(temporary, { force: true });
  }
}
export function readReviewImage(root, path) {
  if (
    typeof path !== 'string' ||
    !/^artifacts\/cycle14\/[a-z0-9][a-z0-9_-]*\.png$/.test(path)
  )
    fail('finite public PNG path required');
  let full = resolve(root);
  if (lstatSync(full).isSymbolicLink() || !lstatSync(full).isDirectory())
    fail('regular root required');
  for (const part of path.split('/')) {
    full = resolve(full, part);
    if (lstatSync(full).isSymbolicLink()) fail('image links forbidden');
  }
  const stat = lstatSync(full);
  if (!stat.isFile() || stat.size > 32 * 1024 * 1024)
    fail('bounded regular PNG required');
  return readFileSync(full);
}
export function createOwnerVisualReview({
  root = process.cwd(),
  manifest,
  read = readReviewImage,
}) {
  const inventory = readVisualInventory(root);
  validateVisualInventory(root, inventory);
  if (
    !exact(manifest, ['schema', 'screenshots']) ||
    manifest.schema !== 'propel-cycle14-owner-visual-v1' ||
    !Array.isArray(manifest.screenshots) ||
    Object.getPrototypeOf(manifest.screenshots) !== Array.prototype ||
    manifest.screenshots.length > 36 ||
    Reflect.ownKeys(manifest.screenshots).length !==
      manifest.screenshots.length + 1 ||
    !Array.from({ length: manifest.screenshots.length }, (_, i) =>
      Object.getOwnPropertyDescriptor(manifest.screenshots, String(i)),
    ).every((d) => d && Object.hasOwn(d, 'value'))
  )
    fail('exact bounded screenshot manifest required');
  const pairs = new Map(),
    paths = new Set();
  let total = 0;
  for (const item of manifest.screenshots) {
    if (
      !exact(item, [
        'scope',
        'brand',
        'viewport',
        'side',
        'path',
        'sha256',
        'sourceCommit',
        'caption',
      ]) ||
      !scopes.includes(item.scope) ||
      !brands.includes(item.brand) ||
      !viewports.includes(item.viewport) ||
      !['reference', 'current'].includes(item.side) ||
      typeof item.caption !== 'string' ||
      item.caption.length > 600 ||
      (item.sourceCommit !== null &&
        (typeof item.sourceCommit !== 'string' ||
          !/^[a-f0-9]{40}$/.test(item.sourceCommit))) ||
      typeof item.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(item.sha256) ||
      paths.has(item.path)
    )
      fail('exact unique public screenshot identity required');
    if (
      typeof item.path !== 'string' ||
      !/^artifacts\/cycle14\/[a-z0-9][a-z0-9_-]*\.png$/.test(item.path)
    )
      fail('finite public PNG path required');
    const key = `${item.scope}/${item.brand}/${item.viewport}`;
    const pair = pairs.get(key) || {};
    if (pair[item.side]) fail('duplicate comparison side');
    const bytes = read(root, item.path);
    total += bytes.length;
    if (
      bytes.length < 24 ||
      bytes.length > 32 * 1024 * 1024 ||
      total > 128 * 1024 * 1024 ||
      bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      bytes.subarray(12, 16).toString() !== 'IHDR' ||
      !bytes.readUInt32BE(16) ||
      !bytes.readUInt32BE(20) ||
      bytes.readUInt32BE(16) > 20000 ||
      bytes.readUInt32BE(20) > 50000 ||
      createHash('sha256').update(bytes).digest('hex') !== item.sha256
    )
      fail('exact bounded PNG bytes and hash required');
    paths.add(item.path);
    pair[item.side] = { ...item, data: bytes.toString('base64') };
    pairs.set(key, pair);
  }
  const image = (item, side) =>
    !item
      ? `<p>${side}: MISSING — no image supplied. No equivalence or approval claimed.</p>`
      : `<figure><figcaption><strong>${side === 'reference' ? 'Cycle13 engineering reference — NOT owner approved' : 'Current local candidate — visual approval PENDING'}</strong><p>${escape(item.caption)}</p></figcaption><img alt="${escape(`${item.scope} ${item.brand} ${item.viewport} ${side}`)}" src="data:image/png;base64,${item.data}"><p>${escape(item.path)}</p><p>SHA-256: <code>${item.sha256}</code><br>Capture source: <code>${item.sourceCommit ?? 'UNKNOWN / uncommitted at capture'}</code></p></figure>`;
  let complete = 0;
  const sections = scopes
    .map(
      (scope) =>
        `<section><h2>${scope === 'operating-panels' ? '1. Operating Center panels' : '2. Advanced add-on panels'}</h2><p>Owner visual decision: PENDING. Review information hierarchy, labels, source context, touch controls and mobile stacking only.</p>${brands
          .flatMap((brand) =>
            viewports.map((viewport) => {
              const pair = pairs.get(`${scope}/${brand}/${viewport}`) || {};
              if (pair.reference && pair.current) complete++;
              return `<details><summary>${brand} · ${viewport}${pair.reference && pair.current ? ' · actual reference/current pair' : ' · missing evidence'}</summary><div class="pair">${image(pair.reference, 'reference')}${image(pair.current, 'current')}</div></details>`;
            }),
          )
          .join('')}</section>`,
    )
    .join('');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Propel · two-scope owner visual review</title><style>body{font:16px/1.5 system-ui;margin:0;background:#f6f4ef;color:#172d28}main{max-width:1500px;margin:auto;padding:24px}h1{font-size:28px}details{background:white;border:1px solid #c9d2cd;margin:16px 0;border-radius:12px;padding:16px}summary{cursor:pointer;min-height:44px;font-weight:700}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:16px 0;min-width:0}img{max-width:100%;height:auto;border:1px solid #c9d2cd}p,code{overflow-wrap:anywhere}@media(max-width:760px){main{padding:16px}.pair{grid-template-columns:1fr}}</style><main><h1>Propel · focused visual review</h1><p>Only two unapproved visual scopes are presented below. The original artwork/transparent derivative, premium customer portal and contractor Property Operations approvals are preserved and are not being resubmitted.</p><p><strong>Missing original assets:</strong> external original logo attachment and separately supplied original mockup image are MISSING in the public source inventory. The exact tracked artwork and approved React/CSS references remain present. No assets were reconstructed.</p><p>Reference means fresh actual pixels of retained Cycle13 components rendered in the current local build, not historical capture bytes or an approved original. Capture metadata is a producer assertion, not independent served-bundle attestation. Screenshots, accessibility checks and CI never grant owner approval. Differences in synthetic IDs/content are not hidden. No redesign of approved interfaces is proposed.</p>${sections}<h2>Owner decision checklist</h2><ul><li>Operating Center panels: approve this exact local visual scope, or list specific corrections.</li><li>Advanced panels: approve this exact local visual scope, or list specific corrections.</li><li>Missing originals remain unresolved; existing three approvals remain unchanged.</li></ul><p>Neither visual approval authorizes connected access, dispatch, messages, financial execution, hosting or release. Release1.0 NOT READY / NOT AUTHORIZED.</p></main></html>`;
  return Object.freeze({
    html,
    screenshots: paths.size,
    completePairs: complete,
    missingPairs: 18 - complete,
    approvalGranted: false,
    release: 'NOT_READY_NOT_AUTHORIZED',
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv[2] !== 'artifacts/cycle14/visual-manifest.json')
    fail('exact local manifest path required');
  const result = createOwnerVisualReview({
    manifest: JSON.parse(readFileSync(process.argv[2], 'utf8')),
  });
  writeOwnerVisualOutput(process.cwd(), visualReviewPath, result.html);
  console.log(
    JSON.stringify({ ...result, html: undefined, output: visualReviewPath }),
  );
}
