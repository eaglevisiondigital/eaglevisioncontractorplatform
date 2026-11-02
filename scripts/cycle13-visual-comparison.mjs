import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const inventoryPath = 'docs/program/CYCLE13_VISUAL_APPROVAL_INVENTORY.json';
const contractPath = 'docs/program/DESIGN_SYSTEM_CONTRACT.json';
const locks = [
  'src/styles.css',
  'src/components/property/property-portal-design.css',
  'src/components/property/contractor-back-office-design.css',
  'public/brand/propel-contractor-suite.png',
  'public/brand/propel-contractor-suite-transparent.png',
];
const lockedHashes = [
  '01b8bd783e7b6f54247c19ebfc8ca85408fb73a97d734cfccff5d1992f4ceb58',
  'a7190d6f5d4228ec54168e653658db454ad19a2a69961a9f5eaaf05c52644dc8',
  '2a6f9edffcc039061705769ce4cf3e2e1e6a9f735faa1f7475f3331274ec226d',
  'b77d8e9e9db486c32ea24031033e4bec758342a4a3418fb438cfad23e0629bb0',
  'dd6e8161dc4be20b97ca10cdb58a191b2bb5d4b92c2e58a2c4dcceed500a9a27',
];
const bindings = [
  'platform-emerald',
  'platform-mint',
  'focus-ring',
  'contractor-brand',
  'portal-touch-size',
  'portal-breakpoint',
  'staff-breakpoint',
  'workspace-navigation',
  'resource-status',
  'resource-loader',
  'platform-artwork',
  'tenant-palettes',
  'financial-closed',
];
const approvals = [
  {
    id: 'original-artwork-and-exact-portal-derivative',
    path: 'docs/BRANDING.md',
    anchor: 'The owner explicitly approved removal of the opaque logo matte',
    sha256: '4abdb292bc2f29619454cc620bb960262f894de9f48b70da6905f6240fc09e6e',
  },
  {
    id: 'customer-portal-local-phase-b',
    path: 'docs/PROPERTY_PORTAL_PHASE_B.md',
    anchor: 'The owner approved Phase A and explicitly authorized replacing',
    sha256: '3e98c691fbfb75efe2cb8670e37fb56b9c5d5f6797ed701c37955328bc059bd3',
  },
  {
    id: 'contractor-property-operations-local-phase-b',
    path: 'docs/CONTRACTOR_BACK_OFFICE_PHASE_B.md',
    anchor: '**OWNER APPROVED · LOCAL PRESENTATION INTEGRATION ONLY.**',
    sha256: '620411402575dbcf98a0a11536bcb2ecfe978a0351400380ab58c57b2c025388',
  },
];
const brands = ['straight-edge', 'cunningham', 'roofing-example'];
const viewports = ['desktop', 'tablet', 'mobile'];
const surfaces = [
  'customer-portal',
  'contractor-back-office',
  'operating-center',
];
const shaPattern = /^[a-f0-9]{64}$/;
const own = (value, key) => Object.hasOwn(value, key);
const object = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Reflect.ownKeys(value).every(
    (key) =>
      typeof key === 'string' &&
      own(Object.getOwnPropertyDescriptor(value, key), 'value'),
  );
const denseArray = (value) =>
  Array.isArray(value) &&
  value.length <= 5000 &&
  Object.getPrototypeOf(value) === Array.prototype &&
  Reflect.ownKeys(value).length === value.length + 1 &&
  Array.from({ length: value.length }, (_, i) =>
    Object.getOwnPropertyDescriptor(value, String(i)),
  ).every((descriptor) => descriptor && own(descriptor, 'value'));
const matches = (pattern, value) =>
  typeof value === 'string' && pattern.test(value);
const fail = (message) => {
  throw new Error(`Visual evidence rejected: ${message}`);
};
export const visualComparisonLimits = Object.freeze({
  screenshots: 144,
  bytesPerImage: 32 * 1024 * 1024,
  totalImageBytes: 128 * 1024 * 1024,
  outputPath: 'artifacts/cycle13/visual-comparison.html',
});
export const sha256VisualBytes = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');

