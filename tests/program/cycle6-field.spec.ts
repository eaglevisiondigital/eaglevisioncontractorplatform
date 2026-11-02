import { expect, test } from '@playwright/test';
for (const company of [
  'Straight Edge Property Services',
  'Cunningham Construction',
  'Roofing Company Preview',
]) {
  test(`${company}: full source-card controls reach exact report and Proof handoff through the strict reader`, async ({
    page,
  }) => {
    await page.goto('/tests/browser/fixtures/cycle6-field.html');
    const options = await page
      .getByLabel('Contractor')
      .locator('option')
      .allTextContents();
    const index = company.startsWith('Straight')
      ? 0
      : company.startsWith('Cunningham')
        ? 1
        : 2;
    await page.getByLabel('Contractor').selectOption({ label: options[index] });
    await page
      .getByRole('button', { name: 'Prepare actual Field sources' })
      .click();
    await page
      .getByRole('checkbox', {
        name: 'I confirm this local job evidence review.',
      })
      .check();
    await page
      .getByRole('button', { name: 'Load current job evidence' })
      .click();
    const expected = JSON.parse(
      await page.getByLabel('Expected report identity').innerText(),
    ) as { report_id: string; published_version: number };
    await page.getByRole('button', { name: 'Open original report v1' }).click();
    await expect(
      page.getByRole('heading', {
        name: 'Original published report',
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    const opened = JSON.parse(
      await page.getByLabel('Navigation handoff').innerText(),
    );
    expect(opened.destination).toBe('report');
    expect(opened.target).toMatchObject(expected);
    await expect(page.locator('.fw-detail')).toBeFocused();
    await page.getByRole('button', { name: 'Review Proof of Work' }).click();
    await expect(page.getByLabel('Navigation handoff')).toContainText(
      '"destination":"proof"',
    );
    const proof = JSON.parse(
      await page.getByLabel('Navigation handoff').innerText(),
    );
    expect(proof.target).toEqual(opened.target);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}
