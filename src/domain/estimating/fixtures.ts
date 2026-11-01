import { blankEstimate, blankLine } from './calculation';
import type { CompanyProfile } from '../platform';
export function industryEstimate(
  company: CompanyProfile,
  customerId: string,
  currency = 'USD',
) {
  const p = blankEstimate(customerId, currency);
  p.internal_notes =
    'Synthetic pricing for workflow validation. Not a market quotation.';
  p.terms =
    'Scope and payment proposal for internal review. No delivery, acceptance, signatures or payment collection is enabled.';
  const line = (
    description: string,
    quantity: number,
    cost: number,
    kind: 'material' | 'labor' | 'allowance' = 'material',
  ) => ({
    ...blankLine(kind),
    description,
    quantity_milli: quantity * 1000,
    unit_cost_minor: cost,
    unit_price_minor: null,
    markup_bps: kind === 'labor' ? 0 : 2000,
  });
  if (company.industry === 'property_services') {
    p.project = {
      ...p.project,
      name: 'Cedar boundary fence',
      type: 'Fence installation',
      description:
        'Install 180 linear feet of fencing, including posts, hardware and cleanup.',
    };
    p.lines = [
      { ...line('Fence panels and rails', 180, 2400), unit: 'linear_ft' },
      line('Posts and concrete', 24, 3200),
      line('Installation labor', 32, 6500, 'labor'),
    ];
  } else if (company.industry === 'construction') {
    p.project = {
      ...p.project,
      name: 'Kitchen & living renovation',
      type: 'Residential renovation',
      description: 'Flooring, cabinet allowance and skilled installation.',
    };
    p.lines = [
      { ...line('Engineered flooring', 640, 425), unit: 'sq_ft' },
      line('Cabinet allowance', 1, 380000, 'allowance'),
      line('Renovation labor', 80, 7500, 'labor'),
    ];
  } else {
    p.project = {
      ...p.project,
      name: 'Architectural roof replacement',
      type: 'Roofing',
      description:
        'Tear-off, underlayment and replacement roof system. Choose one roof system.',
    };
    p.lines = [line('Tear-off and installation labor', 60, 7000, 'labor')];
    for (const [index, label] of ['Good', 'Better', 'Best'].entries()) {
      const option = {
        id: crypto.randomUUID(),
        label,
        kind: 'exclusive' as const,
        group: 'roof-system',
        selected: index === 1,
        description: `${label} roof system materials`,
      };
      p.options.push(option);
      p.lines.push({
        ...line(`${label} shingle system`, 28, 11500 + index * 3500),
        unit: 'roofing_square',
        option_id: option.id,
      });
    }
  }
  return p;
}
