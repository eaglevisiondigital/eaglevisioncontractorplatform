import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cycle17WorkspaceGroups } from '../../src/components/workflows/OperatingCenterCycleSeventeen';
import { cycle14ContinuityGroups } from '../../src/components/workflows/OperatingCenterCycleFourteen';
import { taskReviewGroups } from '../../src/components/workflows/task-review-paths';
import { SharedRecordSearch } from '../../src/components/workflows/SharedRecordSearch';
import type { OperatingSources } from '../../src/lib/workflows/operating-center-runtime';
const text = (p: string) => readFileSync(p, 'utf8');
it('uses the exact same six original navigation identities', () =>
  expect(
    cycle17WorkspaceGroups.map((g) => ({
      ...g,
      panels: g.panels.map((p) => p.id),
    })),
  ).toEqual(
    cycle14ContinuityGroups.map((g) => ({
      ...g,
      panels: g.panels.map((p) => p.id),
    })),
  ));
it('retains one original host and default-false opt-in', () => {
  const s = text('src/components/workflows/OperatingCenterCycleFifteen.tsx');
  expect(s).toContain(
    '[retainedWorkspaces, setRetainedWorkspaces] = useState(false)',
  );
  expect(s).toContain('retainedWorkspaces ? cycle17WorkspaceGroups : baseline');
  expect(s).toContain('dailyGuides ? cycle16DailyGroups : retained');
  expect(s.match(/<OperatingCenterCycleThirteen/g)).toHaveLength(1);
  expect(s).not.toMatch(
    /new (Operations|Phase3Repository|PropertyRepository)|prepareOperatingSources/,
  );
});
it('keeps source-free OFF components in all six slots', () => {
  const source = new Proxy(
    {},
    {
      get() {
        throw Error('OFF source read');
      },
    },
  ) as OperatingSources;
  const nav = vi.fn();
  for (const p of cycle17WorkspaceGroups.flatMap((g) => g.panels)) {
    const html = renderToStaticMarkup(
      p.render({ sources: source, enabled: false, onSelectJob: nav }),
    );
    expect(html.toLowerCase()).toContain('off');
  }
  expect(nav).not.toHaveBeenCalled();
});
it('rejects missing or foreign navigation slots', () => {
  expect(() => taskReviewGroups({})).toThrow('Exact existing');
  const renders = Object.fromEntries(
    cycle17WorkspaceGroups
      .flatMap((g) => g.panels)
      .map((p) => [p.id, p.render]),
  );
  expect(() => taskReviewGroups({ ...renders, foreign: () => null })).toThrow(
    'Exact existing',
  );
});
it('shared search stays default-off without inspecting sources', () => {
  const source = new Proxy(
    {},
    {
      get() {
        throw Error('OFF source read');
      },
    },
  ) as OperatingSources;
  expect(
    renderToStaticMarkup(
      createElement(SharedRecordSearch, { sources: source }),
    ),
  ).toContain('off');
});
it('preserves exact App, locked design references and Foundation workflow', () => {
  expect(createHash('sha256').update(text('src/App.tsx')).digest('hex')).toBe(
    'b4ec768f7c60eeb231ba6d021f81615f242b51e8a72812d02f7facb6ed2e025a',
  );
  expect(
    createHash('sha256').update(text('.github/workflows/ci.yml')).digest('hex'),
  ).toBe('df337433bfde1768ccbe396326793559f21113aa7c24e37fbd5955c4c29f87be');
});
it('records cancellation evidence without granting a false individual PASS', () => {
  const r = JSON.parse(
    text('docs/program/CYCLE16_CLOSEOUT_CI_RECONCILIATION.json'),
  );
  expect(r.main_head).toBe('3cbea85ce464b3e67fb78c8992ec192cdd8d2407');
  expect(r.main_check_inventory).toEqual({
    success: 30,
    failed: 0,
    cancelled: 0,
    pending: 0,
    workflow_runs: 28,
  });
  expect(r.manual_reruns).toBe(0);
  expect(r.workflow_changed).toBe(false);
  expect(r.features).toHaveLength(4);
  for (const f of r.features) {
    expect(f.owned_files).toHaveLength(5);
    expect(f.unique_missing_coverage).toBe(false);
    for (const c of f.cancelled_verify) expect(c.outcome).toBe('CANCELLED');
  }
  expect(
    r.features.filter(
      (f: { own_successful_verify: string[] }) =>
        f.own_successful_verify.length,
    ),
  ).toHaveLength(1);
});
