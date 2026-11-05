import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const ui = vi.hoisted(() => ({
  cursor: 0,
  refCursor: 0,
  values: new Map<number, unknown>(),
  refs: new Map<number, { current: unknown }>(),
}));
// Exercise the original component event handlers with real native sources. Hook
// state is synchronous here; React commit/focus behavior needs browser evidence.
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = ui.cursor++;
      if (!ui.values.has(index)) ui.values.set(index, initial);
      return [
        ui.values.get(index),
        (value: unknown) => {
          ui.values.set(
            index,
            typeof value === 'function'
              ? (value as (before: unknown) => unknown)(ui.values.get(index))
              : value,
          );
        },
      ];
    },
    useRef: (initial: unknown) => {
      const index = ui.refCursor++;
      if (!ui.refs.has(index)) ui.refs.set(index, { current: initial });
      return ui.refs.get(index);
    },
    useId: () => 'cycle33-owner-continuity',
    useLayoutEffect: () => {},
  };
});
import { sampleCompanies } from '../src/domain/platform';
import { RecordedOwnerActions } from '../src/components/workflows/RecordedOwnerActions';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  readRecordedOwnerActions,
  recordedOwnerActionCards,
  inspectRecordedOwnerAction,
} from '../src/lib/workflows/recorded-owner-actions';

beforeEach(() => {
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  });
  vi.stubGlobal('document', { activeElement: null });
  vi.stubGlobal('HTMLElement', class {});
});
afterEach(() => {
  ui.cursor = ui.refCursor = 0;
  ui.values.clear();
  ui.refs.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function nodes(value: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  return [value, ...nodes(value.props.children as ReactNode)];
}
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareCorrectionPreviewSources(
      sampleCompanies[brand],
      gate,
    ),
    entry = sources.entries[2],
    job = entry.target.job_id!,
    view = await readRecordedOwnerActions(sources, job, gate),
    cards = recordedOwnerActionCards(view),
    previous = await inspectRecordedOwnerAction(view, cards[1].key),
    callback = vi.fn();
  ui.values.set(1, view);
  ui.values.set(3, previous);
  function render() {
    ui.cursor = ui.refCursor = 0;
    const root = RecordedOwnerActions({
      sources,
      selectedJobId: job,
      enabled: true,
      onContinue: callback,
    });
    const child = nodes(root).find((node) => typeof node.type === 'function')!;
    return (child.type as (props: unknown) => ReactNode)(child.props);
  }
  function button(name: string, key?: string) {
    const button = nodes(render()).find(
      (node) =>
        node.type === 'button' &&
        (key
          ? node.props['aria-label'] === `Inspect owner priority source: ${key}`
          : node.props.children === name),
    );
    if (!button) throw Error('Exact original control required: ' + name);
    return button;
  }
  function inspectPresent() {
    return nodes(render()).some(
      (node) => node.props['aria-label'] === 'Exact owner priority source',
    );
  }
  function invoke(name: string, key?: string) {
    const handler = button(name, key).props.onClick as () => void;
    handler();
  }
  async function idle() {
    await vi.waitFor(() => expect(ui.values.get(4)).toBe(false));
  }
  return {
    sources,
    entry,
    job,
    view,
    cards,
    previous,
    gate,
    callback,
    render,
    invoke,
    inspectPresent,
    idle,
  };
}
for (const mode of ['inspect', 'read'] as const)
  it.each([0, 1, 2])(
    `brand %i failed fresh ${mode} cannot re-expose an earlier different inspected source`,
    async (brand) => {
      const f = await fixture(brand),
        before = JSON.stringify(f.previous),
        writes = vi.spyOn(f.sources.estimates, 'reviewExpense');
      expect(f.inspectPresent()).toBe(true);
      vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(
        Error('Native digest result unavailable'),
      );
      f.invoke(
        mode === 'read' ? 'Read current owner priorities' : '',
        mode === 'inspect' ? f.cards[0].key : undefined,
      );
      await f.idle();
      expect(ui.values.get(9)).toContain('UNKNOWN');
      expect(f.inspectPresent()).toBe(false);
      expect(
        nodes(f.render()).some(
          (node) => node.props.children === 'Open exact owner priority review',
        ),
      ).toBe(false);
      expect(ui.values.get(1)).toBe(f.view);
      expect(JSON.stringify(f.previous)).toBe(before);
      expect(f.callback).not.toHaveBeenCalled();
      expect(writes).not.toHaveBeenCalled();
    },
  );
it.each([0, 1, 2])(
  'brand %i a fresh inspection clears old presentation before the first native await and installs only the exact successful source',
  async (brand) => {
    const f = await fixture(brand),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let release!: () => void;
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(
      async (...args) => {
        const result = await digest(...args);
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return result;
      },
    );
    f.invoke('', f.cards[0].key);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect(ui.values.get(4)).toBe(true);
    expect(ui.values.get(3)).toBeUndefined();
    release();
    await f.idle();
    const exact = f.cards[0].source;
    expect(ui.values.get(3)).toMatchObject({
      key: f.cards[0].key,
      job_id: f.job,
      source: {
        kind: exact.kind,
        id: exact.id,
        version: exact.version,
        revision: exact.revision,
        related_ids: exact.related_ids,
      },
      meaning: 'EXACT_INSPECTED_SOURCE_ONLY',
    });
    expect(f.inspectPresent()).toBe(true);
    expect(f.callback).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %i a native revocation during a new inspection withholds all prior source details and navigation',
  async (brand) => {
    const f = await fixture(brand),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(
      async (...args) => {
        const result = await digest(...args);
        await f.sources.operations.revokeOwner(
          f.sources.company.id,
          f.entry.target.actor_id,
        );
        return result;
      },
    );
    f.invoke('', f.cards[0].key);
    await f.idle();
    expect(f.inspectPresent()).toBe(false);
    expect(ui.values.get(3)).toBeUndefined();
    expect(f.callback).not.toHaveBeenCalled();
    expect(
      nodes(f.render()).some(
        (node) => node.props.children === 'Open exact owner priority review',
      ),
    ).toBe(false);
  },
);
it('a concurrent inspection attempt does not replace the in-flight exact source or create another native claim', async () => {
  const f = await fixture(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  const initial = f.render(),
    buttons = nodes(initial).filter(
      (n) => n.type === 'button' && typeof n.props['aria-label'] === 'string',
    );
  let release!: () => void;
  const spy = vi
    .spyOn(crypto.subtle, 'digest')
    .mockImplementationOnce(async (...args) => {
      const result = await digest(...args);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return result;
    });
  (buttons[0].props.onClick as () => void)();
  (buttons[1].props.onClick as () => void)();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  expect(spy).toHaveBeenCalledTimes(1);
  release();
  await f.idle();
  expect(ui.values.get(3)).toMatchObject({ key: f.cards[0].key });
  expect(f.callback).not.toHaveBeenCalled();
});
it('default OFF does not touch private sources or invent a selected source', () => {
  const getter = vi.fn(() => {
    throw Error('Private source');
  });
  const sources = Object.defineProperty({}, 'company', { get: getter });
  const root = RecordedOwnerActions({
    sources: sources as never,
    enabled: false,
  });
  expect(
    nodes(root).some(
      (node) => node.props.children === 'Recorded owner actions are OFF.',
    ),
  ).toBe(true);
  expect(getter).not.toHaveBeenCalled();
});
