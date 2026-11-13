import { proposalBaseline } from '../invoice-caller-fixture-migration/source-author-baseline.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  mkdtempSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir, devNull } from 'node:os';
import ts from 'typescript';
import { existsSync } from 'node:fs';
const directory = 'proposals/invoice-caller-reconciliation';
export const expected = Object.freeze({
  classification: 'UNAPPLIED_OFFLINE_SOURCE_PROPOSAL',
  parent: 'af36a27e34b77bfef3700d7cd87fdb39c4dc50d5',
  clientPath: 'server/invoices/commercial-draft-client.ts',
  beforeSha256:
    '12c1eb303f10f8cb9e6c5f765839419f55e4b6cfd16c6c6ef9f8812ccbb76194',
  proposedSha256:
    '94aa164e60c780cb53f8658b16c57bc9c17da5d9469c73f9d73cab627dcea694',
  callerPath: 'server/invoices/commercial-caller-connection.ts',
  callerSha256:
    '3d892a8ae7757a6f480fde4638f17f4b642436ba728446dfd84811590be0aeed',
  patchSha256:
    'bcf2dbf4e967007cab60d81b0c7599372ca55cf69b1c52ecaed320b0062aa034',
  sqlSha256: 'da35d098727eff68ae7905c3709d6982cf89560cae538923f5d7e570dab0306e',
  authSha256:
    '709018249d889504b860e4cf0f4caa5cbdd1c2b04f58c53226f4499c68fd46d6',
  canonicalSourceChanged: false,
  admissionAuthorized: false,
  hostedAcceptance: 'NOT_RUN',
  release: 'NOT_READY_NOT_AUTHORIZED',
});
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function qualify({
  patch = readFileSync(join(directory, 'correction.patch')),
  checkTypes = false,
  evidence = JSON.parse(readFileSync(join(directory, 'evidence.json'), 'utf8')),
} = {}) {
  assert.deepEqual(evidence, expected, 'Exact unapplied scope required');
  assert.equal(
    hash(patch),
    expected.patchSha256,
    'Exact reviewed patch required',
  );
  // Preserve the historical unapplied manifest. A separately verified source
  // author may be active, but this fixture loader grants NO launch admission.
  const baseline = proposalBaseline();
  const before = baseline.original;
  assert.equal(
    hash(before),
    expected.beforeSha256,
    'Original proposal source required',
  );
  assert.equal(
    hash(readFileSync('server/invoices/commercial-drafts.proposed.sql')),
    expected.sqlSha256,
    'SQL remains unchanged',
  );
  assert.equal(
    hash(readFileSync('server/customer/broker-auth.ts')),
    expected.authSha256,
    'Existing Auth verifier remains unchanged',
  );
  const scratch = mkdtempSync(join(tmpdir(), 'propel-caller-proposal-'));
  try {
    mkdirSync(dirname(join(scratch, expected.clientPath)), { recursive: true });
    writeFileSync(join(scratch, expected.clientPath), before);
    const file = join(scratch, 'approved.patch');
    writeFileSync(file, patch);
    execFileSync('git', ['apply', '--', file], {
      cwd: scratch,
      stdio: 'pipe',
      env: {
        PATH: process.env.PATH,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_SYSTEM: devNull,
        GIT_CONFIG_GLOBAL: devNull,
        GIT_CEILING_DIRECTORIES: scratch,
      },
    });
    const client = readFileSync(join(scratch, expected.clientPath));
    const caller = readFileSync(join(scratch, expected.callerPath));
    assert.equal(hash(client), expected.proposedSha256);
    assert.equal(hash(caller), expected.callerSha256);
    // Bundle ONLY a disposable copy. The existing Auth implementation is reused,
    // including its private opaque-proof map; no production file or import is rewritten.
    symlinkSync(
      resolve('server/customer'),
      join(scratch, 'server/customer'),
      'dir',
    );
    // Reuse the pinned TypeScript compiler for this disposable test load.
    symlinkSync(resolve('src'), join(scratch, 'src'), 'dir');
    symlinkSync(resolve('node_modules'), join(scratch, 'node_modules'), 'dir');
    symlinkSync(
      resolve('server/payments'),
      join(scratch, 'server/payments'),
      'dir',
    );
    symlinkSync(
      resolve('server/providers'),
      join(scratch, 'server/providers'),
      'dir',
    );
    if (checkTypes) {
      const config = ts.readConfigFile(
        resolve('tsconfig.json'),
        ts.sys.readFile,
      );
      const parsed = ts.parseJsonConfigFileContent(
        config.config,
        ts.sys,
        resolve('.'),
      );
      const program = ts.createProgram(
        [
          join(scratch, expected.clientPath),
          join(scratch, expected.callerPath),
        ],
        parsed.options,
      );
      const diagnostics = ts.getPreEmitDiagnostics(program);
      assert.equal(
        diagnostics.length,
        0,
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCanonicalFileName: (x) => x,
          getCurrentDirectory: () => resolve('.'),
          getNewLine: () => '\n',
        }),
      );
    }
    const cache = new Map();
    function load(file) {
      if (cache.has(file)) return cache.get(file).exports;
      const module = { exports: {} };
      cache.set(file, module);
      const code = ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
        fileName: file,
      }).outputText;
      const native = createRequire(file);
      const local = (specifier) => {
        if (!specifier.startsWith('.')) return native(specifier);
        const base = resolve(dirname(file), specifier);
        const target = [
          base + '.ts',
          base + '.tsx',
          join(base, 'index.ts'),
        ].find(existsSync);
        if (!target) return native(specifier);
        return load(target);
      };
      new Function('require', 'module', 'exports', code)(
        local,
        module,
        module.exports,
      );
      return module.exports;
    }
    const candidate = {
      ...load(join(scratch, expected.clientPath)),
      ...load(join(scratch, expected.callerPath)),
    };
    // Load by the SAME scratch symlink spelling so proofs share one private map.
    candidate.CustomerBrokerAuth = load(
      join(scratch, 'server/customer/broker-auth.ts'),
    ).CustomerBrokerAuth;
    assert.deepEqual(readFileSync(expected.clientPath), baseline.current);
    return {
      candidate,
      activeSourceAuthor: baseline.activeSourceAuthor,
      client: client.toString(),
      caller: caller.toString(),
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
