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
async function openOldPacket(page: Page) {
  await page
    .getByRole('button', { name: 'Revision comparison & packet', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Open packet revision 2', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Issuance readiness & delivery dry run',
      exact: true,
    })
    .click();
}
async function accessible(page: Page) {
  const frames = page.frames().filter((f) => f !== page.mainFrame());
  // The opaque sandbox deliberately cannot participate in cross-frame messaging.
  // Audit the parent (including iframe title) and each exact child document separately.
  const builder = new AxeBuilder({ page });
  if (frames.length) builder.setLegacyMode().options({ iframes: false });
  expect((await builder.analyze()).violations).toEqual([]);
  for (const frame of frames) {
    const element = await frame.frameElement();
    const html = await element.getAttribute('srcdoc');
    expect(html).toBeTruthy();
    // Audit the exact srcdoc bytes in a test-only root document. The real preview
    // retains sandbox="" and CSP; scripts remain disabled there, including axe timers.
    const audit = await page.context().newPage();
    try {
      const bounds = await element.boundingBox();
      if (bounds)
        await audit.setViewportSize({
          width: Math.max(1, Math.floor(bounds.width)),
          height: Math.max(1, Math.floor(bounds.height)),
        });
      await audit.setContent(html!);
      expect(
        (await new AxeBuilder({ page: audit }).analyze()).violations,
      ).toEqual([]);
    } finally {
      await audit.close();
    }
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
for (const company of [
  'sample-property',
  'sample-construction',
  'sample-roofing',
]) {
  test(`${company}: actual packet to review-only readiness and safe branded content, with dirty/stale holds`, async ({
    page,
  }, info) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://127.0.0.1:4173/')) external.push(r.url());
    });
    const actual = await prepareActualPacket(page, company),
      region = page.getByRole('region', {
        name: 'Revised estimate issuance readiness',
        exact: true,
      });
    await expect(
      region.getByRole('heading', {
        name: 'Revised Estimate — Ready for Issuance Review',
        exact: true,
      }),
    ).toBeVisible();
    const action = region.getByRole('button', {
      name: 'Review Issuance Requirements',
      exact: true,
    });
    await expect(action).toBeDisabled();
    await page
      .getByRole('button', { name: 'Estimate builder', exact: true })
      .click();
    const notes = page.getByRole('textbox', {
      name: 'Customer notes',
      exact: true,
    });
    const savedNote = await notes.inputValue();
    await notes.fill('Unsaved changes must not enter readiness');
    await openOldPacket(page);
    await expect(region.getByRole('alert')).toContainText(
      'Unsaved editor changes',
    );
    await expect(action).toBeDisabled();
    await page
      .getByRole('button', { name: 'Estimate builder', exact: true })
      .click();
    await notes.fill(savedNote);
    await openOldPacket(page);
    await expect(region).toContainText(actual.note);
    await expect(
      region.getByRole('article', {
        name: 'PASS Current saved draft and packet',
        exact: true,
      }),
    ).toBeVisible();
    for (const name of [
      'UNVERIFIED Tenant sender and domain authentication',
      'UNVERIFIED Verified customer contact',
      'UNVERIFIED Consent, preferences and suppression',
      'BLOCKED Secure customer review access',
      'BLOCKED Revised estimate issuance',
    ])
      await expect(
        region.getByRole('article', { name, exact: true }),
      ).toBeVisible();
    await region
      .getByText('Exact readiness source and integrity', { exact: true })
      .click();
    await expect(region).toContainText(actual.source);
    await expect(region).toContainText(actual.receipt);
    await expect(region).toContainText(actual.packetId);
    await expect(region).not.toContainText('PRIVATE_3D_STAFF_CANARY');
    await region.getByRole('checkbox').focus();
    await page.keyboard.press('Space');
    await expect(action).toBeEnabled();
    await accessible(page);
    await mkdir('artifacts/property', { recursive: true });
    await page.screenshot({
      path: `artifacts/property/issuance-readiness-${info.project.name}-${company}-review.png`,
      fullPage: true,
    });
    await region.screenshot({
      path: `artifacts/property/issuance-readiness-${info.project.name}-${company}-review-detail.png`,
    });
    await region.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({
      path: `artifacts/property/issuance-readiness-${info.project.name}-${company}-review-viewport.png`,
    });
    await action.click();
    const result = region.getByRole('region', {
      name: 'Recorded issuance readiness result',
      exact: true,
    });
    await expect(result).toContainText('Current local review');
    await expect(result).toContainText('Review result — BLOCKED');
    const resultId = await result.getAttribute('data-review-id');
    await result
      .getByText('Exact recorded review evidence', { exact: true })
      .click();
    const hash = (await result.getByText(/^Review SHA-256:/).textContent())!;
    expect(hash).toMatch(/[0-9a-f]{64}/);
    await expect(action).toBeDisabled();
    await region
      .getByRole('button', { name: 'Delivery-content preview', exact: true })
      .click();
    const content = region.getByRole('region', {
      name: 'Branded delivery-content dry run',
      exact: true,
    });
    await expect(content).toContainText('no address resolved');
    await expect(content).toContainText('none created');
    await expect(
      content.getByRole('textbox', {
        name: 'Suggested subject line',
        exact: true,
      }),
    ).toHaveValue(/Proposed revision EST-00001 \(version 3\)/);
    const frame = page.frameLocator(
      'iframe[title="Branded revised estimate content"]',
    );
    await expect(
      frame.getByRole('heading', {
        name: 'Draft Estimate — Not Issued or Sent',
        exact: true,
      }),
    ).toBeVisible();
    await expect(frame.locator('body')).toContainText(actual.note);
    await expect(frame.locator('body')).toContainText(actual.receipt);
    await expect(frame.locator('body')).not.toContainText(
      'PRIVATE_3D_STAFF_CANARY',
    );
    await expect(frame.locator('img,script,a,form')).toHaveCount(0);
    expect(await frame.locator('html').getAttribute('lang')).toBe('en');
    expect(await frame.locator('main').getAttribute('dir')).toBe('ltr');
    expect(
      await frame
        .locator('html')
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await accessible(page);
    await content.screenshot({
      path: `artifacts/property/issuance-readiness-${info.project.name}-${company}-delivery.png`,
    });
    await content.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({
      path: `artifacts/property/issuance-readiness-${info.project.name}-${company}-delivery-viewport.png`,
    });
    await page
      .getByRole('button', { name: 'Estimate builder', exact: true })
      .click();
    await notes.fill('Later saved scope must stale the earlier review');
    await page
      .getByRole('button', { name: 'Save estimate draft', exact: true })
      .click();
    await expect(
      page.getByText('Saved revision 3', { exact: false }),
    ).toBeVisible();
    await openOldPacket(page);
    await expect(region.getByRole('alert')).toContainText('BLOCKED');
    await expect(
      region.getByRole('button', {
        name: 'Review Issuance Requirements',
        exact: true,
      }),
    ).toHaveCount(0);
    await region
      .getByRole('button', {
        name: 'Open readiness result revision 2',
        exact: true,
      })
      .click();
    await expect(result).toHaveAttribute('data-review-id', resultId!);
    await expect(result).toContainText('historical review retained unchanged');
    await result
      .getByText('Exact recorded review evidence', { exact: true })
      .click();
    await expect(result.getByText(/^Review SHA-256:/)).toHaveText(hash);
    await region
      .getByRole('button', { name: 'Delivery-content preview', exact: true })
      .click();
    await expect(frame.locator('body')).not.toContainText('Later saved scope');
    await content.screenshot({
      path: `artifacts/property/issuance-readiness-${info.project.name}-${company}-stale-delivery.png`,
    });
    await page
      .getByRole('button', { name: 'Saved revision comparison', exact: true })
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
    await page
      .getByRole('button', {
        name: 'Issuance readiness & delivery dry run',
        exact: true,
      })
      .click();
    await expect(action).toBeDisabled();
    await region.getByRole('checkbox').check();
    await action.click();
    await expect(result).not.toHaveAttribute('data-review-id', resultId!);
    await expect(result).toContainText('Current local review');
    await page
      .getByRole('button', { name: 'All estimates', exact: true })
      .click();
    await page
      .getByRole('region', { name: 'Customer change requests', exact: true })
      .getByRole('button', { name: 'Open local customer portal', exact: true })
      .click();
    await page.getByRole('region', { name: 'Property overview' }).waitFor();
    await page
      .getByRole('button', { name: 'Estimates & repairs', exact: true })
      .click();
    const card = page
      .getByRole('region', { name: 'Customer estimate review' })
      .locator('article')
      .nth(1);
    expect(
      await card.locator('.customer-scope-line').allTextContents(),
    ).toEqual(actual.original);
    await expect(
      page.getByRole('region', { name: 'Recorded preference version 2' }),
    ).toContainText(actual.receipt);
    await expect(page.locator('.portal-concept')).not.toContainText(
      'Later saved scope',
    );
    expect(external).toEqual([]);
  });
}
test('ordinary drafts and closed connected routes do not expose issuance readiness or content delivery', async ({
  page,
}) => {
  await page.goto('/preview');
  await page.getByRole('button', { name: 'Estimates', exact: true }).click();
  await page
    .getByRole('button')
    .filter({ hasText: 'Cedar boundary fence' })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Issuance readiness & delivery dry run',
      exact: true,
    }),
  ).toHaveCount(0);
  await page.goto('/portal/property');
  await expect(
    page.getByRole('button', {
      name: 'Review Issuance Requirements',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText('The customer portal is reserved', { exact: false }),
  ).toBeVisible();
});
