import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { sampleCompanies } from '../../src/domain/platform';
import { industryEstimate } from '../../src/domain/estimating/fixtures';

for (const company of sampleCompanies)
  test(`crew readiness evaluates hours scope materials and retains proposal / ${company.slug}`, async ({
    page,
  }) => {
    await page.goto('/preview/contractor-journey');
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    const global = page.getByLabel(
      'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
    );
    await global.check();
    await page
      .getByRole('button', {
        name: 'Prepare local synthetic journey',
        exact: true,
      })
      .click();
    const r = page.getByRole('region', {
      name: 'Crew day and job readiness review',
      exact: true,
    });
    await r
      .getByLabel('Readiness proposed start', { exact: true })
      .fill('09:00');
    await r.getByLabel('Readiness proposed end', { exact: true }).fill('12:00');
    await r
      .getByLabel('Readiness proposed working hours start', { exact: true })
      .fill('10:00');
    await r
      .getByLabel('Readiness proposed working hours end', { exact: true })
      .fill('11:00');
    const note = r.getByRole('textbox', {
      name: 'Unfinished readiness notes',
      exact: true,
    });
    await note.fill('Need customer confirmation and exact material receipt.');
    const confirm = r.getByLabel(
      'I confirm this proposed workday for read-only readiness evaluation.',
    );
    await confirm.check();
    await r
      .getByRole('button', {
        name: 'Evaluate exact job readiness',
        exact: true,
      })
      .click();
    await expect(r).toContainText('OUTSIDE PROPOSED HOURS');
    await expect(r).toContainText('120 minutes');
    await expect(r).toContainText(
      'Supplier quote and material receipt UNKNOWN',
    );
    await expect(r).toContainText('operational readiness UNKNOWN');
    await r
      .getByRole('button', {
        name: 'Recheck exact retained crew readiness',
        exact: true,
      })
      .click();
    await expect(r).toContainText('Captured source rechecked');
    await r.getByLabel('Readiness proposed end', { exact: true }).fill('13:00');
    await expect(confirm).not.toBeChecked();
    await expect(
      r.getByRole('button', {
        name: 'Evaluate exact job readiness',
        exact: true,
      }),
    ).toBeDisabled();
    await expect(r).toContainText('inputs changed');
    await confirm.check();
    await r
      .getByRole('button', {
        name: 'Evaluate exact job readiness',
        exact: true,
      })
      .click();
    await expect(r).toContainText('180 minutes');
    await expect(note).toHaveValue(
      'Need customer confirmation and exact material receipt.',
    );
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
      r.getByRole('button', { name: /Assign|Book|Dispatch|Send|Pay/ }),
    ).toHaveCount(0);
    await global.uncheck();
    await expect(r).toHaveCount(0);
  });

