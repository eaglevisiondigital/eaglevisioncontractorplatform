import { expect, it } from 'vitest';
import {
  collectReadOnlyNetlifyInventory,
  type InventoryRead,
} from '../server/netlify/read-only-inventory';

const siteId = '757117d4-e660-40f2-8076-ddd207237006';
const deploy = (id: string) => ({
  id,
  site_id: siteId,
  state: 'uploading',
  context: 'deploy-preview',
  published_at: null,
  manual_deploy: true,
  build_id: null,
  created_at: '2026-10-16T12:59:17Z',
  deploy_ssl_url: `https://${id}--example.netlify.app`,
  skew_protection_token: 'NEVER_RETAIN',
});
const signal = new AbortController().signal;

it('returns an allowlisted exact inventory from a bounded GET-only read', async () => {
  const url: string[] = [];
  const read: InventoryRead = async (request) => {
    url.push(request);
    return {
      status: 200,
      body: [deploy('6ad21fa5d00779389b042b97')],
      link: null,
    };
  };
  const result = await collectReadOnlyNetlifyInventory(
    siteId,
    read,
    signal,
    () => 123456,
  );
  expect(url).toEqual([
    `https://api.netlify.com/api/v1/sites/${siteId}/deploys?page=1&per_page=100`,
  ]);
  expect(result.inventoryComplete).toBe(true);
  expect(result.records).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain('NEVER_RETAIN');
});

it('requires every consecutive Link page and preserves exact identities', async () => {
  const body = Array.from({ length: 100 }, (_, i) =>
    deploy(i.toString(16).padStart(24, '0')),
  );
  const read: InventoryRead = async (url) => ({
    status: 200,
    body: new URL(url).searchParams.get('page') === '1' ? body : [deploy('f'.repeat(24))],
    link: new URL(url).searchParams.get('page') === '1'
      ? `<https://api.netlify.com/api/v1/sites/${siteId}/deploys?page=2&per_page=100>; rel="next"`
      : null,
  });
  const result = await collectReadOnlyNetlifyInventory(siteId, read, signal);
  expect(result.records).toHaveLength(101);
});

it('fails closed on truncated, duplicate and foreign site inventory', async () => {
  for (const body of [
    Array.from({ length: 100 }, (_, i) =>
      deploy(i.toString(16).padStart(24, '0')),
    ),
    [deploy('f'.repeat(24)), deploy('f'.repeat(24))],
    [{ ...deploy('f'.repeat(24)), site_id: crypto.randomUUID() }],
  ]) {
    await expect(
      collectReadOnlyNetlifyInventory(
        siteId,
        async () => ({ status: 200, body, link: null }),
        signal,
      ),
    ).rejects.toThrow('NETLIFY_INVENTORY_UNVERIFIED');
  }
});

it('rejects pagination redirects, unexpected links and denied reads', async () => {
  const body = Array.from({ length: 100 }, (_, i) =>
    deploy(i.toString(16).padStart(24, '0')),
  );
  for (const link of [
    `<https://evil.example/api/v1/sites/${siteId}/deploys?page=2&per_page=100>; rel="next"`,
    `<https://api.netlify.com/api/v1/sites/${siteId}/deploys?page=3&per_page=100>; rel="next"`,
  ]) {
    await expect(
      collectReadOnlyNetlifyInventory(
        siteId,
        async () => ({ status: 200, body, link }),
        signal,
      ),
    ).rejects.toThrow();
  }
  await expect(
    collectReadOnlyNetlifyInventory(
      siteId,
      async () => ({ status: 403, body: [], link: null }),
      signal,
    ),
  ).rejects.toThrow();
});
