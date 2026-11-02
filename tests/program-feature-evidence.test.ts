import { afterEach, expect, it } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  inventorySources,
  requiredFeatureIds,
  runFeatureEvidence,
  sourceOwner,
  validateFeatureEvidence,
} from '../scripts/feature-evidence.mjs';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'propel-evidence-'));
  roots.push(root);
  mkdirSync(join(root, 'docs'));
  mkdirSync(join(root, 'src'));
  for (const name of [
    'README.md',
    'AGENTS.md',
    'docs/PRODUCT_PROGRAM_2026.md',
    'docs/FEATURE_ACCEPTANCE_REGISTER.md',
  ])
    writeFileSync(join(root, name), 'retained evidence');
  writeFileSync(
    join(root, 'src/example.ts'),
    'export const publishedScope = true;',
  );
  mkdirSync(join(root, 'docs/program'));
  const locks = Array.from({ length: 5 }, (_, i) => {
    const path = `src/design-${i}.txt`,
      content = `locked fixture ${i}`;
    writeFileSync(join(root, path), content);
    return { path, sha256: createHash('sha256').update(content).digest('hex') };
  });
  writeFileSync(
    join(root, 'docs/program/DESIGN_SYSTEM_CONTRACT.json'),
    JSON.stringify({
      schema: 'propel-design-contract-v1',
      baselineCommit: 'a'.repeat(40),
      approval: 'locked_existing_designs',
      locks,
      bindings: Array.from({ length: 13 }, (_, i) => ({
        id: `design-source-${i}`,
        source: { path: 'src/example.ts', anchor: 'publishedScope' },
      })),
    }),
  );
  const manifest = {
    schema: 'propel-feature-evidence-v1',
    sourceCommit: 'a'.repeat(40),
    execution: 'not_authorized',
    designContract: 'docs/program/DESIGN_SYSTEM_CONTRACT.json',
    features: requiredFeatureIds.map((id) => ({
      id,
      owner: 'A1',
      capability: id,
      scope: 'approved',
      local: 'partial',
      hosted: 'blocked',
      release: 'not_authorized',
      approval: 'Local test only',
      next: 'Genuine acceptance',
      date: '2026-11-01',
      dataObjects: [] as string[],
      routes: [],
      risks: ['Local evidence is not operational acceptance'],
      dependencies: [] as string[],
      sources: [{ path: 'src/example.ts', anchor: 'publishedScope' }],
      tests: [{ path: 'README.md', anchor: 'retained' }],
      records: [{ path: 'AGENTS.md', anchor: 'retained' }],
      ci: { state: 'unknown' },
    })),
  };
  return { root, manifest };
}
it('validates exact citations without upgrading local evidence into CI, hosted or release acceptance', () => {
  const { root, manifest } = fixture(),
    before = structuredClone(manifest),
    result = validateFeatureEvidence(root, manifest);
  expect(result.featureCount).toBe(18);
  expect(result.features[0].sources[0].line).toBe(1);
  expect(result.features[0].sources[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(result.execution).toBe('not_authorized');
  expect(result.currentCi).toContain('UNKNOWN');
  expect(manifest).toEqual(before);
});
it.each([
  { hosted: 'passed' },
  { release: 'authorized' },
  { local: 'released' },
  { ci: { state: 'passed' } },
])('rejects conflated or inferred milestones %j', (patch) => {
  const { root, manifest } = fixture();
  Object.assign(manifest.features[0], patch);
  expect(() => validateFeatureEvidence(root, manifest)).toThrow();
});
it('requires the original scope IDs, unique identity and exact retained CI commit/run', () => {
  const { root, manifest } = fixture();
  manifest.features.pop();
  expect(() => validateFeatureEvidence(root, manifest)).toThrow('scope');
  const f = fixture();
  f.manifest.features[1].id = f.manifest.features[0].id;
  expect(() => validateFeatureEvidence(f.root, f.manifest)).toThrow('Unique');
  const g = fixture();
  g.manifest.features[0].ci = {
    state: 'retained_baseline',
    commit: 'latest',
    url: 'https://example.invalid',
  } as never;
  expect(() => validateFeatureEvidence(g.root, g.manifest)).toThrow(
    'CI identity',
  );
});
it('rejects missing source anchors and local claims without test/validation evidence', () => {
  const { root, manifest } = fixture();
  manifest.features[0].sources[0].anchor = 'absentSymbol';
  expect(() => validateFeatureEvidence(root, manifest)).toThrow('anchor');
  const f = fixture();
  f.manifest.features[0].tests = [];
  expect(() => validateFeatureEvidence(f.root, f.manifest)).toThrow('tests');
});
it.each([
  '../outside.txt',
  '/tmp/private.txt',
  '.staging/secret.json',
  'docs/../README.md',
  'docs\\secret.txt',
])('never opens private or escaping evidence paths %s', (path) => {
  const { root, manifest } = fixture();
  manifest.features[0].sources[0].path = path;
  expect(() => validateFeatureEvidence(root, manifest)).toThrow(
    'Public repository',
  );
});
it('rejects symlink evidence and does not traverse linked source roots or private directories', () => {
  const { root, manifest } = fixture(),
    outside = mkdtempSync(join(tmpdir(), 'propel-private-'));
  roots.push(outside);
  writeFileSync(join(outside, 'secret.ts'), 'PRIVATE CONTENT');
  symlinkSync(join(outside, 'secret.ts'), join(root, 'src/linked.ts'));
  manifest.features[0].sources[0] = {
    path: 'src/linked.ts',
    anchor: 'PRIVATE',
  };
  expect(() => validateFeatureEvidence(root, manifest)).toThrow('links');
  symlinkSync(outside, join(root, 'server'));
  mkdirSync(join(root, 'src/.staging'));
  writeFileSync(join(root, 'src/.staging/secret.ts'), 'PRIVATE CONTENT');
  writeFileSync(join(root, 'src/.env'), 'PRIVATE CONTENT');
  mkdirSync(join(root, 'src/node_modules'));
  writeFileSync(join(root, 'src/node_modules/vendor.ts'), 'VENDOR');
  const inventory = inventorySources(root);
  expect(inventory.files.map((f) => f.path)).toEqual(['src/example.ts']);
  expect(JSON.stringify(inventory)).not.toContain('PRIVATE');
});
it('rejects unknown and cyclic workstream dependencies', () => {
  const { root, manifest } = fixture();
  manifest.features[0].dependencies = ['ABSENT-001'];
  expect(() => validateFeatureEvidence(root, manifest)).toThrow(
    'Unknown dependency',
  );
  manifest.features[0].dependencies = [manifest.features[1].id];
  manifest.features[1].dependencies = [manifest.features[0].id];
  expect(() => validateFeatureEvidence(root, manifest)).toThrow('Cyclic');
});
it('requires qualified table references to exist in actual local SQL without inferring installation', () => {
  const { root, manifest } = fixture();
  mkdirSync(join(root, 'supabase/migrations'), { recursive: true });
  writeFileSync(
    join(root, 'supabase/migrations/example.sql'),
    'create table public.customers(id uuid);',
  );
  manifest.features[0].dataObjects = ['core.customers'];
  expect(() => validateFeatureEvidence(root, manifest)).toThrow(
    'table reference',
  );
  manifest.features[0].dataObjects = ['public.customers'];
  expect(validateFeatureEvidence(root, manifest).features[0].hosted).toBe(
    'blocked',
  );
  manifest.features[0].dataObjects = ['public.absent'];
  expect(() => validateFeatureEvidence(root, manifest)).toThrow(
    'table reference',
  );
});
it('keeps shared review ownership explicit before ambiguous customer, comparison and design keywords', () => {
  expect(sourceOwner('src/components/Customers.tsx')).toBe('A2');
  expect(sourceOwner('src/domain/estimating/customer-preview.ts')).toBe('A2');
  expect(sourceOwner('src/domain/property/inspection-comparison.ts')).toBe(
    'A5',
  );
  expect(
    sourceOwner('src/components/property/contractor-back-office-design.css'),
  ).toBe('A8');
  expect(
    sourceOwner('src/components/property/ContractorBackOfficeLayout.tsx'),
  ).toBe('A8');
  expect(sourceOwner('tests/program-finance-reconciliation.test.ts')).toBe(
    'A4',
  );
  expect(sourceOwner('server/property/supplier-connectors.ts')).toBe('A7');
});
it.each([
  ['src/lib/workflows/weekly-crew.ts', 'A3'],
  ['src/components/workflows/WeeklyCrew.tsx', 'A3'],
  ['src/lib/workflows/finance-desk.ts', 'A4'],
  ['src/components/workflows/FinanceDesk.tsx', 'A4'],
  ['src/lib/workflows/sales-desk.ts', 'A2'],
  ['src/components/workflows/SalesDesk.tsx', 'A2'],
  ['src/lib/workflows/completion-review.ts', 'A5'],
  ['src/components/workflows/CompletionReview.tsx', 'A5'],
  ['src/lib/workflows/maintenance-desk.ts', 'A6'],
  ['src/components/workflows/MaintenanceDesk.tsx', 'A6'],
  ['src/lib/workflows/daily-operations.ts', 'A6'],
  ['src/components/workflows/DailyOperations.tsx', 'A6'],
  ['src/components/workflows/weekly-crew.css', 'A8'],
  ['tests/cycle8-integration.test.ts', 'A8'],
  ['tests/program/cycle8-usability.spec.ts', 'A8'],
  ['scripts/check-cycle8-integrity.mjs', 'A8'],
])(
  'retains explicit Cycle8 source/design review ownership for %s',
  (path, owner) => {
    expect(sourceOwner(path)).toBe(owner);
  },
);
it('rejects linked migration directory chains before enumerating table declaration evidence', () => {
  for (const level of ['supabase', 'migrations']) {
    const { root, manifest } = fixture(),
      outside = mkdtempSync(join(tmpdir(), 'propel-private-schema-'));
    roots.push(outside);
    writeFileSync(join(outside, 'private.txt'), 'PRIVATE CONTENT');
    if (level === 'supabase') symlinkSync(outside, join(root, 'supabase'));
    else {
      mkdirSync(join(root, 'supabase'));
      symlinkSync(outside, join(root, 'supabase/migrations'));
    }
    manifest.features[0].dataObjects = ['public.customers'];
    expect(() => validateFeatureEvidence(root, manifest)).toThrow('links');
  }
});
it('produces deterministic complete source metadata without modifying files or echoing source contents', () => {
  const { root, manifest } = fixture();
  writeFileSync(
    join(root, 'docs/FEATURE_ACCEPTANCE_EVIDENCE.json'),
    JSON.stringify(manifest),
  );
  const before = readFileSync(join(root, 'src/example.ts'), 'utf8'),
    names = readdirSync(root),
    first = runFeatureEvidence(root, true);
  expect(first).toBe(runFeatureEvidence(root, true));
  expect(JSON.parse(first).inventory.fileCount).toBe(1);
  expect(first).not.toContain(before);
  expect(readFileSync(join(root, 'src/example.ts'), 'utf8')).toBe(before);
  expect(readdirSync(root)).toEqual(names);
});
it('cannot bypass project design validation by removing its pointer or dropping protected locks', () => {
  const { root, manifest } = fixture();
  const write = (value: unknown) =>
    writeFileSync(
      join(root, 'docs/FEATURE_ACCEPTANCE_EVIDENCE.json'),
      JSON.stringify(value),
    );
  write(manifest);
  expect(runFeatureEvidence(root)).toContain(
    '5 exact files; 13 source bindings',
  );
  const missing = structuredClone(manifest) as unknown as Record<
    string,
    unknown
  >;
  delete missing.designContract;
  write(missing);
  expect(() => runFeatureEvidence(root)).toThrow(
    'Exact shared design contract path',
  );
  write(manifest);
  const path = join(root, manifest.designContract);
  const contract = JSON.parse(readFileSync(path, 'utf8'));
  contract.locks.pop();
  writeFileSync(path, JSON.stringify(contract));
  expect(() => runFeatureEvidence(root)).toThrow('Complete project design');
});

it('keeps cycle-three review packages with existing business owners without moving shared design or sender authority', () => {
  expect(sourceOwner('src/lib/growth-reminders.ts')).toBe('A6');
  expect(sourceOwner('tests/program-growth-reminders.test.ts')).toBe('A6');
  expect(sourceOwner('src/lib/sales-approval-handoff.ts')).toBe('A2');
  expect(sourceOwner('src/domain/jobs/margin-analysis.ts')).toBe('A4');
  expect(sourceOwner('src/domain/property/passport.ts')).toBe('A5');
  expect(sourceOwner('src/lib/field-work-orders.ts')).toBe('A3');
  expect(sourceOwner('src/components/finance/job-margin.css')).toBe('A8');
  expect(sourceOwner('server/communications/preparation.ts')).toBe('A2');
});

it('inventories the explicitly declared isolated finance demo without collecting arbitrary root HTML', () => {
  const { root } = fixture();
  writeFileSync(
    join(root, 'preview-job-margin-demo.html'),
    '<title>Local finance fixture</title>',
  );
  writeFileSync(join(root, 'private-not-declared.html'), 'not inventoried');
  const result = inventorySources(root);
  expect(
    result.files.find((f) => f.path === 'preview-job-margin-demo.html')?.owner,
  ).toBe('A4');
  expect(result.files.some((f) => f.path === 'private-not-declared.html')).toBe(
    false,
  );
});

it('routes cycle-four actual source and test paths without promoting styles or workflows into a business authority lane', () => {
  for (const path of [
    'src/domain/field/crew-capacity.ts',
    'src/lib/field-crew-capacity.ts',
    'src/components/field/CrewCapacityPreview.tsx',
    'tests/field-crew-capacity.test.ts',
  ])
    expect(sourceOwner(path)).toBe('A3');
  expect(sourceOwner('tests/sales-approved-scope-reference.test.ts')).toBe(
    'A2',
  );
  expect(sourceOwner('tests/program-reminder-eligibility.test.ts')).toBe('A6');
  expect(sourceOwner('src/domain/property/passport-timeline.ts')).toBe('A5');
  expect(sourceOwner('src/components/field/crew-capacity.css')).toBe('A8');
  expect(sourceOwner('.github/workflows/field-crew-capacity.yml')).toBe('A8');
});

it.each([
  ['src/lib/workflows/journey-runtime.ts', 'A1'],
  ['src/components/workflows/ContractorJourneyPreview.tsx', 'A8'],
  ['src/lib/workflows/sales-workflow.ts', 'A2'],
  ['src/lib/workflows/field-workflow.ts', 'A3'],
  ['src/lib/workflows/operations-workflow.ts', 'A3'],
  ['src/lib/workflows/finance-workflow.ts', 'A4'],
  ['src/lib/workflows/customer-workflow.ts', 'A5'],
  ['src/lib/workflows/growth-workflow.ts', 'A6'],
  ['src/lib/workflows/intelligence-workflow.ts', 'A6'],
  ['src/lib/program/procurement-review.ts', 'A7'],
  ['src/lib/controlled-integration-contracts.ts', 'A7'],
  ['src/lib/program/voice-estimate.ts', 'A6'],
  ['src/lib/program/business-copilot.ts', 'A6'],
  ['tests/cycle6-intelligence-workflow.test.ts', 'A6'],
  ['tests/program-operations-workflow.test.ts', 'A3'],
  ['tests/workflows/customer-workflow.test.ts', 'A5'],
  ['tests/workflows/cycle6-independent-review.test.ts', 'A8'],
  ['tests/cycle6-operations-independent-review.test.ts', 'A8'],
  ['src/components/workflows/intelligence-workflow.css', 'A8'],
  ['.github/workflows/cycle6-journey.yml', 'A8'],
  ['src/lib/workflows/booking-scheduling.ts', 'A3'],
  ['src/components/workflows/BookingScheduling.tsx', 'A3'],
  ['tests/cycle7-booking-scheduling.test.ts', 'A3'],
  ['src/lib/workflows/job-review.ts', 'A4'],
  ['src/components/workflows/JobReview.tsx', 'A4'],
  ['tests/cycle7-job-review.test.ts', 'A4'],
  ['src/lib/workflows/customer-service.ts', 'A5'],
  ['src/components/workflows/CustomerService.tsx', 'A5'],
  ['tests/cycle7-customer-service.test.ts', 'A5'],
  ['tests/cycle7-baseline-review.test.ts', 'A8'],
  ['tests/cycle7-integration.test.ts', 'A8'],
  ['src/components/workflows/booking-scheduling.css', 'A8'],
  ['scripts/check-cycle7-integrity.mjs', 'A8'],
  ['tests/program/cycle7-usability.spec.ts', 'A8'],
  ['tests/program/playwright.cycle7-review.config.ts', 'A8'],
])(
  'routes actual cohesive source %s to review owner %s without changing access',
  (path, owner) => {
    expect(sourceOwner(path)).toBe(owner);
  },
);
