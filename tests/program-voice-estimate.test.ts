import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { readPrototypeSource } from '../src/lib/program/prototype-source';
import {
  prepareVoiceEstimate,
  inspectVoiceEstimate,
} from '../src/lib/program/voice-estimate';
import { prototypeFixture } from './program/prototype-fixture';
afterEach(() => vi.restoreAllMocks());
async function setup(company = sampleCompanies[0]) {
  const f = await prototypeFixture(company);
  return {
    ...f,
    source: await readPrototypeSource(f.repo, f.target, f.gate),
    reviewGate: { enabled: true, confirmed: true },
  };
}
it.each(sampleCompanies)(
  '$name turns literal synthetic transcript into exact typed catalog suggestions without writes',
  async (company) => {
    const f = await setup(company);
    const item = f.source.snapshot.catalog[0];
    const text = `  2.125 ${item.unit} ${item.name}; do something vague`;
    const before = await f.repo.history(company.id, f.target.estimate_id);
    const p = await prepareVoiceEstimate(
      f.source,
      { transcript: text },
      f.reviewGate,
    );
    const c = p.snapshot.clauses[0];
    expect(c.suggestion).toEqual({
      kind: item.kind,
      description: item.description,
      quantity_milli: 2125,
      unit: item.unit,
      catalog_item_id: item.id,
    });
    expect(text.slice(c.span.start, c.span.end)).toBe(c.span.literal);
    expect(p.snapshot.clauses[1].suggestion).toBeNull();
    expect(p.snapshot.clauses[1].warning).toContain('no inference');
    expect(p.snapshot.target).toEqual(f.target);
    expect(p.snapshot.source_sha256).toBe(f.source.sha256);
    expect(p.snapshot.recognition).toBe('NONE');
    expect(p.snapshot.audio).toBe('NOT_CAPTURED');
    expect(Object.values(p.snapshot.authority)).not.toContain(true);
    for (const field of [
      'PRIVATE',
      'unit_cost_minor',
      'unit_price_minor',
      'internal_note',
      '"phone":',
      'email',
      'rates',
    ])
      expect(JSON.stringify(p)).not.toContain(field);
    expect(Object.isFrozen(c.suggestion)).toBe(true);
    await expect(inspectVoiceEstimate(p)).resolves.toEqual({
      status: 'CURRENT',
      replacement: null,
    });
    expect(await f.repo.history(company.id, f.target.estimate_id)).toEqual(
      before,
    );
  },
);
it.each(['', ' ', 'x'.repeat(2001), '\u0000'])(
  'rejects invalid transcript',
  async (text) => {
    const f = await setup();
    await expect(
      prepareVoiceEstimate(f.source, { transcript: text }, f.reviewGate),
    ).rejects.toThrow('transcript');
  },
);
it('default OFF requires separate explicit confirmation', async () => {
  const f = await setup();
  await expect(
    prepareVoiceEstimate(f.source, { transcript: 'hello' }),
  ).rejects.toThrow('enabled');
  await expect(
    prepareVoiceEstimate(f.source, { transcript: 'hello' }, { enabled: true }),
  ).rejects.toThrow('confirmed');
});
it.each([
  '0 each Missing',
  '999999999999999 each Missing',
  '1.2345 each Missing',
  '1 bananas Missing',
  '1 each Missing',
])('preserves unmatched/invalid clause warning %s', async (text) => {
  const f = await setup();
  const p = await prepareVoiceEstimate(
    f.source,
    { transcript: text },
    f.reviewGate,
  );
  expect(p.snapshot.clauses[0].suggestion).toBeNull();
  expect(p.snapshot.clauses[0].warning).toBeTruthy();
});
it('wrong canonical unit is uncertain without conversion', async () => {
  const f = await setup();
  const item = f.source.snapshot.catalog[0];
  const unit = item.unit === 'hour' ? 'each' : 'hour';
  const p = await prepareVoiceEstimate(
    f.source,
    { transcript: `1 ${unit} ${item.name}` },
    f.reviewGate,
  );
  expect(p.snapshot.clauses[0].warning).toContain('differs');
  expect(p.snapshot.clauses[0].suggestion).toBeNull();
});
it('duplicate exact catalog names stay separate candidates', async () => {
  const f = await prototypeFixture();
  const catalog = await f.repo.catalog(f.company.id);
  const item = catalog[0];
  const duplicate = {
    name: item.name,
    description: item.description,
    category: item.category,
    kind: item.kind,
    unit: item.unit,
    unit_cost_minor: item.unit_cost_minor,
    unit_price_minor: item.unit_price_minor,
    markup_bps: item.markup_bps,
    vendor: item.vendor,
    active: item.active,
  };
  await f.repo.saveCatalog(f.company.id, duplicate);
  const source = await readPrototypeSource(f.repo, f.target, f.gate);
  const p = await prepareVoiceEstimate(
    source,
    { transcript: `1 ${item.unit} ${item.name}` },
    f.gate,
  );
  expect(p.snapshot.clauses[0].exact_catalog_candidates).toHaveLength(2);
  expect(p.snapshot.clauses[0].warning).toContain('Ambiguous');
  expect(p.snapshot.clauses[0].suggestion).toBeNull();
});
it('accessors, extra fields and cloned sources cannot authorize', async () => {
  const f = await setup();
  const getter = vi.fn(() => 'hello');
  await expect(
    prepareVoiceEstimate(
      f.source,
      {
        get transcript() {
          return getter();
        },
      },
      f.reviewGate,
    ),
  ).rejects.toThrow('primitive');
  expect(getter).not.toHaveBeenCalled();
  await expect(
    prepareVoiceEstimate(
      structuredClone(f.source),
      { transcript: 'hello' },
      f.reviewGate,
    ),
  ).rejects.toThrow('Unknown');
});
it('changed draft invalidates frozen packet, and recaptured same source cannot replay', async () => {
  const f = await setup();
  const p = await prepareVoiceEstimate(
    f.source,
    { transcript: 'hello' },
    f.reviewGate,
  );
  const old = JSON.stringify(p);
  const fresh = await readPrototypeSource(f.repo, f.target, f.gate);
  await expect(
    prepareVoiceEstimate(fresh, { transcript: 'replacement' }, f.reviewGate),
  ).rejects.toThrow('no replay');
  await f.repo.save(f.company.id, f.bundle, {
    ...f.bundle.version.payload,
    terms: 'Changed',
  });
  await expect(inspectVoiceEstimate(p)).rejects.toThrow('Stale');
  expect(JSON.stringify(p)).toBe(old);
});
it('withdrawal and real source edit at hash boundary deny output and preserve hold', async () => {
  const f = await setup();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    if (++calls === 2)
      await f.repo.save(f.company.id, f.bundle, {
        ...f.bundle.version.payload,
        terms: 'Changed',
      });
    return digest(...args);
  });
  await expect(
    prepareVoiceEstimate(f.source, { transcript: 'hello' }, f.reviewGate),
  ).rejects.toThrow('Stale');
});
it('concurrent preparation produces one snapshot; withdrawn gates deny exact read', async () => {
  const f = await setup();
  const outcomes = await Promise.allSettled([
    prepareVoiceEstimate(f.source, { transcript: 'hello' }, f.reviewGate),
    prepareVoiceEstimate(f.source, { transcript: 'hello' }, f.reviewGate),
  ]);
  expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  const value = outcomes.find((x) => x.status === 'fulfilled');
  if (!value || value.status !== 'fulfilled') throw Error('Missing review');
  f.reviewGate.confirmed = false;
  await expect(inspectVoiceEstimate(value.value)).rejects.toThrow('confirmed');
});

it('a real save after awaited source validation is denied by final synchronous consumer checkpoint', async () => {
  const f = await setup();
  const boundary = await import('../src/lib/program/prototype-source');
  const original = boundary.assertPrototypeSourceCurrent;
  let calls = 0;
  vi.spyOn(boundary, 'assertPrototypeSourceCurrent').mockImplementation(
    async (source) => {
      await original(source);
      if (++calls === 2)
        await f.repo.save(f.company.id, f.bundle, {
          ...f.bundle.version.payload,
          terms: 'Changed after awaited validator',
        });
    },
  );
  await expect(
    prepareVoiceEstimate(
      f.source,
      { transcript: 'review synthetic scope' },
      f.reviewGate,
    ),
  ).rejects.toThrow('Stale');
});
