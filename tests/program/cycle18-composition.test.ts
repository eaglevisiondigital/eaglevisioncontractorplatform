import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { cycle18WorkflowGroups } from '../../src/components/workflows/OperatingCenterCycleEighteen';
import { cycle14ContinuityGroups } from '../../src/components/workflows/OperatingCenterCycleFourteen';
import type { OperatingSources } from '../../src/lib/workflows/operating-center-runtime';
import { sourceOwner } from '../../scripts/feature-evidence.mjs';
import { validateCycle18Manifest } from '../../scripts/check-cycle18-integrity.mjs';
const manifest = () =>
  JSON.parse(readFileSync('docs/program/CYCLE18_DELIVERY_INDEX.json', 'utf8'));
it('uses the exact six existing slot identities without a second source host', () => {
  expect(
    cycle18WorkflowGroups.flatMap((g) => g.panels.map((p) => p.id)),
  ).toEqual(cycle14ContinuityGroups.flatMap((g) => g.panels.map((p) => p.id)));
  const s = readFileSync(
    'src/components/workflows/OperatingCenterCycleFifteen.tsx',
    'utf8',
  );
  expect(s).toContain('[dailyWorkbench, setDailyWorkbench] = useState(false)');
  expect(s).toContain('retainedWorkspaces ? cycle17WorkspaceGroups : baseline');
  expect(s.match(/<OperatingCenterCycleThirteen/g)).toHaveLength(1);
  expect(s).not.toMatch(
    /prepareOperatingSources|new (Operations|Phase3Repository|PropertyRepository)/,
  );
});
it('all six disabled panels avoid every source getter and callback', () => {
  const source = new Proxy(
      {},
      {
        get() {
          throw Error('OFF source read');
        },
      },
    ) as OperatingSources,
    callback = vi.fn();
  for (const panel of cycle18WorkflowGroups.flatMap((g) => g.panels))
    expect(
      renderToStaticMarkup(
        panel.render({
          sources: source,
          enabled: false,
          onSelectJob: callback,
        }),
      ).toLowerCase(),
    ).toContain('off');
  expect(callback).not.toHaveBeenCalled();
});
it('checks all25exact author blobs and two independent files against reviewed hashes', () =>
  expect(validateCycle18Manifest(manifest())).toEqual({
    packages: 5,
    author_files: 25,
    independent_files: 2,
    retained_author_files: 373,
  }));
it('rejects substituted author bytes even with a matching branch name', () => {
  const m = manifest();
  m.packages[0].owned_files[0].sha256 = 'a'.repeat(64);
  expect(() => validateCycle18Manifest(m)).toThrow('source changed');
});
it('rejects parent, approval and duplicate author evidence', () => {
  for (const mutate of [
    (m: ReturnType<typeof manifest>) => {
      m.packages[0].parent_commit = m.parent_commit;
    },
    (m: ReturnType<typeof manifest>) => {
      m.independent_status = 'PENDING';
    },
    (m: ReturnType<typeof manifest>) => {
      m.packages[1].draft_pr = m.packages[0].draft_pr;
    },
  ]) {
    const m = manifest();
    mutate(m);
    expect(() => validateCycle18Manifest(m)).toThrow();
  }
});
it('keeps original application host and Foundation workflow byte identical', () => {
  for (const [path, hash] of [
    [
      'src/App.tsx',
      'b4ec768f7c60eeb231ba6d021f81615f242b51e8a72812d02f7facb6ed2e025a',
    ],
    [
      '.github/workflows/ci.yml',
      'df337433bfde1768ccbe396326793559f21113aa7c24e37fbd5955c4c29f87be',
    ],
  ])
    expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(
      hash,
    );
});
it('retains source ownership by business lane and shared design owner', () => {
  for (const [path, owner] of [
    ['src/lib/workflows/field-agenda.ts', 'A3'],
    ['src/lib/workflows/cost-invoice-review.ts', 'A4'],
    ['src/lib/workflows/service-update-review.ts', 'A5'],
    ['src/lib/workflows/maintenance-agenda.ts', 'A6'],
    ['src/lib/workflows/priority-actions.ts', 'A6'],
    ['src/components/workflows/DailyWorkbench.tsx', 'A8'],
    ['src/components/workflows/field-agenda.css', 'A8'],
  ])
    expect(sourceOwner(path)).toBe(owner);
});
it('newer Air checklist preserves exact existing kit and unverified physical gate', () => {
  const s = readFileSync(
    'docs/program/CYCLE18_NOV4_MACBOOK_AIR_CHECKLIST.md',
    'utf8',
  );
  expect(s).toContain(
    '32cb88f123e0fd776986f32d8508c913dbedc1ac977779708d1ba7218bbb8d59',
  );
  expect(s).toContain('UNVERIFIED');
  expect(s).toContain('25');
  expect(s).toContain('FileVault');
  expect(s).toContain('UNKNOWN');
});
