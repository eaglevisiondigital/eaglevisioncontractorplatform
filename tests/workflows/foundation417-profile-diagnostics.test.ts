import { expect, it } from 'vitest';
// @ts-expect-error Isolated read-only diagnostic JavaScript, no runtime capability.
import { summarizeProfile } from '../../diagnostics/foundation417/profile.mjs';
// @ts-expect-error Isolated explicitly invoked profiler; import never executes a scenario.
import { validateScenario } from '../../diagnostics/foundation417/run.mjs';
const frame = (id: number, name: string, children: number[] = []) => ({
  id,
  callFrame: {
    functionName: name,
    url: 'file:///private/fixture/src/sample.ts',
  },
  children,
});
const sample = () => ({
  nodes: [frame(1, 'root', [2]), frame(2, 'same', [3]), frame(3, 'same')],
  samples: [2, 3],
  timeDeltas: [1000, 3000],
});
it('keeps recursive inclusive samples nonadditive while accounting every direct sample once', () => {
  const result = summarizeProfile(sample());
  expect(result.samples).toBe(2);
  expect(result.sampledTimeMs).toBe(4);
  expect(
    result.topSelf.find(
      (r: { name: string }) => r.name === 'src/sample.ts::same',
    ),
  ).toEqual({ name: 'src/sample.ts::same', selfMs: 4, inclusiveMs: 4 });
});
it.each([
  'missing-node',
  'duplicate-node',
  'cycle',
  'nonfinite',
  'negative',
  'interval-count',
  'overflow',
  'empty',
])(
  'rejects malformed %s evidence rather than reporting a timing result',
  (kind) => {
    const p = sample();
    if (kind === 'missing-node') p.samples[0] = 99;
    if (kind === 'duplicate-node') p.nodes.push(frame(2, 'copy'));
    if (kind === 'cycle') p.nodes[2].children = [1];
    if (kind === 'nonfinite') p.timeDeltas[0] = Infinity;
    if (kind === 'negative') p.timeDeltas[0] = -1;
    if (kind === 'interval-count') p.timeDeltas.pop();
    if (kind === 'overflow') p.timeDeltas = [Number.MAX_SAFE_INTEGER, 1];
    if (kind === 'empty') {
      p.samples = [];
      p.timeDeltas = [];
    }
    expect(() => summarizeProfile(p)).toThrow();
  },
);
it('outputs only normalized source paths and bounded function labels', () => {
  const p = sample();
  p.nodes[1].callFrame.url =
    'https://private-user:private-secret@example.invalid/src/sample.ts?secret=private-query';
  p.nodes[1].callFrame.functionName = 'not\na\nfunction';
  const text = JSON.stringify(summarizeProfile(p));
  expect(text).not.toContain('private-user');
  expect(text).not.toContain('private-secret');
  expect(text).not.toContain('private-query');
  expect(text).toContain('src/sample.ts::(other)');
});
it('permits only the two finite synthetic cases and denies arbitrary selectors before execution', () => {
  expect(validateScenario('c25-concurrent')).toBe('c25-concurrent');
  expect(validateScenario('c28-sibling')).toBe('c28-sibling');
  for (const value of [
    undefined,
    'all',
    '--shard=4/8',
    'https://example.invalid',
    {},
    ['c25-concurrent'],
  ])
    expect(() => validateScenario(value)).toThrow(
      'Exact bounded diagnostic scenario required',
    );
});
