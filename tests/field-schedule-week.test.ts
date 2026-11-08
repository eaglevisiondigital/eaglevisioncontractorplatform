import { expect, it } from 'vitest';
import {
  propertyVisitHistory,
  scheduleWeek,
} from '../src/components/field/schedule-week';
import { sampleCompanies } from '../src/domain/platform';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import {
  blankFieldFilters,
  filterFieldSchedule,
  readFieldSchedule,
} from '../src/lib/field-scheduling';

it.each(['2026-11-16', '2026-11-18', '2026-11-22'])(
  'shows the entire recorded week containing %s',
  (date) => {
    expect(scheduleWeek(date)).toEqual({
      from: '2026-11-16',
      to: '2026-11-22',
    });
  },
);
it('moves whole weeks without device-clock or timezone conversion', () => {
  expect(scheduleWeek('2026-11-18', -1)).toEqual({
    from: '2026-11-09',
    to: '2026-11-15',
  });
  expect(scheduleWeek('2026-11-18', 1)).toEqual({
    from: '2026-11-23',
    to: '2026-11-29',
  });
  expect(scheduleWeek('2026-03-08', 1)).toEqual({
    from: '2026-03-09',
    to: '2026-03-15',
  });
});
it('handles leap days and calendar-year boundaries', () => {
  expect(scheduleWeek('2028-02-29')).toEqual({
    from: '2028-02-28',
    to: '2028-03-05',
  });
  expect(scheduleWeek('2027-01-01')).toEqual({
    from: '2026-12-28',
    to: '2027-01-03',
  });
});
it.each([
  '',
  '2026-02-30',
  '2026-2-03',
  '2026-03-08T01:00:00Z',
  'not a date',
  '0000-01-01',
  '9999-12-31',
])(
  'withholds week navigation for an invalid or unrepresentable range: %s',
  (date) => {
    expect(scheduleWeek(date)).toBeNull();
  },
);
it.each(sampleCompanies.map((c) => c.id))(
  'filters existing %s visit references without changing canonical records',
  async (id) => {
    const company = sampleCompanies.find((c) => c.id === id)!;
    const repo = new PropertyRepository(new Operations(true));
    await repo.initialize(company);
    await repo.refreshContexts(id);
    const before = JSON.stringify(repo.read(id));
    const model = readFieldSchedule(repo, id, id + '-owner');
    const original = model.rows[0];
    const range = scheduleWeek(original.date)!;
    const filters = {
      ...blankFieldFilters,
      property: original.source.location_id,
      status: original.status,
      ...range,
    };
    const visible = filterFieldSchedule(model.rows, filters);
    expect(visible).toContain(original);
    expect(
      visible.every(
        (row) =>
          row.source.organization_id === id &&
          row.source.location_id === filters.property,
      ),
    ).toBe(true);
    expect(visible[0].source).toBe(original.source);
    expect(JSON.stringify(repo.read(id))).toBe(before);
  },
);

it.each(sampleCompanies.map((c) => c.id))(
  'retains exact authorized property-history references for %s',
  async (id) => {
    const company = sampleCompanies.find((c) => c.id === id)!;
    const repo = new PropertyRepository(new Operations(true));
    await repo.initialize(company);
    await repo.refreshContexts(id);
    const model = readFieldSchedule(repo, id, id + '-owner');
    const selected = model.rows[0];
    const other = structuredClone(selected);
    other.source.location_id += '-other';
    const foreign = structuredClone(selected);
    foreign.source.organization_id += '-other';
    const customer = structuredClone(selected);
    customer.source.customer_id += '-other';
    const rows = [...model.rows, other, foreign, customer];
    const before = JSON.stringify(rows);
    const history = propertyVisitHistory(rows, selected.source);
    expect(history).toContain(selected);
    expect(history).not.toContain(other);
    expect(history).not.toContain(foreign);
    expect(history).not.toContain(customer);
    expect(history[0]).toBe(selected);
    expect(
      propertyVisitHistory(rows, {
        ...selected.source,
        visit_revision: selected.source.visit_revision + 1,
      }),
    ).toEqual([]);
    expect(
      propertyVisitHistory(rows, {
        ...selected.source,
        plan_revision: selected.source.plan_revision + 1,
      }),
    ).toEqual([]);
    expect(JSON.stringify(rows)).toBe(before);
  },
);
