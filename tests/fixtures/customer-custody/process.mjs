/* Disposable process harness. Loads the exact checked-in TypeScript source; no
 * alternate transaction logic, environment credentials, network or operational target. */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const external = createRequire(import.meta.url);
const directory = fileURLToPath(new URL('.', import.meta.url));
const cache = new Map();
function load(file) {
  if (!path.extname(file)) file += '.ts';
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function('require', 'exports', 'module', '__filename', '__dirname', code)(
    (name) =>
      name.startsWith('.')
        ? load(path.resolve(path.dirname(file), name))
        : external(name),
    module.exports,
    module,
    file,
    path.dirname(file),
  );
  return module.exports;
}
const { openCustodyFixturePort } = load(path.join(directory, 'sqlite.ts'));
const { OfflineCustodyAttempt } = load(
  path.resolve(directory, '../../../server/customer/custody-lab/protocol.ts'),
);
const pause = async (phase) => {
  const timer = setInterval(() => {}, 1000); // Bounded child stays live until supervised SIGKILL.
  process.send({ phase });
  try {
    await new Promise(() => {});
  } finally {
    clearInterval(timer);
  }
};
process.once('message', async (input) => {
  let opened,
    writes = 0,
    holds = 0;
  try {
    opened = openCustodyFixturePort(input.descriptor);
    const port = {
      ...opened.port,
      async hold(plan) {
        holds++;
        await opened.port.hold(plan);
        if (input.mode === 'after-hold') await pause('after-hold');
      },
      async write(plan) {
        writes++;
        if (input.mode === 'before-claim' && writes === 1)
          await pause('before-claim');
        await opened.port.write(plan);
        if (input.mode === 'after-claim' && writes === 1)
          await pause('after-claim');
        if (input.mode === 'after-ack' && writes === 2)
          await pause('after-ack');
      },
    };
    const attempt = new OfflineCustodyAttempt(
      port,
      input.binding,
      async () => input.authorized !== false,
    );
    process.send({ phase: 'ready' });
    if (input.barrier)
      await new Promise((resolve) => process.once('message', resolve));
    const result =
      input.mode === 'reconcile'
        ? await attempt.reconcile(async () => input.status)
        : await attempt.spend();
    if (input.mode === 'after-ack') await attempt.acknowledge(input.status);
    process.send({
      phase: 'result',
      result,
      writes,
      holds,
      quarantined: attempt.quarantined,
    });
  } catch (error) {
    process.send({
      phase: 'result',
      error: String(error.message),
      writes,
      holds,
    });
  } finally {
    opened?.close();
    process.disconnect();
  }
});
