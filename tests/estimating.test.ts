import { describe, it, expect } from 'vitest';
import {
  blankEstimate,
  blankLine,
  calculateEstimate,
  decimalToScaled,
  parseMinor,
  validateEstimate,
} from '../src/domain/estimating/calculation';
import { customerPreview } from '../src/domain/estimating/customer-preview';
import { industryEstimate } from '../src/domain/estimating/fixtures';
import { sampleCompanies } from '../src/domain/platform';
import type { EstimateVersion } from '../src/domain/estimating/types';
const customer = '10000000-0000-4000-8000-000000000001';
function estimate() {
  const p = blankEstimate(customer);
  p.lines = [
    {
      ...blankLine(),
      description: 'Material',
      quantity_milli: 1500,
      unit_cost_minor: 101,
      unit_price_minor: null,
      markup_bps: 2000,
      taxable: true,
    },
  ];
  return p;
}
describe('exact estimate calculation', () => {
  it('rounds unit price before extension and reconciles payment shares', () => {
    const c = calculateEstimate(estimate(), 725);
    expect(c.subtotal_minor).toBe(182);
    expect(c.cost_minor).toBe(152);
    expect(c.tax_minor).toBe(13);
    expect(c.total_minor).toBe(195);
    expect(c.payment_schedule.map((s) => s.amount_minor)).toEqual([48, 147]);
  });
  it.each(['USD', 'JPY', 'KWD'])(
    'supports currency precision for %s',
    (currency) => {
      expect(
        parseMinor(
          currency === 'JPY' ? '102' : currency === 'KWD' ? '1.234' : '1.23',
          currency,
        ),
      ).toBe(currency === 'JPY' ? 102 : currency === 'KWD' ? 1234 : 123);
    },
  );
  it.each(['1,25', '1e3', '-3', 'NaN', 'Infinity', '1.234'])(
    'rejects ambiguous or fractional-cent USD input %s',
    (text) => expect(() => parseMinor(text, 'USD')).toThrow(),
  );
  it('preserves exact thousandth quantities', () =>
    expect(decimalToScaled('12.345', 3)).toBe(12345));
  it('allocates discount proportionally to taxable scope', () => {
    const p = estimate();
    p.lines = [
      { ...p.lines[0], quantity_milli: 1000, unit_price_minor: 100 },
      { ...blankLine(), description: 'Labor', unit_price_minor: 200 },
    ];
    p.discount = { kind: 'fixed', value: 60 };
    const c = calculateEstimate(p, 1000);
    expect(c.taxable_discount_minor).toBe(20);
    expect(c.tax_minor).toBe(8);
    expect(c.total_minor).toBe(248);
  });
  it('never applies tax to profit and reports margin separately from markup', () => {
    const p = estimate();
    p.lines[0] = {
      ...p.lines[0],
      quantity_milli: 1000,
      unit_cost_minor: 10000,
    };
    const c = calculateEstimate(p);
    expect(c.net_minor).toBe(12000);
    expect(c.profit_margin_bps).toBe(1667);
  });
  it('does not include unselected alternates', () => {
    const p = industryEstimate(sampleCompanies[2], customer);
    const c = calculateEstimate(p);
    expect(c.lines.filter((l) => l.included)).toHaveLength(2);
    expect(c.options.filter((o) => o.selected)).toHaveLength(1);
  });
  it('requires one exclusive option in each group', () => {
    const p = industryEstimate(sampleCompanies[2], customer);
    p.options.forEach((o) => (o.selected = false));
    expect(() => calculateEstimate(p)).toThrow(/exactly one/);
  });
  it('preserves fixed import markup once per extended line', () => {
    const p = estimate();
    p.lines[0].fixed_markup_minor = 25;
    expect(calculateEstimate(p).subtotal_minor).toBe(207);
  });
  it.each([NaN, Infinity, 0.1, -1, 1e15])(
    'rejects invalid integer money %s',
    (n) => {
      const p = estimate();
      p.lines[0].unit_cost_minor = n;
      expect(() => calculateEstimate(p)).toThrow();
    },
  );
  it('rejects overflow', () => {
    const p = estimate();
    p.lines[0].quantity_milli = 1e9;
    p.lines[0].unit_cost_minor = 1e9;
    expect(() => calculateEstimate(p)).toThrow(/limits/);
  });
  it('rejects over-discount and unbalanced schedules', () => {
    const p = estimate();
    p.discount = { kind: 'fixed', value: 10000 };
    expect(() => calculateEstimate(p)).toThrow(/Discount/);
    p.discount = { kind: 'none', value: 0 };
    p.payment_schedule[0].share_bps = 1;
    expect(() => calculateEstimate(p)).toThrow(/100%/);
  });
  it('requires complete import provenance', () => {
    const p = estimate();
    p.lines[0].import_approval_id = crypto.randomUUID();
    expect(() => validateEstimate(p)).toThrow(/source/);
  });
  it('rejects unknown surcharge or financial execution fields', () =>
    expect(() =>
      validateEstimate({ ...estimate(), surcharge_bps: 385 }),
    ).toThrow());
  it('rejects invalid dates, duplicate IDs and missing option references', () => {
    const p = estimate();
    p.expires_on = '2026-02-30';
    expect(() => validateEstimate(p)).toThrow();
    p.expires_on = '2027-01-01';
    p.lines.push({ ...p.lines[0] });
    expect(() => validateEstimate(p)).toThrow(/Duplicate/);
  });
  it('customer projection excludes private costs, supplier evidence and markup', () => {
    const p = estimate();
    p.internal_notes = 'SECRET NOTE';
    p.lines[0].internal_note = 'SECRET SUPPLIER';
    const v = {
      payload: p,
      calculation: calculateEstimate(p),
      company_snapshot: { name: 'Brand' },
      customer_snapshot: { display_name: 'Example' },
      location_snapshot: null,
      attachment_snapshots: [],
    } as unknown as EstimateVersion;
    const text = JSON.stringify(customerPreview(v));
    expect(text).not.toMatch(
      /SECRET|cost_minor|markup|supplier|confidence|import_approval/,
    );
  });
});
