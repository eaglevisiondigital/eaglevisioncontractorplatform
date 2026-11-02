import { afterEach, expect, it, vi } from 'vitest';
import { salesHandoffFixture } from './helpers/sales-handoff';
import { captureSalesApprovedScopeReference } from '../src/lib/sales-approval-handoff';
import { customerPreview } from '../src/domain/estimating/customer-preview';
import { documentHash } from '../src/domain/release/preview';
import { Phase3Repository } from '../src/lib/phase3';
import { Operations } from '../src/lib/operations';
import {
  prepareSalesContractReview as prepare,
  verifySalesContractPreparation as verify,
  type ContractPreparationReview,
} from '../src/lib/sales-contract-preparation';

async function fixture(index = 0) {
  const f = await salesHandoffFixture(index);
  const hash = await documentHash({
    ...customerPreview(f.issued.version),
    internal_test: true,
  });
  const reference = await captureSalesApprovedScopeReference(
    f.repo,
    f.release,
    f.target,
    true,
    hash,
  );
  const review: ContractPreparationReview = {
    enabled: true,
    confirmed: true,
    reviewed_reference_hash: reference.integrity.sha256,
    reviewed_scope_hash: hash,
    checks: { scope: true, preference: true, terms: true, boundaries: true },
  };
  return { ...f, reference, review };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each([0, 1, 2])(
  'prepares exact immutable saved issued source with actual accepted test receipt for contractor %i, without side effects',
  async (index) => {
    const f = await fixture(index),
      before = f.release.read('staff'),
      history = await f.repo.history(f.company.id, f.issued.estimate.id),
      jobs = await f.repo.jobs(f.company.id);
    const command = vi.spyOn(f.release, 'command'),
      save = vi.spyOn(f.repo, 'save'),
      issue = vi.spyOn(f.repo, 'issue'),
      revise = vi.spyOn(f.repo, 'revise'),
      approve = vi.spyOn(f.repo, 'approveJob');
    const packet = await prepare(
      f.repo,
      f.release,
      f.target,
      f.reference,
      f.review,
    );
    expect(packet.reference).toEqual(f.reference);
    expect(packet.reference.source.scope).toEqual({
      ...customerPreview(f.issued.version),
      internal_test: true,
    });
    expect(packet.reference.receipt.id).toBe(f.receipt.id);
    expect(packet.contract_execution).toBe('BLOCKED');
    expect(packet.missing_contract_evidence).toEqual({
      legal_reference: 'UNVERIFIED',
      document_hash: 'UNVERIFIED',
    });
    expect(Object.values(packet.missing_signature_evidence)).toEqual(
      Array(5).fill('UNVERIFIED'),
    );
    expect(Object.isFrozen(packet.reference.source.scope.lines)).toBe(true);
    expect(() => Object.assign(packet.checklist, { terms: false })).toThrow();
    expect(JSON.stringify(packet)).not.toMatch(
      /PRIVATE|unit_cost_minor|internal_notes|profit_margin|payroll|staff_type|signer_email/,
    );
    const { integrity, ...content } = packet;
    expect(integrity.sha256).toBe(await documentHash(content));
    expect(await verify(f.repo, f.release, f.target, packet)).toMatchObject({
      status: 'current',
      preparation_hash: integrity.sha256,
      contract_execution: 'BLOCKED',
    });
    expect(f.release.read('staff')).toEqual(before);
    expect(await f.repo.history(f.company.id, f.issued.estimate.id)).toEqual(
      history,
    );
    expect(await f.repo.jobs(f.company.id)).toEqual(jobs);
    for (const spy of [command, save, issue, revise, approve])
      expect(spy).not.toHaveBeenCalled();
  },
);
it.each([
  'enabled',
  'confirmed',
  'scope',
  'preference',
  'terms',
  'boundaries',
  'scope-hash',
  'reference-hash',
  'extra',
] as const)(
  'rejects incomplete or changed %s review before reads',
  async (kind) => {
    const f = await fixture(),
      review = structuredClone(f.review),
      get = vi.spyOn(f.repo, 'get');
    if (kind === 'enabled' || kind === 'confirmed') review[kind] = false;
    else if (kind === 'scope-hash') review.reviewed_scope_hash = 'bad';
    else if (kind === 'reference-hash') review.reviewed_reference_hash = 'bad';
    else if (kind === 'extra') Object.assign(review, { legal_approval: true });
    else review.checks[kind] = false;
    await expect(
      prepare(f.repo, f.release, f.target, f.reference, review),
    ).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  },
);
it.each([
  'organization_id',
  'actor_id',
  'customer_id',
  'location_id',
  'version_id',
  'estimate_id',
  'offer_id',
  'receipt_id',
] as const)('denies changed exact %s', async (field) => {
  const f = await fixture(),
    packet = await prepare(f.repo, f.release, f.target, f.reference, f.review),
    target = { ...f.target, [field]: 'foreign' };
  await expect(
    prepare(f.repo, f.release, target, f.reference, f.review),
  ).rejects.toThrow();
  expect(await verify(f.repo, f.release, target, packet)).toMatchObject({
    status: 'unknown',
    preparation_hash: null,
  });
});
it('pins primitive input and rejects confirmation withdrawal during actual source waits', async () => {
  const f = await fixture(),
    get = f.repo.get.bind(f.repo);
  let first = true;
  vi.spyOn(f.repo, 'get').mockImplementation(async (...args) => {
    const value = await get(...args);
    if (first) {
      first = false;
      f.review.confirmed = false;
    }
    return value;
  });
  await expect(
    prepare(f.repo, f.release, f.target, f.reference, f.review),
  ).rejects.toThrow('checklist');
});
it.each([0, 1, 2])(
  'rechecks actual staff membership after the last read for contractor %i',
  async (index) => {
    const f = await fixture(index),
      get = f.repo.get.bind(f.repo);
    let reads = 0;
    vi.spyOn(f.repo, 'get').mockImplementation(async (...args) => {
      const v = await get(...args);
      if (++reads === 24)
        await f.operations.manageMember(
          f.company.id,
          f.target.actor_id,
          true,
          'staff',
          'field_worker',
        );
      return v;
    });
    await expect(
      prepare(f.repo, f.release, f.target, f.reference, f.review),
    ).rejects.toThrow();
    expect(reads).toBe(24);
  },
);
it('retains original preparation and issued version after a newer changed draft, with stale denial', async () => {
  const f = await fixture(),
    packet = await prepare(f.repo, f.release, f.target, f.reference, f.review),
    bytes = JSON.stringify(packet),
    issued = structuredClone(f.issued.version);
  const draft = await f.repo.revise(f.company.id, f.issued),
    input = structuredClone(draft.version.payload);
  input.project.description = 'Different private draft';
  input.terms = 'Changed draft terms';
  input.lines[0].quantity_milli = 9000;
  await f.repo.save(f.company.id, draft, input);
  expect(await verify(f.repo, f.release, f.target, packet)).toMatchObject({
    status: 'stale',
    preparation_hash: packet.integrity.sha256,
  });
  await expect(
    prepare(f.repo, f.release, f.target, f.reference, f.review),
  ).rejects.toThrow();
  expect(JSON.stringify(packet)).toBe(bytes);
  expect(
    (await f.repo.get(f.company.id, f.issued.estimate.id, f.issued.version.id))
      .version,
  ).toEqual(issued);
});
it.each([
  'scope',
  'selected-option',
  'terms',
  'hash',
  'private',
  'receipt',
  'checklist',
] as const)(
  'rejects altered %s packet even with a caller-recomputed integrity hash',
  async (kind) => {
    const f = await fixture(),
      p = structuredClone(
        await prepare(f.repo, f.release, f.target, f.reference, f.review),
      );
    if (kind === 'scope')
      Object.assign(p.reference.source.scope.project, {
        description: 'Changed scope',
      });
    if (kind === 'selected-option')
      Object.assign(p.reference.source.scope.lines[0], {
        description: 'Unapproved option',
        amount_minor: 1,
      });
    if (kind === 'terms')
      Object.assign(p.reference.source.scope, {
        terms: 'Invented contract terms',
      });
    if (kind === 'hash')
      Object.assign(p.reference.source, { scope_hash: '0'.repeat(64) });
    if (kind === 'private') Object.assign(p, { private_note: 'PRIVATE' });
    if (kind === 'receipt')
      Object.assign(p.reference.receipt, { id: 'other-receipt' });
    if (kind === 'checklist') Object.assign(p.checklist, { scope: false });
    const { integrity, ...content } = p;
    Object.assign(integrity, { sha256: await documentHash(content) });
    expect(await verify(f.repo, f.release, f.target, p)).toMatchObject({
      status: 'unknown',
      preparation_hash: null,
    });
  },
);
it('does not execute getters or inherited serializers in caller input', async () => {
  const f = await fixture(),
    getter = vi.fn(() => true),
    serialize = vi.fn(() => ({})),
    review = structuredClone(f.review);
  Object.defineProperty(review.checks, 'scope', {
    get: getter,
    enumerable: true,
  });
  await expect(
    prepare(f.repo, f.release, f.target, f.reference, review),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
  const packet = structuredClone(
    await prepare(f.repo, f.release, f.target, f.reference, f.review),
  );
  Object.setPrototypeOf(packet, { toJSON: serialize });
  expect((await verify(f.repo, f.release, f.target, packet)).status).toBe(
    'current',
  );
  expect(serialize).not.toHaveBeenCalled();
});
it('denies connected repositories before any source or network read', async () => {
  const f = await fixture(),
    repo = new Phase3Repository(new Operations(false)),
    get = vi.spyOn(repo, 'get');
  await expect(
    prepare(repo, f.release, f.target, f.reference, f.review),
  ).rejects.toThrow();
  expect(get).not.toHaveBeenCalled();
});
it('retains UNKNOWN on missing source and permits only exact read reconciliation without replay', async () => {
  const f = await fixture(),
    packet = await prepare(f.repo, f.release, f.target, f.reference, f.review),
    get = f.repo.get.bind(f.repo),
    commands = vi.spyOn(f.release, 'command');
  vi.spyOn(f.repo, 'get').mockRejectedValue(Error('Unavailable'));
  expect(await verify(f.repo, f.release, f.target, packet)).toMatchObject({
    status: 'unknown',
    preparation_hash: null,
  });
  vi.spyOn(f.repo, 'get').mockImplementation(get);
  expect((await verify(f.repo, f.release, f.target, packet)).status).toBe(
    'current',
  );
  expect(commands).not.toHaveBeenCalled();
});
it('never renews an expired offer or substitutes a newer source', async () => {
  const f = await fixture(),
    packet = await prepare(f.repo, f.release, f.target, f.reference, f.review);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.parse(f.offer.expires_at) + 1));
  expect((await verify(f.repo, f.release, f.target, packet)).status).toBe(
    'stale',
  );
  await expect(
    prepare(f.repo, f.release, f.target, f.reference, f.review),
  ).rejects.toThrow();
});
it('blocks preparation after a real selected-option edit without changing the original accepted issued scope', async () => {
  const f = await fixture(),
    original = structuredClone(f.issued.version),
    draft = await f.repo.revise(f.company.id, f.issued),
    input = structuredClone(draft.version.payload);
  const optionId = crypto.randomUUID();
  input.options = [
    {
      id: optionId,
      label: 'Separate entryway option',
      kind: 'addon',
      group: null,
      selected: true,
      description: 'A newly selected private draft option',
    },
  ];
  input.lines[0].option_id = optionId;
  const saved = await f.repo.save(f.company.id, draft, input);
  expect(saved.version.payload.options[0].selected).toBe(true);
  await expect(
    prepare(f.repo, f.release, f.target, f.reference, f.review),
  ).rejects.toThrow();
  expect(
    (await f.repo.get(f.company.id, f.issued.estimate.id, f.issued.version.id))
      .version,
  ).toEqual(original);
});
