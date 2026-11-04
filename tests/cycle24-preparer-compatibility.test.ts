import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OperatingCenterCycleFifteen } from '../src/components/workflows/OperatingCenterCycleFifteen';
import { cycle22RequirementGroups } from '../src/components/workflows/OperatingCenterCycleTwentyTwo';
import { cycle21CorrectionGroups } from '../src/components/workflows/OperatingCenterCycleTwentyOne';

const control = vi.hoisted(() => ({
  preset: false,
  requirements: false,
  corrections: false,
  ordinal: 0,
  initialValues: [] as unknown[],
  downstream: vi.fn<(props: Record<string, unknown>) => void>(),
  prepare: vi.fn(async () => {
    throw Error('Presentation must not invoke source preparation');
  }),
}));

vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>();
  return {
    ...original,
    useState(initial: unknown) {
      const native = original.useState(initial);
      const ordinal = control.ordinal++;
      control.initialValues.push(initial);
      // Supply only the two existing Boolean state values while rendering the
      // real host. All remaining defaults and the real React dispatcher remain.
      if (control.preset && ordinal === 0)
        return [control.requirements, native[1]];
      if (control.preset && ordinal === 2)
        return [control.corrections, native[1]];
      return native;
    },
  };
});
vi.mock('../src/lib/workflows/correction-preview-sources', () => ({
  prepareCorrectionPreviewSources: control.prepare,
}));
vi.mock('../src/components/workflows/OperatingCenterCycleThirteen', () => ({
  OperatingCenterCycleThirteen(props: Record<string, unknown>) {
    // Observe the existing source-owner boundary, without replacing or running
    // its preparation/custody behavior. The retained C21 test verifies that owner.
    control.downstream(props);
    return null;
  },
}));

beforeEach(() => {
  control.preset = false;
  control.requirements = false;
  control.corrections = false;
  control.ordinal = 0;
  control.initialValues = [];
  vi.clearAllMocks();
});
afterEach(() => vi.restoreAllMocks());

function render() {
  const network = vi.spyOn(globalThis, 'fetch');
  const html = renderToStaticMarkup(createElement(OperatingCenterCycleFifteen));
  expect(control.downstream).toHaveBeenCalledTimes(1);
  const props = control.downstream.mock.calls[0][0];
  expect(control.initialValues[0]).toBe(false);
  expect(control.initialValues[1]).toBe('requirements');
  expect(control.initialValues[2]).toBe(false);
  expect(control.prepare).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
  expect(Object.hasOwn(props, 'sources')).toBe(false);
  return { html, props };
}

it('native default state leaves the original source preparer undefined without source or network access', () => {
  const { html, props } = render();
  expect(props.prepareSources).toBeUndefined();
  expect(html).not.toContain('checked=""');
  expect(html).toContain('<select disabled="">');
  expect(html).toContain('<option value="requirements" selected="">');
});

it.each([
  [false, false, false],
  [false, true, true],
  [true, false, true],
  [true, true, true],
])(
  'requirements=%s corrections=%s passes the original factory iff either flag is true (expected %s)',
  (requirements, corrections, selected) => {
    control.preset = true;
    control.requirements = requirements;
    control.corrections = corrections;
    const { props, html } = render();
    expect(props.prepareSources).toBe(selected ? control.prepare : undefined);
    expect(html.includes('<select disabled="">')).toBe(!requirements);
    if (requirements)
      expect(props.additionalReviewGroups).toBe(cycle22RequirementGroups);
    else if (corrections)
      expect(props.additionalReviewGroups).toBe(cycle21CorrectionGroups);
  },
);
