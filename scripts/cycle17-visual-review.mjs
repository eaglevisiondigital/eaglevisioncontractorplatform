import { createHash, randomUUID } from 'node:crypto';
import {
  readFileSync,
  lstatSync,
  mkdirSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
  rmSync,
  constants,
} from 'node:fs';
import { resolve } from 'node:path';
const brands = ['straight-edge', 'cunningham', 'roofing-example'];
const views = ['desktop', 'tablet', 'mobile'];
const scopes = ['operating-panels', 'advanced-panels'];
const escape = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const fail = (m) => {
  throw Error('Cycle17 visual evidence: ' + m);
};
export function readCycle17Png(root, path) {
  if (
    typeof path !== 'string' ||
    !/^artifacts\/cycle17\/[a-z0-9][a-z0-9_-]*\.png$/.test(path)
  )
    fail('finite public PNG path required');
  let full = resolve(root);
  if (lstatSync(full).isSymbolicLink()) fail('regular root required');
  for (const part of path.split('/')) {
    full = resolve(full, part);
    if (lstatSync(full).isSymbolicLink()) fail('image links forbidden');
  }
  const s = lstatSync(full);
  if (!s.isFile() || s.nlink !== 1 || s.size > 32 * 1024 * 1024)
    fail('bounded regular PNG required');
  return readFileSync(full);
}
export function createCycle17VisualReview(manifest, read) {
  if (
    manifest?.schema !== 'propel-cycle17-owner-visual-v1' ||
    manifest.visual_approval !== 'PENDING' ||
    !Array.isArray(manifest.screenshots) ||
    manifest.screenshots.length !== 36
  )
    fail('exact two-scope review required');
  const images = new Map();
  for (const s of manifest.screenshots) {
    if (
      !scopes.includes(s.scope) ||
      !brands.includes(s.brand) ||
      !views.includes(s.viewport) ||
      !['reference', 'current'].includes(s.side) ||
      s.approval !== 'PENDING' ||
      !/^([a-f0-9]{40})$/.test(s.source) ||
      !/^artifacts\/cycle17\/[a-z0-9][a-z0-9_-]*\.png$/.test(s.path)
    )
      fail('exact public image context required');
    if (
      s.path !==
      `artifacts/cycle17/${s.side}-${s.scope}-${s.viewport}-${s.brand}.png`
    )
      fail('image filename/context mismatch');
    const key = [s.scope, s.brand, s.viewport, s.side].join(':');
    if (images.has(key)) fail('duplicate image context');
    const bytes = read(s.path);
    if (
      !Buffer.isBuffer(bytes) ||
      bytes.length < 24 ||
      bytes.length > 32 * 1024 * 1024 ||
      bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      bytes.subarray(12, 16).toString() !== 'IHDR' ||
      bytes.readUInt32BE(16) !== s.width ||
      bytes.readUInt32BE(20) !== s.height ||
      createHash('sha256').update(bytes).digest('hex') !== s.sha256
    )
      fail('exact PNG bytes/hash/dimensions required');
    images.set(key, {
      s,
      url: 'data:image/png;base64,' + bytes.toString('base64'),
    });
  }
  let rows = '';
  for (const scope of scopes)
    for (const brand of brands)
      for (const view of views) {
        rows += `<section><h2>${escape(scope === 'operating-panels' ? 'Operating Center' : 'Advanced add-ons')} · ${escape(brand)} · ${escape(view)}</h2><div class="pair">`;
        for (const side of ['reference', 'current']) {
          const image = images.get([scope, brand, view, side].join(':'));
          if (!image) fail('missing exact comparison pair');
          rows += `<figure><h3>${side === 'reference' ? 'Cycle 16 retained reference — not an approved original' : 'Cycle 17 current candidate — owner approval pending'}</h3><img loading="lazy" alt="${escape(scope + ' ' + brand + ' ' + view + ' ' + side)}" src="${image.url}"><figcaption>Source ${escape(image.s.source)}<br>SHA-256 ${escape(image.s.sha256)}</figcaption></figure>`;
        }
        rows += '</div></section>';
      }
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Cycle 17 owner visual review</title><style>body{font:16px/1.5 system-ui,sans-serif;background:#f6f4ee;color:#183b32;margin:auto;padding:24px;max-width:1500px}h1,h2,h3{line-height:1.25}section{margin-top:32px;border-top:1px solid #bdc8c1}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{min-width:0;margin:0;padding:14px;background:white;border:1px solid #bdc8c1}img{display:block;width:100%;height:auto}figcaption{overflow-wrap:anywhere;font-size:.85rem}@media(max-width:760px){body{padding:14px}.pair{grid-template-columns:1fr}}</style><main><h1>Cycle 17 · two visual scopes for owner review</h1><p>Operating Center panels and advanced add-on panels only. Both approvals remain <strong>PENDING</strong>. The approved premium customer portal, Property Operations, branding and artwork remain unchanged.</p><p><strong>Missing original assets:</strong> original externally supplied logo attachment and original mockup image remain MISSING. These actual synthetic captures compare retained Cycle 16 with current Cycle 17; the reference is not a newly discovered original, visual approval or a pixel-equivalence claim. States and source IDs may differ.</p><p>Review hierarchy, retained company/property/job/source context, original-control navigation, mobile wrapping and blocked/UNKNOWN distinctions. Approve these two local presentation scopes or identify specific corrections. Tests do not grant visual or operational approval.</p><p>Read-only offline review: no script, form, remote asset, customer URL, execution or delivery. Release 1.0 NOT READY / NOT AUTHORIZED.</p>${rows}</main></html>`;
  if (Buffer.byteLength(html) > 192 * 1024 * 1024)
    fail('bounded review output required');
  return { html, screenshots: 36, completePairs: 18, approval: 'PENDING' };
}
export function writeCycle17VisualOutput(root, path, contents) {
  if (
    ![
      'artifacts/cycle17/owner-visual-review.html',
      'artifacts/cycle17/visual-manifest.json',
    ].includes(path) ||
    typeof contents !== 'string' ||
    Buffer.byteLength(contents) > 192 * 1024 * 1024
  )
    fail('bounded exact output required');
  const base = resolve(root);
  if (lstatSync(base).isSymbolicLink()) fail('regular output root required');
  for (const part of ['artifacts', 'artifacts/cycle17']) {
    const p = resolve(base, part);
    try {
      const s = lstatSync(p);
      if (s.isSymbolicLink() || !s.isDirectory())
        fail('regular output directory required');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      mkdirSync(p);
    }
  }
  const full = resolve(base, path),
    check = () => {
      try {
        const s = lstatSync(full);
        if (s.isSymbolicLink() || !s.isFile() || s.nlink !== 1)
          fail('regular single-link output required');
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    };
  check();
  const temp = full + '.' + randomUUID() + '.tmp';
  const fd = openSync(
    temp,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    try {
      writeFileSync(fd, contents);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    check();
    renameSync(temp, full);
    const dir = openSync(
      resolve(base, 'artifacts/cycle17'),
      constants.O_RDONLY,
    );
    try {
      fsyncSync(dir);
    } finally {
      closeSync(dir);
    }
  } finally {
    rmSync(temp, { force: true });
  }
}
