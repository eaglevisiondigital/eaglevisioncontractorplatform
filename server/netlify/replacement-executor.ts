import {
  packageData,
  executorFingerprint,
  fingerprint,
  isDeployId,
  isHash,
  requireThat,
  sha1,
  sha256,
  type PreparedPackage,
  type PackageData,
} from './replacement-package.ts';
import {
  frozenJournalMatches,
  type DraftJournal,
} from './replacement-journal.ts';

export interface Approval {
  kind: 'OWNER_EXECUTION_APPROVAL' | 'OFFLINE_TEST_APPROVAL';
  scope: 'NETLIFY_REPLACEMENT_A_D_ONE_ATTEMPT';
  bindingSha256: string;
  bodySha256: string;
  packageSha256: string;
  executorSha256: string;
  preflightSha256: string;
  siteId: string;
  originalId: string;
  approvedAt: number;
  expiresAt: number;
}
export interface DeployRecord {
  id: string;
  site_id: string;
  state: string;
  context: string;
  published_at: string | null;
  manual_deploy: boolean;
  build_id: string | null;
  created_at: string;
  deploy_ssl_url: string;
  draft?: boolean;
}
export interface Snapshot {
  observedAt: number;
  inventoryComplete: boolean;
  environmentComplete: boolean;
  siteId: string;
  siteName: string;
  teamId: string;
  primary: { id: string; publishedAt: string } | null;
  gitRepository: string | null;
  buildSettingsSha256: string;
  customDomain: string | null;
  aliases: string[];
  siteEnvironmentKeys: string[];
  sharedEnvironmentKeys: string[];
  inventory: DeployRecord[];
  protection: {
    source: 'independent-dashboard';
    observedAt: number;
    witnessSha256: string;
    production: 'Private';
    previews: 'Private';
    teamLoginAll: boolean;
  };
}
export function preflightFingerprint(s: Snapshot) {
  return fingerprint({
    ...s,
    observedAt: 0,
    inventory: [...s.inventory].sort((a, b) => a.id.localeCompare(b.id)),
    protection: { ...s.protection, observedAt: 0 },
  });
}
export interface Request {
  method: 'POST' | 'PUT' | 'GET';
  url: string;
  contentType?: string;
  bytes?: Uint8Array;
}
export interface Reply {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}
export interface Registration {
  deployId: string;
  files: { path: string; sha: string; size: number }[];
  functions: {
    name: string;
    sha: string;
    runtime: string;
    invocation_mode: string;
    config: unknown;
  }[];
}
export interface PerimeterEvidence {
  deployId: string;
  observedAt: number;
  source: 'cookie-free-get-head';
  probes: {
    origin: string;
    path: string;
    method: 'GET' | 'HEAD';
    status: number;
    verdict: 'NETLIFY_CHALLENGE' | 'EXPOSED' | 'INCONCLUSIVE';
    evidenceSha256: string;
  }[];
}
export interface Ports {
  journal: DraftJournal;
  clock(): { wall: number; mono: number; lastManualPresenceMono: number };
  signal: AbortSignal;
  /** Trusted adapters must make exactly one transmission, no redirects/retries.
   * No live implementation, credential loader or execution CLI is supplied here. */
  request(request: Request, signal: AbortSignal): Promise<Reply>;
  snapshot(signal: AbortSignal): Promise<Snapshot>;
  registration(deployId: string, signal: AbortSignal): Promise<Registration>;
  perimeter(
    deployId: string,
    origins: string[],
    paths: string[],
    signal: AbortSignal,
  ): Promise<PerimeterEvidence>;
  pause(ms: number, signal: AbortSignal): Promise<void>;
}
export interface Result {
  state: 'NO_GO' | 'STOPPED' | 'UNKNOWN' | 'VERIFIED_DRAFT';
  code: string;
  deployId?: string;
}
const MINUTE = 60000;
const allowedStates = ['uploading', 'uploaded', 'processing', 'ready'];
const plain = (v: unknown): v is Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const code = (e: unknown) =>
  e instanceof Error && /^[A-Z0-9_]{1,80}$/.test(e.message)
    ? e.message
    : 'UNCONFIRMED_OPERATION';
