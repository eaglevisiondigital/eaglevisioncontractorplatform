import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import * as nativeSource from '../src/lib/program/prototype-source';
import {
  prepareVoiceEstimate,
  inspectVoiceEstimate,
} from '../src/lib/program/voice-estimate';
import { prototypeFixture } from './program/prototype-fixture';

afterEach(() => vi.restoreAllMocks());
async function fixture(brand = 0) {
  const f = await prototypeFixture(sampleCompanies[brand]);
  const source = await nativeSource.readPrototypeSource(
    f.repo,
    f.target,
    f.gate,
  );
  const item = source.snapshot.catalog[0];
  const input = { transcript: `2.125 ${item.unit} ${item.name}` };
  return { ...f, source, item, input };
}
for (const brand of [0, 1, 2]) {
  for (const boundary of [
    'first source read',
    'packet hash',
    'last source read',
  ] as const) {
    it(`brand ${brand}: changed ordinary transcript at ${boundary} denies stale packet`, async () => {
      const f = await fixture(brand);
      const before = await f.repo.history(f.company.id, f.target.estimate_id);
      let changed = false;
      if (boundary === 'packet hash') {
        const digest = crypto.subtle.digest.bind(crypto.subtle);
        vi.spyOn(crypto.subtle, 'digest').mockImplementation(
          async (...args) => {
            const result = await digest(...args);
            // First digest is the actual source check; second is the voice snapshot.
            if (
              !changed &&
              JSON.stringify(
                JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer)),
              ).includes('synthetic-transcript-review-only')
            ) {
              changed = true;
              f.input.transcript = 'Changed after confirmation';
            }
            return result;
          },
        );
      } else {
        const original = nativeSource.assertPrototypeSourceCurrent;
        let calls = 0;
        vi.spyOn(
          nativeSource,
          'assertPrototypeSourceCurrent',
        ).mockImplementation(async (source) => {
          await original(source);
          if (++calls === (boundary === 'first source read' ? 1 : 2)) {
            changed = true;
            f.input.transcript = 'Changed after confirmation';
          }
        });
      }
      await expect(
        prepareVoiceEstimate(f.source, f.input, f.gate),
      ).rejects.toThrow('Original confirmed transcript changed');
      expect(changed).toBe(true);
      expect(await f.repo.history(f.company.id, f.target.estimate_id)).toEqual(
        before,
      );
      if (boundary !== 'first source read') {
        vi.restoreAllMocks();
        const recaptured = await nativeSource.readPrototypeSource(
          f.repo,
          f.target,
          f.gate,
        );
        await expect(
          prepareVoiceEstimate(recaptured, f.input, f.gate),
        ).rejects.toThrow('no replay');
      }
    });
  }
  it(`brand ${brand}: unchanged exact transcript retains literal offsets, safe fields and no execution authority`, async () => {
    const f = await fixture(brand);
    const before = await f.repo.history(f.company.id, f.target.estimate_id);
    const review = await prepareVoiceEstimate(f.source, f.input, f.gate);
    expect(review.snapshot.clauses[0].suggestion).toMatchObject({
      catalog_item_id: f.item.id,
      quantity_milli: 2125,
    });
    const span = review.snapshot.clauses[0].span;
    expect(f.input.transcript.slice(span.start, span.end)).toBe(span.literal);
    expect(review.snapshot.target).toEqual(f.target);
    expect(Object.values(review.snapshot.authority)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(JSON.stringify(review)).not.toMatch(
      /PRIVATE|unit_cost_minor|unit_price_minor|internal_note/,
    );
    expect(Object.isFrozen(review.snapshot.clauses[0])).toBe(true);
    await expect(inspectVoiceEstimate(review)).resolves.toEqual({
      status: 'CURRENT',
      replacement: null,
    });
    expect(await f.repo.history(f.company.id, f.target.estimate_id)).toEqual(
      before,
    );
  });
  it(`brand ${brand}: later transcript edits deny the original immutable read and cannot prepare a replacement`, async () => {
    const f = await fixture(brand);
    const review = await prepareVoiceEstimate(f.source, f.input, f.gate);
    const frozen = JSON.stringify(review);
    f.input.transcript = 'Changed after preparation';
    await expect(inspectVoiceEstimate(review)).rejects.toThrow(
      'Original confirmed transcript changed',
    );
    expect(JSON.stringify(review)).toBe(frozen);
    const recaptured = await nativeSource.readPrototypeSource(
      f.repo,
      f.target,
      f.gate,
    );
    await expect(
      prepareVoiceEstimate(recaptured, f.input, f.gate),
    ).rejects.toThrow('no replay');
  });
  it(`brand ${brand}: transcript changes while inspecting hash deny a stale CURRENT answer`, async () => {
    const f = await fixture(brand);
    const review = await prepareVoiceEstimate(f.source, f.input, f.gate);
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args);
      if (!changed) {
        changed = true;
        f.input.transcript = 'Changed during inspection';
      }
      return result;
    });
    await expect(inspectVoiceEstimate(review)).rejects.toThrow(
      'Original confirmed transcript changed',
    );
    expect(changed).toBe(true);
  });
  it(`brand ${brand}: final awaited inspection source validation rechecks the original transcript`, async () => {
    const f = await fixture(brand);
    const review = await prepareVoiceEstimate(f.source, f.input, f.gate);
    const original = nativeSource.assertPrototypeSourceCurrent;
    vi.spyOn(nativeSource, 'assertPrototypeSourceCurrent').mockImplementation(
      async (source) => {
        await original(source);
        f.input.transcript = 'Changed at final inspection source boundary';
      },
    );
    await expect(inspectVoiceEstimate(review)).rejects.toThrow(
      'Original confirmed transcript changed',
    );
  });
}

for (const brand of [0, 1, 2]) {
  for (const revoked of ['confirmation', 'membership'] as const) {
    it(`brand ${brand}: executable descriptor input cannot revoke ${revoked} after final source checkpoint`, async () => {
      const f = await fixture(brand);
      let captures = 0;
      let withdrawn = false;
      const nativeMembers = f.ops.syntheticMemberships.bind(f.ops);
      vi.spyOn(f.ops, 'syntheticMemberships').mockImplementation((org) =>
        nativeMembers(org).map((member) =>
          withdrawn &&
          revoked === 'membership' &&
          member.user_id === f.target.actor_id
            ? { ...member, active: false }
            : member,
        ),
      );
      const executable = new Proxy(f.input, {
        getOwnPropertyDescriptor(target, key) {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
          if (key === 'transcript' && ++captures === 5) {
            withdrawn = true;
            if (revoked === 'confirmation') f.gate.confirmed = false;
          }
          return descriptor;
        },
      });
      const before = await f.repo.history(f.company.id, f.target.estimate_id);
      const outcome = await Promise.allSettled([
        prepareVoiceEstimate(f.source, executable, f.gate),
      ]);
      expect.soft(outcome[0].status).toBe('rejected');
      expect
        .soft(await f.repo.history(f.company.id, f.target.estimate_id))
        .toEqual(before);
      // A rejected executable form does not consume the original preparation
      // hold or get to execute its final-boundary withdrawal.
      expect.soft(withdrawn).toBe(false);
      expect(captures).toBeLessThan(5);
      await expect(
        prepareVoiceEstimate(f.source, f.input, f.gate),
      ).resolves.toMatchObject({
        snapshot: { mode: 'synthetic-transcript-review-only' },
      });
    });
  }
}
