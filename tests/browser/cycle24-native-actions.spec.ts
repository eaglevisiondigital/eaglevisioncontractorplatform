import {
  test as baseTest,
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

// Exact source admission decides the required successor behavior. UI presence
// never supplies compatibility or an optional skip of acceptance assertions.
const successorEvidence = JSON.parse(
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import { inspectCycle25Sources } from './scripts/cycle25-source-lineage.mjs'; console.log(JSON.stringify(inspectCycle25Sources()));",
    ],
    { encoding: 'utf8' },
  ),
) as { packages: { module: string; commit: string; state: string }[] };
const successor = (module: string) =>
  successorEvidence.packages.some(
    (row) => row.module === module && row.state === 'EXACT_SUCCESSOR_PRESENT',
  );
const productionTitle = 'production keeps native actions closed';
const test = baseTest.extend({
  baseURL: async ({ baseURL }, use, info) => {
    await use(
      info.title !== productionTitle && baseURL === 'http://127.0.0.1:4173'
        ? 'http://127.0.0.1:4206'
        : baseURL,
    );
  },
});
test.use({ actionTimeout: 15000 });
const artifacts = resolve(
    process.env.CYCLE24_ARTIFACT_DIR ?? 'artifacts/cycle24',
  ),
  inventoryPath = 'docs/program/CYCLE24_RUNTIME_FILES.json',
  inventory = JSON.parse(readFileSync(inventoryPath, 'utf8')) as {
    schema: string;
    authority: string;
    parent_commit: string;
    paths: string[];
  };
if (
  inventory.schema !== 'propel-cycle24-runtime-paths-v1' ||
  inventory.authority !== 'SOURCE_BINDING_ONLY_NOT_RESTORATION' ||
  inventory.parent_commit !== '7b8d8c1a6f03fa33321409aa15c46926a63e59ed' ||
  inventory.paths.length !== 76 ||
  new Set(inventory.paths).size !== 76 ||
  inventory.paths.some(
    (p) => !p.startsWith('src/') || p.includes('..') || p.startsWith('/'),
  )
)
  throw Error('Exact finite76-file runtime inventory required');
const sources = inventory.paths,
  consent =
    'I confirm this disposable multi-job simulation; no dispatch, contract, invoice, payment or message is authorized.',
  taskConfirmation =
    'I reviewed this exact original task and confirm the local append-only correction, internal synthetic submission and review approval.',
  requestConfirmation =
    'I reviewed this exact request and confirm only its internal intake status and responsibility change. No work completion, customer approval or communication is authorized.',
  maintenanceConfirmation =
    'I confirm the exact source and requested staff-review action; no plan, consent or enrollment is changed.';
