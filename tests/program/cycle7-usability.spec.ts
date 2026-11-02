import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { sampleCompanies } from '../../src/domain/platform';

for (const company of sampleCompanies)
  test(`practical same-source forms / ${company.slug}`, async ({
    page,
  }, info) => {
    const external: string[] = [];
    page.on('request', (request) => {
      if (
        !request.url().startsWith('http://127.0.0.1:4217') &&
        !request.url().startsWith('data:')
      )
        external.push(request.url());
    });
    await page.goto('/preview/contractor-journey');
    const contractor = page.getByRole('combobox', {
      name: 'Contractor',
      exact: true,
    });
    await contractor.selectOption(company.id);
    await page
      .getByLabel(
        'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
      )
      .check();
    await page
      .getByRole('button', {
        name: 'Prepare local synthetic journey',
        exact: true,
      })
      .click();
    const context = page.getByRole('region', {
      name: 'Exact shared journey context',
    });
    await expect(context).toBeVisible();
    const originalContext = await context.innerText();

    const booking = page.getByRole('region', {
      name: 'Booking & rescheduling review',
      exact: true,
    });
    await booking
      .getByRole('button', { name: 'Load current visit for booking review' })
      .click();
    await booking
      .getByLabel('Existing assigned technician')
      .selectOption({ index: 1 });
    await booking.getByLabel('Proposed civil day').fill('2026-12-29');
    await booking
      .getByLabel('Proposed start time', { exact: true })
      .fill('09:00');
    await booking
      .getByLabel('Proposed end time', { exact: true })
      .fill('10:00');
    await booking.getByLabel('Proposed working-hours start').fill('08:00');
    await booking.getByLabel('Proposed working-hours end').fill('17:00');
    await booking
      .getByLabel('Review note (unsaved)')
      .fill('Review this alternate day; no dispatch requested.');
    const confirmBooking = booking.getByRole('checkbox');
    await confirmBooking.focus();
    await confirmBooking.press('Space');
    await booking
      .getByRole('button', { name: 'Review booking proposal', exact: true })
      .click();
    await expect(
      booking.getByRole('heading', { name: 'Booking review — not scheduled' }),
    ).toBeFocused();
    await expect(
      booking.getByText('Job window only; original visit not moved', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      booking.getByText('2026-12-28', { exact: true }),
    ).toBeVisible();
    await expect(
      booking.getByText(/Actual availability: UNKNOWN/),
    ).toBeVisible();
    await booking
      .getByRole('button', { name: 'Check exact retained booking review' })
      .click();
    await expect(booking.getByRole('status')).toContainText('still matches');
    await booking.screenshot({
      path: `artifacts/cycle7/booking-${info.project.name}-${company.slug}.png`,
    });

    const job = page.getByRole('region', {
      name: 'Time materials and invoice review',
      exact: true,
    });
    const headerLayout = await job
      .locator(':scope > header')
      .evaluate((header) => ({
        bottom: header.getBoundingClientRect().bottom,
        children: Array.from(header.children).map(
          (element) => element.getBoundingClientRect().bottom,
        ),
      }));
    expect(
      headerLayout.children.every(
        (bottom) => bottom <= headerLayout.bottom + 1,
      ),
    ).toBe(true);
    expect(
      await job.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--company-color').trim(),
      ),
    ).toBe(company.primary_color);
    await job.getByLabel('Include an unsaved material proposal').check();
    await job
      .getByLabel('Exact issued material or product line')
      .selectOption({ index: 1 });
    await job.getByLabel('Proposed quantity', { exact: true }).fill('2.5');
    await job.getByLabel(/Proposed internal unit cost/).fill('12.50');
    await job.getByLabel('Include an unsaved time proposal').check();
    await job
      .getByLabel('Currently assigned worker')
      .selectOption({ index: 1 });
    await job
      .getByLabel('Start time with UTC offset')
      .fill('2026-12-29T09:00:00-06:00');
    await job
      .getByLabel('End time with UTC offset')
      .fill('2026-12-29T10:00:00-06:00');
    await job
      .getByLabel('Staff task description')
      .fill('Review field documentation — unsaved time proposal.');
    await job
      .getByRole('checkbox', { name: /I confirm this exact saved job/ })
      .check();
    await job
      .getByRole('button', { name: 'Review recorded vs proposed' })
      .click();
    await expect(
      job.getByRole('region', { name: 'Recorded versus unsaved proposals' }),
    ).toBeVisible();
    await expect(job.getByText('$31.25', { exact: false })).toBeVisible();
    await expect(job.getByText(/Monetary allocation UNKNOWN/)).toBeVisible();
    await job
      .getByRole('button', { name: 'Inspect exact retained review' })
      .click();
    await expect(job.getByRole('status')).toContainText('CURRENT');
    await job.screenshot({
      path: `artifacts/cycle7/job-review-${info.project.name}-${company.slug}.png`,
    });

    const service = page.getByRole('region', {
      name: 'Customer service evidence navigator',
      exact: true,
    });
    await service
      .getByLabel('Search observations and report text')
      .fill('weathered');
    await service.getByLabel('From inspection date').fill('2026-12-01');
    await service.getByLabel('Through inspection date').fill('2026-12-31');
    await service
      .getByRole('combobox', { name: 'Inspection frequency', exact: true })
      .selectOption('weekly');
    await service
      .getByRole('combobox', { name: 'Reported severity', exact: true })
      .selectOption('moderate');
    await service.getByLabel('Exact reported category').fill('Maintenance');
    await service.getByLabel('Exact finding location').fill('Exterior joint');
    await service
      .getByLabel('Maintenance recommendation', { exact: true })
      .fill('assessment');
    await service
      .getByRole('button', { name: 'Search service evidence', exact: true })
      .click();
    await expect(service.getByRole('status')).toContainText(
      '1 matching report of 1 available report',
    );
    await service.getByRole('button', { name: /^Open service report/ }).click();
    await expect(
      service.getByRole('heading', {
        name: 'Exact service report evidence',
        exact: true,
      }),
    ).toBeFocused();
    await expect(
      service.getByRole('region', {
        name: 'Exact service report evidence',
        exact: true,
      }),
    ).toContainText('A weathered exterior joint was documented.');
    await expect(service).not.toContainText(
      /PRIVATE|unit_cost_minor|supplier cost|payroll|margin note/,
    );
    await service.screenshot({
      path: `artifacts/cycle7/service-${info.project.name}-${company.slug}.png`,
    });
    await service
      .getByLabel('Search observations and report text')
      .fill('no such documented concern');
    await service
      .getByRole('button', { name: 'Search service evidence', exact: true })
      .click();
    await expect(service.getByText(/No published reports match/)).toBeVisible();
    await service
      .getByRole('button', { name: 'Reset service filters' })
      .click();
    await expect(service.getByRole('status')).toContainText(
      '1 matching report',
    );
    await service.getByLabel('From inspection date').fill('2026-12-31');
    await service.getByLabel('Through inspection date').fill('2026-12-01');
    await service
      .getByRole('button', { name: 'Search service evidence', exact: true })
      .click();
    await expect(service.getByRole('alert')).toContainText('UNKNOWN');
    await expect(
      service.getByRole('region', {
        name: 'Exact service report evidence',
        exact: true,
      }),
    ).toHaveCount(0);
    expect(await context.innerText()).toBe(originalContext);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(external).toEqual([]);
    await contractor.selectOption(
      sampleCompanies.find((c) => c.id !== company.id)!.id,
    );
    await expect(job).toHaveCount(0);
    await expect(service).toHaveCount(0);
    await expect(booking).toHaveCount(0);
  });