for (const company of sampleCompanies)
  test(`trade checklist retains exact job scope and unfinished review / ${company.slug}`, async ({
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
    await page
      .getByLabel('Include literal voice-transcript and trade review')
      .check();
    await page
      .getByRole('textbox', {
        name: 'Literal synthetic transcript',
        exact: true,
      })
      .fill('Review measurements manually.');
    await page
      .getByRole('combobox', {
        name: 'Human-selected trade edition',
        exact: true,
      })
      .selectOption('roofing');
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
    const r = page.getByRole('region', {
      name: 'Trade checklist and exact job scope',
      exact: true,
    });
    const note = r.getByRole('textbox', {
      name: 'Unfinished trade review notes',
      exact: true,
    });
    await note.fill('Keep pending site measurements.');
    const filter = r.getByRole('textbox', {
      name: 'Filter recorded trade scope',
      exact: true,
    });
    await filter.fill('');
    await r
      .getByRole('button', {
        name: 'Open retained trade checklist beside job scope',
        exact: true,
      })
      .click();
    await expect(r).toContainText('Documented issued requirements');
    await expect(r).toContainText('NOT_REVIEWED');
    await expect(r).toContainText('roofing');
    await filter.fill('retain my filter');
    await r
      .getByRole('button', {
        name: 'Open exact estimating and job-planning review',
        exact: true,
      })
      .click();
    await expect(page.locator('#journey-sales')).toBeFocused();
    await r
      .getByRole('button', {
        name: 'Open exact trade job in Field',
        exact: true,
      })
      .click();
    await expect(page.locator('#journey-field')).toBeFocused();
    await expect(note).toHaveValue('Keep pending site measurements.');
    await expect(filter).toHaveValue('retain my filter');
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
    await expect(
      r.getByRole('button', {
        name: 'Open retained trade checklist beside job scope',
        exact: true,
      }),
    ).toBeDisabled();
    await expect(note).toHaveValue('Keep pending site measurements.');
    await confirm.uncheck();
    await expect(r).toHaveCount(0);
  });

for (const company of sampleCompanies)
  test(`network review retains job trade filters and notes / ${company.slug}`, async ({
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
      name: 'Network and exact subcontractor requirements',
      exact: true,
    });
    const note = r.getByRole('textbox', {
      name: 'Unfinished partner review notes',
      exact: true,
    });
    await note.fill('Need independent insurance and license evidence.');
    const trade = r.getByRole('combobox', {
      name: 'Partner review trade context',
      exact: true,
    });
    await trade.selectOption('roofing');
    const filter = r.getByRole('textbox', {
      name: 'Filter existing contractor references',
      exact: true,
    });
    await filter.fill('Retain this filter');
    await r
      .getByRole('button', {
        name: 'Review exact job and contractor references',
        exact: true,
      })
      .click();
    await expect(r).toContainText('No recorded contractor profiles');
    await expect(r).toContainText('Documented labor/service requirements');
    await r
      .getByRole('button', {
        name: 'Open exact job and crew review',
        exact: true,
      })
      .click();
    await expect(page.locator('#journey-field')).toBeFocused();
    await expect(note).toHaveValue(
      'Need independent insurance and license evidence.',
    );
    await expect(trade).toHaveValue('roofing');
    await expect(filter).toHaveValue('Retain this filter');
    await expect(
      r.getByRole('button', {
        name: /Invite|Assign|Contract|Dispatch|Send|Pay/,
      }),
    ).toHaveCount(0);
    expect(
      (await new AxeBuilder({ page }).include('#journey-field').analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await confirm.uncheck();
    await expect(r).toHaveCount(0);
  });

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

for (const company of sampleCompanies)
  test(`catalog batch prepares and saves actual draft scope without duplicate entry / ${company.slug}`, async ({
    page,
  }) => {
    await page.goto('/preview');
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(company.id);
    await page.getByRole('button', { name: 'Estimates', exact: true }).click();
    const project = industryEstimate(company, 'unused').project.name;
    await page.getByRole('button').filter({ hasText: project }).click();
    const before = await page
      .getByRole('textbox', { name: /^Scope item \d+$/ })
      .count();
    const original = await page
      .getByLabel('Scope item 1', { exact: true })
      .inputValue();
    await page
      .getByRole('textbox', { name: 'Private estimate notes', exact: true })
      .fill('Keep private catalog batch notes');
    await page.getByText('Add several catalog items', { exact: true }).click();
    const batch = page.locator('details').filter({
      has: page.getByText('Add several catalog items', { exact: true }),
    });
    const choices = batch.getByRole('checkbox', {
      name: /^Select .* for draft$/,
    });
    await choices.nth(0).check();
    await choices.nth(1).check();
    const quantities = batch.getByRole('textbox', {
      name: /^Draft quantity for /,
    });
    await expect(quantities.nth(0)).toHaveValue('');
    await quantities.nth(0).fill('2.125');
    await quantities.nth(1).fill('3');
    await batch
      .getByLabel('Find catalog items for draft')
      .fill('no matching catalog record');
    await expect(batch).toContainText('2 selected');
    await batch.getByLabel('Find catalog items for draft').fill('');
    await expect(quantities.nth(0)).toHaveValue('2.125');
    await batch
      .getByRole('checkbox', {
        name: 'I confirm the selected catalog items and quantities for this draft.',
      })
      .check();
    await batch
      .getByRole('button', { name: 'Add selected catalog items to draft' })
      .evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });
    await expect(
      page.getByRole('textbox', { name: /^Scope item \d+$/ }),
    ).toHaveCount(before + 2);
    await expect(page.getByLabel('Scope item 1', { exact: true })).toHaveValue(
      original,
    );
    await expect(
      page.getByLabel(`Quantity ${before + 1}`, { exact: true }),
    ).toHaveValue('2.125');
    await expect(batch.getByRole('status')).toContainText(
      '2 catalog items added',
    );
    await expect(
      batch.getByRole('button', {
        name: 'Add selected catalog items to draft',
      }),
    ).toBeDisabled();
    await page
      .getByRole('button', { name: 'Save estimate draft', exact: true })
      .click();
    await expect(page.getByText(/Saved revision 2/)).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: /^Scope item \d+$/ }),
    ).toHaveCount(before + 2);
    await expect(
      page.getByRole('textbox', {
        name: 'Private estimate notes',
        exact: true,
      }),
    ).toHaveValue('Keep private catalog batch notes');
    await page
      .getByRole('button', { name: 'Customer preview', exact: true })
      .click();
    const preview = page.getByRole('region', {
      name: 'Customer-facing estimate preview',
    });
    await expect(preview).not.toContainText('Keep private catalog batch notes');
    await expect(preview).not.toContainText('Internal unit cost');
    await page
      .getByRole('button', { name: 'All estimates', exact: true })
      .click();
    await page.getByRole('button').filter({ hasText: project }).click();
    await expect(
      page.getByRole('textbox', { name: /^Scope item \d+$/ }),
    ).toHaveCount(before + 2);
    await expect(
      page.getByLabel(`Quantity ${before + 1}`, { exact: true }),
    ).toHaveValue('2.125');
    await expect(
      page.getByRole('textbox', {
        name: 'Private estimate notes',
        exact: true,
      }),
    ).toHaveValue('Keep private catalog batch notes');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });

for (const company of sampleCompanies)
  test(`selected draft quantities and removal save reopen and preserve remaining scope / ${company.slug}`, async ({
    page,
  }) => {
    await page.goto('/preview');
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(company.id);
    await page.getByRole('button', { name: 'Estimates', exact: true }).click();
    const project = industryEstimate(company, 'unused').project.name;
    await page.getByRole('button').filter({ hasText: project }).click();
    const items = page.getByRole('textbox', { name: /^Scope item \d+$/ });
    const descriptions = await items.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLInputElement).value),
    );
    const form = page.getByRole('region', {
      name: 'Edit multiple draft items',
    });
    const note = page.getByRole('textbox', {
      name: 'Private estimate notes',
      exact: true,
    });
    await note.fill('Keep these private working notes');
    await page.getByLabel('Quantity 3', { exact: true }).fill('9.');
    await page
      .getByLabel('Select scope item 1 for bulk edit', { exact: true })
      .check();
    await page
      .getByLabel('Select scope item 2 for bulk edit', { exact: true })
      .check();
    await form.getByLabel('Quantity for selected scope items').fill('2.125');
    const confirmation = form.getByLabel(
      'I confirm this edit to the selected working-draft items.',
    );
    await confirmation.check();
    await note.fill('Keep these newer private working notes');
    await note.fill('Keep these private working notes');
    await expect(confirmation).not.toBeChecked();
    await note.fill('Keep these newer private working notes');
    await expect(confirmation).not.toBeChecked();
    await expect(
      form.getByRole('button', {
        name: 'Update selected quantities',
        exact: true,
      }),
    ).toBeDisabled();
    await confirmation.check();
    await form
      .getByRole('button', { name: 'Update selected quantities', exact: true })
      .evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });
    await expect(page.getByLabel('Quantity 1', { exact: true })).toHaveValue(
      '2.125',
    );
    await expect(page.getByLabel('Quantity 2', { exact: true })).toHaveValue(
      '2.125',
    );
    await expect(page.getByLabel('Quantity 3', { exact: true })).toHaveValue(
      '9.',
    );
    await expect(items).toHaveCount(descriptions.length);
    await page
      .getByRole('button', { name: 'Save estimate draft', exact: true })
      .click();
    await expect(page.getByText(/Saved revision 2/)).toBeVisible();
    await page
      .getByRole('button', { name: 'All estimates', exact: true })
      .click();
    await page.getByRole('button').filter({ hasText: project }).click();
    await expect(page.getByLabel('Quantity 1', { exact: true })).toHaveValue(
      '2.125',
    );
    await expect(page.getByLabel('Quantity 2', { exact: true })).toHaveValue(
      '2.125',
    );
    await page
      .getByLabel('Select scope item 1 for bulk edit', { exact: true })
      .check();
    await page
      .getByLabel('Select scope item 2 for bulk edit', { exact: true })
      .check();
    await form.getByLabel('Selected scope action').selectOption('remove');
    if (company.id === 'sample-roofing') {
      await confirmation.check();
      await form
        .getByRole('button', {
          name: 'Remove selected scope items',
          exact: true,
        })
        .click();
      await expect(form.getByRole('status')).toContainText(
        'Each option needs at least one scope item',
      );
      await expect(items).toHaveCount(descriptions.length);
      await page
        .getByLabel('Select scope item 2 for bulk edit', { exact: true })
        .uncheck();
    }
    const removedCount = company.id === 'sample-roofing' ? 1 : 2;
    await confirmation.check();
    await form
      .getByRole('button', { name: 'Remove selected scope items', exact: true })
      .evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });
    await expect(items).toHaveCount(descriptions.length - removedCount);
    expect(
      await items.evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLInputElement).value),
      ),
    ).toEqual(descriptions.slice(removedCount));
    await page
      .getByRole('button', { name: 'Save estimate draft', exact: true })
      .click();
    await expect(page.getByText(/Saved revision 3/)).toBeVisible();
    await page
      .getByRole('button', { name: 'All estimates', exact: true })
      .click();
    await page.getByRole('button').filter({ hasText: project }).click();
    await expect(items).toHaveCount(descriptions.length - removedCount);
    expect(
      await items.evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLInputElement).value),
      ),
    ).toEqual(descriptions.slice(removedCount));
    await expect(note).toHaveValue('Keep these newer private working notes');
    await form
      .getByRole('button', {
        name: 'Select all editable scope items',
        exact: true,
      })
      .click();
    await form.getByLabel('Selected scope action').selectOption('remove');
    await confirmation.check();
    await form
      .getByRole('button', { name: 'Remove selected scope items', exact: true })
      .click();
    await expect(form.getByRole('status')).toContainText(
      'Keep at least one scope item',
    );
    await expect(items).toHaveCount(descriptions.length - removedCount);
    await expect(page.getByText(/Saved revision 3/)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });

