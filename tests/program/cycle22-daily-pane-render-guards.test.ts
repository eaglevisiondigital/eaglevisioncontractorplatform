import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { format } from 'prettier';

it('retained panes refresh original clock checks on visibility transitions while preserving all original source, membership, generation, continuation and UNKNOWN controls', async () => {
  const source = readFileSync(
    'src/components/workflows/DailyWorkbench.tsx',
    'utf8',
  );
  const addition = `// Retain original pane state without repeating every hidden review on unrelated
// parent status changes. Visibility transitions rerender the original pane so
// its existing clock/source checks update; active is presentation only and is
// never forwarded to a source reader, action, callback or custody record.
function retainDailyPane(Original: ComponentType<DailyWorkbenchProps>) {
  return memo(function RetainedPane({
    active,
    ...props
  }: DailyWorkbenchProps & { active: boolean }) {
    void active;
    return <Original {...props} />;
  });
}
const RetainedFieldAgenda = retainDailyPane(FieldAgenda);
const RetainedCostInvoiceReview = retainDailyPane(CostInvoiceReview);
const RetainedServiceUpdateReview = retainDailyPane(ServiceUpdateReview);
const RetainedMaintenanceAgenda = retainDailyPane(MaintenanceAgenda);
const RetainedPriorityActions = retainDailyPane(PriorityActions);

`;
  expect(source).toContain(addition);
  let original = source
    .replace('  memo,\n', '')
    .replace('  type ComponentType,\n', '')
    .replace(addition, '');
  const replacements = [
    [
      `<RetainedPriorityActions
              active={step === 'priorities'}
              {...props}
              view="priorities"
            />`,
      '<PriorityActions {...props} view="priorities" />',
    ],
    [
      "<RetainedFieldAgenda active={step === 'field'} {...props} />",
      '<FieldAgenda {...props} />',
    ],
    [
      `<RetainedCostInvoiceReview
              active={step === 'finance' || step === 'invoice'}`,
      '<CostInvoiceReview',
    ],
    [
      `<RetainedServiceUpdateReview
              active={step === 'customer'}
              {...props}
            />`,
      '<ServiceUpdateReview {...props} />',
    ],
    [
      `<RetainedMaintenanceAgenda
              active={step === 'maintenance'}
              {...props}
            />`,
      '<MaintenanceAgenda {...props} />',
    ],
    [
      `<RetainedPriorityActions
              active={step === 'advanced'}
              {...props}
              view="advanced"
            />`,
      '<PriorityActions {...props} view="advanced" />',
    ],
  ];
  for (const [from, to] of replacements) {
    expect(original.split(from)).toHaveLength(2);
    original = original.replace(from, to);
  }
  original = await format(original, {
    parser: 'typescript',
    singleQuote: true,
    trailingComma: 'all',
  });
  // Exact Main-owned source at ff673f41078002a6e741a450bba899d01d50ec77.
  // Only the finite, exact presentation additions above are removed. Formatting
  // restores original JSX wrapping; no authority or custody code is normalized.
  expect(createHash('sha256').update(original).digest('hex')).toBe(
    'e0f6777f37de974d366229b470f6f68faf576e9e47a4373f0b8dc4bd3ee570a6',
  );
});