function publicPath(path, kind) {
  if (
    typeof path !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/.test(path) ||
    path
      .split('/')
      .some((part) => !part || part === '.' || part.startsWith('.'))
  )
    fail('non-public or malformed relative path');
  if (
    kind === 'png' &&
    !/^artifacts\/(?:cycle13|cycle12|property|property-design|branding)\/[A-Za-z0-9][A-Za-z0-9_-]*\.png$/.test(
      path,
    )
  )
    fail('screenshot outside finite public artifact directories');
  if (kind === 'source' && !/^(?:docs|src|public)\//.test(path))
    fail('source outside public source roots');
  return path;
}

function publicFile(root, path, kind, maxBytes = 2 * 1024 * 1024) {
  publicPath(path, kind);
  const rootPath = resolve(root);
  if (
    !lstatSync(rootPath).isDirectory() ||
    lstatSync(rootPath).isSymbolicLink()
  )
    fail('root must be an actual directory');
  let current = rootPath;
  const parts = path.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = resolve(current, parts[i]);
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      fail('declared public file is missing');
    }
    if (stat.isSymbolicLink()) fail('symbolic links are forbidden');
    if (i < parts.length - 1 && !stat.isDirectory())
      fail('non-directory path segment');
    if (i === parts.length - 1 && (!stat.isFile() || stat.size > maxBytes))
      fail('invalid or oversized file');
  }
  const fd = openSync(current, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (
      !before.isFile() ||
      bytes.length > maxBytes ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      bytes.length !== after.size
    )
      fail('file changed during read');
    return bytes;
  } finally {
    closeSync(fd);
  }
}

function exactKeys(value, allowed, required = allowed) {
  if (
    !object(value) ||
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    required.some((key) => !own(value, key))
  )
    fail('unexpected or missing fields');
}

function text(value, max = 300) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail('invalid evidence text');
  return value;
}

function dimensions(bytes) {
  if (
    bytes.length < 45 ||
    !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  )
    fail('image is not PNG with an IHDR header');
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (!width || width > 20000 || !height || height > 60000)
    fail('PNG dimensions outside evidence limits');
  return { width, height };
}

export function readVisualInventory(root = process.cwd()) {
  let inventory;
  try {
    inventory = JSON.parse(
      publicFile(root, inventoryPath, 'source').toString(),
    );
  } catch {
    fail('public inventory could not be read');
  }
  validateVisualInventory(root, inventory);
  return inventory;
}

