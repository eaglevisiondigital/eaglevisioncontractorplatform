import { expect, it } from 'vitest';
const { summarizeTiming } = await import(
  new URL('../scripts/cycle30-browser-timing.mjs', import.meta.url).href
);
it('keeps timeout and original budget without inventing a product diagnosis', () => {
  const r = summarizeTiming({
    project: 'desktop',
    status: 'timedOut',
    duration_ms: 35042,
    budget_ms: 30000,
    steps: [
      {
        title: 'Open exact owner priority review',
        duration_ms: 10000,
        start_ms: 20000,
        error: true,
      },
    ],
  });
  expect(r).toMatchObject({
    status: 'timedOut',
    budget_ms: 30000,
    attribution: 'UNRESOLVED_REQUIRES_SOURCE_AND_TRACE_REVIEW',
  });
  expect(r.final_navigation).toHaveLength(1);
});
it('does not turn missing or locally passed observations into original CI closure', () => {
  expect(summarizeTiming({ status: 'passed', steps: [] })).toMatchObject({
    final_navigation: [],
    attribution: 'UNRESOLVED_REQUIRES_SOURCE_AND_TRACE_REVIEW',
  });
});
it('retains only measured slow steps, ordered by duration', () => {
  const r = summarizeTiming({
    steps: [
      { title: 'fast', duration_ms: 99 },
      { title: 'second', duration_ms: 100 },
      { title: 'first', duration_ms: 120 },
    ],
  });
  expect(r.slow_steps.map((x: { title: string }) => x.title)).toEqual([
    'first',
    'second',
  ]);
});

it('recognizes pinned Playwright generic Click titles by original final-navigation location', () => {
  const r = summarizeTiming({
    steps: [
      { title: 'Click', line: 529, duration_ms: 3922 },
      { title: 'Click', line: 508, duration_ms: 2000 },
    ],
  });
  expect(r.final_navigation).toEqual([
    { title: 'Click', line: 529, duration_ms: 3922 },
  ]);
});
