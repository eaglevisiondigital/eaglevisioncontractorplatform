import { expect, it } from 'vitest';
import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  linkSync,
  mkdtempSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createOwnerVisualReview,
  readReviewImage,
  writeOwnerVisualOutput,
  type OwnerVisualScreenshot,
} from '../../scripts/cycle14-visual-review.mjs';

const bytes = readFileSync(
  'public/brand/propel-contractor-suite-transparent.png',
);
const sha = createHash('sha256').update(bytes).digest('hex');
const item = (
  patch: Partial<OwnerVisualScreenshot> = {},
): OwnerVisualScreenshot => ({
  scope: 'operating-panels',
  brand: 'straight-edge',
  viewport: 'desktop',
  side: 'current',
  path: 'artifacts/cycle14/test-current.png',
  sha256: sha,
  sourceCommit: null,
  caption: 'Actual synthetic screenshot',
  ...patch,
});
const manifest = (screenshots: unknown[]) => ({
  schema: 'propel-cycle14-owner-visual-v1',
  screenshots,
});
const review = (screenshots: unknown[]) =>
  createOwnerVisualReview({
    manifest: manifest(screenshots),
    read: () => bytes,
  });

it('restricts owner decisions to two unapproved scopes and preserves three approvals', () => {
  const r = review([item()]);
  expect(r.html).toContain('1. Operating Center panels');
  expect(r.html).toContain('2. Advanced add-on panels');
  expect(r.html).toContain('external original logo attachment');
  expect(r.html).toContain('original mockup image are MISSING');
  expect(r.html).toContain('are not being resubmitted');
  expect(r.approvalGranted).toBe(false);
  expect(r.release).toBe('NOT_READY_NOT_AUTHORIZED');
});
it('embeds actual unchanged bytes and their exact hash without inferred source identity', () => {
  const r = review([item()]);
  expect(r.html).toContain(bytes.toString('base64'));
  expect(r.html).toContain(sha);
  expect(r.html).toContain('UNKNOWN / uncommitted at capture');
  expect(r.completePairs).toBe(0);
  expect(r.missingPairs).toBe(18);
});
it('labels engineering references without promoting them to approved originals', () => {
  const r = review([item({ side: 'reference' })]);
  expect(r.html).toContain(
    'Cycle13 engineering reference — NOT owner approved',
  );
  expect(r.html).toContain('not independent served-bundle attestation');
});
it('reports all missing pairs honestly for empty evidence', () => {
  const r = review([]);
  expect(r.screenshots).toBe(0);
  expect(r.missingPairs).toBe(18);
  expect(r.html).toContain('MISSING — no image supplied');
});
it('compares all three brands and all viewports within each exact visual scope', () => {
  const screenshots: OwnerVisualScreenshot[] = [];
  for (const scope of ['operating-panels', 'advanced-panels'] as const)
    for (const brand of [
      'straight-edge',
      'cunningham',
      'roofing-example',
    ] as const)
      for (const viewport of ['desktop', 'tablet', 'mobile'] as const)
        for (const side of ['reference', 'current'] as const)
          screenshots.push(
            item({
              scope,
              brand,
              viewport,
              side,
              path: `artifacts/cycle14/${scope}-${brand}-${viewport}-${side}.png`,
            }),
          );
  const r = review(screenshots);
  expect(r.screenshots).toBe(36);
  expect(r.completePairs).toBe(18);
  expect(r.missingPairs).toBe(0);
});
it('never pairs different company, viewport or scope identities', () => {
  for (const patch of [
    { brand: 'cunningham' },
    { viewport: 'mobile' },
    { scope: 'advanced-panels' },
  ] as const) {
    const r = review([
      item({ side: 'reference' }),
      item({ ...patch, path: 'artifacts/cycle14/other.png' }),
    ]);
    expect(r.completePairs).toBe(0);
  }
});
it('rejects duplicate side, repeated paths and invented approved scopes', () => {
  expect(() =>
    review([item(), item({ path: 'artifacts/cycle14/other.png' })]),
  ).toThrow('duplicate comparison side');
  expect(() => review([item(), item({ side: 'reference' })])).toThrow(
    'unique public',
  );
  expect(() => review([item({ scope: 'customer-portal' as never })])).toThrow(
    'unique public',
  );
});
it('rejects private/traversal/URL paths even with a supplied reader', () => {
  for (const path of [
    '.staging/support.png',
    'artifacts/cycle14/../secret.png',
    'https://example.com/a.png',
    '/tmp/a.png',
    'artifacts/cycle14/.private.png',
  ])
    expect(() => review([item({ path })])).toThrow('finite public');
});
it('rejects changed image bytes, malformed PNG and missing dimensions', () => {
  expect(() => review([item({ sha256: '0'.repeat(64) })])).toThrow('PNG bytes');
  expect(() =>
    createOwnerVisualReview({
      manifest: manifest([item()]),
      read: () => Buffer.from('not image'),
    }),
  ).toThrow('PNG bytes');
  const zero = Buffer.from(bytes);
  zero.writeUInt32BE(0, 16);
  expect(() =>
    createOwnerVisualReview({
      manifest: manifest([
        item({ sha256: createHash('sha256').update(zero).digest('hex') }),
      ]),
      read: () => zero,
    }),
  ).toThrow('PNG bytes');
});
it('does not execute getters on manifests, records or screenshot arrays', () => {
  const getter = () => {
    throw Error('getter executed');
  };
  const record = Object.defineProperty({ ...item() }, 'caption', {
    get: getter,
  });
  expect(() => review([record])).toThrow('unique public');
  const input = Object.defineProperty({}, 'screenshots', { get: getter });
  expect(() => createOwnerVisualReview({ manifest: input })).toThrow(
    'bounded screenshot',
  );
  const list = [item()];
  Object.defineProperty(list, '0', { get: getter });
  expect(() => review(list)).toThrow('bounded screenshot');
});
it('rejects sparse arrays, extra fields and excessive evidence', () => {
  expect(() => review(new Array(1))).toThrow('bounded screenshot');
  expect(() => review([{ ...item(), private_notes: 'hidden' }])).toThrow(
    'unique public',
  );
  expect(() => review(new Array(37).fill(item()))).toThrow(
    'bounded screenshot',
  );
});
it('escapes captions and never supplies active script, forms or remote image links', () => {
  const r = review([
    item({ caption: '<script>alert(1)</script><img src="https://bad">' }),
  ]);
  expect(r.html).toContain('&lt;script&gt;');
  expect(r.html).not.toContain('<script>');
  expect(r.html).not.toContain('<form');
  expect(r.html).not.toContain('<img src="https:');
  expect(r.html).toContain("default-src 'none'");
});
it('rejects malformed source metadata rather than substituting current checkout SHA', () => {
  expect(() => review([item({ sourceCommit: 'guess' })])).toThrow(
    'unique public',
  );
  const r = review([item({ sourceCommit: 'a'.repeat(40) })]);
  expect(r.html).toContain('a'.repeat(40));
  expect(r.approvalGranted).toBe(false);
});
it('rejects symlink image evidence and requires local regular files', () => {
  const dir = 'artifacts/cycle14';
  mkdirSync(dir, { recursive: true });
  const path = `${dir}/test-link.png`,
    target = `${dir}/test-original.png`;
  try {
    writeFileSync(target, bytes);
    symlinkSync('test-original.png', path);
    expect(() => readReviewImage(process.cwd(), path)).toThrow(
      'links forbidden',
    );
  } finally {
    rmSync(path, { force: true });
    rmSync(target, { force: true });
  }
});

