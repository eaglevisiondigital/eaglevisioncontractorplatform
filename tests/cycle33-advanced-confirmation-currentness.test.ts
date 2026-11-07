import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  prepareAdvancedHandoff,
  readAdvancedHandoffRequirements,
  reconcileAdvancedHandoff,
  assertAdvancedHandoffCurrentNow,
  type AdvancedHandoffInput,
  type AdvancedHandoffConfirmation,
} from '../src/lib/workflows/advanced-handoffs';

afterEach(() => vi.restoreAllMocks());

async function fixture(
  brand: number,
  kind: AdvancedHandoffInput['kind'] = 'voice',
) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[0],
    org = sources.company.id,
    input = {
      job_id: entry.target.job_id!,
      kind,
      note: 'Literal staff review only; no estimate or delivery is issued.',
      review_on: '2026-12-28',
      manual_priority: 'normal' as const,
      edition: 'property_services' as const,
    };
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    org + '-advanced-confirmation-remaining-owner',
  );
  const requirements = await readAdvancedHandoffRequirements(
    sources,
    input,
    gate,
  );
  return { gate, sources, entry, org, input, requirements };
}

function finalConfirmation(hash: string, onFinal: () => void, at = 3) {
  let captures = 0;
  const input = new Proxy<AdvancedHandoffConfirmation>(
    { confirmed: true, reviewed_requirements_sha256: hash },
    {
      getOwnPropertyDescriptor(target, field) {
        if (field === 'reviewed_requirements_sha256' && ++captures === at)
          onFinal();
        return Reflect.getOwnPropertyDescriptor(target, field);
      },
    },
  );
  return { input, captures: () => captures };
}

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: final confirmation capture revocation withholds private advanced evidence`, async () => {
    const f = await fixture(brand);
    let revoked: Promise<void> | undefined;
    const confirmed = finalConfirmation(f.requirements.integrity.sha256, () => {
      revoked = f.sources.operations.revokeOwner(
        f.org,
        f.entry.target.actor_id,
      );
    });
    await expect(
      prepareAdvancedHandoff(f.requirements, confirmed.input),
    ).rejects.toThrow();
    expect(confirmed.captures()).toBe(3);
    expect(revoked).toBeDefined();
    await revoked;
    expect(
      f.sources.operations
        .syntheticMemberships(f.org)
        .find((m) => m.user_id === f.entry.target.actor_id)!.active,
    ).toBe(false);
  });

  it(`brand ${brand}: final retained confirmation capture cannot report current after original owner revocation`, async () => {
    const f = await fixture(brand);
    let revoked: Promise<void> | undefined;
    const confirmed = finalConfirmation(
        f.requirements.integrity.sha256,
        () => {
          revoked = f.sources.operations.revokeOwner(
            f.org,
            f.entry.target.actor_id,
          );
        },
        4,
      ),
      handoff = await prepareAdvancedHandoff(f.requirements, confirmed.input);
    expect(() => assertAdvancedHandoffCurrentNow(handoff)).toThrow();
    expect(confirmed.captures()).toBe(4);
    await revoked;
    expect(
      f.sources.operations
        .syntheticMemberships(f.org)
        .find((m) => m.user_id === f.entry.target.actor_id)!.active,
    ).toBe(false);
  });

  it(`brand ${brand}: final reconciliation capture preserves UNKNOWN after original owner revocation`, async () => {
    const f = await fixture(brand);
    let revoked: Promise<void> | undefined;
    const confirmed = finalConfirmation(
        f.requirements.integrity.sha256,
        () => {
          revoked = f.sources.operations.revokeOwner(
            f.org,
            f.entry.target.actor_id,
          );
        },
        5,
      ),
      handoff = await prepareAdvancedHandoff(f.requirements, confirmed.input),
      result = await reconcileAdvancedHandoff(handoff);
    expect(confirmed.captures()).toBe(5);
    expect(revoked).toBeDefined();
    await revoked;
    expect(
      f.sources.operations
        .syntheticMemberships(f.org)
        .find((m) => m.user_id === f.entry.target.actor_id)!.active,
    ).toBe(false);
    expect(result).toEqual({
      status: 'UNKNOWN',
      replacement: null,
      replay: false,
    });
    await f.sources.operations.configure(
      f.org,
      'active',
      'synthetic',
      {},
      f.entry.target.actor_id,
    );
    expect(await reconcileAdvancedHandoff(handoff)).toEqual(result);
  });

  it(`brand ${brand}: final confirmation withdrawal retains the original attempted hold without replay`, async () => {
    const f = await fixture(brand),
      confirmed = finalConfirmation(f.requirements.integrity.sha256, () => {
        f.gate.confirmed = false;
      });
    await expect(
      prepareAdvancedHandoff(f.requirements, confirmed.input),
    ).rejects.toThrow();
    expect(confirmed.captures()).toBe(3);
    f.gate.confirmed = true;
    const original = await readAdvancedHandoffRequirements(
      f.sources,
      f.input,
      f.gate,
    );
    expect(original.prior_attempt).toBe('EXACT_READ_ONLY_PREVIOUS_ATTEMPT');
    await expect(
      prepareAdvancedHandoff(original, {
        confirmed: true,
        reviewed_requirements_sha256: original.integrity.sha256,
      }),
    ).rejects.toThrow(/no replay/);
  });

  it(`brand ${brand}: final confirmation capture cannot substitute changed source context`, async () => {
    const f = await fixture(brand),
      confirmed = finalConfirmation(f.requirements.integrity.sha256, () => {
        f.input.note = 'Changed after final source check';
      });
    await expect(
      prepareAdvancedHandoff(f.requirements, confirmed.input),
    ).rejects.toThrow('Original handoff input changed');
    expect(confirmed.captures()).toBe(3);
    const original = await readAdvancedHandoffRequirements(
      f.sources,
      f.input,
      f.gate,
    );
    expect(original.prior_attempt).toBe('EXACT_READ_ONLY_PREVIOUS_ATTEMPT');
    await expect(
      prepareAdvancedHandoff(original, {
        confirmed: true,
        reviewed_requirements_sha256: original.integrity.sha256,
      }),
    ).rejects.toThrow(/no replay/);
  });

  it(`brand ${brand}: current confirmation retains exact native evidence without business effects`, async () => {
    const kind = (['voice', 'trade', 'procurement'] as const)[brand],
      f = await fixture(brand, kind),
      state = f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
      property = f.sources.property.read(f.org),
      release = f.entry.release.read('staff'),
      writers = [
        vi.spyOn(f.sources.estimates, 'create'),
        vi.spyOn(f.sources.estimates, 'save'),
        vi.spyOn(f.sources.estimates, 'issue'),
        vi.spyOn(f.sources.estimates, 'approveJob'),
        vi.spyOn(f.sources.estimates, 'assignJob'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.property, 'publish'),
        vi.spyOn(f.sources.operations, 'recordConsent'),
        vi.spyOn(f.entry.release, 'command'),
        vi.spyOn(globalThis, 'fetch'),
      ],
      confirmed = finalConfirmation(f.requirements.integrity.sha256, () => {}),
      handoff = await prepareAdvancedHandoff(f.requirements, confirmed.input),
      bytes = JSON.stringify(handoff);
    expect(confirmed.captures()).toBe(3);
    expect(handoff.requirements).toBe(f.requirements);
    expect(handoff.requirements.source).toMatchObject({
      organization_id: f.org,
      customer_id: f.entry.target.customer_id,
      location_id: f.entry.target.location_id,
      job_id: f.input.job_id,
      estimate_id: f.entry.target.estimate_id,
      issued_version_id: f.entry.target.version_id,
    });
    expect(handoff.kind).toBe(kind);
    expect(handoff.operational_ready).toBe(false);
    expect(handoff.delivery).toBe('NOT_SENT');
    expect(handoff.persistence).toBe('SAME_TAB_REVIEW_ONLY');
    expect(Object.isFrozen(handoff.evidence.facts)).toBe(true);
    expect(await reconcileAdvancedHandoff(handoff)).toEqual({
      status: 'CURRENT_REVIEW_ONLY',
      replacement: null,
      replay: false,
    });
    expect(JSON.stringify(handoff)).toBe(bytes);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(state);
    expect(f.sources.property.read(f.org)).toEqual(property);
    expect(f.entry.release.read('staff')).toEqual(release);
    for (const writer of writers) expect(writer).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: copied or foreign requirement handles cannot read confirmation or consume the real hold`, async () => {
    const f = await fixture(brand),
      other = await fixture((brand + 1) % 3),
      captured = vi.fn(),
      confirmed = finalConfirmation(
        f.requirements.integrity.sha256,
        captured,
        1,
      );
    expect(other.org).not.toBe(f.org);
    await expect(
      prepareAdvancedHandoff({ ...f.requirements }, confirmed.input),
    ).rejects.toThrow('Exact original requirements required');
    expect(confirmed.captures()).toBe(0);
    await expect(
      prepareAdvancedHandoff(other.requirements, confirmed.input),
    ).rejects.toThrow('Exact reviewed requirements hash required');
    expect(captured).toHaveBeenCalledExactlyOnceWith();
    const handoff = await prepareAdvancedHandoff(f.requirements, {
      confirmed: true,
      reviewed_requirements_sha256: f.requirements.integrity.sha256,
    });
    expect(handoff.requirements).toBe(f.requirements);
    expect(await reconcileAdvancedHandoff({ ...handoff })).toEqual({
      status: 'UNKNOWN',
      replacement: null,
      replay: false,
    });
  });

  it(`brand ${brand}: withdrawn local gate denies preparation before caller confirmation or private source reads`, async () => {
    const f = await fixture(brand),
      sourceRead = vi.spyOn(
        f.sources.estimates,
        'readSyntheticPrototypeSources',
      ),
      captured = vi.fn(),
      confirmed = finalConfirmation(
        f.requirements.integrity.sha256,
        captured,
        1,
      );
    f.gate.confirmed = false;
    await expect(
      prepareAdvancedHandoff(f.requirements, confirmed.input),
    ).rejects.toThrow();
    expect(confirmed.captures()).toBe(0);
    expect(captured).not.toHaveBeenCalled();
    expect(sourceRead).not.toHaveBeenCalled();
  });
}