type KeyStep = { label: string; key: 'Enter' | 'Space' };
async function key(
  locator: Locator,
  steps: KeyStep[],
  press: 'Enter' | 'Space' = 'Enter',
) {
  await locator.focus();
  await expect(locator).toBeFocused();
  steps.push({
    label: await locator.evaluate(
      (e) =>
        e.getAttribute('aria-label') ??
        e.closest('label')?.textContent?.trim() ??
        e.textContent?.trim() ??
        e.tagName.toLowerCase(),
    ),
    key: press,
  });
  await locator.press(press);
}
async function tab(root: Locator, name: string, steps: KeyStep[]) {
  await key(
    root
      .getByRole('navigation', {
        name: 'Saved source review sections',
        exact: true,
      })
      .getByRole('button', { name, exact: true }),
    steps,
  );
}
const sha = (path: string) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
const binding = () => ({
  source_commit: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  working_tree_dirty: !!execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
  }).trim(),
  inventory_sha256: sha(inventoryPath),
  source_files: sources.map((path) => ({ path, sha256: sha(path) })),
  cycle25_sources: successorEvidence.packages,
});
async function capture(
  region: Locator,
  state: string,
  info: TestInfo,
  company: (typeof sampleCompanies)[number],
  records: Record<string, string>,
) {
  const dir = resolve(artifacts, 'screenshots');
  mkdirSync(dir, { recursive: true });
  const id = `${state}-${info.project.name}-${company.slug}`,
    png = resolve(dir, id + '.png');
  await region.screenshot({ path: png, animations: 'disabled' });
  writeFileSync(
    resolve(dir, id + '.json'),
    JSON.stringify(
      {
        schema: 'propel-cycle24-browser-capture-v1',
        screenshot_id: id,
        screenshot_sha256: sha(png),
        brand: company.slug,
        company_id: company.id,
        project: info.project.name,
        viewport: info.project.use.viewport,
        scenario: info.title,
        ...binding(),
        source_records: records,
        visual_approval: 'PENDING',
        physical_device_acceptance: 'UNVERIFIED',
        release: 'NOT_READY_NOT_AUTHORIZED',
      },
      null,
      2,
    ) + '\n',
  );
}
async function audit(page: Page, root: Locator) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  for (const button of await root.getByRole('button').all())
    if (await button.isVisible())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
}
async function setup(
  page: Page,
  company: (typeof sampleCompanies)[number],
  baseURL: string,
  steps: KeyStep[],
) {
  const outside: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol !== 'data:' && url.origin !== new URL(baseURL).origin)
      outside.push(req.url());
  });
  await page.goto('/preview/operating-center');
  await expect(
    page.getByLabel('Use current source requirements', { exact: true }),
  ).not.toBeChecked();
  const mode = page.getByRole('combobox', {
    name: 'Current source review',
    exact: true,
  });
  await expect(mode).toHaveValue('requirements');
  await expect(mode).toBeDisabled();
  await page
    .getByLabel('Use current source requirements', { exact: true })
    .check();
  await mode.selectOption('consistency');
  await page
    .getByRole('combobox', { name: 'Contractor', exact: true })
    .selectOption(company.id);
  await page.getByLabel(consent).check();
  await page
    .getByRole('button', {
      name: 'Prepare multi-job local environment',
      exact: true,
    })
    .click();
  const environment = page.getByRole('region', {
    name: 'Shared operating environment',
    exact: true,
  });
  await expect(environment).toHaveCount(1);
  await expect(environment).toContainText('4 admitted jobs');
  await page.getByText('Current source requirements', { exact: true }).click();
  await page
    .getByRole('navigation', {
      name: 'Current source requirements',
      exact: true,
    })
    .getByRole('button', { name: 'Current task requirements', exact: true })
    .click();
  const root = page.getByRole('region', {
    name: 'Saved source workbench',
    exact: true,
  });
  await page.evaluate(() => {
    const keys: { key: string; trusted: boolean }[] = [];
    (window as unknown as { c24Keys: typeof keys }).c24Keys = keys;
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter' || e.key === ' ')
          keys.push({ key: e.key, trusted: e.isTrusted });
      },
      true,
    );
  });
  const search = root
    .getByRole('region', { name: 'Shared record search', exact: true })
    .first();
  await key(
    search.getByRole('button', { name: 'Find another record', exact: true }),
    steps,
  );
  await key(
    search.getByRole('button', { name: 'Search shared records', exact: true }),
    steps,
  );
  await expect(search).toContainText('4 matching of 4');
  const row = search.locator('article').first(),
    job = (await row.locator('span').allTextContents())[0];
  expect(job).toMatch(/^[a-f0-9-]{36}$/);
  await key(row.getByRole('button', { name: /^Open exact record in / }), steps);
  await expect(root.locator('.srw-context')).toContainText(job);
  return { root, job, outside, environment };
}
async function proof(
  page: Page,
  steps: KeyStep[],
  info: TestInfo,
  company: (typeof sampleCompanies)[number],
  job: string,
  outside: string[],
) {
  const events = await page.evaluate(
    () =>
      (window as unknown as { c24Keys: { key: string; trusted: boolean }[] })
        .c24Keys,
  );
  expect(events.length).toBe(steps.length);
  expect(events.every((e) => e.trusted)).toBe(true);
  expect(events.map((e) => e.key)).toEqual(
    steps.map((s) => (s.key === 'Space' ? ' ' : 'Enter')),
  );
  expect(steps.length).toBeGreaterThanOrEqual(25);
  expect(outside).toEqual([]);
  const dir = resolve(artifacts, 'keyboard');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    resolve(dir, `${info.project.name}-${company.slug}.json`),
    JSON.stringify(
      {
        schema: 'propel-cycle24-keyboard-v1',
        brand: company.slug,
        company_id: company.id,
        project: info.project.name,
        scenario: info.title,
        start_job: job,
        end_job: job,
        steps,
        events,
        outside_requests: outside,
        skipped: 0,
        retries: 0,
        ...binding(),
        authority: 'LOCAL_KEYBOARD_REVIEW_ONLY',
        release: 'NOT_READY_NOT_AUTHORIZED',
      },
      null,
      2,
    ) + '\n',
  );
}
const dd = (region: Locator, name: string) =>
  region
    .locator('dt')
    .filter({ hasText: new RegExp(`^${name}$`) })
    .locator('xpath=following-sibling::dd[1]');
