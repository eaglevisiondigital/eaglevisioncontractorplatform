import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SharedRecordSearch } from '../../src/components/workflows/SharedRecordSearch';
import type { OperatingSources } from '../../src/lib/workflows/operating-center-runtime';
import { sampleCompanies } from '../../src/domain/platform';
import { prepareOperatingSources } from '../../src/lib/workflows/operating-center-runtime';
import {
  readOperatingSelection,
  revalidateOperatingSelection,
} from '../../src/lib/workflows/operating-selection';
const text = (p: string) => readFileSync(p, 'utf8');
describe('Cycle16 one shared source host and retained design', () => {
  it('preserves the exact gated App source', () =>
    expect(createHash('sha256').update(text('src/App.tsx')).digest('hex')).toBe(
      'b4ec768f7c60eeb231ba6d021f81615f242b51e8a72812d02f7facb6ed2e025a',
    ));
  it('keeps daily guides opt-in and all original review choices available', () => {
    const s = text('src/components/workflows/OperatingCenterCycleFifteen.tsx');
    expect(s).toContain('[dailyGuides, setDailyGuides] = useState(false)');
    expect(s).toContain('taskPaths ? guided : cycle14ContinuityGroups');
    expect(s).toContain('dailyGuides ? cycle16DailyGroups : retained');
    expect(s.match(/<OperatingCenterCycleThirteen/g)).toHaveLength(1);
    expect(s).not.toMatch(
      /new (Operations|Phase3Repository|PropertyRepository)|prepareOperatingSources/,
    );
  });
  it('uses the same six original slots and source props', () => {
    const s = text('src/components/workflows/OperatingCenterCycleSixteen.tsx');
    for (const id of [
      'schedule-work-order-continuity',
      'finance-case-continuity',
      'service-source-continuity',
      'maintenance-planning-continuity',
      'verified-task-handoff',
      'source-bound-addons',
    ])
      expect(s).toContain(`'${id}'`);
    expect(s.match(/<SharedRecordSearch \{\.\.\.props\}/g)).toHaveLength(6);
    expect(s).not.toMatch(
      /\bnew\s+\w+\s*\(|prepareOperatingSources|localStorage|sessionStorage|fetch\(/,
    );
  });
  it('uses the original selection reader with final exact-current navigation checks', () => {
    const s = text('src/components/workflows/SharedRecordSearch.tsx');
    for (const name of [
      'readOperatingSelection(',
      'revalidateOperatingSelection(',
      'assertOperatingSelectionCurrentNow(',
      'captureOperatingSources(',
      'bound.check()',
    ])
      expect(s).toContain(name);
    expect(s).not.toMatch(
      /localStorage|sessionStorage|fetch\(|\.issue\(|\.create\(/,
    );
  });
  it('default-off server rendering never inspects sources or invokes navigation', () => {
    const sources = new Proxy(
      {},
      {
        get() {
          throw Error('Source must stay closed');
        },
      },
    ) as OperatingSources;
    const nav = vi.fn();
    const html = renderToStaticMarkup(
      createElement(SharedRecordSearch, { sources, onSelectJob: nav }),
    );
    expect(html).toContain('off');
    expect(nav).not.toHaveBeenCalled();
  });
  it('does not bypass loopback development admission through an enabled prop', () => {
    const sources = new Proxy(
      {},
      {
        get() {
          throw Error('Source must stay closed');
        },
      },
    ) as OperatingSources;
    expect(
      renderToStaticMarkup(
        createElement(SharedRecordSearch, { sources, enabled: true }),
      ),
    ).toContain('off');
  });
  it('keeps approved UI/artwork and original Foundation workflow byte-identical', () => {
    expect(
      createHash('sha256')
        .update(readFileSync('.github/workflows/ci.yml'))
        .digest('hex'),
    ).toBe('df337433bfde1768ccbe396326793559f21113aa7c24e37fbd5955c4c29f87be');
    const css = text('src/components/workflows/daily-guide-search.css');
    expect(css).toContain('.daily-guide-search');
    expect(css).not.toMatch(
      /:root|\.portal-concept|\.platform-brand|@font-face/,
    );
  });
});
for (const i of [0, 1, 2])
  it(`brand ${i}: shared selection retains exact multi-job identities without new stores`, async () => {
    const gate = { enabled: true, confirmed: true };
    const sources = await prepareOperatingSources(sampleCompanies[i], gate);
    const input = { query: '', page: 0, page_size: 2 };
    const first = await readOperatingSelection(sources, input, gate);
    const second = await readOperatingSelection(
      sources,
      { ...input, page: 1 },
      gate,
    );
    expect(first.available).toBe(4);
    expect(
      new Set([...first.rows, ...second.rows].map((r) => r.job_id)).size,
    ).toBe(4);
    const row = second.rows[0];
    const exact = await revalidateOperatingSelection(
      sources,
      second,
      row.job_id,
    );
    const entry = sources.entries.find((e) => e.target.job_id === row.job_id)!;
    expect(exact).toMatchObject({
      job_id: entry.target.job_id,
      customer_id: entry.target.customer_id,
      location_id: entry.target.location_id,
      authority: 'NAVIGATION_ONLY',
    });
    const found = await readOperatingSelection(
      sources,
      { ...input, query: row.issued_version_id },
      gate,
    );
    expect(found.rows.some((r) => r.job_id === row.job_id)).toBe(true);
    const empty = await readOperatingSelection(
      sources,
      { ...input, query: 'no-record-is-present' },
      gate,
    );
    expect(empty.matching).toBe(0);
    expect(empty.available).toBe(4);
    expect(JSON.stringify(first)).not.toMatch(
      /unit_cost_minor|internal_notes|supplier|payroll/,
    );
  });