it('refuses hard-linked output HTML and manifest without changing either link', () => {
  const root = mkdtempSync(join(tmpdir(), 'propel-c14-output-'));
  try {
    mkdirSync(`${root}/artifacts/cycle14`, { recursive: true });
    writeFileSync(`${root}/sentinel`, 'retain exact original');
    for (const file of ['owner-visual-review.html', 'visual-manifest.json']) {
      linkSync(`${root}/sentinel`, `${root}/artifacts/cycle14/${file}`);
      expect(() =>
        writeOwnerVisualOutput(
          root,
          `artifacts/cycle14/${file}`,
          'replacement',
        ),
      ).toThrow('single-link output');
      expect(readFileSync(`${root}/sentinel`, 'utf8')).toBe(
        'retain exact original',
      );
      rmSync(`${root}/artifacts/cycle14/${file}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it('atomically replaces only the two exact regular local outputs', () => {
  const root = mkdtempSync(join(tmpdir(), 'propel-c14-output-'));
  try {
    for (const file of ['owner-visual-review.html', 'visual-manifest.json']) {
      const p = `artifacts/cycle14/${file}`;
      writeOwnerVisualOutput(root, p, 'first');
      writeOwnerVisualOutput(root, p, 'second');
      expect(readFileSync(`${root}/${p}`, 'utf8')).toBe('second');
    }
    expect(() =>
      writeOwnerVisualOutput(root, 'docs/BRANDING.md', 'alter'),
    ).toThrow('exact output');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
