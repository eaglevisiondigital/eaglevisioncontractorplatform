import { expect, it } from 'vitest';
import { prototypeFixture } from './program/prototype-fixture';
import { readPrototypeSource } from '../src/lib/program/prototype-source';
import {
  prepareCopilotReview,
  inspectCopilotReview,
} from '../src/lib/program/business-copilot';
import {
  prepareVoiceEstimate,
  inspectVoiceEstimate,
} from '../src/lib/program/voice-estimate';
import {
  prepareTradeEdition,
  inspectTradeEdition,
} from '../src/lib/program/trade-editions';
import {
  prepareProcurementReview,
  verifyProcurementReview,
} from '../src/lib/program/procurement-review';
it('one actual Operations/Phase3 source composes four isolated modules, preserves ownership/canonical source, and rejects all retained reviews after one real save', async () => {
  const f = await prototypeFixture();
  const item = (await f.repo.catalog(f.company.id)).find((x) =>
    ['material', 'product'].includes(x.kind),
  );
  expect(item).toBeDefined();
  if (!item) throw Error('Actual catalog source required');
  const payload = structuredClone(f.bundle.version.payload);
  payload.lines[0] = {
    ...payload.lines[0],
    kind: item.kind,
    unit: item.unit,
    catalog_item_id: item.id,
  };
  f.bundle = await f.repo.save(f.company.id, f.bundle, payload);
  const source = await readPrototypeSource(f.repo, f.target, f.gate);
  const before = {
    history: await f.repo.history(f.company.id, f.target.estimate_id),
    jobs: await f.repo.jobs(f.company.id),
  };
  const [copilot, voice, trade, procurement] = await Promise.all([
    prepareCopilotReview(source, { review_on: '2026-11-02' }, f.gate),
    prepareVoiceEstimate(
      source,
      { transcript: `2 ${item.unit} ${item.name}` },
      f.gate,
    ),
    prepareTradeEdition(
      source,
      { edition: 'roofing', catalog_item_ids: [item.id] },
      f.gate,
    ),
    prepareProcurementReview(
      source,
      {
        kind: 'purchase-review',
        selections: [
          {
            line_id: payload.lines[0].id,
            catalog_item_id: item.id,
            quantity_milli: 2000,
            bid_minor: null,
          },
        ],
      },
      f.gate,
    ),
  ]);
  for (const review of [copilot, voice, trade, procurement]) {
    expect(review.snapshot.target).toEqual(f.target);
    expect(review.snapshot.source_sha256).toBe(source.sha256);
    expect(Object.isFrozen(review.snapshot)).toBe(true);
    expect(
      Object.values(review.snapshot.authority).every((x) => x === false),
    ).toBe(true);
  }
  expect(voice.snapshot.clauses[0].suggestion).toMatchObject({
    catalog_item_id: item.id,
    quantity_milli: 2000,
    unit: item.unit,
  });
  expect(trade.snapshot.catalog_draft_fields[0].catalog_item_id).toBe(item.id);
  expect(procurement.snapshot.selections[0].line_id).toBe(payload.lines[0].id);
  expect({
    history: await f.repo.history(f.company.id, f.target.estimate_id),
    jobs: await f.repo.jobs(f.company.id),
  }).toEqual(before);
  expect(await inspectCopilotReview(copilot)).toMatchObject({
    status: 'CURRENT',
    replacement: null,
  });
  expect(await inspectVoiceEstimate(voice)).toMatchObject({
    status: 'CURRENT',
    replacement: null,
  });
  expect(await inspectTradeEdition(trade)).toMatchObject({
    status: 'CURRENT',
    replacement: null,
  });
  expect(await verifyProcurementReview(procurement)).toBe('CURRENT');
  const retained = [copilot, voice, trade, procurement].map((x) =>
    JSON.stringify(x),
  );
  await f.repo.save(f.company.id, f.bundle, {
    ...f.bundle.version.payload,
    terms:
      'One actual shared-source revision after all four modules reviewed it',
  });
  await expect(inspectCopilotReview(copilot)).rejects.toThrow('Stale');
  await expect(inspectVoiceEstimate(voice)).rejects.toThrow('Stale');
  await expect(inspectTradeEdition(trade)).rejects.toThrow('Stale');
  expect(await verifyProcurementReview(procurement)).toBe('STALE');
  expect(
    [copilot, voice, trade, procurement].map((x) => JSON.stringify(x)),
  ).toEqual(retained);
});
import { prepareStormNetworkReview } from '../src/lib/program/storm-network-review';
it('unassessed incident preserves exact real combined CRM snapshot rather than inventing unknown property evidence', async () => {
  const f = await prototypeFixture();
  expect(f.bundle.version.location_snapshot?.id).toBe(f.target.location_id);
  const source = await readPrototypeSource(f.repo, f.target, f.gate);
  expect(source.snapshot.property_snapshot).toBe(
    f.bundle.version.location_snapshot === null ? 'UNKNOWN' : 'RECORDED',
  );
  const review = await prepareStormNetworkReview(
    f.repo,
    f.target,
    {
      incident_label: 'Unassessed local synthetic incident',
      reported_on: null,
      manual_priority: 'normal',
      conditions: ['CONDITION_NOT_YET_ASSESSED'],
      scope_line_ids: [],
      sharing_purpose: 'INTERNAL_COORDINATION_REVIEW',
    },
    f.gate,
  );
  expect(review.triage.property_snapshot).toBe(
    source.snapshot.property_snapshot,
  );
  expect(review.triage.physical_condition).toBe('UNVERIFIED');
  expect(review.triage.job_association).toBe('NOT_SELECTED');
  expect(review.triage.source_scope).toEqual([]);
});
