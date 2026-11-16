import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { qualifyNativeQuoteFixture } from '../proposals/native-quote-fixture-expiry/qualify.mjs';

const directory = 'proposals/native-quote-fixture-expiry';
const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');
const originalExpiry = "quote_expires_at: '2026-11-16T12:00:00Z'";
const currentExpiry =
  'quote_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()';

describe('unapplied native quote-fixture proposal', () => {
  it('projects exactly two bounded positive input changes and no source approval', () => {
    const result = qualifyNativeQuoteFixture();
    expect(result.base).toBe('223e235be26c37271cb67e3c1f1803feb54599a6');
    expect(result.sourceAuthorApproval).toBe(false);
    expect(result.operationalReady).toBe(false);
    expect(result.projection.map((entry) => entry.path)).toEqual([
      'tests/database/property.test.ts',
      'tests/helpers/property-p1-fixture.ts',
    ]);
    for (const entry of result.projection) {
      const original = readFileSync(entry.path, 'utf8');
      expect(original.split(originalExpiry)).toHaveLength(2);
      expect(entry.content).toBe(
        original.replace(originalExpiry, currentExpiry),
      );
      expect(digest(entry.content)).toBe(entry.sha256);
      // Restoring the single intended input proves every original assertion,
      // intentional expired value, test registration and budget remains exact.
      expect(entry.content.replace(currentExpiry, originalExpiry)).toBe(
        original,
      );
    }
  });

  it.each([
    'tests/database/property.test.ts',
    'tests/helpers/property-p1-fixture.ts',
    'supabase/migrations/20261017005322_property_operations.sql',
    `${directory}/identity.json`,
    `${directory}/fixture-expiry.patch`,
  ])('denies unknown bytes in %s without applying the proposal', (changed) => {
    expect(() =>
      qualifyNativeQuoteFixture({
        read: (path) => {
          const actual = readFileSync(path);
          return String(path) === changed
            ? Buffer.concat([actual, Buffer.from('\nunknown edit')])
            : actual;
        },
      }),
    ).toThrow('Exact unapplied');
  });

  it('keeps native wall-clock expiry denial and the P1 historical clock unchanged', () => {
    const sql = readFileSync(
      'supabase/migrations/20261017005322_property_operations.sql',
      'utf8',
    );
    expect(sql).toContain("(q->>'expires_at')::timestamptz<=clock_timestamp()");
    expect(sql).toContain("raise exception 'Quote expiry/currency'");
    const p1 = qualifyNativeQuoteFixture().projection[1].content;
    expect(p1).toContain('export const p1Now = Date.UTC(2026, 9, 17, 16);');
    expect(p1).toContain("quoted_at: '2026-10-16T12:00:00Z'");
    const expired = readFileSync(
      `${directory}/expired-quote-control.fixture`,
      'utf8',
    );
    expect(expired).toContain('select clock_timestamp()::text as now');
    expect(expired).toContain('new Date(now - 1000).toISOString()');
    expect(expired).toContain(".rejects.toThrow('Quote expiry/currency')");
    expect(expired).toContain('.toHaveLength(0)');
  });
});
