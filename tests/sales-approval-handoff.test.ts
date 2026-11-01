import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SalesApprovalHandoff } from '../src/components/phase3/SalesApprovalHandoff';
import { afterEach, expect, it, vi } from 'vitest';
import {
  readSalesApprovalHandoff,
  type SalesHandoffTarget,
} from '../src/lib/sales-approval-handoff';
import { customerPreview } from '../src/domain/estimating/customer-preview';
import { documentHash, ReleasePreview } from '../src/domain/release/preview';
import { Operations } from '../src/lib/operations';
import { Phase3Repository } from '../src/lib/phase3';
import { salesHandoffFixture } from './helpers/sales-handoff';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each([0, 1, 2])(
  'reads actual immutable issued scope/offer/receipt for company %i without downstream writes',
  async (index) => {
    const f = await salesHandoffFixture(index);
    const before = {
      release: f.release.read('staff'),
      history: await f.repo.history(f.company.id, f.issued.estimate.id),
      jobs: await f.repo.jobs(f.company.id),
    };
    const value = await readSalesApprovalHandoff(f.repo, f.release, f.target);
    expect(value.status).toBe('scope_matched');
    expect(value.source?.scope).toEqual({
      ...customerPreview(f.issued.version),
      internal_test: true,
    });
    expect(value.source?.scope_hash).toBe(
      await documentHash(value.source?.scope),
    );
    expect(value.receipt).toEqual({
      id: f.receipt.id,
      offer_id: f.offer.id,
      decision: 'accepted',
      consent_version: 'internal-test-v1',
      recorded_at: f.receipt.created_at,
    });
    expect(value.contract_execution).toBe('BLOCKED');
    expect(value.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Contract terms'),
        expect.stringContaining('signing consent'),
        expect.stringContaining('delivery'),
      ]),
    );
    expect(JSON.stringify(value)).not.toMatch(
      /PRIVATE|internal_notes|unit_cost_minor|profit_margin|staff_type|actor_id/,
    );
    value.source!.scope.company.name = 'Consumer change';
    value.source!.scope.project.name = 'Consumer change';
    value.source!.scope.lines[0].amount_minor = 999;
    const again = await readSalesApprovalHandoff(f.repo, f.release, f.target);
    expect(again.source?.scope.company.name).toBe(f.company.name);
    expect(again.source?.scope.lines[0].amount_minor).toBe(30000);
    expect({
      release: f.release.read('staff'),
      history: await f.repo.history(f.company.id, f.issued.estimate.id),
      jobs: await f.repo.jobs(f.company.id),
    }).toEqual(before);
    for (const rows of [
      before.release.release_contracts,
      before.release.release_signatures,
      before.release.release_invoices,
      before.release.release_authorizations,
      before.release.release_payment_events,
      before.release.release_ledger_entries,
    ])
      expect(rows).toEqual([]);
    expect(before.release.release_messages).toHaveLength(1);
    expect(before.release.release_messages[0].channel).toBe('internal_sink');
  },
);

it.each(['declined', 'changes_requested'] as const)(
  'shows actual %s preference as a blocker',
  async (choice) => {
    const f = await salesHandoffFixture(0, choice);
    const value = await readSalesApprovalHandoff(f.repo, f.release, f.target);
    expect(value.status).toBe('blocked');
    expect(value.receipt?.decision).toBe(choice);
    expect(value.blockers.join(' ')).toContain(
      choice === 'declined' ? 'declined' : 'requested changes',
    );
    expect(value.contract_execution).toBe('BLOCKED');
  },
);

it('does not infer a receipt or offer from other available records', async () => {
  const f = await salesHandoffFixture();
  for (const patch of [
    { receipt_id: null },
    { receipt_id: crypto.randomUUID() },
    { offer_id: null, receipt_id: null },
  ]) {
    const value = await readSalesApprovalHandoff(f.repo, f.release, {
      ...f.target,
      ...patch,
    });
    expect(value.status).toBe('blocked');
    expect(value.receipt).toBeNull();
    expect(value.blockers.join(' ')).toContain('UNKNOWN');
  }
  expect(
    (
      await readSalesApprovalHandoff(f.repo, f.release, {
        ...f.target,
        offer_id: crypto.randomUUID(),
      })
    ).status,
  ).toBe('unknown');
});

