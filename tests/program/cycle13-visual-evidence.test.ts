import { afterEach, describe, expect, it } from 'vitest';
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import inventory from '../../docs/program/CYCLE13_VISUAL_APPROVAL_INVENTORY.json';
import {
  generateVisualComparison,
  readVisualInventory,
  sha256VisualBytes,
  validateVisualInventory,
  visualComparisonLimits,
  type VisualComparisonManifest,
  type VisualScreenshot,
} from '../../scripts/cycle13-visual-comparison.mjs';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const roots: string[] = [];
const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6mQAAAAASUVORK5CYII=',
  'base64',
);
const head = 'c41a2424a0bd098905fd60965ef7f78447f1c753';
function put(root: string, path: string, bytes: string | Buffer) {
  mkdirSync(dirname(resolve(root, path)), { recursive: true });
  writeFileSync(resolve(root, path), bytes);
}
function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'propel-cycle13-visual-'));
  roots.push(root);
  const sources = new Set([
    'docs/program/CYCLE13_VISUAL_APPROVAL_INVENTORY.json',
    'docs/program/DESIGN_SYSTEM_CONTRACT.json',
    ...inventory.locks.map((entry) => entry.path),
    ...inventory.bindings.map((entry) => entry.source.path),
    ...inventory.approvals.map((entry) => entry.path),
  ]);
  for (const path of sources) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    copyFileSync(resolve(sourceRoot, path), resolve(root, path));
  }
  return root;
}
function shot(
  root: string,
  change: Partial<VisualScreenshot> = {},
): VisualScreenshot {
  const entry: VisualScreenshot = {
    id: 'portal-desktop-current',
    pair: 'portal-desktop',
    side: 'current',
    surface: 'customer-portal',
    brand: 'straight-edge',
    viewport: 'desktop',
    path: 'artifacts/cycle13/current.png',
    sha256: sha256VisualBytes(image),
    caption: 'Actual synthetic browser PNG supplied by the explicit manifest.',
    sourceCommit: head,
    ...change,
  };
  put(root, entry.path, image);
  return entry;
}
function manifest(
  screenshots: VisualScreenshot[] = [],
): VisualComparisonManifest {
  return {
    schema: 'propel-cycle13-visual-comparison-v1',
    sourceCommit: head,
    screenshots,
  };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('exact public approval sources and retained visual inventory', () => {
  it('binds five unchanged approved files, thirteen anchors and three exact local approval records', () => {
    expect(validateVisualInventory(sourceRoot, inventory)).toEqual({
      locks: 5,
      bindings: 13,
      approvalRecords: 3,
    });
    expect(readVisualInventory(sourceRoot)).toEqual(inventory);
    expect(inventory.trackedRasterOrVectorAssets).toEqual([
      'public/brand/propel-contractor-suite-transparent.png',
      'public/brand/propel-contractor-suite.png',
    ]);
    expect(
      inventory.brandingAssets.map((entry) => [entry.width, entry.height]),
    ).toEqual([
      [2172, 724],
      [2172, 724],
    ]);
  });
  it('retains all 777 discovered PNG identities while preserving UNKNOWN capture custody', () => {
    const entries = inventory.screenshotCollections.flatMap(
      (entry) => entry.records,
    );
    expect(entries).toHaveLength(777);
    expect(
      inventory.screenshotCollections.map((entry) => entry.pngCount),
    ).toEqual([16, 635, 27, 99]);
    expect(
      inventory.screenshotCollections.every(
        (entry) =>
          entry.captureCommitBinding === 'UNKNOWN' &&
          entry.approvalGrantedByPresence === false &&
          entry.tracked === false,
      ),
    ).toBe(true);
    expect(new Set(entries.map((entry) => entry.path)).size).toBe(777);
    expect(entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256))).toBe(
      true,
    );
    expect(JSON.stringify(inventory)).not.toMatch(
      /\/Users\/|\/private\/|\.staging\/|PRIVATE_SENTINEL|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i,
    );
  });
  it('records missing originals and missing exact approvals without reconstructing or promoting', () => {
    expect(inventory.externalOriginals).toHaveLength(2);
    expect(
      inventory.externalOriginals.every(
        (entry) => entry.availability === 'MISSING',
      ),
    ).toBe(true);
    expect(inventory.missingVisualApprovals).toHaveLength(2);
    expect(
      inventory.missingVisualApprovals.every(
        (entry) =>
          entry.status === 'NO_EXACT_VISUAL_APPROVAL_FOUND_IN_REVIEWED_RECORDS',
      ),
    ).toBe(true);
    expect(inventory.release).toBe('NOT_READY_NOT_AUTHORIZED');
    expect(inventory.evidenceGrantsApproval).toBe(false);
  });
  it.each(['src/styles.css', 'public/brand/propel-contractor-suite.png'])(
    'rejects changed locked source %s',
    (path) => {
      const root = fixture();
      put(root, path, 'changed');
      expect(() => readVisualInventory(root)).toThrow(
        'locked source hash mismatch',
      );
    },
  );
  it('rejects an altered un-locked navigation binding', () => {
    const root = fixture();
    put(
      root,
      'src/components/WorkspaceNavigation.tsx',
      'not the authorized binding',
    );
    expect(() => readVisualInventory(root)).toThrow('source binding mismatch');
  });
  it('rejects altered approval prose rather than replacing old pending evidence', () => {
    const root = fixture();
    put(root, 'docs/CONTRACTOR_BACK_OFFICE_PHASE_B.md', 'approved anything');
    expect(() => readVisualInventory(root)).toThrow('approval source changed');
  });
  it('does not accept a modified inventory lock as new approval', () => {
    const changed = structuredClone(inventory);
    changed.locks[0].sha256 = 'f'.repeat(64);
    expect(() => validateVisualInventory(sourceRoot, changed)).toThrow();
  });
  it('rejects jointly rehashed CSS, contract and inventory without a new exact approval', () => {
    const root = fixture();
    const changed = structuredClone(inventory);
    const bytes = Buffer.from('unapproved redesign');
    changed.locks[0].sha256 = sha256VisualBytes(bytes);
    put(root, changed.locks[0].path, bytes);
    const contract = JSON.parse(
      readFileSync(
        resolve(root, 'docs/program/DESIGN_SYSTEM_CONTRACT.json'),
        'utf8',
      ),
    );
    contract.locks[0].sha256 = changed.locks[0].sha256;
    put(
      root,
      'docs/program/DESIGN_SYSTEM_CONTRACT.json',
      JSON.stringify(contract),
    );
    expect(() => validateVisualInventory(root, changed)).toThrow(
      'locked source',
    );
  });
  it.each(['release', 'evidenceGrantsApproval', 'missingVisualApprovals'])(
    'blocks approval promotion through %s',
    (field) => {
      const changed = { ...inventory, [field]: true };
      expect(() => validateVisualInventory(sourceRoot, changed)).toThrow();
    },
  );
  it('rejects active inventory getters without reading them', () => {
    let reads = 0;
    const active = Object.defineProperty({}, 'schema', {
      get() {
        reads++;
        throw Error('PRIVATE');
      },
    });
    expect(() => validateVisualInventory(sourceRoot, active)).toThrow();
    expect(reads).toBe(0);
  });
  it('rejects an inventory screenshot changed to a private path', () => {
    const changed = structuredClone(inventory);
    changed.screenshotCollections[0].records[0].path = '.staging/secret.png';
    expect(() => validateVisualInventory(sourceRoot, changed)).toThrow();
  });
  it('rejects historical screenshot custody and count promotion', () => {
    const changed = structuredClone(inventory);
    changed.screenshotCollections[0].captureCommitBinding = head;
    expect(() => validateVisualInventory(sourceRoot, changed)).toThrow(
      'custody',
    );
    const wrongCount = structuredClone(inventory);
    wrongCount.summary.retainedActualPngFiles++;
    expect(() => validateVisualInventory(sourceRoot, wrongCount)).toThrow(
      'count',
    );
  });
});