const time = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
function safeInitial(r: Reply) {
  const b = plain(r.body) ? r.body : {};
  const keep = (v: unknown) => {
    const text = JSON.stringify(v);
    return text !== undefined && text.length <= 4096
      ? (JSON.parse(text) as unknown)
      : { omitted: 'MISSING_OR_OVERSIZE', sha256: sha256(text ?? '') };
  };
  const result: Record<string, unknown> = { status: r.status };
  for (const key of [
    'id',
    'site_id',
    'state',
    'draft',
    'context',
    'published_at',
    'manual_deploy',
    'build_id',
    'created_at',
    'deploy_ssl_url',
    'required',
    'required_functions',
    'required_edge_functions',
    'required_server',
    'function_schedules',
  ])
    result[key] = key in b ? keep(b[key]) : { omitted: true };
  // Only bounded non-cookie metadata; never retain arbitrary response headers/body.
  result.metadata = Object.fromEntries(
    Object.entries(r.headers ?? {})
      .filter(
        ([k, v]) =>
          ['date', 'content-type', 'x-nf-request-id', 'x-request-id'].includes(
            k.toLowerCase(),
          ) && /^[\x20-\x7e]{1,200}$/.test(v),
      )
      .map(([k, v]) => [k.toLowerCase(), v]),
  );
  return result;
}
function validateDeploy(d: unknown, p: PackageData, id: string) {
  requireThat(
    plain(d) &&
      d.id === id &&
      d.site_id === p.siteId &&
      d.manual_deploy === true &&
      d.build_id === null &&
      d.context === 'deploy-preview' &&
      d.published_at === null &&
      d.draft !== false &&
      (!('draft' in d) || d.draft === true) &&
      d.deploy_ssl_url === `https://${id}--${p.host}` &&
      allowedStates.includes(String(d.state)) &&
      typeof d.created_at === 'string' &&
      Number.isFinite(Date.parse(d.created_at)),
    'DEPLOY_SCOPE_OR_STATE',
  );
  for (const key of [
    'required_edge_functions',
    'required_server',
    'function_schedules',
  ])
    requireThat(
      !(key in d) || (Array.isArray(d[key]) && d[key].length === 0),
      'UNREVIEWED_EXECUTABLE_REQUIREMENT',
    );
}
function validateSnapshot(
  s: Snapshot,
  p: PackageData,
  wall: number,
  newId?: string,
  baseline?: Snapshot,
) {
  requireThat(
    s &&
      s.siteId === p.siteId &&
      s.siteName === p.siteName &&
      s.teamId === p.teamId &&
      s.inventoryComplete === true &&
      s.environmentComplete === true,
    'PREFLIGHT_IDENTITY_OR_COMPLETENESS',
  );
  requireThat(
    time(s.observedAt) && s.observedAt <= wall && wall - s.observedAt <= MINUTE,
    'PREFLIGHT_STALE',
  );
  const a = s.protection;
  requireThat(
    a &&
      a.source === 'independent-dashboard' &&
      a.production === 'Private' &&
      a.previews === 'Private' &&
      a.teamLoginAll === true &&
      isHash(a.witnessSha256) &&
      time(a.observedAt) &&
      a.observedAt <= wall &&
      wall - a.observedAt <= 24 * 60 * MINUTE,
    'INDEPENDENT_PROTECTION_REQUIRED',
  );
  requireThat(
    s.primary === null &&
      s.gitRepository === null &&
      s.customDomain === null &&
      Array.isArray(s.aliases) &&
      s.aliases.length === 0 &&
      Array.isArray(s.siteEnvironmentKeys) &&
      s.siteEnvironmentKeys.length === 0 &&
      Array.isArray(s.sharedEnvironmentKeys) &&
      s.sharedEnvironmentKeys.length === 0 &&
      isHash(s.buildSettingsSha256),
    'BASELINE_CONFIGURATION_DRIFT',
  );
  requireThat(
    Array.isArray(s.inventory) &&
      s.inventory.length === (newId ? 2 : 1) &&
      new Set(s.inventory.map((d) => d.id)).size === s.inventory.length,
    'DEPLOY_INVENTORY_DRIFT',
  );
  const old = s.inventory.find((d) => d.id === p.originalId);
  requireThat(
    old &&
      old.site_id === p.siteId &&
      old.state === 'uploading' &&
      old.context === 'deploy-preview' &&
      old.published_at === null &&
      old.manual_deploy === true &&
      old.build_id === null,
    'ORIGINAL_DEPLOY_DRIFT',
  );
  if (newId)
    validateDeploy(
      s.inventory.find((d) => d.id === newId),
      p,
      newId,
    );
  if (baseline) {
    const comparable = {
      ...s,
      inventory: s.inventory.filter((d) => d.id !== newId),
      protection: {
        ...s.protection,
        witnessSha256: baseline.protection.witnessSha256,
      },
    };
    requireThat(
      preflightFingerprint(comparable) === preflightFingerprint(baseline),
      'ORIGINAL_OR_SITE_CHANGED',
    );
  }
}
function requested(v: unknown, length: number, universe: string[]) {
  requireThat(
    Array.isArray(v) &&
      v.length <= universe.length &&
      v.every(
        (x) =>
          typeof x === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(x),
      ) &&
      new Set(v).size === v.length &&
      v.every((x) => universe.filter((h) => h === x).length === 1),
    'INITIAL_REQUIRED_LIST',
  );
  return v as string[];
}
function matchesPath(actual: unknown, expected: string) {
  return actual === expected || actual === '/' + expected;
}