it('retains original issued scope and marks a newer private draft stale', async () => {
  const f = await salesHandoffFixture();
  const original = structuredClone(f.issued.version);
  const draft = await f.repo.revise(f.company.id, f.issued);
  const input = structuredClone(draft.version.payload);
  input.project.name = 'Later private draft';
  await f.repo.save(f.company.id, draft, input);
  const value = await readSalesApprovalHandoff(f.repo, f.release, f.target);
  expect(value.status).toBe('blocked');
  expect(value.blockers.join(' ')).toContain('Stale source');
  expect(value.source?.version_id).toBe(original.id);
  expect(value.source?.scope.project.name).toBe(original.payload.project.name);
  expect(
    (await f.repo.get(f.company.id, f.issued.estimate.id, original.id)).version,
  ).toEqual(original);
  const draftTarget = { ...f.target, version_id: draft.version.id };
  expect(
    (
      await readSalesApprovalHandoff(
        f.repo,
        new ReleasePreview(f.company.id, draft.version),
        draftTarget,
      )
    ).source,
  ).toBeNull();
});

it('keeps expired receipt evidence without renewing the offer or scope', async () => {
  const f = await salesHandoffFixture();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.parse(f.offer.expires_at) + 1));
  const value = await readSalesApprovalHandoff(f.repo, f.release, f.target);
  expect(value.status).toBe('blocked');
  expect(value.receipt?.id).toBe(f.receipt.id);
  expect(value.blockers.join(' ')).toContain('Expired');
});

it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'estimate_id',
  'version_id',
  'actor_id',
] as const)(
  'denies foreign/missing %s without scope disclosure',
  async (field) => {
    const f = await salesHandoffFixture();
    const value = await readSalesApprovalHandoff(f.repo, f.release, {
      ...f.target,
      [field]: 'foreign-reference',
    });
    expect(value.status).toBe('unknown');
    expect(value.source).toBeNull();
    expect(value.receipt).toBeNull();
  },
);

it('denies field staff, inactive staff and connected repositories before evidence reads', async () => {
  const f = await salesHandoffFixture();
  expect(
    (
      await readSalesApprovalHandoff(f.repo, f.release, {
        ...f.target,
        actor_id: f.company.id + '-field',
      })
    ).source,
  ).toBeNull();
  await f.operations.manageMember(
    f.company.id,
    f.target.actor_id,
    false,
    'staff',
    'estimator',
  );
  expect(
    (await readSalesApprovalHandoff(f.repo, f.release, f.target)).source,
  ).toBeNull();
  const connected = new Phase3Repository(new Operations(false));
  const get = vi.spyOn(connected, 'get');
  expect(
    (await readSalesApprovalHandoff(connected, f.release, f.target)).status,
  ).toBe('unknown');
  expect(get).not.toHaveBeenCalled();
});

it('rechecks membership after the last asynchronous source read', async () => {
  const f = await salesHandoffFixture(),
    get = f.repo.get.bind(f.repo);
  let count = 0;
  vi.spyOn(f.repo, 'get').mockImplementation(async (...args) => {
    const value = await get(...args);
    if (++count === 4)
      await f.operations.manageMember(
        f.company.id,
        f.target.actor_id,
        false,
        'staff',
        'estimator',
      );
    return value;
  });
  expect(
    (await readSalesApprovalHandoff(f.repo, f.release, f.target)).source,
  ).toBeNull();
});