export function validateVisualInventory(root, inventory) {
  if (
    !object(inventory) ||
    inventory.schema !== 'propel-cycle13-visual-approval-inventory-v1' ||
    inventory.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    inventory.evidenceGrantsApproval !== false ||
    !denseArray(inventory.locks) ||
    inventory.locks.length !== 5 ||
    !denseArray(inventory.bindings) ||
    inventory.bindings.length !== 13 ||
    !denseArray(inventory.approvals) ||
    inventory.approvals.length !== 3 ||
    !denseArray(inventory.missingVisualApprovals) ||
    inventory.missingVisualApprovals.length !== 2 ||
    !denseArray(inventory.externalOriginals) ||
    inventory.externalOriginals.length !== 2 ||
    inventory.externalOriginals.some(
      (item) => !object(item) || item.availability !== 'MISSING',
    )
  )
    fail('inventory authority or cardinality mismatch');
  const contract = JSON.parse(
    publicFile(root, contractPath, 'source').toString(),
  );
  for (let i = 0; i < locks.length; i++) {
    const entry = inventory.locks[i];
    if (
      !object(entry) ||
      entry.path !== locks[i] ||
      entry.sha256 !== lockedHashes[i] ||
      !matches(shaPattern, entry.sha256) ||
      contract.locks[i]?.path !== entry.path ||
      contract.locks[i]?.sha256 !== entry.sha256 ||
      sha256VisualBytes(publicFile(root, entry.path, 'source')) !== entry.sha256
    )
      fail('approved locked source hash mismatch');
  }
  for (let i = 0; i < bindings.length; i++) {
    const entry = inventory.bindings[i];
    if (
      !object(entry) ||
      entry.id !== bindings[i] ||
      !object(entry.source) ||
      entry.source.path !== contract.bindings[i]?.source.path ||
      entry.source.anchor !== contract.bindings[i]?.source.anchor ||
      !publicFile(root, entry.source.path, 'source')
        .toString()
        .includes(entry.source.anchor)
    )
      fail('approved source binding mismatch');
  }
  for (let i = 0; i < approvals.length; i++) {
    const entry = inventory.approvals[i],
      expected = approvals[i];
    if (
      !object(entry) ||
      entry.id !== expected.id ||
      entry.path !== expected.path ||
      entry.anchor !== expected.anchor ||
      entry.sha256 !== expected.sha256 ||
      entry.status !== 'APPROVED_LOCAL_PRESENTATION_ONLY' ||
      !matches(shaPattern, entry.sha256)
    )
      fail('approval record mismatch');
    const bytes = publicFile(root, entry.path, 'source');
    if (
      sha256VisualBytes(bytes) !== entry.sha256 ||
      !bytes.toString().includes(expected.anchor)
    )
      fail('approval source changed or anchor missing');
  }
  if (
    inventory.missingVisualApprovals.some(
      (entry) =>
        !object(entry) ||
        entry.status !== 'NO_EXACT_VISUAL_APPROVAL_FOUND_IN_REVIEWED_RECORDS',
    ) ||
    inventory.missingVisualApprovals[0].id !== 'operating-center-cycle6-13' ||
    inventory.missingVisualApprovals[1].id !== 'advanced-addon-prototype-panels'
  )
    fail('missing approval status cannot be promoted');
  const expectedCollections = [
      'artifacts/branding',
      'artifacts/property',
      'artifacts/property-design',
      'artifacts/cycle12',
    ],
    screenshotPaths = new Set();
  if (
    !denseArray(inventory.screenshotCollections) ||
    inventory.screenshotCollections.length !== expectedCollections.length ||
    !object(inventory.summary)
  )
    fail('invalid public screenshot inventory');
  for (let i = 0; i < expectedCollections.length; i++) {
    const collection = inventory.screenshotCollections[i];
    if (
      !object(collection) ||
      collection.directory !== expectedCollections[i] ||
      collection.captureCommitBinding !== 'UNKNOWN' ||
      collection.approvalGrantedByPresence !== false ||
      collection.tracked !== false ||
      !denseArray(collection.records) ||
      collection.records.length !== collection.pngCount
    )
      fail('historical screenshot custody cannot be promoted');
    for (const entry of collection.records) {
      exactKeys(entry, ['path', 'sha256', 'width', 'height']);
      publicPath(entry.path, 'png');
      if (
        !entry.path.startsWith(`${collection.directory}/`) ||
        !matches(shaPattern, entry.sha256) ||
        !Number.isInteger(entry.width) ||
        !Number.isInteger(entry.height) ||
        entry.width < 1 ||
        entry.height < 1 ||
        screenshotPaths.has(entry.path)
      )
        fail('invalid historical screenshot identity');
      screenshotPaths.add(entry.path);
    }
  }
  if (screenshotPaths.size !== inventory.summary.retainedActualPngFiles)
    fail('historical screenshot count mismatch');
  return Object.freeze({ locks: 5, bindings: 13, approvalRecords: 3 });
}

const escape = (value) =>
  String(value).replace(/[&<>"']/g, (c) => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c];
  });