const executing = new WeakSet<DraftJournal>();

/** Actual bounded algorithm. All effects go through injected, supervised ports;
 * importing this module cannot contact Netlify or load credentials/private values. */
export async function executeReplacement(
  pkg: PreparedPackage,
  rawApproval: Approval | null,
  ports: Ports,
): Promise<Result> {
  let claimed = false,
    uncertain = false,
    deployId: string | undefined;
  let stopAt = Infinity;
  const started = ports.clock();
  const p = packageData(pkg);
  const approval = structuredClone(rawApproval);
  if (executing.has(ports.journal))
    return { state: 'UNKNOWN', code: 'CONCURRENT_EXECUTOR_NO_REPLAY' };
  executing.add(ports.journal);
  const persist: DraftJournal['append'] = (kind, data) => {
    try {
      ports.journal.append(kind, data);
    } catch {
      uncertain = true;
      throw Error('JOURNAL_UNCONFIRMED');
    }
  };
  const guard = (mutation = false) => {
    const now = ports.clock();
    requireThat(!ports.signal.aborted, 'INTERRUPTED');
    requireThat(
      time(now.wall) &&
        time(now.mono) &&
        time(now.lastManualPresenceMono) &&
        now.mono >= started.mono &&
        now.wall >= started.wall &&
        Math.abs(now.wall - started.wall - (now.mono - started.mono)) <= 120000,
      'CLOCK_MISMATCH',
    );
    requireThat(
      now.lastManualPresenceMono <= now.mono &&
        now.mono - now.lastManualPresenceMono <= MINUTE,
      'MANUAL_SUPERVISION_LOST',
    );
    requireThat(
      approval &&
        now.wall + (mutation ? MINUTE : 0) < approval.expiresAt &&
        now.mono + (mutation ? MINUTE : 0) <
          Math.min(started.mono + 45 * MINUTE, stopAt),
      'DEADLINE',
    );
    requireThat(
      executorFingerprint() === approval.executorSha256,
      'EXECUTOR_DRIFT',
    );
    return now;
  };
  const bounded = async <T>(
    fn: (s: AbortSignal) => Promise<T>,
    mutation = false,
  ): Promise<T> => {
    const now = guard(mutation);
    const ms = Math.min(
      mutation ? MINUTE : 20000,
      Math.min(started.mono + 45 * MINUTE, stopAt) - now.mono,
      approval!.expiresAt - now.wall,
    );
    const signal = AbortSignal.any([
      ports.signal,
      AbortSignal.timeout(Math.max(1, Math.floor(ms))),
    ]);
    let onAbort: () => void = () => {};
    try {
      return await Promise.race([
        Promise.resolve().then(() => {
          requireThat(!signal.aborted, 'INTERRUPTED');
          return fn(signal);
        }),
        new Promise<never>((_, reject) => {
          onAbort = () => reject(Error('RESPONSE_TIMEOUT_OR_INTERRUPTION'));
          signal.addEventListener('abort', onAbort, { once: true });
          if (signal.aborted) onAbort();
        }),
      ]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  };
  const request = async (q: Request, mutation = false) =>
    structuredClone(
      await bounded((s) => ports.request(structuredClone(q), s), mutation),
    );
  try {
    requireThat(
      time(started.wall) &&
        time(started.mono) &&
        approval &&
        Object.keys(approval).sort().join(',') ===
          'approvedAt,bindingSha256,bodySha256,executorSha256,expiresAt,kind,originalId,packageSha256,preflightSha256,scope,siteId' &&
        approval.scope === 'NETLIFY_REPLACEMENT_A_D_ONE_ATTEMPT' &&
        approval.kind ===
          (pkg.mode === 'frozen'
            ? 'OWNER_EXECUTION_APPROVAL'
            : 'OFFLINE_TEST_APPROVAL') &&
        approval.bindingSha256 === pkg.bindingSha256 &&
        approval.bodySha256 === pkg.bodySha256 &&
        approval.packageSha256 === pkg.packageSha256 &&
        approval.siteId === p.siteId &&
        approval.originalId === p.originalId &&
        isHash(approval.preflightSha256) &&
        time(approval.approvedAt) &&
        time(approval.expiresAt) &&
        approval.approvedAt <= started.wall &&
        approval.expiresAt > started.wall &&
        approval.expiresAt - approval.approvedAt <= 24 * 60 * MINUTE,
      'EXACT_OWNER_APPROVAL_REQUIRED',
    );
    requireThat(
      ports.journal.scope === pkg.bindingSha256 &&
        (pkg.mode !== 'frozen' ||
          frozenJournalMatches(ports.journal, pkg.bindingSha256)),
      'FIXED_PRIVATE_JOURNAL_REQUIRED',
    );
    let existing;
    try {
      existing = ports.journal.inspect();
    } catch {
      return { state: 'UNKNOWN', code: 'JOURNAL_UNREADABLE_NO_REPLAY' };
    }
    if (existing.state !== 'UNSTARTED')
      return {
        state: existing.state === 'UNKNOWN' ? 'UNKNOWN' : 'STOPPED',
        code: 'EXISTING_ATTEMPT_NO_REPLAY',
      };
    const before = structuredClone(await bounded((s) => ports.snapshot(s)));
    validateSnapshot(before, p, guard().wall);
    requireThat(
      preflightFingerprint(before) === approval.preflightSha256,
      'APPROVED_PREFLIGHT_CHANGED',
    );
    // Permanently burn one scope, independent of approval ID, before any transmission.
    claimed = true;
    uncertain = true;
    try {
      ports.journal.start(fingerprint(approval));
    } catch {
      throw Error('JOURNAL_UNCONFIRMED');
    }
    uncertain = false;
    guard(true);
    persist('CREATE_SEND', {
      bodySha256: pkg.bodySha256,
      bindingSha256: pkg.bindingSha256,
      wall: started.wall,
      mono: started.mono,
    });
    uncertain = true;
    const created = await request(
      {
        method: 'POST',
        url: `${p.api}/sites/${p.siteId}/deploys`,
        contentType: 'application/json',
        bytes: p.body,
      },
      true,
    );
    persist('INITIAL_RESPONSE', safeInitial(created));
    requireThat(
      created.status === 200 &&
        plain(created.body) &&
        isDeployId(created.body.id),
      'CREATE_ACK_UNCONFIRMED',
    );
    deployId = created.body.id;
    uncertain = false;
    requireThat(
      !before.inventory.some((d) => d.id === deployId),
      'NEW_ID_ALREADY_EXISTS',
    );
    validateDeploy(created.body, p, deployId);
    const expectedCreatedAt = created.body.created_at;
    const required = requested(
      created.body.required,
      40,
      Object.values(p.files).map((f) => f.sha1),
    );
    const requiredFunctions = requested(
      created.body.required_functions,
      64,
      Object.values(p.functions).map((f) => f.sha256),
    );
    const providerTime = Date.parse(String(created.body.created_at));
    requireThat(
      Math.abs(providerTime - started.wall) <= 120000,
      'CREATE_CLOCK_MISMATCH',
    );
    stopAt =
      started.mono +
      (Math.min(providerTime, started.wall) + 5.5 * 60 * MINUTE - started.wall);
    guard();
    // This expected optional-field omission never loses or replaces initial queues.
    if (!('draft' in created.body)) {
      const corroboration = await request({
        method: 'GET',
        url: `${p.api}/sites/${p.siteId}/deploys/${deployId}`,
      });
      requireThat(
        corroboration.status === 200,
        'DRAFT_CORROBORATION_UNCONFIRMED',
      );
      validateDeploy(corroboration.body, p, deployId);
      requireThat(
        (corroboration.body as Record<string, unknown>).created_at ===
          expectedCreatedAt,
        'CREATION_TIME_DRIFT',
      );
      const snapshot = structuredClone(await bounded((s) => ports.snapshot(s)));
      validateSnapshot(snapshot, p, guard().wall, deployId, before);
    }
    for (const kind of ['file', 'function'] as const) {
      const hashes = kind === 'file' ? required : requiredFunctions;
      for (const wanted of hashes) {
        guard(true);
        const entries =
          kind === 'file'
            ? Object.entries(p.files).filter(([, f]) => f.sha1 === wanted)
            : Object.entries(p.functions).filter(
                ([, f]) => f.sha256 === wanted,
              );
        requireThat(entries.length === 1, 'NONUNIQUE_ARTIFACT');
        const [name, item] = entries[0];
        requireThat(
          sha256(item.bytes) === item.sha256 &&
            (kind !== 'file' || sha1(item.bytes) === wanted),
          'PRESEND_ARTIFACT_DRIFT',
        );
        const prefix = kind === 'file' ? 'FILE' : 'FUNCTION';
        persist(`${prefix}_SEND`, {
          name,
          digest: wanted,
          bytes: item.bytes.length,
        });
        uncertain = true;
        const suffix =
          kind === 'file'
            ? `files/${name.split('/').map(encodeURIComponent).join('/')}`
            : `functions/${name}?runtime=nodejs24.x&invocation_mode=stream`;
        const response = await request(
          {
            method: 'PUT',
            url: `${p.api}/deploys/${deployId}/${suffix}`,
            contentType: 'application/octet-stream',
            bytes: item.bytes,
          },
          true,
        );
        const b = response.body;
        requireThat(
          response.status === 200 &&
            plain(b) &&
            b.sha === wanted &&
            (kind === 'file'
              ? matchesPath(b.path, name) && b.size === item.bytes.length
              : b.name === name),
          'UPLOAD_ACK_UNCONFIRMED',
        );
        persist(`${prefix}_RECEIPT`, {
          name,
          digest: wanted,
          bytes: item.bytes.length,
          status: response.status,
        });
        uncertain = false;
      }
    }
    let ready = false;
    for (let poll = 0; poll < 60; poll++) {
      const r = await request({
        method: 'GET',
        url: `${p.api}/sites/${p.siteId}/deploys/${deployId}`,
      });
      requireThat(r.status === 200, 'STATE_READ_UNCONFIRMED');
      validateDeploy(r.body, p, deployId);
      requireThat(
        (r.body as Record<string, unknown>).created_at === expectedCreatedAt,
        'CREATION_TIME_DRIFT',
      );
      if ((r.body as Record<string, unknown>).state === 'ready') {
        ready = true;
        break;
      }
      await bounded((s) => ports.pause(10000, s));
    }
    requireThat(ready, 'READY_NOT_OBSERVED');
    const registration = structuredClone(
      await bounded((s) => ports.registration(deployId!, s)),
    );
    requireThat(
      registration.deployId === deployId &&
        Array.isArray(registration.files) &&
        registration.files.length === 9 &&
        new Set(registration.files.map((f) => f.path.replace(/^\//, '')))
          .size === 9,
      'FILE_REGISTRATION',
    );
    for (const [name, f] of Object.entries(p.files))
      requireThat(
        registration.files.some(
          (x) =>
            matchesPath(x.path, name) &&
            x.sha === f.sha1 &&
            x.size === f.bytes.length,
        ),
        'FILE_REGISTRATION',
      );
    requireThat(
      Array.isArray(registration.functions) &&
        registration.functions.length === 4 &&
        new Set(registration.functions.map((f) => f.name)).size === 4,
      'FUNCTION_REGISTRATION',
    );
    for (const [name, f] of Object.entries(p.functions))
      requireThat(
        registration.functions.some(
          (x) =>
            x.name === name &&
            x.sha === f.sha256 &&
            x.runtime === 'nodejs24.x' &&
            x.invocation_mode === 'stream' &&
            fingerprint(x.config) === fingerprint(f.config),
        ),
        'FUNCTION_METADATA_UNVERIFIED',
      );
    const after = structuredClone(await bounded((s) => ports.snapshot(s)));
    validateSnapshot(after, p, guard().wall, deployId, before);
    requireThat(
      after.inventory.find((d) => d.id === deployId)?.state === 'ready' &&
        after.inventory.find((d) => d.id === deployId)?.created_at ===
          expectedCreatedAt,
      'DRAFT_NO_LONGER_READY',
    );
    const origins = [`https://${p.host}`, `https://${deployId}--${p.host}`];
    const perimeter = structuredClone(
      await bounded((s) =>
        ports.perimeter(deployId!, [...origins], [...p.paths], s),
      ),
    );
    requireThat(
      perimeter.deployId === deployId &&
        perimeter.source === 'cookie-free-get-head' &&
        time(perimeter.observedAt) &&
        perimeter.observedAt <= guard().wall &&
        guard().wall - perimeter.observedAt <= MINUTE &&
        Array.isArray(perimeter.probes) &&
        perimeter.probes.length === origins.length * p.paths.length * 2,
      'PERIMETER_INCOMPLETE',
    );
    for (const origin of origins)
      for (const path of p.paths)
        for (const method of ['GET', 'HEAD']) {
          const probes = perimeter.probes.filter(
            (x) =>
              x.origin === origin && x.path === path && x.method === method,
          );
          requireThat(
            probes.length === 1 &&
              probes[0].verdict === 'NETLIFY_CHALLENGE' &&
              [301, 302, 303, 307, 308, 401, 403].includes(probes[0].status) &&
              isHash(probes[0].evidenceSha256),
            'PERIMETER_NOT_PROVEN',
          );
        }
    const finalSnapshot = structuredClone(
      await bounded((s) => ports.snapshot(s)),
    );
    validateSnapshot(finalSnapshot, p, guard().wall, deployId, before);
    requireThat(
      finalSnapshot.inventory.find((d) => d.id === deployId)?.state ===
        'ready' &&
        finalSnapshot.inventory.find((d) => d.id === deployId)?.created_at ===
          expectedCreatedAt,
      'DRAFT_NO_LONGER_READY',
    );
    guard();
    persist('TERMINAL', {
      state: 'VERIFIED_DRAFT',
      code: 'A_D_FINISHED_NO_PUBLICATION',
      deployId,
      registrationSha256: fingerprint(registration),
      snapshotSha256: preflightFingerprint(finalSnapshot),
      perimeterSha256: fingerprint(perimeter),
    });
    return {
      state: 'VERIFIED_DRAFT',
      code: 'A_D_FINISHED_NO_PUBLICATION',
      deployId,
    };
  } catch (error) {
    let state: Result['state'] = uncertain
      ? 'UNKNOWN'
      : claimed
        ? 'STOPPED'
        : 'NO_GO';
    const reason = code(error);
    if (claimed) {
      try {
        persist('TERMINAL', {
          state,
          code: reason,
          ...(deployId ? { deployId } : {}),
        });
      } catch {
        state = 'UNKNOWN';
      }
    }
    return { state, code: reason, ...(deployId ? { deployId } : {}) };
  } finally {
    executing.delete(ports.journal);
  }
}
