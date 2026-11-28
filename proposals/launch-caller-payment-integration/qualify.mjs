// Offline source-decision qualification only. Never an installer or admission grant.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  lstatSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const parent = '2c63cfd8175fe23d6c7f80a7879af9c73b27dceb';
const base = 'af36a27e34b77bfef3700d7cd87fdb39c4dc50d5';
const directory = 'proposals/launch-caller-payment-integration';
const patchPath = directory + '/protected-sources.patch';
const client = 'server/invoices/commercial-draft-client.ts';
const helper = 'scripts/invoice-caller-source-admission.mjs';
const companion = 'docs/INVOICE_CALLER_FIXTURE_SUCCESSOR.json';
const helperHash =
  '2a6ffb692443a7830df021e9a8cce048ac4388947e03a27af4286b4e26ee9a25';
const old = '12c1eb303f10f8cb9e6c5f765839419f55e4b6cfd16c6c6ef9f8812ccbb76194';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const git = (...a) => execFileSync('git', ['--no-replace-objects', ...a]);
export async function qualifyInvoiceAdmission({
  mode = 'complete',
  patch = readFileSync(patchPath),
  record = JSON.parse(readFileSync(directory + '/evidence.json', 'utf8')),
} = {}) {
  assert(
    [
      'complete',
      'partial',
      'client-edit',
      'caller-edit',
      'fixture-edit',
      'helper-edit',
      'manifest-rebind',
    ].includes(mode),
    'Exact qualification mode required',
  );
  const expectedRecord = JSON.parse(
    git('show', `${parent}:${directory}/evidence.json`).toString(),
  );
  assert.deepEqual(
    record,
    expectedRecord,
    'Exact source-decision record required; authority remains held',
  );
  assert.equal(
    hash(patch),
    '01ba7ffe88d5504fd014bfcc2b70deecb971bef03266676c1ec14835a6a0b42d',
    'Exact five-file proposed promotion diff required',
  );
  assert.deepEqual(patch, git('show', `${parent}:${patchPath}`));
  const root = mkdtempSync(join(tmpdir(), 'propel-invoice-admission-'));
  try {
    const archive = join(root, 'source.tar');
    git(
      'archive',
      '--format=tar',
      '--output',
      archive,
      mode === 'partial' ? base : parent,
    );
    execFileSync('tar', ['-xf', archive, '-C', root]);
    if (mode === 'partial') {
      execFileSync('git', ['apply', '--check', '-'], {
        cwd: root,
        input: patch,
        stdio: 'pipe',
      });
      execFileSync('git', ['apply', '-'], {
        cwd: root,
        input: patch,
        stdio: 'pipe',
      });
      assert.equal(lstatSync(join(root, helper)).isFile(), true);
      assert.throws(
        () => lstatSync(join(root, companion)),
        (e) => e.code === 'ENOENT',
      );
    }
    for (const source of record.sources.slice(0, 5)) {
      const tree = git('ls-tree', record.parent, '--', source.path).toString();
      assert.match(tree, /^100644 blob [a-f0-9]{40}\t/);
      assert.equal(tree.split('\t')[1].trim(), source.path);
      const info = lstatSync(join(root, source.path));
      assert(info.isFile() && !info.isSymbolicLink());
      assert.equal(
        hash(readFileSync(join(root, source.path))),
        source.authoredSha256,
      );
    }
    let target;
    if (mode === 'client-edit') target = client;
    if (mode === 'caller-edit')
      target = 'server/invoices/commercial-caller-connection.ts';
    if (mode === 'fixture-edit')
      target = 'tests/fixtures/commercial-caller-native.ts';
    if (target)
      writeFileSync(
        join(root, target),
        Buffer.concat([
          readFileSync(join(root, target)),
          Buffer.from('\n// UNKNOWN SOURCE'),
        ]),
      );
    if (mode === 'manifest-rebind') {
      const bytes = Buffer.concat([
        readFileSync(join(root, client)),
        Buffer.from('\n// UNKNOWN SOURCE'),
      ]);
      writeFileSync(join(root, client), bytes);
      const path = 'docs/LAUNCH_INVOICE_PAYMENT_COMPOSITION.json';
      const evidence = JSON.parse(readFileSync(join(root, path), 'utf8'));
      const source = evidence.sources.find((s) => s.path === client);
      source.currentSha256 = hash(bytes);
      source.originSha256 = hash(bytes);
      writeFileSync(join(root, path), JSON.stringify(evidence));
    }
    if (mode === 'helper-edit')
      writeFileSync(
        join(root, helper),
        "throw Error('UNKNOWN_HELPER_EXECUTED');",
      );
    const bytes = readFileSync(join(root, helper));
    if (hash(bytes) !== helperHash) {
      assert.equal(
        mode,
        'helper-edit',
        'Reviewed helper required before execution',
      );
      return {
        mode,
        result: 'DENIED_BEFORE_EXECUTION',
        operationalReady: false,
        admissionAuthorized: false,
      };
    }
    const { admitInvoiceCallerSource } = await import(
      'data:text/javascript;base64,' + bytes.toString('base64')
    );
    const ports = {
      readCurrent: (p) => readFileSync(join(root, p)),
      readOriginal: (c, p) => git('show', `${c}:${p}`),
      metadata: git,
      stat: (p) => lstatSync(join(root, p)),
    };
    let error;
    try {
      assert.equal(
        admitInvoiceCallerSource(client, ports.readCurrent(client), old, ports),
        true,
      );
    } catch (e) {
      error = e;
    }
    if (mode === 'complete')
      assert.equal(error, undefined, 'Exact full context must qualify');
    else {
      assert(error, 'Incomplete or changed source must deny');
      if (mode === 'partial')
        // Earlier legacy fixtures also remain unqualified. The real helper denies
        // those exact bytes before reaching the separately proven missing record.
        assert.equal(
          error.message,
          'Exact finite invoice caller source required',
          'Unqualified retained fixtures must block standalone diff',
        );
      else assert.match(error.message, /Exact finite invoice caller source/);
    }
    return {
      mode,
      result:
        mode === 'complete' ? 'SOURCE_READY_FOR_REVIEW_NOT_ADMITTED' : 'DENIED',
      operationalReady: false,
      admissionAuthorized: false,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
