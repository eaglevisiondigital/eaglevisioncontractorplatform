import { test, expect } from '@playwright/test';
// Real React components and original repositories in a disposable browser mount.
// No production route, test hook, connected backend or replacement source engine.
for (const kind of ['field', 'growth', 'customer', 'advanced'] as const)
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
          kind === 'field'
            ? 'FieldWorkspace'
            : kind === 'growth'
              ? 'RetainedMaintenanceDesk'
              : kind === 'customer'
                ? 'ServicePassportPath'
                : 'AddonTaskDesk';
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
        let committed = 'unmounted';
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
        function Harness({ callback }: { callback: typeof old | undefined }) {
          React.default.useLayoutEffect(() => {
            committed =
              callback === old
                ? 'original'
                : callback === replacement
                  ? 'replaced'
                  : 'removed';
          }, [callback]);
          return React.default.createElement(Component, {
            sources,
            enabled: true,
            onSelectJob: callback,
          });
        }
        const render = (callback: typeof old | undefined) =>
          root.render(React.default.createElement(Harness, { callback }));
        render(old);
        const w = window as unknown as {
          cycle17Race: {
            arm: () => void;
            waiting: () => boolean;
            withdraw: (kind: string) => void;
            release: () => void;
            restore: () => void;
            counts: () => number[];
            committed: () => string;
          };
        };
        w.cycle17Race = {
          arm: () => {
            delay = true;
          },
          waiting: () => waiting,
          withdraw: (kind) =>
            render(kind === 'replaced' ? replacement : undefined),
          release: () => release(),
          restore: () => render(old),
          counts: () => [oldCalls, newCalls],
          committed: () => committed,
        };
      }, kind);
      const r = page.getByRole('region', {
        name:
          kind === 'field'
            ? 'Field workspace'
            : kind === 'growth'
              ? 'Retained maintenance desk'
              : kind === 'customer'
                ? 'Service Passport path'
                : 'Add-on task desk',
        exact: true,
      });
      if (kind === 'field') {
        await r
          .getByRole('combobox', { name: 'Field workspace job', exact: true })
          .selectOption({ index: 1 });
        await r
          .getByLabel('I confirm this is a local field source review.', {
            exact: true,
          })
          .check();
        await r
          .getByRole('button', {
            name: 'Open retained field workspace',
            exact: true,
          })
          .click();
      } else if (kind === 'growth') {
        await r
          .getByLabel(
            'I confirm this is a maintenance source review, with no permission to send.',
            { exact: true },
          )
          .check();
        await r
          .getByRole('button', {
            name: 'Load retained maintenance desk',
            exact: true,
          })
          .click();
        await r
          .getByRole('button', { name: /^Inspect retained occurrence / })
          .first()
          .click();
      } else if (kind === 'customer') {
        await r
          .getByRole('combobox', {
            name: 'Service request and job',
            exact: true,
          })
          .selectOption({ index: 1 });
        await r
          .getByLabel('I confirm this staff-selected service context.', {
            exact: true,
          })
          .check();
        await r
          .getByRole('button', {
            name: 'Open retained service path',
            exact: true,
          })
          .click();
        await r
          .locator('article')
          .filter({ hasText: 'Exact recorded report/job link.' })
          .first()
          .getByRole('button', { name: /^Open published report / })
          .click();
      } else {
        await r
          .getByRole('combobox', { name: 'Task desk job', exact: true })
          .selectOption({ index: 1 });
        await r
          .getByRole('button', {
            name: 'Open retained add-on review',
            exact: true,
          })
          .click();
        await r
          .getByRole('navigation', {
            name: 'Add-on task breadcrumbs',
            exact: true,
          })
          .getByRole('button', { name: 'Exact sources', exact: true })
          .click();
        await r
          .getByRole('button', { name: /^Inspect task source / })
          .first()
          .click();
      }
      await page.evaluate(() =>
        (
          window as unknown as { cycle17Race: { arm: () => void } }
        ).cycle17Race.arm(),
      );
      await r
        .getByRole('button', {
          name:
            kind === 'field'
              ? 'Open exact field job'
              : kind === 'growth'
                ? 'Open exact maintenance job'
                : kind === 'customer'
                  ? /^Open same service job /
                  : /^Open same add-on job /,
          exact: true,
        })
        .first()
        .click();
      await page.waitForFunction(() =>
        (
          window as unknown as { cycle17Race: { waiting: () => boolean } }
        ).cycle17Race.waiting(),
      );
      await page.evaluate(
        (kind) =>
          (
            window as unknown as {
              cycle17Race: { withdraw: (kind: string) => void };
            }
          ).cycle17Race.withdraw(kind),
        change,
      );
      await page.waitForFunction(
        (expected) =>
          (
            window as unknown as { cycle17Race: { committed: () => string } }
          ).cycle17Race.committed() === expected,
        change === 'replaced' ? 'replaced' : 'removed',
      );
      if (change === 'restored') {
        await page.evaluate(() =>
          (
            window as unknown as { cycle17Race: { restore: () => void } }
          ).cycle17Race.restore(),
        );
        await page.waitForFunction(
          () =>
            (
              window as unknown as { cycle17Race: { committed: () => string } }
            ).cycle17Race.committed() === 'original',
        );
      }
      await page.evaluate(() =>
        (
          window as unknown as { cycle17Race: { release: () => void } }
        ).cycle17Race.release(),
      );
      await expect(r).toHaveAttribute('aria-busy', 'false');
      expect(
        await page.evaluate(() =>
          (
            window as unknown as { cycle17Race: { counts: () => number[] } }
          ).cycle17Race.counts(),
        ),
      ).toEqual([0, 0]);
    });
