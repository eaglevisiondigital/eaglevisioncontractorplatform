import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { sampleCompanies } from '../../src/domain/platform';
import { industryEstimate } from '../../src/domain/estimating/fixtures';

for (const company of sampleCompanies)
  test(`storm property review retains notes filters and published selection / ${company.slug}`, async ({
    page,
  }) => {
    await page.goto('/preview/contractor-journey');
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    const confirm = page.getByLabel(
      'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
    );
    await confirm.check();
    await page
      .getByRole('button', {
        name: 'Prepare local synthetic journey',
        exact: true,
      })
      .click();
    const r = page.getByRole('region', {
      name: 'Storm observations and property history',
      exact: true,
    });
    const note = r.getByRole('textbox', {
      name: 'Unfinished storm review notes',
      exact: true,
    });
    await note.fill('Reported water entry; cause not verified.');
    await r
      .getByRole('button', {
        name: 'Review exact storm property history',
        exact: true,
      })
      .click();
    const select = r.getByRole('combobox', {
      name: 'Published inspection version',
      exact: true,
    });
    await select.selectOption({ index: 1 });
    const original = await select.inputValue();
    await expect(r).toContainText('Storm attribution UNKNOWN');
    const query = r.getByRole('textbox', {
      name: 'Search available inspection evidence',
      exact: true,
    });
    await query.fill('no matching evidence');
    await expect(r).toContainText('Matching published evidence UNKNOWN');
    await query.fill('');
    await expect(select).toHaveValue(original);
    await r
      .getByRole('button', {
        name: 'Open exact property Passport review',
        exact: true,
      })
      .click();
    await expect(page.locator('#journey-customer')).toBeFocused();
    await r
      .getByRole('button', {
        name: 'Open exact job and Field review',
        exact: true,
      })
      .click();
    await expect(page.locator('#journey-field')).toBeFocused();
    await expect(note).toHaveValue('Reported water entry; cause not verified.');
    expect(
      (await new AxeBuilder({ page }).include('#journey-customer').analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await expect(
      r.getByRole('button', {
        name: /Dispatch|Authorize repair|Submit insurance|Create job|Send/,
      }),
    ).toHaveCount(0);
    await confirm.uncheck();
    await expect(r).toHaveCount(0);
  });

for (const company of sampleCompanies)
  test(`offline crew review retains observations and exact work order / ${company.slug}`, async ({
    page,
  }) => {
    await page.goto('/preview/contractor-journey');
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    const confirm = page.getByLabel(
      'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
    );
    await confirm.check();
    await page
      .getByRole('button', {
        name: 'Prepare local synthetic journey',
        exact: true,
      })
      .click();
    const r = page.getByRole('region', {
      name: 'Offline crew work-order context',
      exact: true,
    });
    const note = r.getByRole('textbox', {
      name: 'Unsaved offline observations',
      exact: true,
    });
    await note.fill('Unsent crew observation; keep task context.');
    await r
      .getByRole('button', {
        name: 'Review exact offline work-order context',
        exact: true,
      })
      .click();
    await expect(r).toContainText(
      'Server acknowledgment and synchronization outcome UNKNOWN',
    );
    await expect(r).toContainText('Visit');
    await expect(r).toContainText('crew context');
    await r
      .getByRole('button', { name: 'Hide recorded work order', exact: true })
      .click();
    await r
      .getByRole('button', {
        name: 'Return to exact recorded work order',
        exact: true,
      })
      .click();
    await expect(note).toHaveValue(
      'Unsent crew observation; keep task context.',
    );
    await expect(
      r.getByRole('button', {
        name: 'Review exact offline work-order context',
        exact: true,
      }),
    ).toBeDisabled();
    expect(
      (await new AxeBuilder({ page }).include('#journey-field').analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await expect(
      r.getByRole('button', {
        name: /Replay|Synchronize|Dispatch|Complete work/,
      }),
    ).toHaveCount(0);
    await confirm.uncheck();
    await expect(r).toHaveCount(0);
  });

for (const company of sampleCompanies)
  test(`procurement materials retain notes and exact Finance context / ${company.slug}`, async ({
    page,
  }) => {
    await page.goto('/preview/contractor-journey');
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    await page
      .getByLabel(
        'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
      )
      .check();
    await page
      .getByRole('button', {
        name: 'Prepare local synthetic journey',
        exact: true,
      })
      .click();
    const shared = page.getByRole('region', {
      name: 'Exact shared journey context',
      exact: true,
    });
    const original = await shared.innerText();
    const r = page.getByRole('region', {
      name: 'Procurement and exact job materials',
      exact: true,
    });
    const notes = r.getByRole('textbox', {
      name: 'Unfinished procurement notes',
      exact: true,
    });
    const filter = r.getByRole('textbox', {
      name: 'Filter recorded materials',
      exact: true,
    });
    await notes.fill('Await exact supplier quote; retain my questions.');
    await r
      .getByRole('button', {
        name: 'Review job materials and procurement requirements',
        exact: true,
      })
      .click();
    await expect(r).toContainText('Recorded estimate quantity:');
    await expect(r).toContainText('supplier quote / price evidence UNKNOWN');
    await expect(r).toContainText('Procurement approval: BLOCKED');
    await filter.fill('no matching materials');
    await r
      .getByRole('button', {
        name: 'Open exact materials job in Finance',
        exact: true,
      })
      .click();
    await expect(page.locator('#journey-finance')).toBeFocused();
    await expect(notes).toHaveValue(
      'Await exact supplier quote; retain my questions.',
    );
    await expect(filter).toHaveValue('no matching materials');
    await filter.fill('');
    await expect(r).toContainText('Scope line');
    expect(await shared.innerText()).toBe(original);
    expect(
      (await new AxeBuilder({ page }).include('#journey-finance').analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await expect(
      r.getByRole('button', {
        name: /Order|Pay|Post costs|Receive materials|Send/,
      }),
    ).toHaveCount(0);
    await page
      .getByLabel(
        'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
      )
      .uncheck();
    await expect(r).toHaveCount(0);
  });

for (const company of sampleCompanies)
  test(`receptionist retains caller text and exact CRM review / ${company.slug}`, async ({
    page,
  }) => {
    await page.goto('/preview/contractor-journey');
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    await page
      .getByLabel(
        'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
      )
      .check();
    await page
      .getByRole('button', {
        name: 'Prepare local synthetic journey',
        exact: true,
      })
      .click();
    const growth = page.locator('#journey-growth');
    await growth
      .getByLabel('I confirm this local maintenance planning review.')
      .check();
    await growth
      .getByRole('button', {
        name: 'Load maintenance opportunities',
        exact: true,
      })
      .click();
    await growth
      .getByText('Optional local opportunity review', { exact: true })
      .click();
    await growth
      .getByRole('combobox', { name: 'Review purpose', exact: true })
      .selectOption('receptionist');
    const transcript = growth.getByRole('textbox', {
      name: 'Synthetic review note',
      exact: true,
    });
    await transcript.fill(
      'Original caller: urgent estimate; no contact permission.',
    );
    const review = growth.getByRole('region', {
      name: 'Receptionist to existing Sales review',
      exact: true,
    });
    await review
      .getByRole('button', { name: 'Open exact existing intake', exact: true })
      .click();
    await expect(review).toContainText('Verified CRM record');
    await expect(review).toContainText('Caller-to-lead relationship UNKNOWN');
    const note = review.getByLabel('Unfinished receptionist staff notes');
    await note.fill('Unfinished staff question');
    await review
      .getByRole('button', { name: 'Hide exact intake review', exact: true })
      .click();
    await review
      .getByRole('button', { name: 'Open exact existing intake', exact: true })
      .click();
    await expect(note).toHaveValue('Unfinished staff question');
    await expect(transcript).toHaveValue(
      'Original caller: urgent estimate; no contact permission.',
    );
    await expect(
      review.getByRole('button', {
        name: /Save assignment|Send|Book|Create lead/,
      }),
    ).toHaveCount(0);
    expect(
      (await new AxeBuilder({ page }).include('#journey-growth').analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page
      .getByLabel(
        'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
      )
      .uncheck();
    await expect(review).toHaveCount(0);
  });

for (const company of sampleCompanies)
  test(`captured voice scope reaches the original estimate draft controls / ${company.slug}`, async ({
    page,
  }, info) => {
    await page.goto('/preview/contractor-journey');
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    await page
      .getByLabel(
        'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
      )
      .check();
    await page
      .getByRole('button', {
        name: 'Prepare local synthetic journey',
        exact: true,
      })
      .click();
    const context = page.getByRole('region', {
      name: 'Exact shared journey context',
      exact: true,
    });
    await expect(context).toBeVisible();
    const originalContext = await context.innerText();
    const item = industryEstimate(company, 'synthetic-test-only').lines[0];
    const originalText = `  2.125 ${item.unit} ${item.description}; missing quantities need review\n`;
    const advanced = page.getByLabel(
      'Include literal voice-transcript and trade review',
    );
    await advanced.check();
    const transcript = page.getByRole('textbox', {
      name: 'Literal synthetic transcript',
      exact: true,
    });
    await transcript.fill(originalText);
    await page
      .getByRole('button', {
        name: 'Open exact estimate draft controls',
        exact: true,
      })
      .click();
    const workspace = page.getByRole('region', {
      name: 'Captured job estimate preparation',
      exact: true,
    });
    await expect(workspace).toContainText('Immutable snapshot');
    await workspace
      .getByRole('button', { name: 'Create draft revision', exact: true })
      .click();
    const editor = workspace.locator('.estimate-editor');
    const voice = workspace.getByRole('region', {
      name: 'Voice scope to working draft',
      exact: true,
    });
    await expect(voice).toContainText('Draft version 2');
    const scope = editor.getByRole('textbox', {
      name: 'Scope description',
      exact: true,
    });
    const notes = editor.getByRole('textbox', {
      name: 'Private estimate notes',
      exact: true,
    });
    await scope.fill('Retain my unfinished job details.');
    await notes.fill('Private working note retained through voice review.');
    const before = await editor
      .getByRole('textbox', { name: /^Scope item \d+$/ })
      .count();
    await expect(
      editor.getByRole('button', { name: 'All estimates', exact: true }),
    ).toBeDisabled();
    await voice
      .getByRole('checkbox', {
        name: 'I confirm this original transcript and exact draft for local scope review.',
        exact: true,
      })
      .check();
    await transcript.fill(originalText + ' ');
    await expect(
      voice.getByRole('button', {
        name: 'Review captured draft scope',
        exact: true,
      }),
    ).toBeDisabled();
    await transcript.fill(originalText);
    await voice
      .getByRole('checkbox', {
        name: 'I confirm this original transcript and exact draft for local scope review.',
        exact: true,
      })
      .check();
    await voice
      .getByRole('button', { name: 'Review captured draft scope', exact: true })
      .click();
    const choices = voice.locator('ul input[type=checkbox]');
    await expect(choices).toHaveCount(1);
    await expect(voice).toContainText('Manual review required');
    await expect(voice).toContainText('UNVERIFIED');
    await expect(voice.locator('pre')).toHaveText(originalText);
    await choices.check();
    await voice
      .getByRole('checkbox', {
        name: 'I reviewed selected quantities and current catalog values for this working draft; pricing still requires verification.',
        exact: true,
      })
      .check();
    await voice
      .getByRole('button', {
        name: 'Use selected scope in working draft',
        exact: true,
      })
      .click();
    await expect(voice).toContainText(
      'Selected scope added to the unsaved working draft',
    );
    await expect(
      editor.getByRole('textbox', { name: /^Scope item \d+$/ }),
    ).toHaveCount(before + 1);
    await expect(
      editor.getByRole('textbox', {
        name: `Scope item ${before + 1}`,
        exact: true,
      }),
    ).toHaveValue(item.description);
    await expect(
      editor.getByLabel(`Quantity ${before + 1}`, { exact: true }),
    ).toHaveValue('2.125');
    await expect(
      voice.getByRole('button', {
        name: 'Use selected scope in working draft',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(scope).toHaveValue('Retain my unfinished job details.');
    await expect(notes).toHaveValue(
      'Private working note retained through voice review.',
    );
    await editor
      .locator('.p3-tabs')
      .getByRole('button', { name: 'Customer preview', exact: true })
      .click();
    await expect(voice).toContainText('Selected scope added');
    await editor
      .locator('.p3-tabs')
      .getByRole('button', { name: 'Estimate builder', exact: true })
      .click();
    await expect(notes).toHaveValue(
      'Private working note retained through voice review.',
    );
    await advanced.uncheck();
    await expect(editor).toBeVisible();
    await advanced.check();
    await expect(transcript).toHaveValue(originalText);
    expect(await context.innerText()).toBe(originalContext);
    expect(
      (
        await new AxeBuilder({ page })
          .include('#journey-intelligence')
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await workspace.screenshot({
      path: `artifacts/cycle6/voice-draft-${info.project.name}-${company.slug}.png`,
    });
    await editor
      .getByRole('button', { name: 'Save estimate draft', exact: true })
      .click();
    await expect(editor).toContainText('Saved revision 2');
    await expect(
      editor.getByRole('textbox', { name: /^Scope item \d+$/ }),
    ).toHaveCount(before + 1);
    await expect(notes).toHaveValue(
      'Private working note retained through voice review.',
    );
    await expect(
      editor.getByRole('button', {
        name: /Issue internal snapshot|Approve job baseline/,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Send estimate|Pay now|Dispatch now/i }),
    ).toHaveCount(0);
  });

for (const company of sampleCompanies)
  test(`owner cost evidence retains priorities and opens the exact financial review / ${company.slug}`, async ({
    page,
  }, info) => {
    await page.goto('/preview/contractor-journey');
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    const confirmation = page.getByLabel(
      'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
    );
    await confirmation.check();
    await page
      .getByRole('button', { name: 'Prepare local synthetic journey' })
      .click();
    const context = page.getByRole('region', {
      name: 'Exact shared journey context',
      exact: true,
    });
    await expect(context).toBeVisible();
    const job = await context
      .locator('dt')
      .filter({ hasText: /^Job$/ })
      .locator('+ dd')
      .innerText();
    const originalContext = await context.innerText();
    const daily = page.getByRole('region', {
      name: 'Daily operating priorities',
      exact: true,
    });
    await daily
      .getByLabel(
        'I confirm this exact local job and day context for read-only staff review.',
      )
      .check();
    await daily
      .getByRole('button', { name: 'Review daily priorities', exact: true })
      .click();
    const area = daily.getByRole('combobox', {
      name: 'Review area',
      exact: true,
    });
    await expect(area).toBeVisible();
    await area.selectOption('finance');
    const query = daily.getByLabel('Search available cards', { exact: true });
    await query.fill('coverage');
    const originalPriorities = await daily
      .locator('.daily-operations-cards')
      .innerText();
    await page
      .getByLabel('Include literal voice-transcript and trade review')
      .check();
    const transcript = page.getByRole('textbox', {
      name: 'Literal synthetic transcript',
      exact: true,
    });
    const retainedText =
      'Review the recorded labor coverage before planning more work.';
    await transcript.fill(retainedText);
    const owner = page.getByRole('region', {
      name: 'Owner job cost evidence',
      exact: true,
    });
    await owner
      .getByRole('button', {
        name: "Inspect this job's cost coverage",
        exact: true,
      })
      .click();
    await expect(
      owner.getByRole('heading', { name: 'Job cost variance', exact: true }),
    ).toBeVisible();
    await expect(owner).toContainText(job);
    await expect(owner).toContainText('UNKNOWN — totals withheld');
    await expect(owner).toContainText(
      'Missing exact issued, job or labor coverage evidence',
    );
    const floor = owner.getByRole('textbox', {
      name: 'Minimum projected margin (%)',
      exact: true,
    });
    await floor.fill('25.5');
    await owner
      .getByRole('button', { name: 'Hide owner cost details', exact: true })
      .click();
    await expect(floor).not.toBeVisible();
    await owner
      .getByRole('button', { name: 'Show owner cost details', exact: true })
      .click();
    await expect(floor).toHaveValue('25.5');
    expect(
      (
        await new AxeBuilder({ page })
          .include('#journey-intelligence')
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await owner.screenshot({
      path: `artifacts/cycle6/owner-cost-${info.project.name}-${company.slug}.png`,
    });
    await owner
      .getByRole('button', {
        name: "Open this job's financial review",
        exact: true,
      })
      .click();
    await expect(page.locator('#journey-finance')).toBeFocused();
    await expect(
      page.locator('#journey-finance').getByRole('heading', {
        name: 'Costs, margin & invoice preparation',
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator('#journey-finance')).toContainText('NO_GO');
    await expect(page.locator('#journey-finance')).toContainText(job);
    await expect(area).toHaveValue('finance');
    await expect(query).toHaveValue('coverage');
    expect(await daily.locator('.daily-operations-cards').innerText()).toBe(
      originalPriorities,
    );
    await expect(transcript).toHaveValue(retainedText);
    await expect(floor).toHaveValue('25.5');
    expect(await context.innerText()).toBe(originalContext);
    await confirmation.uncheck();
    await expect(owner).toHaveCount(0);
    await expect(daily).toHaveCount(0);
  });

for (const company of sampleCompanies)
  test(`Sales issued scope and job plan retain agreement context / ${company.slug}`, async ({
    page,
  }, info) => {
    await page.goto('/preview/contractor-journey');
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    const confirmation = page.getByLabel(
      'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
    );
    await confirmation.check();
    await page
      .getByRole('button', { name: 'Prepare local synthetic journey' })
      .click();
    const context = page.getByRole('region', {
      name: 'Exact shared journey context',
    });
    await expect(context).toBeVisible();
    const originalContext = await context.innerText();
    const originalJob = await context
      .locator('dt')
      .filter({ hasText: /^Job$/ })
      .locator('+ dd')
      .innerText();
    await page
      .getByRole('button', { name: 'Review exact lead and issued estimate' })
      .click();
    const sales = page.getByRole('region', {
      name: 'Lead to contract preparation',
      exact: true,
    });
    const retainedCheck = sales.getByRole('checkbox').first();
    await retainedCheck.check();
    const planning = page.getByRole('region', {
      name: 'Sales issued scope and job planning',
      exact: true,
    });
    await planning
      .getByRole('button', {
        name: 'Review issued estimate & job plan',
        exact: true,
      })
      .click();
    const source = planning.getByRole('region', {
      name: 'Issued estimate and job source review',
    });
    await expect(
      source.getByRole('heading', { name: 'Original issued job scope' }),
    ).toBeVisible();
    await expect(source.getByText(originalJob, { exact: false })).toBeVisible();
    const version = await source
      .locator('dt')
      .filter({ hasText: 'Issued version ID / number' })
      .locator('+ dd')
      .innerText();
    expect(originalContext).toContain(version.split(' / ')[0]);
    const originalSelection = await planning.getByRole('status').innerText();
    await source
      .locator('button:not(:disabled)')
      .filter({ hasText: /^Inspect job visit / })
      .first()
      .click();
    await expect(planning.getByRole('status')).not.toHaveText(
      originalSelection,
    );
    await expect(
      source.getByRole('heading', { name: 'Original issued job scope' }),
    ).toBeVisible();
    await expect(retainedCheck).toBeChecked();
    expect(await context.innerText()).toBe(originalContext);
    await expect(
      sales.getByRole('region', {
        name: 'Linked staff contract review snapshot',
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      (await new AxeBuilder({ page }).include('#journey-sales').analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await planning.screenshot({
      path: `artifacts/cycle6/sales-job-plan-${info.project.name}-${company.slug}.png`,
    });
    await confirmation.uncheck();
    await expect(planning).toHaveCount(0);
    await expect(context).toHaveCount(0);
  });

for (const company of sampleCompanies)
  test(`existing-engine journey / ${company.slug}`, async ({ page }, info) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (
        !r.url().startsWith('http://127.0.0.1:4206') &&
        !r.url().startsWith('data:')
      )
        external.push(r.url());
    });
    await page.goto('/preview/contractor-journey');
    await expect(
      page.getByRole('heading', { name: 'Connected contractor journey' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Prepare local synthetic journey' }),
    ).toBeDisabled();
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    await page
      .getByLabel(
        'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
      )
      .check();
    await page
      .getByRole('button', { name: 'Prepare local synthetic journey' })
      .click();
    await expect(
      page.getByRole('region', { name: 'Exact shared journey context' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Review exact lead and issued estimate' })
      .click();
    await expect(
      page.getByRole('region', { name: 'Originating lead', exact: true }),
    ).toBeVisible();
    const sales = page.getByRole('region', {
      name: 'Lead to contract preparation',
      exact: true,
    });
    for (const box of await sales.getByRole('checkbox').all())
      await box.check();
    await sales
      .getByRole('button', {
        name: 'Prepare linked staff contract review',
        exact: true,
      })
      .click();
    await expect(
      sales.getByRole('region', {
        name: 'Linked staff contract review snapshot',
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel('I confirm this local job evidence review.').check();
    await page
      .getByRole('button', { name: 'Load current job evidence', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Published inspection reports',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Open original report v1', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Original published report',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Review Proof of Work', exact: true })
      .click();
    await expect(page.locator('#journey-customer')).toBeFocused();
    await page
      .getByRole('button', {
        name: 'Review linked property documentation',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Open exact published report', exact: true })
      .click();
    await page
      .getByLabel(
        'I reviewed the exact linked report and issued job scope; prepare a documentation-only pack.',
      )
      .check();
    await page
      .getByRole('button', {
        name: 'Prepare linked documentation pack',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('region', {
        name: 'Linked immutable documentation pack',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Review costs and invoice preparation' })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Costs, margin & invoice preparation',
      }),
    ).toBeVisible();
    await page
      .getByLabel('I confirm this local maintenance planning review.')
      .check();
    await page
      .getByRole('button', {
        name: 'Load maintenance opportunities',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Published maintenance observations',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .locator('button:not(:disabled)')
      .filter({ hasText: 'Prepare staff visit proposal' })
      .first()
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Immutable staff planning preview',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel('Include literal voice-transcript and trade review')
      .check();
    await page
      .getByLabel('Literal synthetic transcript')
      .fill(
        'Inspect the exterior joint; record measured scope for human review.',
      );
    await page
      .getByLabel('Human-selected trade edition')
      .selectOption('property_services');
    await page
      .getByLabel(
        'I confirm review-only suggestions for this exact saved source.',
      )
      .check();
    await page
      .getByRole('button', {
        name: 'Prepare source-linked Copilot review',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Review priorities', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Synthetic transcript review',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Inspect exact retained Copilot review',
        exact: true,
      })
      .click();
    await expect(
      page.getByText('Retained review: CURRENT_LOCAL_SOURCE', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('PRIVATE', { exact: false })).toHaveCount(0);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    expect(external).toEqual([]);
    await page.locator('#journey-customer').screenshot({
      path: `artifacts/cycle6/packet-${info.project.name}-${company.slug}.png`,
    });
    await page.screenshot({
      path: `artifacts/cycle6/journey-${info.project.name}-${company.slug}.png`,
      fullPage: true,
    });
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(sampleCompanies.find((c) => c.id !== company.id)!.id);
    await expect(
      page.getByRole('region', { name: 'Exact shared journey context' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', {
        name: 'Costs, margin & invoice preparation',
      }),
    ).toHaveCount(0);
  });
test('confirmation withdrawal hides old workflow sources', async ({ page }) => {
  await page.goto('/preview/contractor-journey');
  const confirmation = page.getByLabel(
    'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
  );
  await confirmation.check();
  await page
    .getByRole('button', { name: 'Prepare local synthetic journey' })
    .click();
  await expect(
    page.getByRole('region', { name: 'Exact shared journey context' }),
  ).toBeVisible();
  await confirmation.uncheck();
  await expect(
    page.getByRole('region', { name: 'Exact shared journey context' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Prepare local synthetic journey' }),
  ).toBeDisabled();
});
test('rapid confirmation withdrawal cannot resurrect a pending preparation', async ({
  page,
}) => {
  await page.goto('/preview/contractor-journey');
  const confirmation = page.getByLabel(
    'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
  );
  await confirmation.check();
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Prepare local synthetic journey',
    )!;
    const box = document.querySelector(
      '.journey-controls input[type=checkbox]',
    ) as HTMLInputElement;
    button.click();
    box.click();
    box.click();
  });
  await expect(
    page.getByText('Preparation UNKNOWN — no replay.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Exact shared journey context' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Prepare local synthetic journey' }),
  ).toBeDisabled();
});
