import { rolldown } from 'rolldown';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  lstatSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
const root = realpathSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..'),
);
const prefix = 'server/customer/custody-lab/aws-experiment/';
export const SOURCE_FILES = [
  ...[
    'package.ts',
    'limits.ts',
    'runner.ts',
    'validation.ts',
    'provider.ts',
    'index.ts',
  ].map((f) => prefix + f),
  'server/customer/custody-lab/protocol.ts',
  'server/property/command-custody.ts',
  'src/lib/customer-requests.ts',
  'server/customer/request-gateway.ts',
  'scripts/prepare-aws-custody-package.mjs',
  'package.json',
  'package-lock.json',
];
const sha = (v) => createHash('sha256').update(v).digest('hex');
export async function prepare(output, privateBindings) {
  output = realpathSync(output);
  const stat = lstatSync(output);
  if (
    !stat.isDirectory() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o777) !== 0o700 ||
    output === root ||
    output.startsWith(root + '/')
  )
    throw Error('Owned private output outside repository required');
  const build = mkdtempSync(
    join(realpathSync(tmpdir()), 'propel-offline-bundle-'),
  );
  try {
    const bundle = await rolldown({
      input: join(root, prefix + 'index.ts'),
      platform: 'node',
      external: (id) => id.startsWith('node:'),
    });
    try {
      await bundle.write({ format: 'esm', file: join(build, 'package.mjs') });
    } finally {
      await bundle.close();
    }
    const api = await import(pathToFileURL(join(build, 'package.mjs')).href);
    const synthetic = {
      account: '0'.repeat(12),
      experiment: '35e58593-769c-45c1-8cd6-694f51b30a96',
      start: '2026-11-11T00:00:00.000Z',
      end: '2026-11-11T02:00:00.000Z',
      principals: Object.fromEntries(
        ['admin', 'runner', 'reviewer'].map((r) => [
          r,
          `arn:aws:iam::${'0'.repeat(12)}:user/fixture-${r}`,
        ]),
      ),
    };
    let bindings = synthetic;
    if (privateBindings) {
      const file = lstatSync(privateBindings);
      if (
        !file.isFile() ||
        file.isSymbolicLink() ||
        file.uid !== process.getuid?.() ||
        (file.mode & 0o777) !== 0o600
      )
        throw Error('Private bindings file required');
      try {
        bindings = JSON.parse(readFileSync(privateBindings, 'utf8'));
      } catch {
        throw Error('Invalid private bindings JSON');
      }
    }
    const p = api.bindPackage(bindings);
    api.validatePackage(p);
    const encode = (v) => {
      let text = api.canonical ? api.canonical(v) : JSON.stringify(v);
      if (!privateBindings) {
        for (const role of ['admin', 'runner', 'reviewer'])
          text = text.replaceAll(
            synthetic.principals[role],
            `\${${role.toUpperCase()}_PRINCIPAL_ARN}`,
          );
        for (const [from, to] of [
          [synthetic.account, '${ACCOUNT_ID}'],
          [synthetic.start, '${START_UTC}'],
          [synthetic.end, '${END_UTC}'],
          [p.tableEnd, '${TABLE_CLEANUP_DEADLINE_UTC}'],
          [p.cleanupEnd, '${S3_CLEANUP_DEADLINE_UTC}'],
        ])
          text = text.replaceAll(from, to);
      }
      return JSON.stringify(JSON.parse(text), null, 2) + '\n';
    };
    const documents = {};
    for (const role of ['admin', 'runner', 'reviewer']) {
      documents[`permission-${role}.json`] = encode(p.permissions[role]);
      documents[`trust-${role}.json`] = encode(p.trust[role]);
    }
    documents['resources.json'] = encode(p.resources);
    documents['roles.json'] = encode({
      names: p.roles,
      maxSessionDuration: p.roleMaxSessionDuration,
      bootstrapIamAuthorizationRequired: true,
    });
    documents['synthetic-manifest.json'] =
      JSON.stringify(p.manifest, null, 2) + '\n';
    documents['acceptance-limitations.json'] =
      JSON.stringify(api.EVIDENCE_LABELS, null, 2) + '\n';
    const inventory = SOURCE_FILES.map((path) => ({
      path,
      sha256: sha(readFileSync(join(root, path))),
    }));
    const hashes = {
      schema: 'propel-offline-package-hashes-v1',
      binding: privateBindings
        ? 'PRIVATE_BOUND'
        : 'UNBOUND_TEMPLATE_NOT_ATTACHABLE',
      source: sha(JSON.stringify(inventory)),
      bundle: sha(readFileSync(join(build, 'package.mjs'))),
      sourceFiles: inventory,
      files: Object.fromEntries(
        Object.entries(documents).map(([name, body]) => [name, sha(body)]),
      ),
      permissions: sha(
        JSON.stringify(
          ['admin', 'runner', 'reviewer'].map(
            (r) => documents[`permission-${r}.json`],
          ),
        ),
      ),
      syntheticManifest: sha(documents['synthetic-manifest.json']),
      cloudCalls: 0,
      executionAuthorized: false,
    };
    // Exclusive writes; no overwrite of a previously reviewed package.
    for (const name of [
      ...Object.keys(documents),
      'HASHES.json',
      'experiment.mjs',
    ]) {
      try {
        lstatSync(join(output, name));
        throw Error('Output already exists');
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
    for (const [name, body] of Object.entries(documents))
      writeFileSync(join(output, name), body, { mode: 0o600, flag: 'wx' });
    writeFileSync(
      join(output, 'experiment.mjs'),
      readFileSync(join(build, 'package.mjs')),
      { mode: 0o600, flag: 'wx' },
    );
    writeFileSync(
      join(output, 'HASHES.json'),
      JSON.stringify(hashes, null, 2) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
    return hashes;
  } finally {
    rmSync(build, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--template-output')
    throw Error(
      'Usage: node scripts/prepare-aws-custody-package.mjs --template-output PRIVATE_DIRECTORY',
    );
  // CLI never reads credentials/account bindings and has no execute option.
  const result = await prepare(args[1]);
  process.stdout.write(
    JSON.stringify({
      source: result.source,
      bundle: result.bundle,
      permissions: result.permissions,
      syntheticManifest: result.syntheticManifest,
      cloudCalls: 0,
      executionAuthorized: false,
    }) + '\n',
  );
}