for (const company of sampleCompanies)
  test(`reported material evidence submits once and reopens pending review / ${company.slug}`, async ({
    page,
  }) => {
    await page.goto('/preview');
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(company.id);
    await page.getByRole('button', { name: 'Jobs', exact: true }).click();
    const jobPicker = page.getByRole('combobox', {
      name: 'Financial job',
      exact: true,
    });
    const jobId = await jobPicker.inputValue();
    const source = industryEstimate(company, 'unused');
    const line = source.lines.find(
      (l) =>
        ['material', 'product', 'allowance'].includes(l.kind) &&
        (!l.option_id ||
          source.options.find((o) => o.id === l.option_id)?.selected),
    )!;
    await page
      .getByText('Record expense, commitment or credit', { exact: true })
      .click();
    const form = page.locator('form').filter({
      has: page.getByRole('button', {
        name: 'Submit for expense review',
        exact: true,
      }),
    });
    const description = `Reported material evidence ${company.slug}`;
    for (const [label, value] of Object.entries({
      'Purchase link key': `SYNTHETIC-PO-${company.slug}`,
      'Supplier / payee': 'Synthetic material supplier',
      'Unique supplier document reference': `SYNTHETIC-DOC-${company.slug}`,
      'Expense description': description,
      'Expense amount (USD minor units)': '12345',
      'Reported material quantity': '1.0001',
      'Reported material unit cost (USD minor units)': '0',
    }))
      await form
        .getByLabel(label, { exact: !label.startsWith('Reported material') })
        .fill(value);
    await form
      .getByRole('combobox', { name: 'Expense record type', exact: true })
      .selectOption('commitment');
    const match = form.getByRole('combobox', {
      name: 'Manual original budget match',
      exact: true,
    });
    const lineId = await match
      .getByRole('option', {
        name: `${line.description} · ${line.unit}`,
        exact: true,
      })
      .getAttribute('value');
    await match.selectOption(lineId!);
    await form
      .getByRole('combobox', { name: 'Reported material unit', exact: true })
      .selectOption(line.unit);
    await form
      .getByRole('button', { name: 'Submit for expense review', exact: true })
      .click();
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Use at most 3 decimal places' }),
    ).toBeVisible();
    await expect(
      page.locator('.expense-record').filter({ hasText: description }),
    ).toHaveCount(0);
    await expect(
      form.getByLabel('Unique supplier document reference', { exact: true }),
    ).toHaveValue(`SYNTHETIC-DOC-${company.slug}`);
    await form
      .getByLabel('Reported material quantity', { exact: false })
      .fill('2.125');
    await form
      .getByRole('button', { name: 'Submit for expense review', exact: true })
      .evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });
    const record = page
      .locator('.expense-record')
      .filter({ hasText: description });
    await expect(record).toHaveCount(1);
    await expect(record).toContainText('Reported material quantity: 2.125');
    await expect(record).toContainText(`unit: ${line.unit}`);
    await expect(record).toContainText('unit cost: $0.00');
    await expect(record).toContainText('Awaiting management review');
    await expect(record).toContainText('Manually matched to original budget');
    await page.getByRole('button', { name: 'Estimates', exact: true }).click();
    await page.getByRole('button', { name: 'Jobs', exact: true }).click();
    await jobPicker.selectOption(jobId);
    await expect(record).toHaveCount(1);
    await expect(record).toContainText('Reported material quantity: 2.125');
    await expect(record).toContainText('unit cost: $0.00');
    await expect(record).toContainText('Awaiting management review');
    await page
      .getByText('Record expense, commitment or credit', { exact: true })
      .click();
    expect(
      (await new AxeBuilder({ page }).include('.operational-form').analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });

