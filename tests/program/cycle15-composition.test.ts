import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cycle14ContinuityGroups } from '../../src/components/workflows/OperatingCenterCycleFourteen';
import { taskReviewGroups } from '../../src/components/workflows/task-review-paths';

describe('one existing navigation and source host', () => {
  const ids = cycle14ContinuityGroups.flatMap((g) => g.panels.map((p) => p.id));
  const make = () => Object.fromEntries(ids.map((id) => [id, () => null]));
  it('substitutes only exact existing renders without adding groups or destinations', () => {
    const renderers = make();
    const next = taskReviewGroups(renderers);
    expect(
      next.map((g) => ({
        ...g,
        panels: g.panels.map((p) => ({ id: p.id, label: p.label })),
      })),
    ).toEqual(
      cycle14ContinuityGroups.map((g) => ({
        ...g,
        panels: g.panels.map((p) => ({ id: p.id, label: p.label })),
      })),
    );
    for (const panel of next.flatMap((g) => g.panels))
      expect(panel.render).toBe(renderers[panel.id]);
    expect(next).not.toBe(cycle14ContinuityGroups);
    expect(ids).toHaveLength(6);
  });
  it('rejects missing or arbitrary destinations', () => {
    const missing = make();
    delete missing[ids[0]];
    expect(() => taskReviewGroups(missing)).toThrow('Exact existing');
    expect(() => taskReviewGroups({ ...make(), dispatch: () => null })).toThrow(
      'Exact existing',
    );
    expect(() => taskReviewGroups({})).toThrow('Exact existing');
  });
  it('keeps every original Cycle14 host byte, allowing only the read-only export', () => {
    const file = readFileSync(
      'src/components/workflows/OperatingCenterCycleFourteen.tsx',
      'utf8',
    );
    const original = file.replace(
      /\nexport \{ groups as cycle14ContinuityGroups \};\n$/,
      '',
    );
    expect(createHash('sha256').update(original).digest('hex')).toBe(
      '6aa5cc5e10a5ee28ab7a56f6d6e923f34636c101aa59a1a263abb3f982826984',
    );
  });
  it('preserves the gated App route while changing only its lazy composition', () => {
    const file = readFileSync('src/App.tsx', 'utf8');
    const original = file.replaceAll(
      'OperatingCenterCycleFifteen',
      'OperatingCenterCycleFourteen',
    );
    expect(createHash('sha256').update(original).digest('hex')).toBe(
      'ff1fae67536c14900b3e6c4f3858deccdfd8c97ba63dcffe3967c2d530ffe0bc',
    );
  });
});
