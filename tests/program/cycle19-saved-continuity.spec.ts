import { test, expect, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { sampleCompanies } from '../../src/domain/platform';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
async function tab(root: Locator, label: string) {
  await root
    .getByRole('navigation', { name: 'Saved source review sections' })
    .getByRole('button', { name: label, exact: true })
    .click();
}
async function exercise(root: Locator, label: string) {
  const details = root.locator('.srw-exercise');
  if (
    !(await details.getAttribute('open')) &&
    !(await details
      .getByLabel('I confirm this disposable source exercise only.')
      .isVisible())
  )
    await details
      .getByText('Disposable saved-source exercise', { exact: true })
      .click();
  await details
    .getByLabel('I confirm this disposable source exercise only.')
    .check();
  await details.getByRole('button', { name: label, exact: true }).click();
  await expect(details).toContainText('Exact disposable source saved');
}
async function capture(root: Locator, name: string) {
  mkdirSync('artifacts/cycle19', { recursive: true });
  await root.screenshot({ path: `artifacts/cycle19/${name}.png` });
  writeFileSync(
    `artifacts/cycle19/${name}.json`,
    JSON.stringify({
      head: execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim(),
      dirty: !!execFileSync('git', ['status', '--porcelain'], {
        encoding: 'utf8',
      }).trim(),
      approval: 'PENDING',
      physical_recovery: 'UNVERIFIED',
    }),
  );
}
for (const company of sampleCompanies)
  test(`actual saved source read compare adopt across five workspaces / ${company.slug}`, async ({
    page,
  }, info) => {
    const requests: string[] = [];
    page.on('request', (r) => {
      if (
        !r.url().startsWith('http://127.0.0.1:4381') &&
        !r.url().startsWith('data:')
      )
        requests.push(r.url());
    });
    await page.goto('/preview/operating-center');
    await expect(
      page.getByLabel('Use saved source continuity', { exact: true }),
    ).not.toBeChecked();
    await page
      .getByLabel('Use saved source continuity', { exact: true })
      .check();
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    await page
      .getByLabel(
        'I confirm this disposable multi-job simulation; no dispatch, contract, invoice, payment or message is authorized.',
      )
      .check();
    await page
      .getByRole('button', {
        name: 'Prepare multi-job local environment',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('region', { name: 'Shared operating environment' }),
    ).toContainText('4 admitted jobs');
    await page.getByText('Saved source review', { exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Saved source review', exact: true })
      .getByRole('button', { name: 'Saved work revisions', exact: true })
      .click();
    const root = page.getByRole('region', {
      name: 'Saved source workbench',
      exact: true,
    });
    const search = root
      .getByRole('region', { name: 'Shared record search', exact: true })
      .first();
    await search
      .getByRole('button', { name: 'Find another record', exact: true })
      .click();
    await search
      .getByRole('button', { name: 'Search shared records', exact: true })
      .click();
    await expect(search).toContainText('4 matching of 4');
    const first = search.locator('article').first();
    const job = (await first.locator('span').allTextContents())[0];
    await first.getByRole('button', { name: /^Open exact record in / }).click();
    await expect(root.locator('.srw-context')).toContainText(job);
    const field = root.getByRole('region', {
      name: 'Saved field revisions',
      exact: true,
    });
    await field
      .getByRole('button', {
        name: 'Read current saved field evidence',
        exact: true,
      })
      .click();
    await expect(
      field.getByRole('button', {
        name: 'Read saved field updates',
        exact: true,
      }),
    ).toBeVisible();
    await field.evaluate((el) => el.setAttribute('data-retained', 'original'));
    await tab(root, 'Time and materials');
    const cost = root.getByRole('region', {
      name: 'Saved cost revisions',
      exact: true,
    });
    await cost
      .getByRole('button', { name: 'Read saved cost revision', exact: true })
      .click();
    await expect(
      cost.getByRole('button', {
        name: 'Read saved cost updates',
        exact: true,
      }),
    ).toBeVisible();
    await tab(root, 'Service documentation');
    const service = root.getByRole('region', {
      name: 'Service revision review',
      exact: true,
    });
    await service
      .getByRole('button', {
        name: 'Read published service source',
        exact: true,
      })
      .click();
    await expect(
      service.getByRole('button', {
        name: 'Read saved service updates',
        exact: true,
      }),
    ).toBeVisible();
    await tab(root, 'Maintenance revisions');
    const growth = root.getByRole('region', {
      name: 'Saved maintenance revisions',
      exact: true,
    });
    await growth
      .getByRole('button', {
        name: 'Read current saved maintenance evidence',
        exact: true,
      })
      .click();
    await expect(
      growth.getByRole('button', {
        name: 'Read saved maintenance updates',
        exact: true,
      }),
    ).toBeVisible();
    await tab(root, 'Recorded priorities');
    const priorities = root.getByRole('region', {
      name: 'Saved priority revisions',
      exact: true,
    });
    await priorities
      .getByRole('button', {
        name: 'Read saved priority revision',
        exact: true,
      })
      .click();
    await expect(
      priorities.getByRole('button', {
        name: 'Read saved priority updates',
        exact: true,
      }),
    ).toBeVisible();
    await exercise(root, 'Save synthetic visit draft revision');
    await exercise(root, 'Record synthetic reviewed time');
    await exercise(root, 'Save synthetic time correction');
    await exercise(root, 'Review synthetic material evidence');
    await exercise(root, 'Save synthetic maintenance plan revision');
    await exercise(root, 'Append synthetic published report version');
    await tab(root, 'Work-order revisions');
    await expect(field).toHaveAttribute('data-retained', 'original');
    await field
      .getByRole('button', { name: 'Read saved field updates', exact: true })
      .click();
    await field
      .getByLabel(
        'I reviewed these exact saved revisions and confirm local review adoption.',
      )
      .check();
    await field
      .getByRole('button', {
        name: 'Adopt saved field revision for review',
        exact: true,
      })
      .click();
    await expect(field).toContainText('adopted');
    await capture(root, `field-${info.project.name}-${company.slug}`);
    await tab(root, 'Time and materials');
    await cost
      .getByRole('button', { name: 'Read saved cost updates', exact: true })
      .click();
    await cost.getByLabel('I reviewed this exact saved cost revision').check();
    await cost
      .getByRole('button', { name: 'Use reviewed cost revision', exact: true })
      .click();
    await expect(cost).toContainText('UNKNOWN');
    await capture(root, `cost-${info.project.name}-${company.slug}`);
    await tab(root, 'Service documentation');
    await service
      .getByRole('button', { name: 'Read saved service updates', exact: true })
      .click();
    await service
      .getByRole('button', {
        name: 'Inspect published revision comparison',
        exact: true,
      })
      .click();
    await service
      .getByLabel('I reviewed both exact published versions.')
      .check();
    await service
      .getByRole('button', {
        name: 'Adopt inspected published version',
        exact: true,
      })
      .click();
    await capture(root, `service-${info.project.name}-${company.slug}`);
    await tab(root, 'Maintenance revisions');
    await growth
      .getByRole('button', {
        name: 'Read saved maintenance updates',
        exact: true,
      })
      .click();
    await growth
      .getByLabel(
        'I reviewed these exact saved maintenance revisions and confirm local review adoption.',
      )
      .check();
    await growth
      .getByRole('button', {
        name: 'Adopt saved maintenance revision for review',
        exact: true,
      })
      .click();
    await expect(growth).toContainText('UNKNOWN');
    await tab(root, 'Recorded priorities');
    await priorities
      .getByRole('button', { name: 'Read saved priority updates', exact: true })
      .click();
    await priorities
      .getByLabel('I reviewed this exact saved priority revision')
      .check();
    await priorities
      .getByRole('button', {
        name: 'Use reviewed priority revision',
        exact: true,
      })
      .click();
    await expect(root.locator('.srw-context')).toContainText(job);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    for (const button of await root.getByRole('button').all())
      if (await button.isVisible())
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(
          43.5,
        );
    expect(requests).toEqual([]);
  });
test('revoked membership withholds retained private review evidence', async ({
  page,
}) => {
  await page.goto('/preview/operating-center');
  await page.evaluate(async () => {
    const path = '/tests/program/cycle19-browser-harness.tsx';
    const { mountSavedWorkbench } = await import(path);
    (window as unknown as { c19: unknown }).c19 = await mountSavedWorkbench(0);
  });
  const root = page.getByRole('region', {
    name: 'Saved source workbench',
    exact: true,
  });
  await root
    .getByRole('button', {
      name: 'Read current saved field evidence',
      exact: true,
    })
    .click();
  await page.evaluate(() => {
    (window as unknown as { c19: { revoke(): void } }).c19.revoke();
  });
  await expect(root).toContainText(
    'current authorized evidence is unavailable',
  );
  await expect(
    root.getByRole('region', { name: 'Saved field revisions', exact: true }),
  ).toHaveCount(0);
});
