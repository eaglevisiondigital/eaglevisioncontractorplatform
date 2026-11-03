import {
  test,
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { sampleCompanies } from '../../src/domain/platform';
const visual =
  process.env.CYCLE20_VISUAL_DIR ??
  resolve(
    process.env.CYCLE20_ARTIFACT_DIR ?? 'artifacts/cycle20',
    'screenshots',
  );
const definitions = [
  {
    tab: 'Work-order revisions',
    region: 'Work order evidence continuity',
    title: 'Work order',
    kind: 'field',
  },
  {
    tab: 'Time and materials',
    region: 'Recorded cost continuity',
    title: 'Recorded cost',
    kind: 'finance',
  },
  {
    tab: 'Service documentation',
    region: 'Published service continuity',
    title: 'Published service',
    kind: 'customer',
  },
  {
    tab: 'Maintenance revisions',
    region: 'Maintenance renewal evidence',
    title: 'Maintenance renewal',
    kind: 'maintenance',
  },
  {
    tab: 'Recorded priorities',
    region: 'Recorded priority navigation',
    title: 'Recorded priorities',
    kind: 'priorities',
  },
] as const;
async function tab(root: Locator, label: string) {
  await root
    .getByRole('navigation', { name: 'Saved source review sections' })
    .getByRole('button', { name: label, exact: true })
    .click();
}
async function setup(page: Page, company: (typeof sampleCompanies)[number]) {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (
      !r.url().startsWith('http://127.0.0.1:4401') &&
      !r.url().startsWith('data:') &&
      !r.url().startsWith('blob:')
    )
      requests.push(r.url());
  });
  await page.goto('/preview/operating-center');
  await expect(
    page.getByLabel('Use saved evidence files', { exact: true }),
  ).not.toBeChecked();
  await page.getByLabel('Use saved evidence files', { exact: true }).check();
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
  await page.getByText('Saved evidence review', { exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Saved evidence review', exact: true })
    .getByRole('button', { name: 'Saved work evidence', exact: true })
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
  return { root, job, requests };
}
async function exercise(root: Locator, label: string) {
  const details = root.locator('.srw-exercise');
  if (
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
async function download(
  page: Page,
  panel: Locator,
  title: string,
  path: string,
) {
  mkdirSync(visual + '/files', { recursive: true });
  const waiting = page.waitForEvent('download');
  await panel
    .getByRole('button', {
      name: `Download ${title.toLowerCase()} evidence`,
      exact: true,
    })
    .click();
  const file = await waiting;
  await file.saveAs(path);
  expect(await file.failure()).toBeNull();
  const text = readFileSync(path, 'utf8');
  const envelope = JSON.parse(text) as {
    schema: string;
    kind: string;
    identity: Record<string, string>;
    payload: unknown;
    sha256: string;
  };
  expect(envelope.schema).toBe('propel-local-saved-evidence-v1');
  expect(envelope.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(Object.keys(envelope.identity).sort()).toEqual(
    [
      'organization_id',
      'customer_id',
      'location_id',
      'estimate_id',
      'version_id',
      'job_id',
    ].sort(),
  );
  await expect(panel.getByRole('status')).toContainText(
    'FILE_PREPARED_NOT_CONFIRMED_SAVED',
  );
  return { text, envelope, path };
}
async function reopen(panel: Locator, title: string, path: string) {
  await panel
    .getByLabel(`Open ${title.toLowerCase()} evidence file`, { exact: true })
    .setInputFiles(path);
  await expect(panel.getByRole('status')).toContainText(
    'HISTORICAL_EVIDENCE_ONLY',
  );
  await panel
    .getByRole('button', {
      name: `Reconcile exact saved ${title.toLowerCase()} source`,
      exact: true,
    })
    .click();
  await expect(panel.getByRole('status')).toContainText('CURRENT_MATCH');
}
function customerPrivacy(value: unknown) {
  if (Array.isArray(value)) value.forEach(customerPrivacy);
  else if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) {
      expect(key).not.toMatch(
        /actor|staff|worker|employee|payroll|wage|deduction|rate|cost|private|internal_note/i,
      );
      customerPrivacy(child);
    }
}
async function capture(root: Locator, name: string) {
  mkdirSync(visual, { recursive: true });
  await root.screenshot({
    path: `${visual}/${name}.png`,
    animations: 'disabled',
  });
  const info = test.info();
  const company = sampleCompanies.find((c) =>
    info.title.endsWith('/ ' + c.slug),
  )!;
  const protectedSource = JSON.parse(
    readFileSync('docs/program/CYCLE4_PROTECTED_SOURCE.json', 'utf8'),
  ) as { files: { path: string; sha256: string }[] };
  const design = JSON.parse(
    readFileSync('docs/program/DESIGN_SYSTEM_CONTRACT.json', 'utf8'),
  ) as { locks: { path: string; sha256: string }[]; bindings: unknown[] };
  const hash = (path: string) =>
    createHash('sha256').update(readFileSync(path)).digest('hex');
  writeFileSync(
    `${visual}/${name}.json`,
    JSON.stringify({
      schema: 'propel-cycle20-browser-capture-v1',
      screenshot_id: name,
      screenshot_sha256: hash(`${visual}/${name}.png`),
      brand: company.slug,
      company_id: company.id,
      project: info.project.name,
      viewport: info.project.use.viewport,
      scenario: info.title,
      source_sha256: [
        'src/components/workflows/SavedEvidenceControls.tsx',
        'src/components/workflows/SavedRevisionWorkbench.tsx',
        'src/components/workflows/saved-revision-workbench.css',
        'src/components/workflows/OperatingCenterCycleTwenty.tsx',
        'src/lib/workflows/saved-evidence-runtime.ts',
      ].map((path) => ({ path, sha256: hash(path) })),
      protected_files: protectedSource.files.map((f) => ({
        path: f.path,
        expected_sha256: f.sha256,
        actual_sha256: hash(f.path),
      })),
      design_locks: design.locks.map((f) => ({
        path: f.path,
        expected_sha256: f.sha256,
        actual_sha256: hash(f.path),
      })),
      design_binding_count: design.bindings.length,
      head: execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim(),
      dirty: !!execFileSync('git', ['status', '--porcelain'], {
        encoding: 'utf8',
      }).trim(),
      approval: 'PENDING',
      physical_recovery: 'UNVERIFIED',
      release: 'NOT_READY_NOT_AUTHORIZED',
    }),
  );
}
async function assertFinanceHeader(root: Locator) {
  const info = test.info();
  const company = sampleCompanies.find((c) =>
    info.title.endsWith('/ ' + c.slug),
  )!;
  const context = info.title.startsWith('five actual')
    ? 'actual-host'
    : 'fixture';
  const header = root.locator(
    '.recorded-cost-continuity .cost-saved-revisions > header',
  );
  const metrics = await header.evaluate((node) => {
    const rectangle = (element: Element) => {
      const r = element.getBoundingClientRect();
      return {
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        left: r.left,
        width: r.width,
        height: r.height,
      };
    };
    const style = getComputedStyle(node);
    const next = node.nextElementSibling!;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      operating_center_ancestor: Boolean(node.closest('.operating-center')),
      computed: {
        display: style.display,
        height: style.height,
        minWidth: style.minWidth,
        flexDirection: style.flexDirection,
        fontSize: style.fontSize,
      },
      header: rectangle(node),
      children: Array.from(node.children).map((child) => ({
        tag: child.tagName,
        text: child.textContent?.trim(),
        ...rectangle(child),
      })),
      next: { tag: next.tagName, ...rectangle(next) },
    };
  });
  const artifacts = resolve(
    process.env.CYCLE20_ARTIFACT_DIR ?? 'artifacts/cycle20',
    'geometry',
  );
  mkdirSync(artifacts, { recursive: true });
  const identity = `finance-${context}-${info.project.name}-${company.slug}`;
  const screenshot = resolve(artifacts, identity + '.png');
  await header.screenshot({ path: screenshot, animations: 'disabled' });
  writeFileSync(
    resolve(artifacts, identity + '.json'),
    JSON.stringify(
      {
        ...metrics,
        source_commit: execFileSync('git', ['rev-parse', 'HEAD'], {
          encoding: 'utf8',
        }).trim(),
        shell_css_sha256: createHash('sha256')
          .update(
            readFileSync(
              'src/components/workflows/saved-revision-workbench.css',
            ),
          )
          .digest('hex'),
        screenshot_sha256: createHash('sha256')
          .update(readFileSync(screenshot))
          .digest('hex'),
        visual_approval: 'PENDING',
      },
      null,
      2,
    ),
  );
  expect(metrics.children).toHaveLength(3);
  for (let i = 1; i < metrics.children.length; i++) {
    expect(metrics.children[i].top).toBeGreaterThanOrEqual(
      metrics.children[i - 1].bottom - 0.5,
    );
  }
  for (let i = 0; i < metrics.children.length; i++)
    for (let j = i + 1; j < metrics.children.length; j++) {
      const a = metrics.children[i],
        b = metrics.children[j];
      const overlapping =
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
      expect(overlapping).toBe(false);
    }
  expect(metrics.next.tag).toBe('P');
  expect(metrics.next.top).toBeGreaterThanOrEqual(metrics.header.bottom - 0.5);
  expect(metrics.next.top).toBeGreaterThanOrEqual(
    Math.max(...metrics.children.map((r) => r.bottom)) - 0.5,
  );
}
async function audit(page: Page, root: Locator) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  for (const button of await root.getByRole('button').all())
    if (await button.isVisible())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
}
async function mount(page: Page, brand: number, endedTime = false) {
  await page.goto('/preview/operating-center');
  await page.evaluate(
    async ({ brand, endedTime }) => {
      const path = '/tests/program/cycle20-browser-harness.tsx';
      const { mountEvidenceWorkbench } = await import(path);
      (window as unknown as { c20: unknown }).c20 =
        await mountEvidenceWorkbench(brand, endedTime);
    },
    { brand, endedTime },
  );
  return page.getByRole('region', {
    name: 'Saved source workbench',
    exact: true,
  });
}
for (const [brand, company] of sampleCompanies.entries()) {
  test(`five actual saved evidence file round trips and tamper privacy / ${company.slug}`, async ({
    page,
  }, info) => {
    const { root, job, requests } = await setup(page, company);
    for (const d of definitions) {
      await tab(root, d.tab);
      if (d.kind === 'finance') await assertFinanceHeader(root);
      const panel = root.getByRole('region', { name: d.region, exact: true });
      const files = panel.getByRole('region', {
        name: d.title + ' files',
        exact: true,
      });
      const path = `${visual}/files/${info.project.name}-${company.slug}-${d.kind}.json`;
      const saved = await download(page, files, d.title, path);
      expect(saved.envelope.kind).toBe(d.kind);
      expect(saved.envelope.identity.organization_id).toBe(company.id);
      expect(saved.envelope.identity.job_id).toBe(job);
      await reopen(files, d.title, path);
      await files
        .getByText('Opened historical evidence', { exact: true })
        .click();
      expect(JSON.parse((await files.locator('pre').textContent())!)).toEqual(
        saved.envelope.payload,
      );
      if (d.kind === 'customer') {
        customerPrivacy(saved.envelope);
        expect(saved.text).not.toContain('PRIVATE_');
        const tampered = {
          ...saved.envelope,
          sha256:
            (saved.envelope.sha256[0] === '0' ? '1' : '0') +
            saved.envelope.sha256.slice(1),
        };
        const bad = path.replace('.json', '-tampered.json');
        writeFileSync(bad, JSON.stringify(tampered));
        await files
          .getByLabel('Open published service evidence file', { exact: true })
          .setInputFiles(bad);
        await expect(files.getByRole('alert')).toContainText('UNKNOWN');
        await expect(files.locator('pre')).toHaveCount(0);
        expect(readFileSync(path, 'utf8')).toBe(saved.text);
        await reopen(files, d.title, path);
      }
      await expect(root.locator('.srw-context')).toContainText(job);
      await capture(
        root,
        `files-${d.kind}-${info.project.name}-${company.slug}`,
      );
      await audit(page, root);
    }
    expect(requests).toEqual([]);
  });
  test(`explicit draft edit preserves safe published history and stale archives / ${company.slug}`, async ({
    page,
  }, info) => {
    const { root, job, requests } = await setup(page, company);
    await tab(root, 'Service documentation');
    const service = root.getByRole('region', {
      name: 'Published service continuity',
      exact: true,
    });
    const review = service.getByRole('region', {
      name: 'Service revision review',
      exact: true,
    });
    await review
      .getByRole('button', {
        name: 'Read published service source',
        exact: true,
      })
      .click();
    const serviceFiles = service.getByRole('region', {
      name: 'Published service files',
      exact: true,
    });
    const before = await download(
      page,
      serviceFiles,
      'Published service',
      `${visual}/files/${info.project.name}-${company.slug}-published-before.json`,
    );
    await tab(root, 'Work-order revisions');
    const field = root.getByRole('region', {
      name: 'Work order evidence continuity',
      exact: true,
    });
    const fieldFiles = field.getByRole('region', {
      name: 'Work order files',
      exact: true,
    });
    const draftBefore = await download(
      page,
      fieldFiles,
      'Work order',
      `${visual}/files/${info.project.name}-${company.slug}-draft-before.json`,
    );
    const editor = field.getByRole('region', {
      name: 'Local draft visit editor',
      exact: true,
    });
    await editor
      .getByRole('button', { name: 'Load current draft visit', exact: true })
      .click();
    const privateText = `PRIVATE_BROWSER_DRAFT_${company.slug}`;
    await editor
      .getByRole('textbox', {
        name: 'Saved draft observation summary',
        exact: true,
      })
      .fill(privateText);
    await editor
      .getByLabel(
        'I reviewed this exact saved draft revision and confirm the local summary/checklist edit only.',
      )
      .check();
    await editor
      .getByRole('button', {
        name: 'Save exact local draft revision',
        exact: true,
      })
      .click();
    await expect(editor.getByRole('status')).toContainText(
      'SYNTHETIC_SOURCE_SAVED',
    );
    await fieldFiles
      .getByRole('button', {
        name: 'Reconcile exact saved work order source',
        exact: true,
      })
      .click();
    await expect(fieldFiles.getByRole('status')).toContainText(
      'STALE_SAVED_EVIDENCE',
    );
    expect(readFileSync(draftBefore.path, 'utf8')).toBe(draftBefore.text);
    await capture(root, `draft-edit-${info.project.name}-${company.slug}`);
    await tab(root, 'Service documentation');
    await serviceFiles
      .getByRole('button', {
        name: 'Reconcile exact saved published service source',
        exact: true,
      })
      .click();
    await expect(serviceFiles.getByRole('status')).toContainText(
      'CURRENT_MATCH',
    );
    const afterPrivate = await download(
      page,
      serviceFiles,
      'Published service',
      `${visual}/files/${info.project.name}-${company.slug}-published-after-private.json`,
    );
    expect(afterPrivate.text).toBe(before.text);
    expect(afterPrivate.text).not.toContain(privateText);
    customerPrivacy(afterPrivate.envelope);
    await exercise(root, 'Append synthetic published report version');
    await serviceFiles
      .getByRole('button', {
        name: 'Reconcile exact saved published service source',
        exact: true,
      })
      .click();
    await expect(serviceFiles.getByRole('status')).toContainText(
      'STALE_SAVED_EVIDENCE',
    );
    expect(readFileSync(before.path, 'utf8')).toBe(before.text);
    await review
      .getByRole('button', { name: 'Read saved service updates', exact: true })
      .click();
    await review
      .getByRole('button', {
        name: 'Inspect published revision comparison',
        exact: true,
      })
      .click();
    await expect(
      review.getByRole('article', {
        name: 'Published service revision comparison',
        exact: true,
      }),
    ).toContainText('Published versions 1 and 2');
    await review
      .getByLabel('I reviewed both exact published versions.')
      .check();
    await review
      .getByRole('button', {
        name: 'Adopt inspected published version',
        exact: true,
      })
      .click();
    await review
      .getByRole('button', { name: /^Inspect service version 1 · / })
      .click();
    await expect(
      review.getByRole('article', {
        name: 'Exact safe Passport service evidence',
        exact: true,
      }),
    ).toContainText('Exact published service version 1');
    await expect(review).toContainText(
      'Physical completion, acceptance and warranty UNVERIFIED',
    );
    await capture(
      root,
      `published-history-${info.project.name}-${company.slug}`,
    );
    await tab(root, 'Maintenance revisions');
    const growth = root.getByRole('region', {
      name: 'Maintenance renewal evidence',
      exact: true,
    });
    const growthFiles = growth.getByRole('region', {
      name: 'Maintenance renewal files',
      exact: true,
    });
    const renewal = await download(
      page,
      growthFiles,
      'Maintenance renewal',
      `${visual}/files/${info.project.name}-${company.slug}-renewal-before.json`,
    );
    await exercise(root, 'Save synthetic maintenance plan revision');
    await growthFiles
      .getByRole('button', {
        name: 'Reconcile exact saved maintenance renewal source',
        exact: true,
      })
      .click();
    await expect(growthFiles.getByRole('status')).toContainText(
      'STALE_SAVED_EVIDENCE',
    );
    expect(readFileSync(renewal.path, 'utf8')).toBe(renewal.text);
    await expect(root.locator('.srw-context')).toContainText(job);
    await capture(root, `renewal-${info.project.name}-${company.slug}`);
    await audit(page, root);
    expect(requests).toEqual([]);
  });
  test(`actual ended organization preparation and exact priority navigation / ${company.slug}`, async ({
    page,
  }, info) => {
    const root = await mount(page, brand, true);
    const job = await root.locator('.srw-context code').textContent();
    await tab(root, 'Time and materials');
    await assertFinanceHeader(root);
    const finance = root.getByRole('region', {
      name: 'Organization labor preparation',
      exact: true,
    });
    await finance
      .getByLabel('Period start · UTC midnight', { exact: true })
      .fill('2099-02-03');
    await finance
      .getByLabel('Exclusive period end · UTC midnight', { exact: true })
      .fill('2099-02-04');
    await finance
      .getByRole('button', {
        name: 'Preview organization labor preparation',
        exact: true,
      })
      .click();
    await expect(finance.getByRole('alert')).toContainText('period invalid');
    await expect(
      finance.getByRole('button', {
        name: 'Confirm organization labor preparation',
        exact: true,
      }),
    ).toHaveCount(0);
    await finance
      .getByLabel('Period start · UTC midnight', { exact: true })
      .fill('2026-02-03');
    await finance
      .getByLabel('Exclusive period end · UTC midnight', { exact: true })
      .fill('2026-02-04');
    await finance
      .getByRole('button', {
        name: 'Preview organization labor preparation',
        exact: true,
      })
      .click();
    const organizationJobs = await page.evaluate(
      () => (window as unknown as { c20: { jobIds: string[] } }).c20.jobIds,
    );
    await expect(finance).toContainText(
      `${organizationJobs.length} affected jobs · 2 recorded period entries`,
    );
    for (const id of organizationJobs) await expect(finance).toContainText(id);
    await expect(finance.locator(':scope > ul > li')).toHaveCount(
      organizationJobs.length,
    );
    await expect(
      finance.getByRole('button', {
        name: 'Confirm organization labor preparation',
        exact: true,
      }),
    ).toBeDisabled();
    await finance
      .getByLabel(
        'I reviewed all affected jobs and time entries for this ended period',
      )
      .check();
    await finance
      .getByRole('button', {
        name: 'Confirm organization labor preparation',
        exact: true,
      })
      .click();
    await expect(finance.getByRole('status')).toContainText(
      'LOCKED_INTERNAL_PREPARATION',
    );
    await expect(
      finance.getByRole('button', {
        name: 'Confirm organization labor preparation',
        exact: true,
      }),
    ).toBeDisabled();
    await finance
      .getByRole('button', {
        name: 'Reconcile exact labor preparation',
        exact: true,
      })
      .click();
    await expect(finance.getByRole('status')).toContainText(
      'EXACT_READ_ONLY_RECONCILIATION',
    );
    await capture(root, `finance-${info.project.name}-${company.slug}`);
    await tab(root, 'Recorded priorities');
    const priority = root.getByRole('region', {
      name: 'Inspected priority source navigation',
      exact: true,
    });
    await priority
      .getByRole('button', {
        name: 'Read current priorities for navigation',
        exact: true,
      })
      .click();
    await priority
      .getByRole('button', { name: /^Inspect recorded priority source: / })
      .first()
      .click();
    await expect(priority).toContainText('Exact inspected evidence');
    const stepText = await priority
      .locator('.recorded-priority-inspection')
      .innerText();
    const destination = stepText.match(
      /Existing local review: (field|finance|customer|maintenance|priorities)/,
    )?.[1];
    expect(destination).toBeTruthy();
    await capture(
      root,
      `priority-inspected-${info.project.name}-${company.slug}`,
    );
    await priority
      .getByRole('button', { name: 'Open exact existing review', exact: true })
      .click();
    const destinationLabels = {
      field: 'Work-order revisions',
      finance: 'Time and materials',
      customer: 'Service documentation',
      maintenance: 'Maintenance revisions',
      priorities: 'Recorded priorities',
    };
    await expect(
      root
        .getByRole('navigation', { name: 'Saved source review sections' })
        .getByRole('button', {
          name: destinationLabels[
            destination as keyof typeof destinationLabels
          ],
          exact: true,
        }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(root.locator('.srw-context')).toContainText(job!);
    await audit(page, root);
  });
  test(`revoked current member withholds reopened saved evidence / ${company.slug}`, async ({
    page,
  }, info: TestInfo) => {
    const root = await mount(page, brand);
    const files = root.getByRole('region', {
      name: 'Work order files',
      exact: true,
    });
    const saved = await download(
      page,
      files,
      'Work order',
      `${visual}/files/${info.project.name}-${company.slug}-revocation.json`,
    );
    await reopen(files, 'Work order', saved.path);
    await files
      .getByText('Opened historical evidence', { exact: true })
      .click();
    await expect(files.locator('pre')).toBeVisible();
    await page.evaluate(() =>
      (window as unknown as { c20: { revoke(): void } }).c20.revoke(),
    );
    await expect(root).toContainText(
      'current authorized evidence is unavailable',
    );
    await expect(
      root.getByRole('region', {
        name: 'Work order evidence continuity',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(root.locator('pre')).toHaveCount(0);
    expect(readFileSync(saved.path, 'utf8')).toBe(saved.text);
    await capture(root, `revoked-${info.project.name}-${company.slug}`);
  });
}
