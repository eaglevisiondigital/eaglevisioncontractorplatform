/** Netlify read-only GET inventory adapter. No credential loading, mutation or approval. */
import type { DeployRecord } from './replacement-executor.ts';

export interface InventoryPage {
  status: number;
  body: unknown;
  link: string | null;
}
export type InventoryRead = (
  url: string,
  signal: AbortSignal,
) => Promise<InventoryPage>;
export interface InventoryEvidence {
  source: 'netlify-api-read-only';
  siteId: string;
  observedAt: number;
  inventoryComplete: true;
  records: DeployRecord[];
}
const API = 'https://api.netlify.com/api/v1';
const ID = /^[a-f0-9]{24}$/;
const UUID = /^[a-f0-9-]{36}$/;
const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const fail = () => Error('NETLIFY_INVENTORY_UNVERIFIED');

function parseRecord(value: unknown, siteId: string): DeployRecord {
  if (!plain(value)) throw fail();
  const v = value;
  if (
    typeof v.id !== 'string' ||
    !ID.test(v.id) ||
    v.site_id !== siteId ||
    typeof v.state !== 'string' ||
    !/^[a-z_]{1,32}$/.test(v.state) ||
    typeof v.context !== 'string' ||
    v.context.length > 64 ||
    typeof v.created_at !== 'string' ||
    !Number.isFinite(Date.parse(v.created_at)) ||
    (v.published_at !== null &&
      (typeof v.published_at !== 'string' ||
        !Number.isFinite(Date.parse(v.published_at)))) ||
    typeof v.manual_deploy !== 'boolean' ||
    (v.build_id !== null && typeof v.build_id !== 'string') ||
    typeof v.deploy_ssl_url !== 'string' ||
    !v.deploy_ssl_url.startsWith('https://')
  )
    throw fail();
  return {
    id: v.id,
    site_id: siteId,
    state: v.state,
    context: v.context,
    published_at: v.published_at,
    manual_deploy: v.manual_deploy,
    build_id: v.build_id,
    created_at: v.created_at,
    deploy_ssl_url: v.deploy_ssl_url,
    ...(typeof v.draft === 'boolean' ? { draft: v.draft } : {}),
  } as DeployRecord;
}

function nextPage(header: string | null, siteId: string, current: number) {
  if (header === null || header === '') return null;
  if (header.length > 4096) throw fail();
  const links = header.split(',').map((part) => part.trim());
  const next = links.filter((x) => /;\s*rel="next"\s*$/.test(x));
  if (next.length > 1) throw fail();
  if (!next.length) return null;
  const match = /^<([^<>]+)>;\s*rel="next"\s*$/.exec(next[0]);
  if (!match) throw fail();
  const url = new URL(match[1]);
  if (
    url.origin !== 'https://api.netlify.com' ||
    url.pathname !== `/api/v1/sites/${siteId}/deploys` ||
    [...url.searchParams.keys()].sort().join(',') !== 'page,per_page' ||
    url.searchParams.get('page') !== String(current + 1) ||
    url.searchParams.get('per_page') !== '100' ||
    url.username ||
    url.password ||
    url.hash
  )
    throw fail();
  return current + 1;
}

/**
 * Requires complete, consecutive, bounded Link pagination. Rejects an ambiguous
 * full final page without a next link. Results do NOT establish independent
 * dashboard protection, environment inventory, the primary, or approval.
 */
export async function collectReadOnlyNetlifyInventory(
  siteId: string,
  read: InventoryRead,
  signal: AbortSignal,
  now: () => number = Date.now,
): Promise<InventoryEvidence> {
  if (!UUID.test(siteId)) throw fail();
  const records: DeployRecord[] = [];
  const ids = new Set<string>();
  for (let page = 1; page <= 20; page++) {
    if (signal.aborted) throw fail();
    const url = `${API}/sites/${siteId}/deploys?page=${page}&per_page=100`;
    const result = await read(url, signal);
    if (
      signal.aborted ||
      result.status !== 200 ||
      !Array.isArray(result.body) ||
      result.body.length > 100
    )
      throw fail();
    for (const raw of result.body) {
      const record = parseRecord(raw, siteId);
      if (ids.has(record.id)) throw fail();
      ids.add(record.id);
      records.push(record);
    }
    const next = nextPage(result.link, siteId, page);
    if (next === null) {
      // Exactly 100 with no next may conceal a truncated inventory.
      if (result.body.length === 100) throw fail();
      const timestamp = now();
      if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw fail();
      return {
        source: 'netlify-api-read-only',
        siteId,
        observedAt: timestamp,
        inventoryComplete: true,
        records,
      };
    }
    if (result.body.length !== 100) throw fail();
  }
  throw fail();
}
