import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { contractor, developerControls } from './helpers/property-portal';
async function prepareActualPacket(page: Page, company: string) {
  await page.goto('/preview/property-portal');
  await contractor(page, company);
  await page
    .getByRole('button', { name: 'Estimates & repairs', exact: true })
    .click();
  const card = page
    .getByRole('region', { name: 'Customer estimate review' })
    .locator('article')
    .nth(1);
  const original = await card.locator('.customer-scope-line').allTextContents(),
    source = await card.getAttribute('data-version-id');
  await card.getByRole('button', { name: 'Request changes version 2' }).click();
  const form = page.getByRole('form', { name: 'Request changes version 2' }),
    note = 'Please clarify <img src=x onerror=alert(1)> & the revised scope.';
  await form.getByRole('textbox', { name: 'Requested changes' }).fill(note);
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Review preference' }).click();
  await form
    .getByRole('button', { name: 'Record synthetic change request' })
    .click();
  const recorded = page.getByRole('region', {
    name: 'Recorded preference version 2',
  });
  await expect(recorded).toContainText(note);
  const receipt = (await recorded.textContent())!.match(
    /Receipt ([0-9a-f-]{36})/,
  )![1];
  await developerControls(page);
  await page
    .getByRole('button', { name: 'Open local staff estimate review' })
    .click();
  const queue = page.getByRole('region', {
    name: 'Customer change requests',
    exact: true,
  });
  await queue.getByRole('button', { name: 'Review request version 2' }).click();
  const confirmation = page.getByRole('region', {
    name: 'Staff revision confirmation',
  });
  await confirmation.getByRole('checkbox').check();
  await confirmation
    .getByRole('button', { name: 'Prepare revised estimate draft' })
    .click();
  await expect(
    page.getByRole('region', { name: 'Customer revision provenance' }),
  ).toContainText(receipt);
  await page
    .getByRole('textbox', { name: 'Customer notes', exact: true })
    .fill('Proposed safe customer note <script>bad()</script>');
  await page
    .getByRole('textbox', { name: 'Estimate terms', exact: true })
    .fill('Proposed synthetic terms & conditions; no work authorized.');
  await page
    .getByRole('textbox', { name: 'Private estimate notes', exact: true })
    .fill('PRIVATE_3D_STAFF_CANARY');
  await page
    .getByRole('button', { name: 'Save estimate draft', exact: true })
    .click();
  await expect(
    page.getByText('Saved revision 2', { exact: false }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Revision comparison & packet', exact: true })
    .click();
  const packetReview = page.getByRole('region', {
    name: 'Estimate revision review',
    exact: true,
  });
  await packetReview.getByRole('checkbox').check();
  await packetReview
    .getByRole('button', {
      name: 'Prepare Customer Review Packet',
      exact: true,
    })
    .click();
  const packet = page.getByRole('region', {
    name: 'Customer review packet staff preview',
    exact: true,
  });
  await expect(packet).toContainText('Current saved snapshot');
  const packetId = await packet.getAttribute('data-packet-id');
  await page
    .getByRole('button', {
      name: 'Issuance readiness & delivery dry run',
      exact: true,
    })
    .click();
  return { original, source: source!, receipt, note, packetId: packetId! };
}

async function accessible(page: Page) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function screenshot(
  page: Page,
  name: string,
  project: string,
  company: string,
) {
  await mkdir('artifacts/property', { recursive: true });
  const panel = page.getByRole('region', {
    name: 'Local revised estimate customer loop',
  });
  const target = (await panel.count())
    ? panel
    : name === 'response'
      ? page.getByRole('region', {
          name: 'Recorded preference version 3',
          exact: true,
        })
      : page
          .getByRole('region', {
            name: 'Customer estimate review',
            exact: true,
          })
          .locator('article[data-version-id]')
          .nth(2);
  await target.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({
    path: `artifacts/property/revised-loop-${project}-${company}-${name}.png`,
    fullPage: true,
  });
  await page.screenshot({
    path: `artifacts/property/revised-loop-${project}-${company}-${name}-viewport.png`,
  });
}
const companies = [
  ['sample-property', 'accepted'],
  ['sample-construction', 'declined'],
  ['sample-roofing', 'changes_requested'],
] as const;
for (const [company, choice] of companies)
  test(`actual revised estimate loop ${company} ${choice}`, async ({
    page,
  }, info) => {
    const before = await prepareActualPacket(page, company);
    const readiness = page.getByRole('region', {
      name: 'Revised estimate issuance readiness',
      exact: true,
    });
    await readiness
      .getByRole('checkbox', { name: /I inspected these exact requirements/ })
      .check();
    await readiness
      .getByRole('button', {
        name: 'Review Issuance Requirements',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Review result — BLOCKED' }),
    ).toBeVisible();
    const loop = page.getByRole('region', {
      name: 'Local revised estimate customer loop',
      exact: true,
    });
    await expect(
      loop.getByRole('heading', {
        name: 'Explicit synthetic issuance confirmation',
      }),
    ).toBeVisible();
    await expect(
      loop.getByRole('button', {
        name: 'Issue exact version 3 — synthetic only',
      }),
    ).toBeDisabled();
    await accessible(page);
    await screenshot(page, 'confirmation', info.project.name, company);
    await loop
      .getByRole('checkbox', {
        name: /I separately confirm synthetic issuance/,
      })
      .check();
    await loop
      .getByRole('button', { name: 'Issue exact version 3 — synthetic only' })
      .click();
    await expect(
      loop.getByRole('heading', {
        name: 'Version 3 synthetically issued',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Save estimate draft', exact: true }),
    ).toHaveCount(0);
    await expect(loop).toContainText(before.receipt);
    await expect(loop).toContainText(before.packetId);
    await loop
      .getByRole('checkbox', {
        name: /Prepare this exact synthetic issued version/,
      })
      .check();
    await loop
      .getByRole('button', { name: 'Prepare internal-only offer', exact: true })
      .click();
    await expect(
      loop.getByRole('heading', {
        name: 'Internal-only offer prepared',
        exact: true,
      }),
    ).toBeVisible();
    await expect(loop).toContainText('Actual delivery: none');
    await expect(
      loop.getByRole('button', {
        name: 'Prepare internal-only offer',
        exact: true,
      }),
    ).toHaveCount(0);
    await accessible(page);
    await screenshot(page, 'internal-offer', info.project.name, company);
    await loop
      .getByRole('button', {
        name: 'Review revised version in local customer portal',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Estimates & repairs', exact: true })
      .click();
    const all = page.getByRole('region', {
      name: 'Customer estimate review',
      exact: true,
    });
    const revised = all.locator('article[data-version-id]').nth(2);
    await expect(revised).toContainText('Issued estimate · Version 3');
    await expect(revised).toContainText('Awaiting your review');
    await expect(revised).toContainText(
      'Proposed safe customer note <script>bad()</script>',
    );
    await expect(
      page.getByRole('region', { name: 'Recorded preference version 2' }),
    ).toContainText(before.receipt);
    await expect(
      page.getByRole('region', {
        name: 'Estimate comparison versions 2 and 3',
      }),
    ).toContainText('Customer notes: Changed');
    await expect(all).not.toContainText('PRIVATE_3D_STAFF_CANARY');
    await expect(all.locator('script,img,iframe')).toHaveCount(0);
    await accessible(page);
    await revised.scrollIntoViewIfNeeded();
    await screenshot(page, 'customer-v3', info.project.name, company);
    const button =
      choice === 'accepted'
        ? 'Preview approve version 3'
        : choice === 'declined'
          ? 'Preview decline version 3'
          : 'Request changes version 3';
    await revised.getByRole('button', { name: button, exact: true }).click();
    const form = page.getByRole('form', {
      name: button
        .replace('Preview approve', 'Approve')
        .replace('Preview decline', 'Decline'),
      exact: true,
    });
    if (choice === 'changes_requested')
      await form
        .getByRole('textbox', { name: 'Requested changes' })
        .fill('Please clarify revised version3 <img src=x>');
    await form.getByRole('checkbox').check();
    await form
      .getByRole('button', { name: 'Review preference', exact: true })
      .click();
    await form
      .getByRole('button', {
        name:
          choice === 'changes_requested'
            ? 'Record synthetic change request'
            : 'Record synthetic preference',
        exact: true,
      })
      .click();
    const recorded = page.getByRole('region', {
      name: 'Recorded preference version 3',
      exact: true,
    });
    await expect(recorded).toBeVisible();
    const newReceipt = (await recorded.textContent())!.match(
      /Receipt ([0-9a-f-]{36})/,
    )![1];
    expect(newReceipt).not.toBe(before.receipt);
    await expect(
      page.getByRole('region', { name: 'Recorded preference version 2' }),
    ).toContainText(before.receipt);
    await expect(
      revised.getByRole('button', { name: button, exact: true }),
    ).toBeDisabled();
    await accessible(page);
    await recorded.scrollIntoViewIfNeeded();
    await screenshot(page, 'response', info.project.name, company);
    await page.reload();
    await contractor(page, company);
    await page
      .getByRole('button', { name: 'Estimates & repairs', exact: true })
      .click();
    await expect(
      page
        .getByRole('region', { name: 'Customer estimate review' })
        .locator('article[data-version-id]'),
    ).toHaveCount(2);
    await expect(
      page.getByRole('region', { name: 'Recorded preference version 2' }),
    ).toHaveCount(0);
    await accessible(page);
  });
test('ordinary estimate and connected routes do not expose synthetic revision issuance', async ({
  page,
}) => {
  await page.goto('/preview');
  await page.getByRole('button', { name: 'Estimates', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Local revised estimate customer loop' }),
  ).toHaveCount(0);
  await page.goto('/portal/internal');
  await expect(
    page.getByRole('region', { name: 'Local revised estimate customer loop' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: 'Issue exact version 3 — synthetic only',
    }),
  ).toHaveCount(0);
});
