import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { sampleCompanies } from '../../src/domain/platform';

for (const company of sampleCompanies)
  test(`owner cost evidence retains priorities and opens the exact financial review / ${company.slug}`, async ({
    page,
  }, info) => {
    await page.goto('/preview/contractor-journey');
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    const confirmation = page.getByLabel(
      'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
    );
    await confirmation.check();
    await page
      .getByRole('button', { name: 'Prepare local synthetic journey' })
      .click();
    const context = page.getByRole('region', {
      name: 'Exact shared journey context',
      exact: true,
    });
    await expect(context).toBeVisible();
    const job = await context
      .locator('dt')
      .filter({ hasText: /^Job$/ })
      .locator('+ dd')
      .innerText();
    const originalContext = await context.innerText();
    const daily = page.getByRole('region', {
      name: 'Daily operating priorities',
      exact: true,
    });
    await daily
      .getByLabel(
        'I confirm this exact local job and day context for read-only staff review.',
      )
      .check();
    await daily
      .getByRole('button', { name: 'Review daily priorities', exact: true })
      .click();
    const area = daily.getByRole('combobox', {
      name: 'Review area',
      exact: true,
    });
    await expect(area).toBeVisible();
    await area.selectOption('finance');
    const query = daily.getByLabel('Search available cards', { exact: true });
    await query.fill('coverage');
    const originalPriorities = await daily
      .locator('.daily-operations-cards')
      .innerText();
    await page
      .getByLabel('Include literal voice-transcript and trade review')
      .check();
    const transcript = page.getByRole('textbox', {
      name: 'Literal synthetic transcript',
      exact: true,
    });
    const retainedText =
      'Review the recorded labor coverage before planning more work.';
    await transcript.fill(retainedText);
    const owner = page.getByRole('region', {
      name: 'Owner job cost evidence',
      exact: true,
    });
    await owner
      .getByRole('button', {
        name: "Inspect this job's cost coverage",
        exact: true,
      })
      .click();
    await expect(
      owner.getByRole('heading', { name: 'Job cost variance', exact: true }),
    ).toBeVisible();
    await expect(owner).toContainText(job);
    await expect(owner).toContainText('UNKNOWN — totals withheld');
    await expect(owner).toContainText(
      'Missing exact issued, job or labor coverage evidence',
    );
    const floor = owner.getByRole('textbox', {
      name: 'Minimum projected margin (%)',
      exact: true,
    });
    await floor.fill('25.5');
    await owner
      .getByRole('button', { name: 'Hide owner cost details', exact: true })
      .click();
    await expect(floor).not.toBeVisible();
    await owner
      .getByRole('button', { name: 'Show owner cost details', exact: true })
      .click();
    await expect(floor).toHaveValue('25.5');
    expect(
      (
        await new AxeBuilder({ page })
          .include('#journey-intelligence')
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await owner.screenshot({
      path: `artifacts/cycle6/owner-cost-${info.project.name}-${company.slug}.png`,
    });
    await owner
      .getByRole('button', {
        name: "Open this job's financial review",
        exact: true,
      })
      .click();
    await expect(page.locator('#journey-finance')).toBeFocused();
    await expect(
      page.locator('#journey-finance').getByRole('heading', {
        name: 'Costs, margin & invoice preparation',
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator('#journey-finance')).toContainText('NO_GO');
    await expect(page.locator('#journey-finance')).toContainText(job);
    await expect(area).toHaveValue('finance');
    await expect(query).toHaveValue('coverage');
    expect(await daily.locator('.daily-operations-cards').innerText()).toBe(
      originalPriorities,
    );
    await expect(transcript).toHaveValue(retainedText);
    await expect(floor).toHaveValue('25.5');
    expect(await context.innerText()).toBe(originalContext);
    await confirmation.uncheck();
    await expect(owner).toHaveCount(0);
    await expect(daily).toHaveCount(0);
  });

for (const company of sampleCompanies)
  test(`Sales issued scope and job plan retain agreement context / ${company.slug}`, async ({
    page,
  }, info) => {
    await page.goto('/preview/contractor-journey');
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    const confirmation = page.getByLabel(
      'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
    );
    await confirmation.check();
    await page
      .getByRole('button', { name: 'Prepare local synthetic journey' })
      .click();
    const context = page.getByRole('region', {
      name: 'Exact shared journey context',
    });
    await expect(context).toBeVisible();
    const originalContext = await context.innerText();
    const originalJob = await context
      .locator('dt')
      .filter({ hasText: /^Job$/ })
      .locator('+ dd')
      .innerText();
    await page
      .getByRole('button', { name: 'Review exact lead and issued estimate' })
      .click();
    const sales = page.getByRole('region', {
      name: 'Lead to contract preparation',
      exact: true,
    });
    const retainedCheck = sales.getByRole('checkbox').first();
    await retainedCheck.check();
    const planning = page.getByRole('region', {
      name: 'Sales issued scope and job planning',
      exact: true,
    });
    await planning
      .getByRole('button', {
        name: 'Review issued estimate & job plan',
        exact: true,
      })
      .click();
    const source = planning.getByRole('region', {
      name: 'Issued estimate and job source review',
    });
    await expect(
      source.getByRole('heading', { name: 'Original issued job scope' }),
    ).toBeVisible();
    await expect(source.getByText(originalJob, { exact: false })).toBeVisible();
    const version = await source
      .locator('dt')
      .filter({ hasText: 'Issued version ID / number' })
      .locator('+ dd')
      .innerText();
    expect(originalContext).toContain(version.split(' / ')[0]);
    const originalSelection = await planning.getByRole('status').innerText();
    await source
      .locator('button:not(:disabled)')
      .filter({ hasText: /^Inspect job visit / })
      .first()
      .click();
    await expect(planning.getByRole('status')).not.toHaveText(
      originalSelection,
    );
    await expect(
      source.getByRole('heading', { name: 'Original issued job scope' }),
    ).toBeVisible();
    await expect(retainedCheck).toBeChecked();
    expect(await context.innerText()).toBe(originalContext);
    await expect(
      sales.getByRole('region', {
        name: 'Linked staff contract review snapshot',
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      (await new AxeBuilder({ page }).include('#journey-sales').analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await planning.screenshot({
      path: `artifacts/cycle6/sales-job-plan-${info.project.name}-${company.slug}.png`,
    });
    await confirmation.uncheck();
    await expect(planning).toHaveCount(0);
    await expect(context).toHaveCount(0);
  });

for (const company of sampleCompanies)
  test(`existing-engine journey / ${company.slug}`, async ({ page }, info) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (
        !r.url().startsWith('http://127.0.0.1:4206') &&
        !r.url().startsWith('data:')
      )
        external.push(r.url());
    });
    await page.goto('/preview/contractor-journey');
    await expect(
      page.getByRole('heading', { name: 'Connected contractor journey' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Prepare local synthetic journey' }),
    ).toBeDisabled();
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    await page
      .getByLabel(
        'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
      )
      .check();
    await page
      .getByRole('button', { name: 'Prepare local synthetic journey' })
      .click();
    await expect(
      page.getByRole('region', { name: 'Exact shared journey context' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Review exact lead and issued estimate' })
      .click();
    await expect(
      page.getByRole('region', { name: 'Originating lead', exact: true }),
    ).toBeVisible();
    const sales = page.getByRole('region', {
      name: 'Lead to contract preparation',
      exact: true,
    });
    for (const box of await sales.getByRole('checkbox').all())
      await box.check();
    await sales
      .getByRole('button', {
        name: 'Prepare linked staff contract review',
        exact: true,
      })
      .click();
    await expect(
      sales.getByRole('region', {
        name: 'Linked staff contract review snapshot',
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel('I confirm this local job evidence review.').check();
    await page
      .getByRole('button', { name: 'Load current job evidence', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Published inspection reports',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Open original report v1', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Original published report',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Review Proof of Work', exact: true })
      .click();
    await expect(page.locator('#journey-customer')).toBeFocused();
    await page
      .getByRole('button', {
        name: 'Review linked property documentation',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Open exact published report', exact: true })
      .click();
    await page
      .getByLabel(
        'I reviewed the exact linked report and issued job scope; prepare a documentation-only pack.',
      )
      .check();
    await page
      .getByRole('button', {
        name: 'Prepare linked documentation pack',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('region', {
        name: 'Linked immutable documentation pack',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Review costs and invoice preparation' })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Costs, margin & invoice preparation',
      }),
    ).toBeVisible();
    await page
      .getByLabel('I confirm this local maintenance planning review.')
      .check();
    await page
      .getByRole('button', {
        name: 'Load maintenance opportunities',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Published maintenance observations',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .locator('button:not(:disabled)')
      .filter({ hasText: 'Prepare staff visit proposal' })
      .first()
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Immutable staff planning preview',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel('Include literal voice-transcript and trade review')
      .check();
    await page
      .getByLabel('Literal synthetic transcript')
      .fill(
        'Inspect the exterior joint; record measured scope for human review.',
      );
    await page
      .getByLabel('Human-selected trade edition')
      .selectOption('property_services');
    await page
      .getByLabel(
        'I confirm review-only suggestions for this exact saved source.',
      )
      .check();
    await page
      .getByRole('button', {
        name: 'Prepare source-linked Copilot review',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Review priorities', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Synthetic transcript review',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Inspect exact retained Copilot review',
        exact: true,
      })
      .click();
    await expect(
      page.getByText('Retained review: CURRENT_LOCAL_SOURCE', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('PRIVATE', { exact: false })).toHaveCount(0);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    expect(external).toEqual([]);
    await page.locator('#journey-customer').screenshot({
      path: `artifacts/cycle6/packet-${info.project.name}-${company.slug}.png`,
    });
    await page.screenshot({
      path: `artifacts/cycle6/journey-${info.project.name}-${company.slug}.png`,
      fullPage: true,
    });
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(sampleCompanies.find((c) => c.id !== company.id)!.id);
    await expect(
      page.getByRole('region', { name: 'Exact shared journey context' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', {
        name: 'Costs, margin & invoice preparation',
      }),
    ).toHaveCount(0);
  });
test('confirmation withdrawal hides old workflow sources', async ({ page }) => {
  await page.goto('/preview/contractor-journey');
  const confirmation = page.getByLabel(
    'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
  );
  await confirmation.check();
  await page
    .getByRole('button', { name: 'Prepare local synthetic journey' })
    .click();
  await expect(
    page.getByRole('region', { name: 'Exact shared journey context' }),
  ).toBeVisible();
  await confirmation.uncheck();
  await expect(
    page.getByRole('region', { name: 'Exact shared journey context' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Prepare local synthetic journey' }),
  ).toBeDisabled();
});
test('rapid confirmation withdrawal cannot resurrect a pending preparation', async ({
  page,
}) => {
  await page.goto('/preview/contractor-journey');
  const confirmation = page.getByLabel(
    'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
  );
  await confirmation.check();
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Prepare local synthetic journey',
    )!;
    const box = document.querySelector(
      '.journey-controls input[type=checkbox]',
    ) as HTMLInputElement;
    button.click();
    box.click();
    box.click();
  });
  await expect(
    page.getByText('Preparation UNKNOWN — no replay.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Exact shared journey context' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Prepare local synthetic journey' }),
  ).toBeDisabled();
});
