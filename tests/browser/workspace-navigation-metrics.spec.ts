import { test, expect } from '@playwright/test';

test('retains the original mobile navigation line box and readable existing controls', async ({
  page,
  baseURL,
}, info) => {
  if (!baseURL) throw Error('Explicit loopback preview required');
  const origin = new URL(baseURL);
  expect(['127.0.0.1', 'localhost']).toContain(origin.hostname);
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin.origin
      ? route.continue()
      : route.abort(),
  );
  for (const [label, path] of [
    ['workspace', '/preview'],
    ['platform', '/preview/super-admin'],
  ]) {
    await page.goto(path);
    const nav = page.getByRole('navigation', {
      name: 'Workspace',
      exact: true,
    });
    await expect(nav).toBeVisible();
    const box = await nav.boundingBox();
    expect(box).not.toBeNull();
    if ((page.viewportSize()?.width ?? 0) <= 760) {
      // Original #500/#510-before evidence: 56px row. The 22px SVG introduced
      // a 54px row and moved every following mobile pixel up by two pixels.
      expect(box!.height).toBe(56);
    }
    for (const button of await nav.getByRole('button').all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(label + '-metrics.png'),
      fullPage: true,
    });
  }
});
