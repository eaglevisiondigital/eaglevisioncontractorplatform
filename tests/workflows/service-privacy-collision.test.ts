import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../../src/domain/platform';
import { prepareOperatingSources } from '../../src/lib/workflows/operating-center-runtime';
import { readPortfolioService } from '../../src/lib/workflows/portfolio-service';
import { privacySerialization } from '../support/privacy-serialization';
const excluded =
  /PRIVATE|internal_notes|unit_cost_minor|supplier|margin|payroll|actor_id|worker_id|staff_type|@example.invalid|555010/;
afterEach(() => vi.restoreAllMocks());
it('reproduces the original serialization failure with valid admitted UUID collisions, without private source leakage', async () => {
  const randomUUID = crypto.randomUUID.bind(crypto);
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    const id = randomUUID();
    return `555010${id.slice(6)}`;
  });
  const gate = { enabled: true, confirmed: true };
  const sources = await prepareOperatingSources(sampleCompanies[0], gate);
  const view = await readPortfolioService(sources, { location_id: '' }, gate);
  expect(JSON.stringify(view)).toMatch(excluded);
  expect(privacySerialization(view)).not.toMatch(excluded);
  expect(JSON.stringify(view)).not.toContain('5550100100');
  expect(view.properties[0].customer_id).toMatch(/^555010/);
});
it('permits a SHA256 collision only in the explicit digest field', () => {
  const hash = '555010' + 'a'.repeat(58);
  expect(privacySerialization({ integrity: { sha256: hash } })).not.toMatch(
    excluded,
  );
  expect(privacySerialization({ summary: hash })).toMatch(excluded);
});
it.each([
  { summary: 'Call 5550100100' },
  { summary: '555010' },
  { summary: 'PRIVATE supplier margin payroll details' },
  { internal_notes: 'otherwise safe' },
  { 'properties.0.customer_id': '555010aa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  { 'integrity.sha256': '555010' + 'a'.repeat(58) },
  { actor_id: '555010aa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  { customer_id: '5550100100' },
  { customer_id: '555010aa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  { extra: { integrity: { sha256: '555010' + 'a'.repeat(58) } } },
  { sha256: '555010-not-a-hash' },
  { summary: '555010aa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  { unexpected: ['555010aa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] },
  { unit_cost_minor: 555010 },
])(
  'retains the original exclusion for private fields, phone values and non-identity text %j',
  (value) => {
    expect(privacySerialization(value)).toMatch(excluded);
  },
);