for (const company of sampleCompanies)
  test(`native action journey preserves one exact source context / ${company.slug}`, async ({
    page,
    baseURL,
  }, info) => {
    test.setTimeout(150000);
    const steps: KeyStep[] = [],
      { root, job, outside, environment } = await setup(
        page,
        company,
        baseURL!,
        steps,
      ),
      records: Record<string, string> = { job };
    const graph = root.getByRole('region', {
      name: 'Task revision consistency',
      exact: true,
    });
    await key(
      graph.getByText('Original task correction controls', { exact: true }),
      steps,
    );
    const task = graph.getByRole('region', {
      name: 'Append exact task correction',
      exact: true,
    });
    await key(
      task.getByRole('button', {
        name: 'Load current approved task',
        exact: true,
      }),
      steps,
    );
    records.original_task = await task
      .getByRole('combobox', {
        name: 'Exact eligible original entry',
        exact: true,
      })
      .inputValue();
    if (successor('field-task-continuity')) {
      const receipt = root.getByRole('region', {
        name: 'Original task receipt actions',
        exact: true,
      });
      await key(
        receipt.getByRole('button', {
          name: 'Read current task continuity',
          exact: true,
        }),
        steps,
      );
      const selected = receipt.getByRole('combobox', {
        name: 'Exact recorded task',
        exact: true,
      });
      await selected.selectOption(records.original_task);
      await expect(dd(receipt, 'Selected native entry')).toHaveText(
        records.original_task,
      );
      await expect(dd(receipt, 'Assigned technician')).not.toBeEmpty();
      await expect(dd(receipt, 'Durable receipt')).toHaveText(
        'NOT_IMPLEMENTED',
      );
      await key(
        receipt.getByRole('button', {
          name: 'Verify original task source',
          exact: true,
        }),
        steps,
      );
      await expect(receipt).toContainText('Original source eligible now');
      await key(
        receipt.getByRole('button', {
          name: 'Open original task correction controls',
          exact: true,
        }),
        steps,
      );
      await expect(receipt).toContainText(
        'Original field controls retained for task ' + records.original_task,
      );
      await expect(
        graph
          .getByText('Original task correction controls', { exact: true })
          .locator('xpath=..'),
      ).toHaveAttribute('open', '');
      await expect(root.locator('.srw-context')).toContainText(job);
    }
    await task
      .getByRole('textbox', { name: 'Corrected task description', exact: true })
      .fill(`C24 exact reviewed task ${company.slug}`);
    await key(
      task.getByLabel(taskConfirmation, { exact: true }),
      steps,
      'Space',
    );
    await key(
      task.getByRole('button', {
        name: 'Save exact task correction',
        exact: true,
      }),
      steps,
    );
    await expect(task.getByRole('status')).toContainText(
      'SYNTHETIC_SOURCE_SAVED',
    );
    const receipt = root.getByRole('region', {
      name: 'Original task receipt actions',
      exact: true,
    });
    await key(
      receipt.getByRole('button', {
        name: 'Reconcile original task receipt',
        exact: true,
      }),
      steps,
    );
    await expect(receipt).toContainText('EXACT_NATIVE_RESULT');
    await expect(receipt).toContainText('APPROVED');
    await expect(dd(receipt, 'Original task')).toHaveText(
      records.original_task,
    );
    for (const name of [
      'Exact source rows',
      'Acknowledged result rows',
      'Expected matching result rows',
      'Approved result reviews',
    ])
      await expect(dd(receipt, name)).toHaveText('1');
    records.task_result = await dd(receipt, 'Acknowledged result').innerText();
    expect(records.task_result).toMatch(/^[a-f0-9-]{36}$/);
    if (successor('field-task-continuity')) {
      await key(
        receipt.getByRole('button', {
          name: 'Read current task continuity',
          exact: true,
        }),
        steps,
      );
      await receipt
        .getByRole('combobox', { name: 'Exact recorded task', exact: true })
        .selectOption(records.task_result);
      await expect(dd(receipt, 'Selected native entry')).toHaveText(
        records.task_result,
      );
      await expect(dd(receipt, 'Receipt relationship')).toHaveText(
        'EXACT_RECEIPT_RESULT',
      );
      await expect(dd(receipt, 'Original custody')).toHaveText('KNOWN_SAVED');
    }
    await capture(receipt, 'task-receipt', info, company, records);
    await audit(page, root);

    await tab(root, 'Time and materials', steps);
    const finance = root.getByRole('region', {
      name: 'Cost action requirements',
      exact: true,
    });
    await key(
      finance.getByRole('button', {
        name: 'Load original cost action sources',
        exact: true,
      }),
      steps,
    );
    const costSelect = finance.getByRole('combobox', {
        name: 'Exact recorded cost action source',
        exact: true,
      }),
      costOption = costSelect
        .locator('option')
        .filter({ hasText: /^material ·/ })
        .first();
    records.cost_source = (await costOption.getAttribute('value')) as string;
    await costSelect.selectOption(records.cost_source);
    if (successor('native-cost-reconciliation')) {
      const search = finance.getByRole('searchbox', {
        name: 'Search original cost action sources',
        exact: true,
      });
      await search.fill('literal-no-source-[+]');
      await expect(finance).toContainText('0 matching');
      await expect(costSelect).toHaveValue(records.cost_source);
      await expect(finance).toContainText(
        'Retained exact selection outside these results',
      );
      await search.fill('material');
      await expect(costSelect).toHaveValue(records.cost_source);
    }
    await key(
      finance.getByRole('button', {
        name: 'Verify selected cost action',
        exact: true,
      }),
      steps,
    );
    await expect(finance).toContainText('Cost coverage: UNKNOWN');
    await expect(finance).toContainText('invoice prerequisites: NO_GO');
    await expect(
      finance.getByRole('button', {
        name: 'Open verified original cost review',
        exact: true,
      }),
    ).toBeDisabled();
    await capture(finance, 'cost-action', info, company, records);
    await audit(page, root);
    await key(
      finance.getByLabel(
        'Open only this exact original review; financial execution remains closed.',
        { exact: true },
      ),
      steps,
      'Space',
    );
    await key(
      finance.getByRole('button', {
        name: 'Open verified original cost review',
        exact: true,
      }),
      steps,
    );
    await expect(finance.getByRole('status')).toHaveText('CURRENT_REVIEW_ONLY');
    await expect(root.locator('.srw-context')).toContainText(job);

    await tab(root, 'Recorded priorities', steps);
    const owner = root.getByRole('region', {
      name: 'Owner action requirement verification',
      exact: true,
    });
    await key(
      owner.getByRole('button', {
        name: 'Load original owner action sources',
        exact: true,
      }),
      steps,
    );
    const ownerSelect = owner.getByRole('combobox', {
        name: 'Exact recorded owner action source',
        exact: true,
      }),
      ownerOption = ownerSelect
        .locator('option')
        .filter({ hasText: /^\d+ ·/ })
        .first();
    records.owner_source = (await ownerOption.getAttribute('value')) as string;
    await ownerSelect.selectOption(records.owner_source);
    await key(
      owner.getByRole('button', {
        name: 'Verify selected owner action',
        exact: true,
      }),
      steps,
    );
    await expect(owner.getByRole('status')).toHaveText(
      'VERIFIED_ORIGINAL_REVIEW_DESTINATION',
    );
    await expect(owner).toContainText('Independent original requirements');
    await audit(page, root);
    if (successor('owner-action-continuity')) {
      await key(
        owner.getByRole('button', {
          name: 'Refresh original owner action sources',
          exact: true,
        }),
        steps,
      );
      await expect(ownerSelect).toHaveValue(records.owner_source);
      await expect(owner).toContainText(
        'Previous verification and confirmation are cleared',
      );
      await expect(
        owner.getByRole('button', {
          name: 'Open verified original owner review',
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(owner.locator('.owner-refresh-comparison')).toContainText(
        'UNCHANGED',
      );
      await key(
        owner.getByRole('button', {
          name: 'Verify selected owner action',
          exact: true,
        }),
        steps,
      );
      await expect(owner.getByRole('status')).toHaveText(
        'VERIFIED_ORIGINAL_REVIEW_DESTINATION',
      );
      await audit(page, root);
    }
    await capture(owner, 'owner-action', info, company, records);
    const destinationText = await owner
        .locator('.owner-action-result')
        .innerText(),
      destination = destinationText.match(
        /Exact original destination: (field|finance|invoice|customer|maintenance|priorities) ·/,
      );
    expect(destination).not.toBeNull();
    await key(
      owner.getByLabel(
        'Open only this original review; recommendations grant no operational authority.',
        { exact: true },
      ),
      steps,
      'Space',
    );
    await key(
      owner.getByRole('button', {
        name: 'Open verified original owner review',
        exact: true,
      }),
      steps,
    );
    await expect(
      root
        .locator('.owner-action-verification')
        .getByRole('status', { includeHidden: true }),
    ).toHaveText('CURRENT_REVIEW_ONLY');
    const labels: Record<string, string> = {
      field: 'Work-order revisions',
      finance: 'Time and materials',
      invoice: 'Time and materials',
      customer: 'Service documentation',
      maintenance: 'Maintenance revisions',
      priorities: 'Recorded priorities',
    };
    await expect(
      root
        .getByRole('navigation', {
          name: 'Saved source review sections',
          exact: true,
        })
        .getByRole('button', { name: labels[destination![1]], exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(root.locator('.srw-context')).toContainText(job);

    await tab(root, 'Service documentation', steps);
    const request = root.getByRole('region', {
      name: 'Service request actions',
      exact: true,
    });
    await key(
      request.getByRole('button', {
        name: 'Load exact service request',
        exact: true,
      }),
      steps,
    );
    await expect(request).toContainText('NOT_ATTEMPTED');
    await expect(request).toContainText('Request → selected job: UNKNOWN');
    records.request = await dd(request, 'Exact request').innerText();
    if (successor('service-evidence-continuity')) {
      const lineage = request.getByRole('region', {
        name: 'Original request and published evidence',
        exact: true,
      });
      await expect(
        dd(lineage, 'Selected job → estimate → immutable issued version'),
      ).toContainText(job);
      await expect(lineage).toContainText(
        'Completion requirements — not satisfied by intake closure',
      );
      await expect(lineage).toContainText('Physical completion UNKNOWN');
      await expect(lineage).toContainText('customer acceptance UNKNOWN');
      const report = lineage
        .locator('article')
        .filter({
          has: page.getByRole('button', {
            name: /^Inspect original published evidence: version /,
          }),
        })
        .first();
      records.published_report = (
        await report.locator('p').allTextContents()
      )[1];
      expect(records.published_report).toMatch(
        /^[a-f0-9-]{36} · published version \d+$/,
      );
      await key(
        report.getByRole('button', {
          name: /^Inspect original published evidence: version /,
        }),
        steps,
      );
      const inspected = lineage.getByRole('region', {
        name: 'Inspected original published report',
        exact: true,
      });
      await expect(inspected).toContainText(
        records.published_report.split(' · published version ')[0],
      );
      await expect(inspected).toContainText(
        'Recorded checklist marks, findings and after-phase documentation do not establish repairs or customer approval.',
      );
    }

    await request
      .getByRole('combobox', { name: 'Intake review status', exact: true })
      .selectOption('reviewing');
    const assignee = request.getByRole('combobox', {
        name: 'Responsible staff',
        exact: true,
      }),
      active = assignee
        .locator('option')
        .filter({ hasText: /^owner ·/ })
        .first();
    records.assignee = (await active.getAttribute('value')) as string;
    await assignee.selectOption(records.assignee);
    await expect(
      request.getByRole('button', {
        name: 'Save exact request review',
        exact: true,
      }),
    ).toBeDisabled();
    await capture(request, 'service-request-review', info, company, records);
    await audit(page, root);
    await key(
      request.getByLabel(requestConfirmation, { exact: true }),
      steps,
      'Space',
    );
    await key(
      request.getByRole('button', {
        name: 'Save exact request review',
        exact: true,
      }),
      steps,
    );
    await expect(request.getByRole('status')).toContainText(
      'SYNTHETIC_SOURCE_SAVED',
    );
    await key(
      request.getByRole('button', {
        name: 'Observe exact request read only',
        exact: true,
      }),
      steps,
    );
    const observation = request.getByRole('region', {
      name: 'Exact request observation',
      exact: true,
    });
    await expect(observation).toContainText('KNOWN_SAVED');
    await expect(observation).toContainText('EXACT_CURRENT_ROW_OBSERVED');
    await expect(observation).toContainText(records.request);
    await expect(observation).toContainText(records.assignee);
    await expect(observation).toContainText('reviewing');
    await expect(observation).toContainText('durable receipt false');
    await expect(observation).toContainText('native CAS false');
    await capture(request, 'service-request-saved', info, company, records);
    await audit(page, root);
    await expect(root.locator('.srw-context')).toContainText(job);

    await tab(root, 'Recorded priorities', steps);
    await expect(owner.getByRole('alert')).toContainText(
      'source or staff access changed',
    );
    await expect(
      owner.getByRole('combobox', {
        name: 'Exact recorded owner action source',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      owner.getByRole('button', {
        name: 'Open verified original owner review',
        exact: true,
      }),
    ).toHaveCount(0);
    await capture(owner, 'stale-owner', info, company, records);
    await audit(page, root);

    await tab(root, 'Maintenance revisions', steps);
    const maintenance = root.getByRole('region', {
      name: 'Maintenance staff review actions',
      exact: true,
    });
    await key(
      maintenance.getByRole('button', {
        name: 'Read staff cancellation sources',
        exact: true,
      }),
      steps,
    );
    const occurrences = maintenance.getByRole('combobox', {
        name: 'Exact cancellation review occurrence',
        exact: true,
      }),
      occurrence = occurrences
        .locator('option')
        .filter({ hasText: / · revision / })
        .first();
    records.occurrence = (await occurrence.getAttribute('value')) as string;
    await occurrences.selectOption(records.occurrence);
    await expect(maintenance).toContainText('Native plan cancellation');
    await expect(maintenance).toContainText('UNSUPPORTED');
    if (successor('maintenance-consistency')) {
      await expect(
        maintenance.getByRole('region', {
          name: 'Selected maintenance requirements',
          exact: true,
        }),
      ).toContainText('Renewal terms');
      await expect(maintenance).toContainText(
        'Current requirements not verified',
      );
      await key(
        maintenance.getByRole('button', {
          name: 'Verify selected maintenance requirements',
          exact: true,
        }),
        steps,
      );
      await expect(maintenance.getByRole('status')).toContainText(
        'CURRENT_REQUIREMENTS_CAPTURED_NOT_ATOMIC',
      );
    }
    await key(
      maintenance.getByLabel(maintenanceConfirmation, { exact: true }),
      steps,
      'Space',
    );
    await key(
      maintenance.getByRole('button', {
        name: 'Prepare blocked staff review',
        exact: true,
      }),
      steps,
    );
    await expect(maintenance.getByRole('status')).toContainText(
      'BLOCKED_LOCAL_REVIEW',
    );
    if (successor('maintenance-consistency')) {
      await expect(
        maintenance.getByRole('region', {
          name: 'Selected maintenance requirements',
          exact: true,
        }),
      ).toContainText('Renewal terms');
      await expect(maintenance).toContainText(
        'Current requirements checked for this selection.',
      );
      await key(
        maintenance.getByRole('button', {
          name: 'Verify selected maintenance requirements',
          exact: true,
        }),
        steps,
      );
      await expect(maintenance.getByRole('status')).toContainText(
        'CURRENT_REQUIREMENTS_CAPTURED_NOT_ATOMIC',
      );
    }
    await key(
      maintenance.getByLabel(maintenanceConfirmation, { exact: true }),
      steps,
      'Space',
    );
    const revoke = company.slug === 'cunningham';
    await key(
      maintenance.getByRole('button', {
        name: revoke ? 'Revoke this staff review' : 'Cancel this staff review',
        exact: true,
      }),
      steps,
    );
    await expect(maintenance.getByRole('status')).toContainText(
      revoke ? 'REVOKED_LOCAL_REVIEW' : 'CANCELLED_LOCAL_REVIEW',
    );
    await key(
      maintenance.getByRole('button', {
        name: 'Reconcile retained staff review',
        exact: true,
      }),
      steps,
    );
    await expect(maintenance.getByRole('status')).toContainText(
      'replay FORBIDDEN',
    );
    await expect(
      maintenance.getByRole('button', {
        name: 'Prepare blocked staff review',
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      maintenance.getByRole('button', {
        name: 'Cancel this staff review',
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      maintenance.getByRole('button', {
        name: 'Revoke this staff review',
        exact: true,
      }),
    ).toBeDisabled();
    await capture(maintenance, 'maintenance-terminal', info, company, records);
    await audit(page, root);
    await expect(environment).toHaveCount(1);
    await expect(environment).toContainText('4 admitted jobs');
    await expect(root.locator('.srw-context')).toContainText(job);
    await key(
      page.getByText('Disposable development controls', { exact: true }),
      steps,
    );
    await proof(page, steps, info, company, job, outside);
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(
        sampleCompanies[(sampleCompanies.indexOf(company) + 1) % 3].id,
      );
    await expect(page.getByText(job, { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('region', {
        name: 'Exact request observation',
        exact: true,
      }),
    ).toHaveCount(0);
    expect(outside).toEqual([]);
  });
test(productionTitle, async ({ page, baseURL }) => {
  const outside: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol !== 'data:' && url.origin !== new URL(baseURL!).origin)
      outside.push(req.url());
  });
  await page.goto('/preview/operating-center');
  for (const label of [
    'Use current source requirements',
    'Current source review',
  ])
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  for (const name of [
    'Saved source workbench',
    'Original task receipt actions',
    'Cost action requirements',
    'Service request actions',
    'Maintenance staff review actions',
    'Owner action requirement verification',
  ])
    await expect(page.getByRole('region', { name, exact: true })).toHaveCount(
      0,
    );
  await expect(
    page.getByRole('button', {
      name: 'Prepare multi-job local environment',
      exact: true,
    }),
  ).toHaveCount(0);
  expect(outside).toEqual([]);
});
