import { openDraftJournal } from '../../server/netlify/replacement-journal.ts';
import {
  prepareOfflinePackage,
  canonical,
  sha1,
  sha256,
  fingerprint,
  executorFingerprint,
  review,
  packageData,
  type PackageInput,
} from '../../server/netlify/replacement-package.ts';
import {
  preflightFingerprint,
  type Approval,
  type Ports,
  type Reply,
  type Request,
  type Snapshot,
  type DeployRecord,
} from '../../server/netlify/replacement-executor.ts';

export function fixtureInput(): PackageInput {
  const paths = [
    ...Object.keys(review.create.redactedBody.files).map((p) =>
      p === 'netlify.toml' ? p : 'dist/' + p,
    ),
    ...Object.keys(review.create.redactedBody.functions).map(
      (n) => `.netlify/functions/${n}.zip`,
    ),
    '.netlify/functions/manifest.json',
  ];
  const contents = Object.fromEntries(
    paths.map((path) => [path, Buffer.from('synthetic bytes for ' + path)]),
  );
  const artifacts = paths.map((path) => ({
    path,
    bytes: contents[path].length,
    sha256: sha256(contents[path]),
  }));
  const body = {
    draft: true,
    async: false,
    files: Object.fromEntries(
      paths
        .filter((p) => p.startsWith('dist/') || p === 'netlify.toml')
        .map((p) => [p.replace(/^dist\//, ''), sha1(contents[p])]),
    ),
    functions: Object.fromEntries(
      Object.keys(review.create.redactedBody.functions).map((n) => [
        n,
        sha256(contents[`.netlify/functions/${n}.zip`]),
      ]),
    ),
    functions_config: structuredClone(
      review.create.redactedBody.functions_config,
    ),
    environment: [
      {
        key: 'SUPABASE_URL',
        value: 'https://synthetic.invalid',
        is_secret: false,
        scopes: ['functions'],
      },
      {
        key: 'SUPABASE_PUBLISHABLE_KEY',
        value: 'synthetic-not-a-credential',
        is_secret: false,
        scopes: ['functions'],
      },
      {
        key: 'PUBLIC_INTAKE_ENABLED',
        value: 'false',
        is_secret: false,
        scopes: ['functions'],
      },
    ],
  };
  const archive = Buffer.from(
    'synthetic archive fixture; not the frozen archive',
  );
  const bodyBytes = Buffer.from(JSON.stringify(body));
  const binding = {
    site: {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'synthetic-test',
      account_id: 'synthetic-team',
    },
    originalDeployId: '1'.repeat(24),
    canonicalCreateBodySha256: sha256(bodyBytes),
    archiveSha256: sha256(archive),
  };
  return {
    binding: Buffer.from(JSON.stringify(binding)),
    body: bodyBytes,
    archive,
    artifacts,
    contents,
  };
}

export function replacementFixture(root: string) {
  const input = fixtureInput(),
    pkg = prepareOfflinePackage(input),
    data = packageData(pkg);
  let wall = Date.parse('2026-10-30T12:00:00Z'),
    mono = 1000,
    presence = mono;
  const clock = () => ({ wall, mono, lastManualPresenceMono: presence });
  const advance = (ms: number, manualPresence = true) => {
    wall += ms;
    mono += ms;
    if (manualPresence) presence = mono;
  };
  const old: DeployRecord = {
    id: data.originalId,
    site_id: data.siteId,
    state: 'uploading',
    context: 'deploy-preview',
    published_at: null,
    manual_deploy: true,
    build_id: null,
    created_at: '2026-10-16T12:59:17.529Z',
    deploy_ssl_url: `https://${data.originalId}--${data.host}`,
  };
  const newId = '2'.repeat(24);
  const created: DeployRecord & {
    required: string[];
    required_functions: string[];
  } = {
    id: newId,
    site_id: data.siteId,
    state: 'uploading',
    context: 'deploy-preview',
    published_at: null,
    manual_deploy: true,
    build_id: null,
    created_at: new Date(wall).toISOString(),
    deploy_ssl_url: `https://${newId}--${data.host}`,
    draft: true,
    required: Object.values(data.files).map((f) => f.sha1),
    required_functions: Object.values(data.functions).map((f) => f.sha256),
  };
  let creations = 0;
  const calls: { method: string; url: string; digest?: string }[] = [];
  const snapshotValue = (): Snapshot => ({
    observedAt: wall,
    inventoryComplete: true,
    environmentComplete: true,
    siteId: data.siteId,
    siteName: data.siteName,
    teamId: data.teamId,
    primary: null,
    gitRepository: null,
    buildSettingsSha256: sha256('original build settings'),
    customDomain: null,
    aliases: [],
    siteEnvironmentKeys: [],
    sharedEnvironmentKeys: [],
    inventory: creations
      ? [structuredClone(old), { ...structuredClone(created), state: 'ready' }]
      : [structuredClone(old)],
    protection: {
      source: 'independent-dashboard',
      observedAt: wall,
      witnessSha256: sha256('synthetic dashboard witness'),
      production: 'Private',
      previews: 'Private',
      teamLoginAll: true,
    },
  });
  const abort = new AbortController();
  const controls = {
    create: async (): Promise<Reply> => ({
      status: 200,
      body: structuredClone(created),
      headers: {
        date: new Date(wall).toUTCString(),
        'x-nf-request-id': 'synthetic-request',
      },
    }),
    put: async (request: Request): Promise<Reply> => {
      const u = new URL(request.url),
        name = u.pathname.split('/').at(-1)!;
      if (u.pathname.includes('/files/')) {
        const path = decodeURIComponent(u.pathname.split('/files/')[1]);
        return {
          status: 200,
          body: {
            id: 'synthetic-file',
            path,
            sha: sha1(request.bytes!),
            size: request.bytes!.length,
          },
        };
      }
      return {
        status: 200,
        body: { id: 'synthetic-function', name, sha: sha256(request.bytes!) },
      };
    },
    read: async (): Promise<Reply> => ({
      status: 200,
      body: {
        ...structuredClone(created),
        state: 'ready',
        required: [],
        required_functions: [],
      },
    }),
    snapshot: async (): Promise<Snapshot> => snapshotValue(),
  };
  const ports: Ports = {
    journal: openDraftJournal(root, pkg.bindingSha256),
    clock,
    signal: abort.signal,
    async request(q) {
      if (!q.url.startsWith('https://netlify-rehearsal.invalid/api/v1/'))
        throw Error('TEST_TRANSPORT_NONLOCAL');
      calls.push({
        method: q.method,
        url: q.url,
        ...(q.bytes ? { digest: sha256(q.bytes) } : {}),
      });
      if (q.method === 'POST') {
        creations++;
        return controls.create();
      }
      if (q.method === 'PUT') return controls.put(q);
      return controls.read();
    },
    snapshot: () => controls.snapshot(),
    async registration(id) {
      return {
        deployId: id,
        files: Object.entries(data.files).map(([path, f]) => ({
          path,
          sha: f.sha1,
          size: f.bytes.length,
        })),
        functions: Object.entries(data.functions).map(([name, f]) => ({
          name,
          sha: f.sha256,
          runtime: 'nodejs24.x',
          invocation_mode: 'stream',
          config: structuredClone(f.config),
        })),
      };
    },
    async perimeter(id, origins, paths) {
      return {
        deployId: id,
        observedAt: wall,
        source: 'cookie-free-get-head',
        probes: origins.flatMap((origin) =>
          paths.flatMap((path) =>
            (['GET', 'HEAD'] as const).map((method) => ({
              origin,
              path,
              method,
              status: 401,
              verdict: 'NETLIFY_CHALLENGE' as const,
              evidenceSha256: fingerprint({ origin, path, method, fake: true }),
            })),
          ),
        ),
      };
    },
    async pause(ms) {
      advance(ms);
    },
  };
  const approval = (): Approval => ({
    kind: 'OFFLINE_TEST_APPROVAL',
    scope: 'NETLIFY_REPLACEMENT_A_D_ONE_ATTEMPT',
    bindingSha256: pkg.bindingSha256,
    bodySha256: pkg.bodySha256,
    packageSha256: pkg.packageSha256,
    executorSha256: executorFingerprint(),
    preflightSha256: preflightFingerprint(snapshotValue()),
    siteId: data.siteId,
    originalId: data.originalId,
    approvedAt: wall,
    expiresAt: wall + 60 * 60000,
  });
  return {
    input,
    pkg,
    data,
    ports,
    controls,
    calls,
    approval,
    advance,
    abort,
    created,
    old,
    newId,
    clock,
    snapshotValue,
    creations: () => creations,
    driftWall: (ms: number) => {
      wall += ms;
    },
    canonical,
  };
}