describe('standalone unaltered PNG comparison', () => {
  it('embeds exact source bytes in labelled reference/current columns with retained hash and no authority', () => {
    const root = fixture();
    const current = shot(root),
      reference = shot(root, {
        id: 'portal-desktop-reference',
        side: 'reference',
        path: 'artifacts/cycle13/reference.png',
        sourceCommit: null,
      });
    const result = generateVisualComparison({
      root,
      manifest: manifest([current, reference]),
      outputPath: visualComparisonLimits.outputPath,
    });
    expect(result.screenshots).toBe(2);
    expect(result.completePairs).toBe(1);
    expect(result.missingCoverage).toHaveLength(26);
    expect(result.html).toContain(
      `data:image/png;base64,${image.toString('base64')}`,
    );
    expect(result.html).toContain('UNKNOWN — no exact capture commit supplied');
    expect(result.html).toContain(
      'neither compares pixels nor grants approval',
    );
    expect(result.html).toContain('grid-template-columns:1fr');
    expect(result.html).toContain("default-src 'none'");
    expect(result.html).not.toContain('<script');
    expect(result.approvalGranted).toBe(false);
    expect(result.release).toBe('NOT_READY_NOT_AUTHORIZED');
    expect(
      readFileSync(resolve(root, visualComparisonLimits.outputPath), 'utf8'),
    ).toBe(result.html);
    expect(readFileSync(resolve(root, current.path))).toEqual(image);
  });
  it('covers all three brands and viewports on each surface only when exact paired PNGs exist', () => {
    const root = fixture(),
      entries: VisualScreenshot[] = [];
    for (const surface of [
      'customer-portal',
      'contractor-back-office',
      'operating-center',
    ] as const)
      for (const brand of [
        'straight-edge',
        'cunningham',
        'roofing-example',
      ] as const)
        for (const viewport of ['desktop', 'tablet', 'mobile'] as const)
          for (const side of ['reference', 'current'] as const) {
            const pair = `${surface}-${brand}-${viewport}`,
              id = `${pair}-${side}`;
            entries.push(
              shot(root, {
                id,
                pair,
                surface,
                brand,
                viewport,
                side,
                path: `artifacts/cycle13/${id}.png`,
              }),
            );
          }
    const result = generateVisualComparison({
      root,
      manifest: manifest(entries),
    });
    expect(result.completePairs).toBe(27);
    expect(result.screenshots).toBe(54);
    expect(result.missingCoverage).toEqual([]);
    expect(result.approvalGranted).toBe(false);
  });
  it('an incomplete pair remains visibly missing rather than equivalent', () => {
    const root = fixture();
    const result = generateVisualComparison({
      root,
      manifest: manifest([shot(root)]),
    });
    expect(result.completePairs).toBe(0);
    expect(result.missingCoverage).toHaveLength(27);
    expect(result.html).toContain('MISSING — no declared actual PNG supplied.');
  });
  it('an empty manifest provides a truthful empty state', () => {
    const result = generateVisualComparison({ manifest: manifest() });
    expect(result.screenshots).toBe(0);
    expect(result.html).toContain('No actual screenshots supplied');
    expect(result.missingCoverage).toHaveLength(27);
  });
  it('labels real uncommitted captures without inventing a committed build SHA', () => {
    const result = generateVisualComparison({
      manifest: {
        ...manifest(),
        sourceCommit: null,
        sourceState: 'WORKING_TREE_UNCOMMITTED',
      },
    });
    expect(result.html).toContain('WORKING_TREE_UNCOMMITTED');
    expect(result.html).toContain(
      'exact committed capture identity is not established',
    );
    expect(result.approvalGranted).toBe(false);
  });
  it.each([
    { sourceCommit: null },
    { sourceCommit: null, sourceState: 'COMMITTED' },
    { sourceCommit: head, sourceState: 'WORKING_TREE_UNCOMMITTED' },
  ])('rejects contradictory or unsupported capture provenance %j', (source) => {
    expect(() =>
      generateVisualComparison({ manifest: { ...manifest(), ...source } }),
    ).toThrow('manifest');
  });
  it('escapes all supplied copy while retaining the original image bytes', () => {
    const root = fixture();
    const entry = shot(root, {
      caption: '<script>alert("unsafe")</script> & staff\'s source',
    });
    const result = generateVisualComparison({
      root,
      manifest: { ...manifest([entry]), title: '<img onerror="unsafe">' },
    });
    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('<img onerror');
    expect(result.html).toContain('&lt;script&gt;');
    expect(result.html).toContain('&amp; staff&#39;s');
  });
  it('rejects unavailable screenshots before writing any comparison', () => {
    const root = fixture(),
      entry = shot(root);
    rmSync(resolve(root, entry.path));
    expect(() =>
      generateVisualComparison({
        root,
        manifest: manifest([entry]),
        outputPath: visualComparisonLimits.outputPath,
      }),
    ).toThrow('file is missing');
    expect(existsSync(resolve(root, visualComparisonLimits.outputPath))).toBe(
      false,
    );
  });
  it('rejects hash drift and preserves an earlier output', () => {
    const root = fixture(),
      entry = shot(root, { sha256: 'f'.repeat(64) });
    put(root, visualComparisonLimits.outputPath, 'prior retained comparison');
    expect(() =>
      generateVisualComparison({
        root,
        manifest: manifest([entry]),
        outputPath: visualComparisonLimits.outputPath,
      }),
    ).toThrow('hash mismatch');
    expect(
      readFileSync(resolve(root, visualComparisonLimits.outputPath), 'utf8'),
    ).toBe('prior retained comparison');
  });
  it.each(['id', 'path', 'side'])('rejects duplicate %s identities', (kind) => {
    const root = fixture(),
      first = shot(root);
    const second = shot(root, {
      id: 'second',
      pair: 'second-pair',
      path: 'artifacts/cycle13/second.png',
    });
    if (kind === 'id') second.id = first.id;
    if (kind === 'path') second.path = first.path;
    if (kind === 'side') second.pair = first.pair;
    expect(() =>
      generateVisualComparison({ root, manifest: manifest([first, second]) }),
    ).toThrow('duplicate');
  });
  it.each(['brand', 'surface', 'viewport'] as const)(
    'rejects a comparison across %s',
    (kind) => {
      const root = fixture(),
        first = shot(root);
      const second = shot(root, {
        id: 'reference',
        side: 'reference',
        path: 'artifacts/cycle13/reference.png',
        [kind]:
          kind === 'brand'
            ? 'cunningham'
            : kind === 'surface'
              ? 'operating-center'
              : 'mobile',
      });
      expect(() =>
        generateVisualComparison({ root, manifest: manifest([first, second]) }),
      ).toThrow('pair crosses');
    },
  );
  it.each([
    '/private/source.png',
    '../source.png',
    'artifacts/cycle13/../../source.png',
    '.staging/source.png',
    'artifacts/cycle13/.private.png',
    'artifacts//cycle13/source.png',
    'artifacts/cycle13/source.svg',
    'public/brand/propel-contractor-suite.png',
    'artifacts/cycle13/subdir/source.png',
  ])('rejects private, traversing or unapproved screenshot path %s', (path) => {
    const root = fixture(),
      entry = shot(root);
    entry.path = path;
    expect(() =>
      generateVisualComparison({ root, manifest: manifest([entry]) }),
    ).toThrow();
  });
  it('rejects direct symlink sources', () => {
    const root = fixture(),
      entry = shot(root);
    put(root, 'artifacts/cycle13/other.png', image);
    rmSync(resolve(root, entry.path));
    symlinkSync(
      resolve(root, 'artifacts/cycle13/other.png'),
      resolve(root, entry.path),
    );
    expect(() =>
      generateVisualComparison({ root, manifest: manifest([entry]) }),
    ).toThrow('symbolic links');
  });
  it('rejects a symlinked source parent', () => {
    const root = fixture(),
      entry = shot(root);
    rmSync(resolve(root, 'artifacts/cycle13'), { recursive: true });
    mkdirSync(resolve(root, 'artifacts/property'));
    put(root, 'artifacts/property/current.png', image);
    symlinkSync(
      resolve(root, 'artifacts/property'),
      resolve(root, 'artifacts/cycle13'),
    );
    expect(() =>
      generateVisualComparison({ root, manifest: manifest([entry]) }),
    ).toThrow('symbolic links');
  });
  it('rejects symlinked output without changing its destination', () => {
    const root = fixture();
    put(root, 'artifacts/cycle13/retained.txt', 'retained');
    symlinkSync(
      resolve(root, 'artifacts/cycle13/retained.txt'),
      resolve(root, visualComparisonLimits.outputPath),
    );
    expect(() =>
      generateVisualComparison({
        root,
        manifest: manifest(),
        outputPath: visualComparisonLimits.outputPath,
      }),
    ).toThrow('invalid output');
    expect(
      readFileSync(resolve(root, 'artifacts/cycle13/retained.txt'), 'utf8'),
    ).toBe('retained');
  });
  it('rejects hardlinked output without overwriting the approved source inode', () => {
    const root = fixture();
    mkdirSync(resolve(root, 'artifacts/cycle13'), { recursive: true });
    const original = readFileSync(resolve(root, 'src/styles.css'));
    linkSync(
      resolve(root, 'src/styles.css'),
      resolve(root, visualComparisonLimits.outputPath),
    );
    expect(() =>
      generateVisualComparison({
        root,
        manifest: manifest(),
        outputPath: visualComparisonLimits.outputPath,
      }),
    ).toThrow('invalid output');
    expect(readFileSync(resolve(root, 'src/styles.css'))).toEqual(original);
  });
  it.each([
    '../review.html',
    'artifacts/property/review.html',
    '.staging/review.html',
  ])('rejects output outside the isolated artifact %s', (outputPath) => {
    expect(() =>
      generateVisualComparison({ manifest: manifest(), outputPath }),
    ).toThrow('single isolated');
  });
  it('rejects private fields rather than serializing them into the gallery', () => {
    const root = fixture(),
      entry = shot(root);
    const bad = { ...entry, staffOnlyNote: 'PRIVATE_SENTINEL' };
    expect(() =>
      generateVisualComparison({ root, manifest: manifest([bad]) }),
    ).toThrow('unexpected');
    expect(() =>
      generateVisualComparison({
        root,
        manifest: { ...manifest(), privateCustomer: 'PRIVATE_SENTINEL' },
      }),
    ).toThrow('unexpected');
  });
  it('rejects active manifest and screenshot getters without executing private code', () => {
    const root = fixture(),
      entry = shot(root);
    let reads = 0;
    const active = Object.defineProperty({ ...entry }, 'caption', {
      get() {
        reads++;
        throw Error('PRIVATE_SENTINEL');
      },
    });
    expect(() =>
      generateVisualComparison({ root, manifest: manifest([active]) }),
    ).toThrow();
    const badManifest = Object.defineProperty({}, 'schema', {
      get() {
        reads++;
        throw Error('PRIVATE_SENTINEL');
      },
    });
    expect(() =>
      generateVisualComparison({ root, manifest: badManifest }),
    ).toThrow();
    expect(reads).toBe(0);
  });
  it('rejects active and sparse screenshot arrays without reading elements', () => {
    let reads = 0;
    const active: VisualScreenshot[] = [];
    Object.defineProperty(active, '0', {
      get() {
        reads++;
        throw Error('PRIVATE_SENTINEL');
      },
    });
    expect(() =>
      generateVisualComparison({ manifest: manifest(active) }),
    ).toThrow();
    expect(() =>
      generateVisualComparison({ manifest: manifest(new Array(2)) }),
    ).toThrow();
    expect(reads).toBe(0);
  });
  it('rejects non-PNG and unbounded image dimensions', () => {
    const root = fixture(),
      entry = shot(root);
    const bad = Buffer.from('<svg onload="private()"></svg>');
    put(root, entry.path, bad);
    entry.sha256 = sha256VisualBytes(bad);
    expect(() =>
      generateVisualComparison({ root, manifest: manifest([entry]) }),
    ).toThrow('not PNG');
    const huge = Buffer.from(image);
    huge.writeUInt32BE(60001, 20);
    put(root, entry.path, huge);
    entry.sha256 = sha256VisualBytes(huge);
    expect(() =>
      generateVisualComparison({ root, manifest: manifest([entry]) }),
    ).toThrow('dimensions');
  });
  it('enforces the finite screenshot count before filesystem admission', () => {
    expect(() =>
      generateVisualComparison({ manifest: manifest(new Array(145)) }),
    ).toThrow('manifest');
    expect(visualComparisonLimits.screenshots).toBe(144);
    expect(visualComparisonLimits.totalImageBytes).toBe(128 * 1024 * 1024);
  });
  it('rejects oversized source files before reading image data', () => {
    const root = fixture(),
      entry = shot(root);
    truncateSync(
      resolve(root, entry.path),
      visualComparisonLimits.bytesPerImage + 1,
    );
    expect(() =>
      generateVisualComparison({ root, manifest: manifest([entry]) }),
    ).toThrow('oversized');
  });
  it.each(['sourceCommit', 'schema'])(
    'rejects malformed top-level identity %s',
    (field) => {
      expect(() =>
        generateVisualComparison({
          manifest: { ...manifest(), [field]: 'unverified' },
        }),
      ).toThrow();
    },
  );
});
