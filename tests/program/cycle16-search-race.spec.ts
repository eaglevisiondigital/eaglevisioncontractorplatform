import { test, expect } from '@playwright/test';
// Real React components and original repositories in a disposable browser mount.
// No production route, test hook, connected backend or replacement source engine.
for (const kind of ['search', 'field', 'growth'] as const)
  for (const change of ['removed', 'replaced', 'restored'] as const)
    test(`${kind} withholds ${change} navigation callback after async source check`, async ({
      page,
    }) => {
      await page.goto('/');
      await page.evaluate(async (kind) => {
        const source = await fetch(
          '/src/components/workflows/SharedRecordSearch.tsx',
        ).then((r) => r.text());
        const main = await fetch('/src/main.tsx').then((r) => r.text());
        const reactUrl = source.match(
          /from ["']([^"']*\/react\.js[^"']*)["']/,
        )![1];
        const domUrl = main.match(
          /from ["']([^"']*react-dom_client\.js[^"']*)["']/,
        )![1];
        const React = await import(reactUrl),
          DOM = await import(domUrl);
        const exportName =
          kind === 'search'
            ? 'SharedRecordSearch'
            : kind === 'field'
              ? 'DailyFieldGuide'
              : 'RetentionReviewGuide';
        const modulePath = `/src/components/workflows/${exportName}.tsx`,
          runtimePath = '/src/lib/workflows/operating-center-runtime.ts',
          platformPath = '/src/domain/platform.ts';
        const Component = (await import(modulePath))[exportName],
          { prepareOperatingSources } = await import(runtimePath),
          { sampleCompanies } = await import(platformPath);
        const sources = await prepareOperatingSources(sampleCompanies[0], {
          enabled: true,
          confirmed: true,
        });
        const host = document.createElement('main');
        document.body.replaceChildren(host);
        const root = DOM.default.createRoot(host);
        let oldCalls = 0,
          newCalls = 0,
          waiting = false,
          delay = false,
          release = () => {};
        const original = crypto.subtle.digest.bind(crypto.subtle);
        crypto.subtle.digest = async (...args: Parameters<typeof original>) => {
          if (delay) {
            delay = false;
            waiting = true;
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          }
          return original(...args);
        };
        const old = () => {
            oldCalls++;
          },
          replacement = () => {
            newCalls++;
          };
        const render = (callback: typeof old | undefined) =>
          root.render(
            React.default.createElement(Component, {
              sources,
              enabled: true,
              onSelectJob: callback,
            }),
          );
        render(old);
        const w = window as unknown as {
          cycle16Race: {
            arm: () => void;
            waiting: () => boolean;
            withdraw: (kind: string) => void;
            release: () => void;
            restore: () => void;
            counts: () => number[];
          };
        };
        w.cycle16Race = {
          arm: () => {
            delay = true;
          },
          waiting: () => waiting,
          withdraw: (kind) =>
            render(kind === 'replaced' ? replacement : undefined),
          release: () => release(),
          restore: () => render(old),
          counts: () => [oldCalls, newCalls],
        };
      }, kind);
      const r = page.getByRole('region', {
        name:
          kind === 'search'
            ? 'Shared record search'
            : kind === 'field'
              ? 'Daily field guide'
              : 'Retention review guide',
        exact: true,
      });
      if (kind === 'search') {
        await r
          .getByRole('button', { name: 'Find another record', exact: true })
          .click();
        await r
          .getByRole('button', { name: 'Search shared records', exact: true })
          .click();
        await expect(r).toContainText('4 matching');
      } else if (kind === 'field') {
        await r
          .getByRole('combobox', { name: 'Daily guide job', exact: true })
          .selectOption({ index: 1 });
        await r
          .getByLabel(
            'I confirm this is a read-only daily field source review.',
            { exact: true },
          )
          .check();
        await r
          .getByRole('button', {
            name: 'Inspect daily field sources',
            exact: true,
          })
          .click();
        await expect(
          r.getByRole('heading', {
            name: 'Recorded daily work-order evidence',
            exact: true,
          }),
        ).toBeVisible();
      } else {
        await r
          .getByRole('combobox', { name: 'Retention guide job', exact: true })
          .selectOption({ index: 1 });
        await r
          .getByLabel(
            'I confirm this is a retention source review, with no permission to send.',
            { exact: true },
          )
          .check();
        await r
          .getByRole('button', {
            name: 'Inspect retention planning sources',
            exact: true,
          })
          .click();
        await r
          .getByRole('button', { name: /^Inspect retention occurrence / })
          .first()
          .click();
        await expect(
          r.getByRole('heading', {
            name: 'Exact retention occurrence review',
            exact: true,
          }),
        ).toBeVisible();
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