for (const company of sampleCompanies)
  test(`expense management records reason and decision with cost propagation and reopen / ${company.slug}`, async ({
    page,
  }) => {
    await page.goto('/preview');
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(company.id);
    await page.getByRole('button', { name: 'Jobs', exact: true }).click();
    const picker = page.getByRole('combobox', {
      name: 'Financial job',
      exact: true,
    });
    const jobId = await picker.inputValue();
    const materialRow = page
      .getByRole('region', {
        name: 'Scrollable financial comparison',
        exact: true,
      })
      .getByRole('row')
      .filter({
        has: page.getByRole('rowheader', { name: 'materials', exact: true }),
      });
    const commitment = () => materialRow.getByRole('cell').nth(3);
    const initial = Number(
      (await commitment().innerText()).replace(/[^0-9.-]/g, ''),
    );
    async function submit(suffix: string) {
      await page
        .getByText('Record expense, commitment or credit', { exact: true })
        .click();
      const form = page.locator('form').filter({
        has: page.getByRole('button', {
          name: 'Submit for expense review',
          exact: true,
        }),
      });
      for (const [label, value] of Object.entries({
        'Purchase link key': `REVIEW-${suffix}`,
        'Supplier / payee': 'Synthetic management supplier',
        'Unique supplier document reference': `REVIEW-${suffix}`,
        'Expense description': `Management materials ${suffix}`,
        'Expense amount (USD minor units)': '12345',
      }))
        await form.getByLabel(label, { exact: true }).fill(value);
      await form
        .getByRole('combobox', { name: 'Expense record type', exact: true })
        .selectOption('commitment');
      await form
        .getByRole('button', { name: 'Submit for expense review', exact: true })
        .click();
      return page
        .locator('.expense-record')
        .filter({ hasText: `Management materials ${suffix}` });
    }
    const approved = await submit('approve');
    const button = approved.getByRole('button', {
      name: 'Record expense review',
      exact: true,
    });
    await button.click();
    await expect(approved.getByRole('status')).toContainText(
      'Confirm this exact submission',
    );
    await approved
      .getByRole('textbox', { name: 'Expense review reason', exact: true })
      .fill('Original supplier evidence reviewed for materials');
    const confirm = approved.getByRole('checkbox');
    await confirm.check();
    await approved
      .getByRole('textbox', { name: 'Expense review reason', exact: true })
      .fill('Original supplier evidence reviewed for materials and quantity');
    await expect(confirm).not.toBeChecked();
    await confirm.check();
    expect(
      (await new AxeBuilder({ page }).include('.expense-record').analyze())
        .violations,
    ).toEqual([]);
    await button.evaluate((node: HTMLButtonElement) => {
      node.click();
      node.click();
    });
    await expect(approved).toContainText(
      'Management review: Original supplier evidence reviewed for materials and quantity',
    );
    await expect(
      approved.getByRole('button', {
        name: 'Record expense review',
        exact: true,
      }),
    ).toHaveCount(0);
    const expected = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(initial + 123.45);
    await expect(commitment()).toHaveText(expected);
    const rejected = await submit('reject');
    await rejected
      .getByRole('combobox', { name: 'Expense review decision', exact: true })
      .selectOption('rejected');
    await rejected
      .getByRole('textbox', { name: 'Expense review reason', exact: true })
      .fill('Supplier evidence incomplete; correction required');
    await rejected.getByRole('checkbox').check();
    await rejected
      .getByRole('button', { name: 'Record expense review', exact: true })
      .click();
    await expect(rejected).toContainText('rejected');
    await expect(rejected).toContainText(
      'Management review: Supplier evidence incomplete; correction required',
    );
    await expect(commitment()).toHaveText(expected);
    await page.getByRole('button', { name: 'Estimates', exact: true }).click();
    await page.getByRole('button', { name: 'Jobs', exact: true }).click();
    await picker.selectOption(jobId);
    await expect(approved).toHaveCount(1);
    await expect(approved).toContainText(
      'Management review: Original supplier evidence reviewed for materials and quantity',
    );
    await expect(rejected).toContainText(
      'Management review: Supplier evidence incomplete; correction required',
    );
    await expect(commitment()).toHaveText(expected);
    await expect(
      page.getByText('Projected contribution · incomplete costs', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });

for (const [brand, company] of sampleCompanies.entries()) {
  test(`job forecast resolves real form conflicts before original Save and reopen / ${company.slug}`, async ({
    page,
  }) => {
    await page.goto(`/preview-job-forecast-test.html?brand=${brand}`);
    await page
      .getByText('Update remaining costs & warning thresholds', { exact: true })
      .click();
    await page
      .getByLabel('Remaining materials', { exact: true })
      .fill('111.11');
    await page
      .getByRole('button', {
        name: 'Simulate independent forecast save',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Other actor saved' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Save job forecast', exact: true })
      .click();
    const conflict = page.getByRole('group', {
      name: 'Resolve job forecast changes',
      exact: true,
    });
    await expect(conflict).toBeVisible();
    await page
      .getByRole('button', { name: 'Read writer call count', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Writer calls: 0' }),
    ).toBeVisible();
    await conflict.getByRole('checkbox').check();
    await conflict
      .getByRole('button', {
        name: 'Apply reviewed forecast changes',
        exact: true,
      })
      .click();
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Choose the saved or entered value' }),
    ).toBeVisible();
    await conflict
      .getByRole('combobox', {
        name: 'Resolve remaining materials',
        exact: true,
      })
      .selectOption('entered');
    await expect(conflict.getByRole('checkbox')).not.toBeChecked();
    await conflict.getByRole('checkbox').check();
    expect(
      (await new AxeBuilder({ page }).include('.operational-form').analyze())
        .violations,
    ).toEqual([]);
    await conflict
      .getByRole('button', {
        name: 'Apply reviewed forecast changes',
        exact: true,
      })
      .click();
    await expect(conflict).toHaveCount(0);
    await expect(
      page.getByLabel('Remaining materials', { exact: true }),
    ).toHaveValue('111.11');
    await expect(
      page.getByLabel('Remaining equipment', { exact: true }),
    ).toHaveValue('3.33');
    await expect(
      page.getByRole('checkbox', { name: /Management confirms all job costs/ }),
    ).not.toBeChecked();
    await page
      .getByRole('button', { name: 'Save job forecast', exact: true })
      .evaluate((node: HTMLButtonElement) => {
        node.click();
        node.click();
      });
    await page
      .getByRole('button', { name: 'Read writer call count', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Writer calls: 1' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Toggle job workspace', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Toggle job workspace', exact: true })
      .click();
    await page
      .getByText('Update remaining costs & warning thresholds', { exact: true })
      .click();
    await expect(
      page.getByLabel('Remaining materials', { exact: true }),
    ).toHaveValue('111.11');
    await expect(
      page.getByLabel('Remaining equipment', { exact: true }),
    ).toHaveValue('3.33');
    await expect(
      page.getByText('Projected contribution · incomplete costs', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });
  test(`job forecast UNKNOWN remains read-only after reopening / ${company.slug}`, async ({
    page,
  }) => {
    await page.goto(`/preview-job-forecast-test.html?brand=${brand}`);
    await page
      .getByText('Update remaining costs & warning thresholds', { exact: true })
      .click();
    await page
      .getByLabel('Remaining materials', { exact: true })
      .fill('123.45');
    await page
      .getByRole('button', {
        name: 'Simulate lost forecast acknowledgment',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Save job forecast', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Forecast outcome UNKNOWN' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Save job forecast', exact: true }),
    ).toBeDisabled();
    await page
      .getByRole('button', { name: 'Toggle job workspace', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Toggle job workspace', exact: true })
      .click();
    await page
      .getByText('Update remaining costs & warning thresholds', { exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Save job forecast', exact: true }),
    ).toBeDisabled();
    await page
      .getByRole('button', { name: 'Read exact saved forecast', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Exact saved job revision' }),
    ).toContainText('materials $123.45');
    await page
      .getByRole('button', { name: 'Read writer call count', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Writer calls: 1' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Save job forecast', exact: true }),
    ).toBeDisabled();
  });
}

test('job forecast cancels delayed writes after navigation or a peer UNKNOWN hold', async ({
  page,
}) => {
  for (const mode of ['navigation', 'unknown']) {
    await page.goto('/preview-job-forecast-test.html');
    await page
      .getByText('Update remaining costs & warning thresholds', { exact: true })
      .click();
    await page.getByLabel('Remaining materials', { exact: true }).fill('99.99');
    await page
      .getByRole('button', { name: 'Pause next forecast read', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Save job forecast', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Save job forecast', exact: true }),
    ).toBeDisabled();
    if (mode === 'navigation')
      await page
        .getByRole('button', { name: 'Toggle job workspace', exact: true })
        .click();
    else
      await page
        .getByRole('button', { name: 'Simulate peer UNKNOWN', exact: true })
        .click();
    await page
      .getByRole('button', { name: 'Release forecast read', exact: true })
      .click();
    if (mode === 'navigation') {
      await page
        .getByRole('button', { name: 'Toggle job workspace', exact: true })
        .click();
      await expect(
        page.getByRole('heading', {
          name: 'Job financial dashboard',
          exact: true,
        }),
      ).toBeVisible();
    } else {
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: 'Forecast outcome UNKNOWN' }),
      ).toBeVisible();
    }
    await page
      .getByRole('button', { name: 'Read writer call count', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Writer calls: 0' }),
    ).toBeVisible();
  }
});

for (const company of sampleCompanies)
  test(`CRM customer creation admits one rapid submission and reopens exact record / ${company.slug}`, async ({
    page,
  }) => {
    await page.goto('/preview');
    await page
      .getByRole('combobox', { name: 'Company context', exact: true })
      .selectOption(company.id);
    await page.getByRole('button', { name: 'Customers', exact: true }).click();
    await page
      .getByRole('button', { name: 'New customer', exact: true })
      .click();
    const form = page.locator('form').filter({
      has: page.getByRole('button', { name: 'Create customer', exact: true }),
    });
    const name = `Fictional single submission ${company.slug}`;
    await form.getByLabel('Customer name', { exact: true }).fill(name);
    await form
      .getByLabel('Email', { exact: true })
      .fill(`single-${company.slug}@example.invalid`);
    const button = form.getByRole('button', {
      name: 'Create customer',
      exact: true,
    });
    await button.evaluate((node: HTMLButtonElement) => {
      node.form!.requestSubmit(node);
      node.form!.requestSubmit(node);
    });
    await page
      .getByRole('searchbox', { name: 'Search customers', exact: true })
      .fill(name);
    const row = page.locator('.record-button').filter({ hasText: name });
    await expect(row).toHaveCount(1);
    await row.click();
    const reopened = page.locator('form').filter({
      has: page.getByRole('button', { name: 'Update customer', exact: true }),
    });
    await expect(
      reopened.getByLabel('Customer name', { exact: true }),
    ).toHaveValue(name);
    await expect(reopened.getByLabel('Email', { exact: true })).toHaveValue(
      `single-${company.slug}@example.invalid`,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .include('.detail-panel fieldset')
          .analyze()
      ).violations,
    ).toEqual([]);
  });

test('CRM pending and UNKNOWN creation survives close/reopen and fences old-company callbacks', async ({
  page,
}) => {
  for (const mode of ['pause', 'before', 'after', 'company']) {
    await page.goto(
      `/preview-crm-create-test.html?mode=${mode === 'company' ? 'pause' : mode}`,
    );
    await page
      .getByRole('button', { name: 'New customer', exact: true })
      .click();
    const form = page.locator('form').filter({
      has: page.getByRole('button', {
        name: /Create customer|Working…/,
        exact: true,
      }),
    });
    await form
      .getByLabel('Customer name', { exact: true })
      .fill(`Fictional ${mode} creation`);
    await form
      .getByRole('button', { name: 'Create customer', exact: true })
      .click();
    if (mode === 'before' || mode === 'after')
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: 'Customer creation outcome UNKNOWN.' }),
      ).toBeVisible();
    if (mode === 'company')
      await page
        .getByRole('button', {
          name: 'Select other fixture company',
          exact: true,
        })
        .click();
    else {
      await page
        .getByRole('button', { name: 'Close details', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'New customer', exact: true })
        .click();
    }
    if (mode === 'pause' || mode === 'company') {
      if (mode === 'pause')
        await expect(
          form.getByRole('button', { name: 'Create customer', exact: true }),
        ).toBeDisabled();
      await page
        .getByRole('button', {
          name: 'Release pending customer acknowledgment',
          exact: true,
        })
        .click();
      await expect(
        form.getByRole('button', { name: 'Create customer', exact: true }),
      ).toBeEnabled();
      await expect(
        form.getByLabel('Customer name', { exact: true }),
      ).toHaveValue('');
    } else
      await expect(
        form.getByRole('button', { name: 'Create customer', exact: true }),
      ).toBeDisabled();
    await page
      .getByRole('button', { name: 'Read fixture writer count', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Writer calls: 1' }),
    ).toBeVisible();
    if (mode === 'after' || mode === 'before') {
      await page
        .getByRole('button', { name: 'Close details', exact: true })
        .click();
      await page
        .getByRole('searchbox', { name: 'Search customers', exact: true })
        .fill(`Fictional ${mode} creation`);
      await expect(
        page
          .locator('.record-button')
          .filter({ hasText: `Fictional ${mode} creation` }),
      ).toHaveCount(mode === 'after' ? 1 : 0);
      await page
        .getByRole('button', { name: 'New customer', exact: true })
        .click();
      await expect(
        form.getByRole('button', { name: 'Create customer', exact: true }),
      ).toBeDisabled();
    }
  }
});

for (const [brand, company] of sampleCompanies.entries())
  test(`payroll revocation removes retained preparation and export despite unchanged row counts / ${company.slug}`, async ({
    page,
  }) => {
    await page.goto(`/preview-workforce-authority-test.html?brand=${brand}`);
    await page
      .getByRole('button', { name: 'Payroll preparation', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Prepare earnings preview', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Export preparation CSV', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Revoke fixture payroll access',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Refresh timesheets', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Payroll preparation', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Export preparation CSV', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', {
        name: 'Lock payroll preparation period',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText('Payroll preparation · execution disabled', {
        exact: true,
      }),
    ).toHaveCount(0);
  });

test('payroll CSV requires fresh authority and delayed previews cannot revive revoked private results', async ({
  page,
}) => {
  await page.goto('/preview-workforce-authority-test.html');
  await page
    .getByRole('button', { name: 'Payroll preparation', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Prepare earnings preview', exact: true })
    .click();
  const exportButton = page.getByRole('button', {
    name: 'Export preparation CSV',
    exact: true,
  });
  await expect(exportButton).toBeVisible();
  const positive = page.waitForEvent('download');
  await exportButton.click();
  expect((await positive).suggestedFilename()).toBe('payroll-preparation.csv');
  const deniedDownloads: unknown[] = [];
  page.on('download', (d) => deniedDownloads.push(d));
  await page
    .getByRole('button', { name: 'Revoke fixture payroll access', exact: true })
    .click();
  await exportButton.click();
  await expect(exportButton).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Payroll preparation', exact: true }),
  ).toHaveCount(0);
  expect(deniedDownloads).toHaveLength(0);
  for (const outcome of ['return', 'reject']) {
    await page.goto('/preview-workforce-authority-test.html');
    await page
      .getByRole('button', { name: 'Payroll preparation', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Prepare earnings preview', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Export preparation CSV', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Pause next payroll preview result',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Prepare earnings preview', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'Prepare earnings preview',
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole('button', {
        name: 'Revoke fixture payroll access',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', {
        name:
          outcome === 'return'
            ? 'Release payroll preview result'
            : 'Reject paused payroll result',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('button', { name: 'Payroll preparation', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Export preparation CSV', exact: true }),
    ).toHaveCount(0);
    expect(deniedDownloads).toHaveLength(0);
  }
});
