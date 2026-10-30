import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { replacementFixture } from './netlify-replacement-fixture.ts';
import { executeReplacement } from '../../server/netlify/replacement-executor.ts';
const [root, phase] = process.argv.slice(2);
const f = replacementFixture(join(root, 'journal'));
let puts = 0;
const pauseForever = () => new Promise<never>(() => {});
const retain = () =>
  writeFileSync(
    join(root, 'fake-provider.json'),
    JSON.stringify({ creates: f.creations(), puts }),
    { mode: 0o600 },
  );
const create = f.controls.create;
f.controls.create = async () => {
  retain();
  if (phase === 'create') {
    process.send?.({ phase });
    return pauseForever();
  }
  return create();
};
f.controls.put = async () => {
  puts++;
  retain();
  process.send?.({ phase });
  return pauseForever();
};
await executeReplacement(f.pkg, f.approval(), f.ports);