export function generateVisualComparison({
  root = process.cwd(),
  manifest,
  outputPath,
}) {
  readVisualInventory(root);
  exactKeys(
    manifest,
    ['schema', 'sourceCommit', 'sourceState', 'screenshots', 'title'],
    ['schema', 'sourceCommit', 'screenshots'],
  );
  if (
    manifest.schema !== 'propel-cycle13-visual-comparison-v1' ||
    (manifest.sourceCommit === null
      ? manifest.sourceState !== 'WORKING_TREE_UNCOMMITTED'
      : !matches(/^[a-f0-9]{40}$/, manifest.sourceCommit) ||
        (own(manifest, 'sourceState') &&
          manifest.sourceState !== 'COMMITTED')) ||
    !Array.isArray(manifest.screenshots) ||
    manifest.screenshots.length > visualComparisonLimits.screenshots ||
    !denseArray(manifest.screenshots)
  )
    fail('invalid comparison manifest');
  const title = own(manifest, 'title')
    ? text(manifest.title, 200)
    : 'Cycle 13 · Actual browser visual comparison';
  const ids = new Set(),
    paths = new Set(),
    pairSides = new Set(),
    pairs = new Map(),
    cards = [];
  let totalBytes = 0;
  for (const entry of manifest.screenshots) {
    exactKeys(
      entry,
      [
        'id',
        'pair',
        'side',
        'surface',
        'brand',
        'viewport',
        'path',
        'sha256',
        'caption',
        'sourceCommit',
      ],
      [
        'id',
        'pair',
        'side',
        'surface',
        'brand',
        'viewport',
        'path',
        'sha256',
        'caption',
      ],
    );
    if (
      !matches(/^[a-z0-9][a-z0-9-]{0,79}$/, entry.id) ||
      !matches(/^[a-z0-9][a-z0-9-]{0,79}$/, entry.pair) ||
      !['reference', 'current'].includes(entry.side) ||
      !surfaces.includes(entry.surface) ||
      !brands.includes(entry.brand) ||
      !viewports.includes(entry.viewport) ||
      !matches(shaPattern, entry.sha256) ||
      (own(entry, 'sourceCommit') &&
        entry.sourceCommit !== null &&
        !matches(/^[a-f0-9]{40}$/, entry.sourceCommit))
    )
      fail('invalid screenshot identity');
    text(entry.caption);
    publicPath(entry.path, 'png');
    const identity = `${entry.surface}/${entry.brand}/${entry.viewport}`;
    if (
      ids.has(entry.id) ||
      paths.has(entry.path) ||
      pairSides.has(`${entry.pair}/${entry.side}`)
    )
      fail('duplicate screenshot, path or comparison side');
    const existing = pairs.get(entry.pair);
    if (existing && existing.identity !== identity)
      fail('comparison pair crosses surface, contractor or viewport');
    const bytes = publicFile(
      root,
      entry.path,
      'png',
      visualComparisonLimits.bytesPerImage,
    );
    if (sha256VisualBytes(bytes) !== entry.sha256)
      fail('screenshot hash mismatch');
    const size = dimensions(bytes);
    totalBytes += bytes.length;
    if (totalBytes > visualComparisonLimits.totalImageBytes)
      fail('aggregate screenshot limit exceeded');
    const card = {
      ...entry,
      ...size,
      sourceCommit: entry.sourceCommit ?? null,
      data: bytes.toString('base64'),
    };
    if (!existing) pairs.set(entry.pair, { identity, entries: [] });
    pairs.get(entry.pair).entries.push(card);
    cards.push(card);
    ids.add(entry.id);
    paths.add(entry.path);
    pairSides.add(`${entry.pair}/${entry.side}`);
  }
  const paired = [...pairs.values()].filter(
      (pair) => pair.entries.length === 2,
    ),
    coverage = surfaces.flatMap((surface) =>
      brands.flatMap((brand) =>
        viewports.map((viewport) => ({
          surface,
          brand,
          viewport,
          paired: paired.some(
            (pair) => pair.identity === `${surface}/${brand}/${viewport}`,
          ),
        })),
      ),
    );
  const sections = [...pairs.entries()]
    .map(([id, pair]) => {
      const content = ['reference', 'current']
        .map((side) => {
          const card = pair.entries.find((entry) => entry.side === side);
          if (!card)
            return `<div class="missing"><h3>${escape(side)}</h3><p>MISSING — no declared actual PNG supplied.</p></div>`;
          return `<figure><h3>${escape(side)}</h3><img alt="${escape(`${card.surface}, ${card.brand}, ${card.viewport}, ${side}: ${card.caption}`)}" width="${card.width}" height="${card.height}" src="data:image/png;base64,${card.data}"><figcaption>${escape(card.caption)}<br>${escape(card.path)}<br>SHA-256 ${escape(card.sha256)}<br>Capture source: ${escape(card.sourceCommit ?? 'UNKNOWN — no exact capture commit supplied')}</figcaption></figure>`;
        })
        .join('');
      return `<section aria-labelledby="${escape(id)}"><h2 id="${escape(id)}">${escape(pair.identity)} · ${escape(id)}</h2><div class="pair">${content}</div></section>`;
    })
    .join('');
  const missing = coverage
    .filter((entry) => !entry.paired)
    .map(
      (entry) =>
        `<li>${escape(`${entry.surface} / ${entry.brand} / ${entry.viewport}`)}</li>`,
    )
    .join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(title)}</title><style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#f5f6f2;color:#203530}main{max-width:1600px;margin:auto;padding:24px}h1,h2,h3{line-height:1.2}.notice,.missing{padding:16px;border:2px solid #566960;background:white}section{margin:32px 0}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}figure{margin:0;min-width:0;background:white;padding:16px;border:1px solid #dde4dd}img{display:block;width:100%;height:auto;object-fit:contain}figcaption{margin-top:12px;overflow-wrap:anywhere;font-size:14px}code{overflow-wrap:anywhere}@media(max-width:760px){main{padding:16px}.pair{grid-template-columns:1fr}}</style></head><body><main><h1>${escape(title)}</h1><p class="notice"><strong>Visual review evidence only. Release 1.0 NOT READY / NOT AUTHORIZED.</strong> Existing customer and contractor local Phase B approvals retain their exact scope. Operating Center and add-on visual approval is not established by screenshots, source hashes, passing tests or this gallery. This tool neither compares pixels nor grants approval, responsive acceptance, accessibility, physical recovery or operational authority. PNG bytes are embedded unaltered.</p><p>Comparison manifest source: <code>${escape(manifest.sourceCommit ?? 'WORKING_TREE_UNCOMMITTED — exact committed capture identity is not established')}</code>. ${cards.length} actual PNG files verified; ${paired.length} complete supplied pairs.</p><details><summary>Missing comparison coverage (${coverage.length - coverage.filter((entry) => entry.paired).length} of ${coverage.length} required surface/brand/viewport combinations)</summary><ul>${missing || '<li>No missing supplied pairs. Visual differences still require human review.</li>'}</ul></details>${sections || '<p role="status">No actual screenshots supplied. All visual comparison coverage remains MISSING.</p>'}<p>Original external mockup files are not present in tracked public sources. Retained approved React/CSS and source artwork are available; missing originals have not been reconstructed. The accepted portal transparency difference is documented in PROPERTY_PORTAL_PHASE_B.md.</p></main></body></html>`;
  if (outputPath !== undefined) {
    if (outputPath !== visualComparisonLimits.outputPath)
      fail('output must be the single isolated comparison HTML path');
    const absolute = resolve(root, outputPath);
    for (const part of ['artifacts', 'artifacts/cycle13']) {
      const directory = resolve(root, part);
      try {
        const stat = lstatSync(directory);
        if (stat.isSymbolicLink() || !stat.isDirectory())
          fail('output directory is not an actual directory');
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        mkdirSync(directory);
      }
    }
    try {
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1)
        fail('invalid output file');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
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
        writeFileSync(fd, html);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, absolute);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  return Object.freeze({
    html,
    screenshots: cards.length,
    completePairs: paired.length,
    imageBytes: totalBytes,
    missingCoverage: Object.freeze(coverage.filter((entry) => !entry.paired)),
    approvalGranted: false,
    release: 'NOT_READY_NOT_AUTHORIZED',
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (
      process.argv.length !== 3 ||
      process.argv[2] !== 'artifacts/cycle13/visual-comparison-manifest.json'
    )
      fail('use the single local comparison manifest path');
    const manifest = JSON.parse(
      publicFile(process.cwd(), process.argv[2], 'manifest').toString(),
    );
    const result = generateVisualComparison({
      manifest,
      outputPath: visualComparisonLimits.outputPath,
    });
    console.log(
      JSON.stringify({
        screenshots: result.screenshots,
        completePairs: result.completePairs,
        missingCoverage: result.missingCoverage.length,
        approvalGranted: false,
        output: visualComparisonLimits.outputPath,
      }),
    );
  } catch {
    console.error(
      'Visual comparison rejected; no approval or release gate changed.',
    );
    process.exitCode = 1;
  }
}
