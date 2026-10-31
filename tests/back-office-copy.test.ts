import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BackOfficeText,
  BackOfficeStaffLabel,
} from '../src/components/property/back-office-copy';
import { BackOfficeConcept } from '../src/components/property/back-office-presentation';
import { backOfficeLabel } from '../src/components/property/back-office-labels';

describe('isolated contractor presentation copy', () => {
  it('defaults to the original presentation, including exact enum strings', () => {
    for (const text of [
      'Maintenance & follow-up',
      'Save estimate draft',
      'linear_ft',
      'Scope item 1',
    ]) {
      expect(backOfficeLabel(text, false)).toBe(text);
      expect(
        renderToStaticMarkup(createElement(BackOfficeText, { text })),
      ).toBe(text.replaceAll('&', '&amp;'));
    }
  });
  it('maps only explicit UI copy and enums, without a general capitalization rule', () => {
    expect(backOfficeLabel('Maintenance & follow-up', true)).toBe(
      'Maintenance & Follow-Up',
    );
    expect(backOfficeLabel('linear_ft', true)).toBe('Linear Feet');
    expect(backOfficeLabel('Scope item 2', true)).toBe('Scope Item 2');
    expect(backOfficeLabel('Finding 3 recommendation', true)).toBe(
      'Finding 3 Recommendation',
    );
    for (const text of [
      'weathered JOINT material documented.',
      'UNFAMILIAR_enum',
      'Keep this sentence unchanged.',
      'report-uuid-v2',
      'McDonald property',
    ]) {
      expect(backOfficeLabel(text, true)).toBe(text);
    }
  });
  it('requires opt-in context and retains genuine staff identity text', () => {
    const render = (concept: boolean, label: string) =>
      renderToStaticMarkup(
        createElement(
          BackOfficeConcept.Provider,
          { value: concept },
          createElement(BackOfficeStaffLabel, { label }),
        ),
      );
    expect(render(false, 'staff · field_staff')).toBe('staff · field_staff');
    expect(render(true, 'staff · field_staff')).toBe('Staff · Field Staff');
    expect(render(true, 'Jo McDonald')).toBe('Jo McDonald');
  });
});