it.each([
  'receipt-offer',
  'receipt-customer',
  'receipt-consent',
  'receipt-choice',
  'offer-scope',
  'offer-version',
  'duplicate-receipt',
  'future',
  'invalid-date',
] as const)('rejects conflicting %s evidence', async (kind) => {
  const f = await salesHandoffFixture(),
    read = f.release.read.bind(f.release);
  vi.spyOn(f.release, 'read').mockImplementation((actor) => {
    const w = read(actor),
      r = w.release_decisions[0],
      o = w.release_offers[0];
    if (kind === 'receipt-offer') r.offer_id = crypto.randomUUID();
    if (kind === 'receipt-customer') r.customer_id = crypto.randomUUID();
    if (kind === 'receipt-consent') r.consent_version = 'different-v1';
    if (kind === 'receipt-choice')
      Object.assign(r, { decision: new String('accepted') });
    if (kind === 'offer-scope')
      o.snapshot.project.description = 'Changed scope';
    if (kind === 'offer-version') o.version_id = crypto.randomUUID();
    if (kind === 'duplicate-receipt')
      w.release_decisions.push(structuredClone(r));
    if (kind === 'future') r.created_at = '2099-01-01T00:00:00.000Z';
    if (kind === 'invalid-date') o.expires_at = '2030-02-31T00:00:00.000Z';
    return w;
  });
  const value = await readSalesApprovalHandoff(f.repo, f.release, f.target);
  expect(value.status).toBe('unknown');
  expect(value.source).toBeNull();
  expect(value.receipt).toBeNull();
});

it('rejects caller-mutated source and object-valued source/target primitives without string coercion', async () => {
  const f = await salesHandoffFixture();
  f.issued.version.company_snapshot.name = 'Caller changed snapshot';
  expect(
    (await readSalesApprovalHandoff(f.repo, f.release, f.target)).source,
  ).toBeNull();
  const g = await salesHandoffFixture();
  const selected = {
    ...g.target,
    customer_id: new String(g.target.customer_id),
  } as unknown as SalesHandoffTarget;
  expect(
    (await readSalesApprovalHandoff(g.repo, g.release, selected)).source,
  ).toBeNull();
  const get = g.repo.get.bind(g.repo);
  vi.spyOn(g.repo, 'get').mockImplementation(async (...args) => {
    const result = await get(...args);
    Object.assign(result.version.company_snapshot, {
      name: { private: 'PRIVATE' },
    });
    return result;
  });
  Object.assign(g.release.version.company_snapshot, {
    name: { private: 'PRIVATE' },
  });
  expect(
    (await readSalesApprovalHandoff(g.repo, g.release, g.target)).source,
  ).toBeNull();
});

it('treats read loss as UNKNOWN and never calls command or any writer', async () => {
  const f = await salesHandoffFixture();
  const command = vi.spyOn(f.release, 'command'),
    save = vi.spyOn(f.repo, 'save'),
    approve = vi.spyOn(f.repo, 'approveJob');
  vi.spyOn(f.repo, 'get').mockRejectedValue(Error('Simulated source loss'));
  const value = await readSalesApprovalHandoff(f.repo, f.release, f.target);
  expect(value.status).toBe('unknown');
  expect(value.source).toBeNull();
  expect(command).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  expect(approve).not.toHaveBeenCalled();
});

it('keeps the unmounted component default off and rejects connected opt-in before reading', async () => {
  const f = await salesHandoffFixture();
  const get = vi.spyOn(f.repo, 'get');
  expect(
    renderToStaticMarkup(
      createElement(SalesApprovalHandoff, {
        repo: f.repo,
        release: f.release,
        target: f.target,
      }),
    ),
  ).toBe('');
  expect(get).not.toHaveBeenCalled();
  const connected = new Phase3Repository(new Operations(false));
  const connectedGet = vi.spyOn(connected, 'get');
  expect(
    renderToStaticMarkup(
      createElement(SalesApprovalHandoff, {
        repo: connected,
        release: f.release,
        target: f.target,
        enabled: true,
      }),
    ),
  ).toBe('');
  expect(connectedGet).not.toHaveBeenCalled();
});
