import { test, expect } from '@playwright/test';
// Real React components and original repositories in a disposable browser mount.
// No production route, test hook, connected backend or replacement source engine.
for (const kind of ['search', 'field', 'growth'] as const)
  for (const change of ['removed', 'replaced', 'restored'] as const)
    test(`${kind} withholds ${change} navigation callback after async source check`, async ({
      page,
    }) => {
      await page.goto('/');
      await page.evaluate(
        (kind) =>
          (
            window as unknown as {
              cycle16Race: { withdraw: (kind: string) => void };
            }
          ).cycle16Race.withdraw(kind),
        change,
      );
      await page.waitForFunction(
        (expected) =>
          (
            window as unknown as { cycle16Race: { committed: () => string } }
          ).cycle16Race.committed() === expected,
        change === 'replaced' ? 'replaced' : 'removed',
      );
      if (change === 'restored') {
        await page.evaluate(() =>
          (
            window as unknown as { cycle16Race: { restore: () => void } }
          ).cycle16Race.restore(),
        );
        await page.waitForFunction(
          () =>
            (
              window as unknown as { cycle16Race: { committed: () => string } }
            ).cycle16Race.committed() === 'original',
        );
      }
      await page.evaluate(() =>
        (
          window as unknown as { cycle16Race: { arm: () => void } }
        ).cycle16Race.arm(),
      );
      await r
        .getByRole('button', {
          name:
            kind === 'search'
              ? 'Open exact record in Field review'
              : kind === 'field'
                ? 'Open exact daily job review'
                : 'Open exact retention job review',
          exact: true,
        })
        .first()
        .click();
      await page.waitForFunction(() =>
        (
          window as unknown as { cycle16Race: { waiting: () => boolean } }
        ).cycle16Race.waiting(),
      );
      await page.evaluate(async (kind) => {
        (
          window as unknown as {
            cycle16Race: { withdraw: (kind: string) => void };
          }
        ).cycle16Race.withdraw(kind);
        await new Promise(requestAnimationFrame);
        if (kind === 'restored') {
          (
            window as unknown as { cycle16Race: { restore: () => void } }
          ).cycle16Race.restore();
          await new Promise(requestAnimationFrame);
        }
      }, change);
      await page.evaluate(() =>
        (
          window as unknown as { cycle16Race: { release: () => void } }
        ).cycle16Race.release(),
      );
      await expect(
        r.getByRole('button', {
          name:
            kind === 'search'
              ? 'Search shared records'
              : kind === 'field'
                ? 'Reconcile daily field evidence read only'
                : 'Reconcile retention evidence read only',
          exact: true,
        }),
      ).toBeEnabled();
      if (kind === 'search')
        await expect(r).toContainText('navigation context changed');
      expect(
        await page.evaluate(() =>
          (
            window as unknown as { cycle16Race: { counts: () => number[] } }
          ).cycle16Race.counts(),
        ),
      ).toEqual([0, 0]);
    });
